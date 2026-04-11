# Plan

## Status
Current phase: Phase 30
Current task: 30.3 — Live end-to-end headless test

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
| 30.2 | Tests for 30.1 changes | done |
| 30.3 | Live end-to-end headless test (`scraper/cli.js --captcha-only`) | pending |
| 30.4 | Act on 30.3 results — fix any remaining issues | pending |
| 30.5 | Full domain query test (`scraper/cli.js --verbose https://example.com`) | pending |

---

## Current Task

**ID**: 30.3
**Title**: Live end-to-end headless test (`scraper/cli.js --captcha-only`)
**Phase**: Puppeteer-Free Domain Query
**Status**: pending

### Goal
Run the scraper in `--captcha-only` mode against Tencent's live CAPTCHA endpoint and observe the results. This is a diagnostic task — the goal is to discover what works and what doesn't, not to guarantee errorCode 0.

### Context

The scraper (`scraper/cli.js --captcha-only --verbose`) runs the full headless CAPTCHA flow:
prehandle → getSig → downloadImages → downloadTdc → extractTdcName → cache lookup → extractEks → solveSlider → generateCollect (now with singleBlob) → generateVData (jsdom) → verify POST.

Known limitations (from CLAUDE.md):
- urlsec.qq.com may serve click-image CAPTCHAs (not slide) — scraper only handles slide
- cap_union_new_show returns 403 without valid `sess` from prehandle
- New templates in rotation may not be in the cache

The CLI defaults: aid `2090803262`, ratio `0.5`, calibration `-25`, retries `3`.

### Implementation Steps
1. Run `node scraper/cli.js --captcha-only --verbose 2>&1` and capture full output
2. Record: what template was served, whether cache hit, what errorCode was returned
3. If it crashes, capture the error stack trace

### Verification
- [ ] Command ran without unhandled exceptions (graceful error handling)
- [ ] Output logged to history for analysis

### Suggested Agent
general-purpose
