import * as fs from "node:fs";
import * as path from "node:path";
import { getTemplatesDir } from "../utils/templates-locator.js";

export interface SpecCreateOptions {
  cwd: string;
  featureName: string;
  description?: string;
  hasUi?: boolean;
  force?: boolean;
}

export interface SpecCreateResult {
  success: boolean;
  featureSlug: string;
  specDir: string;
  createdFiles: string[];
  message: string;
}

/**
 * Converte um título ou nome livre em um slug kebab-case seguro para diretórios.
 */
export function toFeatureSlug(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Cria o esqueleto Spec-Anchored em `.opencode/specs/<feature-slug>/` contendo
 * `SPEC.md`, `TASKS.md` e (quando `hasUi !== false`) `DESIGN.md`.
 */
export function runSpecCreate(options: SpecCreateOptions): SpecCreateResult {
  const cwd = path.resolve(options.cwd);
  const featureSlug = toFeatureSlug(options.featureName);

  if (!featureSlug) {
    return {
      success: false,
      featureSlug: "",
      specDir: "",
      createdFiles: [],
      message: "Nome da feature inválido. Informe um identificador como 'autenticacao-jwt'.",
    };
  }

  const opencodeDir = path.join(cwd, ".opencode");
  const specDir = path.join(opencodeDir, "specs", featureSlug);
  const force = Boolean(options.force);
  const hasUi = options.hasUi !== false;

  if (fs.existsSync(specDir) && !force) {
    return {
      success: false,
      featureSlug,
      specDir,
      createdFiles: [],
      message: `A especificação '${featureSlug}' já existe em ${specDir}. Use '--force' para sobrescrever.`,
    };
  }

  fs.mkdirSync(specDir, { recursive: true });

  // Usa templates locais do projeto (.opencode/templates/specs/) ou fallback para os templates do pacote
  const localSpecTemplates = path.join(opencodeDir, "templates", "specs");
  const pkgSpecTemplates = path.join(getTemplatesDir(), "specs");
  const templatesBase = fs.existsSync(localSpecTemplates)
    ? localSpecTemplates
    : pkgSpecTemplates;

  const today = new Date().toISOString().slice(0, 10);
  const featureTitle = options.featureName.trim();
  const description =
    options.description?.trim() ||
    `Especificação técnica e critérios de aceite para a funcionalidade ${featureTitle}.`;

  const applyPlaceholders = (raw: string): string =>
    raw
      .replaceAll("{{FEATURE_SLUG}}", featureSlug)
      .replaceAll("{{FEATURE_TITLE}}", featureTitle)
      .replaceAll("{{DATE}}", today)
      .replaceAll("{{DESCRIPTION}}", description)
      .replace("has_ui: true", `has_ui: ${String(hasUi)}`);

  const createdFiles: string[] = [];

  // 1. PRD.md (se o template existir)
  const prdTemplatePath = path.join(templatesBase, "PRD-TEMPLATE.md");
  if (fs.existsSync(prdTemplatePath)) {
    const prdTemplate = fs.readFileSync(prdTemplatePath, "utf-8");
    fs.writeFileSync(
      path.join(specDir, "PRD.md"),
      applyPlaceholders(prdTemplate),
      "utf-8",
    );
    createdFiles.push("PRD.md");
  }

  // 2. SPEC.md
  const specTemplate = fs.readFileSync(
    path.join(templatesBase, "SPEC-TEMPLATE.md"),
    "utf-8",
  );
  const specPath = path.join(specDir, "SPEC.md");
  fs.writeFileSync(specPath, applyPlaceholders(specTemplate), "utf-8");
  createdFiles.push("SPEC.md");

  // 2. DESIGN.md (somente quando hasUi === true)
  if (hasUi) {
    const designTemplate = fs.readFileSync(
      path.join(templatesBase, "DESIGN-TEMPLATE.md"),
      "utf-8",
    );
    const designPath = path.join(specDir, "DESIGN.md");
    fs.writeFileSync(designPath, applyPlaceholders(designTemplate), "utf-8");
    createdFiles.push("DESIGN.md");
  }

  // 3. TASKS.md
  const tasksTemplate = fs.readFileSync(
    path.join(templatesBase, "TASKS-TEMPLATE.md"),
    "utf-8",
  );
  const tasksPath = path.join(specDir, "TASKS.md");
  fs.writeFileSync(tasksPath, applyPlaceholders(tasksTemplate), "utf-8");
  createdFiles.push("TASKS.md");

  return {
    success: true,
    featureSlug,
    specDir,
    createdFiles,
    message: `Feature '${featureSlug}' inicializada em .opencode/specs/${featureSlug}/ (${createdFiles.join(", ")}).`,
  };
}
