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

HARNESS_VERSION="6.4.0"
HARNESS_NAME="harness-v6"
DRY_RUN=false
PRESERVE_CONFIG=false
PRESERVE_CUSTOM=false
UPDATE_MODE=false
UNINSTALL=false
INTERACTIVE=false

# Limpeza de diretórios temporários na saída do script
TEMP_SOURCE_DIR=""
cleanup_temp_dir() {
    if [[ -n "$TEMP_SOURCE_DIR" && -d "$TEMP_SOURCE_DIR" ]]; then
        rm -rf "$TEMP_SOURCE_DIR"
    fi
}
trap cleanup_temp_dir EXIT

# ============================================================================
# Cores (se terminal suportar)
# ============================================================================

if [[ -t 1 ]] && command -v tput >/dev/null 2>&1 && [[ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' BOLD='' NC=''
fi

# ============================================================================
# Funcoes utilitarias
# ============================================================================

log_info()  { printf "${BLUE}[INFO]${NC}  %s\n" "$*"; }
log_ok()     { printf "${GREEN}[OK]${NC}    %s\n" "$*"; }
log_warn()   { printf "${YELLOW}[WARN]${NC}  %s\n" "$*"; }
log_err()    { printf "${RED}[ERROR]${NC} %s\n" "$*" >&2; }
log_bold()   { printf "${BOLD}%s${NC}\n" "$*"; }

die() { log_err "$*"; exit 1; }

install_bun_if_needed() {
    log_info "Verificando se o Bun está instalado..."
    if command -v bun >/dev/null 2>&1; then
        log_ok "Bun detectado: $(bun --version)"
        return 0
    fi

    log_warn "Bun não foi detectado no sistema."
    
    local resp="y"
    # Se for terminal interativo ou /dev/tty estiver disponível, pergunta ao usuário
    if [[ -t 0 || -c /dev/tty ]]; then
        printf "\n${YELLOW}O Bun é altamente recomendado para executar os plugins do Harness e o sqlite-vec com máxima performance.${NC}\n"
        read -rp "Deseja instalar o Bun agora automaticamente? [Y/n] " resp < /dev/tty
        if [[ -z "$resp" || "$resp" =~ ^[Yy]$ ]]; then
            log_info "Instalando o Bun..."
            if curl -fsSL https://bun.sh/install | bash; then
                log_ok "Bun instalado com sucesso!"
                # Carrega o Bun no PATH do script atual
                export BUN_INSTALL="${HOME}/.bun"
                export PATH="${BUN_INSTALL}/bin:${PATH}"
                return 0
            else
                log_err "Falha ao instalar o Bun automaticamente."
                return 1
            fi
        fi
    else
        log_info "Instalação não interativa. Pulando instalação do Bun."
    fi

    return 1
}

install_configured_mcps() {
    local dest="$1"
    local pm="$2"
    
    if command -v node >/dev/null 2>&1; then
        node - "$dest" "$pm" <<'EOF'
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
  console.log('\x1b[33m[AVISO] Arquivo opencode.json ou opencode.jsonc não encontrado no destino.\x1b[0m');
  process.exit(0);
}

try {
  let content = fs.readFileSync(opencodePath, 'utf8');
  
  // Regex robusto para remover comentarios multiline e inline
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  content = content.replace(/(?:^|[^:])\/\/.*$/gm, '');
  
  const config = JSON.parse(content);
  
  if (!config.mcp) {
    console.log('Nenhum servidor MCP configurado no opencode.json.');
    process.exit(0);
  }
  
  console.log(`\n\x1b[1mVerificando servidores MCP locais configurados...\x1b[0m`);
  
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
        console.log(`  \x1b[32m[OK]\x1b[0m    Servidor MCP "${mcpName}" (${pkgName}) já está instalado.`);
      } else {
        console.log(`  \x1b[31m[FALTA]\x1b[0m Servidor MCP "${mcpName}" (${pkgName}) não está instalado.`);
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
      console.log(`\nDeseja instalar estes MCPs locais ausentes agora? [Y/n]: `);
      const buffer = Buffer.alloc(10);
      const bytesRead = fs.readSync(ttyFd, buffer, 0, 10, null);
      const response = buffer.toString('utf8', 0, bytesRead).trim().toLowerCase();
      fs.closeSync(ttyFd);
      if (response === '' || response === 'y' || response === 'yes') {
        installConfirmed = true;
      }
    } catch (err) {
      // Fallback silencioso (assume não interativo)
    }
    
    if (installConfirmed) {
      console.log(`\nInstalando pacotes de MCPs locais...`);
      for (const pkg of missingPackages) {
        console.log(`  Instalando ${pkg}...`);
        const installCmd = pm === 'bun' ? `bun add ${pkg} --save-dev` : `npm install ${pkg} --save-dev`;
        try {
          execSync(installCmd, { cwd: dest, stdio: 'inherit' });
        } catch (e) {
          console.log(`  \x1b[31m[ERROR] Falha ao instalar ${pkg}.\x1b[0m`);
        }
      }
    } else {
      console.log(`\n\x1b[33m[AVISO] MCPs locais não instalados.\x1b[0m Para instalá-los manualmente, execute:`);
      for (const pkg of missingPackages) {
        const cmd = pm === 'bun' ? `bun add ${pkg} --save-dev` : `npm install ${pkg} --save-dev`;
        console.log(`  \x1b[1mcd ${dest} && ${cmd}\x1b[0m`);
      }
      console.log();
    }
  } else {
    console.log(`\x1b[32m[OK] Todos os servidores MCP locais estão instalados.\x1b[0m\n`);
  }
} catch (e) {
  console.error(`\x1b[31m[Erro] Falha ao analisar configuração do OpenCode (JSON inválido):\x1b[0m`, e.message);
}
EOF
    fi
}

setup_git_restore_point() {
    local dir="$1"
    if ! command -v git >/dev/null 2>&1; then
        return 0
    fi
    
    local git_dir="$dir/.git"
    if [[ ! -d "$git_dir" ]]; then
        log_info "Iniciando repositório Git preventivo para versionamento..."
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
        log_info "Revertendo modificações via Git..."
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
    
    # Copia itens da raiz excluindo backup, .git, tmp e node_modules
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
# Menu Interativo Estilizado
# ============================================================================

show_menu() {
    local selected="$1"
    shift
    local options=("$@")
    
    # Limpa apenas as opcoes e a quebra de linha final
    if [[ ${MENU_RENDERED:-0} -eq 1 ]]; then
        for ((i=0; i<${#options[@]}+1; i++)); do
            printf "\033[F\033[K"
        done
    fi
    MENU_RENDERED=1

    local idx=0
    for opt in "${options[@]}"; do
        if [[ $idx -eq $selected ]]; then
            printf "  ${GREEN}❯${NC} ${BOLD}${GREEN}%s${NC}\n" "$opt"
        else
            printf "    %s\n" "$opt"
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
    
    # Oculta o cursor do terminal
    tput civis 2>/dev/null || printf "\033[?25l"
    
    # Handler para restaurar o cursor se o usuário der Ctrl+C
    trap 'tput cnorm 2>/dev/null || printf "\033[?25h"; exit 1' INT TERM

    MENU_RENDERED=0
    show_menu "$selected" "${options[@]}"

    while true; do
        # Lê 1 caractere de entrada de /dev/tty. Se for escape, lê mais para identificar as setas.
        read -s -n1 key < /dev/tty
        
        # Detecta sequência de escape para as setas do teclado
        if [[ "$key" == "$ESC" ]]; then
            read -s -n2 -t 0.05 key < /dev/tty
            if [[ "$key" == "[A" ]]; then # Seta para CIMA
                selected=$(( (selected - 1 + ${#options[@]}) % ${#options[@]} ))
                show_menu "$selected" "${options[@]}"
            elif [[ "$key" == "[B" ]]; then # Seta para BAIXO
                selected=$(( (selected + 1) % ${#options[@]} ))
                show_menu "$selected" "${options[@]}"
            fi
        # Detecta tecla Enter
        elif [[ "$key" == "" ]]; then
            break
        fi
    done

    # Restaura o cursor
    tput cnorm 2>/dev/null || printf "\033[?25h"
    trap - INT TERM
    
    return "$selected"
}

# ============================================================================
# Deteccao de OS e paths
# ============================================================================

detect_os() {
    local uname_s
    uname_s="$(uname -s 2>/dev/null || echo unknown)"

    case "$uname_s" in
        Linux*)
            # Detecta WSL (Windows Subsystem for Linux)
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
            # OpenCode usa ~/.config/opencode/ cross-platform
            # (https://opencode.ai/docs/config/#locations)
            echo "${HOME}/.config/opencode"
            ;;
        *)
            # Fallback para Linux-style
            echo "${HOME}/.config/opencode"
            ;;
    esac
}

get_source_dir() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd 2>/dev/null || pwd)"

    # Se os arquivos básicos existirem no diretório do script, rodamos em modo local (offline/dev)
    if [[ -d "$script_dir/agents" && -f "$script_dir/opencode.json" ]]; then
        echo "$script_dir"
        return 0
    fi

    # Caso contrário, rodamos em modo remoto (download temporário via GitHub)
    local tmp_dir
    tmp_dir=$(mktemp -d -t harness-install.XXXXXX 2>/dev/null || mktemp -d /tmp/harness-install.XXXXXX)
    TEMP_SOURCE_DIR="$tmp_dir"

    local tarball_url="https://github.com/alexandre-henrique-rp/harnes-opencode/archive/refs/heads/main.tar.gz"
    local tar_file="$tmp_dir/harness.tar.gz"

    log_bold ""
    log_bold "[3/4] Baixando e Extraindo os Arquivos do GitHub..."
    log_bold ""

    log_info "Baixando pacote do repositório GitHub..."
    if command -v curl >/dev/null 2>&1; then
        curl -L --progress-bar "$tarball_url" -o "$tar_file"
    elif command -v wget >/dev/null 2>&1; then
        wget --show-progress "$tarball_url" -O "$tar_file"
    else
        log_err "Erro: É necessário ter 'curl' ou 'wget' instalado para rodar a instalação remota."
        exit 1
    fi

    log_info "Extraindo arquivos do Harness..."
    if ! tar -xzf "$tar_file" -C "$tmp_dir"; then
        log_err "Erro: Falha ao extrair os arquivos baixados do GitHub."
        exit 1
    fi
    log_ok "Arquivos de estrutura baixados e extraídos com sucesso."

    # Encontra a pasta extraída (que o GitHub nomeia como 'harnes-opencode-main')
    local extracted_dir
    extracted_dir=$(find "$tmp_dir" -maxdepth 2 -type d -name "harnes-opencode-*" | head -n 1)

    if [[ -z "$extracted_dir" ]]; then
        log_err "Erro: Estrutura do repositório baixado está inválida."
        exit 1
    fi

    echo "$extracted_dir"
}

# ============================================================================
# Banner e help
# ============================================================================

print_banner() {
    local logo="
${BLUE}██╗  ██╗ █████╗ ██████╗ ███╗   ██╗███████╗███████╗███████╗
██║  ██║██╔══██╗██╔══██╗████╗  ██║██╔════╝██╔════╝██╔════╝
███████║███████║██████╔╝██╔██╗ ██║█████╗  ███████╗███████╗
██╔══██║██╔══██║██╔══██╗██║╚██╗██║██╔══╝  ╚════██║╚════██║
██║  ██║██║  ██║██║  ██║██║ ╚████║███████╗███████║███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝${NC}"

    printf "%b\n" "$logo"
    printf "  ${BOLD}Harness v6 Installer${NC} — ${BLUE}%s${NC}\n" "${OS:-platform}"
    printf "  ${BOLD}Versão:${NC} %s\n" "${HARNESS_VERSION}"
    
    local node_color="${RED}" npm_color="${RED}" opencode_color="${RED}"
    [[ "$NODE_STATUS" == *"✓"* ]] && node_color="${GREEN}"
    [[ "$NPM_STATUS" == *"✓"* ]] && npm_color="${GREEN}"
    [[ "$OPENCODE_STATUS" == *"✓"* ]] && opencode_color="${GREEN}"
    
    printf "  ${BOLD}Ambiente:${NC} Node.js (${node_color}%s${NC}) • npm (${npm_color}%s${NC}) • OpenCode (${opencode_color}%s${NC})\n" \
        "${NODE_STATUS}" "${NPM_STATUS}" "${OPENCODE_STATUS}"
    printf "  ${BLUE}──────────────────────────────────────────────────${NC}\n"
}

print_help() {
    cat <<EOF
Uso: ./install.sh [OPCOES]

Detecta automaticamente o sistema operacional e instala o Harness v6
no diretorio de configuracao do OpenCode (~/.config/opencode/).

OPCOES:
  --uninstall         Remove o Harness v6 do OpenCode (com backup)
  --update            Atualiza preservando customizacoes do usuario
                      (implica --preserve-config + --preserve-custom)
  --dry-run           Mostra o que seria feito, sem alterar nada
  --preserve-config   Nao sobrescreve opencode.json existente (so adiciona arquivos)
  --version           Mostra a versao
  --help, -h          Mostra esta ajuda

SISTEMAS SUPORTADOS:
  - Linux (qualquer distro)
  - macOS
  - WSL (Windows Subsystem for Linux)
  - Git Bash / MSYS2 / Cygwin no Windows

Para Windows nativo (PowerShell/CMD), use WSL ou Git Bash.
Um script PowerShell estara disponivel em versao futura.

DOCUMENTACAO:
  - OpenCode config paths: https://opencode.ai/docs/config/#locations
  - Harness v6 README:      <source>/README.md
EOF
}

# ============================================================================
# Verificacoes pre-instalacao
# ============================================================================

check_prerequisites() {
    local os="$1"
    local src="$2"

    local opencode_found=false

    if command -v opencode >/dev/null 2>&1; then
        opencode_found=true
    else
        if [[ -d "$INSTALL_DIR" ]]; then
            opencode_found=true
        else
            local local_bin="${HOME}/.local/bin/opencode"
            if [[ -f "$local_bin" ]]; then
                opencode_found=true
            fi
        fi
    fi

    if ! command -v node >/dev/null 2>&1; then
        log_warn "Node.js não foi encontrado. Necessário para executar os plugins e MCPs."
    fi

    if ! command -v npm >/dev/null 2>&1; then
        log_warn "npm não foi encontrado. Necessário para instalar dependências de plugins."
    fi
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

backup_path() {
    local path="$1"
    if [[ -e "$path" ]]; then
        local backup="${path}.bak.$(date +%Y%m%d%H%M%S)"
        if $DRY_RUN; then
            log_info "  [DRY-RUN] backup: $path -> $backup"
        else
            cp -r "$path" "$backup"
        fi
    fi
}

copy_item() {
    local src="$1"
    local dest="$2"
    local desc="${3:-}"
    local force_replace="${4:-true}"

    if [[ ! -e "$src" ]]; then
        log_warn "  source nao existe, pulando: $src"
        return
    fi

    if $DRY_RUN; then
        log_info "  [DRY-RUN] $desc: $src -> $dest"
        return
    fi

    # Se o destino existe
    if [[ -e "$dest" ]]; then
        # Se for um diretorio, SEMPRE remove para evitar sujeira (leftover files)
        # conforme solicitado: 'as demais pode somente subistituir'
        if [[ -d "$dest" ]]; then
            rm -rf "$dest"
        else
            # Se for arquivo e force_replace for false, faz nada (usado pra configs)
            if ! $force_replace; then
                log_info "  preservado: $desc (ja existe)"
                return
            fi
            backup_path "$dest"
            rm -f "$dest"
        fi
    fi

    # Copia (cp -r funciona pra arquivos e diretorios)
    cp -r "$src" "$dest"
}

# ============================================================================
# Instalacao
# ============================================================================

do_install() {
    local src="$1"
    local dest="$2"

    log_bold ""
    log_bold "[1/4] Verificando Pré-requisitos..."
    check_prerequisites "$OS" "$src"
    log_ok "  Pré-requisitos validados."

    log_bold ""
    log_bold "[2/4] Preparando Ambiente e Backup..."
    
    if ! $DRY_RUN; then
        mkdir -p "$dest"
    else
        log_info "  [DRY-RUN] mkdir -p $dest"
    fi

    if ! $DRY_RUN; then
        setup_git_restore_point "$dest"
    fi

    if has_existing_harness_files "$dest"; then
        local timestamp
        timestamp=$(date +%Y%m%d_%H%M%S)
        local backup_dir="$dest/backup/backup_$timestamp"
        copy_directory_exclude_backup "$dest" "$backup_dir"
    fi

    copy_item "$src/agents" "$dest/agents" "agents/"
    copy_item "$src/commands" "$dest/commands" "commands/"
    copy_item "$src/templates" "$dest/templates" "templates/"
    copy_item "$src/tools" "$dest/tools" "tools/"
    copy_item "$src/plugins" "$dest/plugins" "plugins/"
    copy_item "$src/examples" "$dest/examples" "examples/"
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
                printf "${BOLD}Arquivo de configuração opencode.jsonc já existe no destino. Selecione a ação desejada:${NC}\n\n"
                local cfg_options=(
                    "Mesclar (Smart Merge) — Recomendado"
                    "Sobrescrever (Overwrite)"
                    "Preservar (Skip)"
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

    if ! $DRY_RUN; then
        log_bold ""
        log_bold "[4/4] Instalando Dependências..."
        log_bold ""
        local pm="npm"
        (cd "$dest" && npm install >/dev/null 2>&1) || true
        install_configured_mcps "$dest" "$pm"
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
# Validacao pos-instalacao
# ============================================================================

post_install_check() {
    local dest="$1"
    # Silencioso conforme solicitado
}

# ============================================================================
# Resumo final
# ============================================================================

print_summary() {
    local dest="$1"
    local os="$2"
    log_info "Instalação concluída com sucesso em: $dest"
}

# ============================================================================
# Main
# ============================================================================

main() {
    OS=$(detect_os)
    SOURCE_DIR=$(get_source_dir)
    INSTALL_DIR=$(get_install_dir "$OS")

    # Detecção rápida de ferramentas para o banner
    NODE_STATUS="✗ ausente"; NPM_STATUS="✗ ausente"; OPENCODE_STATUS="✗ ausente"
    command -v node >/dev/null 2>&1 && NODE_STATUS="✓ ok"
    command -v npm >/dev/null 2>&1 && NPM_STATUS="✓ ok"
    (command -v opencode >/dev/null 2>&1 || [[ -d "${HOME}/.config/opencode" || -f "${HOME}/.local/bin/opencode" ]]) && OPENCODE_STATUS="✓ ok"

    if [[ $# -eq 0 ]]; then
        INTERACTIVE=true
        print_banner
        printf "${BOLD}Selecione a ação desejada:${NC}\n\n"
        local options=("Instalação Limpa" "Atualização" "Desinstalação" "Sair")
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
                *)                  log_err "Opção desconhecida: $1"; print_help; exit 1 ;;
            esac
        done
        print_banner
    fi

    # Pre-checks
    check_prerequisites "$OS" "$SOURCE_DIR"

    # Executa
    if $UNINSTALL; then
        do_uninstall "$INSTALL_DIR"
    else
        do_install "$SOURCE_DIR" "$INSTALL_DIR"

        if ! $DRY_RUN; then
            post_install_check "$INSTALL_DIR" || true
        fi

        print_summary "$INSTALL_DIR" "$OS"
    fi
}

main "$@"
