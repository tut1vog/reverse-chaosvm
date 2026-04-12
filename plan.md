# Plan

## Status
Current phase: Phase 40 — Phase-39 follow-ups
Current task: 40.4 — Diagnose template-cache: lookup flake

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
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (17+ sightings in Phases 38-40) | in-progress |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | done |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | pending |

---






## Current Task

**ID**: 40.4
**Title**: Diagnose and fix `tests/test-scraper-foundation.js → template-cache: lookup` flake
**Phase**: Phase 40 — Phase-39 follow-ups
**Status**: in-progress

### Goal
Figure out why `tests/test-scraper-foundation.js → template-cache: lookup` intermittently fails during full-suite `npm test` runs (17+ sightings across Phases 38-40) while passing cleanly in isolation every time. Either fix the race, or produce a concrete, evidence-backed root-cause analysis with a proposed fix that the director can review before dispatching an implementation task.

### Context

**Symptom**: during `npm test`, the single `template-cache: lookup` case in `tests/test-scraper-foundation.js` fails ~30–50% of the time. When it fails, the error is an assertion mismatch comparing a `keyMods` array — expected something like `[1649891407, 1177175396, 1667911778, 1835286848]` but got something like `[1, 2, 3, 4]` or `[0, 2368517, 0, 592130]`. Re-running `npm test` usually clears the failure.

**Observed patterns**:
- **Fails only in full-suite runs.** `node --test tests/test-scraper-foundation.js` in isolation has never failed in this session.
- **Fails only when N>2 tests run in parallel.** During 38.5 bisection, the director ran `node --test tests/test-scraper-foundation.js <other-file>` with every other test file individually. **No pair reproduces the failure.** That points to a multi-test-parallel race condition, not a specific pairwise interaction.
- **Failure is non-deterministic across full-suite runs.** 3 consecutive failures then 2 passes is typical. Sometimes 1 failure only.
- **Tests in scripts.test are independent files** — `node --test` runs them as separate processes by default, so in-process module state shouldn't be shared. The race is in filesystem or OS-level state.

**Likely suspects** (director has not verified any of these):
1. **Shared state in `tools/scraper/cache/templates.json`** — the template cache lives on disk. Multiple tests may call `seed()` / `load()` / `save()` concurrently and race on the cache file. test-scraper-foundation.js tests the cache lookup; another test may be mutating the same file in parallel.
2. **Shared state in `output/` directories** — if multiple test files write to the same output path (e.g. `output/tdc-autoport-<name>/pipeline-config.json`), one may clobber another's expected state.
3. **`tests/test-auto-port.js` newly added in 40.5** — this file mocks `child_process.execFile` and reads back "produced" pipeline-config.json. If it writes to real output paths without mocking the filesystem, it could clobber seed data that test-scraper-foundation.js expects. **Important**: the flake was observed 14+ times BEFORE 40.5 added test-auto-port, so auto-port is unlikely to be the root cause — but it may be exacerbating it. Verify.
4. **Test-scraper-foundation.js's `seed()` implementation** — if `seed()` reads from a path that other tests are writing to (e.g. `output/tdc/pipeline-config.json`), it picks up whatever the winning write was.
5. **A global `TemplateCache` singleton** or module-level state in `tools/scraper/template-cache.js` that gets loaded differently depending on which tests touched it first.

**The failing test's committed assertion**: director previously saw the expected values `[1649891407, 1177175396, 1667911778, 1835286848]` — these are the Template A keyMods from `tools/scraper/cache/templates.json` at cache key `efa7ccf712e75bbe` (director read this during 40.1 verification). The test expects those values, and sometimes gets wrong values instead.

### Investigation steps

1. **Read `tests/test-scraper-foundation.js` in full.** Identify the exact assertion that fails. Find the "template-cache: lookup" test case, read what it loads, what it asserts against, and what's its setup.
2. **Read `tools/scraper/template-cache.js` in full.** Understand how `seed()` / `load()` / lookup work, what files they read/write, whether there's module-level state.
3. **Read `tools/scraper/cache/templates.json`** to see the committed fixture. Note the Template A entry structure and its `keyMods` values.
4. **Find every test that touches `tools/scraper/cache/templates.json` or calls `seed()`/`load()`/`save()`/`autoPort()`**. Grep `tests/*.js` for imports and usage. Build a list of tests that write to the cache file during their run.
5. **Find every test that writes to `output/<something>/pipeline-config.json`** — any test doing this may be clobbering seed data.
6. **Reproduce the flake**: run `npm test` repeatedly (5-10 times). Note how often it fails and against which assertion. If you can't reproduce in 10 runs, the race may be timing-dependent in a way that needs other machine load to surface — in that case, read the code more carefully rather than insisting on a runtime repro.
7. **Narrow down**: if multiple tests touch the cache file, run `npm test` with a reduced script (half the tests) and see if the failure disappears. If it does, bisect to find the culprit. If it doesn't, re-bisect.
8. **Classify the race**:
   - **File-based race**: multiple tests write to the same file concurrently → fix: per-test temp files or explicit mocking.
   - **Module-state race**: singleton in template-cache.js or scraper.js gets mutated → fix: reset the module state at test-file boundaries or use `delete require.cache[...]`.
   - **Seed pollution**: some test writes bad data to `output/` that a later `seed()` picks up → fix: clean up output/ between tests or stop seeding from output/.
   - **Something else**: report what you found.

### Three possible outcomes

1. **Direct fix** — if you find a clear root cause and a small, targeted fix (e.g. a missing temp-dir usage, a missing `require.cache` reset, a shared path literal), apply it. Run `npm test` 5-10 times to confirm the flake is gone. Report the diff.

2. **Proposed fix with evidence** — if the root cause is clear but the fix is large or touches code the director would rather review first (e.g. rewriting how seed() reads cache data, or changing test-scraper-foundation's fixture setup in non-trivial ways), **do not apply the fix**. Stop, produce a detailed root-cause analysis with the proposed fix sketched out, and return.

3. **Unreproducible / inconclusive** — if you cannot reproduce the flake in 10+ runs and cannot identify the race from code reading alone, report that. Suggest the next diagnostic step (e.g. instrumenting `template-cache.js` with timing logs, running with `node --test --test-concurrency=1`, or adding fs-watch logging). Do not make speculative fixes.

**You are authorized to modify**: `tests/test-scraper-foundation.js`, `tools/scraper/template-cache.js`, `tests/test-auto-port.js`, `tests/test-pipeline-integration.js`, and `package.json` (for `scripts.test` order or concurrency flags). Any other file touched must be in the "don't touch" list below or authorized explicitly by the director.

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **Do not modify test assertions to make failures go away.** Weakening a test to hide a race is the worst possible outcome. If a test's assertion is genuinely wrong (e.g. pins the wrong keyMods array), report it rather than silently rewriting.
- **Do not skip tests.** No `it.skip`, no `test.skip`. If a test is broken in a way you can't fix, leave it broken and report.
- **Do not modify `targets/**`, `sample/**`, `.claude/rules/**`, `history/**`, `docs/WORKFLOW.md`, `project-brief.md`, `CLAUDE.md`, `research/**`, `output/**`.**
- **Do not modify `tests/test-vm-slide-decoder.js`, `tests/test-vm-slide-walker.js`, `research/vm-slide-stack-vm/**`, or any `output/vm-slide/*` file** — these are Phase 39/40 work that this task has no business touching.
- **Do not install any new npm package.**
- **Do not add global test concurrency flags (`--test-concurrency=1`) as a silent fix.** Serializing tests hides the race instead of fixing it. If concurrency=1 is the only solution you can find, report that as an **explicit finding with justification** rather than applying it.
- **If you find yourself speculating**, stop and read more code. The flake has been observed 17 times; the race is real and should be findable.

### Verification — report all of these

1. Your investigation narrative: what you read, what you ran, what hypotheses you tested, what you ruled out.
2. Root-cause statement: one paragraph, evidence-backed, or "I could not identify a root cause".
3. Chosen outcome (1 direct fix / 2 proposed fix / 3 inconclusive).
4. If outcome 1: the diff, and results of 5-10 `npm test` runs showing no flake recurrence. If any run still fails, note it clearly.
5. If outcome 2: the proposed diff as a code block (do not apply), and the reason you didn't apply it.
6. If outcome 3: the diagnostic state, and a concrete suggested next step.
7. Any other findings surfaced along the way (unrelated bugs, orphaned code, stale fixtures).

### Suggested Agent
`general-purpose` — investigation-heavy task, needs to read a lot of code and run tests iteratively.
