# Guia de Contribuição — OpenCode Agents v6

Obrigado pelo seu interesse em contribuir com o **OpenCode Agents v6**! 🚀

Este projeto visa estabelecer um ecossistema multi-agente disciplinado, auditável e altamente fiel para o runtime do OpenCode. Para garantir a qualidade do código, a conformidade de segurança e a coerência da arquitetura, pedimos que todos os contribuidores sigam as diretrizes abaixo.

---

## 🗺️ 1. Visão Geral da Arquitetura

O harness é composto por 4 pilares:
1. **Agentes Declarativos (`agents/`)**: Arquivos Markdown com YAML frontmatter configurando modos de permissão e regras de identidade.
2. **Contratos Globais (`state-machine.json`, `failure-protocol.json`)**: Configuram o fluxo sequencial de 6 fases, critérios de portão (gates) e tratamento de erros.
3. **Plugins TS (`plugins/`, `tools/`)**: Plugins de runtime para controle de escrita e log (como `path-boundary.ts` e `audit-logger.ts`).
4. **Skills locais (`skills/`)**: Instruções especializadas em formato de Markdown estendido acionadas sob demanda para tarefas específicas (como o ecossistema do Stitch). O critério de o que pertence ao `skills/` core está documentado em [`docs/SKILLS_CURATION.md`](docs/SKILLS_CURATION.md).

---

## 🛠️ 2. Configurando o Ambiente de Desenvolvimento

### Pré-requisitos
* Node.js (v18+) ou **Bun** (altamente recomendado e pré-instalado pelo instalador).
* OpenCode CLI instalado no sistema.

### Modelo de Instalação Suportado

> [!IMPORTANT]
> O método de instalação oficial é via `install.sh` (curl ou execução local). O harness **não é publicado como pacote npm público**. O `npm install` serve apenas para instalar as dependências de desenvolvimento do repositório.
>
> **Por que `@opencode-ai/plugin` está em `dependencies` (não `devDependencies`):** os 4 plugins de runtime (`path-boundary.ts`, `audit-logger.ts`, `native-sandbox.ts`, `status-injector.ts`) importam esse SDK em produção. Manter em `devDependencies` quebraria os plugins em ambientes que executam `npm install --omit=dev`.

### Passo a Passo
1. Faça o fork e clone o repositório do projeto:
   ```bash
   git clone https://github.com/seu-usuario/harnes-opencode.git
   cd harnes-opencode
   ```
2. Instale as dependências locais de desenvolvimento:
   ```bash
   npm install
   # ou: bun install
   ```
3. Teste o script de instalação localmente:
   ```bash
   ./install.sh --update --dry-run
   ```

---

## 🛑 3. Princípios e Regras de Código Não-Negociáveis

Seu Pull Request será recusado se violar qualquer um dos seguintes padrões de desenvolvimento (validados no CI/CD):

* **TDD Obrigatório (Test Driven Development):** 
  Nenhum código de funcionalidade ou correção de bug deve ser escrito sem que haja um teste unitário ou de integração correspondente criado primeiro (ciclo Red-Green-Refactor).
* **Documentação Obrigatória de Funções:**
  Toda e qualquer função pública em TypeScript/JavaScript deve obrigatoriamente conter blocos JSDoc explicativos detalhando parâmetros, retornos e possíveis exceções:
  ```typescript
  /**
   * Realiza a mesclagem inteligente de dois objetos JSON
   * @param base Objeto de configuração existente do usuário
   * @param update Objeto com os novos defaults do repositório
   * @returns O objeto JSON resultante da fusão
   * @throws {SyntaxError} Se os arquivos de entrada forem inválidos
   */
  export function mergeConfig(base: object, update: object): object { ... }
  ```
* **Simplicidade Absoluta (KISS & YAGNI):**
  Evite sobre-engenharia. Não adicione abstrações, classes complexas ou helpers "por garantia" se não forem usados imediatamente. Resolva o problema de forma direta e legível.
* **Respeito aos Path Boundaries:**
  Se estiver adicionando um novo agente ou modificando suas permissões em `opencode.json` ou `agents/`, certifique-se de que ele possua permissões estritas (`permission.task = deny` para subagentes) e que suas permissões de gravação de arquivos estejam limitadas a sua pasta de trabalho.
* **Curadoria de Skills (`skills/`):**
  Antes de adicionar uma nova skill ao diretório `skills/`, ela deve atender a pelo menos um dos critérios documentados em [`docs/SKILLS_CURATION.md`](docs/SKILLS_CURATION.md):
  - [ ] Referenciada em um `agents/*.md` existente
  - [ ] Suporta diretamente uma das 6 fases do workflow
  - [ ] É ferramental de plataforma que os agentes usam
  - [ ] É de manutenção/extensão do próprio harness
  
  Skills pessoais do autor sem relação com o escopo do harness devem ir para um repositório separado.

---

## 🧪 4. Validações Locais (Antes de Commitar)

Antes de fazer o push de suas modificações, certifique-se de rodar localmente os validadores para evitar falhas no validador do GitHub Actions:

1. **Validação de Sintaxe do Instalador Bash:**
   ```bash
   bash -n install.sh
   ```
2. **Compilação e Validação TypeScript de Plugins/Tools:**
   ```bash
   npx tsc --noEmit --skipLibCheck plugins/*.ts tools/*.ts
   ```
3. **Validação de Schemas JSON:**
   Valide se arquivos como `opencode.json`, `state-machine.json` e `failure-protocol.json` estão em formato JSON perfeitamente válido (sem vírgulas inválidas sobrando):
   ```bash
   python3 -m json.tool opencode.json
   ```
4. **Rodar testes com cobertura (obrigatório antes de PR):**
   ```bash
   npm run test:coverage
   ```
   O CI rejeitará PRs que reduzam a cobertura de `tools/` abaixo de **70%**.
5. **Validar classificação de dependências de runtime:**
   ```bash
   node -e "const p=require('./package.json'); if(!p.dependencies?.['@opencode-ai/plugin']) throw new Error('SDK em devDependencies!')"
   ```

---

## 💬 5. Convenção de Commits (Conventional Commits)

Adotamos a especificação de Conventional Commits para manter o histórico de releases limpo e automatizável:

* `feat: ...` — Nova funcionalidade (ex: `feat: adicionar suporte a X no smart merge`).
* `fix: ...` — Correção de bugs (ex: `fix: resolver vazamento de chaves de API`).
* `docs: ...` — Alterações em documentação (ex: `docs: atualizar guia de contribuição`).
* `chore: ...` — Manutenção do repositório, dependências ou scripts (ex: `chore: atualizar versão para 6.3.2`).

---

## 🚀 6. Enviando seu Pull Request

1. Crie uma branch específica para sua alteração:
   ```bash
   git checkout -b feat/minha-nova-funcionalidade
   ```
2. Faça o commit de suas alterações seguindo a convenção de escrita.
3. Certifique-se de atualizar o `CHANGELOG.md` se houver mudanças importantes de release.
4. Faça o push para o seu fork:
   ```bash
   git push origin feat/minha-nova-funcionalidade
   ```
5. Abra o Pull Request apontando para a branch `main` do repositório oficial.
