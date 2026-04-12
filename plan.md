# Plan

## Status
Current phase: Phase 39 — vm-slide stack VM
Current task: 39.1 — Implement vm-slide decoder + disassembler

---

## Phases

### Phase 38: Restructure (Stream A — blocking)
> Reorganize the repo around the research phase. Preserve git history via `git mv`, rewrite `require()` paths, keep `npm test` at 296/296 as the pass/fail gate.

| ID | Task | Status |
|----|------|--------|
| 38.1 | Restructure repo into research/ + tools/ layout (git mv + require rewrites + package.json + README) | done |
| 38.2 | Create placeholder README.md files for the 5 research tracks | done |
| 38.3 | Triage `scripts/` one-offs into research tracks or bench | done |
| 38.4 | Fix latent string-literal path misses from 38.1 (survey.js, diagnose.js) | done |
| 38.5 | Move the 5 previously-ambiguous scripts to their decided homes (user-confirmed 2026-04-12) | done |

### Phase 39: vm-slide stack VM (Stream B — Track 1, top priority)
> Decompile `sample/vm_slide.js` — stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`). Produce decoder, disassembler, opcode table, architecture doc, and a top-level variants comparison.

| ID | Task | Status |
|----|------|--------|
| 39.1 | Implement vm-slide decoder + disassembler under `research/vm-slide-stack-vm/` | in-progress |
| 39.2 | Write tests for vm-slide decoder + disassembler | pending |
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from verified findings | pending |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | pending |

---

## Current Task

**ID**: 39.1
**Title**: Implement vm-slide decoder + disassembler
**Phase**: Phase 39 — vm-slide stack VM
**Status**: in-progress

### Goal
Produce two runnable tools under `research/vm-slide-stack-vm/` that statically decompose the stack-based ChaosVM variant in `sample/vm_slide.js`:
1. **`decoder.js`** — parse the VM source with acorn, extract the opcode dispatch table and the inline bytecode, and write both to `output/vm-slide/` as JSON.
2. **`disassembler.js`** — load the decoded dispatch table and bytecode, walk the bytecode using per-opcode operand counts inferred from handler bodies, and emit a text disassembly with placeholder opcode names (`OP_00`..`OP_NN`).

Tests and documentation are explicitly out of scope — they are 39.2 and 39.3 respectively. This task produces working code only.

### Context

**The target file**: `sample/vm_slide.js` (43,688 bytes, single line, read-only). Structure verified by the director:

```
var __TENCENT_CHAOS_STACK = function(){
  function __TENCENT_CHAOS_VM(g, m, U, n, E, F, Y, c){
    var A = !n;
    g = +g, m = m || [0], n = n || [[this],[{}]], E = E || {};
    var w, C = [], K = null;
    function p(){...}
    Function.prototype.bind || (...);
    var Q = [
      function(){n.push(n[m[g++]][0])},   // opcode 0
      function(){var A,C=[];for(A in n.pop())C.push(A);n.push(C)}, // opcode 1
      function(){var A=m[g++],C=A?n.slice(-A):[];n.length-=A;A=n.pop();n.push(A[0][A[1]].apply(A[0],C))}, // opcode 2
      ...                                  // ~50 entries, some are undefined (gaps)
    ];
    // ... main dispatch loop (likely while-switch-break or similar) ...
  }
  return __TENCENT_CHAOS_VM(0, [<inline bytecode integer array literal, ~4K entries>], window);
}();
__TENCENT_CHAOS_STACK.g = function(){ return __TENCENT_CHAOS_STACK.shift()[0] };
```

Key observations made by the director from prefix/suffix inspection:
- **VM register names** (confirmed from first ~1.5KB): `g`=program counter, `m`=bytecode array, `n`=operand stack, `U`=constant pool (referenced as `U[n[n.length-1]]`), `E`=environment/closure scope, `C`=try-catch stack, `K`=exception slot.
- **Handler arity is implicit**: each handler reads N operands from the bytecode via `m[g++]`. Counting `m[g++]` reads in the handler source gives the operand count per opcode.
- **Dispatch table `Q` has gaps**: e.g. the 10th entry appears as `,,` in the source, meaning some opcode numbers are undefined / unused. The decoder must preserve the gaps (output `null` or omit the index) so bytecode indexing works.
- **The bytecode array contains at least one float literal** (`.5` seen in the tail) — treat bytecode entries as raw JS numbers, not strictly integers. JSON-serialize them as numbers.
- **The outer invocation `__TENCENT_CHAOS_VM(0, [...], window)`** is the only way the bytecode is exposed. The first argument `0` is the initial PC. The third argument `window` is the constant pool `U`.
- **Approximately ~36 real opcodes** per `project-brief.md`, but the dispatch table may have up to ~50 slots with some undefined. Confirm empirically.

**Why acorn over regex**: the inline bytecode array is ~4000 integers and the dispatch table is ~50 nested function expressions. Regex is fragile; acorn gives a proper AST. The project already depends on acorn ^8 (`package.json`) and the register-machine pipeline uses it extensively — see `tools/porting-pipeline/vm-parser.js` for how the existing codebase uses acorn to walk TDC VM internals. Read that file to pattern-match the approach, but do NOT try to reuse its logic literally — the register-machine VM has a different shape.

**Output versioning rule**: all artifacts go under `output/vm-slide/` (per `.claude/rules/output-versioning.md`). Stable filenames, no timestamps.

### Implementation Steps

1. **Read `sample/vm_slide.js`**. It is a single-line 43 KB file. Use `head -c 2000` and `tail -c 2000` first to get structure; then spot-check mid-file chunks if needed.
2. **Read `tools/porting-pipeline/vm-parser.js`** to learn how the codebase uses acorn. Do NOT copy its logic wholesale — the register-machine VM has a different shape. Look for: how it invokes acorn, how it walks `FunctionExpression` nodes, how it extracts nested array literals.
3. **Create `research/vm-slide-stack-vm/decoder.js`**. Responsibilities:
   a. Parse `sample/vm_slide.js` with acorn (`ecmaVersion: 2020` or similar — match what `vm-parser.js` uses).
   b. Locate the outer IIFE assigning to `__TENCENT_CHAOS_STACK`. Descend into the inner `__TENCENT_CHAOS_VM` function declaration.
   c. Inside `__TENCENT_CHAOS_VM`'s body, find the `VariableDeclaration` whose declarator initializes `Q` to an `ArrayExpression`. That is the dispatch table. Extract each element:
      - If the element is a `FunctionExpression`, record it with its source (use `source.slice(node.start, node.end)`), its opcode index, and the count of `m[g++]` reads in its body (operand count).
      - If the element is `null` or undefined (holes in `[func, , func]`), record `null` at that index.
      - Count `m[g++]` reads by walking the function body AST and counting `UpdateExpression` nodes with `operator === '++'`, `prefix === false`, and `argument.name === 'g'` inside a `MemberExpression` where `object.name === 'm'`. This is the same expression shape for every opcode — static matching is sufficient.
   d. Locate the return statement of the IIFE: `return __TENCENT_CHAOS_VM(0, [...], window);`. The second argument is the bytecode — a single `ArrayExpression` whose elements are numeric `Literal` nodes. Extract their `value`s into a plain JavaScript array. Handle numeric `Literal`s (integers and floats — `.5` is valid), and handle `UnaryExpression { operator: '-', argument: Literal }` for negative numbers if any.
   e. Write two output files:
      - `output/vm-slide/dispatch-table.json` — an array of `{ opcode: <index>, operandCount: <N>, source: <handler source string> }` or `null` for holes.
      - `output/vm-slide/bytecode.json` — the raw integer/float array.
   f. Print a one-line summary to stdout: `decoded N handlers (M non-null), bytecode length L`. No other stdout.
   g. Make it a CLI: `node research/vm-slide-stack-vm/decoder.js` with no args reads `sample/vm_slide.js` by default; optional `--input <path>` overrides. Use `process.argv.slice(2)` — no external CLI library.
4. **Create `research/vm-slide-stack-vm/disassembler.js`**. Responsibilities:
   a. Load `output/vm-slide/dispatch-table.json` and `output/vm-slide/bytecode.json`.
   b. Walk the bytecode linearly: start at PC 0, read one opcode byte, look up its operand count in the dispatch table, read that many additional bytes as operands, emit a line, advance PC.
   c. Emit format (column-aligned, 8-char PC, 4-char opcode, optional operands):
      ```
      00000  OP_00   10
      00002  OP_08   42
      00004  OP_05
      ```
      where `OP_NN` is a placeholder name (the real names come in 39.3).
   d. If an opcode is `null` (hole) or the operand count would overrun the bytecode, emit `OP_??` and stop with a diagnostic to stderr (so the disassembler gracefully halts rather than infinite-looping on malformed input).
   e. Write the full listing to `output/vm-slide/disassembly.txt`.
   f. Print a one-line summary to stdout: `disassembled N instructions, PC range [0, L)`. No other stdout.
   g. Make it a CLI: `node research/vm-slide-stack-vm/disassembler.js` with no args reads the default output paths; optional `--dispatch <path>` and `--bytecode <path>` override.
5. **Run `node research/vm-slide-stack-vm/decoder.js`** end-to-end. Verify it produces both output files without throwing.
6. **Run `node research/vm-slide-stack-vm/disassembler.js`** end-to-end. Verify it produces `output/vm-slide/disassembly.txt` without throwing.
7. **Hand-check the first 20 disassembled instructions** against the raw bytecode prefix to catch any obvious off-by-one in operand reading. Look at the first few entries in `output/vm-slide/bytecode.json`, trace them through the dispatch-table operand counts, and confirm the disassembly lines up. Report the first 10 lines of disassembly in the return report for the director's review.
8. **Run `npm test`**. Must stay at 296/296. This task adds no tests (those come in 39.2), but also must not break existing ones. If the `template-cache: lookup` flake (seen four times in Phase 38) hits, re-run once.
9. **Do NOT update any README, docs/ file, or top-level `research/vm-slide-stack-vm/README.md`** in this task. README updates happen after decoder/disassembler semantics are understood — that's 39.3's scope.
10. **Do NOT write any tests**. Those are 39.2, which will be dispatched to a different agent for independent verification per the project's impl/tests separation rule.

### Verification — report all of these

1. `ls research/vm-slide-stack-vm/` — shows `README.md` (from 38.2 scaffold), `decoder.js`, `disassembler.js`. No other files.
2. `ls output/vm-slide/` — shows `dispatch-table.json`, `bytecode.json`, `disassembly.txt`. No other files.
3. `node research/vm-slide-stack-vm/decoder.js` — runs without error. Report the one-line stdout summary.
4. `node research/vm-slide-stack-vm/disassembler.js` — runs without error. Report the one-line stdout summary.
5. First 10 lines of `output/vm-slide/disassembly.txt` — paste verbatim.
6. `jq 'length' output/vm-slide/bytecode.json` — report the bytecode length.
7. `jq '[.[] | select(. != null)] | length' output/vm-slide/dispatch-table.json` — report the number of non-null handlers (this is the "~36 opcodes" estimate from the brief — is it 36 or something else?).
8. `jq 'length' output/vm-slide/dispatch-table.json` — report the total dispatch-table slots including holes.
9. `jq 'map(select(. != null) | .operandCount) | unique | sort' output/vm-slide/dispatch-table.json` — report the set of observed operand counts (expect something like `[0, 1]` or `[0, 1, 2]`; informative for 39.3).
10. `npm test` → 296/296.
11. `node --check research/vm-slide-stack-vm/decoder.js research/vm-slide-stack-vm/disassembler.js` — both parse cleanly.
12. Brief description of any edge cases you hit while decoding: holes in the dispatch table, float literals in the bytecode, negative operands, anything surprising.

### Suggested Agent
`general-purpose` — AST work with acorn, file I/O, static analysis. No specialized expertise required. Could also be `opcode-mapper` if we wanted VM-specific bias, but the stack VM is architecturally different from the register VM that agent was built for, so `general-purpose` is safer.