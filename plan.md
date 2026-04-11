# Plan

## Status
Current phase: Phase 25
Current task: 25.2 — Analyze results and identify remaining gaps

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
| 25.2 | Analyze results and identify remaining gaps | in-progress |

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

**ID**: 25.2
**Title**: Analyze results and identify remaining gaps
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: in-progress

### Goal
Analyze why errorCode 9 persists with Chrome's exact cd values. The standalone collect is 248-336 chars SMALLER than Chrome's (3928 vs 4176-4264). Identify what structural differences remain between our token and Chrome's.

### Context
- 25.1 results: cdArrayOverride works, standalone collect ~3928, Chrome ~4200, diff -248 to -336
- Standalone is SMALLER — something Chrome includes is missing from ours
- Candidates: hash segment size, sig segment, sd serialization, header content
- Previous forensics (Phase 19) showed segments are IDENTICAL for Template A reference build
- Live templates may have different segment structures
- Key files: `scripts/live-captcha-submit.js`, `scraper/collect-generator.js`, `token/generate-token.js`, `token/outer-pipeline.js`

### Implementation Steps
1. Add per-segment size logging to live-captcha-submit.js (header, hash, cdBody, sig sizes in base64 chars)
2. Decrypt Chrome's token into individual segments and log their sizes
3. Compare segment-by-segment: which segment is smaller in standalone?
4. Report findings

### Verification
- [ ] Per-segment size comparison available for at least one live attempt
- [ ] Root cause of 248-336 char gap identified (which segment differs and by how much)
- [ ] Actionable next step proposed based on findings

### Suggested Agent
general-purpose
