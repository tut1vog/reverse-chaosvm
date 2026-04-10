# Plan

## Status
Current phase: Phase 3 — VM Parser & Opcode Auto-Mapper
Current task: 3.2 — Implement opcode auto-mapper module

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
| 3.2 | Implement opcode auto-mapper module | in-progress |
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

**ID**: 3.2
**Title**: Implement opcode auto-mapper module
**Phase**: VM Parser & Opcode Auto-Mapper
**Status**: in-progress

### Goal
Build a Node.js module that takes the output of `pipeline/vm-parser.js` (variable roles + switch AST node) and automatically maps each case handler to a known semantic operation by pattern matching. This is the core of the automated porting pipeline.

### Context
Task 3.1 produced `pipeline/vm-parser.js` which returns `{ variables, switchNode, caseCount, dispatchFunction }` for any tdc build. The opcode mapper will iterate over `switchNode.cases`, normalize each handler using the variable roles, and match against known patterns.

**How case handlers look (normalized)**:
- `regs[bytecode[++pc]] = regs[bytecode[++pc]] + regs[bytecode[++pc]]` → ADD
- `regs[bytecode[++pc]] = regs[bytecode[++pc]] >> bytecode[++pc]` → SHR_K
- `catchStack.pop(); regs[bytecode[++pc]] = thisCtx; return regs[bytecode[++pc]]` → RET_CLEANUP
- Variable-width: `for (w = bytecode[++pc]; w > 0; w--) h.push(regs[bytecode[++pc]])` → FUNC_CREATE or APPLY

**Matching strategy**: Rather than exact string matching, analyze the AST structure of each case body:
1. Count the number of bytecode reads (`bytecode[++pc]`) — this gives operand count
2. Identify the operation type (binary operator, call expression, property access, etc.)
3. For binary ops: which operator (+, -, *, /, %, ^, &, |, <<, >>, >>>)
4. For calls: is `this` arg from a register or `thisCtx`? how many arguments?
5. For compound ops: how many statements? what sequence of sub-operations?

**Reference opcode table**: `decompiler/disassembler.js` lines 27-123 has the complete Template A mapping (95 entries).

**Key files**:
- `pipeline/vm-parser.js` — provides the parsed switch AST and variable roles
- `decompiler/disassembler.js` lines 27-123 — reference opcode table (ground truth for Template A)
- `docs/OPCODE_REFERENCE.md` — all 95 operations with pseudocode patterns
- `targets/tdc.js` — Template A reference (95 cases)
- `targets/tdc-v2.js` — Template B (94 cases, fully reshuffled)
- `targets/tdc-v5.js` — Template C (100 cases, newly discovered)

**Output location**: `pipeline/opcode-mapper.js`

### Implementation Steps
1. Create `pipeline/opcode-mapper.js` exporting `mapOpcodes(parseResult)` where `parseResult` is from `vm-parser.parseVmFunction()`
2. For each `SwitchCase` node in `switchNode.cases`:
   a. Extract the case number from `case.test.value`
   b. Analyze the case body AST to determine the semantic operation
3. Pattern matching approach — analyze each case body structurally:
   - Count bytecode reads (MemberExpression with `bytecode[++pc]` pattern)
   - Identify statement types (assignment, return, call, throw, for-loop)
   - For assignments: what's on the RHS? (binary expression, call expression, unary, member access, literal, etc.)
   - For binary expressions: which operator?
   - Distinguish `regs[bytecode[++pc]]` (register operand, R) from `bytecode[++pc]` (immediate, K)
   - Handle compound opcodes by analyzing the full sequence of statements
4. Return `{ opcodeTable: { '0': 'ADD', '1': 'IN', ... }, unmapped: [...], notes: [...] }`
5. The opcodeTable should use the exact mnemonic names from `decompiler/disassembler.js`

### Verification
- [ ] `pipeline/opcode-mapper.js` exists and exports `mapOpcodes`
- [ ] Running on tdc.js produces a table that matches the reference in `decompiler/disassembler.js` (all 95 opcodes correctly identified)
- [ ] Running on tdc-v2.js produces 94 entries with no unmapped cases (or minimal unmapped)
- [ ] Running on tdc-v5.js produces 100 entries (new Template C)
- [ ] `unmapped` array is empty for tdc.js (since we know all 95 operations)
- [ ] No modifications to existing files

### Suggested Agent
general-purpose — AST pattern matching, complex but well-defined
