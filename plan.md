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
| 21.3 | Tests for structure-extractor | done |
| 21.4 | Integrate into pipeline/run.js and template cache | pending |
| 21.5 | Tests for pipeline integration | pending |
| 21.6 | Use extracted structure params in collect-generator | pending |
| 21.7 | Live CAPTCHA end-to-end verification | pending |

---

## Current Task

**ID**: 21.4
**Title**: Integrate structure-extractor into pipeline/run.js and template cache
**Phase**: Automated Template Structure Extraction
**Status**: pending

### Goal
Add structure extraction as Stage 5 of the automated porting pipeline (`pipeline/run.js`). After XTEA key extraction (Stage 3), run `extractStructure()` to capture cd structure parameters. Store the results in the template cache alongside XTEA params.

### Implementation Steps
1. **pipeline/run.js**: Add Stage 5 after Stage 3 (key extraction) or Stage 4 (token verification):
   - Import `extractStructure` from `./structure-extractor`
   - Call `await extractStructure(tdcPath, keyResult)` with the path and extracted XTEA params
   - Save structure result to `output/<stem>/structure-params.json`
   - Include structure params in `pipeline-config.json`
   - Add `--skip-structure` flag to skip this stage (like `--skip-verify`)

2. **scraper/template-cache.js**: Extend the cache entry schema to include structure params:
   - `hashPosition` (number)
   - `fieldOrder` (number[])  
   - `serializationDiffs` (array)
   - `headerSplit` (object: { strategy, contentLength, paddingLength })
   - Update `store()` to accept these fields
   - Update `seed()` to load structure params from pipeline-config.json

3. **scraper/collect-generator.js**: (preparation only — actual usage is task 21.6)
   - No changes needed yet, but ensure headerFieldCount is still passable via options

### Context
- `pipeline/run.js` — current 4-stage pipeline (parse → map → extract key → verify token)
- `pipeline/structure-extractor.js` — the new module (just created)
- `scraper/template-cache.js` — stores per-TDC_NAME params
- `output/*/pipeline-config.json` — combined pipeline output

### Verification
- [ ] `node -c pipeline/run.js` passes
- [ ] `npm test` passes 209/211
- [ ] `pipeline/run.js` exports or accepts `--skip-structure` flag
- [ ] Template cache `store()` accepts and persists structure params
- [ ] Template cache `seed()` loads structure params from pipeline-config.json

### Suggested Agent
general-purpose
