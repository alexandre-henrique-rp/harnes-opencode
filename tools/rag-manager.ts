/**
 * rag-manager.ts — Harness v6.5.0 tool
 *
 * Gerencia o RAG (Retrieval-Augmented Generation) local e global.
 *
 * Actions:
 *   - validate: Valida estrutura YAML e 7 seções de cada doc
 *   - rebuild_index: Regenera RAG/index.json local + atualiza SQLite global com FTS5
 *   - search: Busca semântica por texto em todos os docs (usa FTS5)
 *   - get: Retorna documento completo por ID
 *   - list: Lista docs por categoria/prioridade/status
 */

import { tool } from "@opencode-ai/plugin";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseYamlFrontmatter(content: string): any {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const meta: any = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.substring(0, colonIdx).trim();
    const val = line
      .substring(colonIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key) meta[key] = val;
  }
  return meta;
}

function extractContentBody(content: string): string {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1].trim() : content;
}

function getGlobalTrainingDir(): string {
  return path.join(
    process.env.HOME || process.env.USERPROFILE || "~",
    ".config",
    "opencode",
    "training",
  );
}

function getDbPath(): string {
  return path.join(getGlobalTrainingDir(), "rag.db");
}

function escape(str: string): string {
  return (str || "").replace(/'/g, "''");
}

// ─── Database Schema ─────────────────────────────────────────────────────────

const SCHEMA_SQL = `
PRAGMA journal_mode=WAL;
PRAGMA busy_timeout=5000;

CREATE TABLE IF NOT EXISTS rag_docs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  category TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'approved',
  scope TEXT DEFAULT 'global',
  tags TEXT DEFAULT '[]',
  file_path TEXT,
  updated_at TEXT
);

-- FTS5 para busca full-text eficiente
DROP TABLE IF EXISTS rag_fts;
CREATE VIRTUAL TABLE rag_fts USING fts5(
  id,
  title,
  summary,
  content,
  tags,
  content=rag_docs,
  content_rowid=rowid
);

-- Triggers para manter FTS sincronizado com a tabela principal
DROP TRIGGER IF EXISTS rag_docs_ai;
CREATE TRIGGER rag_docs_ai AFTER INSERT ON rag_docs BEGIN
  INSERT INTO rag_fts(rowid, id, title, summary, content, tags)
  VALUES (new.rowid, new.id, new.title, new.summary, new.content, new.tags);
END;

DROP TRIGGER IF EXISTS rag_docs_ad;
CREATE TRIGGER rag_docs_ad AFTER DELETE ON rag_docs BEGIN
  INSERT INTO rag_fts(rag_fts, rowid, id, title, summary, content, tags)
  VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.content, old.tags);
END;

DROP TRIGGER IF EXISTS rag_docs_au;
CREATE TRIGGER rag_docs_au AFTER UPDATE ON rag_docs BEGIN
  INSERT INTO rag_fts(rag_fts, rowid, id, title, summary, content, tags)
  VALUES ('delete', old.rowid, old.id, old.title, old.summary, old.content, old.tags);
  INSERT INTO rag_fts(rowid, id, title, summary, content, tags)
  VALUES (new.rowid, new.id, new.title, new.summary, new.content, new.tags);
END;
`;

// ─── Core Functions ──────────────────────────────────────────────────────────

function ensureSchema(dbPath: string): void {
  execFileSync("sqlite3", [dbPath], { input: SCHEMA_SQL, timeout: 10000 });
}

function indexDocument(
  dbPath: string,
  doc: {
    id: string;
    title: string;
    summary: string;
    content: string;
    category: string;
    priority: string;
    status: string;
    scope: string;
    tags: string;
    file_path: string;
    updated_at: string;
  },
): void {
  const sql = `
    INSERT OR REPLACE INTO rag_docs (id, title, summary, content, category, priority, status, scope, tags, file_path, updated_at)
    VALUES (
      '${escape(doc.id)}',
      '${escape(doc.title)}',
      '${escape(doc.summary)}',
      '${escape(doc.content)}',
      '${escape(doc.category)}',
      '${escape(doc.priority)}',
      '${escape(doc.status)}',
      '${escape(doc.scope)}',
      '${escape(doc.tags)}',
      '${escape(doc.file_path)}',
      '${escape(doc.updated_at)}'
    );
  `;
  execFileSync("sqlite3", [dbPath], { input: sql, timeout: 5000 });
}

function searchFts(dbPath: string, query: string, limit: number = 10): any[] {
  const sanitizedQuery = query.replace(/['"]/g, " ").trim();
  // FTS5 match query — usar termos simples com OR implícito
  const ftsQuery = sanitizedQuery
    .split(/\s+/)
    .map((t) => `"${t}"`)
    .join(" OR ");

  const sql = `
    SELECT d.id, d.title, d.summary, d.category, d.priority, d.file_path,
           snippet(rag_fts, 3, '>>>', '<<<', '...', 40) as snippet
    FROM rag_fts f
    JOIN rag_docs d ON d.id = f.id
    WHERE rag_fts MATCH '${escape(ftsQuery)}'
    ORDER BY rank
    LIMIT ${limit};
  `;

  try {
    const result = execFileSync("sqlite3", ["-json", dbPath], {
      input: sql,
      timeout: 5000,
      encoding: "utf8",
    });
    return result.trim() ? JSON.parse(result) : [];
  } catch (e) {
    return [];
  }
}

function getDocById(dbPath: string, id: string): any | null {
  const sql = `SELECT * FROM rag_docs WHERE id = '${escape(id)}' LIMIT 1;`;
  try {
    const result = execFileSync("sqlite3", ["-json", dbPath], {
      input: sql,
      timeout: 5000,
      encoding: "utf8",
    });
    const rows = result.trim() ? JSON.parse(result) : [];
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

function listDocs(
  dbPath: string,
  filters: { category?: string; priority?: string; status?: string },
): any[] {
  const conditions: string[] = [];
  if (filters.category)
    conditions.push(`category = '${escape(filters.category)}'`);
  if (filters.priority)
    conditions.push(`priority = '${escape(filters.priority)}'`);
  if (filters.status) conditions.push(`status = '${escape(filters.status)}'`);

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT id, title, summary, category, priority, status, scope, updated_at FROM rag_docs ${where} ORDER BY priority DESC, updated_at DESC;`;

  try {
    const result = execFileSync("sqlite3", ["-json", dbPath], {
      input: sql,
      timeout: 5000,
      encoding: "utf8",
    });
    return result.trim() ? JSON.parse(result) : [];
  } catch {
    return [];
  }
}

function processRagFile(filePath: string): any | null {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const meta = parseYamlFrontmatter(content);
    if (!meta) return null;

    const body = extractContentBody(content);
    const docId = meta.id || path.basename(filePath, ".md");

    return {
      id: docId,
      title: meta.title || docId,
      summary: meta.summary || meta.description || "Sem resumo disponível.",
      content: body.substring(0, 50000), // limitar a 50K chars
      category: meta.category || "general",
      priority: meta.priority || "medium",
      status: meta.status || "approved",
      scope: meta.scope || "global",
      tags: meta.tags
        ? typeof meta.tags === "string"
          ? meta.tags
          : JSON.stringify(meta.tags)
        : "[]",
      file_path: filePath,
      updated_at: meta.updatedAt || meta.updated_at || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

export default tool({
  description:
    "Gerencia documentos RAG: valida, indexa com FTS5, busca semântica, lista e recupera docs por ID.",
  args: {
    action: tool.schema.enum([
      "validate",
      "rebuild_index",
      "search",
      "get",
      "list",
    ]),
    query: tool.schema
      .string()
      .optional()
      .describe("Texto de busca (action=search)"),
    id: tool.schema
      .string()
      .optional()
      .describe("ID do documento (action=get)"),
    category: tool.schema
      .string()
      .optional()
      .describe("Filtro por categoria (action=list)"),
    priority: tool.schema
      .string()
      .optional()
      .describe("Filtro por prioridade (action=list)"),
    limit: tool.schema
      .number()
      .optional()
      .describe("Máximo de resultados (action=search, default 10)"),
  },
  async execute({ action, query, id, category, priority, limit }, context) {
    const cwd = resolveProjectCwd(context, { log: console.error });
    const dbPath = getDbPath();
    const globalTrainingDir = getGlobalTrainingDir();

    // ─── ACTION: search ────────────────────────────────────────────────
    if (action === "search") {
      if (!query)
        return {
          success: false,
          error: "Parâmetro 'query' obrigatório para action=search.",
        };
      if (!fs.existsSync(dbPath)) {
        return {
          success: false,
          error: "rag.db não encontrado. Rode action=rebuild_index primeiro.",
        };
      }
      const results = searchFts(dbPath, query, limit || 10);
      return {
        success: true,
        action: "search",
        query,
        resultsCount: results.length,
        results,
      };
    }

    // ─── ACTION: get ───────────────────────────────────────────────────
    if (action === "get") {
      if (!id)
        return {
          success: false,
          error: "Parâmetro 'id' obrigatório para action=get.",
        };
      if (!fs.existsSync(dbPath)) {
        return {
          success: false,
          error: "rag.db não encontrado. Rode action=rebuild_index primeiro.",
        };
      }
      const doc = getDocById(dbPath, id);
      if (!doc)
        return { success: false, error: `Documento '${id}' não encontrado.` };

      // Se o file_path existe, retorna o conteúdo completo do arquivo
      let fullContent: string | null = null;
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        fullContent = fs.readFileSync(doc.file_path, "utf8");
      }

      return {
        success: true,
        action: "get",
        doc,
        fullContent,
      };
    }

    // ─── ACTION: list ──────────────────────────────────────────────────
    if (action === "list") {
      if (!fs.existsSync(dbPath)) {
        return {
          success: false,
          error: "rag.db não encontrado. Rode action=rebuild_index primeiro.",
        };
      }
      const results = listDocs(dbPath, { category, priority });
      return {
        success: true,
        action: "list",
        filters: { category, priority },
        totalDocs: results.length,
        docs: results,
      };
    }

    // ─── ACTION: validate ──────────────────────────────────────────────
    if (action === "validate") {
      const ragDir = path.join(cwd, "RAG");
      const localFiles = fs.existsSync(ragDir)
        ? fs
            .readdirSync(ragDir)
            .filter((f) => f.endsWith(".md") && f !== "README.md")
        : [];
      const globalFiles = fs.existsSync(globalTrainingDir)
        ? fs.readdirSync(globalTrainingDir).filter((f) => f.endsWith(".md"))
        : [];

      const invalid: string[] = [];
      const valid: string[] = [];

      for (const file of [
        ...localFiles.map((f) => path.join(ragDir, f)),
        ...globalFiles.map((f) => path.join(globalTrainingDir, f)),
      ]) {
        const doc = processRagFile(file);
        if (doc) {
          valid.push(doc.id);
        } else {
          invalid.push(path.basename(file));
        }
      }

      return {
        success: true,
        action: "validate",
        valid: valid.length,
        invalid: invalid.length,
        invalidFiles: invalid,
        message:
          invalid.length === 0
            ? "Todos os docs são válidos."
            : `${invalid.length} doc(s) com problema de parsing.`,
      };
    }

    // ─── ACTION: rebuild_index ─────────────────────────────────────────
    if (action === "rebuild_index") {
      const ragDir = path.join(cwd, "RAG");
      const indexPath = path.join(ragDir, "index.json");

      // Coletar docs de ambas as fontes
      const allDocs: any[] = [];
      const stats = {
        totalDocs: 0,
        byCategory: {} as Record<string, number>,
        byPriority: {} as Record<string, number>,
      };
      const promotedDocs: string[] = [];

      // 1. Docs locais do projeto (RAG/)
      if (fs.existsSync(ragDir)) {
        const localFiles = fs
          .readdirSync(ragDir)
          .filter((f) => f.endsWith(".md") && f !== "README.md");
        for (const file of localFiles) {
          const doc = processRagFile(path.join(ragDir, file));
          if (doc) {
            allDocs.push(doc);
            stats.byCategory[doc.category] =
              (stats.byCategory[doc.category] || 0) + 1;
            stats.byPriority[doc.priority] =
              (stats.byPriority[doc.priority] || 0) + 1;
            stats.totalDocs++;

            // Promover docs globais para training/
            if (
              doc.scope === "global" &&
              (doc.status === "approved" || doc.status === "reviewed")
            ) {
              try {
                fs.mkdirSync(globalTrainingDir, { recursive: true });
                fs.copyFileSync(
                  path.join(ragDir, file),
                  path.join(globalTrainingDir, file),
                );
                promotedDocs.push(doc.id);
              } catch {
                /* ignore */
              }
            }
          }
        }

        // Salvar index.json local
        const indexContent = {
          _type: "harness-rag-index-v6",
          generatedAt: new Date().toISOString(),
          generatedBy: "rag_manager_tool",
          totalDocs: stats.totalDocs,
          byCategory: stats.byCategory,
          byPriority: stats.byPriority,
          docs: allDocs.map((d) => ({
            id: d.id,
            title: d.title,
            summary: d.summary,
            category: d.category,
            priority: d.priority,
            status: d.status,
          })),
        };
        fs.writeFileSync(indexPath, JSON.stringify(indexContent, null, 2));
      }

      // 2. Docs globais do training/ (sempre indexados no DB)
      const globalDocs: any[] = [];
      if (fs.existsSync(globalTrainingDir)) {
        const globalFiles = fs
          .readdirSync(globalTrainingDir)
          .filter((f) => f.endsWith(".md"));
        for (const file of globalFiles) {
          const doc = processRagFile(path.join(globalTrainingDir, file));
          if (doc) globalDocs.push(doc);
        }
      }

      // 3. Reconstruir o SQLite com schema FTS5
      try {
        // Drop e recria do zero para garantir integridade
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        ensureSchema(dbPath);

        // Indexar todos os docs (locais + globais, deduplicando por ID)
        const indexed = new Set<string>();
        const allToIndex = [...allDocs, ...globalDocs];

        for (const doc of allToIndex) {
          if (indexed.has(doc.id)) continue;
          indexDocument(dbPath, doc);
          indexed.add(doc.id);
        }

        return {
          success: true,
          action: "rebuild_index",
          stats: {
            localDocs: stats.totalDocs,
            globalDocs: globalDocs.length,
            totalIndexed: indexed.size,
            byCategory: stats.byCategory,
            byPriority: stats.byPriority,
          },
          promotedDocs,
          dbPath,
          message: `RAG DB reconstruído com FTS5. ${indexed.size} docs indexados.`,
        };
      } catch (e) {
        return {
          success: false,
          error: `Erro ao reconstruir DB: ${(e as Error).message}`,
        };
      }
    }

    return { success: false, error: `Action '${action}' não reconhecida.` };
  },
});
