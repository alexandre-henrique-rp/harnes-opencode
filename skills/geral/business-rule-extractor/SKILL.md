---
name: business-rule-extractor
description: Extrai regras de negócio de documentos externos (SPECs, RFCs, legislação) e adiciona ao .harness/business-rules.json. Usado por rag-curator e tester quando o usuário fornece link de documentação.
---

# Business Rule Extractor — Extração de Regras de Documentos Externos

> Skill sob demanda: transforma texto de SPEC, RFC ou documentação legal em entries estruturadas de `.harness/business-rules.json`.

## Quando usar

- `rag-curator` recebe link externo de documentação (ex: SPEC de API, RFC, manual de negócio)
- `tester` precisa popular `.harness/business-rules.json` a partir de SPEC.md
- `requirements` precisa extrair regras de PRD/SPEC para garantir cobertura de testes

## Como aplicar

### 1. Ler fonte de texto

Identifique o documento de origem:
- `SPEC.md` do projeto (preferência)
- `PRD.md`
- Link externo (HTTP/HTTPS) — use `webfetch` se for URL
- Documento colado pelo usuário no chat

### 2. Identificar frases que descrevem regras de negócio

Procure por padrões semânticos:

| Padrão no texto | Tipo de regra inferida |
|---|---|
| *"ao finalizar X, sistema DEVE gerar/criar Y"* | Side-effect cross-entity |
| *"valor X é calculado com base em Y"* | Cálculo/regra de cálculo |
| *"status muda de A para B quando..."* | Transição de estado |
| *"X só pode ser feito por Y"* | Autorização |
| *"se condição C, então ação A"* | Regra condicional |
| *"campo FK aponta para entidade E"* | Integridade referencial |
| *"prazo: 15 dias, 24h, etc."* | Regra temporal/SLA |

### 3. Para cada regra detectada, extrair

```json
{
  "id": "BR-<próximo-número>",
  "description": "<frase original ou parafraseada>",
  "trigger": {
    "method": "<GET|POST|PUT|PATCH|DELETE>",
    "path": "<endpoint inferido do contexto>",
    "actor": "<quem executa, se identificável>"
  },
  "criticality": "critical | advisory",
  "source": "doc-extracted",
  "entities": ["<entidade 1>", "<entidade 2>"],
  "effects": [
    {
      "entity": "<entidade afetada>",
      "mustExist": true,
      "verifyEndpoint": {
        "method": "GET",
        "path": "<endpoint para verificar>",
        "expectedStatus": 200
      },
      "fieldChecks": [
        {
          "field": "<caminho JSON>",
          "rule": "equals | match | not-empty",
          "value": "<valor literal OU source dinâmico>",
          "description": "<frase do original>"
        }
      ]
    }
  ],
  "specRefs": ["<US ou AC referenciados>"]
}
```

### 4. Mesclar com regras existentes

Antes de adicionar:

1. Leia `.harness/business-rules.json` atual
2. Para cada regra extraída:
   - Se já existe regra com mesma descrição → atualize `lastEditedBy` + `lastUpdated`
   - Se é nova → adicione com próximo `BR-XXX` disponível
3. **NÃO duplique** regras já existentes

### 5. Inferir criticality

Use a heurística padrão:

| Sinal | criticality |
|---|---|
| Texto contém "DEVE" (obrigatório) | `critical` |
| Texto contém "valor X" + cálculo | `critical` |
| Texto menciona side-effect ("gerar", "criar") | `critical` |
| Texto é "desejável" ou "nice to have" | `advisory` |
| Texto é apenas formatação/UX | `advisory` (não vai para business-rules) |
| Ambíguo | `critical` (default conservador) |

### 6. Salvar

Atualize `.harness/business-rules.json` com:

```json
{
  "lastUpdated": "<ISO8601>",
  "metadata": {
    "totalRules": "<N atualizado>",
    "critical": "<N atualizado>",
    "advisory": "<N atualizado>"
  },
  "rules": [...existing + new]
}
```

Use `edit` tool — **não reescreva** o arquivo todo.

### 7. Reportar

```json
{
  "source": "doc-extracted",
  "documentRef": "<link ou path>",
  "rulesExtracted": 5,
  "rulesAdded": 3,
  "rulesUpdated": 2,
  "rulesSkipped": 1,
  "skipReasons": ["duplicate-of-BR-002"]
}
```

---

## Como NÃO aplicar

- ❌ Inventar regras que não estão no documento original
- ❌ Adicionar regras sem inferir `trigger.method` e `path`
- ❌ Marcar como `advisory` regras com "DEVE" no texto
- ❌ Sobrescrever regras existentes sem preservar histórico
- � Esquecer de atualizar `metadata.totalRules`

---

## Validação pós-extração

Antes de retornar:

- [ ] Cada regra nova tem `description` extraída ou parafraseada do original
- [ ] Cada regra tem pelo menos 1 entry em `effects[]`
- [ ] `criticality` foi inferida com base em keywords
- [ ] `metadata` foi atualizado (totalRules, critical, advisory)
- [ ] Arquivo continua sendo JSON válido após edição

---

## Exemplo rápido

**Texto-fonte (de SPEC.md):**

> "Ao finalizar um atendimento médico, o sistema deve gerar automaticamente uma ordem de pagamento com o valor combinado na tabela de preços do médico."

**Saída estruturada:**

```json
{
  "id": "BR-001",
  "description": "Finalizar atendimento gera ordem de pagamento com valor da tabela do médico",
  "trigger": {
    "method": "POST",
    "path": "/api/atendimentos/{id}/finalizar",
    "actor": "medico"
  },
  "criticality": "critical",
  "source": "doc-extracted",
  "entities": ["atendimento", "ordem_pagamento", "medico", "tabela_precos"],
  "effects": [
    {
      "entity": "ordem_pagamento",
      "mustExist": true,
      "verifyEndpoint": {
        "method": "GET",
        "path": "/api/ordens?atendimento_id={id}",
        "expectedStatus": 200
      },
      "fieldChecks": [
        {
          "field": "items[0].valor",
          "rule": "match",
          "source": "tabela_precos[procedimento].valor",
          "description": "Valor deve vir da tabela de preços do médico"
        },
        {
          "field": "items[0].medico_id",
          "rule": "equals",
          "source": "context.medico_id",
          "description": "FK deve apontar para o médico que finalizou"
        },
        {
          "field": "items[0].status",
          "rule": "equals",
          "value": "pendente",
          "description": "Ordem nasce pendente"
        }
      ]
    }
  ],
  "specRefs": ["US-005", "AC-005-1"]
}
```

**Reportar:**

```json
{
  "source": "doc-extracted",
  "documentRef": ".harness/SPEC.md",
  "rulesExtracted": 1,
  "rulesAdded": 1,
  "rulesUpdated": 0,
  "rulesSkipped": 0
}
```

---

## Quem ativa esta skill

| Trigger | Agent |
|---|---|
| Usuário cita regra no chat | `briefing` ou `requirements` |
| Link de doc externo | `rag-curator` |
| Início de sprint sem `business-rules.json` | `tester` (auto-detecta) |
| Edição de SPEC.md | `requirements` (re-extrai) |
