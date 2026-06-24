/**
 * path-boundary.ts — Harness v6 plugin
 *
 * Bloqueia tool calls `edit` e `write` que violem o path allowlist
 * declarado em `~/.config/opencode/harness-allowlist.json`.
 *
 * Formato: opencode Plugin v1 (TS, function export com hooks object).
 * Docs: https://opencode.ai/docs/plugins/
 *
 * Defense in depth: protege arquivos críticos do harness
 * (state.json, state-machine.json) contra edições diretas.
 * Cada agent é dono dos seus paths via capability grant, mas
 * este plugin reforça a regra independente de quem chama.
 *
 * Allowlist (caminhos que podem ser editados):
 *   - .harness/state-machine.json (read-only em runtime - jamais editavel)
 *   - .harness/state.json (so via harness_advance tool - este plugin bloqueia)
 *   - .harness/events.jsonl (append-only - este plugin bloqueia edit)
 *   - src/backend/**, src/frontend/**, etc (paths de feature code)
 *   - RAG/**, design/**, etc (paths de docs/templates)
 *
 * Denylist (caminhos SEMPRE bloqueados):
 *   - .harness/state-machine.json
 *   - .harness/state.json (use harness_advance)
 *   - .harness/events.jsonl (use harness_log tool)
 *   - .harness/audit/** (write-only via hook)
 *   - package-lock.json, .git/**, node_modules/**
 */

import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

const ALLOWLIST_PATH = path.join(
  process.env.HOME || "~",
  ".config/opencode/harness-allowlist.json"
);

// Paths que NUNCA podem ser editados (nem pelo orchestrator)
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

// Paths de runtime que precisam de approval via tool dedicada
const FORCE_TOOL_REDIRECT: Array<{ pattern: RegExp; tool: string; reason: string }> = [
  {
    pattern: /\.harness\/state\.json$/,
    tool: "harness_advance",
    reason: "state.json so pode ser editado via harness_advance tool (valida gate)",
  },
  {
    pattern: /\.harness\/events\.jsonl$/,
    tool: "harness_log",
    reason: "events.jsonl e append-only, use harness_log tool",
  },
];

function matchesAny(filePath: string, patterns: RegExp[]): RegExp | null {
  for (const p of patterns) {
    if (p.test(filePath)) return p;
  }
  return null;
}

export const PathBoundaryPlugin: Plugin = async ({ directory, worktree }) => {
  // Filtra paths invalidos (worktree="/" e truthy em JS mas nao serve)
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");
  const projectRoot: string =
    (isValidPath(worktree) ? worktree : null) ??
    (isValidPath(directory) ? directory : null) ??
    process.cwd();

  let cachedAllowlist: any = null;
  let cachedMtime: number = 0;

  function getAllowlist() {
    try {
      if (fs.existsSync(ALLOWLIST_PATH)) {
        const stat = fs.statSync(ALLOWLIST_PATH);
        if (!cachedAllowlist || stat.mtimeMs !== cachedMtime) {
          cachedAllowlist = JSON.parse(fs.readFileSync(ALLOWLIST_PATH, "utf8"));
          cachedMtime = stat.mtimeMs;
        }
        return cachedAllowlist;
      }
    } catch (err) {
      // ignore
    }
    return null;
  }

  return {
    "tool.execute.before": async (input, output) => {
      // Intercepta todas as ferramentas conhecidas de escrita/edição de arquivos
      const writeTools = [
        "write_to_file",
        "replace_file_content",
        "multi_replace_file_content",
        "edit",
        "write"
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

      // Resolve path (relative -> absolute)
      const absPath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(projectRoot, filePath);

      // 1. Checar always-deny (security boundary)
      const denied = matchesAny(absPath, ALWAYS_DENY);
      if (denied) {
        throw new Error(
          `[path-boundary] BLOCKED: ${absPath} matches deny pattern ${denied}`
        );
      }

      // 2. Checar tool-redirect (force use of specific tool)
      for (const redirect of FORCE_TOOL_REDIRECT) {
        if (redirect.pattern.test(absPath)) {
          throw new Error(
            `[path-boundary] BLOCKED: ${absPath} deve ser editado via '${redirect.tool}' tool. ${redirect.reason}`
          );
        }
      }

      // 3. Checar allowlist (custom do projeto)
      try {
        const allowlist = getAllowlist();
        if (allowlist) {
          const relPath = path.relative(projectRoot, absPath);

          const projectAllow: string[] = allowlist.allow || [];
          const projectDeny: string[] = allowlist.deny || [];

          // Check deny first
          for (const pattern of projectDeny) {
            if (matchGlob(relPath, pattern)) {
              throw new Error(
                `[path-boundary] BLOCKED: '${relPath}' matches project deny pattern '${pattern}'`
              );
            }
          }

          // Check allow
          let allowed = false;
          for (const pattern of projectAllow) {
            if (matchGlob(relPath, pattern)) {
              allowed = true;
              break;
            }
          }

          if (!allowed && projectAllow.length > 0) {
            throw new Error(
              `[path-boundary] BLOCKED: '${relPath}' nao esta no project allowlist [${projectAllow.join(", ")}]`
            );
          }
        }
      } catch (err) {
        // Se allowlist nao existe, default allow (sem restricao alem de ALWAYS_DENY)
        if ((err as Error).message?.includes("[path-boundary]")) {
          throw err; // re-throw boundary errors
        }
        // outros erros (file not found, JSON parse) - silent ignore
      }
    },

    "tool.execute.after": async (input, output) => {
      // Nada a fazer - audit logger faz isso
    },
  };
};

/**
 * Match simples de glob pattern.
 * Suporta: ** (qualquer profundidade), * (1 segmento), ? (1 char).
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::DOUBLESTAR::/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp("^" + regex + "$").test(filePath);
}
