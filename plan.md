# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 8.3 — Tests for foundation modules

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
| 8.3 | Tests for foundation modules | in-progress |

### Phase 9: vData Generation
> Execute vm-slide.enc.js in jsdom to produce vData without a browser.

| ID | Task | Status |
|----|------|--------|
| 9.1 | vData generator (vdata-generator.js) — jsdom + vm-slide.enc.js + jQuery interception | pending |
| 9.2 | Tests for vData generator | pending |

### Phase 10: Scraper Orchestrator
> Wire all modules into a single scraper class and CLI that executes the full CAPTCHA flow.

| ID | Task | Status |
|----|------|--------|
| 10.1 | Scraper orchestrator class (scraper.js) | pending |
| 10.2 | CLI entry point (cli.js) | pending |
| 10.3 | Tests for scraper orchestrator | pending |

### Phase 11: End-to-End Integration
> Live integration testing against urlsec.qq.com and final documentation updates.

| ID | Task | Status |
|----|------|--------|
| 11.1 | End-to-end live test and debugging | pending |
| 11.2 | Update CLAUDE.md, create scrape command | pending |

---

## Current Task

**ID**: 8.3
**Title**: Tests for foundation modules
**Phase**: Scraper Foundation Modules
**Status**: in-progress

### Goal
Write comprehensive tests for the three Phase 8 modules: `scraper/tdc-utils.js`, `scraper/template-cache.js`, and `scraper/collect-generator.js`. Tests must be written by a different agent than the one that wrote the implementation.

### Context
- **`scraper/tdc-utils.js`** exports `extractTdcName(source)` and `extractEks(source)`. Both take a tdc.js source string and return a string or null.
- **`scraper/template-cache.js`** exports `TemplateCache` class with `load()`, `save()`, `lookup(tdcName)`, `store(tdcName, params)`, `seed()`. Cache file at `scraper/cache/templates.json`.
- **`scraper/collect-generator.js`** exports `generateCollect(profile, xteaParams, options)` and `createEncryptFn({key, delta, rounds, keyModConstants})`. Also exports internal cipher functions for testing.
- **Known test data**:
  - Template A: TDC_NAME=`FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk`, key=`[0x6257584F,0x462A4564,0x636A5062,0x6D644140]`, delta=`0x9E3779B9`, rounds=32, keyModConstants=`[2368517,592130]`
  - Template B: TDC_NAME=`SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD`, key=`[0x6B516842,0x4D554B69,0x69655456,0x452C233E]`
  - Template C: TDC_NAME=`WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE`, key=`[0x5949415A,0x454D6265,0x6D686358,0x6C66525F]`
  - EKS length is always 312 for all targets
  - `token/crypto-core.js` `encryptFn` is the reference for Template A encryption
  - `token/generate-token.js` `generateToken(cdArray, sdObject, timestamp)` is the reference for full token output
- **Target files** for testing: `targets/tdc.js`, `targets/tdc-v2.js`, `targets/tdc-v5.js`
- **Profile**: `profiles/default.json`
- **Existing test pattern**: see `tests/test-vm-parser.js` or `tests/test-opcode-mapper.js` — uses Node.js built-in `node:test` and `node:assert`.
- **Protected paths**: Do NOT modify `token/`, `pipeline/`, `puppeteer/`, `targets/`.
- Update `package.json` test script to include the new test file.

### Implementation Steps
1. Create `tests/test-scraper-foundation.js` using `node:test` and `node:assert`.
2. Test suites to include:
   - **tdc-utils: extractTdcName** — all 3 targets return correct names, invalid input returns null
   - **tdc-utils: extractEks** — all 3 targets return 312-char strings, invalid input returns null
   - **template-cache: lookup** — pre-seeded cache returns correct params for all 3 templates, unknown name returns null
   - **template-cache: store** — stores new entry and can look it up, updates lastSeen
   - **template-cache: seed** — seeds from output/ files and produces correct entries
   - **collect-generator: createEncryptFn** — Template A params produce byte-identical output to `token/crypto-core.encryptFn`
   - **collect-generator: generateCollect** — Template A with fixed inputs matches `token/generate-token.generateToken` exactly (use fixed timestamp, nonce, appid)
   - **collect-generator: different templates** — Template A and B produce different tokens
3. Update `package.json` test glob to include the new file.

### Verification
- [ ] `node --test tests/test-scraper-foundation.js` — all tests pass
- [ ] `npm test` — full suite passes (no regressions)
- [ ] Tests contain meaningful assertions (not just "runs without error") — verify by reading the test source

### Suggested Agent
general-purpose — writing tests against known interfaces with reference data
