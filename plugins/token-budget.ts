/**
 * token-budget.ts — v6.6.0
 *
 * Plugin que monitora o consumo de tokens em tempo real e toma ações
 * baseado em thresholds:
 *
 *   0-50%   → operação normal
 *   50-80%  → sugere /compact (warning emitido)
 *   80-95%  → alerta crítico + injeta lembrete ao agent
 *   95%+    → halt + força /compact antes da próxima tool call
 *
 * Configuração (via opencode.json):
 *   "tokenBudget": {
 *     "enabled": true,
 *     "maxContextTokens": 200000,    // limite do modelo
 *     "compactThreshold": 0.5,       // 50% = sugere compact
 *     "warnThreshold": 0.8,          // 80% = alerta
 *     "haltThreshold": 0.95,         // 95% = halt
 *     "haltBehavior": "compact"      // compact | error
 *   }
 */

import type { Plugin } from "@opencode-ai/plugin";

interface BudgetConfig {
  enabled: boolean;
  maxContextTokens: number;
  compactThreshold: number;
  warnThreshold: number;
  haltThreshold: number;
  haltBehavior: "compact" | "error";
}

const DEFAULT_CONFIG: BudgetConfig = {
  enabled: true,
  maxContextTokens: 200_000,
  compactThreshold: 0.5,
  warnThreshold: 0.8,
  haltThreshold: 0.95,
  haltBehavior: "compact",
};

interface BudgetState {
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  lastUpdate: string;
}

let state: BudgetState = {
  inputTokens: 0,
  outputTokens: 0,
  cacheRead: 0,
  cacheWrite: 0,
  lastUpdate: new Date().toISOString(),
};

export const TokenBudgetPlugin: Plugin = async ({ client }) => {
  let config: BudgetConfig = DEFAULT_CONFIG;
  let compactSuggested = false;

  client.event.on("config.updated", (newConfig) => {
    if (newConfig.tokenBudget) {
      config = { ...DEFAULT_CONFIG, ...newConfig.tokenBudget };
    }
  });

  function totalUsed(): number {
    return state.inputTokens + state.outputTokens;
  }

  function usageRatio(): number {
    return totalUsed() / config.maxContextTokens;
  }

  function status(): "ok" | "compact-suggested" | "warn" | "halt" {
    const r = usageRatio();
    if (r >= config.haltThreshold) return "halt";
    if (r >= config.warnThreshold) return "warn";
    if (r >= config.compactThreshold) return "compact-suggested";
    return "ok";
  }

  return {
    "model.complete.after": async (input, output) => {
      if (!config.enabled) return;

      const usage = output.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
          }
        | undefined;

      if (usage) {
        state.inputTokens = usage.input_tokens ?? state.inputTokens;
        state.outputTokens = usage.output_tokens ?? state.outputTokens;
        state.cacheRead = usage.cache_read_input_tokens ?? state.cacheRead;
        state.cacheWrite = usage.cache_creation_input_tokens ?? state.cacheWrite;
        state.lastUpdate = new Date().toISOString();
      }

      const ratio = usageRatio();
      const cur = status();

      if (cur === "halt") {
        client.session
          .log({
            level: "error",
            message: `token-budget: HALT at ${Math.round(ratio * 100)}% (${totalUsed()}/${config.maxContextTokens})`,
            metadata: { ...state, ratio },
          })
          .catch(() => {});

        if (config.haltBehavior === "compact") {
          output.result = injectCompactReminder(
            output.result,
            ratio,
            totalUsed(),
            config.maxContextTokens,
          );
        } else {
          throw new Error(
            `token-budget: context at ${Math.round(ratio * 100)}% — manual intervention required. Run /compact or /clear.`,
          );
        }
      } else if (cur === "warn") {
        client.session
          .log({
            level: "warn",
            message: `token-budget: at ${Math.round(ratio * 100)}% (${totalUsed()}/${config.maxContextTokens}) — consider /compact`,
            metadata: { ...state, ratio },
          })
          .catch(() => {});
        compactSuggested = true;
      } else if (cur === "compact-suggested" && !compactSuggested) {
        client.session
          .log({
            level: "info",
            message: `token-budget: at ${Math.round(ratio * 100)}% — /compact recommended before next big task`,
            metadata: { ...state, ratio },
          })
          .catch(() => {});
        compactSuggested = true;
      }
    },

    "tool.execute.before": async (input, output) => {
      if (!config.enabled) return;
      if (status() !== "warn" && status() !== "halt") return;

      const expensiveTools = ["read", "bash", "grep", "glob"];
      if (!expensiveTools.includes(input.tool)) return;

      const filePath = output.args?.filePath ?? output.args?.path ?? output.args?.command;
      if (!filePath) return;

      output.args = output.args ?? {};
      (output.args as Record<string, unknown>)._budgetWarning = {
        ratio: usageRatio(),
        used: totalUsed(),
        limit: config.maxContextTokens,
        suggestion: "Prefer /file:line over full read. Or split into sub-agent.",
      };
    },
  };
};

function injectCompactReminder(
  result: unknown,
  ratio: number,
  used: number,
  limit: number,
): unknown {
  const reminder = `\n\n<system-reminder>
⚠️ Context at ${Math.round(ratio * 100)}% (${used}/${limit} tokens).
You MUST /compact now or split remaining work into a sub-agent.
Do NOT start new exploration without compacting first.
</system-reminder>`;

  if (typeof result === "string") return result + reminder;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return { ...r, content: r.content + reminder };
    if (Array.isArray(r.content)) {
      return {
        ...r,
        content: [
          ...(r.content as unknown[]),
          { type: "text", text: reminder },
        ],
      };
    }
  }
  return result;
}

export function getBudgetState(): BudgetState & { ratio: number; status: string } {
  return {
    ...state,
    ratio: (state.inputTokens + state.outputTokens) / DEFAULT_CONFIG.maxContextTokens,
    status: (state.inputTokens + state.outputTokens) / DEFAULT_CONFIG.maxContextTokens >= DEFAULT_CONFIG.haltThreshold
      ? "halt"
      : (state.inputTokens + state.outputTokens) / DEFAULT_CONFIG.maxContextTokens >= DEFAULT_CONFIG.warnThreshold
      ? "warn"
      : (state.inputTokens + state.outputTokens) / DEFAULT_CONFIG.maxContextTokens >= DEFAULT_CONFIG.compactThreshold
      ? "compact-suggested"
      : "ok",
  };
}
