/**
 * audit-logger.ts — Harness v6 plugin
 *
 * Grava toda tool call em `.harness/audit/session-<id>.jsonl` (append-only).
 *
 * Substitui o audit log fragmentado do v5. v6 simplifica:
 * - 1 arquivo por session (não por agent - não temos agent no event)
 * - Correlacao com agent vem via state.json (orchestrator sabe fase atual)
 * - Append-only, nunca bloqueia (sempre allow)
 *
 * Formato: opencode Plugin v1.
 */

import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

const AUDIT_DIR = ".harness/audit";

export const AuditLoggerPlugin: Plugin = async ({ directory, worktree, client }) => {
  // Recupera sessionID se disponivel no contexto
  let sessionID = "unknown";

  // Tenta pegar sessionID via client (se opencode passar)
  try {
    // @ts-ignore - client pode ter session info
    if (client?.session?.id) sessionID = client.session.id;
    // @ts-ignore
    else if (client?.app?.config?.sessionID) sessionID = client.app.config.sessionID;
  } catch {
    // ignore
  }

  // Fallback: usa timestamp se nao tiver sessionID
  if (sessionID === "unknown") {
    sessionID = `ts-${Date.now()}`;
  }

  // Resolve projectRoot com fallback robusto.
  // BUG: opencode passa worktree="/" quando nao ha git repo, e "/" e truthy em JS,
  // entao `worktree || directory` retorna "/" (root, sem permissao de escrita).
  // Filtra paths invalidos antes do fallback.
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");

  let projectRoot: string =
    (isValidPath(worktree) ? worktree : null) ??
    (isValidPath(directory) ? directory : null) ??
    process.cwd();

  // Safety: ainda invalido? pula audit
  if (!isValidPath(projectRoot)) {
    process.stderr.write(
      `[audit-logger] skipping (worktree=${JSON.stringify(worktree)}, directory=${JSON.stringify(directory)}, cwd=${process.cwd()})\n`
    );
    return {
      "tool.execute.before": () => {},
      "tool.execute.after": () => {},
    };
  }

  // Sanitiza sessionID pra ser filename-safe
  const safeSessionID = sessionID.replace(/[^a-zA-Z0-9_-]/g, "_");
  const auditFile = path.join(AUDIT_DIR, `session-${safeSessionID}.jsonl`);

  // Garante que o dir existe (com try/catch robusto)
  const fullAuditPath = path.resolve(projectRoot, AUDIT_DIR);
  try {
    if (!fs.existsSync(fullAuditPath)) {
      fs.mkdirSync(fullAuditPath, { recursive: true });
    }
  } catch (err) {
    // Se nao conseguir criar, log no stderr e segue sem audit
    process.stderr.write(`[audit-logger] failed to create ${fullAuditPath}: ${err}\n`);
  }

  function log(entry: Record<string, unknown>) {
    try {
      const fullPath = path.resolve(projectRoot, auditFile);
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(fullPath, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n");
    } catch (err) {
      // Nunca bloquear - audit e best-effort
      process.stderr.write(`[audit-logger] failed to write: ${err}\n`);
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      log({
        event: "tool.execute.before",
        tool: input.tool,
        args: summarizeArgs(output?.args || {}),
        sessionID,
      });
    },

    "tool.execute.after": async (input, output) => {
      const result = output?.result || {};
      log({
        event: "tool.execute.after",
        tool: input.tool,
        args: summarizeArgs(input?.args || output?.args || {}),
        result: summarizeResult(result),
        success: result?.success !== false,
        sessionID,
      });
    },

    "session.created": async () => {
      log({
        event: "session.created",
        sessionID,
        directory,
        worktree,
      });
    },

    "session.deleted": async () => {
      log({
        event: "session.deleted",
        sessionID,
      });
    },
  };
};

/**
 * Resume args sem expor conteúdo sensível (não loga file content inteiro).
 */
function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const { content, body, data, payload, ...meta } = args as any;
  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;

    if (typeof value === "string" && value.length > 200) {
      summary[key] = value.slice(0, 200) + "...";
    } else if (typeof value === "object") {
      summary[key] = "<object>";
    } else {
      summary[key] = value;
    }
  }

  return summary;
}

function summarizeResult(result: Record<string, unknown>): Record<string, unknown> {
  const { content, output, stdout, stderr, ...meta } = result as any;
  const summary: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.length > 200) {
      summary[key] = value.slice(0, 200) + "...";
    } else if (typeof value === "object") {
      summary[key] = "<object>";
    } else {
      summary[key] = value;
    }
  }

  return summary;
}
