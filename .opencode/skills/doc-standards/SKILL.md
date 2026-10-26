---
name: doc-standards
description: Padrões oficiais de documentação do OpenCode Harness v7 para criação e atualização de PRD.md, PRODUCT.md, SPEC.md e AGENTS.md.
---

# Skill: Padrões Oficiais de Documentação (`PRD`, `PRODUCT`, `SPEC`, `AGENTS`)

Esta skill define a estrutura obrigatória e enxuta que o agente `spec-engineer` deve seguir ao criar ou atualizar documentos do projeto.

---

## 1. Padrão `PRD.md` (Product Requirements Document)
Local: `.opencode/specs/<feature>/PRD.md` (ou `.opencode/PRD.md` para visão global)
```markdown
# PRD — <Nome do Produto ou Feature>

## 1. Problema e Visão de Produto
<O que estamos resolvendo, para quem e qual o valor entregue em até 2 parágrafos>

## 2. Objetivos e Métricas de Sucesso (KPIs)
- **Objetivo 1:** <Meta clara e mensurável>

## 3. Escopo e Priorização
- **Incluído (In-Scope):** <Funcionalidades essenciais>
- **Excluído (Out-of-Scope):** <O que NÃO será feito agora>

## 4. User Stories Principais
- **US-01:** Como `<persona>`, quero `<ação>`, para `<benefício>`.
```

---

## 2. Padrão `PRODUCT.md` (Definição Funcional e Fluxos do Produto)
Local: `.opencode/PRODUCT.md`
```markdown
# PRODUCT — Mapa do Produto

## 1. Personas e Atores
- **`<Ator>`:** <Papel e permissões no sistema>

## 2. Mapa de Telas / Módulos e Rotas
| Módulo / Rota | Objetivo Funcional | Possui UI? |
| :--- | :--- | :---: |
| `/exemplo` | <Descrição curta> | Sim / Não |

## 3. Jornada e Fluxos Críticos
1. **Fluxo Principal:** `<Passo 1> -> <Passo 2> -> <Resultado Esperado>`
```

---

## 3. Padrão `SPEC.md` (Especificação Técnica e Regras de Negócio)
Local: `.opencode/specs/<feature>/SPEC.md`
```markdown
---
feature: "<feature-slug>"
status: "ready"
created_at: "YYYY-MM-DD"
has_ui: true
contains_pii: false
---

# Especificação Técnica (SPEC) — <Título>

## 1. Contexto e Arquitetura
<Resumo técnico e componentes/módulos impactados>

## 2. Contratos Técnicos e Modelo de Dados
<Rotas, assinaturas, payloads de entrada/saída, schemas de banco e códigos de erro 400/401/403/404/422>

## 3. Regras de Negócio e Side-Effects (`BR-XX`)
- **BR-01:** <Regra de negócio crítica e efeito colateral exigido>
- **BR-02:** <Restrição ou validação obrigatória>

## 4. Critérios de Aceite (`AC-XX`)
- **AC-01:** **Dado** `<contexto>`, **Quando** `<ação>`, **Então** `<resultado verificável + vínculo com BR-XX>`.
```

---

## 4. Padrão `AGENTS.md` (Mapa de Contexto para Agentes)
Local: `AGENTS.md` (raiz do repositório ou pastas críticas)
```markdown
# Mapa de Contexto — <Nome do Projeto>

## 1. Stack e Comandos Essenciais
- **Stack:** <Linguagem, Framework, Banco>
- **Build / Typecheck:** `<comando>`
- **Testes:** `<comando>`

## 2. Arquitetura de Pastas
- `src/...`: <Responsabilidade da pasta>
- `.opencode/specs/`: Documentos de produto (PRD, SPEC, Sprints e Tasks)

## 3. Convenções Obrigatórias
- Preservar todos os comentários explicativos existentes no código.
- Seguir boas práticas de SEO e HTML5 semântico nas páginas web.
```
