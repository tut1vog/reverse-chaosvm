# Plan

## Status
Current phase: Phase 5 — Token Verifier & Pipeline Orchestrator
Current task: 5.2 — Implement pipeline orchestrator

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
| 5.2 | Implement pipeline orchestrator (decode → map → extract → verify) | in-progress |
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

**ID**: 5.2
**Title**: Implement pipeline orchestrator
**Phase**: Token Verifier & Pipeline Orchestrator
**Status**: in-progress

### Goal
Build the single-command entry point that chains all pipeline stages: parse → map opcodes → extract key → verify token. This is the `pipeline/run.js` that the `/port-version` command will invoke.

### Context
All pipeline modules are now built and tested:
- `pipeline/vm-parser.js` — `parseVmFunction(src)` → variables, switchNode, caseCount
- `pipeline/opcode-mapper.js` — `mapOpcodes(parseResult)` → opcodeTable, unmapped, notes
- `pipeline/key-extractor.js` — `extractKey(tdcPath, opcodeTable, variables)` → key params (async, Puppeteer)
- `pipeline/token-verifier.js` — `verifyToken(tdcPath, keyParams)` → match result (async, Puppeteer)
- `decompiler/decoder.js` — bytecode decoder (already works on all builds)

The orchestrator chains these, reports progress, saves per-version config, and handles errors.

**Output location**: `pipeline/run.js` (both importable and CLI-runnable)

### Implementation Steps
1. Create `pipeline/run.js` exporting `portVersion(tdcPath, options)` (async)
2. CLI support: `node pipeline/run.js targets/tdc-v4.js`
3. Pipeline stages:
   - Stage 1: Read and parse source → vm-parser → report variables and case count
   - Stage 2: Map opcodes → opcode-mapper → report mapped/unmapped counts, save opcode-table.json
   - Stage 3: Extract XTEA key → key-extractor → report key params, save xtea-params.json
   - Stage 4: Verify token → token-verifier → report match result, save verification-report.json
4. Output directory: `output/<target-stem>/` (create if needed)
5. Save a combined `output/<target-stem>/pipeline-config.json` with all extracted params
6. Progress reporting: console.log at each stage with timing
7. Error handling: if any stage fails, report which stage, save partial results, exit

### Verification
- [ ] `pipeline/run.js` exists and exports `portVersion`
- [ ] `node pipeline/run.js targets/tdc.js` completes all 4 stages successfully
- [ ] Output files created: `output/tdc/opcode-table.json`, `output/tdc/xtea-params.json`, `output/tdc/verification-report.json`, `output/tdc/pipeline-config.json`
- [ ] Verification shows byte-identical match for tdc.js
- [ ] No modifications to existing files

### Suggested Agent
general-purpose — orchestration script, straightforward
