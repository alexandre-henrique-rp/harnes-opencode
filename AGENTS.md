# Mapa de Contexto — OpenCode Harness v7 (`opencode-harness`)

Este arquivo serve como o mapa de contexto central do repositório da CLI e dos templates do **OpenCode Harness v7**.

## 🚀 Tecnologias e Stack
- **Linguagem Principal:** TypeScript / Node.js ($\ge 18$), zero dependências de terceiros em produção.
- **Paradigma:** *Spec-Anchored Development por Sprints* inspirado no `onp-spec-driven`, focado na instalação local por projeto via `.opencode/`.
- **Distribuição:** Pacote NPM executável via `npx opencode-harness`.

---

## 🏛️ Os 8 Agentes de Elite da v7 (`templates/agents/`)
1. **[orchestrator.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/orchestrator.md)** (`mode: primary`, `edit: deny`) → Recebe o prompt, entende o problema, faz perguntas para zerar dúvidas, auxilia nas definições de produto, planeja e designa aos subagentes (nunca escreve código).
2. **[spec-engineer.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/spec-engineer.md)** (`mode: subagent`) → Escreve e mantém toda a documentação seguindo os padrões da skill `doc-standards` (`PRD.md`, `PRODUCT.md`, `SPEC.md` e `AGENTS.md`).
3. **[designer.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/designer.md)** (`mode: subagent`) → Projeta interfaces, os 4 estados visuais, HTML5 semântico, SEO técnico e acessibilidade (WCAG AA) em `DESIGN.md`.
4. **[task-planner.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/task-planner.md)** (`mode: subagent`) → Gera as **Sprints** (`S01..SN`) e **Tasks** (`T01..TN`) em `TASKS.md`, garantindo que **cada Task possua sua própria Spec (`Spec da Task`)** e cobertura de 100% dos `AC-XX` e `BR-XX`.
5. **[backend.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/backend.md)** (`mode: subagent`) → Responsável **exclusivamente por escrever o código** de backend seguindo a `Spec da Task` e preservando comentários existentes (não escreve testes por task).
6. **[frontend.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/frontend.md)** (`mode: subagent`) → Responsável **exclusivamente por escrever o código** de frontend, SEO e acessibilidade seguindo a `Spec da Task` e `DESIGN.md` (não escreve testes por task).
7. **[qa-tester.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/qa-tester.md)** (`mode: subagent`) → Atua **por Sprint** (e não por task), criando e executando apenas os testes necessários para validar que as regras de negócio (`BR-XX` e `AC-XX`) estão funcionando, evitando testes desnecessários.
8. **[code-reviewer.md](file:///home/kingdev/Documentos/Opencode_agents/templates/agents/code-reviewer.md)** (`mode: subagent`) → Auditoria Read-Only da Sprint: Spec Compliance, Qualidade de Código, Preservação de Comentários, Segurança (OWASP), LGPD/PII e SEO.

---

## 🗂️ Organização das Pastas do Repositório
- **[bin/opencode-harness.js](file:///home/kingdev/Documentos/Opencode_agents/bin/opencode-harness.js)**: Ponto de entrada executável da CLI NPM.
- **[src/](file:///home/kingdev/Documentos/Opencode_agents/src/)**: Código-fonte TypeScript da CLI (`init`, `spec`, `gate`, `update`, `doctor`, `status`).
- **[templates/](file:///home/kingdev/Documentos/Opencode_agents/templates/)**: Agentes, comandos, skills (`spec-driven`, `doc-standards`, `security-lgpd`, `seo-a11y`) e templates embarcados copiados para `.opencode/` nos projetos alvo.
- **[tests/](file:///home/kingdev/Documentos/Opencode_agents/tests/)**: Suíte de testes unitários e de integração (`node:test`).
