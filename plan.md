# Plan

## Status
Current phase: Phase 25
Current task: 25.7 — Pad hash field in buildCdString to match Chrome's space-padded format

---

## Phases

### Phases 1-21: Foundation through Automated Structure Extraction (all done)

### Phase 22: Reliable Key Extraction for Live Templates (done)
> Fixed lossy keyModConstants serialization. `analyzeTrace()` was always correct — the bug was `keyModConstants = [keyMods[1], keyMods[3]]` dropping indices 0 and 2. Now lossless 4-element everywhere. 18 new tests.

### Phase 23: Header Split Strategy Application (done)
> Per-segment header decryption preserves trailing spaces. `analyzeHeaderSplit` detects field-boundary vs byte-boundary. Wired through buildInputChunks. 13 new tests.

### Phase 24: End-to-End Live Verification (done)
> Live key extraction works for ALL templates. Live field order detection reduces diffs 58→20. CAPTCHA submission: errorCode 9 persists. Root cause: standalone tokens 3x larger than Chrome's due to `behavioralEvents` bloating the cd string (Chrome's TDC.getData captures BEFORE slider interaction, so no behavioral events). Token structure is correct.

### Phase 25: Chrome cd Injection — Validate Token Structure
> Use Chrome's exact cd values (cdArrayOverride) to generate a size-matched standalone token, isolating whether the errorCode 9 is caused by cd VALUE differences or by remaining structural issues (encryption, segment layout, sd format). If cdArrayOverride + standalone encryption passes → cd values are the only remaining gap. If it still fails → structural issue remains.

| ID | Task | Status |
|----|------|--------|
| 25.1 | cdArrayOverride live test with Chrome's exact cd values | done |
| 25.2 | Analyze results and identify remaining gaps | done |
| 25.3 | Decrypt and diff cdBody plaintext between standalone and Chrome | done |
| 25.4 | Compare pre-encryption cd strings to find serialization divergence | done |
| 25.5 | Strip ALL hash artifacts from Chrome's cd (not just the first) | done |
| 25.6 | Keep full Chrome cd array in cdArrayOverride (no hash stripping) | done |
| 25.7 | Pad hash field in buildCdString to match Chrome's space-padded format | pending |
| 25.8 | Live re-test with hash padding fix | pending |

### Phase 26: Realistic Fingerprint Profile
> If Phase 25 confirms that Chrome's exact cd values pass, build a more realistic default profile that matches Chrome's typical value sizes. Key areas: strip/truncate oversized fields (plugin lists, font lists, canvas data), remove behavioral events from pre-solve token, match Chrome's sd structure.

| ID | Task | Status |
|----|------|--------|
| 26.1 | Capture and catalog Chrome's actual fingerprint values across sessions | pending |
| 26.2 | Build trimmed default profile matching Chrome's typical sizes | pending |
| 26.3 | Tests for profile trimming | pending |
| 26.4 | Live CAPTCHA re-test with trimmed profile | pending |

### Phase 27: VM Parser Extension for New Templates
> Live server serves templates the VM parser can't handle: 199K-char packed bootstrapper format (`BGDfWkdQ...`) and missing `thisCtx` variable identification. Extend `pipeline/vm-parser.js` to handle these formats.

| ID | Task | Status |
|----|------|--------|
| 27.1 | Diagnose VM parser failures for new template formats | pending |
| 27.2 | Extend vm-parser for packed bootstrapper format | pending |
| 27.3 | Tests for parser extensions | pending |

---

## Current Task

**ID**: 25.7
**Title**: Pad hash field in buildCdString to match Chrome's space-padded format
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: pending

### Goal
Chrome's VM pads the hash field `[[4,-1,-1,ts,0,0,0,0]]` with trailing spaces when serializing it as a cd field. Our `buildCdString` uses `JSON.stringify(entry)` which produces compact output (no spaces). This causes an -88 char gap in the cd string. Fix `buildCdString` to detect and pad hash-like fields.

### Context
- 25.6 result: keeping full 60-field cd reduced cdBody gap to -8 chars, but cd string still -88 chars shorter
- Hash chunk (separate segment) is padded to 48 bytes (`buildHashChunk` in generate-token.js)
- Hash in cd string: Chrome likely pads similarly (to a fixed width like 56 chars)
- buildCdString is in `token/outer-pipeline.js` line 61
- The hash pattern: single-element array containing an 8-element array `[4,-1,-1,any,0,0,0,0]`
- Need to determine exact padding width from Chrome's decrypted cd string

### Implementation Steps
1. First: add logging to live-captcha-submit.js to print Chrome's raw serialization of the hash field (extract the exact chars from `fullDecrypt.plaintext` at the hash position)
2. Determine padding width from Chrome's output
3. Update `buildCdString` in `token/outer-pipeline.js` to detect hash-like entries and pad to matching width
4. Run live and verify cd string gap is 0

### Verification
- [ ] Chrome's exact hash field serialization captured and padding width determined
- [ ] buildCdString pads hash fields to correct width
- [ ] cd string length diff is 0 or near-0
- [ ] npm test passes (248/250)

### Suggested Agent
general-purpose
