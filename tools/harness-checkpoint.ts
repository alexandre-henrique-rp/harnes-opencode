import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";

const STASH_PREFIX = "harness-checkpoint";
const STASH_EMERGENCY = "harness-emergency";

function git(cwd: string, args: string): string {
  return execSync(`git ${args}`, { cwd, encoding: "utf8" }).trim();
}

function listStashes(cwd: string) {
  const out = git(cwd, `stash list --grep='${STASH_PREFIX}:' --format='%gd|%s|%cr'`);
  if (!out) return [];
  return out.split("\n").filter(Boolean).map((line) => {
    const [ref, message, age] = line.split("|");
    return { ref, message, age };
  });
}

export default tool({
  name: "harness-checkpoint",
  description: "Cria/lista/restaura checkpoints via git stash (não polui histórico do projeto).",
  args: {
    action: { type: "string", description: "'create' | 'list' | 'diff' | 'restore'" },
    taskId: { type: "string" },
    force: { type: "boolean", description: "Confirma restore destrutivo" },
  },
  async execute({ action, taskId, force = false }, context) {
    const cwd = context?.directory || process.cwd();
    const taskName = taskId || `task-${Date.now()}`;

    try { git(cwd, "rev-parse --is-inside-work-tree"); }
    catch { return { success: false, message: "Não é um repositório Git." }; }

    if (action === "create") {
      const status = git(cwd, "status --porcelain");
      if (!status) return { success: true, message: "Nada a salvar (repositório limpo)." };
      try {
        const msg = `${STASH_PREFIX}: pre-task ${taskName}`;
        git(cwd, `stash push --include-untracked --message "${msg}"`);
        return { success: true, message: `Checkpoint criado: ${msg}` };
      } catch (err) {
        return { success: false, message: `Erro ao criar checkpoint: ${(err as Error).message}` };
      }
    }

    if (action === "list") {
      const stashes = listStashes(cwd);
      return { success: true, message: stashes.length ? `${stashes.length} checkpoint(s)` : "Nenhum checkpoint.", stashes };
    }

    if (action === "diff") {
      const target = listStashes(cwd)[0];
      if (!target) return { success: false, message: "Nenhum checkpoint." };
      const diff = git(cwd, `stash show -p ${target.ref}`);
      return { success: true, message: `Diff de ${target.message}:`, diff };
    }

    if (action === "restore") {
      const target = listStashes(cwd)[0];
      if (!target) return { success: false, message: "Nenhum checkpoint." };

      if (!force) {
        const diff = git(cwd, `stash show --stat ${target.ref}`);
        return {
          success: false,
          requiresForce: true,
          message: `Restore de "${target.message}" (${target.age}):\n${diff}\n\nRode novamente com force=true.`,
        };
      }

      try {
        git(cwd, `stash push -m "${STASH_EMERGENCY}: pre-restore backup"`);
        git(cwd, `stash pop ${target.ref}`);
        return { success: true, message: `Restaurado. Backup de segurança salvo como "${STASH_EMERGENCY}".` };
      } catch (err) {
        return { success: false, message: `Erro no restore. Estado preservado em "${STASH_EMERGENCY}".\n${(err as Error).message}` };
      }
    }

    return { success: false, message: "Ação inválida. Use: create | list | diff | restore." };
  },
});
