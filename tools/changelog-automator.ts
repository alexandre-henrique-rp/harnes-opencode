/**
 * changelog-automator.ts — Harness v6 tool
 *
 * Gera ou atualiza um CHANGELOG.md de forma inteligente lendo as tarefas da sprint e os eventos.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

export default tool({
  description: "Atualiza o arquivo CHANGELOG.md lendo os logs de tarefas concluídas e o histórico recente do Git.",
  args: {
    version: tool.schema.string().describe("Versão do release (ex: 1.2.0)"),
    sprintId: tool.schema.string().optional().describe("Se informado, consolida apenas baseado nesta sprint."),
    changes: tool.schema.array(tool.schema.string()).optional().describe("Lista de alterações adicionadas no release."),
  },
  async execute({ version, sprintId, changes }, context) {
    let cwd = resolveProjectCwd(context, { log: console.error });
    let searchCwd = cwd;
    let harnessDir = path.join(searchCwd, ".harness");
    while (!fs.existsSync(harnessDir) && searchCwd !== path.parse(searchCwd).root) {
      searchCwd = path.dirname(searchCwd);
      harnessDir = path.join(searchCwd, ".harness");
    }
    if (!fs.existsSync(harnessDir)) {
      searchCwd = cwd;
      harnessDir = path.join(cwd, ".harness");
    }
    const changelogPath = path.join(searchCwd, "CHANGELOG.md");

    try {
      let recentCommits = "";
      try {
        recentCommits = execSync("git log -n 15 --pretty=format:'- %s'", { cwd }).toString();
      } catch (e) {
        recentCommits = "- Repositório Git não inicializado ou sem commits.";
      }

      const today = new Date().toISOString().split("T")[0];
      let newEntry = `## [${version}] - ${today}\n\n`;

      if (changes && changes.length > 0) {
        newEntry += `### Alterações\n`;
        changes.forEach((c: string) => {
          newEntry += `- ${c}\n`;
        });
        newEntry += `\n`;
      }

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
