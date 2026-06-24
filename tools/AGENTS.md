# Ferramentas Técnicas — tools/

Esta pasta contém ferramentas escritas em TypeScript para automatizar validações, estruturação de dados, relatórios e pipelines no harness v6.

## ⚙️ Resumo das Ferramentas (Scripts TS)

- [harness-init.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/harness-init.ts) — Inicializa a estrutura de pastas `.harness/` e os arquivos de estado iniciais (`state.json`, `events.jsonl`, `agent-boundaries.json`), suportando perfis `strict` ou `lean`.
- [harness-status.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/harness-status.ts) — Lê os arquivos de estado e gera o relatório estruturado de progresso e pendências do workflow.
- [harness-advance.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/harness-advance.ts) — Avalia os portões (gates) de qualidade da fase atual e transiciona o estado do projeto para a próxima fase.
- [harness-context.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/harness-context.ts) — Constrói o capability grant e injeta os schemas e caminhos permitidos na task description enviada ao subagente.
- [task-manager.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/task-manager.ts) — Coordena o despacho e acompanhamento de tarefas para os agentes subordinados, controlando retentativas automáticas em caso de erros transitórios.
- [context-query.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/context-query.ts) — Executa buscas e mapeamentos inteligentes na estrutura de arquivos para prover contexto otimizado aos agentes de build.
- [rag-manager.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/rag-manager.ts) — Gerencia a leitura, escrita e indexação de documentos de contexto local na pasta `.harness/RAG/`.
- [coverage-analyzer.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/coverage-analyzer.ts) — Analisa relatórios de cobertura de testes (LCOV) e valida se atingem a meta contratual da fase 5 (ex: >= 85%).
- [git-commit-manager.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/git-commit-manager.ts) — Gerencia commits atômicos do Git e sugere mensagens de commit padronizadas a partir do escopo da task executada.
- [pii-detector.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/pii-detector.ts) — Verifica dados gerados ou logs antes de enviar ao modelo para evitar o vazamento de PII (dados pessoais/sensíveis) ou chaves secretas.
- [security-scanner.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/security-scanner.ts) — Realiza análises de segurança estática no código-fonte das sprints buscando vulnerabilidades comuns (CWE/OWASP).
- [test-codegen.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/test-codegen.ts) — Auxilia na geração de esqueletos de teste unitários/integração com base nas especificações técnicas.
- [progress-tracker.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/progress-tracker.ts) — Mapeia o progresso geral e métricas das tarefas de sprints ativas.
- [ui-spec-manager.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/ui-spec-manager.ts) — Inicializa as pastas de UI/Design e cria automaticamente as especificações de UI ou prompts unificados para o Google Stitch MCP.
- [sprint-builder.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/sprint-builder.ts) — Inicializa fisicamente as pastas de sprints e gera esqueletos de micro-prompts (TXXX_PROMPT.md) de forma determinística a partir de User Stories do SPEC.md.
- [playwright-runner.ts](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/playwright-runner.ts) — Executa testes do Playwright localmente via CLI de forma determinística, gravando vídeos de execuções com falhas e relatórios de diagnóstico estruturados.
