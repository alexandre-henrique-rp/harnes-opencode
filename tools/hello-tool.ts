/**
 * hello-tool.ts — Tool de teste para verificar se OpenCode carrega tools de .opencode/tools/
 */

import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Tool de teste simples - verifica se OpenCode carrega tools de .opencode/tools/",
  args: {
    nome: tool.schema.string().describe("Nome para cumprimentar"),
  },
  async execute(rawArgs: any) {
    const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, any>;
    const nome = typeof args.nome === "string" ? args.nome : "Mundo";
    return `Olá, ${nome}! Tool carregada de .opencode/tools/ funcionando!`;
  },
});
