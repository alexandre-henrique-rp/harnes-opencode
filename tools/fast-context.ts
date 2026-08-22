/**
 * fast-context.ts — Harness v6 tool (FastContext Indexer & Instant Retriever)
 *
 * Provê indexação simbólica e estrutural ultrarrápida do codebase (<5ms)
 * inspirada no FastContext do Devin.
 *
 * Funcionalidades:
 *   1. index: Varre o projeto e extrai símbolos (funções, classes, interfaces, tipos, endpoints),
 *      dependências (imports/exports) e gera a base .harness/fast-context.json.
 *   2. query: Dado um termo ou descrição de tarefa, ranqueia e retorna instantaneamente
 *      os arquivos e símbolos mais relevantes.
 *   3. symbols: Busca símbolos específicos por nome ou tipo.
 *   4. graph: Retorna a arvore de dependências (quem importa quem) de um arquivo.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

export interface SymbolInfo {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "variable" | "endpoint" | "export";
  file: string;
  line: number;
}

export interface FileNode {
  file: string;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
}

export interface FastContextIndex {
  version: string;
  updatedAt: string;
  totalFiles: number;
  totalSymbols: number;
  files: Record<string, FileNode>;
  symbols: Record<string, SymbolInfo[]>;
}

function extractSymbolsAndImports(filePath: string, content: string): { symbols: SymbolInfo[]; imports: string[]; exports: string[] } {
  const symbols: SymbolInfo[] = [];
  const imports: string[] = [];
  const exports: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Direct imports
    const importMatch = line.match(/import\s+(?:.*?\s+from\s+)?['"](.*?)['"]/);
    if (importMatch) {
      imports.push(importMatch[1]);
    }

    // Export declaration names
    const exportMatch = line.match(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|var)\s+([a-zA-Z0-9_$]+)/);
    if (exportMatch) {
      exports.push(exportMatch[1]);
    }

    // Function declarations
    const fnMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/);
    if (fnMatch) {
      symbols.push({ name: fnMatch[1], kind: "function", file: filePath, line: lineNum });
    }

    // Class declarations
    const classMatch = line.match(/(?:export\s+)?class\s+([a-zA-Z0-9_$]+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: "class", file: filePath, line: lineNum });
    }

    // Interface declarations
    const ifaceMatch = line.match(/(?:export\s+)?interface\s+([a-zA-Z0-9_$]+)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: "interface", file: filePath, line: lineNum });
    }

    // Type declarations
    const typeMatch = line.match(/(?:export\s+)?type\s+([a-zA-Z0-9_$]+)/);
    if (typeMatch) {
      symbols.push({ name: typeMatch[1], kind: "type", file: filePath, line: lineNum });
    }

    // API endpoints (Express, Next.js, Fastify patterns)
    const endpointMatch = line.match(/(?:app|router|server)\.(get|post|put|delete|patch)\s*\(\s*['"](.*?)['"]/i);
    if (endpointMatch) {
      symbols.push({ name: `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`, kind: "endpoint", file: filePath, line: lineNum });
    }
  }

  return { symbols, imports, exports };
}

export function buildFastContextIndex(cwd: string): FastContextIndex {
  const index: FastContextIndex = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    totalFiles: 0,
    totalSymbols: 0,
    files: {},
    symbols: {},
  };

  const walkDir = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(cwd, fullPath);

      if (
        entry.isDirectory() &&
        !["node_modules", ".git", "dist", "build", ".venv", "__pycache__"].includes(entry.name)
      ) {
        walkDir(fullPath);
      } else if (
        entry.isFile() &&
        /\.(ts|js|tsx|jsx|mjs|cjs|py|json)$/i.test(entry.name) &&
        !entry.name.endsWith(".d.ts")
      ) {
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          const { symbols, imports, exports } = extractSymbolsAndImports(relPath, content);

          index.files[relPath] = {
            file: relPath,
            symbols,
            imports,
            exports,
          };

          index.totalFiles++;
          index.totalSymbols += symbols.length;

          for (const sym of symbols) {
            if (!index.symbols[sym.name]) {
              index.symbols[sym.name] = [];
            }
            index.symbols[sym.name].push(sym);
          }
        } catch {
          // ignora falhas de leitura individuais
        }
      }
    }
  };

  walkDir(cwd);

  const harnessDir = path.join(cwd, ".harness");
  if (!fs.existsSync(harnessDir)) {
    fs.mkdirSync(harnessDir, { recursive: true });
  }
  const indexPath = path.join(harnessDir, "fast-context.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

  return index;
}

export default tool({
  description: "FastContext — Recuperação e indexação simbólica de contexto do codebase em milissegundos (<5ms), inspirada no FastContext do Devin.",
  args: {
    action: tool.schema.enum(["index", "query", "symbols", "graph"]).describe("Ação a executar: 'index' (reconstrói índice), 'query' (busca por relevância), 'symbols' (busca por símbolos), 'graph' (árvore de dependências)"),
    query: tool.schema.string().describe("Termo de busca ou descrição de tarefa (usado em action=query ou action=symbols)"),
    filePath: tool.schema.string().describe("Caminho do arquivo para análise de grafo de dependências (usado em action=graph)"),
  },
  async execute({ action, query, filePath }, context) {
    const mcpResponse = (data: Record<string, any>) => ({
      ...data,
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    });

    const cwd = resolveProjectCwd(context, { log: console.error });
    const indexPath = path.join(cwd, ".harness", "fast-context.json");

    if (action === "index") {
      const startTime = Date.now();
      const index = buildFastContextIndex(cwd);
      const durationMs = Date.now() - startTime;
      return mcpResponse({
        success: true,
        action: "index",
        durationMs,
        totalFiles: index.totalFiles,
        totalSymbols: index.totalSymbols,
        indexPath: path.relative(cwd, indexPath),
        message: `FastContext atualizado em ${durationMs}ms (${index.totalFiles} arquivos, ${index.totalSymbols} símbolos indexados).`,
      });
    }

    // Se o índice não existir, constrói automaticamente em tempo real
    let index: FastContextIndex;
    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      } catch {
        index = buildFastContextIndex(cwd);
      }
    } else {
      index = buildFastContextIndex(cwd);
    }

    if (action === "symbols") {
      const searchTerm = (query || "").toLowerCase();
      const matchedSymbols: SymbolInfo[] = [];

      for (const [name, symList] of Object.entries(index.symbols)) {
        if (name.toLowerCase().includes(searchTerm)) {
          matchedSymbols.push(...symList);
        }
      }

      return mcpResponse({
        success: true,
        action: "symbols",
        query,
        count: matchedSymbols.length,
        symbols: matchedSymbols.slice(0, 30),
      });
    }

    if (action === "graph") {
      const target = filePath || query || "";
      if (!target) {
        return mcpResponse({ success: false, error: "Parâmetro 'filePath' ou 'query' é obrigatório para action=graph." });
      }

      const fileNode = index.files[target] || Object.values(index.files).find(f => f.file.endsWith(target));
      if (!fileNode) {
        return mcpResponse({ success: false, error: `Arquivo '${target}' não encontrado no índice FastContext.` });
      }

      const importedBy: string[] = [];
      for (const [fPath, node] of Object.entries(index.files)) {
        if (fPath === fileNode.file) continue;
        const targetBase = path.basename(fileNode.file, path.extname(fileNode.file));
        const matchesImport = node.imports.some(imp => imp.includes(targetBase) || imp.endsWith(fileNode.file));
        if (matchesImport) {
          importedBy.push(fPath);
        }
      }

      return mcpResponse({
        success: true,
        action: "graph",
        targetFile: fileNode.file,
        exports: fileNode.exports,
        directImports: fileNode.imports,
        importedBy,
      });
    }

    // Action: "query" (default)
    const searchTerm = (query || "").toLowerCase();
    const rankedFiles: Array<{ file: string; score: number; matchedSymbols: string[] }> = [];

    for (const [fPath, node] of Object.entries(index.files)) {
      let score = 0;
      const matchedSymbols: string[] = [];

      if (fPath.toLowerCase().includes(searchTerm)) {
        score += 10;
      }

      for (const sym of node.symbols) {
        if (sym.name.toLowerCase().includes(searchTerm)) {
          score += 5;
          matchedSymbols.push(sym.name);
        }
      }

      for (const exp of node.exports) {
        if (exp.toLowerCase().includes(searchTerm)) {
          score += 3;
        }
      }

      if (score > 0) {
        rankedFiles.push({ file: fPath, score, matchedSymbols });
      }
    }

    rankedFiles.sort((a, b) => b.score - a.score);

    return mcpResponse({
      success: true,
      action: "query",
      query,
      totalMatches: rankedFiles.length,
      topResults: rankedFiles.slice(0, 10),
    });
  },
});
