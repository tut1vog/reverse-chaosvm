# Plan

## Status
Current phase: Phase 39 — vm-slide stack VM
Current task: 39.3 — Write docs/VM_SLIDE_ARCHITECTURE.md + docs/VM_SLIDE_OPCODES.md (first-pass, source-inspection only)

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
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from source inspection (first-pass, admits ~2% coverage) | in-progress |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | pending |
| 39.5 | Update `project-brief.md` with corrected vm-slide facts (53 opcodes, 24K bytecode, XTEA finding) + refresh `research/vm-slide-stack-vm/README.md` status to `partial` | pending |

### Phase 40: Phase-39 follow-ups + session cleanup (planned, not yet started)
> Addresses the deferred issues surfaced during Phase 38-39 and upgrades the vm-slide disassembler to full coverage. Each task is independent; they can be dispatched in any order the user prefers.

| ID | Task | Status |
|----|------|--------|
| 40.1 | Upgrade vm-slide disassembler with control-flow-aware walker (static CFG, adapt approach from `research/tdc-register-vm/cfg-builder.js`) | pending |
| 40.2 | Tests for control-flow walker | pending |
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly from 40.1; promote track status from `partial` to `closed` | pending |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake (7+ sightings in Phases 38-39) | pending |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` — either add it back to `package.json` `scripts.test` (and fix any breakage) or delete it intentionally | pending |
| 40.6 | Cross-track investigation: does vm-slide run an XTEA round function on eks data? (XTEA delta `0x9E3779B9` appears twice in the vm-slide bytecode — flagged by 39.1. Connects to `eks-payload` and `key-mod` tracks.) | pending |

---

## Current Task

**ID**: 39.3
**Title**: Write docs/VM_SLIDE_ARCHITECTURE.md + docs/VM_SLIDE_OPCODES.md (first-pass, source-inspection only)
**Phase**: Phase 39 — vm-slide stack VM
**Status**: in-progress

### Goal
Produce two reference documents under `docs/` that capture the current verified understanding of the vm-slide stack VM:
1. **`docs/VM_SLIDE_ARCHITECTURE.md`** — the VM's dispatch loop, register roles, operand stack, exception handling, and differences from the register-based `tdc.js` VM.
2. **`docs/VM_SLIDE_OPCODES.md`** — a table of all 53 non-null opcodes classified from direct handler source inspection, plus the 16 dispatch holes documented explicitly.

Both docs are **first-pass only**. The user has chosen option (3) from the mid-track strategy call: accept the linear disassembler's ~2% bytecode coverage as sufficient for documentation, file a Phase 40 task for the control-flow walker upgrade, and close Track 1 on the docs alone. Every claim in both docs must be traceable to a specific handler source string, a specific disassembly line, or a specific fixture fact from `output/vm-slide/*.json`.

**Do not attempt to infer semantics from execution.** Every opcode classification comes from reading the handler source text directly. Where the semantics are genuinely ambiguous (e.g. the 6-operand handler), the doc must say "unclear from source; resolve in Phase 40" rather than guess.

### Context

**Input artifacts** (all already committed):
- `sample/vm_slide.js` — 43,688-byte single-line source (read-only, Tencent's property).
- `research/vm-slide-stack-vm/decoder.js` and `disassembler.js` — 39.1's implementation.
- `output/vm-slide/dispatch-table.json` — 69 slots, 53 non-null handlers. Each non-null entry has `{ opcode, operandCount, source }`.
- `output/vm-slide/bytecode.json` — 24,273-element number array.
- `output/vm-slide/disassembly.txt` — 313 lines (312 instructions + halt marker at pc=512).
- `research/vm-slide-stack-vm/README.md` — placeholder scaffold from 38.2.

**Reference docs for register-based VM** (the other ChaosVM family):
- `docs/VM_ARCHITECTURE.md` — existing authoritative reference for the register-machine `tdc.js` VM. Read this first; your vm-slide architecture doc should mirror its shape (same section order, same depth) so readers can diff the two.
- `docs/OPCODE_REFERENCE.md` — the register VM's opcode table. Your vm-slide opcodes doc should mirror its column structure.
- `docs/CONVENTIONS.md` — project-wide doc style rules. Read this before writing.

**Director-verified facts to seed the architecture doc** (from 39.1 inspection of `sample/vm_slide.js` prefix):

```js
var __TENCENT_CHAOS_STACK = function(){
  function __TENCENT_CHAOS_VM(g, m, U, n, E, F, Y, c){
    var A = !n;
    g = +g, m = m || [0], n = n || [[this],[{}]], E = E || {};
    var w, C = [], K = null;
    function p(){ return function(A,C,K){return new(Function.bind.apply(A,C))}.apply(null, arguments) }
    Function.prototype.bind || (w = [].slice, Function.prototype.bind = function(A){...});
    var Q = [func, func, func, ..., , func, ...]; // 69 slots, 53 non-null
    // ... dispatch loop ...
  }
  return __TENCENT_CHAOS_VM(0, [<inline bytecode>], window);
}();
__TENCENT_CHAOS_STACK.g = function(){ return __TENCENT_CHAOS_STACK.shift()[0] };
```

**Register naming convention** (structural role, not variable name — the name will differ in other stack-VM builds):
| Symbol in this build | Canonical name | Role |
|---|---|---|
| `g` | `pc` | Program counter; `m[g++]` reads next byte |
| `m` | `bytecode` | Linear number array, passed as 2nd arg |
| `U` | `constPool` | Constant pool, passed as 3rd arg — `window` in this invocation |
| `n` | `opStack` | Operand stack, initialized to `[[this],[{}]]` |
| `E` | `env` | Environment / closure scope |
| `C` | `catchStack` | Exception-handler stack (analog of register-VM `F[]`) |
| `K` | `exception` | Exception slot |

**Key findings from 39.1 that must appear in the architecture doc**:

1. **Dispatch table shape**: 69 slots, 53 non-null handlers, 16 dispatch holes (`null` slots). Holes are **not guaranteed unreachable** — the disassembler halted at pc=512 on opcode 65, which is a hole, so the VM genuinely never emits that opcode... for the 2% of code we've decoded so far. Full-coverage analysis in Phase 40 may reveal more holes are reachable.

2. **Operand count distribution**: the 53 non-null handlers read `{0, 1, 2, 6}` operands from the bytecode via `m[g++]` (static count). The `6` is **unexpected** — a single handler reads six consecutive bytecode bytes. The doc must explicitly call out which opcode this is and note that the semantics are unresolved (candidates: composite constructor call, wide-operand jump, structured exception region). Defer resolution to Phase 40.

3. **Bytecode length**: 24,273 numeric elements. Compare to `targets/tdc.js` Y[] bytecode which is ~7K for the register VM. vm-slide is ~3.5× larger despite being a narrower-purpose VM — suggests significant embedded data or duplicated code paths.

4. **Bytecode contains XTEA delta `0x9E3779B9`** twice (decimal 2654435769). This matches the XTEA delta used by the register-machine `tdc.js` VM across all known templates (Templates A, B, C — see `CLAUDE.md` Project Memory). **Strong evidence that vm-slide runs an XTEA round function on some payload** — possibly `eks`, possibly a session key, possibly something else. The architecture doc must mention this as an unresolved cross-track finding, link to `docs/CRYPTO_ANALYSIS.md` (which owns XTEA details for the register VM), and flag it for Phase 40 task 40.6.

5. **One bytecode element is `0.5`** — the VM handles non-integer bytecode operands. Unusual. Worth a sentence in the architecture doc.

6. **Return pattern**: `__TENCENT_CHAOS_STACK.g = function(){ return __TENCENT_CHAOS_STACK.shift()[0] }` — the VM returns an array-like (probably `n`, the operand stack) to the outer scope, and the outer scope reads results by `.shift()`-ing. This is different from the register VM, which returns a single value via `return regs[...]`. Document the difference.

7. **Linear disassembly coverage is ~2% (312 instructions, pc range [0, 513))**. The doc must be explicit about this. Every opcode-level claim must be caveated as "observed in the first 512 bytes" or "inferred from handler source".

**The 53 handlers to classify for the opcodes doc**: read each non-null entry in `dispatch-table.json` and classify by reading its `source` field. The first three are concrete examples:

| Opcode | Source | Operand count | Likely effect |
|---|---|---|---|
| 0 | `function(){n.push(n[m[g++]][0])}` | 1 | LOAD_LOCAL — reads operand as index into opStack, pushes `opStack[idx][0]` |
| 1 | `function(){var A,C=[];for(A in n.pop())C.push(A);n.push(C)}` | 0 | ENUM_KEYS — pops object, pushes array of its enumerable keys |
| 2 | `function(){var A=m[g++],C=A?n.slice(-A):[];n.length-=A;A=n.pop();n.push(A[0][A[1]].apply(A[0],C))}` | 1 | METHOD_CALL — operand is argcount; pops N args, pops method-ref `[this, methodName]`, calls it |

Use **descriptive names** (`LOAD_LOCAL`, `METHOD_CALL`, etc.) inferred from handler semantics, not the `OP_NN` placeholders from the disassembler. This is the **one place** in Phase 39 where semantic classification happens. Where the name is uncertain, prefix it with `?` (e.g. `?CONSTRUCT_6`) and say so in the effect column.

**Handlers with gaps or odd source**: some dispatch-table entries will have minimal source (e.g. just `function(){}` — no-op). Some will have unusual shapes. Classify each honestly; a one-line source is a valid handler.

### Implementation Steps

1. **Read the existing docs** to match project style:
   - `docs/VM_ARCHITECTURE.md` — mirror its section layout for the new architecture doc.
   - `docs/OPCODE_REFERENCE.md` — mirror its column structure for the new opcodes doc.
   - `docs/CONVENTIONS.md` — project-wide style.
   - `.claude/rules/verify-dont-assume.md` and `.claude/rules/research-artifacts.md`.

2. **Read all 53 handler source strings** from `output/vm-slide/dispatch-table.json`. For each one, classify it by reading the JavaScript body:
   - Identify the stack effect (pops/pushes).
   - Identify any memory/object access patterns.
   - Identify whether it reads constants (`U[...]`), closure (`E[...]`), or operands (`m[g++]`).
   - Identify whether it mutates the PC (`g = ...`) or catch stack (`C.push/pop`).
   - Give it a descriptive name.
   - Note the operand count (pre-populated in the JSON).

3. **Read the first 50 entries of `output/vm-slide/bytecode.json`** and the full `disassembly.txt` (313 lines). Cross-reference a few handlers against concrete disassembly lines to validate your semantic interpretations. For example, `00000 OP_40 3` means opcode 40 was emitted with operand 3 — look at handler 40's source and confirm that reading operand 3 makes sense in context.

4. **Write `docs/VM_SLIDE_ARCHITECTURE.md`**. Required sections (match `docs/VM_ARCHITECTURE.md` structure where possible):
   - **Overview** — one-paragraph summary, explicit "first-pass, ~2% disassembly coverage" caveat up front.
   - **File layout** — the outer IIFE wrapping `__TENCENT_CHAOS_VM`, the return pattern with `.g` helper, the inline bytecode literal, where the source lives (`sample/vm_slide.js`).
   - **Register file** — table of the seven register roles (`g`/`m`/`U`/`n`/`E`/`C`/`K`), naming the canonical role, the variable name in this build, and the purpose. Note that variable names differ per build.
   - **Operand stack semantics** — initialization (`[[this],[{}]]`), how handlers push/pop, what the two initial entries likely mean.
   - **Dispatch loop** — describe the main loop that reads `m[g++]` and calls `Q[op]()`. You'll need to locate the loop in `sample/vm_slide.js` body (it follows the `Q = [...]` declaration). Quote the loop source as a fenced code block.
   - **Exception handling** — the `C = []` catch stack and `K = null` exception slot. Which handlers manipulate them? Quote sources.
   - **Constant pool** — `U` is `window` in this invocation. What does `U[...]` access look like in handlers? (Grep the handler sources for `U[`.)
   - **Return protocol** — the `.g` helper and `.shift()[0]` pattern, and how the VM communicates results to the outer scope.
   - **Bytecode format** — linear number array, PC-indexed, operands in-stream (not separate), non-integer operands allowed (cite the `0.5` finding).
   - **Observed coverage and limitations** — a dedicated section stating: "The current linear disassembler decodes 312 instructions from pc=0 to pc=512 before halting on a legitimate dispatch-table hole (opcode 65 at pc=512). This is ~2% of the 24,273-byte bytecode. The remaining 98% is either reachable only via control-flow paths the linear walker does not follow (jumps / exception unwinding / embedded data regions), or legitimately unreachable. Full-coverage analysis is deferred to Phase 40 task 40.1 (control-flow-aware disassembler upgrade)." Name the exact Phase 40 task ID.
   - **Unresolved findings** — bulleted list including (a) the 6-operand handler mystery, (b) the XTEA delta `0x9E3779B9` appearing twice in the bytecode (link to `docs/CRYPTO_ANALYSIS.md` and flag for Phase 40 task 40.6), (c) the 16 dispatch holes that may or may not be reachable, (d) anything else you spot during handler classification.
   - **Differences from the register-based `tdc.js` VM** — short subsection. The full side-by-side comparison lives in the future `docs/CHAOSVM_VARIANTS.md` (task 39.4), but include a forward pointer. Highlight the key architectural differences: stack-vs-register, dispatch-table-vs-switch, return-via-shift-vs-register.

5. **Write `docs/VM_SLIDE_OPCODES.md`**. Required structure:
   - **Header** — one-paragraph explanation that this is the opcode table for the `__TENCENT_CHAOS_STACK` stack VM, classified from handler source inspection at Phase 39 first-pass level.
   - **Coverage caveat** — reiterate the ~2% disassembly-coverage limitation. Note that the opcode definitions themselves come from static source reading and therefore cover all 53 non-null handlers regardless of bytecode coverage — the limitation is in the number of handler invocations actually observed in the disassembly, not in the handler source analysis.
   - **Table** — 53 rows, one per non-null opcode. Columns: `Opcode` (decimal), `Name` (your descriptive classification), `Operands` (count), `Stack before → after` (what the operand stack looks like), `Effect` (one-line description). Use `?NAME` for uncertain classifications. Sort by opcode number ascending.
   - **Dispatch holes** — a subsection listing all 16 null slot indices with a note like "slot N: null — no handler (holes in the source array literal)".
   - **Unresolved entries** — for every opcode you classified as `?NAME`, a detailed subsection explaining what is ambiguous and what Phase 40 task will resolve it.
   - **Cross-references** — at minimum a link to `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/OPCODE_REFERENCE.md` (the register VM's equivalent), and `research/vm-slide-stack-vm/` for the raw artifacts.

6. **Do NOT write `docs/CHAOSVM_VARIANTS.md`** — that is task 39.4. Do NOT rewrite `research/vm-slide-stack-vm/README.md` — the scaffold from 38.2 is fine for now; 39.5 will update it.

7. **Do NOT modify any `.js` file**. No edits to decoder, disassembler, tests, or anything under `tools/`. No new code in any form.

8. **Run `npm test`** as a sanity check (must stay 312/312). If the `template-cache: lookup` flake hits (7+ sightings), re-run once and note it.

### Verification — report all of these

1. `ls docs/VM_SLIDE_ARCHITECTURE.md docs/VM_SLIDE_OPCODES.md` — both files exist.
2. `wc -l docs/VM_SLIDE_ARCHITECTURE.md docs/VM_SLIDE_OPCODES.md` — both have substantive content (roughly ≥100 lines each, though padding is not the goal).
3. `grep -c '^## ' docs/VM_SLIDE_ARCHITECTURE.md` — at least 10 sections matching the required structure.
4. `grep -n 'first-pass\|~2%\|coverage\|Phase 40' docs/VM_SLIDE_ARCHITECTURE.md` — coverage caveat present. Paste the matches.
5. `grep -n 'XTEA\|0x9E3779B9\|2654435769' docs/VM_SLIDE_ARCHITECTURE.md` — XTEA finding present. Paste the matches.
6. `grep -c '^|' docs/VM_SLIDE_OPCODES.md` — at least 55 table rows (header + divider + 53 data rows).
7. `grep -c 'null' docs/VM_SLIDE_OPCODES.md` — dispatch-hole section present with 16 hole entries.
8. `npm test` — 312/312.
9. Quote the **Opcode 0 row** from `docs/VM_SLIDE_OPCODES.md` verbatim so the director can sanity-check the classification quality.
10. Quote the **Coverage and Limitations** section from `docs/VM_SLIDE_ARCHITECTURE.md` verbatim.
11. List every opcode you classified as `?NAME` (uncertain) and for each one, summarize in one sentence what is ambiguous.
12. Any surprises encountered during handler classification — e.g. handlers that do something unexpected, opcodes that turned out to have semantic operand counts different from the static `m[g++]` count, handlers that reference `U`/`E` in non-obvious ways.

### Constraints

- **Do not make any git commits.** The director handles all commits.
- **No code. No tests. No module edits.** This task is docs-only.
- **Do not modify `sample/vm_slide.js`, `targets/**`, `sample/**`, `.claude/rules/**`, `history/**`, `docs/WORKFLOW.md`, `project-brief.md`, or any `.js` file under `research/`, `tools/`, or `tests/`.**
- **Do not guess semantics from context alone.** Every opcode classification must be grounded in its handler source text. Where the source is genuinely ambiguous, say so with `?NAME` and defer to Phase 40.
- **Do not infer behavior from what you think a stack VM "should" do.** Read the actual handler source.
- **Do not write `docs/CHAOSVM_VARIANTS.md`** — that is 39.4's scope.
- **Do not promise or forward-reference opcode names that have not been classified yet.** If you can't classify a handler, it stays `?NAME` in this task.
- **Do not rewrite `project-brief.md`**, even though 39.1's findings make it stale (53 opcodes vs claimed ~36). That is 39.5's scope.
- The coverage caveat must appear **in both docs**, in a prominent position (top of file or dedicated section), and must name Phase 40 task 40.1 as the remediation.
- If the task is too difficult or impossible to complete (e.g. handler source is more obscured than the director believes), stop immediately and report back.

### Suggested Agent
`general-purpose` — extensive reading + judgment-driven technical writing. Could also use the `scribe` persona implicitly via the doc-writing framing, but general-purpose is sufficient.
