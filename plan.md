# Plan

## Status
Current phase: Phase 28
Current task: 28.3 — Integrate standalone token into captcha-solver.js

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)
> **CONCLUSIVE**: errorCode 9 is NOT token generation. Chrome's own `TDC.getData(true)` forwarded verbatim also returns errorCode 9. Issue is slider solve coordinates.

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve
> **BREAKTHROUGH**: `captcha-solver.js` (actual browser drag approach) gets errorCode 0 — CAPTCHA solved!
>
> Key findings from the successful run:
> - Dynamic ratio from #slideBg is 1.8557 (NOT 0.5 — the UI changed)
> - raw=478, css=862, the page computes ans=477,30; (X≈rawOffset, Y varies per puzzle)
> - The manual POST approach (chrome-passthrough, live-captcha-submit) was always doomed: wrong field order, wrong vData, wrong ans computation
> - The real-drag approach works because the page handles ans computation, vData, field order, and POST construction
>
> **Strategy**: Use captcha-solver.js as the production path. The remaining goal is to plug in our standalone token (instead of Chrome's TDC-generated token) to prove the token generator works end-to-end.

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done (failed — manual POST approach abandoned) |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Integrate standalone token into captcha-solver.js | pending |
| 28.4 | Live test: standalone token + real drag | pending |
| 28.5 | Tests for the integration | pending |

---

## Current Task

**ID**: 28.3
**Title**: Integrate standalone token into captcha-solver.js
**Phase**: End-to-End CAPTCHA Solve
**Status**: pending

### Goal
Add an option to `captcha-solver.js` that replaces Chrome's `TDC.getData(true)` collect token with our standalone-generated token from `scraper/collect-generator.js`. This is the final proof: if the CAPTCHA passes with our standalone token + real drag, the entire pipeline works end-to-end.

### Context
- `puppeteer/captcha-solver.js` — working solver that does real drag + page handles POST
  - Currently the page's own TDC generates collect/eks
  - We need to intercept and replace the collect token before the verify POST fires
- `scraper/collect-generator.js` — standalone parameterized token generator
  - Takes profile + XTEA params, produces collect token
  - Needs template cache lookup for XTEA params (from `scraper/template-cache.js`)
- The tdc.js source is already intercepted (line ~320-326 of captcha-solver.js)
- `scraper/tdc-utils.js` — extracts TDC_NAME from tdc.js source
- The verify POST is intercepted at line ~266-291 — we could modify the collect field there

### Approach
Two strategies:
1. **Request interception**: Intercept the verify POST request, replace the `collect` field with our standalone token, then continue
2. **Page override**: Override `TDC.getData` in the page to return our token instead

Strategy 1 (request interception) is cleaner — it doesn't interfere with the page's internal state.

### Implementation Steps
1. Add `useStandaloneToken: boolean` option to CaptchaPuppeteer constructor
2. When enabled, after tdc.js source is intercepted:
   a. Extract TDC_NAME using `tdc-utils.js`
   b. Look up XTEA params in template cache
   c. Generate standalone collect token using `collect-generator.js`
3. Enable Puppeteer request interception on the verify POST
4. Replace the `collect` field value and update `tlg` (collect length)
5. Continue the request with modified body
6. Log both original and replacement collect lengths for comparison

### Verification
- [ ] `node -c puppeteer/captcha-solver.js` passes
- [ ] `npm test` passes at baseline (248/250 or 173/175)
- [ ] New option `useStandaloneToken` is accepted without error
- [ ] When `useStandaloneToken=false` (default), behavior is unchanged
- [ ] Code review: request interception correctly replaces collect and tlg fields

### Suggested Agent
general-purpose
