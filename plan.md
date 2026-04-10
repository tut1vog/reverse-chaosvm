# Plan

## Status
Current phase: Phase 4 — XTEA Key Extractor
Current task: 4.1 — Implement dynamic key extraction module

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
| 4.1 | Implement dynamic key extraction module | in-progress |
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

**ID**: 4.1
**Title**: Implement dynamic key extraction module
**Phase**: XTEA Key Extractor
**Status**: in-progress

### Goal
Build a Puppeteer-based module that dynamically extracts the XTEA key schedule from any tdc.js build. This is the second core pipeline component — after opcodes are mapped, we need the encryption key before we can verify tokens.

### Context
The existing `dynamic/crypto-tracer-v3.js` works for Template A but is completely hardcoded:
- PC addresses: 68860 (cipher CALLQ), 50162/34415/35472 (function entries)
- Opcode numbers: hardcoded maps (`0: 'ADD'`, `6: 'SHR_K'`, etc.)
- Switch discriminant: hardcoded `'switch (Y[++C])'` string
- All of these differ per template

The pipeline key extractor must be **template-agnostic**: given the opcode table from `pipeline/opcode-mapper.js` and the variable roles from `pipeline/vm-parser.js`, it should dynamically find the cipher and extract the key.

**Known values for Template A** (validation target):
- `STATE_A = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140]`
- `DELTA = 0x9E3779B9`
- Round count: 32
- Key mod constants: `+2368517` (KEY_MOD_1), `+592130` (KEY_MOD_3)

**Key reference files**:
- `dynamic/crypto-tracer-v3.js` — the hardcoded Template A tracer (study approach, don't copy PC values)
- `token/crypto-core.js` — standalone XTEA implementation (shows the algorithm and known constants)
- `docs/CRYPTO_ANALYSIS.md` — full XTEA analysis
- `pipeline/vm-parser.js` — provides variable roles and switch AST
- `pipeline/opcode-mapper.js` — provides opcode table

**Approach**: The key extraction strategy from crypto-tracer-v3 is sound:
1. Serve the tdc.js via local HTTP server
2. Patch the VM dispatch to intercept arithmetic/bitwise operations
3. Trigger token generation (`TDC.getData()`)
4. Capture register values during cipher execution
5. Extract the key from the trace data

But the patching must use the dynamically-determined variable names and opcode numbers.

**Output location**: `pipeline/key-extractor.js`

### Implementation Steps
1. Create `pipeline/key-extractor.js` exporting `extractKey(tdcPath, opcodeTable, variables)` (async)
2. Build the source patching function that:
   - Uses `variables.bytecode` and `variables.pc` to find the switch discriminant (not hardcoded `'switch (Y[++C])'`)
   - Uses `opcodeTable` to find which case numbers are arithmetic/bitwise ops
   - Injects tracing code that captures register values for those operations
3. Build the Puppeteer harness that:
   - Serves the patched tdc.js via local HTTP server
   - Freezes non-deterministic values (Date.now, Math.random, performance.now) for reproducibility
   - Loads the page and calls `TDC.getData()` to trigger the cipher
   - Collects the trace data
4. Build the key extraction logic that:
   - Identifies the cipher round function by looking for repeated XOR+shift+add patterns
   - Extracts the XTEA key (4 × uint32) from the traced values
   - Extracts delta, round count, and key modification constants
5. Return `{ key: [uint32, uint32, uint32, uint32], delta, rounds, keyModConstants: [n1, n2], verified: bool }`

### Verification
- [ ] `pipeline/key-extractor.js` exists and exports `extractKey`
- [ ] Running on tdc.js with its opcode table and variables extracts the known key: `[0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140]`
- [ ] Delta is `0x9E3779B9`
- [ ] Round count is 32
- [ ] Key mod constants are `[2368517, 592130]`
- [ ] No hardcoded PC addresses or opcode numbers from Template A in the module
- [ ] No modifications to existing files

### Suggested Agent
general-purpose — Puppeteer instrumentation, complex but with reference implementation to adapt
