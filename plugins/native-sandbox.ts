import type { Plugin } from "@opencode-ai/plugin";
import { execSync, execFileSync } from "child_process";
import { randomBytes, createHash } from "crypto";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

const FORBIDDEN: { rx: RegExp; reason: string }[] = [
  { rx: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf)\s+(--no-preserve-root\s+)?\/(?!\w)/i, reason: "rm -rf / detectado" },
  { rx: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-rf)\s+~(?:\/|\s|$)/i, reason: "rm -rf ~ detectado" },
  { rx: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "fork bomb" },
  { rx: /mkfs\.[a-z0-9]+\s+\/dev\//i, reason: "formatação de device" },
  { rx: /dd\s+.*\s+of=\/dev\/(sd|hd|nvme|vd)/i, reason: "dd em device de bloco" },
  { rx: /curl\s+[^|]*\|\s*(ba)?sh/i, reason: "pipe-to-shell" },
  { rx: /chmod\s+(-R\s+)?777\s+\//i, reason: "chmod 777 na raiz" },
];

const AUDIT_DIR = path.join(os.homedir(), ".local", "share", "opencode", "audit");

/**
 * Status persistido do sandbox: 'unknown' | 'available' | 'unavailable' | 'disabled'
 * Cacheado em disco para evitar re-detectar a cada comando.
 */
type SandboxStatus = "unknown" | "available" | "unavailable" | "disabled";
const STATUS_FILE = path.join(os.homedir(), ".local", "share", "opencode", "sandbox-status.json");

function loadSandboxStatus(): SandboxStatus {
  try {
    const raw = JSON.parse(fs.readFileSync(STATUS_FILE, "utf8"));
    // Cache válido por 24h
    if (Date.now() - (raw.checkedAt || 0) > 24 * 60 * 60 * 1000) return "unknown";
    return raw.status || "unknown";
  } catch {
    return "unknown";
  }
}

function saveSandboxStatus(status: SandboxStatus, detail: string): void {
  try {
    fs.mkdirSync(path.dirname(STATUS_FILE), { recursive: true });
    fs.writeFileSync(STATUS_FILE, JSON.stringify({
      status, detail, checkedAt: Date.now(),
    }, null, 2));
  } catch { /* best effort */ }
}

function writeAudit(entry: object): void {
  try {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const date = new Date().toISOString().split("T")[0];
    fs.appendFileSync(
      path.join(AUDIT_DIR, `${date}.jsonl`),
      JSON.stringify({ ...entry, ts: new Date().toISOString() }) + "\n"
    );
  } catch { /* best effort */ }
}

/**
 * Teste real do ai-jail/bwrap — não apenas "está instalado" mas "funciona de verdade".
 * Roda uma vez e cacheia o resultado por 24h.
 */
function probeSandbox(): SandboxStatus {
  // Se o usuário explicitamente desabilitou, respeita
  if (process.env.HARNESS_NO_SANDBOX === "1") return "disabled";

  // Se a sessão pai já está sandboxed, não precisa envolver
  if (process.env.AI_JAIL_ACTIVE === "1") return "available";

  // Se ai-jail nem está instalado, não há o que envolver
  try {
    execSync("command -v ai-jail", { stdio: "ignore" });
  } catch {
    return "unavailable";
  }

  // Probe real: tenta rodar ai-jail --exec echo com timeout curto.
  // Se bwrap falhar com "Operation not permitted", sai com código != 0 rapidamente.
  try {
    execFileSync("ai-jail", ["--exec", "echo", "__harness_probe_ok__"], {
      stdio: "ignore",
      timeout: 5000,
    });
    return "available";
  } catch {
    return "unavailable";
  }
}

export default async function NativeSandboxPlugin(ctx: any) {
  const directory = ctx?.directory;
  const worktree = ctx?.worktree;
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");

  const projectRoot =
    (isValidPath(worktree) ? worktree : null) ??
    (isValidPath(directory) ? directory : null) ??
    process.cwd();

  // Detecta uma única vez por sessão e cacheia em disco
  let sandboxStatus = loadSandboxStatus();
  if (sandboxStatus === "unknown") {
    sandboxStatus = probeSandbox();
    const detail =
      sandboxStatus === "available" ? "ai-jail+bwrap funcionando" :
      sandboxStatus === "unavailable" ? "bwrap falhou neste ambiente (kernel sem user namespaces?)" :
      "desabilitado por HARNESS_NO_SANDBOX=1";
    saveSandboxStatus(sandboxStatus, detail);
  }

  // Loga o status uma vez para diagnóstico
  if (sandboxStatus === "unavailable") {
    process.stderr.write(
      "[native-sandbox] ai-jail/bwrap indisponível neste ambiente. Comandos bash rodarão SEM sandbox por-comando. " +
      "Para diagnóstico: rode 'cat /proc/sys/kernel/unprivileged_userns_clone'. " +
      "Para forçar habilitação: 'AI_JAIL_ACTIVE=1 ai-jail opencode' (sandbox externo).\n"
    );
    writeAudit({
      event: "sandbox.status",
      status: "unavailable",
      recommendation: "AI_JAIL_ACTIVE=1 ai-jail opencode",
    });
  }

  const dirCreated = new Set<string>();

  return {
    "tool.execute.before": async ({ tool }, output) => {
      if (tool !== "bash") return;
      const args = output.args;
      if (!args || typeof args.command !== "string" || args.command.trim() === "") return;

      const original = args.command;

      for (const { rx, reason } of FORBIDDEN) {
        if (rx.test(original)) {
          writeAudit({ event: "blocked", command: original, reason });
          throw new Error(`Bloqueado pelo harness: ${reason}`);
        }
      }

      // Se sandbox não está disponível ou o processo já está rodando dentro do ai-jail (encapsulamento global), executa direto sem wrapping.
      // Tentar rodar ai-jail dentro de ai-jail falharia no bwrap (Operation not permitted).
      if (sandboxStatus !== "available" || process.env.AI_JAIL_ACTIVE === "1") {
        writeAudit({
          event: "bash.exec",
          command: original,
          sandboxed: process.env.AI_JAIL_ACTIVE === "1",
          sandboxStatus,
        });
        return;
      }

      const scriptDir = path.join(projectRoot, ".harness", "tmp", "sandbox");
      if (!dirCreated.has(scriptDir)) {
        fs.mkdirSync(scriptDir, { recursive: true, mode: 0o700 });
        dirCreated.add(scriptDir);
      }
      const scriptName = `cmd-${Date.now()}-${randomBytes(8).toString("hex")}.sh`;
      const scriptPath = path.join(scriptDir, scriptName);
      const body = ["#!/usr/bin/env bash", "set -o pipefail", original, "exit $?"].join("\n");
      fs.writeFileSync(scriptPath, body, { mode: 0o700 });
      const scriptHash = createHash("sha256").update(body).digest("hex").slice(0, 16);

      args.command = `ai-jail --exec bash "${scriptPath}"; rm -f "${scriptPath}"`;

      writeAudit({
        event: "sandbox.exec.start",
        command: original,
        scriptHash,
        note: "enjaulamento por-comando via ai-jail/bwrap",
      });
    },

    "tool.execute.after": async ({ tool }, output) => {
      if (tool !== "bash") return;
      writeAudit({ event: "bash.exec.end", exitCode: output?.metadata?.exitCode });
    },
  };
};
