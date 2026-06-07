# user-register — Design

## Contexto

Acessada quando cliente (P-002) ou lojista (P-001) quer cadastrar um novo cliente na plataforma. Mobile-first, no balcão da loja. Foco em velocidade (< 60s para completar) e autocomplete de endereço via ViaCEP.

## Layout

```
+----------------------------------+
|  Header (logo + nav)             |
+----------------------------------+
|                                  |
|  Cadastro de Cliente             |
|  Preencha em 1 minuto            |
|                                  |
|  [CPF    ###.###.###-##  ]       |
|  [Nome                    ]       |
|  [E-mail                  ]       |
|  [CEP     #####-###       ]       | <- on-blur: ViaCEP
|  [Logradouro              ]       | <- auto-preenchido
|  [Bairro                  ]       | <- auto-preenchido
|  [Cidade           ] [UF  ]       | <- auto-preenchido
|                                  |
|  [ Limpar ]    [ Cadastrar ]     |
|                                  |
+----------------------------------+
```

## Componentes

| Componente | Fonte | Props customizadas |
|---|---|---|
| FormField | shadcn/ui | mask, loading, error, integration |
| Button | shadcn/ui | loading state (spinner quando submitting) |
| Input | shadcn/ui | — |
| MaskedInput | custom | mask pattern (auto-aplica ao digitar) |

## Estados visuais

- **Initial:** form limpo, todos campos vazios
- **Loading (após on-blur do CEP):** spinner inline no campo logradouro
- **CEP não encontrado:** mensagem vermelha inline "CEP não encontrado. Preencha manualmente."
- **CPF inválido:** borda vermelha no campo + mensagem "CPF inválido"
- **Submitting:** botão "Cadastrar" vira "Cadastrando..." com spinner, desabilitado
- **Success:** toast "Cliente cadastrado!" + redirect para `/users/[id]` (futuro S02) ou mensagem de sucesso inline
- **Error:** mensagem vermelha no topo do form, campos preservados

## Responsividade

- **Mobile (< 640px):** form full-width com padding 16px, label acima do campo, campos stacked
- **Tablet (640-1024):** form 80% width centralizado, label inline
- **Desktop (> 1024):** form 60% width (max 600px) centralizado

## Acessibilidade

- Todos os campos têm `<label htmlFor="...">` associado
- Erros via `aria-invalid` + `aria-describedby` apontando para mensagem
- Loading state via `aria-busy`
- Navegação por Tab: cpf → nome → email → cep → (logradouro, readonly após fill) → bairro (readonly) → cidade (readonly) → uf (readonly) → submit
- Contraste mínimo AA (verificar com axe)
- Mensagens de erro com `role="alert"` para screen readers
