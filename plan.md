# Plan

## Status
Current phase: Phase 28
Current task: 28.3 — Fix ans computation in scraper pipeline

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)
> **CONCLUSIVE**: errorCode 9 is NOT token generation. Chrome's own `TDC.getData(true)` forwarded verbatim also returns errorCode 9. Issue is slider solve coordinates.

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **BREAKTHROUGH**: `captcha-solver.js` (actual browser drag) gets errorCode 0 — CAPTCHA solved!
>
> Key findings:
> - Dynamic ratio from #slideBg is 1.8557 (NOT 0.5 — UI changed)
> - raw=478, page computes ans=477,30; (X ≈ rawOffset, Y = server-provided `spt`)
> - Manual POST approach failed due to wrong ans Y, wrong field order, wrong vData
>
> **ans formula** (from `t_captcha_slide.js` source):
> - **X** = `Math.floor((imgSlide.offset().left - operation.offset().left) / _.rate)` → effectively rawOffset in natural space
> - **Y** = `Math.floor(parseInt(_.spt, 10))` → the `spt` field from the getsig/show response (`inity` in the raw JSON)
>
> The `spt` field is already parsed by `captcha-client.js` (line 476/589/669/735). It just needs to be plumbed into the ans computation.
>
> **Strategy**: Fix the scraper pipeline to use correct ans (X=rawOffset, Y=spt), then test without Puppeteer drag.

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done (failed — but root cause now understood) |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | done |
| 28.4 | Tests for ans computation | pending |
| 28.4.1 | Fix captcha-solver.js CALIBRATION_OFFSET for non-drag scripts | pending |
| 28.5 | Live test: scraper with corrected ans (no Puppeteer) | pending |
| 28.6 | If TLS blocks verify: investigate workarounds | pending |

---

## Current Task

**ID**: 28.4
**Title**: Tests for ans computation
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Add tests verifying the corrected ans computation logic (X=rawOffset, Y=spt).

### Suggested Agent
general-purpose
