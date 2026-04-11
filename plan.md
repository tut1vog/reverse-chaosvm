# Plan

## Status
Current phase: Phase 28
Current task: 28.6 — Isolation test: standalone token via Puppeteer request interception

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **Status**: errorCode 9 fixed (ans correction). Now errorCode 12 on all templates.
> errorCode 12 is universal — not template-specific. Need to isolate whether the
> problem is the collect token or the transport layer (TLS/vData/POST).

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | done |
| 28.4 | Tests for ans computation | done |
| 28.5 | Investigate errorCode -1 and 12 | done (12 is universal, not template-specific) |
| 28.6 | Isolation test: standalone token via Puppeteer request interception | pending |
| 28.7 | Tests for standalone token interception | pending |
| 28.8 | Act on 28.6 results | pending |

---

## Current Task

**ID**: 28.6
**Title**: Isolation test: standalone token via Puppeteer request interception
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Determine whether errorCode 12 is caused by the standalone collect token or by the transport layer (TLS/vData/POST encoding). Use `captcha-solver.js` (real Chrome drag, Chrome TLS — known to get errorCode 0) but intercept the verify POST and swap the `collect` field with our standalone-generated token. If it still passes → token is fine, issue is transport. If it fails with errorCode 12 → token is broken.

### Context

**captcha-solver.js** (`puppeteer/captcha-solver.js`):
- Already intercepts the tdc.js source at line 319-326 → stored in `capturedTdcSource`
- Already captures the verify POST body at line 266-291 → stored in `capturedVerifyPost`
- Does NOT currently use Puppeteer request interception (`page.setRequestInterception`)
- The verify POST is logged but NOT modified — it flows through to the server unaltered
- The page's own TDC generates collect/eks, and `t_captcha_slide.js` fires the verify via XHR

**Standalone token generation** requires:
- `scraper/tdc-utils.js`: `extractTdcName(source)` → TDC_NAME from tdc.js source
- `scraper/template-cache.js`: `TemplateCache.lookup(tdcName)` → XTEA params
- `scraper/collect-generator.js`: `generateCollect(profile, xteaParams, options)` → collect token string

**How Puppeteer request interception works**:
1. Call `await page.setRequestInterception(true)` before navigation
2. Listen for `page.on('request', handler)`
3. In the handler, for the verify POST, modify the body and call `request.continue({ postData: newBody })`
4. For all other requests, call `request.continue()`

### Approach
Create a **standalone test script** `scripts/token-isolation-test.js` that:
1. Reuses `CaptchaPuppeteer` from `puppeteer/captcha-solver.js` but with request interception
2. Before navigation, enables `page.setRequestInterception(true)`
3. On intercepting the verify POST:
   a. Parse the POST body to extract `collect` and `tlg`
   b. Extract TDC_NAME from already-captured `capturedTdcSource`
   c. Look up XTEA params from template cache
   d. Generate standalone collect token using `generateCollect()`
   e. Replace `collect` and `tlg` in the POST body
   f. Log both original and replacement collect lengths
   g. Continue the request with the modified body
4. The slider drag and everything else happens normally (Chrome handles it)
5. Report the errorCode

**Why a standalone script** (not modifying captcha-solver.js):
- captcha-solver.js is production code that works — don't risk breaking it
- This is a diagnostic test, not a feature
- Easier to add verbose logging without cluttering the solver

### Implementation Steps
1. Create `scripts/token-isolation-test.js`:
   - Require `CaptchaPuppeteer`, `TemplateCache`, `extractTdcName`, `generateCollect`
   - Load profile from `profiles/default.json`
   - Initialize template cache
   - Instantiate CaptchaPuppeteer with `headless: false`
   - But we can't easily inject request interception into CaptchaPuppeteer's `solve()` method — it owns the page lifecycle

   **Alternative**: Don't use CaptchaPuppeteer. Instead, clone the essential flow from captcha-solver.js:
   - Launch browser, create page, set up interception
   - Prehandle → show page → intercept images → solve slider → drag → intercept verify
   - In the verify interception, swap collect with standalone token
   - This is essentially captcha-solver.js's flow but with the token swap added

   **Simpler alternative**: Monkey-patch CaptchaPuppeteer. Since `solve()` creates the page internally, we can't easily intercept. Instead, subclass or wrap it. OR: just modify captcha-solver.js to accept a `tokenSwapFn` callback option that's called when the verify POST is intercepted.

   **Simplest approach**: Write a self-contained script that does the full flow (copy the essential parts from captcha-solver.js), with the token swap baked in. This is a diagnostic script — cleanliness isn't critical.

2. Run the script with `--headful` for debugging
3. Compare results:
   - With token swap: errorCode ?
   - Without token swap (vanilla captcha-solver.js): errorCode 0 (already proven)

### Verification
- [ ] `node -c scripts/token-isolation-test.js` passes
- [ ] Script runs without crash
- [ ] Logs show both original collect length and standalone collect length
- [ ] Records the errorCode from the verify response
- [ ] Result clearly indicates: token issue (errorCode 12) or transport issue (errorCode 0)

### Suggested Agent
general-purpose — to create the diagnostic script
