import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  auditFeatureSpec,
  detectProjectStack,
  EXPECTED_AGENTS,
  EXPECTED_COMMANDS,
  EXPECTED_SKILLS,
  extractSpecIds,
  extractTasksInfo,
  HARNESS_VERSION,
  parseFrontmatter,
  runCli,
  runDoctor,
  runGate,
  runInit,
  runSpecCreate,
  runUpdate,
  toFeatureSlug,
} from "../dist/index.js";

describe("OpenCode Harness v7 — Unit & Integration Tests", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-harness-v7-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("1. Stack Detector (detectProjectStack)", () => {
    it("deve detectar projeto Next.js + TypeScript com UI ativa", () => {
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "portal-web",
          dependencies: { next: "15.0.0", react: "19.0.0" },
          devDependencies: { typescript: "5.6.0" },
          scripts: { test: "vitest run" },
        }),
      );
      fs.writeFileSync(path.join(tempDir, "pnpm-lock.yaml"), "");

      const stack = detectProjectStack(tempDir);
      assert.equal(stack.projectName, "portal-web");
      assert.equal(stack.language, "TypeScript (Node.js)");
      assert.equal(stack.framework, "Next.js");
      assert.equal(stack.packageManager, "pnpm");
      assert.equal(stack.testCommand, "pnpm test");
      assert.equal(stack.hasUi, true);
    });

    it("deve detectar projeto Fastify API como hasUi=false", () => {
      fs.writeFileSync(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "billing-api",
          dependencies: { fastify: "5.0.0" },
        }),
      );

      const stack = detectProjectStack(tempDir);
      assert.equal(stack.projectName, "billing-api");
      assert.equal(stack.framework, "Fastify");
      assert.equal(stack.hasUi, false);
    });

    it("deve detectar projeto Flutter via pubspec.yaml", () => {
      fs.writeFileSync(
        path.join(tempDir, "pubspec.yaml"),
        "name: app_mobile\nflutter:\n  uses-material-design: true\n",
      );

      const stack = detectProjectStack(tempDir);
      assert.equal(stack.language, "Dart");
      assert.equal(stack.framework, "Flutter");
      assert.equal(stack.hasUi, true);
    });
  });

  describe("2. Markdown Parser & Spec-Anchored Auditor (Sprints & Spec por Task)", () => {
    it("deve extrair frontmatter YAML corretamente", () => {
      const md = `---
name: backend
mode: subagent
has_ui: false
contains_pii: true
---
# Conteúdo`;
      const parsed = parseFrontmatter(md);
      assert.equal(parsed.valid, true);
      assert.equal(parsed.attributes["name"], "backend");
      assert.equal(parsed.attributes["has_ui"], false);
      assert.equal(parsed.attributes["contains_pii"], true);
      assert.ok(parsed.body.includes("# Conteúdo"));
    });

    it("deve extrair IDs AC-XX e BR-XX sem duplicatas", () => {
      const spec = `---
feature: "login"
has_ui: true
---
- **BR-01:** Regra 1
- **BR-02:** Regra 2
- **AC-01:** Dado X, Quando Y, Então Z (conforme BR-01)
- **AC-02:** Dado A, Quando B, Então C`;

      const meta = extractSpecIds(spec);
      assert.deepEqual(meta.acIds, ["AC-01", "AC-02"]);
      assert.deepEqual(meta.brIds, ["BR-01", "BR-02"]);
      assert.equal(meta.hasUi, true);
    });

    it("deve extrair Sprint, Agente, Spec da Task e cobertura do TASKS.md", () => {
      const tasksMd = `
## Sprint S01: Autenticação Base
- [x] **T01: Criar endpoint de autenticação**
  - **Sprint:** \`S01\`
  - **Agente:** \`backend\`
  - **Cobre:** \`AC-01\`, \`BR-01\`
  - **Spec da Task:** Implementar POST /auth/login validando credenciais e emitindo JWT.
- [ ] **T02: Criar tela de login**
  - **Sprint:** \`S01\`
  - **Agente:** \`frontend\`
  - **Cobre:** \`AC-02\`, \`BR-02\`
  - **Spec da Task:** Criar formulário semântico de login com 4 estados visuais.
`;
      const tasks = extractTasksInfo(tasksMd);
      assert.equal(tasks.length, 2);
      assert.equal(tasks[0].id, "T01");
      assert.equal(tasks[0].sprint, "S01");
      assert.equal(tasks[0].completed, true);
      assert.equal(tasks[0].agent, "backend");
      assert.ok(tasks[0].taskSpec?.includes("POST /auth/login"));
      assert.deepEqual(tasks[0].coveredIds, ["AC-01", "BR-01"]);
      assert.equal(tasks[1].id, "T02");
      assert.equal(tasks[1].completed, false);
    });

    it("deve detectar requisitos órfãos (ORPHAN_REQUIREMENT) e ausência de Spec da Task (MISSING_TASK_SPEC)", () => {
      const spec = `---
feature: "checkout"
has_ui: false
---
- **BR-01:** Persistir pedido
- **AC-01:** Pedido válido
- **AC-02:** Estoque insuficiente`;

      const tasksWithoutTaskSpec = `
- [x] **T01: Implementar checkout básico**
  - **Sprint:** \`S01\`
  - **Agente:** \`backend\`
  - **Cobre:** \`AC-01\`, \`BR-01\`
`;

      const audit = auditFeatureSpec(
        "checkout",
        spec,
        tasksWithoutTaskSpec,
        null,
        false,
      );
      assert.equal(audit.passed, false);
      assert.deepEqual(audit.orphanIds, ["AC-02"]);
      assert.ok(audit.findings.some((f) => f.code === "ORPHAN_REQUIREMENT"));
      assert.ok(audit.findings.some((f) => f.code === "MISSING_TASK_SPEC"));
    });
  });

  describe("3. Comandos CLI: init, spec, gate, update e doctor", () => {
    it("deve inicializar .opencode/ com 8 agentes, 7 comandos e 4 skills e passar no doctor", () => {
      const initRes = runInit({ cwd: tempDir });
      assert.equal(initRes.success, true);

      // Verifica se todos os 8 agentes foram instalados
      for (const agent of EXPECTED_AGENTS) {
        assert.ok(
          fs.existsSync(
            path.join(tempDir, ".opencode", "agents", `${agent}.md`),
          ),
          `Agente ${agent}.md deveria existir`,
        );
      }

      // Verifica os 7 comandos
      for (const cmd of EXPECTED_COMMANDS) {
        assert.ok(
          fs.existsSync(
            path.join(tempDir, ".opencode", "commands", `${cmd}.md`),
          ),
          `Comando ${cmd}.md deveria existir`,
        );
      }

      // Verifica as 4 skills (incluindo doc-standards)
      for (const skill of EXPECTED_SKILLS) {
        assert.ok(
          fs.existsSync(
            path.join(tempDir, ".opencode", "skills", skill, "SKILL.md"),
          ),
          `Skill ${skill}/SKILL.md deveria existir`,
        );
      }

      // Doctor deve retornar 100% saudável
      const docRes = runDoctor({ cwd: tempDir });
      assert.equal(docRes.healthy, true);

      // Segundo init sem --force deve bloquear de forma segura
      const secondInit = runInit({ cwd: tempDir, force: false });
      assert.equal(secondInit.success, false);
    });

    it("deve criar uma feature com 'spec' (PRD, SPEC, DESIGN, TASKS com Sprint e Spec por Task) e validar no 'gate'", () => {
      runInit({ cwd: tempDir });

      const specRes = runSpecCreate({
        cwd: tempDir,
        featureName: "Autenticação OAuth2",
        hasUi: true,
      });
      assert.equal(specRes.success, true);
      assert.equal(specRes.featureSlug, "autenticacao-oauth2");
      assert.deepEqual(specRes.createdFiles, [
        "PRD.md",
        "SPEC.md",
        "DESIGN.md",
        "TASKS.md",
      ]);

      // Gate padrão (não-strict) deve passar pois todas as tasks têm Spec da Task e cobrem AC-01, AC-02, BR-01, BR-02
      const gateNormal = runGate({ cwd: tempDir, strict: false });
      assert.equal(gateNormal.passed, true);
      assert.deepEqual(gateNormal.results[0].sprints, ["S01"]);

      // Gate strict deve falhar porque as tarefas ainda estão com [ ]
      const gateStrictBefore = runGate({ cwd: tempDir, strict: true });
      assert.equal(gateStrictBefore.passed, false);

      // Marca todas as tarefas como [x] no TASKS.md
      const tasksPath = path.join(specRes.specDir, "TASKS.md");
      const updatedTasks = fs
        .readFileSync(tasksPath, "utf-8")
        .replaceAll("- [ ]", "- [x]");
      fs.writeFileSync(tasksPath, updatedTasks, "utf-8");

      // Agora o Gate strict deve passar!
      const gateStrictAfter = runGate({ cwd: tempDir, strict: true });
      assert.equal(gateStrictAfter.passed, true);
    });

    it("deve preservar CONSTITUTION.md e specs/ durante o comando 'update'", () => {
      runInit({ cwd: tempDir });
      runSpecCreate({
        cwd: tempDir,
        featureName: "pagamentos-pix",
        hasUi: false,
      });

      const constitutionPath = path.join(tempDir, ".opencode", "CONSTITUTION.md");
      fs.writeFileSync(
        constitutionPath,
        "# Minha Constituição Customizada\n",
        "utf-8",
      );

      const updateRes = runUpdate({ cwd: tempDir });
      assert.equal(updateRes.success, true);

      assert.equal(
        fs.readFileSync(constitutionPath, "utf-8"),
        "# Minha Constituição Customizada\n",
      );
      assert.ok(
        fs.existsSync(
          path.join(tempDir, ".opencode", "specs", "pagamentos-pix", "SPEC.md"),
        ),
      );
    });

    it("deve executar o roteador runCli corretamente para todos os subcomandos", () => {
      const logs: string[] = [];
      const errors: string[] = [];
      const io = {
        stdout: (m: string) => logs.push(m),
        stderr: (m: string) => errors.push(m),
      };

      assert.equal(runCli(["--version"], io), 0);
      assert.ok(logs.includes(HARNESS_VERSION));

      assert.equal(runCli(["init", "--cwd", tempDir], io), 0);
      assert.equal(
        runCli(
          ["spec", "Cadastro de Clientes", "--no-ui", "--cwd", tempDir],
          io,
        ),
        0,
      );
      assert.equal(runCli(["gate", "--cwd", tempDir], io), 0);
      assert.equal(runCli(["doctor", "--cwd", tempDir], io), 0);
      assert.equal(runCli(["status", "--cwd", tempDir], io), 0);
      assert.equal(runCli(["update", "--cwd", tempDir], io), 0);
      assert.equal(toFeatureSlug(" Ação & Reação! "), "acao-reacao");
    });

    it("deve garantir as regras arquiteturais e de performance dos 8 agentes (orchestrator sem edit, backend/frontend só código, qa-tester por sprint)", () => {
      runInit({ cwd: tempDir });
      const agentsDir = path.join(tempDir, ".opencode", "agents");

      const orchestratorMd = fs.readFileSync(
        path.join(agentsDir, "orchestrator.md"),
        "utf-8",
      );
      assert.ok(
        orchestratorMd.includes("edit: deny"),
        "Orchestrator não deve editar código diretamente (apenas planejar, definir produto e designar)",
      );

      const backendMd = fs.readFileSync(
        path.join(agentsDir, "backend.md"),
        "utf-8",
      );
      assert.ok(
        backendMd.includes("NÃO** escreve testes"),
        "Backend deve escrever apenas código, sem testes por task",
      );

      const frontendMd = fs.readFileSync(
        path.join(agentsDir, "frontend.md"),
        "utf-8",
      );
      assert.ok(
        frontendMd.includes("NÃO** escreve testes"),
        "Frontend deve escrever apenas código, sem testes por task",
      );

      const qaTesterMd = fs.readFileSync(
        path.join(agentsDir, "qa-tester.md"),
        "utf-8",
      );
      assert.ok(
        qaTesterMd.includes("por Sprint"),
        "QA Tester deve atuar por Sprint validando regras e evitando testes desnecessários",
      );
      assert.ok(
        qaTesterMd.includes("NUNCA Rode Todos os Testes"),
        "QA Tester só deve rodar os testes relacionados à Sprint entregue, nunca toda a suíte sem solicitação",
      );

      for (const agent of EXPECTED_AGENTS) {
        const content = fs.readFileSync(
          path.join(agentsDir, `${agent}.md`),
          "utf-8",
        );

        assert.ok(
          content.length <= 3600,
          `Agente ${agent}.md excedeu o limite performático (${content.length} chars > 3600)`,
        );

        if (agent !== "orchestrator") {
          assert.ok(
            content.includes("todowrite: deny"),
            `Subagente ${agent}.md deve ter 'todowrite: deny'`,
          );
          assert.ok(
            content.includes("Contrato de Retorno"),
            `Subagente ${agent}.md deve definir um 'Contrato de Retorno' compacto`,
          );
        }
      }
    });
  });
});
