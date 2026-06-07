---
description: Cheatsheet completo do Harness v6
agent: orchestrator
---
# Harness v6 — Cheatsheet

## Quickstart
```bash
# 1. Copie o harness para ~/.config/opencode/
cp -r ~/Downloads/Opencode_agents_v6 ~/.config/opencode/

# 2. No projeto novo, inicie
cd /seu/projeto
opencode /harness

# 3. Comandos úteis
opencode /harness-status    # ver estado
opencode /harness-next      # avançar fase
opencode /harness-retry     # retry fase falhada
opencode /harness-review prd   # rodar reviewer de PRD
opencode /harness-help      # este cheatsheet
```

## Workflow (6 fases)

| # | Fase | Owner | Quando você me chama assim | Output esperado |
|---|---|---|---|---|
| 0 | Briefing | `briefing` | "começar projeto", "brief", "ideia" | `brief.md` |
| 1 | Documentação | `documenter` | "documentar", "criar AGENTS.md" | `AGENTS.md` + `ARCH.md` + `RAG/index.json` |
| 2 | Requisitos | `requirements` | "PRD", "SPEC", "requisitos" | `PRD.html` + `SPEC.html` |
| 3 | Design | `designer` | "design", "PROMPT", "tela" | `PRODUCT.md` + `design/*.md` |
| 4 | Planejamento | `sprint-tasker` | "planejar sprint", "tasks" | `sprints/*.json` |
| 5 | Build + Quality | orchestrator coordena | "implementar", "build", "code" | código + testes + audit |

## Roster (16 agents)

- **orchestrator** (você) — brain, nunca escreve conteúdo
- **briefing** — fase 0
- **documenter** + **rag-curator** — fase 1
- **requirements** + **prd-reviewer** + **spec-reviewer** — fase 2
- **designer** + **design-reviewer** — fase 3
- **sprint-tasker** + **reviewer** — fase 4
- **backend** + **frontend** + **tester** + **security** + **qa-gate** — fase 5

## Comandos slash

| Comando | Função |
|---|---|
| `/harness` | Iniciar ou continuar |
| `/harness-status` | Mostrar estado |
| `/harness-next` | Avançar (valida gate) |
| `/harness-retry` | Re-executar fase |
| `/harness-review <tipo>` | Rodar reviewer (prd/spec/design/qa) |
| `/harness-help` | Este cheatsheet |

## Tools do orchestrator

| Tool | Quando usar |
|---|---|
| `harness_init` | Primeira vez no projeto (cria `.harness/`) |
| `harness_status` | Antes de qualquer decisão (saber fase) |
| `harness_advance` | Quando sub-agent retornou (validar gate) |
| `harness_context` | Antes de delegar (montar capability grant) |

## Failure classes (resumo)

| Classe | O que faço |
|---|---|
| `transient` | Retry automático (3x com backoff) |
| `quality` | Rework com `loopbackTo`, 2x antes de escalar |
| `user-action` | `question` ao humano com opções |
| `fatal` | Parar, pedir fix manual |

## Permission model (defense in depth)

1. **Tool whitelist** em `opencode.json` por agent
2. **Path boundary** em `.harness/agent-boundaries.json` (gerado pelo init)
3. **Capability grant** declarado na task description
4. **Audit log** em `.harness/audit/<agent>.jsonl`

## Onde está cada coisa

| Onde | O quê |
|---|---|
| `.harness/state-machine.json` | Contrato (read-only) |
| `.harness/state.json` | Snapshot atual (só orchestrator edita) |
| `.harness/events.jsonl` | Auditoria append-only |
| `.harness/audit/<agent>.jsonl` | Log de tool calls |
| `.harness/agent-boundaries.json` | Allowlist/denylist por agent |
| `.harness/RAG/` | RAG docs do projeto (criado pelo rag-curator) |
| `brief.md` | Output fase 0 |
| `AGENTS.md` | Output fase 1 (contexto longo prazo) |
| `PRD.html` + `SPEC.html` | Output fase 2 |
| `design/` | Output fase 3 (PRODUCT + DESIGN + PROMPT por página) |
| `sprints/` | Output fase 4 |
| `qa/<sprint>/` | Output fase 5 (e2e chains + reports) |

## Idioma

Default: PT-BR. Para EN: `HARNESS_LANG=en opencode`

## Filosofia

> "AI is your mirror, it reveals faster who you are." — Akita
> "Clean code was never fashion. It became infrastructure." — Akita
> "The agent never says 'no'. You are the brake." — Akita

Argumentos: $ARGUMENTS (ignore, sempre mostra o cheatsheet)
