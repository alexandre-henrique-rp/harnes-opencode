/**
 * task-briefer.ts — Harness v6 tool
 *
 * Lê um micro-prompt de task de sprint, limpa o frontmatter YAML para economizar tokens,
 * e gera um arquivo de briefing de tarefa físico isolado sob .harness/tmp/.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "task-briefer",
  description: "Gera um arquivo de briefing compacto para uma tarefa específica de uma sprint, limpando metadados YAML redundantes.",
  args: {
    taskId: tool.schema.string().describe("ID da task (ex: T001)"),
    sprintId: tool.schema.string().describe("ID da sprint (ex: S01)")
  },
  async execute({ taskId, sprintId }, context) {
    const cwd = context?.directory || process.cwd();
    const taskPath = path.resolve(cwd, ".harness", "sprints", sprintId, "tasks", `${taskId}_PROMPT.md`);
    const harnessTmpDir = path.resolve(cwd, ".harness", "tmp");

    if (!fs.existsSync(taskPath)) {
      return {
        success: false,
        error: `Arquivo de micro-prompt da tarefa não encontrado em: ${taskPath}`
      };
    }

    if (!fs.existsSync(harnessTmpDir)) {
      fs.mkdirSync(harnessTmpDir, { recursive: true });
    }

    // Lê o conteúdo do micro-prompt original
    let content = fs.readFileSync(taskPath, "utf8");

    // Remove o cabeçalho frontmatter YAML
    const cleanContent = content.replace(/^---\n[\s\S]*?\n---\n?/, "");

    const briefFilePath = path.join(harnessTmpDir, `task-${taskId}-brief.md`);
    fs.writeFileSync(briefFilePath, cleanContent);

    return {
      success: true,
      briefPath: briefFilePath,
      message: `Briefing da tarefa ${taskId} gravado com sucesso em: ${briefFilePath}`
    };
  }
});
