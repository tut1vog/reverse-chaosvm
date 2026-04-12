# Plan

## Status
Current phase: Phase 40 — Phase-39 follow-ups
Current task: 40.1 — Upgrade vm-slide disassembler with control-flow-aware walker

**Dispatch order** (user-confirmed 2026-04-12): 40.1 → 40.2 → 40.5 → 40.4 → 40.6 → 40.3. Rationale: walker upgrade first (blocks 40.3 and 40.6); walker tests by a different agent per impl/tests separation; then small-and-independent cleanups (40.5 / 40.4) while investigative work is still unblocked; then the XTEA investigation which benefits from the walker; then the vm-slide docs refresh which needs both the walker and the investigation's outcome.

---

## Phases

### Phase 38: Restructure (Stream A — blocking) — DONE
> Reorganize the repo around the research phase. Preserve git history via `git mv`, rewrite `require()` paths, keep `npm test` at 296/296 as the pass/fail gate.

| ID | Task | Status |
|----|------|--------|
| 38.1 | Restructure repo into research/ + tools/ layout (git mv + require rewrites + package.json + README) | done |
| 38.2 | Create placeholder README.md files for the 5 research tracks | done |
| 38.3 | Triage `scripts/` one-offs into research tracks or bench | done |
| 38.4 | Fix latent string-literal path misses from 38.1 (survey.js, diagnose.js) | done |
| 38.5 | Move the 5 previously-ambiguous scripts to their decided homes (user-confirmed 2026-04-12) | done |

### Phase 39: vm-slide stack VM (Stream B — Track 1, top priority)
> Decompile `sample/vm_slide.js` — stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`). First-pass documentation only per user option (3) — the full control-flow-aware disassembler upgrade is deferred to Phase 40. Docs must explicitly state the ~2% coverage limitation.

| ID | Task | Status |
|----|------|--------|
| 39.1 | Implement vm-slide decoder + disassembler under `research/vm-slide-stack-vm/` | done |
| 39.2 | Write tests for vm-slide decoder + disassembler | done |
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from source inspection (first-pass, admits ~2% coverage) | done |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | done |
| 39.5 | Update `project-brief.md` with corrected vm-slide facts (53 opcodes, 24K bytecode, XTEA finding) + refresh `research/vm-slide-stack-vm/README.md` status to `partial` | done |

### Phase 40: Phase-39 follow-ups + session cleanup (planned, not yet started)
> Addresses the deferred issues surfaced during Phase 38-39 and upgrades the vm-slide disassembler to full coverage. Each task is independent; they can be dispatched in any order the user prefers.

| ID | Task | Status |
|----|------|--------|
| 40.1 | Upgrade vm-slide disassembler with control-flow-aware walker (static CFG, adapt approach from `research/tdc-register-vm/cfg-builder.js`). **Must special-case opcode 58 FUNC_CREATE**: its runtime byte width is `3 + 2·A + C`, not the static count of 6. The current linear walker mis-parses after the first FUNC_CREATE, which is likely why it halts at pc=512. Fix FUNC_CREATE handling FIRST, then address control-flow. | in-progress |
| 40.2 | Tests for control-flow walker | pending |
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1; promote track status from `partial` to `closed` | pending |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (7+ sightings in Phases 38-39) | pending |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | pending |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | pending |

---



## Current Task

**ID**: 40.1
**Title**: Upgrade vm-slide disassembler with control-flow-aware walker (fix FUNC_CREATE first)
**Phase**: Phase 40 — Phase-39 follow-ups
**Status**: in-progress

### Goal
Replace the 39.1 linear disassembler (which only covers ~2% of the bytecode because it mis-parses `FUNC_CREATE` and halts at pc=512) with a **control-flow-aware walker** that produces a full-coverage disassembly of `sample/vm_slide.js`'s 24,273-element bytecode.

The walker must:
1. **Special-case opcode 58 `FUNC_CREATE`** so its variable-width operand region (`3 + 2·A + C` bytes) is correctly consumed. This is the prerequisite for every other fix — without it the walker desynchronizes at the first FUNC_CREATE site.
2. **Trace control flow** from the entry PC (0) through jumps, branches, exception-handler installs, function entries (via FUNC_CREATE's `K` operand), and terminator opcodes. Use a worklist-based reachability walk, not a linear scan.
3. **Produce a new output file** `output/vm-slide/disassembly-full.txt` listing every reachable instruction with placeholder-or-classified names. The existing `output/vm-slide/disassembly.txt` (pinned by 39.2 tests) **must NOT be overwritten** — it stays as the regression anchor for the linear walker.

Tests for the walker are **explicitly out of scope** — task 40.2 will be dispatched to a different agent per impl/tests separation.

### Context

**Existing artifacts** (all committed):
- `research/vm-slide-stack-vm/decoder.js` — 39.1 implementation. Parses `sample/vm_slide.js`, writes `output/vm-slide/dispatch-table.json` and `output/vm-slide/bytecode.json`. **Do not rewrite** — it's correct for simple-width opcodes; its only limitation is that `operandCount` on opcode 58 is a lexical count (6) rather than a runtime width. You may optionally extend `dispatch-table.json` with a `variableWidth: true` flag on opcode 58 if you need it, but if you do, update `tests/test-vm-slide-decoder.js` minimally to accept the extended shape.
- `research/vm-slide-stack-vm/disassembler.js` — 39.1's linear walker. **Do not modify or delete** — its output is pinned by 39.2 tests as the regression baseline. Add the new walker as a separate file.
- `output/vm-slide/{dispatch-table.json, bytecode.json, disassembly.txt}` — 39.1's committed fixtures. `disassembly.txt` stays pinned; `dispatch-table.json` and `bytecode.json` will be regenerated by the walker as a sanity check but content must not change unless you extend the dispatch-table schema (see above).
- `research/tdc-register-vm/cfg-builder.js` — **reference implementation** of a worklist-based CFG walker for the register VM. Read it before starting — it has a clean pattern for terminator classification, jump-target formulas, worklist management, and basic-block boundaries. Do NOT copy its opcode numbers (those are register-VM specific and will be different for vm-slide).

**Handler sources that matter for control flow** — read these from `output/vm-slide/dispatch-table.json` before coding:

| Opcode | Name (from 39.3 classification) | Behavior | Walker treatment |
|---|---|---|---|
| 6 | `JUMP` | `function(){g=m[g++]}` — unconditional jump, PC := operand | Terminator. Target = operand. Add target to worklist. No fall-through. |
| 60 | `JUMP_IF_TRUE` | `function(){var A=m[g++];n[n.length-1]&&(g=A)}` — conditional jump, does not pop | Branch. Add both target (operand) and fall-through (pc+2) to worklist. |
| 7 | `RETURN`-ish (from 39.3: pops, throws, terminates)? | read the source to confirm | Terminator. Confirm behavior; if it ends the block, add no successor. |
| 38 | `THROW`? | read source | Terminator if it ends execution. |
| 58 | `FUNC_CREATE` | `function(){for(var K=m[g++],p=[],A=m[g++],C=m[g++],Q=[],B=0;B<A;B++)p[m[g++]]=n[m[g++]];for(B=0;B<C;B++)Q[B]=m[g++];n.push(function w(){...return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)})}` | **Not** a branch — it instantiates a closure that runs a nested VM at entry PC `K` when called. The current basic block continues normally after the FUNC_CREATE instruction. BUT the nested function at PC `K` is a **new function entry** the walker must trace separately. | Fall-through to pc + 3 + 2·A + C. Also add `K` to a separate "function entries" worklist so `K` becomes the start of another reachable function body. |
| Other opcodes that read `m[g++]` and write to `g` | any other JMP-like handlers | Grep the dispatch table sources for `g=` assignments. Every handler that writes to `g` (not just `g++`) is a potential jump. | Treat as terminators; extract target statically from the source if possible. |
| Exception opcodes (any handler touching `C.push`, `C.pop`, or `K`) | catch installs / throws | Installing a catch adds a handler PC to the walker's exception-handler worklist. | Treat catch-install as a fall-through + a new function-entry-like target for the handler PC. |

**You must not assume** the above table is complete. Before writing the walker, **grep every non-null handler's source** in `dispatch-table.json` for `g=` (PC mutation) and `g+=` / `g-=` (PC offset) and build your own table of every opcode that can affect control flow. Report your findings.

**Directory layout**:
- New walker file: `research/vm-slide-stack-vm/walker.js` (CommonJS, Node ≥18, 2-space indent, single quotes, `'use strict';`, matches `.claude/rules/coding-style.md`).
- New output file: `output/vm-slide/disassembly-full.txt`. Stable filename, no timestamps, overwrite on re-run.
- Optional additional output for debugging: `output/vm-slide/cfg.json` containing basic-block info (entry PC, exit PC, successors, terminator opcode) — useful for 40.2 tests and 40.3 docs, but only if it falls out naturally from the walker's internal state.

**Existing test file** `tests/test-vm-slide-decoder.js` (16 tests pinning 39.1 behavior):
- Must continue to pass unchanged. The new walker writes to a different output file, so there's no conflict.
- If you extend `dispatch-table.json` with a `variableWidth` flag, **one** test currently asserts the shape of non-null entries ("Every non-null entry has keys `opcode`, `operandCount`, `source`"). You may extend that assertion to permit an optional fourth key `variableWidth`, but nothing else in the test file should be touched.

### Implementation Steps

1. **Read reference implementations**:
   - `research/tdc-register-vm/cfg-builder.js` — understand the worklist / basic-block / terminator structure.
   - `research/vm-slide-stack-vm/decoder.js` — understand what's in `dispatch-table.json`.
   - `research/vm-slide-stack-vm/disassembler.js` — understand what the existing linear walker does and why it halts.
   - `output/vm-slide/dispatch-table.json` — read all 53 handler sources.

2. **Audit control-flow handlers**. Grep every non-null handler source in `dispatch-table.json` for PC-mutating patterns (`g=`, `g+=`, `g-=`). Build a table of every opcode that can change control flow, its operand reading pattern, and its treatment (terminator / conditional / fall-through). Report the table. If you find opcodes beyond {6, 60, 58} that affect control flow, use them; if you find fewer, report that.

3. **Static opcode classification for the walker**. Define a small table in `walker.js`:
   ```js
   const TERMINATORS = new Set([6, ...]);      // opcodes that end a basic block
   const BRANCHES = new Set([60, ...]);         // conditional: both target + fall-through
   const FUNCTION_ENTRIES = new Set([58]);      // opcodes that spawn new reachable entries
   const VARIABLE_WIDTH = new Set([58]);        // opcodes where operand count is runtime
   ```
   Grounds for each entry must come from handler source inspection — cite the handler body in a code comment next to each set.

4. **Implement `readInstruction(bytecode, pc, dispatchTable)`** helper that returns `{opcode, operands, nextPc, extras}`. For opcode 58 (or any VARIABLE_WIDTH), read K, A, C first then compute the real byte count and read the remaining operands. For everything else, use `dispatchTable[opcode].operandCount` directly. Return `null` on dispatch-table holes or out-of-range opcodes so the caller can handle the halt gracefully.

5. **Implement the worklist walker**. Pseudocode:
   ```
   function walk(bytecode, dispatchTable):
     visited = new Map()   // pc -> instruction info
     worklist = [0]         // start at entry PC
     functionEntries = new Set([0])
     
     while worklist not empty:
       pc = worklist.pop()
       if visited.has(pc): continue
       
       instr = readInstruction(bytecode, pc, dispatchTable)
       if instr is null:
         // hole or out-of-range — record as diagnostic, don't crash
         visited.set(pc, { halt: true, op: bytecode[pc] })
         continue
       
       visited.set(pc, instr)
       
       if instr.opcode is TERMINATOR:
         // determine successor(s) based on opcode
         if instr.opcode === 6 (JUMP):
           worklist.push(instr.operands[0])  // static jump target
         else if instr.opcode is an unconditional-terminator (RET/THROW/etc):
           // no successor
         // ... etc
       else if instr.opcode is BRANCH (60):
         worklist.push(instr.operands[0])      // target
         worklist.push(instr.nextPc)            // fall-through
       else if instr.opcode is FUNCTION_ENTRY (58):
         functionEntries.add(K operand)
         worklist.push(K operand)              // new function entry
         worklist.push(instr.nextPc)           // fall-through after FUNC_CREATE
       else:
         worklist.push(instr.nextPc)           // normal fall-through
   
     return { visited, functionEntries }
   ```

6. **Emit `output/vm-slide/disassembly-full.txt`**. Walk the sorted set of visited PCs and emit a line per instruction. Format should match `disassembly.txt`'s column style so a reader can diff them. Lines that fell on a dispatch hole become `<pc>  HALT  <op>` with a comment. Group output by function entry if easy; at minimum, emit contiguous blocks with blank-line separators when the PC jumps backward or forward by more than a few bytes.

7. **CLI shape**: `node research/vm-slide-stack-vm/walker.js` with optional `--dispatch <path>` and `--bytecode <path>` flags. One-line stdout summary: `walked N instructions across M function entries, visited range [0, L)`. Diagnostics to stderr.

8. **Sanity checks before finishing**:
   - Run the walker on the committed `output/vm-slide/{dispatch-table.json, bytecode.json}`.
   - Confirm the walker visits **significantly more than 312 instructions** (the 39.1 linear walker's coverage). Hopefully thousands. Report the number.
   - Confirm opcode 58 is handled correctly by pointing at one concrete FUNC_CREATE instance in the bytecode and tracing its operand region by hand. Report the PC, the K/A/C values, and the computed next-PC.
   - Hand-verify the first 20 lines of `disassembly-full.txt` against the bytecode. (Should match `disassembly.txt` for the linear prefix before any FUNC_CREATE.)
   - Spot-check a PC that the linear walker didn't reach. Confirm it's a sensible instruction.
   - Report how many dispatch-table holes (if any) the walker actually hit during the walk. If it hit **zero**, the pc=512 halt was almost certainly the FUNC_CREATE mis-parse from 39.1 — confirm and report.

9. **Optional but recommended**: also write `output/vm-slide/cfg.json` with basic-block / function-entry structure, so 40.2 tests can pin it and 40.3 docs can cite it. If the walker's internal state doesn't map cleanly to this, skip it and note why.

10. **Do NOT**:
    - Modify `research/vm-slide-stack-vm/disassembler.js` (pinned by 39.2 tests).
    - Overwrite `output/vm-slide/disassembly.txt` (pinned by 39.2 tests).
    - Modify `tests/test-vm-slide-decoder.js` **except** for the one narrow allowance on the `variableWidth` key if you extend the dispatch-table schema.
    - Add any tests — 40.2 owns that.
    - Add any docs — 40.3 owns that.
    - Install any new npm package.

11. **Run `npm test`**. Must stay at 312/312. If the `template-cache: lookup` flake hits (12+ sightings), re-run up to 3 times. If it consistently fails, note it but proceed — 40.4 owns diagnosis.

### Verification — report all of these

1. `ls research/vm-slide-stack-vm/walker.js` — exists.
2. `ls output/vm-slide/disassembly-full.txt` — exists.
3. `ls output/vm-slide/disassembly.txt` — **still** exists (pinned 39.2 file, must be untouched).
4. `diff output/vm-slide/disassembly.txt <(git show HEAD:output/vm-slide/disassembly.txt)` — empty (confirms the linear-walker output is byte-identical to what's committed).
5. `node research/vm-slide-stack-vm/walker.js` — runs without throwing. Paste stdout.
6. `wc -l output/vm-slide/disassembly-full.txt` — report the line count. Expect **significantly more than 313** (the linear walker's committed output).
7. **Control-flow handler audit**: paste your table of every opcode that can affect control flow, with handler source citations. Must at minimum cover opcodes 6 (JUMP) and 60 (JUMP_IF_TRUE); should include any others you found by grepping for `g=` in handler sources.
8. **FUNC_CREATE hand-trace**: find one concrete FUNC_CREATE instance in the walker's output, report its PC, its K/A/C operand values, and the computed nextPc = `pc + 3 + 2·A + C`. Confirm the walker's nextPc matches.
9. **Dispatch-hole audit**: how many times (and at which PCs) did the walker hit a dispatch-table hole during the full walk? If zero, report that explicitly — it confirms the 39.1 pc=512 halt was caused by FUNC_CREATE mis-parse, not by legitimate data.
10. **Instruction count delta**: walker visited N instructions; linear walker's pinned output has 312; report the ratio (new/old).
11. **Function entries discovered**: how many distinct function entry PCs did the walker find (entry 0 + each FUNC_CREATE `K` + any other entries)?
12. First 10 lines of `output/vm-slide/disassembly-full.txt` — paste verbatim.
13. If you extended `dispatch-table.json` with a `variableWidth` flag, show the narrow `tests/test-vm-slide-decoder.js` edit (must be additive-only to one assertion).
14. `npm test` — final summary line. Note flake hits.
15. `node --check research/vm-slide-stack-vm/walker.js` — parses cleanly.
16. **Surprises**: control-flow patterns you didn't expect, opcodes that look like jumps but aren't (or vice versa), handlers with unusual PC semantics, any reason the walker had to halt before reaching the end of the bytecode.

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **Do not modify `disassembler.js` or `disassembly.txt`** — these are pinned by 39.2 tests as the regression baseline for the linear walker.
- **Do not write any tests.** Task 40.2 owns tests and is dispatched to a different agent.
- **Do not write or modify any doc.** Task 40.3 owns doc refresh.
- **Do not modify `sample/vm_slide.js`** or anything under `sample/`, `targets/`, `.claude/rules/`, `history/`, `docs/WORKFLOW.md`, `project-brief.md`, `CLAUDE.md`.
- **Do not install any new npm package.** `acorn` (already a dep) may or may not be needed — you may not even need to re-parse `sample/vm_slide.js` since `dispatch-table.json` + `bytecode.json` already have everything the walker needs.
- **If the task is too difficult or impossible to complete**, stop and report — the walker upgrade is a judgment-heavy task and there may be control-flow patterns that defeat static tracing. If you find something genuinely intractable (e.g. an opcode computes PC from stack data at runtime rather than from an immediate operand), stop, document the pattern, and return partial progress rather than hack around it.
- **Do not speculate on opcode semantics for control-flow classification.** Every entry in the terminators/branches/function-entries table must be backed by handler source inspection and cited in a comment.

### Suggested Agent
`general-purpose` — AST-free static analysis + file I/O + judgment-driven control-flow classification. The `opcode-mapper` agent is register-VM-specific and will not help here. No specialized agent exists for stack-VM work.
