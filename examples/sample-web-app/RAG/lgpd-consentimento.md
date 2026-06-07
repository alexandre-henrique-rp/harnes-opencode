---
id: lgpd-consentimento
title: LGPD — Bases legais e consentimento para tratamento de dados pessoais
description: Como coletar, registrar e armazenar consentimento conforme LGPD Art. 7º e Art. 8º.
category: law
tags: [lgpd, gdpr, consent, privacy, br, compliance]
scope: project
priority: critical
status: approved
source: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm
appliesTo: [all]
language: pt-BR
createdAt: 2026-06-06T00:00:00Z
updatedAt: 2026-06-06T00:00:00Z
version: 1
changelog:
  - version: 1
    date: 2026-06-06T00:00:00Z
    change: "Initial creation do projeto sample-web-app"
---

# LGPD — Bases legais e consentimento

## 1. Contexto

Este projeto coleta dados pessoais de clientes (CPF, nome, endereço) no momento do cadastro. Conforme a **LGPD (Lei 13.709/2018)**, todo tratamento de dados pessoais precisa ter uma **base legal** (Art. 7º) e, quando aplicável, **consentimento** explícito (Art. 8º). Esta regra se aplica a **qualquer** endpoint que receba, armazene ou exponha dados pessoais.

## 2. Regra

Para tratamento de dados pessoais, **uma** das 10 bases legais do Art. 7º deve estar documentada e verificável:

1. **Consentimento** — para finalidades específicas, com opção de revogação
2. **Cumprimento de obrigação legal** — ex: nota fiscal
3. **Execução de contrato** — entre titular e controlador
4. **Exercício regular de direitos** — ex: processo judicial
5. **Interesse legítimo** — para finalidades legítimas, sem prejuízo ao titular
6. **Crédito** — análises de risco
7. **Tutela da saúde** — profissionais de saúde
8. **Interesse público** — administração pública
9. **Estudo** — pesquisa
10. **Anonimização** — quando dados não identificam pessoa

Para nosso projeto: **execução de contrato** (cliente se cadastra para usar a plataforma). Logo, **não precisamos de consentimento explícito** para o cadastro, mas precisamos:

- **Informar** o titular sobre o tratamento (Art. 9º)
- **Permitir** a exclusão dos dados a qualquer momento (Art. 18, VI)
- **Registrar** data/hora do cadastro (Art. 37)
- **Criptografar** dados sensíveis em repouso (Art. 46)

## 3. Por quê

LGPD Art. 42: "O controlador ou o operador que, em razão do exercício de atividade de tratamento de dados pessoais, causar a outrem dano patrimonial, moral, individual ou coletivo, em violação à legislação de proteção de dados pessoais, é obrigado a repará-lo."

Multas podem chegar a **2% do faturamento** (limitadas a R$ 50 milhões por infração).

## 4. Como aplicar

```typescript
// Schema Zod do user, com auditoria LGPD
import { z } from "zod";

export const userCreateSchema = z.object({
  cpf: z.string().refine(isValidCPF, "CPF inválido"),
  name: z.string().min(3).max(100),
  email: z.string().email(),
  cep: z.string().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  // NÃO pedir consent_checkbox — base legal é execução de contrato
  // MAS registrar data/hora
}).transform((data) => ({
  ...data,
  createdAt: new Date(),  // Art. 37: registro de data
  lgpdBasis: "contract_execution",  // Art. 7º, V
  retentionUntil: addYears(new Date(), 5),  // 5 anos (Art. 16)
}));

// Endpoint DELETE respeita Art. 18, VI (direito de exclusão)
app.delete("/api/users/:id", authMiddleware, async (req, res) => {
  // Soft delete primeiro, hard delete após 30 dias
  await prisma.user.update({
    where: { id: req.params.id },
    data: { deletedAt: new Date(), lgpdErasureRequested: true },
  });
  res.status(202).json({ message: "Exclusão agendada para 30 dias" });
});
```

## 5. Como NÃO aplicar

```typescript
// NÃO FAÇA ISSO
const userSchema = z.object({
  cpf: z.string(),  // sem validação
  // sem timestamp de criação
  // sem base legal declarada
});

// NÃO FAÇA ISSO
app.post("/api/users", async (req, res) => {
  const user = await prisma.user.create({ data: req.body });
  // sem registro de consentimento
  // sem criptografia do CPF
  // sem data de criação
  res.json(user);
});
```

## 6. Cross-refs

- `cpf-encryption` — como criptografar CPF (Art. 46)
- `api-security` — TLS 1.3, rate limit (Art. 46)
- `lgpd-data-retention` — política de retenção (Art. 16)
- `audit-log` — log de acessos a dados pessoais (Art. 37)

## 7. Última validação

- **Quando:** 2026-06-06
- **Por:** rag-curator agent
- **Evidência:** Lei 13.709/2018, https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm (acesso em 2026-06-06)
