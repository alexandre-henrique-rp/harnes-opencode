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
# Backup e copia
# ============================================================================

# Detecta se o destino tem modificacoes locais (customizacoes do usuario)
# comparando com o source. Retorna 0 (true) se modificado, 1 (false) se igual.
has_local_modifications() {
    local dest="$1"
    local src="$2"

    # Diretorios: compara recursivamente
    if [[ -d "$dest" ]] && [[ -d "$src" ]]; then
        # diff retorna exit 1 se houver diferencas, 0 se iguais
        if diff -rq "$src" "$dest" >/dev/null 2>&1; then
            return 1  # nao modificado
        else
            return 0  # modificado
        fi
    fi

    # Arquivo: compara bytes
    if [[ -f "$dest" ]] && [[ -f "$src" ]]; then
        if cmp -s "$src" "$dest"; then
            return 1  # nao modificado
        else
            return 0  # modificado
        fi
    fi

    # Se um nao existe, considera modificado (vai instalar)
    return 0
}

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

    if [[ ! -e "$src" ]]; then
        log_warn "  source nao existe, pulando: $src"
        return
    fi

    if $DRY_RUN; then
        log_info "  [DRY-RUN] $desc: $src -> $dest"
        return
    fi

    # UPDATE mode: se destino existe e tem customizacao, preserva
    if $UPDATE_MODE && [[ -e "$dest" ]]; then
        if has_local_modifications "$dest" "$src"; then
            log_warn "  [UPDATE] customizado, preservando: $desc"
            log_warn "           diff disponivel em: $(diff -rq "$src" "$dest" 2>/dev/null | head -3)"
            return
        fi
    fi

    # Backup se destino existe
    if [[ -e "$dest" ]]; then
        backup_path "$dest"
        # IMPORTANTE: remove o destino antes de copiar pra evitar nesting
        # (cp -r src dest quando dest existe cria dest/src)
        rm -rf "$dest"
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
                copy_item "$rag_doc" "$training_dest/$doc_name" "training/$doc_name (global RAG)"
            done
        fi
        log_ok "  global RAGs instalados em: $dest/training/ (disponiveis em todos os projetos)"
    fi

    # 3. Copia arquivos de raiz
    [[ -f "$src/GERAIS.md" ]] && copy_item "$src/GERAIS.md" "$dest/GERAIS.md" "GERAIS.md (system prompt global)"
    [[ -f "$src/state-machine.json" ]] && copy_item "$src/state-machine.json" "$dest/state-machine.json" "state-machine.json (contrato)"
    [[ -f "$src/failure-protocol.json" ]] && copy_item "$src/failure-protocol.json" "$dest/failure-protocol.json" "failure-protocol.json (3 classes + 1 fatal)"
    [[ -f "$src/README.md" ]] && copy_item "$src/README.md" "$dest/HARNESS-README.md" "README.md (renomeado pra HARNESS-README.md)"

    # 4. opencode.json / opencode.jsonc (com cuidado se ja existe)
    if [[ -f "$src/opencode.json" ]]; then
        local existing_json="$dest/opencode.json"
        local existing_jsonc="$dest/opencode.jsonc"

        if [[ -f "$existing_jsonc" ]]; then
            # Usuario ja tem .jsonc (formato preferido pra config com comentarios)
            if $PRESERVE_CONFIG; then
                log_warn "--preserve-config: opencode.jsonc existente sera preservado"
                log_warn "Para usar o harness, adicione manualmente ao seu $existing_jsonc:"
                log_warn "  - agent: { orchestrator, briefing, documenter, ... } (16 agents)"
                log_warn "  - mcp: { context7, playwright }"
                log_warn "  - instructions: [\"~/.config/opencode/GERAIS.md\"]"
            else
                # Backup do existente e copia o novo como .jsonc
                backup_path "$existing_jsonc"
                if $DRY_RUN; then
                    log_info "  [DRY-RUN] cp $src/opencode.json $existing_jsonc (renomeando)"
                else
                    cp "$src/opencode.json" "$existing_jsonc"
                    log_ok "  copiado: opencode.jsonc (substitui o existente, com backup)"
                    log_warn "ATENCAO: substituiu seu opencode.jsonc. Se tinha customizacoes,"
                    log_warn "recupere do backup e mescle manualmente."
                fi
            fi
        elif [[ -f "$existing_json" ]]; then
            # Tem .json mas nao .jsonc
            if $PRESERVE_CONFIG; then
                log_warn "--preserve-config: opencode.json existente preservado"
            else
                copy_item "$src/opencode.json" "$dest/opencode.json" "opencode.json (16 agents + MCPs + permissions)"
            fi
        else
            # Nenhum existe, instala fresh
            copy_item "$src/opencode.json" "$dest/opencode.json" "opencode.json (16 agents + MCPs + permissions)"
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
        for item in agents commands templates tools plugins examples GERAIS.md state-machine.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json; do
            if [[ -e "$dest/$item" ]]; then
                cp -r "$dest/$item" "$backup_root/" 2>/dev/null || true
            fi
        done
    fi

    # Remove arquivos do harness
    for item in agents commands templates tools plugins examples GERAIS.md state-machine.json failure-protocol.json HARNESS-README.md package.json harness-allowlist.json .harness-version; do
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
