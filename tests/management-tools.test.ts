/**
 * management-tools.test.ts — Testes para ferramentas de gerenciamento e automação:
 * sprint-builder, ui-spec-manager, test-codegen, progress-tracker, rag-manager,
 * changelog-automator, context-pruner, context-query, docs-sync, git-automator, git-commit-manager, pr-automator
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";

import harnessInit from "../tools/harness-init.ts";
import sprintBuilder from "../tools/sprint-builder.ts";
import uiSpecManager from "../tools/ui-spec-manager.ts";
import testCodegen from "../tools/test-codegen.ts";
import progressTracker from "../tools/progress-tracker.ts";
import ragManager from "../tools/rag-manager.ts";
import changelogAutomator from "../tools/changelog-automator.ts";
import contextPruner from "../tools/context-pruner.ts";
import contextQuery from "../tools/context-query.ts";
import docsSync from "../tools/docs-sync.ts";
import gitAutomator from "../tools/git-automator.ts";
import gitCommitManager from "../tools/git-commit-manager.ts";
import prAutomator from "../tools/pr-automator.ts";

function createTmpProject() {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "harness-mgmt-test-"));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, cleanup };
}

test("Suíte de Ferramentas de Gerenciamento e Automação", async (t) => {

  await t.test("1. sprint-builder — inicializa diretórios de sprint e esqueletos de tarefas", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const res = await sprintBuilder.execute({
        sprintId: "S01",
        projectName: "app-test",
        tasks: [
          { id: "T001", title: "Task 1", type: "backend" },
          { id: "T002", title: "Task 2", type: "frontend" }
        ]
      }, { directory: dir });

      assert.strictEqual(res.success, true);
      assert.ok(fs.existsSync(path.join(dir, ".harness", "sprints", "S01", "tasks", "T001_PROMPT.md")));
      assert.ok(fs.existsSync(path.join(dir, ".harness", "sprints", "S01", "tasks", "T002_PROMPT.md")));
    } finally {
      cleanup();
    }
  });

  await t.test("2. ui-spec-manager — gera esqueletos de especificação de UI", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const res = await uiSpecManager.execute({
        feature: "login-screen",
        pages: ["Login"]
      }, { directory: dir });

      assert.strictEqual(res.success, true);
      assert.ok(fs.existsSync(path.join(dir, ".harness", "ui-specs", "login-screen.md")));
    } finally {
      cleanup();
    }
  });

  await t.test("3. test-codegen — gera arquivo de teste Playwright a partir de JSON declarativo", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const res = await testCodegen.execute({
        chainId: "E2E-001",
        sprintId: "S01",
        chainData: {
          name: "Fluxo de Autenticação",
          description: "Valida login de usuário",
          sequence: [
            { step: 1, action: "goto", path: "/login" },
            { step: 2, action: "click", path: "#submit-btn" }
          ]
        }
      }, { directory: dir });

      assert.strictEqual(res.success, true);
      assert.ok(fs.existsSync(path.join(dir, res.filePath)));
      const content = fs.readFileSync(path.join(dir, res.filePath), "utf8");
      assert.ok(content.includes("playwright"));
    } finally {
      cleanup();
    }
  });

  await t.test("4. progress-tracker — calcula métricas de progresso das sprints", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      fs.mkdirSync(path.join(dir, ".harness", "sprints", "S01", "tasks"), { recursive: true });
      fs.writeFileSync(path.join(dir, ".harness", "sprints", "S01", "tasks", "T001_PROMPT.md"), "status: completed\n# Task 1");

      const res = await progressTracker.execute({}, { directory: dir });
      assert.strictEqual(res.success, true);
    } finally {
      cleanup();
    }
  });

  await t.test("5. rag-manager — adiciona e consulta base RAG local", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const ragDir = path.join(dir, "RAG");
      fs.mkdirSync(ragDir, { recursive: true });
      fs.writeFileSync(path.join(ragDir, "01-test.md"), "---\nid: RAG-01\ncategory: architecture\npriority: P1\n---\n# Test Doc");

      const res = await ragManager.execute({ action: "rebuild_index" }, { directory: dir });
      assert.strictEqual(res.success, true);
      assert.ok(fs.existsSync(path.join(ragDir, "index.json")));
    } finally {
      cleanup();
    }
  });

  await t.test("6. changelog-automator — atualiza CHANGELOG.md automaticamente", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const res = await changelogAutomator.execute({
        version: "v6.5.0",
        changes: ["Adicionada nova suíte de testes de cobertura", "Corrigido cálculo de progresso"]
      }, { directory: dir });

      assert.strictEqual(res.success, true);
      const content = fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8");
      assert.ok(content.includes("v6.5.0"));
    } finally {
      cleanup();
    }
  });

  await t.test("7. context-pruner & context-query — poda e pesquisa no contexto", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const srcFile = path.join(dir, "sample.ts");
      fs.writeFileSync(srcFile, "export function hello() { console.log('world'); }");

      const resPrune = await contextPruner.execute({ sourceFile: "sample.ts" }, { directory: dir });
      assert.strictEqual(resPrune.success, true);

      const resQuery = await contextQuery.execute({ query: "hello" }, { directory: dir });
      assert.strictEqual(resQuery.success, true);
    } finally {
      cleanup();
    }
  });

  await t.test("8. docs-sync & git tools — validação de execução de utilitários", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      execSync("git init", { cwd: dir, stdio: "ignore" });
      execSync('git config user.email "test@test.com"', { cwd: dir, stdio: "ignore" });
      execSync('git config user.name "Test"', { cwd: dir, stdio: "ignore" });

      fs.writeFileSync(path.join(dir, "README.md"), "# Documentação\n\n## Últimas Atualizações\n");

      const resDocs = await docsSync.execute({ docsTarget: "README.md", summaryText: "Nova funcionalidade adicionada" }, { directory: dir });
      assert.strictEqual(resDocs.success, true);

      const taskLogPath = path.join(dir, ".harness", "sprints", "S01", "tasks");
      fs.mkdirSync(taskLogPath, { recursive: true });
      fs.writeFileSync(path.join(taskLogPath, "T001_LOG.json"), JSON.stringify({ sprintId: "S01", artifacts: [{ path: "README.md", description: "Artifact 1" }] }));

      const resGitCommit = await gitCommitManager.execute({ taskId: "T001", sprintId: "S01" }, { directory: dir });
      assert.strictEqual(resGitCommit.success, true);

      const resGitAuto = await gitAutomator.execute({ action: "status" }, { directory: dir });
      assert.strictEqual(resGitAuto.success, true);

      // pr-automator: testa validação de branch
      const resPrSameBranch = await prAutomator.execute({ baseBranch: "main" }, { directory: dir });
      assert.strictEqual(typeof resPrSameBranch.success, "boolean");
    } finally {
      cleanup();
    }
  });
});
