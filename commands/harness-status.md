---
description: Mostrar estado atual do workflow Harness v6
agent: orchestrator
---
Chame a tool `harness_status` com `{ verbose: true }`.

Apresente o resultado em formato legível:
- Projeto e fase atual
- Progresso (X/Y fases, %)
- Próxima fase planejada
- Último evento
- Owner da fase atual
- Output contract pendente
- Gate que será validado

Argumentos: $ARGUMENTS (opcional, ex: "verbose" para detalhes extras)
