/**
 * quiet-warn.ts
 *
 * Helper para plugins registrarem warnings/eventos sem poluir a UI
 * do OpenCode TUI. Escreve em `.harness/plugin-warnings.log` (append-only).
 *
 * Por que existe:
 *   OpenCode renderiza `process.stderr.write(...)` da forma incorreta:
 *   joga o texto como stderr cru, que o TUI mostra ACIMA da input bar,
 *   atrapalhando o usuário. Chamadas a `client.session.log` ou
 *   `client.log` também podem aparecer dependendo da versão do runtime.
 *
 * Como usar:
 *   import { quietWarn } from "./lib/quiet-warn.ts";
 *   quietWarn("path-boundary", "BLOCKED: agent X cannot edit Y"); // fire-and-forget
 *
 * Comportamento:
 *   - Append-only em `.harness/plugin-warnings.log`
 *   - Fail-silent: se IO falhar, plugin continua funcionando
 *   - Não bloqueia execução (não usa await, retorna void)
 *   - Console.error SÓ quando env var `HARNESS_PLUGIN_LOG=1` (debug)
 */

import { appendFile, mkdir } from "node:fs/promises";

const WARN_FILE = ".harness/plugin-warnings.log";
const DIR = ".harness";

export function quietWarn(pluginName: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${pluginName}] ${message.trim()}\n`;

  // Side-channel opcional: console.error se usuário pediu verbose ou em modo de teste
  if (
    process.env.HARNESS_PLUGIN_LOG === "1" ||
    process.env.NODE_ENV === "test" ||
    process.env.NODE_TEST_CONTEXT !== undefined ||
    process.execArgv.includes("--test") ||
    process.argv.includes("--test")
  ) {
    process.stderr.write(line);
  }

  // Persistência primária — fire-and-forget
  mkdir(DIR, { recursive: true })
    .then(() => appendFile(WARN_FILE, line, { flag: "a" }))
    .catch(() => {
      // Fail-silent — se disco cheio ou permissão negada, plugin segue
    });
}
