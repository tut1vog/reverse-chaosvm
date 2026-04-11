# Plan

## Status
Current phase: Phase 28
Current task: 28.5 — Investigate errorCode -1 ticket validity and errorCode 12 root cause

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **BREAKTHROUGH**: `captcha-solver.js` (actual browser drag) gets errorCode 0 — CAPTCHA solved!
> Scraper with corrected ans gets errorCode -1 (with ticket!) and errorCode 12 (no ticket).
> errorCode 9 is gone — the ans fix worked.
>
> **ans formula** (from `t_captcha_slide.js`):
> - X = rawOffset (natural space, no ratio/calibration)
> - Y = parseInt(spt) from getsig response
>
> **Live scraper results** (9 attempts):
> - 1× errorCode -1 WITH ticket (live-extracted 96 ops template)
> - 7× errorCode 12, no ticket (various templates)
> - 1× VM parse failure (unknown template)
>
> Hypothesis: errorCode 12 may be collect token validation failure (wrong XTEA params for template). The -1 ticket may be valid.

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | done |
| 28.4 | Tests for ans computation | done |
| 28.5 | Investigate errorCode -1 ticket validity and errorCode 12 root cause | in-progress |
| 28.6 | Fix based on 28.5 findings | pending |

---

## Current Task

**ID**: 28.5
**Title**: Investigate errorCode -1 ticket validity and errorCode 12 root cause
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: in-progress

### Goal
Two questions to answer:
1. Is the errorCode -1 ticket valid? Test it against `queryUrlSec()`.
2. What causes errorCode 12? Correlate with template type — is it a bad collect token?

### Investigation Plan

#### Part A: Validate the errorCode -1 ticket
Modify the scraper's success check at line 464 to also accept errorCode -1 when a ticket is present. Then run `node scraper/cli.js --verbose https://example.com` (full flow: CAPTCHA + urlsec query). If the ticket is accepted by urlsec.qq.com, errorCode -1 is a valid success.

Alternatively, write a quick one-off script that calls `queryUrlSec()` with a fresh -1 ticket.

#### Part B: Correlate errorCode 12 with template
From the live run, the pattern was:
- errorCode -1: live-extracted 96 ops template (SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk)
- errorCode 12: Template B (SUOP...), live-extracted 95 ops, unknown 98 ops

Possible causes of errorCode 12:
1. **Bad collect token** — wrong XTEA params for the template → server can't decrypt → errorCode 12
2. **TLS fingerprinting** on verify endpoint (Node.js HTTP rejected)
3. **Collect token structure mismatch** — template has different field count or layout

To distinguish:
- If TLS were the issue, ALL attempts would fail (including the -1 one). Since one succeeded, TLS is probably not the blocker.
- Run the scraper several more times and log: TDC_NAME, template type, opcode count, errorCode. If errorCode 12 correlates with specific templates (especially "unknown" ones where XTEA extraction may be unreliable), it's a token issue.

### Implementation Steps
1. Patch `scraper/scraper.js` line 464: accept errorCode -1 with ticket as success
2. Run `node scraper/cli.js --captcha-only --verbose` several times, logging template → errorCode mapping
3. If a -1 ticket is obtained, test it with `queryUrlSec()`
4. Analyze the correlation data

### Verification
- [ ] Determine if errorCode -1 tickets are valid (queryUrlSec accepts them)
- [ ] Identify which templates produce errorCode 12 vs -1 vs 0
- [ ] Formulate a theory for errorCode 12 root cause

### Suggested Agent
Director runs this directly — interactive investigation
