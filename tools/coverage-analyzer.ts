/**
 * coverage-analyzer.ts — Harness v6 tool
 *
 * Analisa relatórios de cobertura (JSON) e retorna um resumo executável.
 * Evita que o agente leia arquivos massivos de cobertura.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "coverage_analyzer",
  description: "Analisa o relatório de cobertura do Vitest/Jest e retorna um resumo de conformidade.",
  args: {
    reportPath: tool.schema.string().default("coverage/coverage-summary.json").describe("Caminho para o JSON de cobertura"),
    minThreshold: tool.schema.number().default(85).describe("Threshold mínimo de cobertura (%)"),
  },
  async execute({ reportPath, minThreshold }, context) {
    const cwd = context?.directory || process.cwd();
    const fullPath = path.resolve(cwd, reportPath);

    if (!fs.existsSync(fullPath)) {
      return { success: false, error: `Relatorio de cobertura nao encontrado em ${reportPath}` };
    }

    try {
      const summary = JSON.parse(fs.readFileSync(fullPath, "utf8"));
      const total = summary.total || summary; // Depende do formato do reporter
      
      const linesPct = total.lines?.pct ?? 0;
      const functionsPct = total.functions?.pct ?? 0;
      const statementsPct = total.statements?.pct ?? 0;
      const branchesPct = total.branches?.pct ?? 0;

      const passed = linesPct >= minThreshold;
      
      const criticalFiles = [];
      if (!passed) {
        // Se falhou, busca quais arquivos estao abaixo (se o report for detalhado)
        // Isso exigiria o coverage-final.json, mas por ora vamos focar no summary
      }

      return {
        success: true,
        metrics: {
          lines: linesPct,
          functions: functionsPct,
          statements: statementsPct,
          branches: branchesPct
        },
        passed,
        minThreshold,
        summary: `Cobertura de linhas: ${linesPct}% (Minimo: ${minThreshold}%). Status: ${passed ? 'PASS' : 'FAIL'}`
      };
    } catch (e: any) {
      return { success: false, error: `Erro ao processar cobertura: ${e.message}` };
    }
  },
});
