# Plan

## Status
Current phase: Phase 25
Current task: 25.4 — Compare pre-encryption cd strings to find serialization divergence

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
| 25.4 | Compare pre-encryption cd strings to find serialization divergence | pending |

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

**ID**: 25.4
**Title**: Compare pre-encryption cd strings to find serialization divergence
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: pending

### Goal
Compare `buildCdString(strippedCd)` output against Chrome's cd string (from `fullDecrypt.plaintext`) to find where the serialization diverges. The cdBody segment comparison showed divergence at position 0 because the total cd string is different-length (16-40 bytes shorter in standalone), shifting the header split point. We need to find WHERE in the cd string the content first diverges.

### Context
- 25.3 finding: cdBody diverges at position 0 — meaningless in isolation because the header consumes different amounts of the cd string
- The real fix: compare FULL cd strings BEFORE encryption (pre-encryption plaintext)
- Chrome's cd string = `fullDecrypt.plaintext` from Step 6 (already available, contains `{"cd":[...]},...`)
- Our cd string = `buildCdString(strippedCd, serializationOverrides)` — can be computed separately before `generateCollect()`
- `buildCdString` is in `token/outer-pipeline.js`, already imported via collect-generator
- Key: same VALUES, different SERIALIZATION → find which field serializes differently

### Implementation Steps
1. After Step 6, compute `ourCdString = buildCdString(strippedCd, serializationOverrides)` 
2. Extract Chrome's cd string from `fullDecrypt.plaintext` (it starts with `{"cd":[` and ends before the sd part)
3. Diff the two strings char-by-char, find first divergence
4. Log: position, field index, context showing what Chrome serializes differently
5. Run live and report

### Verification
- [ ] Pre-encryption cd string comparison for at least one attempt
- [ ] First divergence position and field index identified
- [ ] Specific serialization difference documented (e.g., object key ordering, array format, number format)

### Suggested Agent
general-purpose
