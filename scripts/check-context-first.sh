#!/usr/bin/env bash
#
# check-context-first.sh
#
# CI helper que valida se a sequência de operações de uma task do frontend
# respeitou o protocolo context-first:
#
#   1. read de AGENTS.md ANTES de qualquer write em src/
#   2. existência de .harness/decisions/<sprint>-<feature>.md se a feature
#      teve decisões abertas (grill-me)
#   3. ausência de write em *.test.* pelo frontend agent
#
# Uso:
#   ./scripts/check-context-first.sh <sprint-id> [--strict]
#
# Exit codes:
#   0  — todas as verificações passaram
#   1  — uma ou mais verificações falharam
#   2  — uso incorreto
#
# Dependências:
#   - bash 4+
#   - jq (para parsear o audit log JSON-lines)
#   - acesso ao audit log em .harness/audit.log

set -euo pipefail

# ---- Args ----
SPRINT_ID="${1:-}"
STRICT="${2:-}"

if [[ -z "$SPRINT_ID" ]]; then
  echo "Uso: $0 <sprint-id> [--strict]" >&2
  echo "  sprint-id: ex. S01" >&2
  echo "  --strict: falha se qualquer check tiver warning (default: só erro)" >&2
  exit 2
fi

# ---- Localiza o audit log ----
AUDIT_LOG="${AUDIT_LOG:-.harness/audit.log}"
DECISIONS_DIR="${DECISIONS_DIR:-.harness/decisions}"

if [[ ! -f "$AUDIT_LOG" ]]; then
  echo "❌ Audit log não encontrado em $AUDIT_LOG" >&2
  echo "   Defina AUDIT_LOG=/caminho/para/audit.log ou rode o harness primeiro." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ 'jq' não está instalado. Instale com: apt install jq / brew install jq" >&2
  exit 1
fi

# ---- Cores ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAIL=0
WARN=0

check_pass() { echo -e "  ${GREEN}✓${NC} $1"; }
check_fail() { echo -e "  ${RED}✗${NC} $1"; FAIL=$((FAIL + 1)); }
check_warn() { echo -e "  ${YELLOW}⚠${NC} $1"; WARN=$((WARN + 1)); }

echo "═══════════════════════════════════════════════════════════════"
echo "  Context-First Compliance Check — sprint $SPRINT_ID"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# ---- Filtra eventos do sprint ----
SPRINT_LOG=$(mktemp)
trap "rm -f $SPRINT_LOG" EXIT

jq -c "select(.sprint == \"$SPRINT_ID\")" "$AUDIT_LOG" > "$SPRINT_LOG" 2>/dev/null || {
  echo "❌ Falha ao parsear $AUDIT_LOG. Formato esperado: JSON-lines com campo 'sprint'." >&2
  exit 1
}

TOTAL_EVENTS=$(wc -l < "$SPRINT_LOG" | tr -d ' ')
if [[ "$TOTAL_EVENTS" -eq 0 ]]; then
  echo "⚠ Nenhum evento encontrado para o sprint $SPRINT_ID no audit log."
  echo "  (Sprint não foi executado, ou AUDIT_LOG está em outro caminho.)"
  exit 0
fi

echo "📊 Eventos do sprint: $TOTAL_EVENTS"
echo ""

# ---- Check 1: frontend leu AGENTS.md antes de escrever em src/ ----
echo "🔍 Check 1: ordem de operações (read AGENTS.md → write src/)"

# Eventos do agent frontend
FRONTEND_WRITES=$(jq -c 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit"))' "$SPRINT_LOG" | wc -l | tr -d ' ')
FRONTEND_AGMD_READS=$(jq -c 'select(.agent == "frontend" and .tool == "read" and (.file | test("AGENTS\\.md$")))' "$SPRINT_LOG" | wc -l | tr -d ' ')

if [[ "$FRONTEND_WRITES" -eq 0 ]]; then
  check_warn "Nenhuma escrita do agent frontend neste sprint"
elif [[ "$FRONTEND_AGMD_READS" -eq 0 ]]; then
  check_fail "Frontend fez $FRONTEND_WRITES escritas mas NÃO leu nenhum AGENTS.md"
  echo "      → Esperado: pelo menos 1 'read' em AGENTS.md antes do primeiro 'write' em src/"
else
  # Verifica ordem temporal
  FIRST_WRITE_TS=$(jq -r 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit")) | .timestamp' "$SPRINT_LOG" | head -1)
  FIRST_AGMD_TS=$(jq -r 'select(.agent == "frontend" and .tool == "read" and (.file | test("AGENTS\\.md$"))) | .timestamp' "$SPRINT_LOG" | head -1)

  if [[ -n "$FIRST_WRITE_TS" && -n "$FIRST_AGMD_TS" && "$FIRST_AGMD_TS" > "$FIRST_WRITE_TS" ]]; then
    check_fail "Primeira escrita ($FIRST_WRITE_TS) foi ANTES da primeira leitura de AGENTS.md ($FIRST_AGMD_TS)"
  else
    check_pass "Primeira leitura de AGENTS.md: $FIRST_AGMD_TS"
    check_pass "Primeira escrita em src/: $FIRST_WRITE_TS"
  fi
fi

echo ""

# ---- Check 2: grill-me gerou decision log ----
echo "🔍 Check 2: grill-me → decision log"

GRILLME_EVENTS=$(jq -c 'select(.agent == "frontend" and .skill == "grill-me" and .action == "loaded")' "$SPRINT_LOG" | wc -l | tr -d ' ')

if [[ "$GRILLME_EVENTS" -eq 0 ]]; then
  check_warn "Skill 'grill-me' não foi carregada pelo frontend (pode ser feature trivial)"
else
  check_pass "Grill-me carregado $GRILLME_EVENTS vez(es)"

  # Verifica se há decision logs
  if [[ -d "$DECISIONS_DIR" ]]; then
    LOGS_FOR_SPRINT=$(find "$DECISIONS_DIR" -name "${SPRINT_ID}-*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$LOGS_FOR_SPRINT" -eq 0 ]]; then
      check_fail "Grill-me foi usado mas NENHUM decision log encontrado em $DECISIONS_DIR/${SPRINT_ID}-*.md"
    else
      check_pass "$LOGS_FOR_SPRINT decision log(s) encontrado(s) para o sprint"
    fi
  else
    check_fail "Diretório $DECISIONS_DIR não existe"
  fi
fi

echo ""

# ---- Check 3: frontend NÃO escreveu em *.test.* ----
echo "🔍 Check 3: frontend não escreveu em *.test.* / tests/ / e2e/"

FORBIDDEN_WRITES=$(jq -c 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit") and (.file | test("\\.(test|spec)\\.(ts|tsx|js|jsx)$")))' "$SPRINT_LOG")

if [[ -n "$FORBIDDEN_WRITES" ]]; then
  COUNT=$(echo "$FORBIDDEN_WRITES" | wc -l | tr -d ' ')
  check_fail "Frontend escreveu em $COUNT arquivo(s) de teste — PROIBIDO por path-boundary"
  echo "$FORBIDDEN_WRITES" | jq -r '      → \(.file)  (em \(.timestamp))' || true
  echo "      Esperado: 0. Se foi intencional, o path-boundary deveria ter bloqueado."
else
  check_pass "Nenhuma escrita em *.test.* pelo frontend"
fi

# Verifica também em tests/, e2e/, qa/
for DIR in "tests/" "test/" "e2e/" "qa/"; do
  WRITES_IN_DIR=$(jq -c --arg d "$DIR" 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit") and (.file | startswith($d)))' "$SPRINT_LOG" | wc -l | tr -d ' ')
  if [[ "$WRITES_IN_DIR" -gt 0 ]]; then
    check_fail "Frontend escreveu em $WRITES_IN_DIR arquivo(s) sob $DIR — responsabilidade do tester"
  else
    check_pass "Nenhuma escrita em $DIR pelo frontend"
  fi
done

echo ""

# ---- Check 4: backend MANTÉM TDD (sentinela) ----
echo "🔍 Check 4: backend mantém TDD (sentinela)"

BACKEND_WRITES=$(jq -c 'select(.agent == "backend" and (.tool == "write" or .tool == "edit"))' "$SPRINT_LOG" | wc -l | tr -d ' ')
BACKEND_TEST_WRITES=$(jq -c 'select(.agent == "backend" and (.tool == "write" or .tool == "edit") and (.file | test("\\.(test|spec)\\.(ts|js)$")))' "$SPRINT_LOG" | wc -l | tr -d ' ')

if [[ "$BACKEND_WRITES" -gt 0 ]]; then
  if [[ "$BACKEND_TEST_WRITES" -eq 0 ]]; then
    check_fail "Backend fez $BACKEND_WRITES escritas mas ZERO em testes — TDD foi abandonado?"
  else
    RATIO=$(awk "BEGIN { printf \"%.0f\", ($BACKEND_TEST_WRITES / $BACKEND_WRITES) * 100 }")
    if [[ "$RATIO" -lt 30 ]]; then
      check_warn "Backend tem $BACKEND_TEST_WRITES testes para $BACKEND_WRITES arquivos (${RATIO}%) — baixo, mas não zero"
    else
      check_pass "Backend tem $BACKEND_TEST_WRITES testes para $BACKEND_WRITES arquivos (${RATIO}%)"
    fi
  fi
else
  check_warn "Nenhuma escrita do agent backend neste sprint"
fi

echo ""

# ---- Check 5: tokens consumidos em testes de frontend (métrica) ----
echo "🔍 Check 5: tokens consumidos em *.test.* pelo frontend (métrica)"

# Soma de tokens estimados (campo .tokens) em writes de teste pelo frontend
TOKENS_IN_TESTS=$(jq -r 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit") and (.file | test("\\.(test|spec)\\."))) | .tokens // 0' "$SPRINT_LOG" 2>/dev/null | awk '{s+=$1} END {print s+0}')

TOKENS_TOTAL=$(jq -r 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit")) | .tokens // 0' "$SPRINT_LOG" 2>/dev/null | awk '{s+=$1} END {print s+0}')

if [[ "$TOKENS_TOTAL" -gt 0 ]]; then
  RATIO=$(awk "BEGIN { printf \"%.1f\", ($TOKENS_IN_TESTS / $TOKENS_TOTAL) * 100 }")
  echo "  ℹ Tokens em tests/*.test.* pelo frontend: $TOKENS_IN_TESTS de $TOKENS_TOTAL total (${RATIO}%)"
  echo "    Meta: ≤5% (PRD §3.1.O8)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Resumo"
echo "═══════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Pass:${NC}  $(echo "scale=0; 5 - $FAIL - $WARN" | bc 2>/dev/null || echo "?")"
echo -e "  ${YELLOW}Warn:${NC}  $WARN"
echo -e "  ${RED}Fail:${NC}  $FAIL"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "${RED}❌ Falhou${NC} — corrija os problemas acima antes de prosseguir"
  exit 1
fi

if [[ -n "$STRICT" && "$WARN" -gt 0 ]]; then
  echo -e "${YELLOW}⚠️ Modo strict: warnings viraram falhas${NC}"
  exit 1
fi

echo -e "${GREEN}✅ OK${NC} — sprint $SPRINT_ID respeitou o protocolo context-first"
exit 0
