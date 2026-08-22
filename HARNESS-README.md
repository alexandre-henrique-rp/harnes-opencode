<div align="center">
  <br />
  <p align="center">
    <img src="docs/assets/logo-harness.png" alt="OpenCode Harness Logo" width="300" style="vertical-align: middle;">
  </p>

  ### **O Harness Multi-Agente Declarativo, Auditável e de Alta Fidelidade para OpenCode**

  [![GitHub release](https://img.shields.io/github/v/release/alexandre-henrique-rp/harnes-opencode?color=blue&style=for-the-badge)](https://github.com/alexandre-henrique-rp/harnes-opencode/releases)
  [![License](https://img.shields.io/github/license/alexandre-henrique-rp/harnes-opencode?color=green&style=for-the-badge)](LICENSE)
  [![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-blueviolet?style=for-the-badge)](https://opencode.ai)
  [![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)](https://bun.sh)
  
  <p align="center">
    <a href="#-sobre-o-projeto">Sobre o Projeto</a> ·
    <a href="#-instalação-rápida">Instalação Rápida</a> ·
    <a href="#-empacotamento-para-download">Empacotamento</a> ·
    <a href="#-sprints--workflow">Fases e Workflow</a> ·
    <a href="#-time-de-agentes-roster">Time de Agentes</a> ·
    <a href="#-princípios-não-negociáveis">Princípios</a> ·
    <a href="#-protocolo-de-falhas">Protocolo de Falhas</a>
  </p>
</div>

---

## 📖 Sobre o Projeto

O **OpenCode Agents v6** é um harness declarativo, auditável e auto-modificável de desenvolvimento multi-agente de alta fidelidade integrado ao ecossistema OpenCode. 

Inspirado nas práticas de *vibe-coding* e Extreme Programming (XP), como programação em par, TDD, entregas contínuas e padrões de código estritos, este harness organiza o ciclo de desenvolvimento em **6 fases controladas** e gerencia **20 agentes especializados** com limites rígidos de escrita (path boundaries) e controle total de auditoria.

## 🚀 Instalação / Validação

Após clonar o projeto, rode o validador para checar o ambiente.

O instalador também cria `.harness/harness-allowlist.json` (allowlist a nível de projeto, mergeada com a global em `~/.config/opencode/harness-allowlist.json`). Edite esse arquivo para customizar paths deste projeto sem alterar o allowlist global.

### 🔓 Liberando paths bloqueados pelo path-boundary

Quando o agente tenta escrever em um path bloqueado, a mensagem de erro inclui **como liberar**:

```bash
# Mensagem típica do path-boundary:
[path-boundary] BLOCKED: default cannot write docs/index.html.
  Reason: Path "docs/index.html" nao esta em nenhuma allowlist.
  -> Para liberar este path, adicione "docs/**" em .harness/harness-allowlist.json (allow):
       "./install.sh --add-allow docs/**"
  -> Ou edite manualmente: .harness/harness-allowlist.json
```

Formas de liberar:

```bash
# Via install.sh (mais rápido)
./install.sh --add-allow 'docs/**'
./install.sh --add-deny 'src/legacy/**'

# Via MCP tool (chamavel pelo agente)
harness-allowlist action=list
harness-allowlist action=add pattern='docs/**' type=allow target=project

# Manual
vim .harness/harness-allowlist.json
```

Para inspecionar o merged allowlist efetivo (project + global):

```bash
./install.sh --show-allowlist
# ou:
npm run setup:show-allowlist
```

⚠️ **Reinicie o opencode** após mudar o allowlist — o plugin carrega o JSON uma vez na inicialização da sessão.

```bash
./install.sh                # interativo (valida + cria .env + atualiza .gitignore)
npm run setup               # equivalente via npm
npm run setup:auto          # não-interativo
npm run setup:validate      # só valida, não modifica nada
```

O validador:
1. Detecta plataforma (linux/macos/windows)
2. Testa `ai-jail` + `bwrap` e sugere fallback se kernel sem user namespaces
3. **Detecta paths hardcoded** `/home/<user>/...` em `opencode.json(c)` e **alerta** (mas não modifica — config do usuário é sagrada)
4. Valida cada path de MCP (mostra `ok` ou `MISSING`)
5. Cria `.env.example` (e `.env` se não existir)
6. Atualiza `.gitignore` com paths de sujeira (backup/, tmp/, .harness/audit/, etc.)

## 📦 Empacotamento para Download

Para gerar um tarball limpo para distribuir o projeto:

```bash
./install.sh --list-essentials              # mostra o que entra no pacote
./install.sh --package dist/harness.tar.gz  # cria o tarball
npm run setup:list-essentials               # equivalente npm
npm run setup:package                       # equivalente npm
```

A lista fica em `tools/DIST-MANIFEST.json` (source of truth).

> ⚠️ **Importante:** este instalador **NÃO modifica** `opencode.json(c)` — esses arquivos são configuração pessoal do usuário. Para tornar o projeto portável para outros usuários, o **dono do projeto** deve editar manualmente `opencode.json(c)` e substituir paths hardcoded `/home/<user>/...` por `~/...` ou caminhos relativos antes de commitar.

### 🌟 Diferenciais Competitivos (vs v5)
* **Eficiência Extrema:** Core otimizado contendo apenas ~90 arquivos principais de configuração, ferramentas e plugins para um harness muito mais leve e coeso.
* **Segurança e Boundaries:** Permissionamento baseado em 3 camadas (tool whitelist + path boundary por agente + capability grant).
* **Sandbox ai-jail:** Execução isolada via `ai-jail` (bubblewrap/seatbelt) para proteger o sistema host durante a execução de agentes.
* **Conformidade LGPD:** DPO/Advogada digital integrada de fábrica que roda de forma assíncrona ao final de cada sprint para validar a conformidade da infraestrutura e banco de dados.
* **Strict vs Lean:** Escolha entre o fluxo corporativo completo com auditorias rigorosas ou o fluxo `lean` rápido de 3 fases (Briefing, Planejamento e Build).

---

## 🛡️ Sandbox ai-jail

O harness utiliza o **[ai-jail](https://github.com/akitaonrails/ai-jail)**, criado por [Fabio Akita (@akitaonrails)](https://github.com/akitaonrails), para isolar a execução dos agentes em nível de kernel (bubblewrap no Linux, seatbelt no macOS). Saiba mais no artigo original: [Dicas e Toolkit de IA do Akita - ai-jail](https://akitaonrails.com/2026/05/24/dicas-e-toolkit-de-ia-do-akita-ai-jail-ai-memory-ai-usagebar/).

### Como Funciona a Proteção

Quando você executa `opencode` em um projeto com o harness instalado, um **wrapper de segurança** (`~/.local/bin/opencode`) e o plugin `native-sandbox.ts` interceptam a chamada e executam as tarefas dentro do sandbox isolado pelo `ai-jail`.

- **Bloqueio de Comandos Destrutivos:** Proteção ativa no nível do kernel e regex que intercepta e aborta comandos perigosos como `rm -rf /`, `rm -rf ~`, fork bombs (`:(){ :|:& };:`), formatação de disco (`mkfs.*`, `dd of=/dev/sdX`) e `chmod 777 /`.
- **Mascaramento de Arquivos Sensíveis:** Arquivos como `.env`, `.env.local`, `credentials.json` e `harness-allowlist.json` são mascarados (parecem vazios ou inexistentes para o agente).
- **Ocultação de Dados de Infraestrutura:** Pastas sensíveis da home como `.ssh`, `.kube`, `.aws`, `.gcloud` e `.netrc` ficam completamente invisíveis no sandbox.
- **Preservação do Mapeamento do OpenCode:** Os diretórios `~/.config/opencode` (agentes e comandos) e `~/.opencode` (plugins e binários) permanecem acessíveis em leitura/escrita para que a CLI funcione normalmente.

### Executando com Sandbox Nativo (`/harness-jail`)

Para evitar falhas de permissão com `bwrap` (bubblewrap) em comandos individuais, execute a própria sessão do **OpenCode** encapsulada no `ai-jail`:

```bash
AI_JAIL_ACTIVE=1 ai-jail opencode
```

Você também pode consultar este comando dentro do OpenCode a qualquer momento digitando:
```
/harness-jail
```

### Auto-fallback (Resiliência)

O plugin `native-sandbox.ts` detecta automaticamente se `bwrap` está funcional no ambiente atual. Em kernels sem user namespaces (WSL2, Docker sem `--privileged`, distros hardened), o plugin:

1. Faz probe real com `ai-jail --exec echo` (timeout 5s) na inicialização
2. Cacheia resultado em `~/.local/share/opencode/sandbox-status.json` (24h)
3. Se probe falha → pula o wrapping, comandos bash rodam **sem** sandbox por-comando
4. Loga warning em stderr com recomendação: `AI_JAIL_ACTIVE=1 ai-jail opencode`

Resultado: **o harness nunca trava por causa do sandbox**. Funcionalidade de segurança permanece intacta quando bwrap está disponível, e degrada graciosamente quando não está.

Para desabilitar explicitamente o probe:
```bash
HARNESS_NO_SANDBOX=1 opencode
```

Para diagnóstico detalhado, leia `.harness/sandbox-diagnostic.json` após rodar `harness-workspace`.

---

### Guia Completo de Parâmetros (`.harness/ai-jail.json`)

Cada projeto pode customizar o isolamento editando o arquivo **`.harness/ai-jail.json`**. Abaixo está o detalhamento técnico de cada parâmetro:

| Parâmetro | Tipo | Padrão no Harness | Descrição Detalhada & Impacto de Segurança |
| :--- | :--- | :--- | :--- |
| `rw_maps` | `string[]` | `["~/.opencode", "~/.config/opencode"]` | **Mapeamentos Leitura/Escrita (Read-Write).** Diretórios fora do projeto que o agente tem permissão para ler e modificar. Pode usar `~` para a home do usuário. Útil para caches de ferramentas (ex: `~/.cache`, `~/.npm`, `~/.pnpm-store`). |
| `ro_maps` | `string[]` | `[]` | **Mapeamentos Somente Leitura (Read-Only).** Diretórios visíveis ao agente mas protegidos contra qualquer alteração. Ideal para bibliotecas globais, SDKs do sistema (`/usr/local`, `~/.cargo/registry`, `/usr/share`) sem risco de mutação. |
| `hide_dotdirs` | `string[]` | `[".netrc", ".kube"]` | **Diretórios Ocultos (Dotdirs).** Pastas iniciadas por ponto na home que ficam **completamente invisíveis** dentro do sandbox. Evita vazamento de chaves SSH (`.ssh`), Kubernetes (`.kube`), AWS (`.aws`), Google Cloud (`.gcloud`) ou logins Git (`.netrc`). |
| `mask` | `string[]` | `[".env", ".env.local", "credentials.json", "harness-allowlist.json"]` | **Arquivos Mascarados (Masked Files).** Arquivos específicos na raiz ou subpastas do projeto mascarados como vazios ou inexistentes. Impede que o agente leia credenciais de banco de dados, chaves API ou segredos. |
| `no_docker` | `boolean` | `true` | **Bloqueio do Socket Docker.** Se `true`, bloqueia o acesso a `/var/run/docker.sock`, impedindo que o agente execute containers privilegiados para escapar do sandbox. Defina como `false` apenas em projetos que exigem `docker` ou `docker compose`. |
| `no_private_home` | `boolean` | `true` | **Preservação do Home Real.** Se `true` (padrão do Harness v6), mantém o `$HOME` real acessível (com os mapeamentos aplicados), necessário para carregar agentes em `~/.config/opencode`. Se `false`, cria uma home privada temporária em `/tmp` isolando 100% o ambiente. |

---

### Exemplos Práticos de Configuração

#### 🔹 1. Padrão / Recomendado (Desenvolvimento Web Geral & Node.js)
Ideal para a maioria dos projetos web, APIs e aplicações TypeScript/JavaScript.
```json
{
  "rw_maps": [
    "~/.opencode",
    "~/.config/opencode",
    "~/.npm"
  ],
  "ro_maps": [],
  "hide_dotdirs": [
    ".netrc",
    ".kube",
    ".ssh",
    ".aws",
    ".gcloud"
  ],
  "mask": [
    ".env",
    ".env.local",
    ".env.production",
    "credentials.json",
    "harness-allowlist.json"
  ],
  "no_docker": true,
  "no_private_home": true
}
```

#### 🔹 2. Projeto com Docker & Microserviços (`docker compose`)
Para projetos que exigem execução de containers localmente ou testes de integração com banco de dados.
```json
{
  "rw_maps": [
    "~/.opencode",
    "~/.config/opencode",
    "~/.docker"
  ],
  "ro_maps": [],
  "hide_dotdirs": [
    ".netrc",
    ".kube"
  ],
  "mask": [
    ".env.production",
    "secrets/*.pem"
  ],
  "no_docker": false,
  "no_private_home": true
}
```

#### 🔹 3. Alta Segurança / Isolamento Estrito (Auditorias & CI/CD)
Isolamento máximo: home privada temporária, Docker bloqueado, todas as chaves de nuvem/SSH ocultas e arquivos `.env` mascarados.
```json
{
  "rw_maps": [],
  "ro_maps": [
    "/usr/share"
  ],
  "hide_dotdirs": [
    ".ssh",
    ".aws",
    ".gcloud",
    ".kube",
    ".netrc",
    ".gnupg"
  ],
  "mask": [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "secrets/**"
  ],
  "no_docker": true,
  "no_private_home": false
}
```

#### 🔹 4. Monorepos & Linguagens Globais (Python, Go, Rust)
Mapeia os caches globais das linguagens para garantir alta velocidade de compilação sem comprometer os dados pessoais.
```json
{
  "rw_maps": [
    "~/.opencode",
    "~/.config/opencode",
    "~/.cache",
    "~/.cargo",
    "~/.go"
  ],
  "ro_maps": [
    "/usr/local/go"
  ],
  "hide_dotdirs": [
    ".ssh",
    ".aws",
    ".kube"
  ],
  "mask": [
    ".env",
    "credentials.json"
  ],
  "no_docker": true,
  "no_private_home": true
}
```

---

### 🔄 Regeneração da Configuração do Sandbox

O arquivo `.ai-jail` na raiz do seu projeto é gerado automaticamente a partir das configurações definidas em `.harness/ai-jail.json`.

> [!TIP]
> **Como aplicar alterações:** Sempre que você modificar o arquivo `.harness/ai-jail.json`, remova o arquivo `.ai-jail` na raiz do seu repositório:
> ```bash
> rm .ai-jail
> ```
> O Harness regenerará o `.ai-jail` atualizado automaticamente na próxima execução do OpenCode ou de qualquer ferramenta do workflow.

---

## ⚡ Instalação Rápida

> [!IMPORTANT]
> **Pré-requisito Obrigatório:** Você precisa ter a CLI oficial do **OpenCode** instalada no sistema para rodar o harness.
> Se você ainda não possui o OpenCode instalado, instale-o primeiro executando o comando oficial:
> ```bash
> curl -fsSL https://opencode.ai/install | bash
> ```

Com o OpenCode instalado, execute o comando único abaixo no seu terminal para instalar ou atualizar o Harness v6:

```bash
curl -fsSL https://raw.githubusercontent.com/alexandre-henrique-rp/harnes-opencode/main/install.sh | bash
```

> [!NOTE]
> O instalador é **100% interativo**. Ele detecta automaticamente se você já possui chaves de API do Google Stitch configuradas ou MCPs customizados e realiza um **Smart Merge** automático, mantendo as suas credenciais seguras e criando um backup de segurança em `backup/backup_YYYYMMDD_HHMMSS/opencode.jsonc`.

### Inicialização no Projeto
Entre no diretório do seu projeto de software e chame o harness no runtime do OpenCode:
```bash
cd /caminho/do/seu/projeto
opencode /harness
```
*Para usar o perfil simplificado (ideal para pequenos projetos ou prototipagem):*
```bash
opencode /harness-init --project meu-projeto --profile lean
```

---

## 🔄 Fases e Workflow

O ciclo de desenvolvimento é orquestrado em **6 fases sequenciais**, onde cada fase possui um **Portão (Gate) Binário** que precisa ser obrigatoriamente aprovado para transicionar para o próximo passo.

| # | Fase | Agentes Responsáveis | Artefato Gerado | Portão de Validação (Gate) |
| :--- | :--- | :--- | :--- | :--- |
| **0** | **Briefing** | `briefing` | `.harness/brief.md` | Aprovação do usuário no plano de briefing |
| **1** | **Documentação** | `documenter` + `rag-curator` | `AGENTS.md` + `RAG/index.json` | Validação de presença e mínimo de 3 docs |
| **2** | **Requisitos** | `requirements` + `prd-reviewer` + `spec-reviewer` | `PRD.md` + `SPEC.md` | Avaliação de score técnico (PRD ≥ 80, SPEC ≥ 85) |
| **3** | **Design** | `designer` + `design-reviewer` | `PRODUCT.md` + `<page>.DESIGN.md` | Score estético de UI/UX (Design ≥ 70) |
| **4** | **Planejamento** | `sprint-tasker` + `planning-reviewer` | `.harness/sprints/*.json` | Cobertura total (100% dos itens da SPEC mapeados) |
| **5** | **Build + Quality** | orchestrator + implementar + testar + auditors | Código fonte + Testes + Logs | Cobertura de testes ≥ 85%, 0 bugs graves e conformidade LGPD |

---

## 👥 Time de Agentes (Roster)

O harness opera em estrutura hierárquica baseada em delegação direcionada. Nenhum subagente possui capacidade de execução genérica fora do seu escopo físico delimitado.

```
orchestrator (Primary)
├── briefing (Briefing inicial)
├── documenter (Documentação do projeto) ── rag-curator (Gerenciamento de RAGs)
├── requirements (Levantamento de PRD/SPEC) ── prd-reviewer, spec-reviewer (Revisões)
├── designer (Design e Stitch UI) ── design-reviewer (Auditor de a11y/Impeccable Bans)
├── sprint-tasker (Planejamento de Tarefas) ── planning-reviewer (Validação de cobertura)
└── Implementação e Qualidade (Fase 5)
    ├── backend (Desenvolvedor de APIs e Lógica)
    ├── frontend (Desenvolvedor de Telas e Estilos)
    ├── tester (Criador e Executor de Casos de Teste)
    ├── security (Varreduras de vulnerabilidades e XSS)
    ├── lgpd-officer (DPO - Auditora jurídica de conformidade digital)
    └── qa-gate (Revisor final de entrega de build)
```

---

## 🛑 Princípios Não-Negociáveis

Para garantir que a IA produza códigos limpos e funcionais sem introduzir "lixo" ou padrões genéricos de IA, o harness reforça 8 regras estruturais em todos os agentes:

1. **Single Responsibility:** Cada agente resolve apenas um problema delimitado.
2. **Defense in Depth:** 3 camadas de permissão protegem a execução de comandos e arquivos.
3. **Declarative State:** A máquina de estados e fluxo são declarados em contratos JSON auditáveis.
4. **Lean Context:** Arquivos de RAG locais crescem organicamente no projeto, sem inflar o contexto de prompt.
5. **Audit Total:** Toda e qualquer chamada de ferramenta de IA é gravada em logs append-only.
6. **TDD Obrigatório (Red-Green-Refactor):** É proibido implementar código de funcionalidade sem criar um teste automatizado correspondente primeiro.
7. **Documentação de API Estrita:** Todas as funções públicas devem conter comentários estruturados (JSDoc/docstring) com `@param`, `@returns` e `@throws`.
8. **Simplicidade (YAGNI & KISS):** Evitar sobre-engenharia. Abstrações só podem ser criadas a partir da terceira repetição do mesmo padrão em locais distintos.

---

## ⚠️ Protocolo de Falhas

O tratamento de incidentes e falhas é padronizado por classificação de causa raiz nos logs:

| Classe de Falha | Gatilho / Sintoma | Ação Corretiva do Harness |
| :--- | :--- | :--- |
| **`transient`** | Erro de rede, API do modelo fora do ar, limites excedidos | Auto-retry imediato por 3 tentativas com backoff incremental (1s, 3s, 9s) |
| **`quality`** | Score de revisão de código, UI ou testes abaixo do limite mínimo | Rework automatizado com fluxo de loopback para o agente executor (limite de 2x) |
| **`user-action`** | Falha de permissão de escrita, caminhos fora do allowlist ou ambiguidade | Pausa a execução de forma segura e escala o prompt com perguntas claras para o usuário humano |
| **`fatal`** | Erro de compilação, sintaxe quebrada de código ou arquivos JSON corrompidos | Interrompe o processo imediatamente (Halt) e solicita correção manual do desenvolvedor |

---

## 🛠️ Organização do Repositório

```
opencode-agents-v6/
├── install.sh                  # Instalador interativo cross-platform do harness
├── opencode.json               # Configurações globais de MCPs, permissões e plugins
├── state-machine.json          # Contrato de fases, transições e gates binários
├── GERAIS.md                   # System Prompt central do harness (bilingue PT-BR/EN)
├── .harness/ai-jail.json       # Configuração do sandbox ai-jail por projeto
├── agents/                     # Identidades dos 20 agentes especializados
├── commands/                   # Comandos expostos na interface do OpenCode (/harness-*)
├── plugins/                    # Plugins customizados do OpenCode (audit, path boundary)
├── templates/                  # Modelos de PRD, SPEC, RAG e sprints
├── tools/                      # Ferramentas TypeScript auxiliares (status, build)
└── examples/                   # Projetos de referência e aplicação prática do harness
```

---

## 🤝 Contribuições e Créditos

Quer contribuir com o projeto? Leia nossas diretrizes completas em [CONTRIBUTING.md](file:///home/kingdev/.config/opencode/CONTRIBUTING.md) para saber como começar!

### 🛡️ ai-jail — Sandbox para Agentes de IA

O **[ai-jail](https://github.com/akitaonrails/ai-jail)** é uma ferramenta de sandboxing criada por **[Fabio Akita (@akitaonrails)](https://github.com/akitaonrails)** que isola a execução de agentes de IA em nível de kernel, usando bubblewrap (Linux) ou sandbox-exec (macOS). Ele protege o sistema host contra comandos perigosos enquanto permite que os agentes trabalhem de forma segura.

- **Criador:** [Fabio Akita](https://github.com/akitaonrails) — [@akitaonrails](https://twitter.com/akitaonrails)
- **Repositório:** [github.com/akitaonrails/ai-jail](https://github.com/akitaonrails/ai-jail)
- **Artigo explicativo:** [Dicas e Toolkit de IA do Akita - ai-jail, ai-memory, ai-usagebar](https://akitaonrails.com/2026/05/24/dicas-e-toolkit-de-ia-do-akita-ai-jail-ai-memory-ai-usagebar/)

### Créditos Gerais

* **Fabio Akita ([@akitaonrails](https://github.com/akitaonrails)):** Criador do ai-jail e inspirador das discussões sobre a metodologia de *vibe-coding*, TDD e disciplina extrema em engenharia de software aplicada ao desenvolvimento com IA. Conceitos e inspirações extraídos de seu blog oficial [AkitaOnRails](https://akitaonrails.com/).
* **OpenCode (sst/opencode):** Runtime de alto desempenho para execução e orquestração de agentes.

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para maiores informações.
