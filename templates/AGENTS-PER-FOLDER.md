# AGENTS.md — {FOLDER_PATH}

> Mapa de contexto carregado automaticamente quando o agente acessa arquivos desta pasta.
> Gerado por `documenter` em {DATE}. Última atualização: {DATE}.

## 📁 Inventário de arquivos

| Arquivo | Descrição (1 linha) | Owner |
|---|---|---|
| `{file1}` | {descrição concreta, substantivo + verbo} | {frontend\|backend\|tester\|documenter} |
| `{file2}` | {descrição} | {owner} |
| `{file3}` | {descrição} | {owner} |

## ⚠️ Convenções locais

- {convenção específica desta pasta}
- {padrão de naming usado aqui}
- {restrição local — ex: "nunca use X aqui"}
- {dependência crítica — ex: "sempre passe Y como prop"}

## 🔗 Conexões externas

- **Importa de:** `{path1}`, `{path2}`
- **Importado por:** `{path3}`, `{path4}`
- **Dependências npm:** `{lib1}`, `{lib2}`

## 🎯 Skills relacionadas

- `{skill-name}` — {por que se aplica aqui}
- `{skill-name}` — {por que}

---

<!-- Exemplo preenchido abaixo — DELETE este bloco antes de commitar -->

## 📋 Exemplo preenchido (referência, não commitar)

Para uma pasta `src/components/auth/`:

```markdown
# AGENTS.md — src/components/auth/

> Mapa de contexto carregado automaticamente quando o agente acessa arquivos desta pasta.
> Gerado por `documenter` em 2026-07-17. Última atualização: 2026-07-17.

## 📁 Inventário de arquivos

| Arquivo | Descrição (1 linha) | Owner |
|---|---|---|
| `AuthModal.tsx` | Modal de autenticação com tabs login/signup/forgot | frontend |
| `AuthProvider.tsx` | Context provider que envolve a app e expõe useAuth() | frontend |
| `LoginForm.tsx` | Formulário de login com validação Zod e react-hook-form | frontend |
| `SignupForm.tsx` | Formulário de cadastro com validação de senha forte | frontend |
| `ForgotPasswordForm.tsx` | Formulário de recuperação de senha via email | frontend |
| `SocialAuthButtons.tsx` | Botões de login social (Google, GitHub) via NextAuth | frontend |
| `index.ts` | Barrel export de todos os componentes e o AuthProvider | frontend |

## ⚠️ Convenções locais

- Todos os forms aqui usam **react-hook-form + Zod** (não Formik, não Yup)
- Validação de senha: mínimo 8 chars, 1 maiúscula, 1 número, 1 símbolo
- Mensagens de erro vêm do schema Zod, **nunca hardcoded em JSX**
- Componentes são **client components** (`"use client"` no topo) — usam hooks
- Estado global: **NÃO** usar — sempre local ao componente ou via `useAuth()`
- Componentes NÃO devem importar de `src/components/ui/` (UI primitives) diretamente;
  usar a abstração de `src/components/auth/` para não vazar pattern

## 🔗 Conexões externas

- **Importa de:**
  - `src/components/ui/Modal.tsx` (modal base)
  - `src/lib/design/tokens.ts` (cores, espaçamento)
  - `src/hooks/useAuth.ts` (auth hook global)
  - `next-auth/react` (signIn, signOut)
- **Importado por:**
  - `src/app/(public)/layout.tsx` (envolve a área pública)
  - `src/app/(auth)/login/page.tsx` (página de login)
  - `src/app/(auth)/signup/page.tsx` (página de cadastro)
- **Dependências npm:** `react-hook-form`, `zod`, `@hookform/resolvers`, `next-auth`

## 🎯 Skills relacionadas

- `frontend-context-first` — sempre que editar nesta pasta
- `frontend-style-guide` — para tokens visuais e padrões de form
- `grill-me` — para decisões de UX (ex: "manter sessão após fechar modal?")
- `lgpd-compliance` — o email é PII; logar com máscara
```
