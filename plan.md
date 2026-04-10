# Plan

## Status
Current phase: Phase 13
Current task: 13.2 — Investigate vsig/websig source + fetch live vm-slide.js

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
| 13.2 | Investigate vsig/websig source + fetch live vm-slide.js | in-progress |
| 13.3 | Live re-test after fixes | pending |

---

## Current Task

**ID**: 13.2
**Title**: Switch to show page path, fetch live vm-slide.js, ensure vsig/websig
**Phase**: ErrorCode 9 Debugging
**Status**: in-progress

### Goal
Ensure the scraper uses the show page path (not legacy JSONP) to get vsig/websig, showUrl, and live vm-slide.js URL. The legacy path (`_getSigLegacy`) does not set `showUrl` and may not provide vsig/websig. The show page path (`_getShowConfig`) provides all of these.

### Context
In `puppeteer/captcha-client.js`, `getSig()` tries legacy JSONP first, falls back to show page on 404. The legacy endpoint:
- Does NOT set `showUrl` in its return object
- May return empty vsig/websig
- Does not provide vm-slide URL

The show page (`_getShowConfig`):
- Sets `showUrl` (the full show page URL with session params)
- Provides vsig/websig from embedded config
- HTML contains vm-slide script URL (parseable via `parseVmSlideUrl`)

The scraper's `_getVmSlideSource` already tries to find vm-slide from `sig._raw` but uses wrong field names (`vmSlide`, `vm_slide`, `vmSlideFileName`). The actual show page config likely uses a different key.

Key files:
- `puppeteer/captcha-client.js` — `getSig()`, `_getSigLegacy()`, `_getShowConfig()`
- `scraper/scraper.js` — `solveCaptcha()`, `_getVmSlideSource()`
- `scraper/vdata-generator.js` — `parseVmSlideUrl()` for extracting script URL from HTML

### Implementation Steps
1. In `scraper/scraper.js`, after getSig, check if `sig.showUrl` is set. If not (legacy path was used), construct a show page URL from session params, OR force the show page path by adding a `useShowPage` option.
2. Fetch live vm-slide.js: after getting the show page config, look for vm-slide URL in `sig._raw` or in the show page HTML. Use `parseVmSlideUrl` on the HTML if available.
3. Update `_getVmSlideSource` to look for the correct field names in `sig._raw`.
4. Live test: run the scraper and observe whether showUrl, vsig/websig, and vm-slide are populated.

### Verification
- [ ] `sig.showUrl` is always populated (even if legacy path is used)
- [ ] Live vm-slide.js is fetched when available (not always falling back to sample/)
- [ ] `npm test` — 163/165 pass (no regressions)
- [ ] `node -c scraper/scraper.js && node -c puppeteer/captcha-client.js` — no syntax errors

### Suggested Agent
general-purpose
