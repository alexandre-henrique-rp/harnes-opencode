---
description: Fast-path para demandas rápidas (T0/T1) — o orchestrator tira dúvidas rápidas, planeja e designa diretamente ao backend ou frontend.
agent: orchestrator
---

Coordene em modo ágil (**Fast-Path**) a seguinte solicitação:
`$ARGUMENTS`

Passos obrigatórios do `orchestrator` (você nunca edita código diretamente):
1. Se houver qualquer dúvida sobre o comportamento desejado, pergunte ao usuário primeiro.
2. Designe diretamente o subagente especialista (`backend`, `frontend` ou `spec-engineer` para documentação) passando a especificação exata da mudança.
3. Se houver alteração de regra de negócio, designe o `qa-tester` ao final para validar se a regra continua funcionando.
