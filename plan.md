# Plan

## Status
Current phase: Phase 33
Current task: 33.1 — Create tdc.js survey script

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
| 33.1 | Create tdc.js survey script | in-progress |
| 33.2 | Tests for survey script | pending |
| 33.3 | Run survey and analyze results | pending |

---

## Current Task

**ID**: 33.1
**Title**: Create tdc.js survey script
**Phase**: TDC Survey — Collect Live Template Data
**Status**: in-progress

### Goal
Create `scripts/tdc-survey.js` — a standalone script that performs N independent CAPTCHA attempts (not retries within one solve), recording detailed data about each tdc.js build encountered. For each attempt it logs: TDC_NAME, sourceHash, source length, opcode count (if parseable), auto-port success/failure, errorCode from verify, and saves novel tdc.js sources to `output/tdc-survey/` for later analysis.

### Context

**What we want to learn**:
- How many distinct tdc.js builds are in Tencent's rotation pool?
- Which builds can the pipeline port (VM parser + key extractor succeed)?
- Which builds fail to port and why (VM parser fails? key extractor fails?)?
- For successfully ported builds, does the verify still return errorCode 12?
- What are the source sizes and opcode counts of each template variant?

**Scraper internals available**:
- `CaptchaClient` from `puppeteer/captcha-client.js` — HTTP-only (prehandle, getSig, downloadTdc, downloadImages, verify)
- `extractTdcName`, `extractEks`, `computeSourceHash` from `scraper/tdc-utils.js`
- `solveSlider` from `puppeteer/slide-solver.js` — OpenCV offset
- `generateCollect` from `scraper/collect-generator.js` — standalone token
- `generateVData` from `scraper/vdata-generator.js` — jsdom vData
- `TemplateCache` from `scraper/template-cache.js`
- `pipeline/run.js` — subprocess for porting (used by `_autoPort`)

**Script design**:
1. Parse CLI args: `--attempts N` (default 20), `--verbose`, `--save-sources` (save each unique tdc.js)
2. Start with empty cache (in-memory, don't touch disk cache)
3. For each attempt:
   a. prehandle → getSig → downloadTdc (we need the tdc source)
   b. Extract TDC_NAME, sourceHash, sourceLength
   c. If sourceHash already seen this run → skip porting, note "duplicate"
   d. If new: try parseVmFunction to get caseCount (may fail for unparseable templates)
   e. If new: try running pipeline via execFile (like _autoPort) to get full params
   f. Download images → solveSlider → generate collect → generateVData → verify
   g. Record: attempt#, TDC_NAME, sourceHash, sourceLength, caseCount, template, portResult (success/failed-stageN/vm-parse-fail), errorCode, collectLength
   h. If `--save-sources` and new hash: save to `output/tdc-survey/<sourceHash>.js`
4. After all attempts: print summary table and save to `output/tdc-survey/report.json`

**Summary table columns**:
```
Hash            | TDC_NAME (first 8) | Size    | Opcodes | Port     | Attempts | errorCodes
e5341ccb12b78e65| SlVCfKSR           | 144440  | 96      | OK       | 3        | 12,12,-1
3e77d1890dff73ab| MClHbUcg           | 147307  | 98      | OK       | 5        | 12,12,12,12,12
27dda893f81dbc4f| HhXakMGl           | 202765  | ?       | FAIL:vm  | 2        | -,-
```

**Key files**:
- `scripts/tdc-survey.js` — new script
- `puppeteer/captcha-client.js` — CaptchaClient for HTTP flow
- `scraper/tdc-utils.js` — extractTdcName, extractEks, computeSourceHash
- `puppeteer/slide-solver.js` — solveSlider
- `scraper/collect-generator.js` — generateCollect
- `scraper/vdata-generator.js` — generateVData

### Implementation Steps
1. Create `scripts/tdc-survey.js` with the design above
2. Use `child_process.execFile` for pipeline porting (same approach as `_autoPort`)
3. For the verify step, replicate the scraper's POST construction (`_buildPostFields` pattern)
4. Use in-memory TemplateCache (temp file path, no disk persistence)
5. Print progressive results as each attempt completes
6. Save report.json at end

### Verification
- [ ] `node -c scripts/tdc-survey.js` passes
- [ ] `npm test` — no regressions
- [ ] Code review: script handles all failure modes (vm parse fail, pipeline fail, verify error)
- [ ] Code review: saves novel sources when `--save-sources` flag used
- [ ] Code review: produces structured report.json

### Suggested Agent
general-purpose
