# Plan

## Status
Current phase: Phase 32
Current task: 32.1 — Switch cache key from TDC_NAME to source hash

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

### Phase 30: Puppeteer-Free Domain Query (done)
> `node scraper/cli.js --verbose https://example.com` works end-to-end.
> CAPTCHA solve + urlsec query with zero Puppeteer dependency. Confirmed 2026-04-11.

### Phase 31: Auto-Port Unknown Templates in Scraper (done)
> When the scraper encounters an unknown template, automatically run the porting
> pipeline as a subprocess, cache the result, and retry — instead of failing.
> Confirmed working 2026-04-11.

### Phase 32: Switch Template Cache Key to Source Hash
> TDC_NAME is not a reliable cache key — same TDC_NAME can map to different XTEA
> params across builds (confirmed in 28.13/28.14). Replace with SHA-256 hash of
> tdc.js source after stripping the eks token (which varies per-session).

| ID | Task | Status |
|----|------|--------|
| 32.1 | Switch cache key from TDC_NAME to source hash | done |
| 32.2 | Tests for source hash cache key | in-progress |
| 32.3 | Clear cache and live test | pending |

---

## Current Task

**ID**: 32.2
**Title**: Tests for source hash cache key
**Phase**: Switch Template Cache Key to Source Hash
**Status**: in-progress

### Goal
Fix the 8 broken tests and add new tests for `computeSourceHash()`. The broken tests use TDC_NAME as cache key but `seed()` now uses source hash. Also need tests covering the new `computeSourceHash` function itself.

### Context

**Broken tests** (8 failures):
- `tests/test-pipeline-integration.js` — `describe('template-cache: seed')`: 2 tests that look up seeded entries by TDC_NAME
- `tests/test-pipeline-integration.js` — `describe('template-cache: lookup')`: 2 tests looking up by TDC_NAME
- `tests/test-scraper-foundation.js` — `describe('TemplateCache seed() with structureParams')`: 2 tests
- `tests/test-scraper-foundation.js` — `describe('template-cache: lookup')` (if exists): looking up by TDC_NAME or checking entry count after seed

**Root cause**: `seed()` now reads the full target file, computes `computeSourceHash(source)`, and stores under that hash. Tests that call `seed()` and then `lookup(tdcName)` will get null because the key is now a hash, not TDC_NAME.

**Fix approach**: In seed-related tests, either:
- Compute the expected hash from the target file source and use that for lookup
- Or use `lookupByStructure(caseCount)` which still works (scans by value, not key)
- Or iterate cache entries to verify content without relying on specific keys

**New tests needed for `computeSourceHash`**:
- Same source → same hash
- Different eks → same hash (proves stripping works)
- Different VM code → different hash
- Both eks patterns stripped: `window.<ID> = '<base64>'` and `window[TDC_NAME] = '<base64>'`

**Key files**:
- `tests/test-pipeline-integration.js` — fix seed/lookup tests
- `tests/test-scraper-foundation.js` — fix seed/lookup tests
- `tests/test-auto-port.js` — check if any tests need updating (the `resolveTemplate` helper uses `lookup(tdcName)` but in that context the key is just a string, not a real TDC_NAME, so it should still work)
- New or existing test file — add `computeSourceHash` tests

### Verification
- [ ] `npm test` — back to 255/257 baseline (8 fixed, 2 known)
- [ ] New `computeSourceHash` tests pass
- [ ] Tests cover eks stripping, hash stability, and both eks patterns

### Suggested Agent
general-purpose
