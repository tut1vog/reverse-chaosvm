# Plan

## Status
Current phase: Phase 22
Current task: 22.3 — Tests for key extraction fixes

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

**ID**: 22.3
**Title**: Tests for key extraction fixes
**Phase**: Reliable Key Extraction for Live Templates
**Status**: pending

### Goal
Add tests covering the keyModConstants ↔ keyMods round-trip for all key index combinations ([0,2], [0,3], [1,2], [1,3], [2,3]), ensuring no data loss. Also test legacy 2-element format backward compatibility.

### Context
- `scraper/template-cache.js` — `store()`, `seed()`, `_normalizeEntry()` all handle 4-element and legacy 2-element formats
- `pipeline/key-extractor.js` — `analyzeTrace()` now outputs 4-element `keyModConstants`
- `pipeline/token-verifier.js` — `cipherRoundParam()` and `decryptParam()` handle both formats
- `scraper/collect-generator.js` — `normalizeKeyMods()` handles both formats
- Existing tests: `tests/test-key-extractor.js`, `tests/test-scraper-foundation.js`

### Implementation Steps
1. In `tests/test-scraper-foundation.js` or a new test file: add tests for `_normalizeEntry()` with:
   - 4-element keyModConstants → keyMods preserved exactly
   - 2-element legacy keyModConstants → maps to [0, v0, 0, v1]
   - keyMods already present → not overwritten
2. Add tests for `normalizeKeyMods()` in collect-generator with all index combinations
3. Add tests for `store()` round-trip: store with keyMods at various indices, verify lookup preserves them

### Verification
- [ ] `npm test` passes with new tests added (baseline + new, same 2 known failures)
- [ ] Tests cover all 5 observed keyMod index patterns: [0,2], [0,3], [1,2], [1,3], [2,3]
- [ ] Tests cover legacy 2-element backward compatibility

### Suggested Agent
general-purpose
