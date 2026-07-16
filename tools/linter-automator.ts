/**
 * linter-automator.ts — Harness v6 tool
 *
 * Facilita a execução de verificadores de lint e formatação de código, retornando resultados acionáveis para o agente corrigir.
 */

import { tool } from "@opencode-ai/plugin";
import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);

export default tool({
  name: "linter-automator",
  description: "Executa scripts de lint ou formatação (ex: npm run lint) e retorna os resultados para o agente.",
  args: {
    command: tool.schema.string().optional().default("npm run lint").describe("O comando para rodar o linter, padrão: 'npm run lint'"),
    autoFix: tool.schema.boolean().optional().default(false).describe("Se true, tenta adicionar flags de fix automático dependendo da tecnologia"),
  },
  async execute({ command = "npm run lint", autoFix = false }, context) {
    const cwd = context?.directory || process.cwd();

    let finalCommand = command;
    if (autoFix) {
      if (command.includes("npm run") && !command.includes("-- --fix")) {
        // Ex: "npm run lint" -> "npm run lint -- --fix"
        finalCommand = `${command} -- --fix`;
      } else if (command.startsWith("eslint ") && !command.includes("--fix")) {
        finalCommand = `${command} --fix`;
      }
    }

    try {
      const { stdout, stderr } = await execAsync(finalCommand, { cwd });
      return {
        success: true,
        message: "Linter executado com sucesso (nenhum erro encontrado).",
        output: stdout.trim() || stderr.trim() || "Nenhuma saída."
      };
    } catch (e: any) {
      // Se houver erro de exit code != 0, o linter reprovou
      return {
        success: false,
        error: "Linter encontrou problemas de formatação ou código.",
        output: (e.stdout || e.stderr || e.message).trim()
      };
    }
  },
});
