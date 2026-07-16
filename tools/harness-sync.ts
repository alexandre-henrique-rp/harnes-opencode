/**
 * harness-sync.ts — Harness v6 tool
 *
 * Sincroniza e corrige a estrutura do .harness/ em projetos já inicializados.
 * Utilidade:
 * 1. Move arquivos de configuração como `.ai-jail`, `opencode.json`, `state-machine.json` e `failure-protocol.json` para `.harness/`.
 * 2. Migra estruturas antigas de tasks (se soltas em txt ou logs) para o novo padrão relacional JSON (ex: S01.json).
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "harness-sync",
  description:
    "Audita, corrige a estrutura e realiza migração (upgrade) de projetos antigos do harness, garantindo que os arquivos cruciais fiquem dentro de .harness/.",
  args: {},
  async execute(args, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");

    if (!fs.existsSync(harnessDir)) {
      return { success: false, error: "Diretorio .harness/ não encontrado. Use harness-init primeiro." };
    }

    const migratedFiles: string[] = [];
    const migrations: string[] = [];

    // 1. Move arquivos de configuração globais para .harness/
    const configFiles = [
      ".ai-jail",
      "opencode.json",
      "state-machine.json",
      "state-machine-lean.json",
      "failure-protocol.json",
    ];

    for (const fileName of configFiles) {
      const srcPath = path.join(cwd, fileName);
      const destPath = path.join(harnessDir, fileName);

      if (fs.existsSync(srcPath)) {
        if (!fs.existsSync(destPath)) {
          fs.renameSync(srcPath, destPath);
          migratedFiles.push(`${fileName} (movido para .harness/)`);
        } else {
          // Se já existe no destino, apenas deleta o que ficou sobrando na raiz
          fs.unlinkSync(srcPath);
          migratedFiles.push(`${fileName} (removido da raiz, já existia em .harness/)`);
        }
      }
    }

    // 2. Migração de Sprints e Tasks antigas
    const sprintsDir = path.join(harnessDir, "sprints");
    if (fs.existsSync(sprintsDir)) {
      const indexFile = path.join(sprintsDir, "index.json");
      if (fs.existsSync(indexFile)) {
        try {
          const sprintIndex = JSON.parse(fs.readFileSync(indexFile, "utf8"));
          const sprints = sprintIndex.sprints || [];

          for (const sprint of sprints) {
            const sprintId = sprint.id;
            const sprintDbPath = path.join(sprintsDir, `${sprintId}.json`);
            
            // Se o arquivo SXX.json não existir, significa que é um projeto antigo
            // Vamos tentar inferir as tasks lendo os arquivos TXXX_PROMPT.md
            if (!fs.existsSync(sprintDbPath)) {
              const sprintFolder = path.join(sprintsDir, sprintId);
              const tasksFolder = path.join(sprintFolder, "tasks");

              if (fs.existsSync(tasksFolder)) {
                const files = fs.readdirSync(tasksFolder);
                const taskPrompts = files.filter(f => f.endsWith("_PROMPT.md"));
                
                const tasksList = [];
                for (const file of taskPrompts) {
                  const taskId = file.replace("_PROMPT.md", "");
                  // Extraindo o título do markdown (ex: # Task: Implementar Login)
                  const content = fs.readFileSync(path.join(tasksFolder, file), "utf8");
                  const titleMatch = content.match(/# Task:\s*(.+)/);
                  const title = titleMatch ? titleMatch[1].trim() : `Task ${taskId}`;
                  
                  let status = "pending";
                  // Verifica se tem log concluído
                  if (fs.existsSync(path.join(tasksFolder, `${taskId}_LOG.json`))) {
                    status = "completed";
                  }

                  tasksList.push({
                    id: taskId,
                    sprintId,
                    title,
                    status,
                    type: taskId.includes("BE") ? "backend" : taskId.includes("FE") ? "frontend" : "task"
                  });
                }

                if (tasksList.length > 0) {
                  const sprintDbData = {
                    id: sprintId,
                    _type: "harness-sprint-v6",
                    version: 1,
                    createdAt: new Date().toISOString(),
                    tasks: tasksList
                  };
                  fs.writeFileSync(sprintDbPath, JSON.stringify(sprintDbData, null, 2));
                  migrations.push(`Banco de dados ${sprintId}.json gerado a partir de ${tasksList.length} arquivos soltos.`);
                }
              }
            }
          }
        } catch (e: any) {
          return { success: false, error: `Erro na migração de Sprints: ${e.message}` };
        }
      }
    }

    return {
      success: true,
      message: "Sincronização e auditoria concluídas com sucesso.",
      migratedFiles,
      migrations
    };
  }
});
