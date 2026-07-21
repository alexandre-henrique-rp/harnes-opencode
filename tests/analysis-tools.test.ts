/**
 * analysis-tools.test.ts — Testes das ferramentas de análise e segurança:
 * coverage-analyzer, security-scanner, pii-detector, linter-automator
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

import coverageAnalyzer from "../tools/coverage-analyzer.ts";
import securityScanner from "../tools/security-scanner.ts";
import piiDetector from "../tools/pii-detector.ts";
import linterAutomator from "../tools/linter-automator.ts";

function createTmpDir() {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "harness-analysis-test-"));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, cleanup };
}

test("Suíte de Ferramentas de Análise (coverage, security, pii, linter)", async (t) => {
  await t.test("1. coverage-analyzer — analisa JSON de cobertura Vitest/Jest", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      // Sem relatório
      const resMissing = await coverageAnalyzer.execute({ reportPath: "missing.json" }, { directory: dir });
      assert.strictEqual(resMissing.success, false);

      // Com relatório válido acima do threshold
      const covDir = path.join(dir, "coverage");
      fs.mkdirSync(covDir, { recursive: true });
      const mockReport = {
        total: {
          lines: { pct: 90 },
          functions: { pct: 88 },
          statements: { pct: 92 },
          branches: { pct: 85 }
        }
      };
      fs.writeFileSync(path.join(covDir, "coverage-summary.json"), JSON.stringify(mockReport));

      const resPass = await coverageAnalyzer.execute({ reportPath: "coverage/coverage-summary.json", minThreshold: 80 }, { directory: dir });
      assert.strictEqual(resPass.success, true);
      assert.strictEqual(resPass.passed, true);
    } finally {
      cleanup();
    }
  });

  await t.test("2. security-scanner — varre código fonte por vulnerabilidades e segredos", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      // Sem diretório
      const resMissing = await securityScanner.execute({ targetDir: "nonexistent" }, { directory: dir });
      assert.strictEqual(resMissing.success, false);

      // Com diretório e arquivo contendo secret simulado
      const srcDir = path.join(dir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "auth.ts"), 'const apiKey = "api_key = mock_secret_key_12345678901234567890";');

      const resScan = await securityScanner.execute({ targetDir: "src" }, { directory: dir });
      assert.strictEqual(resScan.success, true);
      assert.ok(resScan.findings.length > 0);
      assert.strictEqual(resScan.findings[0].severity, "critical");
    } finally {
      cleanup();
    }
  });

  await t.test("3. pii-detector — detecta dados pessoais em código e schemas", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const srcDir = path.join(dir, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(path.join(srcDir, "user.ts"), 'const user = { email: "test@test.com", cpf: "123.456.789-00" };');

      const resPii = await piiDetector.execute({ targetDir: "src" }, { directory: dir });
      assert.strictEqual(resPii.success, true);
      assert.ok(resPii.piiFields.length >= 2);
    } finally {
      cleanup();
    }
  });

  await t.test("4. linter-automator — constrói e tenta executar comando de linter", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      // Executa comando simples para testar resposta (echo)
      const resEcho = await linterAutomator.execute({ command: "echo 'ok'", autoFix: false }, { directory: dir });
      assert.strictEqual(resEcho.success, true);
      assert.ok(resEcho.output.includes("ok"));
    } finally {
      cleanup();
    }
  });
});

function createTmpProject() {
  return createTmpDir();
}
