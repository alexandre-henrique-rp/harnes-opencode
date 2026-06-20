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

HARNESS_VERSION="6.1.0"
HARNESS_NAME="harness-v6"
DRY_RUN=false
PRESERVE_CONFIG=false
PRESERVE_CUSTOM=false
UPDATE_MODE=false
UNINSTALL=false

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
        # Lê 1 caractere de entrada. Se for escape, lê mais para identificar as setas.
        read -s -n1 key
        
        # Detecta sequência de escape para as setas do teclado
        if [[ "$key" == "$ESC" ]]; then
            read -s -n2 -t 0.05 key
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
    # Diretorio onde o install.sh esta localizado
    local src
    src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    echo "$src"
}

# ============================================================================
# Banner e help
# ============================================================================

print_banner() {
    cat <<EOF
${BOLD}+--------------------------------------------------+${NC}
${BOLD}|  Harness v6 Installer                            |${NC}
${BOLD}|  Version: ${HARNESS_VERSION}                                  |${NC}
${BOLD}+--------------------------------------------------+${NC}
EOF
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

    log_info "Verificando pre-requisitos..."

    # Verifica source dir
    [[ -d "$src" ]] || die "Diretorio source nao existe: $src"
    [[ -f "$src/opencode.json" ]] || die "opencode.json nao encontrado em $src"
    [[ -d "$src/agents" ]] || die "agents/ nao encontrado em $src"
    [[ -d "$src/commands" ]] || die "commands/ nao encontrado em $src"

    # Verifica OpenCode instalado (opcional, apenas warn)
    if command -v opencode >/dev/null 2>&1; then
        local ver
        ver="$(opencode --version 2>/dev/null || echo 'unknown')"
        log_ok "OpenCode detectado: $ver"
    else
        log_warn "opencode nao encontrado no PATH. Instale antes de usar o harness:"
        log_warn "  curl -fsSL https://opencode.ai/install | bash"
    fi

    # Verifica bash version (precisa 4+ pra alguns recursos)
    local bash_major="${BASH_VERSINFO[0]:-0}"
    if [[ "$bash_major" -lt 4 ]]; then
        log_warn "Bash $bash_major detectado. Bash 4+ recomendado (alguns recursos podem falhar)."
    fi

    log_ok "OS detectado: $os"
    log_ok "Source dir: $src"
    log_ok "Install dir: $INSTALL_DIR"
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
    if $UPDATE_MODE; then
        log_bold "Atualizando Harness v6 em: $dest (preservando customizacoes)"
    else
        log_bold "Instalando Harness v6 em: $dest"
    fi
    log_bold ""

    # 1. Cria diretorio de instalacao
    if $DRY_RUN; then
        log_info "[DRY-RUN] mkdir -p $dest"
    else
        mkdir -p "$dest"
        log_ok "diretorio criado: $dest"
    fi

    # 2. Copia estrutura de diretorios
    log_info "Copiando arquivos..."

    # Agents (16 .md files)
    if [[ -d "$src/agents" ]]; then
        copy_item "$src/agents" "$dest/agents" "agents/ (16 files)"
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

    # Cria package.json (necessario para opencode resolver @opencode-ai/plugin)
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
    "@opencode-ai/plugin": "latest"
  }
}
EOF
            log_ok "  criado: package.json (com @opencode-ai/plugin dep)"
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
    "brief.md",
    "sprints/**",
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

    # 4. opencode.json / opencode.jsonc (com Smart Merge)
    if [[ -f "$src/opencode.json" ]]; then
        local existing_json="$dest/opencode.json"
        local existing_jsonc="$dest/opencode.jsonc"

        # Prioridade para .jsonc se ja existe (OpenCode prefere .jsonc)
        if [[ -f "$existing_jsonc" ]]; then
            log_info "Detectado opencode.jsonc existente. Tentando Smart Merge..."
            backup_path "$existing_jsonc"
            
            # Smart Merge via Python
            if merge_json "$existing_jsonc" "$src/opencode.json" "${existing_jsonc}.tmp"; then
                mv "${existing_jsonc}.tmp" "$existing_jsonc"
                log_ok "  Smart Merge concluido: opencode.jsonc atualizado (preservando customizacoes)"
            else
                log_warn "  Falha no Smart Merge (provavelmente JSON invalido ou com comentarios complexos)."
                if $PRESERVE_CONFIG; then
                    log_info "  --preserve-config: mantendo seu opencode.jsonc original."
                else
                    cp "$src/opencode.json" "$existing_jsonc"
                    log_ok "  copiado: opencode.jsonc (substituido por novo, com backup)"
                fi
            fi
        elif [[ -f "$existing_json" ]]; then
            log_info "Detectado opencode.json existente. Tentando Smart Merge..."
            backup_path "$existing_json"
            
            if merge_json "$existing_json" "$src/opencode.json" "${existing_json}.tmp"; then
                mv "${existing_json}.tmp" "$existing_json"
                log_ok "  Smart Merge concluido: opencode.json atualizado"
            else
                log_warn "  Falha no Smart Merge."
                if $PRESERVE_CONFIG; then
                    log_info "  --preserve-config: mantendo seu opencode.json original."
                else
                    copy_item "$src/opencode.json" "$existing_json" "opencode.json (substituido, com backup)"
                fi
            fi
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
    if [[ -t 0 ]] && ! $DRY_RUN; then
        printf "${YELLOW}Isso vai remover APENAS arquivos do harness v6 (com backup).${NC}\n"
        printf "Arquivos que serao removidos:\n"
        printf "  - $dest/agents/\n"
        printf "  - $dest/commands/\n"
        printf "  - $dest/templates/\n"
        printf "  - $dest/tools/\n"
        printf "  - $dest/plugins/\n"
        printf "  - $dest/examples/\n"
        printf "  - $dest/GERAIS.md\n"
        printf "  - $dest/state-machine.json\n"
        printf "  - $dest/failure-protocol.json\n"
        printf "  - $dest/HARNESS-README.md\n"
        printf "  - $dest/package.json (se foi instalado pelo harness)\n"
        printf "  - $dest/harness-allowlist.json (se foi instalado pelo harness)\n"
        printf "  - $dest/opencode.json (se foi instalado pelo harness)\n"
        printf "\n"
        read -rp "Continuar? [y/N] " resp
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
        for item in agents commands templates tools plugins examples GERAIS.md state-machine.json state-machine-lean.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json; do
            if [[ -e "$dest/$item" ]]; then
                cp -r "$dest/$item" "$backup_root/" 2>/dev/null || true
            fi
        done
    fi

    # Remove arquivos do harness
    for item in agents commands templates tools plugins examples GERAIS.md state-machine.json state-machine-lean.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json .harness-version; do
        if [[ -e "$dest/$item" ]]; then
            if $DRY_RUN; then
                log_info "  [DRY-RUN] rm -rf $dest/$item"
            else
                rm -rf "$dest/$item"
                log_ok "  removido: $item"
            fi
        fi
    done

    # Pergunta sobre opencode.json/jsonc
    if ! $DRY_RUN; then
        for cfg_file in "$dest/opencode.json" "$dest/opencode.jsonc"; do
            if [[ -f "$cfg_file" ]] && [[ -t 0 ]]; then
                printf "\n${YELLOW}O arquivo $cfg_file pode ter sido instalado/substituido pelo harness.${NC}\n"
                printf "Ele contem 16 agents do harness + provavel config do usuario.\n"
                read -rp "Remover? (recomendado: nao, fazer merge manual) [y/N] " resp
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
        log_info "  agents: $agent_count (esperado: 16)"
        if [[ "$agent_count" -ne 16 ]]; then
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
    # Parse args
    if [[ $# -eq 0 ]]; then
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
