---
feature: "{{FEATURE_SLUG}}"
status: "draft"
created_at: "{{DATE}}"
has_ui: true
contains_pii: false
---

# Especificação Técnica (SPEC) — {{FEATURE_TITLE}}

## 1. Contexto e Objetivo de Negócio
<!-- Descreva em até 2 parágrafos qual problema esta feature resolve e qual o resultado esperado. -->
{{DESCRIPTION}}

## 2. User Stories e Escopo
- **Como** `<ator>`, **quero** `<ação>`, **para que** `<benefício>`.
- **Fora de Escopo (Non-Goals):**
  - Item explicitamente excluído desta entrega.

## 3. Contratos Técnicos e Modelo de Dados
<!-- Defina endpoints REST/GraphQL, assinaturas de funções, schemas de banco ou payloads. -->
```json
{
  "endpoint": "POST /api/example",
  "request": {},
  "responses": {
    "201": "Criado com sucesso",
    "400": "Erro de validação",
    "422": "Regra de negócio violada"
  }
}
```

## 4. Regras de Negócio e Side-Effects (`BR-XX`)
<!-- Toda regra crítica deve ter um ID BR-XX para rastreabilidade nos testes e no code review. -->
- **BR-01:** Ao concluir a operação principal, o estado ou registro associado deve ser persistido de forma atômica.
- **BR-02:** Entradas inválidas devem ser rejeitadas com mensagem contextualizada antes de efeitos colaterais.

## 5. Critérios de Aceite Testáveis (`AC-XX`)
<!-- Todo critério deve ter um ID AC-XX e seguir o formato Dado / Quando / Então. O Gate Mecânico valida se todos os AC-XX estão cobertos no TASKS.md. -->
- **AC-01:** **Dado** um payload válido, **Quando** a ação for executada, **Então** o sistema deve processar o resultado esperado e persistir os efeitos colaterais definidos em `BR-01`.
- **AC-02:** **Dado** um payload inválido ou incompleto, **Quando** a ação for submetida, **Então** o sistema deve rejeitar a requisição conforme `BR-02` sem corromper o estado.
