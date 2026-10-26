import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const HARNESS_VERSION = "7.0.0";

/**
 * Os 8 Agentes de Elite da v7 do OpenCode Harness.
 */
export const EXPECTED_AGENTS = [
  "orchestrator",
  "spec-engineer",
  "designer",
  "task-planner",
  "backend",
  "frontend",
  "qa-tester",
  "code-reviewer",
] as const;

/**
 * Os 7 Slash Commands nativos da v7.
 */
export const EXPECTED_COMMANDS = [
  "spec",
  "design",
  "plan",
  "build",
  "review",
  "quick",
  "status",
] as const;

/**
 * As 4 Skills Core da v7 (incluindo doc-standards para PRD, PRODUCT, SPEC e AGENTS).
 */
export const EXPECTED_SKILLS = [
  "spec-driven",
  "doc-standards",
  "security-lgpd",
  "seo-a11y",
] as const;

/**
 * Localiza o diretório `templates/` embutido no pacote `opencode-harness`.
 */
export function getTemplatesDir(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);

  // De src/utils/ ou dist/utils/, sobe 2 níveis até a raiz do pacote
  const pkgRoot = path.resolve(currentDir, "..", "..");
  const templatesPath = path.join(pkgRoot, "templates");

  if (!fs.existsSync(templatesPath)) {
    throw new Error(
      `Diretório de templates do pacote não encontrado em: ${templatesPath}`,
    );
  }

  return templatesPath;
}

/**
 * Copia recursivamente todos os arquivos de `srcDir` para `destDir`.
 * Retorna a lista de caminhos relativos copiados.
 */
export function copyDirectoryRecursive(
  srcDir: string,
  destDir: string,
  overwrite = true,
): string[] {
  const copied: string[] = [];

  if (!fs.existsSync(srcDir)) {
    return copied;
  }

  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      const subCopied = copyDirectoryRecursive(srcPath, destPath, overwrite);
      for (const item of subCopied) {
        copied.push(path.join(entry.name, item));
      }
    } else if (entry.isFile()) {
      if (overwrite || !fs.existsSync(destPath)) {
        fs.copyFileSync(srcPath, destPath);
        copied.push(entry.name);
      }
    }
  }

  return copied;
}
