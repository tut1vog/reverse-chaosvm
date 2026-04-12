# Plan

## Status
Current phase: Phase 40 — Phase-39 follow-ups
Current task: 40.5 — Resolve orphaned tests/test-auto-port.js

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
| 40.2 | Tests for control-flow walker | done |
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1; promote track status from `partial` to `closed` | pending |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (7+ sightings in Phases 38-39) | pending |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | in-progress |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | pending |

---





## Current Task

**ID**: 40.5
**Title**: Resolve orphaned `tests/test-auto-port.js`
**Phase**: Phase 40 — Phase-39 follow-ups
**Status**: in-progress

### Goal
The file `tests/test-auto-port.js` exists in the `tests/` directory but is NOT enumerated in `package.json` `scripts.test`. This means it has never been running under `npm test` since at least Phase 37. 38.1's restructure edited a path literal inside it (`tests/test-auto-port.js:358` — `'pipeline', 'run.js'` → `'tools', 'porting-pipeline', 'run.js'`) and that edit was never exercised by CI. Decide per-file whether to re-hook it into the test runner, delete it, or explicitly keep it orphaned with a documented reason.

### Context
- **File**: `tests/test-auto-port.js` — 17+ test assertions about the scraper's `_autoPort()` method, including a path-literal assertion that was updated by 38.1.
- **Current state**: file exists, imports from `../tools/scraper/scraper` and `../tools/scraper/template-cache`. 38.1 updated these paths via the require-rewrite pass.
- **Director has already confirmed the file runs cleanly in isolation + alongside test-scraper-foundation**: during 38.5 bisection, `node --test tests/test-scraper-foundation.js tests/test-auto-port.js` ran 81 tests with 0 failures. So the file is at least not currently broken.
- **Task scope**: read the file, understand what it tests, decide one of three actions, apply it.

### Three possible outcomes

1. **Add to `scripts.test`** — if the tests are legitimate regression coverage for the scraper's auto-port flow, hook it back in. Run `npm test` and confirm the total increases by the test count with zero failures. If the test fails deterministically when added to the full suite but passes in isolation (i.e. the `template-cache: lookup`-style race), STOP and report — that's a 40.4 concern, not 40.5's to fix.

2. **Delete the file** — if the tests are dead/stale/obsolete (e.g. testing a module or method that no longer exists, or covering a flow that's been superseded by live tests), delete it with a clear commit message explaining why. Prefer this only if you can positively identify that the tests are dead, not just "I don't understand them".

3. **Explicitly keep orphaned** — if the file serves a legitimate out-of-band purpose (e.g. a manual-run-only integration test that shouldn't be in CI) that would be destabilized by being added to `scripts.test`, add a top-of-file comment explaining why it's orphaned and what the intended invocation is. This is the rarest outcome.

### Implementation Steps

1. Read `tests/test-auto-port.js` in full. Understand what it covers (count the `it`/`test` cases, identify the module under test, read a few assertions).
2. Check whether the module under test (`tools/scraper/scraper.js` `_autoPort` method or equivalent) still exists. If not, the test is dead — delete candidate.
3. Check whether any other test file covers the same method. If `_autoPort` is covered elsewhere, the orphaned file may be obsolete.
4. Run the file in isolation: `node --test tests/test-auto-port.js`. Note the pass count and any failures.
5. Run it alongside the existing full suite by temporarily adding it to `package.json` `scripts.test` at the end, running `npm test`, and noting the result. If it **passes** (ignoring the known `template-cache: lookup` flake), commit to option 1 — leave it in `scripts.test`. If it **fails deterministically** even when the flake is accounted for, **roll back the package.json change** and either pick option 2 or option 3 based on what you learned.
6. If option 1: the test is now part of `npm test`. Report the new total.
7. If option 2: delete the file with `git rm`. Commit the deletion with a clear explanation of what was deleted and why.
8. If option 3: revert any `package.json` change, add a top-of-file comment to `test-auto-port.js` explaining the orphan status, and report the rationale.

### Verification — report all of these

1. `ls tests/test-auto-port.js` — exists or reports "No such file or directory".
2. Action chosen (add/delete/keep-orphaned) with one-sentence rationale.
3. `grep -n 'test-auto-port' package.json` — present or absent, matching the chosen action.
4. `node --test tests/test-auto-port.js` in isolation — pass/fail count.
5. `npm test` final summary. If option 1: total = 333 + (auto-port count). If option 2: total = 333 (file deleted). If option 3: total = 333 (unchanged).
6. A short summary of what `test-auto-port.js` was actually testing (2-3 sentences from your reading).
7. If option 1 and a flake hit: how many re-runs it took to clear.

### Constraints

- **Do not make any git commits.** The director handles all commits (including `git rm` if option 2 is chosen — the subagent stages, director commits).
- **Do not modify `tests/test-auto-port.js`** except for option 3's top-of-file comment. No refactoring, no assertion rewrites, no test logic changes. 38.1's path-literal edit is the only prior modification and must stay.
- **Do not modify any other test file or any module under `research/`, `tools/`, `docs/`, `sample/`, `targets/`, `.claude/rules/`, `history/`, `project-brief.md`, `CLAUDE.md`.**
- **Do not weaken pinned tests** — if enabling test-auto-port.js breaks other tests deterministically, that's a pre-existing bug the director needs to see.
- **Do not retroactively add new tests** to test-auto-port.js. It's a frozen file — either use it or don't.
- If the task reveals a bug you don't know how to classify (e.g. test-auto-port.js covers something important but its assertions are outdated), stop and report rather than making a unilateral decision.

### Suggested Agent
`general-purpose` — read, judge, apply one of three mechanical outcomes.
