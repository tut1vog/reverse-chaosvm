# Plan

## Status
Current phase: Phase 14
Current task: 14.1 — Create hybrid solver script

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
| 10.1 | Scraper orchestrator class (scraper.js) | done |
| 10.2 | CLI entry point (cli.js) | done |
| 10.3 | Tests for scraper orchestrator | done |

### Phase 11: End-to-End Integration
> Live integration testing against urlsec.qq.com and final documentation updates.

| ID | Task | Status |
|----|------|--------|
| 11.1 | End-to-end live test and debugging | done |
| 11.2 | Update CLAUDE.md, create scrape command | done |

### Phase 12: Scraper Debugging — Collect Token Analysis
> Use Puppeteer to capture a successful CAPTCHA solve, intercept the real collect token and tdc.js, decrypt the collect to understand what fingerprint data the real browser sends, and use that data to fix the headless scraper.

| ID | Task | Status |
|----|------|--------|
| 12.1 | Puppeteer capture: intercept collect token, tdc.js, and verify POST | done |
| 12.2 | Extract XTEA key from captured tdc.js and decrypt the collect token | done |
| 12.3 | Analyze decrypted collect — compare field-by-field with our profile | done |
| 12.4 | Update default profile and fix scraper to produce valid collect tokens | done |
| 12.5 | Live end-to-end verification of headless scraper | done |

### Phase 13: ErrorCode 9 Debugging — Session-Specific Fixes
> Fix the root causes of errorCode 9: session-specific field overrides, vsig/websig investigation, live vm-slide.js, and re-test.

| ID | Task | Status |
|----|------|--------|
| 13.1 | Fix session-specific cd field overrides and scraper test | done |
| 13.2 | Investigate vsig/websig source + fetch live vm-slide.js | done |
| 13.3 | Live re-test after fixes | done |

---

## Current Task

**ID**: 14.1
**Title**: Create hybrid solver script
**Phase**: Hybrid Puppeteer HTTP + Standalone Token
**Status**: in-progress

### Goal
Create a script that uses Puppeteer (Chrome TLS) for all HTTP communication but generates the collect token using our standalone code. This isolates whether TLS fingerprinting is the root cause of errorCode 9.

### Context
The existing `puppeteer/captcha-solver.js` (`CaptchaPuppeteer`) does everything in real Chrome — it navigates to the show page, lets tdc.js run in-browser, and the user drags the slider. It works (errorCode 0 in Phase 12.1 capture).

The hybrid approach:
1. **Puppeteer for HTTP**: Use `page.evaluate(fetch(...))` for prehandle, getSig, image download, tdc download, and verify POST — all with Chrome's TLS fingerprint
2. **Standalone token**: Generate collect token using `scraper/collect-generator.js` (our XTEA encryption, cd reordering, slide sd)
3. **OpenCV slider**: Solve the slide puzzle with `puppeteer/slide-solver.js`
4. **jsdom vData**: Generate vData with `scraper/vdata-generator.js`

Key files:
- `puppeteer/captcha-solver.js` — existing Puppeteer solver (reference for Chrome-based HTTP flow)
- `puppeteer/captcha-client.js` — existing Node.js HTTP client (reference for request formats)
- `scraper/scraper.js` — existing scraper (reference for standalone token generation flow)
- `scraper/collect-generator.js` — standalone collect token generation
- `scraper/vdata-generator.js` — jsdom vData generation
- `scraper/tdc-utils.js` — TDC_NAME and eks extraction
- `scraper/template-cache.js` — template cache lookup

### Implementation Steps
1. Create `scripts/hybrid-solver.js` that:
   a. Launches Puppeteer with stealth plugin
   b. Uses `page.evaluate(fetch(...))` to call prehandle
   c. Navigates to the show page URL (to get Chrome TLS + cookies) and intercepts tdc.js + images
   d. Solves the slider with OpenCV
   e. Extracts TDC_NAME and eks from intercepted tdc.js
   f. Looks up template cache for XTEA params
   g. Generates collect token using `generateCollect` with profile overrides
   h. Generates vData using `generateVData` in jsdom
   i. Submits verify POST via `page.evaluate(fetch(...))` — Chrome TLS for the verify call
   j. Logs the errorCode and result

2. The script should be runnable as `node scripts/hybrid-solver.js` and output results to stderr + JSON file.

### Verification
- [ ] `node -c scripts/hybrid-solver.js` — no syntax errors
- [ ] Script runs and reaches the verify POST step (even if errorCode != 0)
- [ ] Verify POST is made via Puppeteer (Chrome TLS), not Node.js HTTP

### Suggested Agent
general-purpose
