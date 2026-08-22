/**
 * harness-doctor.test.ts — Harness v6
 *
 * Testes para o diagnostico consolidado.
 */
import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import harnessDoctor from "../tools/harness-doctor.ts";

const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-doctor-test-"));

test("harness-doctor — diagnostico consolidado", async (t) => {
  await t.test("1. summary — retorna status, score e issues", async () => {
    const result = await harnessDoctor.execute(
      { report: "summary" },
      { directory: testRoot }
    );
    assert.strictEqual(result.status === "ok" || result.status === "warning" || result.status === "error", true);
    assert.strictEqual(typeof result.score, "number");
    assert.ok(Array.isArray(result.issues));
    assert.ok(Array.isArray(result.topRecommendations));
  });

  await t.test("2. full — retorna relatorio completo", async () => {
    const result = await harnessDoctor.execute(
      { report: "full" },
      { directory: testRoot }
    );
    assert.ok(result.summary);
    assert.ok(result.environment);
    assert.ok(result.harness);
    assert.ok(result.allowlist);
    assert.ok(result.sandbox);
    assert.ok(result.audit);
    assert.ok(Array.isArray(result.recommendations));

    // Environment
    assert.strictEqual(typeof result.environment.platform, "string");
    assert.ok(result.environment.node.startsWith("v"));
    assert.ok(result.environment.aiJail);

    // Harness (sem init, deve ter initialized=false)
    assert.strictEqual(result.harness.initialized, false);
  });

  await t.test("3. score baixa quando harness nao inicializado", async () => {
    const result = await harnessDoctor.execute(
      { report: "summary" },
      { directory: testRoot }
    );
    // Sem .harness/, deve ter pelo menos 1 issue high
    assert.ok(result.score < 100, `Score deveria ser < 100 (foi ${result.score})`);
    assert.ok(
      result.issues.some((i: any) => i.priority === "high"),
      "Deve ter pelo menos 1 issue high"
    );
  });

  await t.test("4. inclui info do allowlist", async () => {
    const result = await harnessDoctor.execute(
      { report: "full" },
      { directory: testRoot }
    );
    assert.strictEqual(result.allowlist.projectExists, false, "Sem .harness/ = sem project allowlist");
    assert.ok(result.allowlist.projectPath);
    assert.ok(result.allowlist.globalPath);
    assert.ok(result.allowlist.mergedCount);
  });

  await t.test("5. inclui sandbox status", async () => {
    const result = await harnessDoctor.execute(
      { report: "full" },
      { directory: testRoot }
    );
    assert.ok(result.sandbox.recommendation);
    assert.ok(["available", "unavailable", "disabled"].includes(result.sandbox.status));
  });

  await t.test("6. com harness inicializado, score sobe", async () => {
    // Setup: cria .harness/state.json valido
    fs.mkdirSync(path.join(testRoot, ".harness"), { recursive: true });
    fs.writeFileSync(
      path.join(testRoot, ".harness", "state.json"),
      JSON.stringify({
        _type: "harness-state-v6",
        version: 1,
        project: "test",
        currentPhase: "phase.0.briefing",
        phases: {
          "phase.0.briefing": { status: "completed" },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    );
    fs.writeFileSync(
      path.join(testRoot, ".harness", "state-machine.json"),
      JSON.stringify({ phases: [{ id: "phase.0.briefing", name: "Briefing", owner: "briefing" }] })
    );

    const result = await harnessDoctor.execute(
      { report: "full" },
      { directory: testRoot }
    );
    // Com harness inicializado, deve ter menos issues
    assert.strictEqual(result.harness.initialized, true);
    assert.strictEqual(result.harness.project, "test");
    // Score deve ser >= 70 (apenas deductions por coisas secundarias)
    const score = result.summary ? result.summary.score : result.score;
    assert.ok(score >= 70, `Score >= 70 esperado (foi ${score})`);
  });

  await t.test("7. auto-allow flag aparece no allowlist info", async () => {
    process.env.HARNESS_AUTO_ALLOW_ON_BLOCK = "1";
    try {
      const result = await harnessDoctor.execute(
        { report: "full" },
        { directory: testRoot }
      );
      assert.strictEqual(result.allowlist.autoAllowEnabled, true);
    } finally {
      delete process.env.HARNESS_AUTO_ALLOW_ON_BLOCK;
    }
  });

  await t.test("8. .no-auto-allow detectado no allowlist info", async () => {
    fs.writeFileSync(path.join(testRoot, ".harness", ".no-auto-allow"), "");
    try {
      const result = await harnessDoctor.execute(
        { report: "full" },
        { directory: testRoot }
      );
      assert.strictEqual(result.allowlist.autoAllowDisabledByMarker, true);
    } finally {
      fs.rmSync(path.join(testRoot, ".harness", ".no-auto-allow"));
    }
  });

  await t.test("9. audit log entries contadas corretamente", async () => {
    const auditDir = path.join(testRoot, ".harness", "audit");
    fs.mkdirSync(auditDir, { recursive: true });
    const auditFile = path.join(auditDir, "auto-allow.jsonl");
    fs.writeFileSync(auditFile, [
      '{"ts":"2026-01-01T00:00:00Z","pattern":"a/**","type":"allow","blockedPath":"","source":"auto"}',
      '{"ts":"2026-01-02T00:00:00Z","pattern":"b/**","type":"allow","blockedPath":"","source":"manual"}',
      '{"ts":"2026-01-03T00:00:00Z","pattern":"c/**","type":"deny","blockedPath":"","source":"auto"}',
    ].join("\n") + "\n");

    const result = await harnessDoctor.execute(
      { report: "full" },
      { directory: testRoot }
    );
    assert.strictEqual(result.audit.fileExists, true);
    assert.strictEqual(result.audit.totalEntries, 3);
    assert.ok(result.audit.lastAutoAdd);
    assert.strictEqual(result.audit.lastAutoAdd!.pattern, "c/**");
  });
});

// Cleanup
test("Cleanup", () => {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});