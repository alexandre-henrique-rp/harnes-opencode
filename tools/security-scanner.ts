/**
 * security-scanner.ts — Harness v6 tool
 *
 * Automatiza scans de segurança (OWASP, Secrets, Insecure Patterns).
 * Reduz o consumo de tokens do agente Security ao processar buscas complexas via código.
 */

import { tool } from "@opencode-ai/plugin";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export default tool({
  name: "security_scanner",
  description: "Executa scans de segurança automatizados (Regex e auditoria de dependências) no código-fonte.",
  args: {
    targetDir: tool.schema.string().default("src").describe("Diretório alvo para o scan"),
    checks: tool.schema.array(tool.schema.enum(["secrets", "sql_injection", "xss", "insecure_http", "cors", "dependencies"]))
      .default(["secrets", "sql_injection", "xss", "insecure_http", "cors"])
      .describe("Tipos de verificações a realizar"),
  },
  async execute({ targetDir, checks }, context) {
    const cwd = context?.directory || process.cwd();
    const fullTargetDir = path.resolve(cwd, targetDir);
    const findings: any[] = [];

    if (!fs.existsSync(fullTargetDir)) {
      return { success: false, error: `Diretorio ${targetDir} nao encontrado.` };
    }

    const scanPatterns = {
      secrets: {
        pattern: /(sk_live|sk_test|Bearer\s+[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|api[_-]?key.*=.*[a-zA-Z0-9]{20,})/i,
        category: "A02: Cryptographic Failures",
        title: "Hardcoded Secret/Key Detectada",
        severity: "critical"
      },
      sql_injection: {
        pattern: /(execute|query).*['"].*\+.*['"]/i,
        category: "A03: Injection",
        title: "Possível SQL Injection (Concatenação)",
        severity: "critical"
      },
      xss: {
        pattern: /dangerouslySetInnerHTML|innerHTML\s*=/i,
        category: "A03: Injection",
        title: "Possível XSS (Manipulação Direta de DOM)",
        severity: "high"
      },
      insecure_http: {
        pattern: /http:\/\//i,
        category: "A02: Cryptographic Failures",
        title: "Uso de Protocolo Inseguro (HTTP)",
        severity: "medium"
      },
      cors: {
        pattern: /Access-Control-Allow-Origin.*\*/i,
        category: "A05: Security Misconfiguration",
        title: "CORS Permitindo Qualquer Origem (*)",
        severity: "high"
      }
    };

    // 1. Executar Scans de Regex
    for (const check of checks) {
      if (check === "dependencies") continue;
      const config = (scanPatterns as any)[check];
      
      try {
        // Usando grep via shell para performance em arquivos grandes
        const cmd = `grep -rEn "${config.pattern.source.replace(/"/g, '\\"')}" "${fullTargetDir}" || true`;
        const output = execSync(cmd).toString();
        
        if (output) {
          const lines = output.split("\n").filter(l => l.trim());
          for (const line of lines) {
            const [filePath, lineNum, ...evidence] = line.split(":");
            findings.push({
              category: config.category,
              title: config.title,
              severity: config.severity,
              file: path.relative(cwd, filePath),
              line: parseInt(lineNum),
              evidence: evidence.join(":").trim()
            });
          }
        }
      } catch (e) {
        // ignore errors from grep (often just "not found")
      }
    }

    // 2. Auditoria de Dependências (Opcional)
    if (checks.includes("dependencies")) {
      try {
        if (fs.existsSync(path.join(cwd, "package.json"))) {
          const auditOutput = execSync("npm audit --json || true").toString();
          const audit = JSON.parse(auditOutput);
          if (audit.metadata && audit.metadata.vulnerabilities) {
            const vulns = audit.metadata.vulnerabilities;
            if (vulns.critical > 0 || vulns.high > 0) {
              findings.push({
                category: "A06: Vulnerable and Outdated Components",
                title: "Vulnerabilidades em Dependências NPM",
                severity: vulns.critical > 0 ? "critical" : "high",
                evidence: `Critical: ${vulns.critical}, High: ${vulns.high}, Total: ${audit.metadata.totalDependencies}`
              });
            }
          }
        }
      } catch (e) {
        // ignore audit errors
      }
    }

    return {
      success: true,
      findingsCount: findings.length,
      findings,
      summary: `Scan concluído em ${targetDir}. Foram encontrados ${findings.length} problemas de segurança.`
    };
  },
});
