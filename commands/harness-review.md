---
description: Rodar reviewer de um tipo específico (PRD/SPEC/design/QA)
agent: orchestrator
---
1. Identifique o tipo de review pedido em `$ARGUMENTS`:
   - `prd` → agent `prd-reviewer`, arquivo `PRD.html`
   - `spec` → agent `spec-reviewer`, arquivo `SPEC.html`
   - `design` → agent `design-reviewer`, glob `design/*.{DESIGN,PROMPT}.md`
   - `qa` → agent `qa-gate` (roda tester + security + reviewer em paralelo)
2. Verifique que o arquivo/glob existe.
3. Monte capability grant via `harness_context` para o agent reviewer.
4. Delegue via `task` com a task description.
5. O reviewer retorna score (0-100) e detalhamento.
6. Apresente ao usuário:
   - Score final
   - Lista de issues por severidade (critical / high / medium / low)
   - Recomendação: passar / rework / bloquear
7. Se for fase 2 ou 3, salve o score no contexto para uso do `harness-next`.

Argumentos: $ARGUMENTS (ex: "prd", "spec", "design", "qa")
