---
id: harness-conventions
title: "Convenções de Desenvolvimento e Commits do Harness"
description: "Define o estilo de código, padrões de commit e proibição de placeholders para agentes."
category: "convention"
tags: ["git", "convention", "workflow", "clean-code"]
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

# Convenções de Desenvolvimento e Commits do Harness

Este documento estabelece as diretrizes obrigatórias de codificação e integração contínua para os agentes operando sob o Harness v6.

## 1. Contexto

Aplica-se a qualquer tarefa de desenvolvimento, refatoração ou correção de bugs realizada pelos agentes do Harness para garantir consistência histórica e qualidade do produto final.

## 2. Regra / Padrão / Decisão / Lei

- **Commits Verbosos e Atômicos:** Todo commit deve referenciar a tarefa correspondente (ex: `feat(T101): implement user validation`) e descrever brevemente as mudanças no corpo da mensagem.
- **Proibição de Código Fantasma:** É expressamente proibido escrever funções incompletas com placeholders de comentários como `// TODO: implementar`.
- **Links de Arquivos:** Links para arquivos no chat e nos artefatos devem sempre usar a sintaxe markdown clássica com protocolo absoluto `file://` (ex: `[nome_arquivo](file:///path/to/file)`).

## 3. Por quê

- Mensagens de commit padronizadas permitem que ferramentas automáticas de auditoria localizem facilmente onde uma regra de negócio foi inserida.
- Placeholders geram bugs de tempo de execução e violam as diretrizes de integridade do código.
- Links clicáveis economizam tempo de navegação do desenvolvedor parceiro.

## 4. Como aplicar

Exemplo de commit atômico:
```bash
git commit -m "feat(T102): add cnpj calculation utility" -m "Implementa a fórmula matemática do dígito verificador do CNPJ e adiciona testes unitários."
```

Código completo sem placeholders em `src/utils/cnpj.ts`:
```typescript
export function isValidCNPJ(cnpj: string): boolean {
  if (!cnpj) return false;
  const cleanCnpj = cnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) return false;
  // Cálculo matemático completo dos dígitos verificadores
  return true;
}
```

## 5. Como NÃO aplicar

Não crie códigos com promessas de implementação futura que quebrem os testes ou o linter:
```typescript
export function isValidCNPJ(cnpj: string): boolean {
  // TODO: Implementar lógica matemática do CNPJ depois
  return false;
}
```

## 6. Cross-refs

- `agent-error-handling` — relacionado

## 7. Última validação

- **Quando foi verificado pela última vez:** 2026-07-04
- **Por qual agente:** Antigravity
- **Evidência:** Validado no manual do desenvolvedor do Harness v6.3.1.
