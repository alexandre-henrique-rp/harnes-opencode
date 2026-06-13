---
id: "RAG-XXX"                       # OBRIGATÓRIO. Único. Kebab-case.
category: "convention|pattern|law|security|decision|lesson|schema|mcp-doc" # OBRIGATÓRIO
title: "Título Curto"                # OBRIGATÓRIO.
summary: "Breve resumo do que se trata este documento para listagem rápida." # OBRIGATÓRIO
priority: "low|medium|high|critical" # OBRIGATÓRIO
status: "draft|approved"             # OBRIGATÓRIO
updatedAt: "ISO8601"                 # OBRIGATÓRIO
---

# RAG Doc Template (meta-template)

> **Este doc é auto-referencial.** Ele define a estrutura de todos os outros RAG docs do projeto. Quando o `rag-curator` cria um novo doc, ele copia este template e preenche os campos.

## 1. Contexto

QUANDO isto se aplica. QUAL problema resolve. Em qual cenário.

**Exemplos:**
- "LGPD Art. 7º se aplica a qualquer coleta de dados pessoais no projeto"
- "Este pattern se aplica a toda chamada de API externa com retry"

## 2. Regra / Padrão / Decisão / Lei

O CONTEÚDO em si. Pode ser:

- **Regra (convention):** "Use kebab-case para nomes de arquivo"
- **Padrão (pattern):** "Para validação de CPF, use zod com .refine()"
- **Antipadrão (antipattern):** "NUNCA armazene CPF sem criptografia"
- **Workflow:** "Siga esses 5 passos ao adicionar uma rota"
- **Lei (law):** "LGPD Art. 7º — bases legais para tratamento"
- **Decisão (decision):** "Por que escolhemos Postgres ao invés de Mongo"
- **Lição (lesson):** "Aprendemos que X causou Y em produção"
- **Schema:** "Schema do usuário: campos, tipos, constraints"

## 3. Por quê

Racional, fontes externas, evidências, referências. Exemplos:
- Link pro Art. 7º da LGPD
- Link pro blog post
- Commit SHA que introduziu a decisão
- Discussão no time

## 4. Como aplicar

PASSOS CONCRETOS. Comando, código, exemplo real executável.

```typescript
const userSchema = z.object({
  cpf: z.string().refine(isValidCPF, "CPF inválido")
});
```

## 5. Como NÃO aplicar

Contra-exemplo, pegadinha comum, erro típico. Mostre o caminho errado com o porquê.

```typescript
// NÃO FAÇA ISSO
const userSchema = z.object({
  cpf: z.string()  // sem validação
});
```

## 6. Cross-refs

Links pra outros RAG docs relacionados:

- `security-hardcoded-secrets` — relacionado
- `lgpd-data-retention` — pré-requisito
- `react-form-best-practices` — usa este padrão

## 7. Última validação

- **Quando foi verificado pela última vez:** 2026-06-06
- **Por qual agente:** rag-curator
- **Evidência:** commit SHA, link de teste, ou "verificado manualmente em <data>"

---

## Schema completo (YAML frontmatter)

```yaml
---
id: <kebab-case-id>                # OBRIGATÓRIO. Único. Sem espaços.
title: <Título humano>              # OBRIGATÓRIO. <80 chars.
description: <1-2 linhas, máx 200 chars>   # OBRIGATÓRIO.
category: <obrigatório, ver lista abaixo>  # OBRIGATÓRIO
tags: [<keyword-list>]              # OBRIGATÓRIO. min 1.
scope: global|project               # OBRIGATÓRIO
priority: critical|high|medium|low  # OBRIGATÓRIO
status: draft|reviewed|approved|deprecated  # OBRIGATÓRIO
source: manual|ai-detected|external|<url>  # OBRIGATÓRIO
appliesTo: [<tech-or-domain-list>] # OBRIGATÓRIO. ['all'] se universal.
language: pt-BR|en                  # OBRIGATÓRIO
createdAt: <ISO8601>                # OBRIGATÓRIO
updatedAt: <ISO8601>                # OBRIGATÓRIO
version: 1                          # OBRIGATÓRIO. Inteiro >= 1
changelog:                          # OBRIGATÓRIO
  - version: 1
    date: <ISO8601>
    change: "Initial creation"
---
```

## Categorias válidas

| Categoria | Quando usar |
|---|---|
| `meta` | Templates, schemas de meta-configuração (este doc) |
| `convention` | Regra de nomenclatura, estilo, organização |
| `pattern` | Padrão recomendado (como fazer X do jeito certo) |
| `antipattern` | Anti-padrão (como NÃO fazer) |
| `workflow` | Sequência de passos pra uma tarefa recorrente |
| `architecture` | Decisão macro de arquitetura |
| `law` | Lei, regulamento, norma (LGPD, GDPR, CCPA) |
| `security` | Prática de segurança (OWASP, threat model) |
| `decision` | Decisão tomada com tradeoffs (ADR-style) |
| `lesson` | Aprendizado de incidente/erro passado |
| `schema` | Definição de estrutura de dados (user, order, etc.) |

## Indexação automática

O `rag-curator` agent gera `RAG/index.json` com:

```json
{
  "generatedAt": "<ISO8601>",
  "totalDocs": 12,
  "byCategory": { "law": 2, "security": 4, "pattern": 3, "convention": 3 },
  "byPriority": { "critical": 5, "high": 4, "medium": 3 },
  "docs": [
    {
      "id": "lgpd-consentimento",
      "title": "LGPD — Bases legais para tratamento de dados",
      "priority": "critical",
      "tags": ["lgpd", "gdpr", "consent"]
    }
  ]
}
```

## Como criar um novo RAG doc

1. Copie este template
2. Renomeie o arquivo para `<id>.md` (kebab-case)
3. Preencha YAML frontmatter (todos campos obrigatórios)
4. Preencha as 7 seções (1-7)
5. Mova `status: draft` para `status: reviewed` após rag-curator revisar
6. Rode `rag-curator` para regenerar `RAG/index.json`
7. Commit: `docs(rag): add <id>`

## Validação automática

`rag-curator` rejeita se:
- Falta campo obrigatório no YAML
- Alguma das 7 seções está vazia
- `status: draft` por mais de 7 dias sem revisão
- `priority: critical` sem `category: security` ou `category: law`
- Cross-refs quebrados (aponta pra doc que não existe)
