# Plan

## Status
Current phase: Phase 42 — vData runtime binding reversal (follow-up from Phase 41 open question)
Current task: 42.2 — Cross-reference vm-slide vData finding against FLOW.md §6 + HAR + crypto provenance

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
| 42.1 | vm-slide vData static trace — locate every `OP_04 OP_10* OP_13` anchor for `"getVData"` / `"vData="` / `"&vData="`, walk surrounding basic blocks, identify property-write vs property-read, extract the installed function body, produce a reproducible script + analysis note | done |
| 42.2 | Cross-reference against FLOW.md §6 + HAR + crypto provenance scan — confirm the function signature matches `window.getVData(n.join("&"))` and characterise where the 152-char HAR value's crypto comes from (candidates: upstream register, second helper installed via separate OP_58+OP_24, or external page-loaded routine). Verdict: fully resolved → 42.3 auto-continues; partially resolved → plan revision + user pause | in-progress |
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

**ID**: 42.2
**Title**: Cross-reference 42.1's vData trace against FLOW.md §6 + HAR + crypto provenance scan
**Phase**: Phase 42 — vData runtime binding reversal
**Status**: in-progress

### Goal
Cross-reference 42.1's vm-slide vData static trace against (a) the orchestrator call site documented in `research/captcha-orchestrator/FLOW.md` §6, (b) the HAR verify-body value, and (c) the provenance of the crypto payload that produces the 152-char HAR `vData` value. 42.1 established that `window.getVData` is installed at `OP_24` pc=20066 with the function body at `[19702, 20058]` (one string arg, branches on `document.documentMode`), but its function body does NOT appear to contain the XTEA/base64 crypto — no nested `OP_58`, no crypto-looking `OP_13` resolves. So the 152-char HAR value must come from elsewhere. This task's job is to find out where.

Deliverable verdict:
- **Fully resolved** → the crypto source is unambiguously identified, 42.3 auto-continues into docs bookkeeping.
- **Partially resolved** → a specific, scoped gap remains; director revises the plan to add a targeted follow-up task (jsdom harness, second static trace, or whatever the gap demands) and pauses for user review.

### Context — what 42.1 already produced

Read these first:
- `research/vm-slide-stack-vm/VDATA-TRACE.md` — the authoritative 42.1 analysis. 294 lines. Read sections §3 (write identification), §4 (function body), §5 (provisional semantics), §6 (handoff) carefully.
- `output/vm-slide/vdata-anchors.json` — machine-readable anchor inventory (3 entries: `getVData` write at pc=19681, `vData=` read at pc=19969 inside the function body, `&vData=` read at pc=24210 in a debug-mode branch).
- `research/vm-slide-stack-vm/vdata-trace.js` — the reproducible tracer. Idempotent.
- `research/captcha-orchestrator/FLOW.md` §6 — the orchestrator-side call site. Specifically: `o = window.getVData && window.getVData(n.join("&"))`, then `o && (e.vData = o)`. The `n` array is built from the collector fields earlier in module 56.
- `output/captcha-orchestrator/verify-body-origination.json` — the `vData` row with `sample_value_prefix` (first ~60 chars) and `sample_value_length` (152).
- `sample/captcha-har.har` — search for the literal `vData=` string in the verify POST body to get the full 152-char value for length/shape analysis.
- `output/vm-slide/bytecode.json`, `output/vm-slide/disassembly-full.txt`, `output/vm-slide/dispatch-table.json` — the vm-slide primary artifacts.
- `research/vm-slide-stack-vm/README.md` and the three Phase 40 docs (`docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/CHAOSVM_VARIANTS.md`) — background on the vm-slide stack VM's runtime model.

### Key claim from 42.1 to verify

Anchors and classification:
| Anchor | pc | Classification | Role |
|--------|------|---------------|------|
| `getVData` | 19681 | **write** | installs `window.getVData` via `OP_24` at pc=20066 |
| `vData=` | 19969 | **read** | RegExp pattern INSIDE the function body (recursion guard) |
| `&vData=` | 24210 | **read** | `window.DEBUGMODE` branch dead code elsewhere in the bytecode |

Function body: `[19702, 20058]`, 216 instructions, FUNC_CREATE operands `K=19702 A=1 C=1 ...`. Branches on `document.documentMode` twice. Uses `new RegExp("vData=")` to check whether the input already contains `vData=`. Splits on `"&"` and `"="`. Resolved external identifiers inside the body: `Object` (pc=19845), `RegExp` (pc=19955). **No crypto in the body.**

### Required investigation (in order)

**Step 1 — Trivial cross-check against FLOW.md §6**. Confirm that:
- Function arg count (1) matches the orchestrator's single-arg call `window.getVData(n.join("&"))`.
- The `n` array built in module 56 before the call contains URL-encoded key=value pairs joined by `&`, matching the function's internal split on `"&"` and `"="`. Read the relevant module-56 excerpt from FLOW.md §4.2 or §6 to confirm.
- The `e.vData = o` assignment in the orchestrator stores the function's return value into the verify-body slot. Confirm that `o` is the return value (not a side effect).

One short paragraph answer, cite FLOW.md line ranges.

**Step 2 — HAR value shape analysis**. Extract the full 152-char `vData` value from `sample/captcha-har.har`. Analyze:
- Character set (URL-safe base64? hex? a query string? a concatenation of both?).
- Structure (any obvious delimiters? any pre-baked substrings like `&vData=`? — hint: almost certainly NOT because anchor 3 is debug-mode dead code).
- Does the value look like XTEA ciphertext encoded in some way? The register-VM `collect` token uses modified XTEA + base64 (see `docs/TOKEN_FORMAT.md` and `docs/CRYPTO_ANALYSIS.md`) so there's prior art for what Tencent-crypto output looks like in this project.

Report: "the 152-char value appears to be <character-set>, structure <structure>, most likely <encoding>."

**Step 3 — Crypto provenance hunt (the substantive work)**. This is where the static trace gets interesting. 42.1 surfaced three candidates for where the crypto happens. Investigate each:

**Candidate (a)**: **upstream register lifted into the function**. The FUNC_CREATE at pc=20059 has `A=1` upvalue (the `1 1 8 3 3` tail), which 42.1 interpreted as `p[1] = n[8]` — one captured value from slot 8 at function-create time. Trace back through the bytecode from pc=20059 to find what `n[8]` contains at that point. Is it a pre-computed crypto result? Look for other bytecode regions earlier than pc=20059 that write to slot 8 and use crypto opcodes. You may need to add a helper pass to `vdata-trace.js` or write a second small script to scan for writes-to-slot-8.

**Candidate (b)**: **second helper installed via separate `OP_58 + OP_24`**. Scan the entire bytecode for all `OP_58 + <something> + OP_24` patterns where the preceding descriptor is `[window, "<key>"]`. Enumerate the keys — look for any that could be crypto helpers. Candidates to flag: anything like `getEks`, `_xtea`, `_crypto`, `sign`, or that looks opaque. **Also check whether `window.getVData` is the *only* `window.*` property vm-slide installs** — this is valuable project-wide information regardless of vData.

**Candidate (c)**: **external page-loaded routine**. Check whether the vm-slide function body resolves any identifiers via `OP_13` that we don't recognize — particularly any that look like they could be imported globals from `tdc.js` (e.g. `TDC`, `TDC_...`). 42.1 found only `Object` and `RegExp` inside the function body, so candidate (c) is probably weak — but confirm by re-reading 42.1's table.

Produce a small helper script if needed — `research/vm-slide-stack-vm/vdata-provenance.js` — that scans for all `window.*` property writes in the bytecode. Emit `output/vm-slide/window-installs.json` with `{key, install_pc, body_start_pc, body_end_pc, body_size}`.

**Step 4 — Reach a verdict**. One of:

- **Fully resolved**: you've identified the crypto source (which candidate? with evidence). The 152-char HAR value can be explained from the static trace. No further work needed; 42.3 can proceed.
- **Partially resolved (static limit)**: the crypto lives inside another vm-slide function you CAN identify, but full decompilation of it would be a multi-hour task. Document the function's pc range and handoff-state for a future follow-up.
- **Partially resolved (dynamic needed)**: the crypto depends on runtime state (e.g. a register written at load-time that we can't statically reconstruct). Recommend a small jsdom harness as a follow-up task. Provide a 2-3 bullet sketch of what the harness would need to do.
- **Blocked**: something about the bytecode shape prevents the scan. Report what broke.

### Deliverables (exactly these files)

1. `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` — the analysis note. Max 250 lines. Sections:
   - **§1 FLOW.md cross-reference** (step 1 above — short paragraph).
   - **§2 HAR value shape** (step 2 above — short paragraph with the full 152-char value quoted).
   - **§3 Crypto provenance hunt** (step 3 above — one subsection per candidate, with evidence and a verdict for each).
   - **§4 Resolution verdict** (step 4 above — state fully/partially/blocked with the specific sub-category).
   - **§5 Recommended action for 42.3** — if fully resolved, what the docs bookkeeping needs to say. If partially resolved, what follow-up task the director should plan next. If blocked, what alternative approach to try.
2. `research/vm-slide-stack-vm/vdata-provenance.js` — if you wrote a window-install scanner for step 3 candidate (b). Only create if needed.
3. `output/vm-slide/window-installs.json` — output of the scanner if created. Idempotent.

### Explicit non-goals
- **Do NOT edit `docs/CAPTCHA_ORCHESTRATOR.md`**, `research/captcha-orchestrator/FLOW.md`, or any other Phase 41 artifact. 42.3 handles all docs edits.
- **Do NOT modify Phase 40 vm-slide tooling** (`decoder.js`, `disassembler.js`, `walker.js`).
- **Do NOT modify 42.1's artifacts** (`vdata-trace.js`, `VDATA-TRACE.md`, `vdata-anchors.json`). They're the author's deliverable; you're the verifier.
- **Do NOT write a jsdom harness in this task.** If the verdict is "dynamic needed," recommend it — don't build it.
- **Do NOT try to fully decompile any function body.** Characterize enough to reach a verdict; escalate if more is needed.
- **Do NOT add npm dependencies.**
- **No emojis.**

### Allowed file set (exhaustive)

Create (required):
- `research/vm-slide-stack-vm/VDATA-RESOLUTION.md`

Create (conditional on step 3 candidate (b) needing a scanner):
- `research/vm-slide-stack-vm/vdata-provenance.js`
- `output/vm-slide/window-installs.json`

Nothing else. Do not edit any existing file.

### Verification — report all of these
1. `ls -la research/vm-slide-stack-vm/VDATA-RESOLUTION.md` — file present.
2. `wc -l research/vm-slide-stack-vm/VDATA-RESOLUTION.md` — should be ≤250.
3. If you wrote `vdata-provenance.js`: show it's idempotent (md5 before/after second run).
4. If you wrote `window-installs.json`: show a few entries (`head -30` or equivalent).
5. Full 152-char HAR `vData` value quoted verbatim in §2.
6. `npm test` — 353/353.
7. **Verdict summary in the report**: state the verdict category (fully / partially / blocked) and the one-line justification.

### Constraints
- **Do not make any git commits.** The director handles all commits after verification.
- **Only touch the files in the allowed set.**
- **No new npm dependencies.**
- **CommonJS + 2-space + single-quote + semicolon.**
- **Different agent from 42.1** per the author/verifier separation — you're the second set of eyes on the vData question.
- **If the task is too difficult or impossible to complete** — e.g. the bytecode has too many `OP_58 + OP_24` patterns to enumerate sensibly, the crypto provenance can't be determined without runtime execution, or 42.1's analysis has a flaw you can't work around — stop immediately and report back cleanly. Explain what you attempted, which step broke, and what a different approach might look like. Do not leave partial files in the tree.

### Suggested Agent
`general-purpose` — static analysis + cross-reference. Different from 42.1's agent.
### Prior: 41.6 (completed)
Wrote `docs/CAPTCHA_ORCHESTRATOR.md` — 607 lines, 9 sections, full 39-row origination table split into upstream passthroughs (24) vs orchestrator-computed (15). `vData` honestly framed as unresolved in §5.2, §6, and §8. Module 8 not-the-vm-slide-loader finding prominent in §2. §9 reconciliation records "no contradictions" with `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md`, `docs/ERRORCODE_12_INVESTIGATION.md`. Director added the new doc to CLAUDE.md's main doc table.

### Prior: 41.5 (completed — user confirmed option (a))
Full static end-to-end flow trace via `research/captcha-orchestrator/FLOW.md` (612 lines) + `trace-flow.js` → 39-field `verify-body-origination.json` + `slide-jy-diff.js` → library classification. Both 41.4 candidate hypotheses overturned (module 8 only fetches `/slide-jy.js`; module 76 is Zepto, `slide-jy.js` is jQuery 1.11.3 — different libraries). Module 41 parked as i18n caption table. 38/39 verify-body fields traced cleanly; `vData` is the single unresolved static question.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
