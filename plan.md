# Plan

## Status
Current phase: Phase 39 COMPLETE — Phase 40 queued
Current task: none — Phase 39 closed, Phase 40 awaiting user direction

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
| 40.1 | Upgrade vm-slide disassembler with control-flow-aware walker (static CFG, adapt approach from `research/tdc-register-vm/cfg-builder.js`). **Must special-case opcode 58 FUNC_CREATE**: its runtime byte width is `3 + 2·A + C`, not the static count of 6. The current linear walker mis-parses after the first FUNC_CREATE, which is likely why it halts at pc=512. Fix FUNC_CREATE handling FIRST, then address control-flow. | pending |
| 40.2 | Tests for control-flow walker | pending |
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1; promote track status from `partial` to `closed` | pending |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (7+ sightings in Phases 38-39) | pending |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | pending |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | pending |

---


## Current Task

**Phase 39 is complete.** No active task. Phase 40 (six follow-up tasks) is queued above and awaits user direction on which task(s) to dispatch first.

Phase 39 summary (see `history/20260412.md` for the full per-task record):
- **39.1** decoder + disassembler built, 69 dispatch slots / 53 non-null handlers / 24,273 bytecode elements extracted from `sample/vm_slide.js`
- **39.2** 16 regression tests pinning 39.1 output
- **39.3** `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` classifying all 53 handlers from source inspection; resolved the FUNC_CREATE 6-operand mystery (variable-width at runtime: `3 + 2·A + C` bytes, instantiates nested `__TENCENT_CHAOS_VM` invocations for closures)
- **39.4** `docs/CHAOSVM_VARIANTS.md` top-level register-vs-stack synthesis doc with 7 open cross-variant questions
- **39.5** `project-brief.md` and `research/vm-slide-stack-vm/README.md` reconciled with Phase 39 findings

**Key cross-track finding**: XTEA delta `0x9E3779B9` appears exactly twice in the vm-slide bytecode — strong signal that vm-slide runs its own XTEA round function on some payload (possibly `eks`), linking this track to the `eks-payload` and `key-mod` tracks. Phase 40 task 40.6 will investigate.

**Known latent bug**: 39.1's linear disassembler mis-parses every `FUNC_CREATE` site because it uses a static operand count (6) instead of the runtime width (`3 + 2·A + C`). This is likely why the linear walker halts at pc=512 — it's probably mid-stream through a mis-parsed FUNC_CREATE and hits arbitrary data. The 39.2 tests pin the wrong-but-deterministic output as regression anchors. **Phase 40 task 40.1 must fix FUNC_CREATE handling before any control-flow tracing can work.**

**Test-suite flake**: `tests/test-scraper-foundation.js → template-cache: lookup` flaked approximately 12 times across Phases 38-39. Near-deterministic in full-suite runs (fails 1-3 consecutive times then clears); never fails in isolated runs. Multi-test-parallel race condition. **Phase 40 task 40.4 owns the diagnosis.**
