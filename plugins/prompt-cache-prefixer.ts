/**
 * prompt-cache-prefixer.ts — v6.6.0
 *
 * Plugin que reorganiza o prompt para otimizar Anthropic prompt caching.
 *
 * Princípio: "Stable at the front, dynamic at the rear".
 *   - System prompt (raramente muda)
 *   - Tool definitions (muda raramente)
 *   - AGENTS.md files (muda às vezes)
 *   - Skills loaded (muda às vezes)
 *   - Conversation history (muda sempre)
 *   - User query (muda toda turn)
 *
 * Anthropic cobra ~10% do preço normal em cache hits. Em workloads de
 * agent (mesmo system prompt repetido 50+ vezes por sprint), isso é
 * 90% de economia.
 *
 * Configuração (via opencode.json):
 *   "promptCachePrefixer": {
 *     "enabled": true,
 *     "cacheBreakpointAfter": "skills"  // system|tools|agents_md|skills|history
 *   }
 */

import type { Plugin } from "@opencode-ai/plugin";
import { estimateTokens } from "./lib/token-estimate.js";

interface PrefixConfig {
  enabled: boolean;
  cacheBreakpointAfter: "system" | "tools" | "agents_md" | "skills" | "history";
  /** Emit métricas de cache hit/miss no audit log */
  emitMetrics: boolean;
}

const DEFAULT_CONFIG: PrefixConfig = {
  enabled: true,
  cacheBreakpointAfter: "skills",
  emitMetrics: true,
};

interface PrefixLayout {
  /** system prompt + persona (raramente muda) */
  system: string;
  /** tool definitions (raramente muda) */
  tools: string;
  /** AGENTS.md files carregados (muda por sprint) */
  agentsMd: string;
  /** skills carregadas (muda por task) */
  skills: string;
  /** histórico da conversa (muda sempre) */
  history: string;
  /** user query atual (muda toda turn) */
  query: string;
}

let cacheHits = 0;
let cacheMisses = 0;

export const PromptCachePrefixerPlugin: Plugin = async ({ client }) => {
  let config: PrefixConfig = DEFAULT_CONFIG;

  client.event.on("config.updated", (newConfig) => {
    if (newConfig.promptCachePrefixer) {
      config = { ...DEFAULT_CONFIG, ...newConfig.promptCachePrefixer };
    }
  });

  function reorderPrompt(layout: PrefixLayout): {
    prompt: string;
    cacheBreakpoint: string;
    expectedCacheable: number;
  } {
    // Ordem: system → tools → agentsMd → skills → [BREAKPOINT] → history → query
    const sections: Array<{ name: keyof PrefixLayout; content: string }> = [
      { name: "system", content: layout.system },
      { name: "tools", content: layout.tools },
      { name: "agentsMd", content: layout.agentsMd },
      { name: "skills", content: layout.skills },
    ];

    let prompt = "";
    let cacheBreakpoint: keyof PrefixLayout = "skills";
    const order: Array<keyof PrefixLayout> = ["system", "tools", "agentsMd", "skills", "history", "query"];

    for (const sectionName of order) {
      const section = sections.find((s) => s.name === sectionName);
      if (section && section.content) {
        prompt += section.content + "\n\n";
      } else if (sectionName === "history") {
        prompt += layout.history + "\n\n";
      } else if (sectionName === "query") {
        prompt += layout.query;
      }

      if (sectionName === config.cacheBreakpointAfter) {
        cacheBreakpoint = sectionName;
        // Marca o ponto de quebra com um marker que o OpenCode CLI entende
        prompt += "<!-- cache:breakpoint -->\n\n";
      }
    }

    const expectedCacheable =
      estimateTokens(layout.system) +
      estimateTokens(layout.tools) +
      estimateTokens(layout.agentsMd) +
      estimateTokens(layout.skills);

    return { prompt, cacheBreakpoint: String(cacheBreakpoint), expectedCacheable };
  }

  function extractLayout(input: unknown): PrefixLayout {
    const inp = input as Record<string, unknown>;

    let system = "";
    let tools = "";
    let history = "";
    let query = "";

    // System prompt
    if (typeof inp.system === "string") system = inp.system;
    if (Array.isArray(inp.system)) {
      system = (inp.system as Array<{ text?: string }>)
        .map((s) => s.text ?? "")
        .join("\n");
    }

    // Tools
    if (typeof inp.tools === "string") tools = inp.tools;
    if (Array.isArray(inp.tools)) {
      tools = JSON.stringify(inp.tools);
    }

    // Messages (history + query)
    if (Array.isArray(inp.messages)) {
      const msgs = inp.messages as Array<{ role: string; content: unknown }>;
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1];
        query = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
        if (msgs.length > 1) {
          history = msgs
            .slice(0, -1)
            .map((m) => {
              const c = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
              return `[${m.role}] ${c}`;
            })
            .join("\n");
        }
      }
    }

    return {
      system,
      tools,
      agentsMd: extractAgentsMdFromContext(inp),
      skills: extractSkillsFromContext(inp),
      history,
      query,
    };
  }

  function extractAgentsMdFromContext(inp: Record<string, unknown>): string {
    const context = (inp.context ?? inp.metadata) as Record<string, unknown> | undefined;
    if (!context) return "";
    const files = context.agmdFiles as Array<{ path: string; content: string }> | undefined;
    if (!Array.isArray(files)) return "";
    return files.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`).join("\n\n");
  }

  function extractSkillsFromContext(inp: Record<string, unknown>): string {
    const context = (inp.context ?? inp.metadata) as Record<string, unknown> | undefined;
    if (!context) return "";
    const skills = context.loadedSkills as Array<{ name: string; content: string }> | undefined;
    if (!Array.isArray(skills)) return "";
    return skills.map((s) => `<skill name="${s.name}">\n${s.content}\n</skill>`).join("\n\n");
  }

  return {
    "model.complete.before": async (input) => {
      if (!config.enabled) return;

      const layout = extractLayout(input);
      const { prompt, cacheBreakpoint, expectedCacheable } = reorderPrompt(layout);

      (input as Record<string, unknown>).system = prompt.split("<!-- cache:breakpoint -->")[0];
      const originalMessages = Array.isArray((input as any).messages) ? (input as any).messages : [];
      (input as Record<string, unknown>).messages = [
        ...originalMessages.slice(0, -1),
        {
          role: "user",
          content: prompt.split("<!-- cache:breakpoint -->")[1]?.trim() ?? layout.query,
        },
      ];
      (input as Record<string, unknown>)._cacheBreakpoint = cacheBreakpoint;
      (input as Record<string, unknown>)._expectedCacheableTokens = expectedCacheable;
    },

    "model.complete.after": async (input, output) => {
      if (!config.enabled || !config.emitMetrics) return;

      const usage = output.usage as
        | {
            input_tokens?: number;
            output_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
          }
        | undefined;

      if (usage?.cache_read_input_tokens && usage?.input_tokens) {
        const cacheRatio = usage.cache_read_input_tokens / usage.input_tokens;
        if (cacheRatio > 0.5) {
          cacheHits++;
        } else {
          cacheMisses++;
        }

        client.session
          .log({
            level: "info",
            message: `prompt-cache: hit=${usage.cache_read_input_tokens}/${usage.input_tokens} (${Math.round(cacheRatio * 100)}%)`,
            metadata: {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cacheRead: usage.cache_read_input_tokens,
              cacheWrite: usage.cache_creation_input_tokens,
              ratio: cacheRatio,
            },
          })
          .catch(() => {});
      }
    },
  };
};

export function getCacheStats(): { hits: number; misses: number; ratio: number } {
  const total = cacheHits + cacheMisses;
  return {
    hits: cacheHits,
    misses: cacheMisses,
    ratio: total === 0 ? 0 : cacheHits / total,
  };
}
