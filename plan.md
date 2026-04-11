# Plan

## Status
Current phase: Phase 23
Current task: 23.2 — Wire headerSplit through to buildInputChunks

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

**ID**: 23.2
**Title**: Wire headerSplit through to buildInputChunks
**Phase**: Header Split Strategy Application
**Status**: pending

### Goal
The extracted `headerSplit` is stored in the template cache but never used by `buildInputChunks()` in `token/generate-token.js`. Wire the headerSplit strategy through the token generation path so that:
- "field-boundary" strategy: split at `contentLength`, pad to 144 with spaces
- "byte-boundary" strategy: split at position 144 (current default behavior)

### Context
- `token/generate-token.js` lines 100-136: `buildInputChunks()` — currently always does byte-boundary split at 144
- `scraper/collect-generator.js`: calls `generateToken()` from `token/generate-token.js` — passes options
- `scraper/template-cache.js`: cache entries have `headerSplit: { strategy, contentLength, paddingLength }`
- History from 19.5+19.6: Template A needs field-boundary split at 133 (11 fields), pad to 144
- History from 20.3+: live templates have byte-boundary split (no padding, content fills all 144 bytes)

### Implementation Steps
1. Add `headerSplit` option to `buildInputChunks()` in `token/generate-token.js`
2. When `headerSplit.strategy === 'field-boundary'`: split at `headerSplit.contentLength`, pad with spaces to 144
3. When `headerSplit.strategy === 'byte-boundary'` or absent: current behavior (split at 144)
4. Pass `headerSplit` from template cache through `scraper/collect-generator.js` → `generateCollect` → `generateToken` → `buildInputChunks`
5. Also pass through `scraper/scraper.js` if it calls generateCollect

### Verification
- [ ] `npm test` passes (237 total, 2 known failures)
- [ ] `buildInputChunks` with field-boundary option produces header with trailing spaces
- [ ] `buildInputChunks` without option produces current default behavior (no regression)

### Suggested Agent
general-purpose
