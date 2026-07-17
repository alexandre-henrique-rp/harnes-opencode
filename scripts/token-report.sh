#!/usr/bin/env bash
#
# token-report.sh
#
# Gera relatório de uso de tokens/custo por sprint e agent, lendo o
# audit log gerado pelo audit-logger plugin.
#
# Uso:
#   ./scripts/token-report.sh [sprint-id] [--json] [--by-skill]
#
# Saída: tabela formatada OU JSON (com --json)
#
# Dependências: jq, node

set -euo pipefail

SPRINT_ID="${1:-}"
JSON_MODE=""
BY_SKILL=""

if [[ "${2:-}" == "--json" ]]; then JSON_MODE="--json"; fi
if [[ "${2:-}" == "--by-skill" ]] || [[ "${3:-}" == "--by-skill" ]]; then BY_SKILL="true"; fi

AUDIT_LOG="${AUDIT_LOG:-.harness/audit.log}"

if [[ ! -f "$AUDIT_LOG" ]]; then
  echo "❌ Audit log não encontrado em $AUDIT_LOG" >&2
  echo "   Defina AUDIT_LOG=/caminho/para/audit.log" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "❌ 'jq' não está instalado." >&2
  exit 1
fi

# Filtra eventos model.complete (únicos com usage real)
SPRINT_FILTER="."
if [[ -n "$SPRINT_ID" ]]; then
  SPRINT_FILTER="select(.sprint == \"$SPRINT_ID\")"
fi

EVENTS=$(jq -c "$SPRINT_FILTER | select(.tool == \"model.complete\" and .usage != null)" "$AUDIT_LOG" 2>/dev/null || {
  echo "❌ Falha ao parsear $AUDIT_LOG" >&2
  exit 1
})

TOTAL_EVENTS=$(echo "$EVENTS" | grep -c "model.complete" || echo "0")

if [[ "$TOTAL_EVENTS" -eq 0 ]]; then
  echo "ℹ️  Nenhum evento model.complete encontrado"
  if [[ -n "$SPRINT_ID" ]]; then
    echo "   Sprint: $SPRINT_ID"
  else
    echo "   (talvez precise rodar o harness primeiro pra gerar dados)"
  fi
  exit 0
fi

# Calcula totais
TOTAL=$(echo "$EVENTS" | jq -s '{
  input: (map(.usage.input // 0) | add // 0),
  output: (map(.usage.output // 0) | add // 0),
  cacheRead: (map(.usage.cacheRead // 0) | add // 0),
  cacheWrite: (map(.usage.cacheWrite // 0) | add // 0),
  costUsd: (map(.costUsd // 0) | add // 0),
  calls: length
}')

# Header
if [[ -z "$JSON_MODE" ]]; then
  echo "═══════════════════════════════════════════════════════════════════════"
  echo "  Token Usage Report"
  if [[ -n "$SPRINT_ID" ]]; then
    echo "  Sprint: $SPRINT_ID"
  else
    echo "  All sprints"
  fi
  echo "═══════════════════════════════════════════════════════════════════════"
  echo ""
fi

# Total row
TOTAL_INPUT=$(echo "$TOTAL" | jq '.input')
TOTAL_OUTPUT=$(echo "$TOTAL" | jq '.output')
TOTAL_CACHE_READ=$(echo "$TOTAL" | jq '.cacheRead')
TOTAL_CACHE_WRITE=$(echo "$TOTAL" | jq '.cacheWrite')
TOTAL_COST=$(echo "$TOTAL" | jq '.costUsd')
TOTAL_CALLS=$(echo "$TOTAL" | jq '.calls')
TOTAL_PROMPT=$((TOTAL_INPUT + TOTAL_CACHE_READ + TOTAL_CACHE_WRITE))

if [[ -n "$JSON_MODE" ]]; then
  echo "$TOTAL"
  exit 0
fi

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}📊 Totals${NC}"
printf "  %-20s %s\n" "Calls:" "$TOTAL_CALLS"
printf "  %-20s %s\n" "Input tokens:" "$TOTAL_INPUT"
printf "  %-20s %s\n" "Output tokens:" "$TOTAL_OUTPUT"
printf "  %-20s %s\n" "Cache read:" "$TOTAL_CACHE_READ"
printf "  %-20s %s\n" "Cache write:" "$TOTAL_CACHE_WRITE"

if [[ "$TOTAL_INPUT" -gt 0 ]]; then
  CACHE_RATIO=$(awk "BEGIN { printf \"%.1f\", ($TOTAL_CACHE_READ / ($TOTAL_INPUT + $TOTAL_CACHE_READ)) * 100 }")
  if (( $(echo "$CACHE_RATIO < 30" | bc -l) )); then
    CACHE_COLOR="$RED"
    CACHE_VERDICT="⚠️  low — check prompt-cache-prefixer"
  elif (( $(echo "$CACHE_RATIO < 60" | bc -l) )); then
    CACHE_COLOR="$YELLOW"
    CACHE_VERDICT="moderate"
  else
    CACHE_COLOR="$GREEN"
    CACHE_VERDICT="✓ good"
  fi
  printf "  %-20s ${CACHE_COLOR}%s%%${NC} (%s)\n" "Cache hit ratio:" "$CACHE_RATIO" "$CACHE_VERDICT"
fi

printf "  %-20s ${CYAN}\$%s${NC}\n" "Est. cost:" "$TOTAL_COST"
echo ""

# By agent
echo -e "${BOLD}🤖 By agent${NC}"
echo "$EVENTS" | jq -s -r '
  group_by(.agent) | .[] |
  {
    agent: .[0].agent,
    calls: length,
    input: (map(.usage.input // 0) | add),
    output: (map(.usage.output // 0) | add),
    cacheRead: (map(.usage.cacheRead // 0) | add),
    cost: (map(.costUsd // 0) | add),
    avgIn: ((map(.usage.input // 0) | add) / length)
  } |
  "\(.agent)\t\(.calls)\t\(.input)\t\(.output)\t\(.cacheRead)\t\(.cost)\t\(.avgIn)"
' | sort -t$'\t' -k6 -nr | awk -F'\t' -v GREEN="$GREEN" -v YELLOW="$YELLOW" -v RED="$RED" -v NC="$NC" '
BEGIN {
  printf "  %-15s %8s %12s %12s %12s %10s %12s\n", "agent", "calls", "input", "output", "cache_read", "cost", "avg_in/call"
  print "  -----------------------------------------------------------------------------------------------"
}
{
  printf "  %-15s %8s %12s %12s %12s $%-9s %12s\n", $1, $2, $3, $4, $5, $6, $7
}'
echo ""

# By skill (if requested)
if [[ -n "$BY_SKILL" ]]; then
  echo -e "${BOLD}🎯 By skill${NC}"
  echo "$EVENTS" | jq -s -r '
    group_by(.skill // "(no skill)") | .[] |
    {
      skill: .[0].skill // "(no skill)",
      calls: length,
      input: (map(.usage.input // 0) | add),
      output: (map(.usage.output // 0) | add),
      cost: (map(.costUsd // 0) | add)
    } |
    "\(.skill)\t\(.calls)\t\(.input)\t\(.output)\t\(.cost)"
  ' | sort -t$'\t' -k3 -nr | awk -F'\t' '
BEGIN {
  printf "  %-30s %8s %12s %12s %10s\n", "skill", "calls", "input", "output", "cost"
  print "  --------------------------------------------------------------------------------"
}
{
  printf "  %-30s %8s %12s %12s $%s\n", $1, $2, $3, $4, $5
}'
  echo ""
fi

# Anomalies
echo -e "${BOLD}🚨 Anomalies${NC}"
ANOMALIES_FOUND=0

# High-cost agent
HIGH_COST_AGENT=$(echo "$EVENTS" | jq -s -r '
  group_by(.agent) | .[] |
  {
    agent: .[0].agent,
    cost: (map(.costUsd // 0) | add)
  } |
  select(.cost > 1.0) |
  "\(.agent) ($\(.cost))"
' | head -1 || echo "")

if [[ -n "$HIGH_COST_AGENT" ]]; then
  echo -e "  ${RED}•${NC} High-cost agent: $HIGH_COST_AGENT (> \$1.00)"
  ANOMALIES_FOUND=1
fi

# Low cache hit
if [[ "$TOTAL_INPUT" -gt 0 ]]; then
  CACHE_RATIO_NUM=$(awk "BEGIN { printf \"%.0f\", ($TOTAL_CACHE_READ / ($TOTAL_INPUT + $TOTAL_CACHE_READ)) * 100 }")
  if [[ "$CACHE_RATIO_NUM" -lt 30 ]] && [[ $TOTAL_INPUT -gt 50000 ]]; then
    echo -e "  ${RED}•${NC} Low cache hit ratio: ${CACHE_RATIO_NUM}% (target: >60%)"
    echo -e "      ${YELLOW}→${NC} Verifique se prompt-cache-prefixer está ativo e reordenando prefix"
    ANOMALIES_FOUND=1
  fi
fi

# High avg input per call
HIGH_AVG=$(echo "$EVENTS" | jq -s -r '
  [.[] | .usage.input // 0] | add / length
')
if (( $(echo "$HIGH_AVG > 50000" | bc -l) )); then
  echo -e "  ${RED}•${NC} High avg input per call: $(printf "%.0f" $HIGH_AVG) tokens (target: <30k)"
  echo -e "      ${YELLOW}→${NC} Considere: context-compressor, AGENTS.md per-folder mais enxuto, sub-agents"
  ANOMALIES_FOUND=1
fi

# Test files written by frontend (anti-pattern)
if [[ -f "$AUDIT_LOG" ]]; then
  TEST_WRITES_BY_FRONTEND=$(jq -c 'select(.agent == "frontend" and (.tool == "write" or .tool == "edit") and (.file | test("\\.(test|spec)\\.")))' "$AUDIT_LOG" | wc -l | tr -d ' ')
  if [[ "$TEST_WRITES_BY_FRONTEND" -gt 0 ]]; then
    echo -e "  ${RED}•${NC} Frontend wrote $TEST_WRITES_BY_FRONTEND test files (should be 0)"
    echo -e "      ${YELLOW}→${NC} Verifique se path-boundary.ts está ativo"
    ANOMALIES_FOUND=1
  fi
fi

if [[ $ANOMALIES_FOUND -eq 0 ]]; then
  echo -e "  ${GREEN}✓${NC} No anomalies detected"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════════"
echo -e "  Total estimated cost: ${CYAN}\$${TOTAL_COST}${NC}"
echo "═══════════════════════════════════════════════════════════════════════"
