# Plan

## Status
Current phase: Phase 23
Current task: 23.3 — Tests for header split logic

---

## Phases

### Phases 1-20: Foundation through Live Template Investigation (all done)

### Phase 21: Automated Template Structure Extraction (done)
> Built `pipeline/structure-extractor.js` (Stage 5). Extracts hash position, field order, serialization diffs, header split from any tdc.js build. Integrated into pipeline, template cache, and token generation flow. 218/220 tests.

### Phase 22: Reliable Key Extraction for Live Templates
> The pipeline extracts correct keys from saved tdc.js files but fails ~50% of the time on live templates. Root cause: `analyzeTrace()` produces `keyMods: [0,0]` for some templates, and stale cached keys don't match rotated TDC_NAMEs. Until key extraction works reliably for ANY live template, nothing else can be validated.

| ID | Task | Status |
|----|------|--------|
| 22.1 | Diagnose key extraction failures on live templates | done |
| 22.2 | Fix keyModConstants legacy format lossy serialization | done |
| 22.3 | Tests for key extraction fixes | done |

### Phase 23: Header Split Strategy Application
> `analyzeHeaderSplit()` returns "unknown" for live templates because full-token decryption scrambles segment boundaries. The extracted `headerSplit` is stored in cache but never applied in `buildInputChunks()`. Fix detection and wire the strategy through to token generation.

| ID | Task | Status |
|----|------|--------|
| 23.1 | Fix analyzeHeaderSplit for full-token decrypted plaintext | done |
| 23.2 | Wire headerSplit through to buildInputChunks | done |
| 23.3 | Tests for header split logic | pending |

### Phase 24: End-to-End Live Verification
> With reliable key extraction (Phase 22) and correct header splitting (Phase 23), run live tests to validate: cdFieldOrder produces correct reordering, serialization overrides reduce diffs, full token matches Chrome's output. Target: 0 field-level diffs on at least one live template.

| ID | Task | Status |
|----|------|--------|
| 24.1 | Live test: decrypt Chrome token + field-by-field comparison | pending |
| 24.2 | Fix remaining diffs found in 24.1 | pending |
| 24.3 | Live CAPTCHA submission — aim for errorCode != 9 | pending |

---

## Current Task

**ID**: 23.3
**Title**: Tests for header split logic
**Phase**: Header Split Strategy Application
**Status**: pending

### Goal
Add tests covering the `buildInputChunks` headerSplit wiring: field-boundary splitting with padding and comma duplication, byte-boundary default behavior, and the full passthrough from collect-generator.

### Context
- `token/generate-token.js` — `buildInputChunks()` now accepts `options.headerSplit`
- `scraper/collect-generator.js` — passes `opts.headerSplit` through
- Existing tests: `tests/test-outer-pipeline.js` has buildInputChunks tests (read to find exact location)

### Implementation Steps
1. Add tests in the existing test file for `buildInputChunks`:
   - Default (no headerSplit): header is 144 bytes, split at position 144
   - field-boundary with contentLength=50: header has 94 trailing spaces, cdBody starts with `,`
   - field-boundary with contentLength=133: header has 11 trailing spaces (Template A pattern)
   - byte-boundary explicit: same as default
   - No headerSplit option: no regression vs current behavior
2. Run `npm test` to verify

### Verification
- [ ] `npm test` passes with new tests (2 known failures only)
- [ ] Tests cover both strategies and comma duplication

### Suggested Agent
general-purpose
