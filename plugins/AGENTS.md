# Plugins do Harness — plugins/

Esta pasta contém os plugins que estendem o runtime do Opencode para adicionar inteligência, logs e barreiras de segurança durante a execução de tarefas.

## 🔌 Lista de Plugins

- [audit-logger.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/plugins/audit-logger.ts) — Registra todas as chamadas de ferramentas (tool calls) dos agentes em arquivos `.harness/audit/session-<id>.jsonl` de forma incremental e persistente.
- [path-boundary.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/plugins/path-boundary.ts) — Valida as operações de gravação e edição de arquivos feitas por subagentes, forçando o respeito às listas de caminhos permitidos (allowlists) de cada agente.
- [status-injector.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/plugins/status-injector.ts) — Injeta metadados de execução e logs nos outputs das ferramentas para fins de rastreabilidade e tratamento de erros.
