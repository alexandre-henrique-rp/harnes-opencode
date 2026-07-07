/**
 * context-query.ts — Harness v6 tool
 *
 * Busca contexto granular sobre tasks passadas para resolver conflitos e dependências.
 * 1. Pesquisa no registry.json por entidades (componentes, apis, etc).
 * 2. Lê logs de tasks específicas (TXXX_LOG.json) para entender o "porquê" das alterações.
 * 3. Retorna um resumo técnico limpo.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "context-query",
  description: "Busca contexto granular sobre componentes, APIs ou decisões tomadas em tasks anteriores.",
  args: {
    query: tool.schema.string().optional().describe("Termo de busca (ex: nome de um componente ou endpoint)"),
    taskId: tool.schema.string().optional().describe("ID de uma task específica para ver o log granular"),
    sprintId: tool.schema.string().optional().describe("ID da sprint (necessário se taskId for fornecido)"),
  },
  async execute({ query, taskId, sprintId }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const registryPath = path.join(harnessDir, "registry.json");

    let results: any = { registryMatches: [], taskLog: null };

    // 1. Buscar no Registry se houver query
    if (query && fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        results.registryMatches = (registry.entities || []).filter((e: any) => 
          e.path.toLowerCase().includes(query.toLowerCase()) || 
          e.type.toLowerCase().includes(query.toLowerCase()) ||
          e.description.toLowerCase().includes(query.toLowerCase())
        );
      } catch (e) {
        return { success: false, error: "Erro ao ler registry.json" };
      }
    }

    // 2. Buscar Log de Task específica
    if (taskId && sprintId) {
      const taskLogPath = path.join(harnessDir, "sprints", sprintId, "tasks", `${taskId}_LOG.json`);
      if (fs.existsSync(taskLogPath)) {
        try {
          results.taskLog = JSON.parse(fs.readFileSync(taskLogPath, "utf8"));
        } catch (e) {
          results.taskLog = { error: `Erro ao ler log da task ${taskId}` };
        }
      } else {
        results.taskLog = { error: `Log da task ${taskId} nao encontrado na sprint ${sprintId}` };
      }
    }

    // 3. Se nada foi fornecido, lista as últimas 10 entidades do registry
    if (!query && !taskId && fs.existsSync(registryPath)) {
      try {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        results.recentEntities = (registry.entities || []).slice(-10).reverse();
      } catch (e) {}
    }

    return {
      success: true,
      results,
      summary: results.taskLog ? `Exibindo log da task ${taskId}.` : `Encontrados ${results.registryMatches.length} matches no registro.`
    };
  },
});
