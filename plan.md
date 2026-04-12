# Plan

## Status
Current phase: Phase 36
Current task: 36.1 — Create errorCode 12 diagnostic survey script

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
| 36.1 | Create errorCode 12 diagnostic survey script | in-progress |
| 36.2 | Tests for diagnostic script | pending |
| 36.3 | Run diagnostic experiments and analyze | pending |

---

## Current Task

**ID**: 36.1
**Title**: Create errorCode 12 diagnostic survey script
**Phase**: Investigate errorCode 12 Pattern
**Status**: in-progress

### Goal
Create `scripts/tdc-diagnose.js` — an enhanced survey script that logs detailed
diagnostic data for each CAPTCHA attempt to identify what differentiates successful
(errorCode -1) from failed (errorCode 12) attempts.

### Context

**What we know**:
- Same build/same XTEA params sometimes returns -1 (success), sometimes 12
- Success rate varies 5-28% across survey runs (time-dependent?)
- errorCode 12 = server rejected collect token (per `docs/PROGRESS.md`)
- errorCode 9 = wrong slider answer (OpenCV miss — different issue)

**Hypotheses to test**:
1. **Timing**: Time between prehandle→verify correlates with success
2. **Collect token length**: Successful tokens differ in size from failed ones
3. **Nonce freshness**: Nonce is reused across survey runs (`eda1152f11f1daf0` appears consistently)
4. **Session state**: Something in the session/cookie state differs
5. **Structure params**: hashPosition, fieldOrder, or serializationDiffs are wrong for some builds
6. **Fingerprint profile**: Static profile values are flagged by server-side checks

**Data to capture per attempt** (beyond current survey):
- Timestamps: `t_prehandle`, `t_getsig`, `t_downloadTdc`, `t_solveSlider`, `t_generateCollect`, `t_generateVData`, `t_verify`
- `t_total` = `t_verify - t_prehandle` (total session time)
- `collectLength` (decoded collect token length)
- `vDataLength`
- `ans` (slider answer)
- `nonce` (from getSig)
- `sess` (first 16 chars)
- Server response: `errorCode`, `errMessage` (full response body — the verify response may contain extra fields)
- `hashPosition`, `fieldOrder` length, `serializationDiffs` (from pipeline config)

**Script design** — similar to `tdc-survey.js` but focused on diagnostics:
1. Uses the same flow as `tdc-survey.js` but focuses on a **single build** (skip porting — use cached pipeline configs from prior survey runs)
2. CLI: `--attempts N` (default 30), `--verbose`, `--delay MS` (default 3000), `--hash HASH` (specific build hash to test, or "any" for random)
3. For each attempt: capture all timestamps, token sizes, response details
4. Save to `output/tdc-diagnose/results.json`
5. Print a summary table at end showing: attempt#, timing (ms), collectLen, errorCode, ans

**Key difference from tdc-survey.js**: This script does NOT port builds — it loads cached pipeline-config.json from prior survey runs. It focuses on the verify step and captures maximum detail.

**Pipeline config locations**: `output/tdc-survey-<hash>/pipeline-config.json`

**Key files to read**:
- `scripts/tdc-survey.js` — base to adapt from (reuse the same HTTP flow)
- `puppeteer/captcha-client.js` — verify() response structure
- `scraper/collect-generator.js` — generateCollect() params

### Implementation Steps
1. Create `scripts/tdc-diagnose.js` based on `scripts/tdc-survey.js`
2. Strip out the porting logic (we use cached configs)
3. Add timestamp logging around each step
4. Capture full verify response (not just errorCode)
5. Log collect token length, vData length, ans
6. Save detailed results JSON
7. Print diagnostic summary table

### Verification
- [ ] `node -c scripts/tdc-diagnose.js` passes
- [ ] `npm test` — no regressions
- [ ] Runs successfully for 3-5 attempts with `--attempts 5 --verbose`

### Suggested Agent
general-purpose
