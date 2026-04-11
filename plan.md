# Plan

## Status
Current phase: Phase 30
Current task: 30.2 — Tests for 30.1 changes

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve — Token Isolation (done)
> Standalone token accepted by server (errorCode 0) via Puppeteer request interception.

### Phase 29: Cache Refresh & TLS Verification (done)
> All 10 templates refreshed. cap_union_new_show 403 was missing sess, not TLS.
> Full headless flow confirmed possible.

### Phase 30: Puppeteer-Free Domain Query
> Make `node scraper/cli.js --verbose https://example.com` work end-to-end
> with zero Puppeteer/browser dependency. Only Node.js + Python (OpenCV).

| ID | Task | Status |
|----|------|--------|
| 30.1 | Add singleBlob to scraper generateCollect call | done |
| 30.2 | Tests for 30.1 changes | pending |
| 30.3 | Live end-to-end headless test (`scraper/cli.js --captcha-only`) | pending |
| 30.4 | Act on 30.3 results — fix any remaining issues | pending |
| 30.5 | Full domain query test (`scraper/cli.js --verbose https://example.com`) | pending |

---

## Current Task

**ID**: 30.2
**Title**: Tests for 30.1 changes
**Phase**: Puppeteer-Free Domain Query
**Status**: pending

### Goal
Add tests verifying that the scraper's `generateCollect()` call includes `singleBlob: true` and that the resulting token is in single-blob format.

### Context

Task 30.1 added `singleBlob: true` at line 419 of `scraper/scraper.js`. The existing test file `tests/test-scraper-foundation.js` already has tests for `collect-generator.js` (including cdArrayOverride tests from task 17.2). New tests should go there.

The `generateCollect()` function is exported from `scraper/collect-generator.js`. When `singleBlob: true` is passed, it produces a single encrypted blob instead of a 4-segment `A|B|C|D` token. The test should call `generateCollect()` with and without `singleBlob` and verify the output format differs (single-blob has no `|` separators).

Key files:
- `scraper/collect-generator.js` — the function under test
- `tests/test-scraper-foundation.js` — where to add tests
- `scraper/cache/` — contains XTEA params JSON files for test fixtures

### Implementation Steps
1. Read `tests/test-scraper-foundation.js` to understand existing test structure
2. Add a describe block for singleBlob behavior with tests:
   - `generateCollect` with `singleBlob: true` produces output without `|` separators
   - `generateCollect` without `singleBlob` produces output with `|` separators
   - Both outputs decode as valid base64
3. Use existing profile/xteaParams fixtures from the file

### Verification
- [ ] `npm test` — all new tests pass, no regressions (251/253 baseline)
- [ ] New tests contain meaningful assertions (not just "runs without error")

### Suggested Agent
general-purpose
