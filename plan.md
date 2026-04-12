# Plan

## Status
Current phase: Phase 40 — Phase-39 follow-ups
Current task: 40.6 — Cross-track investigation: XTEA in vm-slide bytecode

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
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (17+ sightings in Phases 38-40) | done |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | done |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | in-progress |

---







## Current Task

**ID**: 40.6
**Title**: Cross-track investigation — does vm-slide run XTEA on eks or another payload?
**Phase**: Phase 40 — Phase-39 follow-ups
**Status**: in-progress

### Goal
The vm-slide bytecode contains the XTEA delta `0x9E3779B9` (decimal 2654435769) exactly **twice**. This is the same constant used by the register-machine `tdc.js` VM's modified-XTEA key schedule (32 rounds, per-template `STATE_A` keys — `docs/CRYPTO_ANALYSIS.md`). The presence of this constant in the stack VM's bytecode is a strong signal that vm-slide also runs XTEA-family crypto — but on what payload, using what key, and to what end, is unknown.

This task is an **investigation**, not an implementation. The goal is to produce a concrete, evidence-backed answer to one question: **is vm-slide running an XTEA round function, and if so, on what?** The output is a committed analysis script under `research/vm-slide-stack-vm/` and an update to either `docs/VM_SLIDE_ARCHITECTURE.md`'s "Unresolved findings" section or a dedicated new section, depending on what's found.

**Classify the outcome as one of four levels** and report accordingly:

1. **Confirmed XTEA**: structural pattern in the walker output matches a 32-round XTEA key schedule (e.g. a loop body that reads two 32-bit values, adds the delta, XORs with a key, shifts, etc.). Also identify the input payload if possible.
2. **Confirmed non-XTEA**: the two `0x9E3779B9` occurrences are just numeric literals embedded in the program (e.g. a hash seed, a magic number used for validation, a constant in a RNG). Show that the handler code around their operand positions is NOT a cipher round.
3. **Likely but not confirmed**: pattern-matching suggests XTEA-family crypto in the neighborhood of the delta occurrences, but you can't pin down the input or the output without runtime tracing. Document the evidence and the remaining unknowns.
4. **Inconclusive**: the bytecode is too obscured or too far from the delta occurrences to say either way. Report what you tried.

### Context

**What's already committed** (Phase 39 + 40.1/40.2 artifacts):
- `output/vm-slide/bytecode.json` — 24,273-element number array. You can grep this to find the two `2654435769` occurrences.
- `output/vm-slide/disassembly-full.txt` — 14,486-line control-flow-aware disassembly (from 40.1). Use this to see **in what instruction context** each `2654435769` appears. The walker output includes every reachable instruction with its opcode and operands, so a grep for `2654435769` should return 0 to 2 hits depending on whether the constant appears as an operand (yes — it will) vs as a constant-pool index indirected through `U[...]` (no — won't show in operands, will be harder to find).
- `output/vm-slide/dispatch-table.json` — 69 slots, 53 non-null handlers. Opcode semantic classifications from 39.3 are in `docs/VM_SLIDE_OPCODES.md` (53 rows, no `?NAME` — every handler cleanly classified).
- `docs/VM_SLIDE_ARCHITECTURE.md` — architecture doc with dispatch loop, register roles, operand stack semantics. "Unresolved findings" section already flags this XTEA finding.
- `docs/CRYPTO_ANALYSIS.md` — authoritative reference for the register VM's modified XTEA schedule. Read this to understand the shape of a "ChaosVM XTEA round" so you know what to look for in vm-slide.

**Structural notes from 40.1's walker output** that will help:
- Disassembly lines look like `<pc padded 5> OP_<op 2> operand1 operand2 ...`. The walker labels opcodes as `OP_NN` placeholders, not by their 39.3-classified names (e.g. `LOAD_LOCAL` / `METHOD_CALL` / `FUNC_CREATE`). Use `docs/VM_SLIDE_OPCODES.md` to translate OP_NN back to a name when reading the disassembly.
- 101 function entries were discovered via FUNC_CREATE's `K` operand. Each function is a subprogram in the same bytecode at a different entry PC. One of those functions may be the XTEA round.
- Both `0x9E3779B9` occurrences should appear as operands of handlers that push numeric literals (likely `OP_08` or similar — check `docs/VM_SLIDE_OPCODES.md` for the "push immediate" opcode). Their PCs will tell you which function they belong to.

**Reference for "what XTEA looks like structurally"** (from `docs/CRYPTO_ANALYSIS.md`, verify by reading the file):
- XTEA operates on a 64-bit block as two 32-bit halves `v0` / `v1`.
- 32 rounds. Each round adds `delta` to `sum`, then computes `v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3])` and symmetrically for `v1`.
- Per-round operations: shift-left-4, shift-right-5, XOR, add, key-lookup-by-(sum & 3).
- **The register VM uses a MODIFIED XTEA**: the key schedule is derived from per-template `STATE_A` values via a key-modification step that XORs in per-template `keyModConstants`. The modified round constants are in `tools/scraper/cache/templates.json` under `keyModConstants`.

When you look at vm-slide's neighborhood of the `0x9E3779B9` operands, **look for**: push of two large values (v0, v1), a loop (opcode 60 JUMP_IF_TRUE pointing backward, or nested FUNC_CREATE entry that gets called 32 times), 32-bit shift operations, XORs, and a mod-4 array index.

### Investigation steps

1. **Find the two `0x9E3779B9` occurrences in `output/vm-slide/bytecode.json`** by index. Grep or use `jq '[.[] | select(. == 2654435769)] | length'` and also a loop to find their exact indices.
2. **For each index, find which PC it belongs to** in `output/vm-slide/disassembly-full.txt`. Since bytecode element index = PC, you can grep for the line starting with that 5-digit PC. The match may land on an instruction's OPERAND, not its opcode slot — so check a few lines around it.
3. **Identify the containing function entry** for each occurrence. Given the 101 function entries, find the smallest entry PC ≤ the PC of the occurrence and the next entry PC > it. That's the function the constant lives in. Report the entry PC.
4. **Read the disassembly of that function** — the basic blocks starting at the entry PC, following jumps/branches until you reach a terminator or VM_EXIT. Translate OP_NN to semantic names using `docs/VM_SLIDE_OPCODES.md`.
5. **Check for XTEA round structure**: does the function have a loop (evidence: a backward JUMP target landing inside the function), 32 as an iteration count (evidence: a `PUSH_IMM 32` somewhere near the loop entry), shifts (opcodes you need to identify from `docs/VM_SLIDE_OPCODES.md` — look for BINARY_SHL or similar), XORs (BINARY_XOR equivalent), and the delta operand?
6. **If the function is small enough to read end-to-end**, paste the full disassembly (with OP_NN → name annotations) and step through it describing the stack state after each instruction. Confirm or refute XTEA structure.
7. **If two different functions contain one delta each**, inspect both. They may be v0-update and v1-update phases of the same cipher, or two unrelated uses.
8. **Write a short analysis script** `research/vm-slide-stack-vm/xtea-hunt.js` that:
   - Reads `output/vm-slide/bytecode.json` and `output/vm-slide/dispatch-table.json`.
   - Locates the `2654435769` occurrences.
   - Maps each to its containing function entry and prints the relevant PC range + the disassembly of that function.
   - Serves as a reproducible record of your investigation.
9. **Update `docs/VM_SLIDE_ARCHITECTURE.md`** — specifically the "Unresolved findings" section — with your outcome (1/2/3/4). **Do NOT**:
   - Claim confirmed crypto without explicit evidence from the disassembly.
   - Rewrite the whole architecture doc — only update the XTEA finding.
   - Touch `docs/CRYPTO_ANALYSIS.md` (that doc is register-VM authoritative; if you find XTEA in vm-slide, you propose a new subsection or a new doc but do not modify the existing content in this task).

### Outcomes and deliverables

**If Outcome 1 (confirmed XTEA)**:
- `research/vm-slide-stack-vm/xtea-hunt.js` exists and reproduces the finding.
- `docs/VM_SLIDE_ARCHITECTURE.md` "Unresolved findings" section updated — the XTEA bullet either resolves or moves to a new "Resolved findings" subsection.
- Report: the function's entry PC, the PC range, the disassembly with name annotations, step-by-step stack-state analysis, and a one-sentence answer to "what is the input payload?" if you can identify it.

**If Outcome 2 (confirmed non-XTEA)**:
- Same script + doc update, but stating that the constant is not cipher-related with evidence.
- Report: what the constant IS (e.g. a hash seed, a magic number, a `%` operand, a benign constant pushed and never used in shifts/XORs).

**If Outcome 3 (likely but not confirmed)**:
- Same script + doc update marked as "partial evidence".
- Report: what the evidence is, what the remaining unknowns are, and what it would take (e.g. dynamic tracing, nested-VM entry analysis) to confirm.

**If Outcome 4 (inconclusive)**:
- Write the script as far as you got, document the dead end honestly.
- Report: what you tried, what you ruled out, and what the next diagnostic step would be.

### Verification — report all of these

1. `ls research/vm-slide-stack-vm/xtea-hunt.js` — exists.
2. `node research/vm-slide-stack-vm/xtea-hunt.js` — runs without error. Paste its stdout.
3. The two PCs where `2654435769` appears in the bytecode — report the exact indices.
4. The function entry PC(s) that contain the occurrences.
5. Outcome classification (1/2/3/4) with evidence.
6. If Outcome 1: the decoded function's disassembly slice with opcode names + step-by-step stack analysis.
7. If Outcome 2/3/4: the evidence for your classification, with direct quotes from the disassembly.
8. `docs/VM_SLIDE_ARCHITECTURE.md` diff — the "Unresolved findings" update (or whatever section you updated). Must be narrow and surgical, not a rewrite.
9. `npm test` — must stay 350/350. Your changes should only touch `research/vm-slide-stack-vm/xtea-hunt.js` (new) and `docs/VM_SLIDE_ARCHITECTURE.md` (narrow edit). No test changes.
10. Any surprises along the way (handlers you didn't understand, bytecode patterns that look important, function entries that look significant).

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **Do not modify `sample/vm_slide.js`, `targets/**`, `.claude/rules/**`, `history/**`, `docs/WORKFLOW.md`, `project-brief.md`, `CLAUDE.md`.**
- **Do not modify `docs/CRYPTO_ANALYSIS.md`** — it's the register-VM authoritative crypto doc; do not merge findings there in this task. If you confirm XTEA in vm-slide, propose a new section or doc in your report; do not write it.
- **Do not modify any test file.** `npm test` stays 350/350.
- **Do not modify the walker or decoder** (`research/vm-slide-stack-vm/walker.js`, `decoder.js`, `disassembler.js`). Those are pinned by 40.2 and 39.2 tests. This task's code is read-only against them.
- **Do not claim crypto without evidence.** An XTEA schedule has a very specific structural shape (shifts, XORs, key-mod-4 lookup, 32 rounds, sum += delta per round). If you can't point to the shifts and XORs in the disassembly, it's not confirmed XTEA.
- **Do not speculate about nested VM invocations** unless you can trace through FUNC_CREATE's K operand into the nested function entry and show the disassembly there.
- **Do not install any new npm package.** Plain Node + fs + the committed JSON fixtures are sufficient.
- **Do not modify any other file in `research/vm-slide-stack-vm/`** — your only new file is `xtea-hunt.js`.
- If the task is too difficult, stop and report Outcome 4 rather than producing low-quality or speculative analysis.

### Suggested Agent
`general-purpose` — investigation-heavy, no specialized tools needed beyond reading JSON fixtures and matching disassembly patterns against the XTEA shape.
