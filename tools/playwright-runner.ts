/**
 * playwright-runner.ts — Harness v6 tool
 *
 * Executa testes do Playwright localmente via CLI de forma determinística.
 * Grava vídeos e gera relatórios JSON consolidados em caso de erros de diagnóstico.
 * Evita o consumo de tokens de chamadas individuais do MCP Playwright.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "playwright_runner",
  description:
    "Executa testes do Playwright de forma local e determinística, gravando vídeos e gerando relatórios de diagnóstico se houver falhas.",
  args: {
    sprintId: tool.schema.string().describe("ID da sprint atual (ex: 'S01')"),
    testFile: tool.schema
      .string()
      .optional()
      .describe("Nome do arquivo de teste específico para rodar (ex: 'E2E-USER-001.test.ts')"),
    recordVideo: tool.schema
      .boolean()
      .optional()
      .default(true)
      .describe("Se true, força a gravação de vídeo da execução do teste"),
  },
  async execute({ sprintId, testFile = "", recordVideo = true }, context) {
    const cwd = context?.directory || process.cwd();
    const harnessDir = path.join(cwd, ".harness");
    const qaDir = path.join(harnessDir, "qa", sprintId);
    const diagnosticDir = path.join(qaDir, "diagnostic");
    const reportFilePath = path.join(qaDir, "playwright-results.json");

    // 1. Cria diretórios de QA e diagnóstico
    if (!fs.existsSync(qaDir)) fs.mkdirSync(qaDir, { recursive: true });
    if (!fs.existsSync(diagnosticDir)) fs.mkdirSync(diagnosticDir, { recursive: true });

    // 2. Garante configuração básica do Playwright se não existir
    const configPath = path.join(cwd, "playwright.config.ts");
    const configCreated = !fs.existsSync(configPath);
    if (configCreated) {
      const basicConfig = `import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
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
