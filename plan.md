# Plan

## Status
Current phase: Phase 39 — vm-slide stack VM
Current task: 39.5 — Update project-brief.md + refresh research/vm-slide-stack-vm/README.md

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
| 39.5 | Update `project-brief.md` with corrected vm-slide facts (53 opcodes, 24K bytecode, XTEA finding) + refresh `research/vm-slide-stack-vm/README.md` status to `partial` | in-progress |

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

**ID**: 39.5
**Title**: Update project-brief.md with corrected vm-slide facts + refresh research/vm-slide-stack-vm/README.md
**Phase**: Phase 39 — vm-slide stack VM
**Status**: in-progress

### Goal
Close Phase 39 Track 1 by reconciling two stale documents with the verified findings from 39.1–39.4:

1. **`project-brief.md`** — the research-phase backlog. Track 1's description says "~36 opcodes" but the verified count is **53 non-null handlers + 16 holes across 69 dispatch slots**. Bytecode length estimate was rough — actual is **24,273 elements**. The XTEA delta finding and the FUNC_CREATE closure mechanism aren't mentioned at all. These need to land in the brief so the backlog reflects reality.

2. **`research/vm-slide-stack-vm/README.md`** — the track's scaffold README created in 38.2. Status is still `open`. It needs promotion to `partial` and a populated "How to reproduce" section with real commands for the decoder and disassembler built in 39.1.

Both updates are documentation-only director-style edits. They are the final task of Phase 39 — after this, Track 1 checkpoints cleanly and Phase 40 can pick up the control-flow walker upgrade and follow-ups.

### Context

**`project-brief.md` current state** — read the existing Track 1 section under "Stream B — Research tracks" first. Current claims to verify and update:
- "stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, ~36 opcodes)" — **update to 53 non-null handlers + 16 holes**.
- Definition of done items 1-6 — these were speculative pre-39.1. Items 1-5 (decoder, disassembler, architecture doc, opcodes doc, tests) are **now done**; item 6 (variants comparison doc) is **also done**. The brief should either mark Track 1 as `partial` (not `closed`, because Phase 40 still owes full coverage) or leave the DoD intact but prepend a `**Status as of 2026-04-12**:` note pointing at the committed artifacts.
- Decoder/disassembler/tests references — the brief doesn't mention they exist. Add a short "Committed artifacts" subsection listing paths.

**`research/vm-slide-stack-vm/README.md` current state** — read it first. It should be the 38.2 scaffold:
- `# vm-slide-stack-vm`
- `## Open question` — one paragraph quoted from brief (verbatim)
- `## Status` — `open`
- `## Inputs` — `sample/vm_slide.js` and "Optional: fresh vm-slide.*.enc.js"
- `## How to reproduce` — "No runnable artifacts yet — see `project-brief.md` §Stream B for the definition of done."
- `## Notes` — empty

This task's update:
- Status: `open` → `partial` (track has committed code and committed docs; full-coverage walker pending Phase 40).
- How to reproduce: replace the placeholder with real CLI commands for the decoder and disassembler plus pointers to the authoritative docs and tests.
- Notes: add a short bulleted summary of key findings (53 handlers, 24K bytecode, FUNC_CREATE variable-width finding, XTEA delta in bytecode). Each finding one line, each citing a doc filename.
- Open question, Inputs: **do not rewrite**. They are still accurate.

**Facts that must appear in both updates** (pulled from 39.1-39.4 verified state):
- Dispatch table: 69 slots, **53 non-null handlers**, 16 null holes at indices `[9,14,18,19,22,26,27,29,30,34,43,44,48,53,57,65]`.
- Bytecode: 24,273 numeric elements, one non-integer (`0.5`), contains XTEA delta `0x9E3779B9` exactly twice.
- Operand count distribution: `{0, 1, 2, 6}` statically; opcode 58 `FUNC_CREATE` is variable-width at runtime (`3 + 2·A + C` bytes) — a latent bug in 39.1's static count that Phase 40 task 40.1 will fix.
- Linear disassembly coverage: 312 instructions (pc 0..512), ~2% of the bytecode, halts legitimately on opcode 65 (a dispatch hole) which may itself be data from a mis-parsed FUNC_CREATE.
- FUNC_CREATE instantiates nested `__TENCENT_CHAOS_VM(...)` invocations — this is how vm-slide does closures / first-class functions, and it resolves where the outer-supplied F/Y/c helper arguments are consumed.
- Committed artifacts: `research/vm-slide-stack-vm/{decoder.js, disassembler.js}`, `output/vm-slide/{dispatch-table.json, bytecode.json, disassembly.txt}`, `tests/test-vm-slide-decoder.js` (16 tests), `docs/{VM_SLIDE_ARCHITECTURE.md, VM_SLIDE_OPCODES.md, CHAOSVM_VARIANTS.md}`.

**Phase 40 forward-references that must NOT appear as commitments in this task**:
- Do not rewrite Phase 40's scope. Phase 40 is already enumerated in `plan.md`; project-brief.md can cite task IDs by number (e.g. "Phase 40 task 40.1 will...") but must not claim the tasks are done or alter their contents.
- Do not promise specific Phase 40 completion dates or outcomes.

### Implementation Steps

1. Read `project-brief.md` in full to locate the Track 1 (vm-slide-stack-vm) section and understand the surrounding structure. Note the exact phrasing of the "~36 opcodes" claim so you know what you're replacing.
2. Read `research/vm-slide-stack-vm/README.md` to confirm the 38.2 scaffold shape.
3. Read `docs/VM_SLIDE_ARCHITECTURE.md` and `docs/VM_SLIDE_OPCODES.md` to confirm the facts you're about to land in the brief and README match those docs verbatim — any phrasing you use should either quote or closely paraphrase the authoritative docs.
4. **Edit `project-brief.md`**:
   - Update the "~36 opcodes" claim to "53 non-null handlers + 16 holes across 69 dispatch slots".
   - Update the bytecode size, if mentioned in a rough form, to 24,273 elements.
   - Prepend or append a `**Status as of 2026-04-12**:` paragraph to the Track 1 section summarizing what is done (decoder, disassembler, tests, architecture doc, opcodes doc, variants doc) and what is still outstanding (full-coverage disassembly — Phase 40 task 40.1). Name the committed artifact paths.
   - Cite the XTEA delta cross-track finding and the FUNC_CREATE variable-width finding as Phase 39 outcomes. These should go in the Status paragraph.
   - Do NOT rewrite the Open Question, Definition of Done, or Inputs subsections — they are historical planning artifacts. Add a status overlay, don't revise the underlying plan text.
5. **Edit `research/vm-slide-stack-vm/README.md`**:
   - Change `## Status` body from `open` to `partial`.
   - Replace `## How to reproduce` body with real commands. Match the shape used by `research/template-pool/README.md` (which was similarly promoted from `open` → `partial` in task 38.3). Include:
     ```
     # Run the decoder (acorn-parses sample/vm_slide.js, writes output/vm-slide/)
     node research/vm-slide-stack-vm/decoder.js

     # Run the disassembler (reads output/vm-slide/*.json, writes output/vm-slide/disassembly.txt)
     node research/vm-slide-stack-vm/disassembler.js

     # Run regression tests
     node --test tests/test-vm-slide-decoder.js
     ```
   - Replace the empty `## Notes` body with a short bulleted summary of key findings — each one line, each citing a doc filename. At minimum:
     - 53 non-null handlers across 69 dispatch slots, classified in `docs/VM_SLIDE_OPCODES.md`
     - 24,273-element bytecode with XTEA delta `0x9E3779B9` twice (cross-track finding, `docs/VM_SLIDE_ARCHITECTURE.md` → Phase 40 task 40.6)
     - Opcode 58 `FUNC_CREATE` is variable-width (runtime `3 + 2·A + C` bytes, not 6); instantiates nested VM invocations for closures (`docs/VM_SLIDE_OPCODES.md`)
     - Linear disassembly covers ~2% (pc 0..512); full coverage pending Phase 40 task 40.1 (`docs/VM_SLIDE_ARCHITECTURE.md`)
   - Do NOT touch the `# vm-slide-stack-vm` header, `## Open question` body, or `## Inputs` body.
6. Run `npm test`. Must be 312/312. If the `template-cache: lookup` flake hits (it's been reliable through the whole session), re-run up to 3 times. Docs edits should not affect tests.

### Verification — report all of these

1. `ls project-brief.md research/vm-slide-stack-vm/README.md` — both exist.
2. `grep -n '~36\|36 opcodes\|36 non-null' project-brief.md` — **must return no matches** (the stale claim is gone).
3. `grep -n '53 non-null\|53 handlers' project-brief.md` — updated count present.
4. `grep -n '24.273\|24273' project-brief.md` — bytecode length mentioned.
5. `grep -n '2026-04-12\|Status as of' project-brief.md` — status overlay added to Track 1.
6. `grep -n 'Phase 40\|40\.[0-9]' project-brief.md` — forward-references Phase 40 tasks.
7. `grep '^## Status' research/vm-slide-stack-vm/README.md -A 2` — shows `partial`.
8. `grep -A 10 '^## How to reproduce' research/vm-slide-stack-vm/README.md` — has the real decoder/disassembler/tests commands.
9. `grep -A 10 '^## Notes' research/vm-slide-stack-vm/README.md` — has the findings bullets.
10. `grep -c '^## ' research/vm-slide-stack-vm/README.md` — still exactly 5 sections.
11. Diff summary: `git diff project-brief.md research/vm-slide-stack-vm/README.md` — paste the stat line; changes must be additive (overlay + section body edits) and must NOT rewrite Open Question, Inputs, or the Track 1 definition of done.
12. `npm test` — 312/312. Note any flake.

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **No code, no tests, no new docs.** This task edits two existing files only.
- **Do not rewrite `project-brief.md`'s Open Question, Definition of Done, or Inputs** for Track 1. Those are historical planning artifacts — overlay a status paragraph, don't revise the plan.
- **Do not modify `sample/**`, `targets/**`, `.claude/rules/**`, `history/**`, `docs/WORKFLOW.md`, `CLAUDE.md`, or any file under `docs/`, `tools/`, `tests/`, `research/` other than `research/vm-slide-stack-vm/README.md`.**
- **Do not touch other tracks' READMEs** (`research/{captcha-orchestrator,eks-payload,template-pool,key-mod,collector-fields,errorcode-12,tdc-register-vm}/README.md`). Only the `vm-slide-stack-vm` README.
- **Every fact you land in either file must be traceable** to a committed artifact, the 39.1-39.4 history entries, or the authoritative per-variant docs. No speculation.
- **Do not claim Phase 40 tasks are done or will resolve X by Y date.** Forward-reference them with "Phase 40 task N.M will investigate/upgrade/resolve" phrasing.
- If the project-brief.md Track 1 section has been materially rewritten since the director last read it (i.e. you find it doesn't contain "~36 opcodes"), STOP and report what you see.

### Suggested Agent
`general-purpose` — short, precise documentation edit task. Low risk.
