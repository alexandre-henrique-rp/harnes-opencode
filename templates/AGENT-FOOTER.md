# AGENT-FOOTER — Bloco Comum de Rodapé para Agentes

> **Este é um template de referência**, NÃO é importado automaticamente. Use-o como guia ao escrever ou revisar agentes para evitar boilerplate repetido.

## Seções obrigatórias (manter)

Todo agente DEVE conter, em ordem:

1. **Frontmatter YAML** — `name`, `description`, `mode: subagent`, `permission`, `skill`.
2. **Identidade** — 1 parágrafo dizendo quem é o agente.
3. **Script de Atuação** — passos numerados (mínimo 3, máximo 7).
4. **Output contract** — JSON shape esperado pelo orchestrator.
5. **Anti-patterns** — máx. 5 itens, específicos do agente.

## Seções a REMOVER (boilerplate)

� **"🛠️ Delegação de Tools Locais"** — info de tools já está no frontmatter.
❌ **"Uso Ostensivo de Skills"** — texto genérico ignorado pelo LLM.
❌ **Bloco de "Quando pedir ajuda"** — só manter se for caso ambíguo real.
❌ **Bloco "Quem é o seu cliente"** — inferir do contexto.
❌ **Bloco "Última validação"** — versionamento via git, não texto.

## Tamanho-alvo

| Tipo de agente | Linhas máx. |
|---|---|
| Orquestrador | 100 |
| Worker de revisão (PRD/SPEC/Design/Planning) | 90 |
| Worker de execução (Backend/Frontend/Tester) | 150 |
| Worker de auditoria (Security/LGPD/Code-reviewer) | 150 |
| Auxiliar (Briefing/RAG/Documenter/Sprint-tasker) | 130 |
| Conversacional (Companion/Knowledge) | converter para command |

## Anti-patterns genéricos (já cobertos pelo GERAIS.md)

Não repetir no agente — já estão em `~/.config/opencode/GERAIS.md §10`:

- ❌ Editar `state-machine.json` em runtime
- ❌ Escrever fora do path allowlist
- ❌ Inventar padrão sem verificar RAG
- ❌ "Vibe coding" sem teste

## Check antes de commitar

- [ ] Tamanho ≤ 200 linhas (exceto agente com contrato externo obrigatório)
- [ ] Permission frontmatter coerente com paths no corpo
- [ ] Output contract bate com `state-machine.json`
- [ ] Anti-patterns são específicos (não copia de outros agentes)
