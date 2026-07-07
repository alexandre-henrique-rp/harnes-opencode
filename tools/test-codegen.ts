/**
 * test-codegen.ts — Harness v6 tool
 *
 * Transforma cadeias de teste declarativas (JSON) em código de teste executável (Playwright).
 * Reduz o esforço do agente Tester em escrever código boilerplate.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "test-codegen",
  description: "Gera arquivos de teste Playwright a partir de cadeias declarativas (e2e-chains).",
  args: {
    chainId: tool.schema.string().describe("ID da cadeia de teste (ex: E2E-USER-001)"),
    sprintId: tool.schema.string().describe("ID da sprint"),
    chainData: tool.schema.object({
      name: tool.schema.string(),
      description: tool.schema.string(),
      sequence: tool.schema.array(tool.schema.object({
        step: tool.schema.number(),
        action: tool.schema.string(),
        path: tool.schema.string(),
        data: tool.schema.any().optional(),
        expected: tool.schema.any().optional()
      }))
    }).describe("Dados da cadeia para gerar o código")
  },
  async execute({ chainId, sprintId, chainData }, context) {
    const cwd = context?.directory || process.cwd();
    const testDir = path.join(cwd, "tests", "e2e", sprintId);
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const filePath = path.join(testDir, `${chainId}.test.ts`);

    let testCode = `import { test, expect } from '@playwright/test';\n\n`;
    testCode += `test.describe('${chainData.name}', () => {\n`;
    testCode += `  test('${chainData.description}', async ({ page }) => {\n`;

    for (const step of chainData.sequence) {
      testCode += `    // Step ${step.step}: ${step.action}\n`;
      if (step.action.toLowerCase().includes("visit") || step.action.toLowerCase().includes("goto")) {
        testCode += `    await page.goto('${step.path}');\n`;
      } else if (step.action.toLowerCase().includes("fill")) {
        for (const [key, value] of Object.entries(step.data || {})) {
          testCode += `    await page.fill('input[name="${key}"]', '${value}');\n`;
        }
      } else if (step.action.toLowerCase().includes("click")) {
        testCode += `    await page.click('button[type="submit"]'); // Defaulting to submit for now\n`;
      }
      
      if (step.expected?.url) {
        testCode += `    await expect(page).toHaveURL('${step.expected.url}');\n`;
      }
      if (step.expected?.text) {
        testCode += `    await expect(page.locator('body')).toContainText('${step.expected.text}');\n`;
      }
    }

    testCode += `  });\n`;
    testCode += `});\n`;

    fs.writeFileSync(filePath, testCode);

    return {
      success: true,
      filePath: path.relative(cwd, filePath),
      message: `Código de teste para ${chainId} gerado com sucesso.`
    };
  },
});
