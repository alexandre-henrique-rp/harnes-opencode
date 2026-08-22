# /harness-check-orphans — Detectar arquivos órfãos no `.harness/` global

> Slash command que detecta arquivos `.harness/` salvos no diretório global do opencode (`~/.config/opencode/.harness/`) que provavelmente deveriam estar no `.harness/` do projeto.

## Função

Lista arquivos em `~/.config/opencode/.harness/` que NÃO deveriam estar lá (porque o opencode deveria gravar no projeto, não no global). Apenas **avisa** — não move nem deleta automaticamente.

---

## Uso

```
$ /harness-check-orphans

⚠️  Found 2 item(s) órfão(s) em /home/kingdev/.config/opencode/.harness/

📄 Arquivos:
   1. business-rules.example.json (5.2 KB)
      Provavelmente deveria estar em:
      /home/kingdev/Documentos/GitHub/minimax/image_generat/.harness/

   2. tmp/ (diretório)
      Transient, pode deletar com: rm -rf ~/.config/opencode/.harness/tmp/

📋 Ações sugeridas (manuais):

   # Para mover business-rules.example.json:
   mv ~/.config/opencode/.harness/business-rules.example.json \
      /home/kingdev/Documentos/GitHub/minimax/image_generat/.harness/business-rules.json

   # Para limpar tmp:
   rm -rf ~/.config/opencode/.harness/tmp/

✅ Após mover, rode /harness-where para confirmar que o projectRoot está correto.
```

---

## O que conta como órfão

| Item | É órfão? | Motivo |
|---|---|---|
| `business-rules.json` | ✅ sim | Pertence ao projeto |
| `state.json` | ✅ sim | Estado da sprint do projeto |
| `PRD.md`, `SPEC.md` | ✅ sim | Docs do projeto |
| `qa/`, `reviews/`, `security/` | ✅ sim | Artefatos da sprint do projeto |
| `tmp/` | ✅ sim | Transient, deveria estar no projeto |
| `harness-allowlist.json` | ❌ não | Config global do opencode (legítimo) |
| `.audit-hash` | ❌ não | Hash chain global (legítimo) |
| `state-machine.json` | ❌ não | Contrato do opencode (legítimo) |

---

## Quando usar

- Após detecção de bug no path-boundary (gravação errada)
- Periodicamente (1x por semana) para verificar que o opencode está gravando no lugar certo
- Após mover projetos entre diretórios
- Quando `/harness-where` mostra source=fallback (sinal de que pode ter gravado errado)

---

## Por que não auto-migra

Auto-migrar é arriscado:
- Pode sobrescrever arquivos importantes do projeto
- Pode mover arquivos que são legítimos no global
- Usuário deve revisar antes de mover

A abordagem do harness é **aviso + ação manual**.

---

## Diferença vs /harness-where

| Comando | Função |
|---|---|
| `/harness-where` | Mostra ONDE o opencode está gravando |
| `/harness-check-orphans` | Lista arquivos que FORAM gravados no lugar errado |
