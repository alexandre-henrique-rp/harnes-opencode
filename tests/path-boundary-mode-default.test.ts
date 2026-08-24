// tests/path-boundary-mode-default.test.ts
//
// Regressão A2 (baseline): o default do path boundary era "fail-open",
// permitindo escrita em qualquer projeto sem allowlist. Esse comportamento
// e inseguro por construção: zero configuracao = permissividade total.
//
// v6.5.0: default passou a ser fail-closed. Para manter fail-open
// explicitamente, defina HARNESS_PATH_BOUNDARY_MODE=fail-open.
//
// Estes testes chamam `evaluate()` diretamente para isolar do setupPlugin
// (que sempre seta a env var) e validar o default sem monkey-patching.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluate } from "../plugins/path-boundary.ts";

function withCleanEnv<T>(fn: () => T): T {
  const orig = process.env.HARNESS_PATH_BOUNDARY_MODE;
  delete process.env.HARNESS_PATH_BOUNDARY_MODE;
  try {
    return fn();
  } finally {
    if (orig === undefined) delete process.env.HARNESS_PATH_BOUNDARY_MODE;
    else process.env.HARNESS_PATH_BOUNDARY_MODE = orig;
  }
}

test("A2 — sem env var, default e fail-closed (escrita em src/ SEM allowlist BLOQUEIA)", () => {
  withCleanEnv(() => {
    const result = evaluate({
      agent: "default",
      filePath: "/tmp/some-project/src/index.ts",
      action: "write",
      config: {
        cwd: "/tmp/some-project",
        agents: {},
        defaultDeny: true,
      },
    });
    assert.strictEqual(
      result.ok,
      false,
      "A2: sem allowlist e sem env var, escrita deve BLOQUEAR (fail-closed default)",
    );
  });
});

test("A2 — HARNESS_PATH_BOUNDARY_MODE=fail-open explicito ainda funciona (compat)", () => {
  process.env.HARNESS_PATH_BOUNDARY_MODE = "fail-open";
  try {
    const result = evaluate({
      agent: "default",
      filePath: "/tmp/some-project/src/index.ts",
      action: "write",
      config: {
        cwd: "/tmp/some-project",
        agents: {},
        defaultDeny: false,
      },
    });
    assert.strictEqual(
      result.ok,
      true,
      "A2 compat: fail-open explicito deve permitir escrita sem allowlist",
    );
  } finally {
    delete process.env.HARNESS_PATH_BOUNDARY_MODE;
  }
});

test("A2 — HARNESS_PATH_BOUNDARY_MODE=valor-invalido cai no default fail-closed", () => {
  process.env.HARNESS_PATH_BOUNDARY_MODE = "banana";
  try {
    const result = evaluate({
      agent: "default",
      filePath: "/tmp/some-project/src/index.ts",
      action: "write",
      config: {
        cwd: "/tmp/some-project",
        agents: {},
        defaultDeny: true,
      },
    });
    assert.strictEqual(result.ok, false, "A2: valor invalido deve cair no fail-closed");
  } finally {
    delete process.env.HARNESS_PATH_BOUNDARY_MODE;
  }
});

test("A2 — HARNESS_PATH_BOUNDARY_MODE=fail-closed explicito BLOQUEIA sem allowlist", () => {
  process.env.HARNESS_PATH_BOUNDARY_MODE = "fail-closed";
  try {
    const result = evaluate({
      agent: "default",
      filePath: "/tmp/some-project/src/index.ts",
      action: "write",
      config: {
        cwd: "/tmp/some-project",
        agents: {},
        defaultDeny: true,
      },
    });
    assert.strictEqual(result.ok, false, "A2: fail-closed explicito deve bloquear");
    const reason = result.reason ?? "";
    assert.ok(
      reason.includes("allowlist") || reason.includes("fail-closed"),
      `Mensagem deve mencionar allowlist ou fail-closed, obteve: ${reason}`,
    );
  } finally {
    delete process.env.HARNESS_PATH_BOUNDARY_MODE;
  }
});
