# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 11.2 — Update CLAUDE.md, create scrape command

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
| 11.2 | Update CLAUDE.md, create scrape command | in-progress |

---

## Current Task

**ID**: 11.2
**Title**: Update CLAUDE.md, create scrape command
**Phase**: End-to-End Integration
**Status**: in-progress

### Goal
Update CLAUDE.md with the scraper module documentation and create `.claude/commands/scrape.md` slash command. Also document the live test findings (captcha type change, TLS blocking, new template).

### Context
- **Scraper module** is complete: `scraper/` contains tdc-utils.js, template-cache.js, collect-generator.js, vdata-generator.js, scraper.js, cli.js.
- **Live test findings** (task 11.1):
  1. **Show page 403**: `cap_union_new_show` now returns HTTP 403 for Node.js/curl (TLS fingerprint blocking). Prehandle still works.
  2. **Captcha type changed**: urlsec.qq.com now serves `click_image_uncheck` (6-panel AI image selection) instead of slide captchas. The scraper handles slide only.
  3. **New template**: Live server serves TDC_NAME `XDNjaBAfTnmcmcHkOlDVmNBfePGUbRXR` (not in cache). tdc.js is still fetchable.
  4. **CLI bugs fixed**: 4 bugs in cli.js found and fixed during live testing (import, init call, config key, method name).
- The scraper architecture is correct and all unit tests pass. It would work against a slide CAPTCHA endpoint — the blocker is Tencent's server-side changes.
- **Protected paths**: Do NOT modify `token/`, `pipeline/`, `puppeteer/`, `targets/`.

### Implementation Steps
1. Update CLAUDE.md:
   - Add `scraper/` to Project Structure
   - Add scraper CLI to Commands section
   - Add scraper architecture to Architecture section
   - Note the live test findings and current limitations
2. Create `.claude/commands/scrape.md` slash command for running the scraper.

### Verification
- [ ] `scraper/` appears in CLAUDE.md Project Structure
- [ ] Scraper CLI usage appears in CLAUDE.md Commands
- [ ] `.claude/commands/scrape.md` exists with proper format
- [ ] Live test limitations are documented

### Suggested Agent
general-purpose — documentation updates
