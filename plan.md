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
> **SOLVED! errorCode 0 achieved with standalone token swap (28.15).**
> Root causes were: (1) 4-segment vs single-blob encryption — FIXED in 28.11;
> (2) stale XTEA keyMods in cache — fixed by re-running pipeline on captured source.
> Server accepts our token even with shorter payload (5240 vs 6636 chars).
> Next: integrate singleBlob mode into the scraper pipeline + runtime key extraction.

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
| 28.15 | Re-run isolation test with fresh params | done (errorCode 0 — SUCCESS!) |

---

## Current Task

Phase 28 complete. Standalone token accepted by server (errorCode 0).

### What was proven
- Single-blob XTEA encryption + correct keyMods + cdFieldOrder = working token
- Server tolerates shorter payload (different field values, fewer behavioral events)
- XTEA params must be fresh-extracted per build (cache can go stale)

### Next priorities
1. Integrate `singleBlob: true` into `scraper/scraper.js` 
2. Add runtime XTEA key extraction (run pipeline on fetched tdc.js during scraper flow)
3. Refresh all stale cache entries by re-running pipeline on fresh tdc.js builds
4. Tests for single-blob mode (28.12, deferred)
