# Plan

## Status
Current phase: Phase 21
Current task: 21.2 — Create structure-extractor pipeline module

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
| 21.3 | Tests for structure-extractor | pending |
| 21.4 | Integrate into pipeline/run.js and template cache | pending |
| 21.5 | Tests for pipeline integration | pending |
| 21.6 | Use extracted structure params in collect-generator | pending |
| 21.7 | Live CAPTCHA end-to-end verification | pending |

---

## Current Task

**ID**: 21.3
**Title**: Tests for structure-extractor
**Phase**: Automated Template Structure Extraction
**Status**: pending

### Goal
Write unit tests for the 4 synchronous helper functions in `pipeline/structure-extractor.js`. The `extractStructure` async function (Puppeteer-based) is NOT tested here — it will be validated in live integration (task 21.7).

### What to test

1. **detectHashPosition**
   - Returns correct index for hash at various positions (0, 11, 51, 59)
   - Returns -1 when no hash present
   - Returns -1 for similar-but-wrong patterns (wrong length, wrong sentinel values)
   - Handles empty array, single-element array

2. **matchFieldOrder**
   - Correctly identifies signature fields: userAgent (by "Mozilla/5.0"), languages (locale array), videoCodecs (codec+support), audioCodecs, intlOptions (timeZone+calendar), etc.
   - Skips hash position (field at hash index gets -1)
   - Returns correct unmatchedCount
   - Handles edge case: all-null array, empty array

3. **detectSerializationDiffs**
   - Returns 0 diffs for identical serialization
   - Detects diff when Chrome's cd string has fewer keys in an object field
   - Detects diff when field count differs (Chrome 60 vs ours 59)
   - Handles plaintext with both cd and sd sections

4. **analyzeHeaderSplit**
   - Returns "field-boundary" with correct padding count when spaces present
   - Returns "byte-boundary" when no trailing spaces in first 144 chars
   - Returns "unknown" for malformed input

### Context
- `pipeline/structure-extractor.js` — the module under test
- `token/collector-schema.js` — COLLECTOR_SCHEMA used by matchFieldOrder
- `tests/` directory — existing test files follow Node.js test runner (`node:test` + `node:assert`)
- Convention: test file named `tests/test-structure-extractor.js`

### Verification
- [ ] `node --test tests/test-structure-extractor.js` passes all tests
- [ ] `npm test` still passes with the new test file included (current: 173/175)
- [ ] At least 15 test cases covering all 4 functions
- [ ] No mocking of the module — tests use real function calls with crafted inputs

### Suggested Agent
general-purpose
