# Plan

## Status
Current phase: Phase 12
Current task: 12.1 — Puppeteer capture: intercept collect token, tdc.js, and verify POST

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
| 12.1 | Puppeteer capture: intercept collect token, tdc.js, and verify POST | in-progress |
| 12.2 | Extract XTEA key from captured tdc.js and decrypt the collect token | pending |
| 12.3 | Analyze decrypted collect — compare field-by-field with our profile | pending |
| 12.4 | Update default profile and fix scraper to produce valid collect tokens | pending |
| 12.5 | Live end-to-end verification of headless scraper | pending |

---

## Current Task

**ID**: 12.1
**Title**: Puppeteer capture: intercept collect token, tdc.js, and verify POST
**Phase**: Scraper Debugging — Collect Token Analysis
**Status**: in-progress

### Goal
Run the Puppeteer-based solver (`puppeteer/cli.js`) against a domain, and capture three artifacts from the successful solve: (1) the full tdc.js source code, (2) the raw collect token from the verify POST body, (3) the full verify POST body for reference. These artifacts are needed to decrypt and analyze what fingerprint data a real browser sends vs our headless scraper.

### Context
- `puppeteer/captcha-solver.js` — the Puppeteer solver. Already intercepts images and verify response. Needs enhancement to also intercept and save:
  - tdc.js source (from the `page.on('response')` handler, URL contains `/tdc.js`)
  - The full verify POST body (already partially logged — the `page.on('request')` handler captures it but only logs collect field length)
- `puppeteer/cli.js` — CLI entry point. Runs the solver and writes results to JSON.
- The solver already works end-to-end with real Chrome. AID = `2046626881`.
- The solver should save captured artifacts to `output/puppeteer-capture/` as:
  - `tdc-source.js` — the tdc.js source
  - `verify-post.json` — the full parsed POST body (all 38+ fields)
  - `result.json` — the verify response (ticket, randstr, errorCode)
- The current `solve()` method returns `{ticket, randstr, errorCode, _raw}`. Extend `_raw` (or add a `_capture` field) to include `tdcSource` and `verifyPostBody`.

### Implementation Steps
1. In `captcha-solver.js`, add a response interceptor for `/tdc.js` URLs — capture the response body text and store on the instance.
2. In the `page.on('request')` handler for verify, capture the full POST body text (not just log it) — parse it into a key-value object and store on the instance.
3. Extend the return value of `solve()` to include `_capture: { tdcSource, verifyPostBody }`.
4. In `cli.js` or a new script, after a successful solve (errorCode 0), write the captured artifacts to `output/puppeteer-capture/`.
5. Run `node puppeteer/cli.js --domain example.com` and confirm artifacts are saved.

### Verification
- [ ] `node puppeteer/cli.js --domain example.com` completes with errorCode 0
- [ ] `output/puppeteer-capture/tdc-source.js` exists and contains valid tdc.js (starts with `window.TDC_NAME`)
- [ ] `output/puppeteer-capture/verify-post.json` exists and contains all POST fields including `collect`, `eks`, `vData`, `ans`, `nonce`
- [ ] `output/puppeteer-capture/result.json` exists and contains `errorCode: 0` and a ticket

### Suggested Agent
general-purpose — needs to modify existing Puppeteer solver code and run a live browser test
