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

export default tool({
  name: "git_commit_manager",
  description: "Cria um commit semântico automático baseado no log de uma task concluída.",
  args: {
    taskId: tool.schema.string().describe("ID da task (ex: T001)"),
    sprintId: tool.schema.string().describe("ID da sprint (ex: S01)"),
    type: tool.schema.enum(["feat", "fix", "docs", "test", "refactor", "chore"]).default("feat").describe("Tipo semântico do commit"),
  },
  async execute({ taskId, sprintId, type }, context) {
    const cwd = context?.directory || process.cwd();
    const logPath = path.join(cwd, ".harness", "sprints", sprintId, "tasks", `${taskId}_LOG.json`);

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
          execSync(`git add "${art.path}"`);
        }
      }
      
      // Also add the log and prompt files
      execSync(`git add "${logPath}"`);
      const promptPath = path.join(cwd, ".harness", "sprints", sprintId, "tasks", `${taskId}_PROMPT.md`);
      if (fs.existsSync(promptPath)) {
        execSync(`git add "${promptPath}"`);
      }

      // Create commit
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      const sha = execSync("git rev-parse HEAD").toString().trim();

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
