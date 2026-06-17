/**
 * harness-context.ts — Harness v6 tool
 *
 * Constroi o "task description" para um sub-agent, juntando:
 *   - Capability grant (paths, tools, escopo)
 *   - Estado atual do workflow (fase, sprint, etc)
 *   - Outputs ja produzidos (lista arquivos de fases anteriores)
 *   - RAG relevante (categoria match com a fase)
 *   - Output contract da fase atual
 *   - Gate que valida este output
 *
 * Retorna markdown pronto para colar no task() tool do opencode.
 *
 * Substitui o `harness-context.ts` do v5 que era ad-hoc. v6 e declarativo:
 * o contexto vem do state.json + state-machine.json, sem logica hardcoded.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

function parseYamlFrontmatter(content: string): any {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split("\n");
  const meta: any = {};
  for (const line of lines) {
    const [key, ...val] = line.split(":");
    if (key && val.length > 0) {
      meta[key.trim()] = val.join(":").trim().replace(/^"|"$/g, "");
    }
  }
  return meta;
}

export default tool({
  name: "harness_context",
  description:
    "Constroi task description para sub-agent. Junta capability grant + estado + RAG + output contract. Retorna markdown pronto para task().",
  args: {
    targetAgent: tool.schema
      .string()
      .describe("Nome do sub-agent que recebera a task (ex: 'designer', 'backend')"),
    scope: tool.schema
      .string()
      .describe("Descricao curta do escopo da task (1 frase)"),
    includeFiles: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Paths adicionais para incluir no contexto (ex: ['PRD.html', 'design/user-register.PROMPT.md'])"),
    extraContext: tool.schema
      .string()
      .optional()
      .describe("Contexto extra em markdown (opcional)"),
  },
  async execute({ targetAgent, scope, includeFiles = [], extraContext = "" }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const statePath = path.join(harnessDir, "state.json");
    const stateMachinePath = path.join(harnessDir, "state-machine.json");
    const ragIndexPath = path.join(harnessDir, "RAG", "index.json");

    if (!fs.existsSync(statePath) || !fs.existsSync(stateMachinePath)) {
      return {
        success: false,
        error: "state.json ou state-machine.json nao existem. Rode harness_init primeiro.",
      };
    }

    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const stateMachine = JSON.parse(fs.readFileSync(stateMachinePath, "utf8"));
    const phase = stateMachine.phases.find((p: any) => p.id === state.currentPhase);

    if (!phase) {
      return {
        success: false,
        error: `Fase '${state.currentPhase}' nao encontrada no state-machine.json.`,
      };
    }

    // Verifica se targetAgent e owner ou auxiliary da fase
    const isOwner = phase.owner === targetAgent;
    const isAuxiliary = (phase.auxiliaries || []).includes(targetAgent);
    const isWorker = (phase.workers || []).includes(targetAgent);

    if (!isOwner && !isAuxiliary && !isWorker) {
      return {
        success: false,
        error: `Agent '${targetAgent}' nao e owner/auxiliary/worker da fase '${phase.id}'. Owner: ${phase.owner}. Auxiliaries: ${(phase.auxiliaries || []).join(", ")}. Workers: ${(phase.workers || []).join(", ")}.`,
      };
    }

    // Carrega boundaries do agent
    const boundariesPath = path.join(harnessDir, "agent-boundaries.json");
    let agentBoundaries = { allow: [], deny: [] };
    if (fs.existsSync(boundariesPath)) {
      const allBoundaries = JSON.parse(fs.readFileSync(boundariesPath, "utf8"));
      agentBoundaries = allBoundaries[targetAgent] || agentBoundaries;
    }

    // RAG relevante — pega categoria relacionada a fase
    const phaseToCategory: Record<string, string[]> = {
      "phase.0.briefing": ["convention", "workflow"],
      "phase.1.documentacao": ["convention", "architecture", "workflow"],
      "phase.2.requisitos": ["convention", "law", "security", "pattern", "workflow"],
      "phase.3.design": ["convention", "pattern", "schema", "workflow"],
      "phase.4.planejamento": ["convention", "pattern", "workflow"],
      "phase.5.build": ["convention", "pattern", "antipattern", "law", "security", "schema", "lesson"],
    };
    const relevantCategories = phaseToCategory[phase.id] || [];

    const globalTrainingDir = path.join(
      process.env.HOME || process.env.USERPROFILE || "~",
      ".config",
      "opencode",
      "training"
    );

    const allRelevantDocs: any[] = [];

    // 1. Carrega local RAGs
    if (fs.existsSync(ragIndexPath)) {
      try {
        const ragIndex = JSON.parse(fs.readFileSync(ragIndexPath, "utf8"));
        const localRelevant = (ragIndex.docs || []).filter((d: any) =>
          relevantCategories.includes(d.category)
        );
        allRelevantDocs.push(...localRelevant.map((d: any) => ({ ...d, isGlobal: false })));
      } catch {
        // ignore
      }
    }

    // 2. Carrega global RAGs
    if (fs.existsSync(globalTrainingDir)) {
      try {
        const globalFiles = fs.readdirSync(globalTrainingDir).filter(f => f.endsWith(".md"));
        for (const file of globalFiles) {
          const content = fs.readFileSync(path.join(globalTrainingDir, file), "utf8");
          const meta = parseYamlFrontmatter(content);
          if (meta && relevantCategories.includes(meta.category)) {
            allRelevantDocs.push({
              id: meta.id || file.replace(".md", ""),
              category: meta.category,
              title: meta.title || file.replace(".md", ""),
              priority: meta.priority || "medium",
              isGlobal: true
            });
          }
        }
      } catch {
        // ignore
      }
    }

    // Ordenar por prioridade (critical > high > medium > low)
    const priorityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    allRelevantDocs.sort((a, b) => {
      const wa = priorityWeight[a.priority] || 2;
      const wb = priorityWeight[b.priority] || 2;
      return wb - wa;
    });

    let ragSnippet = "";
    if (allRelevantDocs.length > 0) {
      ragSnippet =
        "**RAG relevante (ler antes de agir):**\n" +
        allRelevantDocs
          .slice(0, 8)
          .map((d: any) => `- \`${d.id}\` [${d.isGlobal ? "Global" : "Local"}] (${d.category}, priority=${d.priority}): ${d.title}`)
          .join("\n") +
        "\n\n";
    }

    // Inputs de fases anteriores
    const previousOutputs = (phase.inputFrom || []).map((prevId: string) => {
      const prevPhase = stateMachine.phases.find((p: any) => p.id === prevId);
      if (!prevPhase) return null;
      const files = (prevPhase.outputContract?.files || [])
        .map((f: any) => f.path)
        .filter(Boolean);
      return { phase: prevId, files };
    }).filter(Boolean);

    const inputsSection =
      previousOutputs.length > 0
        ? "**Inputs de fases anteriores (ja produzidos):**\n" +
          previousOutputs
            .map((p: any) => `- Fase \`${p.phase}\`: ${p.files.map((f: string) => `\`${f}\``).join(", ")}`)
            .join("\n") +
          "\n\n"
        : "";

    // Files adicionais a incluir
    const extraFilesSection =
      includeFiles.length > 0
        ? "**Files adicionais a ler:**\n" +
          includeFiles.map((f: string) => `- \`${f}\``).join("\n") +
          "\n\n"
        : "";

    // Output contract
    const outputSection =
      "**Output contract (do state-machine.json):**\n```json\n" +
      JSON.stringify(phase.outputContract, null, 2) +
      "\n```\n\n";

    // Gate
    const gateSection =
      "**Gate que valida este output:**\n```json\n" +
      JSON.stringify(phase.gate, null, 2) +
      "\n```\n\n";

    // Capability grant
    const capabilitySection =
      "## Capability grant (válido apenas pra esta task)\n\n" +
      `- **Phase:** \`${phase.id}\`\n` +
      `- **Paths allowlist:** [${agentBoundaries.allow?.join(", ")}]\n` +
      `- **Paths deny:** [${agentBoundaries.deny?.join(", ")}]\n` +
      `- **Escopo:** ${scope}\n` +
      `- **Boundary:** NAO pode editar paths fora do allowlist. Use task() para delegar (NAO — você nao tem tool task). Volte resultado ao orchestrator.\n\n`;

    // Concatena tudo
    const taskDescription =
      `# Task para harness-${targetAgent}\n\n` +
      `**Project:** ${state.project}\n` +
      `**Phase atual:** ${phase.id} (${phase.name})\n` +
      `**Attempt:** ${state.phases[phase.id]?.attempt || 0}\n\n` +
      capabilitySection +
      inputsSection +
      extraFilesSection +
      ragSnippet +
      outputSection +
      gateSection +
      (extraContext ? `**Contexto extra:**\n${extraContext}\n\n` : "") +
      `---\n\n` +
      `Ao finalizar, retorne ao orchestrator com: (1) lista de arquivos criados/modificados, (2) resultado de cada check do gate, (3) qualquer blocker encontrado.`;

    return {
      success: true,
      targetAgent,
      phase: phase.id,
      taskDescription,
      isOwner,
      isAuxiliary,
      isWorker,
      boundaries: agentBoundaries,
    };
  },
});
