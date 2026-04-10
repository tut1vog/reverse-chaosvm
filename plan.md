# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 8.1 — Template cache and TDC utilities

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
| 8.1 | Template cache and TDC utilities (tdc-utils.js, template-cache.js) | in-progress |
| 8.2 | Parameterized collect token generator (collect-generator.js) | pending |
| 8.3 | Tests for foundation modules | pending |

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

**ID**: 8.1
**Title**: Template cache and TDC utilities
**Phase**: Scraper Foundation Modules
**Status**: in-progress

### Goal
Create two utility modules: `scraper/tdc-utils.js` (extract TDC_NAME and eks from tdc.js source) and `scraper/template-cache.js` (map TDC_NAME → XTEA params, pre-seeded from existing pipeline output). These are prerequisites for all downstream scraper modules.

### Context
- **TDC_NAME extraction**: Line 1 of every tdc.js contains `var TDC_NAME="<32-char-string>"`. Extract via regex.
- **eks extraction**: Line 123 (approximately) contains `window[TDC_NAME] = '<base64>'` — the eks token. 312 chars base64. Extract via regex matching `window[...] = '...'` pattern on the source string.
- **Template cache**: Simple JSON file at `scraper/cache/templates.json`. Pre-seed from the 5 existing `output/*/pipeline-config.json` files. Each entry maps TDC_NAME → `{template, key, delta, rounds, keyModConstants, caseCount, lastSeen}`.
- **Existing pipeline configs** at `output/tdc/pipeline-config.json` etc. contain `xteaParams: {key, delta, rounds, keyModConstants}` and `template` field.
- The cache module should support: `lookup(tdcName)` → params or null, `store(tdcName, params)`, `seed()` to populate from output files.
- **Protected paths**: Do NOT modify anything in `token/`, `pipeline/`, `puppeteer/`, `targets/`. Only create new files in `scraper/`.
- **Style**: CommonJS, 2-space indent, single quotes, semicolons, `const`/`let`.

### Implementation Steps
1. Create `scraper/` directory and `scraper/cache/` subdirectory.
2. Create `scraper/tdc-utils.js` with:
   - `extractTdcName(source)` — regex on first line: `/var\s+TDC_NAME\s*=\s*"([^"]+)"/`
   - `extractEks(source)` — regex: `/window\[TDC_NAME\]\s*=\s*'([^']+)'/` (or match the variable pattern)
3. Create `scraper/template-cache.js` with:
   - Constructor takes optional path to `templates.json` (default: `scraper/cache/templates.json`)
   - `load()` — read JSON file, return cache object
   - `save()` — write cache to disk
   - `lookup(tdcName)` — return XTEA params or null
   - `store(tdcName, params)` — add/update entry with `lastSeen` timestamp
   - `seed()` — scan `output/*/pipeline-config.json` files and populate cache
4. Create `scraper/cache/templates.json` pre-seeded with all 3 known templates (A, B, C).

### Verification
- [ ] `node -e "const u = require('./scraper/tdc-utils'); const fs = require('fs'); const src = fs.readFileSync('targets/tdc.js','utf8'); console.log(u.extractTdcName(src)); console.log(u.extractEks(src).length)"` → prints `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` and `312`
- [ ] Same test with `targets/tdc-v2.js` → prints `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` and `312`
- [ ] Same test with `targets/tdc-v5.js` → prints `WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE` and `312`
- [ ] `node -e "const c = require('./scraper/template-cache'); const cache = new c(); cache.load(); const p = cache.lookup('FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk'); console.log(p.key, p.delta, p.rounds)"` → prints the correct key array, delta 2654435769, rounds 32
- [ ] `scraper/cache/templates.json` exists and contains 3 entries with correct XTEA keys matching `output/*/pipeline-config.json`

### Suggested Agent
general-purpose — straightforward file creation with known patterns and data
