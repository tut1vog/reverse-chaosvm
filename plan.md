# Plan

## Status
Current phase: Phase 4 — XTEA Key Extractor
Current task: 4.2 — Tests for key extractor

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
| 4.2 | Tests for key extractor (validate against tdc.js known key) | in-progress |

### Phase 5: Token Verifier & Pipeline Orchestrator
> Build the token comparison module and the single-command orchestrator that chains all stages.

| ID | Task | Status |
|----|------|--------|
| 5.1 | Implement token verifier module (capture live, generate standalone, byte-compare) | pending |
| 5.2 | Implement pipeline orchestrator (decode → map → extract → verify) | pending |
| 5.3 | Tests for verifier and orchestrator | pending |

### Phase 6: Multi-Version Validation
> Run the automated pipeline against all tdc builds, fix issues, document findings.

| ID | Task | Status |
|----|------|--------|
| 6.1 | Port tdc-v3 (Template A — same as tdc.js, sanity check) | pending |
| 6.2 | Port tdc-v2 (Template B — different opcodes and XTEA key) | pending |
| 6.3 | Port tdc-v4 and tdc-v5 (unknown templates) | pending |
| 6.4 | Update documentation with all findings | pending |

---

## Current Task

**ID**: 4.2
**Title**: Tests for key extractor
**Phase**: XTEA Key Extractor
**Status**: in-progress

### Goal
Write tests for `pipeline/key-extractor.js` validating that it correctly extracts XTEA parameters from tdc.js (Template A). Tests must be written by a different agent than the implementation.

### Context
- `pipeline/key-extractor.js` exports `extractKey(tdcPath, opcodeTable, variables)` (async)
- Returns `{ key, delta, rounds, keyModConstants, verified, notes }`
- Known-good values for tdc.js: key=[0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140], delta=0x9E3779B9, rounds=32, keyModConstants=[2368517, 592130]
- Tests require Puppeteer (headless Chrome) — each test takes ~4-5 seconds
- The module needs opcode table and variables from the pipeline modules

### Implementation Steps
1. Create `tests/test-key-extractor.js`
2. Update `package.json` test script to include it

### Verification
- [ ] `node --test tests/test-key-extractor.js` passes
- [ ] Tests validate: key values, delta, round count, key mod constants, return type structure
- [ ] Existing tests still pass (83/85)

### Suggested Agent
general-purpose — test writing (different agent than implementation)
