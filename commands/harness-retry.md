---
description: Re-executar fase que falhou (com rework loopback se quality)
agent: orchestrator
---
1. Chame `harness_status` para ver fase atual e último evento de falha.
2. Leia o último `gate.failed` em `events.jsonl` para entender o que falhou.
3. Classifique a falha:
   - **transient** (HTTP 5xx, ECONNRESET, etc): simplesmente re-delegue ao sub-agent. Backoff é automático.
   - **quality** (score baixo, coverage baixa, etc): re-delegue ao sub-agent com instrução explícita de corrigir os pontos falhados. Use `loopbackTo` do state machine.
   - **user-action** (humano precisa decidir): faça `question` ao usuário com contexto e opções.
   - **fatal** (state corrompido, etc): NÃO re-tente. Apresente o erro e peça fix manual.
4. Se for quality ou transient, monte novo capability grant via `harness_context` (que vai gerar contexto atualizado) e re-delegue via `task`.
5. Log o retry em `events.jsonl` chamando `harness_advance` com attempt adequado.

Argumentos: $ARGUMENTS (qual fase retry, ou "current" para fase atual)
