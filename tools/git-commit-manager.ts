/**
 * git-commit-manager.ts — Harness v6 tool
 *
 * Automatiza a criação de commits semânticos baseados nos logs das tasks.
 * Garante que a mensagem de commit reflita exatamente o que foi logado no TXXX_LOG.json.
 *
 * Migração A4 (v6.5.0+): substituído execSync por runGit (safe-exec) — args
 * sempre como array, sem interpretacao de shell.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";
import { runGit } from "./lib/safe-exec.ts";

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

      // Stage files from artifacts — args como array, sem shell
      for (const art of artifacts) {
        if (fs.existsSync(path.join(cwd, art.path))) {
          const r = runGit(["add", art.path], { cwd });
          if (!r.ok) return { success: false, error: `git add ${art.path}: ${r.stderr}` };
        }
      }

      // Also add the log and prompt files
      const logRel = path.relative(cwd, logPath);
      const r1 = runGit(["add", logRel], { cwd });
      if (!r1.ok) return { success: false, error: `git add ${logRel}: ${r1.stderr}` };

      const promptPath = path.join(harnessDir, "sprints", sprintId, "tasks", `${taskId}_PROMPT.md`);
      if (fs.existsSync(promptPath)) {
        const promptRel = path.relative(cwd, promptPath);
        const r2 = runGit(["add", promptRel], { cwd });
        if (!r2.ok) return { success: false, error: `git add ${promptRel}: ${r2.stderr}` };
      }

      // Create commit — commitMsg é um único arg, sem concatenacao
      const cr = runGit(["commit", "-m", commitMsg], { cwd });
      if (!cr.ok) return { success: false, error: `git commit falhou: ${cr.stderr}` };

      const shaRes = runGit(["rev-parse", "HEAD"], { cwd });
      if (!shaRes.ok) return { success: false, error: `git rev-parse falhou: ${shaRes.stderr}` };
      const sha = shaRes.stdout.trim();

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
