/**
 * path-boundary.ts — v6.5.0 (Híbrido Smart Merge)
 *
 * Plugin de segurança que impede edições não autorizadas a caminhos críticos do harness
 * e reforça os limites de escrita (path boundaries) dos agentes.
 *
 * Suporta:
 *   1. ALWAYS_DENY (proteção de arquivos de estado contra qualquer escrita direta)
 *   2. FORCE_TOOL_REDIRECT (obriga alterações de estado via ferramentas dedicadas)
 *   3. Allowlist global (~/.config/opencode/harness-allowlist.json) com suporte fail-closed/fail-open
 *   4. Denylist e Allowlist modular por agente (regex, glob, exact) configurado no opencode.json
 *   5. Funções utilitárias validateCapabilityGrant e inferFoldersFromTask
 */
import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

// ─── Tipos e Interfaces ──────────────────────────────────────────────────────

type CapabilityRule =
  | "allow"
  | "deny"
  | "ask"
  | { allow?: string[]; deny?: string[] };

interface AgentPermission {
  write?: CapabilityRule | Record<string, CapabilityRule>;
  edit?: CapabilityRule | Record<string, CapabilityRule>;
  bash?: CapabilityRule | Record<string, CapabilityRule>;
}

interface PathBoundaryConfig {
  cwd: string;
  agents: Record<string, AgentPermission>;
  defaultDeny?: boolean;
  allowlistPath?: string;
}

interface BoundaryResult {
  ok: boolean;
  reason?: string;
  matchedRule?: "allow" | "deny" | "ask" | "default-deny" | "always-deny" | "redirect" | "default";
  rule?: string;
}
// ─── Constantes Globais ──────────────────────────────────────────────────────

const ALLOWLIST_PATH = path.join(
  process.env.HOME || "~",
  ".config/opencode/harness-allowlist.json"
);

// Caminhos que NUNCA podem ser gravados ou editados diretamente por nenhum agente
const ALWAYS_DENY = [
  /\.harness\/state-machine\.json$/,
  /\.harness\/state\.json$/,
  /\.harness\/events\.jsonl$/,
  /\.harness\/audit\//,
  /\/node_modules\//,
  /\/\.git\//,
  /package-lock\.json$/,
  /\.harness-allowlist\.json$/,
];

// Caminhos de estado que exigem redirect para ferramenta atômica dedicada
const FORCE_TOOL_REDIRECT = [
  {
    pattern: /\.harness\/state\.json$/,
    tool: "harness_advance",
    reason: "state.json só pode ser editado via harness_advance tool (valida gate)",
  },
  {
    pattern: /\.harness\/events\.jsonl$/,
    tool: "harness_log",
    reason: "events.jsonl é append-only, use harness_log tool",
  },
];

// ─── Funções de Avaliação de Segurança ───────────────────────────────────────

function matchesAny(filePath: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(filePath)) return p;
  }
  return null;
}

function matchGlob(filePath: string, pattern: string): boolean {
  if (pattern.startsWith("/") && pattern.endsWith("/")) {
    const re = new RegExp(pattern.slice(1, -1));
    return re.test(filePath);
  }
  if (pattern.includes("*") || pattern.includes("?")) {
    const regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "::DOUBLESTAR::")
      .replace(/\*/g, "[^/]*")
      .replace(/::DOUBLESTAR::/g, ".*")
      .replace(/\?/g, "[^/]");
    return new RegExp("^" + regex + "$").test(filePath);
  }
  return filePath === pattern || filePath.startsWith(pattern + path.sep);
}

/**
 * Avalia se um path é permitido para escrita por um agente específico.
 */
export function evaluate(args: {
  agent: string;
  filePath: string;
  action: "write" | "edit" | "bash";
  config: PathBoundaryConfig;
}): BoundaryResult {
  const { agent, filePath, action, config } = args;

  // 1. Resolve para path absoluto
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(config.cwd, filePath);
  const rel = path.relative(config.cwd, abs);

  if (rel.startsWith("..")) {
    return { ok: false, reason: "Path escapes project root", matchedRule: "default-deny" };
  }

  // 2. Valida ALWAYS_DENY global (defesa contra adulteração de estado do harness)
  const deniedRegexp = matchesAny(abs, ALWAYS_DENY);
  if (deniedRegexp) {
    return {
      ok: false,
      reason: `ALWAYS_DENY match: ${deniedRegexp.toString()}`,
      matchedRule: "always-deny",
    };
  }

  // 3. Valida redirecionamento de tool de estado
  for (const redirect of FORCE_TOOL_REDIRECT) {
    if (redirect.pattern.test(abs)) {
      return {
        ok: false,
        reason: `FORCE_TOOL_REDIRECT: use a tool '${redirect.tool}' (${redirect.reason})`,
        matchedRule: "redirect",
      };
    }
  }

  // 4. Valida permissão modular do agente do opencode.json
  // Fallback de "edit" para "write" caso "edit" não esteja configurado
  let agentPerm = config.agents[agent]?.[action];
  if (agentPerm === undefined && action === "edit") {
    agentPerm = config.agents[agent]?.["write"];
  }

  // Se o agente tem permissão modular configurada, processa
  if (agentPerm !== undefined) {
    // 4.1 String simples ("allow" / "deny" / "ask")
    if (typeof agentPerm === "string") {
      switch (agentPerm) {
        case "deny":
          return { ok: false, reason: `Agent ${agent} has explicit ${action}=deny`, matchedRule: "deny" };
        case "ask":
          return { ok: false, reason: `Agent ${agent} has explicit ${action}=ask`, matchedRule: "ask" };
        case "allow":
          return { ok: true, matchedRule: "allow" };
      }
    }

    // 4.2 Objeto estruturado com allow/deny (ou apenas um deles)
    if (typeof agentPerm === "object" && ("deny" in agentPerm || "allow" in agentPerm)) {
      const denyList = (agentPerm as { deny?: string[] }).deny ?? [];
      const allowList = (agentPerm as { allow?: string[] }).allow ?? [];

      // Denylist do agente tem precedência absoluta
      for (const pattern of denyList) {
        if (matchGlob(rel, pattern)) {
          return { ok: false, reason: `Agent denylist match: ${pattern}`, matchedRule: "deny", rule: pattern };
        }
      }

      // Allowlist do agente
      for (const pattern of allowList) {
        if (matchGlob(rel, pattern)) {
          return { ok: true, matchedRule: "allow", rule: pattern };
        }
      }

      // Se o agente tem permissões explícitas mas o caminho não bateu com allowlist,
      // ele deve ser bloqueado por padrão (fail-closed no nível de agente)
      return { ok: false, reason: `No agent allow rule matched for ${rel}`, matchedRule: "default-deny" };
    }

    // 4.3 Mapa pattern -> rule
    if (typeof agentPerm === "object" && !Array.isArray(agentPerm)) {
      const matches: Array<{ pattern: string; rule: CapabilityRule; priority: number }> = [];
      for (const [pattern, rule] of Object.entries(agentPerm)) {
        if (matchGlob(rel, pattern)) {
          const isDeny = rule === "deny" || pattern.startsWith("!");
          matches.push({ pattern, rule, priority: isDeny ? 0 : 1 });
        }
      }
      matches.sort((a, b) => a.priority - b.priority);
      if (matches.length > 0) {
        const first = matches[0];
        if (first.rule === "deny") {
          return { ok: false, reason: `Agent match-pattern deny: ${first.pattern}`, matchedRule: "deny", rule: first.pattern };
        }
        if (first.rule === "ask") {
          return { ok: false, reason: `Agent match-pattern ask: ${first.pattern}`, matchedRule: "ask", rule: first.pattern };
        }
        return { ok: true, matchedRule: "allow", rule: first.pattern };
      }
    }
  }

  // 5. Fallback para allowlist global (compatibilidade com instalador/PRD-04)
  const mode = process.env.HARNESS_PATH_BOUNDARY_MODE || "fail-open";
  const actualAllowlistPath = config.allowlistPath || ALLOWLIST_PATH;
  let hasGlobalAllowlist = false;

  try {
    if (fs.existsSync(actualAllowlistPath)) {
      hasGlobalAllowlist = true;
      const allowlistData = JSON.parse(fs.readFileSync(actualAllowlistPath, "utf8"));
      const projectAllow: string[] = allowlistData.allow || [];
      const projectDeny: string[] = allowlistData.deny || [];

      for (const pattern of projectDeny) {
        if (matchGlob(rel, pattern)) {
          return { ok: false, reason: `Global denylist match: ${pattern}`, matchedRule: "deny", rule: pattern };
        }
      }

      let allowed = false;
      for (const pattern of projectAllow) {
        if (matchGlob(rel, pattern)) {
          allowed = true;
          break;
        }
      }

      if (!allowed && projectAllow.length > 0) {
        return { ok: false, reason: `Path not in global allowlist`, matchedRule: "default-deny" };
      }
      return { ok: true, matchedRule: "allow" };
    } else {
      if (mode === "fail-closed") {
        process.stderr.write(`[path-boundary] WARNING: harness-allowlist.json não encontrado. Escrita bloqueada.\n`);
        return { ok: false, reason: "Global allowlist missing in fail-closed mode", matchedRule: "default-deny" };
      }
    }
  } catch (parseErr) {
    const msg = `[path-boundary] WARNING: harness-allowlist.json corrompido — ${(parseErr as Error).message}\n`;
    process.stderr.write(msg);
    if (mode === "fail-closed") {
      return { ok: false, reason: "Global allowlist corrupted in fail-closed mode", matchedRule: "default-deny" };
    }
  }

  // 6. Se defaultDeny for ativado e não temos uma allowlist global permitindo explicitamente
  if (config.defaultDeny) {
    return { ok: false, reason: `Agent ${agent} has no explicit ${action} permission configured`, matchedRule: "default-deny" };
  }

  return { ok: true, matchedRule: "default" };
}

/**
 * Valida a integridade do capability grant despachado pelo orchestrator.
 */
export function validateCapabilityGrant(grant: {
  agent: string;
  skills?: string[];
  paths?: { allow?: string[]; deny?: string[] };
}): { ok: true } | { ok: false; reason: string } {
  if (grant.agent === "frontend") {
    const banned = ["backend-tdd", "qa-e2e", "security-audit-audit-mode", "lgpd-compliance"];
    const found = (grant.skills ?? []).filter((s) => banned.includes(s));
    if (found.length > 0) {
      return { ok: false, reason: `frontend agent must not have skills: ${found.join(", ")}` };
    }

    const required = ["frontend-context-first", "grill-me"];
    const missing = required.filter((s) => !(grant.skills ?? []).includes(s));
    if (missing.length > 0) {
      return { ok: false, reason: `frontend agent missing required skills: ${missing.join(", ")}` };
    }
  }

  if (grant.agent === "backend") {
    const banned = ["frontend-context-first", "frontend-style-guide", "frontend-component-patterns"];
    const found = (grant.skills ?? []).filter((s) => banned.includes(s));
    if (found.length > 0) {
      return { ok: false, reason: `backend agent must not have skills: ${found.join(", ")}` };
    }
  }

  return { ok: true };
}

/**
 * Infere quais pastas o agente vai tocar baseado no conteúdo da tarefa.
 */
export function inferFoldersFromTask(task: { files?: string[]; description?: string }): string[] {
  const folders = new Set<string>();
  for (const file of task.files ?? []) {
    const dir = file.includes("/") ? file.substring(0, file.lastIndexOf("/")) : ".";
    folders.add(dir);
  }
  if (task.description) {
    const matches = task.description.match(/(?:src|app|lib|components|features|modules)\/[\w\-/.]*/g);
    for (const m of matches ?? []) {
      const dir = m.includes("/") ? m.substring(0, m.lastIndexOf("/")) : m;
      folders.add(dir);
    }
  }
  return Array.from(folders);
}

// ─── Plugin Entrypoint ───────────────────────────────────────────────────────

export const PathBoundaryPlugin: Plugin = async (ctx) => {
  const projectRoot: string =
    ctx.worktree && ctx.worktree !== "/" && ctx.worktree.startsWith("/")
      ? ctx.worktree
      : ctx.directory && ctx.directory !== "/" && ctx.directory.startsWith("/")
      ? ctx.directory
      : process.cwd();

  const config: PathBoundaryConfig = {
    cwd: projectRoot,
    agents: {},
    defaultDeny: process.env.HARNESS_PATH_BOUNDARY_MODE === "fail-closed",
  };

  // Escuta atualizações de configuração dinâmicas da CLI do OpenCode se houver
  const client = (ctx as any)?.client;
  if (client?.event && typeof client.event.on === "function") {
    client.event.on("config.updated", (newConfig: any) => {
      if (newConfig && newConfig.agents) {
        config.agents = newConfig.agents;
      }
    });
  }

  // Tenta carregar as permissões do opencode.json local como cache de inicialização
  try {
    const opencodeJsonPath = path.join(projectRoot, "opencode.json");
    if (fs.existsSync(opencodeJsonPath)) {
      const opencodeData = JSON.parse(fs.readFileSync(opencodeJsonPath, "utf8"));
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
      const action = input.tool === "write" || input.tool === "write_to_file" ? "write" : "edit";

      const result = evaluate({
        agent,
        filePath,
        action,
        config,
      });

      if (!result.ok) {
        // Reporta erro e bloqueia a tool
        throw new Error(
          `[path-boundary] BLOCKED: ${agent} cannot ${action} ${filePath}. Reason: ${result.reason}`
        );
      }
    },
  };
};
