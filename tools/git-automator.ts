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
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

export default tool({
  description: "Automatiza as ações de status e commit do Git de forma otimizada para os agentes.",
  args: {
    action: tool.schema.enum(["status", "commit"]).optional().default("status").describe("Ação a ser realizada: 'status' lista as mudanças, 'commit' faz o commit."),
    files: tool.schema.string().optional().default("").describe("Arquivos para adicionar (apenas para a ação 'commit'), separados por vírgula. Ex: '.', ou 'src/index.ts, src/app.ts'"),
    message: tool.schema.string().optional().default("").describe("Mensagem de commit (obrigatório para 'commit')."),
  },
  async execute(rawArgs: any, rawContext: any) {
    // 1) Defesa contra args nulo/string/número — destructuring direto crasharia
    const args = (rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? rawArgs
      : {}) as Record<string, any>;

    // 2) Defesa contra context malformado
    const context = (rawContext && typeof rawContext === "object"
      ? rawContext
      : {}) as Record<string, any>;

    const action = typeof args.action === "string" ? args.action : "";
    const filesRaw = args.files;
    const files = typeof filesRaw === "string" && filesRaw.trim() !== "" 
      ? filesRaw.split(",").map((f: string) => f.trim()).filter(Boolean)
      : [];
    const message = typeof args.message === "string" ? args.message : "";
    const cwd = resolveProjectCwd(context, { log: console.error });

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
          ? files.map((f: string) => `"${f.replace(/"/g, '\\"')}"`).join(" ")
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
