# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 9.2 — Tests for vData generator

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
| 9.2 | Tests for vData generator | in-progress |

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

**ID**: 9.2
**Title**: Tests for vData generator
**Phase**: vData Generation
**Status**: in-progress

### Goal
Write tests for `scraper/vdata-generator.js` — the jsdom-based vData generator. Tests must exercise the main `generateVData` function and the `parseVmSlideUrl` helper.

### Context
- **`scraper/vdata-generator.js`** exports:
  - `generateVData(postFields, vmSlideSource, jquerySource, options)` → `{vData: string, serializedBody: string}`
  - `parseVmSlideUrl(html)` → string or null
- **How it works**: Loads jQuery + vm-slide.enc.js in jsdom, hooks XHR.send before VM loads, triggers `$.ajax` POST → VM computes vData and appends to body → captured via hook.
- **Test data**: jQuery at `sample/slide-jy.js`, decoded vm-slide at `sample/vm_slide.js`.
- **vData properties**: 152 chars, printable ASCII, changes when POST body or userAgent changes.
- **serializedBody properties**: jQuery `$.param()` serialized, uses `&` separators, starts with first field name.
- **parseVmSlideUrl**: should match `<script src="/td/vm-slide.e201876f.enc.js">` patterns.
- Use `node:test` and `node:assert`. Follow patterns in `tests/test-scraper-foundation.js`.
- Add new test file to `package.json` test script.
- **Protected paths**: Do NOT modify `token/`, `pipeline/`, `puppeteer/`, `targets/`.

### Implementation Steps
1. Create `tests/test-vdata-generator.js` with suites:
   - **generateVData: basic output** — returns object with vData and serializedBody strings
   - **generateVData: vData properties** — 152 chars, printable ASCII, non-empty
   - **generateVData: serializedBody** — starts with first field, has `&` separators
   - **generateVData: determinism** — same inputs produce same vData (same userAgent, same fields)
   - **generateVData: different inputs produce different vData** — change a POST field, get different vData
   - **generateVData: userAgent affects output** — different userAgent → different vData
   - **parseVmSlideUrl** — extracts URL from HTML with script tag, returns null for invalid HTML
2. Update `package.json` test script to include new file.
3. Run tests, verify all pass.

### Verification
- [ ] `node --test tests/test-vdata-generator.js` — all tests pass
- [ ] `npm test` — no regressions
- [ ] Tests contain meaningful assertions (not just "runs without error")

### Suggested Agent
general-purpose — test writing with known interface
