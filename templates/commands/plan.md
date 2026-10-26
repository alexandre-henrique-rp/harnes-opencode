---
description: Aciona o task-planner para gerar as Sprints (S01..SN) e Tasks (T01..TN) onde cada Task possui sua própria Spec e os testes ocorrem por Sprint.
agent: orchestrator
---

Gere o planejamento de Sprints e Tasks com Spec individual para:
`$ARGUMENTS`

Passos obrigatórios do `orchestrator`:
1. Designe o subagente `task-planner` para ler `SPEC.md` (e `DESIGN.md` se existir) e criar `.opencode/specs/<feature>/TASKS.md` organizado por **Sprints** (`S01`, `S02`...), garantindo que **cada Task possua sua própria `Spec da Task`** e que a validação de testes (`qa-tester`) seja planejada ao final da Sprint.
2. Execute `npx opencode-harness gate` via terminal para comprovar que todas as Tasks têm `Spec da Task` e que 100% dos `AC-XX` e `BR-XX` estão cobertos sem órfãos.
3. Apresente as Sprints planejadas e aguarde confirmação para `/build`.
