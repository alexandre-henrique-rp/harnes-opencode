/**
 * git-commit-manager.ts — Harness v6 tool
 *
 * Automatiza a criação de commits semânticos baseados nos logs das tasks.
 * Garante que a mensagem de commit reflita exatamente o que foi logado no TXXX_LOG.json.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

export default tool({
  description: "Cria um commit semântico automático baseado no log de uma task concluída.",
  args: {
    taskId: tool.schema.string().describe("ID da task (ex: T001)"),
    sprintId: tool.schema.string().describe("ID da sprint (ex: S01)"),
    type: tool.schema.enum(["feat", "fix", "docs", "test", "refactor", "chore"]).describe("Tipo semântico do commit"),
  },
  async execute({ taskId, sprintId, type }, context) {
    let cwd = resolveProjectCwd(context, { log: console.error });
    let searchCwd = cwd;
    let harnessDir = path.join(searchCwd, ".harness");
    while (!fs.existsSync(harnessDir) && searchCwd !== path.parse(searchCwd).root) {
      searchCwd = path.dirname(searchCwd);
      harnessDir = path.join(searchCwd, ".harness");
    }
    const logPath = path.join(harnessDir, "sprints", sprintId, "tasks", `${taskId}_LOG.json`);

    if (!fs.existsSync(logPath)) {
      return { success: false, error: `Log da task ${taskId} nao encontrado para gerar commit.` };
    }

    try {
      const log = JSON.parse(fs.readFileSync(logPath, "utf8"));
      const artifacts = log.artifacts || [];
      const description = artifacts.map((a: any) => `- ${a.description}`).join("\n");
      
      const commitMsg = `${type}(${log.sprintId}): ${taskId} - finalizado\n\n${description}`;
      
      // Stage files from artifacts
      for (const art of artifacts) {
        if (fs.existsSync(path.join(cwd, art.path))) {
          execSync(`git add "${art.path}"`, { cwd });
        }
      }
      
      // Also add the log and prompt files
      execSync(`git add "${path.relative(cwd, logPath)}"`, { cwd });
      const promptPath = path.join(harnessDir, "sprints", sprintId, "tasks", `${taskId}_PROMPT.md`);
      if (fs.existsSync(promptPath)) {
        execSync(`git add "${path.relative(cwd, promptPath)}"`, { cwd });
      }

      // Create commit
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, { cwd });
      const sha = execSync("git rev-parse HEAD", { cwd }).toString().trim();

      return {
        success: true,
        sha,
        commitMsg,
        message: `Commit ${sha} criado com sucesso para a task ${taskId}.`
      };
    } catch (e: any) {
      return { success: false, error: `Erro ao criar commit: ${e.message}` };
    }
  },
});
