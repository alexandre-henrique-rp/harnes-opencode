/**
 * harness-workspace.ts — Harness v6 tool
 *
 * Garante e retorna o caminho para o diretório de artefatos temporários
 * do Harness (.harness/tmp) e adiciona um .gitignore para ignorar tudo.
 * Adicionalmente, inicializa o sandbox .ai-jail se o ai-jail estiver instalado,
 * e gera um relatório de diagnóstico do ambiente (.harness/sandbox-diagnostic.json).
 */

import { tool } from "@opencode-ai/plugin";
import { execSync, execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

interface AiJailConfig {
  rw_maps?: string[];
  ro_maps?: string[];
  hide_dotdirs?: string[];
  mask?: string[];
  no_docker?: boolean;
  no_private_home?: boolean;
}

function loadAiJailConfig(projectRoot: string): AiJailConfig {
  const configPath = path.join(projectRoot, ".harness", "ai-jail.json");
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Diagnóstico completo do sandbox: detecta ai-jail, testa bwrap, checa
 * user namespaces, sugere fixes. Resultado é salvo em .harness/sandbox-diagnostic.json
 * para troubleshooting futuro.
 */
export function diagnoseSandbox(): {
  aiJailInstalled: boolean;
  bwrapWorks: boolean;
  userNamespacesEnabled: boolean | null;
  alreadySandboxed: boolean;
  recommendation: string;
  details: Record<string, unknown>;
} {
  const result = {
    aiJailInstalled: false,
    bwrapWorks: false,
    userNamespacesEnabled: null as boolean | null,
    alreadySandboxed: process.env.AI_JAIL_ACTIVE === "1",
    recommendation: "",
    details: {} as Record<string, unknown>,
  };

  // 1. ai-jail instalado?
  try {
    execSync("command -v ai-jail", { stdio: "ignore" });
    result.aiJailInstalled = true;
    try {
      const ver = execSync("ai-jail --version 2>&1 || echo 'unknown'", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      result.details.aiJailVersion = ver;
    } catch { /* best effort */ }
  } catch {
    result.recommendation = "Instale ai-jail: https://github.com/akitaonrails/ai-jail";
    return result;
  }

  // 2. Se já está sandboxed, bwrap "funciona" por herança
  if (result.alreadySandboxed) {
    result.bwrapWorks = true;
    result.recommendation = "Sessão já está dentro do ai-jail (AI_JAIL_ACTIVE=1). Sandbox operacional.";
    return result;
  }

  // 3. Testa bwrap de verdade
  try {
    execFileSync("ai-jail", ["--exec", "echo", "__probe__"], {
      stdio: "ignore",
      timeout: 5000,
    });
    result.bwrapWorks = true;
    result.recommendation = "Sandbox ai-jail/bwrap operacional.";
  } catch {
    result.bwrapWorks = false;
  }

  // 4. Checa user namespaces (Linux)
  if (process.platform === "linux") {
    try {
      const val = fs.readFileSync("/proc/sys/kernel/unprivileged_userns_clone", "utf8").trim();
      result.userNamespacesEnabled = val === "1";
    } catch {
      result.details.usernsCheckError = "Não foi possível ler /proc/sys/kernel/unprivileged_userns_clone";
    }
  }

  // 5. Recomendação
  if (!result.bwrapWorks) {
    if (result.userNamespacesEnabled === false) {
      result.recommendation = [
        "bwrap falhou: kernel sem user namespaces.",
        "Opções:",
        "  1. Habilitar: sudo sysctl -w kernel.unprivileged_userns_clone=1",
        "  2. Rodar opencode dentro do ai-jail: AI_JAIL_ACTIVE=1 ai-jail opencode",
        "  3. Desabilitar sandbox: HARNESS_NO_SANDBOX=1 opencode",
      ].join("\n");
    } else if (result.userNamespacesEnabled === null) {
      result.recommendation = [
        "bwrap falhou neste ambiente.",
        "Recomendação: AI_JAIL_ACTIVE=1 ai-jail opencode",
        "Ou, para ignorar sandbox: HARNESS_NO_SANDBOX=1",
      ].join("\n");
    } else {
      result.recommendation = "bwrap falhou apesar de user namespaces habilitados. Tente: AI_JAIL_ACTIVE=1 ai-jail opencode";
    }
  }

  return result;
}

/**
 * Persiste diagnóstico em .harness/sandbox-diagnostic.json para referência futura.
 */
export function persistDiagnostic(projectRoot: string, diag: ReturnType<typeof diagnoseSandbox>): string {
  const harnessDir = path.join(projectRoot, ".harness");
  fs.mkdirSync(harnessDir, { recursive: true });
  const diagPath = path.join(harnessDir, "sandbox-diagnostic.json");
  const report = {
    ...diag,
    platform: process.platform,
    nodeVersion: process.version,
    checkedAt: new Date().toISOString(),
  };
  fs.writeFileSync(diagPath, JSON.stringify(report, null, 2));
  return diagPath;
}

export function ensureAiJailConfig(projectRoot: string): { created: boolean } {
  const configPath = path.join(projectRoot, ".ai-jail");
  if (fs.existsSync(configPath)) return { created: false };

  let hasAiJail = false;
  try {
    execSync("command -v ai-jail", { stdio: "ignore" });
    hasAiJail = true;
  } catch {}
  if (!hasAiJail) return { created: false };

  const cfg = loadAiJailConfig(projectRoot);
  const flags: string[] = ["ai-jail --init"];

  if (cfg.no_private_home !== false) flags.push("--no-private-home");
  if (cfg.no_docker !== false) flags.push("--no-docker");

  for (const m of cfg.mask ?? [".env", ".env.local", "credentials.json", "harness-allowlist.json"]) {
    flags.push(`--mask ${m}`);
  }
  for (const d of cfg.hide_dotdirs ?? [".netrc", ".kube"]) {
    flags.push(`--hide-dotdir ${d}`);
  }
  for (const r of cfg.rw_maps ?? []) {
    flags.push(`--rw-map ${r}`);
  }
  for (const r of cfg.ro_maps ?? []) {
    flags.push(`--map ${r}`);
  }

  flags.push("bash");
  try {
    execSync(flags.join(" "), { cwd: projectRoot, stdio: "ignore" });
    return { created: true };
  } catch {
    // ai-jail --init falhou (provavelmente bwrap indisponível) — não bloqueia o harness
    return { created: false };
  }
}

export default tool({
  description: "Garante a existência do diretório temporário do Harness (.harness/tmp) com .gitignore apropriado e retorna seu caminho. Também executa diagnóstico do sandbox.",
  args: {},
  async execute({}, context) {
    const cwd = resolveProjectCwd(context, { log: console.error });
    const harnessTmpDir = path.resolve(cwd, ".harness", "tmp");

    if (!fs.existsSync(harnessTmpDir)) {
      fs.mkdirSync(harnessTmpDir, { recursive: true });
    }

    const gitignorePath = path.join(harnessTmpDir, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, "*\n");
    }

    // Inicializa o arquivo .ai-jail do projeto (silencioso se falhar)
    ensureAiJailConfig(cwd);

    // Diagnóstico de sandbox — sempre roda, nunca falha
    let sandboxDiagnostic: ReturnType<typeof diagnoseSandbox> | null = null;
    let diagPath: string | null = null;
    try {
      sandboxDiagnostic = diagnoseSandbox();
      diagPath = persistDiagnostic(cwd, sandboxDiagnostic);
    } catch { /* best effort — não bloqueia o harness */ }

    return {
      success: true,
      path: harnessTmpDir,
      sandbox: sandboxDiagnostic
        ? {
            bwrapWorks: sandboxDiagnostic.bwrapWorks,
            aiJailInstalled: sandboxDiagnostic.aiJailInstalled,
            recommendation: sandboxDiagnostic.recommendation,
            diagnosticFile: diagPath,
          }
        : null,
      message: `Diretório temporário garantido em: ${harnessTmpDir}`,
    };
  }
});
