# Plan

## Status
Current phase: Phase 33
Current task: 33.2 — Tests for survey script

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

### Phase 32: Switch Template Cache Key to Source Hash (done)
> TDC_NAME is not a reliable cache key — same TDC_NAME can map to different XTEA
> params across builds (confirmed in 28.13/28.14). Replaced with SHA-256 hash of
> tdc.js source after stripping the eks token. Cache cleared and re-seeded. 2026-04-12.

### Phase 33: TDC Survey — Collect Live Template Data
> Clear the cache, run the scraper repeatedly, save each unique tdc.js build,
> record which builds port successfully vs fail, and which still get errorCode 12.
> Output a structured report for analysis.

| ID | Task | Status |
|----|------|--------|
| 33.1 | Create tdc.js survey script | done |
| 33.2 | Tests for survey script | pending |
| 33.3 | Run survey and analyze results | pending |

---

## Current Task

**ID**: 33.2
**Title**: Tests for survey script
**Phase**: TDC Survey — Collect Live Template Data
**Status**: in-progress

### Goal
Write unit tests for `scripts/tdc-survey.js` — verify CLI arg parsing, the `autoPort` function, `buildPostFields` construction, summary/report generation logic.

### Context
- `scripts/tdc-survey.js` — the script to test (539 lines)
- Key functions: `parseArgs()` (line 38), `autoPort()` (line 94), `buildPostFields()` (line 135), `main()` (line 190)
- Functions are module-local (not exported), so tests may need to either: (a) add a `module.exports` block guarded by `require.main !== module`, or (b) test by spawning the script as a subprocess with mocked HTTP.
- Existing test pattern: `tests/test-*.js` using Node.js built-in `node:test` + `node:assert`

### Implementation Steps
1. Create `tests/test-tdc-survey.js`
2. Export testable functions from `tdc-survey.js` when not run as main
3. Test: parseArgs with various flag combinations
4. Test: buildPostFields produces correct field structure
5. Test: report JSON structure validation

### Verification
- [ ] `node --test tests/test-tdc-survey.js` passes
- [ ] `npm test` — no regressions

### Suggested Agent
general-purpose
