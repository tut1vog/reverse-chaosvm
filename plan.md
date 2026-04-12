# Plan

## Status
Current phase: Phase 42 — vData runtime binding reversal (follow-up from Phase 41 open question)
Current task: 42.1 — vm-slide vData static trace

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

### Phase 42: vData runtime binding reversal
> Resolve Phase 41's single unresolved question: where does the `vData` verify-body field come from? Orient spike already confirmed (a) the string `getVData` is present exactly once as an `OP_04 OP_10* OP_13` run in `output/vm-slide/bytecode.json`, (b) `vData=` and `&vData=` are also present as pre-baked URL-fragment constants, (c) zero `ajaxPrefilter`/`ajaxTransport`/`ajaxSettings`/`beforeSend` strings appear anywhere in vm-slide — so the FLOW.md §9 Q1 hypothesis is wrong in mechanism (no jQuery ajax hook) but right in location (vm-slide installs `window.getVData` directly). Phase 40 already shipped the full-coverage disassembler + dispatch table, so this is a focused static-analysis task.

| ID | Task | Status |
|----|------|--------|
| 42.1 | vm-slide vData static trace — locate every `OP_04 OP_10* OP_13` anchor for `"getVData"` / `"vData="` / `"&vData="`, walk surrounding basic blocks, identify property-write vs property-read, extract the installed function body, produce a reproducible script + analysis note | in-progress |
| 42.2 | Cross-reference against FLOW.md §6 + HAR — confirm the function signature matches `window.getVData(n.join("&"))` and the output shape is consistent with the 152-char HAR value. Verdict: fully resolved → 42.3 auto-continues; partially resolved → plan revision + user pause | pending |
| 42.3 | Docs bookkeeping — update `docs/CAPTCHA_ORCHESTRATOR.md` §6/§8, `research/captcha-orchestrator/README.md` status, `FLOW.md` §9 Q1 post-script. Also promote the three Phase 39/40 vm-slide docs (`CHAOSVM_VARIANTS.md`, `VM_SLIDE_ARCHITECTURE.md`, `VM_SLIDE_OPCODES.md`) from CLAUDE.md "new docs planned" list into the main doc table | pending |

### Phase 41: Minor cleanup + Captcha orchestrator (Stream B Track 2)
> Two tiny cleanups from 40.4's deferred findings, then Stream B Track 2 — analyze `sample/t_captcha_slide.js` (213 KB webpack bundle) to document the end-to-end CAPTCHA flow. Track 2's DoD from `project-brief.md`: `docs/CAPTCHA_ORCHESTRATOR.md` with show-page load → vm-slide fetch → vData compute → verify POST → ticket, identifying every origination point for `collect`, `eks`, `vData`, `nonce`, `sess`, `sig`. The file is a standard webpack bundle with a module array, which makes static analysis via acorn tractable (same approach as `tools/porting-pipeline/vm-parser.js`).

| ID | Task | Status |
|----|------|--------|
| 41.1 | Add `config.target` type guard to `TemplateCache.seed()` (impl only — 1-line defensive check noted as a secondary finding in 40.4) | done |
| 41.2 | Tests for the type guard | done |
| 41.3 | Clean up stale describe-block text at `tests/test-auto-port.js:358` (says "pipeline/run.js" but the assertion underneath uses the post-restructure path) | done |
| 41.4 | Captcha orchestrator survey — acorn-parse `sample/t_captcha_slide.js`, enumerate webpack modules, map the module graph, identify which modules touch vm-slide loading / verify POST / vData construction. Source-only, no deep analysis yet. | done |
| 41.5 | Captcha orchestrator deep analysis — trace the show-page → vm-slide fetch → vData compute → verify POST flow across the relevant modules identified by 41.4. Cross-reference `sample/captcha-har.har` network trace. Confirm `sample/slide-jy.js` is vanilla jQuery. | done |
| 41.6 | Write `docs/CAPTCHA_ORCHESTRATOR.md` from 41.4/41.5 findings. Required sections per DoD: show-page load, vm-slide fetch, vData compute, verify POST assembly, ticket return, plus an origination table for `collect`/`eks`/`vData`/`nonce`/`sess`/`sig`. | done |
| 41.7 | Update `research/captcha-orchestrator/README.md` — promote status `open → partial` (or `closed` if 41.5 reached full understanding) and populate How-to-reproduce + Notes from the committed artifacts. | done |

---










## Current Task

**ID**: 42.1
**Title**: vm-slide vData static trace — locate anchors, identify property-write, extract function body
**Phase**: Phase 42 — vData runtime binding reversal
**Status**: in-progress

### Goal
Resolve Phase 41's single unresolved question by statically tracing the `vData` binding inside vm-slide's bytecode. Identify where the three vData-related string constants are used, determine whether each anchor is a property READ or a property WRITE, locate the installed `window.getVData` function body, and characterize its signature (inputs consumed from stack, output emitted). Produce enough structured evidence that 42.2 can cross-reference against FLOW.md §6 and the HAR verify-body value without re-deriving anything.

### Context — orient findings the director already confirmed

Director's 5-minute spike before Phase 42 was planned reconstructed all 703 strings from `output/vm-slide/bytecode.json` via the `OP_04` (push `""`) + `(OP_10 <charCode>)*` (append) + `OP_13` (resolve) pattern. Results:

- `getVData` — **1 hit** (exactly one occurrence in the bytecode).
- `vData=` — **1 hit** (URL-encoded query fragment, pre-baked as a constant).
- `&vData=` — **1 hit** (URL-encoded query fragment with leading `&`, pre-baked).
- `ajaxPrefilter` / `ajaxTransport` / `ajaxSettings` / `beforeSend` / `dataFilter` / `prefilter` / `transport` — **0 hits each**. Zero strings containing `jax` anywhere.

So the FLOW.md §9 Q1 "jQuery ajax hook" hypothesis is wrong in its mechanism but right in its location — vm-slide installs `window.getVData` directly, and the pre-baked `vData=` / `&vData=` URL fragments suggest the function itself builds the form `...&vData=<computed>...` or returns `vData=<computed>`.

### Opcode semantics (from `output/vm-slide/dispatch-table.json`)

Pre-fetched by director — these are the opcodes you'll need to identify the string-build and resolve pattern:

- `OP_04` (0 operands): `n.push("")` — start a new string on TOS.
- `OP_10 <c>` (1 operand): `n[top] += String.fromCharCode(m[g++])` — append one char.
- `OP_13` (0 operands): `n[top] = U[n[top]]` — resolve the built string as a key into `U[]`. Given the finding that `getVData` is a global, `U` is almost certainly the global scope (`window`) or an equivalent lookup table. **This is the critical opcode** — OP_13 right after an `OP_04 OP_10* ...` run is "convert this string into a live binding."
- `OP_39` (0 operands): `n.push(n[top])` — dup TOS.
- `OP_47 <n>` (1 operand): `n.push([m[g++]])` — push a 1-element array of a numeric literal.
- `OP_55 <n>` (1 operand): pop `n` args from stack, invoke `n.pop()` as callee — method call with `n` args.
- `OP_59` (0 operands): `var A = n.pop(); n.push([n[n.pop()][0], A])` — builds a `[receiver, key]` pair for property access.

The full dispatch table has opcodes 0..~60; the subagent can look up any others it encounters at `output/vm-slide/dispatch-table.json`.

### Related inputs (read-only)

- `output/vm-slide/bytecode.json` — the flat bytecode integer array (the primary input).
- `output/vm-slide/disassembly-full.txt` — 216 KB full-coverage disassembly with pc offsets.
- `output/vm-slide/dispatch-table.json` — opcode table.
- `research/vm-slide-stack-vm/decoder.js`, `disassembler.js`, `walker.js` — the Phase 40 tooling. Reuse the existing walker if it helps; otherwise hand-walk.
- `research/vm-slide-stack-vm/README.md` — Phase 40 context. Status `closed`.
- `research/captcha-orchestrator/FLOW.md` §4, §6, §9 — where the orchestrator-side call `window.getVData(n.join("&"))` is documented.
- `sample/captcha-har.har` — HAR verify-body value for cross-reference: `vData=7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4…` (152 chars total).

### Deliverables (exactly these files)

1. **`research/vm-slide-stack-vm/vdata-trace.js`** — CommonJS script that:
   - Loads `output/vm-slide/bytecode.json`.
   - Walks the bytecode and identifies every `OP_04 (OP_10 <chr>)* OP_13` run. Record the pc of the `OP_04`, the pc of the terminating `OP_13`, the decoded string value, and the byte length of the run.
   - Filters to the three vData-related strings: `getVData`, `vData=`, `&vData=`.
   - For each matching anchor, walks **backward and forward** from the `OP_13` to identify the enclosing basic block boundary. Use the Phase 40 walker's block-detection logic if reusable; otherwise hand-detect via branch/jump opcodes (consult `dispatch-table.json` for jump semantics — opcodes 6, 8, 16, 20 and similar typically encode conditional/unconditional jumps). Report the block's `[startPc, endPc]`.
   - For each anchor, dump the disassembled opcode sequence of the enclosing block (roughly 20-50 opcodes around the anchor is plenty — don't dump the whole function unless necessary).
   - Emits a machine-readable summary to `output/vm-slide/vdata-anchors.json` with shape roughly:
     ```json
     [
       {
         "string": "getVData",
         "build_pc": <int>,
         "resolve_pc": <int>,
         "enclosing_block": [<startPc>, <endPc>],
         "disasm_excerpt": "<20-50 line text dump>",
         "classification": "write" | "read" | "unknown",
         "classification_evidence": "<short sentence explaining how you decided>"
       },
       ...
     ]
     ```
   - Must be **idempotent** (running twice produces byte-identical output).
   - Runs as `node research/vm-slide-stack-vm/vdata-trace.js`. No CLI arguments.

2. **`output/vm-slide/vdata-anchors.json`** — the script's primary output. Schema as above.

3. **`research/vm-slide-stack-vm/VDATA-TRACE.md`** — short analysis note (~100-200 lines, hard cap 300). Required sections:
   - **§1 Method**: how the trace works (string reconstruction via OP_04/OP_10/OP_13, block walking, classification heuristic). 1-2 paragraphs.
   - **§2 Anchor inventory**: one subsection per anchor with its pc, classification, and a 10-20-line disassembly excerpt (verbatim from `vdata-anchors.json.disasm_excerpt`).
   - **§3 Property-write identification**: identify which anchor (likely the `getVData` one) is the property-write that installs `window.getVData`. Explain the evidence — e.g. "`OP_13` resolves `getVData` to a scope slot, the following opcode sequence pushes a function value built via `OP_6 <functionStartPc>` (or whatever vm-slide uses for function-create), and then `OP_XX` assigns TOS into the slot." Be specific and cite the dispatch-table.json opcodes you relied on.
   - **§4 Function body boundary**: identify the pc range of the installed function. vm-slide probably uses an `OP_6 <absolutePc>` or similar to create a closure that jumps to a known address. Report the function's `[startPc, endPc]` and the calling convention (how many args consumed from stack, what does it push as return value). Use `disassembly-full.txt` for line-range citations.
   - **§5 Function body semantics — provisional**: reading the disassembly, write a short narrative of what the function does. Specifically: does it consume a single string arg (matching `n.join("&")` from the orchestrator), does it emit strings containing `vData=`, does it reference any external functions via OP_13 (e.g. `window.TDC`, `btoa`, an XTEA routine)? Be honest about what's clear and what's guesswork — you don't need to fully decompile it, just characterize it enough for 42.2 to cross-check.
   - **§6 Handoff to 42.2**: one paragraph summarizing what 42.2 should verify against FLOW.md §6 and the HAR, plus any ambiguities worth flagging.

### Explicit non-goals

- **Do NOT write `docs/CAPTCHA_ORCHESTRATOR.md` edits.** That's 42.3 after 42.2 verifies.
- **Do NOT edit `research/captcha-orchestrator/FLOW.md` or the public doc.** Record findings in the new VDATA-TRACE.md under `research/vm-slide-stack-vm/`; the director will propagate to the captcha-orchestrator track during 42.3.
- **Do NOT fully decompile the vm-slide function body.** §5 is a characterization, not a decompilation. If decompiling would take multi-hour work, stop and report — that's a separate task, not 42.1.
- **Do NOT add npm dependencies.** Use only what's already in `package.json`.
- **Do NOT write tests.** Research scripts under `research/` follow Phase 41's precedent of idempotent-output + cross-check-in-next-task as the verification model.
- **Do NOT modify the existing Phase 40 tooling** (`decoder.js`, `disassembler.js`, `walker.js`) unless you find a bug. If you do find a bug, report it separately rather than patching it silently.
- **Do NOT guess.** If you can't classify an anchor as read/write, mark it `"unknown"` with honest evidence — §3 can still proceed if at least one anchor is unambiguously a write.
- **No emojis.**

### Allowed file set (exhaustive)

Create:
- `research/vm-slide-stack-vm/vdata-trace.js`
- `research/vm-slide-stack-vm/VDATA-TRACE.md`
- `output/vm-slide/vdata-anchors.json`

Nothing else. Do not edit any existing file under `research/`, `output/`, `docs/`, `tools/`, `tests/`, `sample/`, or `targets/`.

### Implementation Steps

1. Read `output/vm-slide/dispatch-table.json` end-to-end to understand the opcode set. Pay particular attention to: string-build (OP_04/OP_10/OP_13), dup/drop (OP_39, OP_05), property access (OP_59), method/function call (OP_55), any jump/branch opcodes, and any function-create opcode. Note the operand count of each.
2. Read `research/vm-slide-stack-vm/decoder.js`, `disassembler.js`, and particularly `walker.js` to understand how the existing tools walk the bytecode. Decide whether to reuse the walker or hand-walk.
3. Read `output/vm-slide/disassembly-full.txt` around any pcs you need to reference — it has pre-decoded opcode names and can save you from re-implementing the decoder.
4. Write `vdata-trace.js` incrementally: string-reconstruction → anchor filter → block boundary detection → classification → JSON emit. Run it repeatedly as you add stages.
5. For each anchor, inspect the surrounding disassembly manually to confirm the classification is right before trusting the automated verdict. Don't let the automation lie to you.
6. Write `VDATA-TRACE.md` — §1 Method, §2 Anchors, §3 Property-write, §4 Function body, §5 Semantics, §6 Handoff.
7. Run `vdata-trace.js` a second time; confirm `git status --short output/vm-slide/vdata-anchors.json` shows no diff (idempotence).
8. Run `npm test` — must stay at 353/353.

### Verification — report all of these

1. `ls -la research/vm-slide-stack-vm/vdata-trace.js research/vm-slide-stack-vm/VDATA-TRACE.md output/vm-slide/vdata-anchors.json` — all three files present, reasonable sizes.
2. `node research/vm-slide-stack-vm/vdata-trace.js` — first run, report total anchor count (should be exactly 3 if the orient finding is correct).
3. Idempotence — run a second time, show `git status --short output/vm-slide/vdata-anchors.json` is empty (or `md5sum` matches across runs).
4. `wc -l research/vm-slide-stack-vm/VDATA-TRACE.md` — report.
5. `jq '.[] | {string, classification}' output/vm-slide/vdata-anchors.json` — show the classification verdict per anchor.
6. `head -80 research/vm-slide-stack-vm/VDATA-TRACE.md` — first portion so the director can sanity-check tone and method.
7. `npm test` — 353/353.
8. **Key findings summary** — in the report, state: (a) which anchor is the property-write that installs `window.getVData`; (b) the function body's `[startPc, endPc]`; (c) the function's apparent calling convention (how many args, return type); (d) a one-sentence provisional semantics. This is the input 42.2 will verify against.

### Constraints

- **Do not make any git commits.** The director handles all commits after verification.
- **Only touch the three files in the allowed set.**
- **No new npm dependencies.**
- **CommonJS + 2-space + single-quote + semicolon** per `.claude/rules/coding-style.md`.
- **Honor all project rules**: `targets-readonly.md`, `verify-dont-assume.md`, `research-artifacts.md`, `output-versioning.md`, `coding-style.md`.
- **If the task is too difficult or impossible to complete** — e.g. the block walker can't resolve the basic block around an anchor, the function-create opcode is non-obvious, the function body is obfuscated beyond static characterization — stop immediately and report back cleanly. Explain what you attempted, which step broke, and what a different approach (jsdom harness? full decompile? different anchor?) might look like. Do not leave partial scripts or half-written markdown in the tree.

### Suggested Agent
`general-purpose` — static bytecode analysis. Needs familiarity with stack VMs and comfort walking a dispatch table. After it returns, 42.2 cross-checks with a different agent per the author/verifier separation.

---

### Prior: 41.6 (completed)
Wrote `docs/CAPTCHA_ORCHESTRATOR.md` — 607 lines, 9 sections, full 39-row origination table split into upstream passthroughs (24) vs orchestrator-computed (15). `vData` honestly framed as unresolved in §5.2, §6, and §8. Module 8 not-the-vm-slide-loader finding prominent in §2. §9 reconciliation records "no contradictions" with `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md`, `docs/ERRORCODE_12_INVESTIGATION.md`. Director added the new doc to CLAUDE.md's main doc table.

### Prior: 41.5 (completed — user confirmed option (a))
Full static end-to-end flow trace via `research/captcha-orchestrator/FLOW.md` (612 lines) + `trace-flow.js` → 39-field `verify-body-origination.json` + `slide-jy-diff.js` → library classification. Both 41.4 candidate hypotheses overturned (module 8 only fetches `/slide-jy.js`; module 76 is Zepto, `slide-jy.js` is jQuery 1.11.3 — different libraries). Module 41 parked as i18n caption table. 38/39 verify-body fields traced cleanly; `vData` is the single unresolved static question.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
