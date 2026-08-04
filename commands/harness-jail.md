---
description: Instruções e comando para rodar o OpenCode dentro do sandbox ai-jail de forma nativa
agent: orchestrator
---

# 🛡️ OpenCode + ai-jail (Sandbox Nativo)

Para evitar erros de permissão com `bwrap` (bubblewrap) em comandos subprocessos, a sessão do **OpenCode** deve ser iniciada encapsulada diretamente pelo `ai-jail`.

### Execução via Terminal:

Execute o comando abaixo no terminal da raiz do seu projeto:

```bash
AI_JAIL_ACTIVE=1 ai-jail opencode
```

### O que este comando faz?
1. **`ai-jail opencode`**: Inicia o processo principal do OpenCode isolado em nível de kernel (bubblewrap).
2. **`AI_JAIL_ACTIVE=1`**: Sinaliza para o plugin `native-sandbox.ts` do Harness que a sessão já está segura e enjaulada, desativando tentativas de enjaulamento subprocesso por comando.

---
