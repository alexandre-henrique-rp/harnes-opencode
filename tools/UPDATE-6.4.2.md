# OpenCode Agents v6 — Update v6.4.2

## 📦 Resiliência do Sandbox ai-jail (Auto-fallback)

Esta é uma **versão de correção** (patch) focada em tornar o sandbox ai-jail/bwrap **robusto contra ambientes onde o kernel não tem user namespaces** (WSL2, Docker sem `--privileged`, distros hardened).

### 🐛 Problema (v6.4.1)

```bash
$ ls
bwrap: Failed to make / slave: Operation not permitted
❌ Todos os comandos bash falham
```

O plugin `native-sandbox.ts` assumia que `ai-jail` instalado = `bwrap` funcional. Em ambientes WSL2/Docker isso não é verdade — `bwrap` falha mas `command -v ai-jail` retorna sucesso.

### ✅ Solução (v6.4.2)

**Probe real + fallback gracioso**. O plugin agora:

1. Faz **probe real** com `ai-jail --exec echo` (timeout 5s) na inicialização
2. Cacheia resultado em `~/.local/share/opencode/sandbox-status.json` (24h)
3. Se probe falha → pula o wrapping, comandos bash rodam **sem** sandbox
4. Loga warning em stderr com recomendação: `AI_JAIL_ACTIVE=1 ai-jail opencode`

### 🎯 Antes vs Depois

| Cenário | Antes (6.4.1) | Depois (6.4.2) |
|---|---|---|
| ai-jail OK + bwrap OK | Sandbox por-comando ativo | Sandbox por-comando ativo |
| ai-jail OK + bwrap falha (WSL2) | ❌ **todos os bash quebram** | ⚠️ Roda sem sandbox + warning |
| ai-jail ausente | Roda sem sandbox | Roda sem sandbox (igual) |
| `AI_JAIL_ACTIVE=1` (sessão pai) | Sandbox via herança | Sandbox via herança (igual) |
| `HARNESS_NO_SANDBOX=1` (opt-out) | Honrado | Honrado (igual) |

### 🔧 Mudanças Técnicas

#### `plugins/native-sandbox.ts` (+82 linhas)
- Substituído `command -v ai-jail` (checagem falsa-positiva) por probe real `execFileSync("ai-jail", ["--exec", "echo", "..."], { timeout: 5000 })`
- Adicionado cache em disco (`STATUS_FILE = ~/.local/share/opencode/sandbox-status.json`) com TTL 24h
- Funções: `loadSandboxStatus()`, `saveSandboxStatus()`, `probeSandbox()`
- Honra `HARNESS_NO_SANDBOX=1` para opt-out explícito
- Audit log: `event: sandbox.status` + recomendação

#### `tools/harness-workspace.ts` (+130 linhas)
- Nova função `diagnoseSandbox()`:
  - Detecta ai-jail (versão)
  - Testa bwrap com probe
  - Lê `/proc/sys/kernel/unprivileged_userns_clone` no Linux
  - Gera recomendação contextual (sudo sysctl, AI_JAIL_ACTIVE, etc)
- Nova função `persistDiagnostic()`: salva em `.harness/sandbox-diagnostic.json`
- `ensureAiJailConfig()` agora silencioso em falha (não bloqueia harness)
- Tool retorna `result.sandbox = { bwrapWorks, aiJailInstalled, recommendation, diagnosticFile }`

#### `tools/harness-status.ts` (+28 linhas, totalmente defensivo)
- Try/catch externo envolvendo toda execução — nunca propaga throw
- Cada `JSON.parse` tem fallback próprio
- Cada acesso a `state.X` é defensivo (`|| null`, `|| {}`)
- Resolve bug "Cannot read properties of undefined (reading 'split')"
- Adiciona campo `initialized: boolean` no output

### 📦 Empacotamento Limpo (Bonus)

Nova flag `--package` para gerar tarball sem "sujeira":

```bash
./install.sh --list-essentials              # mostra o que entra
./install.sh --package dist/harness.tar.gz  # gera tarball limpo
npm run setup:package                       # equivalente npm
```

Lista controlada por `tools/DIST-MANIFEST.json`. Filtra:
- `backup/`, `tmp/`, `.harness/tmp/`, `.harness/audit/`
- `.env*`, `*.log`, `.DS_Store`
- `dist/`, `build/`, `coverage/`
- `*.tar.gz`, `*.zip`, `*.tgz`

`.gitignore` também foi expandido via `install.sh ensure_gitignore()` para incluir todas essas entradas.

### 🧪 Testes

Novo arquivo `tests/ai-jail-sandbox.test.ts` (10 testes):

1. `diagnoseSandbox` — sem ai-jail → recomendação de instalar
2. `diagnoseSandbox` — `AI_JAIL_ACTIVE=1` → marca como disponível
3. `diagnoseSandbox` — schema sempre bem-formado
4. `diagnoseSandbox` — non-Linux → `userNamespacesEnabled=null`
5. `persistDiagnostic` — grava `.harness/sandbox-diagnostic.json`
6. `harness-workspace` tool — retorna diagnóstico sem quebrar
7. `harness-status` — `.harness/` ausente → JSON estruturado
8. `harness-status` — `state.json` corrompido → trata gracioso
9. `harness-status` — `state.json` válido → reporta progresso
10. `ensureAiJailConfig` — não bloqueia se ai-jail ausente

Rode: `npm test` (incluído em `test` e `test:coverage`).

### 📊 Estatísticas da versão

| Métrica | Valor |
|---|---|
| Arquivos modificados | 8 |
| Linhas adicionadas | +510 |
| Linhas removidas | -28 |
| Novos testes | 10 |
| Net diff | +482 linhas |

### 🚀 Migração

Não requer ação manual. A partir do v6.4.2:

- **Usuários existentes:** basta atualizar para v6.4.2 — o probe roda automaticamente na próxima sessão.
- **Novos usuários:** `./install.sh` (já roda o probe via `harness-workspace`).
- **Se ainda tiver problemas:** `AI_JAIL_ACTIVE=1 ai-jail opencode` (sandbox externo, sempre funciona).

### 🔗 Links

- [CHANGELOG.md](../CHANGELOG.md) — entrada completa em PT-BR
- [HARNESS-README.md](../HARNESS-README.md) — seção de auto-fallback
- [install.sh](../install.sh) — código fonte com `--list-essentials` e `--package`
- [GitHub release v6.4.2](https://github.com/alexandre-henrique-rp/harnes-opencode/releases/tag/v6.4.2) — release notes

---

**Versão:** 6.4.2
**Data:** 2026-08-04
**Tipo:** Patch (correção de bug)
**Compatibilidade:** 100% retrocompatível com v6.4.1