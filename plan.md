# Plan

## Status
Current phase: Phase 25
Current task: 25.5 — Strip ALL hash artifacts from Chrome's cd (not just the first)

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
| 25.5 | Strip ALL hash artifacts from Chrome's cd (not just the first) | pending |
| 25.6 | Live re-test with double hash strip + cdArrayOverride | pending |

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

**ID**: 25.5
**Title**: Strip ALL hash artifacts from Chrome's cd (not just the first)
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: pending

### Goal
Fix `detectHashPosition` to return ALL matching positions, and strip ALL `[[4,-1,-1,ts,0,0,0,0]]` entries from Chrome's cd before passing to cdArrayOverride. Currently only the first is stripped, leaving a second one that adds ~123 chars and shifts all subsequent fields.

### Context
- 25.4 found: Chrome's cd has TWO `[[4,-1,-1,ts,0,0,0,0]]` entries at different positions
- `detectHashPosition()` in `pipeline/structure-extractor.js` returns on FIRST match (line 145: `return i;`)
- In `live-captcha-submit.js` line ~489: `strippedCd.splice(hashPosition, 1)` — only removes one
- History 20.2 already noted: "Chrome[55]=hash artifact... second hash artifact at cd[55] not stripped"
- The second hash entry accounts for 123 chars of extra content in Chrome's cd
- After stripping both, the cd strings should be identical (same values, same serialization)
- Files: `pipeline/structure-extractor.js` (detectHashPosition), `scripts/live-captcha-submit.js` (stripping logic)

### Implementation Steps
1. Add `detectAllHashPositions(cdArray)` to `pipeline/structure-extractor.js` — same logic as `detectHashPosition` but returns an array of ALL matching indices instead of just the first
2. Export it alongside `detectHashPosition` (keep the original for backward compatibility)
3. In `scripts/live-captcha-submit.js`, import `detectAllHashPositions` and use it instead of `detectHashPosition` for the stripping logic
4. Strip ALL matching positions (iterate in REVERSE order to avoid index shifting issues during splice)
5. Log how many were stripped

### Verification
- [ ] `node -c pipeline/structure-extractor.js` and `node -c scripts/live-captcha-submit.js` pass
- [ ] `npm test` passes at baseline (248/250)
- [ ] `detectAllHashPositions` returns array of all matching indices (test with array containing 2 hash artifacts)

### Suggested Agent
general-purpose
