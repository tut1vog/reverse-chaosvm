#!/usr/bin/env bash
# Phase 45.6 — A/B errorCode 12 survey harness.
# Runs N atomic scraper invocations per arm, one at a time, and records:
#   attempt, exit_code, errorCode (if present), ticket (if present), duration_s
# Logs go to <arm>.log (per-attempt verbose) and <arm>.jsonl (one JSON per attempt).
set -u
cd "$(dirname "$0")/../.."

ARM="${1:?arm (default|legacy) required}"
N="${2:-30}"
OUT_DIR="output/phase-45-errorcode-12-survey"
LOG="${OUT_DIR}/${ARM}.log"
JSONL="${OUT_DIR}/${ARM}.jsonl"

EXTRA=()
if [ "$ARM" = "legacy" ]; then
  EXTRA=(--legacy-vdata)
fi

: > "$LOG"
: > "$JSONL"

for i in $(seq 1 "$N"); do
  ts_start=$(date +%s)
  echo "=== ${ARM} attempt ${i}/${N} @ $(date -u +%FT%TZ) ===" | tee -a "$LOG"
  out=$(timeout 180 node tools/scraper/cli.js --captcha-only --verbose --retries 1 "${EXTRA[@]}" 2>&1)
  rc=$?
  ts_end=$(date +%s)
  dur=$((ts_end - ts_start))
  echo "$out" >> "$LOG"
  echo "--- rc=${rc} duration=${dur}s ---" >> "$LOG"

  ec=$(echo "$out" | grep -oE 'errorCode: [0-9]+' | head -1 | awk '{print $2}')
  ticket=$(echo "$out" | grep -oE 'ticket: [^ ]+' | head -1 | awk '{print $2}')
  [ -z "$ec" ] && ec="null"
  [ -z "$ticket" ] && ticket="null"
  [ "$ticket" != "null" ] && ticket="\"$ticket\""
  [ "$ec" = "null" ] || ec="$ec"

  printf '{"arm":"%s","attempt":%d,"rc":%d,"duration_s":%d,"errorCode":%s,"ticket":%s}\n' \
    "$ARM" "$i" "$rc" "$dur" "$ec" "$ticket" >> "$JSONL"
  echo "  → rc=${rc} errorCode=${ec} ticket=${ticket} dur=${dur}s"
done
