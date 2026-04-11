# Plan

## Status
Current phase: Phase 31
Current task: 31.1 — Add auto-port method to scraper

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

### Phase 31: Auto-Port Unknown Templates in Scraper
> When the scraper encounters an unknown template, automatically run the porting
> pipeline as a subprocess, cache the result, and retry — instead of failing.

| ID | Task | Status |
|----|------|--------|
| 31.1 | Add auto-port method to scraper | done |
| 31.2 | Tests for auto-port | done |
| 31.3 | Integrate auto-port into solve loop | done |
| 31.4 | Tests for solve loop integration | in-progress |
| 31.5 | Live end-to-end test with unknown template | pending |

---

## Current Task

**ID**: 31.4
**Title**: Tests for solve loop integration
**Phase**: Auto-Port Unknown Templates in Scraper
**Status**: in-progress

### Goal
Add tests verifying the auto-port integration in `solveCaptcha()`. The tests should confirm that when both cache lookup and structural lookup miss, `_autoPort` is called, and that the solve flow continues on success or throws on failure.

### Context

**Integration point** (`scraper/scraper.js`, lines 425-431):
```js
if (!cached) {
  this._log('  No structural match — attempting auto-port via pipeline...');
  cached = await this._autoPort(tdcName, tdcSource);
}
if (!cached) {
  throw new Error(`Unknown template ${tdcName}, auto-port failed`);
}
```

**Testing approach**: Since `solveCaptcha()` involves HTTP calls (prehandle, getSig, image download, tdc download, slider solve, verify POST), testing the full method requires extensive mocking. The most practical approach is to:
1. Add tests to the existing `tests/test-auto-port.js` that test the integration logic
2. OR create a focused test that patches just the relevant methods on a Scraper instance

The cleanest approach: test by patching `_autoPort` on the Scraper prototype and testing the template-lookup flow directly. We can extract the lookup+autoport logic into a testable path by calling the relevant section directly, or test via solveCaptcha with all HTTP methods stubbed.

**Simpler alternative**: Since `_autoPort` is already well-tested (31.2), and the integration is a 4-line change, we can write a targeted test that:
- Creates a Scraper with empty cache
- Stubs `_autoPort` to return a known entry
- Verifies the flow reaches `_autoPort` when lookup and structural lookup both miss
- This is most practically done by testing at the unit level: mock the cache to return null, mock `_autoPort`, and check it gets called

**Key files**:
- `scraper/scraper.js` — the integration point
- `tests/test-auto-port.js` — add integration tests here

### Implementation Steps
1. Add a new `describe('solveCaptcha auto-port integration')` block to `tests/test-auto-port.js`
2. Tests should create a Scraper instance, stub `_templateCache.lookup` to return null, stub `_templateCache.lookupByStructure` to return null, stub `_autoPort` to return a known entry or null
3. Since we can't easily call `solveCaptcha()` without all HTTP plumbing, instead test the conditional logic by extracting the relevant snippet into a test or by verifying `_autoPort` is called at the right time
4. At minimum, test:
   - When `_autoPort` succeeds, scraper doesn't throw (the `cached` variable gets the result)
   - When `_autoPort` returns null, scraper throws with "auto-port failed"
   - When lookup hits (cache HIT), `_autoPort` is NOT called

### Verification
- [ ] New tests pass
- [ ] `npm test` — no regressions
- [ ] Code review: tests verify the integration behavior, not just _autoPort in isolation

### Suggested Agent
general-purpose
