# Plan

## Status
Current phase: Phase 30
Current task: 30.4 — Full domain query test

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
| 30.3 | Live end-to-end headless test (`scraper/cli.js --captcha-only`) | done |
| 30.4 | Full domain query test (`scraper/cli.js --verbose https://example.com`) | pending |

---

## Current Task

**ID**: 30.4
**Title**: Full domain query test (`scraper/cli.js --verbose https://example.com`)
**Phase**: Puppeteer-Free Domain Query
**Status**: pending

### Goal
Run the scraper in full mode (CAPTCHA solve + urlsec.qq.com query) against a target URL and observe the results. This completes the Phase 30 goal of making the CLI work end-to-end without Puppeteer.

### Context

Task 30.3 proved the CAPTCHA-only flow works — got errorCode -1 with valid ticket on Template B. The full flow adds one more step: using the ticket to query urlsec.qq.com for domain safety classification.

The CLI command: `node scraper/cli.js --verbose --retries 5 https://example.com`
(Use 5 retries since Tencent rotates templates and some are unknown.)

Known from CLAUDE.md: urlsec.qq.com has switched to click-image-selection CAPTCHAs. The slide solver may not work if the CAPTCHA type has changed for this endpoint.

### Implementation Steps
1. Run `node scraper/cli.js --verbose --retries 5 https://example.com 2>&1` and capture output
2. Record: CAPTCHA result, urlsec query response, any errors

### Verification
- [ ] Command ran without unhandled exceptions
- [ ] Output logged to history for analysis

### Suggested Agent
general-purpose
