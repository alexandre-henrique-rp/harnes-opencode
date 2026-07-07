/**
 * ui-spec-manager.ts — Harness v6 tool
 *
 * Automatiza o bootstrap de arquivos de especificação de UI e diretórios de design assets.
 * Cria pastas e gera o esqueleto de ui-specs ou prompt de Stitch consolidado de forma determinística.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "ui-spec-manager",
  description:
    "Inicializa pastas de UI/Design e cria esqueletos de especificações de UI ou prompts consolidados para o Google Stitch MCP.",
  args: {
    feature: tool.schema
      .string()
      .describe("Nome da feature (kebab-case, ex: 'cadastro-usuario')"),
    projectName: tool.schema
      .string()
      .optional()
      .describe("Nome do projeto (kebab-case)"),
    hasLayout: tool.schema
      .boolean()
      .optional()
      .default(false)
      .describe("Se true, inicializa a pasta de assets físicos para layouts já definidos"),
    pages: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Lista de páginas envolvidas (se houver mais de uma, gera prompt consolidado único)"),
  },
  async execute({ feature, projectName = "projeto-harness", hasLayout = false, pages = [] }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const uiSpecsDir = path.join(harnessDir, "ui-specs");
    const designAssetsDir = path.join(harnessDir, "design", "assets");
    const templatePath = path.join(cwd, "templates", "UI-SPEC-TEMPLATE.md");
    const globalTemplatePath = path.join(__dirname, "..", "templates", "UI-SPEC-TEMPLATE.md");

    // 1. Cria diretórios
    if (!fs.existsSync(uiSpecsDir)) {
      fs.mkdirSync(uiSpecsDir, { recursive: true });
    }
    if (hasLayout && !fs.existsSync(designAssetsDir)) {
      fs.mkdirSync(designAssetsDir, { recursive: true });
    }

    const filesCreated: string[] = [];

    // 2. Carrega template de UI
    let templateContent = "";
    const activeTemplate = fs.existsSync(templatePath)
      ? templatePath
      : fs.existsSync(globalTemplatePath)
      ? globalTemplatePath
      : null;

    if (activeTemplate) {
      templateContent = fs.readFileSync(activeTemplate, "utf8");
    } else {
      // Fallback básico se o template não estiver disponível
      templateContent = `# UI SPEC — {{feature}}\n\n## 4.1 GOOGLE STITCH MCP - DESIGN TOKENS VARIABLES\n...`;
    }

    // 3. Substitui metadados básicos no template
    const processedTemplate = templateContent
      .replace(/\{\{feature\}\}/g, feature)
      .replace(/\{\{project\}\}/g, projectName)
      .replace(/\{\{createdAt\}\}/g, new Date().toISOString());

    // 4. Cenário: Múltiplas páginas -> Cria prompt consolidado
    if (pages.length > 1) {
      const promptFileName = `${feature}_mcp_prompt.md`;
      const promptFilePath = path.join(uiSpecsDir, promptFileName);

      let mcpPrompt = `# PROMPT CONSOLIDADO DE UI — ${feature.toUpperCase()}\n\n`;
      mcpPrompt += `Mapeamento de múltiplas telas de interface para processamento unificado no Google Stitch MCP.\n\n`;
      mcpPrompt += `## 1. DESIGN TOKENS GLOBAIS (COMUNS)\n\n`;
      mcpPrompt += `---\n\n## 2. INCORPORAÇÃO OBRIGATÓRIA DE SKILLS AUXILIARES NO PROMPT DO STITCH\n`;
      mcpPrompt += `> [!IMPORTANT]\n`;
      mcpPrompt += `> Leia e incorpore as regras estéticas do 'web-design-guidelines' e de formatação estrita do 'impeccable' no output final.\n\n`;
      mcpPrompt += `## 3. DETALHAMENTO DAS PÁGINAS PLANEJADAS\n\n`;

      pages.forEach((page, idx) => {
        mcpPrompt += `### PÁGINA ${idx + 1}: ${page.toUpperCase()}\n`;
        mcpPrompt += `- **Grid:** Desktop 12 colunas, Mobile 4 colunas.\n`;
        mcpPrompt += `- **Wireframe ASCII:** (Rascunhe o wireframe ASCII correspondente)\n\n`;
      });

      fs.writeFileSync(promptFilePath, mcpPrompt);
      filesCreated.push(path.relative(cwd, promptFilePath));
    }

    // 5. Salva a especificação física principal da feature
    const specFileName = `${feature}.md`;
    const specFilePath = path.join(uiSpecsDir, specFileName);

    fs.writeFileSync(specFilePath, processedTemplate);
    filesCreated.push(path.relative(cwd, specFilePath));

    return {
      success: true,
      feature,
      projectName,
      hasLayout,
      designAssetsDir: hasLayout ? path.relative(cwd, designAssetsDir) : null,
      uiSpecsDir: path.relative(cwd, uiSpecsDir),
      filesCreated,
      message: `Especificação de UI e pastas do Stitch MCP inicializadas com sucesso para a feature '${feature}'.`
    };
  },
});
