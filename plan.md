# Plan

## Status
Current phase: Phase 28
Current task: 28.9 — Fix collect encoding: use raw base64 instead of URL-encoded in POST body swap

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
| 28.9 | Fix collect encoding: raw base64 in POST body swap | pending |
| 28.10 | Deep token diff: compare original vs standalone structure | pending |
| 28.11 | Re-run isolation test after fixes | pending |

---

## Current Task

**ID**: 28.9
**Title**: Fix collect encoding: raw base64 in POST body swap + add token length comparison logging
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Fix the encoding mismatch in `scripts/token-isolation-test.js`: the real POST body contains raw base64 collect (with literal `+`, `/`, `=`) but our standalone token is URL-encoded (`%2B`, `%2F`, `%3D`). Also add detailed logging to diagnose the 812-char length difference (original 6104 raw base64 vs standalone 5292 decoded).

### Context
- **Encoding bug**: Line 389 uses `collectEncoded` (URL-encoded form). Should use `collectDecoded` (raw base64).
- **Length gap**: Even after encoding fix, standalone token is 812 chars shorter (5292 vs 6104). This is a structural difference in the token payload, not just encoding.
- **New template**: Live server now serves TDC_NAME `SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk` with 96 opcodes — not in known templates (A=95, B=94, C=100).
- `collectDecoded` is already computed at line 373 — just needs to be used instead of `collectEncoded` at line 389.

### Implementation Steps
1. In `scripts/token-isolation-test.js`, line 389: change `collectEncoded` → `collectDecoded`
2. Update `standaloneCollectLen` to track the decoded length for fair comparison
3. Add logging: decoded lengths side-by-side for both original and standalone
4. Add logging: first 50 chars of decoded standalone vs original (both raw base64 for comparison)

### Verification
- [ ] `node -c scripts/token-isolation-test.js` passes
- [ ] `node --test tests/test-token-isolation.js` still passes (14/14)
- [ ] Code review confirms `collectDecoded` (raw base64) is used in `replacePostField` call

### Suggested Agent
general-purpose
