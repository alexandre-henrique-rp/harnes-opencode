/**
 * path-boundary.test.ts — Testes do plugin de segurança path-boundary (PRD-04)
 *
 * Cobertura P0:
 *   - Allowlist válida → regras allow/deny aplicadas normalmente
 *   - Allowlist corrompida (JSON inválido, modo fail-open) → warning em stderr, aplica apenas ALWAYS_DENY
 *   - Allowlist ausente (modo fail-open) → permite escrita (comportamento padrão)
 *   - Allowlist corrompida (modo fail-closed) → bloqueia escrita
 *   - Allowlist ausente (modo fail-closed) → bloqueia escrita
 *   - ALWAYS_DENY → sempre bloqueado independente de allowlist
 */

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

// ─── Helpers ────────────────────────────────────────────────────────────────

const ALLOWLIST_PATH_ENV = "HOME";

/**
 * Cria ambiente temporário com config de allowlist simulada.
 * Sobrescreve HOME para que path-boundary leia o arquivo de teste.
 *
 * @param allowlistContent Conteúdo do arquivo allowlist, ou null para não criar o arquivo
 * @param mode Modo do plugin: "fail-open" | "fail-closed"
 * @returns Objeto com cleanup e o plugin instanciado
 */
async function setupPlugin(
  allowlistContent: string | null,
  mode: "fail-open" | "fail-closed" = "fail-open"
) {
  const tempHome = fs.mkdtempSync(path.join(tmpdir(), "path-boundary-test-"));
  const configDir = path.join(tempHome, ".config", "opencode");
  fs.mkdirSync(configDir, { recursive: true });

  if (allowlistContent !== null) {
    fs.writeFileSync(path.join(configDir, "harness-allowlist.json"), allowlistContent);
  }

  // Configura variáveis de ambiente para o plugin
  const origHome = process.env.HOME;
  const origMode = process.env.HARNESS_PATH_BOUNDARY_MODE;
  process.env.HOME = tempHome;
  process.env.HARNESS_PATH_BOUNDARY_MODE = mode;

  // Importação com cache-bust para recarregar o módulo com o novo HOME
  const mod = await import(`../plugins/path-boundary.ts?cache=${Date.now()}`);
  const pluginFactory = mod.PathBoundaryPlugin;

  // Instancia o plugin com um diretório de projeto fictício
  const projectDir = path.join(tempHome, "fake-project");
  fs.mkdirSync(projectDir);
  const plugin = await pluginFactory({ directory: projectDir, worktree: projectDir });

  const cleanup = () => {
    process.env.HOME = origHome;
    if (origMode === undefined) delete process.env.HARNESS_PATH_BOUNDARY_MODE;
    else process.env.HARNESS_PATH_BOUNDARY_MODE = origMode;
    fs.rmSync(tempHome, { recursive: true, force: true });
  };

  return { plugin, projectDir, cleanup };
}

/**
 * Simula uma chamada de tool de escrita ao plugin.
 * @param plugin Instância do plugin retornada por setupPlugin
 * @param targetFile Path absoluto do arquivo alvo
 * @returns Promise que resolve em undefined (permitido) ou rejeita com Error (bloqueado)
 */
async function callWriteTool(plugin: any, targetFile: string): Promise<void> {
  const hook = plugin["tool.execute.before"];
  await hook(
    { tool: "write_to_file", args: { TargetFile: targetFile } },
    {}
  );
}

// ─── Testes ─────────────────────────────────────────────────────────────────

test("path-boundary — suite P0 (PRD-04)", async (t) => {

  await t.test("1. Allowlist válida — path allow → escrita permitida normalmente", async () => {
    const allowlist = JSON.stringify({
      allow: ["src/**", "docs/**"],
      deny: [],
    });
    const { plugin, projectDir, cleanup } = await setupPlugin(allowlist, "fail-open");
    try {
      // Deve passar sem lançar erro
      await assert.doesNotReject(
        () => callWriteTool(plugin, path.join(projectDir, "src", "index.ts")),
        "src/index.ts deve ser permitido pela allowlist"
      );
    } finally {
      cleanup();
    }
  });

  await t.test("2. Allowlist válida — path deny explícito → escrita bloqueada", async () => {
    const allowlist = JSON.stringify({
      allow: ["src/**"],
      deny: ["src/secrets/**"],
    });
    const { plugin, projectDir, cleanup } = await setupPlugin(allowlist, "fail-open");
    try {
      await assert.rejects(
        () => callWriteTool(plugin, path.join(projectDir, "src", "secrets", "key.ts")),
        /path-boundary.*BLOCKED/,
        "src/secrets/key.ts deve ser bloqueado pelo deny explícito"
      );
    } finally {
      cleanup();
    }
  });

  await t.test("3. ALWAYS_DENY — state.json → sempre bloqueado independente de allowlist", async () => {
    const allowlist = JSON.stringify({
      allow: ["**"],
      deny: [],
    });
    const { plugin, projectDir, cleanup } = await setupPlugin(allowlist, "fail-open");
    try {
      await assert.rejects(
        () => callWriteTool(plugin, path.join(projectDir, ".harness", "state.json")),
        /path-boundary.*BLOCKED/,
        ".harness/state.json deve ser sempre bloqueado pelo ALWAYS_DENY"
      );
    } finally {
      cleanup();
    }
  });

  await t.test("4. Allowlist corrompida (fail-open) → warning em stderr, NÃO bloqueia escrita fora de ALWAYS_DENY", async () => {
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    // Intercepta stderr para capturar warnings
    (process.stderr as any).write = (chunk: string) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    const { plugin, projectDir, cleanup } = await setupPlugin("{ invalid json !!!", "fail-open");
    try {
      // Não deve bloquear (fail-open)
      await assert.doesNotReject(
        () => callWriteTool(plugin, path.join(projectDir, "src", "app.ts")),
        "Em fail-open com JSON corrompido, escrita deve ser permitida"
      );

      // Mas deve ter emitido warning
      const allStderr = stderrChunks.join("");
      assert.ok(
        allStderr.includes("[path-boundary]") && allStderr.includes("WARNING"),
        `Deve emitir WARNING no stderr, obteve: "${allStderr}"`
      );
    } finally {
      (process.stderr as any).write = origWrite;
      cleanup();
    }
  });

  await t.test("5. Allowlist corrompida (fail-closed) → bloqueia escrita com mensagem clara", async () => {
    const { plugin, projectDir, cleanup } = await setupPlugin("{ invalid json !!!", "fail-closed");
    try {
      await assert.rejects(
        () => callWriteTool(plugin, path.join(projectDir, "src", "app.ts")),
        /path-boundary.*BLOCKED.*fail-closed/,
        "Em fail-closed com JSON corrompido, escrita deve ser bloqueada"
      );
    } finally {
      cleanup();
    }
  });

  await t.test("6. Allowlist ausente (fail-open) → permite escrita (comportamento padrão sem restrição adicional)", async () => {
    const { plugin, projectDir, cleanup } = await setupPlugin(null, "fail-open");
    try {
      await assert.doesNotReject(
        () => callWriteTool(plugin, path.join(projectDir, "src", "new-feature.ts")),
        "Com allowlist ausente em fail-open, escrita deve ser permitida"
      );
    } finally {
      cleanup();
    }
  });

  await t.test("7. Allowlist ausente (fail-closed) → bloqueia escrita com warning", async () => {
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as any).write = (chunk: string) => {
      stderrChunks.push(String(chunk));
      return true;
    };

    const { plugin, projectDir, cleanup } = await setupPlugin(null, "fail-closed");
    try {
      await assert.rejects(
        () => callWriteTool(plugin, path.join(projectDir, "src", "app.ts")),
        /path-boundary.*BLOCKED.*fail-closed/,
        "Com allowlist ausente em fail-closed, escrita deve ser bloqueada"
      );

      const allStderr = stderrChunks.join("");
      assert.ok(
        allStderr.includes("WARNING"),
        `Deve emitir WARNING no stderr, obteve: "${allStderr}"`
      );
    } finally {
      (process.stderr as any).write = origWrite;
      cleanup();
    }
  });
});
