# Changelog — OpenCode Harness

Todas as mudanças notáveis a partir da arquitetura **v7** são documentadas neste arquivo.

## [7.0.0] — 2026-10-26

### 🚀 Nova Arquitetura (Spec-Anchored por Projeto em `.opencode/`)
- **Instalação Local via NPM (`npx opencode-harness`):** Substituída a instalação global monolítica (`~/.config/opencode` e `install.sh`) por uma CLI leve em TypeScript com zero dependências de produção que instala tudo diretamente na pasta `.opencode/` do repositório do projeto.
- **Consolidação para 8 Agentes de Alta Performance (v7 Turbo):**
  - `orchestrator`: Apenas planeja, tira dúvidas com o usuário, auxilia nas definições de produto e designa tarefas aos subagentes (`edit: deny`).
  - `spec-engineer`: Escreve e mantém `PRD.md`, `PRODUCT.md`, `SPEC.md` e `AGENTS.md` seguindo a skill `doc-standards`.
  - `designer`: Projeta interfaces, os 4 estados visuais, HTML5 semântico, SEO técnico e acessibilidade (WCAG AA) em `DESIGN.md`.
  - `task-planner`: Organiza entregas em **Sprints (`S01..SN`)** e **Tasks (`T01..TN`)**, garantindo que **cada Task possua sua própria Spec (`Spec da Task`)** autocontida.
  - `backend`: Focado exclusivamente em escrever código de backend guiado pela `Spec da Task`, preservando comentários existentes (sem testes por task).
  - `frontend`: Focado exclusivamente em escrever código de frontend, SEO e acessibilidade guiado pela `Spec da Task` e `DESIGN.md` (sem testes por task).
  - `qa-tester`: Atua **por Sprint** (e não por task), criando e executando **apenas os testes relacionados à Sprint entregue** para validar que as regras de negócio (`BR-XX` e `AC-XX`) estão funcionando, evitando testes desnecessários.
  - `code-reviewer`: Auditoria Read-Only da Sprint em 2 turnos (Spec Compliance, Comentários, OWASP, LGPD, SEO e Gate).
- **Motor Mecânico de Gate (`npx opencode-harness gate`):** Valida mecanicamente se todas as Tasks possuem `Spec da Task`, se 100% dos `AC-XX` e `BR-XX` estão cobertos sem órfãos e (com `--strict`) se todas as tarefas da Sprint foram concluídas (`[x]`).
- **Remoção Completa de Legado da v6:** Removidos plugins pesados, dependências externas (`@aws-sdk/*`, `clamdjs`), scripts bash e os 12 agentes redundantes da v6.
