# Plan

## Status
Current phase: Phase 6 — Multi-Version Validation
Current task: 6.1 — Port tdc-v3 (Template A — same as tdc.js, sanity check)

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
| 6.1 | Port tdc-v3 (Template A — same as tdc.js, sanity check) | in-progress |
| 6.2 | Port tdc-v2 (Template B — different opcodes and XTEA key) | pending |
| 6.3 | Port tdc-v4 and tdc-v5 (unknown templates) | pending |
| 6.4 | Update documentation with all findings | pending |

---

## Current Task

**ID**: 6.1
**Title**: Port tdc-v3 (Template A — same as tdc.js, sanity check)
**Phase**: Multi-Version Validation
**Status**: in-progress

### Goal
Run the automated pipeline on tdc-v3.js as a sanity check. This is the same template as tdc.js (Template A, 95 opcodes) so it should pass with byte-identical token match.

### Verification
- [ ] `node pipeline/run.js targets/tdc-v3.js` completes all 4 stages
- [ ] Template classified as A (95 opcodes)
- [ ] XTEA key matches tdc.js key (same template)
- [ ] Token verification: byte-identical match
- [ ] Output files saved to `output/tdc-v3/`
