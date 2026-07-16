#!/usr/bin/env bash
# ============================================================================
# install.sh — Harness v6 installer
# ----------------------------------------------------------------------------
# Detecta o OS (Linux/macOS/Windows-WSL/Git Bash) e instala o harness v6 em
# ~/.config/opencode/, criando backup de arquivos existentes.
#
# Uso:
#   ./install.sh                  # instala (com backup)
#   ./install.sh --update         # atualiza preservando customizacoes do usuario
#   ./install.sh --uninstall      # remove o harness v6
#   ./install.sh --dry-run        # mostra o que faria, sem alterar nada
#   ./install.sh --preserve-config # nao sobrescreve opencode.json existente
#   ./install.sh --help           # ajuda
#
# Documentacao OpenCode: https://opencode.ai/docs/config/#locations
# ----------------------------------------------------------------------------

set -euo pipefail

# ============================================================================
# Configuracao
# ============================================================================

HARNESS_VERSION="6.4.1"
HARNESS_NAME="harness-v6"
DRY_RUN=false
PRESERVE_CONFIG=false
PRESERVE_CUSTOM=false
UPDATE_MODE=false
UNINSTALL=false
INTERACTIVE=false

# Limpeza de diretorios temporarios na saida do script
TEMP_SOURCE_DIR=""
cleanup_temp_dir() {
    if [[ -n "$TEMP_SOURCE_DIR" && -d "$TEMP_SOURCE_DIR" ]]; then
        rm -rf "$TEMP_SOURCE_DIR"
    fi
}
trap cleanup_temp_dir EXIT

# ============================================================================
# Cores e formatacao (se terminal suportar)
# ============================================================================

setup_colors() {
    if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
        RED='\033[0;31m'
        GREEN='\033[0;32m'
        YELLOW='\033[0;33m'
        BLUE='\033[0;34m'
        MAGENTA='\033[0;35m'
        CYAN='\033[0;36m'
        WHITE='\033[1;37m'
        BOLD='\033[1m'
        DIM='\033[2m'
        NC='\033[0m'
    else
        RED='' GREEN='' YELLOW='' BLUE='' MAGENTA='' CYAN='' WHITE='' BOLD='' DIM='' NC=''
    fi
}
setup_colors

# ============================================================================
# Funcoes utilitarias
# ============================================================================

log_info()    { printf "  ${BLUE}●${NC}  %s\n" "$*"; }
log_ok()      { printf "  ${GREEN}✔${NC}  %s\n" "$*"; }
log_warn()    { printf "  ${YELLOW}⚠${NC}  %s\n" "$*"; }
log_err()     { printf "  ${RED}✖${NC}  %s\n" "$*" >&2; }
log_step()    { printf "\n${BOLD}${CYAN}  %s${NC}\n" "$*"; }
log_done()    { printf "  ${GREEN}${BOLD}✔  %s${NC}\n" "$*"; }

die() { log_err "$*"; exit 1; }

print_divider() {
    printf "  ${DIM}────────────────────────────────────────────────────${NC}\n"
}

print_thin_divider() {
    printf "  ${DIM}· · · · · · · · · · · · · · · · · · · · · · · · ·${NC}\n"
}

# ============================================================================
# Banner
# ============================================================================

print_banner() {
    local logo="
${CYAN}  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  │   ██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗│
  │   ██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝│
  │   ███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗│
  │   ██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║│
  │   ██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║│
  │   ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝│
  │                                                             │
  │   ${BOLD}${WHITE}HARNESS v6${NC}${CYAN}                                                │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘${NC}"

    printf "%b\n" "$logo"
    printf "\n"
    printf "  ${BOLD}Installer${NC}  ${DIM}v${HARNESS_VERSION}${NC}  ${DIM}·${NC}  ${BLUE}%s${NC}\n" "${OS:-platform}"
    printf "\n"
    printf "  ${DIM}Verificando ambiente...${NC}\n\n"

    local node_color="${RED}" npm_color="${RED}" opencode_color="${RED}"
    [[ "$NODE_STATUS" == *"ok"* ]] && node_color="${GREEN}"
    [[ "$NPM_STATUS" == *"ok"* ]] && npm_color="${GREEN}"
    [[ "$OPENCODE_STATUS" == *"ok"* ]] && opencode_color="${GREEN}"

    printf "  ${DIM}┌──────────────────────────────────────────────┐${NC}\n"
    printf "  ${DIM}│${NC}  Node.js    ${node_color}%s${NC}  ${DIM}│${NC}  npm       ${npm_color}%s${NC}  ${DIM}│${NC}  OpenCode  ${opencode_color}%s${NC}  ${DIM}│${NC}\n" \
        "${NODE_STATUS}" "${NPM_STATUS}" "${OPENCODE_STATUS}"
    printf "  ${DIM}└──────────────────────────────────────────────┘${NC}\n"
    printf "\n"
}

# ============================================================================
# Progress
# ============================================================================

print_step() {
    local current="$1"
    local total="$2"
    local desc="$3"
    printf "\n  ${BOLD}${CYAN}[%d/%d]${NC} ${BOLD}%s${NC}\n" "$current" "$total" "$desc"
    printf "  ${DIM}────────────────────────────────────────────────────${NC}\n"
}

# ============================================================================
# Menu interativo
# ============================================================================

show_menu() {
    local selected="$1"
    shift
    local options=("$@")

    if [[ ${MENU_RENDERED:-0} -eq 1 ]]; then
        for ((i=0; i<${#options[@]}+1; i++)); do
            printf "\033[F\033[K"
        done
    fi
    MENU_RENDERED=1

    local idx=0
    for opt in "${options[@]}"; do
        if [[ $idx -eq $selected ]]; then
            printf "  ${GREEN}  ▸${NC}  ${BOLD}${GREEN}%s${NC}\n" "$opt"
        else
            printf "      %s\n" "$opt"
        fi
        idx=$idx+1
    done
    printf "\n"
}

select_option() {
    local options=("$@")
    local selected=0
    local key=""
    local ESC=$'\x1b'

    tput civis 2>/dev/null || printf "\033[?25l"
    trap 'tput cnorm 2>/dev/null || printf "\033[?25h"; exit 1' INT TERM

    MENU_RENDERED=0
    show_menu "$selected" "${options[@]}"

    while true; do
        read -s -n1 key < /dev/tty

        if [[ "$key" == "$ESC" ]]; then
            read -s -n2 -t 0.05 key < /dev/tty
            if [[ "$key" == "[A" ]]; then
                selected=$(( (selected - 1 + ${#options[@]}) % ${#options[@]} ))
                show_menu "$selected" "${options[@]}"
            elif [[ "$key" == "[B" ]]; then
                selected=$(( (selected + 1) % ${#options[@]} ))
                show_menu "$selected" "${options[@]}"
            fi
        elif [[ "$key" == "" ]]; then
            break
        fi
    done

    tput cnorm 2>/dev/null || printf "\033[?25h"
    trap - INT TERM

    return "$selected"
}

# ============================================================================
# Funcoes do instalador (mantidas do original)
# ============================================================================

install_bun_if_needed() {
    log_info "Verificando Bun..."
    if command -v bun >/dev/null 2>&1; then
        log_ok "Bun detectado: $(bun --version)"
        return 0
    fi

    log_warn "Bun nao detectado."
    local resp="y"
    if [[ -t 0 || -c /dev/tty ]]; then
        printf "\n  ${YELLOW}Bun e recomendado para plugins e sqlite-vec.${NC}\n"
        read -rp "  Instalar Bun agora? [Y/n] " resp < /dev/tty
        if [[ -z "$resp" || "$resp" =~ ^[Yy]$ ]]; then
            log_info "Instalando Bun..."
            if curl -fsSL https://bun.sh/install | bash; then
                log_ok "Bun instalado!"
                export BUN_INSTALL="${HOME}/.bun"
                export PATH="${BUN_INSTALL}/bin:${PATH}"
                return 0
            else
                log_err "Falha ao instalar Bun."
                return 1
            fi
        fi
    else
        log_info "Modo nao-interativo. Pulando Bun."
    fi
    return 1
}

AI_JAIL_PINNED_VERSION="v1.4.3"

install_ai_jail_if_needed() {
    if command -v ai-jail >/dev/null 2>&1; then
        log_ok "ai-jail $(ai-jail --version 2>/dev/null | head -n1) instalado"
        return 0
    fi

    [[ -t 0 || -c /dev/tty ]] || { log_warn "Sessao nao-interativa. Pulando ai-jail."; return 1; }

    printf "\n  ${YELLOW}ai-jail isola agentes em nivel de kernel (bwrap/seatbelt).${NC}\n"
    read -rp "  Instalar agora? [Y/n] " resp < /dev/tty
    [[ -z "$resp" || "$resp" =~ ^[Yy]$ ]] || return 1

    if command -v mise >/dev/null 2>&1; then
        mise use -g "github:akitaonrails/ai-jail@${AI_JAIL_PINNED_VERSION}" && return 0
    fi
    if command -v brew >/dev/null 2>&1; then
        brew tap akitaonrails/tap && brew install ai-jail && return 0
    fi
    if command -v cargo >/dev/null 2>&1; then
        cargo install ai-jail --version "${AI_JAIL_PINNED_VERSION#v}" && return 0
    fi

    local os_kind arch asset bin_dest="${HOME}/.local/bin"
    os_kind="$(detect_os)"
    arch="$(uname -m)"

    case "$os_kind" in
        linux|wsl)
            if ! command -v bwrap >/dev/null 2>&1; then
                log_warn "bubblewrap (bwrap) nao encontrado. Instale via apt/pacman/dnf."
            fi
            asset="ai-jail-linux-x86_64.tar.gz" ;;
        macos)
            [[ "$arch" == "arm64" ]] && asset="ai-jail-macos-aarch64.tar.gz" \
                || asset="ai-jail-macos-x86_64.tar.gz" ;;
        windows-gitbash)
            log_err "Windows nativo nao suportado pelo ai-jail. Use WSL2."
            return 1 ;;
        *) log_err "SO nao suportado: $os_kind"; return 1 ;;
    esac

    mkdir -p "$bin_dest"
    local base="https://github.com/akitaonrails/ai-jail/releases/download/${AI_JAIL_PINNED_VERSION}"

    curl -fsSL "${base}/${asset}" -o "/tmp/${asset}" || { log_err "Falha no download"; return 1; }

    if curl -fsSL "${base}/${asset}.sha256" -o "/tmp/${asset}.sha256" 2>/dev/null; then
        (cd /tmp && sha256sum -c "${asset}.sha256") || {
            log_err "Checksum invalido! Abortando."
            rm -f "/tmp/${asset}" "/tmp/${asset}.sha256"
            return 1
        }
    else
        log_err "Checksum nao disponivel. Abortando por seguranca."
        rm -f "/tmp/${asset}"
        return 1
    fi

    tar -xzf "/tmp/${asset}" -C "$bin_dest"
    rm -f "/tmp/${asset}" "/tmp/${asset}.sha256"
    chmod +x "$bin_dest/ai-jail"
    export PATH="$bin_dest:${PATH}"
    log_ok "ai-jail ${AI_JAIL_PINNED_VERSION} instalado em $bin_dest/ai-jail!"
}

install_opencode_wrapper() {
    local wrapper_dest="${HOME}/.local/bin/opencode"

    local real_bin
    real_bin="$(command -v opencode 2>/dev/null || true)"
    if [[ -z "$real_bin" ]]; then
        log_warn "opencode nao encontrado no PATH. Wrapper nao instalado."
        return 1
    fi
    real_bin="$(readlink -f "$real_bin" 2>/dev/null || echo "$real_bin")"

    if [[ "$real_bin" == "$wrapper_dest" ]]; then
        log_info "Wrapper ja instalado e ativo."
        return 0
    fi

    mkdir -p "$(dirname "$wrapper_dest")"
    cat > "$wrapper_dest" <<EOF
#!/usr/bin/env bash
# Gerado por harnes-opencode install.sh — NAO editar a mao.
REAL_OPENCODE_BIN="${real_bin}"

if [[ ! -x "\$REAL_OPENCODE_BIN" ]]; then
    echo "opencode real nao encontrado em \$REAL_OPENCODE_BIN" >&2
    exit 1
fi

if [[ -n "\${AI_JAIL_ACTIVE:-}" ]]; then
    exec "\$REAL_OPENCODE_BIN" "\$@"
fi

if ! command -v ai-jail >/dev/null 2>&1; then
    exec "\$REAL_OPENCODE_BIN" "\$@"
fi

exec env AI_JAIL_ACTIVE=1 ai-jail --exec --no-private-home --no-docker \\
    --hide-dotdir .netrc --hide-dotdir .kube \\
    "\$REAL_OPENCODE_BIN" "\$@"
EOF
    chmod +x "$wrapper_dest"

    hash -r 2>/dev/null || true
    local resolved
    resolved="$(command -v opencode 2>/dev/null || true)"
    if [[ "$resolved" != "$wrapper_dest" ]]; then
        log_warn "PATH ainda resolve para: ${resolved:-nao encontrado}"
        log_warn "Verifique a ordem do \$PATH."
        return 1
    fi
    log_ok "Wrapper instalado em $wrapper_dest"
}

install_configured_mcps() {
    local dest="$1"
    local pm="$2"

    if command -v node >/dev/null 2>&1; then
        node - "$dest" "$pm" <<'NODEEOF'
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dest = process.argv[2];
const pm = process.argv[3];

const opencodePath = [
  path.join(dest, 'opencode.json'),
  path.join(dest, 'opencode.jsonc')
].find(fs.existsSync);

if (!opencodePath) {
  process.exit(0);
}

try {
  let content = fs.readFileSync(opencodePath, 'utf8');
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  content = content.replace(/(?:^|[^:])\/\/.*$/gm, '');
  const config = JSON.parse(content);
  
  if (!config.mcp) {
    process.exit(0);
  }
  
  console.log(`\n  Verificando servidores MCP...`);
  
  const missingPackages = [];
  
  for (const mcpName in config.mcp) {
    const cmd = config.mcp[mcpName].command || [];
    let pkgName = null;
    for (const arg of cmd) {
      if (arg.includes('node_modules/.bin/')) {
        const parts = arg.split('/');
        pkgName = parts[parts.length - 1];
        break;
      }
    }
    
    if (pkgName) {
      const pkgPath = path.join(dest, 'node_modules', pkgName);
      const isInstalled = fs.existsSync(pkgPath);
      
      if (isInstalled) {
        console.log(`  \x1b[32m✔\x1b[0m  MCP "${mcpName}" ok`);
      } else {
        console.log(`  \x1b[33m⚠\x1b[0m  MCP "${mcpName}" ausente`);
        if (!missingPackages.includes(pkgName)) {
          missingPackages.push(pkgName);
        }
      }
    }
  }
  
  if (missingPackages.length > 0) {
    let installConfirmed = false;
    try {
      const ttyFd = fs.openSync('/dev/tty', 'r');
      console.log(`\n  Instalar MCPs ausentes? [Y/n]: `);
      const buffer = Buffer.alloc(10);
      const bytesRead = fs.readSync(ttyFd, buffer, 0, 10, null);
      const response = buffer.toString('utf8', 0, bytesRead).trim().toLowerCase();
      fs.closeSync(ttyFd);
      if (response === '' || response === 'y' || response === 'yes') {
        installConfirmed = true;
      }
    } catch (err) {}
    
    if (installConfirmed) {
      console.log(`\n  Instalando pacotes...`);
      for (const pkg of missingPackages) {
        const installCmd = pm === 'bun' ? `bun add ${pkg} --save-dev` : `npm install ${pkg} --save-dev`;
        try {
          execSync(installCmd, { cwd: dest, stdio: 'inherit' });
        } catch (e) {
          console.log(`  \x1b[31m✖ Falha: ${pkg}\x1b[0m`);
        }
      }
    }
  } else {
    console.log(`\x1b[32m  ✔ Todos os MCPs instalados\x1b[0m\n`);
  }
} catch (e) {
  console.error(`\x1b[31m  ✖ Erro ao analisar opencode.json\x1b[0m`);
}
NODEEOF
    fi
}

setup_git_restore_point() {
    local dir="$1"
    if ! command -v git >/dev/null 2>&1; then
        return 0
    fi

    local git_dir="$dir/.git"
    if [[ ! -d "$git_dir" ]]; then
        log_info "Iniciando repositorio Git..."
        git init "$dir" >/dev/null 2>&1 || true
        local gitignore="$dir/.gitignore"
        if [[ ! -f "$gitignore" ]]; then
            printf "backup/\ntmp/\nnode_modules/\n" > "$gitignore"
        fi
    fi

    (cd "$dir" && git add . && git commit -m "Backup harness-v6 antes da alteracao: $(date '+%Y-%m-%d %H:%M:%S')" >/dev/null 2>&1 || true)
}

commit_git_restore_point() {
    local dir="$1"
    local msg="$2"
    if ! command -v git >/dev/null 2>&1; then
        return 0
    fi
    (cd "$dir" && git add . && git commit -m "harness-v6: $msg" >/dev/null 2>&1 || true)
}

revert_git_state() {
    local dir="$1"
    local git_dir="$dir/.git"
    if command -v git >/dev/null 2>&1 && [[ -d "$git_dir" ]]; then
        log_info "Revertendo via Git..."
        (cd "$dir" && git reset --hard HEAD~1 >/dev/null 2>&1 || true)
    fi
}

has_existing_harness_files() {
    local dir="$1"
    local critical_files=("agents/orchestrator.md" "GERAIS.md" "state-machine.json")
    for f in "${critical_files[@]}"; do
        if [[ -f "$dir/$f" ]]; then
            return 0
        fi
    done
    return 1
}

copy_directory_exclude_backup() {
    local src="$1"
    local dest="$2"

    mkdir -p "$dest"

    for item in "$src"/* "$src"/.*; do
        local base
        base=$(basename "$item")
        if [[ "$base" == "." || "$base" == ".." || "$base" == "backup" || "$base" == ".git" || "$base" == "tmp" || "$base" == "node_modules" ]]; then
            continue
        fi

        if [[ -e "$item" ]]; then
            cp -r "$item" "$dest/" 2>/dev/null || true
        fi
    done
}

# ============================================================================
# Deteccao de OS e paths
# ============================================================================

detect_os() {
    local uname_s
    uname_s="$(uname -s 2>/dev/null || echo unknown)"

    case "$uname_s" in
        Linux*)
            if grep -qiE "microsoft|wsl" /proc/version 2>/dev/null; then
                echo "wsl"
            else
                echo "linux"
            fi
            ;;
        Darwin*)         echo "macos" ;;
        MINGW*|MSYS*|CYGWIN*) echo "windows-gitbash" ;;
        *)               echo "unknown" ;;
    esac
}

get_install_dir() {
    local os="$1"
    case "$os" in
        linux|wsl|macos|windows-gitbash)
            echo "${HOME}/.config/opencode"
            ;;
        *)
            echo "${HOME}/.config/opencode"
            ;;
    esac
}

get_source_dir() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd 2>/dev/null || pwd)"

    if [[ -d "$script_dir/agents" && -f "$script_dir/opencode.json" ]]; then
        echo "$script_dir"
        return 0
    fi

    local tmp_dir
    tmp_dir=$(mktemp -d -t harness-install.XXXXXX 2>/dev/null || mktemp -d /tmp/harness-install.XXXXXX)
    TEMP_SOURCE_DIR="$tmp_dir"

    local tarball_url="https://github.com/alexandre-henrique-rp/harnes-opencode/archive/refs/heads/main.tar.gz"
    local tar_file="$tmp_dir/harness.tar.gz"

    log_info "Baixando pacote do GitHub..."
    if command -v curl >/dev/null 2>&1; then
        curl -L --progress-bar "$tarball_url" -o "$tar_file"
    elif command -v wget >/dev/null 2>&1; then
        wget --show-progress "$tarball_url" -O "$tar_file"
    else
        die "Necessario 'curl' ou 'wget' para instalacao remota."
    fi

    log_info "Extraindo arquivos..."
    if ! tar -xzf "$tar_file" -C "$tmp_dir"; then
        die "Falha ao extrair arquivos do GitHub."
    fi
    log_ok "Arquivos extraidos com sucesso."

    local extracted_dir
    extracted_dir=$(find "$tmp_dir" -maxdepth 2 -type d -name "harnes-opencode-*" | head -n 1)

    if [[ -z "$extracted_dir" ]]; then
        die "Estrutura do repositorio invalida."
    fi

    echo "$extracted_dir"
}

# ============================================================================
# Help
# ============================================================================

print_help() {
    cat <<EOF
  ${BOLD}Uso:${NC} ./install.sh [OPCOES]

  Detecta automaticamente o OS e instala o Harness v6
  no diretorio de configuracao do OpenCode (~/.config/opencode/).

  ${BOLD}OPCOES:${NC}
    --uninstall         Remove o Harness v6 (com backup)
    --update            Atualiza preservando customizacoes
    --dry-run           Mostra o que faria, sem alterar nada
    --preserve-config   Nao sobrescreve opencode.json
    --version           Mostra a versao
    --help, -h          Mostra esta ajuda

  ${BOLD}SISTEMAS:${NC}
    Linux, macOS, WSL, Git Bash/MSYS2/Cygwin

  ${BOLD}DOCUMENTACAO:${NC}
    https://opencode.ai/docs/config/#locations
EOF
}

# ============================================================================
# Smart Merge (JSON)
# ============================================================================

merge_json() {
    local base="$1"
    local update="$2"
    local output="$3"

    if command -v python3 >/dev/null 2>&1; then
        python3 - <<EOF
import json, sys

def deep_merge(base, update):
    if isinstance(base, list) and isinstance(update, list):
        return list(dict.fromkeys(base + update))
    if not isinstance(base, dict) or not isinstance(update, dict):
        return update
    for key, value in update.items():
        if key in base:
            base[key] = deep_merge(base[key], value)
        else:
            base[key] = value
    return base

try:
    with open("$base", "r") as f: base_data = json.load(f)
    with open("$update", "r") as f: update_data = json.load(f)
    merged = deep_merge(base_data, update_data)
    with open("$output", "w") as f: json.dump(merged, f, indent=2)
except Exception as e:
    sys.exit(1)
EOF
        return $?
    else
        return 1
    fi
}

# ============================================================================
# Backup e copia
# ============================================================================

consolidate_legacy_backups() {
    local dest="$1"
    local legacy_dir="$dest/backup/legacy"

    if ls "$dest"/*.bak.* >/dev/null 2>&1; then
        log_info "Consolidando backups legados..."
        mkdir -p "$legacy_dir"
        mv "$dest"/*.bak.* "$legacy_dir/" 2>/dev/null || true
        log_ok "Backups legados consolidados."
    fi
}

backup_path() {
    return 0
}

copy_item() {
    local src="$1"
    local dest="$2"
    local desc="${3:-}"
    local force_replace="${4:-true}"

    if [[ ! -e "$src" ]]; then
        return
    fi

    if $DRY_RUN; then
        log_info "[DRY-RUN] $desc"
        return
    fi

    if [[ -e "$dest" ]]; then
        if [[ -d "$dest" ]]; then
            rm -rf "$dest"
        else
            if ! $force_replace; then
                return
            fi
            backup_path "$dest"
            rm -f "$dest"
        fi
    fi

    cp -r "$src" "$dest"
}

# ============================================================================
# Instalacao
# ============================================================================

do_install() {
    local src="$1"
    local dest="$2"

    print_step 1 4 "Verificando pre-requisitos"
    check_prerequisites "$OS" "$src"
    log_done "Pre-requisitos validados"

    print_step 2 4 "Preparando ambiente"
    if ! $DRY_RUN; then
        mkdir -p "$dest"
        consolidate_legacy_backups "$dest"
        setup_git_restore_point "$dest"
    fi

    if has_existing_harness_files "$dest"; then
        local timestamp
        timestamp=$(date +%Y%m%d_%H%M%S)
        local backup_dir="$dest/backup/backup_$timestamp"
        copy_directory_exclude_backup "$dest" "$backup_dir"
        log_ok "Backup criado em backup_$timestamp"
    fi

    log_info "Copiando componentes..."
    copy_item "$src/agents" "$dest/agents" "agents/"
    copy_item "$src/commands" "$dest/commands" "commands/"
    copy_item "$src/templates" "$dest/templates" "templates/"
    copy_item "$src/tools" "$dest/tools" "tools/"
    copy_item "$src/plugins" "$dest/plugins" "plugins/"
    if ! $UPDATE_MODE; then
        copy_item "$src/examples" "$dest/examples" "examples/"
    fi
    copy_item "$src/skills" "$dest/skills" "skills/"

    if ! $DRY_RUN; then
        local pkg_json="$dest/package.json"
        if [[ ! -f "$pkg_json" ]] || ! $PRESERVE_CONFIG; then
            cat > "$pkg_json" <<EOF
{
  "name": "harness-v6-config",
  "version": "${HARNESS_VERSION}",
  "private": true,
  "description": "Harness v6 - opencode config dir",
  "type": "module",
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "sqlite-vec": "latest"
  }
}
EOF
        fi
    fi

    if ! $DRY_RUN; then
        local allowlist="$dest/harness-allowlist.json"
        if [[ ! -f "$allowlist" ]] || ! $PRESERVE_CONFIG; then
            cat > "$allowlist" <<EOF
{
  "allow": ["src/**", "agents/**", "training/**", "templates/**", "tools/**", "plugins/**", "commands/**", "state-machine.json", "failure-protocol.json", "opencode.json", "opencode.jsonc", "install.sh", "GERAIS.md", "README.md", "HARNESS-README.md", "CHANGELOG.md", "examples/**", "skills/**", "harness-allowlist.json"],
  "deny": [".env", ".env.*", "secrets/**", "*.pem", "*.key"]
}
EOF
        fi
    fi

    if [[ -d "$src/training" ]]; then
        local training_dest="$dest/training"
        mkdir -p "$training_dest"
        for rag_doc in "$src/training"/*.md; do
            [[ ! -f "$rag_doc" ]] && continue
            local doc_name; doc_name="$(basename "$rag_doc")"
            cp -r "$rag_doc" "$training_dest/$doc_name"
        done
    fi

    [[ -f "$src/GERAIS.md" ]] && copy_item "$src/GERAIS.md" "$dest/GERAIS.md"
    [[ -f "$src/state-machine.json" ]] && copy_item "$src/state-machine.json" "$dest/state-machine.json"
    [[ -f "$src/state-machine-lean.json" ]] && copy_item "$src/state-machine-lean.json" "$dest/state-machine-lean.json"
    [[ -f "$src/failure-protocol.json" ]] && copy_item "$src/failure-protocol.json" "$dest/failure-protocol.json"
    [[ -f "$src/README.md" ]] && copy_item "$src/README.md" "$dest/HARNESS-README.md"

    if [[ -f "$src/opencode.json" ]]; then
        local existing_json="$dest/opencode.json"
        local existing_jsonc="$dest/opencode.jsonc"
        local config_file=""
        [[ -f "$existing_json" ]] && config_file="$existing_json"
        [[ -f "$existing_jsonc" ]] && config_file="$existing_jsonc"

        if [[ -n "$config_file" ]]; then
            local action_choice=0
            if $INTERACTIVE; then
                printf "\n"
                printf "  ${BOLD}Configuracao opencode.json existente. Acao:${NC}\n\n"
                local cfg_options=(
                    "Smart Merge (recomendado)"
                    "Sobrescrever"
                    "Preservar"
                )
                select_option "${cfg_options[@]}" && action_choice=0 || action_choice=$?
            fi

            case "$action_choice" in
                0) merge_json "$config_file" "$src/opencode.json" "${config_file}.tmp" && mv "${config_file}.tmp" "$config_file" ;;
                1) cp "$src/opencode.json" "$config_file" ;;
            esac
        else
            copy_item "$src/opencode.json" "$dest/opencode.json"
        fi
    fi

    if ! $DRY_RUN; then
        cat > "$dest/.harness-version" <<EOF
version: ${HARNESS_VERSION}
EOF
    fi

    print_step 3 4 "Instalando dependencias"
    if ! $DRY_RUN; then
        local pm="npm"
        install_configured_mcps "$dest" "$pm"
    fi

    print_step 4 4 "Configurando sandbox"
    if ! $DRY_RUN; then
        install_ai_jail_if_needed || true
        install_opencode_wrapper || true
    fi

    if ! $DRY_RUN; then
        commit_git_restore_point "$dest" "Instalacao/Atualizacao concluida"
    fi
}

# ============================================================================
# Desinstalacao
# ============================================================================

do_uninstall() {
    local dest="$1"

    if [[ ! -d "$dest" ]]; then
        return
    fi

    local backup_root="/tmp/harness-v6-backup-$(date +%Y%m%d%H%M%S)"
    if ! $DRY_RUN; then
        mkdir -p "$backup_root"
        for item in agents commands templates tools plugins examples skills GERAIS.md state-machine.json state-machine-lean.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json; do
            if [[ -e "$dest/$item" ]]; then
                cp -r "$dest/$item" "$backup_root/" 2>/dev/null || true
            fi
        done
    fi

    if [[ -f "${HOME}/.local/bin/opencode" ]]; then
        if ! $DRY_RUN; then rm -f "${HOME}/.local/bin/opencode"; fi
    fi

    for item in agents commands templates tools plugins examples skills GERAIS.md state-machine.json state-machine-lean.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json .harness-version; do
        if [[ -e "$dest/$item" ]]; then
            if ! $DRY_RUN; then rm -rf "$dest/$item"; fi
        fi
    done

    if ! $DRY_RUN; then
        revert_git_state "$dest"
    fi
}

# ============================================================================
# Verificacoes
# ============================================================================

check_prerequisites() {
    local os="$1"
    local src="$2"

    if ! command -v node >/dev/null 2>&1; then
        log_warn "Node.js nao encontrado. Necessario para plugins."
    fi

    if ! command -v npm >/dev/null 2>&1; then
        log_warn "npm nao encontrado. Necessario para dependencias."
    fi
}

# ============================================================================
# Resumo final
# ============================================================================

print_summary() {
    local dest="$1"
    local os="$2"

    printf "\n"
    print_divider
    printf "\n"
    printf "  ${GREEN}${BOLD}  Instalacao concluida com sucesso!${NC}\n"
    printf "\n"
    printf "  ${BOLD}Destino:${NC}   %s\n" "$dest"
    printf "  ${BOLD}Versao:${NC}    %s\n" "$HARNESS_VERSION"
    printf "  ${BOLD}Plataforma:${NC} %s\n" "$os"
    printf "\n"
    printf "  ${BOLD}Proximos passos:${NC}\n"
    printf "  ${DIM}  1.${NC} Navegue ate seu projeto\n"
    printf "  ${DIM}  2.${NC} Execute ${BOLD}opencode${NC}\n"
    printf "  ${DIM}  3.${NC} Use ${BOLD}/harness${NC} para iniciar o workflow\n"
    printf "\n"
    print_divider
    printf "\n"
    printf "  ${DIM}Documentacao: https://github.com/alexandre-henrique-rp/harnes-opencode${NC}\n"
    printf "  ${DIM}Sandbox: ai-jail by @akitaonrails${NC}\n"
    printf "\n"
}

# ============================================================================
# Main
# ============================================================================

main() {
    OS=$(detect_os)
    SOURCE_DIR=$(get_source_dir)
    INSTALL_DIR=$(get_install_dir "$OS")

    NODE_STATUS="ausente"; NPM_STATUS="ausente"; OPENCODE_STATUS="ausente"
    command -v node >/dev/null 2>&1 && NODE_STATUS="ok"
    command -v npm >/dev/null 2>&1 && NPM_STATUS="ok"
    (command -v opencode >/dev/null 2>&1 || [[ -d "${HOME}/.config/opencode" || -f "${HOME}/.local/bin/opencode" ]]) && OPENCODE_STATUS="ok"

    if [[ $# -eq 0 ]]; then
        INTERACTIVE=true
        print_banner
        printf "  ${BOLD}Selecione a acao:${NC}\n\n"
        local options=("Instalacao Limpa" "Atualizacao" "Desinstalacao" "Sair")
        select_option "${options[@]}" && choice=0 || choice=$?
        case "$choice" in
            0) ;;
            1) UPDATE_MODE=true; PRESERVE_CUSTOM=true; PRESERVE_CONFIG=true ;;
            2) UNINSTALL=true ;;
            *) exit 0 ;;
        esac
    else
        INTERACTIVE=false
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --uninstall)        UNINSTALL=true; shift ;;
                --dry-run)          DRY_RUN=true; shift ;;
                --preserve-config)  PRESERVE_CONFIG=true; shift ;;
                --update)           UPDATE_MODE=true; PRESERVE_CUSTOM=true; PRESERVE_CONFIG=true; shift ;;
                --dir)              INSTALL_DIR="$2"; shift 2 ;;
                --version)          echo "Harness v6 installer ${HARNESS_VERSION}"; exit 0 ;;
                --help|-h)          print_help; exit 0 ;;
                *)                  log_err "Opcao desconhecida: $1"; print_help; exit 1 ;;
            esac
        done
        print_banner
    fi

    check_prerequisites "$OS" "$SOURCE_DIR"

    if $UNINSTALL; then
        print_step 1 1 "Desinstalando"
        do_uninstall "$INSTALL_DIR"
        log_done "Desinstalacao concluida"
    else
        do_install "$SOURCE_DIR" "$INSTALL_DIR"

        if ! $DRY_RUN; then
            post_install_check "$INSTALL_DIR" || true
        fi

        print_summary "$INSTALL_DIR" "$OS"
    fi
}

post_install_check() {
    local dest="$1"
}

main "$@"
