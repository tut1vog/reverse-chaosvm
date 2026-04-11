# Plan

## Status
Current phase: Phase 31
Current task: 31.1 — Add auto-port method to scraper

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

### Phase 31: Auto-Port Unknown Templates in Scraper
> When the scraper encounters an unknown template, automatically run the porting
> pipeline as a subprocess, cache the result, and retry — instead of failing.

| ID | Task | Status |
|----|------|--------|
| 31.1 | Add auto-port method to scraper | pending |
| 31.2 | Tests for auto-port | pending |
| 31.3 | Integrate auto-port into solve loop | pending |
| 31.4 | Tests for solve loop integration | pending |
| 31.5 | Live end-to-end test with unknown template | pending |

---

## Current Task

**ID**: 31.1
**Title**: Add auto-port method to scraper
**Phase**: Auto-Port Unknown Templates in Scraper
**Status**: pending

### Goal
Add an `_autoPort(tdcName, tdcSource)` method to `HeadlessScraper` in `scraper/scraper.js` that saves the downloaded tdc source to a temp file, runs `node pipeline/run.js <tempfile>` as a child process, reads the resulting `pipeline-config.json`, stores the extracted params in the template cache, and returns the cached entry.

### Context

**Why subprocess**: The pipeline (`pipeline/run.js`) uses Puppeteer in stages 3-5 (key-extractor, token-verifier, structure-extractor). The scraper is Puppeteer-free by design. Running the pipeline as a child process keeps the Puppeteer dependency out of the scraper's module graph while still leveraging the full pipeline.

**Pipeline flow**:
- Input: file path to a tdc.js source
- Runs 5 stages: VM parse → opcode map → XTEA key extract (Puppeteer) → token verify (Puppeteer) → structure extract (Puppeteer)
- Output: writes `output/<stem>/pipeline-config.json` with `{target, template, caseCount, variables, opcodeTable, xteaParams, tokenVerified, structureParams}`
- `portVersion()` returns `{success, failedStage, error, stem, outputDir, ...}`
- Exit code: 0 on success, 1 on failure

**Cache integration**: `TemplateCache.store(tdcName, params)` accepts `{template, key, delta, rounds, keyModConstants, keyMods, caseCount, cdFieldOrder?, hashPosition?, fieldOrder?, serializationDiffs?, headerSplit?}`. The method should extract these from `pipeline-config.json`.

**Key files**:
- `scraper/scraper.js` — add `_autoPort()` method (do NOT integrate into solve loop yet — that's task 31.3)
- `pipeline/run.js` — subprocess target, exports `portVersion()` but we call via CLI
- `scraper/template-cache.js` — `store()` method for caching results

**Implementation approach**:
1. Write tdc source to a temp file: `os.tmpdir() + '/tdc-autoport-' + tdcName + '.js'`
2. Spawn `node pipeline/run.js <tempfile> --skip-verify` (skip token verify to save time — we just need XTEA params and structure)
3. Wait for completion with a timeout (120 seconds)
4. If exit code 0: read `pipeline-config.json` from the output dir, extract params, call `this._templateCache.store(tdcName, params)`, return the cached entry
5. If exit code non-0: log the error, clean up temp file, return null
6. Always clean up the temp file in a finally block

**The `--skip-verify` flag**: Token verification (stage 4) is optional — it just confirms byte-identical output. For auto-porting we don't need it. But do NOT skip structure extraction (stage 5) — it provides cdFieldOrder and headerSplit which the scraper needs.

**Deriving the output dir**: The pipeline uses `deriveStem(tdcPath)` which strips extension and path. For a temp file like `/tmp/tdc-autoport-FooBar.js`, the stem would be `tdc-autoport-FooBar` and output goes to `output/tdc-autoport-FooBar/`. That's fine — the pipeline-config.json will be there.

### Implementation Steps
1. Add `const { execFile } = require('child_process');` and `const os = require('os');` to the requires at top of scraper.js (if not already present)
2. Add `_autoPort(tdcName, tdcSource)` async method to HeadlessScraper class:
   - Write tdcSource to temp file
   - Use `child_process.execFile` with promise wrapper to run `node pipeline/run.js <tempfile> --skip-verify`
   - Set timeout to 120000ms, capture stdout/stderr
   - On success: derive stem from temp filename, read `output/<stem>/pipeline-config.json`
   - Extract and normalize params from pipeline-config into cache entry format
   - Call `this._templateCache.store(tdcName, params)`
   - Return the stored entry
   - On failure: log error, return null
   - Always: delete temp file
3. Add `this._log()` calls for key events (starting pipeline, stage progress, success/failure)

### Verification
- [ ] `node -c scraper/scraper.js` passes
- [ ] `npm test` — no regressions (255/257 baseline)
- [ ] Code review: `_autoPort` method exists with correct subprocess invocation
- [ ] Code review: temp file cleanup in finally block
- [ ] Code review: cache entry includes all relevant fields from pipeline-config

### Suggested Agent
general-purpose
