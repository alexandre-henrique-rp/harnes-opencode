/**
 * progress-tracker.ts — Harness v6 tool
 *
 * Varre os cabeçalhos de todos os arquivos de planejamento e gera um relatório
 * de progresso consolidado (Marcos, Sprints, Tasks).
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export default tool({
  name: "progress_tracker",
  description: "Gera um relatório completo do progresso do projeto lendo os cabeçalhos das tasks.",
  args: {
    milestoneId: tool.schema.string().optional().describe("Filtrar por marco específico"),
  },
  async execute({ milestoneId }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const sprintsDir = path.join(harnessDir, "sprints");

    if (!fs.existsSync(sprintsDir)) {
      return { success: false, error: "Estrutura fractal de sprints nao encontrada." };
    }

    // Busca rápida usando grep para pegar status nos headers
    const cmd = `grep -rE "^status: " "${sprintsDir}" --include="*_PROMPT.md" || true`;
    const output = execSync(cmd).toString();
    
    const stats: any = {
      total: 0,
      completed: 0,
      in_progress: 0,
      pending: 0,
      blocked: 0,
      bySprint: {}
    };

    const lines = output.split("\n").filter(l => l.trim());
    for (const line of lines) {
      const [filePath, statusLine] = line.split(":status: ");
      const status = statusLine.replace(/"/g, "").trim();
      const sprintId = filePath.match(/S\d+/)?.[0] || "unknown";

      stats.total++;
      stats[status] = (stats[status] || 0) + 1;

      if (!stats.bySprint[sprintId]) {
        stats.bySprint[sprintId] = { total: 0, completed: 0, pending: 0 };
      }
      stats.bySprint[sprintId].total++;
      if (status === "completed") stats.bySprint[sprintId].completed++;
      if (status === "pending") stats.bySprint[sprintId].pending++;
    }

    const milestonesPath = path.join(harnessDir, "milestones.json");
    let milestones = [];
    if (fs.existsSync(milestonesPath)) {
      milestones = JSON.parse(fs.readFileSync(milestonesPath, "utf8"));
    }

    return {
      success: true,
      stats,
      milestones,
      percentComplete: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
      summary: `Projeto: ${stats.completed}/${stats.total} tasks concluidas (${Math.round((stats.completed / stats.total) * 100)}%).`
    };
  },
});
