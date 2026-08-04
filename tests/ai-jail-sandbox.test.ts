/**
 * ai-jail-sandbox.test.ts — Harness v6
 *
 * Testes de resiliência do sandbox ai-jail/bwrap:
 *   - probeSandbox: detecta bwrap funcional vs indisponível
 *   - diagnoseSandbox (harness-workspace): recomendação contextual
 *   - harness-status: nunca quebra, sempre retorna JSON
 *
 * Estes testes simulam diferentes estados do sandbox via mock de
 * child_process para garantir comportamento defensivo em ambientes
 * sem user namespaces (WSL2, Docker, kernels hardened).
 */
import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Importa as funções a serem testadas
import harnessWorkspace, {
  diagnoseSandbox,
  persistDiagnostic,
  ensureAiJailConfig,
} from "../tools/harness-workspace.ts";
import harnessStatus from "../tools/harness-status.ts";

// ============================================================================
// Helpers de mock para child_process
// ============================================================================

/**
 * Stub simples: quando invocado, simula o resultado de execSync/execFileSync.
 * Mutate as variáveis de ambiente para controlar o caminho do sandbox.
 */
function clearSandboxEnv(): void {
  delete process.env.AI_JAIL_ACTIVE;
  delete process.env.HARNESS_NO_SANDBOX;
}

function withSandboxEnv(vars: Record<string, string>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// Diretório de teste isolado
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-sandbox-test-"));

test("Resiliência do sandbox ai-jail/bwrap", async (t) => {
  // Setup inicial
  fs.mkdirSync(path.join(testRoot, ".harness"), { recursive: true });

  await t.test("1. diagnoseSandbox — sem ai-jail instalado, retorna recomendação de instalar", () => {
    clearSandboxEnv();
    // Quando ai-jail não está no PATH (este ambiente de CI provavelmente não tem),
    // diagnoseSandbox deve retornar recommendation apontando o GitHub
    const diag = diagnoseSandbox();

    assert.strictEqual(typeof diag.aiJailInstalled, "boolean");
    assert.strictEqual(typeof diag.bwrapWorks, "boolean");
    assert.strictEqual(typeof diag.recommendation, "string");

    if (!diag.aiJailInstalled) {
      assert.ok(
        diag.recommendation.includes("ai-jail") ||
          diag.recommendation.includes("Instale"),
        `Recomendação deve mencionar instalação: ${diag.recommendation}`
      );
      assert.strictEqual(diag.bwrapWorks, false, "bwrap deve ser false se ai-jail ausente");
    }
  });

  await t.test("2. diagnoseSandbox — AI_JAIL_ACTIVE=1 marca sandbox como disponível", () => {
    withSandboxEnv({ AI_JAIL_ACTIVE: "1" }, () => {
      const diag = diagnoseSandbox();
      assert.strictEqual(diag.alreadySandboxed, true);
      // Se a sessão pai já está sandboxed, bwrap "funciona" por herança
      assert.strictEqual(diag.bwrapWorks, true);
      assert.ok(diag.recommendation.includes("AI_JAIL_ACTIVE=1"));
    });
  });

  await t.test("3. diagnoseSandbox — sempre retorna objeto bem-formado mesmo em erro", () => {
    clearSandboxEnv();
    const diag = diagnoseSandbox();

    // Schema mínimo garantido
    assert.ok("aiJailInstalled" in diag);
    assert.ok("bwrapWorks" in diag);
    assert.ok("userNamespacesEnabled" in diag);
    assert.ok("alreadySandboxed" in diag);
    assert.ok("recommendation" in diag);
    assert.ok("details" in diag);
    assert.strictEqual(typeof diag.details, "object");
  });

  await t.test("4. diagnoseSandbox — userNamespacesEnabled é null em non-Linux", () => {
    clearSandboxEnv();
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin", configurable: true });
    try {
      const diag = diagnoseSandbox();
      assert.strictEqual(diag.userNamespacesEnabled, null);
    } finally {
      Object.defineProperty(process, "platform", { value: originalPlatform, configurable: true });
    }
  });

  await t.test("5. persistDiagnostic — grava .harness/sandbox-diagnostic.json", () => {
    const diag = diagnoseSandbox();
    const diagPath = persistDiagnostic(testRoot, diag);
    assert.ok(fs.existsSync(diagPath), `Arquivo de diagnóstico deve existir: ${diagPath}`);

    const saved = JSON.parse(fs.readFileSync(diagPath, "utf8"));
    assert.ok(saved.platform, "Deve registrar plataforma");
    assert.ok(saved.nodeVersion, "Deve registrar versão do Node");
    assert.ok(saved.checkedAt, "Deve registrar timestamp");
    assert.strictEqual(typeof saved.bwrapWorks, "boolean");
  });

  await t.test("6. harness-workspace tool — retorna diagnóstico sem quebrar", async () => {
    const result = await harnessWorkspace.execute({}, { directory: testRoot });
    assert.strictEqual(result.success, true);
    assert.ok(result.path, "Deve retornar caminho do tmp dir");
    assert.ok(result.message);

    // Sandbox info deve estar presente (pode ser null se exec falhou)
    if (result.sandbox) {
      assert.strictEqual(typeof result.sandbox.bwrapWorks, "boolean");
      assert.strictEqual(typeof result.sandbox.aiJailInstalled, "boolean");
      assert.ok(typeof result.sandbox.recommendation === "string");
      assert.ok(result.sandbox.diagnosticFile, "Deve apontar para .harness/sandbox-diagnostic.json");
      assert.ok(
        fs.existsSync(result.sandbox.diagnosticFile),
        `Arquivo de diagnóstico deve existir: ${result.sandbox.diagnosticFile}`
      );
    }
  });

  await t.test("7. harness-status — NUNCA propaga throw, sempre retorna JSON válido", async () => {
    // Cenário 1: .harness/ inexistente (diretório vazio)
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-empty-"));
    try {
      const result = await harnessStatus.execute({}, { directory: emptyDir });
      // mcpResponse adiciona `content` — garantir formato MCP
      assert.ok(Array.isArray(result.content));
      assert.strictEqual(result.content[0].type, "text");

      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.success, false);
      assert.strictEqual(parsed.initialized, false);
      assert.ok(parsed.error.includes(".harness/"));
      assert.ok(parsed.recommendation.includes("harness-init"));
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  await t.test("8. harness-status — state.json corrompido é tratado graciosamente", async () => {
    const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-corrupt-"));
    const harnessDir = path.join(corruptDir, ".harness");
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.writeFileSync(path.join(harnessDir, "state.json"), "{ isto nao é JSON valido !!!");

    try {
      const result = await harnessStatus.execute({}, { directory: corruptDir });
      const parsed = JSON.parse(result.content[0].text);
      assert.strictEqual(parsed.success, false);
      assert.ok(parsed.error.includes("corrompido") || parsed.error.includes("corrupted"));
      assert.ok(parsed.recommendation.includes("harness-init --force"));
    } finally {
      fs.rmSync(corruptDir, { recursive: true, force: true });
    }
  });

  await t.test("9. harness-status — state.json válido reporta progresso", async () => {
    const okDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-ok-"));
    const harnessDir = path.join(okDir, ".harness");
    fs.mkdirSync(harnessDir, { recursive: true });

    const fakeState = {
      _type: "harness-state-v6",
      version: 1,
      project: "test-proj",
      currentPhase: "phase.0.briefing",
      currentSprint: null,
      phases: {
        "phase.0.briefing": { status: "completed" },
        "phase.1.documentation": { status: "in_progress" },
        "phase.2.requirements": { status: "pending" },
      },
      sprints: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(harnessDir, "state.json"), JSON.stringify(fakeState));
    fs.writeFileSync(path.join(harnessDir, "events.jsonl"), "");
    fs.writeFileSync(
      path.join(harnessDir, "state-machine.json"),
      JSON.stringify({ phases: [
        { id: "phase.0.briefing", name: "Briefing", owner: "briefing" },
        { id: "phase.1.documentation", name: "Documentation", owner: "documenter" },
        { id: "phase.2.requirements", name: "Requirements", owner: "requirements" },
      ] })
    );

    try {
      const result = await harnessStatus.execute({ verbose: true }, { directory: okDir });
      const parsed = JSON.parse(result.content[0].text);

      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.initialized, true);
      assert.strictEqual(parsed.project, "test-proj");
      assert.strictEqual(parsed.currentPhase, "phase.0.briefing");
      assert.strictEqual(parsed.progress.completed, 1);
      assert.strictEqual(parsed.progress.total, 3);
      assert.ok(parsed.phases, "verbose deve retornar phases");
    } finally {
      fs.rmSync(okDir, { recursive: true, force: true });
    }
  });

  await t.test("10. ensureAiJailConfig — não bloqueia se ai-jail ausente", () => {
    // Se ai-jail não está instalado, deve retornar created:false sem throw
    const result = ensureAiJailConfig(testRoot);
    assert.strictEqual(typeof result.created, "boolean");
  });
});

// Cleanup final
test("Cleanup", () => {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});