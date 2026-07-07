/**
 * pii-detector.ts — Harness v6 tool
 *
 * Detecta dados pessoais (PII) e sensíveis no código e schemas.
 * Auxilia o LGPD Officer a mapear o inventário de dados e riscos de criptografia.
 */

import { tool } from "@opencode-ai/plugin";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "pii-detector",
  description: "Varre o código em busca de campos que contenham dados pessoais (CPF, e-mail, etc) e verifica riscos de conformidade.",
  args: {
    targetDir: tool.schema.string().default("src").describe("Diretório alvo para o scan"),
  },
  async execute({ targetDir }, context) {
    const cwd = context?.directory || process.cwd();
    const fullTargetDir = path.resolve(cwd, targetDir);
    const piiFields: any[] = [];

    if (!fs.existsSync(fullTargetDir)) {
      return { success: false, error: `Diretorio ${targetDir} nao encontrado.` };
    }

    const piiPatterns = [
      { name: "CPF", pattern: /cpf|documento/i, sensitive: false },
      { name: "E-mail", pattern: /email|e-mail/i, sensitive: false },
      { name: "Telefone", pattern: /telefone|celular|phone/i, sensitive: false },
      { name: "Endereço", pattern: /endereco|address|logradouro|cep/i, sensitive: false },
      { name: "RG", pattern: /\brg\b/i, sensitive: false },
      { name: "Saúde/Bio", pattern: /saude|biometria|doenca|exame/i, sensitive: true },
      { name: "Religião/Política", pattern: /religiao|politica|partido|sindicato/i, sensitive: true },
      { name: "Cookies", pattern: /document\.cookie|cookies\.set/i, sensitive: false },
      { name: "LocalStorage", pattern: /localStorage\.setItem|sessionStorage\.setItem/i, sensitive: false },
      { name: "Tracker/Analytics", pattern: /gtag|ga\(|fbq|hotjar|mixpanel/i, sensitive: false },
    ];

    const countsByType: Record<string, number> = {};

    const scanDirRecursive = (dir: string) => {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (err) {
        return; // Diretório inacessível
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Ignora pastas de controle conhecidas
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".harness") {
            continue;
          }
          scanDirRecursive(fullPath);
        } else if (entry.isFile()) {
          // Filtra extensões elegíveis (.ts, .tsx, .py, .rb, .json)
          const ext = path.extname(entry.name).toLowerCase();
          if (![".ts", ".tsx", ".py", ".rb", ".json"].includes(ext)) {
            continue;
          }

          try {
            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");

            for (const item of piiPatterns) {
              countsByType[item.name] = countsByType[item.name] || 0;
              // Limita a 50 ocorrências por tipo para evitar estouro de contexto
              if (countsByType[item.name] >= 50) {
                continue;
              }

              lines.forEach((lineText, idx) => {
                if (countsByType[item.name] >= 50) {
                  return;
                }

                if (item.pattern.test(lineText)) {
                  const evidence = lineText.trim();
                  const isEncrypted = /encrypt|decrypt|cipher|vault|aes/i.test(evidence);

                  piiFields.push({
                    type: item.name,
                    sensitive: item.sensitive,
                    file: path.relative(cwd, fullPath),
                    line: idx + 1,
                    evidence: evidence.length > 200 ? evidence.slice(0, 200) + "..." : evidence,
                    risk: !isEncrypted && (item.name === "CPF" || item.sensitive) ? "high" : "medium"
                  });

                  countsByType[item.name]++;
                }
              });
            }
          } catch (err) {
            // Ignora erros de leitura em arquivos individuais
          }
        }
      }
    };

    scanDirRecursive(fullTargetDir);

    return {
      success: true,
      piiCount: piiFields.length,
      piiFields,
      summary: `Detectados ${piiFields.length} campos com dados pessoais em ${targetDir} (varredura nativa segura).`
    };
  },
});

