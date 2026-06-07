# PRODUCT — sample-web-app

> Visão de produto global. Referência de alto nível pra cada página.

## Personas (link para PRD)

- **P-001 Dona Maria (lojista):** administra cadastro de clientes. Mobile-first, no balcão da loja. (PRD §3)
- **P-002 Cliente final:** quer se cadastrar rápido pra usar a plataforma. (PRD §3)

## Páginas

| Rota | Componente | DESIGN | PROMPT | Sprint |
|---|---|---|---|---|
| `/` | Home | — | — | S01 |
| `/register` | UserRegister | [design/user-register.DESIGN.md](user-register.DESIGN.md) | [design/user-register.PROMPT.md](user-register.PROMPT.md) | S01 |
| `/users/[id]` | UserDetail | (futuro) | (futuro) | S02 |
| `/users` | UserList | (futuro) | (futuro) | S02 |

## Fluxos críticos

1. **Cadastro de cliente (S01):** `/register` → POST `/api/users` → redirect `/users/[id]`
2. **Validação de CEP (S01):** usuário digita CEP no `/register` → frontend chama ViaCEP → preenche logradouro/bairro/cidade/UF
3. **Busca por CPF (S02):** lojista digita CPF → GET `/api/users?cpf=...` → resultado ou 404
4. **Exclusão LGPD (S02):** cliente pede exclusão → DELETE `/api/users/:id` → soft delete + audit log

## Convenções visuais

- **Tipografia:** Inter (sans-serif)
- **Paleta:** Primary `#0066CC`, Secondary `#FF6B35`, Background `#F5F5F5`, Text `#222`
- **Espaçamento:** grid 4px (escala 0.25, 0.5, 1, 1.5, 2, 3 rem)
- **Componentes base:** shadcn/ui (Button, Input, Form, Toast, Dialog)
- **Ícones:** lucide-react
- **Responsivo:** mobile-first (breakpoints sm 640, md 768, lg 1024, xl 1280)
