# Plan

## Status
Current phase: Phase 42 — vData runtime binding reversal (follow-up from Phase 41 open question)
Current task: 42.3 — Director-owned docs bookkeeping (vData mechanism resolved on Chrome via XHR proxy)

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
| 42.2 | Cross-reference against FLOW.md §6 + HAR + crypto provenance scan — confirm the function signature matches `window.getVData(n.join("&"))` and characterise where the 152-char HAR value's crypto comes from | done — mechanism resolved: vm-slide installs an XHR proxy on Chrome (not `window.getVData`), crypto is modified-XTEA + custom 64-char base64, window-installs=1 (only getVData on IE9 fallback) |
| 42.3 | Docs bookkeeping — update `docs/CAPTCHA_ORCHESTRATOR.md` §6/§8, `research/captcha-orchestrator/README.md` status, `FLOW.md` §9 Q1 post-script with the resolved mechanism. Also correct 42.1's VDATA-TRACE.md framing that the install is "unconditional" (it isn't — it's IE9-gated). Promote the three Phase 39/40 vm-slide docs from CLAUDE.md "new docs planned" list into the main doc table. | in-progress |

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

**ID**: 42.3
**Title**: Director-owned docs bookkeeping — propagate vData mechanism resolution to public docs + CLAUDE.md
**Phase**: Phase 42 — vData runtime binding reversal
**Status**: in-progress


### Summary of what 42.1 + 42.2 established

The vData runtime binding is **mechanism-resolved** on Chrome (non-IE):

- **On Chrome 146**: vm-slide calls `proxyXHR(ctx)` which monkey-patches `XMLHttpRequest.prototype.send/open` globally. The patched send intercepts the verify POST and injects `vData=<ciphertext>` into the body. The orchestrator's `if (isLowIE())` branch **never executes** and `window.getVData` is **never installed** on Chrome at all.
- **On IE9 and below**: vm-slide installs `window.getVData` at pc=20066 via the classical `[window, "getVData"] + FUNC_CREATE + OP_24` sequence. The orchestrator's `if (isLowIE())` branch calls it explicitly.
- **Branch gate**: `OP_60 19666` at pc 19636 — `if (obj.isIE9Below()) { install getVData }` else `{ obj.proxyXHR(p[3]) }` then `OP_06 20070` to skip install.
- **Crypto**: modified-XTEA (delta `0x9E3779B9` as `OP_08` immediate at bytecode indices 15352 and 15530, matching encrypt+decrypt) + custom 64-char base64 alphabet at pc 16932 (`GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`, contains `-_*`) + char-set-validation regex `[^A-Za-z0-9\-\_\*]` at pc 17677.
- **HAR value verification**: the full 152-char HAR `vData` value `7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4lsXbEguCZ7eZtjCMfbg9*wbiQoH_4-hrxaM7THpUbbQuqIfPi5vl549PdPPu64P-GnmSuAKqlxUcL9yFjBMA5RsJRiYY` — every character is a member of the custom alphabet, zero outliers. Conclusive.
- **Window-installs enumeration**: vm-slide installs exactly **1** `window.*` property — `window.getVData`. No second crypto helper. `output/vm-slide/window-installs.json` has one entry.

42.1 retroactive correction: 42.1's VDATA-TRACE.md §3-§4 characterised the install as "unconditional". That prose was wrong — 42.2 traced one level up and found the IE-gate. 42.1's physical opcode identification (OP_24 at 20066) was correct; only the "unconditional" word in the narrative needs fixing.

The "extract the exact XTEA key and build a byte-identical vData generator" work is a legitimate follow-up but **out of Phase 42 scope**. FLOW.md §9 Q1 and CAPTCHA_ORCHESTRATOR.md §8 asked "where does vData come from"; we now know.

### Checklist — files to edit (director-owned)

1. **`docs/CAPTCHA_ORCHESTRATOR.md`**:
   - §2 End-to-end flow — add a step describing the vm-slide-side `proxyXHR` install on Chrome (between the vm-slide load step and the verify POST step).
   - §5.2 origination table `vData` row — replace "ORIGIN UNRESOLVED STATICALLY" with the resolved mechanism (XHR proxy injection), short provenance sentence, `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` citation.
   - §6 critical fields — replace the `vData` subsection with the resolved mechanism narrative: Chrome path (XHR proxy) + IE9 path (direct install), gate at pc 19636, crypto ingredients at bytecode[15352/15530] + pc 16932 + pc 17677.
   - §8 known limitations — remove `vData` from the open-questions list; replace with a narrower follow-up bullet ("full decompile of the XHR proxy body + XTEA key extraction for byte-identical vData generation").
2. **`research/captcha-orchestrator/FLOW.md`**:
   - §9 Q1 — append a resolution post-script citing VDATA-TRACE.md and VDATA-RESOLUTION.md, correcting the jQuery-ajax-hook hypothesis (wrong mechanism; right location: vm-slide) and stating the actual mechanism (XHR proxy on Chrome, direct install on IE9).
3. **`research/captcha-orchestrator/README.md`**:
   - Status bump from `partial — flow traced end-to-end, public doc shipped, one open question remaining (vData runtime binding)` to `closed — full flow documented; vData mechanism resolved in Phase 42; follow-up for byte-identical vData generator available but out of scope`.
   - Remove the `vData` entry from the "Open questions" section (or re-scope it to the narrow follow-up).
4. **`research/vm-slide-stack-vm/VDATA-TRACE.md`**:
   - Add a short "**Correction from 42.2**" post-script at the end noting that the install is IE9-gated (not unconditional), with a pointer to VDATA-RESOLUTION.md §3 candidate (b) / §4 verdict.
5. **`research/vm-slide-stack-vm/README.md`**:
   - Update to reference the new VDATA-TRACE.md, VDATA-RESOLUTION.md, vdata-trace.js, vdata-provenance.js, window-installs.json artifacts.
6. **`CLAUDE.md`**:
   - Promote `docs/CHAOSVM_VARIANTS.md`, `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md` from the "new docs planned for the research phase" list into the main doc table (latent Phase 39/40 bookkeeping gap, was noted in the Phase 42 plan).

### Verification
- `npm test` — must stay 353/353.
- `git diff --stat` — should show the six paths above plus plan.md + history.
- No new research scripts or output artifacts.

### Constraints
- **Director-owned**, no subagent dispatch (per the "director writes docs updates itself" rule).
- **Do not edit** the 42.1/42.2 research artifacts (`vdata-trace.js`, `vdata-anchors.json`, `vdata-provenance.js`, `window-installs.json`, `VDATA-RESOLUTION.md`) — only add the correction post-script to `VDATA-TRACE.md`.
- **Do not promote the captcha-orchestrator track to `closed` if there's any structural doubt.** vData is resolved in mechanism but not in byte-level reproducibility; "closed with a follow-up flagged" is the correct framing.

### Prior: 41.6 (completed)
Wrote `docs/CAPTCHA_ORCHESTRATOR.md` — 607 lines, 9 sections, full 39-row origination table split into upstream passthroughs (24) vs orchestrator-computed (15). `vData` honestly framed as unresolved in §5.2, §6, and §8. Module 8 not-the-vm-slide-loader finding prominent in §2. §9 reconciliation records "no contradictions" with `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md`, `docs/ERRORCODE_12_INVESTIGATION.md`. Director added the new doc to CLAUDE.md's main doc table.

### Prior: 41.5 (completed — user confirmed option (a))
Full static end-to-end flow trace via `research/captcha-orchestrator/FLOW.md` (612 lines) + `trace-flow.js` → 39-field `verify-body-origination.json` + `slide-jy-diff.js` → library classification. Both 41.4 candidate hypotheses overturned (module 8 only fetches `/slide-jy.js`; module 76 is Zepto, `slide-jy.js` is jQuery 1.11.3 — different libraries). Module 41 parked as i18n caption table. 38/39 verify-body fields traced cleanly; `vData` is the single unresolved static question.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
