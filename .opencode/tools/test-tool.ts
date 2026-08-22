/**
 * test-tool.ts — Tool de teste para verificar se o tool() helper funciona
 */

import { tool } from "@opencode-ai/plugin";

export default tool({
  description: "Tool de teste simples para verificar se o tool() helper funciona",
  args: {
    message: tool.schema.string().optional().default("").describe("Mensagem para retornar"),
  },
  async execute(rawArgs: any) {
    const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, any>;
    const message = typeof args.message === "string" ? args.message : "Nenhuma mensagem fornecida";
    return { success: true, message: `Tool funcionando! Recebi: "${message}"` };
  },
});
