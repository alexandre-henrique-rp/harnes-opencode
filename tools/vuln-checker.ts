#!/usr/bin/env node
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function checkVulnerabilities(targetDir: string) {
    console.log(`[Vuln Checker] Analisando dependências via 'npm audit' em: ${targetDir}`);
    const pkgPath = path.join(targetDir, 'package.json');
    
    if (!fs.existsSync(pkgPath)) {
        console.error("Erro: package.json não encontrado no diretório destino.");
        process.exit(1);
    }
    
    try {
        const result = execSync('npm audit --json', { cwd: targetDir, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        const audit = JSON.parse(result);
        reportAudit(audit);
    } catch (error: any) {
        // npm audit exits with non-zero if vulnerabilities are found
        if (error.stdout) {
            try {
                const audit = JSON.parse(error.stdout);
                reportAudit(audit);
            } catch (parseError) {
                console.log("[Vuln Checker] Falha ao processar o output do audit JSON.");
            }
        }
    }
}

function reportAudit(audit: any) {
    const v = audit.metadata?.vulnerabilities || {critical: 0, high: 0, moderate: 0, low: 0};
    console.log(`[Vuln Checker] Resultado da Varredura CVEs: Critical: ${v.critical}, High: ${v.high}, Moderate: ${v.moderate}, Low: ${v.low}`);
    
    if (v.critical > 0 || v.high > 0) {
        console.log("[Vuln Checker] REPROVADO: O pacote introduz dependências com vulnerabilidades críticas/altas.");
    } else {
        console.log("[Vuln Checker] APROVADO: Nenhuma vulnerabilidade grave detectada na árvore de dependências.");
    }
}

if (process.argv[1] && process.argv[1].endsWith('vuln-checker.ts')) {
    const target = process.argv[2] || process.cwd();
    checkVulnerabilities(target);
}
