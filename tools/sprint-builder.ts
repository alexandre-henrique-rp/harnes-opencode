/**
 * sprint-builder.ts — Harness v6 tool
 *
 * Inicializa fisicamente as pastas de sprint e gera esqueletos de tarefas (TXXX_PROMPT.md)
 * deterministicamente a partir de User Stories ou parâmetros informados, economizando passos da LLM.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export default tool({
  name: "sprint-builder",
  description:
    "Inicializa diretórios de sprints de forma física e cria esqueletos de tarefas TXXX_PROMPT.md de forma determinística.",
  args: {
    sprintId: tool.schema.string().describe("ID da sprint a ser construída (ex: 'S01')"),
    projectName: tool.schema.string().optional().describe("Nome do projeto"),
    tasks: tool.schema
      .array(
        tool.schema.object({
          id: tool.schema.string(),
          title: tool.schema.string(),
          type: tool.schema.enum(["backend", "frontend", "test"]),
          milestone: tool.schema.string().optional().default("M1"),
        })
      )
      .optional()
      .describe("Lista de tarefas para preencher de forma determinística"),
  },
  async execute({ sprintId, projectName = "projeto-harness", tasks = [] }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const sprintsDir = path.join(harnessDir, "sprints");
    const activeSprintDir = path.join(sprintsDir, sprintId);
    const tasksDir = path.join(activeSprintDir, "tasks");
    const taskTemplatePath = path.join(cwd, "templates", "TASK-PROMPT-TEMPLATE.md");
    const globalTaskTemplatePath = path.join(__dirname, "..", "templates", "TASK-PROMPT-TEMPLATE.md");

    // 1. Cria diretórios
    if (!fs.existsSync(sprintsDir)) {
      fs.mkdirSync(sprintsDir, { recursive: true });
    }
    if (!fs.existsSync(tasksDir)) {
      fs.mkdirSync(tasksDir, { recursive: true });
    }

    const filesCreated: string[] = [];

    // 2. Carrega template de task
    let taskTemplate = "";
    const activeTemplate = fs.existsSync(taskTemplatePath)
      ? taskTemplatePath
      : fs.existsSync(globalTaskTemplatePath)
      ? globalTaskTemplatePath
      : null;

    if (activeTemplate) {
      taskTemplate = fs.readFileSync(activeTemplate, "utf8");
    } else {
      taskTemplate = `---\nid: "{{id}}"\nstatus: "pending"\ntype: "{{type}}"\nsprint: "{{sprint}}"\nmilestone: "{{milestone}}"\n---\n\n# Task: {{title}}\n\n## Objetivo\n\n## Acceptance Criteria\n- [ ] `;
    }

    // 3. Se nenhuma task foi informada, tenta varrer o SPEC.md em busca de User Stories
    let finalTasks = [...tasks];
    if (finalTasks.length === 0) {
      const specPath = path.join(harnessDir, "SPEC.md");
      if (fs.existsSync(specPath)) {
        const specContent = fs.readFileSync(specPath, "utf8");
        // Regex para capturar IDs de User Stories, ex: "US-001" ou "US-002"
        const storyMatches = specContent.match(/US-\d+/g) || [];
        const uniqueStories = Array.from(new Set(storyMatches));

        uniqueStories.forEach((storyId, idx) => {
          const taskIndex = String(idx + 1).padStart(3, "0");
          // Para cada história, cria tarefas básicas de backend e frontend
          finalTasks.push({
            id: `T${taskIndex}-BE`,
            title: `Implementação do backend para ${storyId}`,
            type: "backend",
            milestone: "M1",
          });
          finalTasks.push({
            id: `T${taskIndex}-FE`,
            title: `Implementação do frontend para ${storyId}`,
            type: "frontend",
            milestone: "M1",
          });
        });
      }
    }

    // 4. Cria fisicamente os arquivos TXXX_PROMPT.md
    finalTasks.forEach((task) => {
      const taskFileName = `${task.id}_PROMPT.md`;
      const taskFilePath = path.join(tasksDir, taskFileName);

      const processed = taskTemplate
        .replace(/TXXX/g, task.id)
        .replace(/\{\{id\}\}/g, task.id)
        .replace(/backend\|frontend\|test/g, task.type)
        .replace(/\{\{type\}\}/g, task.type)
        .replace(/SXX/g, sprintId)
        .replace(/\{\{sprint\}\}/g, sprintId)
        .replace(/MX/g, task.milestone || "M1")
        .replace(/\{\{milestone\}\}/g, task.milestone || "M1")
        .replace(/\{\{title\}\}/g, task.title);

      fs.writeFileSync(taskFilePath, processed);
      filesCreated.push(path.relative(cwd, taskFilePath));
    });

    // 5. Gera ou atualiza sprints/index.json
    const indexFilePath = path.join(sprintsDir, "index.json");
    let sprintIndex: any = {
      _type: "harness-sprint-index-v6",
      version: 1,
      project: projectName,
      generatedAt: new Date().toISOString(),
      sprints: [],
    };

    if (fs.existsSync(indexFilePath)) {
      try {
        sprintIndex = JSON.parse(fs.readFileSync(indexFilePath, "utf8"));
      } catch (e) {}
    }

    // Adiciona ou atualiza a sprint atual no catálogo
    const existingSprint = sprintIndex.sprints.find((s: any) => s.id === sprintId);
    if (!existingSprint) {
      sprintIndex.sprints.push({
        id: sprintId,
        name: `Sprint ${sprintId.replace(/\D/g, "")}`,
        goal: `Objetivo da Sprint ${sprintId}`,
        status: "pending",
        taskCount: finalTasks.length,
        startedAt: null,
        finishedAt: null,
      });
      fs.writeFileSync(indexFilePath, JSON.stringify(sprintIndex, null, 2));
      filesCreated.push(path.relative(cwd, indexFilePath));
    }

    // 6. Gera SPRINT_PLAN.md básico
    const planFilePath = path.join(activeSprintDir, "SPRINT_PLAN.md");
    if (!fs.existsSync(planFilePath)) {
      let sprintPlan = `# Sprint Plan — ${sprintId}\n\n`;
      sprintPlan += `## Objetivos da Sprint\n- Concluir as tarefas de ${sprintId}.\n\n`;
      sprintPlan += `## Tarefas Planejadas\n`;
      finalTasks.forEach((t) => {
        sprintPlan += `- [ ] **${t.id}**: ${t.title} (${t.type})\n`;
      });
      fs.writeFileSync(planFilePath, sprintPlan);
      filesCreated.push(path.relative(cwd, planFilePath));
    }

    // 7. Gera o arquivo de banco de dados da sprint SXX.json
    const sprintDbPath = path.join(sprintsDir, `${sprintId}.json`);
    if (!fs.existsSync(sprintDbPath)) {
      const sprintDbData = {
        id: sprintId,
        _type: "harness-sprint-v6",
        version: 1,
        createdAt: new Date().toISOString(),
        tasks: finalTasks.map((t) => ({
          id: t.id,
          sprintId,
          title: t.title,
          status: "pending",
          type: t.type,
        }))
      };
      fs.writeFileSync(sprintDbPath, JSON.stringify(sprintDbData, null, 2));
      filesCreated.push(path.relative(cwd, sprintDbPath));
    }

    return {
      success: true,
      sprintId,
      projectName,
      tasksGenerated: finalTasks.length,
      filesCreated,
      message: `Estrutura física e micro-prompts da sprint '${sprintId}' criados com sucesso.`
    };
  },
});
