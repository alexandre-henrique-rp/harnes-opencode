import * as fs from "node:fs";
import * as path from "node:path";
import {
  detectProjectStack,
  renderConstitution,
  type StackInfo,
} from "../utils/stack-detector.js";
import {
  copyDirectoryRecursive,
  getTemplatesDir,
  HARNESS_VERSION,
} from "../utils/templates-locator.js";

export interface InitOptions {
  cwd: string;
  force?: boolean;
  skipOpencodeJson?: boolean;
}

export interface InitResult {
  success: boolean;
  opencodeDir: string;
  stack: StackInfo;
  copiedFilesCount: number;
  message: string;
}

/**
 * Inicializa a estrutura `.opencode/` no repositório alvo com os 8 agentes da v7,
 * os 7 comandos rápidos, as 3 skills core, templates de especificação e a constituição do projeto.
 */
export function runInit(options: InitOptions): InitResult {
  const cwd = path.resolve(options.cwd);
  const force = Boolean(options.force);
  const opencodeDir = path.join(cwd, ".opencode");
  const harnessManifestPath = path.join(opencodeDir, "harness.json");

  const stack = detectProjectStack(cwd);

  if (fs.existsSync(harnessManifestPath) && !force) {
    return {
      success: false,
      opencodeDir,
      stack,
      copiedFilesCount: 0,
      message: `O OpenCode Harness já está inicializado em ${opencodeDir}. Use '--force' para reinicializar ou 'opencode-harness update' para atualizar os agentes.`,
    };
  }

  const templatesDir = getTemplatesDir();
  fs.mkdirSync(opencodeDir, { recursive: true });
  fs.mkdirSync(path.join(opencodeDir, "specs"), { recursive: true });

  // 1. Copia agentes, comandos, skills e templates de specs
  const copiedAgents = copyDirectoryRecursive(
    path.join(templatesDir, "agents"),
    path.join(opencodeDir, "agents"),
    true,
  );

  const copiedCommands = copyDirectoryRecursive(
    path.join(templatesDir, "commands"),
    path.join(opencodeDir, "commands"),
    true,
  );

  const copiedSkills = copyDirectoryRecursive(
    path.join(templatesDir, "skills"),
    path.join(opencodeDir, "skills"),
    true,
  );

  const copiedSpecTemplates = copyDirectoryRecursive(
    path.join(templatesDir, "specs"),
    path.join(opencodeDir, "templates", "specs"),
    true,
  );

  // 2. Gera .opencode/CONSTITUTION.md (preserva se já existir e não for --force)
  const constitutionDest = path.join(opencodeDir, "CONSTITUTION.md");
  let constitutionCreated = 0;
  if (!fs.existsSync(constitutionDest) || force) {
    const constitutionTemplate = fs.readFileSync(
      path.join(templatesDir, "CONSTITUTION.md"),
      "utf-8",
    );
    const rendered = renderConstitution(constitutionTemplate, stack);
    fs.writeFileSync(constitutionDest, rendered, "utf-8");
    constitutionCreated = 1;
  }

  // 3. Salva manifesto .opencode/harness.json
  const manifest = {
    name: "opencode-harness",
    version: HARNESS_VERSION,
    paradigm: "spec-anchored",
    installedAt: new Date().toISOString(),
    stack,
  };
  fs.writeFileSync(
    harnessManifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8",
  );

  // 4. Configura/mescla opencode.json na raiz do projeto (se não desativado)
  if (!options.skipOpencodeJson) {
    ensureProjectOpencodeConfig(cwd);
  }

  const totalCopied =
    copiedAgents.length +
    copiedCommands.length +
    copiedSkills.length +
    copiedSpecTemplates.length +
    constitutionCreated +
    1;

  return {
    success: true,
    opencodeDir,
    stack,
    copiedFilesCount: totalCopied,
    message: `OpenCode Harness v${HARNESS_VERSION} instalado com sucesso em ${opencodeDir} (${copiedAgents.length} agentes, ${copiedCommands.length} comandos, ${copiedSkills.length} skills).`,
  };
}

/**
 * Cria ou atualiza de forma não-destrutiva o arquivo `opencode.json` na raiz do projeto
 * para apontar para o agente `orchestrator` e incluir `.opencode/CONSTITUTION.md` nas instruções.
 */
function ensureProjectOpencodeConfig(cwd: string): void {
  const configPath = path.join(cwd, "opencode.json");
  let existing: Record<string, unknown> = {};

  if (fs.existsSync(configPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      // Se o arquivo existente não for JSON puro válido, não sobrescreve para não perder comentários
      return;
    }
  }

  if (!existing["$schema"]) {
    existing["$schema"] = "https://opencode.ai/config.json";
  }

  if (!existing["default_agent"]) {
    existing["default_agent"] = "orchestrator";
  }

  const currentInstructions = Array.isArray(existing["instructions"])
    ? (existing["instructions"] as string[]).filter(
        (item) => !item.includes("~/.config/opencode") && !item.includes("./system/"),
      )
    : [];

  if (!currentInstructions.includes(".opencode/CONSTITUTION.md")) {
    currentInstructions.unshift(".opencode/CONSTITUTION.md");
  }
  existing["instructions"] = currentInstructions;

  // Remove plugins legados da v6 caso estivessem presentes no opencode.json antigo
  if (Array.isArray(existing["plugin"])) {
    const filteredPlugins = (existing["plugin"] as string[]).filter(
      (p) => !p.startsWith("./plugins/"),
    );
    if (filteredPlugins.length === 0) {
      delete existing["plugin"];
    } else {
      existing["plugin"] = filteredPlugins;
    }
  }

  // Remove experimental legado da v6 se existir
  if (existing["experimental"]) {
    delete existing["experimental"];
  }

  fs.writeFileSync(configPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}
