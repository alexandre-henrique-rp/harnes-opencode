# OpenCode Agents v6

> Multi-agent development harness for opencode. Declarative, auditable, with hard boundaries.
> Inspired by Akita's vibe-coding methodology (XP: pair programming, TDD, CI, small releases, coding standard).

## O que é

Um sistema de **17 agents** (1 primary + 16 sub) organizados em **6 fases** (briefing → docs → requisitos → design → planejamento → build+quality) para construir software com IA de forma disciplinada. Cada agent tem **1 responsabilidade**. Toda transição passa por um **gate binário**. Toda tool call é **logada**.

**v6.2.0:** novo `lgpd-officer` (DPO/advogada especializada em direito digital) roda ao final de cada sprint como 5º worker do phase 5, auditando conformidade LGPD e propondo mudanças (sem corrigir código). Inclui RAG global da LGPD (Lei 13.709/2018) pré-instalado. 3 novos princípios não-negociáveis: **TDD obrigatório**, **documentação obrigatória** (JSDoc/docstring em toda função pública), **simplicidade** (YAGNI/KISS, código direto).

**vs v5:** -58% de arquivos (50 vs 119), sem model pinado, sem PT-BR hardcoded, sem signals hardcoded duplicados, com permission model de 3 camadas (tool whitelist + path boundary + capability grant).

## Quickstart

```bash
# 1. Copie o harness para ~/.config/opencode/ (Linux/macOS)
cp -r ~/Downloads/Opencode_agents_v6 ~/.config/opencode/

# 2. Em um projeto novo, inicialize o workflow (perfil Strict padrão ou Lean simplificado)
cd /caminho/do/seu/projeto
opencode /harness
# OU para fluxo simplificado e rápido (sem burocracia de revisões):
# opencode /harness-init --project meu-projeto --profile lean

# 3. Veja o estado atual
opencode /harness-status

# 4. Avance pelas fases
opencode /harness-next
```

## Como funciona (1 minuto)

```
[USER] demanda
   ↓
[orchestrator] lê state.json, identifica fase atual, delega pro agent certo
   ↓
[<agent-da-fase>] lê contexto (capability grant + RAG relevante), executa output contract
   ↓
[orchestrator] valida gate (presença + score + coverage), transiciona fase
   ↓
[events.jsonl] log append-only de cada step
   ↓
[audit/<agent>.jsonl] log de cada tool call
```

**Princípios:**

1. **Single responsibility** — cada agent faz 1 coisa
2. **Defense in depth** — 3 camadas de permission
3. **Declarative** — chain de teste é JSON, código é gerado
4. **Lean** — RAG cresce no projeto, não pré-shipado
5. **Audit** — toda tool call é logada

## Estrutura

```
opencode-agents-v6/
├── README.md                      # este arquivo
├── opencode.json                  # config runtime (16 agents, MCPs, permissions)
├── state-machine.json             # contrato: 6 fases, gates, transitions
├── failure-protocol.json          # contrato: 3 classes de falha + 1 fatal
├── GERAIS.md                      # system prompt global (bilíngue PT-BR/EN)
│
├── agents/                        # 16 .md (1 por agent)
│   ├── orchestrator.md            # primary
│   ├── briefing.md
│   ├── documenter.md
│   ├── rag-curator.md
│   ├── requirements.md
│   ├── prd-reviewer.md
│   ├── spec-reviewer.md
│   ├── designer.md
│   ├── design-reviewer.md
│   ├── sprint-tasker.md
│   ├── planning-reviewer.md
│   ├── backend.md
│   ├── frontend.md
│   ├── tester.md
│   ├── security.md
│   └── qa-gate.md
│
├── templates/                     # 7 templates (RAG, PROMPT, PRD, SPEC, sprint, cross-sprint, e2e)
├── hooks/                         # 3 hooks (path-boundary, state-machine-guard, audit-logger)
├── tools/                         # 4 tools TS (init, status, advance, context)
├── commands/                      # 6 commands (/harness, status, next, retry, review, help)
└── examples/sample-web-app/       # 1 projeto end-to-end de referência
```

## Workflow (6 fases, 1 portão binário por fase)

| # | Fase | Owner | Output | Portão |
|---|---|---|---|---|
| 0 | Briefing | `briefing` | `brief.md` | user-approval |
| 1 | Documentação | `documenter` + `rag-curator` | `AGENTS.md` + `RAG/index.json` (≥3 docs) | presence-and-min |
| 2 | Requisitos | `requirements` + `prd-reviewer` + `spec-reviewer` | `PRD.md` + `SPEC.md` | score (PRD≥80, SPEC≥85) |
| 3 | Design | `designer` + `design-reviewer` | `PRODUCT.md` + `<page>.DESIGN.md` + `<page>.PROMPT.md` | score (design≥70) |
| 4 | Planejamento | `sprint-tasker` + `planning-reviewer` | `sprints/*.json` | coverage (100% SPEC) |
| 5 | Build + Quality | orchestrator + `backend`+`frontend`+`tester`+`security`+**`lgpd-officer`**+`qa-gate` | código + testes + audit | all-of (cov≥85, 0 crit/high, review≥70, **LGPD compliant**) |

Security e LGPD Officer rodam **dentro** da fase 5 (fan-out paralelo), não depois.

> [!TIP]
> **Perfil Lean:** Se você deseja um desenvolvimento mais objetivo e rápido (especialmente para projetos pequenos ou protótipos), use o perfil `lean` na inicialização. Ele reduz o fluxo de trabalho para apenas 3 fases (Briefing, Planejamento Simplificado e Build+Quality), desativa os agentes revisores adicionais por padrão e reduz o portão de build para exigir apenas cobertura de testes >= 70% (sem bloqueio por LGPD/Security ou JSDoc).

## Roster (17 agents — v6.2.0+)

```
orchestrator (primary) ─┬─ briefing
                        ├─ documenter ─── rag-curator
                        ├─ requirements ─ prd-reviewer, spec-reviewer
                        ├─ designer ───── design-reviewer
                        ├─ sprint-tasker ─ planning-reviewer
                        └─ (phase 5) ──── backend, frontend, tester, security, lgpd-officer, qa-gate
                                                                          ^^^^^^^^^^^^^^
                                                                          NEW in v6.2.0
                                                                          (DPO/advogada
                                                                           especializada)
```

**Regra universal:** nenhum sub-agent tem tool `task` (só orchestrator delega). Nenhum planning-reviewer/curator tem `edit` em código de feature. Nenhum implementer escreve fora do seu workstream. Nenhum agent de auditoria (security, lgpd-officer) tem `edit` em código de feature.

## Princípios não-negociáveis (v6.2.0+)

Os 5 originais + 3 novos:

1. **Single responsibility** — 1 agent = 1 trabalho
2. **Defense in depth** — 3 camadas de permission
3. **Declarative** — chain de teste é JSON, código é gerado
4. **Lean** — RAG cresce no projeto, não pré-shipado
5. **Audit** — toda tool call é logada
6. **TDD é obrigatório** *(novo em v6.2.0)* — ciclo red-green-refactor; código de feature sem teste falhando antes = violação
7. **Documentação é obrigatória** *(novo em v6.2.0)* — toda função pública tem JSDoc/RDoc/docstring com `@param`, `@returns`, `@throws`
8. **Simplicidade primeiro** *(novo em v6.2.0)* — YAGNI + KISS; abstração só após 3ª repetição; over-engineering é bug

## RAGs globais pré-instalados (v6.2.0+)

O install.sh propaga para `~/.config/opencode/training/` (disponível em **todo projeto** que use o harness):

- `lgpd-brasil.md` — Lei 13.709/2018 completa, Decreto 10.474/2020, Resoluções ANPD vigentes, exemplos de código, antipadrões, jurisprudência, cross-refs. 33KB.

## Failure protocol (resumo)

| Classe | Comportamento |
|---|---|
| `transient` | Auto-retry 3x com backoff [1s, 3s, 9s] |
| `quality` | Rework com `loopbackTo`, 2x antes de escalar |
| `user-action` | Bloqueia, escala para humano |
| `fatal` | Halt, requer fix manual |

Auto-detecção por sintoma (HTTP 5xx = transient, score < threshold = quality, schema corrompido = fatal). Default ambíguo = `user-action`.

## Filosofia

> "AI is your mirror, it reveals faster who you are." — Akita

> "Clean code was never fashion. It became infrastructure." — Akita

> "The agent never says 'no'. That's a bug, not a feature. **You** are the brake." — Akita

O harness v6 é a infraestrutura que permite a um dev solo produzir com IA a qualidade que antes exigia um time. Não é framework opinativo. É **processo explícito + boundaries duros + audit total**.

## Idioma

Default: **PT-BR**. Para EN: `HARNESS_LANG=en opencode`. Por sessão, não por agent.

## Próximos passos

- [ ] Sprint 2: criar os 7 templates (`templates/`)
- [ ] Sprint 3: implementar os agents de planejamento (briefing, documenter, rag-curator, requirements, reviewers)
- [ ] Sprint 4: implementar os agents de design + planning
- [ ] Sprint 5: implementar os agents de build (backend, frontend, tester, security, qa-gate)
- [ ] Sprint 6: criar `examples/sample-web-app/` end-to-end

## Créditos

- **Akita** (akitaonrails) — metodologia vibe coding + XP practices + clean code for AI agents
- **opencode** (sst/opencode) — runtime multi-agent
- **v5** (Opencode_agents_v5) — predecessor direto, manteve o que prestou, reescreveu o que não
creveu o que não
