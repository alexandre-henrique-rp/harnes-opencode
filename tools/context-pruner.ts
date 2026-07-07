/**
 * context-pruner.ts — Harness v6 tool
 *
 * Gera versões "esqueleto" (apenas assinaturas e declarações de tipo) de arquivos de código
 * (TypeScript, JavaScript) na pasta temporária `.harness/temp-context/`.
 * Isso oculta implementações complexas e reduz drasticamente o tamanho do contexto da IA.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "context-pruner",
  description:
    "Gera a assinatura/esqueleto de um arquivo de codigo TypeScript/JavaScript para economizar janela de contexto da IA.",
  args: {
    sourceFile: tool.schema
      .string()
      .describe("Caminho absoluto ou relativo para o arquivo de codigo-fonte original"),
  },
  async execute({ sourceFile }, context) {
    const cwd = context?.directory || process.cwd();
    const fullSourcePath = path.isAbsolute(sourceFile) ? sourceFile : path.join(cwd, sourceFile);

    if (!fs.existsSync(fullSourcePath)) {
      return {
        success: false,
        error: `Arquivo de origem '${sourceFile}' nao encontrado.`,
      };
    }

    const content = fs.readFileSync(fullSourcePath, "utf8");
    const extension = path.extname(fullSourcePath);

    let prunedContent = "";

    if ([".ts", ".tsx", ".js", ".jsx"].includes(extension)) {
      prunedContent = pruneJsTsCode(content);
    } else {
      // Se não for arquivo JS/TS, apenas copia as primeiras 50 linhas como fallback de contexto
      const lines = content.split("\n");
      prunedContent = lines.slice(0, 50).join("\n") + "\n\n// ... restante do arquivo ocultado para economizar contexto ...";
    }

    const harnessTempDir = path.join(cwd, ".harness", "temp-context");
    const relativePath = path.relative(cwd, fullSourcePath);
    const destPath = path.join(harnessTempDir, relativePath);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, prunedContent);

    return {
      success: true,
      originalPath: sourceFile,
      prunedPath: path.relative(cwd, destPath),
      linesOriginal: content.split("\n").length,
      linesPruned: prunedContent.split("\n").length,
    };
  },
});

/**
 * Prune código TypeScript/JavaScript para extrair assinaturas públicas, tipos e interfaces
 * ocultando o corpo das funções.
 */
function pruneJsTsCode(code: string): string {
  const lines = code.split("\n");
  const prunedLines: string[] = [];
  let inFunction = false;
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Se estivermos dentro do corpo de uma função a ser podada
    if (inFunction) {
      // Conta abertura e fechamento de chaves
      const openMatches = (line.match(/{/g) || []).length;
      const closeMatches = (line.match(/}/g) || []).length;
      braceCount += openMatches - closeMatches;

      if (braceCount <= 0) {
        // Encontrou o fim do bloco
        prunedLines.push(line.replace(/.*}/, "  }")); // fecha o bloco
        inFunction = false;
        braceCount = 0;
      }
      continue;
    }

    // Identifica declaração de classes, funções ou métodos que abrem com chave
    const isExportOrMethod =
      trimmed.startsWith("export ") ||
      trimmed.startsWith("class ") ||
      trimmed.startsWith("interface ") ||
      trimmed.startsWith("type ") ||
      (trimmed.includes("(") && trimmed.endsWith("{")) ||
      (trimmed.startsWith("public ") || trimmed.startsWith("private ") || trimmed.startsWith("static "));

    if (isExportOrMethod && trimmed.includes("function") || (trimmed.includes("(") && trimmed.endsWith("{"))) {
      const header = line.substring(0, line.indexOf("{"));
      prunedLines.push(`${header}{ /* ... codigo omitido para economia de contexto ... */ }`);
      
      // Se a declaração abrir e fechar na mesma linha
      if (trimmed.endsWith("}")) {
        continue;
      }

      // Se abrir chave e continuar na próxima linha, inicia o skip de linhas
      inFunction = true;
      braceCount = 1;
      continue;
    }

    // Se for comentário, importação, tipo ou interface (não-função) adiciona normalmente
    prunedLines.push(line);
  }

  return prunedLines.join("\n");
}
