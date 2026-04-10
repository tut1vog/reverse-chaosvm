# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 10.1 — Scraper orchestrator class

---

## Phases

### Phase 1: Project Foundation
> Set up fresh git repo, rewrite CLAUDE.md, create rules/settings — clean slate for all future work.

| ID | Task | Status |
|----|------|--------|
| 1.1 | Fresh git init and initial commit | done |
| 1.2 | Rewrite CLAUDE.md, create rules, create settings.json | done |

### Phase 2: Claude Code Tooling
> Create the agent, command, and skill markdown files that define specialized behaviors for the pipeline.

| ID | Task | Status |
|----|------|--------|
| 2.1 | Create agent files (opcode-mapper, key-extractor, token-verifier) | done |
| 2.2 | Create commands (port-version, fetch-latest) and skill (port-opcodes) | done |

### Phase 3: VM Parser & Opcode Auto-Mapper
> Build modules to parse any tdc build's VM function, identify variables by structural role, and auto-map opcodes to known semantic operations.

| ID | Task | Status |
|----|------|--------|
| 3.1 | Implement VM variable identifier module | done |
| 3.2 | Implement opcode auto-mapper module | done |
| 3.3 | Tests for VM parser and opcode mapper (validate against tdc.js reference table) | done |

### Phase 4: XTEA Key Extractor
> Build Puppeteer-based dynamic tracing to extract XTEA key schedule from any tdc build.

| ID | Task | Status |
|----|------|--------|
| 4.1 | Implement dynamic key extraction module | done |
| 4.2 | Tests for key extractor (validate against tdc.js known key) | done |

### Phase 5: Token Verifier & Pipeline Orchestrator
> Build the token comparison module and the single-command orchestrator that chains all stages.

| ID | Task | Status |
|----|------|--------|
| 5.1 | Implement token verifier module (capture live, generate standalone, byte-compare) | done |
| 5.2 | Implement pipeline orchestrator (decode → map → extract → verify) | done |
| 5.3 | Tests for verifier and orchestrator | pending |

### Phase 6: Multi-Version Validation
> Run the automated pipeline against all tdc builds, fix issues, document findings.

| ID | Task | Status |
|----|------|--------|
| 6.1 | Port tdc-v3 (Template A — same as tdc.js, sanity check) | done |
| 6.2 | Port tdc-v2 (Template B — different opcodes and XTEA key) | done |
| 6.3 | Port tdc-v4 and tdc-v5 (unknown templates) | done |
| 6.4 | Update documentation with all findings | done |

### Phase 7: Documentation
> Update README.md and other external-facing docs to reflect the automated pipeline.

| ID | Task | Status |
|----|------|--------|
| 7.1 | Update README.md for automated pipeline | done |

### Phase 8: Scraper Foundation Modules
> Build the low-level utility modules that all higher-level scraper code depends on.

| ID | Task | Status |
|----|------|--------|
| 8.1 | Template cache and TDC utilities (tdc-utils.js, template-cache.js) | done |
| 8.2 | Parameterized collect token generator (collect-generator.js) | done |
| 8.3 | Tests for foundation modules | done |

### Phase 9: vData Generation
> Execute vm-slide.enc.js in jsdom to produce vData without a browser.

| ID | Task | Status |
|----|------|--------|
| 9.1 | vData generator (vdata-generator.js) — jsdom + vm-slide.enc.js + jQuery interception | done |
| 9.2 | Tests for vData generator | done |

### Phase 10: Scraper Orchestrator
> Wire all modules into a single scraper class and CLI that executes the full CAPTCHA flow.

| ID | Task | Status |
|----|------|--------|
| 10.1 | Scraper orchestrator class (scraper.js) | in-progress |
| 10.2 | CLI entry point (cli.js) | pending |
| 10.3 | Tests for scraper orchestrator | pending |

### Phase 11: End-to-End Integration
> Live integration testing against urlsec.qq.com and final documentation updates.

| ID | Task | Status |
|----|------|--------|
| 11.1 | End-to-end live test and debugging | pending |
| 11.2 | Update CLAUDE.md, create scrape command | pending |

---

## Current Task

**ID**: 10.1
**Title**: Scraper orchestrator class
**Phase**: Scraper Orchestrator
**Status**: in-progress

### Goal
Create `scraper/scraper.js` — the main orchestrator that wires CaptchaClient, slide-solver, collect-generator, vData-generator, and template-cache into a complete headless CAPTCHA-solving flow for urlsec.qq.com.

### Context

**Modules to wire (all read-only — import, don't modify):**
- `puppeteer/captcha-client.js` — `CaptchaClient` class with `prehandle()`, `_getShowConfig(session)` (private but needed), `downloadImages(sig)`, `downloadTdc(sig)`, `verify(params)`. Constructor takes `{aid, userAgent, referer, timeout}`.
- `puppeteer/slide-solver.js` — `solveSlider(bgBuffer, sliceBuffer)` → raw pixel offset (integer).

**Modules to wire (from scraper/):**
- `scraper/tdc-utils.js` — `extractTdcName(source)`, `extractEks(source)`
- `scraper/template-cache.js` — `TemplateCache` class with `load()`, `lookup(tdcName)`, `store(tdcName, params)`
- `scraper/collect-generator.js` — `generateCollect(profile, xteaParams, options)`
- `scraper/vdata-generator.js` — `generateVData(postFields, vmSlideSource, jquerySource, options)`, `parseVmSlideUrl(html)`

**The full flow** (from project-brief.md):
1. `CaptchaClient.prehandle()` → `{sess, sid, ...}`
2. `CaptchaClient._getShowConfig(session)` → sig with `{bgUrl, sliceUrl, nonce, vsig, websig, showUrl, _raw}`
   - Note: `_getShowConfig` is private. Either use `getSig` (which calls it internally) or access it directly.
   - Actually, check: `CaptchaClient` may have a public `getSig()` method. Read the file to find the public API.
3. `CaptchaClient.downloadImages(sig)` → `{bgBuffer, sliceBuffer}`
4. `CaptchaClient.downloadTdc(sig)` → tdc.js source string
5. Extract TDC_NAME → look up template cache → get XTEA params
   - If unknown template: log warning and run `pipeline/run.js` (or error out for now — the pipeline requires Puppeteer)
6. Extract eks from tdc.js source
7. `solveSlider(bgBuffer, sliceBuffer)` → raw pixel offset
8. Compute slide answer: `ans = "${Math.round(rawOffset * ratio + calibration)},${yCoord};"`
   - `ratio`: start with 0.5, may need tuning (known unknown #4 in project-brief)
   - `calibration`: -25 (from bot.py)
   - `yCoord`: 45 (default)
9. `generateCollect(profile, xteaParams, {appid, nonce})` → collect token
10. Fetch jQuery source (from show page or use `sample/slide-jy.js` as fallback)
11. Fetch vm-slide.enc.js source (URL from show page config)
12. Build verify POST fields (all 38 fields, exact order from captcha-client.js verify method)
13. `generateVData(postFields, vmSlideSource, jquerySource, {userAgent})` → `{vData, serializedBody}`
14. `CaptchaClient.verify({session, sig, ans, collect, eks, tlg, vData, prebuiltBody: serializedBody})` → `{errorCode, ticket, randstr}`
15. If ticket obtained, submit to `cgi.urlsec.qq.com` for URL security results

**CaptchaClient.verify() already supports `prebuiltBody`** — when provided, it uses the jQuery-serialized body directly instead of rebuilding it. This is critical because vData was computed over that exact serialization.

**urlsec.qq.com submission** (from sample/bot.py):
```
GET https://cgi.urlsec.qq.com/index.php?m=check&a=gw_check&callback=jQuery...&url=<target>&ticket=<ticket>&randstr=<randstr>&_=<timestamp>
```
Parse JSONP response → extract `data.results`.

**Protected paths**: Do NOT modify `token/`, `pipeline/`, `puppeteer/`, `targets/`.

### Implementation Steps
1. Read `puppeteer/captcha-client.js` to find the public API for getting show config (is it `getSig()`?).
2. Create `scraper/scraper.js` with a `Scraper` class:
   - Constructor: `new Scraper({aid, userAgent, profile, ratios, maxRetries})`
   - `async solve(targetUrl)` — full flow: prehandle → getSig → images → tdc → solve → collect → vData → verify → urlsec
   - `async solveCaptcha()` — just the CAPTCHA part (returns ticket/randstr)
   - `async queryUrlSec(targetUrl, ticket, randstr)` — submit to urlsec.qq.com
3. The module should handle:
   - Template cache loading at startup
   - jQuery source caching (fetch once, reuse)
   - vm-slide source fetching per session
   - Retry logic for CAPTCHA failures (errorCode != 0)
   - Configurable slide ratio (default 0.5, can be overridden)

### Verification
- [ ] `node -e "const S = require('./scraper/scraper'); console.log(typeof S)"` — loads without error
- [ ] The class imports all required modules without errors
- [ ] The `solve()` method signature exists and includes the full flow logic
- [ ] The `queryUrlSec()` method makes a GET request to `cgi.urlsec.qq.com` with correct JSONP format

### Suggested Agent
general-purpose — wiring orchestrator using known module APIs
