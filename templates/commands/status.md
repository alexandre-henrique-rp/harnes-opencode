---
description: Exibe o status atual das especificações (.opencode/specs/), cobertura de critérios de aceite e progresso das tarefas.
agent: orchestrator
---

Verifique o status atual do projeto no OpenCode Harness v7:
`$ARGUMENTS`

Passos obrigatórios:
1. Execute `npx opencode-harness gate` e `npx opencode-harness doctor` via bash.
2. Liste as features presentes em `.opencode/specs/`, exibindo para cada uma a quantidade de `AC-XX`, `BR-XX` e o progresso das tarefas (`[x]` vs `[ ]`) em `TASKS.md`.
