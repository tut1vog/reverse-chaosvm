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
| 21.2 | Create structure-extractor pipeline module | pending |
| 21.3 | Tests for structure-extractor | pending |
| 21.4 | Integrate into pipeline/run.js and template cache | pending |
| 21.5 | Tests for pipeline integration | pending |
| 21.6 | Use extracted structure params in collect-generator | pending |
| 21.7 | Live CAPTCHA end-to-end verification | pending |

---

## Current Task

**ID**: 21.2
**Title**: Create structure-extractor pipeline module
**Phase**: Automated Template Structure Extraction
**Status**: pending

### Goal
Create `pipeline/structure-extractor.js` — a module that, given a tdc.js source + XTEA params, launches Puppeteer, captures Chrome's encrypted collect token, decrypts it, and extracts structural parameters by comparing Chrome's raw cd string with our `buildCdString()` output.

This mirrors the pattern of `pipeline/key-extractor.js`: instrument → run in Puppeteer → capture → analyze → return structured result.

### What to extract

1. **hashPosition** (number): Index in the cd array where the hash artifact `[[4,-1,-1,ts,0,0,0,0]]` appears. Template A has it at index 11; Template B has it at index 51; others unknown. Detected by scanning the decrypted cd array for the pattern.

2. **cdFieldOrder** (number[]): Mapping from Chrome's cd field indices to our 59-field schema. Uses the signature/heuristic matching engine already implemented in `scripts/discover-field-order.js` (lines 144-350). Should be extracted into a reusable module.

3. **serializationOverrides** (object): Per-field-index map of fields where Chrome's `func_276` serializes differently from `JSON.stringify`. Detected by the field-by-field comparison already implemented in `scripts/chrome-cd-inject.js` (lines 593-733). For each differing field, stores the KEYS that Chrome emits (e.g., `{9: ["timeZone", "calendar"]}` for intlOptions).

4. **headerSplitStrategy** (string): Either `"field-boundary"` (Template A: split after N fields, pad with spaces) or `"byte-boundary"` (live templates: split at byte 144, no padding). Detected from header padding analysis.

### Approach
The module should:
1. Accept `(tdcSource, xteaParams)` as input
2. Launch Puppeteer with stealth, load a minimal CAPTCHA page (prehandle → show → TDC.getData)
3. Capture Chrome's encrypted collect token
4. Decrypt using provided XTEA params
5. Extract hash position from cd array
6. Run field-order matching (reuse logic from discover-field-order.js)
7. Run field-level serialization comparison (reuse logic from chrome-cd-inject.js DIAG)
8. Analyze header padding to determine split strategy
9. Return a structured result object

### Context
- `pipeline/key-extractor.js` — pattern to follow (instrument → Puppeteer → analyze)
- `scripts/discover-field-order.js` lines 144-350 — field matching engine (signatureMatch + heuristicMatch)
- `scripts/chrome-cd-inject.js` lines 593-733 — field-by-field serialization comparison
- `token/outer-pipeline.js` line 58 — `buildCdString()` 
- `token/collector-schema.js` — 59-field schema definition
- `scraper/template-cache.js` — where results will be stored (task 21.4)

### Implementation Steps
1. Extract the field matching engine from `scripts/discover-field-order.js` into a reusable module (either in `pipeline/` or `token/`)
2. Extract the `parseCdFields()` and field comparison logic from `scripts/chrome-cd-inject.js` into a reusable function
3. Create `pipeline/structure-extractor.js` with:
   - `async function extractStructure(tdcPath, xteaParams)` — main entry point
   - Internal: launch Puppeteer, navigate CAPTCHA, get token, decrypt, analyze
   - `detectHashPosition(cdArray)` — scan for `[[4,-1,-1,*,0,0,0,0]]` pattern
   - `matchFieldOrder(cdArray, schemaLookup)` — call extracted field matching engine
   - `detectSerializationDiffs(chromePlaintext, cdArray)` — compare func_276 vs JSON.stringify per field
   - `analyzeHeaderSplit(chromePlaintext)` — check first 144 chars for trailing space padding
4. Return result object: `{ hashPosition, cdFieldOrder, serializationOverrides, headerSplitStrategy, chromeCdLength, notes }`
5. Export main function + individual detection helpers (for testing)

### Verification
- [ ] `node -c pipeline/structure-extractor.js` passes
- [ ] `npm test` still passes 173/175
- [ ] Module exports `extractStructure` and helper functions
- [ ] `detectHashPosition` correctly identifies hash at known positions (unit-testable with mock cd arrays)
- [ ] `parseCdFields` correctly splits a known cd string into individual fields (unit-testable)

### Suggested Agent
general-purpose
