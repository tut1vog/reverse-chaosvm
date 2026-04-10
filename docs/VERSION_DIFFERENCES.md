# ChaosVM Version Differences & Porting Guide

## Purpose

This document compares multiple tdc.js builds to identify what changes between versions vs. what stays the same. Use this to fast-track reverse engineering of a new tdc.js build or to build automated tooling that handles any version.

---

## Empirical Findings: 3-Build Live Comparison (2026-04-03)

Three builds were fetched from the live Tencent captcha endpoint on the same day, minutes apart:

| Property | Build A (`tdc.js`, original) | Build B (`tdc-v2.js`) | Build C (`tdc-v3.js`) |
|----------|------------------------------|----------------------|----------------------|
| TDC_NAME | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` | `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` |
| File lines | 586 | 603 | 586 |
| Opcode count | 95 (0-94) | 94 (0-93) | 95 (0-94) |
| Decoded ints | 70,017 | 68,159 | 70,017 |
| Start PC | 36,578 | 26,913 | 36,578 |
| Date helper 1 | `_ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF` | `_dMGBCYOfFCSiJVEOeSWaCAhQKPDbHgic` | `_ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF` |
| Date helper 2 | `_fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO` | `_jfPJRNNknfNKjWETVfQkichYSlWCkCXb` | `_fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO` |
| Constants | `[void 0, null, 0x9e3779b9, 0x13c6ef3720, .75, .8, .005]` | identical | identical |
| Config string (line 123) | `ojNkKZg5a3jR...` | `pha0Smbyuhy...` | `7r8JkaohOcTR...` |
| VM bytecode blob | identical to C | completely different | identical to A |
| VM variable names | `i,C,Y,Q,G,F,J,h,w` | `S,R,w,C,G,o,K,M` | identical to A |

### Key Discovery: Two-Layer Variation Model

**Layer 1 — VM Template (small pool, rotated)**:
Builds A and C share the **exact same VM template** — identical switch cases, variable names, bytecode blob, start PC, TDC_NAME, date helper names. The ONLY difference is the config string on line 123 (1 line out of 586). Build B is a **different template** with reshuffled opcodes, different variable names, different bytecode, different everything.

**Layer 2 — Per-Request Config (changes every request)**:
The encrypted config string on line 123 (`window[TDC_NAME] = '...'`) changes on every request, even within the same template. This string is derived from the `js_data` URL parameter and contains session-specific data (timestamp, app context, server nonce).

**Implication**: Tencent maintains a **small pool of VM templates** (estimated 2-10) and serves them randomly. Each response also gets a unique per-request config string. The opcode shuffle is a per-template defense, not a per-request defense.

### Opcode Shuffle Evidence

Every single opcode number maps to a different operation between templates A and B. Examples:

| Operation | Template A (tdc.js) | Template B (tdc-v2.js) |
|-----------|-------------------|----------------------|
| ADD (`+`) | case 0 | case 19 |
| MUL (`*`) | case 4 | case 5 |
| RETURN | case 60 | case 29 |
| CJMP | case 87 | case 8 |
| THROW | case 37 | case 12 |
| TYPEOF | case 34 | case 86 |
| PROP_GET_K | case 45 | case 13 |
| LOAD_K | case 47 | case 55 |
| EMPTY_STR | case 93 | case 93 (coincidence) |

The shuffle is a full random permutation — no offset, no pattern, no shortcut.

### Same Algorithm, Different Packaging

Despite the complete opcode reshuffle, the templates perform the same work:
- **Bytecode sizes within 2.7%** (70,017 vs 68,159 decoded ints) — the small difference is from compound opcode fusion
- **Identical constants pool**: `[void 0, null, 0x9e3779b9, 0x13c6ef3720, .75, .8, .005]` — same TEA cipher parameters
- **Same fingerprint collection**: ~40 browser APIs probed (navigator, screen, canvas, WebGL, audio, fonts, storage, touch, bot detection, mouse/touch events)
- **Same TDC API surface**: `getInfo()`, `setData()`, `getData()`, `clearTc()`

---

## Historical Build Comparison

| Property | Build A (old_report.md) | Build B (this project) |
|----------|------------------------|------------------------|
| File lines | 611 | 586 |
| Bytecode string length | 121,300 chars | ~100,000 chars (estimated) |
| Decoded integer count | 76,974 | 70,146 (129 config + 70,017 main) |
| Opcode count | 100 (0-99) | 95 (0-94) |
| Main entry PC | 55,674 | 36,579 |
| Date helper 1 | `_HlZCWFjcEjWigaSUalkaEdYfSXacCDih` | `_ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF` |
| Date helper 2 | `_lgYGXYfBJnUaXMhMWZhQGdfOXGEdAeZM` | `_fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO` |
| Config bytecode var | `window[TDC_NAME]` | `window.FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` |
| TDC_NAME value | `XdNbfRdNcbbbUUPQBFhZRfbdjEjmfJjP` | (different random string) |
| VM register var | `C` | `i` |
| VM PC var | `w` | `C` |
| VM bytecode var | `Q` | `Y` |
| VM exception var | `D` | `G` |

---

## What Changes Between Builds (POLYMORPHIC)

### 1. Opcode Numbering (COMPLETELY RESHUFFLED)

This is the most impactful change. The same semantic operation gets a different case number in every build.

**Build A** (old report):
- Op 0 = DELETE, Op 6 = THROW, Op 87 = CALL_MOV, Op 89 = ADD

**Build B** (this project):
- Op 0 = ADD, Op 9 = DELETE, Op 37 = THROW, Op 87 = CJMP

The mapping is a **random permutation** of case numbers to semantic operations. Every single opcode number differs. There is no fixed relationship — you cannot apply an offset or simple transform.

**Impact**: The opcode table must be re-derived from scratch for each build by reading the `switch/case` handlers in the JS source.

**Shortcut**: The case handler *code* for each semantic operation is structurally identical across builds (same JS expression pattern). You can match handlers by their code shape rather than case number. For example:
- `C[Q[++w]] = C[Q[++w]] + C[Q[++w]]` is always ADD regardless of case number
- `throw C[Q[++w]]` is always THROW
- `w += C[Q[++w]] ? Q[++w] : Q[++w, ++w]` is always CJMP

### 2. Opcode Count May Vary (95 vs 100)

Build A had 100 opcodes (0-99), Build B has 95 (0-94). Possible explanations:
- Some compound opcodes were split or merged differently
- The compiler may include/exclude certain fused opcodes depending on what the bytecode actually needs
- 5 opcodes in Build A may have been dead code or Build B may have consolidated operations

**Impact**: Don't hardcode an opcode count. Scan the switch statement for actual case numbers.

### 3. Variable Names (ALL MINIFIED DIFFERENTLY)

All local variable names inside `__TENCENT_CHAOS_VM` change per build:

| Role | Build A | Build B |
|------|---------|---------|
| Register file | `C` | `i` |
| Program counter | `w` | `C` |
| Bytecode array | `Q` | `Y` |
| Exception value | `D` | `G` |
| This context | `G` | `Q` |
| Temp/scratch | `S`, `M` | `h`, `w`, `K` |
| Exception stack | `O` | `F` |
| Factory function | `I` | `J` |

**Impact**: Cannot grep for variable names. Identify variables by their structural role:
- **Register file**: The array initialized as `[S, m, E, this, arguments, o, BYTECODE, 0]`
- **PC**: The variable in `switch(BYTECODE[++PC])`
- **Bytecode**: The large array created by the decoder, used in switch dispatch
- **Exception stack**: The array used in `push(PC + offset)` and `pop()` patterns

### 4. Global Function Names (RANDOMIZED)

The external helper function names (`window._XxxYyy...`) are random strings per build. Both builds expose the same two Date helpers and one config variable, but under different names.

**Impact**: Match by function body pattern, not by name:
- `function() { return new Date() }` → timestamp helper
- `function(a, b) { return Date[a].apply(Date, b) }` → Date method dispatch
- A long base64-like string assignment → config bytecode

### 5. Bytecode Content (FULLY RECOMPILED)

The bytecode stream is completely different:
- Different total size (76,974 vs 70,017 ints for main payload)
- Different function entry PCs
- Different string literal positions
- Different jump offsets
- All PC-based data (function table, jump targets, string locations) must be re-extracted

**Impact**: No bytecode-level data can be reused. All static analysis (disassembly, CFG, function boundaries) must be redone.

### 6. TDC_NAME Identifier

The global identifier string changes per build. Used as:
- `window.TDC_NAME = "randomString"`
- `window[TDC_NAME] = precomputedToken`

---

## What Stays the Same Across Builds (INVARIANT)

### 1. VM Architecture (IDENTICAL)

The fundamental VM design does not change:
- **Register-based** (not stack-based)
- **switch/case dispatcher** inside `while(true)` double-loop with try/catch
- **Flat bytecode array** with inline operands
- **Closure-based sub-VMs** sharing the same bytecode array at different offsets
- **Exception handler stack** for try/catch
- Initial register layout: `[scope, module, closureVars, this, arguments, self, bytecode, 0]`

### 2. Bytecode Encoding Pipeline (IDENTICAL)

The 3-stage decode is the same across builds:
```
Base64 string → custom base64 decode → varint decode → zigzag decode → integer array
```

- Base64 lookup table construction is identical (same `g(A,B,step)` pattern)
- Varint encoding uses the same MSB continuation-bit scheme (protobuf-style)
- Zigzag: `n >> 1 ^ -(n & 1)`

**Our decoder.js can decode any build's bytecode without modification.**

### 3. Semantic Operations (IDENTICAL, just renumbered)

The set of semantic operations is essentially the same (with minor count variation):
- Arithmetic: ADD, SUB, MUL, DIV, MOD, INC, DEC, NEG, UPLUS
- Bitwise: AND, OR, XOR, SHL, SHR, USHR (with immediate variants)
- Comparison: LT, GT, LE, GE, EQ, SEQ (with immediate variants)
- Control: JMP, CJMP, RET, THROW
- Object: PROP_GET, PROP_SET, NEW, DELETE, IN, TYPEOF
- String: STR_INIT, STR_APPEND (char-by-char building)
- Call: CALL_0 through CALL_3, APPLY, with global-this and explicit-this variants
- Function: FUNC_CREATE (closure creation with captured vars)
- Exception: CATCH_PUSH, TRY_PUSH, TRY_POP, LOAD_EXCEPTION
- Compound opcodes: various fused combinations of the above

The case handler code for each operation has the same JS expression structure.

### 4. Encryption Algorithm (LIKELY IDENTICAL)

Modified XTEA with the same parameters:
- Delta: `0x9E3779B9` (in constants pool as `C[1][2]`)
- 32 Feistel rounds
- 8-byte blocks (little-endian word pairs)
- Key modifications: +2368517 for key index 1, +592130 for key index 3
- Non-truncating sum accumulator (JS semantics)
- Constant key: `STATE_A = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140]`

**Caveat**: The key *could* change between builds. The delta and round count are likely fixed (they're fundamental to XTEA), but the key and modifications could be build-specific. Verify by tracing.

### 5. Token Structure (LIKELY IDENTICAL)

4 segments: hash + header + cdBody + sig, base64-encoded, concatenated, URL-safe encoded.

Assembly order, segment roles, and URL encoding are likely the same. The crypto wrapping the payload doesn't change structurally.

### 6. Collector Architecture (LIKELY IDENTICAL)

- Webpack-like module system with `__webpack_require__`
- ~80 collector modules, each wrapped in try/catch
- 59 fingerprint values in the `cd` array
- Hand-rolled JSON serialization (anti-hooking)
- `sd` object with `{od, appid, nonce, token}` keys

### 7. Anti-Analysis Techniques (IDENTICAL)

- Self-modifying bytecode (PROP_SET_K writing to bytecode array)
- THROW-based loop control in crypto functions
- Silent-failure decoy functions (key setup no-ops)
- Compound opcodes for pattern-matching resistance
- Custom VM PRNG for nonce generation (not Math.random)
- Hand-rolled JSON (not JSON.stringify) for cd string

---

## Porting Strategy: How to Reverse a New Build

### Phase 0: Automated (reuse existing tools)

These steps require zero manual work if the VM architecture hasn't changed:

1. **Decode bytecode**: Run `decompiler/decoder.js` on the new bytecode string — the encoding pipeline is identical, so this works as-is
2. **Extract base64 lookup table**: Verify it matches (it should)
3. **Count opcodes**: Scan the switch statement for case numbers

### Phase 1: Semi-Automated (opcode remapping, ~2-4 hours)

The key task: build the new opcode table.

**Recommended approach — pattern matching on case handlers**:

```javascript
// For each case handler in the new tdc.js, match its JS code pattern:
// Pattern: "C[Q[++w]] = C[Q[++w]] + C[Q[++w]]"  → ADD
// Pattern: "throw C[Q[++w]]"                      → THROW
// Pattern: "w += C[Q[++w]] ? Q[++w] : Q[++w, ++w]" → CJMP
// etc.
```

Steps:
1. Extract all `case N: ... break;` blocks from the new tdc.js
2. Normalize variable names (replace the minified names with canonical ones)
3. Match each normalized handler against the known semantic patterns from this project
4. Output a new opcode mapping: `{ caseNumber → semanticOperation }`

**This can be automated**: Write a script that parses the switch statement, normalizes variable names by structural role, and pattern-matches against our 95 known handler signatures.

### Phase 2: Re-disassemble (~1 hour)

With the new opcode mapping:
1. Update `decompiler/disassembler.js` with the new opcode table
2. Run disassembler on the new bytecode
3. Verify: zero PC gaps, all instructions decoded

### Phase 3: Verify crypto (~1-2 hours)

1. Search the new bytecode for the XTEA delta constant (`0x9E3779B9` = `2654435769`)
2. If found in the constants pool → encryption is likely the same
3. Run the crypto tracer against the new build to verify key, rounds, and modifications
4. If the key or modifications differ, update `crypto-core.js`

### Phase 4: Verify collectors (~1 hour)

1. Run the dynamic harness against the new build
2. Compare cd array structure (should still be 59 fields)
3. Verify sd object format
4. Update collector-schema.js if fields changed

### Total estimated effort for a new build: **4-8 hours** (vs. ~100+ hours for the initial reverse engineering)

---

## Automation Opportunities

### High Value (build once, reuse forever)

| Tool | Purpose | Effort |
|------|---------|--------|
| **Opcode auto-mapper** | Parse switch cases, normalize var names, match patterns → opcode table | 4-6 hours |
| **Var name detector** | Identify PC, registers, bytecode, etc. by structural role | 2-3 hours |
| **Crypto constant scanner** | Find XTEA delta, key arrays in constants pool and bytecode | 1-2 hours |

### Medium Value (saves manual work)

| Tool | Purpose | Effort |
|------|---------|--------|
| **Global name extractor** | Find Date helpers, config var by function body pattern | 1 hour |
| **Diff report generator** | Compare old vs new: opcode mapping changes, size changes, structural diffs | 2-3 hours |

### The opcode auto-mapper alone would reduce porting to ~2 hours of mostly automated work.

---

## Project Output Reusability Guide

When a new tdc.js build is released, here's what you can reuse from this project's directories.

### Reusable As-Is (no changes needed)

| File | Why |
|------|-----|
| `decompiler/decoder.js` | Bytecode encoding pipeline (base64→varint→zigzag) is identical across builds |
| `token/outer-pipeline.js` | Token assembly logic (4 segments, btoa, URL-encode) is structurally the same |
| `token/generate-token.js` | Pipeline wiring doesn't change |
| `token/collector-schema.js` | Collector architecture (59 fields, hand-rolled JSON, sd format) is likely identical |
| `token/cli.js` | CLI wrapper with no build-specific logic |

### Reusable But Needs Re-Verification

| File | What might change |
|------|-------------------|
| `token/crypto-core.js` | Algorithm (Modified XTEA, delta, rounds) is likely the same, but the **key** (`STATE_A`) and **key modifications** (+2368517, +592130) could be build-specific. Run the crypto tracer to confirm. |
| `token/collector-schema.js` | Field count might change (collectors added/removed). Run the dynamic harness to check. |

### Must Be Redone (opcode/PC dependent)

| File | Why |
|------|-----|
| `decompiler/disassembler.js` | Opcode numbers are completely reshuffled per build. Handler code is structurally identical so you can pattern-match, but the mapping table must be rebuilt. |
| `decompiler/string-extractor.js` | Depends on opcode numbers |
| `decompiler/function-extractor.js` | Depends on opcode numbers + PC offsets |
| `decompiler/cfg-builder.js` | All PC-based data (jump targets, function entries) changes |
| `decompiler/pattern-recognizer.js` | Depends on CFG |
| `decompiler/opcode-semantics.js` | Opcode numbering changes |
| `output/decompiled*.js` | Bytecode is fully recompiled — different PCs, strings, offsets |

### Summary

The **token generation pipeline** (`token/*`) is ~90% reusable — the main risk is the crypto key changing. The **decompilation toolchain** (`decompiler/disassembler.js` through `output/decompiled.js`) requires a full re-run of Phases 1–5 with the new opcode table, but the tools themselves just need their opcode mapping updated, not rewritten.

---

## Recommended Approach: Standalone Token Generator

Based on the 3-build empirical analysis, **decompiling each template separately is impractical** — Tencent may maintain dozens of templates, and the count could grow. The recommended approach is the standalone generator (`token/`), which reimplements the Modified XTEA encryption and 59-field collector schema directly in Node.js without executing the VM.

The jsdom approach (running the VM as a black box inside jsdom) was investigated but rejected: the server detects fingerprint quality differences in jsdom-generated tokens and returns errorCode 9.

---

## Open Questions

1. **Does the key change between builds?** We only have one build's key verified. The XTEA delta is standard and unlikely to change, but STATE_A could be build-specific. The standalone generator would need its key updated if this changes.

2. **Are compound opcodes stable?** The set of fused operations might vary — one build may fuse STR_APPEND+PROP_SET while another doesn't. Matters for decompilation but not for the standalone generator.

3. **Does the collector count change?** Both builds presumably collect the same browser fingerprint data, but new collectors could be added or old ones removed in future versions. New collectors would require updates to `token/collector-schema.js`.

4. **Is the assembly order fixed?** We confirmed `btoa[1]+btoa[0]+btoa[2]+btoa[3]` for Build B. Build A's old report claimed `btoa[1]+btoa[2]+btoa[0]+btoa[3]` (though this may have been an error in their analysis rather than a real difference).

5. **Could the VM architecture change fundamentally?** Unlikely in the short term — the register-based switch/case design is deeply embedded. A major rewrite (e.g., to a stack machine or WebAssembly) would be a new product, not an update.

6. **How many templates exist in the pool?** We observed 2 distinct templates across 3 requests. The actual pool size is unknown but likely small (2-10). Each template serves any `js_data`, so the variation is not tied to app or user identity.

7. **How long are templates valid?** Unknown. Templates may rotate daily, weekly, or be stable for months. The per-request config string (line 123) changes every time regardless.
