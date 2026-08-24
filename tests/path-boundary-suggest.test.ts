// tests/path-boundary-suggest.test.ts
//
// Regressão A1 (baseline): suggestAllowPattern NUNCA deve retornar "**"
// sozinho. Quando o arquivo está na raiz do projeto, a função retornava
// "**" (devido a `parent.substring(0,-1) === ""`), o que desligava
// permanentemente o path boundary com HARNESS_AUTO_ALLOW_ON_BLOCK=1.
//
// Estes testes cobrem os 4 ramos: raiz com extensao, raiz sem extensao,
// arquivo em subpasta, arquivo em pasta profunda.

import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestAllowPattern } from "../plugins/lib/path-boundary-core.ts";

test("A1 — arquivo na raiz com extensao nao retorna '**' sozinho", () => {
  const r = suggestAllowPattern("package.json");
  assert.notEqual(r, "**", "A1: arquivo na raiz nao pode sugerir '**' (desliga boundary)");
});

test("A1 — arquivo na raiz retorna o proprio nome do arquivo", () => {
  const r = suggestAllowPattern("package.json");
  assert.equal(r, "package.json");
});

test("A1 — varios arquivos comuns na raiz retornam o proprio nome", () => {
  for (const f of [
    "package.json",
    "tsconfig.json",
    "README.md",
    "opencode.json",
    "CHANGELOG.md",
  ]) {
    const r = suggestAllowPattern(f);
    assert.notEqual(r, "**", `${f} na raiz nao pode virar '**'`);
    assert.equal(r, f, `${f} deve retornar seu proprio nome`);
  }
});

test("A1 — arquivo em subpasta retorna '<subpasta>/**'", () => {
  assert.equal(suggestAllowPattern("src/index.ts"), "src/**");
  assert.equal(suggestAllowPattern("plugins/audit-logger.ts"), "plugins/**");
});

test("A1 — arquivo em pasta profunda retorna a pasta pai imediata + /**", () => {
  // O codigo pega o lastIndexOf('/'), entao retorna a pasta pai IMEDIATA
  // (nao a pasta raiz). Isso e mais conservador — libera so o necessario.
  assert.equal(
    suggestAllowPattern("src/components/Button.tsx"),
    "src/components/**",
  );
});

test("A1 — path sem extensao retorna '<path>/**'", () => {
  assert.equal(suggestAllowPattern("docs"), "docs/**");
  assert.equal(suggestAllowPattern("scripts"), "scripts/**");
});

test("A1 — nenhum arquivo na raiz com extensao gera '**'", () => {
  // Apenas arquivos com extensao sao cobertos pela regra "A1".
  // Arquivos sem extensao na raiz (como ".gitignore") recebem padrao
  // "<arquivo>/**", o que nao desliga o boundary globalmente.
  const naoRaiz = ["package.json", "tsconfig.json", "README.md", "opencode.json"];
  for (const f of naoRaiz) {
    const r = suggestAllowPattern(f);
    assert.notEqual(r, "**", `${f} (raiz com extensao) nao pode virar '**'`);
    assert.equal(r, f, `${f} deve retornar seu proprio nome`);
  }
});
