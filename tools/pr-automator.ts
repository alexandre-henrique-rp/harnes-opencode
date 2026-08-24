/**
 * pr-automator.ts — Harness v6 tool
 *
 * Captura o diff da branch atual em relação à main/master e gera um esqueleto rico para o Pull Request.
 *
 * Migração A4 (v6.5.0+): substituído execSync por runGit (safe-exec) — args
 * sempre como array, sem interpretacao de shell.
 */

import { tool } from "@opencode-ai/plugin";
import * as path from "path";
import * as fs from "fs";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";
import { runGit } from "./lib/safe-exec.ts";

export default tool({
  description: "Gera um resumo de Pull Request baseado nas diferenças (diff) com a branch principal.",
  args: {
    baseBranch: tool.schema.string().describe("A branch base contra qual comparar (ex: main, master)"),
    sprintId: tool.schema.string().describe("ID da sprint para adicionar contexto"),
  },
  async execute({ baseBranch = "main", sprintId }, context) {
    let cwd = resolveProjectCwd(context, { log: console.error });
    let searchCwd = cwd;
    let harnessDir = path.join(searchCwd, ".harness");
    while (!fs.existsSync(harnessDir) && searchCwd !== path.parse(searchCwd).root) {
      searchCwd = path.dirname(searchCwd);
      harnessDir = path.join(searchCwd, ".harness");
    }

    try {
      // 1. Obtém a branch atual
      const branchRes = runGit(["branch", "--show-current"], { cwd });
      if (!branchRes.ok) {
        return { success: false, error: `git branch falhou: ${branchRes.stderr}` };
      }
      const currentBranch = branchRes.stdout.trim();

      if (currentBranch === baseBranch) {
        return { success: false, error: `Você já está na branch base (${baseBranch}).` };
      }

      // 2. Tenta fazer git fetch para atualizar as referências (best-effort)
      runGit(["fetch"], { cwd, silentStderr: true });

      // 3. Pega as estatísticas de diff
      let diffStat = "";
      let diffLog = "";
      const originStat = runGit(["diff", "--stat", `origin/${baseBranch}...HEAD`], { cwd });
      const originLog = runGit(["log", `origin/${baseBranch}...HEAD`, "--pretty=format:- %s"], { cwd });
      if (originStat.ok && originLog.ok) {
        diffStat = originStat.stdout;
        diffLog = originLog.stdout;
      } else {
        // Fallback local se não tiver origin
        const localStat = runGit(["diff", "--stat", `${baseBranch}...HEAD`], { cwd });
        const localLog = runGit(["log", `${baseBranch}...HEAD`, "--pretty=format:- %s"], { cwd });
        diffStat = localStat.stdout;
        diffLog = localLog.stdout;
      }

      let prContext = `## Contexto\n\n- **Sprint:** ${sprintId || "Não informada"}\n`;
      prContext += `- **Branch Base:** \`${baseBranch}\`\n`;
      prContext += `- **Branch de Feature:** \`${currentBranch}\`\n\n`;

      let prBody = `# Pull Request Resumo\n\n${prContext}`;
      prBody += `## Commits Incluídos\n${diffLog}\n\n`;
      prBody += `## Arquivos Alterados\n\`\`\`text\n${diffStat}\n\`\`\`\n\n`;
      prBody += `## Instruções para Revisão\n1. Verificar aderência aos requisitos.\n2. Confirmar cobertura de testes.\n`;

      // Salva num arquivo para referência do agente ou uso humano
      const prFile = path.join(harnessDir, "PR_DRAFT.md");
      fs.writeFileSync(prFile, prBody);

      return {
        success: true,
        message: `Rascunho de Pull Request gerado em .harness/PR_DRAFT.md`,
        prDraft: prBody
      };
    } catch (e: any) {
      return { success: false, error: `Erro ao gerar PR draft: ${e.message}` };
    }
  },
});
