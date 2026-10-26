---
description: Gera a especificação de UI/UX, estados visuais, SEO e acessibilidade (.opencode/specs/<feature>/DESIGN.md).
agent: orchestrator
---

Gere ou atualize o design visual e semântico para a feature ativa:
`$ARGUMENTS`

Passos obrigatórios:
1. Localize a `SPEC.md` correspondente em `.opencode/specs/`.
2. Se `has_ui: false`, avise que a feature não possui interface gráfica e sugira `/plan`.
3. Se `has_ui: true`, acione o subagente `designer` para criar `.opencode/specs/<feature>/DESIGN.md` cobrindo hierarquia de componentes, os 4 estados visuais (Empty, Loading, Error, Success), HTML5 semântico, SEO e acessibilidade (WCAG AA).
