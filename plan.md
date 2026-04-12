# Plan

## Status
Current phase: Phase 40 — Phase-39 follow-ups
Current task: 40.2 — Tests for control-flow walker

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
| 40.1 | Upgrade vm-slide disassembler with control-flow-aware walker (static CFG, adapt approach from `research/tdc-register-vm/cfg-builder.js`). **Must special-case opcode 58 FUNC_CREATE**: its runtime byte width is `3 + 2·A + C`, not the static count of 6. The current linear walker mis-parses after the first FUNC_CREATE, which is likely why it halts at pc=512. Fix FUNC_CREATE handling FIRST, then address control-flow. | done |
| 40.2 | Tests for control-flow walker | in-progress |
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1; promote track status from `partial` to `closed` | pending |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (7+ sightings in Phases 38-39) | pending |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | pending |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | pending |

---




## Current Task

**ID**: 40.2
**Title**: Tests for vm-slide control-flow walker
**Phase**: Phase 40 — Phase-39 follow-ups
**Status**: in-progress

### Goal
Write `node --test`-compatible regression coverage for the control-flow walker built in 40.1. Tests pin the 14,134-instruction full-coverage disassembly as the new regression anchor alongside the existing 39.2 tests that pin the linear walker's 312-instruction output.

This task is assigned to a **different agent** than 40.1 per the project's impl/tests separation rule — the tests author approaches the walker as a consumer, not the author.

### Context

40.1 produced:
- `research/vm-slide-stack-vm/walker.js` — a CommonJS CLI. Worklist-based walker that reads `output/vm-slide/dispatch-table.json` and `output/vm-slide/bytecode.json`, traces reachable PCs from entry 0 plus every FUNC_CREATE's `K` operand, writes `output/vm-slide/disassembly-full.txt`. Prints exactly `walked 14134 instructions across 101 function entries, visited range [0, 24273)` to stdout.
- `output/vm-slide/disassembly-full.txt` — 14,486 lines (14,134 instructions + blank separators between discontinuous regions).

**Director-verified facts to pin** (independently re-verified after 40.1's return):
- Walker stdout: exactly `walked 14134 instructions across 101 function entries, visited range [0, 24273)`
- `disassembly-full.txt` line count: **14486**.
- Walker instruction count: **14134**.
- Function-entry count: **101** (entry 0 + 100 unique K values across 128 FUNC_CREATE sites).
- Visited range: `[0, 24273)` — full bytecode.
- First 10 lines of `disassembly-full.txt`:
  ```
  00000  OP_40 3
  00002  OP_42 2
  00004  OP_06 1568

  00007  OP_40 6
  00009  OP_42 2
  00011  OP_42 3
  00013  OP_42 4
  00015  OP_42 5
  00017  OP_06 289
  ```
  Note the blank line after pc=4 (OP_06 is an unconditional JUMP terminator, so pc=7 is a separate worklist target). This formatting convention is a walker invariant — pin it.
- Control-flow classification (walker's internal constants) — these are locked in the walker source and the tests should verify the walker's **behavior**, not reach into private state. The public contract is: given the committed dispatch table and bytecode, the walker produces exactly this output file.

**FUNC_CREATE hand-verification anchors** (each cites a concrete PC the walker visits):
- pc=291: `58 20 2 1 5 4 6 3 3` → K=20, A=2, C=1, width 8, nextPc=300. The instruction at 300 is `OP_36`.
- pc=1568: `58 7 0 1 3` → K=7, A=0, C=1, width 4, nextPc=1573. The instruction at 1573 is `OP_04`.

**Dispatch hole audit**: zero holes were hit during the walk. The walker should never emit a `HALT` line against the committed fixtures.

**Coverage delta**: 14,134 instructions vs the 39.1 linear walker's 312 = **45.3× coverage increase**.

**Existing tests**:
- `tests/test-vm-slide-decoder.js` — 16 tests for 39.1. Pins `dispatch-table.json`, `bytecode.json`, `disassembly.txt`, decoder CLI stdout, disassembler CLI stdout+stderr. These must continue to pass unchanged. Your new tests go in a **separate new file** `tests/test-vm-slide-walker.js`.
- House style: see `tests/test-vm-slide-decoder.js`. Uses `node:test` + `node:assert`, `child_process.execFileSync` / `spawnSync` for CLI tests, committed fixtures as source of truth.

**Module exports**: the 40.1 walker may or may not export anything importable. You need to read the file and find out. Per 39.2 precedent, the tests-author is permitted to add `module.exports = { ... };` at the end of `walker.js` if needed for testability — **exports only, no logic changes**. But if the walker's `main()` runs at top level (like 39.1's files did), prefer `execFileSync` over `require()` to avoid invasive edits.

**Fixture files**: tests should read `output/vm-slide/disassembly-full.txt` from disk as the ground truth. The committed file was verified by the director after 40.1 returned. Do not regenerate inside the test and compare against runtime output — that couples tests to walker invocation and is slow. Instead:
- Static assertions against the committed file (line count, first-N lines, contains-string tests for specific PCs).
- One end-to-end test that spawns the walker via `execFileSync`, captures its stdout, and compares its output file byte-for-byte to the committed version.

### Implementation Steps

1. Read `.claude/rules/coding-style.md`.
2. Read `tests/test-vm-slide-decoder.js` end-to-end — match its house style (describe/it structure, execFileSync patterns, byte-for-byte file comparison patterns).
3. Read `research/vm-slide-stack-vm/walker.js` — determine whether it exports anything and whether it has top-level side-effect code.
4. Read `output/vm-slide/disassembly-full.txt` (at least first/last 50 lines + middle sample) — confirm every pinned value from the "Director-verified facts" section matches.
5. Verify the two FUNC_CREATE hand-trace anchors by reading `output/vm-slide/bytecode.json` slices around pc=291 and pc=1568. Confirm the K/A/C values and that the walker's output at pc=300 and pc=1573 matches.
6. Create `tests/test-vm-slide-walker.js` with the test groups listed below.
7. Add `tests/test-vm-slide-walker.js` to `package.json` `scripts.test` (append at the end of the list alongside `test-vm-slide-decoder.js`).
8. Run `node --test tests/test-vm-slide-walker.js` in isolation — all new cases pass.
9. Run `npm test`. Total = **312 + (new cases you added)**. `template-cache: lookup` flake may hit (13+ sightings); re-run up to 3 times. If it fails deterministically on every run, stop and report — your new tests may be interacting with shared state.

### Required test groups (each a `describe` block with multiple `it` cases)

1. **`walker output shape`** — static assertions against the committed `output/vm-slide/disassembly-full.txt`:
   - Line count is **14486**.
   - First 10 lines match the golden block above (including the blank line).
   - Contains the exact string `OP_06 1568` (the first JUMP at pc=4).
   - At least one line exists for each of the hand-trace anchors — find a line starting with `00300  ` and one starting with `01573  `.
   - Contains no `HALT` or `OP_??` marker anywhere (walker never hit a hole).
   - Every non-blank line matches the format `/^\d{5}  OP_\d{2}(?:\s+-?\d+(?:\.\d+)?)*$/` (5-digit PC, two-space gap, OP_NN, optional space-separated numeric operands).

2. **`walker coverage facts`** — assertions about aggregate walker behavior from the committed file:
   - Number of distinct PC values (lines starting with a digit) is **14134**.
   - Lowest PC is 0, highest PC is below 24273.
   - At least 45x more instructions than the linear walker's committed `disassembly.txt` (which has 313 lines total, 312 instructions + 1 halt marker).

3. **`walker CLI contract`** — spawn via `execFileSync`:
   - stdout equals exactly `walked 14134 instructions across 101 function entries, visited range [0, 24273)\n`.
   - Exit code 0.
   - stderr is empty (no HALT diagnostics).
   - After running, `output/vm-slide/disassembly-full.txt` is byte-for-byte identical to the committed version (idempotent re-run).

4. **`linear walker pinned file is untouched`** — sanity check that 40.1 didn't accidentally break 39.2's baseline:
   - `output/vm-slide/disassembly.txt` still has 313 lines.
   - First line is `00000  OP_40 3` (same as the walker's first line — both start at pc=0).
   - The committed file matches the 39.2-pinned golden first 10 lines.
   (These assertions duplicate a subset of 39.2's test coverage but are cheap and pin the invariant that 40.1 preserved.)

5. **`dispatch-table is unchanged from 39.1`**:
   - `dispatch-table.json` length is still 69.
   - Non-null count is 53, null count is 16.
   - No `variableWidth` key present on any entry (walker keeps its own constant; schema untouched).

6. **Optional but recommended — `FUNC_CREATE hand-traces`**: assert the walker output contains a line at pc=300 starting with `00300  OP_36` and a line at pc=1573 starting with `01573  OP_04`. These are concrete regression anchors for the FUNC_CREATE width fix — if the walker regresses its operand consumption, these specific downstream PCs would land on different bytes.

Aim for at least **10 test cases** across the groups. More is fine.

### Verification — report all of these

1. `ls tests/test-vm-slide-walker.js` — exists.
2. `node --test tests/test-vm-slide-walker.js` summary — paste pass/fail counts.
3. `npm test` summary — total should be **312 + (delta)**, 0 failures. Paste the summary line.
4. `grep -n 'test-vm-slide-walker' package.json` — shows new file listed in `scripts.test`.
5. Count of `it(` calls in the new test file — at least 10.
6. Presence of all 6 required test groups (5 mandatory + 1 optional — you can include or skip the FUNC_CREATE group, but document the decision).
7. If you added `module.exports` to `walker.js`, show the diff (must be additive, exports-only). If not, note that tests use `execFileSync`.
8. Any pinned-value discrepancies between the Director-verified facts and what you found in the committed files — do not silently rewrite assertions to match drift.
9. Any flake sightings during verification and how many re-runs it took.

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **Do not refactor `walker.js`** — only additive `module.exports = { ... };` if needed for imports.
- **Do not modify `research/vm-slide-stack-vm/disassembler.js`, `decoder.js`, or `output/vm-slide/*.json` / `disassembly.txt`.** These are pinned by 39.2 or produced by 39.1/40.1 and must stay byte-identical.
- **Do not modify `tests/test-vm-slide-decoder.js`** — it pins 39.1/39.2 state.
- **Do not install any new npm package** — `node:test` + `node:assert` are built-ins.
- **Do not weaken any assertion to make a flake pass.** If a test hits a genuine race, stop and report.
- **Verify every pinned value against the committed files first.** If the director-supplied facts above differ from reality, stop and report the discrepancy — don't silently rewrite.
- If the task is too difficult or impossible, stop and report back.

### Suggested Agent
`general-purpose` — same capability as 40.1 but a fresh instance per impl/tests separation rule.
