import { test } from "node:test";
import * as assert from "node:assert";
import gitAutomator from "../tools/git-automator.ts";

const cwd = process.cwd();

test("Suíte de Testes da ferramenta git-automator", async (t) => {
  await t.test("1. status - deve retornar a branch atual e o status do git", async () => {
    const result = await (gitAutomator as any).execute(
      { action: "status" },
      { directory: cwd }
    );
    assert.strictEqual(result.success, true);
    assert.ok(typeof result.branch === "string");
    assert.ok(typeof result.status === "string");
  });

  await t.test("2. commit - deve retornar erro se a mensagem de commit não for fornecida", async () => {
    const result = await (gitAutomator as any).execute(
      { action: "commit" },
      { directory: cwd }
    );
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.error, "Mensagem de commit é obrigatória.");
  });

  await t.test("3. action inválida - deve retornar erro de ação não suportada", async () => {
    const result = await (gitAutomator as any).execute(
      { action: "invalid_action" },
      { directory: cwd }
    );
    assert.strictEqual(result.success, false);
    assert.ok(result.error.startsWith("Ação não suportada"));
  });

  // ---- Casos de regressão para o bug "Cannot read properties of undefined (reading 'split')" ----

  await t.test("4. args null/undefined - deve retornar erro, não crashar", async () => {
    const result = await (gitAutomator as any).execute(null, { directory: cwd });
    assert.strictEqual(result.success, false);
    assert.ok(typeof result.error === "string");
  });

  await t.test("5. args como string - deve retornar erro, não crashar", async () => {
    const result = await (gitAutomator as any).execute("status", { directory: cwd });
    assert.strictEqual(result.success, false);
    assert.ok(typeof result.error === "string");
  });

  await t.test("6. action vazia - deve retornar erro de ação não suportada", async () => {
    const result = await (gitAutomator as any).execute({}, { directory: cwd });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes("Ação não suportada"));
  });

  await t.test("7. files null - deve tratar como lista vazia", async () => {
    const result = await (gitAutomator as any).execute(
      { action: "commit", files: null, message: "test" },
      { directory: cwd }
    );
    // Pode falhar por outro motivo (repo sem git, etc) mas não deve crashar com erro de undefined
    assert.strictEqual(typeof result.success, "boolean");
  });

  await t.test("8. context undefined - deve usar process.cwd()", async () => {
    const result = await (gitAutomator as any).execute({ action: "status" }, undefined);
    assert.strictEqual(typeof result.success, "boolean");
  });
});
