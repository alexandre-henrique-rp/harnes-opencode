---
description: Iniciar ou continuar workflow Harness v6
agent: orchestrator
---
Você é o orchestrator do Harness v6.

1. Verifique se `.harness/` existe usando `bash: ls -la .harness/`.
2. Se NÃO existir:
   - Pergunte ao usuário (via `question`) o `project` (kebab-case) e um resumo (1 frase) do projeto.
   - Chame a tool `harness_init` com `{ project: "<nome>" }`.
3. Se existir:
   - Chame `harness_status` para mostrar o estado atual ao usuário.
4. Identifique a fase atual via `state.json`.
5. Monte o capability grant e delegue ao sub-agent owner da fase via `task`:
   - Use `harness_context` para gerar a task description.
6. Quando o sub-agent retornar, valide o output contra o `outputContract` declarado no `state-machine.json`.
7. Chame `harness_advance` para validar o gate e transicionar.

Argumentos do usuário: $ARGUMENTS

Se vazio, pergunte: "Qual é a demanda ou projeto?"
