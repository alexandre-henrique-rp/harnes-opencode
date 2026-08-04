/**
 * git-automator.ts — Harness v6 tool
 *
 * Facilita o workflow git para agentes sem precisar de múltiplos comandos bash.
 * Validação defensiva de tipos em todos os parâmetros para evitar erros do tipo
 * "Cannot read properties of undefined (reading 'split')" quando o runtime do
 * opencode envia args com tipos inesperados.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";

type Action = "status" | "commit";

interface GitAutomatorArgs {
  action: Action;
  files?: string[];
  message?: string;
}

interface ExecContext {
  directory?: string;
}

export default tool({
  name: "git-automator",
  description: "Automatiza as ações de status e commit do Git de forma otimizada para os agentes.",
  args: {
    action: tool.schema.enum(["status", "commit"]).describe("Ação a ser realizada: 'status' lista as mudanças, 'commit' faz o commit."),
    files: tool.schema.array(tool.schema.string()).optional().describe("Arquivos para adicionar (apenas para a ação 'commit'). Ex: ['.']"),
    message: tool.schema.string().optional().describe("Mensagem de commit (obrigatório para 'commit')."),
  },
  async execute(rawArgs, rawContext) {
    // 1) Defesa contra args nulo/string/número — destructuring direto crasharia
    const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? rawArgs
      : {}) as Partial<GitAutomatorArgs>;

    // 2) Defesa contra context malformado
    const context = (rawContext && typeof rawContext === "object"
      ? rawContext
      : {}) as ExecContext;

    const action = typeof args.action === "string" ? args.action : "";
    const files = Array.isArray(args.files) ? args.files : [];
    const message = typeof args.message === "string" ? args.message : "";
    const cwd = typeof context.directory === "string" && context.directory.length > 0
      ? context.directory
      : process.cwd();

    try {
      if (action === "status") {
        const statusOutput = execSync("git status -s", { cwd }).toString();
        const branchOutput = execSync("git branch --show-current", { cwd }).toString().trim();
        return {
          success: true,
          branch: branchOutput,
          status: statusOutput || "Nenhuma mudança não salva.",
        };
      }

      if (action === "commit") {
        if (!message) {
          return { success: false, error: "Mensagem de commit é obrigatória." };
        }

        const filesToAdd = files.length > 0
          ? files.map((f) => `"${String(f).replace(/"/g, '\\"')}"`).join(" ")
          : ".";

        execSync(`git add ${filesToAdd}`, { cwd });
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });

        const sha = execSync("git rev-parse HEAD", { cwd }).toString().trim();
        return { success: true, sha, message: `Commit ${sha} realizado com sucesso.` };
      }

      return { success: false, error: `Ação não suportada: ${action || "(vazia)"}` };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `Erro na execução do git: ${errMsg}` };
    }
  },
});
