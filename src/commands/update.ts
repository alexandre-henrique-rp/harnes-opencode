import * as fs from "node:fs";
import * as path from "node:path";
import {
  copyDirectoryRecursive,
  getTemplatesDir,
  HARNESS_VERSION,
} from "../utils/templates-locator.js";

export interface UpdateOptions {
  cwd: string;
}

export interface UpdateResult {
  success: boolean;
  updatedFilesCount: number;
  version: string;
  message: string;
}

/**
 * Atualiza os agentes, comandos, skills e templates dentro de `.opencode/`
 * para a versão mais recente do pacote, preservando intactos `.opencode/CONSTITUTION.md`
 * e todas as especificações do projeto em `.opencode/specs/`.
 */
export function runUpdate(options: UpdateOptions): UpdateResult {
  const cwd = path.resolve(options.cwd);
  const opencodeDir = path.join(cwd, ".opencode");

  if (!fs.existsSync(opencodeDir)) {
    return {
      success: false,
      updatedFilesCount: 0,
      version: HARNESS_VERSION,
      message: `Diretório .opencode/ não encontrado em ${cwd}. Execute 'npx opencode-harness init' primeiro.`,
    };
  }

  const templatesDir = getTemplatesDir();

  const updatedAgents = copyDirectoryRecursive(
    path.join(templatesDir, "agents"),
    path.join(opencodeDir, "agents"),
    true,
  );

  const updatedCommands = copyDirectoryRecursive(
    path.join(templatesDir, "commands"),
    path.join(opencodeDir, "commands"),
    true,
  );

  const updatedSkills = copyDirectoryRecursive(
    path.join(templatesDir, "skills"),
    path.join(opencodeDir, "skills"),
    true,
  );

  const updatedSpecTemplates = copyDirectoryRecursive(
    path.join(templatesDir, "specs"),
    path.join(opencodeDir, "templates", "specs"),
    true,
  );

  // Atualiza a versão no manifesto .opencode/harness.json preservando metadados existentes
  const manifestPath = path.join(opencodeDir, "harness.json");
  let manifestData: Record<string, unknown> = {
    name: "opencode-harness",
    paradigm: "spec-anchored",
  };

  if (fs.existsSync(manifestPath)) {
    try {
      manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch {
      // Usa objeto base se o JSON anterior estiver inválido
    }
  }

  manifestData["version"] = HARNESS_VERSION;
  manifestData["updatedAt"] = new Date().toISOString();
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(manifestData, null, 2) + "\n",
    "utf-8",
  );

  const totalUpdated =
    updatedAgents.length +
    updatedCommands.length +
    updatedSkills.length +
    updatedSpecTemplates.length;

  return {
    success: true,
    updatedFilesCount: totalUpdated,
    version: HARNESS_VERSION,
    message: `OpenCode Harness atualizado para v${HARNESS_VERSION} (${totalUpdated} arquivos de agentes/comandos/skills sincronizados; CONSTITUTION.md e specs/ preservados).`,
  };
}
