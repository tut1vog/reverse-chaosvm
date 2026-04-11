# Plan

## Status
Current phase: Phase 31 (complete)
Current task: none

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

| ID | Task | Status |
|----|------|--------|
| 31.1 | Add auto-port method to scraper | done |
| 31.2 | Tests for auto-port | done |
| 31.3 | Integrate auto-port into solve loop | done |
| 31.4 | Tests for solve loop integration | done |
| 31.5 | Live end-to-end test with unknown template | done |

---

## Current Task

All tasks in Phase 31 are complete.
