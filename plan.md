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
| 21.1 | Map all object serialization differences | pending |
| 21.2 | Fix buildCdString with per-field custom serializers | pending |
| 21.3 | Verify fix via live forensics comparison | pending |
| 21.4 | Live CAPTCHA test with all fixes | pending |

---

## Current Task

**ID**: 21.1
**Title**: Map all object serialization differences
**Phase**: Fix Object Serialization in buildCdString
**Status**: pending

### Goal
Extend the cd string diagnostic in `chrome-cd-inject.js` to identify EVERY position where Chrome's cd string diverges from our `buildCdString()` output. Currently we found one diff at position 145 (`intlOptions` has 2 keys in Chrome vs 4 in ours). There are likely more differences in other complex fields (audioFingerprint, highEntropyValues, storageEstimate, plugins, etc.).

### What we know
From the last diagnostic run (96-opcode live template):
- Chrome cd string: 2881 chars
- Our buildCdString: 2862 chars  
- Diff: -19 chars (ours is shorter)
- First diff at position 145: `intlOptions` — Chrome emits `{timeZone, calendar}` (2 keys), we emit `{timeZone, calendar, numberingSystem, locale}` (4 keys)

Wait — ours is 19 chars SHORTER but Chrome has MORE keys removed... this means the difference comes from MULTIPLE fields, some longer in Chrome, some shorter. We need to see ALL diffs, not just the first one.

### Approach
Modify the diagnostic to:
1. After finding the first diff, continue scanning to find ALL diff positions
2. For each diff region, identify which cd field (by index) the diff falls in  
3. Show Chrome's serialization vs ours for each differing field
4. Produce a complete list of fields that need custom serializers

Alternatively, do a FIELD-BY-FIELD comparison: for each of the 59 cd fields, serialize it with `JSON.stringify` and compare with what Chrome's cd string has at that position. Walk both strings in parallel, extracting fields by tracking JSON depth.

### Context
- `scripts/chrome-cd-inject.js` — already has the diagnostic code (DIAG section after step 7b)
- `token/outer-pipeline.js` — `buildCdString()` at line 58
- The diagnostic already reconstructs Chrome's cd string from header+cdBody segments
- Need to add field-level extraction and comparison

### Verification
- [ ] Diagnostic logs every field where Chrome's serialization differs from JSON.stringify
- [ ] Each diff shows: field index, Chrome's serialization, our serialization, length difference

### Suggested Agent
general-purpose
