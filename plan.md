# Plan

## Status
Current phase: Phase 7: Documentation
Current task: 7.1 — Update README.md for automated pipeline

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
| 7.1 | Update README.md for automated pipeline | in-progress |

---

## Current Task

**ID**: 7.1
**Title**: Update README.md for automated pipeline
**Phase**: Documentation
**Status**: in-progress

### Goal
Bring README.md up to date with the automated porting pipeline, multi-version results, and current test counts.

### Context
- `README.md` — current file, last updated before pipeline work. Missing: pipeline/ section, tdc-v5.js, multi-template results, updated test counts, pipeline Quick Start command.
- `CLAUDE.md` — already updated (task 6.4), use as reference for correct information.
- `pipeline/` contains: vm-parser.js, opcode-mapper.js, key-extractor.js, token-verifier.js, run.js
- `targets/` contains: tdc.js, tdc-v2.js, tdc-v3.js, tdc-v4.js, tdc-v5.js
- Tests: 92 total, 90 pass, 2 known failures (same as before: test-cfg.js, test-emit.js)
- Multi-version results: 3 templates (A=95, B=94, C=100), all 5 targets produce byte-identical tokens
- Pipeline command: `node pipeline/run.js targets/tdc-vN.js`

### Implementation Steps
1. Read current README.md and CLAUDE.md for reference
2. Add the automated porting pipeline to the overview diagram and "What This Project Does" (item 4)
3. Add `node pipeline/run.js targets/tdc.js` to Quick Start
4. Add `pipeline/` directory to Project Structure with all 5 files
5. Fix `targets/` listing: show all 5 files, move them into `targets/` subdirectory
6. Add a new "Automated Porting Pipeline" section (between Token Generator and CAPTCHA Solver) explaining the 4-stage pipeline and multi-template results table
7. Update test count from "11 of 13" to "90 of 92"
8. Update test file examples to include pipeline tests
9. Do NOT add emojis. Keep the existing tone/style.

### Verification
- [ ] `grep -c 'pipeline' README.md` shows multiple hits (pipeline section exists)
- [ ] README.md mentions all 5 targets (tdc.js through tdc-v5.js)
- [ ] README.md contains the 3-template results table
- [ ] README.md shows `node pipeline/run.js` in Quick Start
- [ ] README.md says "90 of 92 tests pass"
- [ ] `pipeline/` directory listed in Project Structure with all 5 files
- [ ] No broken markdown (visual inspection)

### Suggested Agent
general-purpose — straightforward documentation rewrite with clear reference material
