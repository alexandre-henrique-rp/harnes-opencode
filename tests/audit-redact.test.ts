// tests/audit-redact.test.ts
//
// Cobertura M1: redacao de campos sensiveis antes da persistencia do audit log.
// Garante que:
//   - Chaves SENSITIVE viram [REDACTED]
//   - Padroes de secrets (JWT, AWS, GitHub PAT, PEM, connection string) viram [REDACTED]
//   - Recursao em objetos aninhados e arrays funciona
//   - Profundidade maxima evita loop infinito
//   - Strings longas sao truncadas

import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSensitive } from "../plugins/lib/audit-redact.ts";

test("redactSensitive — chave 'password' vira [REDACTED]", () => {
  const r = redactSensitive({ password: "hunter2", user: "alice" });
  assert.equal(r.password, "[REDACTED]");
  assert.equal(r.user, "alice");
});

test("redactSensitive — chave 'AUTHORIZATION' (case-insensitive) vira [REDACTED]", () => {
  const r = redactSensitive({ AUTHORIZATION: "Bearer xyz" });
  assert.equal(r.AUTHORIZATION, "[REDACTED]");
});

test("redactSensitive — chave 'api-token' (com hifen) vira [REDACTED]", () => {
  const r = redactSensitive({ "api-token": "tok_123" });
  assert.equal(r["api-token"], "[REDACTED]");
});

test("redactSensitive — JWT em string e redacted", () => {
  const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const r = redactSensitive({ note: `token=${jwt}` });
  assert.equal(r.note, "token=[REDACTED]");
});

test("redactSensitive — AWS access key id e redacted", () => {
  const r = redactSensitive({ note: "key=AKIAIOSFODNN7EXAMPLE" });
  assert.equal(r.note, "key=[REDACTED]");
});

test("redactSensitive — GitHub PAT redacted", () => {
  const r = redactSensitive({ note: "use ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij" });
  assert.equal(r.note, "use [REDACTED]");
});

test("redactSensitive — connection string com senha redacted", () => {
  const r = redactSensitive({ url: "postgres://user:s3cret@host:5432/db" });
  assert.ok(!r.url.includes("s3cret"), "senha nao pode vazar");
  assert.ok(r.url.includes("[REDACTED]"), "deve marcar como REDACTED");
});

test("redactSensitive — PEM private key redacted", () => {
  const r = redactSensitive({ content: "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAK..." });
  assert.ok(r.content.includes("[REDACTED]"));
  assert.ok(!r.content.includes("BEGIN RSA PRIVATE KEY"));
});

test("redactSensitive — recursao em objetos aninhados", () => {
  const r = redactSensitive({
    outer: {
      inner: {
        secret: "shh",
        visible: "ok",
      },
    },
  });
  assert.equal(r.outer.inner.secret, "[REDACTED]");
  assert.equal(r.outer.inner.visible, "ok");
});

test("redactSensitive — recursao em arrays", () => {
  const r = redactSensitive({
    items: [{ token: "a" }, { token: "b" }, { visible: "ok" }],
  });
  assert.equal(r.items[0].token, "[REDACTED]");
  assert.equal(r.items[1].token, "[REDACTED]");
  assert.equal(r.items[2].visible, "ok");
});

test("redactSensitive — profundidade maxima evita loop", () => {
  const deep: any = {};
  let cursor = deep;
  for (let i = 0; i < 20; i++) {
    cursor.next = {};
    cursor = cursor.next;
  }
  cursor.password = "leaked";
  const r = redactSensitive(deep);
  assert.ok(r !== undefined);
});

test("redactSensitive — string longa e truncada", () => {
  const long = "x".repeat(10000);
  const r = redactSensitive({ content: long });
  assert.ok(r.content.length < 10000);
  assert.ok(r.content.endsWith("...[TRUNCATED]"));
});

test("redactSensitive — primitivos passam inalterados", () => {
  assert.equal(redactSensitive(42), 42);
  assert.equal(redactSensitive(true), true);
  assert.equal(redactSensitive(null), null);
  assert.equal(redactSensitive(undefined), undefined);
});
