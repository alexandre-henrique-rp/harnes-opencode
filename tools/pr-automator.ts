/**
 * pr-automator.ts — Harness v6 tool
 *
 * Captura o diff da branch atual em relação à main/master e gera um esqueleto rico para o Pull Request.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

export default tool({
  name: "pr-automator",
  description: "Gera um resumo de Pull Request baseado nas diferenças (diff) com a branch principal.",
  args: {
    baseBranch: tool.schema.string().optional().default("main").describe("A branch base contra qual comparar (ex: main, master)"),
    sprintId: tool.schema.string().optional().describe("ID da sprint para adicionar contexto"),
  },
  async execute({ baseBranch = "main", sprintId }, context) {
    const cwd = context?.directory || process.cwd();

    try {
      // 1. Obtém a branch atual
      const currentBranch = execSync("git branch --show-current", { cwd }).toString().trim();
      
      if (currentBranch === baseBranch) {
        return { success: false, error: `Você já está na branch base (${baseBranch}).` };
      }

      // 2. Tenta fazer git fetch para atualizar as referências
      try {
        execSync("git fetch", { cwd });
      } catch (e) {}

      // 3. Pega as estatísticas de diff
      let diffStat = "";
      let diffLog = "";
      try {
        diffStat = execSync(`git diff --stat origin/${baseBranch}...HEAD`, { cwd }).toString();
        diffLog = execSync(`git log origin/${baseBranch}...HEAD --pretty=format:'- %s'`, { cwd }).toString();
      } catch (e) {
        // Fallback local se não tiver origin
        diffStat = execSync(`git diff --stat ${baseBranch}...HEAD`, { cwd }).toString();
        diffLog = execSync(`git log ${baseBranch}...HEAD --pretty=format:'- %s'`, { cwd }).toString();
      }

      let prContext = `## Contexto\n\n- **Sprint:** ${sprintId || "Não informada"}\n`;
      prContext += `- **Branch Base:** \`${baseBranch}\`\n`;
      prContext += `- **Branch de Feature:** \`${currentBranch}\`\n\n`;

      let prBody = `# Pull Request Resumo\n\n${prContext}`;
      prBody += `## Commits Incluídos\n${diffLog}\n\n`;
      prBody += `## Arquivos Alterados\n\`\`\`text\n${diffStat}\n\`\`\`\n\n`;
      prBody += `## Instruções para Revisão\n1. Verificar aderência aos requisitos.\n2. Confirmar cobertura de testes.\n`;

      // Salva num arquivo para referência do agente ou uso humano
      const prFile = path.join(cwd, ".harness", "PR_DRAFT.md");
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
