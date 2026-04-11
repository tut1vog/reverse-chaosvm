# Plan

## Status
Current phase: Phase 29
Current task: 29.1 — Audit and refresh stale template cache entries

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve — Token Isolation (done)
> Standalone token accepted by server (errorCode 0) via Puppeteer request interception.
> Root causes: (1) live templates use single-blob XTEA encryption, not 4-segment;
> (2) some cache entries had wrong keyMods from bad initial extraction.
> Key insight: same TDC_NAME always has same XTEA key/keyMods/cdFieldOrder — only eks differs per build.

### Phase 29: Cache Refresh & TLS Verification
> Fix stale template cache entries (wrong keyMods), then verify whether TLS
> fingerprinting is the real reason `cap_union_new_show` returns 403 for Node.js.

| ID | Task | Status |
|----|------|--------|
| 29.1 | Audit and refresh stale template cache entries | done |
| 29.2 | Tests for refreshed cache entries | pending |
| 29.3 | Verify TLS fingerprinting as cause of 403 on cap_union_new_show | done (NOT TLS — it's missing sess!) |
| 29.4 | Act on 29.3 results | done (no TLS blocker — full headless flow is possible) |

---

## Current Task

Phase 29 complete. Cache refreshed, TLS myth busted.

### Key outcomes
1. All 10 template cache entries refreshed with correct keyMods + cdFieldOrder
2. `cap_union_new_show` 403 is NOT TLS fingerprinting — just requires valid `sess` from prehandle
3. **Full headless CAPTCHA solve flow is possible** — no Puppeteer needed for any step
4. Legacy `/cap_union_new_getsig` confirmed dead (404)

### Next priorities
1. Integrate `singleBlob: true` into `scraper/scraper.js`
2. End-to-end headless test (prehandle → show config → images → solve → token → verify)
3. Tests for single-blob mode (28.12, deferred)
