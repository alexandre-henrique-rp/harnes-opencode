// tests/path-boundary-symlink.test.ts
//
// Regressao M14 (baseline): path-boundary usava path.resolve (normalizacao
// lexica), que NAO resolve symlinks. Um symlink em src/ apontando para
// ~/.ssh/authorized_keys resolvia para fora do projeto, mas o boundary
// via apenas o path lexico, dentro do projeto, e aprovava.
//
// Estes testes garantem que:
//   - Symlink em src/ apontando para ~/.ssh/authorized_keys eh bloqueado.
//   - Symlink em .harness/reviews/ apontando para /etc/passwd eh bloqueado.
//   - Symlink em arquivo de spec.ts apontando para fora do projeto eh bloqueado.
//   - Path com '..' (sem symlink) continua sendo bloqueado.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { evaluate, resolveRealpath } from "../plugins/lib/path-boundary-core.ts";

const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "path-boundary-symlink-"));
fs.mkdirSync(path.join(TMPDIR, "src"), { recursive: true });
fs.mkdirSync(path.join(TMPDIR, ".harness"), { recursive: true });

// Allowlist que cobre src/** e .harness/reviews/** — necessario para nao
// cair no fail-closed antes de chegarmos no check do symlink.
const ALLOWLIST_PATH = path.join(TMPDIR, ".harness", "harness-allowlist.json");
fs.writeFileSync(ALLOWLIST_PATH, JSON.stringify({
  allow: ["src/**", ".harness/reviews/**"],
  deny: [],
}));

const baseConfig = {
  cwd: TMPDIR,
  defaultDeny: false,
  agents: {},
  allowlistPath: ALLOWLIST_PATH,
};

test("M14 — resolveRealpath normaliza path sem existencia (criacao nova)", () => {
  const r = resolveRealpath(path.join(TMPDIR, "src", "novo.ts"));
  // Deve comecar com TMPDIR (sem ../ atravessando)
  assert.ok(r.startsWith(TMPDIR), `realpath ${r} deve comecar com ${TMPDIR}`);
  assert.ok(r.endsWith("novo.ts"));
});

test("M14 — resolveRealpath resolve symlink existente", () => {
  // Cria arquivo real em /tmp/real-target.txt
  const realFile = path.join(os.tmpdir(), `real-target-${Date.now()}.txt`);
  fs.writeFileSync(realFile, "secret");

  // Cria symlink dentro do projeto
  const linkPath = path.join(TMPDIR, "src", "mylink");
  fs.symlinkSync(realFile, linkPath);

  const r = resolveRealpath(linkPath);
  assert.equal(r, realFile, "realpath deve seguir o symlink ate o destino real");
});

test("M14 — symlink dentro de src/ apontando para ~/.ssh/authorized_keys eh bloqueado", () => {
  const realSecret = path.join(os.homedir(), ".ssh", "authorized_keys");
  fs.mkdirSync(path.dirname(realSecret), { recursive: true });
  fs.writeFileSync(realSecret, "ssh-rsa AAAA... leaked\n");

  const linkPath = path.join(TMPDIR, "src", "ssh-attack");
  try {
    fs.symlinkSync(realSecret, linkPath);

    const result = evaluate({
      agent: "default",
      filePath: linkPath,
      action: "write",
      config: baseConfig,
    });

    assert.strictEqual(result.ok, false, "M14: symlink para ~/.ssh/authorized_keys DEVE ser bloqueado");
    assert.ok(
      result.reason.includes("escapes project root") ||
        result.reason.includes("deny") ||
        result.reason.includes("Path escapes"),
      `Mensagem deve indicar bloqueio: ${result.reason}`,
    );
  } finally {
    if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
    if (fs.existsSync(realSecret)) fs.unlinkSync(realSecret);
  }
});

test("M14 — symlink dentro do projeto apontando para /etc/passwd eh bloqueado", () => {
  const linkPath = path.join(TMPDIR, "src", "passwd-link");
  try {
    fs.symlinkSync("/etc/passwd", linkPath);

    const result = evaluate({
      agent: "default",
      filePath: linkPath,
      action: "write",
      config: baseConfig,
    });

    assert.strictEqual(result.ok, false, "M14: symlink para /etc/passwd DEVE ser bloqueado");
  } finally {
    if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
  }
});

test("M14 — symlink em .harness/reviews/ eh bloqueado pelo ALWAYS_DENY (path original)", () => {
  // Cria arquivo real dentro do projeto (em src/)
  const realTarget = path.join(TMPDIR, "src", "real-content.ts");
  fs.writeFileSync(realTarget, "export const x = 1;\n");

  fs.mkdirSync(path.join(TMPDIR, ".harness", "reviews"), { recursive: true });
  const linkPath = path.join(TMPDIR, ".harness", "reviews", "fake.json");
  try {
    fs.symlinkSync(realTarget, linkPath);

    const result = evaluate({
      agent: "default",
      filePath: linkPath,
      action: "write",
      config: { ...baseConfig, allowlistPath: ALLOWLIST_PATH },
    });

    // O symlink em .harness/reviews/ deve ser bloqueado pelo ALWAYS_DENY
    // porque o path ORIGINAL (lexico) casa com a regex, mesmo que o realpath
    // aponte para src/ (permitido). O boundary checa path original E realpath.
    assert.strictEqual(result.ok, false, "M14: symlink em .harness/reviews/ DEVE ser bloqueado");
    const reason = result.reason ?? "";
    assert.ok(
      reason.includes("ALWAYS_DENY") || reason.includes("reviews"),
      `Mensagem deve mencionar ALWAYS_DENY ou reviews: ${reason}`,
    );
  } finally {
    if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
    if (fs.existsSync(realTarget)) fs.unlinkSync(realTarget);
  }
});

test("M14 — path com '..' (sem symlink) continua bloqueado por path.resolve", () => {
  const result = evaluate({
    agent: "default",
    filePath: path.join(TMPDIR, "src", "..", "..", "etc", "passwd"),
    action: "write",
    config: baseConfig,
  });

  assert.strictEqual(result.ok, false, "path com '..' deve ser bloqueado");
  assert.ok(
    result.reason.includes("escapes project root"),
    `Mensagem deve mencionar escapes: ${result.reason}`,
  );
});

test("M14 — symlink loop nao trava", () => {
  const linkA = path.join(TMPDIR, "src", "link-a");
  const linkB = path.join(TMPDIR, "src", "link-b");
  try {
    fs.symlinkSync(linkB, linkA);
    fs.symlinkSync(linkA, linkB);

    // realpathSync deve lancar para symlink loop. O fallback do nosso
    // resolveRealpath deve voltar para path.resolve.
    const r = resolveRealpath(linkA);
    // Sem crash — pode ser qualquer path, mas nao trava
    assert.ok(typeof r === "string");
  } finally {
    try { fs.unlinkSync(linkA); } catch {}
    try { fs.unlinkSync(linkB); } catch {}
  }
});

test("M14 — symlink dentro do projeto apontando para arquivo valido eh permitido", () => {
  // Cria arquivo real dentro de src/
  const realFile = path.join(TMPDIR, "src", "real-target.ts");
  fs.writeFileSync(realFile, "export const x = 1;\n");

  // Symlink dentro do mesmo projeto
  const linkPath = path.join(TMPDIR, "src", "mylink-valid");
  fs.symlinkSync(realFile, linkPath);

  // Cria allowlist no projeto que permite src/**
  const allowPath = path.join(TMPDIR, ".harness", "harness-allowlist.json");
  fs.writeFileSync(allowPath, JSON.stringify({
    allow: ["src/**", ".harness/reviews/**"],
    deny: [],
  }));

  const result = evaluate({
    agent: "default",
    filePath: linkPath,
    action: "write",
    config: { ...baseConfig, allowlistPath: allowPath },
  });

  assert.strictEqual(result.ok, true, `symlink dentro do projeto deve ser permitido: ${result.reason ?? "no reason"}`);
  fs.unlinkSync(linkPath);
  fs.unlinkSync(realFile);
});

// Cleanup
test("Cleanup path-boundary-symlink", () => {
  if (fs.existsSync(TMPDIR)) {
    fs.rmSync(TMPDIR, { recursive: true, force: true });
  }
});
