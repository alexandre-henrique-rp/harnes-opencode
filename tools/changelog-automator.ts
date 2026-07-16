/**
 * changelog-automator.ts — Harness v6 tool
 *
 * Gera ou atualiza um CHANGELOG.md de forma inteligente lendo as tarefas da sprint e os eventos.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export default tool({
  name: "changelog-automator",
  description: "Atualiza o arquivo CHANGELOG.md lendo os logs de tarefas concluídas e o histórico recente do Git.",
  args: {
    version: tool.schema.string().describe("Versão do release (ex: 1.2.0)"),
    sprintId: tool.schema.string().optional().describe("Se informado, consolida apenas baseado nesta sprint."),
  },
  async execute({ version, sprintId }, context) {
    const cwd = context?.directory || process.cwd();
    const changelogPath = path.join(cwd, "CHANGELOG.md");
    const harnessDir = path.join(cwd, ".harness");

    try {
      let recentCommits = "";
      try {
        recentCommits = execSync("git log -n 15 --pretty=format:'- %s'", { cwd }).toString();
      } catch (e) {
        recentCommits = "- Repositório Git não inicializado ou sem commits.";
      }

      const today = new Date().toISOString().split("T")[0];
      let newEntry = `## [${version}] - ${today}\n\n`;

      if (sprintId) {
        const sprintDbPath = path.join(harnessDir, "sprints", `${sprintId}.json`);
        if (fs.existsSync(sprintDbPath)) {
          const sprintData = JSON.parse(fs.readFileSync(sprintDbPath, "utf8"));
          const tasks = sprintData.tasks || [];
          const completedTasks = tasks.filter((t: any) => t.status === "completed");
          
          if (completedTasks.length > 0) {
            newEntry += `### Adicionado / Modificado na Sprint ${sprintId}\n`;
            completedTasks.forEach((t: any) => {
              newEntry += `- **${t.id}**: ${t.title}\n`;
            });
            newEntry += `\n`;
          }
        }
      }

      newEntry += `### Últimos Commits (Referência)\n${recentCommits}\n\n`;

      let currentChangelog = "";
      if (fs.existsSync(changelogPath)) {
        currentChangelog = fs.readFileSync(changelogPath, "utf8");
      } else {
        currentChangelog = `# Changelog\n\nTodas as mudanças notáveis para este projeto estarão documentadas aqui.\n\n`;
      }

      // Injeta a nova versão logo após o título principal # Changelog
      const newChangelog = currentChangelog.replace(
        /# Changelog\n+/i,
        `# Changelog\n\n${newEntry}`
      );

      fs.writeFileSync(changelogPath, newChangelog);

      return {
        success: true,
        message: `CHANGELOG.md atualizado com a versão ${version}.`
      };
    } catch (e: any) {
      return { success: false, error: `Erro ao gerar changelog: ${e.message}` };
    }
  },
});
