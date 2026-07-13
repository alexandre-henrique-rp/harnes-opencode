---
page: <NomePage>
route: /<caminho>
module: <NomeModulo>
parentPage: <paginaPai>          # ou null
sprint: NN                        # número da sprint (preenchido na fase 4)
specRefs: [<id-do-item-no-SPEC.md>]    # ex: ["US-001", "EP-005"]
designRef: <page>.DESIGN.md       # arquivo de design associado
backendContracts: [<endpoint-method-path>]  # ex: ["POST /api/v1/users"]
createdAt: <ISO8601>
updatedAt: <ISO8601>
---

# <NomePage> — Build Prompt

> **Este arquivo é o "build prompt" definitivo para esta página.** O `frontend` agent lê este doc para implementar a página inteira, sem ambiguidade.

## 1. Objetivo

<1 parágrafo: o que essa página faz, em linguagem de produto>

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
    source: user-input          # user-input | api | computed | static
    validation:
      - rule: cpf-valido
        message: "CPF inválido"
        ref: RAG/patterns/cpf-validation.md
    integration:
      api: null                 # ex: viacep
      trigger: null             # on-blur | on-change | on-submit
      fills: []                 # lista de field names a serem preenchidos
      errorMessage: null

  - name: cep
    label: "CEP"
    type: string
    inputType: text
    mask: "#####-###"
    placeholder: "00000-000"
    required: true
    source: user-input
    validation:
      - rule: not-empty
        message: "CEP obrigatório"
      - rule: cep-format
        message: "Formato: 00000-000"
    integration:
      api: viacep
      trigger: on-blur
      fills: [logradouro, bairro, cidade, uf]
      errorMessage: "CEP não encontrado"

  - name: email
    label: "E-mail"
    type: string
    inputType: email
    required: true
    source: user-input
    validation:
      - rule: email-format
        message: "E-mail inválido"
```

## 3. Action Functions

```yaml
actions:
  - name: submit
    label: "Salvar"
    trigger: button-click
    method: POST                 # POST | PUT | PATCH | DELETE
    endpoint: /api/v1/<recurso>
    payload: [cpf, nome, email, cep]   # field names a serem enviados
    successRedirect: <rota>      # ex: /users/:id
    errorDisplay: inline         # inline | toast | modal
    loadingState: "Salvando..."
    successMessage: "Usuário criado com sucesso"

  - name: clean
    label: "Limpar"
    trigger: button-click
    behavior: reset-all-fields   # reset-all-fields | reset-some
    fields: []                  # se reset-some, quais
    confirmation: false

  - name: copy
    label: "Copiar chave"
    trigger: icon-click
    behavior: clipboard-write
    targetField: <field-name>    # ex: cpf
    feedback: toast              # toast | inline | none
    feedbackMessage: "Copiado!"

  - name: delete
    label: "Excluir"
    trigger: button-click
    method: DELETE
    endpoint: /api/v1/<recurso>/:id
    confirmation: required
    confirmationText: "Tem certeza que deseja excluir?"
    successRedirect: <rota-listagem>
```

## 4. API Integrations

```yaml
integrations:
  - name: viacep
    baseUrl: https://viacep.com.br/ws
    auth: none                  # none | api-key | oauth
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
        message: "CEP não encontrado"
      timeout:
        action: show-inline
        message: "Serviço indisponível, preencha manualmente"
      networkError:
        action: show-inline
        message: "Sem conexão, preencha manualmente"
    rateLimit:
      strategy: debounce         # debounce | throttle | none
      delayMs: 500
```

## 5. Estados da UI

```yaml
states:
  initial:
    description: "Página carregou, sem dados"
    render: "form limpo"

  loading:
    description: "Carregando dados iniciais (edição)"
    render: "skeleton com 3 linhas"

  empty:
    description: "Lista vazia (se for página de listagem)"
    render: "Nenhum registro encontrado"

  error:
    description: "Erro ao carregar/enviar"
    render: "mensagem inline + retry button"

  success:
    description: "Operação concluída com sucesso"
    render: "redirect ou toast"

  submitting:
    description: "Form sendo enviado"
    render: "botão disabled com spinner"
```

## 6. Acceptance Criteria

- [ ] Todos os campos com `mask` aplicam máscara ao digitar
- [ ] Integração ViaCEP dispara no `on-blur` do campo `cep`
- [ ] Preenchimento automático: logradouro, bairro, cidade, uf populados a partir do ViaCEP
- [ ] Validação client-side bloqueia submit se `cpf` inválido
- [ ] Submit chama `POST /api/v1/users` com payload exato
- [ ] `copy` copia valor de `<field>` pro clipboard com toast de feedback
- [ ] Testes cobrem: render, validação, integração, submit, copy, error states
- [ ] Página é responsiva (mobile-first) e não há text overflow em containers
- [ ] Acessibilidade: labels associados, aria-*, navegação por teclado e contraste de cores ≥ 4.5:1 (Impeccable a11y)
- [ ] Suporte a acessibilidade de movimento: animações e transições curtas (150-250ms) e respeito estrito a `@media (prefers-reduced-motion: reduce)`
- [ ] Ausência de Bans Absolutos do Impeccable (sem textos com gradiente, sem listras laterais em cartões >1px, sem kickers repetidos, z-indexes lógicos)

## 7. Cross-Module Hints

Liste aqui conexões com outras páginas/módulos. O `tester` agent usa isso pra montar e2e chains cross-module.

```yaml
crossModuleHints:
  - hint: "Esta página consome <imagem> retornada pelo POST /api/v1/users (upload)"
    page: user-avatar-upload.PROMPT.md
    dataFlow: "POST /users → response.avatarUrl → preview aqui"

  - hint: "Esta página chama GET /api/v1/users/:id para hidratação inicial"
    ref: RAG/schemas/user.yaml
    dataFlow: "GET /users/:id → render do form pré-preenchido"
```

## 8. Notas de implementação

- Componentes reutilizáveis usados: `<FormField>`, `<Button>`, `<Toast>`, `<MaskedInput>`
- Stack esperado: ver `AGENTS.md` (React/Next/Vue/etc.)
- Bibliotecas externas: ver `package.json` (zod, react-hook-form, etc.)
- Padrão de estado: ver RAG `pattern: <state-management>`

---

## Validação

O `frontend` agent considera esta página **pronta para implementar** quando:
- ✅ YAML frontmatter completo
- ✅ Field schema tem todos os campos (sem ambiguidade)
- ✅ Action functions cobrem todos os botões
- ✅ API integrations especificadas (mesmo que seja null)
- ✅ Estados da UI definidos
- ✅ Acceptance criteria em formato testável (checkboxes)
- ✅ Cross-module hints documentados (se aplicável)
- ✅ 3000 char limit respeitado por seção

Caso contrário, marca como `status: draft` e pede revisão ao `designer`.
