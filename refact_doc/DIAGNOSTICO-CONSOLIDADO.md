# Diagnostico consolidado - harnes-opencode

Fecha o levantamento iniciado em [GAPS-harnes-opencode.md](GAPS-harnes-opencode.md),
agora com seis revisoes especializadas em paralelo.

- **Repo analisado:** `harnes-opencode`
- **Commit:** `494f134`
- **Versao do package:** 6.4.1
- **Data:** 2026-08-22
- **Modo:** somente leitura. Nada foi editado, instalado ou executado dentro do
  repo alvo. Verificacoes empiricas rodaram em `/tmp`, isoladas.

## Metodo

Seis lentes, cada uma com uma persona e um recorte proprio, todas partindo do
levantamento inicial (G1 a G11) com instrucao de nao repetir e de nao inventar
achado para preencher relatorio.

| Lente | Recorte |
|---|---|
| Seguranca | escape de sandbox, escalacao de privilegio, injecao, cadeia de suprimentos |
| QA | se os testes provam algo, se o CI reprova, cobertura adversarial |
| DevOps | instalacao, distribuicao, portabilidade, diagnostico operacional |
| Rails | o harness apontado para um projeto que nao e Node/TS |
| Frontend | o harness apontado para Next.js, e se a UI resultante presta |
| Contexto | engenharia de prompt, custo de token, coerencia das instrucoes |

Total: 40 achados novos alem dos 11 originais, 54 na contagem final.

### Segunda passada: verificacao por execucao

A primeira passada foi leitura de codigo. Depois disso, 24 dos 54 achados foram
verificados de novo, a maioria executando o codigo do repositorio numa copia
isolada, com `HOME` proprio para nao tocar em nada da maquina.

| Resultado | Quantos |
|---|---|
| Confirmado rodando ou medindo | 13 |
| Confirmado lendo artefato gerado | 5 |
| **Nao reproduzido** | **2** |
| Ainda so por leitura | 34 |

Os dois que nao reproduziram sao o **A3** e o **A6**, e as secoes deles foram
reescritas para dizer isso. Dois numeros tambem estavam errados e foram
corrigidos: as linhas de plugin morto (era 881, sao 245 inteiramente mortas e 904
parcialmente afetadas) e a contagem de tools (eram "as 40", sao 36, das quais 16
executam shell).

Achado marcado como confirmado teve o efeito reproduzido, nao so o codigo lido.
Achado sem marca continua sendo leitura, e deve ser tratado como provavel e nao
como fato. A distincao esta na baseline, achado por achado.

---

## Sumario executivo

O que uma instalacao limpa do harness realmente faz hoje, numa maquina que nao
seja a do autor:

- O `install.sh` copia 3 dos 9 diretorios que o proprio `config/install.json`
  declara. Nao vao `tools/` nem `commands/`, entao `/harness` nao existe e
  nenhuma tool do harness carrega.
- O `GERAIS.md` e o `system/objectivity.md`, declarados em
  `opencode.json → instructions` como carregados em toda sessao, nunca sao
  instalados. `grep -in "gerais" install.sh` retorna zero.
- Cinco dos oito plugins registram hooks que nao existem na API do
  `@opencode-ai/plugin@1.18.3`. Verificado importando os oito plugins e comparando
as chaves com `keyof Hooks`: so o `prompt-cache-prefixer.ts` esta inteiramente
morto (245 linhas). Os outros quatro registram hook valido tambem e funcionam em
parte, somando 904 linhas parcialmente afetadas.
- Quando o sandbox esta ativo, todo comando de shell retorna exit code 0 para o
  agente, porque o wrapper termina em `rm -f`.
- O CI passa com a suite vermelha e com 0% de cobertura.

E as garantias anunciadas, uma a uma:

| Garantia do README | Estado real |
|---|---|
| Portao de qualidade por fase | A fase 5 aceita as metricas como argumento do proprio agente (G1). O gate `all-of` nao tem nenhum teste. |
| Path boundary por agente | As permissoes por agente nunca sao carregadas: o plugin le so o `opencode.json`, que declara apenas o `orchestrator` (C8). O `bash` nao passa pelo plugin (G2). O default e fail-open (A2). |
| Bloqueio de comando destrutivo | Regex (G3), e 16 das 36 tools executam shell sem passar por ele (A4). |
| Sandbox ai-jail | Concede escrita no diretorio dos proprios plugins de seguranca (C1). |
| Auditoria append-only | A cadeia existe e e correta, mas a ancora e gravavel pelo agente (G6) e o log registra `sandboxed: true` para comandos que nao foram enjaulados (M6). |
| TDD obrigatorio | Em Rails o agente nao consegue escrever em `spec/**` (A9). Em frontend ele e proibido de escrever teste e penalizado por nao ter escrito (A12). |

O padrao que atravessa quase tudo: **o harness declara em prosa o que deveria
impor em codigo.** Onde ha codigo, ele frequentemente nao esta ligado. Onde esta
ligado, frequentemente falha aberto.

---

## Criticos

### C1. O sandbox concede escrita no diretorio dos proprios plugins de seguranca

`.ai-jail:6-9`, documentado como feature em `README.md:55`.

```toml
rw_maps = [
    "~/.opencode",
    "~/.config/opencode",
]
```

Dentro do jail, com `bash` liberado, o agente sobrescreve
`~/.config/opencode/plugins/path-boundary.ts` por um que sempre retorna
`{ok:true}`, ou troca o binario em `~/.opencode/bin/`. Na proxima sessao o
plugin de seguranca e o codigo que o agente escreveu, rodando fora do jail.
Escape completo e permanente, em todos os projetos, a partir de dentro do
sandbox.

Agrava: `.ai-jail` esta na allowlist de escrita (`harness-allowlist.json:25`) e
nao esta no `ALWAYS_DENY`, entao a politica do proprio sandbox e editavel pela
tool `write`, sem bash.

**Correcao:** montar `~/.config/opencode` somente leitura, com bind read-write
estreito apenas no que precisa gravar. `.ai-jail`, `.harness/ai-jail.json`,
`opencode.json*`, `plugins/**` e `tools/**` no `ALWAYS_DENY`.

### C2. A tool `harness-allowlist` nao tem gate, e a mensagem de bloqueio entrega o comando

`tools/harness-allowlist.ts:143-175`. O docstring da linha 8 promete "com
confirmacao do usuario via question". O `execute` faz:

```ts
list.push(pattern);
writeJSON(filePath, data);
return { success: true, added: pattern, ... };
```

`opencode.json` nao lista a tool em `permission`, entao e auto-allow. O agente
chama `action=add pattern="**" type=allow target=global`, grava em
`~/.config/opencode/harness-allowlist.json` (fora do projeto, fora do alcance do
boundary) e neutraliza a camada em todos os projetos, permanentemente.

E o `path-boundary.ts:527-528` escreve o comando pronto na mensagem de erro que
o modelo le:

```
Se o usuario autorizar, chame o MCP tool:
  harness-allowlist action=add pattern="${suggestedPattern}" type=allow target=project
```

Agrava: o `ALWAYS_DENY` que protegeria o arquivo tem erro de digitacao em
`path-boundary.ts:285`. `/\.harness-allowlist\.json$/` esta sem a barra e nao
casa `.harness/harness-allowlist.json` (verificado). Como o allowlist global
distribuido inclui `.harness/**`, o agente escreve direto no arquivo pela tool
`write`.

**Correcao:** confirmacao humana real dentro do `execute`; rejeitar pattern com
efeito global; bloquear `target=global` vindo de agente; corrigir a regex.

### C3. O sandbox mascara o exit code: todo comando bash volta 0

`plugins/native-sandbox.ts:165`.

```ts
args.command = `ai-jail --exec bash "${scriptPath}"; rm -f "${scriptPath}"`;
```

O status do pipeline e o do ultimo comando, o `rm`, que sempre retorna 0.
Reproduzido: script saindo com 7 chega no chamador como 0.

Vale exatamente quando `sandboxStatus === "available"` e `AI_JAIL_ACTIVE !== "1"`,
que e a configuracao que o README recomenda. Nesse modo `npm test` vermelho,
`tsc` com erro, `git push` rejeitado e `npm audit` com vulnerabilidade voltam
todos sucesso. Quem roda sem sandbox ve os erros, quem roda com sandbox nao ve, e
nada indica a diferenca.

Alimenta o G1 diretamente: o agente que "rodou os testes" e viu sucesso reporta
metricas compativeis com esse sucesso.

**Correcao:** `trap 'rm -f "$0"' EXIT` dentro do proprio script gerado, ou
`rc=$?; rm -f ...; exit $rc`. Teste que afirme que `exit 7` continua 7 depois do
wrapping.

### C4. A instalacao nao instala o harness

Tres achados que se somam.

`install.sh:269-323` nao baixa nada. Nao existe `curl`, `wget`, `git clone`,
`merge` nem `backup` no script: tudo e `cp` local a partir de `$(pwd)`. Rodar o
`curl | bash` do `README.md:211` dentro do projeto do usuario pula os tres `cp`
em silencio (`2>/dev/null || true`), imprime tela verde e o unico efeito real e
criar arquivos e apendar 20 linhas no `.gitignore` do projeto. O Smart Merge com
backup em `backup/backup_YYYYMMDD_HHMMSS/` anunciado no README nao existe no
codigo.

`install_global_opencode_config` copia `harness-allowlist.json`, `skills/`,
`agents/` e `plugins/`. O `config/install.json` declara os 9 diretorios corretos
e tem **zero referencias** no repo inteiro. Ficam de fora `tools/` (onde vivem
`harness-advance`, `harness-init`, `harness-doctor`), `commands/` (os slash
commands), `templates/`, `training/` e `system/`.

E o `GERAIS.md` nunca e copiado: `grep -in "gerais" install.sh` retorna zero,
apesar de `opencode.json:5-8` declarar
`instructions: ["~/.config/opencode/GERAIS.md", "./system/objectivity.md"]`. O
segundo, sendo path relativo, resolve contra o cwd do projeto alvo, onde tambem
nao existe.

Resultado numa instalacao limpa: `/harness` nao existe, nenhuma tool carrega, e
o system prompt global some em silencio. Ninguem, nem o autor, sabe qual das duas
configuracoes (com ou sem `GERAIS.md`) esta em producao.

**Correcao:** consumir `config/install.json` como fonte unica ou apagar o
arquivo; instalar em `~/.config/opencode/harness-<versao>/` com symlink
`current` para rollback atomico; `--uninstall` que remove o que o manifesto
instalou; e o `harness-doctor` resolvendo cada entrada de `instructions` e
falhando se o arquivo nao existir.

### C5. Cinco dos oito plugins registram hooks que nao existem

Verificado contra `@opencode-ai/plugin@1.18.3`, `dist/index.d.ts:173-300`. A
interface `Hooks` expoe `dispose`, `event`, `config`, `tool`, `auth`, `provider`,
`chat.message`, `chat.params`, `chat.headers`, `permission.ask`,
`command.execute.before`, `tool.execute.before`, `shell.env`,
`tool.execute.after`, `experimental.chat.messages.transform`,
`experimental.chat.system.transform`, `experimental.provider.small_model`,
`experimental.session.compacting`, `experimental.compaction.autocontinue`.

Nao existem `model.complete.before`, `model.complete.after` nem `session.created`.

| Arquivo | Linha | Hook registrado |
|---|---|---|
| `prompt-cache-prefixer.ts` | 182, 201 | `model.complete.before/after` |
| `structured-thinking.ts` | 148, 152 | `model.complete.before/after` |
| `status-injector.ts` | 24 | `session.created` |
| `token-budget.ts` | 90 | `model.complete.after` |
| `audit-logger.ts` | 159 | `model.complete.after` |

E `context-compressor.ts` usa o hook certo (`tool.execute.after`) com a
assinatura errada: le `output.result` (linha 118) e `output.args` (121) quando o
tipo e `output.output` e `input.args`. `extractContent` devolve `null` e a linha
119 aborta em toda chamada.

Consequencias concretas: nenhum `cache_control` e emitido
em lugar nenhum do repo; o bloco `<harness-status>` nunca entra no contexto (e
por isso `GERAIS.md:35` precisa mandar todo agente gastar um `read` de
`state.json`); a contagem de token e custo do audit-logger nunca roda, o que e a
causa raiz por baixo do G7, mais profunda que o `=` no lugar de `+=`.

`tsc --noEmit` nao pega porque o retorno dos plugins nao esta anotado como
`Plugin`.

**Correcao:** portar para os hooks reais
(`experimental.chat.system.transform` para injecao,
`experimental.chat.messages.transform` para reordenacao, `chat.params` para
telemetria); corrigir a assinatura do compressor; e um teste de CI que importe
cada plugin e afirme que as chaves retornadas sao subconjunto de `keyof Hooks`.

### C6. O CI passa com a suite vermelha e com 0% de cobertura

`.github/workflows/ci.yml:58-59` e `:64-73`.

```yaml
- name: Run unit tests with coverage
  run: npm run test:coverage 2>&1 | tee /tmp/coverage-output.txt
...
COVERAGE=$(grep -oP 'All files\s*\|\s*\K[\d.]+' /tmp/coverage-output.txt | head -1 || echo "0")
if [ "$(echo "$COVERAGE < $THRESHOLD" | bc -l 2>/dev/null || echo "0")" = "1" ]; then
```

Quatro falhas empilhadas, todas reproduzidas:

1. O step nao declara `shell:`, entao roda com `bash -e {0}`, sem `pipefail`. O
   status do pipeline e o do `tee`. Suite vermelha nao reprova.
2. `All files` com maiuscula e formato do c8/istanbul. O reporter do
   `node --test --experimental-test-coverage` imprime `# all files`. O grep nunca
   casa.
3. O `|| echo "0"` esta ligado ao `head`, que sai 0 com stdin vazio. O fallback
   nao dispara e `COVERAGE` fica string vazia.
4. `echo " < 70" | bc` da erro de sintaxe, stdout vazio, e o `if` compara
   `"" = "1"`, falso. Imprime "OK: Cobertura % >= 70%" e passa.

O CI hoje prova que `tsc` compila e que `bash -n install.sh` roda. Mais nada.

**Correcao:** `shell: bash` (ou `defaults.run.shell`), separar a execucao do
`tee`, e tirar a aritmetica do shell: rodar com
`--test-reporter=lcov --test-reporter-destination=coverage/lcov.info` e calcular
em `node -e` com `process.exit(1)`. Mais um teste de fumaca do proprio gate, com
fixture de 12% que precisa reprovar.

### C7. G1 (herdado): o portao da fase de build aceita as metricas do proprio agente

Ver [GAPS-harnes-opencode.md#g1](GAPS-harnes-opencode.md). Mantido como critico.

Adendo de QA: o gate `all-of` nao tem **nenhum** teste. `validateAllOf`,
`checkCoverageMetrics`, `checkSecurityMetrics`, `checkReviewMetrics` e
`checkLgpdMetrics` nunca sao executados por teste algum. Os 6 casos de
`tests/harness-advance.test.ts` cobrem so `score-threshold`.

Adendo de seguranca: o `validateScoreThreshold`, elogiado no levantamento
original como o padrao correto, tem a fonte de verdade gravavel pelo agente.
`.harness/reviews/**` esta na allowlist (`harness-allowlist.json:66`) e nao esta
no `ALWAYS_DENY`. Gravar `{"score": 100}` la e escrita permitida, sem bash. E a
deteccao de fraude da linha 316 so dispara se o modelo informar voluntariamente
um score divergente: omitir o parametro pula a comparacao.

### C8. G2 (herdado, agravado): as permissoes por agente nunca sao carregadas

Ver [GAPS-harnes-opencode.md#g2](GAPS-harnes-opencode.md) para o buraco do `bash`.

O agravamento: `path-boundary.ts:628-641` popula `config.agents` lendo **so** o
`opencode.json`, que em `:101-113` declara um unico agente, o `orchestrator`, e
mesmo assim so com `tools` e `permission.skill`. Todo o frontmatter YAML de
`agents/*.md` com as globs de escrita e inerte. `config.agents["frontend"]` e
`undefined`, `agentPerm` fica `undefined` (linha 386) e a avaliacao cai na
allowlist merged global, igual para todos.

Nao e so que o `bash` fura a fronteira. Nao existe fronteira por agente, nem pela
tool bem-comportada. `validateCapabilityGrant` so e chamado dentro de
`tests/path-boundary-frontend.test.ts`, nunca em runtime.

---

## Altos

### A1. O auto-allow injeta o pattern `**` e desliga o boundary permanentemente

`path-boundary.ts:317-325`. Para arquivo na raiz do projeto,
`lastIndexOf("/")` e -1, `substring(0,-1)` e string vazia, e `suggestAllowPattern`
retorna `"**"` (verificado). O `install.sh:36-37` recomenda explicitamente
`HARNESS_AUTO_ALLOW_ON_BLOCK=1` para evitar prompts. Primeiro arquivo de raiz
bloqueado, e `"**"` e gravado em `.harness/harness-allowlist.json` e persistido.
Cooldown e rate limit nao ajudam: basta um acerto.

### A2. O path boundary e fail-open por padrao

`path-boundary.ts:457`, `:492`, `:538-546`. `HARNESS_PATH_BOUNDARY_MODE ||
"fail-open"`, e a condicao `if (!allowed && merged.allow.length > 0)` nunca
bloqueia com `allow` vazio. Tres caminhos: instalacao sem `install.sh` (nenhum
allowlist existe), JSON corrompido (`readAllowlistFile` engole o erro e retorna
`allow: []`), e `opencode.json` malformado (`catch (e) {}` na linha 642 zera
`config.agents`). O warning da linha 462 so e impresso em `fail-closed`, entao a
degradacao e silenciosa.

### A3. NAO REPRODUZIDO: o `install.sh` preserva a config global

**Este achado nao se sustentou na verificacao e deve ser desconsiderado.**

A leitura original afirmava que os `cp -r` promoviam `skills/`, `agents/` e
`plugins/` do projeto para `~/.config/opencode/` sobrescrevendo config do
usuario. Rodamos o `install.sh` duas vezes com `HOME` isolado, uma com
`opencode.json` preexistente e outra sem. O arquivo do usuario sobreviveu byte a
byte nas duas (mesmo md5 antes e depois). O cabecalho do script trata
`opencode.json(c)` como intocavel de proposito e o codigo respeita isso.

O que continua valendo do achado original: os diretorios que **sao** copiados
(`agents/`, `plugins/`, `skills/`) vao sem backup e sem diff, entao um projeto
com conteudo hostil nessas pastas promove esse conteudo para global. Isso e real,
mas e outra coisa, e nao tem a severidade de sobrescrever configuracao.

### A4. Metade das tools executa shell fora do jail e fora do filtro de comando

`native-sandbox.ts:129` (`if (tool !== "bash") return`). Nem o loop `FORBIDDEN`
nem o wrapping `ai-jail --exec` se aplicam a mais nada. Medido: das 36 tools em
`tools/*.ts`, **16 executam shell**, com **47 chamadas** de `execSync` e
`spawnSync`. Nenhuma delas e a tool `bash`, entao nenhuma passa pelo jail nem
pelo filtro. Os sinks sao interpolacao em string:

```ts
execSync(`git add ${filesToAdd}`, { cwd });                           // git-automator.ts:71
execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd }); // :72
```

Escapar so aspas duplas nao adianta: dentro de aspas duplas do shell, `$(...)` e
crase continuam ativos. Mesma classe em `playwright-runner.ts:64`,
`git-commit-manager.ts:39,51`, `review-packager.ts:27-54`, `pr-automator.ts:39-44`.

Nao e o G3 (regex fraca) nem o G9 (um sink): e a camada de tools inteira fora das
duas defesas.

### A5. O contador de retry nunca e persistido: `quality` nunca esgota

`harness-advance.ts:97` incrementa `attempt` em memoria. O unico
`fs.writeFileSync(statePath...)` esta em `transitionPhase` (linha 475), que so
roda quando o gate passa ou com `force`. Entao `attempt` volta a 0 a cada
chamada, vira 1, e `if (phaseState.attempt < maxRetries)` com `maxRetries = 2` e
sempre verdadeiro. O rework e infinito, o `block-and-escalate` nunca acontece, e
o `events.jsonl` registra `attempt: 1` em todas, entao nem a auditoria mostra o
loop.

Complemento: `handleQualityFailure` le `phase.onFailure.maxAutoRetries` e nunca
`failureProtocol.classes.quality`. Editar o `failure-protocol.json` nao muda nada.

### A6. NAO REPRODUZIDO: a transicao final nao estoura

**Este achado nao se sustentou na verificacao e deve ser desconsiderado.**

E verdade que as duas maquinas terminam com `"next": ["phase.5.complete"]` e que
nenhuma declara essa fase. Mas `transitionPhase` tem uma guarda
`if (nextPhase)` antes de acessar `nextPhase.owner`, entao nao ha estouro. E
`phase.5.complete` nao e um alvo quebrado: e marcador terminal deliberado,
tratado explicitamente na linha 543 como `state.currentPhase ===
"phase.5.complete" ? "Concluido" : "Em andamento"`.

A consequencia real, simulada com a maquina de estados verdadeira, e que a
chamada seguinte a `harness-advance` responde `Fase 'phase.5.complete' nao
encontrada no state-machine.json` em vez de dizer que o projeto acabou. Isso e
atrito de mensagem, nao severidade alta, e nao trava projeto nenhum.

### A7. Metrica de seguranca ausente e lida como zero vulnerabilidades

`harness-advance.ts:363-372`. `undefined || 0` vira 0, e `0 > 0` e falso. Chamar
o gate com `buildMetrics: { coverage: 90, reviewScore: 80 }` sem os campos de
vuln passa o check de seguranca. E o oposto dos vizinhos:
`checkCoverageMetrics` e `checkReviewMetrics` reprovam com `=== undefined`, e
`checkLgpdMetrics` trata ausente como `non-compliant`. O unico check que falha
aberto e o de vulnerabilidade, e isso sobrevive a correcao do G1: se a fonte
passar a ser `npm audit --json` e o scan falhar, "sem dado" continua significando
"limpo".

### A8. Cinco arquivos de teste nao rodam, e `tests/` nao passa pelo typecheck

`package.json:13` enumera 12 arquivos; `tests/` tem 17. Ficam de fora
`ai-jail-sandbox.test.ts` (46 asserts), `path-boundary-hot-reload.test.ts` (44,
o maior da suite), `harness-doctor.test.ts` (32), `harness-allowlist.test.ts`
(30) e `git-automator.test.ts` (15). Sao 167 das 384 assercoes, 43%, decorativas.
E o `tsconfig.json` inclui so `plugins/**`, `tools/**` e `global.d.ts`, entao
renomear uma funcao nao quebra o CI e o arquivo de teste vira lixo silencioso.

A enumeracao arquivo a arquivo garante que todo teste novo nasce fora do CI por
padrao.

### A9. Rails: nenhum agente consegue escrever um arquivo de spec

`agents/backend.md:14-23`, `agents/tester.md:30`, `harness-allowlist.json:56-57`.
As allowlists tem `tests/**`, `test/**`, `**/*.spec.ts`. O `matchGlob`
(`path-boundary.ts:332-340`) compila para regex ancorada, entao
`spec/models/player_spec.rb` nao casa nada e leva BLOCKED. `db/migrate/**`,
`config/routes.rb` e `lib/**` tambem estao fora.

O harness se apoia num ciclo RED-GREEN-REFACTOR que num projeto Rails nao passa
do RED por falta de permissao. A unica rota de escape e o `bash`, ou seja, o
caminho nao auditado do G2.

### A10. Rails: o instrumento de verificacao nao le a stack

`tools/coverage-analyzer.ts:14-24` espera `coverage/coverage-summary.json`
(Istanbul) e `total.lines.pct`. SimpleCov gera `.last_run.json` e `.resultset.json`,
nunca esse arquivo. A tool retorna `success: false` em 100% das execucoes, e
`agents/tester.md:75` manda usa-la obrigatoriamente, sem plano B. Sobra estimar,
e a estimativa e o que o gate consome (G1). Em Rails o portao de 85% nao e fraco,
nao existe por construcao.

Mesma familia: `ast-analyzer.ts` so parseia TS (a metrica de complexidade some),
`vuln-checker.ts:8-13` faz `process.exit(1)` sem `package.json`,
`security-scanner.ts:130` vira no-op silencioso, `api-contract-validator.ts:22`
usa regex de Express e nunca casa `resources :players`.

### A11. Frontend: as skills de design de verdade nao alcancam quem escreve JSX

`skills/design/` tem cerca de 11.400 linhas de conteudo real (`ai-slop-patterns.md`
308 linhas, `anti-defaults.md` 222, `visual-craft.md` 330, `impeccable/*`).
`grep -rln "impeccable\|ui-craft\|taste-design" agents/` devolve um unico arquivo,
`agents/designer.md`, e o designer tem `bash: deny` e so escreve em
`.harness/design/**`.

O agente que produz o `.tsx` roda com `frontend-style-guide` (paleta generica,
`blue-500`/`slate-500` default) e `design-system` (como achar `tokens.ts`).
Markdown bonito na fase 3, JSX generico na fase 5.

### A12. Frontend: o code-reviewer penaliza exatamente o que o frontend esta proibido de fazer

`agents/code-reviewer.md:37-43` tira -35 por arquivo de feature sem teste
correspondente, peso 35%. `agents/frontend.md:162` proibe o frontend de criar
`*.test.{ts,tsx}` sem aprovacao explicita. O gate da fase 5 exige review >= 70.

Toda sprint de UI entrega sem teste por desenho, cai para 65, entra em rework,
esgota as tentativas e escala. Ou isso, ou o code-reviewer aprende a ignorar o
proprio pilar de 35%, e ai o score nao significa nada. E o `tester` nao cobre: o
allowlist dele e por pasta separada e o produto e chain de API. Teste de
componente em projeto Next nao e escrito por ninguem.

### A13. Frontend: a fase 3 produz artefato que o frontend nunca le

`agents/designer.md:135` afirma que o `PROMPT.md` e o que o frontend vai ler. O
protocolo obrigatorio do frontend (`skills/frontend/frontend-context-first/SKILL.md:26-98`)
nao menciona `PROMPT.md`, `DESIGN.md` nem `PRODUCT.md`, e o `orchestrator.md`
inteiro tambem nao. `.harness/ui-specs/`, o unico artefato que carrega token de
design, nao tem consumidor a jusante.

O `grill-me` da fase 5 pergunta ao humano o que o `PROMPT.md` ja respondeu. Paga
duas vezes pela mesma decisao e a segunda ignora a primeira.

### A14. Frontend: o "score estetico 70" nao tem criterio estetico com peso

`agents/design-reviewer.md:37-58`. A rubrica ponderada e 100% completude
documental: cobertura 20%, PROMPT completo 25%, field schema 20%, action
functions 15%, API integrations 10%, cross-module 10%. Estetica sao dois
checkboxes binarios, e o reviewer tem `bash: deny` e `webfetch: deny`, entao nao
calcula contraste nem renderiza nada. Uma tela chapada com paleta padrao tira 85
e passa, desde que todo campo tenha `validation`.

### A15. Contexto: o custo fixo estoura o proprio teto declarado

Medido em `wc -m` e convertido pelo estimador do proprio harness
(`plugins/lib/token-estimate.ts:16`, `length / 3`):

| Item | chars | token |
|---|---:|---:|
| `GERAIS.md` | 20.751 | 6.917 |
| `system/objectivity.md` | 7.380 | 2.460 |
| `AGENTS.md` | 3.991 | 1.330 |
| catalogo de 108 skills (name + description) | 40.909 | 13.636 |
| schemas das 29 tools | 14.799 | 4.933 |
| prompt do agente ativo (mediana) | 6.284 | 2.095 |
| **subtotal** | **94.114** | **31.371** |

Mais tools nativas e 6 MCPs habilitados: piso realista em torno de 40k token
antes da primeira palavra do usuario. Com `lgpd-officer` ativo (8.950 tok, o
maior prompt do repo), ~47k.

O catalogo de skill sozinho custa mais que `GERAIS.md` + `objectivity.md` +
`AGENTS.md` somados. E `docs/SKILLS_CURATION.md:19` ja diz que `yc-apply`,
`kb-yt-channel`, `insta-master`, `yt-master` e `tweetsmash-api` nao pertencem ao
`skills/`; as cinco continuam la, e tres estao no top-5 de maior `description` do
repo.

Contra isso, a Regra 6 (`GERAIS.md:304`): "Por tarefa: 4.000 tokens. Por sessao:
30.000 tokens." O prefixo fixo estoura o teto de sessao antes de comecar, e o
teto por tarefa e menor que o proprio arquivo onde a regra esta escrita. A regra
e lida junto com a evidencia de que ja foi violada, e isso ensina o modelo que os
numeros deste system prompt nao valem nada, aprendizado que transfere para os
outros tetos (85% de coverage, score 70, 40 linhas de AGENTS.md).

### A16. Contexto: o `GERAIS.md` descreve uma fase 5 que a state machine recusa executar

`GERAIS.md:116` diz 5 workers (`backend`, `frontend`, `tester`, `security`,
`lgpd-officer`) e review do `planning-reviewer`. `state-machine.json:154,157` diz
3 workers e review do `code-reviewer`. `harness-context.ts:87-90` recusa montar
contexto para agente que nao esta em `workers`.

O orchestrator obedece o prompt, chama `harness_context` para `security` e recebe
erro; tenta `lgpd-officer` e recebe erro. Duas tool calls desperdicadas por
rodada. Se desiste e delega so os 3, o gate exige metrica de `security` e de
`code-reviewer` que ninguem produziu, e cai no G1.

E o `GERAIS.md:105-114` lista 6 fases quando a maquina tem 7: o modelo nao sabe
que a `phase.6.ux-gate` existe.

---

## Medios

### M1. O `audit.log` grava argumento completo sem redacao e nao e ignorado pelo git

`audit-logger.ts:236` grava `args: output.args` inteiro. Para `bash` e o comando
completo; para `write` e o conteudo inteiro do arquivo. O `.gitignore` que o
`install.sh` escreve cobre `.harness/audit/` (diretorio) mas nao
`.harness/audit.log` nem `.harness/.audit-hash`, que sao os caminhos reais. E
`git-automator.ts:69` usa `filesToAdd = "."` quando `files` e nulo. Credencial em
linha de comando vai para o log, o log entra no commit.

### M2. As regras de `deny` so protegem a raiz do projeto

`harness-allowlist.json:70-76` tem `".env"`, `".env.*"`, `"secrets/**"`,
`"*.pem"`, `"*.key"`. O `matchGlob` traduz `*` para `[^/]*`, que nao atravessa
diretorio. Verificado: `config/.env` e `certs/server.pem` nao sao bloqueados.
Todas as regras de `allow` do mesmo arquivo usam `**`; as de `deny` nao.

### M3. O `skills-lock.json` existe mas nao verifica nada

Verificado: 57 entradas para 108 `SKILL.md`, e **zero** dos `skillPath` resolvem
em disco (ex: `skills/harness/harness/harness/harness/agent-browser/SKILL.md`).
O `migrate-skills.mjs:187-202` reescreve o path prefixando o setor repetidamente
e nunca le, recalcula ou compara `computedHash`. Nenhum outro codigo do repo le o
campo.

A correcao sugerida no G10 ja foi implementada e esta morta: o formato esta
certo, a execucao esta quebrada em tres lugares.

### M4. `skills/` carrega 131 scripts executaveis e um kit ofensivo, com `skill: {"*": "allow"}`

`opencode.json:34-36`. `skills/seguranca/reverse-shell-techniques/SKILL.md:80-83`
traz webshell PHP (`<?php system($_GET['cmd']); ?>`) e reverse shell em mais de
20 linguagens. `skills/harness/deep-review/scripts/run_jobs.py:91` faz
`subprocess.run(command, cwd=repo)` com template vindo de `--command`. Sao 131
scripts (65 `.mjs`, 31 `.py`, 16 `.sh`), 27 com bit de execucao, e tres bundles
minificados opacos (o maior com 438 KB).

Nao ha execucao automatica, mas remove todo o custo do ultimo passo de um ataque.
E o `install.sh` distribui tudo para `~/.config/opencode/skills/`, global.

### M5. A defesa contra prompt injection e so texto, e o sanitizer nao esta carregado

`GERAIS.md:314-320` sao tres paragrafos de instrucao. Grep no repo nao encontra
nenhuma sanitizacao, marcacao de proveniencia ou delimitacao de conteudo nao
confiavel em nenhum plugin.

O que existiria esta desligado: `tools/lgpd-sanitizer.ts:477` exporta
`LGPDSanitizerPlugin`, que **nao esta** na lista `plugin` do `opencode.json` (que
lista 8 arquivos, todos em `./plugins/`). O cabecalho do arquivo promete "LLM
nunca ve CPF, email, telefone" sem implementacao carregada.

Adendo: a pseudonimizacao e fraca de qualquer forma.
`lgpd-sanitizer.ts:411` faz `sha256(value).slice(0,12)` sem salt, rotulado no
comentario como "Hash irreversivel". Para CPF (11 digitos) e reversivel por forca
bruta em segundos. Corrigir com HMAC e chave por sessao.

### M6. `AI_JAIL_ACTIVE=1` e auto-declaracao nao verificada, e o log afirma `sandboxed: true`

`native-sandbox.ts:67` e `:144-152`. Nada confere se o processo esta de fato
dentro de um bwrap; a variavel e apenas lida. O `install.sh:130` recomenda a
string e o `.env.example` gerado traz `# AI_JAIL_ACTIVE=1` comentado. Quem
descomentar no `.env` sem rodar sob `ai-jail` desliga o jail por comando e o log
passa a afirmar `sandboxed: true` em toda execucao.

Segundo caminho: o agente grava `{"status":"unavailable","checkedAt":<agora>}` em
`~/.local/share/opencode/sandbox-status.json` e o jail fica desligado por 24h.

Isso e pior que nao ter registro, porque e atestacao falsa. Diferente do G6 (log
adulteravel): aqui o proprio codigo escreve a informacao errada.

### M7. O `context-compressor` nunca preserva o que promete, e pode comprimir o state e o SPEC

`context-compressor.ts:41,56-66,115,121,85`. A allowlist
`preservePatterns: ["AGENTS\\.md$", "package\\.json$", "tsconfig\\.json$"]` e
testada contra `filePath`, que vem de
`output.args?.filePath ?? output.args?.path ?? input.tool`. Como `args` esta em
`input` e nao em `output`, `filePath` cai sempre no fallback `input.tool`, ou
seja, a string `"read"` ou `"bash"`, que nunca casa nenhum dos tres regex. A
preservacao nunca protege nada.

O escopo inclui `read`, entao sao candidatos `.harness/SPEC.md`,
`.harness/state.json`, `harness-allowlist.json` e RAG doc de `security`/`law`. E
o prompt manda "Strip: boilerplate/prosa", enquanto o `RAG-TEMPLATE.md` define 7
secoes narrativas e permite 3.000 chars cada.

Terceiro: `content.slice(0, 50_000)` corta em silencio. Um arquivo de 200 KB e
resumido a partir dos primeiros 50 KB e o resumo substitui o conteudo inteiro.

Hoje nao causa dano porque o plugin esta morto (C5). Quem corrigir a assinatura
sem corrigir o resto faz o modelo ler uma versao resumida do `state.json`
acreditando ter lido o original.

### M8. O `prompt-cache-prefixer`, se rodasse, duplicaria historico e tools

`prompt-cache-prefixer.ts:99-104,132-135,188-196`. O "breakpoint" e um comentario
HTML que o proprio plugin corta depois; nada mais no repo consome a string, e
`grep -r cache_control` nao retorna nada. O docstring promete 90% de economia sem
mecanismo que produza isso.

Se o hook existisse: `originalMessages.slice(0,-1)` **e** o historico, e o `[1]`
do split contem o historico serializado de novo, entao ele vai duas vezes na
mesma requisicao. Idem tools (linha 133 empurra a definicao para dentro da string
do system e `input.tools` continua intacto).

E a metrica e enviesada por construcao (linha 213): um miss real tem
`cache_read_input_tokens === 0`, que e falsy, entao `cacheMisses` nunca
incrementa e `ratio` so pode subir.

Risco de crenca: `objectivity.md:92` diz ao modelo "Stable content first, dynamic
last. **(Plugin handles this automatically.)**".

### M9. Instrucoes de sinal oposto e forca igual no mesmo contexto

`GERAIS.md:39` (implementadores): "Raciocinios e planos textuais em markdown sao
terminantemente proibidos." `GERAIS.md:26` (principio 9, para todos):
"Raciocinio Estrategico (CoT), pense antes de agir." `objectivity.md:71-73`: "You
MUST wrap reasoning in `<thinking>`." `structured-thinking.ts:49`: mesma
checklist de 5 itens, repetida quase palavra por palavra do `objectivity.md`
(cerca de 250 token de duplicacao literal).

As duas fontes se declaram nao-negociaveis (`objectivity.md:8`, `GERAIS.md:16`).
Com instrucoes de igual forca e sinal oposto, o que decide e proximidade ao fim
do prompt e sampling. Resultado observavel: as vezes o agente devolve so JSON, as
vezes JSON precedido de 40 linhas de plano.

Mesma familia: `GERAIS.md:37` manda listar `.harness/skills/` e ler o `SKILL.md`
relevante antes de escrever codigo; um `SKILL.md` medio ja consome mais que os
4.000 token da tarefa inteira.

### M10. `AGENTS.md` tem tres limites mutuamente exclusivos, e o gate exige o que a regra proibe

`GERAIS.md:46` diz maximo 40 linhas. `agents/documenter.md:122-124`, do agente
que tem o arquivo como entregavel, diz ate 80. `state-machine.json:59,67`, o gate
da fase 1, exige `minLines: 50` com `onFail: block`.

Um agente que obedece o `GERAIS.md` reprova no gate. O `AGENTS.md` da raiz deste
proprio repo tem 42 linhas: viola o limite que publica e nao passaria no gate.

### M11. O indice do RAG e escrito num diretorio e lido em outro

`rag-manager.ts:37` escreve em `<projeto>/RAG/index.json`. `harness-context.ts:62`
le `<projeto>/.harness/RAG/index.json`. Todo o resto do harness usa a segunda
forma, inclusive o gate da fase 1, que exige `minDocs: 3` com `onFail: block`.

`rag-manager` com `rebuild_index` retorna "Diretorio RAG/ nao encontrado" num
projeto normal. Do outro lado, `harness-context.ts:126-141` le o indice ausente
dentro de `try {} catch { // ignore }`, entao "sem RAG" e "RAG quebrado" sao
indistinguiveis. A fase 1 so avanca se alguem escrever o `index.json` na mao.

### M12. O pedido de criacao de RAG nao tem canal

`GERAIS.md:92`: "Outros agents podem pedir a criacao via `question` ou anotar em
`events.jsonl`." Nenhuma das duas vias existe. `question` e sincrona e dirigida
ao humano; o `rag-curator` e subagent e nao escuta. Em `events.jsonl` os unicos
escritores sao `harness-advance` e `harness-init`, e o script do `rag-curator`
nunca le o arquivo. `grep -rn "rag.request\|ragRequest"` nao retorna nada.

Mesma coisa com o "Ciclo de Aprendizado" (`GERAIS.md:60-63`): nao existe
destinatario. Nenhuma licao aprendida jamais chega ao RAG, e o principio 4 do
harness ("RAG cresce no projeto") nunca se materializa.

### M13. Perfil `lean` remove os checks de seguranca, review e LGPD sem aviso

Strict tem 4 checks na fase 5 (coverage 85, security, review 70, lgpd). Lean tem
um: `coverage: 70`. Somem tambem as fases 1, 2 e 3 inteiras. `harness-init
--profile lean` nao avisa que o usuario abriu mao do `maxCritical: 0`. Nenhum
teste da suite passa `profile: "lean"`.

### M14. Symlink nao e resolvido, e nao ha teste de bypass

`path-boundary.ts:355-371` usa `path.resolve`, que e normalizacao lexica e nao
toca no filesystem. Nao ha `fs.realpathSync` em lugar nenhum do arquivo. Um
symlink dentro do projeto apontando para `.harness/state.json` ou para
`~/.ssh/authorized_keys` resolve lexicamente para dentro de `src/**` e passa. O
`ALWAYS_DENY` cai com um `ln -s`.

Cobertura negativa hoje: `../` tem um caso; symlink, zero; case-insensitive
(`ALWAYS_DENY` sem flag `i`), zero; separador `\` do Windows, zero.

### M15. Rails: limites de engenharia e sintaxe de docstring colidem com a stack

`GERAIS.md:208-212` fixa complexidade ciclomatica maxima 10; o Codacy do
prostaff-api exige 7. O harness aprova com 100/100 o que o pipeline reprova
depois, que e o pior arranjo possivel porque o retrabalho ja foi pago. E o limite
de 300 linhas por arquivo com "se passou, divida" colide com controller RESTful
idiomatico (temos 18 arquivos acima disso) e com a propria regra 3 do `GERAIS.md`
("nao refatore o que nao esta quebrado").

`GERAIS.md:148-161` marca o bloco de docstring obrigatorio como ` ```typescript `.
Num `.rb`, `/**` e divisao seguida de splat, ou seja, erro de sintaxe. O arquivo
nao carrega, e o loop de auto-correcao de 3 tentativas briga com o proprio
requisito de documentacao.

### M16. Rails: fase 5 paralela sem worktree disputa `db/schema.rb`

`state-machine.json:153-157` roda 3 workers em paralelo no mesmo working tree.
Busca por `worktree|lockfile|mutex` nas tools: zero resultado de isolamento.
Nenhuma ocorrencia de `schema.rb` em todo o harness.

`db/schema.rb` do prostaff-api tem 1926 linhas e e gerado. Dois workers rodando
migrate em paralelo produzem duas versoes de `define(version:)` disputando a
mesma linha, e o perdedor e sobrescrito em silencio, nao vira conflito de merge
visivel. Some `backend.md:104` mandando `git add -A`, que contradiz o
`GERAIS.md:270` ("nunca use `git add .`").

### M17. Frontend: o `frontendContextFirst` nao e lido, e o verificador nao roda

`grep -rn "frontendContextFirst" .` devolve 4 ocorrencias: os dois JSON e duas
linhas de guia. Nenhum plugin, tool ou agente le a flag. Por `false` nao reverte
nada.

E o `scripts/check-context-first.sh` (227 linhas, bem escrito: compara timestamp
da primeira leitura de `AGENTS.md` com o da primeira escrita em `src/`, cruza
skill carregada contra decision log) so e citado em `training/`. O guia mostra o
YAML de CI que deveria existir; `.github/workflows/ci.yml` e o unico workflow e
nao o chama. O unico verificador deterministico do fluxo frontend nunca roda.

### M18. Frontend: o a11y-scanner e decorativo e tem bug de regex

`tools/a11y-scanner.ts:15-32`, 42 linhas, tres heuristicas de `includes`. O teste
`/>\\w+/` num literal significa `>` seguido de barra invertida literal, entao e
falso quase sempre e todo arquivo com `<button` sem `aria-label` vira violacao.
O processo nunca sai com codigo diferente de zero. E `grep -rn "a11y-scanner"`
fora do proprio arquivo retorna so um teste: nao aparece no `state-machine.json`,
nem no `harness-advance`, nem no CI, nem no `qa-gate`.

Depois que o codigo existe, ninguem olha a UI: `code-reviewer.md` e `qa-gate.md`
nao tem nenhum criterio visual ou de a11y.

### M19. Frontend: o caminho Stitch gera React de Vite, e a validacao e opcional

`skills/design/stitch-react-components/SKILL.md:70-90` manda mover conteudo para
`src/data/mockData.ts` e trocar ancoras por `<Link>` de React Router. O template
de referencia usa `React.FC<Props>` e nao tem nocao de `'use client'`. E o gate
da fase 4 da propria skill diz que verificacao e validacao sao opcionais e
dependem de permissao do usuario.

Em Next isso produz componente com `react-router-dom` num projeto que usa
`next/link`, `mockData.ts` no lugar de service + query, e arquivo sem
`'use client'` que quebra no build no primeiro `onClick`. Pior: a fase 2 manda
sobrescrever o `style-guide.json` com os tokens do `<head>` do HTML do Stitch, ou
seja, a paleta do Google substitui a do projeto no documento que o agente
consulta depois.

### M20. Testes que nao provam nada, e um que commita no repo real

`tests/git-automator.test.ts:56-63` chama a tool com `files: null`, o que vira
`git add .` seguido de `git commit -m "test"` no `process.cwd()`. A assercao e
`assert.strictEqual(typeof result.success, "boolean")`, que aceita os dois
resultados. Rodar com working tree sujo cria commit real engolindo trabalho em
andamento. Mesma familia em `harness-tools.test.ts` (`git stash push` na arvore
real), `harness-db.test.ts` e `object-storage-filesystem.test.ts`.

`tests/path-boundary-frontend.test.ts:151-159` tem titulo afirmando o oposto da
assercao: "backend: cannot write src/components/Button.tsx" com
`assert.equal(r.ok, true)`.

`tests/path-boundary-hot-reload.test.ts:271-307` e um teste de cooldown que
calcula `r2` e nunca o assere, com o comentario "Vou pular e apenas verificar que
o sistema nao quebra".

De 384 assercoes, 93 (24%) sao "rodou / tem a forma certa": 37x `success === true`
isolado, 23x `existsSync`, 21x `typeof`, 12x `Array.isArray`.

### M21. O restore de checkpoint pega o stash errado

`tools/harness-checkpoint.ts:72-75` faz `stash push` de backup e depois
`stash pop ${target.ref}`, com `target.ref` capturado **antes** do push. O push
empurra a pilha: o checkpoint que era `stash@{0}` vira `stash@{1}` e o pop
restaura o backup de emergencia. O usuario recebe "Restaurado" e nada foi
restaurado.

O teste passa porque no momento do restore a arvore esta limpa, o push nao cria
stash e os indices nao deslocam. O unico cenario testado e o unico em que o bug
nao ocorre.

### M22. O antivirus do uploader retorna limpo em qualquer erro

`tools/object-storage-uploader.ts:398-404`: `catch { return { infected: false } }`.
O estado default e ClamAV inacessivel. O arquivo nao e uma tool do opencode, e
codigo de referencia de 986 linhas que o harness distribui para ser copiado nos
projetos do usuario, ou seja, propaga um fail-open de antivirus como padrao.

No mesmo arquivo, o guard de path traversal (linhas 273-277, 313-317) usa
`resolvedPath.startsWith(resolvedBase)` sem separador: com base `./uploads`, a
key `../uploads-evil/x` passa.

### M23. MCPs sem pin, sem probe e sem fallback

`opencode.json:38-94`. Os quatro MCPs locais apontam para
`~/.config/opencode/node_modules/...`, mas os pacotes estao em `devDependencies`
e o `install.sh` nunca cria `package.json` la nem roda `npm install`. Falham no
start em qualquer maquina que nao seja a do autor, e a falha aparece no meio da
fase 3 ou 5, nao na instalacao.

Os dois remotos (`stitch`, `context7`) nao tem timeout, retry nem alternativa, e
o `validate_mcp_paths` nunca toca a rede: ecoa a URL e imprime `ok`. MCP remoto
morto e reportado como OK.

### M24. `bun.lock` e `package-lock.json` descrevem projetos diferentes

O `bun.lock` nao tem `@aws-sdk/*` nem `clamdjs`, que `object-storage-uploader.ts`
importa em runtime, e resolve `@opencode-ai/plugin` em 1.17.13 contra 1.18.3 do
npm. Sobram dois pacotes que o `package.json` atual nao declara. O README
recomenda Bun; quem usa Bun recebe instalacao quebrada. O CI usa `npm install` e
nao `npm ci`, entao nem o `package-lock.json` e respeitado.

### M25. Argumentos documentados do instalador sempre abortam

`install.sh:64-87` usa `for arg in "$@"` com `shift` dentro. O `for` ja capturou
a lista, entao o valor volta na iteracao seguinte e cai no `*)` com `exit 2`.
Verificado: a forma com espaco falha, a forma com `=` funciona.

`--add-allow`, `--add-deny` e `--package` sao documentados na forma com espaco no
cabecalho do proprio script e no `main()`. O `--add-allow` e o caminho de escape
que a mensagem de bloqueio do path-boundary manda o usuario usar.

### M26. Guarda de TTY invertida no `curl | bash`

`install.sh:382-398` testa `! [[ -t 0 || -t 1 ]]`. Em `curl | bash` a partir de
um terminal, `-t 0` e falso mas `-t 1` e verdadeiro, entao a condicao inteira
inverte e o fluxo cai no `read` interativo. Com stdin sendo o pipe do curl, o
`read` le bytes do proprio script que o bash ainda nao interpretou, e a execucao
continua a partir de um offset deslocado. Comportamento nao deterministico entre
maquinas, sem rollback do que ja foi escrito.

E a regressao exata que o commit `31af279` tentou corrigir. O teste correto e so
`-t 0`.

### M27. O `.harness/tmp/sandbox` acumula scripts com o comando em texto puro

`native-sandbox.ts:154-165`. O unico apagamento e o `rm -f` inline. Nao ha
varredura na inicializacao, TTL, limite de quantidade nem de tamanho. Toda
interrupcao antes do `rm` (ESC no meio do comando, opencode fechado, timeout,
hibernacao) deixa arquivo para tras, e cada `.sh` orfao contem o texto integral
do comando, que rotineiramente traz token e connection string.

O `.gitignore` com `*` que protegeria o diretorio e escrito por outro componente
(`harness-workspace.ts:194`), e so quando aquela tool e chamada.

### M28. O diagnostico so existe de dentro de uma sessao que ja funciona

`harness-doctor` e um `tool()` invocavel so por agente. As tres falhas mais
provaveis desta lista (instalacao incompleta, MCP apontando para path
inexistente, plugin nao carregando) impedem a sessao de ter tools, que e
exatamente quando o doctor fica inacessivel.

O relatorio nao cobre versao do harness, versao do opencode, status dos MCPs nem
quais plugins carregaram. O `hasAuditLog` aponta para `.harness/audit/auto-allow.jsonl`
e nao para o log encadeado real. E o template de bug vem pre-preenchido com
`v6.3.2` (o package esta em 6.4.1) e manda anexar dois caminhos de log que nao
sao os reais.

### M29. O `install.sh` reescreve o `.gitignore` do projeto onde estiver

`install.sh:405-448`, com `PROJECT_ROOT="$(pwd)"` e sem verificar se e repo git.
Adiciona `.env.*`, que passa a ignorar o `.env.example` que o proprio script
acabou de criar, e `dist/`, `build/`, `coverage/`, `tmp/`, que nao sao artefatos
do harness. As linhas sao anexadas soltas, sem bloco delimitado, entao nao ha
como saber quais foram do installer nem reverter. O feedback ainda imprime
sempre `+1` porque `added` e flag booleana.

### M30. O `force` nao deixa rastro no `state.json`

`harness-advance.ts:450-455`. Uma fase forcada fica byte a byte identica a uma
que passou no gate: `status: "completed"`, sem `gate`, sem `forced`, sem
`attempt`. `harness-status` e `harness-doctor` reportam progresso legitimo. O
unico registro fica no `events.jsonl`, que o agente pode truncar via bash.

E a linha 453 grava no `state.json` o objeto de **definicao** da fase vindo do
state machine, sobrescrevendo `attempt`, `score` e o resultado do gate que tinham
acabado de ser calculados.

---

## Baixos

- **B1.** `install.sh --package` monta comando de shell a partir de
  `tools/DIST-MANIFEST.json`, que esta sob `tools/**` na allowlist do agente.
  Mesma classe do G9, com pre-requisito mais fraco.
- **B2.** CI resolve dependencia flutuante (`npm install`, tudo com `^`) e nao
  roda `npm audit`, scan de segredo nem SAST no pipeline que valida justamente os
  plugins de seguranca.
- **B3.** 64 links absolutos `/home/kingdev/...` em 12 arquivos, incluindo o
  pilar de 35% do `code-reviewer` (`code-reviewer.md:38`, a Lei de Ferro do TDD).
  Em `agents/designer.md` o dano e duplo: alem do host errado, cinco das skills
  referenciadas nao existem mais depois da reorganizacao em setores.
- **B4.** `schemas/state-machine.schema.json:15` declara `"id": {"type": "integer"}`
  quando os ids reais sao `"phase.0.briefing"`. Nenhum arquivo referencia o
  schema. O unico contrato formal esta morto e errado.
- **B5.** O `.audit-hash` fica versionado (nenhuma regra do gitignore o pega)
  enquanto o `audit.log` cai no `*.log`. Ancora versionada com log ignorado e o
  pior dos dois mundos.
- **B6.** O validador AST do Stitch so pega hex de 6 digitos em string literal de
  `className`. Escapa `className={cn("bg-[#3b82f6]")}`, `style={{color:'#3b82f6'}}`,
  `#fff`, `rgb()`. E as duas tools que `agents/frontend.md:268-269` promete
  (`storybook-runner.ts`, `design-tokens-validator.ts`) nao existem.
- **B7.** Colisao de `PRODUCT.md`: o `impeccable` busca em `.agents/context` e
  `docs`, o harness escreve em `.harness/`. O schema tambem e outro. A skill
  desvia para o fluxo de entrevista inicial no meio de um projeto que ja passou
  pela fase 3.
- **B8.** O fan-out da fase 5 multiplica o prefixo fixo por 3 a 5 (94k a 157k
  token por rodada, e cada rework repaga), e nenhum arquivo do repo faz essa
  conta. `agents/tester.md` ainda fixa `model: minimax/MiniMax-M2.7`, entao um
  worker nao compartilharia cache com os demais nem que o cache funcionasse.

---

## O que esta bom

Nao inventamos achado para preencher, e tambem nao omitimos o que presta.

- **A forma da state machine.** Separar contrato (`state-machine.json`) de
  snapshot (`state.json`), com `outputContract` e `gate` declarativos por fase, e
  o desenho certo. O problema esta na verificacao, nao na modelagem.
- **`validateScoreThreshold`** (`harness-advance.ts:301`) e o padrao correto de
  portao: le do arquivo, ignora o parametro, acusa divergencia. Precisa so que a
  fonte deixe de ser gravavel.
- **A cadeia de hash do audit-logger** (`audit-logger.ts:144`) e correta:
  `prevHash` entra no payload hasheado. Falta ancoragem e um verificador.
- **`writeAtomic`** (`harness-db.ts:47-55`) com tmp + `renameSync` nao corrompe
  o state em queda no meio da escrita.
- **O probe real do sandbox** (`native-sandbox.ts:62`), que testa se o `bwrap`
  funciona em vez de so checar se o binario existe, com timeout e cache.
- **`skills/design/ui-craft` e `impeccable`** sao conteudo de design real, nao
  enchimento: scene sentence obrigatoria, register Product vs Brand, dials
  declarados antes de gerar pixel, 308 linhas de anti-slop, contraste 4.5:1 com o
  diagnostico certo sobre por que design de IA parece dificil de ler. E o ativo
  mais valioso do repo.
- **`templates/UI-SPEC-TEMPLATE.md`** e o unico documento do fluxo que carrega
  token de design de verdade: grid, matriz de 4 estados, escala semantica de
  z-index, checklist de bans.
- **`scripts/check-context-first.sh`** (227 linhas) e um verificador
  deterministico bem feito, do tipo que falta no resto do harness. So precisa ser
  chamado.
- **`templates/SPEC-TEMPLATE.md` secoes 4.2 e 9.2** tratam backfill sem downtime
  e rollback de banco, com o alerta sobre dropar coluna, melhor que a maioria dos
  templates de SPEC.
- **As skills TanStack Query** estao corretas para a v5 (`gcTime` com nota sobre
  o nome antigo, zero assinatura v4 vazada, nenhum `mutation.isLoading`).
- **`tests/lgpd-sanitizer.test.ts`** e o melhor arquivo da suite: assere valores,
  reversao, whitelist e `throws` no caminho invalido.
- **`agents/code-reviewer.md:47-52`** penaliza gold-plating com -10 por recurso
  extra nao solicitado. E raro e e exatamente o que se quer de um agente de IA.
- **`agents/tester.md`** derivando chains a partir dos `acceptanceCriteria` da
  SPEC e melhor desenho que o "1 spec por arquivo" do code-reviewer. Se as duas
  regras brigarem, a do tester deve ganhar.

---

## O que isso vira no ProStaff Harness

Separando o que e cortesia para o colega do que e obrigacao nossa. Coluna
"herdado" marca o risco que o nosso desenho corre pelo mesmo motivo.

| Achado | Herdado? | Vira o que no PRD |
|---|---|---|
| C7 / G1 gate auto-reportado | Sim, se o verificador nao for do nucleo | R2.1 a R2.3 ja cobrem. Reforcar: a tool exposta ao agente nao tem parametro de metrica |
| C7 adendo: `.harness/reviews/` gravavel | **Sim** | Novo em R2.6: artefato de evidencia entra no deny duro; nenhum artefato que decide portao e gravavel por agente |
| C3 exit code mascarado | **Sim**, nosso R2.7 tambem roda verificador em sandbox | Novo requisito: propagacao de exit code e teste obrigatorio do runner de verificador |
| C1 sandbox com rw no proprio codigo | **Sim**, se montarmos config do harness como rw | R3.5 ja diz bind estreito. Reforcar: o codigo do harness nunca e rw dentro do sandbox |
| C2 tool que edita a propria allowlist | **Sim** | R3.6 ja proibe. Adicionar: nenhuma tool do nucleo altera politica sem confirmacao humana fora do canal do modelo |
| C5 hooks inexistentes | **Sim**, adapters sao a nossa aposta | R8.6 vira concreto: a suite de conformidade valida contra o tipo real do runtime, e o CI falha se um hook nao existir na API |
| C4 instalacao incompleta e silenciosa | Sim | R10.2: `doctor` resolve cada arquivo declarado e falha se nao existir. R10.3: instalacao mostra o diff |
| C6 CI que passa com suite vermelha | Sim | R11.4 + novo: teste de fumaca do proprio gate, com fixture que precisa reprovar |
| C8 permissao por agente nao carregada | **Sim** | R3.1 camada 2. Novo: teste que prove que a config do agente foi de fato aplicada, nao so declarada |
| A5 retry nunca persiste | Sim | R1.7 retomada. Novo: teste de duas chamadas provando `rework` e depois `escalate` |
| A6 transicao para fase inexistente | Sim | R1.1 validacao de schema. Novo: integridade referencial de `next[]` no carregamento |
| A7 metrica ausente lida como zero | **Sim** | Regra transversal: ausencia de dado e falha, nunca valor neutro. Vale para todo verificador |
| A9/A10/M15/M16 Rails | Sim | R9.3 deixa de ser lista de skills: perfil = allowlist + comandos de verificacao + limites de engenharia + sintaxe de docstring + politica de paralelismo |
| A11 a A14, M17 a M19 frontend | Sim | R9.3 idem. Novo: criterio de review por tipo de agente, nao unico |
| A15 custo fixo vs teto declarado | **Sim** | R7.2: o teto e fracao da janela util medida no boot, nao numero absoluto. Logar prefixo fixo em `psh doctor` |
| A16 / M10 / M11 / M12 drift prompt vs contrato | **Sim** | Regra transversal: nenhum threshold, roster ou limite e duplicado em prompt. O prompt referencia, o codigo decide |
| M7 compressor que come o state | **Sim** | Se houver compressao no nosso lado, artefato de `.harness/` nunca e candidato |
| M3 lock de skill que nao verifica | Sim | R9.4 ja pede. Reforcar: verificacao de hash roda no CI e na instalacao |
| M20 teste que commita no repo real | Sim | R11.1 + novo: nenhum teste escreve em `process.cwd()` |

Duas regras transversais que sairam desta rodada e que valem mais que qualquer
requisito isolado:

1. **Ausencia de dado e falha, nunca valor neutro.** Aparece em A7 (vuln
   `undefined` vira 0), A2 (allowlist vazio libera tudo), M22 (antivirus
   inacessivel devolve limpo), M11 (RAG ausente indistinguivel de RAG quebrado) e
   C6 (grep vazio passa no gate). E o mesmo bug cinco vezes.
2. **Fonte unica de verdade entre prompt e contrato.** Aparece em A16 (5 workers
   vs 3), M10 (40 vs 80 vs 50 linhas), M15 (complexidade 10 vs 7), M9 (proibido
   vs obrigatorio raciocinar). Numero em prompt envelhece sozinho e o modelo nao
   tem como saber qual fonte e a mais recente.

---

## Recomendacao de prioridade para o colega

Se fosse so uma coisa: **C5**. Cinco plugins inertes explica boa parte do
comportamento estranho do harness, e o teste que impede a recaida (importar cada
plugin e comparar as chaves com `keyof Hooks`) tem umas 10 linhas.

Ordem sugerida:

1. **C5** hooks inexistentes, e **C4** instalacao, que juntos determinam se o
   harness roda como projetado. Sem esses dois, corrigir o resto e otimizar algo
   que nao esta ligado.
2. **C3** exit code, **C6** CI. Sao os dois oraculos do sistema. Enquanto o shell
   e o CI mentirem, nenhuma correcao pode ser verificada.
3. **C1** e **C2**, os dois escapes. `rw_maps` e uma linha; o gate da tool de
   allowlist e uma funcao.
4. **G5** rotacionar a chave do Context7, cobrindo tambem `install.sh:373` e
   `tools/env.example:16`, senao ela volta a circular no proximo install.
5. **C7/G1** e **C8/G2**, que sao os itens de desenho e pedem mais trabalho.

Os achados de Rails e frontend nao sao bugs: sao a constatacao de que o harness
nunca foi apontado para fora de Node/TS e de que o material de design bom esta
desconectado. Viram roadmap, nao correcao urgente.
