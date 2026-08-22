# /harness-quick — Fast-path para tarefas triviais

> Slash command que pula as fases 0-4 e vai direto para o worker apropriado. Para correções, ajustes e mudanças pequenas.

## Quando usar

Acione este comando quando a task casa com **qualquer** destes padrões:

| Padrão | Exemplo |
|---|---|
| Correção de typo / grammar | "conserta typo em src/about.ts" |
| Ajuste cosmético | "muda cor do botão primário", "aumenta padding do card" |
| Renomeação simples | "renomeia prop `userId` para `id`" |
| Log / instrumentação | "adiciona console.log em handleSubmit", "remove log debug" |
| Mudança de config simples | "aumenta timeout pra 30s", "muda porta do dev server" |
| Fix trivial | "conserta import path", "remove variável não usada" |
| Documentação | "atualiza README com nova env var" |

**Não use** este comando se a task envolve:
- Mudança cross-module
- Nova feature (>30min de trabalho)
- Refactor estrutural
- Mudança de contrato de API
- Mudança de schema de banco
- Comportamento novo na lógica de negócio

---

## Heurística de detecção (automática)

O orchestrator pode invocar automaticamente `/harness-quick` quando a task description casa com:

```
TRIVIAL_PATTERNS = [
  /^(conserta|corrige|ajusta|renomeia|remove|adiciona)\s/i,
  /^(typo|grammar|spelling)/i,
  /(muda|altera)\s+(cor|texto|label|placeholder|padding|margin)/i,
  /(adiciona|remove)\s+(log|console\.log|comment)/i,
  /(aumenta|diminui)\s+(timeout|intervalo|delay)/i,
]
```

E a task **não** casa com:

```
COMPLEX_PATTERNS = [
  /(cria|implementa|adiciona)\s+(feature|funcionalidade)/i,
  /(refactor|reescreve|reestrutura)/i,
  /(muda|altera)\s+(schema|model|migration|contract)/i,
]
```

---

## Comportamento

### 1. Detectar escopo da mudança

Pergunte ao humano (se ambíguo) OU infira do diff atual:
- Quantos arquivos? (≤3 esperado)
- Quais paths? (devem estar no allowlist do worker)
- Qual worker? (`backend`, `frontend`, ou ambos)

### 2. Despachar direto para o worker

**Pule as fases 0-4.** Despache o worker apropriado com capability grant mínimo:

```yaml
# Exemplo para ajuste de frontend
target_agent: frontend
scope: "ajustar cor do botão primário em src/components/Button.tsx"
files_to_touch:
  - src/components/Button.tsx
capability_grant:
  skill: ["grill-me"] # só se ≥3 decisões abertas
  path_allowlist: ["src/**"]
  path_denylist: ["tests/**", "qa/**", "e2e/**"]
profile: lean # fast-path usa lean por default
```

### 3. Self-check mínimo

Após worker retornar:
- `lint` passa
- `typecheck` passa
- `build` passa

Se algum falhar → worker corrige (1 iteração) → re-tenta. Se falhar 2x → escalar.

### 4. Reportar ao humano

Retorne JSON simples:

```json
{
  "mode": "quick-path",
  "skipped_phases": ["0-briefing", "1-docs", "2-requisitos", "3-design", "4-planejamento"],
  "worker": "frontend",
  "filesTouched": ["src/components/Button.tsx"],
  "selfCheck": { "lint": "pass", "typecheck": "pass", "build": "pass" },
  "ready": true
}
```

---

## Guard-rails

- ❌ Usar `/harness-quick` para tarefa complexa (deixar para pipeline completo)
- ❌ Disparar `/harness-quick` quando há dúvida se a task é trivial (use `/harness` normal)
- ❌ Pular self-check (mínimo: lint + typecheck + build)
- ❌ Tocar em arquivos fora do allowlist do worker

---

## Diferença vs /harness normal

| Aspecto | /harness | /harness-quick |
|---|---|---|
| Fases | 6 (Briefing → QA) | 1 (worker direto) |
| Documentos gerados | PRD, SPEC, DESIGN, sprints | nenhum |
| Reviewers | 3 paralelos + security + LGPD | nenhum |
| Profile | strict ou lean | lean (forçado) |
| Coverage gate | ≥85% | nenhum (self-check só) |
| Tempo estimado | horas | ≤30min |

Use `/harness` quando a task tem impacto arquitetural. Use `/harness-quick` para ajustes pontuais.
