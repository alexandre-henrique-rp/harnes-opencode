# Frontend Context-First — Guia de Onboarding

> Para humanos e agents novos no harness v6.5.0+.
> Tempo de leitura: ~10 min.

## O que mudou na v6.5.0

A forma como o `frontend` agent trabalha foi reformulada. A mudança
central é: **trocamos TDD por Context-First + Grill-Me**.

### Antes (v6.4.x)

```
Recebe task → Escreve teste (TDD) → Escreve código → Ajusta teste → Loop
                                                              ↓
                                                      Muitos tokens gastos,
                                                      resultado medíocre
```

### Agora (v6.5.0)

```
Recebe task → Carrega skill frontend-context-first
           → Lê AGENTS.md aplicáveis
           → Roda grill-me se ≥2 decisões abertas
           → Persiste decisões em .harness/decisions/
           → Implementa com brief interno
           → Sem teste proativo (tester valida E2E na Phase 5)
                                                              ↓
                                                      Menos tokens,
                                                      implementação
                                                      mais alinhada
```

## Por que a mudança?

Três motivos:

1. **TDD em UI/frontend é caro e quebra fácil.** Seletores, snapshots
   e assertions de estilo são frágeis. O primeiro refactor de CSS já
   quebra metade dos testes.
2. **Contexto local > teste unit.** Um `AGENTS.md` bem escrito é mais
   valioso que 50 unit tests de componente. Mostra o que já existe,
   os padrões em uso, o que evitar.
3. **Grill-me resolve ambiguidade antes de virar código.** É mais
   barato fazer 3 perguntas agora do que re-implementar 3 vezes.

## Como o time humano se adapta

### Se você é o humano que pede features

1. **Documente com grill-me em mente.** Quando pedir uma feature, espere
   que o agent faça 2-5 perguntas antes de codar. Responda com a
   resposta recomendada se concordar — agiliza muito.
2. **Não pule grill-me.** Mesmo que a feature "pareça simples", se
   envolve ≥2 decisões, grill-me vai poupar tempo depois.
3. **Leia os decision logs.** Quando o agent persistir decisões em
   `.harness/decisions/SXX-feature.md`, revise antes de aprovar a impl.
4. **Confie no tester (Phase 5).** Você não precisa mais pedir testes
   de frontend proativamente. O tester cobre E2E com 85% coverage.

### Se você é o humano que revisa PRs

1. **Cheque o decision log.** Sem ADR → o agent pulou grill-me → pergunte por quê.
2. **Valide o brief interno.** O agent deve ter lido pelo menos 1 `AGENTS.md` antes do primeiro `write`.
3. **Veja o audit log.** `bash scripts/check-context-first.sh SXX` valida
   automaticamente se a sequência respeitou o protocolo.
4. **Não reclame de "faltou teste unit".** É by design. Se a feature
   tem lógica complexa isolada, **você** pede o teste explicitamente.

## O que mudou nos agents (resumo)

| Agent | Mudança |
|---|---|
| `frontend` | Reescrito: context-first, sem TDD, denylist de `*.test.*` |
| `documenter` | Reforçado: scan recursivo, AGENTS.md per folder com heurística |
| `orchestrator` | Adicionado pré-check: AGENTS.md existe antes de delegar |
| `backend` | Ajustado: TDD explícito, sem chance de regredir |
| `tester` | **Intacto** — Phase 5 quality gate continua igual |
| Reviewers | **Intactos** — read-only continua igual |

## O que mudou na config

```jsonc
// opencode.json
"experimental": {
  "frontendContextFirst": true   // ← novo, feature flag
},
"agent": {
  "frontend": {
    "permission": {
      "write": {
        "allow": ["src/**", "public/**", ".harness/decisions/**", "**/*.stories.tsx"],
        "deny":  ["**/*.test.*", "tests/**", "e2e/**", "qa/**"]  // ← novo
      }
    }
  }
}
```

Para reverter para o comportamento antigo (NÃO recomendado):

```bash
# Em opencode.json:
"experimental": { "frontendContextFirst": false }
```

## Como criar/rodar uma feature de frontend

### Modo interativo (recomendado)

```bash
/harness
> "implementar modal de autenticação com login, signup e forgot password"

# Agent carrega skill frontend-context-first
# Agent lê AGENTS.md (raiz, src/, components/)
# Agent roda grill-me (3-5 perguntas)
# Você responde
# Agent persiste decisão
# Agent implementa
# Agent roda self-check (lint, typecheck, build)
# Agent retorna JSON
```

### Modo não-interativo (CI/automação)

```bash
# Para rodar sem grill-me, pré-aprove decisões via ADR
# O agent vai implementar baseado na ADR existente
/harness --no-grill-me "implementar modal de autenticação"
```

## Quando adicionar uma exceção (escrever teste de frontend)

Existem **3 casos válidos** para gerar teste de frontend:

1. **Lógica isolada e complexa** (validador, parser, state machine,
   hook de cálculo) — teste unitário vale a pena
2. **Bug fix crítico** — regression test para garantir que não volta
3. **Componente reutilizado em >3 lugares com lógica sensível** — ex:
   `useAuth()` é tocado em 8 features, vale ter teste

Em qualquer um desses, **o agent pergunta antes de escrever**:

> Esta lógica tem unit test? Recomendação: NÃO (cobre o E2E no tester)

Você responde "sim, escreve" e o agent escreve código + teste no
mesmo turno.

## Validando compliance

### Local (desenvolvimento)

```bash
# Após o sprint rodar, valide o protocolo:
bash scripts/check-context-first.sh S01

# Espera-se:
#   ✓ Frontend leu AGENTS.md antes de escrever em src/
#   ✓ Decision log persistido em .harness/decisions/S01-*.md
#   ✓ Frontend NÃO escreveu em *.test.*
#   ✓ Backend mantém TDD
#   ℹ Tokens em tests: X% (meta: ≤5%)
```

### CI (recomendado)

```yaml
# .github/workflows/harness-validate.yml
- name: Check context-first compliance
  run: bash scripts/check-context-first.sh ${{ github.event.inputs.sprint_id }} --strict
```

## Métricas pra acompanhar

| Métrica | Como medir | Meta |
|---|---|---|
| Tokens em tests/*.test.* pelo frontend | `bash scripts/check-context-first.sh SXX` | ≤5% do total |
| Iterações de qa-gate até pass | `qa-gate` log | -30% vs v6.4.x |
| Tasks de frontend com decision log | `find .harness/decisions/ -name "SXX-*.md" \| wc -l` | ≥80% |
| Pastas com AGENTS.md em projeto novo | `find . -name AGENTS.md -not -path "*/node_modules/*" \| wc -l` | ≥95% (raiz + cada subpasta de código) |

## FAQ

**P: Posso desabilitar o grill-me em emergência?**
R: Sim. Adicione `--no-grill-me` no comando `/harness`. Mas documente
no ADR o porquê — grill-me é barato, pular tem custo.

**P: O que faço se o agent pula o grill-me numa feature com decisão aberta?**
R: Rode `bash scripts/check-context-first.sh SXX --strict`. Se passar,
foi false positive. Se falhar, peça ao agent pra voltar e rodar grill-me.

**P: Backend vai regredir?**
R: Não. Backend tem denylist **separado** que PROÍBE `frontend-*` skills
e **permite** testes. Mais: tem `backend-tdd` skill que reforça o ciclo.

**P: E os agents existentes (qa-gate, reviewers)?**
R: Intactos. Continuam read-only, continuam validando.

**P: Como esse padrão funciona com tools como Storybook, Chromatic, etc?**
R: Storybook é permitido (stories são `.stories.tsx`, não `.test.*`).
Visual regression via Chromatic pode ser adicionado como skill
`visual-regression` futuramente.

**P: E se eu quiser TDD em um projeto específico?**
R: Por design, frontend nunca faz TDD nesse harness. Se o projeto
precisar, é projeto errado pro harness — ou fork do `frontend` agent
com denylist diferente.

## Próximos passos

1. Leia `training/grill-me-quickstart.md`
2. Rode uma feature de exemplo e veja o `check-context-first.sh` em ação
3. Customize `frontend-style-guide` para seu projeto
4. Adapte o `docs-curator` se seus projetos têm estrutura de pastas não-padrão
