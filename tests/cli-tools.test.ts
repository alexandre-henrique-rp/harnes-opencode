/**
 * cli-tools.test.ts — Testes para ferramentas CLI estáticas:
 * ast-analyzer, a11y-scanner, api-contract-validator, vuln-checker
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";

function createTmpProject() {
  const dir = fs.mkdtempSync(path.join(tmpdir(), "harness-cli-test-"));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });
  return { dir, cleanup };
}

const rootDir = path.resolve(".");

test("Suíte de Ferramentas CLI Estáticas (ast-analyzer, a11y-scanner, api-contract-validator, vuln-checker)", async (t) => {

  await t.test("1. ast-analyzer — mede complexidade ciclomática AST", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const codePath = path.join(dir, "sample.ts");
      fs.writeFileSync(codePath, `
        function sample(a: number, b: number): number {
          if (a > 0 && b > 0) {
            return a + b;
          } else if (a < 0 || b < 0) {
            return a - b;
          }
          return 0;
        }
      `);

      const output = execSync(`node --experimental-strip-types ${path.join(rootDir, "tools", "ast-analyzer.ts")} ${codePath}`, { encoding: "utf8" });
      assert.ok(output.includes("[AST Analyzer]"));
      assert.ok(output.includes("sample"));
    } finally {
      cleanup();
    }
  });

  await t.test("2. a11y-scanner — varre marcação HTML por problemas de acessibilidade", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const htmlPath = path.join(dir, "index.html");
      fs.writeFileSync(htmlPath, '<html><body><img src="logo.png"><button></button></body></html>');

      const output = execSync(`node --experimental-strip-types ${path.join(rootDir, "tools", "a11y-scanner.ts")} ${htmlPath}`, { encoding: "utf8" });
      assert.ok(output.includes("[A11y Scanner]"));
      assert.ok(output.includes("Violação"));
    } finally {
      cleanup();
    }
  });

  await t.test("3. api-contract-validator — valida endpoints da SPEC contra código fonte", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const specPath = path.join(dir, "SPEC.md");
      const codePath = path.join(dir, "server.ts");

      fs.writeFileSync(specPath, "POST /api/users\nGET /api/users");
      fs.writeFileSync(codePath, 'app.post("/api/users", handler);\napp.get("/api/users", handler);');

      const output = execSync(`node --experimental-strip-types ${path.join(rootDir, "tools", "api-contract-validator.ts")} ${specPath} ${codePath}`, { encoding: "utf8" });
      assert.ok(output.includes("[API Validator]"));
      assert.ok(output.includes("Sucesso"));
    } finally {
      cleanup();
    }
  });

  await t.test("4. vuln-checker — varre dependências via npm audit", async () => {
    const { dir, cleanup } = createTmpProject();
    try {
      const pkgPath = path.join(dir, "package.json");
      fs.writeFileSync(pkgPath, JSON.stringify({ name: "test-pkg", version: "1.0.0" }));

      const output = execSync(`node --experimental-strip-types ${path.join(rootDir, "tools", "vuln-checker.ts")} ${dir}`, { encoding: "utf8" });
      assert.ok(output.includes("[Vuln Checker]"));
    } finally {
      cleanup();
    }
  });
});
