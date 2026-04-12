# Plan

## Status
Current phase: Phase 41 COMPLETE — captcha-orchestrator track substantively closed (one open question: vData runtime binding)
Current task: none — Phase 41 done, awaiting next user direction

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

**none — Phase 41 complete.**

Phase 41 closed:
- 41.1/41.2: `TemplateCache.seed()` config.target type guard + tests (both deferred 40.4 cleanups closed).
- 41.3: stale `tests/test-auto-port.js:358` describe-block text synced to post-restructure path.
- 41.4: webpack structural survey of `sample/t_captcha_slide.js` (50 live modules, entry 64, 91 edges, no dynamic requires).
- 41.5: end-to-end flow trace across modules 8/56/76 + 39-field verify-body origination. Overturned two 41.4 hypotheses (module 8 is NOT the vm-slide loader — vm-slide.enc.js is hardcoded `<script>` in show-page HTML; module 76 is Zepto while `sample/slide-jy.js` is jQuery 1.11.3, different libraries). Module 41 parked as the i18n caption table. `vData` is the single unresolved static question — hypothesis: `vm-slide.e201876f.enc.js` installs a runtime binding.
- 41.6: shipped `docs/CAPTCHA_ORCHESTRATOR.md` (607 lines, 9 sections, full 39-row origination table, honest `vData` framing). Promoted into CLAUDE.md doc table.
- 41.7: `research/captcha-orchestrator/README.md` reflects the substantively-closed state with the single `vData` open question.

Tests: 350 → 353 (41.2 added three) → 353 throughout the rest. Stayed green every step.

**Captcha-orchestrator track status**: `partial — flow traced end-to-end, public doc shipped, one open question remaining (vData runtime binding)`. Not `closed` — the `vData` runtime-binding question is well-scoped and delegable to a dedicated follow-up task whenever the user wants to pursue it.

**Open research tracks the user may want to tackle next** (per `project-brief.md` priority backlog):
- **vData runtime binding** — follow-up from Phase 41. Three proposed approaches: jsdom harness for `vm-slide.e201876f.enc.js`, stack-VM bytecode decode via `research/vm-slide-stack-vm/` tooling, Puppeteer property-write breakpoints.
- **eks payload structural reversal** — `research/eks-payload/` still `open`. Phase 41 confirmed `eks` is transport-only for the vm-slide flow (just passes `TDC.getInfo().info` through), but its internal structure is still unknown.
- **Template pool survey** — `research/template-pool/` still `open`. Classify many live `tdc.js` builds and measure Tencent's template rotation.
- **Key-modification constants** — `research/key-mod/` still `open`. Cross-template diff of XTEA key-mod constants between Templates A, B, C (register-VM only; Phase 40 confirmed this does NOT apply to vm-slide).
- **Collector field count** — is 59 template-specific or constant?
- **errorCode 12** — confirm whether verify-endpoint 12 is fingerprint/behavioral scoring. Phase 41 found module 56 treats it as soft-retryable via a cover error, consistent with existing `docs/ERRORCODE_12_INVESTIGATION.md` but still not fully characterized.

No task in progress. Awaiting next user direction.

---

### Prior: 41.6 (completed)
Wrote `docs/CAPTCHA_ORCHESTRATOR.md` — 607 lines, 9 sections, full 39-row origination table split into upstream passthroughs (24) vs orchestrator-computed (15). `vData` honestly framed as unresolved in §5.2, §6, and §8. Module 8 not-the-vm-slide-loader finding prominent in §2. §9 reconciliation records "no contradictions" with `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md`, `docs/ERRORCODE_12_INVESTIGATION.md`. Director added the new doc to CLAUDE.md's main doc table.

### Prior: 41.5 (completed — user confirmed option (a))
Full static end-to-end flow trace via `research/captcha-orchestrator/FLOW.md` (612 lines) + `trace-flow.js` → 39-field `verify-body-origination.json` + `slide-jy-diff.js` → library classification. Both 41.4 candidate hypotheses overturned (module 8 only fetches `/slide-jy.js`; module 76 is Zepto, `slide-jy.js` is jQuery 1.11.3 — different libraries). Module 41 parked as i18n caption table. 38/39 verify-body fields traced cleanly; `vData` is the single unresolved static question.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
