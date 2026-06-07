---
description: Avançar para próxima fase (valida gate automaticamente)
agent: orchestrator
---
1. Chame `harness_status` para ver fase atual.
2. Verifique que o output contract da fase atual está completo:
   - Fase 0 (briefing): `brief.md` existe e tem ≥5 linhas
   - Fase 1 (docs): `AGENTS.md`, `ARCH.md`, `RAG/index.json` (≥3 docs)
   - Fase 2 (requisitos): `PRD.html` + `SPEC.html` (scores via reviewers)
   - Fase 3 (design): `PRODUCT.md` + `design/*.DESIGN.md` + `design/*.PROMPT.md`
   - Fase 4 (planejamento): `sprints/index.json` + `S*.json` + `cross-sprint.json`
   - Fase 5 (build): cobertura ≥85%, 0 vuln critical/high, review ≥70
3. Se houver scores de reviewers faltando para a fase 2, pergunte ao usuário.
4. Chame `harness_advance` com os parâmetros apropriados:
   - Fase 0: `{ userApproval: true }` (se humano aprovou brief)
   - Fase 2: `{ scores: { "prd-reviewer": <n>, "spec-reviewer": <n> } }`
   - Fase 4: `{ sprintCoverage: <0-100> }`
   - Fase 5: `{ buildMetrics: { coverage, criticalVulns, highVulns, reviewScore } }`
5. Se gate passou, apresente próxima fase.
6. Se gate falhou, siga a classe de falha (transient/quality/user-action/fatal) e use `harness_retry` ou escale.

Argumentos: $ARGUMENTS
