/**
 * stuck-worker-watchdog.ts — v6.6.1
 *
 * Detecta worker travado em loop OU idle há muito tempo, e injeta
 * system-reminder forçando o agent a emitir `escalation` em vez de
 * continuar gastando tokens. Complementa a regra de prompt do
 * `worker-escalation` SKILL com enforcement técnico.
 *
 * Sinais:
 *   - 3+ chamadas idênticas (tool + args normalizados) dentro de 5min → loop
 *   - 10min+ desde último tool call com sucesso → idle
 *
 * Ação (não destrutiva — OpenCode runtime não permite abortar agent):
 *   - Loga warn em audit
 *   - Injeta <system-reminder> via experimental.chat.system.transform quando detecta
 *   - Cooldown de 60s entre reminders para não poluir contexto
 *
 * Migração v6.6.2: trocado de `model.complete.after` (hook inexistente em
 * @opencode-ai/plugin 1.18.3) para `experimental.chat.system.transform`
 * (output.system.push).
 *
 * Config (opencode.json):
 *   "stuckWorkerWatchdog": {
 *     "enabled": true,
 *     "maxSameCallRepeats": 3,
 *     "sameCallWindowMs": 300000,
 *     "maxIdleMs": 600000,
 *     "reminderCooldownMs": 60000
 *   }
 *
 * Limitação conhecida: este plugin NÃO aborta execução (OpenCode não
 * permite). Ele força o LLM a parar via reminder. Se o LLM ignorar
 * (improvável mas possível), o último recurso é o usuário encerrar
 * manualmente. Para abort real, seria preciso patch no runtime.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { safeLog } from "./lib/safe-logger.ts";

interface WatchdogConfig {
  enabled: boolean;
  maxSameCallRepeats: number;
  sameCallWindowMs: number;
  maxIdleMs: number;
  reminderCooldownMs: number;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  enabled: true,
  maxSameCallRepeats: 3,
  sameCallWindowMs: 300_000,
  maxIdleMs: 600_000,
  reminderCooldownMs: 60_000,
};

interface CallRecord {
  hash: string;
  tool: string;
  ts: number;
  success: boolean;
}

class SessionState {
  calls: CallRecord[] = [];
  hashCounts = new Map<string, number>();
  lastSuccessTs = Date.now();
  lastReminderTs = 0;
  alreadyEscalated = false;

  record(tool: string, args: unknown, success: boolean): string {
    const hash = hashCall(tool, args);
    const ts = Date.now();
    this.calls.push({ hash, tool, ts, success });
    if (this.calls.length > 100) this.calls.shift();
    this.hashCounts.set(hash, (this.hashCounts.get(hash) ?? 0) + 1);
    if (success) this.lastSuccessTs = ts;
    return hash;
  }

  loopDetected(windowMs: number, threshold: number): { hash: string; count: number } | null {
    const now = Date.now();
    for (const [hash, count] of this.hashCounts) {
      if (count < threshold) continue;
      const recent = this.calls.filter((c) => c.hash === hash && now - c.ts <= windowMs);
      if (recent.length >= threshold) return { hash, count: recent.length };
    }
    return null;
  }

  idleTooLong(maxIdleMs: number): boolean {
    return Date.now() - this.lastSuccessTs > maxIdleMs;
  }
}

function hashCall(tool: string, args: unknown): string {
  // Normaliza removendo campos voláteis (timestamps, paths absolutos
  // podem mudar a cada call e invalidariam a correlação).
  const normalized = JSON.stringify(args, (_k, v) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return v;
  });
  let h = 0;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) - h + normalized.charCodeAt(i)) | 0;
  }
  return `${tool}:${(h >>> 0).toString(16)}`;
}

function reminderAsSystemBlock(reminder: string): string {
  return `\n<system-reminder>\n${reminder}\n</system-reminder>\n`;
}

const REMINDER_TEMPLATE = (reason: string, threshold: number) => `<system-reminder>
⚠️ STUCK WORKER DETECTED (${reason})

You are repeating the same tool call ${threshold}+ times OR have been idle without progress.

STOP looping. DO NOT modify code hoping it will work. In your NEXT JSON output, emit a structured escalation:

{
  "escalation": {
    "triggered": true,
    "class": "${reason}",
    "attempts": <count>,
    "lastError": {...},
    "tried": [...],
    "proposedActions": [{"id":"A1","action":"...","reason":"..."}]
  },
  "readyForQAGate": false
}

The orchestrator will read this and take action. See: skills/harness/worker-escalation/SKILL.md
</system-reminder>`;

export default async function StuckWorkerWatchdogPlugin(ctx: any) {
  const client = ctx?.client;
  let config: WatchdogConfig = DEFAULT_CONFIG;
  const states = new Map<string, SessionState>();

  if (client?.event && typeof client.event.on === "function") {
    client.event.on("config.updated", (newConfig: any) => {
      if (newConfig?.stuckWorkerWatchdog) {
        config = { ...DEFAULT_CONFIG, ...newConfig.stuckWorkerWatchdog };
      }
    });
  }

  const getState = (): SessionState => {
    const sid = ctx?.sessionID ?? ctx?.session?.id ?? "default";
    if (!states.has(sid)) states.set(sid, new SessionState());
    return states.get(sid)!;
  };

  return {
    "tool.execute.after": async (input, output) => {
      if (!config.enabled) return;
      const state = getState();
      const success = !output?.error && output?.exitCode !== 1;
      state.record(input.tool, input.args, success);

      const loop = state.loopDetected(config.sameCallWindowMs, config.maxSameCallRepeats);
      if (loop && !state.alreadyEscalated) {
        state.alreadyEscalated = true;
        safeLog(client, {
          level: "warn",
          message: `stuck-worker-watchdog: LOOP — ${input.tool} called ${loop.count}x with same args in ${config.sameCallWindowMs / 1000}s window`,
          metadata: {
            session: ctx?.sessionID ?? "default",
            tool: input.tool,
            hash: loop.hash,
            repeats: loop.count,
          },
        });
      }
    },

    "experimental.chat.system.transform": async (_input, output) => {
      if (!config.enabled) return;
      const state = getState();

      const loop = state.loopDetected(config.sameCallWindowMs, config.maxSameCallRepeats);
      const idle = state.idleTooLong(config.maxIdleMs);
      if (!loop && !idle) return;

      const now = Date.now();
      if (now - state.lastReminderTs < config.reminderCooldownMs) return;
      state.lastReminderTs = now;

      const reason = loop ? "loop" : "idle";
      safeLog(client, {
        level: loop ? "warn" : "info",
        message: `stuck-worker-watchdog: ${reason.toUpperCase()} detected — injecting escalation reminder`,
        metadata: {
          session: ctx?.sessionID ?? "default",
          reason,
          loopRepeats: loop?.count,
          idleMs: now - state.lastSuccessTs,
        },
      });

      const blocks = (output as { system?: string[] }).system;
      if (Array.isArray(blocks)) {
        blocks.push(reminderAsSystemBlock(REMINDER_TEMPLATE(reason, config.maxSameCallRepeats)));
      }
    },
  };
}
