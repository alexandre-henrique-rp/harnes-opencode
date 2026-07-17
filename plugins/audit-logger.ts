/**
 * audit-logger.ts — v6.5.0 (Híbrido Smart Merge)
 *
 * Plugin de auditoria append-only do harness. Registra cada tool call
 * com metadados estendidos (tokens, skill, sprint, decisionLog) e chain hash.
 *
 * Corrige o bug de caminhos raiz inválidos (worktree="/") na inicialização do OpenCode.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { appendFile, mkdir } from "node:fs/promises";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";

interface AuditEvent {
  timestamp: string;
  sessionId: string;
  agent: string;
  skill?: string;
  sprint?: string;
  tool: string;
  file?: string;
  args?: Record<string, unknown>;
  result?: "ok" | "error" | "blocked";
  errorMessage?: string;
  tokens?: number;
  decisionLog?: string;
  correlationId: string;
  prevHash: string;
}

const LOG_PATH = ".harness/audit.log";
const HASH_FILE = ".harness/.audit-hash";
let prevHash = "";
let currentSession = "";
let currentSkill = "";
let currentSprint = "";

export const AuditLoggerPlugin: Plugin = async ({ directory, worktree, client }) => {
  // Resolve projectRoot com fallback robusto contra o bug do OpenCode (worktree="/")
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");

  const projectRoot: string =
    (isValidPath(worktree) ? worktree : null) ??
    (isValidPath(directory) ? directory : null) ??
    process.cwd();

  const logFile = path.join(projectRoot, LOG_PATH);
  const hashFile = path.join(projectRoot, HASH_FILE);

  // Carrega o último hash conhecido
  try {
    prevHash = await fs.readFile(hashFile, "utf-8");
  } catch {
    prevHash = "genesis";
  }

  // Garante que o diretório .harness/ existe
  try {
    await mkdir(path.dirname(logFile), { recursive: true });
  } catch {}

  // Detecta sprint atual
  async function detectSprint(): Promise<string | undefined> {
    try {
      const sprintsDir = path.join(projectRoot, ".harness/sprints");
      const files = await fs.readdir(sprintsDir);
      const sprintFiles = files
        .filter((f) => /^S\d+\.json$/.test(f))
        .sort()
        .reverse();
      if (sprintFiles.length > 0) {
        return sprintFiles[0].replace(".json", "");
      }
    } catch {}
    return undefined;
  }

  currentSprint = (await detectSprint()) ?? "";

  function estimateTokens(input: unknown): number {
    const str = typeof input === "string" ? input : JSON.stringify(input);
    return Math.ceil(str.length / 3);
  }

  function hashEvent(event: Omit<AuditEvent, "prevHash" | "correlationId">): string {
    const payload = JSON.stringify({ ...event, prevHash });
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  async function log(event: Omit<AuditEvent, "prevHash" | "correlationId">): Promise<void> {
    const correlationId = hashEvent(event);
    const fullEvent: AuditEvent = {
      ...event,
      prevHash,
      correlationId,
    };

    const line = JSON.stringify(fullEvent) + "\n";
    await appendFile(logFile, line, { flag: "a" });
    await fs.writeFile(hashFile, correlationId);
    prevHash = correlationId;
  }

  return {
    "session.start": async (input) => {
      currentSession = input.sessionId ?? "unknown";
      await log({
        timestamp: new Date().toISOString(),
        sessionId: currentSession,
        agent: "system",
        tool: "session.start",
        result: "ok",
      });
    },

    "session.end": async () => {
      await log({
        timestamp: new Date().toISOString(),
        sessionId: currentSession,
        agent: "system",
        tool: "session.end",
        result: "ok",
      });
    },

    "skill.loaded": async (input) => {
      currentSkill = input.skill ?? "";
      await log({
        timestamp: new Date().toISOString(),
        sessionId: currentSession,
        agent: input.agent ?? "unknown",
        skill: currentSkill,
        sprint: currentSprint,
        tool: "skill.load",
        args: { name: currentSkill },
        result: "ok",
      });
    },

    "tool.execute.before": async (input, output) => {
      const file = output.args?.filePath ?? output.args?.path ?? output.args?.TargetFile;
      const argsStr = JSON.stringify(output.args ?? {});
      const tokens = estimateTokens(argsStr);

      await log({
        timestamp: new Date().toISOString(),
        sessionId: currentSession,
        agent: input.context?.agent ?? "unknown",
        skill: currentSkill || undefined,
        sprint: currentSprint,
        tool: input.tool,
        file: typeof file === "string" ? file : undefined,
        args: output.args,
        result: "ok",
        tokens,
      });
    },

    "tool.execute.after": async (input, output) => {
      const resultStatus =
        output.error ? "error" : output.blocked ? "blocked" : "ok";
      const file = output.args?.filePath ?? output.args?.path ?? output.args?.TargetFile;
      const resultStr = JSON.stringify(output.result ?? output.error ?? {});
      const tokens = estimateTokens(resultStr);

      await log({
        timestamp: new Date().toISOString(),
        sessionId: currentSession,
        agent: input.context?.agent ?? "unknown",
        skill: currentSkill || undefined,
        sprint: currentSprint,
        tool: `${input.tool}.result`,
        file: typeof file === "string" ? file : undefined,
        args: { status: resultStatus },
        result: resultStatus,
        errorMessage: output.error?.message,
        tokens,
      });
    },

    "decision.persisted": async (input: any) => {
      await log({
        timestamp: new Date().toISOString(),
        sessionId: currentSession,
        agent: input.agent ?? "unknown",
        sprint: currentSprint,
        tool: "decision.persist",
        file: input.path,
        result: "ok",
        decisionLog: input.path,
        tokens: estimateTokens(input.content ?? ""),
      });
    },
  };
};

export async function queryAuditLog(
  projectRoot: string,
  filter: {
    sprint?: string;
    agent?: string;
    skill?: string;
    tool?: string;
    filePattern?: RegExp;
  },
): Promise<AuditEvent[]> {
  const logPath = path.join(projectRoot, LOG_PATH);
  const content = await fs.readFile(logPath, "utf-8");
  const lines = content.trim().split("\n");

  const events: AuditEvent[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as AuditEvent;
      if (filter.sprint && event.sprint !== filter.sprint) continue;
      if (filter.agent && event.agent !== filter.agent) continue;
      if (filter.skill && event.skill !== filter.skill) continue;
      if (filter.tool && !event.tool.startsWith(filter.tool)) continue;
      if (filter.filePattern && event.file && !filter.filePattern.test(event.file)) continue;
      events.push(event);
    } catch {}
  }
  return events;
}

export async function tokensByAgentAndSkill(
  projectRoot: string,
  sprintId: string,
): Promise<Record<string, Record<string, number>>> {
  const events = await queryAuditLog(projectRoot, { sprint: sprintId });
  const matrix: Record<string, Record<string, number>> = {};

  for (const e of events) {
    if (!e.tokens) continue;
    if (!matrix[e.agent]) matrix[e.agent] = {};
    const key = e.skill ?? "(no skill)";
    matrix[e.agent][key] = (matrix[e.agent][key] ?? 0) + e.tokens;
  }
  return matrix;
}
