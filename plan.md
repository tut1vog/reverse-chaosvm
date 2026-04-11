# Plan

## Status
Current phase: Phase 24
Current task: 24.1 — Live test: decrypt Chrome token + field-by-field comparison

---

## Phases

### Phases 1-20: Foundation through Live Template Investigation (all done)

### Phase 21: Automated Template Structure Extraction (done)
> Built `pipeline/structure-extractor.js` (Stage 5). Extracts hash position, field order, serialization diffs, header split from any tdc.js build. Integrated into pipeline, template cache, and token generation flow. 218/220 tests.

### Phase 22: Reliable Key Extraction for Live Templates
> The pipeline extracts correct keys from saved tdc.js files but fails ~50% of the time on live templates. Root cause: `analyzeTrace()` produces `keyMods: [0,0]` for some templates, and stale cached keys don't match rotated TDC_NAMEs. Until key extraction works reliably for ANY live template, nothing else can be validated.

| ID | Task | Status |
|----|------|--------|
| 22.1 | Diagnose key extraction failures on live templates | done |
| 22.2 | Fix keyModConstants legacy format lossy serialization | done |
| 22.3 | Tests for key extraction fixes | done |

### Phase 23: Header Split Strategy Application
> `analyzeHeaderSplit()` returns "unknown" for live templates because full-token decryption scrambles segment boundaries. The extracted `headerSplit` is stored in cache but never applied in `buildInputChunks()`. Fix detection and wire the strategy through to token generation.

| ID | Task | Status |
|----|------|--------|
| 23.1 | Fix analyzeHeaderSplit for full-token decrypted plaintext | done |
| 23.2 | Wire headerSplit through to buildInputChunks | done |
| 23.3 | Tests for header split logic | done |

### Phase 24: End-to-End Live Verification
> With reliable key extraction (Phase 22) and correct header splitting (Phase 23), run live tests to validate: cdFieldOrder produces correct reordering, serialization overrides reduce diffs, full token matches Chrome's output. Target: 0 field-level diffs on at least one live template.

| ID | Task | Status |
|----|------|--------|
| 24.1 | Live test: decrypt Chrome token + field-by-field comparison | pending |
| 24.2 | Fix remaining diffs found in 24.1 | pending |
| 24.3 | Live CAPTCHA submission — aim for errorCode != 9 | pending |

---

## Current Task

**ID**: 24.1
**Title**: Live test: decrypt Chrome token + field-by-field comparison
**Phase**: End-to-End Live Verification
**Status**: pending

### Goal
Run a live test against Tencent's CAPTCHA service: capture Chrome's collect token, extract XTEA key from the live tdc.js via pipeline, decrypt Chrome's token, generate a standalone token with all fixes (keyMods, headerSplit, serialization overrides, cdFieldOrder), and compare field-by-field. Target: identify any remaining diffs.

### Context
- Phase 22 fixed keyMods extraction (no more lossy serialization)
- Phase 23 fixed headerSplit detection and wired it through
- `scripts/chrome-cd-inject.js` — existing live test script with pipeline key extraction
- `scripts/token-forensics.js` — forensic comparison script
- All previous live tests failed because of stale keys or wrong keyMods

### Implementation Steps
1. Update `scripts/chrome-cd-inject.js` (or create a new focused script) to:
   a. Fetch live tdc.js, save source to temp file
   b. Run pipeline: vm-parser → opcode-mapper → key-extractor → structure-extractor
   c. Extract all params: key, keyMods, headerSplit, cdFieldOrder, serializationDiffs
   d. Capture Chrome's collect token (TDC.getData)
   e. Decrypt Chrome's token with extracted params
   f. Generate standalone token with same params
   g. Compare field-by-field: header, hash, cdBody, sig segments
2. Output results to `output/live-comparison.json`

### Verification
- [ ] Script runs to completion without errors
- [ ] Chrome token decrypts to valid JSON (proves key extraction works for live template)
- [ ] Field-by-field diff output shows which fields match/differ
- [ ] Report generated at `output/live-comparison.json`

### Suggested Agent
general-purpose
