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
| 12.1 | Puppeteer capture: intercept collect token, tdc.js, and verify POST | done |
| 12.2 | Extract XTEA key from captured tdc.js and decrypt the collect token | in-progress |
| 12.3 | Analyze decrypted collect — compare field-by-field with our profile | pending |
| 12.4 | Update default profile and fix scraper to produce valid collect tokens | pending |
| 12.5 | Live end-to-end verification of headless scraper | pending |

---

## Current Task

**ID**: 12.2
**Title**: Extract XTEA key from captured tdc.js and decrypt the collect token
**Phase**: Scraper Debugging — Collect Token Analysis
**Status**: in-progress

### Goal
After running the Puppeteer solver (task 12.1) to capture `output/puppeteer-capture/tdc-source.js` and `output/puppeteer-capture/verify-post.json`, use the pipeline's key extractor to get the XTEA key from the captured tdc.js, then decrypt the collect token from the verify POST body. Save the decrypted output for field-by-field analysis in task 12.3.

### Context
- `output/puppeteer-capture/tdc-source.js` — captured tdc.js source (written by task 12.1 code, but file may not exist yet since live run hasn't happened)
- `output/puppeteer-capture/verify-post.json` — captured POST body with `collect` field
- `pipeline/key-extractor.js` — extracts XTEA key from any tdc.js build
- `pipeline/vm-parser.js` — identifies VM variables
- `pipeline/opcode-mapper.js` — maps opcodes
- `token/crypto-core.js` — XTEA encrypt/decrypt functions
- `docs/TOKEN_DECRYPTION.md` — documents the decryption process
- The collect token is URL-encoded → base64 → XTEA-encrypted segments. Decryption reverses this.
- Need to: (1) save captured tdc.js to `targets/tdc-live.js`, (2) run pipeline to extract key, (3) decrypt collect token using that key, (4) save decrypted fields to `output/puppeteer-capture/collect-decrypted.json`

### Implementation Steps
1. Copy `output/puppeteer-capture/tdc-source.js` to `targets/tdc-live.js` (if not already there)
2. Run `node pipeline/run.js targets/tdc-live.js --skip-verify` to extract opcode table and XTEA key
3. Create a script `scripts/decrypt-collect.js` that reads the collect token from verify-post.json, URL-decodes it, base64-decodes it, splits into XTEA segments, decrypts with the extracted key, and outputs the plaintext fields
4. Save decrypted output to `output/puppeteer-capture/collect-decrypted.json`

### Verification
- [ ] `targets/tdc-live.js` exists
- [ ] `output/tdc-live/xtea-params.json` exists with valid key array
- [ ] `scripts/decrypt-collect.js` runs without error
- [ ] `output/puppeteer-capture/collect-decrypted.json` exists with readable field data

### Suggested Agent
general-purpose — needs to run pipeline and create a decryption script
