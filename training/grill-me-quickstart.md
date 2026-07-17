# Grill-Me — Guia Rápido (5 min)

> Técnica do Matt Pocock, adaptada para o harness v6.5.0+.
> Roda **antes** de qualquer feature não-trivial ser implementada.

## O que é

Em vez do agent ir direto pra "executar o que você pediu", ele para,
pensa junto com você, e só sai da conversa quando ambos têm a mesma
compreensão do que vai ser feito.

É uma sessão de **perguntas e respostas** com 3 regras:

1. **Uma pergunta por vez** (não uma checklist de 10)
2. **Resposta recomendada junto** (você pode só confirmar)
3. **Se a resposta está no código, procurar no código** (não perguntar pra você)

## Quando usar

✅ **USE** quando a feature envolve:
- Decisões de UX/layout
- Escolha entre bibliotecas
- Definição de fluxo de usuário
- Decisões de modelo de dados
- Mais de uma forma "correta" de fazer

❌ **NÃO USE** para:
- Renomear uma variável
- Ajustar uma cor
- Bug fix óbvio
- Mudança totalmente especificada pela SPEC

## Como funciona na prática

### Você pede

> "cria um modal de autenticação"

### O agent (você não vê essa parte) já fez

- Leu `AGENTS.md` da pasta `src/components/auth/`
- Leu o `Modal.tsx` base em `src/components/ui/`
- Leu o `useAuth.ts` hook
- Viu que `next-auth` está instalado

### O agent pergunta

> **Q1:** Esse modal deve cobrir login, signup e forgot-password, ou só login?
> **Recomendação:** começar só com login; signup e forgot viram tabs internas. Mais simples, sem roteamento extra.

**Você:** "ok, só login"

> **Q2:** Centralizado no desktop ou bottom-sheet no mobile?
> **Recomendação:** centralizado desktop, bottom-sheet <768px. Consistente com o `Card.tsx` que já segue esse padrão.

**Você:** "ok, vai"

> **Q3:** Vai usar o `useAuth()` que já existe, ou quer integrar com uma API custom?
> **Recomendação:** reusar `useAuth()`. O `next-auth` já está configurado e o sprint anterior já plugou a sessão.

**Você:** "ok, segue"

### O agent persiste

Cria `.harness/decisions/S01-user-auth-modal.md`:

```markdown
# ADR-007: User auth modal scope and approach

> **Status:** Accepted
> **Date:** 2026-07-17
> **Sprint:** S01

## Context
[...]
## Decision
We will build a login-only modal. Signup and forgot-password will be
deferred to later sprints. We will use a centralized modal on desktop
and a bottom-sheet on mobile. We will integrate with the existing
`useAuth()` hook (which wraps next-auth).

## Alternatives considered
[...]

## Consequences
[...]
```

E implementa.

## Dicas pra você (humano) responder bem

### 1. Confie na recomendação

Se a recomendação do agent faz sentido, só confirme:

- "ok"
- "segue"
- "pode ser"
- "isso mesmo"

Não precisa elaborar. O agent anota a confirmação.

### 2. Corrija se discorda, com motivo

Se a recomendação não serve, **diga por quê** (1 frase):

- "não, signup precisa entrar agora porque é requisito regulatório"
- "centralizado sempre, não fazemos bottom-sheet aqui"
- "vamos usar API custom por causa de <razão>"

O agent anota e segue.

### 3. Se não sabe, peça pra explorar mais

- "antes de decidir, vê como o `<outro componente>` resolveu"
- "olha a `SPEC.md` seção 3.2 antes"

O agent vai explorar e voltar com uma resposta melhor.

### 4. Limite de 8 perguntas

O agent tem um hard cap de 8 perguntas por sessão. Na 9ª, ele **assume
a recomendação** e segue. Se você quer ir além, comece uma nova sessão
de grill-me explícita.

## Dicas pra criar uma skill / agent que use grill-me

Se você for criar uma skill nova que precisa tomar decisões, adicione
no protocolo:

```markdown
## Decisões

Antes de implementar, se a feature tem ≥2 decisões abertas, carregue
a skill `grill-me` e siga o protocolo dela. Persista decisões em
`.harness/decisions/<context>-<feature>.md`.
```

## Anti-patterns

### ❌ O agent pergunta tudo de uma vez

```
"Tem 5 decisões a tomar:
1. Layout?
2. Componente base?
3. Auth provider?
4. Validação?
5. Loading state?"
```

**Errado.** Isso é checklist, não grill-me. Pergunte uma por vez.

### ❌ O agent pergunta sem recomendar

```
"Qual auth provider você quer usar?"
```

**Errado.** Sem recomendação, é trabalho seu pensar. Adicione:

```
"Qual auth provider? Recomendação: useAuth() existente, já que
next-auth está configurado."
```

### ❌ O agent pergunta o que está no código

```
"Qual o schema do User? O id é UUID ou auto-increment?"
```

**Errado.** Isso está no `schema.prisma`. O agent deveria ter lido.

### ❌ O agent não para de perguntar

Se você está na 5ª pergunta e quer parar:

- "ok, segue com o que tem"
- "implementa com seu melhor julgamento"
- "para o grill-me, vai"

O agent respeita e para.

## Quando NÃO usar grill-me (mesmo disponível)

| Caso | Por que não grill-me |
|---|---|
| Mudança de copy (texto de botão) | Decisão é trivial, copy writer resolve |
| Renomear variável | Refactor mecânico |
| Hotfix crítico em prod | Tempo > qualidade |
| Já existe decisão em ADR | Lê o ADR e segue |
| Mudança 100% especificada em SPEC | Sem ambiguidade, sem decisão |

## Referência rápida (TL;DR)

```yaml
grill-me:
  trigger: feature com ≥2 decisões abertas
  flow: 1 pergunta por vez + recomendação
  explore_first: sim — antes de perguntar, leia o código
  cap: 8 perguntas, depois assume recomendação
  persist: .harness/decisions/<sprint>-<feature>.md
  skip: single-step, hotfix, 100% especificado
```

## Mais info

- Skill completa: `skills/grill-me/SKILL.md`
- Origem: [mattpocock/skills](https://github.com/mattpocock/skills)
- ADR format: `skills/decision-log/SKILL.md`
