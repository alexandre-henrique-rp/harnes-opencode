---
id: cnpj-alfanumerico-validation
title: "Validação e Padrão do Novo CNPJ Alfanumérico (Receita Federal)"
description: "Padrão de especificação e algoritmo de validação matemática do novo CNPJ Alfanumérica implementado pela Receita Federal."
category: "pattern"
tags: ["cnpj", "cnpj-alfanumerico", "validacao", "receita-federal", "modulo-11"]
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
    change: "Initial creation — padrão de cálculo de dígitos verificadores para CNPJ Alfanumérico"
---

# Validação e Padrão do Novo CNPJ Alfanumérico (Receita Federal)

Este documento estabelece o padrão de especificação técnica e algoritmo de validação matemática para o novo padrão de CNPJ Alfanumérico no Brasil, instituído pela Receita Federal com vigência a partir de julho de 2026.

## 1. Contexto

Aplica-se a qualquer software que processe, armazene ou valide o Cadastro Nacional da Pessoa Jurídica (CNPJ) para evitar a quebra de sistemas legados que aceitam apenas valores puramente numéricos na raiz do cadastro.

## 2. Regra / Padrão / Decisão / Lei

- **Formato:** O CNPJ mantém 14 caracteres de comprimento e a estrutura de máscara visual `AA.AAA.AAA/AAAA-DV` (onde `A` pode ser letra maiúscula de A a Z ou número de 0 a 9, e `DV` são dígitos verificadores numéricos de 0 a 9).
- **Caracteres Válidos:** As primeiras 12 posições são alfanuméricas. As duas últimas (DV) continuam sendo puramente numéricas.
- **Conversão de Letras para o Cálculo:** A fórmula tradicional do Módulo 11 permanece idêntica. No entanto, para fins de cálculo dos DVs, as letras maiúsculas e números das primeiras 12 posições são convertidos em valores decimais usando o código ASCII do caractere subtraído de 48:
  
  $$\text{Valor} = \text{Código ASCII}(\text{caractere}) - 48$$

  *Exemplos de conversão:*
  - Caractere `'0'` (ASCII 48): $48 - 48 = 0$
  - Caractere `'9'` (ASCII 57): $57 - 48 = 9$
  - Letra `'A'` (ASCII 65): $65 - 48 = 17$
  - Letra `'B'` (ASCII 66): $66 - 48 = 18$
  - Letra `'Z'` (ASCII 90): $90 - 48 = 42$

- **Cálculo do Primeiro Dígito (DV1):**
  Aplica-se os pesos `5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2` respectivamente aos 12 primeiros valores numéricos convertidos. Soma-se os produtos e calcula-se o resto da divisão por 11:
  - Se o resto for 0 ou 1, o DV1 é `0`.
  - Se o resto for maior ou igual a 2, o DV1 é `11 - resto`.

- **Cálculo do Segundo Dígito (DV2):**
  Aplica-se os pesos `6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2` respectivamente aos 12 primeiros caracteres e ao DV1 recém-calculado. Soma-se os produtos e calcula-se o resto da divisão por 11:
  - Se o resto for 0 ou 1, o DV2 é `0`.
  - Se o resto for maior ou igual a 2, o DV2 é `11 - resto`.

## 3. Por quê

A Receita Federal esgotou as combinações puramente numéricas disponíveis para novos registros. A introdução do formato alfanumérico expande a capacidade sem alterar o comprimento total da string. Sistemas legados que limpam strings usando expressões como `replace(/\D/g, "")` ou que validam se a entrada possui apenas números nas primeiras 12 posições quebram totalmente e bloqueiam o cadastro de novas empresas.

## 4. Como aplicar

Exemplo de algoritmo completo de validação em TypeScript compatível com CNPJs clássicos e novos alfanuméricos:

```typescript
export function isValidCNPJ(cnpj: string): boolean {
  if (!cnpj) return false;

  // Remove caracteres de formatação comum (. / -) e normaliza em caixa alta
  const clean = cnpj.replace(/[\.\-\/]/g, "").toUpperCase();

  // Verifica comprimento e caracteres válidos (12 primeiras: alfanuméricas, 2 últimas: numéricas)
  if (clean.length !== 14) return false;
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(clean)) return false;

  // Evita sequências de caracteres idênticos repetidos
  if (/^([A-Z0-9])\1{13}$/.test(clean)) return false;

  // Converte string para array de valores usando ASCII - 48
  const digits = Array.from(clean).map(char => char.charCodeAt(0) - 48);

  // Pesos para os cálculos do DV
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  // Cálculo do primeiro dígito (DV1)
  let sum1 = 0;
  for (let i = 0; i < 12; i++) {
    sum1 += digits[i] * weights1[i];
  }
  const mod1 = sum1 % 11;
  const dv1 = mod1 < 2 ? 0 : 11 - mod1;

  if (digits[12] !== dv1) return false;

  // Cálculo do segundo dígito (DV2)
  let sum2 = 0;
  for (let i = 0; i < 12; i++) {
    sum2 += digits[i] * weights2[i];
  }
  sum2 += dv1 * weights2[12]; // Adiciona o DV1
  const mod2 = sum2 % 11;
  const dv2 = mod2 < 2 ? 0 : 11 - mod2;

  return digits[13] === dv2;
}
```

## 5. Como NÃO aplicar

Não remova todas as letras do CNPJ antes de validá-lo ou realizar os cálculos de dígito verificador:

```typescript
// NÃO FAÇA ISSO - Isso quebra totalmente o CNPJ Alfanumérico!
export function isValidCNPJLegacy(cnpj: string): boolean {
  const onlyNumbers = cnpj.replace(/\D/g, ""); // Letras serão destruídas!
  if (onlyNumbers.length !== 14) return false;
  // Lógica legada...
  return true;
}
```

## 6. Cross-refs

Nenhum.

## 7. Última validação

- **Quando foi verificado pela última vez:** 2026-07-04
- **Por qual agente:** Antigravity
- **Evidência:** Instrução Normativa e Notas Técnicas Oficiais da Receita Federal do Brasil para CNPJ Alfanumérico.
