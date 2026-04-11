# Plan

## Status
Current phase: Phase 17
Current task: 19.5 — Fix buildInputChunks header split

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
| 19.3 | Deep cd serialization analysis | done |
| 19.4 | Root cause analysis — header splits at field boundary | done |
| 19.5 | Fix buildInputChunks header split | done |
| 19.6 | Verify fix with ref-inject-forensics | done |
| 19.7 | Live re-test with actual CAPTCHA | pending |

---

## Current Task

**ID**: 19.5
**Title**: Fix buildInputChunks header split
**Phase**: Reference tdc.js Injection Forensics
**Status**: in-progress

### Goal
Fix `token/generate-token.js` `buildInputChunks()` to split the payload body at the last complete JSON field boundary within HEADER_SIZE (144 bytes), instead of at a fixed byte boundary. Chrome's VM does this, causing header content to end at a natural comma-separator and be space-padded to 144. Our code takes exactly 144 bytes of continuous content, producing different header and cdBody chunks.

### Evidence from 19.3/19.4
- Chrome header: 144 bytes, **trimmed to 133** (11 bytes space padding) — content = first 11 cd fields ending with `,`
- Our header: 144 bytes, **all content** (no padding) — includes partial field 11
- Chrome cdBody starts with `,0,[{"codec":...` (field 11 = sessionStorageAvail) 
- Our cdBody starts mid-content at byte 144

### The Fix

In `buildInputChunks` (line 106-108 of `token/generate-token.js`), change:
```js
// OLD: split at fixed byte boundary
const headerContent = payloadBody.substring(0, HEADER_SIZE);
const header = headerContent.padEnd(HEADER_SIZE, ' ');
```
to:
```js
// NEW: split at last field boundary within HEADER_SIZE
// Find the last comma-separated field boundary within HEADER_SIZE
// Walk the payload body, tracking JSON depth to find top-level commas
let splitPos = Math.min(payloadBody.length, HEADER_SIZE);
if (payloadBody.length > HEADER_SIZE) {
  // Find the last top-level comma at or before HEADER_SIZE
  let lastComma = -1;
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < HEADER_SIZE && i < payloadBody.length; i++) {
    const ch = payloadBody[i];
    if (inStr) {
      if (ch === '\\') i++;  // skip escaped char
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '[' || ch === '{') depth++;
      else if (ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 1) lastComma = i + 1;  // after the comma
    }
  }
  if (lastComma > 0) splitPos = lastComma;
}
const headerContent = payloadBody.substring(0, splitPos);
const header = headerContent.padEnd(HEADER_SIZE, ' ');
```

And for the cdBody:
```js
const cdContent = payloadBody.substring(splitPos);
```

The `depth === 1` check ensures we only split at top-level cd array commas (inside `{"cd":[`), not at commas within nested objects/arrays.

### Context
- File: `token/generate-token.js` lines 91-123
- `HEADER_SIZE = 144` (line 36)
- The function is used by both `token/generate-token.js` and `scraper/collect-generator.js`
- Tests: `tests/` — need to check if any tests depend on the exact header split

### Verification
- [ ] `node -c token/generate-token.js` passes
- [ ] `npm test` passes (173/175 or adjusts for changed split behavior)
- [ ] For the default 59-field cd array with default profile, the header content length is ~133 bytes (matching Chrome)
- [ ] `node scripts/ref-inject-forensics.js` shows comparison C: all segments IDENTICAL

### Suggested Agent
general-purpose
