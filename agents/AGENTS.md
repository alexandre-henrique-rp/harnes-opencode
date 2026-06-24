# Contexto de Agentes — agents/

Esta pasta contém as especificações de comportamento, modelos, temperaturas e permissões de escrita (path boundaries) de cada um dos agentes envolvidos no workflow.

## 👥 Resumo de Responsabilidades por Agente

### Coordenação e Ciclo de Vida
- [orchestrator.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/orchestrator.md) — Agente principal que gerencia o fluxo de estados, lê o `state.json`, valida transições de fases e delega tarefas aos subagentes.

### Fase 0: Briefing
- [briefing.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/briefing.md) — Responsável por interagir com o usuário, entender o escopo do projeto, gerar o arquivo `brief.md` e aguardar a aprovação inicial.

### Fase 1: Documentação e RAG
- [documenter.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/documenter.md) — Cria a estrutura de documentação do projeto (incluindo os arquivos `AGENTS.md` locais) e estabelece a base de contexto.
- [rag-curator.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/rag-curator.md) — Cura, cataloga e gerencia os arquivos de RAG em `.harness/RAG/` e o índice `RAG/index.json`.

### Fase 2: Requisitos e Especificações
- [requirements.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/requirements.md) — Detalha as especificações do negócio a partir do briefing e gera o documento de requisitos do produto (`PRD.md`).
- [prd-reviewer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/prd-reviewer.md) — Revisa o `PRD.md` atribuindo notas e sugerindo refinamentos antes do gate de transição.
- [spec-reviewer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/spec-reviewer.md) — Revisa as especificações técnicas (`SPEC.md`) garantindo fidelidade de arquitetura e consistência.

### Fase 3: Design e UI
- [designer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/designer.md) — Cria guias de design, componentes CSS, layouts e as especificações visuais de páginas (`.DESIGN.md`, `.PROMPT.md`).
- [design-reviewer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/design-reviewer.md) — Audita as diretrizes visuais criadas, verificando responsividade, acessibilidade e conformidade estética.

### Fase 4: Planejamento
- [sprint-tasker.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/sprint-tasker.md) — Quebra os requisitos e especificações em sprints técnicas estruturadas, gerando arquivos JSON em `sprints/`.
- [planning-reviewer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/planning-reviewer.md) — Avalia o cronograma de sprints planejadas, checando dependências e garantindo 100% de cobertura dos requisitos.

### Fase 5: Execução (Build) e Qualidade
- [backend.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/backend.md) — Implementa lógica de backend, banco de dados e APIs sob TDD rígido e boas práticas de documentação JSDoc.
- [frontend.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/frontend.md) — Implementa interfaces de usuário HTML, CSS e JS do lado do cliente com foco em responsividade e fidelidade de design.
- [tester.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/tester.md) — Executa e analisa suítes de testes automatizados, validando se a cobertura atinge o mínimo exigido (ex: 85%).
- [security.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/security.md) — Analisa o código em busca de vazamentos de credenciais, dependências vulneráveis e riscos de segurança da informação.
- [lgpd-officer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/lgpd-officer.md) — Encarregado de Proteção de Dados (DPO) que audita o código para garantir privacidade, bases de consentimento e direitos de titulares conforme a LGPD.
- [qa-gate.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/qa-gate.md) — Agente gatekeeper que junta os relatórios da fase 5, valida métricas agregadas e autoriza o merge/conclusão da sprint.
- [code-reviewer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/code-reviewer.md) — Revisa o código-fonte gerado antes da submissão final da sprint para garantir padrões de codificação limpos e consistentes.
