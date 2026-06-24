# Comandos do Harness — commands/

Esta pasta contém as instruções para o interpretador de comandos do Opencode. Cada arquivo corresponde a uma instrução executável do harness v6.

## 🛠️ Comportamento dos Comandos

- [harness.md](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/harness.md) — O ponto de entrada principal do fluxo de desenvolvimento. Inicializa a estrutura `.harness/` se ela não existir e aciona o loop do `orchestrator` para a fase atual do projeto.
- [harness-status.md](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/harness-status.md) — Exibe ao usuário o estado atual do harness, indicando a fase ativa, os marcos concluídos e os pendentes.
- [harness-next.md](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/harness-next.md) — Aciona o avanço de fase. Valida se os critérios do portão (gate) correspondentes à fase atual foram atendidos e realiza a transição.
- [harness-retry.md](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/harness-retry.md) — Executa novamente a fase ativa ou uma determinada tarefa que falhou, permitindo correções rápidas de erros locais.
- [harness-review.md](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/harness-review.md) — Roda revisões de qualidade nos artefatos gerados nas fases preliminares do projeto (como PRD, SPEC, Design).
- [harness-help.md](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/harness-help.md) — Exibe as instruções de uso e ajuda do console sobre todos os comandos e parâmetros aceitos pelo harness.
