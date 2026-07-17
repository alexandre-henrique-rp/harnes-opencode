# Critério de Curadoria do Diretório `skills/`

> **PRD de referência:** `PRD-02-escopo-skills` — v1 (2026-07-17)

---

## 1. O que é uma skill "core do harness"?

Uma skill pertence ao diretório `skills/` **somente se atender a pelo menos um dos critérios abaixo:**

| # | Critério | Exemplos |
|---|----------|---------|
| **A** | É usada ou referenciada explicitamente por um agente do harness (`agents/*.md`) | `stitch-*` usado pelo `designer.md` |
| **B** | Suporta uma fase do workflow (0–5) de forma demonstrável | `golang-testing` para o agente `tester` |
| **C** | É uma habilidade de plataforma/ferramental que o runtime OpenCode expõe e que os agentes precisam | `playwright-runner`, `shell`, `git-rebase` |
| **D** | É uma skill de **meta-harness** (criação, manutenção ou extensão do próprio harness) | `skill-creator`, `writing-agents-md` |

Uma skill **não pertence** ao `skills/` se:
- For de domínio pessoal do autor sem relação com o ciclo de desenvolvimento do harness (ex: `yc-apply`, `kb-yt-channel`, `insta-master`, `yt-master`, `tweetsmash-api`)
- Não tiver referência em nenhum `agents/*.md` e não se encaixar nos critérios A–D acima

---

## 2. Relatório de Auditoria — Skills Categorizadas

> Auditoria realizada em: 2026-07-17  
> Total de skills antes da curadoria: **96**

### ✅ MANTER — Critério A, B, C ou D atendido

| Skill | Critério | Agente/Fase |
|-------|----------|------------|
| `stitch-*` (10 skills) | A | `designer.md` — Fase 3 (Design) |
| `impeccable` | A | `design-reviewer.md` |
| `google-stitch-frontend` | A | `designer.md`, `frontend.md` |
| `agent-browser` | C | Agentes com acesso a browser |
| `agent-exploration` | D | Meta-harness |
| `agent-output-audit` | D | Meta-harness / `audit-logger` |
| `architectural-analysis` | B | `requirements.md` — Fase 2 |
| `context7-mcp` | C | Todos os agentes |
| `deep-review` | B | `prd-reviewer.md`, `spec-reviewer.md` |
| `design-md` | A | `designer.md` — Fase 3 |
| `deslop` | B | `tester.md`, `qa-gate.md` |
| `drizzle-safe-migrations` | B | `backend.md` — Fase 5 |
| `enhance-prompt` | D | Meta-harness |
| `find-docs` | C | Todos os agentes (RAG) |
| `git-rebase` | C | `git-automator`, `git-commit-manager` |
| `golang-*` (6 skills) | B | `backend.md` — Fase 5 |
| `grill-me` | D | Meta-harness (entrevista de briefing) |
| `grill-with-docs` | D | Meta-harness |
| `herdr-orchestration` | B | `orchestrator.md` — Fase 5 |
| `impl-peer-review` | B | `code-reviewer.md` |
| `laravel-*` (6 skills) | B | `backend.md` — Fase 5 |
| `nestjs-*` (3 skills) | B | `backend.md` — Fase 5 |
| `no-workarounds` | D | Meta-harness (princípios) |
| `qa-execution` | A | `tester.md`, `qa-gate.md` — Fase 5 |
| `qa-report` | A | `qa-gate.md` — Fase 5 |
| `react` | B | `frontend.md` — Fase 5 |
| `react-router-v7` | B | `frontend.md` — Fase 5 |
| `react-router-v7-expert` | B | `frontend.md` — Fase 5 |
| `refactoring-analysis` | B | `code-reviewer.md`, `tester.md` |
| `remotion` | B | `frontend.md` (vídeo/animação) |
| `rust-best-practices` | B | `backend.md` — Fase 5 |
| `sentry-*` (10 skills) | B | `backend.md`, `security.md` — Fase 5 |
| `shadcn-ui` | B | `frontend.md`, `designer.md` |
| `shell` | C | Todos os agentes |
| `shellcheck-configuration` | C | Agentes com bash |
| `ship-pr` | C | `git-commit-manager`, `pr-automator` |
| `skill-creator` | D | Meta-harness |
| `spec-peer-review` | A | `spec-reviewer.md` — Fase 2 |
| `tailwindcss` | B | `frontend.md`, `designer.md` |
| `tanstack-*` (7 skills) | B | `frontend.md` — Fase 5 |
| `taste-design` | A | `design-reviewer.md` |
| `tech-logos` | B | `designer.md`, `frontend.md` |
| `testing-boss` | A | `tester.md` — Fase 5 |
| `to-prompt` | D | Meta-harness |
| `typescript-advanced` | B | `backend.md`, `frontend.md` |
| `ui-craft` | A | `designer.md`, `frontend.md` |
| `web-design-guidelines` | A | `designer.md` — Fase 3 |
| `writing-agents-md` | D | Meta-harness |
| `writing-skills` | D | Meta-harness |
| `writing-tech-post` | D | Meta-harness (documentação) |
| `app-renderer-systems` | B | `frontend.md` — Fase 5 |
| `bubbletea` | B | `backend.md` (Go TUI) |
| `storybook-stories` | B | `frontend.md`, `tester.md` |

### 🔄 MOVER — Skill pessoal do autor, preservar em repositório separado

> Destino sugerido: `https://github.com/alexandre-henrique-rp/skills-personal`

| Skill | Justificativa |
|-------|--------------|
| `yc-apply` | Conteúdo de candidatura a Y Combinator — fora do escopo do harness |
| `kb-yt-channel` | Gestão de canal YouTube — fora do escopo |
| `insta-master` | Gestão de Instagram — fora do escopo |
| `yt-master` | Estratégia YouTube — fora do escopo |
| `tweetsmash-api` | Integração Tweetsmash — fora do escopo |

### ⚠️ AVALIAR — Requer decisão do mantenedor

| Skill | Questão pendente |
|-------|-----------------|
| `reverse-shell-techniques` | Pode ser usada pelo `security.md` (pentest/red-team). **Manter apenas se** `agents/security.md` contiver referência explícita a ela. Caso contrário, mover para `skills-personal`. |

---

## 3. Ação Recomendada

```bash
# 1. Criar repositório pessoal de skills (uma vez)
# https://github.com/alexandre-henrique-rp/skills-personal

# 2. Mover skills fora de escopo (não apagar — preservar histórico)
mkdir -p /tmp/skills-to-move
for skill in yc-apply kb-yt-channel insta-master yt-master tweetsmash-api; do
  git mv skills/$skill /tmp/skills-to-move/$skill
done
git commit -m "chore: move skills pessoais para repositório separado (PRD-02)"

# 3. Avaliar reverse-shell-techniques separadamente
# Verificar se agents/security.md referencia essa skill
grep -l "reverse-shell" agents/security.md || echo "Não referenciada — candidata a mover"
```

---

## 4. Checklist para Novas Skills (CONTRIBUTING.md)

Antes de adicionar uma nova skill ao `skills/`, responda:

- [ ] Esta skill é referenciada em algum `agents/*.md`? **(Critério A)**
- [ ] Esta skill suporta diretamente uma das 6 fases do workflow? **(Critério B)**
- [ ] Esta skill é de ferramental de plataforma que os agentes usam? **(Critério C)**
- [ ] Esta skill é de manutenção/extensão do próprio harness? **(Critério D)**

> Se nenhuma caixa marcada, a skill não pertence ao `skills/` core. Considere adicioná-la ao repositório `skills-personal`.

---

## 5. Atualização do `docs/TOOLS_INDEX.md`

Após concluir a curadoria física (mover as skills para o repositório separado), atualizar `docs/TOOLS_INDEX.md` para incluir uma coluna **"Fase/Agente"** mapeando cada skill mantida ao seu agente/fase correspondente.
