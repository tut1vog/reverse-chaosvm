# Plan

## Status
Current phase: Phase 25
Current task: 25.8 — Investigate remaining 37-54 char cd string gap + live re-test

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
| 25.8 | Investigate remaining 37-54 char cd string gap + live re-test | in-progress |

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

**ID**: 25.8
**Title**: Investigate remaining 37-54 char cd string gap + live re-test
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: in-progress

### Goal
After hash padding fix (25.7), 37-54 char cd string gap remains. Subagent reported this is from "cd/sd boundary extraction including trailing encryption padding spaces" — the Chrome cd string extracted from decrypted plaintext includes trailing padding. Investigate: is this a real content difference or just a comparison artifact? Run live re-test to see actual segment sizes.

### Context
- Hash field now matches Chrome exactly
- Remaining gap may be comparison artifact (trailing spaces from XTEA block padding in decrypted plaintext)
- If it IS an artifact: the tokens may actually be identical/near-identical now
- Need to verify via live run and check cdBody segment diff (was -8 chars in 25.6)

### Verification
- [ ] Live run with at least 2 successful attempts
- [ ] cdBody segment diff reported (should be 0 or near-0 if hash padding was the last issue)
- [ ] errorCode reported

### Suggested Agent
general-purpose
