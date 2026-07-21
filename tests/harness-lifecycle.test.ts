/**
 * harness-lifecycle.test.ts — Testes das ferramentas de ciclo de vida do Harness v6:
 * harness-init, harness-status, harness-sync, harness-context
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

import harnessInit from "../tools/harness-init.ts";
import harnessStatus from "../tools/harness-status.ts";
import harnessSync from "../tools/harness-sync.ts";
import harnessContext from "../tools/harness-context.ts";

function createTmpProject() {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "harness-lifecycle-test-"));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, cleanup };
}

test("Suíte de Ciclo de Vida do Harness v6 (init, status, sync, context)", async (t) => {
  await t.test("1. harness-init — inicializa projeto do zero com perfil strict", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const res = await harnessInit.execute({ project: "test-app", profile: "strict" }, { directory: dir });
      assert.strictEqual(res.success, true);
      assert.ok(fs.existsSync(path.join(dir, ".harness", "state.json")));
      assert.ok(fs.existsSync(path.join(dir, ".harness", "events.jsonl")));

      // Idempotência: re-executar sem force deve falhar
      const res2 = await harnessInit.execute({ project: "test-app" }, { directory: dir });
      assert.strictEqual(res2.success, false);
      assert.ok(res2.error.includes("ja existe"));

      // Com force=true deve reinicializar
      const resForce = await harnessInit.execute({ project: "test-app", force: true }, { directory: dir });
      assert.strictEqual(resForce.success, true);
    } finally {
      cleanup();
    }
  });

  await t.test("2. harness-status — lê estado e retorna progresso", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      // Sem .harness/
      const failRes = await harnessStatus.execute({ verbose: true }, { directory: dir });
      assert.strictEqual(failRes.success, false);

      // Inicializa
      await harnessInit.execute({ project: "test-app" }, { directory: dir });

      const statusRes = await harnessStatus.execute({ verbose: true }, { directory: dir });
      assert.strictEqual(statusRes.success, true);
      assert.ok(statusRes.currentPhase);
      assert.ok(statusRes.progress);
    } finally {
      cleanup();
    }
  });

  await t.test("3. harness-sync — sincroniza e move arquivos de configuração para .harness/", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      // Sem .harness/
      const resNoHarness = await harnessSync.execute({}, { directory: dir });
      assert.strictEqual(resNoHarness.success, false);

      // Inicializa .harness/ e cria arquivo solto na raiz
      await harnessInit.execute({ project: "test-app" }, { directory: dir });
      const legacyConfig = path.join(dir, ".ai-jail");
      fs.writeFileSync(legacyConfig, "test-content");

      const syncRes = await harnessSync.execute({}, { directory: dir });
      assert.strictEqual(syncRes.success, true);
      assert.ok(fs.existsSync(path.join(dir, ".harness", ".ai-jail")));
      assert.ok(!fs.existsSync(legacyConfig));
    } finally {
      cleanup();
    }
  });

  await t.test("4. harness-context — gera task description em markdown para sub-agente", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      await harnessInit.execute({ project: "test-app" }, { directory: dir });

      const ctxRes = await harnessContext.execute({
        targetAgent: "backend",
        scope: "Implementar autenticação JWT",
      }, { directory: dir });

      assert.ok(ctxRes);
      // Se retornar string ou objeto com markdown
      const text = typeof ctxRes === "string" ? ctxRes : (ctxRes.content?.[0]?.text || JSON.stringify(ctxRes));
      assert.ok(text.length > 0);
    } finally {
      cleanup();
    }
  });
});
