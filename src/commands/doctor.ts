import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "../utils/markdown-parser.js";
import {
  EXPECTED_AGENTS,
  EXPECTED_COMMANDS,
  EXPECTED_SKILLS,
} from "../utils/templates-locator.js";

export interface DoctorCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface DoctorResult {
  healthy: boolean;
  checks: DoctorCheck[];
  summary: string;
}

/**
 * Diagnostica a integridade da instalação local do OpenCode Harness v7 em `.opencode/`.
 * Valida a presença da Constituição, dos 8 agentes (e a sintaxe de seus frontmatters),
 * dos 7 slash commands, das 3 skills e do `opencode.json`.
 */
export function runDoctor(options: { cwd: string }): DoctorResult {
  const cwd = path.resolve(options.cwd);
  const opencodeDir = path.join(cwd, ".opencode");
  const checks: DoctorCheck[] = [];

  // 1. Diretório .opencode
  const hasOpencodeDir = fs.existsSync(opencodeDir);
  checks.push({
    name: "Diretório .opencode/",
    passed: hasOpencodeDir,
    detail: hasOpencodeDir
      ? "Encontrado no repositório."
      : "Ausente. Execute 'npx opencode-harness init'.",
  });

  if (!hasOpencodeDir) {
    return {
      healthy: false,
      checks,
      summary: "Instalação não encontrada em .opencode/.",
    };
  }

  // 2. Constituição do Projeto (.opencode/CONSTITUTION.md)
  const constitutionPath = path.join(opencodeDir, "CONSTITUTION.md");
  const hasConstitution = fs.existsSync(constitutionPath);
  checks.push({
    name: "Constituição (.opencode/CONSTITUTION.md)",
    passed: hasConstitution,
    detail: hasConstitution
      ? "Presente e configurada."
      : "Arquivo CONSTITUTION.md não encontrado em .opencode/.",
  });

  // 3. Verificação dos 8 Agentes e seus Frontmatters
  const missingAgents: string[] = [];
  const invalidFrontmatterAgents: string[] = [];

  for (const agentName of EXPECTED_AGENTS) {
    const agentPath = path.join(opencodeDir, "agents", `${agentName}.md`);
    if (!fs.existsSync(agentPath)) {
      missingAgents.push(agentName);
      continue;
    }

    const content = fs.readFileSync(agentPath, "utf-8");
    const fm = parseFrontmatter(content);
    if (!fm.valid || !fm.attributes["description"] || !fm.attributes["mode"]) {
      invalidFrontmatterAgents.push(agentName);
    }
  }

  checks.push({
    name: `Agentes v7 (${EXPECTED_AGENTS.length} esperados)`,
    passed: missingAgents.length === 0 && invalidFrontmatterAgents.length === 0,
    detail:
      missingAgents.length > 0
        ? `Agentes ausentes: ${missingAgents.join(", ")}`
        : invalidFrontmatterAgents.length > 0
          ? `Agentes com frontmatter inválido: ${invalidFrontmatterAgents.join(", ")}`
          : `Todos os ${EXPECTED_AGENTS.length} agentes estão íntegros.`,
  });

  // 4. Verificação dos 7 Comandos
  const missingCommands = EXPECTED_COMMANDS.filter(
    (cmd) => !fs.existsSync(path.join(opencodeDir, "commands", `${cmd}.md`)),
  );
  checks.push({
    name: `Comandos Slash (${EXPECTED_COMMANDS.length} esperados)`,
    passed: missingCommands.length === 0,
    detail:
      missingCommands.length === 0
        ? `Todos os ${EXPECTED_COMMANDS.length} comandos estão presentes.`
        : `Comandos ausentes: ${missingCommands.join(", ")}`,
  });

  // 5. Verificação das 3 Skills Core
  const missingSkills = EXPECTED_SKILLS.filter(
    (skill) =>
      !fs.existsSync(path.join(opencodeDir, "skills", skill, "SKILL.md")),
  );
  checks.push({
    name: `Skills Core (${EXPECTED_SKILLS.length} esperadas)`,
    passed: missingSkills.length === 0,
    detail:
      missingSkills.length === 0
        ? `Todas as ${EXPECTED_SKILLS.length} skills estão ativas.`
        : `Skills ausentes: ${missingSkills.join(", ")}`,
  });

  // 6. Verificação do opencode.json na raiz
  const rootConfigPath = path.join(cwd, "opencode.json");
  let configOk = false;
  let configDetail = "opencode.json ausente na raiz do projeto.";

  if (fs.existsSync(rootConfigPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(rootConfigPath, "utf-8")) as {
        default_agent?: string;
      };
      configOk = parsed.default_agent === "orchestrator";
      configDetail = configOk
        ? "opencode.json válido com default_agent='orchestrator'."
        : `default_agent atual é '${parsed.default_agent ?? "indefinido"}' (recomendado: 'orchestrator').`;
    } catch {
      configDetail = "opencode.json contém erro de sintaxe JSON.";
    }
  }

  checks.push({
    name: "Configuração raiz (opencode.json)",
    passed: configOk,
    detail: configDetail,
  });

  const failedCount = checks.filter((c) => !c.passed).length;
  const healthy = failedCount === 0;

  return {
    healthy,
    checks,
    summary: healthy
      ? `Doctor PASS: Todos os ${checks.length} indicadores de saúde do OpenCode Harness v7 estão verdes.`
      : `Doctor WARN/FAIL: ${failedCount} de ${checks.length} verificações apresentaram problemas.`,
  };
}
