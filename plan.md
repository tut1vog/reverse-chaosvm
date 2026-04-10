# Plan

## Status
Current phase: Phase 17
Current task: 18.1 — Create token forensics script

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
| 18.1 | Create token forensics script | in-progress |
| 18.2 | Tests for token forensics helpers | pending |
| 18.3 | Live forensics test | pending |
| 18.4 | Fix identified divergence | pending |
| 18.5 | Live re-test with fix | pending |

---

## Current Task

**ID**: 18.1
**Title**: Create token forensics script
**Phase**: Token Forensics — Decrypt-Reencrypt Round-Trip
**Status**: in-progress

### Goal
Create `scripts/token-forensics.js` — a Puppeteer script that performs three precise comparisons for the same CAPTCHA session:

**Comparison A — Plaintext Serialization**: Decrypt Chrome's collect token to get the raw plaintext string. Build a standalone plaintext from the same cd array values using `buildCdString()` + `buildSdString()`. Compare the two plaintext strings character-by-character. This isolates whether our hand-rolled JSON serialization (`buildCdString`) matches the VM's `func_276`.

**Comparison B — Encryption Round-Trip**: Take Chrome's decrypted plaintext, split it into chunks (hash/header/cdBody/sig), re-encrypt with the same XTEA params, and compare byte-by-byte against Chrome's original encrypted token. If they match → our encryption is correct. If they differ → our encryption code or params are wrong.

**Comparison C — Full Reconstruction**: Build a complete standalone token from Chrome's cd array values (going through our full pipeline: buildCdString → buildInputChunks → encrypt → assembleToken) and compare against Chrome's token. This is the end-to-end check.

The three comparisons triangulate the root cause:
- If A fails → serialization bug (fix `buildCdString`)
- If A passes but B fails → encryption bug (fix `cipherRound` or params)
- If A and B pass but C fails → assembly bug (chunk splitting, segment order)

### Context

**Existing code to reuse:**
- `scripts/chrome-cd-inject.js` (current, ~830 lines) — already does: launch Chrome, prehandle, show page, intercept tdc.js, call TDC.getData(), decrypt Chrome's collect, look up template cache. Clone this as the base.
- `token/outer-pipeline.js` — `buildCdString()` (line 58), `buildSdString()` (line 31), `assembleToken()` (line 114)
- `token/generate-token.js` — `buildInputChunks()` (line 91), `buildHashChunk()` (line 65)
- `scraper/collect-generator.js` — `encrypt()` (line 117), `cipherRound()` (line 79), `createEncryptFn()` (line 169)

**How decryptCollect works** (already in chrome-cd-inject.js lines 160-178):
1. URL-decode: `%2B→+, %2F→/, %3D→=`
2. Base64 decode → binary string
3. `decryptXtea(entireBinaryString, params)` — decrypts ALL bytes as one stream
4. Strip trailing nulls/whitespace
5. `JSON.parse()` → `{ cd: [...], sd: {...} }`
6. Returns `{ plaintext, parsed }`

**Critical insight**: `decryptCollect` decrypts the ENTIRE base64 blob as one stream. But our encryption pipeline encrypts 4 SEPARATE chunks then base64-encodes each separately and concatenates in [1,0,2,3] order. So for Comparison B, we need to understand how the segments are split.

**Segment split logic** (from `docs/TOKEN_FORMAT.md`):
- The encrypted token is base64-decoded to one binary blob
- But it was assembled from 4 base64 segments: `btoa[1] + btoa[0] + btoa[2] + btoa[3]`
- Each segment, when base64-decoded, is an independently encrypted block
- The segment boundaries correspond to: header(192 b64 chars = 144 bytes), hash(64 b64 chars = 48 bytes), cdBody(variable), sig(variable)

For Comparison B, we need to:
1. Split Chrome's base64 token into the 4 segments (using known sizes: header=192 chars, hash=64 chars)
2. Base64-decode each segment independently
3. Re-encrypt the plaintext chunks with our XTEA
4. Base64-encode each and reassemble
5. Compare

**Files to create:**
- `scripts/token-forensics.js` — main script

**Key imports needed:**
```js
const { buildCdString, buildSdString, assembleToken, urlEncode } = require('../token/outer-pipeline');
const { buildInputChunks } = require('../token/generate-token');
const { generateCollect, createEncryptFn, encrypt, buildDefaultCdArray } = require('../scraper/collect-generator');
```

### Implementation Steps
1. Clone `scripts/chrome-cd-inject.js` structure (Chrome launch, session setup, TDC.getData, template lookup, decryption)
2. After decrypting Chrome's token (getting `plaintext` and `parsed`), perform:

   **Comparison A** — Plaintext:
   - Extract `chromeCd = parsed.cd`, `chromeSd = parsed.sd`
   - Build `ourCdString = buildCdString(chromeCd)`
   - Build `ourSdString = buildSdString(chromeSd)`
   - Extract Chrome's cd/sd strings from `plaintext` (split on `"sd":` boundary)
   - Compare character-by-character, report first divergence position and surrounding context

   **Comparison B** — Encryption round-trip:
   - Take Chrome's raw base64 token (before URL-decode), split into 4 segment base64 strings
   - Segment sizes: segment[0] (in assembly position 1) = 192 b64 chars, segment[1] (position 0) = 64 b64 chars, then cdBody = variable, sig = remainder
   - Wait — the assembly order is `btoa[1] + btoa[0] + btoa[2] + btoa[3]`. So in the concatenated string: first 192 chars = btoa[1] (header), next 64 chars = btoa[0] (hash), then cdBody, then sig.
   - For cdBody length: we know header=144 bytes=192 b64, hash=48 bytes=64 b64, sig we can estimate from sd string length rounded up to 8-byte then base64'd
   - Decrypt each segment separately, then re-encrypt each, compare
   - Also: take Chrome's decrypted plaintext, run it through our `buildInputChunks` to get chunks, encrypt each chunk, compare byte-by-byte with Chrome's encrypted segments

   **Comparison C** — Full reconstruction:
   - Use Chrome's cd array + sd object + Chrome's timestamp
   - Run through full `generateCollect()` with `cdArrayOverride`
   - Compare output token with Chrome's original token

3. Log all comparisons with detailed diff output
4. Save results to `output/token-forensics.json`

### Verification
- [ ] `node -c scripts/token-forensics.js` passes syntax check
- [ ] `npm test` still passes 173/175
- [ ] Script has all three comparison functions (A, B, C) implemented
- [ ] Script logs character-level and byte-level diffs

### Suggested Agent
general-purpose
