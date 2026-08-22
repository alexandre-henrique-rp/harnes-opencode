# /harness-edit-rule — Edição de regras de negócio

> Slash command para editar `.harness/business-rules.json` sem rodar pipeline completo.

## Função

Adicione, edite, remova ou marque como deprecated regras de negócio em `.harness/business-rules.json`. Valida schema e dispara re-teste dos contracts affected.

**Path do arquivo:** `.harness/business-rules.json` (sempre dentro de `.harness/`)

---

## Subcomandos

### `/harness-edit-rule --list`

Lista todas as regras com `id`, `description`, `criticality`, `status`.

```
$ /harness-edit-rule --list
BR-001  [critical] active   Finalizar atendimento gera ordem de pagamento com valor da tabela
BR-002  [advisory] active   Login com 3 tentativas falhas bloqueia conta por 15min
BR-003  [critical] deprecated  Cálculo de frete antigo (substituído por BR-008)
```

### `/harness-edit-rule --new "<descrição>"`

Cria nova regra com heurística automática (campos inferidos do contexto).

```
$ /harness-edit-rule --new "Médico finaliza consulta → cria ordem com valor da tabela"
→ Cria BR-004 com:
  - trigger.method/path inferidos do contexto atual
  - criticality: critical (heurística detectou keyword 'cria')
  - source: manual-edit
  - status: active
→ Salva em .harness/business-rules.json
→ Pergunta ao usuário: "Confirma os campos detectados? (s/n)"
```

### `/harness-edit-rule BR-XXX --field <campo> --value <valor>`

Edita campo específico de uma regra existente.

```
$ /harness-edit-rule BR-001 --field criticality --value advisory
→ Altera criticality de BR-001 para advisory
→ Pergunta: "Re-rodar contract test de BR-001? (s/n)"
```

Campos editáveis: `description`, `criticality`, `status`, `effects[]`, `fieldChecks[]`, `specRefs[]`, `testsCovered[]`, `notes`.

### `/harness-edit-rule BR-XXX --add-effect <json>`

Adiciona novo efeito colateral a uma regra.

```
$ /harness-edit-rule BR-001 --add-effect '{
    "entity": "notificacao",
    "mustExist": true,
    "verifyEndpoint": { "method": "GET", "path": "/api/notificacoes?ordem_id={id}" },
    "fieldChecks": [{ "field": "items[0].canal", "rule": "equals", "value": "email" }]
  }'
→ Adiciona novo efeito à BR-001
→ Re-gera contract test correspondente
```

### `/harness-edit-rule BR-XXX --remove`

Marca regra como `deprecated` (não apaga — mantém histórico).

```
$ /harness-edit-rule BR-003 --remove
→ BR-003 agora tem status: deprecated
→ Testes dessa regra são pulados
→ Mantém no histórico para auditoria
```

### `/harness-edit-rule --validate`

Valida schema de `.harness/business-rules.json`.

```
$ /harness-edit-rule --validate
✅ Schema OK
⚠️ BR-002 não tem testsCovered — adicionar?
⚠️ BR-005 referencia entidade 'medico' que não aparece em SPEC.md
```

---

## Validação automática

Antes de salvar qualquer edição:

1. **Schema válido** — todos os campos obrigatórios preenchidos
2. **Criticality coerente** — `critical` só com `blockedIfFails: true`
3. **Cross-refs** — `specRefs[]` deve apontar para US/AC que existem em SPEC.md
4. **TestsCovered sincronizado** — se regra tem `testsCovered: ["CT-005"]`, esse CT deve existir
5. **Source registrado** — toda edição incrementa `lastEditedBy` + atualiza `lastUpdated`

---

## Comportamento ao editar

Após salvar:
1. **Atualizar** `metadata.totalRules`, `metadata.critical`, `metadata.advisory`, `metadata.uncoveredByTests`
2. **Logar** edição em `events.jsonl` (via audit-logger)
3. **Perguntar** se quer re-rodar testes afetados: *"BR-001 foi editada. Re-rodar contract test? (s/n)"*
4. Se sim: disparar `tester` apenas para essa regra (não sprint inteira)

---

## Quem pode editar

| Origem | Quem | Comando |
|---|---|---|
| Humano (você) | Direto via CLI | `/harness-edit-rule ...` |
| `requirements` agent | Quando SPEC muda | via `task()` |
| `tester` agent | Quando auto-detecta nova regra | via `task()` |
| `rag-curator` | Quando extrai de docs externas | via `task()` |

---

## Anti-patterns

- ❌ Editar `.harness/business-rules.json` manualmente com editor de texto (sempre via comando)
- ❌ Marcar regra crítica como advisory para "passar" no gate
- ❌ Remover regra sem marcar como deprecated (mantém histórico)
- ❌ Criar regra sem `specRefs[]` (não linka ao requisito)
- ❌ Adicionar efeito sem `verifyEndpoint` (não tem como testar)

---

## Exemplo completo

```
$ /harness-edit-rule --new "Paciente cancela consulta 24h antes → reembolso automático de 100%"

# Heurística detecta: "reembolso automático" + "100%" → criticality: critical
# trigger.method/path inferidos do contexto (último endpoint discutido)
# Efeito detectado: cria entidade 'reembolso'

BR-005 criada com:
  description: "Paciente cancela consulta 24h antes → reembolso automático de 100%"
  trigger: POST /api/consultas/{id}/cancelar
  criticality: critical
  effects:
    - entity: reembolso
      mustExist: true
      verifyEndpoint: GET /api/reembolsos?consulta_id={id}
      fieldChecks:
        - field: items[0].valor
          rule: match
          source: consulta[valor_pago]
        - field: items[0].percentual
          rule: equals
          value: 100

Confirma? (s/n): y
✅ BR-005 salva em .harness/business-rules.json
🔁 Re-rodar contract test? (s/n): y
   → tester rodando...
   → BR-005 falhou: GET /api/reembolsos retornou items.length=0
   → readyForQAGate: false
   → blockedBy: ["BR-005"]
```

---

## Diferença vs outras operações

| Operação | Comando |
|---|---|
| Adicionar/editar regra | `/harness-edit-rule` (este) |
| Re-rodar sprint inteira | `/harness-retry` |
| Ver regras + status | `/harness-edit-rule --list` |
| Editar SPEC.md | editar manualmente + rodar `requirements` agent |
