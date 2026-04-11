# Plan

## Status
Current phase: Phase 24
Current task: 24.2 — Fix remaining diffs found in 24.1

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
| 24.1 | Live test: decrypt Chrome token + field-by-field comparison | done |
| 24.1.1 | Fix standalone token comparison in live-comparison.js | done |
| 24.2 | Fix remaining diffs found in 24.1 | pending |
| 24.3 | Live CAPTCHA submission — aim for errorCode != 9 | pending |

---

## Current Task

**ID**: 24.2
**Title**: Integrate structure extraction into live-comparison for reduced diffs
**Phase**: End-to-End Live Verification
**Status**: pending

### Goal
The live comparison shows 57-58/60 field diffs — ALL caused by field reordering (no `cdFieldOrder` for these templates). Integrate `extractStructure` or at least field order detection into the live-comparison script so that standalone tokens use the correct field ordering, reducing diffs to near-zero.

### Context
- `pipeline/structure-extractor.js` — `extractStructure(tdcPath, xteaParams)` runs Puppeteer to capture Chrome's cd and detect field order, hash position, serialization diffs
- But `extractStructure` needs a separate Puppeteer session — can't run inside the same session that captures the token
- Alternative: since we already have Chrome's decrypted cd array AND our default cd array, we can call `matchFieldOrder(chromeCdArray)` directly to get the field ordering, without a separate Puppeteer session
- `matchFieldOrder` is exported from `pipeline/structure-extractor.js`

### Implementation Steps
1. After decrypting Chrome's cd (step 6 in live-comparison.js), call `matchFieldOrder(chromeCdArray)` to get `cdFieldOrder`
2. Also call `detectHashPosition(chromeCdArray)` to get hash position
3. Pass `cdFieldOrder` and hash position to `generateCollect` options
4. Re-generate standalone token with correct field ordering
5. Re-run comparison — diffs should drop significantly

### Verification
- [ ] Live test shows significantly fewer field diffs (target: < 10)
- [ ] cdFieldOrder is correctly extracted from Chrome's cd array
- [ ] Hash position correctly detected

### Suggested Agent
general-purpose
