/**
 * path-boundary.ts — v6.5.0 (Híbrido Smart Merge)
 *
 * Plugin de segurança que impede edições não autorizadas a caminhos críticos do harness
 * e reforça os limites de escrita (path boundaries) dos agentes.
 */
import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveProjectCwd } from "./lib/resolve-project-cwd.js";
import { quietWarn } from "./lib/quiet-warn.js";
import {
  evaluate,
  getAgentsFromMarkdown,
  loadMergedAllowlist,
  type AgentPermission,
  type PathBoundaryConfig,
} from "./lib/path-boundary-core.ts";

const warn = (msg: string) => quietWarn("path-boundary", msg);

const PathBoundaryPlugin: Plugin = async (ctx) => {
  const rawProjectRoot = resolveProjectCwd(ctx, { log: (m: string) => quietWarn("path-boundary", m) });
  const projectRoot = typeof rawProjectRoot === "string" ? rawProjectRoot : ((rawProjectRoot as any)?.directory || (rawProjectRoot as any)?.worktree || process.cwd());

  const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  const totalMemGB = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  warn(`RAM: ${freeMemGB}GB livre / ${totalMemGB}GB total`);
  if (parseFloat(freeMemGB) < 2) {
    warn(`⚠️  RAM crítica. Recomenda-se: HARNESS_PLAYWRIGHT_WORKERS=1 HARNESS_VITEST_WORKERS=1`);
  }

  const config: PathBoundaryConfig = {
    cwd: projectRoot,
    agents: {},
    defaultDeny: process.env.HARNESS_PATH_BOUNDARY_MODE === "fail-closed",
  };

  const client = (ctx as any)?.client;
  if (client?.event && typeof client.event.on === "function") {
    client.event.on("config.updated", (newConfig: any) => {
      if (newConfig && newConfig.agents) {
        config.agents = newConfig.agents;
      }
    });
  }

  try {
    const opencodeJsonPath = path.join(projectRoot, "opencode.json");
    if (fs.existsSync(opencodeJsonPath)) {
      const opencodeData = JSON.parse(
        fs.readFileSync(opencodeJsonPath, "utf8"),
      );
      if (opencodeData && opencodeData.agent) {
        const parsedAgents: Record<string, AgentPermission> = {};
        for (const [name, data] of Object.entries(opencodeData.agent)) {
          if (data && typeof data === "object" && "permission" in data) {
            parsedAgents[name] = (data as any).permission;
          }
        }
        config.agents = parsedAgents;
      }
    }
  } catch (e) {}

  const agentsMarkdownDir = path.join(projectRoot, "agents");
  if (fs.existsSync(agentsMarkdownDir)) {
    const markdownAgents = getAgentsFromMarkdown(agentsMarkdownDir);
    for (const [name, perm] of Object.entries(markdownAgents)) {
      config.agents[name] = {
        ...(config.agents[name] || {}),
        ...perm,
      } as AgentPermission;
    }
  }

  const recentBlocks = new Map<
    string,
    { reason: string; agent: string; action: string; ts: number }
  >();
  const BLOCK_TTL_MS = 5 * 60 * 1000;
  const MAX_BLOCKS = 16;

  function recordBlock(
    filePath: string,
    reason: string,
    agent: string,
    action: string,
  ): void {
    if (recentBlocks.size >= MAX_BLOCKS) {
      const firstKey = recentBlocks.keys().next().value;
      if (firstKey !== undefined) recentBlocks.delete(firstKey);
    }
    recentBlocks.set(filePath, {
      reason,
      agent,
      action,
      ts: Date.now(),
    });
  }

  function getActiveBlocks(): Array<{
    filePath: string;
    reason: string;
    agent: string;
    action: string;
    ageMs: number;
  }> {
    const now = Date.now();
    for (const [k, v] of recentBlocks) {
      if (now - v.ts > BLOCK_TTL_MS) recentBlocks.delete(k);
    }
    return Array.from(recentBlocks.entries()).map(([filePath, v]) => ({
      filePath,
      reason: v.reason,
      agent: v.agent,
      action: v.action,
      ageMs: now - v.ts,
    }));
  }

  function suggestPattern(filePath: string): string {
    const dir = path.dirname(filePath);
    if (dir === "." || dir === "/") return filePath;
    if (filePath.startsWith(".harness/")) return ".harness/**";
    if (filePath.startsWith(".github/")) return ".github/**";
    if (filePath.startsWith("plugins/")) return "plugins/**";
    if (filePath.startsWith("agents/")) return "agents/**";
    if (filePath.startsWith("tools/")) return "tools/**";
    if (filePath.startsWith("tests/")) return "tests/**";
    if (filePath.startsWith("schemas/")) return "schemas/**";
    if (filePath.startsWith("system/")) return "system/**";
    return `${dir}/**`;
  }

  function notifyBlockVisually(
    agent: string,
    action: string,
    filePath: string,
    reason: string,
    suggestedPattern: string,
  ): void {
    const tui = client?.tui;
    if (!tui) return;

    if (typeof tui.showToast === "function") {
      try {
        void tui.showToast({
          body: {
            title: "path-boundary bloqueou escrita",
            message: `${agent} tentou ${action} em ${filePath}. Motivo: ${reason}`,
            variant: "error",
            duration: 5000,
          },
        });
      } catch {}
    }

    if (typeof tui.appendPrompt === "function") {
      const cmd = `harness-allowlist action=add pattern="${suggestedPattern}" type=allow target=project`;
      try {
        void tui.appendPrompt({
          body: {
            text: `[path-boundary] Tentativa bloqueada: ${action} em \`${filePath}\`. ` +
              `Se foi intencional, rode: \`${cmd}\``,
          },
        });
      } catch {}
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      const writeTools = [
        "write_to_file",
        "replace_file_content",
        "multi_replace_file_content",
        "edit",
        "write",
      ];

      if (!writeTools.includes(input.tool)) {
        return;
      }

      const args = input?.args || output?.args || {};
      const filePath: string =
        args.TargetFile || args.filePath || args.path || args.file || "";

      if (!filePath) {
        return;
      }

      const agent = input.context?.agent ?? "default";
      const action =
        input.tool === "write" || input.tool === "write_to_file"
          ? "write"
          : "edit";

      const result = evaluate({
        agent,
        filePath,
        action,
        config,
      });

      if (!result.ok) {
        const suggested = suggestPattern(filePath);
        recordBlock(filePath, result.reason, agent, action);
        notifyBlockVisually(agent, action, filePath, result.reason, suggested);

        const unlockCmd = `harness-allowlist action=add pattern="${suggested}" type=allow target=project`;
        throw new Error(
          `[path-boundary] BLOCKED: ${agent} cannot ${action} ${filePath} (BLOQUEADO em PT-BR)\n` +
            `\nMotivo: ${result.reason}\n` +
            `\nPara liberar este caminho (com confirmacao): ${unlockCmd}\n` +
            `Ou edite .harness/harness-allowlist.json e adicione "${suggested}" em allow.\n` +
            `\n(Voce vera um aviso visivel no TUI do OpenCode e um system-reminder na proxima resposta.)`,
        );
      }
    },

    "experimental.chat.system.transform": async (_input, output) => {
      const blocks = getActiveBlocks();
      if (blocks.length === 0) return;

      const lines = blocks.map(
        (b) =>
          `- \`${b.filePath}\` (${b.action}, agente=${b.agent}, ${Math.round(b.ageMs / 1000)}s atras): ${b.reason}`,
      );
      output.system.push(
        `\n<system-reminder>\n` +
          `[path-boundary] ${blocks.length} escrita(s) bloqueada(s) recente(s):\n` +
          `${lines.join("\n")}\n` +
          `Para liberar, adicione o pattern ao .harness/harness-allowlist.json ou use a tool harness-allowlist.\n` +
          `</system-reminder>\n`,
      );
    },
  };
};

export { PathBoundaryPlugin, loadMergedAllowlist };
export default PathBoundaryPlugin;
