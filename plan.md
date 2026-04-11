# Plan

## Status
Current phase: Phase 25
Current task: 25.3 — Decrypt and diff cdBody plaintext between standalone and Chrome

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
| 25.3 | Decrypt and diff cdBody plaintext between standalone and Chrome | pending |

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

**ID**: 25.3
**Title**: Decrypt and diff cdBody plaintext between standalone and Chrome
**Phase**: Chrome cd Injection — Validate Token Structure
**Status**: pending

### Goal
The 40-52 char cdBody difference is the ONLY remaining gap between standalone and Chrome tokens. With Chrome's exact cd values (via cdArrayOverride), header/hash/sig are identical. Decrypt both cdBody segments and diff the plaintext to find exactly what serialization difference causes the gap.

### Context
- 25.2 results: header=0, hash=0, sig=0, cdBody=-40 to -52 chars
- We use Chrome's exact cd values, so the diff must be in HOW we serialize them (buildCdString in outer-pipeline.js)
- Previous Phase 19 forensics showed cdBody was IDENTICAL for Template A reference build, so the diff is template-specific
- Live templates: 94-opcode (Template B) and 98-opcode observed
- Key serialization: `token/outer-pipeline.js` `buildCdString()` — hand-rolled JSON concatenation
- The VM's func_276 does custom object serialization that may differ from our buildCdString for certain field types
- Files: `scripts/live-captcha-submit.js`, `token/outer-pipeline.js`, `token/crypto-core.js`

### Implementation Steps
1. After generating standalone collect, decrypt its cdBody segment using the same XTEA params
2. Decrypt Chrome's cdBody segment 
3. Diff the two plaintext strings char-by-char, find first divergence point
4. Log: divergence position, context around it, field index where it diverges
5. Run live and report findings

### Verification
- [ ] cdBody plaintext from both standalone and Chrome available for at least one attempt
- [ ] First divergence point identified with surrounding context
- [ ] Specific cd field or serialization pattern causing the diff identified

### Suggested Agent
general-purpose
