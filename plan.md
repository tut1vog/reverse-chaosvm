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
| 28.7 | Tests for standalone token interception | pending |
| 28.8 | Act on 28.6 results | pending |

---

## Current Task

**ID**: 28.7
**Title**: Tests for standalone token interception
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Write unit tests for the helper functions in `scripts/token-isolation-test.js` — specifically `replacePostField`, `buildShowUrl`, and `parseArgs`. These are testable without Puppeteer or network access.

### Context
- `scripts/token-isolation-test.js` was created in 28.6
- Key testable functions: `replacePostField(body, fieldName, newValue)`, `buildShowUrl(session, aid, userAgent)`, `parseArgs()`
- These are currently inline in the script and would need to be exported (or extracted to a shared module) for testing

### Implementation Steps
1. Refactor `scripts/token-isolation-test.js` to export the helper functions (conditionally, only when `require.main !== module`)
2. Create `tests/test-token-isolation.js` with tests for `replacePostField` and `buildShowUrl`

### Verification
- [ ] `node --test tests/test-token-isolation.js` passes
- [ ] Tests cover edge cases for `replacePostField` (field at start, middle, end, missing field, special chars)
- [ ] Tests verify `buildShowUrl` produces valid URL with expected params

### Suggested Agent
general-purpose
