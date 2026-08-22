---
name: detect-pii
description: Detecta automaticamente se uma sprint/feature manuseia dados pessoais (LGPD). Usado pelo orchestrator e sprint-tasker para decidir se o agente lgpd-officer deve ser ativado.
---

# Detect PII — Auto-detecção de Dados Pessoais

> Skill simples e direta: responde **sim/não** se a sprint/feature precisa de auditoria LGPD.

## Quando usar

- `orchestrator` antes de invocar `lgpd-officer`
- `sprint-tasker` ao criar sprints
- `briefing` ao validar `.harness/brief.md`

## Como aplicar

### 1. Verificar contexto escrito (rápido)

Procure palavras-chave em `brief.md`, `SPEC.md`, `PRD.md`, e nos títulos das tasks:

| Sinal de PII | LGPD aciona? |
|---|---|
| `cpf`, `cnpj`, `rg`, `titulo_eleitor` | ✅ sim |
| `email`, `telefone`, `endereço`, `cep` | ✅ sim |
| `saúde`, `biometria`, `religião`, `orientação sexual` | ✅ sim (dado sensível Art. 11) |
| `cookie`, `tracking`, `analytics`, `pixel` | ✅ sim |
| `usuario`, `cliente`, `pessoa` (em contexto de cadastro) | ✅ sim |
| `auth`, `login`, `senha`, `password` | ✅ sim |
| `transferência internacional`, `aws us`, `gcp us` | ✅ sim |
| Apenas `logs internos`, `métricas`, `config` | ❌ não |
| `feature de UI pura` sem coleta de dados | ❌ não |

### 2. Verificar código (se houver)

```bash
# Rodar grep simples no diretório de trabalho
grep -rE "(cpf|cnpj|email|phone|user|cliente|pessoa)" src/ --include="*.ts" --include="*.tsx" -l
```

Se encontrar arquivos com esses padrões, marca como PII.

### 3. Decisão final

```json
{
  "containsPII": true | false,
  "evidence": ["cpf encontrado em src/api/users.ts", "campo email no schema"],
  "recommendedAction": "activate-lgpd-officer" | "skip-lgpd-audit"
}
```

## Heurística padrão

**Em caso de dúvida → assume `true`.** Custo de rodar auditoria extra é baixo; custo de pular auditoria em feature com PII é alto (multa ANPD).

## Como NÃO aplicar

- ❌ Não fazer análise jurídica profunda (papel do `lgpd-officer`, não desta skill).
- ❌ Não ler RAG/law (esta skill é apenas o gate de ativação).
- ❌ Não criar relatório — apenas retornar JSON booleano.

## Saída esperada (para orchestrator)

```json
{
  "phase": "phase.0.briefing" | "phase.4.planejamento" | "phase.5.build",
  "containsPII": true,
  "lgpdOfficerRequired": true,
  "evidence": ["cpf em SPEC.md", "campo email no schema"],
  "skipReason": null
}
```

## Threshold

| Sinal | Decisão |
|---|---|
| 1+ match forte (cpf, cnpj, saúde, etc.) | `containsPII: true` |
| 1+ match moderado (email, login) | `containsPII: true` |
| 0 matches | `containsPII: false` |
