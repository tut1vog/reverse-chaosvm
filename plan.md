# Plan

## Status
Current phase: Phase 25
Current task: 25.1 — cdArrayOverride live test with Chrome's exact cd values

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
| 25.1 | cdArrayOverride live test with Chrome's exact cd values | pending |
| 25.2 | Analyze results and identify remaining gaps | pending |

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

**ID**: 25.1
**Title**: cdArrayOverride live test with Chrome's exact cd values
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: pending

### Goal
Modify `scripts/live-captcha-submit.js` to use `cdArrayOverride` — inject Chrome's exact decrypted cd array into the standalone token generation. This produces a token with identical cd VALUES but our standalone encryption. If the server accepts it, the only remaining work is building a realistic fingerprint profile. If it still rejects, there's a structural issue beyond cd values.

### Context
- `cdArrayOverride` option is already supported by `generateCollect()` (from Phase 17)
- When `cdArrayOverride` is set, `generateCollect` skips `buildDefaultCdArray` and `reorderCdArray`
- Chrome's cd is available from `fullDecrypt.parsed.cd` (already extracted in Step 6)
- Must strip the hash artifact before passing (hash is a separate encrypted segment)
- Must NOT include behavioral events (Chrome's pre-solve token doesn't have them)
- `live-captcha-submit.js` currently generates behavioral events — remove them for this test

### Implementation Steps
1. After decrypting Chrome's cd (Step 6), strip hash artifact at `hashPosition`
2. Set `collectOpts.cdArrayOverride = strippedCdArray`
3. Remove `behavioralEvents` from collectOpts (Chrome's pre-solve token doesn't have them)
4. Keep everything else: live eks, slider solve, vData, Chrome TLS submit
5. Compare collect sizes (should now be close to Chrome's ~4200 chars)
6. Run and report errorCode

### Verification
- [ ] Standalone collect size within ±200 chars of Chrome's collect size
- [ ] errorCode reported
- [ ] If errorCode 9: identify what else differs (sd structure? encoding?)
- [ ] If errorCode != 9: confirm Phase 25 success, move to Phase 26

### Suggested Agent
general-purpose
