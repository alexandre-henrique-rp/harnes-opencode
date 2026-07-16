# Mapa de Contexto — OpenCode Agents v6

Este arquivo serve como o mapa de contexto central do projeto para orientar agentes e humanos no entendimento da estrutura e tecnologias do harness.

## 🚀 Tecnologias e Stack
- **Linguagem Principal:** Node.js (v18+) & TypeScript para ferramentas e plugins.
- **Configurações e State:** JSON / JSONC (`opencode.json`, `state-machine.json`, `failure-protocol.json`).
- **Definição de Agentes e Comandos:** Markdown (`.md`) com frontmatter YAML interpretado pelo runtime do Opencode.

---

## 📋 Briefing do Projeto
O **OpenCode Agents v6** é um harness de desenvolvimento multi-agente declarativo e auditável de alta fidelidade. Inspirado nas práticas de *vibe-coding* e XP (Extreme Programming), o harness organiza o ciclo de desenvolvimento em **6 fases** e gerencia **20 agentes** especializados com responsabilidades únicas, limites rígidos de escrita (path boundaries) e controle total de auditoria.

### Fases do Workflow:
1. **Fase 0: Briefing** (Owner: [briefing.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/briefing.md)) → Gera o briefing e solicita aprovação do usuário.
2. **Fase 1: Documentação** (Owner: [documenter.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/documenter.md)) → Estrutura o contexto do projeto com arquivos `AGENTS.md` e RAG.
3. **Fase 2: Requisitos** (Owner: [requirements.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/requirements.md)) → Cria o PRD e a SPEC técnica.
4. **Fase 3: Design** (Owner: [designer.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/designer.md)) → Mapeia layouts, design systems e fluxos visuais.
5. **Fase 4: Planejamento** (Owner: [sprint-tasker.md](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/sprint-tasker.md)) → Planeja e divide as tarefas em sprints.
6. **Fase 5: Build + Quality** (Coordenado pelo `orchestrator.md`) → Implementa funcionalidades (Backend/Frontend), executa testes, valida LGPD/DPO e segurança e realiza a validação final (QA).

---

## 📂 Localização de Artefatos Críticos
Quando o harness está ativo em um projeto alvo, os principais artefatos são gerados e armazenados nos seguintes locais:
- **Briefing do Projeto:** Salvo no arquivo `.harness/brief.md` na raiz do projeto alvo.
- **PRD e SPEC (Requisitos):** Gerados como `PRD.md` e `SPEC.md` no diretório `.harness/` (ou na raiz do projeto dependendo da configuração da fase).
- **Planejamento de Sprints:** Salvo como arquivos JSON em `.harness/sprints/` (ex: `S01.json`, `S02.json`), mapeando todas as tarefas com 100% de cobertura dos requisitos da SPEC.
- **Arquivos RAG locais:** Localizados na pasta `.harness/RAG/` e listados no índice `RAG/index.json`.

> **Nota Operacional para os Agentes:** Consulte o documento [TOOLS_INDEX.md](file:///home/kingdev/Documentos/Opencode_agents_v6/docs/TOOLS_INDEX.md) localizado em `docs/TOOLS_INDEX.md` para visualizar as **ferramentas (tools)** disponíveis que poupam comandos bash repetitivos (como commit automatizado, atualização de changelog e linter inteligente).

---

## 🗂️ Organização das Pastas do Harness
- [agents/](file:///home/kingdev/Documentos/Opencode_agents_v6/agents/): Definições de identidade e permissões dos 20 agentes.
- [commands/](file:///home/kingdev/Documentos/Opencode_agents_v6/commands/): Comandos de CLI expostos para controle de execução do harness.
- [tools/](file:///home/kingdev/Documentos/Opencode_agents_v6/tools/): Ferramentas auxiliares TypeScript para validações de linter, testes, LGPD e build.
- [plugins/](file:///home/kingdev/Documentos/Opencode_agents_v6/plugins/): Plugins integrados do Opencode que realizam logging e reforçam barreiras de escrita dos agentes.
- [templates/](file:///home/kingdev/Documentos/Opencode_agents_v6/templates/): Modelos padrão de arquivos para PRD, SPEC, RAG e sprints.
- [training/](file:///home/kingdev/Documentos/Opencode_agents_v6/training/): Bases globais de RAG e treinamento (como o manual de conformidade LGPD).
