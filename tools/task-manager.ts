/**
 * task-manager.ts — Harness v6 tool
 *
 * Automatiza a gestão de estado de tasks granulares.
 * 1. Atualiza o cabeçalho (YAML frontmatter) de arquivos .md (status: "completed", etc).
 * 2. Gera o arquivo TXXX_LOG.json com o log granular das alterações.
 * 3. Registra artefatos no registry.json global.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "task_manager",
  description: "Atualiza o status de uma task, gera seu log granular e registra artefatos no registro global.",
  args: {
    taskId: tool.schema.string().describe("ID da task (ex: T001)"),
    sprintId: tool.schema.string().describe("ID da sprint (ex: S01)"),
    status: tool.schema.enum(["pending", "in_progress", "completed", "blocked"]).describe("Novo status da task"),
    artifacts: tool.schema.array(tool.schema.object({
      path: tool.schema.string().describe("Caminho do arquivo criado/modificado"),
      type: tool.schema.string().describe("Tipo do artefato (component, service, api, etc)"),
      description: tool.schema.string().describe("O que foi feito"),
    })).optional().describe("Lista de arquivos e alterações realizadas"),
    blockerReason: tool.schema.string().optional().describe("Motivo do bloqueio, se status for 'blocked'"),
  },
  async execute({ taskId, sprintId, status, artifacts = [], blockerReason }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const sprintDir = path.join(harnessDir, "sprints", sprintId);
    const taskPromptPath = path.join(sprintDir, "tasks", `${taskId}_PROMPT.md`);
    const taskLogPath = path.join(sprintDir, "tasks", `${taskId}_LOG.json`);
    const registryPath = path.join(harnessDir, "registry.json");

    if (!fs.existsSync(harnessDir)) {
      return { success: false, error: "Diretorio .harness nao encontrado." };
    }

    // 1. Atualizar Header do Markdown (TXXX_PROMPT.md)
    if (fs.existsSync(taskPromptPath)) {
      let content = fs.readFileSync(taskPromptPath, "utf8");
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      
      if (yamlMatch) {
        let yamlContent = yamlMatch[1];
        if (yamlContent.includes("status:")) {
          yamlContent = yamlContent.replace(/status:\s*".*?"/, `status: "${status}"`);
          if (blockerReason) {
            if (yamlContent.includes("blocker:")) {
              yamlContent = yamlContent.replace(/blocker:\s*".*?"/, `blocker: "${blockerReason}"`);
            } else {
              yamlContent += `\nblocker: "${blockerReason}"`;
            }
          }
        } else {
          yamlContent += `\nstatus: "${status}"`;
        }
        content = content.replace(/^---\n[\s\S]*?\n---/, `---\n${yamlContent}\n---`);
      } else {
        // Se não tem frontmatter, cria um
        const header = `---\nid: "${taskId}"\nsprint: "${sprintId}"\nstatus: "${status}"${blockerReason ? `\nblocker: "${blockerReason}"` : ""}\n---\n\n`;
        content = header + content;
      }
      fs.writeFileSync(taskPromptPath, content);
    }

    // 2. Gerar/Atualizar Log Granular (TXXX_LOG.json)
    if (status === "completed" || artifacts.length > 0) {
      const logData = {
        taskId,
        sprintId,
        updatedAt: new Date().toISOString(),
        status,
        artifacts,
        blockerReason
      };
      fs.writeFileSync(taskLogPath, JSON.stringify(logData, null, 2));
    }

    // 3. Atualizar Registry Global (registry.json)
    if (status === "completed" && artifacts.length > 0) {
      let registry = { entities: [] };
      if (fs.existsSync(registryPath)) {
        try {
          registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        } catch (e) {
          // ignore parse error, start fresh
        }
      }

      for (const art of artifacts) {
        // Evita duplicatas, atualiza se já existir
        const existingIndex = registry.entities.findIndex((e: any) => e.path === art.path);
        const entity = {
          ...art,
          taskId,
          sprintId,
          lastUpdated: new Date().toISOString()
        };

        if (existingIndex >= 0) {
          registry.entities[existingIndex] = entity;
        } else {
          registry.entities.push(entity);
        }
      }
      fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
    }

    return {
      success: true,
      message: `Task ${taskId} atualizada para ${status}.`,
      filesUpdated: [taskPromptPath, taskLogPath, registryPath].filter(p => fs.existsSync(p) || p.endsWith(".json"))
    };
  },
});
