/**
 * docs-sync.ts — Harness v6 tool
 *
 * Varre o código em busca de atualizações recentes e sugere/realiza alterações nos arquivos centrais de documentação técnica.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "docs-sync",
  description: "Sincroniza um resumo das últimas mudanças de código com a documentação (ex: README.md, ARCH.md).",
  args: {
    docsTarget: tool.schema.string().optional().default("README.md").describe("Qual arquivo de doc atualizar (ex: 'README.md')"),
    summaryText: tool.schema.string().describe("Resumo das funcionalidades ou mudanças recém-adicionadas para incluir na doc."),
  },
  async execute({ docsTarget = "README.md", summaryText }, context) {
    const cwd = context?.directory || process.cwd();
    const docPath = path.join(cwd, docsTarget);

    if (!fs.existsSync(docPath)) {
      return { success: false, error: `Arquivo ${docsTarget} não encontrado no diretório atual.` };
    }

    try {
      let content = fs.readFileSync(docPath, "utf8");

      // Tenta encontrar uma seção "## Últimas Atualizações" ou equivalente
      const updateSectionRegex = /## Últimas Atualizações/i;
      
      if (updateSectionRegex.test(content)) {
        content = content.replace(
          updateSectionRegex,
          `## Últimas Atualizações\n\n- ${new Date().toISOString().split("T")[0]}: ${summaryText}\n`
        );
      } else {
        // Adiciona ao final se a seção não existir
        content += `\n\n## Últimas Atualizações\n\n- ${new Date().toISOString().split("T")[0]}: ${summaryText}\n`;
      }

      fs.writeFileSync(docPath, content);

      return {
        success: true,
        message: `${docsTarget} sincronizado com sucesso com as novas mudanças.`
      };
    } catch (e: any) {
      return { success: false, error: `Erro ao sincronizar docs: ${e.message}` };
    }
  },
});
