# Índice de Ferramentas (Tools Index)

Este documento serve como referência de todas as ferramentas (`tools`) disponíveis no OpenCode Agents v6 Harness para os agentes automatizarem processos operacionais, pouparem uso de terminal/bash, economizando tokens e evitando falhas estruturais.

> **Importante para Agentes:** Sempre que você for instruído a realizar uma operação listada abaixo, prefira usar a `tool` oficial do harness ao invés de rodar scripts manuais em `bash`.

---

## 🏗️ Gerenciamento de Harness (Estrutura e Fases)

### `harness-init.ts`
- **Uso:** Inicializa o projeto alvo criando a pasta `.harness/` e os arquivos de estado da máquina (state.json, events.jsonl).
- **Quando usar:** Ao chegar em um repositório sem estado de harness inicializado.

### `harness-sync.ts`
- **Uso:** Audita e sincroniza a estrutura do `.harness/`.
- **Ação:** Move arquivos de configuração como `.ai-jail` e `opencode.json` para dentro de `.harness/`. Efetua *upgrade* automático das Tasks de versões antigas convertendo os arquivos legados de markdown para a nova estrutura de banco de dados (`SXX.json`).
- **Quando usar:** Em projetos inicializados com versões antigas do harness, ou se suspeitar que arquivos de configuração estão no local incorreto.

### `harness-db.ts` (API Interna)
- **Uso:** Abstração de banco de dados para os arquivos `state.json`, `events.jsonl` e `SXX.json` (sprints). Contém métodos `findMany`, `findOne`, `update`, `insert` e `remove`.
- **Nota:** Esta é uma biblioteca importada por outras ferramentas, não invocada diretamente pelos agentes por MCP.

---

## 🏃 Planejamento e Sprints

### `sprint-builder.ts`
- **Uso:** Cria fisicamente as pastas da sprint e inicializa o banco de dados `SXX.json` populando com as tarefas e User Stories.
- **Quando usar:** Na transição de fase quando as Sprints precisam ser criadas a partir do SPEC.md.

---

## 🛠️ Automações do Dia a Dia (Software Engineering)

### `git-automator.ts`
- **Uso:** Roda status ou cria commits diretamente pela tool.
- **Argumentos Principais:** `action` ("status" ou "commit"), `files` (array com os arquivos), e `message`.
- **Quando usar:** Ao finalizar edições em código e for necessário fazer um commit sem precisar montar comandos extensos no terminal.

### `changelog-automator.ts`
- **Uso:** Lê as tarefas finalizadas na sprint no `HarnessDB` e no `git log` recente para gerar ou atualizar o `CHANGELOG.md`.
- **Argumentos Principais:** `version` e `sprintId`.
- **Quando usar:** Ao finalizar a sprint de release (ou a própria fase de QA), para compilar rapidamente o que mudou no projeto.

### `pr-automator.ts`
- **Uso:** Faz um `git diff` em relação a uma branch base (geralmente a main/master) e elabora automaticamente um rascunho de Pull Request, salvando-o em `.harness/PR_DRAFT.md`.
- **Argumentos Principais:** `baseBranch` e `sprintId`.
- **Quando usar:** Quando a task atual exigir a abertura de um PR ou review de código em formato unificado.

### `linter-automator.ts`
- **Uso:** Executa formatação ou verificação estática do projeto alvo (ex: `npm run lint`), com suporte a correções automáticas (`autoFix: true`). 
- **Argumentos Principais:** `command`, `autoFix`.
- **Quando usar:** Antes de um commit, caso seja obrigatório que o código passe pelo CI. Assim, a ferramenta captura a saída de erros para você consertar iterativamente, caso existam.

### `docs-sync.ts`
- **Uso:** Atualiza a documentação técnica central (`README.md` ou `ARCH.md`) adicionando referências rápidas na seção de "Últimas Atualizações".
- **Argumentos Principais:** `docsTarget` (ex: README.md) e `summaryText`.
- **Quando usar:** Ao introduzir uma grande dependência no projeto ou refatorar a estrutura que os outros desenvolvedores precisem saber imediatamente ao ler o README.
