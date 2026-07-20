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
import harnessCheckpoint from "../tools/harness-checkpoint.ts";


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

  await t.test("5. harness-checkpoint - deve criar e listar checkpoints via git stash", async () => {
    // 1. Cria um arquivo temporário não rastreado para testar o stash
    const tempFilePath = path.join(cwd, "test-stash-temp.txt");
    fs.writeFileSync(tempFilePath, "conteudo de teste do stash");

    try {
      // 2. Cria o checkpoint preventivo
      const resultCreate = await harnessCheckpoint.execute({
        action: "create",
        taskId: "test-task-123"
      }, { directory: cwd });

      assert.strictEqual(resultCreate.success, true);
      
      // O git stash push deve ter guardado e limpo o arquivo do diretório de trabalho
      assert.ok(!fs.existsSync(tempFilePath), "O arquivo temporário deveria ter sido stashado e removido do workspace.");

      // 3. Lista os checkpoints
      const resultList = await harnessCheckpoint.execute({
        action: "list"
      }, { directory: cwd });

      assert.strictEqual(resultList.success, true);
      assert.ok(resultList.stashes.length > 0);
      assert.ok(resultList.stashes[0].message.includes("test-task-123"));

      // 4. Tenta restaurar sem a flag force (deve falhar exigindo force)
      const resultRestoreNoForce = await harnessCheckpoint.execute({
        action: "restore",
        force: false
      }, { directory: cwd });

      assert.strictEqual(resultRestoreNoForce.success, false);
      assert.strictEqual(resultRestoreNoForce.requiresForce, true);

      // 5. Restaura com a flag force=true
      const resultRestoreForce = await harnessCheckpoint.execute({
        action: "restore",
        force: true
      }, { directory: cwd });

      assert.strictEqual(resultRestoreForce.success, true);
      
      // O arquivo temporário deve ter voltado ao diretório de trabalho
      assert.ok(fs.existsSync(tempFilePath), "O arquivo temporário deveria ter retornado ao workspace após o restore.");
      assert.strictEqual(fs.readFileSync(tempFilePath, "utf8"), "conteudo de teste do stash");

    } finally {
      // Cleanup: remove o arquivo temporário se ele foi restaurado
      if (fs.existsSync(tempFilePath)) {
        fs.rmSync(tempFilePath, { force: true });
      }
      
      // Devolve os arquivos locais de desenvolvimento caso a execução tenha falhado no meio
      try {
        const list = execSync("git stash list", { cwd, encoding: "utf8" });
        if (list.includes("harness-checkpoint: pre-task test-task-123")) {
          execSync("git stash pop stash@{0}", { cwd, stdio: "ignore" });
        }
        
        // E remove o stash de emergência se ele ainda estiver na pilha
        const updatedList = execSync("git stash list", { cwd, encoding: "utf8" });
        if (updatedList.includes("harness-emergency: pre-restore backup")) {
          execSync("git stash drop stash@{0}", { cwd, stdio: "ignore" });
        }
      } catch {
        // ignore se o stash já foi limpo
      }
    }
  });

  await t.test("6. opencode.json - deve ter comandos de MCP validos usando npx -y sem invocar node em scripts shell", async () => {
    const opencodePath = path.join(cwd, "opencode.json");
    assert.ok(fs.existsSync(opencodePath), "opencode.json deve existir na raiz do projeto");

    const content = fs.readFileSync(opencodePath, "utf8");
    const config = JSON.parse(content);

    assert.ok(config.mcp, "opencode.json deve conter seção mcp");

    for (const [mcpName, mcpConfig] of Object.entries(config.mcp as Record<string, any>)) {
      if (mcpConfig.type === "local" && Array.isArray(mcpConfig.command)) {
        const cmd: string[] = mcpConfig.command;
        // Não deve executar "node ./node_modules/.bin/..." pois a maioria é shell script (#!/bin/sh)
        if (cmd[0] === "node" && cmd[1] && cmd[1].includes("node_modules/.bin/")) {
          assert.fail(`MCP "${mcpName}" não deve invocar 'node' diretamente em scripts de '.bin/'. Use 'npx -y <pacote>'.`);
        }
      }
    }
  });
});
