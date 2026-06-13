/**
 * pii-detector.ts — Harness v6 tool
 *
 * Detecta dados pessoais (PII) e sensíveis no código e schemas.
 * Auxilia o LGPD Officer a mapear o inventário de dados e riscos de criptografia.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "pii_detector",
  description: "Varre o código em busca de campos que contenham dados pessoais (CPF, e-mail, etc) e verifica riscos de conformidade.",
  args: {
    targetDir: tool.schema.string().default("src").describe("Diretório alvo para o scan"),
  },
  async execute({ targetDir }, context) {
    const cwd = context?.directory || process.cwd();
    const fullTargetDir = path.resolve(cwd, targetDir);
    const piiFields: any[] = [];

    const piiPatterns = [
      { name: "CPF", pattern: /cpf|documento/i, sensitive: false },
      { name: "E-mail", pattern: /email|e-mail/i, sensitive: false },
      { name: "Telefone", pattern: /telefone|celular|phone/i, sensitive: false },
      { name: "Endereço", pattern: /endereco|address|logradouro|cep/i, sensitive: false },
      { name: "RG", pattern: /\brg\b/i, sensitive: false },
      { name: "Saúde/Bio", pattern: /saude|biometria|doenca|exame/i, sensitive: true },
      { name: "Religião/Política", pattern: /religiao|politica|partido|sindicato/i, sensitive: true },
    ];

    for (const item of piiPatterns) {
      try {
        const cmd = `grep -rEi "${item.pattern.source}" "${fullTargetDir}" --include="*.ts" --include="*.tsx" --include="*.py" --include="*.rb" --include="*.json" || true`;
        const output = execSync(cmd).toString();
        
        if (output) {
          const lines = output.split("\n").filter(l => l.trim());
          for (const line of lines.slice(0, 50)) { // Limite de 50 por tipo para economizar
            const [filePath, ...content] = line.split(":");
            const evidence = content.join(":").trim();
            
            // Verifica se há indícios de criptografia na mesma linha ou arquivo
            const isEncrypted = /encrypt|decrypt|cipher|vault|aes/i.test(evidence);

            piiFields.push({
              type: item.name,
              sensitive: item.sensitive,
              file: path.relative(cwd, filePath),
              evidence,
              risk: !isEncrypted && (item.name === "CPF" || item.sensitive) ? "high" : "medium"
            });
          }
        }
      } catch (e) {}
    }

    return {
      success: true,
      piiCount: piiFields.length,
      piiFields,
      summary: `Detectados ${piiFields.length} campos com dados pessoais em ${targetDir}.`
    };
  },
});
