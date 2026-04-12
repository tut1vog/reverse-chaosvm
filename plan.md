# Plan

## Status
Current phase: Phase 42 COMPLETE — vData runtime binding resolved in mechanism (captcha-orchestrator track substantively closed)
Current task: none — Phase 42 done, awaiting next user direction

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
| 42.3 | Docs bookkeeping — update `docs/CAPTCHA_ORCHESTRATOR.md` §6/§8, `research/captcha-orchestrator/README.md` status, `FLOW.md` §9 Q1 post-script with the resolved mechanism. Also correct 42.1's VDATA-TRACE.md framing that the install is "unconditional" (it isn't — it's IE9-gated). Promote the three Phase 39/40 vm-slide docs from CLAUDE.md "new docs planned" list into the main doc table. | done |

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

**none — Phase 42 complete.**

Phase 42 closed in three tasks:
- **42.1** — vm-slide vData static trace. Wrote `research/vm-slide-stack-vm/vdata-trace.js` + `VDATA-TRACE.md` + `output/vm-slide/vdata-anchors.json`. Identified the `[window, "getVData"] + OP_58 + OP_24` property-write sequence at bytecode pcs 19681/20059/20066 with function body `[19702, 20058]`.
- **42.2** — cross-reference + crypto provenance scan. Wrote `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` + `vdata-provenance.js` + `output/vm-slide/window-installs.json`. Discovered the outer IE-gate at bytecode pc 19636 (`OP_60 19666` on `<state>.isIE9Below()`) that 42.1 had missed one block up. Enumerated all `[window, <key>] + FUNC_CREATE + OP_24` installs and found exactly **1** (`getVData`, only on IE9). Verified the crypto pipeline ingredients (XTEA delta `0x9E3779B9` at bytecode[15352]/[15530], custom 64-char base64 alphabet at pc 16932, char-set validation regex at pc 17677) and confirmed the full 152-char HAR `vData` value's character set is a strict subset of the alphabet.
- **42.3** — director-owned docs bookkeeping. Rewrote `docs/CAPTCHA_ORCHESTRATOR.md` §2 step 7 + §4 header table row + §5.2 origination row + §6 `vData` subsection + §8 open questions with the resolved mechanism. Added a 42.2 correction post-script to `research/vm-slide-stack-vm/VDATA-TRACE.md`. Appended a resolution post-script to `research/captcha-orchestrator/FLOW.md` §9 Q1. Bumped `research/captcha-orchestrator/README.md` status to "closed (mechanism)" with a narrower `vData` byte-identical follow-up flagged. Updated `research/vm-slide-stack-vm/README.md` with Phase 42 findings + new reproduction commands. Promoted the three Phase 39/40 vm-slide docs (`CHAOSVM_VARIANTS.md`, `VM_SLIDE_ARCHITECTURE.md`, `VM_SLIDE_OPCODES.md`) from the CLAUDE.md "new docs planned" list into the main doc table, and added a Phase 42 paragraph to CLAUDE.md's "Project Memory — Established Facts" section.

Tests stayed at 353/353 throughout. No code changes; Phase 42 was purely research + docs.

**The vData mechanism in one paragraph**: on Chrome, vm-slide takes a fall-through branch at bytecode pc 19636 that calls `<state>.proxyXHR(p[3])` at pc 19662. `proxyXHR` installs an `XMLHttpRequest.prototype.send`/`open` monkey-patch that intercepts the orchestrator's verify POST and injects `vData=<ciphertext>` into the outgoing body before `send()` completes. The ciphertext is built from modified XTEA (delta `0x9E3779B9`) followed by a custom 64-char base64 alphabet containing `-_*` as its non-alphanumeric members. On IE9 and below, the same gate instead installs `window.getVData` at pc 20066 and the orchestrator's `if (a.isLowIE())` branch calls it explicitly. The two paths are mutually exclusive and `window.getVData` is never installed on Chrome. The captcha-orchestrator research track is substantively closed; a narrower byte-identical-reproducibility follow-up is available but was not required by Track 2's DoD.

**Captcha-orchestrator track status**: closed (mechanism). Follow-up available for byte-identical `vData` generator (extract XTEA key + characterize plaintext + build standalone tool).

**Open research tracks the user may want to tackle next** (per `project-brief.md` priority backlog):
- **Byte-identical vData generator** — narrow follow-up to Phase 42. Decompile the vm-slide XHR proxy body (bytecode pcs ~15000..20700), extract the XTEA key schedule, build a standalone generator under `tools/`. Bounded and well-scoped.
- **eks payload structural reversal** — `research/eks-payload/` still `open`. `eks` confirmed transport-only in Phases 41 + 42 (orchestrator reads `TDC.getInfo().info`, never derives its own), but its internal structure is still unknown.
- **Template pool survey** — `research/template-pool/` still `open`. Classify many live `tdc.js` builds and measure Tencent's template rotation.
- **Key-modification constants** — `research/key-mod/` still `open`. Cross-template diff of XTEA key-mod constants between Templates A, B, C (register-VM only; Phase 40 confirmed this does NOT apply to vm-slide).
- **Collector field count** — is 59 template-specific or constant?
- **errorCode 12** — confirm whether verify-endpoint 12 is fingerprint/behavioral scoring. Phase 41 found module 56 treats it as soft-retryable via a cover error, consistent with existing `docs/ERRORCODE_12_INVESTIGATION.md` but still not fully characterized.

No task in progress. Awaiting next user direction.

### Prior: 41.6 (completed)
Wrote `docs/CAPTCHA_ORCHESTRATOR.md` — 607 lines, 9 sections, full 39-row origination table split into upstream passthroughs (24) vs orchestrator-computed (15). `vData` honestly framed as unresolved in §5.2, §6, and §8. Module 8 not-the-vm-slide-loader finding prominent in §2. §9 reconciliation records "no contradictions" with `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md`, `docs/ERRORCODE_12_INVESTIGATION.md`. Director added the new doc to CLAUDE.md's main doc table.

### Prior: 41.5 (completed — user confirmed option (a))
Full static end-to-end flow trace via `research/captcha-orchestrator/FLOW.md` (612 lines) + `trace-flow.js` → 39-field `verify-body-origination.json` + `slide-jy-diff.js` → library classification. Both 41.4 candidate hypotheses overturned (module 8 only fetches `/slide-jy.js`; module 76 is Zepto, `slide-jy.js` is jQuery 1.11.3 — different libraries). Module 41 parked as i18n caption table. 38/39 verify-body fields traced cleanly; `vData` is the single unresolved static question.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
