/**
 * safe-exec.ts — v6.5.0
 *
 * Executor seguro de subprocessos para tools/plugins do harness.
 *
 * Por que existe:
 *   A4 (baseline): 16 das 36 tools executavam shell via execSync/spawnSync
 *   com interpolacao de string (`git commit -m "${msg}"`, `git ${args}`,
 *   etc). Como o sandbox foi removido em v6.5.0, essas chamadas rodam
 *   livres e qualquer caractere especial em args (`$(...)`, backticks,
 *   `;`, `&&`, `|`, `\n`) vira vetor de injecao.
 *
 * Politica:
 *   1. Default: execFileSync (args como array, sem shell). NAO ha interpretacao
 *      de metacaracteres. Cada arg e uma string independente.
 *   2. Git commands: usar runGit() — wrapper que aceita um array de args
 *      e passa para execFile("git", args, ...). Validacoes extras para
 *      rev-parse (rejeita --upload-pack, --receive-pack, etc).
 *   3. Timeouts obrigatorios. Default: 30s (git: 60s).
 *   4. Ambiente minimo: PATH + HOME + LANG, mais nada. Sem LD_PRELOAD,
 *      sem NODE_OPTIONS, sem GIT_AUTHOR_*, etc.
 *   5. Exit code propagado sem mascaramento.
 *   6. cwd validado contra path traversal antes de executar.
 *
 * Quando shell e inevitavel (ex: globbing, pipes nativos): usar
 * safeShellExec() que faz validacao de whitelist em cada arg.
 */

import { execFile, execFileSync } from "node:child_process";
import * as path from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 60_000;

const ALLOWED_GIT_SUBCOMMANDS = new Set([
  "init", "add", "branch", "commit", "diff", "fetch", "log",
  "rev-list", "rev-parse", "show", "status", "tag", "stash",
  "checkout", "merge", "rebase", "reset", "config",
]);

const FORBIDDEN_GIT_OPTIONS = new Set([
  "--upload-pack",
  "--receive-pack",
  "-u",
  "--exec",
]);

function buildSafeEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  // Ambiente minimo. Sem LD_PRELOAD, sem NODE_OPTIONS, sem variaveis de CI
  // que possam injetar comportamento.
  const safe: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || "/usr/bin:/bin:/usr/local/bin",
    HOME: process.env.HOME || "",
    LANG: process.env.LANG || "C.UTF-8",
  };
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === "string") safe[k] = v;
  }
  return safe;
}

function validateCwd(cwd: string | undefined, fallback: string): string {
  if (!cwd) return fallback;
  // Bloqueia path traversal ANTES de resolver (path.resolve normaliza ..)
  if (cwd.includes("..")) {
    throw new Error(`safeExec: cwd com path traversal rejeitado: ${cwd}`);
  }
  return path.resolve(cwd);
}

export interface SafeExecOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  input?: string;
  /** Se true, suprime stderr (mas ainda retorna exit code). */
  silentStderr?: boolean;
  /** Limite maximo de stdout/stderr em bytes. Default: 10MB. */
  maxBuffer?: number;
}

export interface SafeExecResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** true se o comando foi terminado por timeout. */
  timedOut: boolean;
}

/**
 * Executor seguro: args como array (sem shell).
 * NAO interpreta metacaracteres. Cada arg e uma string literal.
 */
export function safeExec(
  command: string,
  args: string[],
  options: SafeExecOptions = {},
): SafeExecResult {
  const cmd = String(command).trim();
  if (!cmd) throw new Error("safeExec: command vazio");
  if (!Array.isArray(args)) throw new Error("safeExec: args deve ser array de string");

  const cwd = validateCwd(options.cwd, process.cwd());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
  const env = buildSafeEnv(options.env);

  try {
    const out = execFileSync(cmd, args, {
      cwd,
      timeout: timeoutMs,
      env,
      encoding: "utf8",
      maxBuffer,
      input: options.input,
      stdio: ["ignore", "pipe", options.silentStderr ? "ignore" : "pipe"],
    });
    return { ok: true, exitCode: 0, stdout: String(out ?? ""), stderr: "", timedOut: false };
  } catch (err: unknown) {
    const e = err as {
      status?: number | null;
      stdout?: Buffer | string;
      stderr?: Buffer | string;
      signal?: string;
      killed?: boolean;
      message?: string;
    };
    const timedOut = e.killed === true && e.signal === "SIGTERM";
    return {
      ok: false,
      exitCode: typeof e.status === "number" ? e.status : 1,
      stdout: typeof e.stdout === "string" ? e.stdout : e.stdout?.toString("utf8") ?? "",
      stderr: typeof e.stderr === "string" ? e.stderr : e.stderr?.toString("utf8") ?? "",
      timedOut,
    };
  }
}

/**
 * Versao async de safeExec.
 */
export function safeExecAsync(
  command: string,
  args: string[],
  options: SafeExecOptions = {},
): Promise<SafeExecResult> {
  return new Promise((resolve) => {
    const cmd = String(command).trim();
    if (!cmd) {
      resolve({ ok: false, exitCode: 1, stdout: "", stderr: "command vazio", timedOut: false });
      return;
    }
    const cwd = validateCwd(options.cwd, process.cwd());
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024;
    const env = buildSafeEnv(options.env);

    const execOpts = {
      cwd,
      timeout: timeoutMs,
      env,
      maxBuffer,
      stdio: ["ignore", "pipe", options.silentStderr ? "ignore" : "pipe"],
    } as Parameters<typeof execFile>[2];

    execFile(cmd, args, execOpts, (err, stdout, stderr) => {
      const toStr = (v: unknown): string =>
        typeof v === "string" ? v : (v as Buffer | undefined)?.toString("utf8") ?? "";
      if (err) {
        const e = err as {
          status?: number | null;
          killed?: boolean;
          signal?: string;
        };
        resolve({
          ok: false,
          exitCode: typeof e.status === "number" ? e.status : 1,
          stdout: toStr(stdout),
          stderr: toStr(stderr),
          timedOut: e.killed === true && e.signal === "SIGTERM",
        });
        return;
      }
      resolve({
        ok: true,
        exitCode: 0,
        stdout: toStr(stdout),
        stderr: toStr(stderr),
        timedOut: false,
      });
    });
  });
}

/**
 * Wrapper para git: valida subcommand e bloqueia opcoes perigosas.
 * NUNCA aceita string concatenada — args sempre vem como array.
 */
export function runGit(
  args: string[],
  options: SafeExecOptions = {},
): SafeExecResult {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("runGit: args deve ser array nao-vazio");
  }
  const subcommand = args[0];
  if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error(
      `runGit: subcommand '${subcommand}' nao esta na whitelist. ` +
      `Permitidos: ${[...ALLOWED_GIT_SUBCOMMANDS].sort().join(", ")}`,
    );
  }
  for (const a of args.slice(1)) {
    if (FORBIDDEN_GIT_OPTIONS.has(a)) {
      throw new Error(`runGit: opcao git perigosa bloqueada: ${a}`);
    }
    // Detecta tambem formas com valor: --upload-pack=evil
    for (const forbidden of FORBIDDEN_GIT_OPTIONS) {
      if (a.startsWith(`${forbidden}=`)) {
        throw new Error(`runGit: opcao git perigosa bloqueada: ${a}`);
      }
    }
  }
  return safeExec("git", args, {
    timeoutMs: GIT_TIMEOUT_MS,
    ...options,
  });
}

export async function runGitAsync(
  args: string[],
  options: SafeExecOptions = {},
): Promise<SafeExecResult> {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("runGitAsync: args deve ser array nao-vazio");
  }
  const subcommand = args[0];
  if (!ALLOWED_GIT_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`runGitAsync: subcommand '${subcommand}' nao permitido`);
  }
  for (const a of args.slice(1)) {
    if (FORBIDDEN_GIT_OPTIONS.has(a)) {
      throw new Error(`runGitAsync: opcao git perigosa bloqueada: ${a}`);
    }
    for (const forbidden of FORBIDDEN_GIT_OPTIONS) {
      if (a.startsWith(`${forbidden}=`)) {
        throw new Error(`runGitAsync: opcao git perigosa bloqueada: ${a}`);
      }
    }
  }
  return safeExecAsync("git", args, {
    timeoutMs: GIT_TIMEOUT_MS,
    ...options,
  });
}

/**
 * Executor shell com validacao. USE APENAS quando o comando tem
 * multiplos subcomandos (pipe nativo, globbing, etc).
 *
 * Cada arg e validado contra a blacklist:
 *   - `;`, `&&`, `||`, `|`, `>` , `<` (pipe/redirect)
 *   - `` ` `` (backticks)
 *   - `$(` e `)` (command substitution)
 *   - `\n`, `\r` (newline injection)
 *
 * Para casos legítimos de pipe, use safeExec com git/grep/find diretamente.
 */
export function safeShellExec(
  args: string[],
  options: SafeExecOptions = {},
): SafeExecResult {
  if (!Array.isArray(args)) throw new Error("safeShellExec: args deve ser array");
  for (const a of args) {
    if (typeof a !== "string") {
      throw new Error("safeShellExec: cada arg deve ser string");
    }
    if (/[;&|`$()<>\r\n]/.test(a)) {
      throw new Error(
        `safeShellExec: arg com metacaractere proibido: '${a}'. ` +
        `Use safeExec() com comando + args separados para casos legitimos.`,
      );
    }
  }
  return safeExec("sh", ["-c", args.join(" ")], options);
}
