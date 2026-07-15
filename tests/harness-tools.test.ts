import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// Importa as ferramentas
import harnessWorkspace from "../tools/harness-workspace.ts";
import taskBriefer from "../tools/task-briefer.ts";
import reviewPackager from "../tools/review-packager.ts";
import taskManager from "../tools/task-manager.ts";

const cwd = process.cwd();
const harnessDir = path.join(cwd, ".harness");
const tmpDir = path.join(harnessDir, "tmp");

test("Suíte de Testes do Harness v6 Tools", async (t) => {
  
  // Setup: Garante limpeza inicial do ambiente de teste
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  await t.test("1. harness-workspace - deve criar diretório tmp e .gitignore", async () => {
    const result = await harnessWorkspace.execute({}, { directory: cwd });
    
    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(tmpDir));
    
    const gitignorePath = path.join(tmpDir, ".gitignore");
    assert.ok(fs.existsSync(gitignorePath));
    assert.strictEqual(fs.readFileSync(gitignorePath, "utf8"), "*\n");
  });

  await t.test("2. task-briefer - deve criar briefing de tarefa e limpar frontmatter YAML", async () => {
    const sprintId = "S99";
    const taskId = "T999";
    const sprintTasksDir = path.join(harnessDir, "sprints", sprintId, "tasks");
    
    fs.mkdirSync(sprintTasksDir, { recursive: true });
    
    const originalPrompt = [
      "---",
      'id: "T999"',
      'status: "pending"',
      "---",
      "# Implementar funcionalidade X",
      "Instruções detalhadas aqui."
    ].join("\n");

    const taskPromptPath = path.join(sprintTasksDir, `${taskId}_PROMPT.md`);
    fs.writeFileSync(taskPromptPath, originalPrompt);

    // Executa a ferramenta
    const result = await taskBriefer.execute({ taskId, sprintId }, { directory: cwd });
    
    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(result.briefPath));

    const briefContent = fs.readFileSync(result.briefPath, "utf8");
    assert.ok(!briefContent.includes("---"));
    assert.ok(briefContent.includes("# Implementar funcionalidade X"));
    assert.ok(briefContent.includes("Instruções detalhadas aqui."));

    // Cleanup local
    fs.rmSync(path.join(harnessDir, "sprints", sprintId), { recursive: true, force: true });
  });

  await t.test("3. review-packager - deve empacotar o diff e logs de commit entre BASE e HEAD", async () => {
    // Obtém o hash do último commit como BASE e HEAD para teste rápido
    const baseCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    
    const result = await reviewPackager.execute({ baseCommit, headCommit: "HEAD" }, { directory: cwd });
    
    assert.strictEqual(result.success, true);
    assert.ok(fs.existsSync(result.diffPath));
    assert.ok(result.sizeBytes > 0);

    const diffContent = fs.readFileSync(result.diffPath, "utf8");
    assert.ok(diffContent.includes("# Review Package"));
    assert.ok(diffContent.includes("## Commits"));
    assert.ok(diffContent.includes("## Files Changed"));
    assert.ok(diffContent.includes("## Detailed Diff"));
  });

  await t.test("4. task-manager - deve atualizar status e gravar o progresso no ledger persistente", async () => {
    const sprintId = "S99";
    const taskId = "T888";
    const sprintTasksDir = path.join(harnessDir, "sprints", sprintId, "tasks");
    
    fs.mkdirSync(sprintTasksDir, { recursive: true });
    fs.writeFileSync(path.join(sprintTasksDir, `${taskId}_PROMPT.md`), "# Task 888");

    // Executa a atualização de tarefa para 'completed' com commitRange
    const result = await taskManager.execute({
      taskId,
      sprintId,
      status: "completed",
      commitRange: "a1b2c3d..e4f5g6h"
    }, { directory: cwd });

    assert.strictEqual(result.success, true);

    const ledgerPath = path.join(harnessDir, "sprints", "progress_ledger.md");
    assert.ok(fs.existsSync(ledgerPath));

    const ledgerContent = fs.readFileSync(ledgerPath, "utf8");
    assert.ok(ledgerContent.includes("- [x] **T888** (sprint S99): status: `completed` (commits: `a1b2c3d..e4f5g6h`)"));

    // Cleanup local
    fs.rmSync(path.join(harnessDir, "sprints", sprintId), { recursive: true, force: true });
    if (fs.existsSync(ledgerPath)) {
      fs.rmSync(ledgerPath, { force: true });
    }
  });
});
