# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 11.1 — End-to-end live test and debugging

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
| 11.1 | End-to-end live test and debugging | in-progress |
| 11.2 | Update CLAUDE.md, create scrape command | pending |

---

## Current Task

**ID**: 11.1
**Title**: End-to-end live test and debugging
**Phase**: End-to-End Integration
**Status**: in-progress

### Goal
Run the scraper against live Tencent endpoints and debug any issues. This is where we discover whether the headless approach actually works — vData acceptance, collect validation, slide ratio, TLS fingerprinting, etc.

### Context
- All modules are built and unit-tested. The full flow is wired in `scraper/scraper.js`.
- **Known unknowns** (from project-brief.md):
  1. Will jsdom-generated vData pass server validation?
  2. Will faked fingerprint values in collect pass?
  3. Is the vm-slide.enc.js URL stable? (must parse from show page per session)
  4. Slide ratio without a browser — may need tuning (0.5 default, bot.py uses dynamic ratio)
  5. Does the server check TLS fingerprint? (Node.js HTTP may be flagged)
  6. vm-slide.enc.js fetching — need to parse show page HTML for script URLs
- **Rate limiting**: wait ≥1s between requests to live endpoints.
- The live test should be run via `node scraper/cli.js --captcha-only --verbose` first (just solve CAPTCHA, don't query urlsec).
- Then if CAPTCHA solving works: `node scraper/cli.js --verbose https://example.com`
- **This task is investigative** — the agent should run, observe, diagnose, and fix issues iteratively.
- **Protected paths**: Do NOT modify `token/`, `pipeline/`, `puppeteer/`, `targets/`.
- **May modify**: `scraper/*.js` to fix bugs discovered during live testing.

### Implementation Steps
1. Run `node scraper/cli.js --captcha-only --verbose 2>&1` and observe the output.
2. If it fails, diagnose the error and fix it in `scraper/` modules.
3. Common issues to watch for:
   - Unknown template (new TDC_NAME not in cache) → need to run pipeline or manually add
   - vm-slide.enc.js not found → fix URL parsing or fetching
   - errorCode 9 → vData or body serialization mismatch
   - errorCode 7 → slide answer wrong (ratio/calibration issue)
   - Network errors → TLS fingerprinting or blocked IP
4. Iterate until `solveCaptcha()` returns errorCode=0 with a valid ticket.
5. Then test full flow with urlsec query.

### Verification
- [ ] `node scraper/cli.js --captcha-only --verbose` returns errorCode=0 with a ticket
- [ ] OR: clear diagnosis of what blocks success with a remediation plan

### Suggested Agent
general-purpose — live debugging with iterative fixes
