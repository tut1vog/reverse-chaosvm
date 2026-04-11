# Plan

## Status
Current phase: Phase 34
Current task: 34.1 — Fix extractThisCtx for bracket-notation .call()

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

### Phase 34: Fix VM Parser for Bracket-Notation Builds
> The 3 unparseable builds (162K-202K) use `['call']` (bracket notation) instead
> of `.call` (dot notation). The vm-parser's `extractThisCtx` only matches
> `property.type === 'Identifier'` — needs to also match `property.type === 'Literal'`.
> All other parser steps (switch finding, bytecode/pc, regs, catchStack) already work.

| ID | Task | Status |
|----|------|--------|
| 34.1 | Fix extractThisCtx for bracket-notation .call() | in-progress |
| 34.2 | Tests for bracket-notation vm-parser fix | pending |
| 34.3 | Re-run survey to verify all builds port | pending |

---

## Current Task

**ID**: 34.1
**Title**: Fix extractThisCtx for bracket-notation .call()
**Phase**: Fix VM Parser for Bracket-Notation Builds
**Status**: in-progress

### Goal
Modify `extractThisCtx()` in `pipeline/vm-parser.js` to also match bracket-notation `.call()` — where property is `Literal` with value `'call'` instead of `Identifier` named `call`. This is a one-line fix.

### Context
- `pipeline/vm-parser.js` line 179: currently checks `node.callee.property.type === 'Identifier' && node.callee.property.name === 'call'`
- Failing builds use `regs[bytecode[++pc]]['call'](thisCtx, ...)` — bracket notation
- In the AST, bracket notation produces `property.type === 'Literal'` with `property.value === 'call'`
- Confirmed via diagnostic: all 3 failing builds have 3 bracket-notation `.call()` patterns each, and the thisCtx candidate is correctly found when matching both notations
- No other parser functions need changes — bytecode/pc/regs/catchStack extraction all work on these builds

### Implementation Steps
1. In `extractThisCtx()`, change the `.call` check on line 179 from:
   ```js
   node.callee.property.type === 'Identifier' &&
   node.callee.property.name === 'call'
   ```
   to:
   ```js
   ((node.callee.property.type === 'Identifier' && node.callee.property.name === 'call') ||
    (node.callee.property.type === 'Literal' && node.callee.property.value === 'call'))
   ```

### Verification
- [ ] `node -c pipeline/vm-parser.js` passes
- [ ] All 3 previously-failing builds parse successfully:
      `node -e "const {parseVmFunction}=require('./pipeline/vm-parser'); const fs=require('fs'); for (const h of ['27dda893f81dbc4f','3429444f324c6110','e2170903e201e018']) { const src=fs.readFileSync('output/tdc-survey/'+h+'.js','utf8'); const r=parseVmFunction(src); console.log(h+': '+r.caseCount+' cases, thisCtx='+r.variables.thisCtx); }"`
- [ ] All previously-working builds still parse: `node -e "const {parseVmFunction}=require('./pipeline/vm-parser'); const fs=require('fs'); const src=fs.readFileSync('targets/tdc.js','utf8'); const r=parseVmFunction(src); console.log('tdc.js:', r.caseCount, 'cases, thisCtx='+r.variables.thisCtx);"`
- [ ] `npm test` — no regressions

### Suggested Agent
general-purpose
