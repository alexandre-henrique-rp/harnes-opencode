/**
 * structured-thinking.ts — v6.6.0
 *
 * Plugin que força o agent a usar tags estruturadas de pensamento
 * (<thinking>...</thinking>) e a fazer self-check antes de tool calls
 * finais. Reduz redundância e melhora qualidade.
 *
 * Configuração (via opencode.json):
 *   "structuredThinking": {
 *     "enabled": true,
 *     "requireSelfCheck": true,
 *     "selfCheckCategories": [
 *       "spec-coverage",
 *       "edge-cases",
 *       "test-coverage",
 *       "security",
 *       "performance"
 *     ],
 *     "stripThinkingFromOutput": true   // remove <thinking> do output final
 *   }
 */

import type { Plugin } from "@opencode-ai/plugin";
import { safeLog } from "./lib/safe-logger.ts";

interface ThinkingConfig {
  enabled: boolean;
  requireSelfCheck: boolean;
  selfCheckCategories: string[];
  stripThinkingFromOutput: boolean;
}

const DEFAULT_CONFIG: ThinkingConfig = {
  enabled: true,
  requireSelfCheck: true,
  selfCheckCategories: [
    "spec-coverage",
    "edge-cases",
    "test-coverage",
    "security",
    "performance",
  ],
  stripThinkingFromOutput: true,
};

const SYSTEM_REMINDER_TEMPLATE = (categories: string[]) => `<system-reminder>
STRUCTURED THINKING PROTOCOL (v6.6.0)

You MUST structure your reasoning using these tags:

<thinking>
Your step-by-step reasoning here. Be terse. Use bullets.
</thinking>

<answer>
Your final response to the user. Concise. No preamble.
</answer>

SELF-CHECK before declaring "done" (review internally before responding):

${categories.map((c) => `- [ ] ${c}`).join("\n")}

If ANY self-check fails, fix the issue BEFORE responding. Do not
declare "done" prematurely. If a self-check is not applicable, write
"N/A — <reason>" rather than skipping.

REMOVE your <thinking> block from the final visible output. The user
sees only <answer>.
</system-reminder>`;

export default async function StructuredThinkingPlugin(ctx: any) {
  const client = ctx?.client;
  let config: ThinkingConfig = DEFAULT_CONFIG;

  if (client?.event && typeof client.event.on === "function") {
    client.event.on("config.updated", (newConfig: any) => {
      if (newConfig?.structuredThinking) {
        config = { ...DEFAULT_CONFIG, ...newConfig.structuredThinking };
      }
    });
  }

  function injectReminder(input: unknown): void {
    if (!config.enabled) return;
    const inp = input as Record<string, unknown>;
    if (!inp.system) return;

    const reminder = SYSTEM_REMINDER_TEMPLATE(config.selfCheckCategories);

    if (typeof inp.system === "string") {
      inp.system = inp.system + "\n\n" + reminder;
    } else if (Array.isArray(inp.system)) {
      (inp.system as unknown[]).push({ type: "text", text: reminder });
    }
  }

  function stripThinking(output: unknown): unknown {
    if (!config.stripThinkingFromOutput) return output;

    const extractText = (r: unknown): string | null => {
      if (typeof r === "string") return r;
      if (r && typeof r === "object") {
        const rr = r as Record<string, unknown>;
        if (typeof rr.content === "string") return rr.content;
        if (Array.isArray(rr.content)) {
          return rr.content
            .map((c: unknown) =>
              typeof c === "string"
                ? c
                : (c as Record<string, unknown>)?.text ?? "",
            )
            .join("\n");
        }
      }
      return null;
    };

    const setText = (r: unknown, newText: string): unknown => {
      if (typeof r === "string") return newText;
      if (r && typeof r === "object") {
        const rr = r as Record<string, unknown>;
        if (typeof rr.content === "string") return { ...rr, content: newText };
        if (Array.isArray(rr.content)) {
          return { ...rr, content: [{ type: "text", text: newText }] };
        }
      }
      return r;
    };

    const text = extractText(output);
    if (!text) return output;

    // Remove <thinking>...</thinking> blocks (greedy, multiline)
    const cleaned = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();

    if (!cleaned) {
      safeLog(client, {
        level: "warn",
        message: "structured-thinking: stripped all output (only thinking block remained)",
      });
      return output; // fail-open: devolve o original
    }

    return setText(output, cleaned);
  }

  return {
    "model.complete.before": async (input) => {
      injectReminder(input);
    },

    "model.complete.after": async (input, output) => {
      output.result = stripThinking(output.result);
    },

    "tool.execute.before": async (input) => {
      if (!config.enabled) return;
      const statefulTools = ["write", "edit", "bash"];
      if (!statefulTools.includes(input.tool)) return;

      safeLog(client, {
        level: "debug",
        message: `structured-thinking: stateful tool ${input.tool} — verify self-check was done`,
      });
    },
  };
};
