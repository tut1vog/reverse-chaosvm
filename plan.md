# Plan

## Status
Current phase: Phase 36
Current task: 36.2 — Tests for diagnostic script

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
| 35.1 | Create source deobfuscator module | done |
| 35.2 | Tests for deobfuscator | done |
| 35.3 | Integrate deobfuscator into pipeline | done |
| 35.4 | Tests for pipeline integration | done (covered by existing suite) |
| 35.5 | Re-run survey to verify obfuscated builds port | done |

---

## Survey Results (Phase 35 — post-deobfuscator)

20 attempts → **8/8 unique builds port OK, 0 failures** (all extract XTEA keys).

Previously-null-key obfuscated builds now all produce valid keys:
- 3429444f (91 ops): key `[0x63303C45, 0x6D436969, 0x53163E47, 0x52506845]` ✅
- e2170903 (93 ops): key extracted ✅
- 27dda893 (103 ops): key `[0x42322B41, 0x63514754, 0x63435742, 0x655A4F3D]` ✅

Build 0e2b306a got errorCode=-1 (success) — proving the full pipeline works end-to-end.

**Remaining issue**: errorCode 12 still dominates. Same build sometimes returns -1 (success), sometimes 12. This is likely timing/freshness, not a token generation issue.

### Phase 36: Investigate errorCode 12 Pattern
> errorCode 12 means the server rejected the collect token. Success rate is inconsistent
> (5-28% across survey runs). Need to identify what differentiates successful (-1)
> from failed (12) attempts — timing, token structure, session state, or fingerprint data.

| ID | Task | Status |
|----|------|--------|
| 36.1 | Create errorCode 12 diagnostic survey script | done |
| 36.2 | Tests for diagnostic script | in-progress |
| 36.3 | Run diagnostic experiments and analyze | pending |

---

## Current Task

**ID**: 36.2
**Title**: Tests for diagnostic script
**Phase**: Investigate errorCode 12 Pattern
**Status**: in-progress

### Goal
Write unit tests for `scripts/tdc-diagnose.js` — test the `parseArgs` function and verify the module loads correctly.

### Context
- `scripts/tdc-diagnose.js` exports `{ parseArgs }` when not the main module
- Follow the pattern of existing test files in `tests/`
- The script's main logic requires network access so only test pure functions

### Implementation Steps
1. Create `tests/test-tdc-diagnose.js`
2. Test `parseArgs` defaults (attempts=30, verbose=false, delay=3000, hash=null)
3. Test `parseArgs` with all flags specified
4. Test module loads without error

### Verification
- [ ] `node --test tests/test-tdc-diagnose.js` passes
- [ ] `npm test` — no regressions

### Suggested Agent
general-purpose
