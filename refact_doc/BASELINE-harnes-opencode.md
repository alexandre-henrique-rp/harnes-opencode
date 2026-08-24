# Baseline do harnes-opencode

*Retrato datado de 22/08/2026 para facilitar a proxima verificação.*

> 54 achados, sendo 8 críticos. Nenhum deles foi confirmado rodando o harness: são leitura de código, trate como muito provável, não como fato.

Este documento é o índice com estado. O conteúdo completo de cada achado, com
trecho de código e sugestão de correção, está em
[DIAGNOSTICO-CONSOLIDADO.md](DIAGNOSTICO-CONSOLIDADO.md).

A coluna que importa é a de status. Quando alguém reverificar, muda ela e
acrescenta uma linha no histórico do fim. É isso que transforma uma revisão
pontual em série temporal, e é o que deixa a regressão visível.

---

## O que foi medido, e contra qual código

| Campo | Valor |
| --- | --- |
| Commit | `494f13419c29` |
| Data do commit | 2026-08-04 |
| Data da verificação | 2026-08-22 |
| Método | leitura de código, mais seis revisões especializadas em paralelo |

As seis revisões foram de segurança, QA, DevOps, Rails, frontend e engenharia de
contexto.

**18 dos 54 achados foram verificados, e 11 deles executando o código.** Os
oito críticos e dez dos dezesseis altos. A verificação derrubou dois achados e
corrigiu um número, o que já paga o esforço: os três iam sair daqui como fato.

Os demais continuam marcados `aberto`, que aqui significa "levantado por leitura
e ainda não reproduzido". Leitura encontra o que está escrito errado. Execução
encontra o que nunca acontece.

### O achado que a medição deixou mais forte

**A15, o custo fixo de contexto.** O `GERAIS.md` declara, na linha 304, orçamento
de **4.000 tokens por tarefa** e 30.000 por sessão. Contei os arquivos que o
`opencode.json` marca como carregados em toda sessão, com o tokenizador real da
API e não com estimativa de caracteres:

| Conteúdo sempre carregado | Tokens |
| --- | --- |
| `GERAIS.md` mais `system/objectivity.md` | 9.173 |
| Teto declarado por tarefa | 4.000 |

São **2,3x o teto antes da tarefa começar**: antes do prompt, antes de ler
arquivo, antes de qualquer resultado de tool. E consome 31% do orçamento de
sessão sem ter feito nada.

O mesmo `GERAIS.md` diz, na linha 46, que nenhum `AGENTS.md` deve passar de 40
linhas. O `AGENTS.md` da raiz do próprio repositório tem 42, e outros dois
passam de 100.

### O que caiu na verificação

**A3, o instalador sobrescrevendo a config global: não reproduz.** Rodei o
`install.sh` duas vezes com `HOME` isolado, uma com config preexistente e outra
sem. O `opencode.json` do usuário sobreviveu byte a byte nas duas. O script
trata esse arquivo como intocável de propósito, e diz isso num comentário no
topo.

**A6, a transição final estourando: não reproduz.** O diagnóstico afirma que
`transitionPhase` grava o state e depois acessa `state.phases[next].owner`, que
seria `undefined`. Existe uma guarda `if (nextPhase)` que impede isso, e
`phase.5.complete` não é um alvo quebrado: é marcador terminal deliberado,
tratado na linha 543 como `Concluido`. A consequência real é bem menor, a
chamada seguinte responde "Fase não encontrada" em vez de "projeto concluído".
Isso é atrito de mensagem, não severidade alta.

**Dois números estavam errados.** A mensagem enviada fala em "881 linhas de
plugin que não rodam". Medindo: só o `prompt-cache-prefixer.ts` está inteiramente
morto, **245 linhas**. Os outros quatro registram hook válido também e funcionam
em parte, somando 904 linhas parcialmente afetadas. Nem 881 nem "não rodam".

O A4 falava em "as 40 tools". São **36**, das quais **16** executam shell, com
**47 chamadas** de `execSync` e `spawnSync` no total. O achado se sustenta e fica
mais forte com o número certo: o sandbox tem `if (tool !== "bash") return` nos
dois hooks, então nenhuma dessas 47 chamadas passa por ele nem pelo filtro de
comando destrutivo.

---

## O tamanho do problema

| Severidade | Quantidade | Critério |
| --- | --- | --- |
| Crítico | 8 | quebra garantia anunciada, ou reporta sucesso sem ter funcionado |
| Alto | 16 | perde funcionalidade ou dado em silêncio |
| Médio | 30 | atrito ou risco que ainda não mordeu |
| **Total** | **54** | |

A mensagem enviada em 22/08 citou 40 achados. O diagnóstico cresceu depois da
mensagem: **54 é o número correto.**

Os oito críticos têm um padrão em comum, e ele é o mais perigoso que existe numa
ferramenta de verificação: **quase todos reportam sucesso.** Plugin que carrega
sem rodar, CI que fica verde com a suite vermelha, sandbox que devolve exit 0
para comando que falhou, portão que aprova com métrica que o próprio agente
informou. Nenhum deles quebra na cara de quem usa. Todos mentem sobre ter
funcionado.

---

## Críticos

| ID | Achado | Onde | Status |
|---|---|---|---|
| C1 | O sandbox dá escrita no diretório dos próprios plugins de segurança | `plugins/native-sandbox.ts` | confirmado (leitura) |
| C2 | A tool `harness-allowlist` não tem gate nenhum | `tools/harness-allowlist.ts:143` | confirmado (leitura) |
| C3 | O sandbox mascara o exit code: todo bash volta 0 | `plugins/native-sandbox.ts:165` | **confirmado rodando** |
| C4 | A instalação não instala o harness | `install.sh:269` | **confirmado rodando** |
| C5 | Cinco dos oito plugins registram hook que não existe | `plugins/` | **confirmado rodando** |
| C6 | O CI passa com a suite vermelha e 0% de cobertura | `.github/workflows/ci.yml:58` | **confirmado rodando** |
| C7 | O portão da fase de build aceita métrica do próprio agente | `tools/harness-advance.ts:39` | **confirmado rodando** |
| C8 | As permissões por agente nunca são carregadas | `plugins/path-boundary.ts:628` | confirmado (leitura) |

## Altos

| ID | Achado | Onde | Status |
|---|---|---|---|
| A1 | O auto-allow injeta `**` e desliga o boundary para sempre | `tools/harness-allowlist.ts` | confirmado (leitura) |
| A2 | O path boundary é fail-open por padrão | `plugins/path-boundary.ts` | confirmado (leitura) |
| A3 | O instalador sobrescreve a config global do usuário | `install.sh` | **não reproduzido** |
| A4 | 16 das 36 tools rodam shell fora do jail e do filtro | `tools/` | **confirmado rodando** |
| A5 | O contador de retry não persiste: `quality` nunca esgota | `tools/harness-advance.ts` | **confirmado rodando** |
| A6 | A transição final grava o state e depois estoura | `tools/harness-advance.ts` | **não reproduzido** |
| A7 | Métrica de segurança ausente é lida como zero vulnerabilidade | `tools/harness-advance.ts` | **confirmado rodando** |
| A8 | Cinco arquivos de teste não rodam nem passam pelo typecheck | `tests/` | **confirmado rodando** |
| A9 | Rails: nenhum agente consegue escrever um arquivo de spec | `harness-allowlist.json` | **confirmado rodando** |
| A10 | Rails: o verificador de cobertura não lê a stack | `tools/coverage-analyzer.ts` | **confirmado rodando** |
| A11 | Frontend: as skills de design não alcançam quem escreve JSX | `skills/design/` | aberto |
| A12 | Frontend: o review penaliza o que o frontend é proibido de fazer | `agents/code-reviewer.md` | aberto |
| A13 | Frontend: a fase 3 gera artefato que o frontend nunca lê | `state-machine.json` | aberto |
| A14 | Frontend: o score estético 70 não tem critério estético | `state-machine.json` | aberto |
| A15 | Contexto: o custo fixo estoura o próprio teto declarado | `GERAIS.md` | **confirmado medindo** |
| A16 | Contexto: o `GERAIS.md` descreve fase 5 que a máquina recusa | `GERAIS.md` | confirmado (leitura) |

## Médios

| ID | Achado | Onde | Status |
|---|---|---|---|
| M1 | O `audit.log` grava argumento sem redação e vai pro git | `plugins/audit-logger.ts` | aberto |
| M2 | As regras de `deny` só protegem a raiz do projeto | `opencode.json` | aberto |
| M3 | O `skills-lock.json` existe mas não verifica nada | `skills-lock.json` | aberto |
| M4 | 131 scripts executáveis e um kit ofensivo, com skill allow | `skills/` | aberto |
| M5 | A defesa contra prompt injection é só texto | `system/` | aberto |
| M6 | `AI_JAIL_ACTIVE=1` é autodeclaração, e o log afirma sandbox | `plugins/native-sandbox.ts` | aberto |
| M7 | O compressor pode comprimir o próprio state e o SPEC | `plugins/context-compressor.ts` | aberto |
| M8 | O cache-prefixer, se rodasse, duplicaria histórico e tools | `plugins/prompt-cache-prefixer.ts` | aberto |
| M9 | Instruções de sinal oposto e força igual no mesmo contexto | `GERAIS.md` | aberto |
| M10 | `AGENTS.md` tem três limites mutuamente exclusivos | `AGENTS.md` | aberto |
| M11 | O índice do RAG é escrito num diretório e lido em outro | `tools/rag-search.ts` | aberto |
| M12 | O pedido de criação de RAG não tem canal | `agents/rag-curator.md` | aberto |
| M13 | Perfil `lean` remove segurança, review e LGPD sem avisar | `state-machine-lean.json` | aberto |
| M14 | Symlink não é resolvido, e não há teste de bypass | `plugins/path-boundary.ts` | aberto |
| M15 | Rails: limites e docstring colidem com a stack | `GERAIS.md` | aberto |
| M16 | Rails: fase 5 paralela disputa o `db/schema.rb` | `state-machine.json` | aberto |
| M17 | Frontend: o `frontendContextFirst` não é lido | `scripts/check-context-first.sh` | aberto |
| M18 | Frontend: o a11y-scanner é decorativo e tem bug de regex | `tools/a11y-scanner.ts` | aberto |
| M19 | Frontend: o caminho Stitch gera React de Vite | `skills/` | aberto |
| M20 | Testes que não provam nada, e um que commita no repo real | `tests/` | aberto |
| M21 | O restore de checkpoint pega o stash errado | `tools/harness-checkpoint.ts` | aberto |
| M22 | O antivírus do uploader retorna limpo em qualquer erro | `skills/` | aberto |
| M23 | MCPs sem pin, sem probe e sem fallback | `opencode.json` | aberto |
| M24 | `bun.lock` e `package-lock.json` descrevem projetos diferentes | `bun.lock` | aberto |
| M25 | Argumentos documentados do instalador sempre abortam | `install.sh` | aberto |
| M26 | Guarda de TTY invertida no instalador via curl | `install.sh:382` | aberto |
| M27 | O `tmp/sandbox` acumula scripts com o comando em texto puro | `plugins/native-sandbox.ts` | aberto |
| M28 | O diagnóstico só existe de dentro de uma sessão que funciona | `commands/` | aberto |
| M29 | O instalador reescreve o `.gitignore` do projeto | `install.sh` | aberto |
| M30 | O `force` não deixa rastro no `state.json` | `tools/harness-advance.ts` | aberto |

---

## O que está bom, e também entra na baseline

Isto não é cortesia. Se um destes itens piorar numa versão futura, é regressão
igual às outras, e sem registrar agora ninguém vai notar.

| Item | Onde | Por que presta |
| --- | --- | --- |
| Forma da state machine | `state-machine.json` | separa contrato de snapshot |
| `validateScoreThreshold` | `harness-advance.ts:301` | lê do arquivo e acusa divergência |
| Cadeia de hash do audit | `audit-logger.ts:144` | `prevHash` entra no payload |
| `writeAtomic` | `harness-db.ts:47` | tmp mais rename, não corrompe |
| Probe real do sandbox | `native-sandbox.ts:62` | testa se funciona, não se existe |
| Skills `ui-craft` e `impeccable` | `skills/design/` | conteúdo de design real |
| `UI-SPEC-TEMPLATE.md` | `templates/` | token de design de verdade |
| `check-context-first.sh` | `scripts/` | verificador determinístico |
| `SPEC-TEMPLATE.md` 4.2 e 9.2 | `templates/` | backfill e rollback bem tratados |

Duas merecem destaque fora da tabela.

**`validateScoreThreshold` é o padrão certo de portão**, e ele já existe no
repositório. Lê o score do arquivo, ignora o parâmetro que o modelo passou e
acusa quando os dois divergem. É exatamente o desenho que falta nos outros
portões. Falta só a fonte deixar de ser gravável pelo agente.

**As skills de design são o ativo mais valioso do repo.** Scene sentence
obrigatória, register Product contra Brand, dials declarados antes de gerar
pixel, 308 linhas de anti-slop, contraste 4.5:1 com o diagnóstico certo sobre
por que design de IA parece difícil de ler. Isso é conteúdo, não enchimento.

---

## Como reverificar sem reler tudo

Cada achado tem arquivo e linha no diagnóstico. Mas a maioria pertence a uma de
sete classes, e cada classe tem uma checagem barata que responde sim ou não.

| Classe | Achados | Como conferir |
| --- | --- | --- |
| Hook inexistente | C5 | importar cada plugin e comparar as chaves com `keyof Hooks` |
| Exit code mascarado | C3 | rodar comando que sai com 7 e conferir o código no chamador |
| Instalação incompleta | C4 | instalar em diretório limpo e comparar com `config/install.json` |
| CI verde com suite vermelha | C6 | quebrar um teste de propósito e ver se o pipeline reprova |
| Portão auto-reportado | C7 | chamar avanço de fase com métrica forjada |
| Boundary por agente | C8 | escrever fora do escopo por `write` e por `bash` |
| Stack Rails | A9, A10 | apontar num projeto Rails e criar arquivo em `spec/` |

Comece conferindo se o alvo mudou:

```bash
cd harnes-opencode
git log -1 --format='%H %cs %s'
```

**Achado que você não conseguiu reproduzir não vira `corrigido`.** Vira
`não reproduzido`, com o motivo escrito. Zero resultado numa busca não é
evidência de zero ocorrência: pode ser a busca que não rodou. Essa distinção
custou duas rodadas de retrabalho no `prostaff-hooks`, onde uma poda de
configuração não removeu nada e imprimiu sucesso, porque o caminho do diretório
tinha um caractere que o regex interpretou.

Os valores válidos de status são `aberto`, `corrigido`, `não reproduzido`,
`não se aplica` e `regrediu`.

---

## Histórico de verificações

| Data | Commit | Críticos | Altos | Médios | Observação |
| --- | --- | --- | --- | --- | --- |
| 2026-08-22 | `494f13419c29` | 8 | 16 | 30 | baseline inicial, por leitura de código |
