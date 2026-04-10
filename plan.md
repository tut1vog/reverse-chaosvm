# Plan

## Status
Current phase: Phase 15
Current task: 15.1 — Build POST body comparison script

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
| 15.1 | Build POST body comparison script | in-progress |
| 15.2 | Fix all identified discrepancies | pending |
| 15.3 | Tests for fixes | pending |
| 15.4 | Live end-to-end verification | pending |

---

## Current Task

**ID**: 15.1
**Title**: Build POST body comparison script
**Phase**: Byte-Level POST Body Comparison
**Status**: in-progress

### Goal
Create a script that generates a fresh collect token using the current scraper code (with all Phase 12-13 fixes), decrypts it, and compares every field against the known-good browser capture from Phase 12.1. Also compare the full verify POST body field structure. Output a detailed diff report identifying all remaining discrepancies.

### Context

**Ground truth (browser capture, successful errorCode 0):**
- `output/puppeteer-capture/verify-post.json` — full verify POST body fields (38 fields)
- `output/puppeteer-capture/collect-decrypted.json` — decrypted collect with 60-field cd array + sd structure
- `output/tdc-capture/xtea-params.json` — XTEA key from captured tdc.js: key=[0x4F4D6852, 0x61426747, 0x45535C40, 0x6C3B4158], keyModConstants=[0, 1513228]
- `output/tdc-capture/pipeline-config.json` — 98 opcodes, 6 unmapped

**Scraper code to test:**
- `scraper/collect-generator.js` — `generateCollect(profile, xteaParams, options)` + `buildSlideSd()` + `generateBehavioralEvents()`
- `token/collector-schema.js` — `buildDefaultCdArray(profile)` (59-field cd array, schema order)
- `token/outer-pipeline.js` — `buildCdString()` (hand-rolled JSON serialization), `buildSdString()`, `buildInputChunks()`, `assembleToken()`, `urlEncode()`
- `token/crypto-core.js` — XTEA encryption
- `profiles/default.json` — current profile (updated in Phase 12.4)
- `scraper/cache/templates.json` — template cache with cdFieldOrder for 98-opcode templates

**What the script must do:**
1. Load the browser capture as ground truth
2. Load the current profile and 98-opcode template params from cache
3. Use the SAME session params as the browser capture (nonce, sess, sid, aid, etc. from verify-post.json) so the comparison is apples-to-apples
4. Call `generateCollect()` with the browser's session params + current profile + 98-opcode XTEA params + cdFieldOrder
5. Decrypt the generated collect token using the same XTEA params
6. Compare cd arrays field-by-field (60 fields, using the cdFieldOrder mapping)
7. Compare sd structures field-by-field
8. Compare the full verify POST body field list (names, ordering, values where static)
9. Output a structured diff report to `output/post-body-diff.json` with:
   - For each cd field: index, name, browser value (summary), scraper value (summary), match/mismatch, severity
   - sd field comparison
   - POST body field list comparison
   - Summary: total fields, matching, mismatched, and a prioritized fix list

**Decryption approach:**
- Use `token/crypto-core.js` `createDecryptFn()` or reverse the encrypt pipeline:
  1. URL-decode the token
  2. Split into 4 base64 segments (reorder from [1,0,2,3] back to [0,1,2,3])
  3. Decode each base64 segment
  4. Decrypt each segment with XTEA
  5. Reassemble into the original JSON string

**Key detail — the token pipeline assembly order:**
- `assembleToken([seg0, seg1, seg2, seg3])` outputs them in order `[seg1, seg0, seg2, seg3]`
- Each segment is base64-encoded and concatenated
- Then URL-encoded

The script can also just call `buildDefaultCdArray()` + `reorderCdArray()` directly (skipping encryption) since we really want to compare the PRE-encryption cd/sd values, not the encrypted token.

### Implementation Steps
1. Create `scripts/post-body-compare.js`
2. Load ground truth from `output/puppeteer-capture/`
3. Build scraper cd array using current profile + `buildDefaultCdArray()` + `reorderCdArray()` with 98-opcode cdFieldOrder
4. Build scraper sd using `buildSlideSd()` with mock slide data matching the browser's ans
5. Compare field-by-field and output diff
6. Also compare verify POST field names/values

### Verification
- [ ] `scripts/post-body-compare.js` runs without errors: `node scripts/post-body-compare.js`
- [ ] `output/post-body-diff.json` is created with structured comparison results
- [ ] The diff identifies at least the known remaining differences (e.g., vendor field)
- [ ] Both cd and sd sections have field-by-field comparisons

### Suggested Agent
general-purpose
