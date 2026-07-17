/**
 * harness-advance.test.ts — Testes do motor de transição de fases (PRD-01)
 *
 * Cobertura P0:
 *   - Fluxo feliz: fase 2 com artefatos válidos → transiciona para fase 3
 *   - Caso de borda: score de PRD abaixo do mínimo → recusa transição sem alterar state.json
 *   - Caso de borda: force=true → transiciona mesmo sem gate passar (loga warning)
 *   - Caso de borda: state.json ausente → retorna erro claro
 *   - Gate type desconhecido → retorna falha fatal
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Cria um diretório temporário de teste com o harness inicializado.
 * @param statePatch Campos a sobrescrever no state.json padrão
 * @param phasePatch Campos a sobrescrever na fase corrente do state-machine.json
 * @returns Objeto com o path do tempDir e cleanup fn
 */
function createFakeProject(
  statePatch: Record<string, any> = {},
  gateOverride?: Record<string, any>
) {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "harness-advance-test-"));
  const harnessDir = path.join(dir, ".harness");
  fs.mkdirSync(harnessDir, { recursive: true });

  const defaultState = {
    _type: "harness-state-v6",
    version: 1,
    project: "test-project",
    stateMachineVersion: 1,
    currentPhase: "phase.2.requisitos",
    currentSprint: null,
    phases: {
      "phase.2.requisitos": {
        status: "pending",
        owner: "requirements",
        startedAt: null,
        completedAt: null,
        gate: null,
        score: null,
        attempt: 0,
      },
      "phase.3.design": {
        status: "pending",
        owner: "designer",
        startedAt: null,
        completedAt: null,
        gate: null,
        score: null,
        attempt: 0,
      },
    },
    sprints: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...statePatch,
  };

  const defaultGate = gateOverride || {
    type: "score-threshold",
    checks: [
      { agent: "prd-reviewer", minScore: 80, file: ".harness/reviews/prd-review-latest.json" },
      { agent: "spec-reviewer", minScore: 85, file: ".harness/reviews/spec-review-latest.json" },
    ],
  };

  const stateMachine = {
    phases: [
      {
        id: "phase.2.requisitos",
        name: "Requisitos",
        owner: "requirements",
        gate: defaultGate,
        next: ["phase.3.design"],
        onFailure: { maxAutoRetries: 2, loopbackTo: "phase.2.requisitos" },
      },
      {
        id: "phase.3.design",
        name: "Design",
        owner: "designer",
        gate: { type: "user-approval" },
        next: ["phase.4.planejamento"],
      },
    ],
  };

  const failureProtocol = {
    classes: {
      transient: { maxAutoRetries: 3 },
      quality: { maxAutoRetries: 2 },
    },
  };

  fs.writeFileSync(path.join(harnessDir, "state.json"), JSON.stringify(defaultState, null, 2));
  fs.writeFileSync(path.join(harnessDir, "state-machine.json"), JSON.stringify(stateMachine, null, 2));
  fs.writeFileSync(path.join(harnessDir, "failure-protocol.json"), JSON.stringify(failureProtocol, null, 2));
  fs.writeFileSync(path.join(harnessDir, "events.jsonl"), "");

  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, harnessDir, cleanup };
}

/**
 * Cria arquivos de review físicos na pasta .harness/reviews/ com scores definidos.
 * @param harnessDir Path do diretório .harness
 * @param scores Mapa agent → score
 */
function seedReviews(harnessDir: string, scores: Record<string, number>) {
  const reviewsDir = path.join(harnessDir, "reviews");
  fs.mkdirSync(reviewsDir, { recursive: true });
  for (const [agent, score] of Object.entries(scores)) {
    const prefix = agent.replace("-reviewer", "");
    fs.writeFileSync(
      path.join(reviewsDir, `${prefix}-review-latest.json`),
      JSON.stringify({ score, agent, reviewedAt: new Date().toISOString() })
    );
  }
}

// ─── Importação dinâmica (ESM) ───────────────────────────────────────────────
// harness-advance usa 'tool()' do SDK que precisa do contexto correto
// Importamos as funções internas via isolamento de módulo re-exportado

// Como o harness-advance exporta apenas o tool, testamos via execute() direto
// usando um wrapper que redireciona context.directory para o nosso dir temporário
async function runAdvance(
  dir: string,
  args: Record<string, any>
): Promise<Record<string, any>> {
  // Importação dinâmica para garantir instância limpa por teste
  const mod = await import(`../tools/harness-advance.ts?_=${Date.now()}`);
  const advanceTool = mod.default;
  return advanceTool.execute(args, { directory: dir });
}

// ─── Testes ─────────────────────────────────────────────────────────────────

test("harness-advance — suite P0 (PRD-01)", async (t) => {

  await t.test("1. Fluxo feliz: scores acima do mínimo → transiciona para fase 3 e registra evento", async () => {
    const { dir, harnessDir, cleanup } = createFakeProject();
    try {
      seedReviews(harnessDir, { "prd-reviewer": 85, "spec-reviewer": 90 });

      const result = await runAdvance(dir, { scores: { "prd-reviewer": 85, "spec-reviewer": 90 } });

      assert.strictEqual(result.success, true, `Esperava sucesso, obteve: ${JSON.stringify(result)}`);
      assert.strictEqual(result.previousPhase, "phase.2.requisitos");
      assert.strictEqual(result.currentPhase, "phase.3.design");

      // Verifica que state.json foi atualizado
      const state = JSON.parse(fs.readFileSync(path.join(harnessDir, "state.json"), "utf8"));
      assert.strictEqual(state.currentPhase, "phase.3.design");
      assert.strictEqual(state.phases["phase.2.requisitos"].status, "completed");

      // Verifica que o evento foi registrado em events.jsonl
      const events = fs.readFileSync(path.join(harnessDir, "events.jsonl"), "utf8")
        .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const phaseCompleted = events.find((e) => e.event === "phase.completed");
      assert.ok(phaseCompleted, "Evento phase.completed deve estar em events.jsonl");
      assert.strictEqual(phaseCompleted.phase, "phase.2.requisitos");
    } finally {
      cleanup();
    }
  });

  await t.test("2. Gate reprovado: score abaixo do mínimo → recusa transição e não altera state.json", async () => {
    const { dir, harnessDir, cleanup } = createFakeProject();
    try {
      // PRD score = 75 (abaixo do mínimo 80)
      seedReviews(harnessDir, { "prd-reviewer": 75, "spec-reviewer": 90 });

      const stateAntes = fs.readFileSync(path.join(harnessDir, "state.json"), "utf8");
      const result = await runAdvance(dir, { scores: { "prd-reviewer": 75, "spec-reviewer": 90 } });

      assert.strictEqual(result.success, false, "Esperava falha quando score < mínimo");
      assert.ok(result.gateResult?.reason, "Deve retornar motivo de falha");
      assert.ok(
        result.gateResult.reason.includes("75") || result.gateResult.reason.includes("80"),
        `Motivo deve mencionar scores, obteve: ${result.gateResult.reason}`
      );

      // state.json NÃO deve ter sido alterado
      const stateDepois = fs.readFileSync(path.join(harnessDir, "state.json"), "utf8");
      const stateObj = JSON.parse(stateDepois);
      assert.strictEqual(
        stateObj.currentPhase,
        "phase.2.requisitos",
        "currentPhase não deve mudar após gate reprovado"
      );
    } finally {
      cleanup();
    }
  });

  await t.test("3. force=true → transiciona fase mesmo sem gate passar, e loga warning", async () => {
    const { dir, harnessDir, cleanup } = createFakeProject();
    try {
      // Sem reviews seedadas — gate falharia normalmente
      const result = await runAdvance(dir, { force: true });

      assert.strictEqual(result.success, true, "force=true deve sempre retornar sucesso");
      assert.strictEqual(result.reason, "forced");

      // Evento gate.forced deve estar no log
      const events = fs.readFileSync(path.join(harnessDir, "events.jsonl"), "utf8")
        .trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const forced = events.find((e) => e.event === "gate.forced");
      assert.ok(forced, "Evento gate.forced deve ser registrado ao usar force=true");
    } finally {
      cleanup();
    }
  });

  await t.test("4. state.json ausente → retorna erro claro sem lançar exceção não tratada", async () => {
    const { dir, cleanup } = createFakeProject();
    try {
      // Remove state.json para simular projeto não inicializado
      fs.rmSync(path.join(dir, ".harness", "state.json"));

      const result = await runAdvance(dir, {});

      assert.strictEqual(result.success, false);
      assert.ok(result.error, "Deve retornar campo error com explicação");
      assert.ok(
        result.error.toLowerCase().includes("state.json"),
        `Mensagem de erro deve mencionar state.json, obteve: ${result.error}`
      );
    } finally {
      cleanup();
    }
  });

  await t.test("5. Gate type desconhecido → retorna falha classificada como fatal", async () => {
    const { dir, cleanup } = createFakeProject(
      {},
      { type: "tipo-invalido-inexistente" }
    );
    try {
      const result = await runAdvance(dir, {});

      assert.strictEqual(result.success, false);
      assert.ok(
        result.gateResult?.failureClass === "fatal" || result.action === "halt",
        `Gate inválido deve retornar falha fatal, obteve: ${JSON.stringify(result)}`
      );
    } finally {
      cleanup();
    }
  });

  await t.test("6. Divergência de score: score fornecido difere do score real → recusa com mensagem de fraude", async () => {
    const { dir, harnessDir, cleanup } = createFakeProject();
    try {
      // Score real no arquivo: 85, score fornecido no parâmetro: 95 (divergência)
      seedReviews(harnessDir, { "prd-reviewer": 85, "spec-reviewer": 90 });

      const result = await runAdvance(dir, { scores: { "prd-reviewer": 95, "spec-reviewer": 90 } });

      assert.strictEqual(result.success, false);
      assert.ok(
        result.gateResult?.reason?.toLowerCase().includes("divergencia") ||
        result.gateResult?.reason?.toLowerCase().includes("fraude"),
        `Deve detectar divergência, obteve: ${result.gateResult?.reason}`
      );
    } finally {
      cleanup();
    }
  });
});
