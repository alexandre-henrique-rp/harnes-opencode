#!/usr/bin/env node
import fs from 'fs';

function validateContract(specPath: string, codePath: string) {
    console.log(`[API Validator] Cruzando contrato OpenAPI/SPEC de ${specPath} com implementação em ${codePath}`);
    
    if (!fs.existsSync(specPath) || !fs.existsSync(codePath)) {
        console.error("Erro: Arquivos de SPEC ou Código fonte não encontrados.");
        process.exit(1);
    }
    
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const codeContent = fs.readFileSync(codePath, 'utf-8');
    
    // Procura padrões de endpoints no SPEC.md (ex: POST /api/users)
    const specEndpoints = [...specContent.matchAll(/(GET|POST|PUT|DELETE|PATCH)\s+(\/[a-zA-Z0-9_/-]+)/gi)].map(m => `${m[1].toUpperCase()} ${m[2]}`);
    
    // Procura padrões equivalentes na implementação Express/Fastify/Nest
    const codeEndpoints = [...codeContent.matchAll(/(get|post|put|delete|patch)\(['"](\/[a-zA-Z0-9_/-]+)['"]/gi)].map(m => `${m[1].toUpperCase()} ${m[2]}`);
    
    if (specEndpoints.length === 0) {
        console.log("[API Validator] Nenhum endpoint REST explícito encontrado na SPEC para validação.");
        return;
    }

    let missing = 0;
    for (const endpoint of specEndpoints) {
        if (!codeEndpoints.includes(endpoint)) {
            console.log(`- [Falha de Contrato] Endpoint definido na SPEC não foi detectado no código: ${endpoint}`);
            missing++;
        }
    }
    
    if (missing === 0) {
        console.log("[API Validator] Sucesso. Todos os endpoints definidos no contrato parecem estar implementados na rota.");
    } else {
        console.log(`[API Validator] Validação de Contrato Falhou. Faltam ${missing} rotas.`);
    }
}

if (process.argv[1] && process.argv[1].endsWith('api-contract-validator.ts')) {
    const spec = process.argv[2];
    const code = process.argv[3];
    if (!spec || !code) {
        console.log("Uso: npx ts-node api-contract-validator.ts <SPEC.md> <arquivo_backend.ts>");
        process.exit(1);
    }
    validateContract(spec, code);
}
