/**
 * context-compressor.ts — v6.6.0
 *
 * Plugin que comprime tool outputs grandes (>1k tokens) antes de devolver
 * para o LLM. Usa um modelo barato (Haiku / gpt-4o-mini) para resumir.
 *
 * Economia esperada: 40-60% em tool outputs grandes (test runs, file reads, search results).
 *
 * Configuração (via opencode.json):
 *   "contextCompressor": {
 *     "enabled": true,
 *     "threshold": 1000,            // tokens mínimo para comprimir
 *     "maxOutputTokens": 500,       // tamanho alvo do summary
 *     "model": "haiku",             // haiku | gpt-4o-mini | gpt-5-nano
 *     "preservePatterns": [         // regex que SEMPRE preserva (não comprime)
 *       "AGENTS\\.md$",
 *       "package\\.json$",
 *       "\\.test\\.",
 *       "tsconfig\\.json$"
 *     ]
 *   }
 */

import type { Plugin } from "@opencode-ai/plugin";
import { estimateTokens } from "./lib/token-estimate.ts";
import { safeLog } from "./lib/safe-logger.ts";

interface CompressorConfig {
  enabled: boolean;
  threshold: number;
  maxOutputTokens: number;
  model: "haiku" | "gpt-4o-mini" | "gpt-5-nano" | "local";
  preservePatterns: string[];
}

const DEFAULT_CONFIG: CompressorConfig = {
  enabled: true,
  threshold: 1000,
  maxOutputTokens: 500,
  model: "haiku",
  preservePatterns: ["AGENTS\\.md$", "package\\.json$", "tsconfig\\.json$"],
};

export default async function ContextCompressorPlugin(ctx: any) {
  const client = ctx?.client;
  let config: CompressorConfig = DEFAULT_CONFIG;

  if (client?.event && typeof client.event.on === "function") {
    client.event.on("config.updated", (newConfig: any) => {
      if (newConfig?.contextCompressor) {
        config = { ...DEFAULT_CONFIG, ...newConfig.contextCompressor };
      }
    });
  }

  function shouldCompress(filePath: string, content: string): boolean {
    if (!config.enabled) return false;
    const tokens = estimateTokens(content);
    if (tokens < config.threshold) return false;

    // Nunca comprime arquivos críticos de contexto
    for (const pattern of config.preservePatterns) {
      if (new RegExp(pattern).test(filePath)) return false;
    }
    return true;
  }

  async function compress(content: string, filePath: string): Promise<string> {
    const prompt = `Compress the following ${filePath} output to ~${config.maxOutputTokens} tokens. Preserve:
- File paths, line numbers, function names
- Error messages verbatim
- Test results (pass/fail counts)
- Key data values (numbers, IDs, status codes)

Strip:
- Boilerplate/prosa
- Repeated content
- Tool call metadata
- Debug noise (stack traces >5 lines)

OUTPUT ONLY THE COMPRESSED CONTENT. No preamble. No explanation.

CONTENT TO COMPRESS:
"""
${content.slice(0, 50_000)}  // hard cap before sending
"""`;

    try {
      if (!client?.model || typeof client.model.complete !== "function") {
        return content;
      }

      const response = await client.model.complete({
        model: config.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: config.maxOutputTokens,
        temperature: 0, // determinístico
      });

      const compressed = response.content?.[0]?.text ?? content;
      return `<!-- compressed from ${estimateTokens(content)} to ${estimateTokens(compressed)} tokens by context-compressor -->\n${compressed}`;
    } catch (err) {
      // Falha ao comprimir → retorna original (fail-open)
      safeLog(client, {
        level: "warn",
        message: `context-compressor failed for ${filePath}: ${err}`,
      });
      return content;
    }
  }

  return {
    "tool.execute.after": async (input, output) => {
      // Só comprime ferramentas que retornam conteúdo textual grande
      const compressibleTools = ["read", "bash", "grep", "glob", "fetch"];
      if (!compressibleTools.includes(input.tool)) return;

      const content = extractContent(output.result);
      if (!content || typeof content !== "string") return;

      const filePath = output.args?.filePath ?? output.args?.path ?? input.tool;

      if (shouldCompress(String(filePath), content)) {
        const originalTokens = estimateTokens(content);
        const compressed = await compress(content, String(filePath));
        const compressedTokens = estimateTokens(compressed);

        // Substitui o resultado
        output.result = replaceContent(output.result, compressed);

        // Loga métrica
        safeLog(client, {
          level: "info",
          message: `context-compressor: ${filePath} ${originalTokens}→${compressedTokens} tokens (-${Math.round((1 - compressedTokens / originalTokens) * 100)}%)`,
          metadata: {
            file: filePath,
            originalTokens,
            compressedTokens,
            savedTokens: originalTokens - compressedTokens,
          },
        });
      }
    },
  };
};

function extractContent(result: unknown): string | null {
  if (typeof result === "string") return result;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return r.content;
    if (typeof r.output === "string") return r.output;
    if (typeof r.text === "string") return r.text;
    if (r.content && Array.isArray(r.content)) {
      return r.content
        .map((c: unknown) =>
          typeof c === "string" ? c : (c as Record<string, unknown>)?.text ?? "",
        )
        .join("\n");
    }
  }
  return null;
}

function replaceContent(result: unknown, newContent: string): unknown {
  if (typeof result === "string") return newContent;
  if (result && typeof result === "object") {
    const r = result as Record<string, unknown>;
    if (typeof r.content === "string") return { ...r, content: newContent };
    if (typeof r.output === "string") return { ...r, output: newContent };
    if (typeof r.text === "string") return { ...r, text: newContent };
  }
  return newContent;
}
