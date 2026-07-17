#!/usr/bin/env node
import fs from 'fs';

function analyzeComplexity(targetPath: string) {
    console.log(`[AST Analyzer] Medindo complexidade heurística em: ${targetPath}`);
    if (!fs.existsSync(targetPath)) {
        console.error(`Erro: Arquivo não encontrado - ${targetPath}`);
        process.exit(1);
    }
    
    const content = fs.readFileSync(targetPath, 'utf-8');
    
    // Heurística rápida baseada em branch statements
    const matches = content.match(/\\b(if|else|for|while|case|catch|&&|\\|\\||\\?)\\b/g);
    let complexity = 1; // Fluxo base
    
    if (matches) {
        complexity += matches.length;
    }
    
    console.log(`Pontuação de Complexidade Ciclomática (Estimada): ${complexity}`);
    
    if (complexity > 15) {
        console.log("[AST Analyzer] ALERTA (REPROVADO): Complexidade muito alta detectada (código espaguete). Sugestão de refatoração urgente e extração de sub-funções.");
    } else if (complexity > 8) {
        console.log("[AST Analyzer] AVISO: Complexidade moderada. O agente Code-Reviewer deve exigir cobertura robusta de testes.");
    } else {
        console.log("[AST Analyzer] APROVADO: Arquitetura lógica limpa, legível e coesa.");
    }
}

const target = process.argv[2];
if (!target) {
    console.log("Uso: npx ts-node ast-analyzer.ts <arquivo.ts|js>");
    process.exit(1);
}
analyzeComplexity(target);
