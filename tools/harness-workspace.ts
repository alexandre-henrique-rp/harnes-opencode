/**
 * harness-workspace.ts — Harness v6 tool
 *
 * Garante e retorna o caminho para o diretório de artefatos temporários
 * do Harness (.harness/tmp) e adiciona um .gitignore para ignorar tudo.
 * Adicionalmente, inicializa o sandbox .ai-jail se o ai-jail estiver instalado.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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
  execSync(flags.join(" "), { cwd: projectRoot, stdio: "ignore" });
  return { created: true };
}

export default tool({
  name: "harness-workspace",
  description: "Garante a existência do diretório temporário do Harness (.harness/tmp) com .gitignore apropriado e retorna seu caminho.",
  args: {},
  async execute({}, context) {
    const cwd = context?.directory || process.cwd();
    const harnessTmpDir = path.resolve(cwd, ".harness", "tmp");

    if (!fs.existsSync(harnessTmpDir)) {
      fs.mkdirSync(harnessTmpDir, { recursive: true });
    }

    const gitignorePath = path.join(harnessTmpDir, ".gitignore");
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, "*\n");
    }

    // Inicializa o arquivo .ai-jail do projeto se necessário
    ensureAiJailConfig(cwd);

    return {
      success: true,
      path: harnessTmpDir,
      message: `Diretório temporário garantido em: ${harnessTmpDir}`
    };
  }
});
