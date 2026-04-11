# Plan

## Status
Current phase: Phase 21
Current task: 21.1 — Map all object serialization differences

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

### Phase 21: Fix Object Serialization in buildCdString
> Chrome's hand-rolled serializer (`func_276`) emits only specific keys for each complex cd field object. Our `buildCdString` uses `JSON.stringify` which includes ALL keys. Fix each diverging field to match Chrome's output.

| ID | Task | Status |
|----|------|--------|
| 21.1 | Map all object serialization differences | done |
| 21.2 | Fix buildCdString with per-field custom serializers | pending |
| 21.3 | Verify fix via live forensics comparison | pending |
| 21.4 | Live CAPTCHA test with all fixes | pending |

---

## Current Task

**ID**: 21.2
**Title**: Fix buildCdString with per-field custom serializers
**Phase**: Fix Object Serialization in buildCdString
**Status**: pending

### Goal
Based on 21.1 findings, the cd string diffs between Chrome and our buildCdString fall into TWO categories:
1. **Hash artifact positioning**: Chrome embeds `[[4,-1,-1,ts,0,0,0,0]]` at field[51] (space-padded to ~56 chars). Our code strips hash artifacts and has 59 fields vs Chrome's 60. The hash position varies by template.
2. **Object key filtering** (from earlier intlOptions finding on a different template): Chrome's `func_276` serializes only specific keys per object type, while our `JSON.stringify` includes all keys.

The 94-opcode template (Template B) shows:
- Chrome: 60 fields (including hash artifact at [51])
- Ours: 59 fields (hash stripped)
- 51/60 fields match perfectly
- 9 diffs: all caused by the hash artifact at position 51 shifting subsequent fields by 1

**The real fix**: Stop stripping hash artifacts from the cd array before serialization. The hash IS a cd field — it belongs in the serialized cd string. Our code currently strips it and puts it in a separate segment, but Chrome keeps it inline.

Wait — this contradicts the Template A forensics from Phase 19 where byte-identical tokens WERE achieved. In Template A, the hash was at cd[11] and WAS stripped. So the hash handling differs by template. Need to check whether Template A strips vs embeds.

### Context
- `scripts/chrome-cd-inject.js` — field-by-field diagnostic (just completed in 21.1)
- `token/outer-pipeline.js` — `buildCdString()` at line 58
- `token/generate-token.js` — `buildInputChunks()` where hash is handled
- `scraper/collect-generator.js` — `generateCollect()` where hash artifacts are stripped from cdArrayOverride
- Phase 19 notes: For Template A, byte-identical tokens achieved WITH hash stripping + separate hash segment

### Implementation Steps
1. Run the diagnostic on a Template A build (via ref-inject-forensics) to confirm hash handling for Template A
2. Compare Template A hash handling vs Template B hash handling
3. If hash treatment differs by template, parameterize it in generateCollect/buildInputChunks
4. For the `intlOptions` object key filtering (found on earlier 96-opcode template), add custom serializer to buildCdString for objects that func_276 serializes selectively

### Verification
- [ ] `npm test` passes 173/175 (no regressions)
- [ ] ref-inject-forensics.js still produces byte-identical tokens for Template A
- [ ] chrome-cd-inject.js field diagnostic shows 0 diffs for at least one live template

### Suggested Agent
general-purpose
