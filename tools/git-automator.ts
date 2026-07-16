/**
 * git-automator.ts — Harness v6 tool
 *
 * Facilita o workflow git para agentes sem precisar de múltiplos comandos bash.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";

export default tool({
  name: "git-automator",
  description: "Automatiza as ações de status e commit do Git de forma otimizada para os agentes.",
  args: {
    action: tool.schema.enum(["status", "commit"]).describe("Ação a ser realizada: 'status' lista as mudanças, 'commit' faz o commit."),
    files: tool.schema.array(tool.schema.string()).optional().describe("Arquivos para adicionar (apenas para a ação 'commit'). Ex: ['.']"),
    message: tool.schema.string().optional().describe("Mensagem de commit (obrigatório para 'commit')."),
  },
  async execute({ action, files, message }, context) {
    const cwd = context?.directory || process.cwd();

    try {
      if (action === "status") {
        const status = execSync("git status -s", { cwd }).toString();
        const branch = execSync("git branch --show-current", { cwd }).toString().trim();
        return { success: true, branch, status: status || "Nenhuma mudança não salva." };
      }

      if (action === "commit") {
        if (!message) {
          return { success: false, error: "Mensagem de commit é obrigatória." };
        }
        
        const filesToAdd = files && files.length > 0 ? files.map(f => `"${f}"`).join(" ") : ".";
        
        execSync(`git add ${filesToAdd}`, { cwd });
        execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd });
        
        const sha = execSync("git rev-parse HEAD", { cwd }).toString().trim();
        return { success: true, sha, message: `Commit ${sha} realizado com sucesso.` };
      }

      return { success: false, error: "Ação não suportada." };
    } catch (e: any) {
      return { success: false, error: `Erro na execução do git: ${e.message}` };
    }
  },
});
