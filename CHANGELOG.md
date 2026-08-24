# Changelog

All notable changes to OpenCode Agents v6 are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [6.5.0] - 2026-08-24

### PATCH — A4: shell em tools centralizado e seguro

Sem sandbox (decisão da seção anterior), toda chamada `execSync`/`spawnSync` virou ponto de risco. Criado `tools/lib/safe-exec.ts` com 3 helpers:

- **`safeExec(cmd, args[], opts)`** — wrapper de `execFileSync`. Args como array, sem shell. Timeout default 30s. Ambiente mínimo (PATH + HOME + LANG). Bloqueia path traversal no cwd.
- **`runGit(args[], opts)`** — wrapper para git com whitelist de subcomandos (`init`, `add`, `branch`, `commit`, `diff`, `fetch`, `log`, `rev-list`, `rev-parse`, `show`, `status`, `tag`, `stash`, `checkout`, `merge`, `rebase`, `reset`, `config`) e blacklist de opções perigosas (`--upload-pack`, `--receive-pack`, `--exec`).
- **`safeShellExec(args[], opts)`** — escape hatch para casos legítimos de shell, com blacklist de metacaracteres (`;`, `&&`, `||`, `|`, `>`, `<`, `` ` ``, `$(`, `\n`, `\r`).

**Migrados:** `git-automator`, `git-commit-manager`, `harness-checkpoint`, `review-packager`, `pr-automator`, `changelog-automator`, `vuln-checker`, `playwright-runner`, `progress-tracker`, `security-scanner`, `harness-doctor`. Zero `execSync`/`spawnSync` em `tools/` e `plugins/`.

**Tests:** `tests/safe-exec.test.ts` (17 testes) — args como array não interpretam shell, exit code propagado, blacklist git, path traversal bloqueado, cwd customizado.

## [6.5.0] - 2026-08-24

### BREAKING — Sandbox ai-jail removido

### BREAKING — Sandbox ai-jail removido

A integração com o sandbox de kernel `ai-jail` (criado por Fabio Akita) foi descontinuada. Toda a segurança de escrita passa a ser exercida exclusivamente pelo plugin `path-boundary`.

**Removido:**
- `plugins/native-sandbox.ts` (plugin de wrapping de comandos)
- `tests/ai-jail-sandbox.test.ts` (testes do plugin)
- `commands/harness-jail.md` (slash command)
- Função `diagnoseSandbox()` em `tools/harness-workspace.ts`
- Função `ensureAiJailConfig()` em `tools/harness-workspace.ts`
- Seção `sandbox` no relatório de `tools/harness-doctor.ts`
- Variáveis `AI_JAIL_ACTIVE` e `HARNESS_NO_SANDBOX` (de `tools/env.example`)
- Arquivo `.harness/ai-jail.json` da distribuição
- Padrão `.ai-jail` da allowlist de migração

**Fortalecido (em substituição):**
- `path-boundary-core.ts::suggestAllowPattern` — corrigido A1 (auto-allow `**` em arquivos da raiz → agora retorna o próprio nome do arquivo)
- `path-boundary-core.ts::evaluate` — corrigido A2 (default `HARNESS_PATH_BOUNDARY_MODE` agora é `fail-closed`; valor inválido cai no fail-closed com warning)

**Migration:**
- Quem dependia de `AI_JAIL_ACTIVE=1`: migrar regras para `harness-allowlist.json` + frontmatter dos `agents/*.md`
- Quem tinha regras em `.harness/ai-jail.json`: traduzir `rw_maps` → `allow`, `mask`/`hide_dotdirs` → `deny`
- Modo fail-open legado: definir explicitamente `HARNESS_PATH_BOUNDARY_MODE=fail-open` no env

## [6.4.6] - 2026-08-22

### Minor — Feedback Visual, Resiliência de Testes e UX no Path Boundary

- **Path Boundary PX & Reminders:** Injeção do hook `experimental.chat.system.transform` com cache de bloqueios recentes (`<system-reminder>`), permitindo que a IA mantenha consciência dos bloqueios de escrita mesmo em respostas truncadas.
- **Notificações Visuais TUI:** Toast e prompt assistido (`appendPrompt`) ao bloquear escritas para orientar o desenvolvedor sobre o comando de autorização (`harness-allowlist`).
- **Instalador & Allowlist CLI:** Adicionado parâmetro `--add-allow` no `install.sh` e suporte a bypass via `HARNESS_ALLOWLIST_AUTO_CONFIRM=1` para automações e suítes de teste.
- **Suíte de Validação 100% Passing:** Ajuste e estabilização de 144 testes unitários e de integração (`npm run validate` 100% aprovado).

## [6.4.5] - 2026-08-21

### Patch — Plugin warnings não poluem mais a UI do TUI

Fecha lacuna de UX: 15 fontes (`process.stderr.write` + `console.error`) em 4 arquivos jogavam texto cru em stderr que o TUI do OpenCode renderizava **competindo com a input bar**. Conforme o usuário digitava, o redesenho da TUI sobrescrevia as mensagens, criando confusão visual.

### Culpados identificados

| Origem | Ocorrências | Tipo de mensagem |
|---|---|---|
| `plugins/path-boundary.ts` (10 ocorrências `process.stderr.write`) | 10 | BLOCKED, WARNING allowlist, RATE LIMIT, RAM, AUTO-ALLOW |
| `plugins/status-injector.ts` (2 `process.stderr.write`) | 2 | session started, fallback tip |
| `plugins/native-sandbox.ts` (1 `process.stderr.write`) | 1 | sandbox unavailable hint |
| `resolveProjectCwd(ctx, { log: console.error })` em 3 plugins | 3 | cwd fallback warning |

### Changed — `plugins/lib/quiet-warn.ts` (NOVO, 43 linhas)
- Helper `quietWarn(pluginName, message)` faz append em `.harness/plugin-warnings.log`
- Fail-silent: erro de IO não bloqueia execução do plugin
- Side-channel opcional: se `HARNESS_PLUGIN_LOG=1`, também escreve em stderr (modo debug)
- Independente de `safe-logger.ts` (que tem outros contratos)

### Changed — `plugins/path-boundary.ts`, `status-injector.ts`, `native-sandbox.ts`
- 13 `process.stderr.write(...)` substituídos por `warn(...)` (ou removidos quando info já ia no `throw`)
- Helpers locais `const warn = (msg) => quietWarn(pluginName, msg)` adicionados
- Imports `quietWarn` adicionados

### Changed — `audit-logger.ts`, `path-boundary.ts`, `status-injector.ts`
- 3 callsites `resolveProjectCwd(ctx, { log: console.error })` substituídos por `resolveProjectCwd(ctx, { log: (m) => quietWarn(pluginName, m) })`
- Preserva rastreabilidade sem poluir UI

### Por que novo helper em vez de mudar `safe-logger.ts`
- `safe-logger.ts` é usado por 5 plugins (`token-budget`, `context-compressor`, `prompt-cache-prefixer`, `structured-thinking`, `stuck-worker-watchdog`) com expectativas diferentes
- Mudar globalmente pode regredir logging legítimo (níveis `warn`/`error` são intencionais)
- `quiet-warn.ts` é específico para stderr cru → arquivo, sem conflitar

### Known limitations
- `safe-logger.ts` ainda chama `client.session.log` que pode renderizar em algum path do runtime dependendo da versão. Mitigação: as fontes que escrevem em stderr estão eliminadas; resíduo via `client.session.log` é raro.
- `resolveProjectCwd` callback agora é silencioso por padrão. Para debug, usar `HARNESS_PLUGIN_LOG=1`.

## [6.4.4] - 2026-08-21

### Patch — Regra de Minimalismo (anti-over-engineering)

Fecha lacuna: agentes (LLMs) tinham viés natural para abstração, logging excessivo e refactor oportunista. Adiciona limites numéricos, stop rules, anti-patterns cirúrgicos e auto-eligibilidade para lean profile.

### Changed — `GERAIS.md` §6.4 (nova seção)
- **6.4.1 Limites numéricos por tipo de task** (LOC/arquivos/tempo). Ao se aproximar do limite → PARE e `question`.
- **6.4.2 Stop rule**: você PARA quando (a) ACs passing, (b) limite atingido, ou (c) decisão ambígua → ESCALAR.
- **6.4.3 Anti-patterns cirúrgicos**: 7 violações sempre detectadas (tocar adjacente, logging extra, utils especulativos, type guards especulativos, comentários óbvios, drive-by fix).
- **6.4.4 YAGNI checkpoint inline**: regra de 3 explícita antes de criar abstração.
- **6.4.5 Auto-eligibilidade para lean profile**: 4 critérios (≤3 ACs, sem regras críticas, sem PII, sem migration). Critérios copiados em `state-machine-lean.json → autoEligibility` para referência programática.

### Changed — `agents/code-reviewer.md`
- Novo item 17: **Ratio LOC/AC** (gate crítico contra over-engineering). Limites: ≤50 excelente, 50-150 ok, 150-300 warning, >300 block.
- Checklist agora 17 itens (era 16). Score = passed/17 × 100.
- Como medir: `git diff --shortstat` para LOC, `ac_count` da task description ou SPEC.

### Changed — `state-machine-lean.json`
- Novo campo `autoEligibility` no topo: critérios, howToApply, skippedPhases, skippedAgents.
- Documenta programaticamente a regra de §6.4.5 do GERAIS.md (auto-trigger do orchestrator).

### Por que essas escolhas
- **Patches em arquivos existentes, sem criar arquivos novos**: skill/plugin/JSON-schema seriam over-engineering aqui. A regra no system prompt é onde LLM lê.
- **Ratio LOC/AC como gate crítico**: detecta a patologia #1 do LLM (código extra). Não dá para "passar" com diff inflado justificando.
- **Auto-trigger via documentação**: o orchestrator já carrega state.json no init — basta o campo existir para que a checagem programática seja trivial. Não implementamos a checagem automática em código porque (a) é 1 linha de regra no prompt do orchestrator, (b) implementação complexa = mais bug que valor.

### Known limitations
- §6.4.1 e §6.4.2 são regras de prompt, não enforcement técnico. Worker que ignora vai over-engineerar. Mitigação: o gate ratio LOC/AC do code-reviewer é enforcement real.
- Auto-trigger do lean profile depende do orchestrator checar `state.leanEligibility` (a ser adicionado em sprint futura). Por ora, decisão fica no `harness-init --profile` manual.

## [6.4.3] - 2026-08-21

### Patch — Worker Escalation Protocol (stuck-worker detection)

Fecha lacuna estrutural: workers ficavam presos em loops de até 1h sem canal para pedir socorro ao orchestrator. Agora detectam travamento por signal (mesmo erro 3x, >10min elapsed, >80% budget, erro estrutural, ambiguidade) e emitem `escalation` estruturado no JSON de retorno.

### Added — `plugins/stuck-worker-watchdog.ts` (enforcement técnico)
- Detecta worker em **loop** (3+ tool calls idênticos em janela de 5min) via hook `tool.execute.after`
- Detecta worker **idle** (10min+ desde último call com sucesso) via hook `model.complete.after`
- Injeta `<system-reminder>` no output do próximo model complete, forçando o LLM a emitir `escalation` e parar
- Cooldown de 60s entre reminders (evita poluir contexto)
- Configurável via `opencode.json → stuckWorkerWatchdog`
- ~170 linhas, sem dependências novas

### Added — `skills/harness/worker-escalation/SKILL.md`
- Protocolo completo de stuck-worker detection
- Schema JSON do bloco `escalation` (`triggered`, `class`, `attempts`, `elapsedMs`, `lastError`, `tried`, `proposedActions[]`, `contextForOrchestrator`)
- 4 classes: `loop` | `budget` | `structural` | `ambiguity`
- Regras claras de quando escalar vs quando retry local (transient ≠ escalation)
- Anti-patterns para workers e orchestrator

### Changed — `agents/tester.md` (passo 4.5 novo)
- Tabela de sinais que disparam escalation (3+ hashes idênticos / >10min / >80% budget / erro estrutural / ambiguidade)
- Auto-correlação de erro por `sha1(exitCode + stderr[:200])`
- Regra explícita: NÃO escale transient (502/503/504 → retry local)
- Anti-patterns atualizados proíbem escalation prematura e `readyForQAGate: true` após escalar

### Changed — `agents/orchestrator.md` (handler novo)
- Seção "Se worker retorna `escalation.triggered: true`": 6 passos canônicos (ler, classificar, decidir, agir, loggar)
- Mapeamento classe → ação: `loop` (re-dispatch com hint), `budget` (checkpoint + reduzir escopo), `structural` (re-routing para owner correto), `ambiguity` (escalar ao humano via `question`)
- Log obrigatório em `events.jsonl` com `escalation.handled`
- 3 anti-patterns novos proíbem ignorar escalation, re-dispatch com mesmas instruções, perguntar ao usuário antes de ler contexto

### Changed — `opencode.json` e `plugins/AGENTS.md`
- Plugin registrado no array `plugin`
- AGENTS.md lista o novo plugin com referência ao path

### Por que JSON field e não nova tool
Trade-off documentado na skill: criar tool `escalate` exigiria editar permission-block de todos os workers (orchestrator é owner do schema). JSON field no output existente não exige mudanças de permissão. Limitação aceita: escalation dispara no fim da execução do worker, não mid-flight. Mitigação: workers devem rodar ≤10min para que essa latência seja aceitável.

### Known limitations (não resolvidos nesta versão)
- Plugin **não aborta** worker (OpenCode runtime não permite). Força via reminder; se LLM ignorar, último recurso é humano encerrar.
- Sem enforcement de token budget por chamada (apenas `token-budget.ts` separado, sem correlação com `escalation.budget`).
- Sem auto-classificação (orchestrator pode discordar da classe declarada pelo worker — usa a dele mas loga).

## [6.4.2] - 2026-08-04

### Patch — Resiliência do Sandbox ai-jail/bwrap

Esta é uma versão de correção focada em tornar o sandbox ai-jail robusto contra ambientes onde o kernel não tem user namespaces (WSL2, Docker sem `--privileged`, distros hardened). A v6.4.1 quebrava todos os comandos bash nesses ambientes porque assumia que `ai-jail` instalado = `bwrap` funcional. A v6.4.2 corrige isso com probe real + fallback gracioso.

### Fixed — Sandbox ai-jail (Auto-fallback)
- **`plugins/native-sandbox.ts`**: Substituído `command -v ai-jail` (que retornava sucesso mesmo com `bwrap` quebrado) por um **probe real** (`ai-jail --exec echo` com timeout 5s). Quando o probe falha, o plugin agora pula o wrapping completamente em vez de quebrar todos os comandos bash. Honra `AI_JAIL_ACTIVE=1` (sessão pai já sandboxed) e `HARNESS_NO_SANDBOX=1` (opt-out explícito). Status cacheado em disco por 24h para evitar re-detectar.
- **`tools/harness-workspace.ts`**: Adicionada função `diagnoseSandbox()` que detecta ai-jail/bwrap, lê `/proc/sys/kernel/unprivileged_userns_clone`, e gera recomendação contextual. Resultado persistido em `.harness/sandbox-diagnostic.json`. `ensureAiJailConfig()` agora é silencioso em falha (não bloqueia o harness).
- **`tools/harness-status.ts`**: Tool agora defensivo total — try/catch envolvendo toda a execução. Cada `JSON.parse` tem fallback próprio. Nunca propaga throw "Cannot read properties of undefined (reading 'split')". Retorna `success: false` + `recommendation` em vez de quebrar.

### Added — Allowlist a Nível de Projeto
- **`plugins/path-boundary.ts`**: Agora lê `.harness/harness-allowlist.json` (project-level) **E** `~/.config/opencode/harness-allowlist.json` (global), mesclando as duas. **Deny rules** de ambas são aplicadas (defense in depth). **Allow rules** de ambas são OR'ed (qualquer match permite). Permite customizar paths por projeto sem editar o allowlist global. Variável de ambiente `HARNESS_PATH_BOUNDARY_MODE=fail-closed` continua funcionando.
- **`tools/harness-init.ts`**: Cria `.harness/harness-allowlist.json` automaticamente no `harness_init`, com template inicial (arrays vazios para `allow` e `deny` + comentários explicativos).
- **`install.sh ensure_project_allowlist()`**: Nova função que cria `.harness/harness-allowlist.json` com defaults (`docs/**`, `scripts/**`) se o arquivo não existir. Chamada automaticamente no fluxo do `install.sh`.
- **`install.sh --add-allow <pattern>`** / **`--add-deny <pattern>`**: Adiciona pattern ao allowlist do projeto via CLI. Idempotente (não duplica).
- **`install.sh --show-allowlist`**: Mostra o merged allowlist efetivo (project + global) com origem de cada regra.
- **`tools/harness-allowlist.ts`**: Novo MCP tool com ações `list`, `add`, `remove`. Permite ao agente liberar paths bloqueados sob confirmação do usuário. Aceita `target=project|global` para customizar onde aplicar.
- **Mensagens de erro do path-boundary**: Agora incluem dica acionável quando o path é bloqueado por estar fora da allowlist — sugere o pattern que o usuário pode adicionar via `./install.sh --add-allow`.

### Added — Hot-reload + Auto-allow (Reduz Fricção)
- **`plugins/path-boundary.ts` — Hot-reload via mtime**: Allowlist agora é recarregado automaticamente quando o arquivo `.harness/harness-allowlist.json` muda (mtime check). **Não precisa reiniciar o opencode** após editar o allowlist — basta retentar.
- **`HARNESS_AUTO_ALLOW_ON_BLOCK=1`** (env var): Modo "confie no desenvolvedor". Quando setado, o plugin adiciona **automaticamente** o pattern sugerido ao `.harness/harness-allowlist.json` e permite a escrita. Reduz de 4 round-trips (erro → user edit → restart → retry) para **1 round-trip** (auto-grant na primeira tentativa).
- **Mensagens de erro otimizadas para LLM**: Agora começam com `>>> ACAO OBRIGATORIA PARA O AGENTE <<<` e mandam explicitamente PARAR e perguntar ao usuário via `question` tool. Incluem comando exato (`./install.sh --add-allow <pattern>`) e aviso de que hot-reload dispensa restart.
- **`tools/env.example`**: Documenta `HARNESS_AUTO_ALLOW_ON_BLOCK=0` com aviso de segurança (não usar em CI/produção).
- **`tests/path-boundary-hot-reload.test.ts`**: 16 testes (12 originais + 4 novos) cobrindo hot-reload, cache hit/miss, auto-allow, ALWAYS_DENY precedence, deny precedence, audit log, kill switch (.no-auto-allow + HARNESS_NO_AUTO_ALLOW), cooldown.

### Added — Kill Switches + Audit Log + Cooldown
- **Audit log de auto-add**: Cada adição automática grava em `.harness/audit/auto-allow.jsonl` com `ts`, `pattern`, `type`, `blockedPath`, `source` ("auto"/"manual"). Permite rastrear o que foi liberado automaticamente.
- **`.harness/.no-auto-allow`** (marker file): Kill switch **por projeto**. Quando este arquivo existe, o plugin NÃO auto-adiciona patterns mesmo com `HARNESS_AUTO_ALLOW_ON_BLOCK=1`. Criado por `./install.sh --no-auto-allow`, removido por `./install.sh --enable-auto-allow`.
- **`HARNESS_NO_AUTO_ALLOW=1`** (env var): Kill switch **global**. Sobrescreve `HARNESS_AUTO_ALLOW_ON_BLOCK`. Útil em demos, gravação de tela, ambientes compartilhados.
- **`HARNESS_AUTO_ALLOW_COOLDOWN_MS`** (env var, default 60000ms): Cooldown para evitar spam quando o mesmo pattern é bloqueado repetidamente em loop. Defina 0 para desabilitar.
- **`install.sh --no-auto-allow`** / **`--enable-auto-allow`**: Toggle do marker file do projeto.
- **`package.json`**: Novos scripts `setup:no-auto-allow`, `setup:enable-auto-allow`, `setup:audit-auto-allow` (`tail -f` do audit log).

### Added — `harness-doctor` Tool + Rate Limit + `--show-audit`
- **`tools/harness-doctor.ts`**: Novo MCP tool consolidado. Retorna relatório estruturado com `summary` (status, score 0-100, issues), `environment` (node/bun/opencode/ai-jail/bwrap), `harness` (init state, phase, progresso), `allowlist` (merged, auto-allow status, cooldown, rate limit), `sandbox` (status + recomendação), `audit` (entries, lastAutoAdd), e `recommendations` priorizadas. Suporta `report=summary` ou `report=full`.
- **`HARNESS_AUTO_ALLOW_MAX_PER_MIN`** (env var, default 10): Rate limit sliding window para auto-adds. Após N auto-adds em 60s, bloqueia com mensagem clara no stderr. Evita loops infinitos do agente poluindo o allowlist. Defina 0 para desabilitar.
- **`install.sh --show-audit [--show-audit=auto|manual|all] [--audit-limit=N]`**: Mostra o audit log de auto-allow. Suporta filtro por `source` (auto/manual/all) e `--audit-limit=N` (default 20). Formato legível com timestamps, source, type e pattern.
- **`tests/harness-doctor.test.ts`**: 9 testes cobrindo summary/full, score, harness state, allowlist info, sandbox, auto-allow flag, .no-auto-allow detection, audit counting.
- **`tests/path-boundary-hot-reload.test.ts`**: +1 teste (17) cobrindo rate limit com `MAX_PER_MIN=2` (verifica que 3º auto-add é bloqueado).
- **`package.json`**: Novo script `setup:show-audit`.

### Changed — `path-boundary.ts`
- Removido uso de `actualAllowlistPath` hardcoded para global. Agora usa `loadMergedAllowlist(config.cwd)` que combina project + global.
- Mensagens de erro ajustadas para refletir merged allowlist ("Denylist match" em vez de "Global denylist match").

### Added — Testes de Resiliência
- **`tests/ai-jail-sandbox.test.ts`**: 10 testes cobrindo `diagnoseSandbox` (5 cenários), `persistDiagnostic`, `harness-workspace` tool, e `harness-status` defensivo (3 cenários: `.harness/` ausente, `state.json` corrompido, `state.json` válido com progresso).

### Added — Empacotamento Limpo para Download
- **`tools/DIST-MANIFEST.json`**: Manifest declarativo listando pastas (`agents/`, `commands/`, `plugins/`, `skills/`, `templates/`, `tools/`, `training/`, `config/`, `docs/`, `examples/`, `schemas/`, `system/`) e arquivos essenciais (`AGENTS.md`, `install.sh`, `opencode.json`, `state-machine.json`, etc.) para distribuição. Inclui `excludePatterns` para filtrar "sujeira" (backup/, tmp/, .harness/audit/, .env*, etc.).
- **`install.sh --list-essentials`**: Lê `tools/DIST-MANIFEST.json` e mostra o que entra/sai de um pacote.
- **`install.sh --package <caminho.tar.gz>`**: Cria tarball limpo com apenas os arquivos essenciais, filtrando backup/, tmp/, .harness/audit/, etc. Equivalente npm: `npm run setup:package`.
- **`install.sh ensure_gitignore()`**: Agora adiciona ~15 entradas de "sujeira" (backup/, tmp/, .harness/tmp/, .harness/audit/, .env*, *.log, dist/, build/, coverage/, .DS_Store, .idea/, .vscode/, *.tar.gz, *.zip).
- **`package.json`**: Novos scripts `setup:list-essentials` e `setup:package`.

### Changed — `install.sh`
- `install.sh` agora é **validador**, não modificador. Detecta paths hardcoded em `opencode.json(c)` e alerta com linhas exatas, mas **não modifica** esses arquivos (config do usuário é sagrada).
- Adicionados `--list-essentials` e `--package <path.tar.gz>` para distribuição limpa.
- `ensure_gitignore()` expandido com ~15 entradas de "sujeira" (backup/, tmp/, .harness/audit/, .env*, *.log, etc.).

### Documentation
- **`HARNESS-README.md`**: Seção "Auto-fallback (Resiliência)" adicionada.
- **`HARNESS-README.md`**: Seção "Empacotamento para Download" adicionada.
- **`tools/UPDATE-6.4.2.md`**: Release notes detalhadas com antes/depois, mudanças técnicas e migração.

## [6.4.1] - 2026-07-15

### Fixed — ai-jail Sandbox Integration
- **Wrapper do opencode (`install.sh`)**: Corrigido `--private-home` → `--no-private-home` para permitir acesso a `~/.config/opencode` (agents, commands) e `~/.opencode` (plugins) dentro do sandbox. Antes, o ai-jail isolava o home directory e bloqueava o acesso aos agents e funções do opencode.
- **harness-workspace.ts**: Ferramenta agora lê `.harness/ai-jail.json` para gerar o `.ai-jail` dinamicamente, em vez de usar flags hardcoded.

### Added — Configuração do ai-jail por Projeto
- **`.harness/ai-jail.json`**: Novo arquivo de configuração do ai-jail por projeto. Permite customizar `rw_maps`, `ro_maps`, `hide_dotdirs`, `mask`, `no_docker` e `no_private_home` por projeto.
- **Documentação ai-jail**: Seção completa no README explicando a integração, o criador (Fabio Akita) e como customizar o sandbox.

### Changed
- Wrapper do opencode usa `--no-private-home` para preservar acesso ao config do opencode.
- Configuração do `.ai-jail` atualizada com `private_home = false`.

## [6.3.1] - 2026-06-24

### Fixed — Correções Críticas de Segurança & Sandboxing
- **Sandboxing de Escrita (`path-boundary.ts`)**: Corrigida falha grave onde ferramentas nativas de escrita de arquivos (`write_to_file`, `replace_file_content`, `multi_replace_file_content`) e o parâmetro `TargetFile` burlavam silenciosamente o plugin de path boundary.
- **Validação de Gates de Score (`harness-advance.ts`)**: Impedida fraude e bypass pelo orquestrador LLM. A ferramenta agora valida a pontuação diretamente nos arquivos físicos de relatório salvos na pasta `.harness/reviews/`.
- **Command Injection (`pii-detector.ts`)**: Corrigido risco crítico de execução de comandos arbitrários (RCE) via `execSync` com injeção de parâmetros. A busca por PII foi reescrita em Node.js nativo puro (multiplataforma, sem grep do terminal).
- **Instalador de Skills (`install.sh`)**: Corrigido instalador para copiar corretamente a pasta de `skills/` no diretório global de configuração do opencode, incluindo as regras de `"skills/**"` na allowlist padrão do projeto.

### Added — Google Stitch & Automação de Frontend
- **Design Tokens & Stitch (`designer.md`, `orchestrator.md`)**: Integração e geração automática de prompts de UI em prompt único robusto com base no Google Stitch MCP e incorporação de `web-design-guidelines` e `impeccable`.
- **Validação com Playwright local (`playwright-runner.ts`, `tester.md`)**: Validador automatizado local rodando Playwright no root para gerar vídeos e relatórios de falhas de UI sem gastar tokens com o MCP.

## [6.3.0] - 2026-06-13

### Added — Planejamento Fractal + Marcos de UX + Suite de Automação

#### Planejamento Fractal e Marcos de UX
- **Novo Fluxo de Planejamento**: O projeto agora é dividido em **Marcos (Milestones)** para validação de UX, contendo Sprints e Tasks granulares.
- **Micro-Contexto**: Cada task possui seu próprio `TXXX_PROMPT.md` (Micro-PRD/SPEC), reduzindo drasticamente o consumo de tokens.
- **Planning-First Rule**: O Orchestrator bloqueia a execução de código até que 100% do planejamento fractal esteja pronto e validado.
- **Cabeçalho de Status YAML**: Todos os arquivos de planejamento agora possuem cabeçalhos obrigatórios (`status`, `id`, `sprint`, etc.) para parsing rápido.
- **Portão de UX (Phase 6)**: Nova fase de aprovação humana obrigatória após a conclusão de cada Marco de entrega.

#### Suite de Automação (10 novas tools/funções)
- **`task_manager.ts`**: Automatiza a atualização de status e criação de logs de tasks.
- **`context_query.ts`**: Busca contexto granular sobre componentes e decisões passadas para evitar conflitos.
- **`security_scanner.ts`**: Scan automatizado de OWASP e segredos (substitui grep manual no agente Security).
- **`pii_detector.ts`**: Identificação automática de dados pessoais para o agente LGPD Officer.
- **`rag_manager.ts`**: Validação e reconstrução atômica do `RAG/index.json`.
- **`git_commit_manager.ts`**: Criação de commits semânticos automáticos baseados nos logs de task.
- **`progress_tracker.ts`**: Visão geral do progresso do projeto baseada nos headers das tasks.
- **`test_codegen.ts`**: Geração automática de código Playwright a partir de cadeias declarativas (JSON).
- **`coverage_analyzer.ts`**: Resumo inteligente de cobertura de testes (Vitest/Jest).

### Changed
- **`state-machine.json`**: Atualizado para incluir as fases de Planejamento Fractal e UX Gate.
- **Agentes Otimizados**: `orchestrator`, `sprint-tasker`, `backend`, `frontend`, `security`, `lgpd-officer`, `rag-curator` e `tester` agora usam obrigatoriamente as novas tools de automação.
- **`templates/RAG-TEMPLATE.md`**: Agora exige campo `summary` para listagem rápida.
- **`templates/TASK-PROMPT-TEMPLATE.md`**: Novo template para prompts granulares de task.
- **`templates/MILESTONE-TEMPLATE.json`**: Novo template para definição de marcos de UX.

### Fixed
- **Consumo de Tokens**: Redução massiva de tokens ao evitar a leitura redundante de PRD/SPEC globais por múltiplos workers paralelos.
- **Rastreabilidade**: Todas as decisões técnicas agora são logadas em arquivos `TXXX_LOG.json` e registradas no `registry.json` global.

## [6.2.0] - 2026-06-07

### Added — LGPD Officer + RAG LGPD + 3 princípios de engenharia

#### Novo agent: `lgpd-officer` (DPO/advogada especializada)
- Persona: advogada especializada em direito digital + proteção de dados
- Roda ao **final de cada sprint** como 5º worker do phase 5 (fan-out paralelo com backend/frontend/tester/security)
- **NÃO corrige código** — audita, encontra gaps, propõe mudanças com base legal citada
- Cobre 10 categorias: princípios (Art. 6º), bases legais (Art. 7º/11), direitos do titular (Art. 18), DPO (Art. 41), resposta a incidente (Art. 48), transferência internacional (Art. 33-36), cookies (Res. CD/ANPD 4/2023), RIPD (Art. 38), compartilhamento (Art. 26-27), retenção (Art. 6º, V)
- Bloqueia sprint se encontrar finding `critical` ou `high` em Art. 18 (direitos) ou Art. 48 (incidente) ou Art. 41 (DPO)
- Relatório em `.harness/lgpd/audit-<timestamp>.json` + `qa/lgpd/lgpd-sprint-<id>.json`
- Permissões: `edit: deny`, `task: deny` (igual `security`)

#### Novo RAG global: `lgpd-brasil.md` (33KB)
- Localização: `training/lgpd-brasil.md` (repo) → `~/.config/opencode/training/lgpd-brasil.md` (instalado)
- Cobre: Lei 13.709/2018 + Decreto 10.474/2020 + 7 Resoluções ANPD vigentes (1, 2, 4, 15, 18, 19, 23) + Marco Civil da Internet + comparação com GDPR + jurisprudência STJ + casos públicos da ANPD
- Inclui 7 exemplos de código (schemas, endpoints, criptografia, consentimento, auditoria, resposta a incidente) + 10 antipadrões comuns + cross-refs
- Categoria: `law` | Priority: `critical` | Scope: `global` (disponível em todo projeto)

#### 3 novos princípios não-negociáveis (em GERAIS.md)
- **TDD é OBRIGATÓRIO** — ciclo red-green-refactor; código de feature sem teste falhando antes = violação
- **Documentação é OBRIGATÓRIA** — toda função pública tem JSDoc/RDoc/docstring com `@param`, `@returns`, `@throws`
- **Simplicidade primeiro** — YAGNI + KISS; abstração só após 3ª repetição (regra de três); função máx 30 linhas; arquivo máx 300; over-engineering é bug

### Changed
- **Phase 5** (`state-machine.json`): `workers` agora é `["backend", "frontend", "tester", "security", "lgpd-officer"]` (5 workers paralelos)
- **Phase 5 gate** (`all-of`): novo check `{ "type": "lgpd", "min": "warning", "maxCritical": 0, "maxHigh": 0 }` — bloqueia se `lgpdStatus === "non-compliant"` ou `critical > 0` ou `high > 0`
- **`agents/backend.md`** e **`agents/frontend.md`**: reforçam TDD (com ciclo explícito), adicionam seção de docstrings com exemplo em 2 linguagens, adicionam princípio de simplicidade com métricas (função ≤ 30 linhas, etc.)
- **`harness-advance.ts`**: novo case `if (check.type === "lgpd")` que valida `buildMetrics.lgpdStatus` (compliant/warning/non-compliant) + `lgpdCriticalFindings` + `lgpdHighFindings`
- **`install.sh`**: (1) expande `harness-allowlist.json` default para incluir paths do próprio repo (agents, training, templates, etc.); (2) copia `training/*.md` para `~/.config/opencode/training/` (RAGs globais)
- **Counters** — 16 → 17 agents; 8 → 9 templates? (RAG LGPD conta? sim, vai em `training/`)

### Fixed
- **Catch-22 do path-boundary:** allowlist agora inclui `agents/**`, `training/**`, `templates/**`, `tools/**`, `plugins/**`, `commands/**`, `state-machine.json`, `failure-protocol.json`, `opencode.json`, `install.sh`, `GERAIS.md`, `README.md`, `CHANGELOG.md`, `examples/**`, `harness-allowlist.json` — o harness agora é self-modificável sem desativar o plugin

## [6.1.0] - 2026-06-07

### Added
- **LICENSE** (MIT) — explicit licensing for open source use
- **CHANGELOG.md** — version history (this file)
- **3 plugins in TS** — converted from old hook format to modern opencode plugin API:
  - `path-boundary.ts` — PreToolUse guard for path allowlist
  - `audit-logger.ts` — PostToolUse logger for all tool calls
  - `status-injector.ts` — Compaction hook injecting harness phase status
- **`package.json`** — `@opencode-ai/plugin` dependency for plugin loading
- **`harness-allowlist.json`** — customizable path allowlist for path-boundary
- **CI workflow** — `.github/workflows/ci.yml` validates JSON/YAML/JS on every push

### Changed
- **`default_agent: "orchestrator"`** in opencode.json — orchestrator is now the default
- **Bilingual `GERAIS.md` → monolingual PT-BR** — removed mixed PT/EN paragraphs
- **`install.sh`** now creates `package.json` and `harness-allowlist.json`
- **Sprint 7 fixes** applied: removed fictional `promptFile`, fixed `task: false` semantics, consolidated `tools:` → `permission:`, removed optional chaining `ctx?.cwd`
- **Version**: 6.0.1 → 6.1.0 (feature additions)

### Fixed
- **Opencode schema strict validation** — removed `_type`, `version`, `_comment` extra keys
- **Plugin `worktree="/"` bug** — opencode returns `/` when no git repo, was breaking audit-logger
- **Install script `cp -r src dest` nesting** — added `rm -rf dest` before copy to prevent `dest/src/`

### Documentation
- **Orchestrator fan-out** documented for phase 5 (4 workers in parallel)
- **`install.sh --update` mode** added (preserves customizations)

## [6.0.1] - 2026-06-07

### Fixed
- **`install.sh` nesting bug** — `cp -r src dest` when dest exists created `dest/src/`
- Re-install clean-up: removed nested `agents/agents/`, `commands/commands/`, etc.

## [6.0.0] - 2026-06-06

### Added
- **Initial release** of OpenCode Agents v6 — clean rewrite of v5
- **16 agents** (1 primary + 15 sub) covering 6 phases of the workflow
- **8 templates** (RAG, PROMPT-page, PRD, SPEC, sprint, cross-sprint, e2e-chain)
- **4 custom tools** (harness-init, harness-status, harness-advance, harness-context)
- **3 hooks** (path-boundary, state-machine-guard, audit-logger) — initially in legacy format
- **6 commands** (/harness, /harness-status, /harness-next, /harness-retry, /harness-review, /harness-help)
- **State machine** with 6 phases, typed gates, and 4-class failure protocol
- **Permission model** with 3 defense layers (tool whitelist, path boundary, capability grant)
- **Declarative schemas** for PROMPT.md, RAG, sprint/cycle, e2e chains
- **HTML+JSON embedded** format for PRD and SPEC
- **Bilingual** `GERAIS.md` (PT-BR + EN, env var toggle)
- **Example end-to-end** (`examples/sample-web-app/`) covering all 6 phases
- **Install script** with OS detection, dry-run, uninstall, preserve-config

### Design decisions
- 1 responsibility per agent
- Single source of truth: `state-machine.json` (read-only) + `state.json` (snapshot) + `events.jsonl` (log)
- Defense in depth: 3 layers of permission enforcement
- Lean by default: 50 files in repo (down from 119 in v5)
- RAG in-project, not pre-shipped
- Audit everything: `events.jsonl` + per-session audit logs

### Removed from v5
- 12 Sentry SDK skills (irrelevant to core workflow)
- 5 design-system skills (replaced by RAG docs)
- 11 framework setup skills (replaced by RAG + agent knowledge)
- `harness-model-fallback.ts` (no model pin in v6)
- `harness-error-log.ts` + `harness-knowledge.ts` (replaced by RAG `category: lesson`)
- `harness-list-models.ts` (replaced by `opencode models` built-in)
- Sentry MCP (project-specific, not core)
- 2 plugins (replaced by hooks)
- Awesome-design-md vendored (61 folders, replaced by 1 example)
