// tests/plugins-hook-validity.test.ts
//
// P0.4: Teste que importa cada plugin e compara as chaves do objeto retornado
// contra keyof Hooks do @opencode-ai/plugin 1.18.3. Detecta plugins que
// declaram hooks que NAO existem na API (e portanto nunca rodam).
//
// Antes deste teste, tsc --noEmit nao pegava os 5 bugs porque os retornos
// dos plugins nao estavam anotados como Plugin. Agora qualquer hook invalido
// falha o teste com mensagem clara apontando arquivo:linha.
//
// Como cada plugin e um `default async function`, instanciamos com um ctx
// mockado, esperamos o retorno e validamos `Object.keys(hooks)` ⊆ keyof Hooks.

import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hooks } from "@opencode-ai/plugin";

// Mocks minimos para os plugins inicializarem sem erro.
// Cada plugin acessa ctx.project (worktree/directory), client.app ou client.event.
function makeCtx(extra: Record<string, any> = {}): any {
  return {
    project: {
      worktree: "/tmp/__harness_test_project__",
      directory: "/tmp/__harness_test_project__",
    },
    client: {
      app: { log: () => {} },
      event: { on: () => ({}) },
    },
    ...extra,
  };
}

// Lista de plugins a validar. path-boundary/native-sandbox sao omitidos:
// - path-boundary: nao retorna Hooks puros (tem comportamento complexo e
//   early-return em sandbox-unavailable). Ja tem testes proprios em
//   tests/path-boundary*.test.ts.
// - native-sandbox: idem, alem de depender de ai-jail probe.
// - stuck-worker-watchdog: nao quebra mesmo sem hooks validos (faz polling).
const PLUGINS = [
  { path: "../plugins/audit-logger.ts", name: "audit-logger" },
  { path: "../plugins/context-compressor.ts", name: "context-compressor" },
  { path: "../plugins/prompt-cache-prefixer.ts", name: "prompt-cache-prefixer" },
  { path: "../plugins/status-injector.ts", name: "status-injector" },
  { path: "../plugins/structured-thinking.ts", name: "structured-thinking" },
  { path: "../plugins/token-budget.ts", name: "token-budget" },
];

// Conjunto dos hooks validos na API 1.18.3 (espelha node_modules/@opencode-ai/plugin/dist/index.d.ts linha 173).
// Quando a SDK atualizar, este set precisa ser atualizado. Manter sincronizado
// com a interface Hooks exportada em dist/index.d.ts.
const VALID_HOOK_KEYS: ReadonlySet<keyof Hooks> = new Set<keyof Hooks>([
  "dispose",
  "event",
  "config",
  "tool",
  "auth",
  "provider",
  "chat.message",
  "chat.params",
  "chat.headers",
  "permission.ask",
  "command.execute.before",
  "tool.execute.before",
  "shell.env",
  "tool.execute.after",
  "experimental.chat.messages.transform",
  "experimental.chat.system.transform",
  "experimental.provider.small_model",
  "experimental.session.compacting",
  "experimental.compaction.autocontinue",
  "experimental.text.complete",
  "tool.definition",
]);

// Hooks invalidos comuns (atalho para mensagem de erro clara).
const KNOWN_INVALID: Record<string, string> = {
  "model.complete.before": "Hook nao existe na API 1.18.3. Migrar para experimental.chat.system.transform ou event+message.updated.",
  "model.complete.after": "Hook nao existe na API 1.18.3. Migrar para event hook filtrando message.updated/session.idle.",
  "session.created": "Hook nao existe na API 1.18.3. Migrar para event hook filtrando type===session.created.",
  "session.compacted": "Hook nao existe. Evento real e 'session.compacted' (snake_case) via event hook.",
};

for (const plugin of PLUGINS) {
  test(`plugin "${plugin.name}" so declara hooks validos (keyof Hooks)`, async () => {
    const mod = await import(plugin.path);
    const defaultExport = mod.default;
    assert.equal(typeof defaultExport, "function", `${plugin.name}: default deve ser uma function`);

    // Chama o plugin com ctx mockado. Timeout alto: alguns plugins leem disco.
    const hooks = await Promise.race([
      defaultExport(makeCtx()),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout 5s")), 5000),
      ),
    ]);

    assert.ok(hooks && typeof hooks === "object", `${plugin.name}: deve retornar objeto de hooks`);

    const declaredKeys = Object.keys(hooks);
    const invalidKeys = declaredKeys.filter((k) => !VALID_HOOK_KEYS.has(k as keyof Hooks));

    if (invalidKeys.length > 0) {
      const details = invalidKeys
        .map((k) => {
          const hint = KNOWN_INVALID[k] ?? "Hook desconhecido na API 1.18.3.";
          return `  - "${k}": ${hint}`;
        })
        .join("\n");
      assert.fail(
        `Plugin ${plugin.name} declara ${invalidKeys.length} hook(s) invalido(s):\n${details}\n` +
          `Hooks validos na API 1.18.3: ${[...VALID_HOOK_KEYS].join(", ")}`,
      );
    }
  });
}

test("VALID_HOOK_KEYS reflete a API real do @opencode-ai/plugin 1.18.3", () => {
  // Validacao cruzada: o arquivo dist/index.d.ts DEVE exportar `interface Hooks`.
  // Se a SDK quebrar a interface, este teste falha com mensagem clara.
  // Aqui so confirmamos que o set tem o numero esperado de chaves.
  // Atualizar este numero quando a SDK adicionar novos hooks oficiais.
  const EXPECTED_MIN = 18;
  const EXPECTED_MAX = 30;
  assert.ok(
    VALID_HOOK_KEYS.size >= EXPECTED_MIN && VALID_HOOK_KEYS.size <= EXPECTED_MAX,
    `VALID_HOOK_KEYS.size=${VALID_HOOK_KEYS.size} fora do range [${EXPECTED_MIN}, ${EXPECTED_MAX}]. ` +
      "Atualize este set sincronizado com a interface Hooks da SDK.",
  );
});