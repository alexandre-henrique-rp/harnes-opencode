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
 */

import type { Plugin } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

const STATE_FILE = ".harness/state.json";
const STATE_MACHINE_FILE = ".harness/state-machine.json";

export default async function StatusInjectorPlugin(ctx: any) {
  const directory = ctx?.directory;
  const worktree = ctx?.worktree;
  return {
    "session.created": async () => {
      const statusBlock = buildStatusBlock(worktree || directory || process.cwd());
      if (statusBlock) {
        process.stderr.write(
          `[status-injector] session started, harness status:\n${statusBlock}\n`
        );
      }
    },

    "experimental.session.compacting": async (input, output) => {
      // Quando o contexto for compactado, injeta status fresco
      const statusBlock = buildStatusBlock(worktree || directory || process.cwd());
      if (statusBlock) {
        output.context.push(`## Harness v6 Status (injected)\n${statusBlock}\n`);
      }
    },
  };
};

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
