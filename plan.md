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
| 31.3 | Integrate auto-port into solve loop | in-progress |
| 31.4 | Tests for solve loop integration | pending |
| 31.5 | Live end-to-end test with unknown template | pending |

---

## Current Task

**ID**: 31.3
**Title**: Integrate auto-port into solve loop
**Phase**: Auto-Port Unknown Templates in Scraper
**Status**: in-progress

### Goal
Modify the `solveCaptcha()` method in `scraper/scraper.js` so that when both direct cache lookup and structural lookup fail, it calls `_autoPort(tdcName, tdcSource)` before giving up. If auto-port succeeds, continue the solve flow normally. If it fails, throw the existing error.

### Context

**Integration point**: `scraper/scraper.js`, lines 425-427. Currently:
```js
if (!cached) {
  throw new Error(`Unknown template ${tdcName}, run pipeline to port it`);
}
```

After the structural lookup attempt (lines 411-424) falls through, the code should try `_autoPort` as a last resort.

**Available variables at integration point**:
- `tdcName` — string, already extracted
- `tdcSource` — string, the full tdc.js source (fetched at line 397)
- `this._autoPort(tdcName, tdcSource)` — returns cached entry or null

**Flow change**:
```
lookup(tdcName) → miss →
  parseVmFunction → lookupByStructure(caseCount) → miss →
    _autoPort(tdcName, tdcSource) → miss →
      throw Error
```

**Key files**:
- `scraper/scraper.js` — modify `solveCaptcha()` around lines 425-427

### Implementation Steps
1. Replace the `if (!cached)` block at lines 425-427 with:
   ```js
   if (!cached) {
     this._log('  No structural match — attempting auto-port via pipeline...');
     cached = await this._autoPort(tdcName, tdcSource);
   }
   if (!cached) {
     throw new Error(`Unknown template ${tdcName}, auto-port failed`);
   }
   ```
2. That's it — the `_autoPort` method already handles all the subprocess work, caching, and error handling.

### Verification
- [ ] `node -c scraper/scraper.js` passes
- [ ] `npm test` — no regressions
- [ ] Code review: auto-port call is in the right place (after structural lookup, before throw)
- [ ] Code review: error message updated to mention auto-port failure

### Suggested Agent
general-purpose
