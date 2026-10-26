---
description: Entende a demanda, tira dúvidas de produto e aciona o spec-engineer para gerar a documentação oficial (PRD.md, PRODUCT.md, SPEC.md, AGENTS.md).
agent: orchestrator
---

Conduza a descoberta de produto e especificação **Spec-Anchored** para:
`$ARGUMENTS`

Passos obrigatórios do `orchestrator`:
1. Analise o pedido, auxilie nas definições de produto e faça perguntas estratégicas ao usuário caso exista qualquer dúvida de regra de negócio ou fluxo.
2. Com o escopo claro, designe o subagente `spec-engineer` (seguindo os padrões da skill `doc-standards`) para criar/atualizar `.opencode/specs/<feature-slug>/PRD.md`, `.opencode/specs/<feature-slug>/SPEC.md` (e `.opencode/PRODUCT.md` ou `AGENTS.md` quando aplicável).
3. Apresente o resumo e sugira avançar para `/design` (se houver UI) ou `/plan`.
