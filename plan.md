# Plan

## Status
Current phase: Phase 41 — minor cleanup + Captcha orchestrator (Stream B Track 2)
Current task: 41.7 — Update research/captcha-orchestrator/README.md (status bump after docs shipped)

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
| 41.7 | Update `research/captcha-orchestrator/README.md` — promote status `open → partial` (or `closed` if 41.5 reached full understanding) and populate How-to-reproduce + Notes from the committed artifacts. | in-progress |

---










## Current Task

**ID**: 41.7
**Title**: Update `research/captcha-orchestrator/README.md` — promote status after 41.6 ships the public doc
**Phase**: Phase 41 — Minor cleanup + Captcha orchestrator (Stream B Track 2)
**Status**: in-progress

### Goal
Final bookkeeping for Phase 41 Track 2: update `research/captcha-orchestrator/README.md` to reflect that `docs/CAPTCHA_ORCHESTRATOR.md` has shipped, status moves from `partial` to `partial (track substantively closed; one open question — vData runtime binding)` or similar honest framing. List all produced documents (FLOW.md, SURVEY.md, MODULE-41-NOTES.md, the public doc, the JSON artifacts). Add the single remaining open question (vData runtime binding) as a prominent "Open questions" bullet with pointers to the three follow-up options from FLOW.md §9 Q1. Do NOT promote to `closed` — `vData` is still unresolved.

### Context
The 41.5 deep analysis resolved 38/39 verify-body fields, parked module 41 (i18n caption table, not on critical path), correctly overturned the 41.4 hypotheses that module 8 was the vm-slide loader and that module 76 = slide-jy.js (they're Zepto vs jQuery 1.11.3 — different libraries). 41.6 shipped `docs/CAPTCHA_ORCHESTRATOR.md` with all nine required sections, full 39-row origination table, and honest framing of `vData` as the single unresolved question.

The track's current README.md was written at the end of 41.4 and says status `partial`. It lists FLOW.md indirectly (via the planned-inputs section) but predates FLOW.md / MODULE-41-NOTES.md / the public doc. The README needs to catch up.

### Implementation Steps
1. Read the current `research/captcha-orchestrator/README.md` end-to-end.
2. Update the Status section to reflect post-41.6 reality: track is substantively closed except for `vData`, which has a clear path forward. Do not use the word "closed" alone — be honest that `vData` remains open. Suggested wording: `partial — flow traced, public doc shipped, one open question (vData runtime binding)`.
3. Add a "Documents" section (if not already present, or extend it) listing every committed artifact:
   - `SURVEY.md` — 41.4 structural survey
   - `FLOW.md` — 41.5 end-to-end flow trace
   - `MODULE-41-NOTES.md` — 41.5 module 41 gate-2 spike
   - `docs/CAPTCHA_ORCHESTRATOR.md` — public reference (41.6)
   - `output/captcha-orchestrator/modules.json` — per-module inventory
   - `output/captcha-orchestrator/module-graph.json` — require graph
   - `output/captcha-orchestrator/dynamic-requires.json` — gate 1 audit
   - `output/captcha-orchestrator/verify-body-origination.json` — 39-field origination table
   - `output/captcha-orchestrator/slide-jy-diff.md` — Zepto vs jQuery classification
4. Add an "Open questions" section naming exactly one question — `vData` runtime binding — with the three follow-up options from FLOW.md §9 Q1 (jsdom harness / stack-VM bytecode decode / Puppeteer property-write breakpoints) summarized to one sentence each.
5. Update the "How to reproduce" section to include the two new scripts (`trace-flow.js`, `slide-jy-diff.js`) alongside `parse-bundle.js`.

### Verification
1. `git diff research/captcha-orchestrator/README.md` — shows only the expected section updates.
2. `grep -c "vData\|FLOW.md\|CAPTCHA_ORCHESTRATOR\|MODULE-41" research/captcha-orchestrator/README.md` — non-trivial count.
3. `wc -l research/captcha-orchestrator/README.md` — report line count.
4. `npm test` — stays at 353/353.
5. No files outside `research/captcha-orchestrator/README.md` are modified.

### Constraints
- **Do not make any git commits.** The director handles all commits.
- **Only edit `research/captcha-orchestrator/README.md`.** Do not touch any other file.
- **Do not mark status `closed`.** `vData` is still unresolved.
- **Do not re-analyze.** Transcribe from existing artifacts (SURVEY.md, FLOW.md, MODULE-41-NOTES.md, the public doc).
- **No emojis.**
- If the task is too difficult (extremely unlikely — this is a README update), stop and report.

### Suggested Agent
`general-purpose` — trivial README update.

---

### Prior: 41.6 (completed)
Wrote `docs/CAPTCHA_ORCHESTRATOR.md` — 607 lines, 9 sections, full 39-row origination table split into upstream passthroughs (24) vs orchestrator-computed (15). `vData` honestly framed as unresolved in §5.2, §6, and §8. Module 8 not-the-vm-slide-loader finding prominent in §2. §9 reconciliation records "no contradictions" with `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md`, `docs/ERRORCODE_12_INVESTIGATION.md` — per FLOW.md §8, which left the four existing docs unedited. Director also added `docs/CAPTCHA_ORCHESTRATOR.md` to the CLAUDE.md main doc table and removed it from the "new docs planned" list. 353/353 tests green.

### Context — what 41.5 already produced
- **`research/captcha-orchestrator/FLOW.md`** (612 lines) — the research-side narrative. Every section 41.6 needs already exists there. Use it as the primary input.
- **`output/captcha-orchestrator/verify-body-origination.json`** — 39-field origination table in machine-readable form. Can be pretty-printed or embedded as a table in the doc.
- **`output/captcha-orchestrator/slide-jy-diff.md`** — slide-jy.js vs module 76 classification.
- **`research/captcha-orchestrator/MODULE-41-NOTES.md`** — i18n caption table finding (park note; probably a single-sentence footnote in the public doc).
- **`research/captcha-orchestrator/SURVEY.md`** — the structural baseline.

### Key findings to surface in the public doc
1. **Bundle shape**: standard webpack 4, 50 live modules, entry 64, no dynamic requires. Static require graph is complete.
2. **Module 8 is NOT the vm-slide loader** — it's a generic script-injector, and its only call site fetches `/slide-jy.js`. `vm-slide.e201876f.enc.js` is loaded by a hardcoded `<script>` tag in the show-page HTML, not by the orchestrator bundle. (41.4 survey hypothesis correctly overturned by 41.5.)
3. **Module 56** (8 KB, fanout 21) is the orchestrator core. Every DoD keyword appears exactly once in its source, and the doc should show the one-liner write for each (`e[_.collectdata]=decodeURIComponent(C())`, `d.eks=R()`, etc.).
4. **`collect` and `eks` are transport-only** — module 56 reads them from `window.TDC.getData(true)` and `window.TDC.getInfo().info` respectively, via the tdc adapter module 38. This confirms `docs/TOKEN_FORMAT.md` and `docs/EKS_FORMAT.md` are still authoritative.
5. **`nonce` and `sess` are server-baked** into the show-page inline `window.captchaConfig`. `sess` is rotated mid-session by module 30 `updateSession` on both verify and getsig success responses.
6. **`vsig` and `websig`** are separate fields (no free-floating `sig=` field). Both read from `captchaConfig`.
7. **`vData` is the single unresolved static question** — only lexical write is inside `if (a.isLowIE()) { window.getVData(...) }` but HAR was captured on Chrome 146 (not lowIE) and `vData` is still present in the POST. Hypothesis: `vm-slide.e201876f.enc.js` installs a runtime binding (jQuery `ajaxPrefilter`/`ajaxTransport` or a `window.getVData` write). The doc must state this honestly as an open question, not paper over it.
8. **`cdata`/`ans`** are a client-side md5 PoW driven by module 72 (`$.challenge`). `pow_answer`/`pow_calc_time` are a SEPARATE md5 PoW driven by `captchaConfig.powCfg` via a WebWorker (module 48). Both empty in this HAR because `powCfg` is unset.
9. **Ticket return via `window.postMessage`**, not as an HTTP response. On `errorCode === 0`, module 56 calls module 45's `parent.send(JSON.stringify({type:3, ticket, randstr, errorCode, errorMessage, ret}))`.
10. **Module 76 is Zepto, `sample/slide-jy.js` is jQuery 1.11.3** — they are different libraries, not the same code minified differently. Module 64 picks between them at load time: Zepto for mobile, jQuery for desktop.
11. **Module 41** is the i18n caption table (`c1..c23`, `puzzle1..puzzle10`, language map). Parked as a footnote.

### Deliverable
- `docs/CAPTCHA_ORCHESTRATOR.md` — new file. Required sections:
  1. Overview (bundle shape, entry, module count, how webpack wraps modules)
  2. End-to-end flow (show-page load → vm-slide fetch → vData compute → verify POST → ticket return) — transcribed from FLOW.md §6
  3. Verify POST origination table — embedded from `verify-body-origination.json` or equivalent
  4. Critical fields in detail: `collect`, `eks`, `vData` (with the honest "open question" framing), `nonce`, `sess`, `vsig`/`websig`
  5. Ticket return via postMessage
  6. Library note (Zepto vs jQuery, module 76 vs slide-jy.js)
  7. Known limitations / open questions (vData runtime binding, module 41 parked, any other unresolved items from FLOW.md §9)
  8. Reconciliation footnotes against `docs/HAR_ANALYSIS.md`, `docs/TOKEN_FORMAT.md`, `docs/EKS_FORMAT.md` — the research found no contradictions, so these should be short "consistent with" footnotes unless FLOW.md §8 records specific discrepancies.
- **Also update `docs/HAR_ANALYSIS.md`** if and only if FLOW.md §8 records a concrete contradiction with it. Otherwise leave it alone. Same for TOKEN_FORMAT.md and EKS_FORMAT.md.

### Explicit non-goals
- **No new research.** If FLOW.md doesn't cover it, 41.6 doesn't cover it. Escalate open questions as follow-up tasks rather than inventing new findings.
- **No code changes.** No tests, no scripts, no helper files. Pure documentation.
- **Do not update `plan.md` / `history/` / `SURVEY.md` / `FLOW.md`.** The director owns those.

### Verification
1. `docs/CAPTCHA_ORCHESTRATOR.md` exists and covers all eight required sections.
2. Every major claim cites its source (module id + line range, or FLOW.md §N).
3. The verify-POST origination table matches `verify-body-origination.json` for at least the six DoD fields.
4. `vData` is framed as an open question, not as a resolved flow.
5. `npm test` — still 353/353 (no code changes expected).
6. `git diff --stat docs/` — shows only `CAPTCHA_ORCHESTRATOR.md` as added (plus reconciliation edits to the three existing docs if and only if FLOW.md §8 required them).

### Suggested Agent
`general-purpose` — documentation task. Needs care with provenance (cite FLOW.md / module IDs / line ranges) but the analytical work is done. Different agent than the one that did 41.5, to keep the "author vs transcriber" separation honest.

---

### Prior: 41.5 survey outcome (headline, archived from mid-phase check-in)

`sample/t_captcha_slide.js` is a standard webpack 4 IIFE bundle. Single-root require graph (entry = module 64), 110 slots / **50 live modules** / 60 sparse holes, 91 static edges, max fanout 21, avg 1.82, 24 leaves. **No dynamic `n(var)` require patterns observed in the static pass.** All five Track 2 DoD origination concepts are anchored to a small, structurally obvious set of candidates:

| Concept | Candidate | Evidence |
|---|---|---|
| vm-slide loading | **module 8** | exports `getScript`/`getScriptUrl`/`isIframeSupportCdnDomain`, one `document.createElement('script')` call |
| vData / collect / eks / nonce / sess / sig / cap_union | **module 56** (8 KB, fanout 21) | all 7 DoD keyword strings literally present in its source range — confirmed by independent grep |
| jQuery/Zepto ajax layer | **module 76** (27 KB) | Zepto-shaped, 43 exports including `ajax`, `ajaxJSONP`, `Event` — diff vs `sample/slide-jy.js` in 41.5 |
| (risk) 62 KB opaque blob | **module 41** | 29% of the bundle, 1 outgoing edge, zero `exports.<name>` — main obfuscation risk |

XTEA delta `0x9E3779B9` is **not present** anywhere in `t_captcha_slide.js` (scanned) — vm-slide's XTEA lives in `sample/vm_slide.js`, not here. Confirms orchestrator layer is transport-only with respect to XTEA.

**Tractability verdict** (from `research/captcha-orchestrator/SURVEY.md`):

> The bundle is a clean, flat webpack 4 module array with 50 live modules, a single-root require graph rooted at module 64, and no dynamic-require patterns observed in the static pass. Every Track 2 DoD concept (vData, collect, eks, nonce, sess, sig, cap_union, prehandle) is anchored to a small and structurally obvious set of candidates — module 56 alone contains every keyword, and module 8 is unambiguously the script loader. An acorn-based deep-analysis pass in 41.5 is very likely to succeed for mapping the show-page-load → vm-slide-fetch → vData-compute → verify-POST flow and for identifying the origination points of the verify-body fields. The two real risks are (i) module 41's 62 KB opaque blob, which may be obfuscated enough to resist static analysis and need a small dynamic harness, and (ii) potential dynamic `n(var)` requires that the current pass cannot see — neither of which is disqualifying, but both should be sanity-checked early in 41.5 before committing to a pure-static approach.

### Decision for the user

41.5's proposed scope: trace show-page → vm-slide fetch → vData compute → verify POST across modules 8, 56, 76, and their required subgraphs; cross-reference `sample/captcha-har.har` for network endpoints; confirm `sample/slide-jy.js` is vanilla jQuery/Zepto via diff against module 76; document verify-body origination per field. Module 41 deferred — sanity-check upfront whether static analysis can make progress; if not, park it for a dedicated follow-up task rather than blocking 41.5.

User confirmed option (a) — proceed as scoped. 41.5 ran; findings recorded in `research/captcha-orchestrator/FLOW.md`. 41.6 auto-continues.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
