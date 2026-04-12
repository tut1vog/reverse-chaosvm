# Plan

## Status
Current phase: Phase 41 — minor cleanup + Captcha orchestrator (Stream B Track 2)
Current task: 41.3 — Clean up stale describe-block text at tests/test-auto-port.js:358

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
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1 + XTEA finding from 40.6; promote track status from `partial` to `closed` | done |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (17+ sightings in Phases 38-40) | done |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | done |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | done — CONFIRMED classical XTEA, both encrypt (entry 15241) and decrypt (entry 15416) |

### Phase 41: Minor cleanup + Captcha orchestrator (Stream B Track 2)
> Two tiny cleanups from 40.4's deferred findings, then Stream B Track 2 — analyze `sample/t_captcha_slide.js` (213 KB webpack bundle) to document the end-to-end CAPTCHA flow. Track 2's DoD from `project-brief.md`: `docs/CAPTCHA_ORCHESTRATOR.md` with show-page load → vm-slide fetch → vData compute → verify POST → ticket, identifying every origination point for `collect`, `eks`, `vData`, `nonce`, `sess`, `sig`. The file is a standard webpack bundle with a module array, which makes static analysis via acorn tractable (same approach as `tools/porting-pipeline/vm-parser.js`).

| ID | Task | Status |
|----|------|--------|
| 41.1 | Add `config.target` type guard to `TemplateCache.seed()` (impl only — 1-line defensive check noted as a secondary finding in 40.4) | done |
| 41.2 | Tests for the type guard | done |
| 41.3 | Clean up stale describe-block text at `tests/test-auto-port.js:358` (says "pipeline/run.js" but the assertion underneath uses the post-restructure path) | in-progress |
| 41.4 | Captcha orchestrator survey — acorn-parse `sample/t_captcha_slide.js`, enumerate webpack modules, map the module graph, identify which modules touch vm-slide loading / verify POST / vData construction. Source-only, no deep analysis yet. | pending |
| 41.5 | Captcha orchestrator deep analysis — trace the show-page → vm-slide fetch → vData compute → verify POST flow across the relevant modules identified by 41.4. Cross-reference `sample/captcha-har.har` network trace. Confirm `sample/slide-jy.js` is vanilla jQuery. | pending |
| 41.6 | Write `docs/CAPTCHA_ORCHESTRATOR.md` from 41.4/41.5 findings. Required sections per DoD: show-page load, vm-slide fetch, vData compute, verify POST assembly, ticket return, plus an origination table for `collect`/`eks`/`vData`/`nonce`/`sess`/`sig`. | pending |
| 41.7 | Update `research/captcha-orchestrator/README.md` — promote status `open → partial` (or `closed` if 41.5 reached full understanding) and populate How-to-reproduce + Notes from the committed artifacts. | pending |

---










## Current Task

**ID**: 41.3
**Title**: Clean up stale describe-block text at `tests/test-auto-port.js:358`
**Phase**: Phase 41 — Minor cleanup + Captcha orchestrator (Stream B Track 2)
**Status**: in-progress

### Goal
Fix the stale test name at `tests/test-auto-port.js:358`. It says `'invokes node with pipeline/run.js, temp file, and --skip-verify'` but the assertion on line 380 has already been updated to the post-restructure path `tools/porting-pipeline/run.js`. The test title lies about what it asserts. Trivial string fix.

### Context
- Line 358 (`it(...)`) — test name uses pre-restructure path `pipeline/run.js`.
- Line 380 — assertion uses post-restructure path `path.join(PROJECT_ROOT, 'tools', 'porting-pipeline', 'run.js')`.
- No other references to `pipeline/run.js` should exist in this file; check with a grep at the end.
- This is the second of the two deferred 40.4 cleanups (the first was 41.1's type guard).

### Implementation Steps
1. Read `tests/test-auto-port.js:358` to confirm the current text.
2. Change the `it(...)` string from `'invokes node with pipeline/run.js, temp file, and --skip-verify'` to `'invokes node with tools/porting-pipeline/run.js, temp file, and --skip-verify'`. Only the path substring changes.
3. `grep -n "pipeline/run.js" tests/test-auto-port.js` — after the fix, must return zero hits (or only hits that are clearly intentional, in which case stop and report).
4. Run `node --test tests/test-auto-port.js` — all cases still pass.
5. Run `npm test` — must stay at 353/353.

### Verification — report all of these
1. `git diff tests/test-auto-port.js` — shows only the `it(...)` title change, +1/-1 at line 358. No other edits.
2. `grep -n "pipeline/run.js" tests/test-auto-port.js` — zero hits after the fix.
3. `grep -n "porting-pipeline/run.js" tests/test-auto-port.js` — should show hits at both the test name (line 358) and the assertion (line 380).
4. `npm test` — 353/353.

### Constraints
- **Do not make any git commits.** The director handles all commits.
- **Do not modify any file other than `tests/test-auto-port.js`**, and only the single `it(...)` string on line 358.
- **Do not rename, reformat, or refactor** any existing test — purely the one string substitution.
- **Do not change assertions.** The test body stays identical.
- If the task is too difficult (extremely unlikely — this is a single-string edit), stop and report.

### Suggested Agent
`general-purpose` — trivial string fix.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
