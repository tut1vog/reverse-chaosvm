# Plan

## Status
Current phase: Phase 23
Current task: 23.1 — Fix analyzeHeaderSplit for full-token decrypted plaintext

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
| 23.1 | Fix analyzeHeaderSplit for full-token decrypted plaintext | pending |
| 23.2 | Wire headerSplit through to buildInputChunks | pending |
| 23.3 | Tests for header split logic | pending |

### Phase 24: End-to-End Live Verification
> With reliable key extraction (Phase 22) and correct header splitting (Phase 23), run live tests to validate: cdFieldOrder produces correct reordering, serialization overrides reduce diffs, full token matches Chrome's output. Target: 0 field-level diffs on at least one live template.

| ID | Task | Status |
|----|------|--------|
| 24.1 | Live test: decrypt Chrome token + field-by-field comparison | pending |
| 24.2 | Fix remaining diffs found in 24.1 | pending |
| 24.3 | Live CAPTCHA submission — aim for errorCode != 9 | pending |

---

## Current Task

**ID**: 23.1
**Title**: Fix analyzeHeaderSplit for full-token decrypted plaintext
**Phase**: Header Split Strategy Application
**Status**: pending

### Goal
`analyzeHeaderSplit()` in `pipeline/structure-extractor.js` returns "unknown" for live templates because full-token decryption concatenates all segments (header + hash + cdBody + sig), making the cd/sd boundaries unclear. Fix the detection to correctly identify the header split point.

### Context
- `pipeline/structure-extractor.js` — `analyzeHeaderSplit(chromePlaintext)` function
- The header is always the first 144 bytes of the plaintext (padded with spaces to reach 144)
- Template A uses field-boundary split at position 133 (cd[0..10]), padded to 144
- Other templates may have different split points
- History note: from 19.5+19.6 — the fix was HEADER_FIELD_COUNT=11, split at field boundary, pad with spaces, duplicate comma at split point
- From 20.3+ — for live templates, header trimmed length IS 144 (no padding), only reference build pads

### Implementation Steps
1. Read current `analyzeHeaderSplit()` to understand why it fails
2. Fix detection: the header is decrypted as a separate segment (first 192 base64 chars = 144 bytes). When given the full concatenated plaintext, the function should look at the first 144 chars and find the last complete cd field within that span
3. Determine the strategy: if trailing spaces exist → "field-boundary" with padding; if no trailing spaces → "byte-boundary" at position 144

### Verification
- [ ] `analyzeHeaderSplit` returns a meaningful strategy (not "unknown") for test inputs
- [ ] `npm test` passes (236 total, 2 known failures)

### Suggested Agent
general-purpose
