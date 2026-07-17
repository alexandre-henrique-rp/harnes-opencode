/**
 * audit-logger.ts — v6.6.0 (Híbrido Smart Merge)
 *
 * Plugin de auditoria append-only do harness. Registra cada tool call
 * com metadados estendidos (tokens, skill, sprint, decisionLog) e chain hash.
 *
 * Mudanças v6.6.0:
 *   - Captura `input_tokens`, `output_tokens`, `cache_read_input_tokens`,
 *     `cache_creation_input_tokens` do response do provider
 *   - Calcula custo estimado por agent/sprint/skill
 *   - Detecta anomalias (ex: agent consumindo 5x a média)
 *   - Helper `tokenUsageReport()` para o script de relatório
 *
 * Corrige o bug de caminhos raiz inválidos (worktree="/") na inicialização do OpenCode.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { appendFile, mkdir } from "node:fs/promises";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";

interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface CostConfig {
  // Preços em USD por 1M tokens (Anthropic Sonnet 4.5 como referência)
  inputPer1M: number;
  outputPer1M: number;
  cacheReadPer1M: number;
  cacheWritePer1M: number;
}

const DEFAULT_COST: CostConfig = {
  inputPer1M: 3.0,        // Sonnet 4.5
  outputPer1M: 15.0,      // Sonnet 4.5
  cacheReadPer1M: 0.30,   // 10% do input
  cacheWritePer1M: 3.75,  // 1.25x input
};

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
  /** Estimativa local (chars/3) — sempre presente */
  tokens?: number;
  /** Custo estimado em USD para este evento (soma) */
  costUsd?: number;
  /** Usage real do provider (quando disponível) */
  usage?: TokenUsage;
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

export const AuditLoggerPlugin: Plugin = async (ctx) => {
  const { client } = ctx;
  const project = (ctx as any).project || ctx;
  const directory = project.directory;
  const worktree = project.worktree;

  // Resolve projectRoot com fallback robusto contra o bug do OpenCode (worktree="/")
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");

  const projectRoot: string =
    (isValidPath(worktree) ? worktree : null) ??
    (isValidPath(directory) ? directory : null) ??
    process.cwd();

  const logFile = path.join(projectRoot, LOG_PATH);
  const hashFile = path.join(projectRoot, HASH_FILE);
  let costConfig: CostConfig = DEFAULT_COST;

  try {
    prevHash = await fs.readFile(hashFile, "utf-8");
  } catch {
    prevHash = "genesis";
  }

  // Garante que o diretório .harness/ existe
  try {
    await mkdir(path.dirname(logFile), { recursive: true });
  } catch {}

  client.event.on("config.updated", (newConfig) => {
    if (newConfig.auditLogger?.costConfig) {
      costConfig = { ...DEFAULT_COST, ...newConfig.auditLogger.costConfig };
    }
  });

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
    return Math.ceil((str?.length ?? 0) / 3);
  }

  function calculateCost(usage: TokenUsage): number {
    return (
      (usage.input / 1_000_000) * costConfig.inputPer1M +
      (usage.output / 1_000_000) * costConfig.outputPer1M +
      (usage.cacheRead / 1_000_000) * costConfig.cacheReadPer1M +
      (usage.cacheWrite / 1_000_000) * costConfig.cacheWritePer1M
    );
  }

  function hashEvent(event: Omit<AuditEvent, "prevHash" | "correlationId">): string {
    const payload = JSON.stringify({ ...event, prevHash });
    return createHash("sha256").update(payload).digest("hex").slice(0, 16);
  }

  async function log(event: Omit<AuditEvent, "prevHash" | "correlationId">): Promise<void> {
    const correlationId = hashEvent(event);
    const fullEvent: AuditEvent = { ...event, prevHash, correlationId };
    const line = JSON.stringify(fullEvent) + "\n";
    await appendFile(logFile, line, { flag: "a" });
    await fs.writeFile(hashFile, correlationId);
    prevHash = correlationId;
  }

  return {
    "model.complete.after": async (input, output) => {
      const rawUsage = output.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
          }
        | undefined;

      if (rawUsage) {
        const usage: TokenUsage = {
          input: rawUsage.input_tokens ?? 0,
          output: rawUsage.output_tokens ?? 0,
          cacheRead: rawUsage.cache_read_input_tokens ?? 0,
          cacheWrite: rawUsage.cache_creation_input_tokens ?? 0,
        };
        const cost = calculateCost(usage);

        await log({
          timestamp: new Date().toISOString(),
          sessionId: currentSession,
          agent: input.context?.agent ?? "unknown",
          skill: currentSkill || undefined,
          sprint: currentSprint,
          tool: "model.complete",
          result: "ok",
          usage,
          costUsd: cost,
          tokens: usage.input + usage.output,
        });
      }
    },

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
      const file = output.args?.filePath ?? output.args?.path;
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
      const resultStatus = output.error ? "error" : output.blocked ? "blocked" : "ok";
      const file = output.args?.filePath ?? output.args?.path;
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

    "decision.persisted": async (input) => {
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

/**
 * Relatório agregado de tokens/custo por agent/skill/sprint.
 * Chamado pelo scripts/token-report.sh.
 */
export async function tokenUsageReport(
  projectRoot: string,
  filter: { sprint?: string; agent?: string } = {},
): Promise<{
  total: TokenUsage & { costUsd: number };
  byAgent: Record<
    string,
    { usage: TokenUsage; costUsd: number; calls: number; avgInputPerCall: number }
  >;
  bySkill: Record<
    string,
    { usage: TokenUsage; costUsd: number; calls: number }
  >;
  byFilePattern: Record<string, { calls: number; tokens: number }>;
  anomalies: Array<{ type: string; message: string }>;
}> {
  const logPath = path.join(projectRoot, LOG_PATH);
  let content: string;
  try {
    content = await fs.readFile(logPath, "utf-8");
  } catch {
    return emptyReport();
  }
  const lines = content.trim().split("\n");

  const total: TokenUsage & { costUsd: number } = {
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0,
  };
  const byAgent: Record<string, { usage: TokenUsage; costUsd: number; calls: number; avgInputPerCall: number }> = {};
  const bySkill: Record<string, { usage: TokenUsage; costUsd: number; calls: number }> = {};
  const byFilePattern: Record<string, { calls: number; tokens: number }> = {};
  const anomalies: Array<{ type: string; message: string }> = [];

  let modelCompleteCalls = 0;
  let totalInputAcrossCalls = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as AuditEvent;
      if (filter.sprint && event.sprint !== filter.sprint) continue;
      if (filter.agent && event.agent !== filter.agent) continue;
      if (event.tool !== "model.complete" || !event.usage) continue;

      const u = event.usage;
      total.input += u.input;
      total.output += u.output;
      total.cacheRead += u.cacheRead;
      total.cacheWrite += u.cacheWrite;
      total.costUsd += event.costUsd ?? 0;

      // by agent
      if (!byAgent[event.agent]) {
        byAgent[event.agent] = {
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          costUsd: 0, calls: 0, avgInputPerCall: 0,
        };
      }
      byAgent[event.agent].usage.input += u.input;
      byAgent[event.agent].usage.output += u.output;
      byAgent[event.agent].usage.cacheRead += u.cacheRead;
      byAgent[event.agent].usage.cacheWrite += u.cacheWrite;
      byAgent[event.agent].costUsd += event.costUsd ?? 0;
      byAgent[event.agent].calls += 1;
      totalInputAcrossCalls += u.input;
      modelCompleteCalls += 1;

      // by skill
      const skill = event.skill ?? "(no skill)";
      if (!bySkill[skill]) {
        bySkill[skill] = {
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          costUsd: 0, calls: 0,
        };
      }
      bySkill[skill].usage.input += u.input;
      bySkill[skill].usage.output += u.output;
      bySkill[skill].usage.cacheRead += u.cacheRead;
      bySkill[skill].usage.cacheWrite += u.cacheWrite;
      bySkill[skill].costUsd += event.costUsd ?? 0;
      bySkill[skill].calls += 1;
    } catch {
      // skip
    }
  }

  // Anomaly detection
  const avgInput = modelCompleteCalls > 0 ? totalInputAcrossCalls / modelCompleteCalls : 0;
  for (const [agent, data] of Object.entries(byAgent)) {
    data.avgInputPerCall = data.calls > 0 ? data.usage.input / data.calls : 0;
    if (data.avgInputPerCall > avgInput * 3 && data.calls >= 3) {
      anomalies.push({
        type: "high-input-agent",
        message: `${agent} has avg ${Math.round(data.avgInputPerCall)} input tokens/call — 3x the overall avg of ${Math.round(avgInput)}`,
      });
    }
  }
  if (total.input > 0 && total.cacheRead / total.input < 0.1 && total.input > 100_000) {
    anomalies.push({
      type: "low-cache-hit",
      message: `Cache hit ratio is only ${Math.round((total.cacheRead / total.input) * 100)}% — check prompt-cache-prefixer config`,
    });
  }

  return { total, byAgent, bySkill, byFilePattern, anomalies };
}

function emptyReport() {
  return {
    total: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
    byAgent: {},
    bySkill: {},
    byFilePattern: {},
    anomalies: [],
  };
}

export { DEFAULT_COST, type CostConfig };

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
  let content: string;
  try {
    content = await fs.readFile(logPath, "utf-8");
  } catch {
    return [];
  }
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
    } catch {
      // skip
    }
  }
  return events;
}
