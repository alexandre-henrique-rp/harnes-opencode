import * as fs from "node:fs";
import * as path from "node:path";
import {
  auditFeatureSpec,
  type FeatureAuditResult,
} from "../utils/markdown-parser.js";

export interface GateOptions {
  cwd: string;
  featureSlug?: string;
  strict?: boolean;
}

export interface GateResult {
  passed: boolean;
  strictMode: boolean;
  totalFeatures: number;
  passedFeatures: number;
  results: FeatureAuditResult[];
  summary: string;
}

/**
 * Executa o Gate Mecânico Spec-Anchored sobre as especificações em `.opencode/specs/`.
 * Garante que toda SPEC.md tenha critérios AC-XX e BR-XX, que todos estejam cobertos
 * por tarefas em TASKS.md (zero órfãos) e, quando `--strict` está ativo, que todas as
 * tarefas estejam marcadas como concluídas `[x]`.
 */
export function runGate(options: GateOptions): GateResult {
  const cwd = path.resolve(options.cwd);
  const strictMode = Boolean(options.strict);
  const specsRoot = path.join(cwd, ".opencode", "specs");

  if (!fs.existsSync(specsRoot)) {
    return {
      passed: false,
      strictMode,
      totalFeatures: 0,
      passedFeatures: 0,
      results: [],
      summary: `Diretório de especificações não encontrado em ${specsRoot}. Execute 'npx opencode-harness init' primeiro.`,
    };
  }

  let featureDirs: string[] = [];
  if (options.featureSlug) {
    const targetDir = path.join(specsRoot, options.featureSlug);
    if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
      return {
        passed: false,
        strictMode,
        totalFeatures: 0,
        passedFeatures: 0,
        results: [],
        summary: `Feature '${options.featureSlug}' não encontrada em .opencode/specs/.`,
      };
    }
    featureDirs = [options.featureSlug];
  } else {
    featureDirs = fs
      .readdirSync(specsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  if (featureDirs.length === 0) {
    return {
      passed: true,
      strictMode,
      totalFeatures: 0,
      passedFeatures: 0,
      results: [],
      summary:
        "Nenhuma feature ativa em .opencode/specs/. Crie uma com 'npx opencode-harness spec <nome>'.",
    };
  }

  const results: FeatureAuditResult[] = [];

  for (const feature of featureDirs) {
    const dir = path.join(specsRoot, feature);
    const specPath = path.join(dir, "SPEC.md");
    const tasksPath = path.join(dir, "TASKS.md");
    const designPath = path.join(dir, "DESIGN.md");

    if (!fs.existsSync(specPath)) {
      results.push({
        feature,
        passed: false,
        acCount: 0,
        brCount: 0,
        sprints: [],
        totalTasks: 0,
        completedTasks: 0,
        orphanIds: [],
        findings: [
          {
            code: "MISSING_SPEC_FRONTMATTER",
            severity: "error",
            message: `Arquivo SPEC.md não encontrado em .opencode/specs/${feature}/`,
          },
        ],
      });
      continue;
    }

    const specContent = fs.readFileSync(specPath, "utf-8");
    const tasksContent = fs.existsSync(tasksPath)
      ? fs.readFileSync(tasksPath, "utf-8")
      : null;
    const designContent = fs.existsSync(designPath)
      ? fs.readFileSync(designPath, "utf-8")
      : null;

    const audit = auditFeatureSpec(
      feature,
      specContent,
      tasksContent,
      designContent,
      strictMode,
    );
    results.push(audit);
  }

  const passedFeatures = results.filter((r) => r.passed).length;
  const allPassed = passedFeatures === results.length;

  return {
    passed: allPassed,
    strictMode,
    totalFeatures: results.length,
    passedFeatures,
    results,
    summary: allPassed
      ? `Gate PASS: ${passedFeatures}/${results.length} feature(s) em conformidade com o protocolo Spec-Anchored.`
      : `Gate FAIL: ${results.length - passedFeatures} de ${results.length} feature(s) apresentaram desalinhamento mecânico.`,
  };
}
