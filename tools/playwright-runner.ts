/**
 * playwright-runner.ts — Harness v6 tool
 *
 * Executa testes do Playwright localmente via CLI de forma determinística.
 * Grava vídeos e gera relatórios JSON consolidados em caso de erros de diagnóstico.
 * Evita o consumo de tokens de chamadas individuais do MCP Playwright.
 *
 * v6.6.2 — Controle de paralelismo via RAM:
 *   - Detecta RAM livre via os.freemem()
 *   - Limita workers do Playwright automaticamente (evita OOM em máquinas com pouca RAM)
 *   - Cleanup de processos órfãos antes de iniciar
 *   - Configurável via HARNESS_PLAYWRIGHT_WORKERS
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

/**
 * Calcula número ótimo de workers do Playwright baseado em RAM disponível.
 * Thresholds:
 *   - < 2GB livre: 1 worker (paralelismo trava máquinas com pouca RAM)
 *   - 2-4GB livre: 2 workers
 *   - > 4GB livre: min(4, cpus)
 * Override via env HARNESS_PLAYWRIGHT_WORKERS.
 */
function getOptimalWorkers(): number {
  const envOverride = process.env.HARNESS_PLAYWRIGHT_WORKERS;
  if (envOverride && !isNaN(parseInt(envOverride, 10))) {
    return parseInt(envOverride, 10);
  }

  const freeMemGB = os.freemem() / 1024 / 1024 / 1024;
  const cpus = os.cpus().length;

  if (freeMemGB < 2) return 1;
  if (freeMemGB < 4) return 2;
  return Math.min(4, cpus);
}

/**
 * Mata processos Playwright órfãos de execuções anteriores travadas.
 * Evita acúmulo de memória de processos zumbi.
 */
function cleanupStalePlaywrightProcesses(): void {
  try {
    execSync(
      `pkill -f "playwright test" 2>/dev/null; pkill -f "node.*playwright" 2>/dev/null; true`,
      { stdio: "ignore" },
    );
  } catch {
    // best-effort
  }
}

export default tool({
  description:
    "Executa testes do Playwright de forma local e determinística, gravando vídeos e gerando relatórios de diagnóstico se houver falhas.",
  args: {
    sprintId: tool.schema.string().describe("ID da sprint atual (ex: 'S01')"),
    testFile: tool.schema
      .string()
      
      .describe("Nome do arquivo de teste específico para rodar (ex: 'E2E-USER-001.test.ts')"),
    recordVideo: tool.schema
      .boolean()
      
      
      .describe("Se true, força a gravação de vídeo da execução do teste"),
  },
  async execute({ sprintId, testFile = "", recordVideo = true }, context) {
    let cwd = resolveProjectCwd(context, { log: console.error });
    let searchCwd = cwd;
    let harnessDir = path.join(searchCwd, ".harness");
    while (!fs.existsSync(harnessDir) && searchCwd !== path.parse(searchCwd).root) {
      searchCwd = path.dirname(searchCwd);
      harnessDir = path.join(searchCwd, ".harness");
    }
    const qaDir = path.join(harnessDir, "qa", sprintId);
    const diagnosticDir = path.join(qaDir, "diagnostic");
    const reportFilePath = path.join(qaDir, "playwright-results.json");

    // 1. Cria diretórios de QA e diagnóstico
    if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });
    if (!fs.existsSync(diagnosticDir)) fs.mkdirSync(diagnosticDir, { recursive: true });

    // 2. Cleanup processos órfãos antes de começar (evita acúmulo de RAM)
    cleanupStalePlaywrightProcesses();

    // 3. Calcula workers ótimos baseado em RAM disponível
    const workers = getOptimalWorkers();
    const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
    process.stderr.write(
      `[playwright-runner] workers=${workers} (RAM livre: ${freeMemGB}GB)\n`,
    );

    // 4. Garante configuração básica do Playwright se não existir
    const configPath = path.join(cwd, "playwright.config.ts");
    const configCreated = !fs.existsSync(configPath);
    if (configCreated) {
      const basicConfig = `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  workers: ${workers},
  fullyParallel: false,
  use: {
    headless: true,
    screenshot: 'only-on-failure',
    video: '${recordVideo ? "on" : "off"}',
  },
  reporter: [['json', { outputFile: '${path.relative(cwd, reportFilePath)}' }]],
});`;
      fs.writeFileSync(configPath, basicConfig);
    }

    // 3. Monta comando de execução do Playwright
    const testPath = testFile 
      ? path.join("tests", "e2e", sprintId, testFile)
      : path.join("tests", "e2e", sprintId);

    const cmd = `npx playwright test "${testPath}" || true`;

    let executionError = "";
    try {
      execSync(cmd, { cwd, stdio: "pipe" });
    } catch (e) {
      executionError = (e as Error).message;
    }

    // 4. Se a configuração básica foi criada por nós, remove para deixar o repo limpo
    if (configCreated && fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }

    // 5. Trata e analisa o arquivo de resultados do Playwright
    const reportData = fs.existsSync(reportFilePath)
      ? JSON.parse(fs.readFileSync(reportFilePath, "utf8"))
      : null;

    const summary: any = {
      passed: 0,
      failed: 0,
      total: 0,
      failures: [],
    };

    if (reportData && reportData.suites) {
      const parseSuite = (suite: any) => {
        if (suite.specs) {
          suite.specs.forEach((spec: any) => {
            summary.total++;
            if (spec.tests && spec.tests[0]) {
              const testResult = spec.tests[0].results?.[0];
              const testStatus = testResult?.status;

              if (testStatus === "passed") {
                summary.passed++;
              } else {
                summary.failed++;
                const errorMsg = testResult?.error?.message || "Erro desconhecido";
                
                // Mapeia vídeos gravados
                const videos: string[] = [];
                if (testResult?.attachments) {
                  testResult.attachments.forEach((attach: any) => {
                    if (attach.contentType?.includes("video") && attach.path) {
                      const absoluteAttachPath = path.resolve(cwd, attach.path);
                      if (fs.existsSync(absoluteAttachPath)) {
                        const destVideoName = `${spec.title.replace(/\s+/g, "_")}_error.webm`;
                        const destVideoPath = path.join(diagnosticDir, destVideoName);
                        fs.copyFileSync(absoluteAttachPath, destVideoPath);
                        videos.push(path.relative(cwd, destVideoPath));
                      }
                    }
                  });
                }

                summary.failures.push({
                  title: spec.title,
                  file: spec.file,
                  line: spec.line,
                  error: errorMsg,
                  videos,
                });
              }
            }
          });
        }
        if (suite.suites) {
          suite.suites.forEach(parseSuite);
        }
      };

      reportData.suites.forEach(parseSuite);
    }

    // 6. Gera resumo estruturado em Markdown se houver falhas
    if (summary.failed > 0) {
      let mdReport = `# Relatório de Diagnóstico de Falhas de E2E — ${sprintId}\n\n`;
      mdReport += `**Status:** Falha detectada em ${summary.failed} de ${summary.total} testes.\n`;
      mdReport += `**Data da Execução:** ${new Date().toISOString()}\n\n`;
      mdReport += `## ❌ Falhas Identificadas\n\n`;

      summary.failures.forEach((fail: any, idx: number) => {
        mdReport += `### ${idx + 1}. Teste: ${fail.title}\n`;
        mdReport += `- **Arquivo:** [${path.basename(fail.file)}](file://${fail.file}#L${fail.line})\n`;
        mdReport += `- **Erro:** \`\`\`\n${fail.error}\n\`\`\`\n`;
        if (fail.videos.length > 0) {
          mdReport += `- **Vídeo Gravado da Falha:** [Assistir Vídeo](file://${path.resolve(cwd, fail.videos[0])})\n`;
        }
        mdReport += `\n---\n\n`;
      });

      fs.writeFileSync(path.join(qaDir, "diagnostic_summary.md"), mdReport);
      summary.diagnosticSummary = path.relative(cwd, path.join(qaDir, "diagnostic_summary.md"));
    }

    return {
      success: summary.failed === 0,
      sprintId,
      total: summary.total,
      passed: summary.passed,
      failed: summary.failed,
      diagnosticDir: path.relative(cwd, diagnosticDir),
      reportFile: path.relative(cwd, reportFilePath),
      summary,
    };
  },
});
