#!/usr/bin/env bash
# Phase 46 — lane-change survey harness.
# Runs N atomic default-path scraper invocations, one at a time, and records:
#   attempt, exit_code, errorCode (if present), ticket (if present), duration_s
# Logs go to <tag>.log (per-attempt verbose) and <tag>.jsonl (one JSON per attempt).
# Usage: run-survey.sh <tag> [N] [GAP]
#   e.g.  run-survey.sh 46.3-after-vmslide 30 0
set -u
cd "$(dirname "$0")/../.."

TAG="${1:?tag required (e.g. 46.3-after-vmslide)}"
N="${2:-30}"
GAP="${3:-0}"   # seconds to sleep between attempts (default 0 = back-to-back)
OUT_DIR="output/phase-46-errorcode-0"
LOG="${OUT_DIR}/${TAG}.log"
JSONL="${OUT_DIR}/${TAG}.jsonl"

: > "$LOG"
: > "$JSONL"

for i in $(seq 1 "$N"); do
  ts_start=$(date +%s)
  echo "=== ${TAG} attempt ${i}/${N} @ $(date -u +%FT%TZ) ===" | tee -a "$LOG"
  out=$(timeout 180 node tools/scraper/cli.js --captcha-only --verbose --retries 1 2>&1)
  rc=$?
  ts_end=$(date +%s)
  dur=$((ts_end - ts_start))
  echo "$out" >> "$LOG"
  echo "--- rc=${rc} duration=${dur}s ---" >> "$LOG"

  ec=$(echo "$out" | grep -oE 'errorCode: -?[0-9]+' | head -1 | awk '{print $2}')
  ticket=$(echo "$out" | grep -oE 'ticket: [^ ]+' | head -1 | awk '{print $2}')
  [ -z "$ec" ] && ec="null"
  [ -z "$ticket" ] && ticket_json="null" || ticket_json="\"$ticket\""

  printf '{"tag":"%s","attempt":%d,"rc":%d,"duration_s":%d,"errorCode":%s,"ticket":%s}\n' \
    "$TAG" "$i" "$rc" "$dur" "$ec" "$ticket_json" >> "$JSONL"
  echo "  → rc=${rc} errorCode=${ec} ticket=${ticket:-none} dur=${dur}s"
  if [ "$i" -lt "$N" ] && [ "$GAP" -gt 0 ]; then
    sleep "$GAP"
  fi
done
