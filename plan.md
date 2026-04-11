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
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | pending |
| 28.4 | Tests for ans computation | pending |
| 28.5 | Live test: scraper with corrected ans (no Puppeteer) | pending |
| 28.6 | If TLS blocks verify: investigate workarounds | pending |

---

## Current Task

**ID**: 28.3
**Title**: Fix ans computation in scraper pipeline
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Fix the `ans` field computation so the scraper pipeline sends correct coordinates without needing a browser drag. X = rawOffset (natural space, no ratio, no calibration). Y = `spt` from the getsig/show response. Also fix `chrome-passthrough.js` and `live-captcha-submit.js` if they exist.

### Context
- **`spt` (Y coordinate)**: Already parsed in `puppeteer/captcha-client.js`:
  - `_getSigLegacy` returns `spt: data.spt || ''` (line 476)
  - `_parseShowPageConfig` extracts `spt: extract('spt')` (line 669)
  - `_getCapBySig` returns `spt: data.spt || sig.spt || ''` (line 735)
  - In `t_captcha_slide.js`: `_.spt = e.inity` (getsig response field `inity`)
  - Y = `Math.floor(parseInt(spt, 10))`
- **X coordinate**: `rawOffset` from OpenCV, used directly (no ratio, no calibration)
  - From successful captcha-solver.js run: raw=478 → page computed ans X=477 (essentially rawOffset)
- **Scripts to fix**:
  - `scripts/chrome-passthrough.js` — currently uses `NATURAL_CALIBRATION = -13` and `SLIDE_Y = 158`
  - `scripts/live-captcha-submit.js` — if it exists, likely has same issue
  - `scraper/scraper.js` — the headless scraper; check how it computes ans
- **`puppeteer/captcha-client.js`** line 885 shows `verify()` accepts `params.ans`

### Implementation Steps
1. Read `scraper/scraper.js` to find how ans is currently computed
2. Read `scripts/chrome-passthrough.js` ans computation (already known: line 257-258)
3. Fix ans in all scripts:
   - X = `rawOffset` (no multiplication, no calibration offset)
   - Y = `parseInt(spt, 10)` from the getsig/show response
   - Format: `"${X},${Y};"`
4. Ensure `spt` is plumbed from CaptchaClient response → ans computation in each script
5. Remove hardcoded Y constants (`SLIDE_Y`, `DEFAULT_SLIDE_Y`, etc.)
6. Remove ratio multiplication and calibration offsets for non-drag usage

### Verification
- [ ] `node -c` passes on all modified files
- [ ] `npm test` passes at baseline
- [ ] No hardcoded Y constants remain (no `SLIDE_Y = 158`, `DEFAULT_SLIDE_Y = 45`)
- [ ] No ratio multiplication on rawOffset for the manual POST path
- [ ] `spt` is read from server response and used as Y in all ans computations
- [ ] grep confirms: ans is built as `"${rawOffset},${spt};"` pattern

### Suggested Agent
general-purpose
