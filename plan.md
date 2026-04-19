# Plan

## Status
Current phase: Phase 67 — Porting pipeline stress test
Current task: 67.2 — Run porting pipeline on all 30 builds, aggregate survey

---

## Phases

### Phase 67: Porting pipeline stress test (30 live tdc.js builds)
> Run the auto-porting pipeline against 30 freshly-fetched `tdc.js` builds; surface and fix any templates that fail to auto-port.

| ID | Task | Status |
|----|------|--------|
| 67.1 | Fetch 30 live tdc.js builds via handshake | done |
| 67.2 | Run porting pipeline on all 30 builds, aggregate survey | in-progress |
| 67.3 | Triage (conditional — plan-revision trigger based on 67.2 results) | pending |

---

## Current Task

**ID**: 67.2
**Title**: Run porting pipeline on all 30 builds, aggregate survey
**Phase**: Phase 67 — Porting pipeline stress test
**Status**: in-progress

### Goal
Run the full porting pipeline against every `tdc.js` in `output/port-survey/sources/` and emit a consolidated survey (`results.json` + `results.md`) so the director can triage pipeline failures in 67.3.

### Context
- **Inputs** (produced by 67.1):
  - `output/port-survey/sources/tdc-01.js` … `tdc-30.js` — the 30 fetched sources.
  - `output/port-survey/sources.json` — index with `{ index, sourceHash, TDC_NAME, length, caseCountGuess }` rows. The 30 fetches resolved to **9 unique `sourceHash` values** (21 duplicates); the pipeline should still run once per file so nondeterminism would be caught.
- **Pipeline entry point**: `tools/porting-pipeline/run.js` exports `portVersion(tdcPath, { skipVerify, skipStructure })`. It returns `{ success, failedStage, error, stem, outputDir, parsed, mapped, keyResult, verifyResult, structureResult }`. It writes its artifacts to `output/<stem>/` where `stem = path.basename(tdcPath, '.js')`. For our inputs the stem is `tdc-01` … `tdc-30`, so default output lands at top-level `output/tdc-NN/`. Leave them there — do not relocate; 67.3 may need to read them by default paths.
- **Verify Stage 4 needs Puppeteer** (see `tools/porting-pipeline/token-verifier.js` — launches a real browser to capture a live token). This is slow (~30–90 s per build) and can fail transiently for network reasons; treat a verify-stage exception as a *task-level* (stage 4) failure, record it, and continue.
- **Template classification**: `caseCount` 95 = A, 94 = B, 100 = C, anything else = new template (see `run.js:28`). The survey should report the template plus the raw case count.
- **Known templates** in this batch (from 67.1 hashes): `88ebeea62f566ec5` and `f53142c54fc43699` already have empty `output/tdc-autoport-<hash>/` directories in the working tree — ignore those; they are from earlier experiments and unrelated to this run.
- **Output-versioning rule**: the aggregate survey goes to `output/port-survey/` with stable filenames (`results.json`, `results.md`). Do not timestamp-suffix.
- **Coding rules**: CommonJS, `'use strict';`, 2-space indent, single quotes, semicolons, no new npm deps. Research-track script lives at `research/port-survey/port-all.js`.

### Implementation Steps
1. Create `research/port-survey/port-all.js` that:
   - Reads `output/port-survey/sources.json` to get the list of indices + metadata.
   - For each row (ordered by `index`): calls `portVersion(sourcePath, {})` (verification **enabled** — no skip flags). Wraps the call in `try/catch` to capture thrown errors as `{ success: false, failedStage: 'throw', error: err.message }`.
   - Extracts the survey row:
     ```js
     {
       index,                       // 1..30
       sourceHash,                  // from sources.json
       TDC_NAME,                    // from sources.json
       caseCount,                   // result.parsed.caseCount (or null if stage 1 failed)
       template,                    // classifyTemplate(caseCount) — reuse the logic from run.js
       mappedOpcodes,               // Object.keys(result.mapped.opcodeTable).length (or null)
       unmappedOpcodes,             // result.mapped.unmapped.length (or null)
       xteaKey,                     // result.keyResult.key as hex string[] (or null)
       success,                     // result.success
       failedStage,                 // result.failedStage (1–4 or null on success, 'throw' on exception)
       error,                       // result.error (or err.message)
       verifyMatch,                 // result.verifyResult?.match (true / false / null)
       liveTokenLength,             // result.verifyResult?.liveTokenLength (or null)
       standaloneTokenLength,       // result.verifyResult?.standaloneTokenLength (or null)
       outputDir                    // result.outputDir
     }
     ```
   - Prints a one-line progress log per build to stdout: `[port-all] NN/30 hash=<short> template=<X> success=<bool> stage=<N> verify=<match|mismatch|n/a>`.
   - After all 30 are done, writes `output/port-survey/results.json` (pretty-printed) and `output/port-survey/results.md` with:
     - A header summarising totals: `total=30, fully_green=<N>, verify_mismatch=<N>, stage_failures=<N>, unique_hashes=<N>`.
     - A per-outcome table (`fully_green` = success + verifyMatch === true; `verify_mismatch` = success + verifyMatch === false; `stage_failures` = everything else).
     - A dedup table: one row per unique `sourceHash` showing how many indices share it and whether all their pipeline outcomes agree (they should — nondeterminism here would be a bug).
2. Run it: `node research/port-survey/port-all.js`. Expected wall-clock: 15–45 minutes (Stage 4 is the bottleneck). Use a generous 60-minute timeout.
3. Do **not** modify `tools/porting-pipeline/` or any file outside `research/port-survey/`.

### Verification
- [ ] `output/port-survey/results.json` exists and has exactly 30 rows.
- [ ] `node -e "const r=JSON.parse(require('fs').readFileSync('output/port-survey/results.json','utf8')); const g=r.filter(x=>x.success&&x.verifyMatch===true).length; const vm=r.filter(x=>x.success&&x.verifyMatch===false).length; const sf=r.filter(x=>!x.success).length; console.log({total:r.length, green:g, verifyMismatch:vm, stageFailures:sf})"` prints totals consistent with the markdown summary.
- [ ] `output/port-survey/results.md` renders with the three outcome sections and the dedup table populated.
- [ ] For every unique `sourceHash`, all rows sharing that hash have identical `{ success, failedStage, template, caseCount, verifyMatch }` (dedup consistency).
- [ ] No files were written outside `output/` or `research/port-survey/`.
- [ ] Pipeline default output dirs (`output/tdc-01/` … `output/tdc-30/`) were populated by `portVersion` — spot-check one: `ls output/tdc-01/` should show at least `opcode-table.json`, `xtea-params.json`, and `pipeline-config.json`.

### Suggested Agent
`general-purpose` — different agent from the one that wrote `fetch-30.js`, so the survey runner approaches the 67.1 output as a consumer.
