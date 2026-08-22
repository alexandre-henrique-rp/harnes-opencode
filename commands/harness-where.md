# /harness-where — Mostrar projectRoot detectado

> Slash command para debug. Mostra onde o harness está gravando as coisas.

## Função

Mostra:
- O `projectRoot` que está sendo usado atualmente
- A fonte da detecção (worktree, directory, auto-detect, fallback)
- O path do `.harness/` que será usado
- Lista os tools/plugins que dependem deste projectRoot
- **v6.7.0+:** quando `source = fallback`, lista subdiretórios irmãos que parecem
  projetos (têm `.git/` ou `package.json`) — dica para criar `.harness/project.json`

---

## Uso

```
$ /harness-where

🔍 Harness Project Root Detection
─────────────────────────────────
📁 projectRoot: /home/kingdev/Documentos/GitHub/NEXIA/dev/teste
🎯 source:      fallback (⚠️ nenhum marcador detectado)
📂 .harness/:   /home/kingdev/Documentos/GitHub/NEXIA/dev/teste/.harness/

⚠️  Detectei projetos irmãos neste workspace:
   • backend/    (contém .git/)
   • frontend/   (contém .git/)
   • mobile/     (contém package.json)
   
   💡 Se este é um workspace multi-projeto, crie .harness/project.json:
      echo '{"projectRoot":"<raiz>"}' > .harness/project.json

📦 Tools/plugins usando este projectRoot:
   • audit-logger.ts
   • path-boundary.ts
   • status-injector.ts
   • harness-init.ts
   • harness-advance.ts
   • ... (24 total)
```

Quando `source ≠ fallback`:

```
$ /harness-where

🔍 Harness Project Root Detection
─────────────────────────────────
📁 projectRoot: /home/kingdev/Documentos/GitHub/minimax/image_generat
🎯 source:      auto-detect via .git/
📂 .harness/:   /home/kingdev/Documentos/GitHub/minimax/image_generat/.harness/

📦 Tools/plugins usando este projectRoot:
   • audit-logger.ts
   • path-boundary.ts
   • status-injector.ts
   • harness-init.ts
   • harness-advance.ts
   • ... (24 total)
```

---

## Quando usar

- Suspeita que o harness está gravando no lugar errado
- Após mover o projeto para outro diretório
- Quando um arquivo órfão aparece em `~/.config/opencode/.harness/`
- Para verificar se o `project.json` foi detectado corretamente
- **v6.7.0+:** Quando aparece o warning `[resolve-cwd] WARNING`, rode para ver
  quais irmãos foram detectados e decidir se vale criar `project.json`

---

## Fontes possíveis (em ordem de prioridade)

| Fonte | Quando |
|---|---|
| `.harness/project.json` | Existe arquivo com `projectRoot` explícito (PRIORIDADE ABSOLUTA) |
| `ctx.worktree` | Opencode foi aberto com worktree explícito |
| `ctx.directory` | Opencode foi aberto com directory explícito |
| `auto-detect` | Subiu do process.cwd() procurando `.git/`, `package.json`, etc. |
| `fallback` | Nenhum marcador — usa process.cwd() com warning + dica de irmãos |

---

## Como forçar um projectRoot específico

Se a detecção automática escolher o path errado (ex: monorepo com múltiplos `.git/`), crie `.harness/project.json` no projeto:

```json
{
  "_type": "harness-project-v6",
  "version": "1.0.0",
  "projectRoot": "/path/absoluto/correto/do/projeto"
}
```

O helper vai detectar este arquivo antes de qualquer outra heurística (linhas 146-163 de `plugins/lib/resolve-project-cwd.ts`).

---

## Diferença vs /harness-status

| Comando | Mostra |
|---|---|
| `/harness-where` | Onde o harness está rodando (filesystem) |
| `/harness-status` | Estado da máquina de fases (workflow) |
