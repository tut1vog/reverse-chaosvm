# Plan

## Status
Current phase: Phase 30
Current task: none — Phase 30 complete

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

| ID | Task | Status |
|----|------|--------|
| 30.1 | Add singleBlob to scraper generateCollect call | done |
| 30.2 | Tests for 30.1 changes | done |
| 30.3 | Live end-to-end headless test (`scraper/cli.js --captcha-only`) | done |
| 30.4 | Full domain query test (`scraper/cli.js --verbose https://example.com`) | done |

---

## Current Task

*No active task — Phase 30 complete. All tasks done.*
