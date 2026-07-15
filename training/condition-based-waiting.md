# Espera Baseada em Condição (Condition-Based Waiting)

Este guia estabelece os padrões obrigatórios para testes assíncronos realizados pelo agente de testes (`tester`) e de desenvolvimento do Harness v6, a fim de evitar testes intermitentes (flaky tests).

---

## 1. O Problema das Esperas Arbitrárias (Anti-padrão)

Testes que utilizam delays estáticos ou arbitrários (`setTimeout`, `sleep(200)`, `delay(50)`) para aguardar a conclusão de processos assíncronos (como I/O de disco, requisições de rede ou eventos) apresentam comportamento intermitente:
- Passam em computadores locais rápidos, mas falham em servidores de CI sob carga de CPU.
- Aumentam desnecessariamente o tempo total de execução dos testes.

---

## 2. A Diretriz de Espera Baseada em Condição

> [!IMPORTANT]
> **SEMPRE AGUARDE A CONDIÇÃO OU EVENTO REAL, NUNCA FAÇA UM PARALISAMENTO POR TEMPO ESTIMADO.**
> Substitua esperas de tempo fixo por mecanismos de polling ativo que testam repetidamente se a condição foi satisfeita, acompanhados de um limite de tempo máximo (timeout).

### Padrão de Implementação (TypeScript)

Em vez de usar timeouts fixos:
```typescript
// ❌ ANTES: Adivinhando o tempo necessário
await new Promise(resolve => setTimeout(resolve, 150));
expect(db.users.length).toBe(1);
```

Use uma função utilitária de espera ativa:
```typescript
// ✅ DEPOIS: Aguardando a condição real
await waitFor(() => db.users.length === 1, "Usuário ser inserido no banco");
expect(db.users.length).toBe(1);
```

### Exemplo de Função Utilitária `waitFor`

```typescript
async function waitFor<T>(
  condition: () => T | undefined | null | false,
  description: string,
  timeoutMs = 5000,
  pollIntervalMs = 10
): Promise<T> {
  const startTime = Date.now();

  while (true) {
    const result = condition();
    if (result) return result;

    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout aguardando por [${description}] após ${timeoutMs}ms.`);
    }

    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
}
```

---

## 3. Quando Delays Estáticos são Permitidos?

Delays estáticos só são permitidos nos raríssimos cenários onde o tempo em si é o comportamento que está sendo testado (ex: testar o debounce de uma função ou um throttle). Nesses casos:
1. Sempre aguarde a condição inicial de início do timer primeiro.
2. Comente explicitamente o motivo matemático ou técnico do delay no corpo do teste.
