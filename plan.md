# Plan

## Status
Current phase: Phase 28
Current task: 28.1 — Fix ans coordinate space and calibration in chrome-passthrough

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)
> **CONCLUSIVE**: errorCode 9 is NOT token generation. Chrome's own `TDC.getData(true)` forwarded verbatim also returns errorCode 9. Issue is slider solve coordinates.

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: Fix Slider Solve Coordinates
> The `ans` field must use natural pixel coordinates (680px-wide image space), not CSS display coordinates (340px). Our formula `rawOffset * 0.5 + calibration` halves the offset, sending ~220px instead of ~464px. The server expects `naturalX = rawOffset + NATURAL_CALIBRATION` where calibration ≈ -13. Y coordinate from HAR is 158, not 45.
>
> Evidence:
> - HAR capture shows real ans="464,158;" for a 680px bg with notch at ~477px
> - bot.py drags in CSS space but the CAPTCHA JS converts to natural before POST
> - Our scripts build the POST manually, so must send natural coordinates directly
> - PROGRESS.md Option B (recommended but never implemented): `naturalX = rawOffset - 13`

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (Chrome's own token + correct ans) | in-progress |
| 28.3 | If 28.2 passes: apply same fix to live-captcha-submit.js | pending |
| 28.4 | Tests for coordinate mapping | pending |

---

## Current Task

**ID**: 28.2
**Title**: Live re-test with chrome-passthrough (Chrome's own token + correct ans)
**Phase**: Fix Slider Solve Coordinates
**Status**: in-progress

### Goal
Run `scripts/chrome-passthrough.js` live to see if fixing the ans coordinates resolves errorCode 9. This is the critical test: Chrome's own token (known good) + correct natural-space coordinates. If this passes, the token was never the problem — it was always the coordinates.

### Context
- `scripts/chrome-passthrough.js` — uses Puppeteer + stealth, Chrome's own `TDC.getData(true)` token, our OpenCV slider solve
- Run: `node scripts/chrome-passthrough.js --headful` (headful for debugging)
- The script already has retry logic (`--retries N`)
- Output goes to `output/chrome-passthrough/` directory
- Previous runs with wrong ans always got errorCode 9
- Now ans should be ~464,158 instead of ~220,45

### Implementation Steps
1. Run: `node scripts/chrome-passthrough.js --headful --retries 3`
2. Observe the ans values logged (should be ~450-500, not ~200-250)
3. Check verify response — looking for errorCode 0 (success) instead of 9

### Verification
- [ ] Script runs without crash
- [ ] ans X coordinate is in range 400-550 (natural space)
- [ ] ans Y coordinate is 158
- [ ] Record the errorCode from verify response

### Suggested Agent
This is a manual/interactive test — the director should run it directly via Bash, not dispatch to a subagent.
