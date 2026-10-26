---
name: spec-driven
description: Protocolo Spec-Anchored por Sprints — conecta PRD/SPEC às Sprints, exige Spec individual por Task e executa Testes validando Regras por Sprint.
---

# Skill: Spec-Anchored Development por Sprints (SDD v7)

Esta skill governa o fluxo de trabalho do OpenCode Harness v7 para garantir máxima velocidade de codificação e zero retrabalho.

## 1. Separação Estrita de Responsabilidades
1. **`orchestrator` (Apenas Planeja, Define Produto e Designa):**
   - Recebe o prompt do usuário, entende o problema, faz perguntas para zerar dúvidas, ajuda nas definições de produto e delega aos subagentes. **Nunca escreve código.**
2. **`spec-engineer` (Documentação Padronizada):**
   - Cria e mantém `PRD.md`, `PRODUCT.md`, `SPEC.md` e `AGENTS.md` seguindo a skill `doc-standards`.
3. **`task-planner` (Sprints + Spec por Task):**
   - Organiza a entrega em **Sprints** (`S01`, `S02`...) dentro de `TASKS.md`.
   - **Regra Obrigatória:** Cada Task (`T01`, `T02`...) DEVE conter sua própria **Task Spec** autocontida (Objetivo, Contrato Exato, Paths Permitidos e quais `BR-XX`/`AC-XX` ela implementa), permitindo que o desenvolvedor codifique sem precisar ler documentos inteiros.
4. **`backend` e `frontend` (Apenas Código de Produção):**
   - Implementam exclusivamente o código da sua Task seguindo a Spec da Task.
   - **Não escrevem testes** durante as tasks individuais.
5. **`qa-tester` (Testes por Sprint Focados na Regra e Escopados):**
   - Entra **ao final da Sprint** (e não a cada task isolada).
   - Cria testes enxutos focados em **validar que as Regras de Negócio (`BR-XX`) e Critérios (`AC-XX`) da Sprint estão funcionando**, evitando testes supérfluos, duplicados ou desnecessários.
   - **Execução Exclusiva da Sprint:** Só executa os arquivos de teste que possuem relação direta com a Sprint entregue. **Nunca** roda toda a suíte de testes do projeto, a não ser que o usuário solicite explicitamente.
