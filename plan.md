# Plan

## Status
Current phase: Phase 28
Current task: 28.10 — Deep token diff: compare original vs standalone structure

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **Status**: Isolation test (28.6) confirmed token is broken (errorCode 12 on swap).
> Two issues found: (1) encoding mismatch — our token uses `%2B/%2F/%3D` but the
> real POST body uses raw `+/=/` base64; (2) length mismatch — original 6104 vs
> standalone 5628 chars, suggesting structural differences beyond encoding.
> New template observed: TDC_NAME `SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk` (96 opcodes).

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | done |
| 28.4 | Tests for ans computation | done |
| 28.5 | Investigate errorCode -1 and 12 | done (12 is universal, not template-specific) |
| 28.6 | Isolation test: standalone token via Puppeteer request interception | done |
| 28.7 | Tests for standalone token interception | done |
| 28.8 | Act on 28.6 results | done |
| 28.9 | Fix collect encoding: raw base64 in POST body swap | done |
| 28.10 | Deep token diff: compare original vs standalone structure | in-progress |
| 28.11 | Re-run isolation test after fixes | pending |

---

## Current Task

**ID**: 28.10
**Title**: Deep token diff: compare original vs standalone structure
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: in-progress

### Goal
Understand WHY the standalone token is 812 chars shorter than the real one. Both should be raw base64 from the same XTEA encryption pipeline. The length gap suggests structural differences in the payload (different collector fields, missing behavioral events, different segment assembly). Need to decrypt both tokens and compare segment-by-segment.

### Context
- The isolation test captures the original POST body including the real collect field
- We can modify the test to also dump both tokens to files for offline comparison
- `scripts/decrypt-collect.js` or `docs/TOKEN_DECRYPTION.md` may help decode tokens
- New template has 96 opcodes — possibly different collector field count or order
- Key question: is the length gap from (a) missing/different collector fields, (b) missing behavioral events, (c) different segment sizes, or (d) different encryption params?

### Implementation Steps
1. Modify `token-isolation-test.js` to dump both tokens (original and standalone) to `output/token-isolation/` as JSON
2. Create a comparison script that decrypts both and shows segment-by-segment diff
3. Or: add inline comparison logging to the isolation test itself

### Verification
- [ ] Both tokens dumped and decrypted
- [ ] Root cause of 812-char length difference identified

### Suggested Agent
general-purpose
