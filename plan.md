# Plan

## Status
Current phase: Phase 15
Current task: 16.2 — Capture Chrome collect + generate standalone, diff both for same session

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
| 15.3 | Modify hybrid solver: Chrome vData generation | done |
| 15.4 | Live test with Chrome-generated vData | done |

---

## Current Task

### Phase 16: Definitive Test — Chrome tdc.js vs Standalone Collect
> Confirm that the real tdc.js VM in Chrome produces a collect token the server accepts, while standalone generation doesn't. This pinpoints the collect token as the root cause.

| ID | Task | Status |
|----|------|--------|
| 16.1 | Run full Puppeteer solver as control test | done |
| 16.2 | Capture Chrome collect + generate standalone, diff both for same session | in-progress |
| 16.3 | Fix identified collect differences | pending |

---

## Current Task

**ID**: 16.2
**Title**: Capture Chrome collect + generate standalone, diff both for same session
**Phase**: Definitive Test — Chrome tdc.js vs Standalone Collect
**Status**: in-progress

### Goal
Create a script that does BOTH in one session: (1) lets Chrome's tdc.js generate a real collect token (which succeeds), (2) generates a standalone collect token using the same session params and the same tdc.js XTEA params, (3) decrypts both tokens, and (4) diffs them field-by-field. This reveals exactly which fields differ between "what works" and "what doesn't."

### Context
- `puppeteer/captcha-solver.js` — already captures the verify POST body including the real collect token (in `capturedVerifyPost`)
- `output/tdc-capture/xtea-params.json` — XTEA params for the captured tdc.js (from Phase 12.1)
- The Puppeteer solver intercepts `tdc.js` source (in `capturedTdcSource`)
- `pipeline/run.js` — can extract XTEA params from any tdc.js build
- `scraper/collect-generator.js` — generates standalone collect tokens
- `token/collector-schema.js` — `buildDefaultCdArray()` for the 59-field cd array
- `profiles/default.json` — current fingerprint profile

The key insight: the Phase 12.1 comparison (`output/puppeteer-capture/collect-decrypted.json`) compared a browser capture against the OLD scraper (pre-Phase 12.4 fixes). Many issues were already fixed. We need a FRESH comparison using the CURRENT profile and code.

### Approach: Modify the existing hybrid solver

Instead of building from scratch, modify the hybrid solver flow:
1. Launch Puppeteer, navigate to show page, intercept images + tdc.js
2. Solve slider via OpenCV  
3. Perform a REAL mouse drag (like captcha-solver.js) → Chrome generates real collect + verify POST
4. Intercept the verify POST body → extract the Chrome-generated collect token
5. Extract XTEA params from the intercepted tdc.js (via pipeline's vm-parser + opcode-mapper + key-extractor)
6. Generate a standalone collect using the same session params (nonce, sess, sid, ans) + same XTEA params + current profile
7. Decrypt BOTH tokens using the extracted XTEA params
8. Compare cd arrays field-by-field + sd structures
9. Output the diff to `output/chrome-vs-standalone-diff.json`

Actually, this is complex. A simpler approach:

**Alternative**: Run the Puppeteer solver to get a successful solve, capture the tdc.js source and the collect token. Then run the pipeline on the captured tdc.js to get XTEA params. Then decrypt the Chrome collect. Then generate + decrypt a standalone collect with the same params. Then diff.

This can be a standalone script: `scripts/collect-diff.js`

### Implementation Steps
1. Create `scripts/collect-diff.js` that:
   a. Runs the full Puppeteer solver (reuse CaptchaPuppeteer)
   b. Captures the verify POST body (Chrome-generated collect) and tdc.js source
   c. Extracts XTEA params from the captured tdc.js (run pipeline extraction)
   d. Decrypts the Chrome collect token
   e. Generates a standalone collect using the same session params + XTEA params + current profile
   f. Decrypts the standalone collect
   g. Compares cd arrays field-by-field, sd structures
   h. Outputs `output/chrome-vs-standalone-diff.json`

2. The decryption needs the full token pipeline in reverse:
   - URL-decode the collect token
   - Split into 4 base64 segments (the token assembly order is [1, 0, 2, 3])
   - Decode each base64 segment to bytes
   - Decrypt each segment with XTEA
   - Reassemble to get the JSON string `{"cd":[...],"sd":{...}}`

   OR: the pipeline already has decryption logic. Check `scripts/decrypt-collect.js` if it exists, or `token/crypto-core.js` for decrypt functions.

### Verification
- [ ] Script runs and produces a successful Puppeteer solve (errorCode 0)
- [ ] Chrome collect token is captured and decrypted
- [ ] Standalone collect token is generated with same session params
- [ ] Field-by-field diff output in `output/chrome-vs-standalone-diff.json`
- [ ] At least one concrete field difference identified

### Suggested Agent
general-purpose
