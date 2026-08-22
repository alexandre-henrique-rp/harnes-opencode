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
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

export default tool({
  description:
    "Mostra o estado atual do workflow Harness v6. Le .harness/state.json + events.jsonl, retorna fase, progresso, sprint, ultimo evento.",
  args: {
    verbose: tool.schema
      .boolean()
      
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

    try {
      let cwd = resolveProjectCwd(context, { log: console.error });
      let harnessDir = path.join(cwd, ".harness");
      
      // Procura subindo os diretórios caso esteja executando dentro de uma subpasta
      while (!fs.existsSync(harnessDir) && cwd !== path.parse(cwd).root) {
        cwd = path.dirname(cwd);
        harnessDir = path.join(cwd, ".harness");
      }

      const statePath = path.join(harnessDir, "state.json");
      const eventsPath = path.join(harnessDir, "events.jsonl");
      const stateMachinePath = path.join(harnessDir, "state-machine.json");

      // Validacoes — sempre retorna JSON bem-formado, nunca throw
      if (!fs.existsSync(harnessDir)) {
        return mcpResponse({
          success: false,
          initialized: false,
          error: `.harness/ nao existe em ${cwd}.`,
          recommendation: "Rode a ferramenta 'harness-init' para inicializar o projeto (perfil: strict ou lean).",
          timestamp: new Date().toISOString(),
        });
      }
      if (!fs.existsSync(statePath)) {
        return mcpResponse({
          success: false,
          initialized: true,
          error: `.harness/state.json nao existe.`,
          recommendation: "Rode 'harness-init --force' para recriar o estado.",
          timestamp: new Date().toISOString(),
        });
      }

      // Carrega state com fallback defensivo
      let state: any;
      try {
        state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      } catch (e) {
        return mcpResponse({
          success: false,
          initialized: true,
          error: `state.json corrompido: ${(e as Error).message}`,
          recommendation: "Rode 'harness-init --force' para recriar.",
          timestamp: new Date().toISOString(),
        });
      }

      const stateMachine = fs.existsSync(stateMachinePath)
        ? (() => { try { return JSON.parse(fs.readFileSync(stateMachinePath, "utf8")); } catch { return { phases: [] }; } })()
        : { phases: [] };

      // Calcula progresso (defensivo contra state malformado)
      const totalPhases = stateMachine.phases?.length || Object.keys(state.phases || {}).length;
      const completedPhases = Object.values<any>(state.phases || {}).filter(
        (p) => p?.status === "completed"
      ).length;
      const progressPercent = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

      // Ultimo evento — leitura defensiva
      let lastEvent: any = null;
      let lastEvents: any[] = [];
      try {
        if (fs.existsSync(eventsPath)) {
          const content = String(fs.readFileSync(eventsPath, "utf8") || "");
          const lines = content ? String(content).split("\n").map(l => l.trim()).filter(Boolean) : [];
          lastEvents = lines
            .slice(-10)
            .map((l) => { try { return JSON.parse(l); } catch { return null; } })
            .filter(Boolean);
          lastEvent = lastEvents[lastEvents.length - 1] || null;
        }
      } catch { /* ignora erros de leitura */ }

      // Encontra phase info (defensivo)
      const currentPhaseInfo = (stateMachine.phases || []).find(
        (p: any) => p?.id === state.currentPhase
      );

      // Output resumido
      const result: any = {
        success: true,
        initialized: true,
        project: state.project || "(sem nome)",
        currentPhase: state.currentPhase || "unknown",
        currentPhaseName: currentPhaseInfo?.name || state.currentPhase || "unknown",
        currentPhaseOwner: currentPhaseInfo?.owner || null,
        progress: {
          completed: completedPhases,
          total: totalPhases,
          percent: progressPercent,
        },
        currentSprint: state.currentSprint || null,
        lastEvent: lastEvent
          ? {
              ts: lastEvent.ts || null,
              type: lastEvent.event || null,
              actor: lastEvent.actor || null,
              phase: lastEvent.phase || null,
            }
          : null,
        timestamp: new Date().toISOString(),
      };

      if (verbose) {
        result.phases = state.phases || {};
        result.recentEvents = (lastEvents || []).slice().reverse();
        result.nextPhase = currentPhaseInfo?.next?.[0] || null;
        result.outputContract = currentPhaseInfo?.outputContract || null;
        result.gate = currentPhaseInfo?.gate || null;
      }

      return mcpResponse(result);
    } catch (e) {
      // Catch-all: nunca propaga throw (evita "Cannot read properties of undefined")
      return mcpResponse({
        success: false,
        initialized: false,
        error: `Erro inesperado no harness-status: ${(e as Error).message}`,
        recommendation: "Verifique permissoes de leitura em .harness/ e reinicie se persistir.",
        timestamp: new Date().toISOString(),
      });
    }
  },
});
