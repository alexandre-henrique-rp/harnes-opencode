---
name: docs-curator
description: Standard for generating AGENTS.md per folder. Used by the documenter agent and any agent that needs to bootstrap a new module.
---

# AGENTS.md Per-Folder Standard (v6.5.0)

## Purpose

Define the structure, content, and quality bar for `AGENTS.md` files
that the `documenter` agent generates (or that any agent creates when
bootstrapping a new module).

`AGENTS.md` is **scoped context**: when an agent accesses files in a
folder, the OpenCode runtime dynamically loads that folder's
`AGENTS.md` and merges it with the parent chain. This is the
"progressive disclosure" mechanism that keeps context windows small.

## When to generate

Generate (or regenerate) `AGENTS.md` when:

- ✅ New folder created in `src/`, `app/`, `lib/`, `components/`, `features/`, `modules/`
- ✅ Folder content changed >30% since last `AGENTS.md`
- ✅ New project bootstrap (Phase 1)
- ✅ Sprint kickoff (incremental refresh)
- ✅ User explicitly requests via `harness_refresh_docs` or `/harness-refresh`

Do NOT generate for:

- ❌ `node_modules/`, `dist/`, `build/`, `.next/`, `out/`, `coverage/`
- ❌ Auto-generated folders (look for `@generated` in file headers)
- ❌ Vendor / third-party code
- ❌ Folders that already have a current `AGENTS.md` AND content didn't change
- ❌ Asset folders (`public/`, `static/`, `assets/`) unless they contain logic

## Structure (mandatory sections)

Every `AGENTS.md` MUST have these 4 sections, in this order:

```markdown
# AGENTS.md — <folder-path>

> Mapa de contexto carregado automaticamente quando o agente acessa arquivos desta pasta.

## 📁 Inventário de arquivos

| Arquivo | Descrição (1 linha) | Owner |
|---|---|---|
| `Button.tsx` | Botão base com variantes primary/secondary/ghost | frontend |
| `useAuth.ts` | Hook de autenticação com refresh token | frontend |
| `auth.test.ts` | Testes unitários do hook useAuth (NÃO regenerar) | tester |
| `index.ts` | Barrel export dos componentes da pasta | frontend |

## ⚠️ Convenções locais

- <convenção específica desta pasta>
- <padrão de naming>
- <restrição local>

## 🔗 Conexões externas

- **Importa de:** `src/lib/api/`, `src/lib/design/`
- **Importado por:** `src/app/(auth)/`, `src/features/checkout/`
- **Dependências críticas:** `react-hook-form`, `zod`

## 🎯 Skills relacionadas

- `frontend-context-first` — sempre que editar nesta pasta
- `frontend-style-guide` — para tokens visuais
```

Optional sections (add if relevant):

- `## 🎨 Design system (se aplicável)` — tokens, ícones, padrões visuais
- `## 🧪 Testes` — se a pasta tem test files, explicar convenção
- `## 📦 Dependências` — libs específicas desta pasta
- `## 🚧 TODO / Known issues` — débitos técnicos da pasta

## Size budget

| Folder size | AGENTS.md max length |
|---|---|
| 1-5 files | 30 lines |
| 5-20 files | 80 lines |
| 20+ files | Split: `AGENTS.md` (overview, 60 lines) + `AGENTS-detail.md` (deep) |

## Quality bar (one-liner descriptions)

Each row in the inventory MUST have a meaningful 1-line description.

✅ Good:
- `useAuth.ts` — Hook de autenticação com refresh token e retry automático
- `Button.tsx` — Botão base com variantes primary/secondary/ghost e loading state
- `validate.ts` — Helpers de validação (Zod schemas) para formulários

❌ Bad:
- `useAuth.ts` — Auth stuff
- `Button.tsx` — Component
- `validate.ts` — Validation helpers for various things in the app

Heuristic: a description is good if a new agent can decide "should I
read this file?" from the description alone.

## Owner column

The owner column tells future agents **who is allowed to edit this file**:

| File pattern | Owner |
|---|---|
| `*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.css`, `*.scss` | `frontend` |
| `*.ts`/`*.js` in `api/`, `server/`, `routes/`, `services/`, `prisma/`, `migrations/` | `backend` |
| `*.test.*`, `*.spec.*` | `tester` |
| `*.stories.*` | `frontend` |
| `AGENTS.md` itself | `documenter` |
| `.harness/**` | `orchestrator` |
| Other | `general` |

## Incremental updates

Before regenerating an existing `AGENTS.md`:

1. Calculate the folder's current hash (sum of mtimes)
2. Compare with hash stored in `.harness/.agmd-hashes.json`
3. If unchanged: **SKIP** (no work)
4. If changed: regenerate only the affected sections

```bash
# Pseudo-code
hash = sha256(sum(mtime(file) for file in folder_files))
if hash == stored_hash_for(folder):
    return  # no change
# else: regenerate and update stored hash
```

## Anti-patterns

- ❌ Copy-pasting the same content from parent `AGENTS.md`
- ❌ Including code snippets (link to files instead)
- ❌ Listing every file in an auto-generated folder
- ❌ Vague 1-line descriptions ("component", "helper", "utils")
- ❌ Missing the owner column
- ❌ Inventing sections not in the standard
- ❌ Regenerating unchanged folders (git noise)
- ❌ Forgetting to update `.harness/RAG/index.json`

## Verification

After generating, the `documenter` agent MUST verify:

```bash
# 1. File parses as valid markdown
# 2. Has the 4 mandatory sections
# 3. Inventory has at least 1 row
# 4. Owner column is filled for every row
# 5. No "TODO" placeholders left
```

If any check fails, fix and re-validate.
