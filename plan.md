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
> **ROOT CAUSE FOUND**: Live templates encrypt the token as a **single continuous
> XTEA blob** — NOT as 4 separately-encrypted segments concatenated together.
> Our `assembleToken()` encrypts 4 chunks independently then concatenates base64.
> The server expects one continuous ciphertext → can't decrypt ours → errorCode 12.
> Template A (reference build) uses 4 segments; live templates (95/96/98 opcodes) use 1.

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
| 28.10 | Deep token diff: compare original vs standalone structure | done |
| 28.11 | Add single-blob encryption mode to collect-generator | done |
| 28.12 | Tests for single-blob encryption mode | pending |
| 28.13 | Re-run isolation test with single-blob mode | pending |

---

## Current Task

**ID**: 28.13
**Title**: Re-run isolation test with single-blob mode
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending (user-driven — requires display + CAPTCHA service)

### Goal
Re-run the isolation test with the single-blob fix to see if errorCode 12 resolves.

### Verification
- [ ] `node scripts/token-isolation-test.js` — check errorCode
- [ ] If errorCode 0 → single-blob was the fix, proceed to integrate into scraper
- [ ] If errorCode 12 still → additional issues (field values, sd structure, field count)

### Suggested Agent
User-driven
