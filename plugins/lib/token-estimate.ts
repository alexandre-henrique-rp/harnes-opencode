/**
 * token-estimate.ts
 *
 * Estimativa de tokens compartilhada pelos plugins.
 *
 * Heurística: ~3 chars por token para conteúdo misto (código + EN + PT).
 * Mais preciso que 4 (EN puro) e mais otimista que 2.5 (PT puro).
 *
 * Para precisão exata, usar tiktoken ou provider-specific tokenizer,
 * mas para os fins do harness (decisões de threshold), esta estimativa
 * é suficiente e zero-custo.
 */

export function estimateTokens(input: unknown): number {
  const str = typeof input === "string" ? input : JSON.stringify(input);
  if (!str) return 0;
  return Math.ceil(str.length / 3);
}
