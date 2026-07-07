---
id: agent-error-handling
title: "Tratamento de Erros e Recuperação de Falhas por Agentes"
description: "Padrão de como os agentes devem agir e contornar falhas comuns de infraestrutura e linters."
category: "lesson"
tags: ["error-handling", "debugging", "linter", "mcp"]
scope: global
priority: high
status: approved
source: manual
appliesTo: ["all"]
language: pt-BR
createdAt: 2026-07-04T12:20:00Z
updatedAt: 2026-07-04T12:20:00Z
version: 1
changelog:
  - version: 1
    date: 2026-07-04T12:20:00Z
    change: "Initial creation"
---

# Tratamento de Erros e Recuperação de Falhas por Agentes

Este documento orienta os agentes sobre como agir diante de erros de linter, compiladores, falhas de testes e falhas em ferramentas MCP.

## 1. Contexto

Aplica-se sempre que um agente encontrar erros que impeçam a conclusão imediata de sua tarefa técnica no Harness v6.

## 2. Regra / Padrão / Decisão / Lei

- **Resolução de Erros de Lint de Forma Atômica:** Quando o TypeScript/ESLint acusar erros, o agente deve corrigir a tipagem de forma explícita. O uso de `// @ts-ignore` ou de ignores globais é estritamente proibido, exceto sob orientação explícita.
- **Regra de 3 Tentativas para Blockers:** Se o agente passar mais de 3 iterações consecutivas tentando resolver o mesmo erro de build/teste sem sucesso, ele deve parar o trabalho e emitir um relatório de blocker detalhado para o orquestrador/desenvolvedor parceiro, em vez de persistir em loops infinitos.
- **Tratamento de Falhas de Ferramentas (MCP):** Em caso de falha de conexão de MCP (ex: timeouts), registre o erro e tente uma abordagem alternativa ou uma reconexão explícita.

## 3. Por quê

- Evita o desperdício de tokens de API em loops infinitos de tentativas redundantes de correção.
- Força a qualidade das tipagens de código, evitando o acúmulo de débitos técnicos silenciosos que quebram os gates de QA.

## 4. Como aplicar

Exemplo de relatório de blocker após loops infrutíferos:
```markdown
### 🛑 Blocker Detectado

A task de compilação falhou seguidamente com o erro `TypeError: Cannot read properties of undefined (reading 'load')`. Identifiquei que isso ocorre porque a extensão sqlite-vec não conseguiu ser carregada na versão atual do Node.js v16. Recomendo atualizar o Node para v18+ ou verificar as permissões de leitura do binário compilado.
```

## 5. Como NÃO aplicar

Não mascare falhas graves ou erros de tipagem com ignores ou tipagem genérica (`any`) apenas para passar no gate imediato:
```typescript
// NÃO FAÇA ISSO
// @ts-ignore
const result = db.execute(query);
```

## 6. Cross-refs

- `harness-conventions` — relacionado

## 7. Última validação

- **Quando foi verificado pela última vez:** 2026-07-04
- **Por qual agente:** Antigravity
- **Evidência:** Homologado nas diretrizes de resiliência de agentes v6.3.1.
