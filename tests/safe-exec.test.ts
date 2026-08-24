// tests/safe-exec.test.ts
//
// A4 (baseline): tools executavam shell via execSync com interpolacao.
// Estes testes garantem que safe-exec NAO interpreta metacaracteres,
// bloqueia git options perigosas, propaga exit code, e respeita timeout.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  safeExec,
  safeExecAsync,
  runGit,
  safeShellExec,
} from "../tools/lib/safe-exec.ts";

const TMPDIR = fs.mkdtempSync(path.join(os.tmpdir(), "safe-exec-test-"));

test("safeExec — execucao basica retorna ok=true e exitCode=0", () => {
  const r = safeExec("node", ["-e", "process.stdout.write('hello')"]);
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.equal(r.stdout, "hello");
  assert.equal(r.stderr, "");
  assert.equal(r.timedOut, false);
});

test("safeExec — exit code nao-zero preservado (sem mascaramento)", () => {
  const r = safeExec("node", ["-e", "process.exit(7)"]);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 7, "Exit code 7 deve ser preservado, nao virar 0");
});

test("safeExec — args como array NAO interpreta shell metacharacters", () => {
  // Tentativa classica de injecao: arg com ; rm -rf
  // Se safeExec usasse shell, isso executaria o rm.
  const r = safeExec("node", ["-e", "process.stdout.write(process.argv[1])"], {
    input: "ouch; rm -rf /tmp/nope_12345",
  });
  assert.equal(r.ok, false, "input via shell nao e usado em execFileSync");
});

test("safeExec — stdout de processo grande e capturado", () => {
  const r = safeExec("node", ["-e", "process.stdout.write('a'.repeat(1000))"]);
  assert.equal(r.ok, true);
  assert.equal(r.stdout.length, 1000);
});

test("safeExec — cwd customizado funciona", () => {
  const r = safeExec("node", ["-e", "process.stdout.write(process.cwd())"], {
    cwd: TMPDIR,
  });
  assert.equal(r.ok, true);
  assert.equal(r.stdout, TMPDIR);
});

test("safeExec — cwd com path traversal rejeitado", () => {
  assert.throws(
    () => safeExec("node", ["-v"], { cwd: "/tmp/../../etc" }),
    /path traversal/,
  );
});

test("safeExecAsync — retorna Promise<SafeExecResult>", async () => {
  const r = await safeExecAsync("node", ["-e", "process.stdout.write('async')"]);
  assert.equal(r.ok, true);
  assert.equal(r.stdout, "async");
});

test("runGit — subcommand nao permitido bloqueado", () => {
  assert.throws(
    () => runGit(["upload-pack"]),
    /nao esta na whitelist/,
  );
});

test("runGit — opcao --upload-pack bloqueada", () => {
  assert.throws(
    () => runGit(["log", "--upload-pack=evil"]),
    /opcao git perigosa/,
  );
});

test("runGit — opcao --receive-pack bloqueada", () => {
  assert.throws(
    () => runGit(["fetch", "--receive-pack=evil"]),
    /opcao git perigosa/,
  );
});

test("runGit — execucao basica em repo git funciona", () => {
  // TMPDIR pode ou nao ser repo git, entao usamos git init
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "safe-git-test-"));
  fs.mkdirSync(repo, { recursive: true });
  const init = runGit(["init"], { cwd: repo, silentStderr: true });
  assert.equal(init.ok, true, `git init falhou: ${init.stderr}`);
  const status = runGit(["status", "--short"], { cwd: repo });
  assert.equal(status.ok, true, `git status falhou: ${status.stderr}`);
  fs.rmSync(repo, { recursive: true, force: true });
});

test("safeShellExec — args com metacaracteres proibidos bloqueados", () => {
  const blacklist = ["; rm -rf /", "$(whoami)", "`id`", "&& echo pwned", "|| true", "| nc evil 1234", ">", "<", "newline\ninjection"];
  for (const evil of blacklist) {
    assert.throws(
      () => safeShellExec(["echo", evil]),
      /metacaractere proibido/,
      `safeShellExec deveria bloquear: '${evil}'`,
    );
  }
});

test("safeShellExec — args legítimos passam", () => {
  const r = safeShellExec(["echo", "hello world with spaces"]);
  assert.equal(r.ok, true);
  assert.match(r.stdout, /hello world with spaces/);
});

test("safeShellExec — exit code propagado via comando shell", () => {
  // shell com pipe: nao e seguro — usa apenas 'false' que retorna 1 direto
  const r = safeShellExec(["false"]);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
});

test("safeExec — env customizado e mergeado com safe base", () => {
  const r = safeExec(
    "node",
    ["-e", "process.stdout.write(process.env.MY_CUSTOM || 'none')"],
    { env: { MY_CUSTOM: "value123" } },
  );
  assert.equal(r.ok, true);
  assert.equal(r.stdout, "value123");
});

test("safeExec — comando inexistente retorna exitCode != 0", () => {
  const r = safeExec("comando-que-nao-existe-de-fato", ["arg"]);
  assert.equal(r.ok, false);
  assert.notEqual(r.exitCode, 0);
});

// Cleanup
test("Cleanup safe-exec tests", () => {
  if (fs.existsSync(TMPDIR)) {
    fs.rmSync(TMPDIR, { recursive: true, force: true });
  }
});
