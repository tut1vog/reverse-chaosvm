# Plan

## Status
Current phase: Phase 15
Current task: 15.3 — Modify hybrid solver: Chrome vData generation

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

### Phase 14: Hybrid Puppeteer HTTP + Standalone Token
> Use Puppeteer for HTTP transport (Chrome TLS) with the scraper's standalone token generation. This isolates whether TLS fingerprinting causes errorCode 9 vs token content issues.

| ID | Task | Status |
|----|------|--------|
| 14.1 | Create hybrid solver script | done |
| 14.2 | Live test of hybrid solver | done |
| 14.3 | Results analysis and documentation | done |

### Phase 15: Byte-Level POST Body Comparison
> Generate a scraper collect token with current code, decrypt it, and do a field-by-field comparison against the known-good browser capture to identify every remaining discrepancy causing errorCode 9.

| ID | Task | Status |
|----|------|--------|
| 15.1 | Build POST body comparison script | done |
| 15.2 | vData and jQuery serialization comparison | done |
| 15.3 | Modify hybrid solver: Chrome vData generation | pending |
| 15.4 | Live test with Chrome-generated vData | pending |

---

## Current Task

**ID**: 15.3
**Title**: Modify hybrid solver: Chrome vData generation
**Phase**: Byte-Level POST Body Comparison
**Status**: in-progress

### Goal
Modify `scripts/hybrid-solver.js` to generate vData inside Chrome (via page.evaluate) instead of jsdom. Task 15.2 proved that jsdom's vm-slide produces different vData than a real browser (likely environment detection). The Phase 14 hybrid solver used jsdom for vData — that's why it still got errorCode 9 even with Chrome TLS. This task fixes that by moving vData generation into Chrome's context.

### Context
- `scripts/hybrid-solver.js` — existing hybrid solver, currently uses jsdom vData (line 386-441)
- `scraper/vdata-generator.js` — jsdom-based vData generator (to be replaced for Chrome path)
- `sample/vm_slide.js` (43688 bytes) — vm-slide source, needs to execute in Chrome context
- `sample/slide-jy.js` (96410 bytes) — jQuery source, needs to execute in Chrome context
- The hybrid solver already has Puppeteer's `page` object available and intercepts responses

**Approach**: Instead of calling `generateVData()` (jsdom), inject jQuery + vm-slide into the Puppeteer page, build the postFields object in Chrome's context, fire jQuery.ajax, intercept the vData from the XHR hook, and return it to Node.js.

Specifically, modify the hybrid solver's Step 8 to:
1. Read slide-jy.js and vm_slide.js sources in Node.js
2. Use `page.evaluate()` to:
   a. Inject jQuery and vm-slide into the page's JS context
   b. Hook XHR.send to capture the body
   c. Build the postFields object (pass from Node.js via evaluate args)
   d. Fire `$.ajax({type:'POST', data: postFields})` — vm-slide hooks and appends vData
   e. Return the captured body (with vData) back to Node.js
3. Parse the returned body to extract vData and the serialized POST body
4. Use these for the verify POST (via page.evaluate(fetch()))

### Implementation Steps
1. In `scripts/hybrid-solver.js`, replace the jsdom vData generation (lines ~386-441) with Chrome-based generation
2. Keep the jsdom path as a fallback (in case Chrome page context is unavailable), behind a flag
3. Ensure the verify POST still uses the jQuery-serialized body + vData from Chrome

### Verification
- [ ] `scripts/hybrid-solver.js` modified — Chrome vData path is the default
- [ ] The script still runs: `node scripts/hybrid-solver.js --headful` (manual check — no crash)
- [ ] vData is generated via page.evaluate, not jsdom (check log output: should say "Chrome" not "jsdom")

### Suggested Agent
general-purpose
