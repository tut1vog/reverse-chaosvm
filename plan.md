# Plan

## Status
Current phase: Phase 28
Current task: 28.6 — Isolation test: standalone token via Puppeteer request interception

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **Status**: errorCode 9 fixed (ans correction). Now errorCode 12 on all templates.
> errorCode 12 is universal — not template-specific. Need to isolate whether the
> problem is the collect token or the transport layer (TLS/vData/POST).

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
| 28.8 | Act on 28.6 results | pending |

---

## Current Task

**ID**: 28.8
**Title**: Act on 28.6 results
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Run `scripts/token-isolation-test.js` (both `--no-swap` control and swap mode), analyze the errorCode results, and decide next steps based on whether the issue is the token or the transport layer.

### Context
- `scripts/token-isolation-test.js` is ready — created and tested in 28.6/28.7
- Requires display (headful Puppeteer) and network access to CAPTCHA service
- User needs to run the script and report results

### Verification
- [ ] Control test (`--no-swap`) returns errorCode 0
- [ ] Swap test result recorded and analyzed
- [ ] Next steps decided based on result

### Suggested Agent
Depends on result — user-driven
