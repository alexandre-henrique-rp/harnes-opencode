# Depuração Sistemática e Rastreamento de Causa Raiz

Este guia estabelece os protocolos obrigatórios de resolução de falhas e bugs que devem ser seguidos por todos os agentes do Harness v6.

---

## 1. A Lei de Ferro do Debugging

> [!IMPORTANT]
> **NENHUM CONSERTO PODE SER PROPOSTO OU APLICADO ANTES DA INVESTIGAÇÃO COMPLETA DA CAUSA RAIZ.**
> Correções ad-hoc, palpites ou remendos sintomáticos que mascaram problemas sem tratar a causa real geram débitos técnicos e falham em gates de segurança e QA.

---

## 2. O Processo de 4 Fases de Depuração

### Fase 1: Investigação da Causa Raiz (Root Cause)
- **Leitura Detalhada de Erros:** Examine a pilha de chamadas (stack trace) por completo, anotando caminhos de arquivo, números de linha e códigos de erro específicos.
- **Reprodução Consistente:** Defina os passos e estados exatos necessários para disparar a falha de forma confiável. Não tente corrigir bugs intermitentes por palpite.
- **Rastreamento de Tráfego de Dados (Root Cause Tracing):**
  1. Identifique o ponto onde a exceção ou o dado inválido foi detectado.
  2. Rastreie de trás para frente na pilha de chamadas (call stack) quem enviou aquele dado inválido.
  3. Prossiga subindo na cadeia até identificar o gerador inicial do dado poluído. A correção deve ser feita no gerador inicial (causa raiz), e não onde a falha apareceu (sintoma).

### Fase 2: Análise de Padrão (Pattern Analysis)
- Procure exemplos de código semelhantes que estejam funcionando corretamente no projeto.
- Compare as configurações, dados de entrada e estados de execução e identifique diferenças estruturais.

### Fase 3: Hipótese e Teste Minimalista
- Formule uma única hipótese explicativa clara (ex: *"O erro ocorre porque a variável X não é limpa antes do loop"*).
- Faça a menor alteração isolada possível para testar essa hipótese específica. Se não funcionar, desfaça a alteração antes de formular a próxima hipótese. Nunca acumule tentativas de correção sem sucesso.

### Fase 4: Implementação e Validação
- Crie um teste unitário ou de integração que reproduza a falha (verifique se o teste falha).
- Aplique o conserto e valide se todos os testes agora passam.

---

## 3. A Regra dos 3 Erros de Conserto (Escalação)

Se um agente especialista tentar consertar o mesmo bug ou teste falho por **3 vezes consecutivas** sem sucesso:
1. **PARADA IMEDIATA:** O agente deve parar de tentar novas correções automáticas.
2. **ANÁLISE DE ARQUITETURA:** O agente deve avaliar se o problema é estrutural ou de design de código (e não meramente um erro sintático simples).
3. **ESCALAÇÃO:** Reportar o impasse ao `orchestrator`, detalhando as 3 hipóteses tentadas. O `orchestrator` deverá escalar a questão ao usuário humano para evitar loops recursivos caros de tokens.
