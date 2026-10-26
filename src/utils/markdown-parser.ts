/**
 * Utilitários para análise de arquivos Markdown de agentes, especificações (SPEC.md)
 * e planejamento de Sprints e Tasks com Spec individual (TASKS.md) no OpenCode Harness v7.
 */

export interface FrontmatterResult {
  valid: boolean;
  attributes: Record<string, string | boolean>;
  body: string;
}

export interface SpecMetadata {
  acIds: string[];
  brIds: string[];
  hasUi: boolean;
  containsPii: boolean;
  frontmatterValid: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  sprint?: string;
  agent?: string;
  taskSpec?: string;
  coveredIds: string[];
}

export interface AuditFinding {
  code:
    | "MISSING_SPEC_FRONTMATTER"
    | "NO_ACCEPTANCE_CRITERIA"
    | "NO_BUSINESS_RULES"
    | "MISSING_TASKS_FILE"
    | "NO_TASKS_DEFINED"
    | "MISSING_TASK_SPEC"
    | "ORPHAN_REQUIREMENT"
    | "UNKNOWN_REQUIREMENT_REF"
    | "MISSING_DESIGN_FILE"
    | "INCOMPLETE_TASK";
  severity: "error" | "warning";
  message: string;
}

export interface FeatureAuditResult {
  feature: string;
  passed: boolean;
  acCount: number;
  brCount: number;
  sprints: string[];
  totalTasks: number;
  completedTasks: number;
  orphanIds: string[];
  findings: AuditFinding[];
}

/**
 * Extrai e valida o bloco YAML frontmatter simples do início de um arquivo Markdown.
 */
export function parseFrontmatter(markdown: string): FrontmatterResult {
  const normalized = markdown.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { valid: false, attributes: {}, body: normalized };
  }

  const endIdx = normalized.indexOf("\n---\n", 4);
  if (endIdx === -1) {
    return { valid: false, attributes: {}, body: normalized };
  }

  const rawYaml = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 5);
  const attributes: Record<string, string | boolean> = {};

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();

    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (val === "true") {
      attributes[key] = true;
    } else if (val === "false") {
      attributes[key] = false;
    } else {
      attributes[key] = val;
    }
  }

  return { valid: true, attributes, body };
}

/**
 * Extrai todos os identificadores AC-XX e BR-XX e metadados de uma SPEC.md.
 */
export function extractSpecIds(specMarkdown: string): SpecMetadata {
  const fm = parseFrontmatter(specMarkdown);

  // Busca códigos AC-01, AC-02... e BR-01, BR-02... no corpo da especificação
  const acMatches = fm.body.match(/\bAC-\d{2,}\b/g) ?? [];
  const brMatches = fm.body.match(/\bBR-\d{2,}\b/g) ?? [];

  const acIds = Array.from(new Set(acMatches)).sort();
  const brIds = Array.from(new Set(brMatches)).sort();

  const hasUi = fm.attributes["has_ui"] !== false;
  const containsPii = fm.attributes["contains_pii"] === true;

  return {
    acIds,
    brIds,
    hasUi,
    containsPii,
    frontmatterValid: fm.valid,
  };
}

/**
 * Analisa o arquivo TASKS.md e extrai cada tarefa (T01, T02...), sua Sprint (S01...),
 * seu status ([ ] ou [x]), o agente responsável, sua Spec individual (`Spec da Task`)
 * e os IDs AC-XX / BR-XX cobertos por ela.
 */
export function extractTasksInfo(tasksMarkdown: string): TaskItem[] {
  const normalized = tasksMarkdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const tasks: TaskItem[] = [];

  let currentSprintHeader: string | undefined;
  let currentTask: TaskItem | null = null;

  for (const line of lines) {
    // Detecta cabeçalho de Sprint: ## Sprint S01: ...
    const sprintHeaderMatch = line.match(/^#{2,3}\s+Sprint\s+(S\d{2,})\b/i);
    if (sprintHeaderMatch) {
      currentSprintHeader = sprintHeaderMatch[1].toUpperCase();
      continue;
    }

    // Detecta linha de tarefa: - [ ] **T01: Título** ou - [x] T01: Título
    const taskMatch = line.match(
      /^\s*-\s*\[([ xX])\]\s*(?:\*\*)?(T\d{2,})\s*:\s*(.+?)(?:\*\*)?\s*$/,
    );

    if (taskMatch) {
      if (currentTask) {
        tasks.push(currentTask);
      }
      currentTask = {
        id: taskMatch[2],
        title: taskMatch[3].replace(/\*\*$/, "").trim(),
        completed: taskMatch[1].toLowerCase() === "x",
        sprint: currentSprintHeader,
        coveredIds: [],
      };
      continue;
    }

    if (!currentTask) continue;

    // Detecta linha de Sprint na task: - **Sprint:** `S01`
    const sprintFieldMatch = line.match(
      /^\s*-\s*(?:\*\*)?Sprint:(?:\*\*)?\s*`?(S\d{2,})`?/i,
    );
    if (sprintFieldMatch) {
      currentTask.sprint = sprintFieldMatch[1].toUpperCase();
      continue;
    }

    // Detecta linha de Agente: - **Agente:** `backend`
    const agentMatch = line.match(
      /^\s*-\s*(?:\*\*)?Agente:(?:\*\*)?\s*`?([a-zA-Z0-9_-]+)`?/i,
    );
    if (agentMatch) {
      currentTask.agent = agentMatch[1];
      continue;
    }

    // Detecta linha de Spec da Task: - **Spec da Task:** ...
    const taskSpecMatch = line.match(
      /^\s*-\s*(?:\*\*)?Spec da Task:(?:\*\*)?\s*(.+)$/i,
    );
    if (taskSpecMatch) {
      currentTask.taskSpec = taskSpecMatch[1].trim();
      continue;
    }

    // Detecta linha de Cobertura: - **Cobre:** `AC-01`, `BR-01`
    if (/^\s*-\s*(?:\*\*)?Cobre:(?:\*\*)?/i.test(line)) {
      const refs = line.match(/\b(?:AC|BR)-\d{2,}\b/g) ?? [];
      for (const ref of refs) {
        if (!currentTask.coveredIds.includes(ref)) {
          currentTask.coveredIds.push(ref);
        }
      }
    }
  }

  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

/**
 * Executa a auditoria mecânica Spec-Anchored em uma feature, verificando:
 * 1. Existência de AC-XX e BR-XX na SPEC.md
 * 2. Que cada Task em TASKS.md possua sua própria Spec (`Spec da Task`)
 * 3. Cobertura de 100% dos AC-XX e BR-XX no TASKS.md (zero órfãos)
 * 4. Presença de DESIGN.md quando has_ui: true
 * 5. Conclusão de todas as tarefas ([x]) quando em modo strictCompletion (--strict)
 */
export function auditFeatureSpec(
  featureName: string,
  specContent: string,
  tasksContent: string | null,
  designContent: string | null,
  strictCompletion = false,
): FeatureAuditResult {
  const findings: AuditFinding[] = [];
  const specMeta = extractSpecIds(specContent);

  if (!specMeta.frontmatterValid) {
    findings.push({
      code: "MISSING_SPEC_FRONTMATTER",
      severity: "error",
      message: `SPEC.md da feature '${featureName}' não possui frontmatter YAML válido.`,
    });
  }

  if (specMeta.acIds.length === 0) {
    findings.push({
      code: "NO_ACCEPTANCE_CRITERIA",
      severity: "error",
      message: `SPEC.md da feature '${featureName}' não declara nenhum Critério de Aceite (ex: AC-01).`,
    });
  }

  if (specMeta.brIds.length === 0) {
    findings.push({
      code: "NO_BUSINESS_RULES",
      severity: "error",
      message: `SPEC.md da feature '${featureName}' não declara nenhuma Regra de Negócio (ex: BR-01).`,
    });
  }

  if (specMeta.hasUi && !designContent) {
    findings.push({
      code: "MISSING_DESIGN_FILE",
      severity: strictCompletion ? "error" : "warning",
      message: `Feature '${featureName}' possui has_ui=true, mas DESIGN.md ainda não foi gerado.`,
    });
  }

  if (!tasksContent) {
    findings.push({
      code: "MISSING_TASKS_FILE",
      severity: "error",
      message: `Arquivo TASKS.md ausente para a feature '${featureName}'.`,
    });

    return {
      feature: featureName,
      passed: false,
      acCount: specMeta.acIds.length,
      brCount: specMeta.brIds.length,
      sprints: [],
      totalTasks: 0,
      completedTasks: 0,
      orphanIds: [...specMeta.acIds, ...specMeta.brIds],
      findings,
    };
  }

  const tasks = extractTasksInfo(tasksContent);
  if (tasks.length === 0) {
    findings.push({
      code: "NO_TASKS_DEFINED",
      severity: "error",
      message: `TASKS.md da feature '${featureName}' não possui nenhuma tarefa formatada (ex: - [ ] **T01: ...**).`,
    });
  }

  // Verifica se cada Task possui sua própria Spec (Spec da Task)
  for (const task of tasks) {
    if (!task.taskSpec || task.taskSpec.length < 5) {
      findings.push({
        code: "MISSING_TASK_SPEC",
        severity: "error",
        message: `Tarefa '${task.id}: ${task.title}' não possui o campo obrigatório '- **Spec da Task:**' detalhando sua especificação.`,
      });
    }
  }

  // Coleta Sprints e IDs cobertos pelas tarefas
  const sprintsSet = new Set<string>();
  const coveredSet = new Set<string>();
  for (const task of tasks) {
    if (task.sprint) {
      sprintsSet.add(task.sprint);
    }
    for (const id of task.coveredIds) {
      coveredSet.add(id);
    }
  }

  const allSpecIds = [...specMeta.acIds, ...specMeta.brIds];
  const orphanIds = allSpecIds.filter((id) => !coveredSet.has(id));

  for (const orphan of orphanIds) {
    findings.push({
      code: "ORPHAN_REQUIREMENT",
      severity: "error",
      message: `Requisito '${orphan}' da SPEC.md está órfão (não vinculado a nenhuma tarefa em TASKS.md).`,
    });
  }

  // Verifica referências a IDs que não existem na SPEC.md
  const validSpecSet = new Set(allSpecIds);
  for (const coveredId of coveredSet) {
    if (!validSpecSet.has(coveredId)) {
      findings.push({
        code: "UNKNOWN_REQUIREMENT_REF",
        severity: "warning",
        message: `TASKS.md referencia '${coveredId}', mas esse código não existe em SPEC.md.`,
      });
    }
  }

  // Em modo strict (--strict), todas as tarefas precisam estar marcadas com [x]
  const completedTasks = tasks.filter((t) => t.completed).length;
  if (strictCompletion) {
    for (const task of tasks) {
      if (!task.completed) {
        findings.push({
          code: "INCOMPLETE_TASK",
          severity: "error",
          message: `Tarefa '${task.id}: ${task.title}' ainda está pendente ([ ]).`,
        });
      }
    }
  }

  const hasError = findings.some((f) => f.severity === "error");

  return {
    feature: featureName,
    passed: !hasError,
    acCount: specMeta.acIds.length,
    brCount: specMeta.brIds.length,
    sprints: Array.from(sprintsSet).sort(),
    totalTasks: tasks.length,
    completedTasks,
    orphanIds,
    findings,
  };
}
