import { parseArgs } from "node:util";
import { runDoctor } from "./commands/doctor.js";
import { runGate } from "./commands/gate.js";
import { runInit } from "./commands/init.js";
import { runSpecCreate } from "./commands/spec.js";
import { runUpdate } from "./commands/update.js";
import { HARNESS_VERSION } from "./utils/templates-locator.js";

export interface CliIo {
  stdout: (msg: string) => void;
  stderr: (msg: string) => void;
}

const defaultIo: CliIo = {
  stdout: (msg) => console.log(msg),
  stderr: (msg) => console.error(msg),
};

const HELP_TEXT = `
┌──────────────────────────────────────────────────────────────────────────┐
│  🚀 OpenCode Harness v${HARNESS_VERSION} — Spec-Anchored Multi-Agent CLI (.opencode/)  │
└──────────────────────────────────────────────────────────────────────────┘

Uso:
  npx opencode-harness <comando> [opções]

Comandos Principais:
  init                  Inicializa .opencode/ (8 agentes, 7 comandos, 4 skills, CONSTITUTION)
  spec <nome-feature>   Cria .opencode/specs/<feature>/ (PRD, SPEC, DESIGN e TASKS por Sprint)
  gate [nome-feature]   Executa o Gate Mecânico validando Spec da Task, AC-XX e BR-XX (alias: audit)
  update                Atualiza agentes, comandos e skills preservando CONSTITUTION e specs
  doctor                Audita a integridade da instalação em .opencode/ e opencode.json
  status                Exibe o painel visual de saúde e progresso das Sprints e Tasks

Opções:
  --cwd <diretório>     Diretório alvo do projeto (padrão: diretório atual)
  --force, -f           Sobrescreve arquivos existentes no 'init' ou 'spec'
  --strict, -s          No 'gate', exige que 100% das Tasks da Sprint estejam concluídas [x]
  --no-ui               No 'spec', cria feature Backend/API pura (has_ui: false, sem DESIGN.md)
  --json                Retorna a saída estruturada em JSON (ideal para CI/CD)
  --version, -v         Exibe a versão atual
  --help, -h            Exibe este painel de ajuda
`.trim();

/**
 * Renderiza uma barra de progresso ASCII de 10 blocos para o painel de status/gate.
 */
function renderProgressBar(completed: number, total: number): string {
  if (total <= 0) return "[░░░░░░░░░░] 0%";
  const ratio = Math.min(1, Math.max(0, completed / total));
  const filled = Math.round(ratio * 10);
  const empty = 10 - filled;
  const pct = Math.round(ratio * 100);
  return `[${"█".repeat(filled)}${"░".repeat(empty)}] ${pct}%`;
}

/**
 * Executa a CLI a partir dos argumentos fornecidos e retorna o código de saída (0 = sucesso, 1 = falha).
 */
export function runCli(
  argv: string[] = process.argv.slice(2),
  io: CliIo = defaultIo,
): number {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: false,
      options: {
        cwd: { type: "string" },
        force: { type: "boolean", short: "f", default: false },
        strict: { type: "boolean", short: "s", default: false },
        "no-ui": { type: "boolean", default: false },
        description: { type: "string", short: "d" },
        json: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
        version: { type: "boolean", short: "v", default: false },
      },
    });
  } catch (err) {
    io.stderr(
      `Erro ao processar argumentos: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  const { values, positionals } = parsed;

  if (values.version) {
    io.stdout(HARNESS_VERSION);
    return 0;
  }

  const command = positionals[0];

  if (values.help || !command || command === "help") {
    io.stdout(HELP_TEXT);
    return 0;
  }

  const cwd = typeof values.cwd === "string" ? values.cwd : process.cwd();
  const asJson = Boolean(values.json);

  switch (command) {
    case "init": {
      const res = runInit({
        cwd,
        force: Boolean(values.force),
      });
      if (asJson) {
        io.stdout(JSON.stringify(res, null, 2));
      } else if (res.success) {
        io.stdout(
          "┌──────────────────────────────────────────────────────────────────────┐",
        );
        io.stdout(
          `│ ✅ OpenCode Harness v${HARNESS_VERSION} — Inicializado com Sucesso!               │`,
        );
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        io.stdout(`│ 📂 Pasta Local : .opencode/`);
        io.stdout(`│ 🛠️  Stack       : ${res.stack.language} (${res.stack.framework})`);
        io.stdout(`│ 📦 Pacotes     : ${res.stack.packageManager} | Testes: ${res.stack.testCommand}`);
        io.stdout(`│ 🤖Instalados   : 8 Agentes Turbo | 7 Comandos Slash | 4 Skills Core`);
        io.stdout(
          "└──────────────────────────────────────────────────────────────────────┘",
        );
      } else {
        io.stderr(`❌ ${res.message}`);
      }
      return res.success ? 0 : 1;
    }

    case "spec": {
      const featureName = positionals.slice(1).join(" ");
      if (!featureName) {
        io.stderr(
          "❌ Informe o nome da feature. Exemplo: npx opencode-harness spec autenticacao-jwt",
        );
        return 1;
      }
      const res = runSpecCreate({
        cwd,
        featureName,
        description:
          typeof values.description === "string"
            ? values.description
            : undefined,
        hasUi: !values["no-ui"],
        force: Boolean(values.force),
      });
      if (asJson) {
        io.stdout(JSON.stringify(res, null, 2));
      } else if (res.success) {
        io.stdout(
          "┌──────────────────────────────────────────────────────────────────────┐",
        );
        io.stdout(`│ 📋 Nova Especificação Criada: ${res.featureSlug}`);
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        io.stdout(`│ 📂 Diretório : .opencode/specs/${res.featureSlug}/`);
        io.stdout(`│ 📄 Arquivos  : ${res.createdFiles.join(", ")}`);
        io.stdout(
          "└──────────────────────────────────────────────────────────────────────┘",
        );
      } else {
        io.stderr(`❌ ${res.message}`);
      }
      return res.success ? 0 : 1;
    }

    case "gate":
    case "audit": {
      const featureSlug = positionals[1];
      const res = runGate({
        cwd,
        featureSlug,
        strict: Boolean(values.strict),
      });
      if (asJson) {
        io.stdout(JSON.stringify(res, null, 2));
      } else {
        const modeLabel = res.strictMode ? "STRICT (100% [x])" : "STANDARD (Cobertura)";
        io.stdout(
          "┌──────────────────────────────────────────────────────────────────────┐",
        );
        io.stdout(
          `│ 🛡️  Gate Mecânico Spec-Anchored — Modo: ${modeLabel}`,
        );
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        for (const item of res.results) {
          const icon = item.passed ? "✅ PASS" : "❌ FAIL";
          const sprintsLabel =
            item.sprints.length > 0 ? item.sprints.join(",") : "S01";
          const bar = renderProgressBar(item.completedTasks, item.totalTasks);
          io.stdout(
            `│ ${icon} [${item.feature}] (Sprints: ${sprintsLabel})`,
          );
          io.stdout(
            `│      ├─ Regras : ${item.acCount} ACs | ${item.brCount} BRs (Órfãos: ${item.orphanIds.length})`,
          );
          io.stdout(
            `│      └─ Tasks  : ${item.completedTasks}/${item.totalTasks} ${bar}`,
          );
          for (const finding of item.findings) {
            const prefix =
              finding.severity === "error" ? "🚨 ERRO" : "⚠️ AVISO";
            io.stdout(`│         • [${prefix}] ${finding.message}`);
          }
        }
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        io.stdout(`│ Resultado: ${res.summary}`);
        io.stdout(
          "└──────────────────────────────────────────────────────────────────────┘",
        );
      }
      return res.passed ? 0 : 1;
    }

    case "update": {
      const res = runUpdate({ cwd });
      if (asJson) {
        io.stdout(JSON.stringify(res, null, 2));
      } else if (res.success) {
        io.stdout(`✅ ${res.message}`);
      } else {
        io.stderr(`❌ ${res.message}`);
      }
      return res.success ? 0 : 1;
    }

    case "doctor": {
      const res = runDoctor({ cwd });
      if (asJson) {
        io.stdout(JSON.stringify(res, null, 2));
      } else {
        io.stdout(
          "┌──────────────────────────────────────────────────────────────────────┐",
        );
        io.stdout(
          `│ 🩺 OpenCode Harness v${HARNESS_VERSION} — Diagnóstico de Saúde (Doctor)         │`,
        );
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        for (const check of res.checks) {
          const icon = check.passed ? "✔" : "✖";
          io.stdout(`│  ${icon} ${check.name}: ${check.detail}`);
        }
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        io.stdout(`│ ${res.healthy ? "✅" : "⚠️"} ${res.summary}`);
        io.stdout(
          "└──────────────────────────────────────────────────────────────────────┘",
        );
      }
      return res.healthy ? 0 : 1;
    }

    case "status": {
      const doc = runDoctor({ cwd });
      const gate = runGate({ cwd, strict: false });
      if (asJson) {
        io.stdout(JSON.stringify({ doctor: doc, gate }, null, 2));
      } else {
        io.stdout(
          "┌──────────────────────────────────────────────────────────────────────┐",
        );
        io.stdout(
          `│ 📊 OpenCode Harness v${HARNESS_VERSION} — Painel de Status do Projeto           │`,
        );
        io.stdout(
          "├──────────────────────────────────────────────────────────────────────┤",
        );
        io.stdout(
          `│ 🩺 Instalação (.opencode/) : ${doc.healthy ? "✅ ÍNTEGRA (8 Agentes | 7 Comandos | 4 Skills)" : "⚠️ REQUER ATENÇÃO"}`,
        );
        io.stdout(
          `│ 📋 Features Especificadas  : ${gate.totalFeatures} (${gate.passedFeatures} aprovadas no Gate)`,
        );
        for (const item of gate.results) {
          const bar = renderProgressBar(item.completedTasks, item.totalTasks);
          io.stdout(
            `│    • ${item.feature} [${item.sprints.join(",") || "S01"}] -> ${bar} (${item.completedTasks}/${item.totalTasks} tasks | ${item.acCount} ACs | ${item.brCount} BRs)`,
          );
        }
        io.stdout(
          "└──────────────────────────────────────────────────────────────────────┘",
        );
      }
      return doc.healthy && gate.passed ? 0 : 1;
    }

    default: {
      io.stderr(
        `❌ Comando desconhecido: '${command}'. Use 'npx opencode-harness --help' para ver os comandos disponíveis.`,
      );
      return 1;
    }
  }
}
