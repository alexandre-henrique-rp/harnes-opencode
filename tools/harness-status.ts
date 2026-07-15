/**
 * harness-status.ts — Harness v6 tool
 *
 * Le `.harness/state.json` + `.harness/events.jsonl` e retorna:
 *   - Fase atual
 *   - Progresso (X/Y fases completas, %)
 *   - Sprint atual (se fase 4+)
 *   - Ultimo evento
 *   - Gates passados/falhados
 *
 * Read-only. NUNCA modifica state.json ou events.jsonl.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "harness-status",
  description:
    "Mostra o estado atual do workflow Harness v6. Le .harness/state.json + events.jsonl, retorna fase, progresso, sprint, ultimo evento.",
  args: {
    verbose: tool.schema
      .boolean()
      .optional()
      .describe("Se true, retorna detalhes de cada fase (scores, timestamps, attempts)"),
  },
  async execute({ verbose = false }, context) {
    const mcpResponse = (data: Record<string, any>) => ({
      ...data,
      content: [
        {
          type: "text",
          text: JSON.stringify(data, null, 2)
        }
      ]
    });
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const statePath = path.join(harnessDir, "state.json");
    const eventsPath = path.join(harnessDir, "events.jsonl");
    const stateMachinePath = path.join(harnessDir, "state-machine.json");

    // Validacoes
    if (!fs.existsSync(harnessDir)) {
      return mcpResponse({
        success: false,
        error: `.harness/ nao existe em ${cwd}. Rode 'harness_init' primeiro.`,
      });
    }
    if (!fs.existsSync(statePath)) {
      return mcpResponse({
        success: false,
        error: `.harness/state.json nao existe. Estado corrompido. Rode 'harness_init --force'.`,
      });
    }

    // Carrega state
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const stateMachine = fs.existsSync(stateMachinePath)
      ? JSON.parse(fs.readFileSync(stateMachinePath, "utf8"))
      : { phases: [] };

    // Calcula progresso
    const totalPhases = stateMachine.phases?.length || Object.keys(state.phases).length;
    const completedPhases = Object.values<any>(state.phases).filter(
      (p) => p.status === "completed"
    ).length;
    const progressPercent = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

    // Ultimo evento
    let lastEvent = null;
    let lastEvents: any[] = [];
    if (fs.existsSync(eventsPath)) {
      const lines = fs.readFileSync(eventsPath, "utf8").trim().split("\n").filter(Boolean);
      lastEvents = lines
        .slice(-10)
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      lastEvent = lastEvents[lastEvents.length - 1] || null;
    }

    // Encontra phase info
    const currentPhaseInfo = stateMachine.phases?.find(
      (p: any) => p.id === state.currentPhase
    );

    // Output resumido
    const result: any = {
      success: true,
      project: state.project,
      currentPhase: state.currentPhase,
      currentPhaseName: currentPhaseInfo?.name || state.currentPhase,
      currentPhaseOwner: currentPhaseInfo?.owner || null,
      progress: {
        completed: completedPhases,
        total: totalPhases,
        percent: progressPercent,
      },
      currentSprint: state.currentSprint,
      lastEvent: lastEvent
        ? {
            ts: lastEvent.ts,
            type: lastEvent.event,
            actor: lastEvent.actor,
            phase: lastEvent.phase,
          }
        : null,
      timestamp: new Date().toISOString(),
    };

    if (verbose) {
      result.phases = state.phases;
      result.recentEvents = lastEvents.reverse();
      result.nextPhase = currentPhaseInfo?.next?.[0] || null;
      result.outputContract = currentPhaseInfo?.outputContract || null;
      result.gate = currentPhaseInfo?.gate || null;
    }

    return mcpResponse(result);
  },
});
