---
description: Executa o portão mecânico (gate) e a auditoria completa de qualidade, segurança, LGPD e SEO com o code-reviewer.
agent: orchestrator
---

Realize a auditoria completa (Gate Mecânico + Code Review) para:
`$ARGUMENTS`

Passos obrigatórios:
1. Execute `npx opencode-harness gate --strict` via bash para verificar o alinhamento mecânico das especificações e tarefas.
2. Acione o subagente `code-reviewer` para auditar o `git diff` contra a checklist de 12 itens (Spec Compliance, Testes Unitários, Preservação de Comentários, Segurança OWASP, LGPD/PII e SEO/a11y).
3. Apresente o relatório final com o veredicto (`PASS` ou `BLOCK`).
