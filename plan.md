# Plan

## Status
Current phase: Phase 3 — VM Parser & Opcode Auto-Mapper
Current task: 3.1 — Implement VM variable identifier module

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
| 3.1 | Implement VM variable identifier module | in-progress |
| 3.2 | Implement opcode auto-mapper module | pending |
| 3.3 | Tests for VM parser and opcode mapper (validate against tdc.js reference table) | pending |

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

**ID**: 3.1
**Title**: Implement VM variable identifier module
**Phase**: VM Parser & Opcode Auto-Mapper
**Status**: in-progress

### Goal
Build a Node.js module that parses any tdc.js build's `__TENCENT_CHAOS_VM` function, locates the dispatch loop, and identifies all VM variables by their structural role. This is the prerequisite for task 3.2 (opcode auto-mapper) — you can't normalize case handlers without knowing which minified variable name maps to which canonical role.

### Context
The `__TENCENT_CHAOS_VM` function in each tdc.js build has a consistent structure:
1. Helper functions (base64 decoder, zigzag, varint) — outer scope
2. A returned factory function that calls the bytecode decoder
3. An inner function that contains the VM dispatch loop: `while(true) { switch(bytecodeArray[++pc]) { case N: ... } }`
4. The register file `regs` is initialized as an array literal: `[closureVar1, closureVar2, closureVar3, this, arguments, selfRef, bytecodeArray, 0]`

**tdc.js (Template A) variable names**: `Y`=bytecode, `C`=pc, `i`=regs, `Q`=thisCtx, `F`=catchStack, `G`=excVal
**tdc-v2.js (Template B)** will have completely different names.

The module should use acorn (already installed as a dependency) to parse the tdc.js source into an AST, then navigate the AST to find the dispatch function and extract variable roles.

**Key files**:
- `targets/tdc.js` lines 124-586 — the `__TENCENT_CHAOS_VM` function (Template A reference)
- `targets/tdc-v2.js` — Template B, must also work on this
- `decompiler/decoder.js` — the existing decoder, which handles the base64→varint→int array part (we don't need to reimplement this)
- `package.json` — acorn is already a dependency

**Output location**: `pipeline/vm-parser.js` (create `pipeline/` directory)

### Implementation Steps
1. Create `pipeline/` directory
2. Create `pipeline/vm-parser.js` — a module that exports a `parseVmFunction(sourceCode)` function
3. Use acorn to parse the full tdc.js source into an AST
4. Find the `__TENCENT_CHAOS_VM` function declaration/expression (search for the function containing a large switch statement with 90+ cases)
5. Navigate into the inner dispatch function — find the `while(true) { try { while(true) { switch(...) { ... } } } }` pattern
6. Extract variable roles by structural analysis:
   - **bytecode + pc**: from the switch discriminant — it will be `bytecodeVar[++pcVar]`, giving both names
   - **regs**: from case handler bodies — the array indexed by `bytecodeVar[++pcVar]` as an operand, e.g., `regsVar[bytecodeVar[++pcVar]]`
   - **thisCtx**: from `.call()` arguments in CALLQ-type handlers — the non-register argument that is always the same variable
   - **catchStack**: the array variable that has `.push()` and `.pop()` calls in exception-related handlers
   - **excVal**: a simple variable (not array) assigned in catch blocks and read in LOAD_EXCEPTION handlers
7. Also extract: the full switch statement AST node (for task 3.2), the case count, and the initial register array structure
8. Return a structured result: `{ variables: { bytecode, pc, regs, thisCtx, catchStack, excVal, ... }, switchNode: <AST>, caseCount: N }`

### Verification
- [ ] `pipeline/vm-parser.js` exists and exports `parseVmFunction`
- [ ] `node -e "const p = require('./pipeline/vm-parser'); const fs = require('fs'); const src = fs.readFileSync('targets/tdc.js','utf8'); const r = p.parseVmFunction(src); console.log(JSON.stringify(r.variables))"` outputs `{"bytecode":"Y","pc":"C","regs":"i","thisCtx":"Q","catchStack":"F","excVal":"G"}` (or equivalent correct mapping)
- [ ] Same command with `targets/tdc-v2.js` outputs a different set of variable names but with the same role keys
- [ ] `r.caseCount` is 95 for tdc.js and 94 for tdc-v2.js
- [ ] No modifications to existing files (especially nothing in `targets/`, `decompiler/`, `token/`)

### Suggested Agent
general-purpose — AST parsing with acorn, moderate complexity
