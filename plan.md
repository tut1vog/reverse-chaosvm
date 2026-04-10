# Plan

## Status
Current phase: Phase 12
Current task: 12.3 — Analyze decrypted collect — compare field-by-field with our profile

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
| 12.3 | Analyze decrypted collect — compare field-by-field with our profile | in-progress |
| 12.4 | Update default profile and fix scraper to produce valid collect tokens | pending |
| 12.5 | Live end-to-end verification of headless scraper | pending |

---

## Current Task

**ID**: 12.3
**Title**: Analyze decrypted collect — build field mapping and identify scraper fixes
**Phase**: Scraper Debugging — Collect Token Analysis
**Status**: in-progress

### Goal
Analyze the decrypted browser vs scraper collect tokens to produce an actionable field mapping and identify what the scraper needs to fix to produce valid tokens.

### Context
From task 12.2 we have `output/puppeteer-capture/collect-decrypted.json` with both browser (60 entries) and scraper (59 entries) cd arrays, plus sd comparison. Key findings so far:
- The 98-opcode template uses completely different cd field ordering than Template A
- Browser sd has slideValue/coordinate/dragobj/ft; scraper sd has appid/nonce/token
- XTEA key mods are on indices 2 and 3 (not 1 and 3)
- Browser fingerprint: Chrome/146, Intel Iris GPU, Windows, [1280,1400], audio 44100Hz
- The collect token is a SINGLE base64 blob (not 4 segments) that decrypts to `{"cd":[...],"sd":{...}}`
- 98-opcode template key: [0x4F4D6852, 0x61426747, 0x45535C40, 0x6C3B4158], keyMods=[0, 0, 986887, 1513228]

Browser cd fields identified by value:
- [1] timezone "+08", [2] plugins, [5] audio fingerprint, [6] audio codecs
- [8] GPU renderer, [9] screen height, [13] color gamut, [16] WebGL canvas
- [18] video codecs, [22] user agent, [26] screen width, [28] feature bitmask
- [29] GPU vendor, [33] viewport, [44] languages, [45] charset
- [49] Intl options, [54] platform, [55] behavioral events + hash array

### Implementation Steps
1. Map each browser cd index to its semantic meaning
2. Cross-reference with `docs/COLLECTOR_SCHEMA.md` (scraper's 59-field ordering)
3. Produce `output/puppeteer-capture/field-mapping.json`
4. List critical scraper changes needed

### Verification
- [ ] field-mapping.json has mappings for all 60 browser cd entries
- [ ] Each mapping identifies collector schema field and corresponding scraper index
- [ ] Critical scraper fix list is actionable

### Suggested Agent
general-purpose — cross-referencing decrypted data with collector schema docs
