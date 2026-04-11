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
| 31.2 | Tests for auto-port | in-progress |
| 31.3 | Integrate auto-port into solve loop | pending |
| 31.4 | Tests for solve loop integration | pending |
| 31.5 | Live end-to-end test with unknown template | pending |

---

## Current Task

**ID**: 31.2
**Title**: Tests for auto-port
**Phase**: Auto-Port Unknown Templates in Scraper
**Status**: in-progress

### Goal
Write unit tests for the `_autoPort(tdcName, tdcSource)` method in `scraper/scraper.js`. Tests should mock the child process to avoid needing Puppeteer, and cover success path, failure path, timeout, temp file cleanup, and cache storage.

### Context

**Method under test**: `Scraper.prototype._autoPort(tdcName, tdcSource)` in `scraper/scraper.js` (lines 89-170).

The method:
1. Writes `tdcSource` to `/tmp/tdc-autoport-<tdcName>.js`
2. Runs `node pipeline/run.js <tempfile> --skip-verify` via `execFile` with 120s timeout
3. On success: reads `output/<stem>/pipeline-config.json`, extracts params, stores in cache, returns normalized entry
4. On failure: logs error, returns `null`
5. Always cleans up temp file in `finally` block

**Test approach**: Since the pipeline uses Puppeteer (which we can't run in tests), we need to mock `child_process.execFile`. The cleanest approach is to:
- Create a mock pipeline-config.json in a temp output dir before calling `_autoPort`
- Stub/mock `execFile` to simulate success (exit code 0) or failure
- Verify the cache was populated correctly after success
- Verify `null` is returned on failure
- Verify temp file is cleaned up in both cases

**Existing test patterns**: Tests use Node.js built-in `node:test` module with `describe`/`it`/`assert`. See `tests/test-template-cache.js` or `tests/test-collect-generator.js` for conventions.

**Key files**:
- `scraper/scraper.js` — the method to test (lines 89-170)
- `scraper/template-cache.js` — `store()` and `lookup()` methods
- `tests/` — existing test files for pattern reference

### Implementation Steps
1. Create `tests/test-auto-port.js`
2. Test cases to cover:
   - **Success path**: Mock `execFile` to succeed, pre-create pipeline-config.json in expected output dir, call `_autoPort`, assert cache entry contains correct fields
   - **Failure path**: Mock `execFile` to fail (non-zero exit), assert returns `null`
   - **Timeout path**: Mock `execFile` to return timeout error, assert returns `null`
   - **Temp file cleanup**: After both success and failure, verify temp file is removed
   - **Missing pipeline-config**: `execFile` succeeds but config file doesn't exist, assert returns `null` (error handling)
   - **Cache entry field completeness**: Verify all structure params (cdFieldOrder, hashPosition, serializationDiffs, headerSplit) are included when present in pipeline-config

### Verification
- [ ] `node --test tests/test-auto-port.js` — all tests pass
- [ ] `npm test` — no regressions (255/257 + new tests)
- [ ] Code review: tests use proper mocking, no real subprocess spawned
- [ ] Code review: meaningful assertions (not just "runs without error")
- [ ] Code review: covers success, failure, timeout, cleanup, and field completeness

### Suggested Agent
general-purpose
