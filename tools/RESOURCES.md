# Controle de Recursos e Paralelismo (v6.6.2)

> Como o harness controla workers em testes e execução baseado em RAM disponível.

## Problema

Quando o opencode roda testes em máquinas com pouca RAM, o fan-out paralelo do state-machine combinado com o paralelismo automático do Playwright/Vitest pode causar **OOM kill** ou travamento.

### Causa

| Camada | Workers paralelos | Consumo estimado |
|---|---|---|
| Sub-agents LLM (fase 5) | até 5 (antes da v6.6.2) | ~500MB-1GB cada |
| Playwright | auto (até N CPUs) | ~300-400MB cada browser context |
| Vitest (contract tests) | auto (default paralelo) | ~200-300MB cada fork |

**Antes da v6.6.2**: 5 sub-agents + 8 Playwright workers = ~5GB+ em máquina com 8GB RAM = OOM.

## Solução (v6.6.2)

### Auto-detecção de workers por RAM

Cada tool de teste auto-detecta workers baseado em `os.freemem()`:

| RAM livre | Playwright workers | Vitest workers | Sub-agents paralelos |
|---|---|---|---|
| < 2GB | 1 | 1 | 1 |
| 2-4GB | 2 | 2 | 2 |
| > 4GB | min(4, CPUs) | min(4, CPUs) | 3 (cap do state-machine) |

### State-machine corrigido

`state-machine.json` (phase.5.build):
- **Antes**: 5 workers paralelos (backend + frontend + tester + security + lgpd-officer)
- **Depois**: 3 workers paralelos (backend + frontend + tester)
- **Security** roda sequencial após build
- **LGPD Officer** só roda se `containsPII: true` (v6.6.1)

### Variáveis de ambiente (overrides)

```bash
# Limitar paralelismo manualmente
export HARNESS_MAX_PARALLEL_WORKERS=1   # Sub-agents paralelos (1-3)
export HARNESS_PLAYWRIGHT_WORKERS=1    # Workers do Playwright (1-4)
export HARNESS_VITEST_WORKERS=1        # Workers do Vitest (1-4)

# Ajustar memória do Node (para Node/V8 heap)
export NODE_OPTIONS="--max-old-space-size=4096"  # 4GB heap
```

### Diagnóstico

```bash
# Rodar harness-doctor e ver seção "resources"
harness-doctor
```

Saída típica:

```json
{
  "resources": {
    "freeRamGB": 3.2,
    "totalRamGB": 16.0,
    "cpus": 8,
    "recommendedParallel": 2,
    "recommendation": "RAM baixa (3.2GB livre). Limite paralelismo a 2 workers."
  },
  "issues": [
    {
      "priority": "high",
      "message": "RAM livre baixa: 3.2GB. Risco médio de OOM com 3+ workers."
    }
  ],
  "recommendations": [
    {
      "priority": "high",
      "text": "export HARNESS_MAX_PARALLEL_WORKERS=2"
    }
  ]
}
```

## Cleanup automático

O `playwright-runner` agora mata processos Playwright órfãos antes de cada execução:

```bash
pkill -f "playwright test"  # mata instâncias travadas
```

Isso evita acúmulo de memória de processos zumbi entre execuções.

## Quem usa esses controles

| Componente | Controle |
|---|---|
| `playwright-runner.ts` | `HARNESS_PLAYWRIGHT_WORKERS` + auto-throttle |
| `test-codegen.ts` (contract) | `HARNESS_VITEST_WORKERS` + `singleFork: true` |
| Orchestrator fan-out | `HARNESS_MAX_PARALLEL_WORKERS` + state-machine |
| `harness-doctor` | advisory (não bloqueia, apenas recomenda) |

## Anti-patterns

- ❌ Definir `workers: 8` hardcoded no `playwright.config.ts` do projeto
- ❌ Desabilitar `singleFork` no Vitest manualmente
- ❌ Rodar múltiplas sprints em paralelo (`harness-advance` em 2 abas)
- ❌ Ignorar warnings de RAM do `harness-doctor`

## Veja também

- `agents/orchestrator.md` — fan-out logic
- `tools/playwright-runner.ts` — implementação Playwright
- `tools/test-codegen.ts` — geração Vitest
- `state-machine.json` — phase.5.build.parallelPolicy
