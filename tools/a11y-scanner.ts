#!/usr/bin/env node
import fs from 'fs';

function scan(targetPath: string) {
    console.log(`[A11y Scanner] Iniciando varredura em: ${targetPath}`);
    if (!fs.existsSync(targetPath)) {
        console.error(`Erro: Arquivo ou diretório não encontrado - ${targetPath}`);
        process.exit(1);
    }
    
    // Heurística de varredura semântica estática rápida
    let issues = 0;
    const content = fs.readFileSync(targetPath, 'utf-8');
    
    if (content.includes('<img') && !content.includes('alt=')) {
        console.log("- [Violação Alta] Imagem sem atributo 'alt' detectada.");
        issues++;
    }
    if (content.includes('<button') && !content.includes('aria-label') && !/>\\w+/.test(content)) {
        console.log("- [Violação Média] Botão sem rótulo textual explícito legível por leitores de tela.");
        issues++;
    }
    if (!content.includes('<main') && (content.includes('<html') || content.includes('<body>'))) {
        console.log("- [Violação Baixa] Página principal sem tag semântica de âncora <main>.");
        issues++;
    }
    
    if (issues === 0) {
        console.log("[A11y Scanner] Nenhuma violação grave encontrada (Aprovado).");
    } else {
        console.log(`[A11y Scanner] Encontradas ${issues} potenciais violações de acessibilidade.`);
    }
}

const target = process.argv[2];
if (!target) {
    console.log("Uso: npx ts-node a11y-scanner.ts <arquivo.html ou componente>");
    process.exit(1);
}
scan(target);
