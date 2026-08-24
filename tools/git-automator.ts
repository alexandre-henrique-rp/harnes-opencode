/**
 * git-automator.ts — Harness v6 tool
 *
 * Facilita o workflow git para agentes sem precisar de múltiplos comandos bash.
 * Validação defensiva de tipos em todos os parâmetros para evitar erros do tipo
 * "Cannot read properties of undefined (reading 'split')" quando o runtime do
 * opencode envia args com tipos inesperados.
 *
 * Migração A4 (v6.5.0+): substituído execSync por runGit (safe-exec) — args
 * sempre como array, sem interpretacao de shell.
 */

import { tool } from "@opencode-ai/plugin";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";
import { runGit } from "./lib/safe-exec.ts";

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
        const statusRes = runGit(["status", "-s"], { cwd });
        if (!statusRes.ok) {
          return { success: false, error: `git status falhou: ${statusRes.stderr}` };
        }
        const branchRes = runGit(["branch", "--show-current"], { cwd });
        if (!branchRes.ok) {
          return { success: false, error: `git branch falhou: ${branchRes.stderr}` };
        }
        return {
          success: true,
          branch: branchRes.stdout.trim(),
          status: statusRes.stdout || "Nenhuma mudança não salva.",
        };
      }

      if (action === "commit") {
        if (!message) {
          return { success: false, error: "Mensagem de commit é obrigatória." };
        }

        // git add [files...] — args como array, sem shell
        const addArgs: string[] = files.length > 0
          ? ["add", ...files]
          : ["add", "-A"]; // "-A" é seguro aqui; é flag do git add, não shell

        const addRes = runGit(addArgs, { cwd });
        if (!addRes.ok) {
          return { success: false, error: `git add falhou: ${addRes.stderr}` };
        }

        // git commit -m <msg> — msg é um único arg, não concatenado
        const commitRes = runGit(["commit", "-m", message], { cwd });
        if (!commitRes.ok) {
          return { success: false, error: `git commit falhou: ${commitRes.stderr}` };
        }

        const shaRes = runGit(["rev-parse", "HEAD"], { cwd });
        if (!shaRes.ok) {
          return { success: false, error: `git rev-parse falhou: ${shaRes.stderr}` };
        }
        const sha = shaRes.stdout.trim();
        return { success: true, sha, message: `Commit ${sha} realizado com sucesso.` };
      }

      return { success: false, error: `Ação não suportada: ${action || "(vazia)"}` };
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return { success: false, error: `Erro na execução do git: ${errMsg}` };
    }
  },
});
