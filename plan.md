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
| 21.4 | Integrate into pipeline/run.js and template cache | done |
| 21.5 | Tests for pipeline integration | done |
| 21.6 | Use extracted structure params in collect-generator | pending |
| 21.7 | Live CAPTCHA end-to-end verification | pending |

---

## Current Task

**ID**: 21.6
**Title**: Use extracted structure params in collect-generator
**Phase**: Automated Template Structure Extraction
**Status**: pending

### Goal
Wire the structure params from the template cache into the collect token generation flow. When `generateCollect()` is called from `scraper/scraper.js` or `scripts/chrome-cd-inject.js`, the cached `hashPosition`, `headerSplit`, and `fieldOrder` should be automatically applied instead of using hardcoded defaults.

### What needs to change

1. **`scraper/scraper.js`** (main scraper flow, line ~415): Already passes `cdFieldOrder` from cache. Also pass:
   - `hashPosition` from cache entry (so the hash artifact is inserted at the correct position)
   - `headerSplit` strategy (byte-boundary vs field-boundary) — though currently `buildInputChunks` always does byte-boundary unless `headerFieldCount` is set

2. **`scraper/collect-generator.js`** `generateCollect()` (line ~341): Accept new options:
   - `hashPosition` (number): Where to insert the hash artifact in the cd array. Currently the hash is a SEPARATE segment (chunk[0]) created in `buildInputChunks`. For templates where the hash is embedded in the cd array (like Template B at position 51), the hash should be inserted into the cd array instead of being a separate chunk.
   
   Wait — this is more complex than just passing a parameter. The current architecture treats the hash as a separate encrypted segment (chunk[0]), always. But Chrome's live templates embed the hash WITHIN the cd body (space-padded). This is a fundamental structural difference.
   
   Actually, let me re-examine. From the 21.1 diagnostics: Chrome has 60 fields, we have 59. The hash `[[4,-1,-1,ts,0,0,0,0]]` is at Chrome field[51] WITH space padding. But our code creates a separate hash chunk AND strips the hash from the cd array. So the token structure is:
   - Chrome: header(cd[0:N]) + hash(embedded in cd) + cdBody(rest of cd) + sig
   - Ours: header(cd[0:144 bytes]) + hash(separate segment) + cdBody(cd past 144) + sig
   
   But the ASSEMBLY ORDER is [1,0,2,3] = [header, hash, cdBody, sig]. So the hash is always a separate base64 segment in the final token. The question is: does Chrome embed the hash in the cd body AND also have it as a separate segment? Or is the hash ONLY in the cd body for some templates?
   
   From Phase 19: Template A achieved byte-identical tokens with hash as separate segment. So Template A's structure matches ours. Template B's diagnostic showed the hash at cd[51] in Chrome's decrypted payload — but this is the FULL plaintext (header+cdBody concatenated), not the individual segments.
   
   **Key insight**: The hash is ALWAYS a separate encrypted segment in the token. What we see in Chrome's decrypted plaintext is the FULL payload = header + hash + cdBody. The hash appearing at position 51 in the cd array is because it's BETWEEN the header and cdBody segments in the assembled token. When we decrypt the full token as one block, the hash appears as if it's a cd field.
   
   This means: our current architecture (hash as separate segment) IS correct for all templates. The "hash at cd[51]" finding from 21.1 is an artifact of decrypting the FULL token as one block — the hash segment lands between header and cdBody.

   **So what actually differs?** The remaining issue is just:
   - Field ordering (cdFieldOrder) — already supported
   - Object serialization overrides — detected by detectSerializationDiffs
   - Header split strategy — byte-boundary vs field-boundary

3. **`token/generate-token.js`** `buildInputChunks`: The `headerSplit` strategy could inform whether to use byte-boundary (current default for live templates) or field-boundary (Template A reference). But since byte-boundary works for live templates and field-boundary works for Template A, and both are just "first 144 bytes of payload" vs "first N fields padded to 144", the difference only matters when generating tokens for the reference build.

### Revised scope
Given the insight above, the actual changes needed are smaller:
1. Pass `cdFieldOrder` from cache (already done in scraper.js)
2. Pass `serializationDiffs` to `buildCdString` so it can apply per-field custom serialization
3. This requires modifying `buildCdString` in `token/outer-pipeline.js` to accept an optional `serializationOverrides` map

### Context
- `scraper/collect-generator.js` line 341 — `generateCollect()`
- `scraper/scraper.js` line ~415 — where generateCollect is called
- `token/outer-pipeline.js` line 58 — `buildCdString()`
- `token/generate-token.js` line 100 — `buildInputChunks()`
- `scripts/chrome-cd-inject.js` — diagnostic script that also calls generateCollect

### Verification
- [ ] `npm test` passes 218/220
- [ ] `buildCdString` can accept serialization overrides
- [ ] Scraper flow passes structure params from cache to token generation

### Suggested Agent
general-purpose
