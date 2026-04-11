# Plan

## Status
Current phase: Phase 22
Current task: 22.2 — Fix keyModConstants legacy format lossy serialization

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
| 22.2 | Fix keyModConstants legacy format lossy serialization | pending |
| 22.3 | Tests for key extraction fixes | pending |

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

**ID**: 22.2
**Title**: Fix keyModConstants legacy format lossy serialization
**Phase**: Reliable Key Extraction for Live Templates
**Status**: pending

### Goal
Fix the lossy `keyModConstants` serialization that drops keyMods at indices 0 and 2. The root cause (from 22.1): `keyModConstants = [keyMods[1], keyMods[3]]` only stores two of four possible indices. Round-tripping via `_normalizeEntry()` maps them back to `[0, kmc[0], 0, kmc[1]]` — always indices [1,3], silently losing any mods at [0] or [2].

### Context
Five locations need fixing:

1. **`pipeline/key-extractor.js:527-529`** — `result.keyModConstants = [keyMods[1], keyMods[3]]`. Change to store all 4: `result.keyModConstants = keyMods.slice()` or deprecate `keyModConstants` entirely in favor of `keyMods`.

2. **`scraper/template-cache.js:80-83`** — `store()` method: `keyModConstants = [keyMods[1], keyMods[3]]` and `keyMods = [0, kmc[0], 0, kmc[1]]`. Both directions are lossy.

3. **`scraper/template-cache.js:135-138`** — `seed()` method: same wrong normalization from `keyModConstants` → `keyMods`.

4. **`scraper/template-cache.js:175-178`** — `_normalizeEntry()`: same wrong pattern.

5. **`pipeline/run.js`** — `savePipelineConfig` stores the lossy `keyModConstants`. Ensure `keyMods` (4-element) is always saved.

Also: update existing `output/*/xtea-params.json` and `scraper/cache/templates.json` to include correct `keyMods` by re-running extraction on the 5 saved targets + `tdc-live-test.js`.

### Implementation Steps
1. In `key-extractor.js`: keep `keyModConstants` for backward compat but make it a direct copy of `keyMods`. Or better: change `keyModConstants` to just be `keyMods` aliased.
2. In `template-cache.js`: fix all 3 locations to use `keyMods` as the primary 4-element format. When only `keyModConstants` is available (legacy data), use it as-is if 4 elements, or pad with zeros if 2 elements BUT preserve the values at whatever positions they represent (since we can't recover the lost indices, just stop losing NEW data).
3. In `pipeline/run.js`: ensure `keyMods` (4-element) is saved to pipeline-config.json.
4. Re-run `pipeline/run.js` on all 6 targets to regenerate xtea-params.json with correct `keyMods`.
5. Regenerate `scraper/cache/templates.json` from updated pipeline outputs.

### Verification
- [ ] `node -e "..."` check: all 6 target xtea-params.json have 4-element `keyMods` with correct values
- [ ] `npm test` passes (218/220 baseline, same 2 known failures)
- [ ] `node pipeline/run.js targets/tdc.js --skip-verify` produces correct keyMods `[0, 2368517, 0, 592130]`
- [ ] `node pipeline/run.js targets/tdc-live-test.js --skip-verify` produces correct keyMods `[0, 0, 657930, 526341]`
- [ ] No code path in template-cache.js hardcodes `[0, kmc[0], 0, kmc[1]]` pattern

### Suggested Agent
general-purpose
