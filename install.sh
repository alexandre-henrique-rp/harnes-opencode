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
        log_info "Verificando MCPs locais configurados no opencode.json..."
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

if (!opencodePath) process.exit(0);

try {
  let content = fs.readFileSync(opencodePath, 'utf8');
  content = content.replace(/\/\/.*/g, '');
  const config = JSON.parse(content);
  
  if (!config.mcp) process.exit(0);
  
  const packages = [];
  for (const mcpName in config.mcp) {
    const cmd = config.mcp[mcpName].command || [];
    for (const arg of cmd) {
      if (arg.includes('node_modules/.bin/')) {
        const parts = arg.split('/');
        const pkgName = parts[parts.length - 1];
        if (pkgName && !packages.includes(pkgName)) {
          packages.push(pkgName);
        }
      }
    }
  }
  
  if (packages.length > 0) {
    console.log(`    [MCP] Detectados ${packages.length} MCPs locais. Instalando pacotes...`);
    for (const pkg of packages) {
      console.log(`      Instalando ${pkg} no escopo do Harness...`);
      if (pm === 'bun') {
        execSync(`bun add ${pkg} --save-dev`, { cwd: dest, stdio: 'inherit' });
      } else {
        execSync(`npm install ${pkg} --save-dev`, { cwd: dest, stdio: 'inherit' });
      }
    }
  }
} catch (e) {
  // Ignora erros
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
    
    # Limpa as linhas anteriores (para redesenhar o menu no mesmo lugar)
    # \e[F move o cursor para o início da linha anterior, \e[K limpa a linha
    if [[ ${MENU_RENDERED:-0} -eq 1 ]]; then
        for ((i=0; i<${#options[@]}+2; i++)); do
            printf "\033[F\033[K"
        done
    fi
    MENU_RENDERED=1

    printf "${BOLD}Selecione a ação desejada:${NC}\n\n"
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

    log_bold ""
    log_bold "[1/4] Verificando Pré-requisitos..."
    log_bold ""

    local opencode_found=false
    local detection_msg=""

    if command -v opencode >/dev/null 2>&1; then
        opencode_found=true
        detection_msg="OpenCode CLI detectado no PATH."
    else
        # Se não estiver no PATH, verifica a pasta de destino padrão
        if [[ -d "$INSTALL_DIR" ]]; then
            opencode_found=true
            detection_msg="OpenCode detectado (Pasta de configuração ativa em $INSTALL_DIR)."
        else
            local local_bin="${HOME}/.local/bin/opencode"
            if [[ -f "$local_bin" ]]; then
                opencode_found=true
                detection_msg="OpenCode CLI detectado em $local_bin."
            fi
        fi
    fi

    if $opencode_found; then
        log_ok "$detection_msg"
    else
        log_warn "OpenCode não encontrado. Instale-o posteriormente via:"
        log_warn "  curl -fsSL https://opencode.ai/install | bash"
    fi

    if command -v node >/dev/null 2>&1; then
        log_ok "Node.js detectado no PATH: $(node --version)"
    else
        log_warn "Node.js não foi encontrado. Necessário para executar os plugins e MCPs."
    fi

    if command -v npm >/dev/null 2>&1; then
        log_ok "npm detectado no PATH: $(npm --version)"
    else
        log_warn "npm não foi encontrado. Necessário para instalar dependências de plugins."
    fi

    log_info "OS detectado: $os"
    log_info "Source dir: $src"
    log_info "Install dir: $INSTALL_DIR"
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
            log_info "  backup: $path -> $backup"
        fi
    fi
}

copy_item() {
    local src="$1"
    local dest="$2"
    local desc="$3"
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
    log_ok "  copiado: $desc"
}

# ============================================================================
# Instalacao
# ============================================================================

do_install() {
    local src="$1"
    local dest="$2"

    log_bold ""
    log_bold "[2/4] Preparando Ambiente e Backup..."
    log_bold ""

    # 1. Cria diretorio de instalacao
    if $DRY_RUN; then
        log_info "[DRY-RUN] mkdir -p $dest"
    else
        mkdir -p "$dest"
        log_ok "diretorio criado: $dest"
    fi

    if ! $DRY_RUN; then
        setup_git_restore_point "$dest"
    fi

    # 2. Backup físico preventivo dos arquivos existentes
    if has_existing_harness_files "$dest"; then
        local timestamp
        timestamp=$(date +%Y%m%d_%H%M%S)
        local backup_dir="$dest/backup/backup_$timestamp"
        
        log_info "Copiando backup preventivo dos arquivos para: $backup_dir"
        if copy_directory_exclude_backup "$dest" "$backup_dir"; then
            log_ok "Backup físico datado criado com sucesso."
        else
            log_warn "Falha ao criar backup físico. Continuando..."
        fi
    fi

    # 3. Copia estrutura de diretorios
    log_info "Copiando arquivos..."

    # Agents (16 .md files)
    if [[ -d "$src/agents" ]]; then
        copy_item "$src/agents" "$dest/agents" "agents/ (16 files)"
        
        # Verifica a disponibilidade dos modelos Minimax no sistema do usuário
        log_info "Verificando se modelos Minimax estao instalados..."
        local models_list
        models_list=$(opencode models 2>/dev/null || true)
        
        if echo "$models_list" | grep -qE "minimax/MiniMax-M2\.5|minimax/MiniMax-M2\.7|minimax/MiniMax-M3"; then
            log_ok "Modelos Minimax detectados no sistema. Preservando configuracao nos agentes."
        else
            log_warn "Nenhum modelo Minimax (M2.5, M2.7 ou M3) detectado no sistema."
            log_info "Removendo definicao de modelo Minimax dos agentes..."
            if ! $DRY_RUN; then
                for f in "$dest"/agents/*.md; do
                    if [[ -f "$f" ]]; then
                        # Remove a linha que define o modelo minimax do frontmatter
                        sed -i '/^[[:space:]]*model:[[:space:]]*minimax/d' "$f"
                    fi
                done
                log_ok "Definicoes de modelo Minimax removidas dos agentes com sucesso."
            fi
        fi
    fi

    # Commands (6 .md files)
    if [[ -d "$src/commands" ]]; then
        copy_item "$src/commands" "$dest/commands" "commands/ (6 files)"
    fi

    # Templates (8 files - reference, nao sao lidos pelo opencode diretamente)
    if [[ -d "$src/templates" ]]; then
        copy_item "$src/templates" "$dest/templates" "templates/ (8 files - referencia)"
    fi

    # Custom Tools (4 .ts files)
    if [[ -d "$src/tools" ]]; then
        copy_item "$src/tools" "$dest/tools" "tools/ (4 custom tools)"
    fi

    # Plugins (3 .ts files - v6 formato opencode moderno)
    if [[ -d "$src/plugins" ]]; then
        copy_item "$src/plugins" "$dest/plugins" "plugins/ (3 plugins: path-boundary, audit-logger, status-injector)"
    fi

    # Examples (1 example end-to-end)
    if [[ -d "$src/examples" ]]; then
        copy_item "$src/examples" "$dest/examples" "examples/ (1 end-to-end)"
    fi

    # Skills (skills do harness)
    if [[ -d "$src/skills" ]]; then
        copy_item "$src/skills" "$dest/skills" "skills/ (skills do harness)"
    fi

    # Cria package.json (necessario para opencode resolver @opencode-ai/plugin e sqlite-vec)
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
            log_ok "  criado: package.json (com @opencode-ai/plugin e sqlite-vec deps)"
        else
            log_info "  preservado: package.json (ja existe)"
        fi
    fi

    # Cria harness-allowlist.json default (path-boundary plugin le este)
    if ! $DRY_RUN; then
        local allowlist="$dest/harness-allowlist.json"
        if [[ ! -f "$allowlist" ]] || ! $PRESERVE_CONFIG; then
            cat > "$allowlist" <<EOF
{
  "_comment": "Path allowlist para path-boundary plugin. Editavel por projeto. v6.2.0 expandido para incluir paths do proprio repo do harness (para que o harness seja self-modificavel).",
  "allow": [
    "src/**",
    "test/**",
    "tests/**",
    "e2e/**",
    "prisma/**",
    "RAG/**",
    "design/**",
    "docs/**",
    "PRD.html",
    "SPEC.html",
    "PRODUCT.md",
    ".harness/brief.md",
    ".harness/sprints/**",
    "qa/**",
    ".harness/RAG/**",
    ".harness/reviews/**",
    ".harness/security/**",
    ".harness/qa-gate/**",
    ".harness/lgpd/**",
    "agents/**",
    "training/**",
    "templates/**",
    "tools/**",
    "plugins/**",
    "commands/**",
    "state-machine.json",
    "failure-protocol.json",
    "opencode.json",
    "opencode.jsonc",
    "install.sh",
    "GERAIS.md",
    "README.md",
    "HARNESS-README.md",
    "CHANGELOG.md",
    "examples/**",
    "skills/**",
    "harness-allowlist.json"
  ],
  "deny": [
    ".env",
    ".env.*",
    "secrets/**",
    "*.pem",
    "*.key"
  ]
}
EOF
            log_ok "  criado: harness-allowlist.json (default project allowlist, v6.2.0+)"
        else
            log_info "  preservado: harness-allowlist.json (ja existe)"
        fi
    fi

    # v6.2.0+ — Copia RAGs globais (training/) para ~/.config/opencode/training/
    # Esses RAGs ficam disponiveis automaticamente em TODO projeto que use o harness
    if [[ -d "$src/training" ]]; then
        local training_dest="$dest/training"
        if ! $DRY_RUN; then
            mkdir -p "$training_dest"
        fi
        # Copia cada .md de training/ individualmente (preserva customizacoes em update)
        if [[ -d "$src/training" ]]; then
            for rag_doc in "$src/training"/*.md; do
                [[ ! -f "$rag_doc" ]] && continue
                local doc_name
                doc_name="$(basename "$rag_doc")"
                copy_item "$rag_doc" "$training_dest/$doc_name" "training/$doc_name (global RAG)" "$([ "$PRESERVE_CUSTOM" = true ] && echo "false" || echo "true")"
            done
        fi
        log_ok "  global RAGs instalados em: $dest/training/ (disponiveis em todos os projetos)"
    fi

    # 3. Copia arquivos de raiz
    [[ -f "$src/GERAIS.md" ]] && copy_item "$src/GERAIS.md" "$dest/GERAIS.md" "GERAIS.md (system prompt global)"
    [[ -f "$src/state-machine.json" ]] && copy_item "$src/state-machine.json" "$dest/state-machine.json" "state-machine.json (contrato)"
    [[ -f "$src/state-machine-lean.json" ]] && copy_item "$src/state-machine-lean.json" "$dest/state-machine-lean.json" "state-machine-lean.json (contrato simplificado)"
    [[ -f "$src/failure-protocol.json" ]] && copy_item "$src/failure-protocol.json" "$dest/failure-protocol.json" "failure-protocol.json (3 classes + 1 fatal)"
    [[ -f "$src/README.md" ]] && copy_item "$src/README.md" "$dest/HARNESS-README.md" "README.md (renomeado pra HARNESS-README.md)"

    # 4. opencode.json / opencode.jsonc (com Smart Merge e suporte interativo)
    if [[ -f "$src/opencode.json" ]]; then
        local existing_json="$dest/opencode.json"
        local existing_jsonc="$dest/opencode.jsonc"
        local config_file=""
        [[ -f "$existing_json" ]] && config_file="$existing_json"
        [[ -f "$existing_jsonc" ]] && config_file="$existing_jsonc"

        if [[ -n "$config_file" ]]; then
            # Criar pasta de backup preventiva centralizada com data/hora
            local backup_timestamp
            backup_timestamp=$(date +%Y%m%d_%H%M%S)
            local backup_dir="$dest/backup/backup_$backup_timestamp"

            if ! $DRY_RUN; then
                # Se o backup preventivo já copiou o arquivo, não precisamos copiar de novo, mas garantimos
                mkdir -p "$backup_dir"
                cp "$config_file" "$backup_dir/$(basename "$config_file")" 2>/dev/null || true
                printf "\n"
                log_ok "[BACKUP DE SEGURANÇA] Cópia preventiva do config criada com sucesso!"
                log_info "  Arquivo de backup: ${BLUE}$backup_dir/$(basename "$config_file")${NC}"
                log_info "  Explicação: Salvamos o seu arquivo de configuração original antes de realizar alterações."
                log_info "  Como restaurar se houver problemas: Você pode reverter a qualquer momento rodando o comando:"
                log_bold "  cp \"$backup_dir/$(basename "$config_file")\" \"$config_file\""
                printf "\n"
            else
                log_info "[DRY-RUN] Criaria pasta de backup em $backup_dir e copiaria $config_file"
            fi

            local action_choice=0
            if $INTERACTIVE; then
                printf "\n"
                log_warn "O arquivo de configuração $(basename "$config_file") já existe no destino."
                local cfg_options=(
                    "Mesclar (Smart Merge) — Recomendado, integra agentes preservando suas customizações"
                    "Sobrescrever (Overwrite) — Substitui completamente pelo padrão do Harness v6 (com backup)"
                    "Preservar (Skip) — Mantém o seu arquivo de configuração atual sem alterações"
                )
                select_option "${cfg_options[@]}" && action_choice=0 || action_choice=$?
            else
                if $PRESERVE_CONFIG; then
                    action_choice=2
                else
                    action_choice=0
                fi
            fi

            case "$action_choice" in
                0) # Smart Merge
                   log_info "Tentando Smart Merge em $config_file..."
                   backup_path "$config_file"
                   if merge_json "$config_file" "$src/opencode.json" "${config_file}.tmp"; then
                       mv "${config_file}.tmp" "$config_file"
                       log_ok "  Smart Merge concluído com sucesso!"
                   else
                       log_warn "  Falha no Smart Merge (provavelmente JSON inválido ou comentários complexos)."
                       if $INTERACTIVE; then
                           local fail_options=(
                               "Sobrescrever pelo padrão do Harness (com backup)"
                               "Cancelar e manter original"
                           )
                           local fail_choice=0
                           select_option "${fail_options[@]}" && fail_choice=0 || fail_choice=$?
                           if [[ $fail_choice -eq 0 ]]; then
                               cp "$src/opencode.json" "$config_file"
                               log_ok "  Substituído com sucesso."
                           else
                               log_info "  Mantido original."
                           fi
                       else
                           if ! $PRESERVE_CONFIG; then
                               cp "$src/opencode.json" "$config_file"
                               log_ok "  copiado: $(basename "$config_file") (substituído por falha no merge, com backup)"
                           fi
                       fi
                   fi
                   ;;
                1) # Overwrite
                   log_info "Sobrescrevendo $config_file..."
                   backup_path "$config_file"
                   cp "$src/opencode.json" "$config_file"
                   log_ok "  Arquivo sobrescrito com sucesso."
                   ;;
                *) # Skip
                   log_info "Preservando arquivo existente em $config_file."
                   ;;
            esac
        else
            # Nenhum existe, instala fresh
            copy_item "$src/opencode.json" "$dest/opencode.json" "opencode.json (instalação fresh)"
        fi
    fi

    # 5. Marca de versao
    if $DRY_RUN; then
        log_info "[DRY-RUN] echo '${HARNESS_VERSION}' > $dest/.harness-version"
    else
        cat > "$dest/.harness-version" <<EOF
version: ${HARNESS_VERSION}
name: ${HARNESS_NAME}
installed_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
os: $(detect_os)
source: ${src}
EOF
        log_ok "marcador de versao criado: $dest/.harness-version"
    fi

    # 6. Limpeza de arquivos (residuais e backups)
    if ! $DRY_RUN; then
        log_info "Limpando arquivos residuais e backups antigos..."
        # Remove arquivos de 0 bytes, ignorando os que tem .bak no nome
        find "$dest" -type f -size 0 ! -name "*.bak*" -delete 2>/dev/null
        # Remove backups antigos (.bak.*)
        find "$dest" -type f -name "*.bak.*" -delete 2>/dev/null
    fi

    # 7. Instalação automática das dependências NPM/Bun
    if ! $DRY_RUN; then
        log_bold ""
        log_bold "[4/4] Instalando Dependências e Configurando MCPs..."
        log_bold ""
        local pm="npm"
        if install_bun_if_needed; then
            pm="bun"
            log_info "Executando 'bun install' em $dest..."
            (cd "$dest" && bun install) || log_warn "Falha ao rodar bun install. Você pode tentar rodar manualmente."
        elif command -v npm >/dev/null 2>&1; then
            log_warn "Bun não disponível. Fazendo fallback para NPM..."
            log_info "Executando 'npm install' em $dest..."
            (cd "$dest" && npm install) || log_warn "Falha ao rodar npm install. Você pode tentar rodar manualmente."
        else
            log_err "Nenhum gerenciador de pacotes (Bun ou NPM) disponível para instalar as dependências."
        fi
        
        # Instala MCPs locais configurados no opencode.json
        install_configured_mcps "$dest" "$pm"
    fi

    if ! $DRY_RUN; then
        commit_git_restore_point "$dest" "Instalacao/Atualizacao concluida com sucesso"
    fi
}

# ============================================================================
# Desinstalacao
# ============================================================================

do_uninstall() {
    local dest="$1"

    log_bold ""
    log_bold "Desinstalando Harness v6 de: $dest"
    log_bold ""

    if [[ ! -d "$dest" ]]; then
        log_warn "Diretorio nao existe: $dest. Nada a fazer."
        return
    fi

    # Confirma
    if [[ -t 0 || -c /dev/tty ]] && ! $DRY_RUN; then
        printf "${YELLOW}Isso vai remover APENAS arquivos do harness v6 (com backup).${NC}\n"
        printf "Arquivos que serao removidos:\n"
        printf "  - $dest/agents/\n"
        printf "  - $dest/commands/\n"
        printf "  - $dest/templates/\n"
        printf "  - $dest/tools/\n"
        printf "  - $dest/plugins/\n"
        printf "  - $dest/examples/\n"
        printf "  - $dest/skills/\n"
        printf "  - $dest/GERAIS.md\n"
        printf "  - $dest/state-machine.json\n"
        printf "  - $dest/failure-protocol.json\n"
        printf "  - $dest/HARNESS-README.md\n"
        printf "  - $dest/package.json (se foi instalado pelo harness)\n"
        printf "  - $dest/harness-allowlist.json (se foi instalado pelo harness)\n"
        printf "  - $dest/opencode.json (se foi instalado pelo harness)\n"
        printf "\n"
        read -rp "Continuar? [y/N] " resp < /dev/tty
        if [[ ! "$resp" =~ ^[Yy]$ ]]; then
            log_info "Cancelado pelo usuario."
            exit 0
        fi
    fi

    # Faz backup completo antes
    local backup_root="/tmp/harness-v6-backup-$(date +%Y%m%d%H%M%S)"
    if ! $DRY_RUN; then
        mkdir -p "$backup_root"
        log_info "Backup completo em: $backup_root"
        for item in agents commands templates tools plugins examples skills GERAIS.md state-machine.json state-machine-lean.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json; do
            if [[ -e "$dest/$item" ]]; then
                cp -r "$dest/$item" "$backup_root/" 2>/dev/null || true
            fi
        done
    fi

    # Remove arquivos do harness
    for item in agents commands templates tools plugins examples skills GERAIS.md state-machine.json state-machine-lean.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json .harness-version; do
        if [[ -e "$dest/$item" ]]; then
            if $DRY_RUN; then
                log_info "  [DRY-RUN] rm -rf $dest/$item"
            else
                rm -rf "$dest/$item"
                log_ok "  removido: $item"
            fi
        fi
    done

    if ! $DRY_RUN; then
        revert_git_state "$dest"
    fi

    # Pergunta sobre opencode.json/jsonc
    if ! $DRY_RUN; then
        for cfg_file in "$dest/opencode.json" "$dest/opencode.jsonc"; do
            if [[ -f "$cfg_file" ]] && [[ -t 0 || -c /dev/tty ]]; then
                printf "\n${YELLOW}O arquivo $cfg_file pode ter sido instalado/substituido pelo harness.${NC}\n"
                printf "Ele contem 16 agents do harness + provavel config do usuario.\n"
                read -rp "Remover? (recomendado: nao, fazer merge manual) [y/N] " resp < /dev/tty
                if [[ "$resp" =~ ^[Yy]$ ]]; then
                    backup_path "$cfg_file"
                    rm -f "$cfg_file"
                    log_ok "  removido: $(basename "$cfg_file")"
                else
                    log_info "  preservado: $(basename "$cfg_file") (voce devera remover os 16 agents do harness manualmente)"
                fi
            fi
        done
    fi

    log_ok "Desinstalacao completa. Backup em: $backup_root"
}

# ============================================================================
# Validacao pos-instalacao
# ============================================================================

post_install_check() {
    local dest="$1"

    log_bold ""
    log_bold "Validando instalacao..."
    log_bold ""

    local errors=0

    # Verifica arquivos criticos
    local critical_files=(
        "$dest/GERAIS.md"
        "$dest/agents/orchestrator.md"
        "$dest/agents/briefing.md"
        "$dest/agents/backend.md"
        "$dest/commands/harness.md"
        "$dest/state-machine-lean.json"
    )

    # opencode.json/jsonc é opcional (pode ter sido preservado)
    if [[ -f "$dest/opencode.json" ]]; then
        critical_files+=("$dest/opencode.json")
    elif [[ -f "$dest/opencode.jsonc" ]]; then
        critical_files+=("$dest/opencode.jsonc")
    else
        log_warn "  ATENCAO: nem opencode.json nem opencode.jsonc encontrado"
        log_warn "  o harness v6 nao sera carregado pelo opencode sem um config file"
    fi

    for f in "${critical_files[@]}"; do
        if [[ -f "$f" ]]; then
            log_ok "  ✓ $f"
        else
            log_err "  ✗ FALTA: $f"
            errors=$((errors + 1))
        fi
    done

    # Conta agents
    if [[ -d "$dest/agents" ]]; then
        local agent_count
        agent_count=$(find "$dest/agents" -name "*.md" -type f | wc -l)
        log_info "  agents: $agent_count (esperado: 20)"
        if [[ "$agent_count" -ne 20 ]]; then
            log_warn "  contagem de agents diferente do esperado"
        fi
    fi

    # Conta commands
    if [[ -d "$dest/commands" ]]; then
        local cmd_count
        cmd_count=$(find "$dest/commands" -name "*.md" -type f | wc -l)
        log_info "  commands: $cmd_count (esperado: 6)"
    fi

    # Verifica plugins
    if [[ -d "$dest/plugins" ]]; then
        local plugin_count
        plugin_count=$(find "$dest/plugins" -name "*.ts" -type f | wc -l)
        log_info "  plugins: $plugin_count (esperado: 3)"
        if [[ "$plugin_count" -ne 3 ]]; then
            log_warn "  contagem de plugins diferente do esperado"
        fi
    else
        log_warn "  PLUGINS AUSENTES: path-boundary, audit-logger, status-injector nao serao carregados"
    fi

    # Verifica package.json
    if [[ -f "$dest/package.json" ]]; then
        if grep -q "@opencode-ai/plugin" "$dest/package.json"; then
            log_ok "  package.json: tem @opencode-ai/plugin dep"
        else
            log_warn "  package.json: NAO tem @opencode-ai/plugin (plugins nao vao funcionar)"
        fi
    else
        log_warn "  package.json AUSENTE (plugins nao vao funcionar)"
    fi

    if [[ "$errors" -eq 0 ]]; then
        log_ok ""
        log_ok "Instalacao validada com sucesso!"
    else
        log_err ""
        log_err "Instalacao completou com $errors erro(s). Verifique acima."
        return 1
    fi
}

# ============================================================================
# Resumo final
# ============================================================================

print_summary() {
    local dest="$1"
    local os="$2"

    log_bold ""
    log_bold "+--------------------------------------------------+"
    log_bold "|  Instalacao completa                             |"
    log_bold "+--------------------------------------------------+"
    log_bold ""
    log_info "Sistema:        $os"
    log_info "Install dir:    $dest"
    log_info "Version:        $HARNESS_VERSION"
    log_bold ""
    log_info "Proximos passos:"
    log_info "  1. Se opencode NAO estiver instalado:"
    log_info "     curl -fsSL https://opencode.ai/install | bash"
    log_info "  2. Instale as deps dos plugins (opencode roda isso auto no startup, mas pode ser manual):"
    log_info "     cd ~/.config/opencode && bun install"
    log_info "  3. Em um projeto, inicialize o harness:"
    log_info "     cd /seu/projeto"
    log_info "     # abra opencode, use /harness"
    log_info "  4. Veja o estado:"
    log_info "     /harness-status (dentro do opencode)"
    log_bold ""
    log_info "Documentacao completa: $dest/HARNESS-README.md"
    log_bold ""
    log_info "Para desinstalar: $0 --uninstall"
    log_info "Para atualizar (preservando customizacoes): $0 --update"
}

# ============================================================================
# Main
# ============================================================================

main() {
    # Deteccao inicial
    OS=$(detect_os)
    
    # Detecção rápida de ferramentas para o banner
    NODE_STATUS="✗ ausente"
    NPM_STATUS="✗ ausente"
    OPENCODE_STATUS="✗ ausente"
    
    command -v node >/dev/null 2>&1 && NODE_STATUS="✓ ok"
    command -v npm >/dev/null 2>&1 && NPM_STATUS="✓ ok"
    (command -v opencode >/dev/null 2>&1 || [[ -d "${HOME}/.config/opencode" || -f "${HOME}/.local/bin/opencode" ]]) && OPENCODE_STATUS="✓ ok"

    # Parse args
    if [[ $# -eq 0 ]]; then
        INTERACTIVE=true
        print_banner
        
        local options=(
            "Instalação Limpa (Fresh Install) — Sobrescreve core e reinicia configs"
            "Atualização (Update) — Preserva suas customizações e RAGs"
            "Desinstalação (Uninstall) — Remove o Harness v6 do OpenCode"
            "Cancelar e Sair"
        )
        
        local choice
        select_option "${options[@]}" && choice=0 || choice=$?
        
        case "$choice" in
            0) # Fresh Install
               ;;
            1) # Update
               UPDATE_MODE=true
               PRESERVE_CUSTOM=true
               PRESERVE_CONFIG=true
               ;;
            2) # Uninstall
               UNINSTALL=true
               ;;
            *) # Cancelar
               log_info "Operação cancelada pelo usuário."
               exit 0
               ;;
        esac
    else
        while [[ $# -gt 0 ]]; do
            case "$1" in
                --uninstall)        UNINSTALL=true; shift ;;
                --dry-run)          DRY_RUN=true; shift ;;
                --preserve-config)  PRESERVE_CONFIG=true; shift ;;
                --update)           UPDATE_MODE=true; PRESERVE_CUSTOM=true; PRESERVE_CONFIG=true; shift ;;
                --version)          echo "Harness v6 installer ${HARNESS_VERSION}"; exit 0 ;;
                --help|-h)          print_help; exit 0 ;;
                *)                  log_err "Opcao desconhecida: $1"; print_help; exit 1 ;;
            esac
        done
        print_banner
    fi

    # Deteccao
    OS=$(detect_os)
    SOURCE_DIR=$(get_source_dir)
    INSTALL_DIR=$(get_install_dir "$OS")

    # Confirmação do diretório de instalação em modo interativo
    if $INTERACTIVE && [[ "$UNINSTALL" = false ]]; then
        printf "\n"
        log_bold "Configuração do Caminho de Destino:"
        printf "Caminho padrão detectado para $OS: ${BLUE}$INSTALL_DIR${NC}\n"
        read -rp "Pressione Enter para confirmar ou digite outro caminho: " user_dir < /dev/tty
        if [[ -n "$user_dir" ]]; then
            # Expande ~ se necessário
            INSTALL_DIR="${user_dir/#\~/$HOME}"
        fi
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
