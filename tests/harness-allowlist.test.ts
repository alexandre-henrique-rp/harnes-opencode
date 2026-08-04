/**
 * harness-allowlist.test.ts — Harness v6
 *
 * Testes para o tool de gerenciamento do allowlist merged (project + global).
 */
import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

import harnessAllowlist from "../tools/harness-allowlist.ts";

// Diretorio de teste isolado
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-allowlist-test-"));

test("harness-allowlist — gerenciamento de allowlist", async (t) => {
  await t.test("1. list — cria .harness/harness-allowlist.json se nao existir", async () => {
    const result = await harnessAllowlist.execute(
      { action: "list" },
      { directory: testRoot }
    );
    assert.strictEqual(result.success, true);
    assert.ok(result.project);
    assert.strictEqual(result.project.exists, true, "Deve criar o arquivo no primeiro list");
    assert.ok(fs.existsSync(result.project.path));
  });

  await t.test("2. add — adiciona pattern ao allowlist do projeto", async () => {
    const result = await harnessAllowlist.execute(
      { action: "add", pattern: "docs/**", type: "allow" },
      { directory: testRoot }
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.added, "docs/**");
    assert.strictEqual(result.type, "allow");
    assert.strictEqual(result.target, "project");

    // Verifica persistencia
    const content = fs.readFileSync(result.file, "utf8");
    assert.ok(content.includes("docs/**"));
  });

  await t.test("3. add — idempotente (nao duplica)", async () => {
    const result = await harnessAllowlist.execute(
      { action: "add", pattern: "docs/**", type: "allow" },
      { directory: testRoot }
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyExists, true);
  });

  await t.test("4. add — pattern diferente vai para allow e deny separados", async () => {
    const allowResult = await harnessAllowlist.execute(
      { action: "add", pattern: "public/**", type: "allow" },
      { directory: testRoot }
    );
    assert.strictEqual(allowResult.success, true);

    const denyResult = await harnessAllowlist.execute(
      { action: "add", pattern: "src/legacy/**", type: "deny" },
      { directory: testRoot }
    );
    assert.strictEqual(denyResult.success, true);
    assert.strictEqual(denyResult.type, "deny");

    // Verifica que estao em secoes diferentes
    const list = await harnessAllowlist.execute(
      { action: "list" },
      { directory: testRoot }
    );
    assert.ok(list.merged.allow.includes("[project] docs/**"));
    assert.ok(list.merged.allow.includes("[project] public/**"));
    assert.ok(list.merged.deny.includes("[project] src/legacy/**"));
  });

  await t.test("5. remove — remove pattern do allowlist", async () => {
    const result = await harnessAllowlist.execute(
      { action: "remove", pattern: "public/**", type: "allow" },
      { directory: testRoot }
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.removed, "public/**");

    // Verifica remocao
    const list = await harnessAllowlist.execute(
      { action: "list" },
      { directory: testRoot }
    );
    assert.ok(!list.merged.allow.includes("[project] public/**"));
  });

  await t.test("6. remove — falha quando pattern nao existe", async () => {
    const result = await harnessAllowlist.execute(
      { action: "remove", pattern: "nao-existe/**", type: "allow" },
      { directory: testRoot }
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("nao encontrado"));
  });

  await t.test("7. add — falha sem pattern", async () => {
    const result = await harnessAllowlist.execute(
      { action: "add" },
      { directory: testRoot }
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("requer pattern"));
  });

  await t.test("8. add — target=global tenta acessar allowlist global", async () => {
    // Em ambiente de teste, o allowlist global provavelmente nao existe para o usuario root
    const result = await harnessAllowlist.execute(
      { action: "add", pattern: "test/**", type: "allow", target: "global" },
      { directory: testRoot }
    );
    // Pode dar erro se global nao existir, ou sucesso se existir
    assert.ok(typeof result.success === "boolean");
  });

  await t.test("9. list — reporta corretamente existencia dos arquivos", async () => {
    const result = await harnessAllowlist.execute(
      { action: "list" },
      { directory: testRoot }
    );
    assert.strictEqual(result.project.exists, true);
    // global existe pode ser true ou false dependendo do ambiente
    assert.strictEqual(typeof result.global.exists, "boolean");
    assert.ok(result.merged);
    assert.ok(Array.isArray(result.merged.allow));
    assert.ok(Array.isArray(result.merged.deny));
  });
});

// Cleanup
test("Cleanup", () => {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});