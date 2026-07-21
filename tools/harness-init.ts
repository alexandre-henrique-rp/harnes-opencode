/**
 * harness-init.ts — Harness v6 tool
 *
 * Cria a estrutura `.harness/` em um projeto novo:
 *   - .harness/state-machine.json (copia do template na raiz do harness)
 *   - .harness/state.json (snapshot inicial, phase.0.briefing)
 *   - .harness/events.jsonl (primeiro evento: harness.init)
 *   - .harness/agent-boundaries.json (gerado a partir de opencode.json)
 *   - .harness/audit/ (diretório vazio para audit logs)
 *
 * Idempotente: se .harness/ já existe, falha com mensagem clara (use --force para sobrescrever).
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export default tool({
  name: "harness-init",
  description:
    "Inicializa um projeto Harness v6. Cria .harness/ com state-machine.json, state.json, events.jsonl, agent-boundaries.json. Idempotente (use --force para resetar).",
  args: {
    project: tool.schema
      .string()
      .describe("Nome/ID do projeto (kebab-case, ex: 'meu-app-web')"),
    force: tool.schema
      .boolean()
      .optional()
      .describe("Se true, sobrescreve .harness/ existente (CUIDADO: apaga state.json)"),
    profile: tool.schema
      .enum(["strict", "lean"])
      .optional()
      .default("strict")
      .describe("Perfil do workflow: 'strict' (todas as 6 fases e revisores) ou 'lean' (3 fases simplificadas)"),
  },
  async execute({ project, force = false, profile = "strict" }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const auditDir = path.join(harnessDir, "audit");

    // Realiza a migração automática de arquivos legados se existirem na raiz
    const migrated = migrateLegacyFiles(cwd, harnessDir);

    if (fs.existsSync(harnessDir) && !force) {
      if (migrated.length > 0) {
        return {
          success: true,
          migrated,
          message: `Migracao concluida: os seguintes itens foram movidos para dentro de .harness/: ${migrated.join(", ")}`,
        };
      }
      return {
        success: false,
        error: `.harness/ ja existe em ${cwd}. Use --force para resetar (CUIDADO: apaga state.json e events.jsonl).`,
      };
    }

    // 1. Cria diretórios
    fs.mkdirSync(harnessDir, { recursive: true });
    fs.mkdirSync(auditDir, { recursive: true });

    // 2. Copia state-machine.json do template correspondente ao perfil
    const fileName = profile === "lean" ? "state-machine-lean.json" : "state-machine.json";
    let stateMachineSrc = path.join(cwd, fileName);
    
    // Fallback: se não estiver no cwd, busca no diretório da instalação do harness (um nível acima do diretório da tool)
    if (!fs.existsSync(stateMachineSrc)) {
      stateMachineSrc = path.join(__dirname, "..", fileName);
    }

    const stateMachineDest = path.join(harnessDir, "state-machine.json");
    if (!fs.existsSync(stateMachineSrc)) {
      return {
        success: false,
        error: `${fileName} nao encontrado no local (${cwd}) ou global (${path.join(__dirname, "..")}). Verifique a instalacao do harness v6.`,
      };
    }
    fs.copyFileSync(stateMachineSrc, stateMachineDest);

    // Valida o arquivo state-machine.json em runtime
    const stateMachineContent = fs.readFileSync(stateMachineDest, "utf8");
    try {
      const data = JSON.parse(stateMachineContent);
      if (data._type !== "harness-state-machine-v6") {
        throw new Error("Chave '_type' inválida no state-machine.json (esperado: 'harness-state-machine-v6')");
      }
      if (!Array.isArray(data.phases)) {
        throw new Error("Propriedade 'phases' deve ser um array");
      }
      for (let i = 0; i < data.phases.length; i++) {
        const phase = data.phases[i];
        if (typeof phase !== "object" || phase === null) {
          throw new Error(`Fase no índice ${i} deve ser um objeto JSON`);
        }
        if (typeof phase.id !== "number" && typeof phase.id !== "string") {
          throw new Error(`Fase no índice ${i} deve possuir 'id' (string ou número)`);
        }
        if (typeof phase.name !== "string" || !phase.name.trim()) {
          throw new Error(`Fase no índice ${i} deve possuir 'name' não-vazio`);
        }
        if (typeof phase.owner !== "string" || !phase.owner.trim()) {
          throw new Error(`Fase no índice ${i} deve possuir 'owner' não-vazio`);
        }
        if (!phase.outputContract || typeof phase.outputContract !== "object") {
          throw new Error(`Fase no índice ${i} deve possuir objeto 'outputContract'`);
        }
      }
    } catch (e) {
      return {
        success: false,
        error: `O arquivo ${fileName} copiado é estruturalmente inválido: ${(e as Error).message}`
      };
    }

    // 2.1 Copia failure-protocol.json do template
    let failureProtocolSrc = path.join(cwd, "failure-protocol.json");
    if (!fs.existsSync(failureProtocolSrc)) {
      failureProtocolSrc = path.join(__dirname, "..", "failure-protocol.json");
    }
    const failureProtocolDest = path.join(harnessDir, "failure-protocol.json");
    if (fs.existsSync(failureProtocolSrc)) {
      fs.copyFileSync(failureProtocolSrc, failureProtocolDest);
    }

    // 3. Cria state.json inicial
    const stateMachine = JSON.parse(fs.readFileSync(stateMachineDest, "utf8"));
    const initialState = {
      _type: "harness-state-v6",
      version: 1,
      project,
      stateMachineVersion: stateMachine.version,
      currentPhase: "phase.0.briefing",
      currentSprint: null,
      phases: {},
      sprints: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // Inicializa todas as fases como pending
    for (const phase of stateMachine.phases) {
      initialState.phases[phase.id] = {
        status: "pending",
        owner: phase.owner,
        startedAt: null,
        completedAt: null,
        gate: null,
        score: null,
        attempt: 0,
      };
    }
    fs.writeFileSync(path.join(harnessDir, "state.json"), JSON.stringify(initialState, null, 2));

    // 4. Cria events.jsonl com primeiro evento
    const firstEvent = {
      ts: new Date().toISOString(),
      event: "harness.init",
      actor: "orchestrator",
      project,
      stateMachineVersion: stateMachine.version,
      currentPhase: "phase.0.briefing",
    };
    fs.writeFileSync(path.join(harnessDir, "events.jsonl"), JSON.stringify(firstEvent) + "\n");

    // 5. Gera agent-boundaries.json a partir de opencode.json
    const opencodePath = path.join(cwd, "opencode.json");
    let agentBoundaries = {};
    if (fs.existsSync(opencodePath)) {
      const opencode = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
      agentBoundaries = deriveBoundaries(opencode);
    } else {
      // Fallback conservador se opencode.json não existir
      agentBoundaries = conservativeBoundaries();
    }
    fs.writeFileSync(
      path.join(harnessDir, "agent-boundaries.json"),
      JSON.stringify(agentBoundaries, null, 2)
    );

    // Mover config files como .ai-jail e opencode.json se estiverem na raiz
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
        } else {
          fs.unlinkSync(srcPath); // já copiado
        }
      }
    }


    // 6. Cria PROGRESS.md inicial
    const initialProgress = `# Progresso do Projeto: ${project}\n\n` +
      `**Status:** Iniciado\n` +
      `**Fase Atual:** phase.0.briefing (Briefing)\n\n` +
      `## Fases Completas\n(Nenhuma)\n\n` +
      `## Proximos Passos\n- Executar o briefing para gerar o \`.harness/brief.md\`.`;
    fs.writeFileSync(path.join(harnessDir, "PROGRESS.md"), initialProgress);

    return {
      success: true,
      project,
      harnessDir: harnessDir,
      files: [
        ".harness/state-machine.json",
        ".harness/failure-protocol.json",
        ".harness/state.json",
        ".harness/events.jsonl",
        ".harness/agent-boundaries.json",
        ".harness/PROGRESS.md",
        ".harness/audit/",
      ],
      currentPhase: "phase.0.briefing",
      next: "Faca sua demanda ao orchestrator. Ele iniciara a fase 0 (briefing).",
    };
  },
});

/**
 * Deriva allowlist de paths por agent a partir do opencode.json agent map.
 * Mapeia agent → paths que ele tem permissao de editar.
 */
function deriveBoundaries(opencode: any): Record<string, { allow: string[]; deny: string[] }> {
  const agents = opencode.agent || {};
  const boundaries: Record<string, { allow: string[]; deny: string[] }> = {};

  for (const [name, config] of Object.entries<any>(agents)) {
    if (name === "_comment") continue;

    // Default: agent só escreve em seu próprio subdiretório
    let allow = [`.harness/${name}/**`, ".harness/events.jsonl"];
    let deny: string[] = ["src/**", "db/**", "app/**"];

    // Owners de fase escrevem em paths específicos
    if (name === "briefing") {
      allow = [".harness/brief.md", ...allow];
    } else if (name === "documenter") {
      allow = ["AGENTS.md", ".harness/AGENTS.md", "**/AGENTS.md", ".harness/ARCH.md", ".harness/docs/**", ...allow];
    } else if (name === "rag-curator") {
      allow = [".harness/RAG/**", ".harness/training/**", ...allow];
      deny = ["src/**"];
    } else if (name === "requirements") {
      allow = [".harness/PRD.md", ".harness/SPEC.md", ...allow];
    } else if (name === "prd-reviewer" || name === "spec-reviewer" || name === "design-reviewer") {
      allow = [".harness/reviews/**"];
      deny = ["**"]; // reviewers só escrevem em reports, nada de feature code
    } else if (name === "designer") {
      allow = [".harness/PRODUCT.md", ".harness/design/**", ".harness/ui-specs/**", ...allow];
    } else if (name === "sprint-tasker") {
      allow = [".harness/sprints/**", ...allow];
    } else if (name === "reviewer") {
      allow = [".harness/reviews/**"];
      deny = ["**"];
    } else if (name === "backend") {
      allow = ["src/backend/**", "db/**", "app/services/**", "test/backend/**", "tests/backend/**", ...allow];
      deny = ["src/frontend/**", "src/components/**"];
    } else if (name === "frontend") {
      allow = ["src/frontend/**", "src/components/**", "src/pages/**", "test/frontend/**", "tests/frontend/**", ...allow];
      deny = ["src/backend/**", "db/**", "app/services/**"];
    } else if (name === "tester") {
      allow = ["test/**", "tests/**", ".harness/qa/**", "e2e/**", ...allow];
      deny = ["src/**", "app/**", "db/**"];
    } else if (name === "security") {
      allow = [".harness/security/**", ".harness/qa/security/**", ...allow];
      deny = ["src/**", "app/**", "db/**"]; // security NUNCA corrige codigo
    } else if (name === "qa-gate") {
      allow = [".harness/qa-gate/**", ...allow];
      deny = ["**"];
    } else if (name === "orchestrator") {
      allow = [".harness/**"];
      deny = ["src/**", "app/**", "db/**", "test/**"]; // orchestrator não escreve feature code
    }

    boundaries[name] = { allow, deny };
  }

  return boundaries;
}

function conservativeBoundaries(): Record<string, { allow: string[]; deny: string[] }> {
  // Fallback se opencode.json não existir
  return {
    orchestrator: { allow: [".harness/**"], deny: ["src/**", "app/**", "db/**"] },
    briefing: { allow: [".harness/brief.md", ".harness/briefing/**"], deny: ["**"] },
    documenter: { allow: ["AGENTS.md", ".harness/AGENTS.md", "**/AGENTS.md", ".harness/ARCH.md", ".harness/docs/**", ".harness/documenter/**"], deny: ["**"] },
    "rag-curator": { allow: [".harness/RAG/**", ".harness/training/**"], deny: ["**"] },
    requirements: { allow: [".harness/PRD.md", ".harness/SPEC.md", ".harness/requirements/**"], deny: ["**"] },
    backend: { allow: ["src/backend/**", "db/**", "test/**"], deny: ["src/frontend/**"] },
    frontend: { allow: ["src/frontend/**", "test/frontend/**"], deny: ["src/backend/**", "db/**"] },
    tester: { allow: ["test/**", ".harness/qa/**", "e2e/**"], deny: ["src/**", "app/**", "db/**"] },
    security: { allow: [".harness/security/**", ".harness/qa/security/**"], deny: ["**"] },
  };
}

/**
 * Função utilitária para mover automaticamente arquivos e pastas legados (fora da pasta .harness/)
 * para dentro da pasta .harness/.
 */
function migrateLegacyFiles(cwd: string, harnessDir: string): string[] {
  const migrated: string[] = [];
  const legacyBrief = path.join(cwd, "brief.md");
  const newBrief = path.join(harnessDir, "brief.md");
  const legacySprints = path.join(cwd, "sprints");
  const newSprints = path.join(harnessDir, "sprints");

  const hasLegacyBrief = fs.existsSync(legacyBrief);
  const hasLegacySprints = fs.existsSync(legacySprints);

  if (hasLegacyBrief || hasLegacySprints) {
    if (!fs.existsSync(harnessDir)) {
      fs.mkdirSync(harnessDir, { recursive: true });
    }
  }

  // Migra brief.md se ele estiver na raiz
  if (hasLegacyBrief) {
    if (!fs.existsSync(newBrief)) {
      fs.renameSync(legacyBrief, newBrief);
      migrated.push("brief.md");
    } else {
      // Sobrescreve o novo com o legado para preservar o trabalho do usuário
      fs.copyFileSync(legacyBrief, newBrief);
      fs.unlinkSync(legacyBrief);
      migrated.push("brief.md (sobrescreveu o existente)");
    }
  }

  // Migra a pasta sprints se ela estiver na raiz
  if (hasLegacySprints) {
    if (!fs.existsSync(newSprints)) {
      fs.renameSync(legacySprints, newSprints);
      migrated.push("sprints/");
    } else {
      // Mescla conteúdos se ambas existirem
      const files = fs.readdirSync(legacySprints);
      for (const file of files) {
        const srcFile = path.join(legacySprints, file);
        const destFile = path.join(newSprints, file);
        if (fs.statSync(srcFile).isDirectory()) {
          moveDirectoryRecursive(srcFile, destFile);
        } else {
          fs.copyFileSync(srcFile, destFile);
          fs.unlinkSync(srcFile);
        }
      }
      try {
        fs.rmSync(legacySprints, { recursive: true, force: true });
      } catch (e) {}
      migrated.push("sprints/ (conteudo mesclado)");
    }
  }

  return migrated;
}

function moveDirectoryRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      moveDirectoryRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      fs.unlinkSync(srcPath);
    }
  }
  try {
    fs.rmdirSync(src);
  } catch (e) {}
}
