# Plan

## Status
Current phase: Phase 40 COMPLETE — vm-slide research track CLOSED
Current task: none — Phases 38/39/40 all done, session complete

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

---









## Current Task

**Phases 38, 39, and 40 are all complete.** No active task.

The `research/vm-slide-stack-vm/` track is **CLOSED** — first research pass done with full-coverage disassembly, regression tests, architecture doc, opcode table, variants comparison doc, and a confirmed classical XTEA finding. See `history/20260412.md` for the full per-task record.

**Other Stream B research tracks** remain at `open` / `partial` status:
- `research/captcha-orchestrator/` — open, owns `t_captcha_slide.js` orchestration (high-value next track: connects to vm-slide XTEA caller identification)
- `research/eks-payload/` — open, owns the 232-byte eks payload (likely the XTEA decrypt input — see vm-slide closed-track findings)
- `research/template-pool/` — partial, survey + diagnose tooling in place
- `research/key-mod/` — open, cross-template key-mod constants for register VM
- `research/collector-fields/` — open, collector field count across templates
- `research/errorcode-12/` — open, verify-endpoint errorCode 12 investigation
- `research/tdc-register-vm/` — stable (register-VM decompiler, Phases 1-37)

**Natural next phase candidates** (not prescribed — user's call):
1. **Caller identification for vm-slide XTEA** — the single most valuable handoff from Phase 40. Would connect vm-slide-stack-vm + eks-payload + captcha-orchestrator tracks. Likely needs runtime instrumentation (Puppeteer + console.log injection) since static analysis is blocked by module-export indirection.
2. **Captcha orchestrator analysis** — how does `t_captcha_slide.js` load vm-slide and route data through it?
3. **Deferred minor cleanups** from 40.4's secondary findings: add `config.target` type guard in `TemplateCache.seed()`; clean up the stale describe-block text in `tests/test-auto-port.js:358`.

The session's test baseline moved from **296/296** (pre-session) to **350/350** (+54 tests across 39.2, 40.2, 40.5) with the long-running `template-cache: lookup` flake permanently fixed in 40.4.
