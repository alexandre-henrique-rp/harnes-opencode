# Test-Driven Development (TDD) — Lei de Ferro

Este guia estabelece as diretrizes obrigatórias de TDD que devem ser seguidas pelos agentes de desenvolvimento (`backend`, `frontend`) e auditadas pelo agente revisor (`code-reviewer`) do Harness v6.

---

## 1. A Lei de Ferro do TDD

> [!IMPORTANT]
> **NENHUM CÓDIGO DE PRODUÇÃO PODE SER ESCRITO SEM UM TESTE FALHANDO PRIMEIRO.**
> Se qualquer código de produção for escrito antes do respectivo teste, ele deve ser deletado e reimplementado do zero a partir do teste falho. Não há exceções a esta regra.

### O Ciclo Red-Green-Refactor
1. **RED (Escrever Teste Falho):** Crie um teste unitário minimalista descrevendo o comportamento esperado. 
   * Execute o teste e confirme se ele realmente **falha** (e não dá erro de sintaxe ou compilação) e se a mensagem de falha é exatamente a esperada.
2. **GREEN (Escrever Mínimo Código):** Escreva a implementação mais simples e minimalista possível apenas para fazer o teste passar. Não adicione lógica extra ou melhorias não solicitadas pelo teste (YAGNI).
   * Execute o teste e confirme se ele passa.
3. **REFACTOR (Refatorar):** Com o teste passando, limpe o código, remova duplicidades, melhore nomenclaturas e extraia helpers mantendo a suite de testes verde.

---

## 2. Por que a Ordem Importa?

Escrever testes após a implementação é um anti-padrão grave para agentes de IA:
- **Viés de Implementação:** Testes pós-código tendem a validar o que o código *faz*, e não o que ele *deveria fazer*. Eles raramente cobrem casos de borda que o agente esqueceu de implementar.
- **Falta de Validação do Teste:** Se você nunca viu o teste falhar, você não tem garantia técnica de que ele realmente testará algo ou de que não passará sob qualquer circunstância.

---

## 3. Diretrizes de Qualidade dos Testes

- **Testes de Comportamento Real:** Evite o excesso de mocks. Teste o comportamento de entrada/saída real das unidades de código sempre que possível. Mocks devem ser limitados a barreiras de I/O externas complexas (bancos de dados, chamadas de rede de terceiros).
- **Sem Placeholders em Testes:** Testes que não realizam asserções reais ou que contêm blocos vazios são considerados falhas graves.
- **Hard Gates de Cobertura:** A cobertura mínima do projeto (coverage) especificada nas métricas do gate deve ser cumprida rigorosamente em todas as fases do build.
