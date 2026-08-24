# Diagnóstico de coerência e plano de correção — OpenCode Agents v6

> **Análise realizada:** 24/08/2026  
> **Documentação avaliada:** `refact_doc/BASELINE-harnes-opencode.md` e `refact_doc/DIAGNOSTICO-CONSOLIDADO.md`  
> **Projeto comparado:** `/home/kingdev/Documentos/Opencode_agents_v6`  
> **Estado observado:** `HEAD` `5fd90fd` (`test`), versão do pacote `6.4.6`, com alterações locais não commitadas.

## 1. Conclusão executiva

A documentação de `refact_doc/` é tecnicamente útil e aborda riscos reais, mas **não deve ser tratada como retrato atual do projeto**. Ela foi produzida para o commit `494f134` de 04/08/2026 e contém achados que já foram modificados, além de referências que não correspondem mais ao estado atual.

Classificação geral:

| Critério | Avaliação |
|---|---|
| Relevância dos temas | Alta |
| Utilidade como auditoria histórica | Alta |
| Coerência com o código atual | Parcial |
| Segurança para orientar correções sem nova validação | Baixa |
| Necessidade de atualização | Imediata |

A auditoria acerta principalmente ao destacar: execução de shell fora do sandbox, comportamento fail-open, integridade dos gates, custo de contexto, divergência entre prompts e state machine e fragilidade dos testes. Porém, números, status e referências devem ser recalculados sobre o `HEAD` atual e sobre as alterações locais.

## 2. Escopo e método da comparação

Foram comparados:

- os dois relatórios em `refact_doc/`;
- `state-machine.json`, `state-machine-lean.json` e `failure-protocol.json`;
- `opencode.json`, `install.sh` e `package.json`;
- `agents/*.md`, `plugins/*`, `plugins/lib/*` e `tools/*`;
- workflow em `.github/workflows/ci.yml`;
- estrutura real de `tests/`, `skills/`, `templates/`, `scripts/`, `schemas/` e `.opencode/tools/`;
- estado do Git, incluindo alterações locais não commitadas.

Esta análise é estática. O status `confirmado` abaixo significa que há evidência no código atual; não significa que todos os cenários foram executados em ambiente limpo.

## 3. Coerência da documentação de `refact_doc/`

### 3.1 O que está coerente

1. **A arquitetura declarativa existe.** `state-machine.json` realmente separa fases, contratos de saída, gates e protocolo de falhas.
2. **O projeto possui as camadas descritas.** Existem agentes, comandos, plugins, ferramentas, skills, templates, schemas, system prompts, testes e scripts.
3. **Há seis fases numeradas de 0 a 5 no fluxo principal**, porém existe também uma `phase.6.ux-gate`. Portanto, a documentação precisa distinguir “seis fases de implementação” de “sete estados numerados”.
4. **O risco de shell nas tools permanece relevante.** O sandbox em `native-sandbox.ts` intercepta especificamente a tool `bash`; chamadas diretas de `execSync`/`spawnSync` em outras tools não passam automaticamente por esse hook.
5. **Há risco fail-open no gate de segurança.** Em `harness-advance.ts`, `criticalVulns` e `highVulns` usam fallback para zero. Ausência de evidência pode ser interpretada como ausência de vulnerabilidades.
6. **O custo de contexto e as contradições de instruções continuam sendo temas válidos**, pois `GERAIS.md`, `system/objectivity.md`, prompts dos agentes e a state machine repetem ou divergem em regras importantes.

### 3.2 Inconsistências internas dos próprios relatórios

- A baseline afirma inicialmente que nenhum achado foi confirmado executando o harness, mas depois informa que 18 achados foram verificados e 11 executando código. O texto precisa ser corrigido para separar a primeira passada estática da segunda passada empírica.
- `DIAGNOSTICO-CONSOLIDADO.md` referencia `GAPS-harnes-opencode.md`, mas esse arquivo não está em `refact_doc/`. O link fica quebrado no pacote analisado.
- A baseline diz que a documentação é contra o commit `494f134`, enquanto o projeto já está no commit `5fd90fd`, com commits intermediários e alterações locais.
- Os relatórios usam `harnes-opencode`, enquanto o diretório analisado é `Opencode_agents_v6`. Isso dificulta rastreabilidade e pode indicar que o relatório foi copiado de outro nome de repositório.
- Há referências a `tools/rag-search.ts`, embora a ferramenta encontrada seja `tools/rag-manager.ts` e exista também `.opencode/tools/rag-manager.ts`.
- Alguns achados citam linhas fixas. Como o código mudou, essas linhas não são mais referências confiáveis; devem ser substituídas por símbolos, testes e links para o commit analisado.

## 4. Achados que mudaram desde a baseline

### 4.1 Instalador — achado C4/Ainda descrito como aberto, mas desatualizado

O diagnóstico afirma que `install.sh` não instala `tools/` e `commands/`. No estado atual, `install_global_opencode_config()` contém blocos explícitos para sincronizar:

- `agents/`;
- `plugins/`;
- `tools/`;
- `templates/`;
- `training/`;
- `commands/`;
- `schemas/`;
- `system/`;
- `GERAIS.md` e `system/objectivity.md`.

Logo, a conclusão histórica pode ter sido correta no commit `494f134`, mas **não está correta para o código atual**. Ainda é necessário verificar se a instalação produz uma configuração funcional, se os caminhos são portáveis e se a cópia global deve ser permitida sem backup/diff.

**Ação:** reclassificar C4 como “corrigido parcialmente — validar em instalação limpa” e anexar evidência de teste com `HOME` temporário.

### 4.2 CI — parte do achado C6 foi corrigida

O workflow atual declara `shell: bash` e usa `set -o pipefail` no step de testes. Isso corrige o problema histórico em que `tee` podia esconder o exit code do teste.

Ainda existe fragilidade no parser de cobertura: o workflow usa `grep`/`head` e `bc`, e precisa comprovar que a saída real do Node contém o formato esperado. Também é necessário confirmar que a ausência de cobertura falha, em vez de ser convertida em um valor neutro.

**Ação:** manter como “parcialmente corrigido” até existir teste do workflow com:

- teste deliberadamente falhando;
- cobertura ausente;
- cobertura abaixo do limite;
- cobertura acima do limite.

### 4.3 Hooks de plugins — o estado atual não sustenta a afirmação original sem ressalvas

O código atual contém hooks válidos como `tool.execute.before`, `tool.execute.after`, `event` e `experimental.chat.system.transform`. `path-boundary.ts` também foi reorganizado para usar `plugins/lib/path-boundary-core.ts`.

Isso indica evolução em relação ao diagnóstico de hooks inexistentes. Entretanto, `opencode.json` atualmente lista apenas `./plugins/audit-logger.ts` em `plugin`. Portanto, um plugin ter código correto não significa que ele esteja carregado em runtime.

**Ação:** separar duas perguntas na documentação:

1. o hook é aceito pela versão instalada do SDK;
2. o plugin está realmente listado e carregado pela configuração.

### 4.4 Path boundary e permissões por agente — houve correção importante, mas o risco não está encerrado

A versão atual de `path-boundary.ts` lê permissões declaradas em `opencode.json` e também carrega frontmatter de `agents/*.md` via `getAgentsFromMarkdown()`. Isso contradiz diretamente o achado histórico C8, que dizia que as permissões nunca eram carregadas.

Por outro lado, o código ainda mantém `fail-open` como comportamento padrão quando `HARNESS_PATH_BOUNDARY_MODE` não é `fail-closed`, e o carregamento deve ser validado com testes para `write`, `edit`, `bash`, agente desconhecido, allowlist vazia e arquivo de configuração inválido.

**Ação:** reclassificar C8 como “provavelmente corrigido — falta validação de integração” e manter A2 como pendência de segurança.

### 4.5 Retry — o achado A5 foi alterado no código atual

`harness-advance.ts` agora incrementa `attempt` e grava o estado imediatamente antes de validar o gate. Isso atende ao problema descrito na baseline sobre a perda do contador entre chamadas.

Ainda é preciso testar o comportamento após o limite de tentativas e confirmar se o protocolo usa a configuração correta entre `phase.onFailure` e `failure-protocol.json`.

**Ação:** reclassificar A5 como “corrigido parcialmente — teste de exaustão pendente”.

### 4.6 Sandbox e exit code — melhoria aparente, mas precisa de teste de processo

O script gerado atualmente usa `set -o pipefail`, `trap 'rm -f "$0"' EXIT` e `exit $?`. Isso é uma correção plausível para o mascaramento de exit code descrito no relatório.

O resultado ainda deve ser testado com comandos que retornem códigos 0, 1 e 7, com sandbox disponível e indisponível. Também deve ser verificado o cleanup quando o processo é interrompido.

**Ação:** reclassificar C3 como “provavelmente corrigido — confirmar executando”.

## 5. Problemas que continuam prioritários

### P0 — segurança e integridade do gate

1. **Tools executando shell diretamente.** As chamadas de `execSync`/`spawnSync` em `tools/` não são interceptadas pelo hook específico da tool `bash`. A solução deve usar execução sem shell quando possível (`execFile`/`spawn` com argumentos), validação de entradas e uma camada de execução controlada.
2. **Falha fail-open no path boundary.** O padrão deve ser fail-closed para arquivos críticos, configurações ausentes, JSON inválido e agente desconhecido.
3. **Allowlist mutável pelo próprio agente.** `.harness/reviews/**`, allowlists, `.ai-jail`, configurações e âncoras de auditoria não devem ser liberáveis pelo mesmo agente que depende delas para passar no gate.
4. **Métricas de segurança ausentes tratadas como zero.** Ausência de relatório deve bloquear o avanço. “Não medido” não pode ser equivalente a “zero vulnerabilidades”.
5. **Auditoria com dados sensíveis.** O audit logger registra `output.args`; comandos e conteúdos de `write` podem conter secrets ou PII. Deve haver redação por campo e exclusão de valores sensíveis antes da persistência.

### P1 — execução e distribuição

1. **Plugins efetivamente carregados.** A configuração atual lista apenas o audit logger; é necessário definir quais plugins são obrigatórios e garantir que a instalação e o runtime os carreguem.
2. **Instalação global sem isolamento suficiente.** A cópia de `agents/`, `plugins/`, `tools/` e `skills/` para `~/.config/opencode/` deve ter manifesto, versão, backup e validação de origem.
3. **Comandos do instalador.** As formas com espaço (`--package arquivo`, `--add-allow padrão`) precisam ser testadas, pois o parser usa `for arg in "$@"` junto com `shift`.
4. **Links e caminhos absolutos.** Referências `/home/kingdev/...` não são portáveis e não devem ser contratos de runtime.
5. **MCPs.** Validar se MCPs usados estão realmente declarados, instalados, versionados e testados. O `opencode.json` atual possui `mcp: {}`, então conclusões antigas sobre seis MCPs não representam essa configuração atual.

### P2 — coerência do workflow

1. `state-machine.json` possui `phase.6.ux-gate`, enquanto `agents/orchestrator.md` descreve seis fases e a tabela termina na fase 5.
2. `phase.6.ux-gate` aponta o próximo estado para si mesma, o que deve ser explicitamente definido como estado terminal ou corrigido.
3. A state machine define até três workers na fase 5 e política sequencial para segurança, enquanto o prompt do orchestrator manda disparar cinco workers em paralelo. Uma única fonte de verdade deve prevalecer.
4. O contrato de cobertura aparece com limiares diferentes em arquivos distintos: a máquina usa 85 na fase 5, enquanto o CI atual comenta e valida 70.
5. O gate de design usa score mínimo 70, mas o critério de pontuação precisa estar documentado e testável.
6. Limites de `AGENTS.md` divergem entre `GERAIS.md`, `documenter.md` e o gate da fase 1.

### P3 — qualidade e adaptação de stack

1. `npm test` e `npm run test:coverage` mantêm listas manuais de arquivos. Isso facilita deixar testes novos fora da execução; deve-se usar descoberta controlada ou uma verificação que compare todos os testes presentes com os testes executados.
2. Coverage, AST, API contract e segurança devem reconhecer a stack do projeto ou declarar explicitamente que são somente Node/TypeScript.
3. Rails e Next.js precisam de adaptadores próprios ou devem ser rejeitados claramente pelo perfil incompatível.
4. O fluxo frontend deve realmente ler `experimental.frontendContextFirst` ou remover a flag; configuração não utilizada cria falsa sensação de controle.
5. O RAG deve ter um único caminho oficial. O índice escrito e o índice lido precisam ser o mesmo arquivo, preferencialmente `.harness/RAG/index.json`.

## 6. Plano recomendado de correção

### Fase 1 — estabelecer uma baseline confiável

- Criar uma nova baseline para `HEAD` `5fd90fd`.
- Registrar separadamente `HEAD`, alterações locais e versão de `package.json`.
- Substituir referências por linhas fixas por referências a símbolos, testes e commits.
- Remover ou incluir o arquivo `GAPS-harnes-opencode.md` para eliminar links quebrados.
- Reexecutar as contagens de agentes, tools, testes, skills e plugins.
- Para cada achado, usar somente: `aberto`, `corrigido`, `corrigido parcialmente`, `não reproduzido`, `não se aplica` ou `regrediu`.

### Fase 2 — fechar os gates de segurança

- Alterar ausência de métricas para falha bloqueante.
- Proteger allowlists, reviews, state machine, audit hash, `.ai-jail` e configurações com denylist imutável.
- Fazer o boundary resolver symlinks (`realpath`) e testar traversal, symlink, case sensitivity e separadores Windows.
- Impedir auto-allow global (`**`) e exigir aprovação explícita para mudanças de escopo.
- Criar verificador independente do audit log e armazenar a âncora fora do escopo de escrita do agente.

### Fase 3 — eliminar shell inseguro

- Inventariar todas as chamadas `execSync`, `spawnSync`, `exec` e `spawn`.
- Trocar interpolação de strings por argumentos estruturados.
- Centralizar execução em um executor seguro com timeout, cwd validado, ambiente mínimo e captura correta de exit code.
- Definir quais operações podem usar sandbox e falhar quando a proteção obrigatória não estiver disponível.
- Testar entradas com espaços, aspas, `$()`, crases, newline, glob e caminhos maliciosos.

### Fase 4 — tornar instalação e CI verificáveis

- Testar `install.sh` em `HOME` temporário, com e sem arquivos existentes.
- Validar todos os argumentos documentados nas formas com espaço e `=`.
- Criar um smoke test que verifica arquivos instalados, plugins carregados e tools disponíveis.
- Fazer o CI executar todos os testes e reprovar teste falho, cobertura ausente e cobertura abaixo do limiar.
- Fixar dependências de produção e escolher um único gerenciador entre npm e Bun.

### Fase 5 — unificar contratos e reduzir contexto

- Definir `state-machine.json` como fonte única de thresholds, workers e transições.
- Gerar partes dos prompts a partir do contrato ou remover números duplicados dos prompts.
- Escolher uma regra única para `AGENTS.md`, raciocínio, TDD, workers e fase UX.
- Separar catálogo de skills essenciais das skills opcionais e medir o custo real por agente.
- Corrigir o caminho único do RAG e criar teste de escrita/leitura do índice.

### Fase 6 — testes de regressão e publicação

- Criar testes de integração para cada correção crítica.
- Executar validação em instalação limpa e em projeto Node, Rails e frontend.
- Atualizar a baseline somente depois dos testes.
- Publicar no diagnóstico a evidência: comando, ambiente, resultado, commit e status.

## 7. Critérios mínimos de aceite

A correção pode ser considerada confiável quando:

- nenhum gate de segurança aprova com métrica ausente;
- nenhum agente consegue editar sua própria allowlist, state machine, review ou âncora de auditoria;
- comandos executados por tools não dependem de interpolação shell insegura;
- `npm test` executa todos os testes encontrados ou falha se algum ficar fora;
- o CI falha com teste vermelho e cobertura abaixo do limiar;
- uma instalação em `HOME` vazio carrega os plugins, tools e commands esperados;
- a documentação informa exatamente o commit analisado e não possui links quebrados;
- o prompt do orchestrator, os agentes e `state-machine.json` possuem o mesmo número de fases, workers e thresholds;
- sandbox disponível, indisponível e interrompido produzem resultados e logs honestos;
- os testes cobrem traversal, symlink, allowlist vazia, agente desconhecido, auto-allow e comandos com exit code diferente de zero.

## 8. Veredito final

A documentação em `refact_doc/` é **coerente como auditoria histórica e como lista de riscos**, mas **parcialmente incoerente com o projeto atual**. Não é recomendável simplesmente aplicar todos os achados como se ainda estivessem no mesmo estado: C4, C5, C8, A5 e C3 mostram sinais claros de evolução; A3 e A6 já foram marcados como não reproduzidos; e vários pontos continuam abertos.

O próximo passo correto é manter este documento como plano de ação e gerar uma nova baseline baseada no `HEAD` atual, com testes de reprodução para cada item crítico. A prioridade deve ser segurança dos gates, isolamento do path boundary, shell nas tools, auditoria de secrets, instalação limpa e unificação dos contratos.
