/**
 * status-injector.ts — Harness v6 plugin
 *
 * Injeta status do workflow (phase atual, sprint, etc) no system prompt
 * de cada mensagem. Assim o LLM sempre sabe em qual fase está.
 *
 * Formato: opencode Plugin v1.
 *
 * Lê `.harness/state.json` do worktree e injeta um bloco <harness-status>
 * no system prompt. Stateless (re-lê a cada chamada, não cacheia).
 *
 * v6.7.0+:
 *   - Usa `resolveProjectCwdWithSource` para detectar modo fallback e avisar
 *     o usuário uma única vez por sessão (com dica de criar project.json).
 *   - Dedupe anúncios de `session.created` por projectRoot — evita spam
 *     quando 3+ plugins inicializam juntos.
 */

import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import {
  resolveProjectCwd,
  resolveProjectCwdWithSource,
  type ResolvedCwd,
} from "./lib/resolve-project-cwd.js";
import { quietWarn } from "./lib/quiet-warn.js";

// Local helper: warnings de sessão vão para arquivo (não stderr/UI).
const warn = (msg: string) => quietWarn("status-injector", msg);

const STATE_FILE = ".harness/state.json";
const STATE_MACHINE_FILE = ".harness/state-machine.json";

// v6.7.0+: dedupe de anúncios `session.created` por projectRoot nesta sessão.
// (Map preserva ordem de inserção, o que serve como LRU-ish bound.)
const announcedSessionStarts = new Map<string, number>();
const ANNOUNCED_MAX = 32;

export default async function StatusInjectorPlugin(ctx: any) {
  // Resolve projectRoot com helper centralizado.
  // Cache interno (v6.7.0+) garante que o warning saia 1× por sessão, não 3×.
  const projectRoot: string = resolveProjectCwd(ctx, { log: (m: string) => quietWarn("status-injector", m) });
  const resolved: ResolvedCwd = resolveProjectCwdWithSource(ctx, { verbose: false });

  return {
    // Migrado de session.created (inexistente na API 1.18.3).
    // Usa event hook filtrando session.created para detectar início de sessão.
    event: async ({ event }) => {
      if (event.type !== "session.created") return;

      // Dedupe: se já anunciamos para este projectRoot nesta sessão, skipa.
      // Protege contra race quando plugins inicializam em paralelo.
      if (announcedSessionStarts.has(projectRoot)) {
        return;
      }
      if (announcedSessionStarts.size >= ANNOUNCED_MAX) {
        // FIFO eviction
        const firstKey = announcedSessionStarts.keys().next().value;
        if (firstKey !== undefined) announcedSessionStarts.delete(firstKey);
      }
      announcedSessionStarts.set(projectRoot, Date.now());

      const statusBlock = buildStatusBlock(projectRoot);
      if (statusBlock) {
        warn(`session started, harness status:\n${statusBlock}`);
      }

      // v6.7.0+: se caiu no fallback, dá dica útil ao usuário uma vez.
      if (resolved.source === "fallback") {
        const tip = buildFallbackTip(resolved);
        if (tip) warn(tip);
      }
    },

    "experimental.session.compacting": async (input, output) => {
      // Quando o contexto for compactado, injeta status fresco
      const statusBlock = buildStatusBlock(projectRoot);
      if (statusBlock) {
        output.context.push(`## Harness v6 Status (injected)\n${statusBlock}\n`);
      }
    },
  };
};

/**
 * v6.7.0+: monta uma dica útil quando projectRoot caiu no fallback.
 * Inclui lista de irmãos detectados (se houver) e comando shell pronto.
 */
function buildFallbackTip(resolved: ResolvedCwd): string | null {
  const siblings = resolved.siblings ?? [];
  if (siblings.length > 0) {
    return (
      `⚠️  projectRoot em modo fallback. Detectei projetos irmãos: ${siblings.join(", ")}. ` +
      `Se este é um workspace multi-projeto, crie .harness/project.json para silenciar este aviso.`
    );
  }
  return (
    `⚠️  projectRoot em modo fallback (nenhum marcador detectado). ` +
    `Crie .harness/project.json com projectRoot explícito para silenciar este aviso.`
  );
}

function buildStatusBlock(cwd: string): string | null {
  try {
    const statePath = path.resolve(cwd, STATE_FILE);
    if (!fs.existsSync(statePath)) {
      return "_harness not initialized (no .harness/state.json)_";
    }
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));

    const smPath = path.resolve(cwd, STATE_MACHINE_FILE);
    let phaseName = state.currentPhase;
    let phaseOwner = "?";
    if (fs.existsSync(smPath)) {
      const sm = JSON.parse(fs.readFileSync(smPath, "utf8"));
      const phase = sm.phases?.find((p: any) => p.id === state.currentPhase);
      if (phase) {
        phaseName = `${phase.id} (${phase.name})`;
        phaseOwner = phase.owner;
      }
    }

    const phaseState = state.phases?.[state.currentPhase] || {};
    const progress = computeProgress(state);

    return [
      `Phase: ${phaseName}`,
      `Owner: ${phaseOwner}`,
      `Status: ${phaseState.status || "unknown"}`,
      `Attempt: ${phaseState.attempt || 0}`,
      `Sprint: ${state.currentSprint || "none"}`,
      `Progress: ${progress.completed}/${progress.total} (${progress.percent}%)`,
    ].join("\n");
  } catch (err) {
    return `_failed to read state: ${err}_`;
  }
}

function computeProgress(state: any): { completed: number; total: number; percent: number } {
  const phases = state.phases || {};
  const total = Object.keys(phases).length;
  const completed = Object.values<any>(phases).filter((p) => p?.status === "completed").length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percent };
}
