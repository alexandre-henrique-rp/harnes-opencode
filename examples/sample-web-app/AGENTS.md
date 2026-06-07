# AGENTS — sample-web-app

> Memória de longo prazo do projeto. Lido pelo agent no início de cada task.
> Última atualização: 2026-06-06

## Visão geral

Sistema de cadastro de cliente para pequenos comércios brasileiros. Foco em **velocidade** (< 60s) e **LGPD compliance**. Substitui planilhas + formulários web lentos por um wizard mobile-first que valida CEP automaticamente via ViaCEP.

**Status atual:** MVP em desenvolvimento, fase 5 (build) em S01.

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Linguagem | TypeScript | 5.4 |
| Framework frontend | Next.js | 14.2 |
| Framework backend | Next.js API Routes | 14.2 |
| Banco | Postgres (Supabase) | 16 |
| ORM | Prisma | 5.18 |
| Validação | Zod | 3.23 |
| Testes unit | Vitest | 1.6 |
| Testes e2e | Playwright | 1.45 |
| Lint | ESLint | 8.57 |
| Typecheck | TypeScript | 5.4 |
| Deploy | Vercel | — |
| LGPD audit | manual + semgrep | — |

## Estrutura de pastas

```
src/
  pages/                    # Next.js pages router
    api/                    # API routes (backend)
      users/
        index.ts            # POST /api/users
        [id].ts             # GET/PUT/DELETE /api/users/:id
        [id]/
          avatar.ts         # POST /api/users/:id/avatar
    index.tsx               # Home
    register.tsx            # Cadastro de cliente
    users/
      [id].tsx              # Detalhe do cliente
  components/               # Componentes React compartilhados
    FormField.tsx
    MaskedInput.tsx
    Button.tsx
  services/                 # Lógica de negócio
    userCreator.ts
    userQuery.ts
  lib/                      # Helpers
    prisma.ts
    cpfValidator.ts
    cepValidator.ts
  validation/               # Schemas Zod
    userSchemas.ts
prisma/
  schema.prisma
  migrations/
test/
  unit/                     # Vitest
  integration/              # supertest
e2e/                        # Playwright
docs/
RAG/                        # Conhecimento de longo prazo
sprints/                    # Planning
```

## Comandos essenciais

| Comando | Função |
|---|---|
| `npm run dev` | Inicia dev server (Next.js) |
| `npm test` | Roda Vitest |
| `npm run test:integration` | Roda supertest |
| `npm run test:e2e` | Roda Playwright |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run coverage` | Vitest + c8/v8 |
| `npm run audit` | `npm audit` + `semgrep` |
| `npx prisma migrate dev` | Aplica migrations em dev |
| `npx prisma studio` | GUI do banco |

## Convenções

- **Linguagem:** código em inglês (variáveis, funções, comentários), mensagens de UI em PT-BR
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`)
- **Branches:** `main`, `feat/<slug>`, `fix/<slug>`, `chore/<slug>`
- **PRs:** pequenos (≤ 400 linhas diff), com testes, com descrição em markdown
- **Naming:** kebab-case para arquivos, PascalCase para componentes, camelCase para vars
- **Schemas Zod:** 1 por entidade em `src/validation/`

## Compliance

- **LGPD:** SIM (coletamos CPF, nome, endereço)
  - Art. 7º — base legal: execução de contrato
  - Art. 18 — direito de exclusão: endpoint DELETE
  - Art. 46 — segurança: AES-256 em CPF, TLS 1.3 em trânsito
- **GDPR:** NÃO aplicável (empresa BR-only)
- **Outros:** nenhum

## RAG references

- Padrões críticos: `RAG/` (criado por `rag-curator`)
- Leis: `RAG/lgpd-consentimento.md`, `RAG/lgpd-data-retention.md`
- Segurança: `RAG/cpf-encryption.md`, `RAG/api-security.md`
- Decisões: `RAG/decision-why-nextjs.md`, `RAG/decision-why-prisma.md`

## Última atualização

- Data: 2026-06-06
- Por: documenter agent
- Próxima revisão: a cada sprint (S02, S03, ...)
