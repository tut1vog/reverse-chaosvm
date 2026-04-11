# Plan

## Status
Current phase: Phase 21
Current task: 21.7 — Live CAPTCHA end-to-end verification

---

## Phases

### Phases 1-11: Foundation, Pipeline, Scraper (all done)

### Phases 12-16: ErrorCode 9 Investigation (all done)
> Identified collect token as root cause. Chrome's own token accepted, standalone rejected.

### Phase 17: Chrome cd Injection (done)
> Proved cd VALUES alone don't cause errorCode 9.

### Phase 18: Token Forensics (done)
> Proved XTEA cipher is mathematically correct (round-trip). Key extraction for live builds initially failed, later fixed.

### Phase 19: Reference tdc.js Injection (done)
> **Byte-identical tokens** for Template A (reference build). Key fixes: header field-boundary split + duplicated comma. Also fixed pipeline key extraction for all 4 keyMod indices.

### Phase 20: Live Template Investigation (done)
> Key discoveries:
> - Per-TDC_NAME pipeline key extraction works at runtime ✅
> - Hash artifacts in decrypted cd must be stripped (60→59 fields) ✅
> - sd structure: Chrome uses `{od,clientType}` only — no slide data ✅
> - Header split: live templates use straight byte-boundary (144 bytes, no field-boundary padding) ✅
> - **cd serialization**: `buildCdString` uses `JSON.stringify` for nested objects, but Chrome's `func_276` serializes only SPECIFIC keys per object type — 19-char difference at `intlOptions` alone ✅

### Phase 21: Automated Template Structure Extraction
> Build a pipeline module (`pipeline/structure-extractor.js`) that automatically extracts cd structure parameters from any tdc.js build — analogous to how `key-extractor.js` extracts XTEA keys via dynamic tracing. Parameters: hash artifact position, cd field order, object serialization rules, header split strategy. Results stored in template cache alongside XTEA params.

| ID | Task | Status |
|----|------|--------|
| 21.1 | Map all object serialization differences (diagnostic tool) | done |
| 21.2 | Create structure-extractor pipeline module | done |
| 21.3 | Tests for structure-extractor | done |
| 21.4 | Integrate into pipeline/run.js and template cache | done |
| 21.5 | Tests for pipeline integration | done |
| 21.6 | Use extracted structure params in collect-generator | done |
| 21.7 | Live CAPTCHA end-to-end verification | pending |

---

## Current Task

**ID**: 21.7
**Title**: Live CAPTCHA end-to-end verification
**Phase**: Automated Template Structure Extraction
**Status**: pending

### Goal
Run the full pipeline (including new Stage 5) against a live tdc.js build and verify that structure extraction works end-to-end. Then run chrome-cd-inject diagnostic to confirm reduced field-level diffs.

### Steps
1. Fetch latest tdc.js from Tencent's endpoint
2. Run `pipeline/run.js` on it (all 5 stages)
3. Check structure-params.json output — hash position, field order, serialization diffs, header split
4. Run `chrome-cd-inject.js` with structure params applied
5. Compare field-level diffs before vs after

### Verification
- [ ] Pipeline completes all 5 stages without error
- [ ] structure-params.json contains valid extraction results
- [ ] Field-level diagnostic shows fewer diffs with structure params applied

### Suggested Agent
general-purpose — or manual testing
