import type { Plugin } from "@opencode-ai/plugin";
import { execSync } from "child_process";
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

export default async function NativeSandboxPlugin(ctx: any) {
  const directory = ctx?.directory;
  const worktree = ctx?.worktree;
  const isValidPath = (p: unknown): p is string =>
    typeof p === "string" && p.length >= 3 && p !== "/" && p.startsWith("/");

  const projectRoot =
    (isValidPath(worktree) ? worktree : null) ??
    (isValidPath(directory) ? directory : null) ??
    process.cwd();

  const alreadySandboxed = process.env.AI_JAIL_ACTIVE === "1";

  let hasAiJail = false;
  if (!alreadySandboxed) {
    try { execSync("command -v ai-jail", { stdio: "ignore" }); hasAiJail = true; } catch {}
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

      if (alreadySandboxed || !hasAiJail) {
        writeAudit({ event: "bash.exec", command: original, sandboxed: alreadySandboxed });
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
        event: "sandbox.exec.start.fallback",
        command: original,
        scriptHash,
        note: "processo pai nao estava sandboxed; enjaulando comando individual",
      });
    },

    "tool.execute.after": async ({ tool }, output) => {
      if (tool !== "bash") return;
      writeAudit({ event: "bash.exec.end", exitCode: output?.metadata?.exitCode });
    },
  };
};
