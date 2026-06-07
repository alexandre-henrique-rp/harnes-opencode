---
page: user-register
route: /register
module: user
parentPage: null
sprint: S01
specRefs: ["US-001", "US-002", "EP-001"]
designRef: user-register.DESIGN.md
backendContracts: ["POST /api/users"]
createdAt: 2026-06-06T00:00:00Z
updatedAt: 2026-06-06T00:00:00Z
---

# user-register — Build Prompt

## 1. Objetivo

Form de cadastro de cliente (P-002) com autocomplete de endereço via ViaCEP. Foco em velocidade (< 60s para completar) e validação em tempo real (CPF no client-side, CEP via API pública, validação final no backend).

## 2. Field Schema

```yaml
fields:
  - name: cpf
    label: "CPF"
    type: string
    inputType: text
    mask: "###.###.###-##"
    placeholder: "000.000.000-00"
    required: true
    source: user-input
    validation:
      - rule: cpf-valido
        message: "CPF inválido"
        ref: RAG/cpf-encryption.md
    integration:
      api: null

  - name: nome
    label: "Nome completo"
    type: string
    inputType: text
    required: true
    source: user-input
    validation:
      - rule: min-length
        value: 3
        message: "Nome deve ter pelo menos 3 caracteres"
      - rule: max-length
        value: 100
        message: "Nome deve ter no máximo 100 caracteres"

  - name: email
    label: "E-mail"
    type: string
    inputType: email
    required: true
    source: user-input
    validation:
      - rule: email-format
        message: "E-mail inválido"

  - name: cep
    label: "CEP"
    type: string
    inputType: text
    mask: "#####-###"
    placeholder: "00000-000"
    required: true
    source: user-input
    validation:
      - rule: cep-format
        message: "Formato: 00000-000"
    integration:
      api: viacep
      trigger: on-blur
      debounce: 500
      fills: [logradouro, bairro, cidade, uf]
      errorMessage: "CEP não encontrado"
      ref: RAG/viacep-integration.md

  - name: logradouro
    label: "Logradouro"
    type: string
    inputType: text
    required: true
    source: api-viacep
    readonly: true
    validation:
      - rule: not-empty

  - name: bairro
    label: "Bairro"
    type: string
    inputType: text
    required: true
    source: api-viacep
    readonly: true
    validation:
      - rule: not-empty

  - name: cidade
    label: "Cidade"
    type: string
    inputType: text
    required: true
    source: api-viacep
    readonly: true
    validation:
      - rule: not-empty

  - name: uf
    label: "UF"
    type: string
    inputType: text
    maxLength: 2
    required: true
    source: api-viacep
    readonly: true
    validation:
      - rule: not-empty
```

## 3. Action Functions

```yaml
actions:
  - name: submit
    label: "Cadastrar"
    trigger: button-click
    method: POST
    endpoint: /api/users
    payload: [cpf, nome, email, cep, logradouro, bairro, cidade, uf]
    successRedirect: "/users/{response.id}"
    successMessage: "Cliente cadastrado com sucesso!"
    errorDisplay: inline
    loadingState: "Cadastrando..."

  - name: clean
    label: "Limpar"
    trigger: button-click
    behavior: reset-all-fields
    confirmation: false
```

## 4. API Integrations

```yaml
integrations:
  - name: viacep
    baseUrl: https://viacep.com.br/ws
    auth: none
    endpoints:
      - path: /{cep}/json/
        method: GET
        inputField: cep
        outputMapping:
          logradouro: logradouro
          bairro: bairro
          cidade: localidade
          uf: uf
    errorHandling:
      notFound:
        action: show-inline
        message: "CEP não encontrado. Preencha manualmente."
      timeout:
        action: show-inline
        message: "Serviço indisponível. Preencha manualmente."
        timeoutMs: 5000
      networkError:
        action: show-inline
        message: "Sem conexão. Preencha manualmente."
    rateLimit:
      strategy: debounce
      delayMs: 500
    ref: RAG/viacep-integration.md
```

## 5. Estados da UI

```yaml
states:
  initial:
    description: "Form carregou, vazio"
    render: "todos campos vazios exceto labels"

  cep_loading:
    description: "Aguardando ViaCEP após on-blur"
    render: "spinner inline no campo logradouro, campos readonly"

  cep_error:
    description: "ViaCEP retornou erro ou CEP inválido"
    render: "mensagem inline 'CEP não encontrado', campos viram editáveis"

  cpf_invalid:
    description: "CPF não passou validação client-side"
    render: "borda vermelha no campo cpf + mensagem"

  submitting:
    description: "Form sendo enviado"
    render: "botão disabled 'Cadastrando...' com spinner"

  success:
    description: "User criado com sucesso"
    render: "toast 'Cliente cadastrado!' + redirect /users/{id}"

  error:
    description: "Backend rejeitou (401, 409, 422)"
    render: "mensagem vermelha no topo, campos preservados"
```

## 6. Acceptance Criteria

- [ ] Campo CPF aplica máscara `###.###.###-##` ao digitar
- [ ] Campo CEP aplica máscara `#####-###` ao digitar
- [ ] Ao perder foco do CEP, chama ViaCEP após 500ms de debounce
- [ ] Se ViaCEP retorna sucesso, preenche logradouro, bairro, cidade, UF (campos viram readonly)
- [ ] Se ViaCEP retorna `erro: true`, mostra "CEP não encontrado" e campos ficam editáveis
- [ ] Se ViaCEP timeout (>5s), mostra "Serviço indisponível" e campos ficam editáveis
- [ ] Validação client-side bloqueia submit se CPF inválido
- [ ] Validação client-side bloqueia submit se qualquer campo required vazio
- [ ] Submit chama POST /api/users com payload exato
- [ ] Em sucesso (201), redireciona para /users/{id} e mostra toast
- [ ] Em erro (409, CPF duplicado), mostra mensagem inline
- [ ] Em erro (422, validação), mostra erros inline por campo
- [ ] Botão "Limpar" reseta todos os campos
- [ ] Form é mobile-first (full-width em <640px)
- [ ] Acessibilidade: labels, aria-invalid, aria-describedby, navegação por Tab
- [ ] Testes cobrem: render, validação, integração ViaCEP, submit, error states

## 7. Cross-Module Hints

```yaml
crossModuleHints:
  - hint: "Esta página consome o id retornado pelo POST /api/users"
    ref: "user.id (futuro: orders.userId no módulo order, sprint futura)"
    dataFlow: "response.id → redirect /users/{id}"
```

## 8. Notas de implementação

- Componentes: `FormField` (shadcn/ui), `Button` (shadcn/ui), `MaskedInput` (custom, suporta mask via `useMask` hook)
- Validação client-side: Zod (mesmo schema do backend, importado de `src/validation/userSchemas.ts`)
- Stack: ver `AGENTS.md` (Next.js 14 + TypeScript + Zod)
- Padrão de estado: React Hook Form + Zod (RAG `pattern: react-form-best-practices` a criar em S02)
- **Importante:** Após ViaCEP preencher logradouro/bairro/cidade/UF, esses campos ficam `readonly`. Se ViaCEP falhou, ficam editáveis para o usuário preencher manualmente.
