# Plan

## Status
Current phase: Phase 25 (complete)
Current task: None — awaiting user direction on Phase 28 (slider fix)

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)
> **CONCLUSIVE FINDING**: errorCode 9 is NOT caused by token generation. Chrome's own exact `TDC.getData(true)` token, forwarded verbatim to the verify endpoint, ALSO returns errorCode 9. The issue is the **slider solve** — the OpenCV offset calculation (`rawOffset * 0.5 + calibration`) produces incorrect pixel coordinates.
>
> Token generation improvements made during Phase 25:
> - cdArrayOverride with Chrome's full 60-field cd array (no hash stripping)
> - Hash field space-padding in buildCdString (dynamic totalSize extraction)
> - detectAllHashPositions for multi-hash detection
> - Per-token sd length for segment parsing
> - Header, hash, sig segments are byte-identical; cdBody within 32 bytes

| ID | Task | Status |
|----|------|--------|
| 25.1 | cdArrayOverride live test with Chrome's exact cd values | done |
| 25.2 | Analyze results — per-segment size comparison | done |
| 25.3 | Decrypt and diff cdBody plaintext between standalone and Chrome | done |
| 25.4 | Compare pre-encryption cd strings to find serialization divergence | done |
| 25.5 | Strip ALL hash artifacts from Chrome's cd (not just the first) | done |
| 25.6 | Keep full Chrome cd array in cdArrayOverride (no hash stripping) | done |
| 25.7 | Pad hash field in buildCdString to match Chrome's space-padded format | done |
| 25.8 | Fix segment parsing + live re-test | done |
| 25.9 | Fix cd string comparison to exclude sig content from Chrome plaintext | skipped |
| 25.10 | Forward Chrome's exact encrypted token to verify genuine tokens work | done |

### Phase 26: Realistic Fingerprint Profile (deprioritized)
> Deprioritized — Phase 25.10 proved token generation is not the blocker.

| ID | Task | Status |
|----|------|--------|
| 26.1-26.4 | Profile tuning tasks | deprioritized |

### Phase 27: VM Parser Extension for New Templates
> Live server serves templates the VM parser can't handle: 202K-char builds with `thisCtx` identification failures. Extend `pipeline/vm-parser.js`.

| ID | Task | Status |
|----|------|--------|
| 27.1 | Diagnose VM parser failures for new template formats | pending |
| 27.2 | Extend vm-parser for new templates | pending |
| 27.3 | Tests for parser extensions | pending |

### Phase 28: Fix Slider Solve (NEW — critical)
> The slider offset calculation is wrong. Chrome-passthrough proves Chrome's OWN token returns errorCode 9, so the issue is entirely in how we compute the answer pixel coordinates. The current formula: `rawOffset * ratio(0.5) + calibration(-25 ± 5)` consistently produces wrong values.

| ID | Task | Status |
|----|------|--------|
| 28.1 | Investigate slider coordinate system — capture correct answer from manual solve | pending |
| 28.2 | Fix slider offset formula based on correct mapping | pending |
| 28.3 | Tests for slider solve | pending |
| 28.4 | Live re-test with fixed slider + Chrome passthrough | pending |

---

## Current Task

(No task in-progress — awaiting user direction)

Phase 25 is complete. The recommended next phase is **Phase 28: Fix Slider Solve**, which is now the sole blocker for end-to-end CAPTCHA solving.
