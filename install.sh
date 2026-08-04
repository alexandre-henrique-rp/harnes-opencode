#!/usr/bin/env bash
# ============================================================================
# install.sh — Harness v6 Validator / Setup Helper
# ----------------------------------------------------------------------------
# Este instalador eh um VALIDADOR e helper de setup. NAO modifica
# opencode.json(c) — esses arquivos sao considered sacred (config do usuario).
#
# O que faz:
#   1. Detecta plataforma e dependencias (node, bun, opencode, ai-jail)
#   2. Testa bwrap e sugere fallback
#   3. Valida paths de MCP em opencode.json(c) e AVISA se nao baterem com $HOME
#   4. Cria .env.example (e .env se nao existir)
#   5. Atualiza .gitignore com paths padrao do harness
#   6. Lista arquivos essenciais para download (--list-essentials)
#   7. Empacota o projeto sem "sujeira" em tar.gz (--package)
#   8. Adiciona patterns no allowlist do projeto (--add-allow, --add-deny)
#   9. Lista o merged allowlist efetivo (--show-allowlist)
#
# Para tornar o projeto portatil para outros usuarios:
#   - O DONO do projeto deve editar manualmente opencode.json(c) e trocar
#     paths hardcoded /home/<user>/... por ~/  ou caminhos relativos
#   - OU usar o template opencode.template.json (quando existir)
#
# Uso:
#   ./install.sh                       # roda completo (validar + criar .env + gitignore)
#   ./install.sh --auto                # nao-interativo (assume defaults)
#   ./install.sh --validate-only       # apenas valida, nao modifica nada
#   ./install.sh --list-essentials     # lista arquivos para download
#   ./install.sh --package <path>      # empacota tar.gz sem sujeira
#   ./install.sh --add-allow <pattern> # adiciona path ao allowlist do projeto
#   ./install.sh --add-deny <pattern>  # adiciona path ao denylist do projeto
#   ./install.sh --show-allowlist      # mostra merged allowlist efetivo
#
# Hot-reload: o plugin path-boundary detecta mudancas no allowlist via mtime.
# Apos editar .harness/harness-allowlist.json, basta retentar — NAO precisa
# reiniciar o opencode. Para evitar prompts, defina HARNESS_AUTO_ALLOW_ON_BLOCK=1
# (veja tools/env.example) — o plugin adiciona o path automaticamente no bloqueio.
# ============================================================================
set -euo pipefail

if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  BLUE='\033[0;34m'; BOLD='\033[1m'; RESET='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; BOLD=''; RESET=''
fi

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOME_DIR="${HOME:-$(eval echo "~$(id -un 2>/dev/null || echo root)")}"
AUTO=0
VALIDATE_ONLY=0
LIST_ESSENTIALS=0
PACKAGE_OUT=""
ADD_ALLOW=""
ADD_DENY=""
SHOW_ALLOWLIST=0
NO_AUTO_ALLOW=0
ENABLE_AUTO_ALLOW=0
SHOW_AUDIT=0
AUDIT_LIMIT=20
AUDIT_SOURCE="all"
DIST_MANIFEST="$PROJECT_ROOT/tools/DIST-MANIFEST.json"

for arg in "$@"; do
  case "$arg" in
    --auto) AUTO=1 ;;
    --validate-only) VALIDATE_ONLY=1 ;;
    --list-essentials) LIST_ESSENTIALS=1 ;;
    --package) PACKAGE_OUT="${2:-}"; shift ;;
    --package=*) PACKAGE_OUT="${arg#*=}" ;;
    --add-allow) ADD_ALLOW="${2:-}"; shift ;;
    --add-allow=*) ADD_ALLOW="${arg#*=}" ;;
    --add-deny) ADD_DENY="${2:-}"; shift ;;
    --add-deny=*) ADD_DENY="${arg#*=}" ;;
    --show-allowlist) SHOW_ALLOWLIST=1 ;;
    --no-auto-allow) NO_AUTO_ALLOW=1 ;;
    --enable-auto-allow) ENABLE_AUTO_ALLOW=1 ;;
    --show-audit) SHOW_AUDIT=1 ;;
    --show-audit=*) SHOW_AUDIT=1; AUDIT_SOURCE="${arg#*=}" ;;
    --audit-limit=*) AUDIT_LIMIT="${arg#*=}" ;;
    -h|--help)
      sed -n '2,46p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo -e "${RED}Argumento desconhecido: $arg${RESET}"; exit 2 ;;
  esac
done

banner() {
  echo -e "${BOLD}${BLUE}"
  echo "  +-----------------------------------------+"
  echo "  |      HARNESS v6 - Installer             |"
  echo "  +-----------------------------------------+"
  echo -e "${RESET}"
}

ok()   { echo -e "${GREEN}OK${RESET} $*"; }
warn() { echo -e "${YELLOW}!!${RESET}  $*"; }
fail() { echo -e "${RED}FAIL${RESET} $*"; exit 1; }
info() { echo -e "${BLUE}info${RESET}  $*"; }

detect_platform() {
  case "$(uname -s 2>/dev/null)" in
    Linux*)  echo "linux" ;;
    Darwin*) echo "macos" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)       echo "unknown" ;;
  esac
}

# ----------------------------------------------------------------------------
# 1. Valida ambiente
# ----------------------------------------------------------------------------
validate_environment() {
  banner
  echo -e "${BOLD}1) Validando ambiente${RESET}\n"

  local platform; platform="$(detect_platform)"
  info "Plataforma: $platform"
  info "Usuario: $(whoami)"
  info "Home: $HOME_DIR"
  info "Projeto: $PROJECT_ROOT"

  if command -v ai-jail >/dev/null 2>&1; then
    ok "ai-jail instalado: $(command -v ai-jail)"
    if ai-jail --exec echo __probe__ >/dev/null 2>&1; then
      ok "bwrap funcional (kernel com user namespaces)"
    else
      warn "bwrap indisponivel neste kernel. Sandbox por-comando ficara desabilitado."
      info "  Recomendacao: AI_JAIL_ACTIVE=1 ai-jail opencode"
    fi
  else
    warn "ai-jail nao instalado (opcional mas recomendado)"
    info "  https://github.com/akitaonrails/ai-jail"
  fi

  if command -v node >/dev/null 2>&1; then
    ok "Node $(node --version)"
  else
    fail "Node nao encontrado. Instale Node 18+ antes de continuar."
  fi

  if command -v bun >/dev/null 2>&1; then
    ok "Bun $(bun --version)"
  else
    warn "Bun nao instalado (recomendado para speed)"
  fi

  if command -v opencode >/dev/null 2>&1; then
    ok "opencode CLI: $(command -v opencode)"
  else
    warn "opencode CLI nao encontrado no PATH"
  fi
  echo ""
}

# ----------------------------------------------------------------------------
# 2. Valida paths de MCP (AVISA, nao modifica)
# ----------------------------------------------------------------------------
check_hardcoded_paths() {
  echo -e "${BOLD}2) Verificando portabilidade dos configs${RESET}\n"

  local has_hardcoded=0
  for cfg in opencode.json opencode.jsonc; do
    local path="$PROJECT_ROOT/$cfg"
    [[ -f "$path" ]] || continue

    # Procura paths absolutos /home/<user>/ em strings JSON
    local matches
    matches="$(grep -nE '"/home/[^/]+/[^"]+"' "$path" 2>/dev/null || true)"
    if [[ -n "$matches" ]]; then
      warn "$cfg contem paths hardcoded /home/<user>/... :"
      while IFS= read -r line; do
        echo "    $line"
      done <<< "$matches"
      echo ""
      info "  -> Estes paths NAO foram modificados (config do usuario eh sagrado)."
      info "  -> Para tornar o projeto portatil, edite manualmente e troque"
      info "     /home/<user>/... por ~/... ou por paths relativos ao projeto."
      has_hardcoded=1
    else
      ok "$cfg: paths portateis (sem hardcode de /home/<user>/)"
    fi
  done

  if (( has_hardcoded == 0 )); then
    info "Nenhum path hardcoded encontrado em opencode.json(c)."
  fi
  echo ""
}

# ----------------------------------------------------------------------------
# 3. Valida MCP paths
# ----------------------------------------------------------------------------
validate_mcp_paths() {
  echo -e "${BOLD}3) Validando MCPs${RESET}\n"

  local cfg="$PROJECT_ROOT/opencode.jsonc"
  [[ -f "$cfg" ]] || cfg="$PROJECT_ROOT/opencode.json"
  [[ -f "$cfg" ]] || { warn "opencode.json(c) nao encontrado"; return; }

  local report
  report="$(node -e '
    const fs = require("fs");
    const cfgPath = process.argv[1];
    let cfg;
    try {
      const raw = fs.readFileSync(cfgPath, "utf8")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      cfg = JSON.parse(raw);
    } catch (e) { console.log("PARSE_ERROR: " + e.message); process.exit(0); }
    const mcps = cfg.mcp || {};
    const out = [];
    for (const [name, mcp] of Object.entries(mcps)) {
      if (mcp.enabled === false) { out.push([name, "disabled", "-"]); continue; }
      if (mcp.type === "remote") { out.push([name, "remote", mcp.url || "?"]); continue; }
      const cmd = Array.isArray(mcp.command) ? mcp.command : [mcp.command];
      const pathIdx = cmd.findIndex(a => a && (a.startsWith("/") || a.startsWith("~")));
      const scriptPath = pathIdx >= 0 ? cmd[pathIdx] : "(none)";
      const expanded = scriptPath.startsWith("~")
        ? scriptPath.replace(/^~/, process.env.HOME || "")
        : scriptPath;
      const exists = (() => { try { return fs.existsSync(expanded) ? "ok" : "MISSING"; } catch { return "?"; } })();
      out.push([name, "local", scriptPath + " -> " + exists]);
    }
    out.forEach(r => console.log(r.join("|")));
  ' "$cfg" 2>&1)" || true

  if [[ -z "$report" ]]; then
    info "Nenhum MCP local para validar"
  else
    while IFS='|' read -r name kind det; do
      case "$kind" in
        remote)  ok "  $name (remote): $det" ;;
        disabled) info " $name: desabilitado" ;;
        local)
          if [[ "$det" == *"MISSING"* ]]; then
            warn "  $name: $det"
          else
            ok "  $name: $det"
          fi
          ;;
      esac
    done <<< "$report"
  fi
  echo ""
}

# ----------------------------------------------------------------------------
# 4. .env example + secrets
# ----------------------------------------------------------------------------
ensure_project_allowlist() {
  echo -e "${BOLD}4.5) Allowlist a nivel de projeto${RESET}\n"

  local harness_dir="$PROJECT_ROOT/.harness"
  local allowlist="$harness_dir/harness-allowlist.json"

  if [[ -f "$allowlist" ]]; then
    info "Allowlist de projeto ja existe: $allowlist"
  else
    mkdir -p "$harness_dir"
    cat > "$allowlist" <<'EOF'
{
  "_about": "Allowlist a nivel de projeto. Mergeada com a global (~/.config/opencode/harness-allowlist.json).",
  "_docs": "https://github.com/alexandre-henrique-rp/harnes-opencode/blob/main/HARNESS-README.md#allowlist-a-nivel-de-projeto",
  "allow": [
    "docs/**",
    "scripts/**"
  ],
  "deny": []
}
EOF
    ok "Criado .harness/harness-allowlist.json com defaults (docs/**, scripts/**)"
    info "Edite para customizar paths deste projeto."
  fi
  echo ""
}

# ----------------------------------------------------------------------------
# 5. .env example + secrets
# ----------------------------------------------------------------------------
setup_env() {
  echo -e "${BOLD}4) Configurando variaveis de ambiente${RESET}\n"

  local env_file="$PROJECT_ROOT/.env"
  local example="$PROJECT_ROOT/.env.example"

  if [[ ! -f "$example" ]]; then
    cat > "$example" <<'EOF'
# Harness v6 - Environment variables
# Copie este arquivo para .env e preencha os valores.

# Google Stitch MCP (opcional, mas recomendado para design)
STITCH_API_KEY=

# Context7 MCP (opcional, default key compartilhada funciona para testes)
CONTEXT7_API_KEY=ctx7sk-55f0c677-1371-4a7a-99bf-040726afbb46

# Sandbox (opcional - deixe em branco para auto-detectar)
# AI_JAIL_ACTIVE=1
# HARNESS_NO_SANDBOX=0
EOF
    ok ".env.example criado"
  fi

  if [[ -f "$env_file" ]]; then
    ok ".env ja existe"
  elif (( AUTO == 1 )); then
    cp "$example" "$env_file"
    ok ".env criado a partir de .env.example"
    warn "Edite .env para adicionar suas chaves (STITCH_API_KEY, etc)"
  else
    read -p "Criar .env agora? [s/N] " ans
    if [[ "${ans:-N}" =~ ^[sSyY]$ ]]; then
      cp "$example" "$env_file"
      ok ".env criado"
      warn "Edite .env para adicionar suas chaves (STITCH_API_KEY, etc)"
    else
      info ".env nao criado (pule para usar defaults)"
    fi
  fi
  echo ""
}

# ----------------------------------------------------------------------------
# 5. .gitignore
# ----------------------------------------------------------------------------
ensure_gitignore() {
  echo -e "${BOLD}5) Atualizando .gitignore${RESET}\n"

  local gi="$PROJECT_ROOT/.gitignore"
  local additions=(
    # Sujeira — artefatos locais
    "backup/"
    "tmp/"
    ".harness/tmp/"
    ".harness/audit/"
    ".harness/sandbox-diagnostic.json"
    ".ai-jail"
    # Secrets
    ".env"
    ".env.local"
    ".env.*"
    # Logs e OS
    "*.log"
    ".DS_Store"
    # IDEs
    ".idea/"
    ".vscode/"
    # Build outputs
    "dist/"
    "build/"
    "coverage/"
    # Pacotes gerados
    "*.tar.gz"
    "*.zip"
    "*.tgz"
  )

  touch "$gi"
  local added=0
  for line in "${additions[@]}"; do
    if ! grep -qxF "$line" "$gi" 2>/dev/null; then
      echo "$line" >> "$gi"
      added=1
    fi
  done

  if (( added )); then ok ".gitignore atualizado (+${added} linhas)"; else info ".gitignore ja cobre o necessario"; fi
  echo ""
}

# ----------------------------------------------------------------------------
# 6. Lista essenciais (le tools/DIST-MANIFEST.json)
# ----------------------------------------------------------------------------
list_essentials() {
  if [[ ! -f "$DIST_MANIFEST" ]]; then
    fail "Manifest nao encontrado: $DIST_MANIFEST"
  fi

  echo -e "${BOLD}Arquivos essenciais para download (tools/DIST-MANIFEST.json)${RESET}\n"

  local data
  data="$(node -e '
    const fs = require("fs");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    console.log("FOLDERS:");
    (m.includeFolders || []).forEach(f => console.log("  " + f + "/"));
    console.log("\nFILES:");
    (m.includeFiles || []).forEach(f => console.log("  " + f));
    console.log("\nEXCLUDED (sujeira):");
    (m.excludePatterns || []).forEach(p => console.log("  " + p));
  ' "$DIST_MANIFEST" 2>&1)"

  echo "$data"
  echo ""
  ok "Use --package <caminho.tar.gz> para empacotar tudo isso"
}

# ----------------------------------------------------------------------------
# 7. Empacota projeto sem sujeira (--package)
# ----------------------------------------------------------------------------
package_project() {
  if [[ -z "$PACKAGE_OUT" ]]; then
    fail "--package requer caminho de saida (ex: --package dist/harness.tar.gz)"
  fi
  if [[ ! -f "$DIST_MANIFEST" ]]; then
    fail "Manifest nao encontrado: $DIST_MANIFEST"
  fi

  local abs_out
  if [[ "$PACKAGE_OUT" = /* ]]; then
    abs_out="$PACKAGE_OUT"
  else
    abs_out="$PROJECT_ROOT/$PACKAGE_OUT"
  fi

  mkdir -p "$(dirname "$abs_out")"
  local workdir
  workdir="$(mktemp -d)"
  local staging="$workdir/staging"
  mkdir -p "$staging"

  info "Empacotando em $abs_out ..."
  info "Staging em $staging (temporario)"

  # Lê manifest e copia arquivos essenciais
  node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const root = process.argv[2];
    const staging = process.argv[3];

    function copy(rel) {
      const src = path.join(root, rel);
      const dst = path.join(staging, rel);
      if (!fs.existsSync(src)) return false;
      const stat = fs.statSync(src);
      if (stat.isDirectory()) {
        execSync(`mkdir -p "${dst}"`);
        execSync(`cp -r "${src}/." "${dst}/"`, { stdio: "ignore" });
      } else {
        execSync(`mkdir -p "${path.dirname(dst)}"`, { stdio: "ignore" });
        fs.copyFileSync(src, dst);
      }
      return true;
    }

    let copied = 0;
    (m.includeFolders || []).forEach(f => { if (copy(f)) copied++; });
    (m.includeFiles || []).forEach(f => { if (copy(f)) copied++; });

    console.log("Copied " + copied + " entries");
  ' "$DIST_MANIFEST" "$PROJECT_ROOT" "$staging"

  # Remove sujeira que pode ter sido copiada junto (defense in depth)
  info "Removendo sujeira do staging..."
  for pattern in backup tmp node_modules ".harness/tmp" ".harness/audit" ".harness/sandbox-diagnostic.json" ".env" ".env.local" "*.log" ".DS_Store" "dist" build coverage; do
    rm -rf "$staging/$pattern" 2>/dev/null || true
  done

  # Cria tar.gz
  local tar_basename
  tar_basename="$(basename "$abs_out" .tar.gz)"
  info "Criando tarball..."
  tar -czf "$abs_out" -C "$workdir" "staging" 2>&1 | head -5 || true

  # Stats
  local size
  size="$(du -h "$abs_out" | cut -f1)"
  local entries
  entries="$(tar -tzf "$abs_out" | wc -l)"

  # Cleanup staging
  rm -rf "$workdir"

  ok "Pacote criado: $abs_out ($size, $entries entries)"
}

# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------
main() {
  validate_environment
  check_hardcoded_paths
  validate_mcp_paths
  setup_env
  ensure_project_allowlist
  ensure_gitignore

  echo -e "${BOLD}${GREEN}"
  echo "  +-----------------------------------------+"
  echo "  |   Validacao concluida.                  |"
  echo "  +-----------------------------------------+"
  echo -e "${RESET}"
  echo "  Proximos passos:"
  echo "    1. Edite .env com suas chaves (STITCH_API_KEY, etc)"
  echo "    2. Se bwrap indisponivel: AI_JAIL_ACTIVE=1 ai-jail opencode"
  echo "    3. Inicie uma sessao: opencode"
  echo "    4. Para empacotar para download: ./install.sh --package dist/harness.tar.gz"
  echo ""
  echo "  Comandos uteis:"
  echo "    ./install.sh --list-essentials   # lista o que entra no pacote"
  echo "    ./install.sh --package <caminho> # gera tar.gz limpo"
  echo "    ./install.sh --validate-only     # so valida, nao modifica"
  echo ""
}

# ----------------------------------------------------------------------------
# 8. Adiciona pattern ao allowlist do projeto (--add-allow)
# ----------------------------------------------------------------------------
add_allow_pattern() {
  local pattern="$1"
  if [[ -z "$pattern" ]]; then
    fail "--add-allow requer um pattern (ex: --add-allow docs/**)"
  fi

  ensure_project_allowlist  # garante que o arquivo existe

  local allowlist="$PROJECT_ROOT/.harness/harness-allowlist.json"
  # Le o JSON, adiciona pattern se nao existir, escreve de volta
  local updated
  updated="$(node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const pattern = process.argv[2];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data.allow) data.allow = [];
    if (data.allow.includes(pattern)) {
      console.log("EXISTS");
    } else {
      data.allow.push(pattern);
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
      console.log("ADDED");
    }
  ' "$allowlist" "$pattern")"

  if [[ "$updated" == "EXISTS" ]]; then
    info "Pattern ja existe no allowlist: $pattern"
  else
    ok "Pattern adicionado ao allowlist: $pattern"
    info "Reinicie o opencode para o plugin recarregar o allowlist."
  fi
}

# ----------------------------------------------------------------------------
# 9. Adiciona pattern ao denylist do projeto (--add-deny)
# ----------------------------------------------------------------------------
add_deny_pattern() {
  local pattern="$1"
  if [[ -z "$pattern" ]]; then
    fail "--add-deny requer um pattern (ex: --add-deny src/legacy/**)"
  fi

  ensure_project_allowlist  # garante que o arquivo existe

  local allowlist="$PROJECT_ROOT/.harness/harness-allowlist.json"
  local updated
  updated="$(node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const pattern = process.argv[2];
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!data.deny) data.deny = [];
    if (data.deny.includes(pattern)) {
      console.log("EXISTS");
    } else {
      data.deny.push(pattern);
      fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
      console.log("ADDED");
    }
  ' "$allowlist" "$pattern")"

  if [[ "$updated" == "EXISTS" ]]; then
    info "Pattern ja existe no denylist: $pattern"
  else
    ok "Pattern adicionado ao denylist: $pattern"
    info "Reinicie o opencode para o plugin recarregar o allowlist."
  fi
}

# ----------------------------------------------------------------------------
# 10. Mostra merged allowlist efetivo (--show-allowlist)
# ----------------------------------------------------------------------------
show_allowlist() {
  local project_path="$PROJECT_ROOT/.harness/harness-allowlist.json"
  local global_path="$HOME_DIR/.config/opencode/harness-allowlist.json"

  echo -e "${BOLD}Merged allowlist (project + global)${RESET}\n"

  if [[ -f "$project_path" ]]; then
    echo -e "${GREEN}[project]${RESET} $project_path"
  else
    echo -e "${YELLOW}[project]${RESET} NAO EXISTE — usando defaults do install.sh"
  fi
  if [[ -f "$global_path" ]]; then
    echo -e "${GREEN}[global]${RESET}  $global_path"
  else
    echo -e "${YELLOW}[global]${RESET}  NAO EXISTE"
  fi
  echo ""

  # Mostra o conteudo combinado
  node -e '
    const fs = require("fs");
    const sources = [
      { name: "project", path: process.argv[1] },
      { name: "global",  path: process.argv[2] },
    ];
    const allowSet = new Set();
    const denySet = new Set();
    for (const src of sources) {
      try {
        const data = JSON.parse(fs.readFileSync(src.path, "utf8"));
        (data.allow || []).forEach(p => allowSet.add(`[${src.name}] ${p}`));
        (data.deny  || []).forEach(p => denySet.add(`[${src.name}] ${p}`));
      } catch (e) {
        console.log(`  (${src.name}: erro ao ler — ${e.message})`);
      }
    }
    console.log("ALLOW (" + allowSet.size + " rules):");
    [...allowSet].sort().forEach(p => console.log("  + " + p));
    console.log("\nDENY  (" + denySet.size + " rules):");
    [...denySet].sort().forEach(p => console.log("  - " + p));
  ' "$project_path" "$global_path"
}

# ----------------------------------------------------------------------------
# 11. Mostra audit log de auto-add (--show-audit)
# ----------------------------------------------------------------------------
show_audit() {
  local audit_file="$PROJECT_ROOT/.harness/audit/auto-allow.jsonl"

  echo -e "${BOLD}Audit log de allowlist (.harness/audit/auto-allow.jsonl)${RESET}\n"

  if [[ ! -f "$audit_file" ]]; then
    info "Audit log nao existe (nenhum auto-add ainda)"
    echo ""
    info "Para gerar: HARNESS_AUTO_ALLOW_ON_BLOCK=1 opencode"
    return
  fi

  # Mostra N ultimas entradas (filtradas por source se especificado)
  local source_filter="$AUDIT_SOURCE"
  local limit="$AUDIT_LIMIT"

  local content
  content="$(tail -n "$limit" "$audit_file" 2>/dev/null)"

  if [[ -z "$content" ]]; then
    info "Audit log vazio"
    return
  fi

  echo -e "${BLUE}Ultimas $limit entradas${RESET} (filtro: $source_filter):\n"

  echo "$content" | node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(0, "utf8").trim().split("\n").filter(Boolean);
    const filter = process.argv[1];
    const entries = lines
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
    const filtered = filter === "all" ? entries : entries.filter(e => e.source === filter);
    filtered.reverse().forEach(e => {
      const ts = e.ts.replace("T", " ").replace(/\..+/, "");
      const src = e.source === "auto" ? "[AUTO]" : "[MANUAL]";
      const blocked = e.blockedPath ? ` <- blocked: ${e.blockedPath}` : "";
      console.log(`  ${ts}  ${src}  ${e.type}: ${e.pattern}${blocked}`);
    });
    console.log(`\nTotal mostrado: ${filtered.length} de ${entries.length} entradas no arquivo`);
  ' "$source_filter"
  echo ""

  # Stats
  local total auto_count manual_count
  total=$(wc -l < "$audit_file" 2>/dev/null | tr -d ' ' || echo "0")
  auto_count=$(grep -c '"source":"auto"' "$audit_file" 2>/dev/null || echo "0")
  manual_count=$(grep -c '"source":"manual"' "$audit_file" 2>/dev/null || echo "0")
  ok "Total: $total entradas ($auto_count auto, $manual_count manual)"
}

# ----------------------------------------------------------------------------
# 12. Toggle do auto-allow por projeto (--no-auto-allow / --enable-auto-allow)
# ----------------------------------------------------------------------------
toggle_auto_allow() {
  local marker="$PROJECT_ROOT/.harness/.no-auto-allow"
  if (( NO_AUTO_ALLOW )); then
    mkdir -p "$(dirname "$marker")"
    cat > "$marker" <<'EOF'
# Marcador para desabilitar o modo auto-allow do path-boundary neste projeto.
# Quando este arquivo existe, o plugin NAO adiciona patterns automaticamente
# ao .harness/harness-allowlist.json mesmo que HARNESS_AUTO_ALLOW_ON_BLOCK=1.
#
# Para reabilitar: apague este arquivo ou rode ./install.sh --enable-auto-allow.
EOF
    ok "Auto-allow DESABILITADO neste projeto (criado $marker)"
    info "Para reabilitar: ./install.sh --enable-auto-allow ou rm $marker"
  elif (( ENABLE_AUTO_ALLOW )); then
    if [[ -f "$marker" ]]; then
      rm -f "$marker"
      ok "Auto-allow REABILITADO neste projeto (removido $marker)"
    else
      info "Auto-allow ja estava habilitado (marker nao existe)"
    fi
  fi
  echo ""
}

# ----------------------------------------------------------------------------
# Handlers de flags
# ----------------------------------------------------------------------------
if (( LIST_ESSENTIALS )); then
  list_essentials
  exit 0
fi

if (( NO_AUTO_ALLOW || ENABLE_AUTO_ALLOW )); then
  toggle_auto_allow
  exit 0
fi

if (( SHOW_AUDIT )); then
  show_audit
  exit 0
fi

if [[ -n "$PACKAGE_OUT" ]]; then
  package_project
  exit 0
fi

if [[ -n "$ADD_ALLOW" ]]; then
  add_allow_pattern "$ADD_ALLOW"
  exit 0
fi

if [[ -n "$ADD_DENY" ]]; then
  add_deny_pattern "$ADD_DENY"
  exit 0
fi

if (( SHOW_ALLOWLIST )); then
  show_allowlist
  exit 0
fi

if (( VALIDATE_ONLY )); then
  validate_environment
  validate_mcp_paths
  exit 0
fi

main