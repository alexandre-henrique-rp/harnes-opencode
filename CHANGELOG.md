# Changelog

All notable changes to OpenCode Agents v6 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.3.1] - 2026-06-24

### Fixed — Correções Críticas de Segurança & Sandboxing
- **Sandboxing de Escrita (`path-boundary.ts`)**: Corrigida falha grave onde ferramentas nativas de escrita de arquivos (`write_to_file`, `replace_file_content`, `multi_replace_file_content`) e o parâmetro `TargetFile` burlavam silenciosamente o plugin de path boundary.
- **Validação de Gates de Score (`harness-advance.ts`)**: Impedida fraude e bypass pelo orquestrador LLM. A ferramenta agora valida a pontuação diretamente nos arquivos físicos de relatório salvos na pasta `.harness/reviews/`.
- **Command Injection (`pii-detector.ts`)**: Corrigido risco crítico de execução de comandos arbitrários (RCE) via `execSync` com injeção de parâmetros. A busca por PII foi reescrita em Node.js nativo puro (multiplataforma, sem grep do terminal).
- **Instalador de Skills (`install.sh`)**: Corrigido instalador para copiar corretamente a pasta de `skills/` no diretório global de configuração do opencode, incluindo as regras de `"skills/**"` na allowlist padrão do projeto.

### Added — Google Stitch & Automação de Frontend
- **Design Tokens & Stitch (`designer.md`, `orchestrator.md`)**: Integração e geração automática de prompts de UI em prompt único robusto com base no Google Stitch MCP e incorporação de `web-design-guidelines` e `impeccable`.
- **Validação com Playwright local (`playwright-runner.ts`, `tester.md`)**: Validador automatizado local rodando Playwright no root para gerar vídeos e relatórios de falhas de UI sem gastar tokens com o MCP.

## [6.3.0] - 2026-06-13

### Added — Planejamento Fractal + Marcos de UX + Suite de Automação

#### Planejamento Fractal e Marcos de UX
- **Novo Fluxo de Planejamento**: O projeto agora é dividido em **Marcos (Milestones)** para validação de UX, contendo Sprints e Tasks granulares.
- **Micro-Contexto**: Cada task possui seu próprio `TXXX_PROMPT.md` (Micro-PRD/SPEC), reduzindo drasticamente o consumo de tokens.
- **Planning-First Rule**: O Orchestrator bloqueia a execução de código até que 100% do planejamento fractal esteja pronto e validado.
- **Cabeçalho de Status YAML**: Todos os arquivos de planejamento agora possuem cabeçalhos obrigatórios (`status`, `id`, `sprint`, etc.) para parsing rápido.
- **Portão de UX (Phase 6)**: Nova fase de aprovação humana obrigatória após a conclusão de cada Marco de entrega.

#### Suite de Automação (10 novas tools/funções)
- **`task_manager.ts`**: Automatiza a atualização de status e criação de logs de tasks.
- **`context_query.ts`**: Busca contexto granular sobre componentes e decisões passadas para evitar conflitos.
- **`security_scanner.ts`**: Scan automatizado de OWASP e segredos (substitui grep manual no agente Security).
- **`pii_detector.ts`**: Identificação automática de dados pessoais para o agente LGPD Officer.
- **`rag_manager.ts`**: Validação e reconstrução atômica do `RAG/index.json`.
- **`git_commit_manager.ts`**: Criação de commits semânticos automáticos baseados nos logs de task.
- **`progress_tracker.ts`**: Visão geral do progresso do projeto baseada nos headers das tasks.
- **`test_codegen.ts`**: Geração automática de código Playwright a partir de cadeias declarativas (JSON).
- **`coverage_analyzer.ts`**: Resumo inteligente de cobertura de testes (Vitest/Jest).

### Changed
- **`state-machine.json`**: Atualizado para incluir as fases de Planejamento Fractal e UX Gate.
- **Agentes Otimizados**: `orchestrator`, `sprint-tasker`, `backend`, `frontend`, `security`, `lgpd-officer`, `rag-curator` e `tester` agora usam obrigatoriamente as novas tools de automação.
- **`templates/RAG-TEMPLATE.md`**: Agora exige campo `summary` para listagem rápida.
- **`templates/TASK-PROMPT-TEMPLATE.md`**: Novo template para prompts granulares de task.
- **`templates/MILESTONE-TEMPLATE.json`**: Novo template para definição de marcos de UX.

### Fixed
- **Consumo de Tokens**: Redução massiva de tokens ao evitar a leitura redundante de PRD/SPEC globais por múltiplos workers paralelos.
- **Rastreabilidade**: Todas as decisões técnicas agora são logadas em arquivos `TXXX_LOG.json` e registradas no `registry.json` global.

## [6.2.0] - 2026-06-07

### Added — LGPD Officer + RAG LGPD + 3 princípios de engenharia

#### Novo agent: `lgpd-officer` (DPO/advogada especializada)
- Persona: advogada especializada em direito digital + proteção de dados
- Roda ao **final de cada sprint** como 5º worker do phase 5 (fan-out paralelo com backend/frontend/tester/security)
- **NÃO corrige código** — audita, encontra gaps, propõe mudanças com base legal citada
- Cobre 10 categorias: princípios (Art. 6º), bases legais (Art. 7º/11), direitos do titular (Art. 18), DPO (Art. 41), resposta a incidente (Art. 48), transferência internacional (Art. 33-36), cookies (Res. CD/ANPD 4/2023), RIPD (Art. 38), compartilhamento (Art. 26-27), retenção (Art. 6º, V)
- Bloqueia sprint se encontrar finding `critical` ou `high` em Art. 18 (direitos) ou Art. 48 (incidente) ou Art. 41 (DPO)
- Relatório em `.harness/lgpd/audit-<timestamp>.json` + `qa/lgpd/lgpd-sprint-<id>.json`
- Permissões: `edit: deny`, `task: deny` (igual `security`)

#### Novo RAG global: `lgpd-brasil.md` (33KB)
- Localização: `training/lgpd-brasil.md` (repo) → `~/.config/opencode/training/lgpd-brasil.md` (instalado)
- Cobre: Lei 13.709/2018 + Decreto 10.474/2020 + 7 Resoluções ANPD vigentes (1, 2, 4, 15, 18, 19, 23) + Marco Civil da Internet + comparação com GDPR + jurisprudência STJ + casos públicos da ANPD
- Inclui 7 exemplos de código (schemas, endpoints, criptografia, consentimento, auditoria, resposta a incidente) + 10 antipadrões comuns + cross-refs
- Categoria: `law` | Priority: `critical` | Scope: `global` (disponível em todo projeto)

#### 3 novos princípios não-negociáveis (em GERAIS.md)
- **TDD é OBRIGATÓRIO** — ciclo red-green-refactor; código de feature sem teste falhando antes = violação
- **Documentação é OBRIGATÓRIA** — toda função pública tem JSDoc/RDoc/docstring com `@param`, `@returns`, `@throws`
- **Simplicidade primeiro** — YAGNI + KISS; abstração só após 3ª repetição (regra de três); função máx 30 linhas; arquivo máx 300; over-engineering é bug

### Changed
- **Phase 5** (`state-machine.json`): `workers` agora é `["backend", "frontend", "tester", "security", "lgpd-officer"]` (5 workers paralelos)
- **Phase 5 gate** (`all-of`): novo check `{ "type": "lgpd", "min": "warning", "maxCritical": 0, "maxHigh": 0 }` — bloqueia se `lgpdStatus === "non-compliant"` ou `critical > 0` ou `high > 0`
- **`agents/backend.md`** e **`agents/frontend.md`**: reforçam TDD (com ciclo explícito), adicionam seção de docstrings com exemplo em 2 linguagens, adicionam princípio de simplicidade com métricas (função ≤ 30 linhas, etc.)
- **`harness-advance.ts`**: novo case `if (check.type === "lgpd")` que valida `buildMetrics.lgpdStatus` (compliant/warning/non-compliant) + `lgpdCriticalFindings` + `lgpdHighFindings`
- **`install.sh`**: (1) expande `harness-allowlist.json` default para incluir paths do próprio repo (agents, training, templates, etc.); (2) copia `training/*.md` para `~/.config/opencode/training/` (RAGs globais)
- **Counters** — 16 → 17 agents; 8 → 9 templates? (RAG LGPD conta? sim, vai em `training/`)

### Fixed
- **Catch-22 do path-boundary:** allowlist agora inclui `agents/**`, `training/**`, `templates/**`, `tools/**`, `plugins/**`, `commands/**`, `state-machine.json`, `failure-protocol.json`, `opencode.json`, `install.sh`, `GERAIS.md`, `README.md`, `CHANGELOG.md`, `examples/**`, `harness-allowlist.json` — o harness agora é self-modificável sem desativar o plugin

## [6.1.0] - 2026-06-07

### Added
- **LICENSE** (MIT) — explicit licensing for open source use
- **CHANGELOG.md** — version history (this file)
- **3 plugins in TS** — converted from old hook format to modern opencode plugin API:
  - `path-boundary.ts` — PreToolUse guard for path allowlist
  - `audit-logger.ts` — PostToolUse logger for all tool calls
  - `status-injector.ts` — Compaction hook injecting harness phase status
- **`package.json`** — `@opencode-ai/plugin` dependency for plugin loading
- **`harness-allowlist.json`** — customizable path allowlist for path-boundary
- **CI workflow** — `.github/workflows/ci.yml` validates JSON/YAML/JS on every push

### Changed
- **`default_agent: "orchestrator"`** in opencode.json — orchestrator is now the default
- **Bilingual `GERAIS.md` → monolingual PT-BR** — removed mixed PT/EN paragraphs
- **`install.sh`** now creates `package.json` and `harness-allowlist.json`
- **Sprint 7 fixes** applied: removed fictional `promptFile`, fixed `task: false` semantics, consolidated `tools:` → `permission:`, removed optional chaining `ctx?.cwd`
- **Version**: 6.0.1 → 6.1.0 (feature additions)

### Fixed
- **Opencode schema strict validation** — removed `_type`, `version`, `_comment` extra keys
- **Plugin `worktree="/"` bug** — opencode returns `/` when no git repo, was breaking audit-logger
- **Install script `cp -r src dest` nesting** — added `rm -rf dest` before copy to prevent `dest/src/`

### Documentation
- **Orchestrator fan-out** documented for phase 5 (4 workers in parallel)
- **`install.sh --update` mode** added (preserves customizations)

## [6.0.1] - 2026-06-07

### Fixed
- **`install.sh` nesting bug** — `cp -r src dest` when dest exists created `dest/src/`
- Re-install clean-up: removed nested `agents/agents/`, `commands/commands/`, etc.

## [6.0.0] - 2026-06-06

### Added
- **Initial release** of OpenCode Agents v6 — clean rewrite of v5
- **16 agents** (1 primary + 15 sub) covering 6 phases of the workflow
- **8 templates** (RAG, PROMPT-page, PRD, SPEC, sprint, cross-sprint, e2e-chain)
- **4 custom tools** (harness-init, harness-status, harness-advance, harness-context)
- **3 hooks** (path-boundary, state-machine-guard, audit-logger) — initially in legacy format
- **6 commands** (/harness, /harness-status, /harness-next, /harness-retry, /harness-review, /harness-help)
- **State machine** with 6 phases, typed gates, and 4-class failure protocol
- **Permission model** with 3 defense layers (tool whitelist, path boundary, capability grant)
- **Declarative schemas** for PROMPT.md, RAG, sprint/cycle, e2e chains
- **HTML+JSON embedded** format for PRD and SPEC
- **Bilingual** `GERAIS.md` (PT-BR + EN, env var toggle)
- **Example end-to-end** (`examples/sample-web-app/`) covering all 6 phases
- **Install script** with OS detection, dry-run, uninstall, preserve-config

### Design decisions
- 1 responsibility per agent
- Single source of truth: `state-machine.json` (read-only) + `state.json` (snapshot) + `events.jsonl` (log)
- Defense in depth: 3 layers of permission enforcement
- Lean by default: 50 files in repo (down from 119 in v5)
- RAG in-project, not pre-shipped
- Audit everything: `events.jsonl` + per-session audit logs

### Removed from v5
- 12 Sentry SDK skills (irrelevant to core workflow)
- 5 design-system skills (replaced by RAG docs)
- 11 framework setup skills (replaced by RAG + agent knowledge)
- `harness-model-fallback.ts` (no model pin in v6)
- `harness-error-log.ts` + `harness-knowledge.ts` (replaced by RAG `category: lesson`)
- `harness-list-models.ts` (replaced by `opencode models` built-in)
- Sentry MCP (project-specific, not core)
- 2 plugins (replaced by hooks)
- Awesome-design-md vendored (61 folders, replaced by 1 example)
