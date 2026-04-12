# Plan

## Status
Current phase: Phase 39 — vm-slide stack VM
Current task: 39.2 — Write tests for vm-slide decoder + disassembler

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
| 39.1 | Implement vm-slide decoder + disassembler under `research/vm-slide-stack-vm/` | done |
| 39.2 | Write tests for vm-slide decoder + disassembler | in-progress |
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from verified findings | pending |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | pending |

---


## Current Task

**ID**: 39.2
**Title**: Write tests for vm-slide decoder + disassembler
**Phase**: Phase 39 — vm-slide stack VM
**Status**: in-progress

### Goal
Write `node --test`-compatible test coverage for the decoder and disassembler created in 39.1. Tests run against the committed `sample/vm_slide.js` and the committed output artifacts under `output/vm-slide/`. Tests pin the current observed behavior so future changes (including eventual opcode renaming in 39.3 and control-flow-aware disassembly upgrades) can detect regressions.

This task is assigned to a **different agent** than 39.1 per the project's impl/tests separation rule. The tests author approaches the decoder/disassembler as a consumer, not the author.

### Context
39.1 produced:
- `research/vm-slide-stack-vm/decoder.js` — CLI + module. Parses `sample/vm_slide.js` with acorn, extracts dispatch table and bytecode, writes to `output/vm-slide/{dispatch-table.json, bytecode.json}`.
- `research/vm-slide-stack-vm/disassembler.js` — CLI + module. Reads the two JSON artifacts, walks bytecode linearly, writes `output/vm-slide/disassembly.txt`.

**Director-verified facts about 39.1's output** (pin these in tests):
- `output/vm-slide/bytecode.json`: array length **24273**.
- `output/vm-slide/dispatch-table.json`: array length **69**, with **53 non-null entries** and **16 holes**. Observed `operandCount` values: `[0, 1, 2, 6]`.
- `output/vm-slide/disassembly.txt`: begins with exactly these 10 lines (pinning the first 10 instructions, verified by director):
  ```
  00000  OP_40 3
  00002  OP_42 2
  00004  OP_06 1568
  00006  OP_00 40
  00008  OP_06 42
  00010  OP_02 42
  00012  OP_03
  00013  OP_42 4
  00015  OP_42 5
  00017  OP_06 289
  ```
- Disassembler halts at pc=512 after 312 instructions because opcode 65 is a dispatch hole. This is **current expected behavior** until 39.3 addresses control-flow — pin it.
- XTEA delta `0x9E3779B9` (decimal 2654435769) appears in the bytecode **exactly 2 times**. Pin this as a structural fact about the bytecode.
- Decoder stdout: exactly `decoded 69 dispatch slots (53 non-null), bytecode length 24273`.
- Disassembler stdout: exactly `disassembled 312 instructions, PC range [0, 513)`.

Tests should pin these concrete numbers and slice comparisons. They are not aspirational — they lock in what 39.1 actually produced, so future edits are intentional rather than accidental.

**Test file shape and location**: `tests/test-vm-slide-decoder.js` (matches the naming convention of existing `tests/test-decoder.js`, `tests/test-disasm.js`, etc.). Use `node:test` + `node:assert` — the project has no other test framework. See any existing `tests/test-*.js` for the house style.

**Module exports requirement**: `decoder.js` and `disassembler.js` were written primarily as CLIs. Tests will need importable functions. The tests author may either:
1. Import the files as modules and exercise whatever functions they export (preferred).
2. If the CLI wrapping prevents clean imports, spawn the CLI via `child_process.execFileSync` and parse stdout + read the output files. Fall back to this only if option 1 fails cleanly.

If option 1 is chosen but the current 39.1 code has no exports, the tests author is permitted to **add `module.exports = {...};` to the decoder and disassembler** to expose the functions tests need — but **only the export statement**. Do not refactor, rewrite, or change the logic. The goal is to test existing behavior, not fix the design. Adding exports is a minimal intervention allowed by the separation rule.

**Test fixtures**: tests should depend on the committed `sample/vm_slide.js` and the committed `output/vm-slide/*.json` files. Do not regenerate output inside the test — that couples tests to decoder/disassembler invocation and slows them down. Tests should:
- Read `output/vm-slide/dispatch-table.json`, `bytecode.json`, `disassembly.txt` from disk.
- Assert against the committed state.
- Optionally: a single end-to-end test that runs the decoder (or imports it and calls its main function) against `sample/vm_slide.js` and checks that its output matches the committed JSON byte-for-byte. This catches regressions in the decoder/disassembler logic even if a future hand-edit to the committed JSON hides the bug.

### Implementation Steps
1. Read `research/vm-slide-stack-vm/decoder.js` and `research/vm-slide-stack-vm/disassembler.js` to understand their module shape and whether they export anything importable.
2. Read a representative existing test file like `tests/test-decoder.js` or `tests/test-disasm.js` to match the house style (describe/test structure, assertion style, fixture loading patterns).
3. Read `output/vm-slide/dispatch-table.json` and the first ~500 bytes of `output/vm-slide/bytecode.json` to confirm the fixture values match what is pinned in the Context section above.
4. Create `tests/test-vm-slide-decoder.js` with at least these test groups (each group can have multiple `it`/`test` cases):
   - **`dispatch-table shape`** — asserts:
     - `dispatch-table.json` has length 69.
     - Exactly 53 entries are non-null, 16 are null.
     - The set of unique `operandCount` values across non-null entries is `[0, 1, 2, 6]` (sorted).
     - Slot 65 is null (confirmed hole that caused the disassembler halt).
     - Opcode 0's `operandCount` is 1 (regression anchor — 39.3 may rename but should not change arity).
     - Every non-null entry has required keys: `opcode`, `operandCount`, `source`.
     - Every `source` field is a non-empty string that starts with `function`.
   - **`bytecode shape`** — asserts:
     - `bytecode.json` has length 24273.
     - The bytecode contains the XTEA delta `0x9E3779B9` (2654435769) exactly 2 times.
     - The bytecode contains at least one non-integer value (the `.5` literal).
     - No element is a string (everything is a number or null).
   - **`disassembly pins`** — asserts:
     - First 10 lines of `disassembly.txt` match the exact strings listed in Context above.
     - Total line count matches 312 (or whatever the committed file has — read it and pin).
     - The file contains a `WARN: halt at pc=512` marker indicating the legitimate halt (the test pins this so a future control-flow-aware upgrade will break the test intentionally, signaling the pin needs updating).
   - **`decoder end-to-end`** (only if you can run it cleanly) — runs the decoder against `sample/vm_slide.js` via `execFileSync` (or imports its main function), compares output to the committed `dispatch-table.json` / `bytecode.json`, asserts byte-for-byte equality. If this is too slow (acorn on 43 KB shouldn't be slow — <1s), include it. If the decoder has side effects that write to `output/vm-slide/` directly, use a temp directory to avoid clobbering the committed artifacts, or skip this test and document why in a comment.
   - **`disassembler end-to-end`** — same shape. Runs disassembler, compares output to committed `disassembly.txt`.
5. Run `node --test tests/test-vm-slide-decoder.js` to verify the new test file alone passes.
6. Add `tests/test-vm-slide-decoder.js` to the `scripts.test` entry in `package.json` alongside the other test files (the project's convention is explicit enumeration in `package.json` — look at the current value).
7. Run `npm test`. Must be exactly **297/297** (296 baseline + however many new tests you added → report the delta clearly). If the `template-cache: lookup` flake hits (has been seen ~5 times this phase), re-run once. If it persists deterministically, stop and investigate whether your new test file is interacting with shared state.

### Verification — report all of these
1. `ls tests/test-vm-slide-decoder.js` — exists.
2. `node --test tests/test-vm-slide-decoder.js` — all tests pass. Paste the summary line.
3. `npm test` final summary — total test count = 296 + (new tests added). Must be 0 failures. Paste the line.
4. `grep -n 'test-vm-slide-decoder' package.json` — must show the new file listed in `scripts.test`.
5. Count of test cases (`grep -cE '^[[:space:]]*(test|it)\(' tests/test-vm-slide-decoder.js`) — report the number. Should be at least 10 across the groups above.
6. Confirm the `decoder end-to-end` and `disassembler end-to-end` tests are present (or document why they were skipped in a comment the director can read).
7. If you added `module.exports = ...` to `decoder.js` or `disassembler.js`, show the diff — must be additive only (no logic changes).
8. Any unexpected assertion values: if your test's `assert.strictEqual` came up with a different number than what the Context section listed, STOP, don't rewrite the test to match, and report the discrepancy. A drift between Context and actual output means either the Context is stale or the decoder regressed — either way, the director needs to know.

### Suggested Agent
`general-purpose` — same capability as 39.1 but a different agent instance. The separation rule requires the test writer to come at the code fresh, without 39.1's author's assumptions baked in.
