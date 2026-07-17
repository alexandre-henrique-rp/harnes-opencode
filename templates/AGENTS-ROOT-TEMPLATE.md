# AGENTS.md — {PROJECT_ROOT}

> Mapa de contexto raiz do projeto. Carregado em **toda** request.
> Mantenha curto — link para `AGENTS.md` específicos de cada pasta quando relevante.

## 🎯 Visão geral

{1-2 frases: o que o projeto é, pra quem serve, qual o problema que resolve}

## 🛠️ Stack técnica

| Camada | Tecnologia | Versão | Notas |
|---|---|---|---|
| Framework | {Next.js} | {14.x} | {App Router} |
| Linguagem | {TypeScript} | {5.x} | {strict: true} |
| Styling | {Tailwind CSS} | {3.x} | {com shadcn/ui} |
| Backend | {Node.js + Fastify} | {Node 20, Fastify 4} | {REST + OpenAPI} |
| DB | {PostgreSQL} | {15} | {via Prisma} |
| Auth | {NextAuth} | {4.x} | {OAuth + credentials} |
| Test E2E | {Playwright} | {1.4x} | {via tester agent} |
| Deploy | {Vercel} | — | {preview por PR} |

## 📦 Comandos principais

```bash
# Desenvolvimento
npm run dev              # inicia dev server
npm run build            # build de produção
npm run start            # serve build

# Qualidade
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # testes unit/integration
npm run test:e2e         # Playwright
npm run coverage         # istanbul/c8, target 85%

# Banco
npm run db:migrate       # Prisma migrate
npm run db:seed          # seed dev data
npm run db:studio        # Prisma Studio

# Harness
/harness                 # inicia workflow
/harness-status          # status atual
/harness-refresh-docs    # regerar AGENTS.md
```

## 🗂️ Estrutura de pastas

```
.
├── src/
│   ├── app/                ← Next.js App Router (rotas)
│   ├── components/         ← componentes React (ver AGENTS.md)
│   ├── hooks/              ← custom hooks (ver AGENTS.md)
│   ├── lib/                ← helpers, API client, utils
│   ├── modules/            ← domain modules (auth, billing, etc)
│   └── styles/             ← CSS global
├── tests/                  ← unit/integration (backend)
├── e2e/                    ← Playwright (gerado pelo tester)
├── prisma/                 ← schema + migrations
├── public/                 ← assets estáticos
├── .harness/               ← estado do harness (não commitar)
└── docs/                   ← documentação humana
```

Cada pasta relevante tem seu próprio `AGENTS.md`. Leia o da pasta que
vai editar antes de mexer.

## 🔒 Regras não-negociáveis

- ✅ TypeScript strict mode em tudo
- ✅ ESLint + Prettier sem warnings
- ✅ Cobertura mínima 85% (validado pelo `tester`)
- ✅ Commits em português, formato conventional (`feat:`, `fix:`, `test:`, `refactor:`)
- ✅ PRs pequenos (<400 linhas diff), revisados por humano
- ✅ LGPD: email/CPF/telefone são PII, sempre logados com máscara
- ✅ Sem secrets em código — env vars apenas
- ✅ Sem `any` em TypeScript
- ✅ Sem `console.log` em produção (logger estruturado)

## 🚫 O que NÃO fazer

- ❌ Commitar `.env` ou qualquer secret
- ❌ Editar `node_modules/`, `dist/`, `.next/`
- ❌ Editar `e2e/` ou `qa/` (responsabilidade do `tester`)
- ❌ Criar `AGENTS.md` nesta pasta (já é o raiz; subpastas fazem o seu)
- ❌ Adicionar deps sem aprovação (use grill-me)
- ❌ Hardcode de cores, espaçamentos, fontes (use tokens)
- ❌ Editar arquivos de pasta alheia (ex: frontend editando `src/lib/api/`)

## 🤖 Agents do harness (este projeto)

| Agent | Responsabilidade | Quando rodar |
|---|---|---|
| `briefing` | Briefing inicial do projeto | Sprint 0 |
| `documenter` | Gerar/atualizar AGENTS.md por pasta | Sprint 0 + início de cada sprint |
| `requirements` | PRD e SPEC | Após briefing |
| `designer` | Design system, layouts | Após requisitos |
| `sprint-tasker` | Dividir em sprints JSON | Após design |
| `frontend` | Implementar UI (context-first) | Phase 5 |
| `backend` | Implementar API (TDD) | Phase 5 |
| `tester` | E2E + coverage gate | Phase 5.2 |
| `qa-gate` | Validação final | Phase 5.3 |
| `code-reviewer` | Revisão de código | Phase 5.3 |
| `design-reviewer` | Revisão de design | Phase 5.3 |
| `security` | Auditoria de segurança | Phase 5.3 |
| `lgpd-officer` | Auditoria LGPD | Final de cada sprint |
| `knowledge-curator` | Manter RAG atualizado | Contínuo |
| `rag-curator` | Indexar documentos | Contínuo |
| `documenter` | AGENTS.md per folder | Sprint start |

## 📚 Documentação adicional

- PRD: `docs/PRD.md`
- SPEC: `docs/SPEC.md`
- Design: `docs/DESIGN.md`
- ADRs: `.harness/decisions/`
- Harness overview: `https://github.com/alexandre-henrique-rp/harnes-opencode`

## 🎯 Skills mais usadas

- `grill-me` — antes de qualquer decisão de design não-trivial
- `frontend-context-first` — para tasks de frontend
- `backend-tdd` — para tasks de backend
- `security-audit` — antes de merge
- `lgpd-compliance` — features com PII
- `decision-log` — persistir decisões importantes

---

<!-- Exemplo preenchido abaixo — DELETE este bloco antes de commitar -->

## 📋 Exemplo preenchido (referência, não commitar)

Para um projeto "Sistema de Agendamento Médico":

```markdown
# AGENTS.md — /Users/joao/projetos/sistema-agendamento

> Mapa de contexto raiz do projeto. Carregado em **toda** request.

## 🎯 Visão geral

Sistema de agendamento de consultas médicas para clínicas de pequeno/médio
porte. Substitui planilhas e WhatsApp. Foco em UX simples para atendentes
não-técnicos e LGPD estrito por lidar com dados de saúde (sensível).

## 🛠️ Stack técnica

| Camada | Tecnologia | Versão | Notas |
|---|---|---|---|
| Framework | Next.js | 14.2 | App Router |
| Linguagem | TypeScript | 5.4 | strict: true |
| Styling | Tailwind CSS | 3.4 | + shadcn/ui |
| Backend | Next.js API routes | 14.2 | tRPC, Zod validation |
| DB | PostgreSQL | 15 | Neon (serverless) |
| ORM | Prisma | 5.x | |
| Auth | NextAuth | 4.24 | + credentials provider |
| Test E2E | Playwright | 1.45 | via tester agent |
| Deploy | Vercel | — | preview por PR |

## 📦 Comandos principais

[... como no template ...]

## 🗂️ Estrutura de pastas

[... como no template ...]

## 🔒 Regras não-negociáveis

- ✅ LGPD estrito (dados de saúde são sensíveis)
- ✅ Audit log de todo acesso a dados de paciente
- ✅ Encriptação em repouso para colunas de saúde
- ✅ Anonimização após 5 anos de inatividade
- ✅ DPO humano revisa cada feature com PII

## 🤖 Agents do harness (este projeto)

[... tabela do template, customizada ...]
```
