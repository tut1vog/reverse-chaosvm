# Plan

## Status
Current phase: Phase 30
Current task: 30.1 — Add singleBlob to scraper and fix collect encoding

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
| 30.1 | Add singleBlob to scraper and fix collect encoding | pending |
| 30.2 | Tests for 30.1 changes | pending |
| 30.3 | Live end-to-end headless test (`scraper/cli.js --captcha-only`) | pending |
| 30.4 | Act on 30.3 results — fix any remaining issues | pending |
| 30.5 | Full domain query test (`scraper/cli.js --verbose https://example.com`) | pending |

---

## Current Task

**ID**: 30.1
**Title**: Add singleBlob to scraper and fix collect encoding
**Phase**: Puppeteer-Free Domain Query
**Status**: pending

### Goal
Two changes to `scraper/scraper.js` to align with what the isolation test proved works:
1. Add `singleBlob: true` to the `generateCollect()` call
2. Fix the collect value passed to `verify()` — should be raw base64, not URL-encoded

### Context

**The isolation test (28.15) proved**: `generateCollect(profile, xteaParams, { singleBlob: true })` produces an accepted token (errorCode 0) when the raw base64 form (decodeURIComponent of the URL-encoded output) is placed in the POST body.

**Current scraper code** (`scraper/scraper.js` line 410-424):
```js
const collectEncoded = generateCollect(profileOverrides, xteaParams, {
  appid: this.aid,
  nonce: sig.nonce,
  sdOverride: slideSd,
  cdFieldOrder: cached.cdFieldOrder || null,
  behavioralEvents: behavioralEvents,
  timestamp: now,
  serializationDiffs: cached.serializationDiffs || null,
  headerSplit: cached.headerSplit || null,
  // MISSING: singleBlob: true
});
// Decode URI-encoded collect for the POST fields
let collectVal = collectEncoded;
if (collectVal.includes('%')) {
  try { collectVal = decodeURIComponent(collectVal); } catch (_) {}
}
```

**Issues**:
1. Missing `singleBlob: true` — generates 4-segment token instead of single blob
2. The decoding logic is correct (collectVal becomes raw base64) — but `verify()` receives `collectEncoded` (URL-encoded) at line 455 instead of `collectVal` (raw base64). Need to check what `verify()` expects and whether this matters.

**What verify() does** (captcha-client.js): The `prebuiltBody` path (used when vData is available) sends the jQuery-serialized body directly. The `collect` param is used for the non-prebuilt path. In the prebuilt path, the collect is already embedded in `serializedBody` via `generateVData()`. So the `collect` field passed to `verify()` is only used in the non-prebuilt fallback. Need to check both paths.

### Implementation Steps
1. Add `singleBlob: true` to the generateCollect options (one line)
2. Verify the collect encoding flow: what format does `_buildPostFields` expect? What does `generateVData` receive?
3. Ensure raw base64 (not URL-encoded) goes into the POST body, matching what the isolation test proved works

### Verification
- [ ] `node -c scraper/scraper.js` passes
- [ ] `npm test` — 251/253 (no regressions)
- [ ] Code review: `singleBlob: true` present in generateCollect call
- [ ] Code review: collect value in POST body is raw base64

### Suggested Agent
general-purpose
