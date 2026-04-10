# Plan

## Status
Current phase: Phase 3 — VM Parser & Opcode Auto-Mapper
Current task: 3.3 — Tests for VM parser and opcode mapper

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
| 3.3 | Tests for VM parser and opcode mapper (validate against tdc.js reference table) | in-progress |

### Phase 4: XTEA Key Extractor
> Build Puppeteer-based dynamic tracing to extract XTEA key schedule from any tdc build.

| ID | Task | Status |
|----|------|--------|
| 4.1 | Implement dynamic key extraction module | pending |
| 4.2 | Tests for key extractor (validate against tdc.js known key) | pending |

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

**ID**: 3.3
**Title**: Tests for VM parser and opcode mapper
**Phase**: VM Parser & Opcode Auto-Mapper
**Status**: in-progress

### Goal
Write comprehensive tests for `pipeline/vm-parser.js` and `pipeline/opcode-mapper.js` using Node.js built-in test runner. Tests must validate correctness against the known-good reference (tdc.js Template A) and verify cross-template support.

### Context
- `pipeline/vm-parser.js` — exports `parseVmFunction(src)` returning `{ variables, switchNode, caseCount, dispatchFunction }`
- `pipeline/opcode-mapper.js` — exports `mapOpcodes(parseResult)` returning `{ opcodeTable, unmapped, notes }`
- Known-good reference: tdc.js has 95 opcodes mapping to the table in `decompiler/disassembler.js` lines 27-123
- Cross-template results: tdc-v2 (94 cases, 92 mapped), tdc-v5 (100 cases, 91 mapped)
- Existing test convention: `tests/test-*.js` files using `node --test`
- Important: this task must be done by a DIFFERENT agent than the one that wrote the implementation

### Implementation Steps
1. Create `tests/test-vm-parser.js`
2. Create `tests/test-opcode-mapper.js`
3. Update `package.json` to include the new test files in the test script

### Verification
- [ ] `node --test tests/test-vm-parser.js` passes
- [ ] `node --test tests/test-opcode-mapper.js` passes
- [ ] Tests cover: correct variable identification for all 5 targets, case count accuracy, opcode table correctness for tdc.js (all 95 entries), cross-template mapping works, unmapped cases are reported correctly
- [ ] Existing tests still pass: `npm test` produces same results as before (9/11 pass)

### Suggested Agent
general-purpose — test writing (must be different agent than implementation)
