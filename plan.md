# Plan

## Status
Current phase: Phase 22
Current task: 22.1 — Diagnose key extraction failures on live templates

---

## Phases

### Phases 1-20: Foundation through Live Template Investigation (all done)

### Phase 21: Automated Template Structure Extraction (done)
> Built `pipeline/structure-extractor.js` (Stage 5). Extracts hash position, field order, serialization diffs, header split from any tdc.js build. Integrated into pipeline, template cache, and token generation flow. 218/220 tests.

### Phase 22: Reliable Key Extraction for Live Templates
> The pipeline extracts correct keys from saved tdc.js files but fails ~50% of the time on live templates. Root cause: `analyzeTrace()` produces `keyMods: [0,0]` for some templates, and stale cached keys don't match rotated TDC_NAMEs. Until key extraction works reliably for ANY live template, nothing else can be validated.

| ID | Task | Status |
|----|------|--------|
| 22.1 | Diagnose key extraction failures on live templates | pending |
| 22.2 | Fix analyzeTrace for all key derivation patterns | pending |
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

**ID**: 22.1
**Title**: Diagnose key extraction failures on live templates
**Phase**: Reliable Key Extraction for Live Templates
**Status**: pending

### Goal
Understand WHY `analyzeTrace()` produces `keyMods: [0,0]` for some live templates when it works perfectly for saved files. The extracted BASE KEY is correct (decryption with [0,0,0,0] keyMods produces something, just not valid JSON) — the issue is specifically in Phase 4 (keyMod detection) of `analyzeTrace()`.

### What we know
From history:
- Pipeline extraction on SAVED files works: `tdc-live-test.js` (94 opcodes) → keyMods `[0, 0, 657930, 526341]` ✓
- Pipeline extraction on LIVE templates often fails: `KhaJbXNVBBaBOAalQnkbOEZmGXAAcmFh` → keyMods `[0, 0]` ✗
- In-page instrumentation (Phase 18.4-18.5) produced same wrong result → NOT an environment issue
- keyMods on ANY indices observed: [0+3], [1+3], [2+3] all seen
- 96-opcode template `SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk` DID extract correctly: keyMods `[1052701, 0, 0, 1644806]`

**Two separate failure modes:**
1. **Wrong key entirely**: Stale cached key used for rotated TDC_NAME → decryption produces garbage
2. **Correct base key, wrong keyMods**: analyzeTrace finds the 4 key values but fails to find ADD_K ops with matching srcVal → keyMods all zero

### Approach
1. Capture a live tdc.js where key extraction fails (save to `targets/tdc-diag.js`)
2. Run pipeline on it with verbose trace output — dump the actual trace ops around the cipher region
3. Examine the trace to understand:
   - Are ADD_K ops present but with different srcVal patterns?
   - Is the srcVal comparison failing (unsigned vs signed)?
   - Are keyMods applied at a different point in the cipher (not via ADD_K)?
   - Is the cipher window (firstDeltaIdx ± 50) too narrow?
4. Compare trace structure between a working template and a failing one

### Context
- `pipeline/key-extractor.js` lines 479-536 — Phase 4 (keyMod detection)
- `pipeline/key-extractor.js` lines 415-474 — Phase 3 (base key extraction)
- `pipeline/key-extractor.js` lines 100-197 — instrumentation code
- `pipeline/key-extractor.js` lines 226-322 — Puppeteer trace collection

### Verification
- [ ] Identified root cause of keyMods [0,0] for failing templates
- [ ] Documented the difference between working and failing trace structures
- [ ] Proposed specific fix for analyzeTrace

### Suggested Agent
general-purpose
