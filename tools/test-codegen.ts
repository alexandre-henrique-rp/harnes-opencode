/**
 * test-codegen.ts — Harness v6.6.2 tool
 *
 * Transforma cadeias de teste declarativas (JSON) em código de teste executável.
 * Suporta 2 modos:
 *   - "e2e" (default): Gera testes Playwright de UI (navegação, preenchimento, cliques)
 *   - "contract": Gera testes de contrato de API (validação de regras de negócio via HTTP)
 *
 * Os testes de contrato derivam diretamente dos Acceptance Criteria da SPEC.md
 * e validam que a API cumpre EXATAMENTE o que foi acordado.
 *
 * v6.6.2 — Controle de paralelismo em Vitest:
 *   - Gera config Vitest com singleFork: true (1 processo só)
 *   - fileParallelism: false (sem paralelismo entre arquivos)
 *   - Auto-detecta RAM para definir workers
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveProjectCwd } from "../plugins/lib/resolve-project-cwd.js";

/**
 * Calcula número ótimo de workers Vitest baseado em RAM disponível.
 * Mesmo perfil do Playwright: conservador em máquinas com pouca RAM.
 */
function getOptimalVitestWorkers(): number {
  const envOverride = process.env.HARNESS_VITEST_WORKERS;
  if (envOverride && !isNaN(parseInt(envOverride, 10))) {
    return parseInt(envOverride, 10);
  }

  const freeMemGB = os.freemem() / 1024 / 1024 / 1024;
  const cpus = os.cpus().length;

  if (freeMemGB < 2) return 1;
  if (freeMemGB < 4) return 2;
  return Math.min(4, cpus);
}

// ─── Gerador E2E (Playwright) ────────────────────────────────────────────────

function generateE2eTest(chainId: string, chainData: any): string {
  let code = `import { test, expect } from '@playwright/test';\n\n`;
  code += `test.describe('${chainData.name}', () => {\n`;
  code += `  test('${chainData.description}', async ({ page }) => {\n`;

  for (const step of chainData.sequence || []) {
    code += `    // Step ${step.step}: ${step.action}\n`;
    if (
      step.action.toLowerCase().includes("visit") ||
      step.action.toLowerCase().includes("goto")
    ) {
      code += `    await page.goto('${step.path}');\n`;
    } else if (step.action.toLowerCase().includes("fill")) {
      for (const [key, value] of Object.entries(step.data || {})) {
        code += `    await page.fill('input[name="${key}"]', '${value}');\n`;
      }
    } else if (step.action.toLowerCase().includes("click")) {
      code += `    await page.click('button[type="submit"]');\n`;
    }

    if (step.expected?.url) {
      code += `    await expect(page).toHaveURL('${step.expected.url}');\n`;
    }
    if (step.expected?.text) {
      code += `    await expect(page.locator('body')).toContainText('${step.expected.text}');\n`;
    }
  }

  code += `  });\n`;
  code += `});\n`;
  return code;
}

// ─── Gerador Contract (API/Business Rules) ───────────────────────────────────

function generateContractTest(contractData: any): string {
  const baseUrl = contractData.baseUrl || "http://localhost:3000";
  const feature = contractData.feature || "unknown-feature";
  const contracts = contractData.contracts || [];
  const setup = contractData.setup;
  const cleanup = contractData.cleanup;

  let code = `/**
 * Testes de Contrato — ${feature}
 * Gerado automaticamente a partir do CONTRACT-TEST-TEMPLATE
 *
 * Valida regras de negócio derivadas dos Acceptance Criteria da SPEC.md.
 * Cada test() corresponde a 1 AC específico e testável.
 *
 * Sprint: ${contractData.sprintId || "N/A"}
 * Spec Ref: ${contractData.specRef || "N/A"}
 * Total ACs cobertos: ${contracts.length}
 *
 * NOTA: Paralelismo controlado via vitest.config.ts (singleFork).
 * Para override: HARNESS_VITEST_WORKERS=N
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';

// vitest.config.ts companion:
//   import { defineConfig } from 'vitest/config';
//   export default defineConfig({
//     test: {
//       pool: 'forks',
//       poolOptions: { forks: { singleFork: true } },
//       fileParallelism: false,
//     },
//   });


const BASE_URL = process.env.API_URL || '${baseUrl}';

/**
 * Helper para fazer requests HTTP no endpoint da API.
 * @param method Método HTTP (GET, POST, PUT, DELETE)
 * @param path Path relativo do endpoint
 * @param body Body da request (opcional)
 * @param headers Headers adicionais (opcional)
 * @returns Response com status, body e headers
 */
async function apiRequest(method: string, path: string, body?: any, headers?: Record<string, string>) {
  const url = \`\${BASE_URL}\${path}\`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseBody = res.headers.get('content-type')?.includes('json')
    ? await res.json()
    : await res.text();
  return { status: res.status, body: responseBody, headers: Object.fromEntries(res.headers.entries()) };
}

`;

  // Setup (fixtures)
  if (setup?.fixtures?.length) {
    code += `describe('${feature} — Contract Tests', () => {\n`;
    code += `  // Setup: criar dados de teste necessários\n`;
    code += `  beforeAll(async () => {\n`;
    for (const fixture of setup.fixtures) {
      code += `    // Criar ${fixture.entity}: ${JSON.stringify(fixture.data)}\n`;
      code += `    await apiRequest('POST', '${fixture.via?.replace(/^POST\s+/, "") || "/api/test/seed"}', ${JSON.stringify(fixture.data)});\n`;
    }
    code += `  });\n\n`;
  } else {
    code += `describe('${feature} — Contract Tests', () => {\n`;
  }

  // Cleanup
  if (cleanup?.steps?.length) {
    code += `  afterAll(async () => {\n`;
    for (const step of cleanup.steps) {
      code += `    // ${step.description || "Cleanup"}\n`;
      code += `    await apiRequest('${step.method}', '${step.path}');\n`;
    }
    code += `  });\n\n`;
  }

  // Cada contrato = 1 test
  for (const ct of contracts) {
    const testName = `${ct.id}: ${ct.acceptanceCriteria}`;
    const req = ct.request;
    const exp = ct.expectedResponse;

    code += `  /**\n`;
    code += `   * ${ct.acceptanceCriteria}\n`;
    code += `   * Spec Ref: ${ct.specRef || "N/A"}\n`;
    code += `   * Tipo: ${ct.type || "general"}\n`;
    code += `   */\n`;
    code += `  test('${testName}', async () => {\n`;
    code += `    const res = await apiRequest(\n`;
    code += `      '${req.method}',\n`;
    code += `      '${req.path}',\n`;
    if (req.body && Object.keys(req.body).length > 0) {
      code += `      ${JSON.stringify(req.body, null, 6).replace(/\n/g, "\n      ")},\n`;
    } else {
      code += `      undefined,\n`;
    }
    if (req.headers && Object.keys(req.headers).length > 0) {
      code += `      ${JSON.stringify(req.headers)}\n`;
    } else {
      code += `      undefined\n`;
    }
    code += `    );\n\n`;

    // Status check
    code += `    // Validar status HTTP\n`;
    code += `    expect(res.status).toBe(${exp.status});\n\n`;

    // Body schema validation
    if (exp.bodySchema) {
      code += `    // Validar corpo da resposta (regra de negócio)\n`;
      for (const [field, schema] of Object.entries(exp.bodySchema)) {
        const s = schema as any;
        if (s.equals !== undefined) {
          code += `    expect(res.body.${field}).toBe(${JSON.stringify(s.equals)});\n`;
        } else if (s.contains) {
          code += `    expect(res.body.${field}).toContain(${JSON.stringify(s.contains)});\n`;
        } else if (s.type === "string" && s.format === "uuid") {
          code += `    expect(res.body.${field}).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);\n`;
        } else if (s.type === "string" && s.format === "iso8601") {
          code += `    expect(new Date(res.body.${field}).toISOString()).toBe(res.body.${field});\n`;
        } else if (s.type === "array") {
          code += `    expect(Array.isArray(res.body.${field})).toBe(true);\n`;
          if (s.minItems) {
            code += `    expect(res.body.${field}.length).toBeGreaterThanOrEqual(${s.minItems});\n`;
          }
          if (s.items) {
            code += `    // Validar item[0] do array como amostra\n`;
            code += `    const firstItem = res.body.${field}[0];\n`;
            for (const [itemField, itemSchema] of Object.entries(s.items)) {
              const is = itemSchema as any;
              if (is.equals !== undefined) {
                code += `    expect(firstItem.${itemField}).toBe(${JSON.stringify(is.equals)});\n`;
              } else if (is.contains) {
                code += `    expect(firstItem.${itemField}).toContain(${JSON.stringify(is.contains)});\n`;
              }
            }
          }
          if (s.eachFieldPresent) {
            code += `    // Todos os campos obrigatórios devem estar presentes nos erros\n`;
            code += `    const errorFields = res.body.${field}.map((e: any) => e.field);\n`;
            for (const f of s.eachFieldPresent) {
              code += `    expect(errorFields).toContain('${f}');\n`;
            }
          }
        }
      }
    }

    // Body must not contain
    if (exp.bodyMustNotContain) {
      code += `\n    // Campos sensíveis NÃO devem vazar na resposta\n`;
      code += `    const responseStr = JSON.stringify(res.body);\n`;
      for (const field of exp.bodyMustNotContain) {
        code += `    expect(responseStr).not.toContain('"${field}":');\n`;
      }
    }

    // Side effects
    if (ct.sideEffects?.length) {
      code += `\n    // Verificar side-effects (efeitos colaterais da regra de negócio)\n`;
      for (const se of ct.sideEffects) {
        code += `    // ${se.description}\n`;
        if (se.verify) {
          const verifyPath = se.verify.path.replace(
            "{response.id}",
            "' + res.body.id + '",
          );
          code += `    const sideEffect = await apiRequest('${se.verify.method}', '${verifyPath}');\n`;
          code += `    expect(sideEffect.status).toBe(${se.verify.expectedStatus});\n`;
          if (se.verify.expectedBody) {
            for (const [k, v] of Object.entries(se.verify.expectedBody)) {
              code += `    expect(sideEffect.body.${k}).toBe(${JSON.stringify(v)});\n`;
            }
          }
        }
      }
    }

    code += `  });\n\n`;
  }

  code += `});\n`;
  return code;
}

// ─── Tool Definition ─────────────────────────────────────────────────────────

export default tool({
  description:
    "Gera código de teste executável a partir de cadeias declarativas. Mode 'e2e' gera Playwright, mode 'contract' gera testes de contrato de API que validam regras de negócio.",
  args: {
    mode: tool.schema
      .enum(["e2e", "contract"])
      .optional()
      .describe(
        "Modo de geração: 'e2e' (Playwright UI) ou 'contract' (API/business rules). Default: e2e",
      ),
    chainId: tool.schema
      .string()
      .describe("ID da cadeia de teste (ex: E2E-USER-001 ou CT-USER-REG)"),
    sprintId: tool.schema.string().describe("ID da sprint"),
    chainData: tool.schema
      .any()
      .describe(
        "Dados da cadeia: para e2e usa sequence[], para contract usa o schema CONTRACT-TEST-TEMPLATE",
      ),
  },
  async execute({ mode, chainId, sprintId, chainData }, context) {
    const cwd = resolveProjectCwd(context, { log: console.error });
    const testMode = mode || "e2e";

    if (testMode === "e2e") {
      // Modo E2E: gera Playwright
      const testDir = path.join(cwd, "tests", "e2e", sprintId);
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const filePath = path.join(testDir, `${chainId}.test.ts`);
      const code = generateE2eTest(chainId, chainData);
      fs.writeFileSync(filePath, code);

      return {
        success: true,
        mode: "e2e",
        filePath: path.relative(cwd, filePath),
        message: `Teste E2E Playwright para ${chainId} gerado com sucesso.`,
      };
    }

    if (testMode === "contract") {
      // Modo Contract: gera testes de contrato de API
      const testDir = path.join(cwd, ".harness", "qa", sprintId, "contracts");
      if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
      const filePath = path.join(testDir, `${chainId}.contract.test.ts`);
      const code = generateContractTest(chainData);
      fs.writeFileSync(filePath, code);

      // Salvar também o JSON declarativo para rastreabilidade
      const jsonPath = path.join(testDir, `${chainId}.contract.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(chainData, null, 2));

      // Gerar/criar vitest.config.ts com paralelismo controlado (v6.6.2)
      const vitestConfigPath = path.join(cwd, "vitest.config.ts");
      const vitestWorkers = getOptimalVitestWorkers();
      const vitestConfig = `import { defineConfig } from 'vitest/config';

// Auto-gerado por test-codegen (v6.6.2).
// Paralelismo conservador baseado em RAM disponível.
// Override: HARNESS_VITEST_WORKERS=N
export default defineConfig({
  test: {
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30000,
  },
});
`;
      fs.writeFileSync(vitestConfigPath, vitestConfig);
      const vitestWorkersUsed = vitestWorkers;
      const freeMemGB = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
      process.stderr.write(
        `[test-codegen] vitest.config.ts criado com singleFork (workers=${vitestWorkersUsed}, RAM livre: ${freeMemGB}GB)\n`,
      );

      const totalContracts = chainData?.contracts?.length || 0;
      return {
        success: true,
        mode: "contract",
        filePath: path.relative(cwd, filePath),
        jsonPath: path.relative(cwd, jsonPath),
        vitestConfigPath: path.relative(cwd, vitestConfigPath),
        vitestWorkers: vitestWorkersUsed,
        totalContracts,
        message: `${totalContracts} testes de contrato para ${chainId} gerados. vitest.config.ts com paralelismo controlado.`,
      };
    }

    return {
      success: false,
      error: `Mode '${testMode}' não reconhecido. Use 'e2e' ou 'contract'.`,
    };
  },
});
