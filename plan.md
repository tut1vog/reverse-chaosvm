# Plan

## Status
Current phase: Phase 40 — Phase-39 follow-ups
Current task: 40.3 — Refresh vm-slide docs with full-coverage disassembly

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
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1 + XTEA finding from 40.6; promote track status from `partial` to `closed` | in-progress |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (17+ sightings in Phases 38-40) | done |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | done |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | done — CONFIRMED classical XTEA, both encrypt (entry 15241) and decrypt (entry 15416) |

---








## Current Task

**ID**: 40.3
**Title**: Refresh vm-slide docs with full-coverage disassembly + XTEA finding; close Track 1
**Phase**: Phase 40 — Phase-39 follow-ups
**Status**: in-progress

### Goal
Update the three vm-slide documentation artifacts to reflect the full-coverage disassembly from 40.1 (14,134 instructions, 101 function entries, 58.2% instruction-start coverage) and the confirmed classical XTEA finding from 40.6 (encrypt at entry 15241, decrypt at entry 15416, both using classical Needham/Wheeler round math with an argument-passed key). Promote the `research/vm-slide-stack-vm/` track status from `partial` to `closed`.

This is the final Phase 40 task. After this, all 6 follow-up tasks are done and the vm-slide research track is checkpointed with its richest available understanding.

### Context

**Docs to update**:

1. **`docs/VM_SLIDE_ARCHITECTURE.md`** — currently reflects 39.3's first-pass understanding with a ~2% coverage caveat in multiple places. 40.6 already made one narrow edit to the Unresolved-findings XTEA bullet. 40.3's job is broader: update the coverage caveats, add an "Observed function table" subsection listing the 101 entries, fold in walker-specific facts the subagent discovered (OP 16 VM_EXIT, OP 35 implicit-catch-branch, OP 61 context-dependent terminator), and promote findings from "unresolved" to "resolved" where 40.6 confirmed them.

2. **`docs/VM_SLIDE_OPCODES.md`** — currently has 53 rows classified from source inspection in 39.3. With full-coverage disassembly available, you can now validate classifications against real usage. For each opcode, check how it's actually invoked in `output/vm-slide/disassembly-full.txt` — does its operand pattern match the 39.3 classification? Are there any opcodes where the real usage contradicts the source-only classification? If yes, flag and update. Also: the 39.3 version uses placeholder OP_NN names in the walker's disassembly; you may optionally cross-reference the real names alongside the OP_NN labels in a short appendix.

3. **`research/vm-slide-stack-vm/README.md`** — currently has status `partial`. Promote to `closed` with a final "Notes" section listing all Phase 39+40 deliverables and the one known remaining unknown (module-export indirection preventing static identification of XTEA callers).

**What the walker + 40.6 surfaced that the 39.3 docs don't have yet**:
- **53 of 53 handlers classified — no ?NAME** (already in 39.3, but worth cementing now that full-coverage disassembly hasn't contradicted any classification).
- **101 function entries discovered** via FUNC_CREATE. This is a concrete fact the architecture doc should name.
- **Five control-flow opcodes**: 6 (JUMP), 16 (VM_EXIT), 35 (TRY_PUSH implicit catch-branch), 58 (FUNC_CREATE), 60 (JUMP_IF_TRUE). 39.3's docs mention 6 and 60 but not 16 or 35's special behavior.
- **FUNC_CREATE closure factory at PC 15220 + XTEA encrypt/decrypt at entries 15241/15416** (from 40.6). This is the single most interesting point in the entire bytecode and deserves a dedicated subsection or prominent mention in the architecture doc.
- **Coverage is now effectively 100% of reachable code**, 58.2% of bytecode bytes as instruction starts, zero dispatch-hole hits, zero unreached bytes. The ~2% caveat is obsolete; every docs mention of it must be updated.

**Files that are now committed you can cite**:
- `research/vm-slide-stack-vm/walker.js` (40.1)
- `research/vm-slide-stack-vm/xtea-hunt.js` (40.6)
- `output/vm-slide/disassembly-full.txt` (40.1)
- `tests/test-vm-slide-walker.js` (40.2)

### Implementation Steps

1. **Read the three docs in full**: `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `research/vm-slide-stack-vm/README.md`. Note every place that cites ~2% coverage, "Phase 40 task 40.1 will...", or similar forward-references that have now been satisfied.
2. **Read `output/vm-slide/disassembly-full.txt`**'s first 200 lines and a sample near pc=15200 (the XTEA factory region) to understand the function-entry-and-closure pattern first-hand.
3. **Update `docs/VM_SLIDE_ARCHITECTURE.md`**:
   - **Overview section**: drop the "first-pass, ~2% coverage" language. Replace with "Phase 39+40 analysis; full-coverage disassembly available." Cite the walker.
   - **Observed coverage and limitations section**: rewrite. Report the 14,134 instructions / 101 function entries / zero dispatch-hole hits / [0, 24273) visited range facts. The remaining limitation is module-export indirection for caller identification — document this honestly.
   - **Dispatch loop section**: add OP 16 as a VM-exit terminator (returns truthy from the `for(;!B;) B=Q[m[g++]]()` loop). Add OP 35 as an implicit branch via the outer catch block.
   - **Exception handling section**: add the OP 35 / OP 61 details (61 is context-dependent, returns truthy only when exception slot K is set).
   - **Unresolved findings section**: the XTEA bullet is now resolved by 40.6 — move it to a new "Resolved findings" subsection or restructure. The remaining genuine unknowns are (a) what arguments the XTEA factory at PC 15220 is actually invoked with (module-export indirection), (b) the shared-compiler-backend question (still open, no task), (c) the `0.5` non-integer operand quirk (still open, no task), (d) whether any of the 16 dispatch holes are reachable (walker confirmed they're not reached, but Tencent could ship a build where they are).
   - **NEW subsection — "XTEA factory and closures"**: describe the factory at PC 15220, the encrypt closure at PC 15241, the decrypt closure at PC 15416, the loop bound `sum == 32*delta`, the fact that the cipher is classical (not modified), and the fact that the key is argument-passed. Reference `research/vm-slide-stack-vm/xtea-hunt.js` for the reproducible analysis. Note that the real-world invocation context (is it `eks`? is it the verify-POST body?) is still unknown due to module-export indirection — but this is a natural handoff to the `eks-payload` or `captcha-orchestrator` tracks.
   - **Differences from register VM section**: add that vm-slide uses **classical** XTEA, not the modified variant. The register VM's per-template STATE_A key derivation does not apply.
4. **Update `docs/VM_SLIDE_OPCODES.md`**:
   - **Overview**: drop the "source inspection only" caveat; note that classifications have now been validated against the walker's full-coverage disassembly.
   - **Coverage caveat section**: rewrite. The behavioral-coverage gap 39.3 flagged is closed.
   - **Opcode table rows**: for each row that 39.3 classified with any uncertainty or that 40.6 discovered has special semantics (especially OP 16, 35, 58, 61), add a one-line note citing the walker observation or the XTEA finding if relevant. Do NOT rewrite every row — most are fine as-is; only touch rows where the full-coverage analysis adds information.
   - **NEW subsection — "Opcodes in the XTEA factory"**: list the specific opcodes used in the XTEA round body (from the 40.6 report: PUSH_K, LOAD_LOCAL, MAKE_LOCAL_REF, LOAD_LOCAL_REF, STORE_LOCAL_REF, SHL, USHR, XOR, AND, ADD, SUB, DUP, POP, SWAP_AT, REPLACE_TOP_K, JUMP, JUMP_IF_TRUE, EQ, LOGICAL_NOT, FUNC_CREATE). This is a concrete list of "if you're porting vm-slide to a standalone token generator, these opcodes are the minimum viable set". The subsection is short — just the list and a one-sentence intro.
   - **Unresolved entries section**: 39.3's version has no `?NAME` entries but mentions two open-runtime questions (FUNC_CREATE operand width, SWAP_AT naming). FUNC_CREATE is fully resolved by 40.1's walker. SWAP_AT naming is validated by the XTEA usage pattern — add that observation.
5. **Update `research/vm-slide-stack-vm/README.md`**:
   - **Status**: change `partial` to `closed`.
   - **How to reproduce**: add the walker and xtea-hunt commands alongside the existing decoder/disassembler/tests commands.
   - **Notes**: list the Phase 39+40 deliverables and the one remaining unknown (module-export caller identification). Cite 40.6's findings explicitly.
6. **Do NOT modify**:
   - `docs/CHAOSVM_VARIANTS.md` — it's already written for first-pass; the cross-variant comparison doesn't need refreshing for full-coverage. If you're tempted to update it, stop — that's out of scope.
   - `docs/CRYPTO_ANALYSIS.md` — register-VM authoritative, don't merge vm-slide crypto findings here.
   - `project-brief.md` — task 39.5 already has the Track 1 status overlay; no need to add more now.
   - `CLAUDE.md` — don't touch.
   - `research/vm-slide-stack-vm/{decoder.js, disassembler.js, walker.js, xtea-hunt.js}` — code is frozen.
   - Any test file — 350/350 must stay.
7. **Run `npm test`** as a sanity check. Must stay 350/350 (the 40.4 fix is holding; no flake expected).

### Verification — report all of these

1. `ls docs/VM_SLIDE_ARCHITECTURE.md docs/VM_SLIDE_OPCODES.md research/vm-slide-stack-vm/README.md` — all exist.
2. `git diff --stat docs/VM_SLIDE_ARCHITECTURE.md docs/VM_SLIDE_OPCODES.md research/vm-slide-stack-vm/README.md` — three files, changes are additive and narrow (no wholesale rewrites).
3. `grep -n '~2%\|first-pass\|2% coverage' docs/VM_SLIDE_ARCHITECTURE.md docs/VM_SLIDE_OPCODES.md research/vm-slide-stack-vm/README.md` — remaining instances (should be none in ARCHITECTURE/OPCODES; the README can still say "Phase 39 first-pass" historically if you want). Paste what you find.
4. `grep -n 'Phase 40 task 40.1\|Phase 40 task 40.6' docs/VM_SLIDE_ARCHITECTURE.md docs/VM_SLIDE_OPCODES.md` — forward-references to 40.1 and 40.6 should now either be gone (resolved) or phrased in past tense ("resolved by Phase 40 task 40.6").
5. `grep -n '14134\|101 function' docs/VM_SLIDE_ARCHITECTURE.md` — at least one mention of the walker's actual coverage numbers.
6. `grep -n '15241\|15416\|15220\|XTEA' docs/VM_SLIDE_ARCHITECTURE.md` — the XTEA factory + encrypt/decrypt entry PCs are documented.
7. `grep -A 2 '^## Status' research/vm-slide-stack-vm/README.md` — body is `closed`.
8. `grep -c '^## ' research/vm-slide-stack-vm/README.md` — still exactly 5 sections.
9. `npm test` — 350/350. Note any flake (should be none).
10. Surprises or discrepancies between what 39.3 documented and what 40.1/40.6 revealed — report honestly, don't silently smooth over.

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **No code, no tests, no new docs.** This task edits three existing files only.
- **Do not rewrite whole sections unnecessarily.** Prefer narrow, additive edits that layer the full-coverage findings onto the 39.3 foundation. Only rewrite a section if it's genuinely stale (e.g. "~2% coverage" language).
- **Do not touch `docs/CHAOSVM_VARIANTS.md`, `docs/CRYPTO_ANALYSIS.md`, `project-brief.md`, `CLAUDE.md`, any code file, any test file.**
- **Do not modify `sample/**`, `targets/**`, `.claude/rules/**`, `history/**`, `docs/WORKFLOW.md`, or any file under `output/`**.
- **Every new claim must be traceable** to 40.1's walker output, 40.6's xtea-hunt output, the 39.3 source-inspection findings, or a committed fixture. No speculation.
- **Do not forward-reference Phase 41 or anything past Phase 40.** The only genuine follow-up worth mentioning is the module-export indirection limitation, and it should be phrased as "still an open question" without naming a task.
- **Do not promote the track from `closed` to anything else.** Closed means: this first research pass is complete. Future builds, new samples, or deeper dynamic analysis may reopen it but that's Phase 41+ business.
- If you find a real discrepancy between the 39.3 docs and the 40.1/40.6 findings (e.g. an opcode whose source-inspection classification is contradicted by real usage), stop and report rather than silently rewriting.

### Suggested Agent
`general-purpose` — docs refresh task, no specialized expertise needed. The difficulty is in navigating existing content and knowing what to leave alone vs. what to update.
