# Plan

## Status
Current phase: Phase 16
Current task: 16.3 — Fix sd.coordinate format and slideValue timestamp format

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
| 16.3 | Fix sd.coordinate format and slideValue timestamp format | pending |
| 16.4 | Fix cd field mismatches (platform, maxTouchPoints, vendor, screenPosition) | pending |
| 16.5 | Live re-test after fixes | pending |

---

## Current Task

**ID**: 16.3
**Title**: Fix sd.coordinate format and slideValue timestamp format
**Phase**: Definitive Test — Chrome tdc.js vs Standalone Collect
**Status**: pending

### Goal
Fix the two most critical structural differences in the standalone collect token that almost certainly cause errorCode 9: (1) `sd.coordinate` sends wrong values — standalone sends `[xAnswer, slideY, timestamp]` but Chrome sends `[leftOffset, topOffset, dragRatio]`; (2) `sd.slideValue` uses absolute timestamps for the dt field, but Chrome uses relative time deltas from the previous event.

### Context
**Diff results** (`output/chrome-vs-standalone-diff.json`):

**sd.coordinate** (WRONG FORMAT):
- Chrome: `[10, 60, 1.8559]` — [left CSS offset to slider start, top offset, display ratio]
- Standalone: `[459, 30, 1775829848529]` — [xAnswer, slideY, timestamp_ms]
- The coordinate needs to be [slider_left_px, slider_top_px, captcha_ratio] — these are CSS layout values, NOT the answer coordinates.

**sd.slideValue** (WRONG TIMESTAMP FORMAT):
- Chrome: `[[158, 814, 90], [85, 0, 41], [76, -3, 24], ...]` — [dx, dy, dt_relative_ms]
- Standalone: `[[32, 0, 1775829848529], [32, 1, 1775829848627], ...]` — [dx, dy, absolute_timestamp_ms]
- The dt field should be milliseconds since the previous event, NOT absolute timestamp.

**Files to modify**:
- `scraper/collect-generator.js` — `buildSlideSd()` builds the sd object including `coordinate` and `slideValue`
- `scraper/collect-generator.js` — `generateBehavioralEvents()` produces the raw event data that gets turned into slideValue

### Implementation Steps
1. Fix `buildSlideSd()` in `scraper/collect-generator.js`:
   - Change `coordinate` to accept `[leftOffset, topOffset, ratio]` instead of `[xAnswer, slideY, timestamp]`
   - The caller must pass the correct coordinate values (left offset from slider start, top offset, display ratio from the page)
   
2. Fix `generateBehavioralEvents()` or the slideValue construction:
   - Convert absolute timestamps to relative deltas: `dt[i] = timestamp[i] - timestamp[i-1]`
   - First event uses time since drag start
   
3. Update all callers of `buildSlideSd()`:
   - `scraper/collect-generator.js` itself (if it calls buildSlideSd internally)
   - `scripts/hybrid-solver.js`
   - `scripts/collect-diff.js`
   - Any other callers

### Verification
- [ ] `node -e "const cg = require('./scraper/collect-generator'); ..."` — buildSlideSd produces relative dt in slideValue
- [ ] Run `node scripts/collect-diff.js` — sd.coordinate and sd.slideValue formats now match Chrome
- [ ] No existing tests broken: `npm test` passes (163/165)

### Suggested Agent
general-purpose
