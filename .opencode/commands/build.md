---
description: Executa uma Sprint designando backend e frontend para escreverem o código de cada Task e, ao final da Sprint, o qa-tester para validar as regras.
agent: orchestrator
---

Execute a Sprint planejada para a feature:
`$ARGUMENTS`

Passos obrigatórios do `orchestrator` (lembre-se: você só planeja e designa, nunca escreve código):
1. Leia `.opencode/specs/<feature>/TASKS.md` e identifique a Sprint ativa (`S01`...).
2. Designe `backend` e/ou `frontend` (em paralelo se paths disjuntos) para implementarem **exclusivamente o código** de suas Tasks seguindo a `Spec da Task` de cada uma (sem criar testes por task).
3. Somente após as tasks de código da Sprint terminarem, designe o `qa-tester` **para a Sprint** a fim de criar e rodar **apenas os testes relacionados à Sprint entregue** (nunca rodar todos os testes do projeto, a menos que solicitado pelo usuário), comprovando que as regras de negócio (`BR-XX` e `AC-XX`) estão funcionando.
4. Execute `npx opencode-harness gate --strict` para validar o fechamento da Sprint.
