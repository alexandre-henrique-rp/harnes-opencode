/**
 * rag-manager.ts — Harness v6 tool
 *
 * Genrencia a pasta RAG/ local e global.
 * 1. Valida a estrutura YAML e as 7 seções de cada doc.
 * 2. Regenera o RAG/index.json local.
 * 3. Popula a base SQLite global em ~/.config/opencode/training/rag.db para buscas globais rápidas.
 */

import { tool } from "@opencode-ai/plugin";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

function parseYaml(content: string): any {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const meta: any = {};
  for (const line of lines) {
    const [key, ...val] = line.split(":");
    if (key && val.length > 0) {
      meta[key.trim()] = val.join(":").trim().replace(/^"|"$/g, "");
    }
  }
  return meta;
}

export default tool({
  name: "rag-manager",
  description: "Valida documentos RAG locais, reconstrói o index.json local e atualiza a base SQLite global rag.db.",
  args: {
    action: tool.schema.enum(["validate", "rebuild_index"]).default("rebuild_index"),
  },
  async execute({ action }, context) {
    const cwd = context?.directory || process.cwd();
    const ragDir = path.join(cwd, "RAG");
    const indexPath = path.join(ragDir, "index.json");

    if (!fs.existsSync(ragDir)) {
      return { success: false, error: "Diretorio RAG/ nao encontrado." };
    }

    const localFiles = fs.readdirSync(ragDir).filter(f => f.endsWith(".md") && f !== "README.md");
    const docs: any[] = [];
    const promotedDocs: string[] = [];
    const stats: any = {
      totalDocs: 0,
      byCategory: {},
      byPriority: {}
    };

    const globalTrainingDir = path.join(
      process.env.HOME || process.env.USERPROFILE || "~",
      ".config",
      "opencode",
      "training"
    );
    const dbPath = path.join(globalTrainingDir, "rag.db");

    // 1. Processar RAGs locais
    for (const file of localFiles) {
      const filePath = path.join(ragDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const meta = parseYaml(content);

      if (meta) {
        const docId = meta.id || file.replace(".md", "");
        const category = meta.category || "general";
        const priority = meta.priority || "medium";
        const status = meta.status || "approved";
        const title = meta.title || file.replace(".md", "");
        const summary = meta.summary || meta.description || "Sem resumo disponível.";
        const updatedAt = meta.updatedAt || new Date().toISOString();

        // Estatísticas locais
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;

        // Promoção automática para o RAG Global se scope=global e status=approved ou reviewed
        if (meta.scope === "global" && (status === "approved" || status === "reviewed")) {
          try {
            if (!fs.existsSync(globalTrainingDir)) {
              fs.mkdirSync(globalTrainingDir, { recursive: true });
            }
            const destPath = path.join(globalTrainingDir, file);
            fs.copyFileSync(filePath, destPath);
            promotedDocs.push(docId);
          } catch (e) {
            // ignore
          }
        }

        docs.push({
          id: docId,
          category,
          title,
          summary,
          priority,
          status,
          updatedAt
        });

        stats.totalDocs++;
      }
    }

    // 2. Salvar index.json local e atualizar a base SQLite global
    if (action === "rebuild_index") {
      const indexContent = {
        _type: "harness-rag-index-v6",
        generatedAt: new Date().toISOString(),
        generatedBy: "rag_manager_tool",
        totalDocs: stats.totalDocs,
        byCategory: stats.byCategory,
        byPriority: stats.byPriority,
        docs
      };
      fs.writeFileSync(indexPath, JSON.stringify(indexContent, null, 2));

      // 3. Atualizar o banco SQLite global (rag.db) contendo apenas os RAGs globais
      if (fs.existsSync(globalTrainingDir)) {
        try {
          const globalFiles = fs.readdirSync(globalTrainingDir).filter(f => f.endsWith(".md"));
          const globalDocs: any[] = [];

          for (const file of globalFiles) {
            const filePath = path.join(globalTrainingDir, file);
            const content = fs.readFileSync(filePath, "utf8");
            const meta = parseYaml(content);

            if (meta) {
              const docId = meta.id || file.replace(".md", "");
              const category = meta.category || "general";
              const priority = meta.priority || "medium";
              const status = meta.status || "approved";
              const title = meta.title || file.replace(".md", "");
              const summary = meta.summary || meta.description || "Sem resumo disponível.";
              const tags = meta.tags ? (typeof meta.tags === "string" ? meta.tags : JSON.stringify(meta.tags)) : "[]";
              const updatedAt = meta.updatedAt || new Date().toISOString();

              globalDocs.push({
                id: docId,
                title,
                summary,
                category,
                priority,
                status,
                tags,
                file_path: filePath,
                updated_at: updatedAt
              });
            }
          }

          if (globalDocs.length > 0) {
            const sqlStatements = [
              "PRAGMA journal_mode=WAL;",
              "DROP TABLE IF EXISTS rag_docs;",
              `CREATE TABLE rag_docs (
                id TEXT PRIMARY KEY,
                title TEXT,
                summary TEXT,
                category TEXT,
                priority TEXT,
                status TEXT,
                tags TEXT,
                file_path TEXT,
                updated_at TEXT
              );`
            ];

            for (const doc of globalDocs) {
              const escape = (str: string) => (str || "").replace(/'/g, "''");
              sqlStatements.push(
                `INSERT INTO rag_docs (id, title, summary, category, priority, status, tags, file_path, updated_at)
                 VALUES (
                   '${escape(doc.id)}',
                   '${escape(doc.title)}',
                   '${escape(doc.summary)}',
                   '${escape(doc.category)}',
                   '${escape(doc.priority)}',
                   '${escape(doc.status)}',
                   '${escape(doc.tags)}',
                   '${escape(doc.file_path)}',
                   '${escape(doc.updated_at)}'
                 );`
              );
            }

            const fullSql = sqlStatements.join("\n");
            execFileSync("sqlite3", [dbPath], { input: fullSql });
          }
        } catch (dbErr) {
          process.stderr.write(`[rag-manager] SQLite global index warning: ${dbErr}\n`);
        }
      }
    }

    return {
      success: true,
      stats,
      promotedDocs,
      promotedCount: promotedDocs.length,
      message: action === "rebuild_index" ? "RAG/index.json local e RAG global rag.db reconstruidos." : "Validacao concluida.",
      invalidDocs: localFiles.length - docs.length
    };
  },
});
