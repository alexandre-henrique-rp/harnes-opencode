/**
 * harness-advance.ts — Harness v6 tool
 *
 * Valida o gate da fase atual e, se passar, transiciona para a proxima fase.
 * Apenda evento em events.jsonl.
 * Atualiza state.json (so este tool pode, alem do orchestrator).
 *
 * Gate types suportados:
 *   - user-approval: aprovaçao humana (checada via parametro)
 *   - presence-and-min: arquivos existem e atingem minimo (lines, sections, docs)
 *   - score-threshold: scores dos reviewers >= minimo
 *   - coverage-check: sprints cobrem 100% do SPEC
 *   - all-of: composiçao (coverage + security + review)
 *
 * Failure classification aplicada por fase (failure-protocol.json).
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "harness-advance",
  description:
    "Valida o gate da fase atual. Se passar, transiciona fase, atualiza state.json, loga em events.jsonl. Se falhar, classifica falha e dispara retry/rework/escalation.",
  args: {
    userApproval: tool.schema
      .boolean()
      .optional()
      .describe("Para gate tipo user-approval: true se humano aprovou, false caso contrario"),
    scores: tool.schema
      .record(tool.schema.string(), tool.schema.number())
      .optional()
      .describe("Para gate score-threshold: mapa de agent → score (ex: { 'prd-reviewer': 85, 'spec-reviewer': 92 })"),
    sprintCoverage: tool.schema
      .number()
      .optional()
      .describe("Para gate coverage-check: % de cobertura do SPEC (0-100)"),
    buildMetrics: tool.schema
      .object({
        coverage: tool.schema.number().describe("Line coverage %"),
        criticalVulns: tool.schema.number().describe("Vulns critical count"),
        highVulns: tool.schema.number().describe("Vulns high count"),
        reviewScore: tool.schema.number().describe("Review score 0-100"),
      })
      .optional()
      .describe("Para gate all-of (build phase): metricas de qualidade"),
    force: tool.schema
      .boolean()
      .optional()
      .describe("Se true, pula gate (USE COM CUIDADO, loga no audit)"),
  },
  async execute(
    { userApproval, scores, sprintCoverage, buildMetrics, force = false },
    context
  ) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const statePath = path.join(harnessDir, "state.json");
    const eventsPath = path.join(harnessDir, "events.jsonl");
    const stateMachinePath = path.join(harnessDir, "state-machine.json");
    const failureProtocolPath = path.join(harnessDir, "failure-protocol.json");

    // Validacoes
    if (!fs.existsSync(statePath)) {
      return { success: false, error: "state.json nao existe. Rode harness_init." };
    }
    if (!fs.existsSync(stateMachinePath)) {
      return { success: false, error: "state-machine.json nao existe." };
    }

    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const stateMachine = JSON.parse(fs.readFileSync(stateMachinePath, "utf8"));
    const failureProtocol = fs.existsSync(failureProtocolPath)
      ? JSON.parse(fs.readFileSync(failureProtocolPath, "utf8"))
      : null;

    // Encontra phase info
    const phase = stateMachine.phases.find((p: any) => p.id === state.currentPhase);
    if (!phase) {
      return {
        success: false,
        error: `Fase '${state.currentPhase}' nao encontrada no state-machine.json.`,
      };
    }

    const phaseState = state.phases[phase.id];
    phaseState.attempt = (phaseState.attempt || 0) + 1;
    phaseState.startedAt = phaseState.startedAt || new Date().toISOString();

    // Log tentativa
    appendEvent(eventsPath, {
      event: "gate.attempt",
      phase: phase.id,
      attempt: phaseState.attempt,
      force,
    });

    // Se force, pula gate (logar com warn)
    if (force) {
      appendEvent(eventsPath, {
        event: "gate.forced",
        phase: phase.id,
        attempt: phaseState.attempt,
        warning: "force=true pula gate. Use apenas em situacoes excepcionais.",
      });
      return transitionPhase(state, phase, stateMachine, harnessDir, "forced");
    }

    // Valida gate
    const gateResult = validateGate(phase, {
      userApproval,
      scores,
      sprintCoverage,
      buildMetrics,
      cwd,
    });

    if (gateResult.passed) {
      phaseState.gate = gateResult;
      appendEvent(eventsPath, {
        event: "gate.passed",
        phase: phase.id,
        attempt: phaseState.attempt,
        details: gateResult.details,
      });
      return transitionPhase(state, phase, stateMachine, harnessDir, "completed");
    }

    // Gate falhou — classifica falha
    phaseState.gate = gateResult;
    appendEvent(eventsPath, {
      event: "gate.failed",
      phase: phase.id,
      attempt: phaseState.attempt,
      failureClass: gateResult.failureClass,
      reason: gateResult.reason,
    });

    // Aplica behavior da classe
    const failureClass = gateResult.failureClass;
    const phaseFailure = phase.onFailure || {};
    const classConfig = failureProtocol?.classes?.[failureClass];

    if (failureClass === "transient") {
      const maxRetries = classConfig?.maxAutoRetries || 3;
      if (phaseState.attempt < maxRetries) {
        return {
          success: false,
          gateResult,
          action: "retry",
          message: `Transient failure (attempt ${phaseState.attempt}/${maxRetries}). Retrying com backoff.`,
        };
      }
      // Esgotou — promove a user-action
      return {
        success: false,
        gateResult,
        action: "escalate",
        message: `Transient failure esgotou ${maxRetries} retries. Escala para user-action.`,
      };
    }

    if (failureClass === "quality") {
      const maxRetries = phaseFailure.maxAutoRetries || 2;
      const loopbackTo = phaseFailure.loopbackTo || phase.id;
      if (phaseState.attempt < maxRetries) {
        return {
          success: false,
          gateResult,
          action: "rework",
          loopbackTo,
          message: `Quality failure (attempt ${phaseState.attempt}/${maxRetries}). Rework com loopbackTo: ${loopbackTo}.`,
        };
      }
      return {
        success: false,
        gateResult,
        action: "escalate",
        message: `Quality failure esgotou ${maxRetries} retries. Escala para user-action.`,
      };
    }

    if (failureClass === "user-action") {
      return {
        success: false,
        gateResult,
        action: "block",
        message: `User-action needed. Bloqueia ate decisao humana.`,
        userPrompt: gateResult.userPrompt || "Decisao humana necessaria para avancar.",
      };
    }

    if (failureClass === "fatal") {
      appendEvent(eventsPath, {
        event: "halt",
        phase: phase.id,
        reason: gateResult.reason,
      });
      return {
        success: false,
        gateResult,
        action: "halt",
        message: `FATAL: ${gateResult.reason}. Requer fix manual antes de continuar.`,
      };
    }

    return {
      success: false,
      gateResult,
      action: "unknown",
      message: `Failure class '${failureClass}' nao reconhecida.`,
    };
  },
});

function validateGate(phase: any, params: any): any {
  const gate = phase.gate;
  const { userApproval, scores, sprintCoverage, buildMetrics, cwd } = params;

  switch (gate.type) {
    case "user-approval": {
      const passed = userApproval === true;
      return {
        passed,
        failureClass: passed ? null : "user-action",
        reason: passed ? "User approved" : "User did not approve (ou parametro userApproval nao foi true)",
        details: { userApproval },
        userPrompt: passed
          ? null
          : "Brief.md foi rejeitado ou ainda nao foi aprovado. Revise o conteudo e aprove para continuar.",
      };
    }

    case "presence-and-min": {
      const failures: string[] = [];
      for (const check of gate.checks || []) {
        const filePath = path.join(cwd, check.file);
        if (!fs.existsSync(filePath)) {
          failures.push(`${check.file} nao existe`);
          continue;
        }
        if (check.minLines) {
          const content = fs.readFileSync(filePath, "utf8");
          const lines = content.split("\n").filter((l) => l.trim().length > 0).length;
          if (lines < check.minLines) {
            failures.push(`${check.file} tem ${lines} linhas (min ${check.minLines})`);
          }
        }
        if (check.minDocs) {
          try {
            const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
            const count = json.totalDocs || (json.docs ? json.docs.length : 0);
            if (count < check.minDocs) {
              failures.push(`${check.file} tem ${count} docs (min ${check.minDocs})`);
            }
          } catch {
            failures.push(`${check.file} nao e JSON valido`);
          }
        }
        if (check.minSections) {
          const content = fs.readFileSync(filePath, "utf8");
          const sections = (content.match(/<section|<h1/g) || []).length;
          if (sections < check.minSections) {
            failures.push(`${check.file} tem ${sections} sections (min ${check.minSections})`);
          }
        }
      }
      const passed = failures.length === 0;
      return {
        passed,
        failureClass: passed ? null : "quality",
        reason: passed ? "All checks passed" : failures.join("; "),
        details: { checks: gate.checks, failures },
      };
    }

    case "score-threshold": {
      const failures: string[] = [];
      const actualScores: Record<string, number> = {};

      for (const check of gate.checks || []) {
        // Busca score real no arquivo físico de review mais recente
        const realScore = getRealReviewScore(cwd, check.agent);
        const paramScore = scores?.[check.agent];

        if (realScore === null) {
          failures.push(`Arquivo de auditoria fisica para o agent '${check.agent}' nao encontrado em .harness/reviews/. Execute o review antes de avancar.`);
          continue;
        }

        actualScores[check.agent] = realScore;

        // Compara se o score passado como parâmetro é diferente do gravado fisicamente (antifraude)
        if (paramScore !== undefined && paramScore !== realScore) {
          failures.push(`Fraude ou divergencia detectada para '${check.agent}': score fornecido (${paramScore}) nao bate com o score real do relatorio (${realScore})`);
          continue;
        }

        if (realScore < check.minScore) {
          failures.push(`${check.agent} score real ${realScore} < ${check.minScore} (em ${check.file || check.glob})`);
        }
      }
      const passed = failures.length === 0;
      return {
        passed,
        failureClass: passed ? null : "quality",
        reason: passed ? "All scores above threshold (validado fisicamente)" : failures.join("; "),
        details: { checks: gate.checks, scores: actualScores },
      };
    }

    case "coverage-check": {
      if (sprintCoverage === undefined) {
        return {
          passed: false,
          failureClass: "quality",
          reason: "sprintCoverage nao foi fornecido",
          details: { checks: gate.checks },
        };
      }
      const coverageCheck = (gate.checks || []).find((c: any) => c.type === "spec-coverage");
      const minCoverage = coverageCheck?.min || 100;
      const passed = sprintCoverage >= minCoverage;
      return {
        passed,
        failureClass: passed ? null : "quality",
        reason: passed
          ? `Coverage ${sprintCoverage}% >= ${minCoverage}%`
          : `Coverage ${sprintCoverage}% < ${minCoverage}%`,
        details: { sprintCoverage, minCoverage },
      };
    }

    case "all-of": {
      const failures: string[] = [];
      for (const check of gate.checks || []) {
        if (check.type === "coverage") {
          const cov = buildMetrics?.coverage;
          if (cov === undefined || cov < check.min) {
            failures.push(`Coverage ${cov ?? "undefined"} < ${check.min}`);
          }
        }
        if (check.type === "security") {
          const crit = buildMetrics?.criticalVulns || 0;
          const high = buildMetrics?.highVulns || 0;
          if (crit > (check.maxCritical || 0)) {
            failures.push(`Critical vulns ${crit} > ${check.maxCritical}`);
          }
          if (high > (check.maxHigh || 0)) {
            failures.push(`High vulns ${high} > ${check.maxHigh}`);
          }
        }
        if (check.type === "review") {
          const score = buildMetrics?.reviewScore;
          if (score === undefined || score < check.min) {
            failures.push(`Review score ${score ?? "undefined"} < ${check.min}`);
          }
        }
        // v6.2.0+ — LGPD check (lgpd-officer output)
        // Aceita buildMetrics.lgpdStatus ("compliant"|"warning"|"non-compliant")
        // E/OU buildMetrics.lgpdCriticalFindings, buildMetrics.lgpdHighFindings
        if (check.type === "lgpd") {
          const status = buildMetrics?.lgpdStatus;
          const lgpdCrit = buildMetrics?.lgpdCriticalFindings || 0;
          const lgpdHigh = buildMetrics?.lgpdHighFindings || 0;
          const minStatus = check.min || "warning";
          const maxCrit = check.maxCritical ?? 0;
          const maxHigh = check.maxHigh ?? 0;

          // Hierarchy: non-compliant > warning > compliant
          const statusRank: Record<string, number> = {
            compliant: 0,
            warning: 1,
            "non-compliant": 2,
          };
          const requiredRank = statusRank[minStatus] ?? 1;
          const actualRank = statusRank[status ?? "non-compliant"] ?? 2;

          if (actualRank > requiredRank) {
            failures.push(`LGPD status '${status ?? "undefined"}' below required '${minStatus}'`);
          }
          if (lgpdCrit > maxCrit) {
            failures.push(`LGPD critical findings ${lgpdCrit} > ${maxCrit}`);
          }
          if (lgpdHigh > maxHigh) {
            failures.push(`LGPD high findings ${lgpdHigh} > ${maxHigh}`);
          }
        }
      }
      const passed = failures.length === 0;
      return {
        passed,
        failureClass: passed ? null : "quality",
        reason: passed ? "All build checks passed" : failures.join("; "),
        details: { checks: gate.checks, buildMetrics },
      };
    }

    default:
      return {
        passed: false,
        failureClass: "fatal",
        reason: `Gate type '${gate.type}' nao reconhecido`,
        details: { gate },
      };
  }
}

function transitionPhase(state: any, phase: any, stateMachine: any, harnessDir: string, reason: string) {
  phase.completedAt = new Date().toISOString();
  phase.status = "completed";
  state.phases[phase.id] = phase;

  const nextPhaseId = phase.next?.[0];
  if (nextPhaseId) {
    state.currentPhase = nextPhaseId;
    const nextPhase = stateMachine.phases.find((p: any) => p.id === nextPhaseId);
    if (nextPhase) {
      state.phases[nextPhaseId] = state.phases[nextPhaseId] || {
        status: "pending",
        owner: nextPhase.owner,
        startedAt: null,
        completedAt: null,
        gate: null,
        score: null,
        attempt: 0,
      };
    }
  }
  state.updatedAt = new Date().toISOString();

  const statePath = path.join(harnessDir, "state.json");
  const tmpStatePath = `${statePath}.tmp`;
  fs.writeFileSync(tmpStatePath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpStatePath, statePath);

  updateProgressFile(state, stateMachine, harnessDir);

  const eventsPath = path.join(harnessDir, "events.jsonl");
  appendEvent(eventsPath, {
    event: "phase.completed",
    phase: phase.id,
    nextPhase: nextPhaseId || null,
    reason,
  });

  if (nextPhaseId) {
    appendEvent(eventsPath, {
      event: "phase.started",
      phase: nextPhaseId,
      owner: state.phases[nextPhaseId].owner,
    });
  }

  return {
    success: true,
    previousPhase: phase.id,
    currentPhase: state.currentPhase,
    nextPhase: nextPhaseId || null,
    reason,
  };
}

function appendEvent(eventsPath: string, event: any) {
  const entry = { ts: new Date().toISOString(), ...event };
  fs.appendFileSync(eventsPath, JSON.stringify(entry) + "\n");
}

/**
 * Atualiza o arquivo .harness/PROGRESS.md com o estado atual.
 */
function updateProgressFile(state: any, stateMachine: any, harnessDir: string) {
  const currentPhaseInfo = stateMachine.phases.find((p: any) => p.id === state.currentPhase);
  const completedPhases = Object.entries(state.phases)
    .filter(([_, info]: any) => info.status === "completed")
    .map(([id, _]) => {
      const p = stateMachine.phases.find((phase: any) => phase.id === id);
      return `- [x] **${id}**: ${p?.name || ""}`;
    });

  const nextPhaseId = currentPhaseInfo?.next?.[0];
  const nextPhase = nextPhaseId ? stateMachine.phases.find((p: any) => p.id === nextPhaseId)?.name || nextPhaseId : "Fim do workflow";

  // Progresso da Sprint (se aplicavel)
  let sprintProgress = "";
  if (state.currentSprint) {
    const sprintPath = path.join(harnessDir, "sprints", `${state.currentSprint}.json`);
    if (fs.existsSync(sprintPath)) {
      try {
        const sprintData = JSON.parse(fs.readFileSync(sprintPath, "utf8"));
        const tasks = sprintData.tasks || [];
        const done = tasks.filter((t: any) => t.status === "completed").length;
        sprintProgress = `\n### Progresso da Sprint: ${state.currentSprint}\n` +
          `- Tarefas: ${done}/${tasks.length} concluídas (${tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0}%)\n`;
      } catch (e) {
        // Ignora erro de parse, apenas não exibe o progresso
      }
    }
  }

  const content = `# Progresso do Projeto: ${state.project}\n\n` +
    `**Status:** ${state.currentPhase === "phase.5.complete" ? "Concluido" : "Em andamento"}\n` +
    `**Fase Atual:** \`${state.currentPhase}\` (${currentPhaseInfo?.name || ""})\n` +
    `**Owner:** ${currentPhaseInfo?.owner || "N/A"}\n` +
    `**Attempt:** ${state.phases[state.currentPhase]?.attempt || 0}\n` +
    sprintProgress +
    `\n## Fases Completas\n${completedPhases.length > 0 ? completedPhases.join("\n") : "(Nenhuma)"}\n\n` +
    `## Proximos Passos\n` +
    `- Finalizar fase atual para transicionar para \`${nextPhase}\`.\n` +
    (currentPhaseInfo?.outputContract?.files ? `- Entregar: ${currentPhaseInfo.outputContract.files.map((f: any) => `\`${f.path}\``).join(", ")}` : "");

  fs.writeFileSync(path.join(harnessDir, "PROGRESS.md"), content);
}

/**
 * Busca o score real de um revisor no arquivo JSON mais recente gravado em .harness/reviews/
 */
function getRealReviewScore(cwd: string, agentName: string): number | null {
  try {
    const reviewsDir = path.join(cwd, ".harness", "reviews");
    if (!fs.existsSync(reviewsDir)) return null;

    const files = fs.readdirSync(reviewsDir);
    // Identifica prefixo esperado: ex: prd-reviewer -> prd-review- ou prd-reviewer-review-
    const prefix1 = `${agentName}-review-`;
    const prefix2 = `${agentName.replace("-reviewer", "")}-review-`;

    const reviewFiles = files
      .filter(f => (f.startsWith(prefix1) || f.startsWith(prefix2)) && f.endsWith(".json"))
      .map(f => {
        const filePath = path.join(reviewsDir, f);
        const stat = fs.statSync(filePath);
        return { path: filePath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // Mais recente primeiro

    if (reviewFiles.length === 0) return null;

    const content = fs.readFileSync(reviewFiles[0].path, "utf8");
    const report = JSON.parse(content);
    return typeof report.score === "number" ? report.score : null;
  } catch (err) {
    return null;
  }
}

