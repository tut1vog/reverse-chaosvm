# Plan

## Status
Current phase: Phase 17
Current task: 17.3.1 — Fix cd capture: decrypt Chrome's collect token

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
| 16.2 | Capture Chrome collect + generate standalone, diff both for same session | done |
| 16.3 | Fix sd.coordinate format and slideValue timestamp format | done |
| 16.4 | Fix cd field mismatches (platform, maxTouchPoints, vendor, screenPosition) | done |
| 16.5 | Live re-test after fixes | done |

### Phase 17: Chrome cd Injection — Identify Which Fields the Server Validates
> Use Puppeteer to extract Chrome's actual cd array from tdc.js execution, inject those exact values into the standalone collect token, and test. If accepted → progressively replace Chrome values with hardcoded ones to identify which specific fields the server validates.

| ID | Task | Status |
|----|------|--------|
| 17.1 | Chrome cd injection script | done |
| 17.2 | Tests for Chrome cd injection script | done |
| 17.3 | Full Chrome cd injection — live test | blocked |
| 17.3.1 | Fix cd capture: decrypt Chrome's collect token | in-progress |
| 17.4 | Binary search: identify which cd fields the server validates | pending |
| 17.5 | Fix identified fields in standalone generator | pending |
| 17.6 | Live re-test with fixes | pending |

---

## Current Task

**ID**: 17.3.1
**Title**: Fix cd capture: decrypt Chrome's collect token
**Phase**: Chrome cd Injection — Identify Which Fields the Server Validates
**Status**: in-progress

### Goal
Fix `scripts/chrome-cd-inject.js` to extract Chrome's cd array by decrypting Chrome's own collect token (returned by `TDC.getData(true)`) using known XTEA params from the template cache, instead of the failed `JSON.stringify` hook approach.

**Why JSON.stringify hook failed**: `docs/TOKEN_FORMAT.md` line 91 explicitly states: "The cd string is built via hand-rolled JSON concatenation (func_276), NOT via JSON.stringify(). This is an anti-hooking measure." The original plan's approach was based on a wrong assumption.

### Context
- `scripts/chrome-cd-inject.js` — current script with broken JSON.stringify hook
- `scripts/collect-diff.js` — already implements XTEA decryption of captured tokens (lines 53-88, `decryptXtea` and `decryptCollect` functions). Copy this approach.
- `scripts/decrypt-collect.js` — standalone decryption script, another reference
- The script already captures Chrome's `TDC.getData(true)` return value (line ~341, `chromeGetData.collect`)
- The script already looks up XTEA params from template cache (lines ~390-417, `xteaParams`)
- So we already have both the encrypted token AND the decryption key — we just need to decrypt it

### Implementation Steps
1. Remove the `JSON.stringify` interceptor from `evaluateOnNewDocument` (lines 183-194) — it's useless
2. Copy `decryptXtea()` and `decryptCollect()` from `scripts/collect-diff.js` (lines 33-89) into `chrome-cd-inject.js`
3. After `TDC.getData(true)` returns Chrome's collect token AND after template cache lookup provides `xteaParams`:
   - Call `decryptCollect(chromeCollect, xteaParams)` to decrypt
   - Parse the decrypted JSON to extract the cd array
   - Use that cd array as `capturedCd`
4. Keep everything else the same: standalone encrypt with `cdArrayOverride`, submit via Chrome TLS
5. Update the logging to show decryption success/failure and the extracted cd array details

**Key constraint**: The decryption must happen AFTER the template cache lookup (step 7 in the script), because we need `xteaParams` to decrypt. Currently the cd extraction happens at step 4 (too early). Reorder: capture Chrome's collect at step 4, decrypt it at step 7b (after cache lookup).

### Verification
- [ ] `JSON.stringify` interceptor removed from the script
- [ ] `decryptXtea` and `decryptCollect` functions added
- [ ] Script decrypts Chrome's collect token using template cache XTEA params
- [ ] `node -c scripts/chrome-cd-inject.js` passes syntax check
- [ ] `npm test` still passes 173/175

### Suggested Agent
general-purpose
