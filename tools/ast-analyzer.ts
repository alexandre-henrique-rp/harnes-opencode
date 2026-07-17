#!/usr/bin/env node
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const ts = require('typescript');

function calculateComplexity(node: any): number {
    let complexity = 0;

    switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.CaseClause:
            complexity++;
            break;
        case ts.SyntaxKind.BinaryExpression: {
            if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || 
                node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
                node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
                complexity++;
            }
            break;
        }
    }

    ts.forEachChild(node, (child: any) => {
        complexity += calculateComplexity(child);
    });

    return complexity;
}

function analyzeFile(targetPath: string) {
    console.log(`[AST Analyzer] Medindo complexidade AST real em: ${targetPath}`);
    if (!fs.existsSync(targetPath)) {
        console.error(`Erro: Arquivo não encontrado - ${targetPath}`);
        process.exit(1);
    }

    const content = fs.readFileSync(targetPath, 'utf-8');
    const sourceFile = ts.createSourceFile(
        targetPath,
        content,
        99, // ts.ScriptTarget.ESNext
        true
    );

    const functionScores: Array<{ name: string, score: number }> = [];

    function visit(node: any) {
        if (
            ts.isFunctionDeclaration(node) ||
            ts.isMethodDeclaration(node) ||
            ts.isArrowFunction(node) ||
            ts.isFunctionExpression(node)
        ) {
            let name = "anonymous";
            if (node.name && ts.isIdentifier(node.name)) {
                name = node.name.text;
            } else if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
                name = node.parent.name.text;
            } else if (node.parent && ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
                name = node.parent.name.text;
            }

            // A complexidade base de toda função é 1
            const score = 1 + calculateComplexity(node.body || node);
            functionScores.push({ name, score });
        } else {
            ts.forEachChild(node, visit);
        }
    }

    visit(sourceFile);

    if (functionScores.length === 0) {
        console.log("[AST Analyzer] APROVADO: Nenhuma função detectada no arquivo.");
        return;
    }

    // Ordena do maior pro menor
    functionScores.sort((a, b) => b.score - a.score);

    const maxScore = functionScores[0].score;
    
    // Lista as funções mais complexas para debug
    console.log(`--- Top Funções Mais Complexas ---`);
    functionScores.slice(0, 3).forEach(f => {
        console.log(`- ${f.name}: Score ${f.score}`);
    });
    console.log(`----------------------------------`);

    if (maxScore > 15) {
        console.log("[AST Analyzer] ALERTA (REPROVADO): Complexidade muito alta detectada (código espaguete). Sugestão de refatoração urgente e extração de sub-funções.");
    } else if (maxScore > 8) {
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
analyzeFile(target);
