# Plan

## Status
Current phase: Phase 34
Current task: 35.1 — Create source deobfuscator module

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve — Token Isolation (done)
> Standalone token accepted by server (errorCode 0) via Puppeteer request interception.

### Phase 29: Cache Refresh & TLS Verification (done)
> All 10 templates refreshed. cap_union_new_show 403 was missing sess, not TLS.
> Full headless flow confirmed possible.

### Phase 30: Puppeteer-Free Domain Query (done)
> `node scraper/cli.js --verbose https://example.com` works end-to-end.
> CAPTCHA solve + urlsec query with zero Puppeteer dependency. Confirmed 2026-04-11.

### Phase 31: Auto-Port Unknown Templates in Scraper (done)
> When the scraper encounters an unknown template, automatically run the porting
> pipeline as a subprocess, cache the result, and retry — instead of failing.
> Confirmed working 2026-04-11.

### Phase 32: Switch Template Cache Key to Source Hash (done)
> TDC_NAME is not a reliable cache key — same TDC_NAME can map to different XTEA
> params across builds (confirmed in 28.13/28.14). Replaced with SHA-256 hash of
> tdc.js source after stripping the eks token. Cache cleared and re-seeded. 2026-04-12.

### Phase 33: TDC Survey — Collect Live Template Data
> Clear the cache, run the scraper repeatedly, save each unique tdc.js build,
> record which builds port successfully vs fail, and which still get errorCode 12.
> Output a structured report for analysis.

| ID | Task | Status |
|----|------|--------|
| 33.1 | Create tdc.js survey script | done |
| 33.2 | Tests for survey script | done |
| 33.3 | Run survey and analyze results | done |

---

## Survey Results (Phase 33)

30 attempts → **10 unique builds** observed.

| Hash | Opcodes | Template | Size | Port | Solves | errorCodes |
|------|---------|----------|------|------|--------|------------|
| e6a45ba64d246f82 | 98 | unknown | 129K | OK | 4 | -1,-1,err:verify,12 |
| 79dd6b418d0a7406 | 94 | B | 131K | OK | 3 | 12,12,9 |
| 3e77d1890dff73ab | 98 | unknown | 147K | OK | 2 | -1,12 |
| 83d7be69627c3d9e | 95 | A | 133K | OK | 4 | 12,-1,-1,12 |
| 27dda893f81dbc4f | ? | ? | 202K | FAIL:vm-parse | 4 | - |
| 3429444f324c6110 | ? | ? | 199K | FAIL:vm-parse | 3 | - |
| 5cc91a7dbcc64cdb | 94 | B | 132K | OK | 4 | 12,12,12,12 |
| e5341ccb12b78e65 | 96 | unknown | 144K | OK | 2 | 12,12 |
| 0e2b306a1f0e24b6 | 94 | B | 131K | OK | 2 | 12,12 |
| e2170903e201e018 | ? | ? | 162K | FAIL:vm-parse | 2 | - |

**Key findings**:
- **7/10 builds port successfully** (vm-parser + pipeline OK)
- **3/10 builds fail vm-parse** ("Could not identify thisCtx variable") — all are large (162K-202K), likely a new VM architecture
- **errorCode -1 (success) achieved** on 3 distinct builds (e6a45ba6, 3e77d189, 83d7be69)
- **errorCode 12 dominates** — even ported builds frequently get 12 (token rejected)
- **errorCode 9** seen once (wrong slider answer)
- Template classification: 1× A (95 ops), 3× B (94 ops), 3× "unknown" (96/98 ops), 3× unparseable

### Phase 34: Fix VM Parser for Obfuscated Builds
> The 3 unparseable builds (162K-202K) use obfuscated property access:
> `['call']` instead of `.call`, and `array[decoderFn(0xNN)]()` instead of
> `array.pop()`. Two fixes needed in vm-parser.js: extractThisCtx and
> extractCatchVars.

| ID | Task | Status |
|----|------|--------|
| 34.1 | Fix extractThisCtx and extractCatchVars for obfuscated builds | done |
| 34.2 | Tests for vm-parser obfuscation fixes | done |
| 34.3 | Re-run survey to verify all builds port | done |

---

## Current Task

**ID**: 34.1
**Title**: Fix extractThisCtx for bracket-notation .call()
**Phase**: Fix VM Parser for Bracket-Notation Builds
**Status**: in-progress

## Survey Results (Phase 34 — post-fix)

20 attempts → **10/10 builds port OK** (was 7/10 before fix).

| Hash | Opcodes | Mapped | XTEA Key | Solves | errorCodes |
|------|---------|--------|----------|--------|------------|
| 0e2b306a | 94 | 91/94 | OK | 2 | -1,12 |
| 27dda893 | 103 | 43/103 | OK | 1 | 12 |
| 3e77d189 | 98 | 92/98 | OK | 1 | -1 |
| 83d7be69 | 95 | 91/95 | OK | 4 | -1,-1,12,12 |
| e6a45ba6 | 98 | 92/98 | OK | 4 | -1,12,12,12 |
| 79dd6b41 | 94 | 92/94 | OK | 1 | 12 |
| 5cc91a7d | 94 | 90/94 | OK | 1 | -1 |
| e2170903 | 93 | 48/93 | **null** | 1 | 12 |
| 3429444f | 91 | 41/91 | **null** | 2 | 12,12 |
| e5341ccb | 96 | 94/96 | OK | 3 | 12,12,12 |

**New finding**: 2 obfuscated builds (e2170903, 3429444f) pass vm-parse but fail opcode mapping
(~50% mapped) and produce null XTEA keys. The opcode-mapper's pattern matching doesn't
handle obfuscated case handler code. These builds need opcode-mapper improvements.

### Phase 35: Source Deobfuscator for Opcode Mapper
> Obfuscated builds use two layers: (1) a string decoder function that replaces
> method names like `.call`, `.push`, `.fromCharCode` with `obj[decoder(0xNN)]`,
> and (2) a helper wrapper object that replaces binary operators like `a + b`
> with `helper.prop(a, b)`. The deobfuscator rewrites the source before parsing
> so the existing mapper patterns match unchanged.

| ID | Task | Status |
|----|------|--------|
| 35.1 | Create source deobfuscator module | in-progress |
| 35.2 | Tests for deobfuscator | pending |
| 35.3 | Integrate deobfuscator into pipeline | pending |
| 35.4 | Tests for pipeline integration | pending |
| 35.5 | Re-run survey to verify obfuscated builds port | pending |

---

## Current Task

**ID**: 35.1
**Title**: Create source deobfuscator module
**Phase**: Source Deobfuscator for Opcode Mapper
**Status**: in-progress

### Goal
Create `pipeline/deobfuscator.js` — a module that detects and deobfuscates tdc.js
source code, replacing runtime-decoded property access and helper wrapper calls with
their plain equivalents so the opcode mapper can pattern-match normally.

### Context

**Obfuscation structure** (verified on `output/tdc-survey/3429444f324c6110.js`):

1. **String decoder**: A function `_0x23fe` (name varies) at the top of the file. It indexes
   into a rotated string array to return method names. Inside the VM dispatch function, a
   local alias like `_0x4cf4d2 = _0x5ea2bf` points to it. Usage: `obj[_0x4cf4d2(0x166)]`
   resolves to `obj['push']` at runtime.

2. **Helper wrapper object**: An object `_0x3a0c29` (name varies) defined in the dispatch
   function's scope. Properties are either:
   - Direct binary ops: `rEmln: function(a, b) { return a >= b; }` → operator `>=`
   - Indirect wrappers: `LGEVg: function(a, b) { return _0x25d7ea[decoded](a, b); }` → another lookup
   - Function call wrappers: `ZffSA: function(a,b,c,d,e) { return a(b,c,d,e); }` → call passthrough

3. **Resolved decoder values** (28 unique args in this build):
   `call`, `apply`, `shift`, `push`, `pop`, `fromCharCode`, `length`, `charCodeAt`, `split`
   Plus helper property names that cross-reference each other.

**Detection heuristic**: An obfuscated build has:
- The dispatch function's variables use `_0x` prefix names (already known from vm-parser)
- A `function _0xNNNN(a, b)` at top-level that indexes into an array

**Deobfuscation approach** — source-level string replacement:

1. **Find the decoder function**: Look for top-level `function _0xNNNN` declarations.
   The decoder has 2 params and references another function that returns a string array.
2. **Find the bootstrap**: Extract everything from the decoder function definition through
   its dependencies (string array function, rotation IIFE). The bootstrap starts at the
   first top-level function declaration and ends at the last top-level statement before
   the main IIFE or `window.` reference.
3. **Eval the bootstrap** in a `vm.createContext()` sandbox to get a working decoder.
4. **Find the decoder alias** inside the dispatch function: the local variable that equals
   the global decoder (e.g., `var _0x4cf4d2 = _0x5ea2bf` where `_0x5ea2bf` is an alias chain
   to the global decoder).
5. **Replace decoder calls**: For each `localDecoder(0xNN)` call in the source, replace
   with the resolved string literal. E.g., `obj[_0x4cf4d2(0x166)]` → `obj['push']`.
6. **Resolve the helper wrapper object**: Parse the helper object's properties. For each:
   - If body is `return a OP b` → classify as binary operator
   - If body is `return a(b, c, ...)` → classify as call passthrough
   - If body is `return a in b` → classify as `in` operator
   - If body calls through another object → try to resolve recursively (one level)
7. **Replace helper wrapper calls**: For each `helper.prop(a, b)` in the source, replace
   with `(a OP b)` for binary ops, or `a(b, c, ...)` for call passthroughs.

**API**:
```js
/**
 * @param {string} source - Raw tdc.js source code
 * @returns {{ deobfuscated: string, isObfuscated: boolean, decoderMap: Object, helperMap: Object }}
 */
function deobfuscate(source) { ... }
```

**Key files**:
- `pipeline/deobfuscator.js` — new module
- `output/tdc-survey/3429444f324c6110.js` — test input (91 cases, obfuscated)
- `output/tdc-survey/e2170903e201e018.js` — test input (93 cases, obfuscated)
- `output/tdc-survey/27dda893f81dbc4f.js` — test input (103 cases, obfuscated)
- `targets/tdc.js` — test input (95 cases, NOT obfuscated — should pass through unchanged)

### Implementation Steps
1. Create `pipeline/deobfuscator.js`
2. Implement `isObfuscated(source)` detection
3. Implement `extractDecoderBootstrap(source)` → finds decoder function + deps, returns evaluable code
4. Implement `resolveDecoder(bootstrap)` → evals in sandbox, returns `{ decoderFn, decoderName }`
5. Implement `findDecoderAlias(source, globalDecoderName)` → finds the local alias inside dispatch fn
6. Implement `replaceDecoderCalls(source, localAlias, decoderFn)` → string replacement
7. Implement `resolveHelperObject(source, decoderFn)` → parses helper object, classifies each property
8. Implement `replaceHelperCalls(source, helperName, helperMap)` → replaces `helper.prop(a,b)` with `(a OP b)`
9. Wire it all together in `deobfuscate(source)`

### Verification
- [ ] `node -c pipeline/deobfuscator.js` passes
- [ ] Non-obfuscated input passes through unchanged: `deobfuscate(tdc.js).isObfuscated === false`
- [ ] Obfuscated input is deobfuscated: `deobfuscate(3429444f).isObfuscated === true`
- [ ] Deobfuscated source parses with acorn (no syntax errors)
- [ ] Opcode mapper on deobfuscated source: mapping rate >85% (up from ~45%)

### Suggested Agent
general-purpose

### Suggested Agent
general-purpose
