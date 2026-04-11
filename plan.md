# Plan

## Status
Current phase: Phase 24
Current task: 24.3 — Live CAPTCHA submission — aim for errorCode != 9

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
| 24.2 | Integrate field order detection into live-comparison | done |
| 24.3 | Live CAPTCHA submission — aim for errorCode != 9 | pending |

---

## Current Task

**ID**: 24.3
**Title**: Live CAPTCHA submission — aim for errorCode != 9
**Phase**: End-to-End Live Verification
**Status**: pending

### Goal
Submit a standalone-generated collect token + live eks to Tencent's verify endpoint via Chrome TLS. Previous attempts all got errorCode 9. With correct keyMods and field ordering, test if the token is now accepted.

### Context
- Key extraction works for live templates (proven in 24.1)
- Field diffs reduced to ~20/60 (value diffs, not ordering)
- Previous errorCode 9 causes identified: wrong XTEA key (now fixed), wrong keyMods (now fixed), wrong header split (now fixed)
- The remaining 20 value diffs are expected — they're actual fingerprint differences between our default profile and Chrome's real values
- The verify endpoint may accept tokens with minor fingerprint diffs (these are browser-specific)
- `scripts/chrome-cd-inject.js` has the full CAPTCHA solve + submit flow
- The script needs: prehandle → show → slider solve → generate collect → submit verify

### Implementation Steps
1. Update `scripts/chrome-cd-inject.js` (or create new script) with all Phase 22-23 fixes:
   - Pipeline key extraction with correct 4-element keyMods
   - Live field order detection via matchFieldOrder
   - headerSplit from header segment analysis
   - serializationDiffs detection
2. Solve the slider CAPTCHA (OpenCV)
3. Generate standalone collect with all detected params
4. Submit via Chrome's fetch() (Chrome TLS) with live eks
5. Report errorCode

### Verification
- [ ] Script runs to completion with CAPTCHA submission
- [ ] errorCode reported (target: not 9)
- [ ] If still errorCode 9: identify which remaining diff is likely the cause

### Suggested Agent
general-purpose
