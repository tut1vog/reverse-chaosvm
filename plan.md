# Plan

## Status
Current phase: Phase 28
Current task: 28.10 — Deep token diff: compare original vs standalone structure

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **ROOT CAUSES FOUND (two)**:
> 1. **Single-blob encryption**: Live templates use one continuous XTEA-ECB blob, not 4 segments. FIXED in 28.11.
> 2. **XTEA keys are per-build, not per-TDC_NAME**: Same TDC_NAME can have different XTEA keys across builds.
>    Our cache maps TDC_NAME → params, but the live tdc.js served in a session may have different keys.
>    Need to extract XTEA key from the actual captured tdc.js source at runtime.

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | done |
| 28.4 | Tests for ans computation | done |
| 28.5 | Investigate errorCode -1 and 12 | done (12 is universal, not template-specific) |
| 28.6 | Isolation test: standalone token via Puppeteer request interception | done |
| 28.7 | Tests for standalone token interception | done |
| 28.8 | Act on 28.6 results | done |
| 28.9 | Fix collect encoding: raw base64 in POST body swap | done |
| 28.10 | Deep token diff: compare original vs standalone structure | done |
| 28.11 | Add single-blob encryption mode to collect-generator | done |
| 28.12 | Tests for single-blob encryption mode | pending |
| 28.13 | Re-run isolation test with single-blob mode | done (still errorCode 12 — wrong XTEA key) |
| 28.14 | Extract XTEA key from captured tdc.js at runtime in isolation test | pending |
| 28.15 | Re-run isolation test with runtime key extraction | pending |

---

## Current Task

**ID**: 28.14
**Title**: Extract XTEA key from captured tdc.js at runtime in isolation test
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Modify the isolation test to save the captured tdc.js source to `output/token-isolation/tdc-source.js`, and also add a helper script that runs the porting pipeline on a saved tdc source to extract fresh XTEA params. This avoids relying on stale cache entries — each TDC build has unique keys.

### Context
- **Root cause**: Same TDC_NAME can have different XTEA keys across builds. Our cache maps TDC_NAME → params, but the params may be stale.
- The tdc.js source is already captured in `capturedTdcSource` during the isolation test.
- The pipeline (`pipeline/run.js`) can extract XTEA params from any tdc.js file.
- After extracting, update the cache and re-run.

### Implementation Steps
1. Modify `scripts/token-isolation-test.js` to also save `capturedTdcSource` to `output/token-isolation/tdc-source.js`
2. After saving, run `node pipeline/run.js output/token-isolation/tdc-source.js` to extract XTEA params
3. The pipeline output goes to `output/tdc-source/` — read the `xtea-params.json` from there
4. Use the fresh XTEA params instead of cache lookup

### Verification
- [ ] tdc source saved to output
- [ ] Pipeline extracts valid XTEA params
- [ ] Re-run with fresh params — check errorCode

### Suggested Agent
general-purpose
