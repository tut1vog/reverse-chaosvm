# Plan

## Status
Current phase: Phase 39 — vm-slide stack VM
Current task: 39.4 — Write docs/CHAOSVM_VARIANTS.md — top-level register-vs-stack comparison

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
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | in-progress |
| 39.5 | Update `project-brief.md` with corrected vm-slide facts (53 opcodes, 24K bytecode, XTEA finding) + refresh `research/vm-slide-stack-vm/README.md` status to `partial` | pending |

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

**ID**: 39.4
**Title**: Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison
**Phase**: Phase 39 — vm-slide stack VM
**Status**: in-progress

### Goal
Produce a single top-level reference document, `docs/CHAOSVM_VARIANTS.md`, that compares the two ChaosVM variants known to the project: the register-based `tdc.js` VM (fully understood) and the stack-based `vm-slide` VM (first-pass understanding as of 39.3). The doc is a side-by-side comparison — not a re-derivation of either VM's internals. It points readers at the authoritative per-variant docs for details.

### Context

**Prerequisite docs** (all committed by this point):
- Register VM: `docs/VM_ARCHITECTURE.md`, `docs/OPCODE_REFERENCE.md`, `docs/CRYPTO_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/CONVENTIONS.md`.
- Stack VM: `docs/VM_SLIDE_ARCHITECTURE.md` (written in 39.3), `docs/VM_SLIDE_OPCODES.md` (written in 39.3).
- High-level project memory: `CLAUDE.md` ("Key VM Internals" table) and `project-brief.md` (~36 opcodes claim — **stale**, actual is 53).

**Why this doc exists**: the two VM families share a name ("ChaosVM") but have different architectures. A reader landing on the project needs a one-stop guide for "which variant is where, why they differ, what they share". Without it, readers have to diff two separate architecture docs by hand, and the shared cryptography and toolchain touchpoints get lost.

**Director-verified key differences** (from Phases 1-37 + Phase 39 findings):

| Dimension | Register VM (`tdc.js` family) | Stack VM (`vm-slide`) |
|---|---|---|
| Execution model | Register file (r0-r20+), in-register computation | Operand stack (`n = [[this],[{}]]`), stack-based computation |
| Dispatch | `switch`-style (95-100 cases per template) inside a loop | Dispatch table `Q[m[g++]]()` with 69 slots, 53 non-null handlers |
| Opcode count | Template A: 95, Template B: 94, Template C: 100 | 53 non-null (+ 16 null holes in the dispatch table) |
| Bytecode format | `Y[]` int array, ~7K elements | `m[]` number array, 24,273 elements |
| Operand width | Fixed per opcode (encoded in handler) | Mostly fixed; **one variable-width opcode (58 FUNC_CREATE)** with width `3 + 2·A + C` |
| PC register | `C` (canonical `pc`) | `g` (canonical `pc`) |
| Exception handling | `F[]` catch-addr stack | `C = []` catch stack + `K = null` exception slot |
| Return protocol | Single return via register | `.shift()[0]` FIFO from operand stack (the `.g` helper) |
| Closures / first-class functions | Opcodes manipulate `E` (closure vars) | Opcode 58 `FUNC_CREATE` instantiates a nested `__TENCENT_CHAOS_VM(...)` call with captured locals + arg-mapping array; nested VM runs in the same bytecode stream at a different entry PC |
| Constant pool | Per-template tables in `U[]` | `U = window` (property access as constant lookup) |
| Crypto | Modified XTEA: delta `0x9E3779B9`, 32 rounds, per-template STATE_A keys | XTEA delta `0x9E3779B9` **appears twice in the bytecode** — suggests the stack VM also runs XTEA on some payload (likely eks). Full picture unresolved (Phase 40 task 40.6). |
| Toolchain status | Fully decompiled, byte-identical token generator, automated porting pipeline | First-pass decoder + disassembler + opcode classifications; ~2% linear disassembly coverage; Phase 40 task 40.1 will upgrade to full coverage |
| Observed in | `targets/tdc.js` (and 4 other `tdc-v*.js` variants) | `sample/vm_slide.js` (single sample) |
| Carrier script | Served directly as the `tdc.js` script | Embedded inside `sample/t_captcha_slide.js` (the CAPTCHA orchestrator — separate research track, `research/captcha-orchestrator/`) |

**Shared touchpoints**:
1. **Identical XTEA delta** (`0x9E3779B9`) — strong signal of shared crypto lineage.
2. **Both VMs are minified IIFEs** with obfuscated variable names — identified by structural role, not name.
3. **Both are Tencent ChaosVM family** — same security team, likely shared ancestry, possibly shared code-generator backend.

**Do NOT**:
- Repeat content from `docs/VM_ARCHITECTURE.md` or `docs/VM_SLIDE_ARCHITECTURE.md` verbatim. Cross-reference them instead.
- Claim any cross-variant finding that isn't already in the existing per-variant docs. This is a synthesis doc, not a place for new analysis. Every table cell must be backed by something already written in a referenced doc.
- Write out full opcode tables. Link to `docs/OPCODE_REFERENCE.md` and `docs/VM_SLIDE_OPCODES.md` instead.
- Forward-reference Phase 40 results that haven't happened yet. Use "Phase 40 task N.M will resolve..." phrasing where relevant but do NOT speculate on outcomes.

### Implementation Steps

1. Read `docs/VM_ARCHITECTURE.md`, `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/OPCODE_REFERENCE.md`, `docs/CRYPTO_ANALYSIS.md`, `docs/CONVENTIONS.md`. Note what each doc authoritatively owns.
2. Also read `CLAUDE.md` "Key VM Internals" table so your register VM column matches the existing project memory.
3. Write `docs/CHAOSVM_VARIANTS.md`. Required structure:
   - **Overview** — one paragraph. What the ChaosVM family is, that two variants are currently known, that both ship from Tencent's CAPTCHA stack, and that this doc is the entry point for understanding the family before diving into variant-specific docs.
   - **The two variants at a glance** — a very short table (2-3 columns, ~10 rows) summarizing the most distinctive differences (execution model, dispatch, bytecode size, status). This is the reader's "which variant am I looking at" quick-reference.
   - **Detailed comparison table** — the big side-by-side table from the Context section above. Include every row. Use concise cell content; cite doc file paths in the cell or in a footnote.
   - **What they share** — bulleted subsection covering shared touchpoints (XTEA delta, IIFE obfuscation pattern, same-vendor ancestry). Each bullet cites the specific source doc.
   - **When you'll encounter each variant** — short subsection explaining where each VM appears in Tencent's CAPTCHA flow. Register VM is `tdc.js` (served directly by the CDN); stack VM is inside `t_captcha_slide.js` (the slide-CAPTCHA orchestrator). Cross-reference `research/captcha-orchestrator/`.
   - **Open cross-variant questions** — bulleted list, each with a Phase 40 task ID or "open — no task yet":
     - Does vm-slide run XTEA on eks or another payload? → Phase 40 task 40.6
     - Are the two VMs compiled from a shared source (same code generator with different output modes)? → open
     - Is vm-slide's `0.5` bytecode operand (non-integer) a quirk of one build or a feature? → open — no task yet
     - Anything else the doc naturally surfaces.
   - **Document map** — final section, bulleted list of every variant-specific doc with a one-line description. Acts as a jumping-off point.
4. **Do NOT modify any other file**. No edits to the variant-specific docs, no updates to `CLAUDE.md`, no edits to `project-brief.md` (that's task 39.5).
5. Run `npm test` as a sanity check. Must be 312/312. The `template-cache: lookup` flake is now deterministic in full-suite runs during this session and clears only on ~1 in 4 attempts. Re-run up to 3 times; if it still fails, report but proceed — the flake is tracked as Phase 40 task 40.4.

### Verification — report all of these

1. `ls docs/CHAOSVM_VARIANTS.md` — exists.
2. `wc -l docs/CHAOSVM_VARIANTS.md` — roughly 100-250 lines.
3. `grep -c '^## ' docs/CHAOSVM_VARIANTS.md` — at least 6 top-level sections.
4. `grep -n 'VM_ARCHITECTURE.md\|VM_SLIDE_ARCHITECTURE.md\|OPCODE_REFERENCE.md\|VM_SLIDE_OPCODES.md\|CRYPTO_ANALYSIS.md' docs/CHAOSVM_VARIANTS.md` — cross-references present to every major variant doc.
5. `grep -n 'Phase 40\|40\.[0-9]' docs/CHAOSVM_VARIANTS.md` — open-question section forward-references Phase 40 tasks where applicable.
6. `grep -n '0x9E3779B9\|2654435769\|XTEA' docs/CHAOSVM_VARIANTS.md` — crypto shared-touchpoint is documented.
7. `grep -n 'FUNC_CREATE\|58\|variable.*width\|3 + 2' docs/CHAOSVM_VARIANTS.md` — the nested-VM/closure difference between the two variants is documented (one of the most interesting structural findings).
8. `npm test` — 312/312. Note flake hits.
9. Quote the **"The two variants at a glance"** table verbatim.
10. List every "open cross-variant question" with its Phase 40 task ID or "open — no task".

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **No code, no tests, no module edits.** Documentation only.
- **Do not modify `docs/VM_ARCHITECTURE.md`, `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/OPCODE_REFERENCE.md`, `CLAUDE.md`, or `project-brief.md`.** This task creates one new file only.
- **Do not modify `sample/**`, `targets/**`, `.claude/rules/**`, `history/**`, `docs/WORKFLOW.md`.**
- **Do not claim new findings.** This is a synthesis doc; every cell in the comparison table must cite an existing authoritative doc or a committed fixture.
- **Do not speculate on Phase 40 outcomes.** Use "will resolve" / "will investigate" phrasing, not "is expected to show".
- If the task is too difficult or impossible (e.g. the existing docs disagree with each other and you can't resolve), stop and report.

### Suggested Agent
`general-purpose` — reading + synthesis + judgment-driven technical writing. Same shape as 39.3.
