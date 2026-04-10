# Plan

## Status
Current phase: Phase 17
Current task: 18.5 — Live forensics with in-page key

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
| 18.5 | Live forensics with in-page key | in-progress |
| 18.6 | Fix identified divergence | pending |
| 18.7 | Live re-test with fix | pending |

---

## Current Task

**ID**: 18.3
**Title**: Live forensics test
**Phase**: Token Forensics — Decrypt-Reencrypt Round-Trip
**Status**: in-progress

**ID**: 18.4
**Title**: In-page key instrumentation for live tdc.js
**Phase**: Token Forensics — Decrypt-Reencrypt Round-Trip
**Status**: in-progress

### Goal
Modify `scripts/token-forensics.js` to instrument the live tdc.js on the actual CAPTCHA page (not an isolated page) to capture the real XTEA key used at runtime. The key-extractor's `patchTdcSource` + `buildInstrumentCode` + `analyzeTrace` provide the instrumentation and analysis logic — we need to apply them in-page via request interception.

### Context

**Why the pipeline key extractor fails for live builds**:
The pipeline runs tdc.js on an isolated page (`http://127.0.0.1`) with frozen Date/Math/crypto and a minimal DOM. The live VM's key derivation likely depends on real CAPTCHA page state — the `cap_union_new_show` page has specific DOM elements, cookies, and session data that affect the VM's execution path, including the key schedule.

**What the key extractor does internally** (all in `pipeline/key-extractor.js`):
1. `patchTdcSource(source, variables)` — finds the VM dispatch `switch(Y[++C])` and patches it to call `window.__KT(pc, opcode, regs, bytecode)` before each dispatch (line 71-94)
2. `buildInstrumentCode(lookups)` — builds JS that defines `window.__KT` hook + freezes non-deterministic APIs (line 100-197). **For in-page use, we must NOT freeze Date/Math/crypto/canvas** — those affect fingerprinting and thus the key derivation!
3. `analyzeTrace(ops)` — extracts key, delta, rounds, keyModConstants from traced ops (line 328-546). This is pure analysis, works independently.
4. `buildOpcodeLookups(opcodeTable)` — converts opcode table to fast lookup sets (line 29-68)

**These functions are currently NOT exported.** We need to either:
- Export them from key-extractor.js (preferred — reuse existing code)
- Or inline the necessary logic

**The instrumentation approach for in-page**:
1. Capture tdc.js source via request interception (already done in forensics script)
2. Run `parseVmFunction` + `mapOpcodes` on the source (already done)
3. Call `patchTdcSource(source, parsed.variables)` to add trace hooks
4. Build a MODIFIED instrument code (like `buildInstrumentCode` but WITHOUT the Date/Math/crypto freezing — only the `__KT` hook definition, trace storage, and ARITH_OPS/LOAD_OPS lookup tables)
5. Serve the patched source to Chrome via request interception response
6. After page loads and TDC initializes, enable tracing: `window.__KT_ACTIVE = true`
7. Call `TDC.setData({appid, ...})` + `TDC.getData(true)` (which triggers the cipher)
8. Disable tracing, retrieve `__KT_OPS` from the page
9. Call `analyzeTrace(ops)` to extract the key
10. Use the extracted key (with correct keyMods derivation) to decrypt Chrome's collect token
11. Now Comparisons A/B/C can all run

### Implementation Steps

**Step 1: Export internals from `pipeline/key-extractor.js`**
Add to `module.exports`: `buildOpcodeLookups`, `patchTdcSource`, `buildInstrumentCode`, `analyzeTrace`

**Step 2: Create `buildInPageInstrumentCode(lookups)` in `scripts/token-forensics.js`**
This is a variant of `buildInstrumentCode` that ONLY includes:
- The `__KT` trace hook function
- The `__KT_OPS`, `__KT_ERRORS`, `__KT_ACTIVE` globals
- The `ARITH_OPS` and `LOAD_OPS` lookup tables
- Does NOT freeze Date.now, Math.random, performance.now, crypto, canvas
This ensures the VM runs with real browser values so key derivation is authentic.

**Step 3: Modify the forensics script's tdc.js interception**
The script already intercepts tdc.js to capture the source. Modify it to:
- After capturing source: parse VM, map opcodes, patch source, build instrument code
- Serve the PATCHED+INSTRUMENTED source as the response (instead of the original)
- This means the page loads our instrumented version of tdc.js

**Step 4: After TDC.getData(), collect trace and analyze**
- `await page.evaluate(() => window.__KT_ACTIVE = true)` before getData
- Call getData
- `await page.evaluate(() => window.__KT_ACTIVE = false)` 
- Retrieve `__KT_OPS` (may be large — use batched retrieval like collectTrace does)
- Call `analyzeTrace(ops)` → get `{ key, delta, rounds, keyModConstants }`
- Derive keyMods = [0, kmc[0], 0, kmc[1]]

**Step 5: Use the in-page extracted key for decryption and comparisons**
Replace the current `extractXteaFromSource()` call with the in-page extraction result.

### Verification
- [ ] `pipeline/key-extractor.js` exports `buildOpcodeLookups`, `patchTdcSource`, `analyzeTrace`
- [ ] `node -c scripts/token-forensics.js` passes
- [ ] `npm test` still passes 173/175
- [ ] Script instruments tdc.js on the real CAPTCHA page (not isolated)
- [ ] Script does NOT freeze Date/Math/crypto in the instrument code

### Suggested Agent
general-purpose
