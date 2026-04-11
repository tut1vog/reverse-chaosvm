# Plan

## Status
Current phase: Phase 25
Current task: 25.10 — Forward Chrome's exact encrypted token to verify genuine tokens work

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
| 25.2 | Analyze results — per-segment size comparison | done |
| 25.3 | Decrypt and diff cdBody plaintext between standalone and Chrome | done |
| 25.4 | Compare pre-encryption cd strings to find serialization divergence | done |
| 25.5 | Strip ALL hash artifacts from Chrome's cd (not just the first) | done |
| 25.6 | Keep full Chrome cd array in cdArrayOverride (no hash stripping) | done |
| 25.7 | Pad hash field in buildCdString to match Chrome's space-padded format | done |
| 25.8 | Fix segment parsing + live re-test | done |
| 25.9 | Fix cd string comparison to exclude sig content from Chrome plaintext | pending |
| 25.10 | Forward Chrome's exact encrypted token to verify genuine tokens work | pending |

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

**ID**: 25.10
**Title**: Forward Chrome's exact encrypted token to verify genuine tokens work
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: pending

### Goal
Before debugging further cdBody differences, verify that a GENUINE Chrome-generated token actually passes validation. Capture Chrome's encrypted collect from `TDC.getData(true)`, use Chrome's real eks, and submit both as-is to the verify endpoint. If this also returns errorCode 9, the issue is NOT our token generation at all — it's the CAPTCHA solve (slider offset, timing, etc.) or some other protocol issue.

### Context
- Phase 25 narrowed token diffs to 32-byte cdBody content difference
- But we don't know if errorCode 9 is from token mismatch or from bad slider solve
- The slider solve uses OpenCV (rawOffset * ratio + calibration) which may be inaccurate
- If Chrome's OWN token fails → the problem is elsewhere (solve accuracy, vData, timing)
- If Chrome's OWN token passes → we need byte-identical token generation

### Implementation Steps
1. Create a minimal script that:
   a. Navigates to CAPTCHA page
   b. Solves the slider via OpenCV
   c. Captures Chrome's collect from TDC.getData(true) — use this DIRECTLY, no decryption/reconstruction
   d. Captures Chrome's eks from TDC.getInfo().info
   e. Generates vData via Chrome
   f. Submits verify POST via Chrome fetch with Chrome's exact collect + eks
2. Run and report errorCode

### Verification
- [ ] Chrome's own collect + eks submitted as-is
- [ ] errorCode reported
- [ ] If errorCode 9: problem is slider solve or protocol, not token
- [ ] If errorCode 0: genuine token works, need byte-identical generation

### Suggested Agent
general-purpose
