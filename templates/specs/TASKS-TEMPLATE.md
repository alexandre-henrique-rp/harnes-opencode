---
feature: "{{FEATURE_SLUG}}"
status: "planned"
created_at: "{{DATE}}"
---

# Planejamento de Sprints & Tasks com Spec — {{FEATURE_TITLE}}

> **Regras do Modelo v7:**
> 1. **Cada Task possui sua própria Spec (`Spec da Task`)** com o contrato técnico exato para que `backend` e `frontend` codifiquem diretamente com contexto mínimo.
> 2. **`backend` e `frontend` escrevem apenas código** (não escrevem testes por task).
> 3. **`qa-tester` atua por Sprint**, criando e executando testes focados em validar se as Regras de Negócio (`BR-XX`) e Critérios de Aceite (`AC-XX`) da Sprint estão funcionando, evitando testes desnecessários.

---

## Sprint S01: Entrega Principal — {{FEATURE_TITLE}}
- **Objetivo da Sprint:** Entregar e validar os requisitos `AC-01`, `AC-02`, `BR-01`, `BR-02`.
- **Regras Validadas no Teste da Sprint (`qa-tester`):** `BR-01`, `BR-02`, `AC-01`, `AC-02`

### Tasks de Implementação da Sprint S01

- [ ] **T01: Implementar contratos, serviços e regras de negócio no Backend**
  - **Sprint:** `S01`
  - **Agente:** `backend`
  - **Cobre:** `AC-01`, `AC-02`, `BR-01`, `BR-02`
  - **Paths Permitidos:** `src/**`
  - **Dependências:** Nenhuma
  - **Spec da Task:** Implementar a camada de serviço/API aplicando a persistência atômica (`BR-01`) e rejeição imediata de entradas inválidas (`BR-02`), preservando todos os comentários existentes.

- [ ] **T02: Implementar componentes visuais, 4 estados, SEO e acessibilidade no Frontend** *(Remover se `has_ui: false`)*
  - **Sprint:** `S01`
  - **Agente:** `frontend`
  - **Cobre:** `AC-01`, `AC-02`
  - **Paths Permitidos:** `src/**`, `public/**`
  - **Dependências:** `T01`
  - **Spec da Task:** Construir a interface seguindo o `DESIGN.md` com HTML5 semântico, `<h1>` único, 4 estados visuais (Empty, Loading, Error, Success) e integração com o contrato da `T01`.

### Validação de QA da Sprint S01 (Por Sprint)

- [ ] **T03: Validar regras de negócio da Sprint S01 com testes essenciais**
  - **Sprint:** `S01`
  - **Agente:** `qa-tester`
  - **Cobre:** `AC-01`, `AC-02`, `BR-01`, `BR-02`
  - **Paths Permitidos:** `tests/**`, `test/**`, `**/*.test.*`, `**/*.spec.*`
  - **Dependências:** `T01`, `T02`
  - **Spec da Task:** Escrever e executar apenas os testes necessários para validar que as regras `BR-01` e `BR-02` e os critérios `AC-01` e `AC-02` estão funcionando na Sprint `S01`, evitando testes redundantes ou triviais.
