# PRD — {{project}} v{{version}}

```json
{
  "_type": "harness-prd-v6",
  "id": "prd-{{project}}-v{{version}}",
  "version": {{version}},
  "status": "draft",
  "project": "{{project}}",
  "createdAt": "{{createdAt}}",
  "updatedAt": "{{updatedAt}}"
}
```

---

## 1. Resumo Executivo (O Contexto)
*O Porquê.*

*   **Problema:** Qual dor do usuário ou do negócio estamos resolvendo? (Limite-se a 1 ou 2 parágrafos).
*   **Objetivo:** O que o sucesso se parece? Onde queremos chegar com essa entrega?

---

## 2. Indicadores de Sucesso (Métricas)
*O Impacto.*

*   **Métrica / KPI:** Evite termos vagos como "melhorar a experiência". Use métricas acionáveis (ex: aumentar taxa de conversão em 5%, reduzir tempo de carregamento para menos de 2 segundos).

---

## 3. Escopo e Priorização
*O Que Entra e O Que Fica de Fora.*

Use esta matriz visual direta para alinhar as expectativas instantaneamente e evitar o inchaço do escopo (*scope creep*):

| Prioridade | Funcionalidade / Requisito | Valor para o Usuário | Complexidade Técnica |
| :--- | :--- | :--- | :--- |
| **P0 (Essencial / MVP)** | Ex: Cadastro de conta e login. | Altíssimo | Média |
| **P1 (Importante)** | Ex: Recuperação de senha por e-mail. | Alto | Baixa |
| **P2 (Desejável)** | Ex: Login social secundário. | Médio | Média |
| **Fora de Escopo** | Ex: Integração com carteiras de criptomoedas (foco apenas em PIX e Cartão). | - | - |

---

## 4. Requisitos de Usuário e Funcionais
*O Detalhamento.*

Escreva em formato de *User Stories* (Histórias de Usuário):

*   **US-001:** Como um **[tipo de usuário]**, eu quero **[ação]** para que **[benefício/resultado]**.

---

## 5. Critérios de Aceite e Regras de Negócio
*A Definição de Pronto.*

Detalhe os fluxos principais e, principalmente, os **casos de borda** usando o formato *Dado que... Quando... Então...*:

*   **Critério 1 (Fluxo Feliz):**
    *   **Dado que** o usuário preencheu todos os dados corretamente,
    *   **Quando** clicar em "Cadastrar",
    *   **Então** a conta deve ser criada e um token de sessão retornado.
*   **Critério 2 (Caso de Borda):**
    *   **Dado que** o e-mail informado já está cadastrado no banco de dados,
    *   **Quando** clicar em "Cadastrar",
    *   **Então** o sistema deve exibir uma mensagem informando que o e-mail já existe e impedir o cadastro.
