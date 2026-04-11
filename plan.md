# Plan

## Status
Current phase: Phase 17
Current task: 19.3 — Fix identified divergence

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
| 17.3 | Full Chrome cd injection — live test | done |
| 17.3.1 | Fix cd capture: decrypt Chrome's collect token | done |
| 17.4 | Binary search: identify which cd fields the server validates | superseded |
| 17.5 | Fix identified fields in standalone generator | superseded |
| 17.6 | Live re-test with fixes | superseded |

### Phase 18: Token Forensics — Decrypt-Reencrypt Round-Trip
> For the same session, decrypt Chrome's token to get the raw plaintext, rebuild the plaintext with our code from the same cd/sd values, and compare character-by-character. Then re-encrypt Chrome's plaintext and compare byte-by-byte with the original. This isolates whether the bug is in serialization or encryption.

| ID | Task | Status |
|----|------|--------|
| 18.1 | Create token forensics script | done |
| 18.2 | Tests for token forensics helpers | pending |
| 18.3 | Live forensics test | blocked |
| 18.3.1 | Extract XTEA key from live tdc.js at runtime | done |
| 18.3.2 | Fix keyMods derivation from keyModConstants | done |
| 18.4 | In-page key instrumentation for live tdc.js | done |
| 18.5 | Live forensics with in-page key | blocked |

**Phase 18 outcome**: Comparison B (round-trip) proved our XTEA cipher is correct. Key extraction fails for all live builds — 4 attempts, 3 methods (cache, pipeline, in-page), all garbage. Blocking issue: `analyzeTrace()` extracts wrong keys for live templates.

### Phase 19: Reference tdc.js Injection Forensics
> Bypass the key extraction problem entirely: inject our known reference tdc.js (`targets/tdc.js`, Template A, key fully verified) into Chrome's CAPTCHA page via request interception, then compare Chrome's token output vs standalone output byte-by-byte. Both use the same known key.

| ID | Task | Status |
|----|------|--------|
| 19.1 | Create reference injection forensics script | done |
| 19.2 | Live test with reference tdc.js injection | done |
| 19.3 | Fix identified divergence | pending |
| 19.4 | Live re-test with fix | pending |

---

## Current Task

**ID**: 19.1
**Title**: Create reference injection forensics script
**Phase**: Reference tdc.js Injection Forensics
**Status**: in-progress

### Goal
Create `scripts/ref-inject-forensics.js` — a Puppeteer script that:
1. Launches Chrome, sets up a CAPTCHA session (prehandle → show page)
2. Intercepts the tdc.js request and replaces the response with our reference build (`targets/tdc.js`) — a file we have the verified XTEA key for
3. Chrome executes the reference tdc.js, calls `TDC.getData()` → produces encrypted collect token
4. Decrypts Chrome's token with the known Template A key (guaranteed to work — byte-identical verified)
5. Generates a standalone token with the same cd/sd/timestamp
6. Runs the three forensic comparisons (A: plaintext, B: round-trip, C: full reconstruction)

This completely bypasses the key extraction problem. We KNOW the reference key works (all 5 targets verified byte-identical). By injecting it into Chrome's actual CAPTCHA page, we can finally compare our pipeline output vs Chrome's output with a known-good key.

### Context

**Known Template A XTEA params** (from `scraper/cache/` or `CLAUDE.md`):
- Key: `[0x6257584F, 0x462A4564, 0x636A5062, 0x6D644140]`
- Delta: `0x9E3779B9`
- Rounds: `32`
- keyModConstants: `[2368517, 592130]`
- keyMods: `[0, 2368517, 0, 592130]`

**Reference tdc.js**: `targets/tdc.js` — fully analyzed, byte-identical token generation verified.

**Implementation approach**:
- Base on `scripts/token-forensics.js` (already has Puppeteer setup, CAPTCHA flow, forensic comparisons, decryption functions)
- Replace the tdc.js interception: instead of patching/instrumenting, serve `targets/tdc.js` content as the response
- Hardcode the Template A XTEA params (no extraction needed)
- Remove all key extraction logic (pipeline, in-page instrumentation, template cache)
- Keep the three comparison functions (A, B, C) exactly as they are

**Key concern**: The `eks` token is server-baked into each tdc.js build. By injecting the reference tdc.js, the `eks` extracted from it will be stale/wrong for the current session. This is fine — we're NOT submitting to the server for verification. We're purely comparing token generation.

**Files**:
- Read: `scripts/token-forensics.js` (clone as base, ~950 lines)
- Read: `targets/tdc.js` (the reference build to inject)
- Create: `scripts/ref-inject-forensics.js`

### Implementation Steps
1. Clone `scripts/token-forensics.js` as the base
2. Remove all key extraction code (in-page instrumentation, buildInPageInstrumentCode, parseVmFunction/mapOpcodes imports, CDP Fetch patching logic, trace collection, analyzeTrace)
3. Replace tdc.js interception with simple injection: when tdc.js is requested, respond with `fs.readFileSync('targets/tdc.js', 'utf8')`
4. Hardcode Template A XTEA params (no extraction, no cache lookup)
5. Keep all three comparison functions (A: plaintext, B: round-trip, C: full reconstruction)
6. Save results to `output/ref-inject-forensics.json`

### Verification
- [ ] `node -c scripts/ref-inject-forensics.js` passes
- [ ] `npm test` still passes 173/175
- [ ] Script reads `targets/tdc.js` and serves it via interception
- [ ] Template A XTEA params are hardcoded (not extracted)
- [ ] No key extraction code remains (no pipeline, no in-page, no cache)
- [ ] All three comparisons (A, B, C) are present

### Suggested Agent
general-purpose
