# Plan

## Status
Current phase: Phase 41 — minor cleanup + Captcha orchestrator (Stream B Track 2)
Current task: MID-PHASE CHECK-IN — 41.4 survey complete, awaiting user confirmation before dispatching 41.5 deep analysis

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
| 41.5 | Captcha orchestrator deep analysis — trace the show-page → vm-slide fetch → vData compute → verify POST flow across the relevant modules identified by 41.4. Cross-reference `sample/captcha-har.har` network trace. Confirm `sample/slide-jy.js` is vanilla jQuery. | awaiting mid-phase check-in |
| 41.6 | Write `docs/CAPTCHA_ORCHESTRATOR.md` from 41.4/41.5 findings. Required sections per DoD: show-page load, vm-slide fetch, vData compute, verify POST assembly, ticket return, plus an origination table for `collect`/`eks`/`vData`/`nonce`/`sess`/`sig`. | pending |
| 41.7 | Update `research/captcha-orchestrator/README.md` — promote status `open → partial` (or `closed` if 41.5 reached full understanding) and populate How-to-reproduce + Notes from the committed artifacts. | pending |

---










## Current Task

**MID-PHASE CHECK-IN — no task in progress.** 41.4 closed with a green tractability verdict; 41.5 will not dispatch until the user confirms the deep-analysis scope.

**ID**: 41.5 (pending user confirmation)
**Title**: Captcha orchestrator deep analysis — trace the show-page → vm-slide fetch → vData compute → verify POST flow
**Phase**: Phase 41 — Minor cleanup + Captcha orchestrator (Stream B Track 2)
**Status**: awaiting mid-phase check-in

### Survey outcome (41.4) — headline for the check-in

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

**Please confirm one of**:
- (a) Proceed with 41.5 as scoped above (auto-continues into 41.6 docs + 41.7 README bump).
- (b) Tighten scope — e.g. only map module 56 + verify-body origination and defer the vm-slide fetch + jQuery diff.
- (c) Expand scope — e.g. include a dynamic harness for module 41 up front.
- (d) Re-plan — the subagent missed something structural that changes the approach.

Below is the verbatim original 41.4 brief kept for audit trail.

---

### Goal (41.4, completed)
Produce a static, source-only **structural map** of `sample/t_captcha_slide.js` (213 KB Tencent CAPTCHA orchestrator webpack bundle). No deep flow analysis yet — this is the survey step that informs whether 41.5's deep analysis is tractable. After this task completes, the director **pauses for a mid-phase check-in** with the user to decide on 41.5 scope, mirroring the Phase 39 survey→pause pattern. Do not spill into flow tracing or doc writing — that's 41.5 and 41.6.

### Context
- **Input file** (read-only): `sample/t_captcha_slide.js`, ~213 KB. Per `project-brief.md`, it is a standard webpack bundle with a module array, which makes static analysis via `acorn` tractable. `tools/porting-pipeline/vm-parser.js` is the established acorn-parsing pattern in this repo — follow the same style (`acorn.parse(source, { ecmaVersion: 'latest', ranges: true, locations: true })`, walk the AST, etc.).
- **Related read-only inputs** you may reference but not modify:
  - `sample/captcha-har.har` — network trace of a real CAPTCHA flow, useful later (41.5) for cross-referencing network endpoints against module findings.
  - `sample/slide-jy.js` — already suspected to be vanilla jQuery (41.5 will confirm); do not analyze as part of 41.4.
  - `sample/vm_slide.js` + `research/vm-slide-stack-vm/` — the vm-slide stack VM that t_captcha_slide loads and drives. Track 1 closed in Phase 40; its decoder output under `output/vm-slide/` is available if you need to cross-reference bytecode.
- **Track directory**: `research/captcha-orchestrator/`. Per `.claude/rules/research-artifacts.md`, the track must have a `README.md` (create/update), artifacts go under `output/captcha-orchestrator/` (NOT inside the research dir), scripts live in `research/captcha-orchestrator/`, and every claim must be backed by a committed script whose output reproduces it.
- **Project rules in force**:
  - `.claude/rules/targets-readonly.md` — `targets/` and `sample/` are read-only. Never write to them.
  - `.claude/rules/output-versioning.md` — artifacts go to `output/captcha-orchestrator/`, stable filenames across runs, no timestamped dirs.
  - `.claude/rules/coding-style.md` — CommonJS, 2-space indent, single quotes, semicolons, `const`/`let`.
  - `.claude/rules/verify-dont-assume.md` — every claim needs a reproducible trace.

### What "survey" means for this task

Produce **four concrete artifacts** — all small enough to diff in git:

1. **A webpack-parser script** — `research/captcha-orchestrator/parse-bundle.js`. Acorn-parses `sample/t_captcha_slide.js` and identifies the webpack module container (the array/object literal passed to the webpack runtime). Writes its findings to `output/captcha-orchestrator/`. Must be idempotent (same input → same output; stable filenames). Runs as `node research/captcha-orchestrator/parse-bundle.js`. Prefer reading the input path from the script rather than an argument; keep it boring.

2. **A module inventory JSON** — `output/captcha-orchestrator/modules.json`. For each webpack module in the bundle:
   - `id` (webpack module id — number or string)
   - `sourceRange` (`[startOffset, endOffset]` in the bundle file, based on acorn's `range`)
   - `sourceLines` (`{start, end}` 1-indexed for human inspection)
   - `byteLength`
   - `requires` — an array of the `require(<id>)` calls made by this module, pulled by walking the AST of the module body and collecting arguments to the webpack `require`/`__webpack_require__` function. If the bundle uses a different convention (e.g. module function signature is `(module, exports, require) => { ... }` or `function(e, t, n) { ... }`), infer which parameter is `require` by its usage pattern and extract the numeric-literal arguments passed to it. Skip non-literal arguments but **log a count** of dynamic requires.
   - `exports` — a best-effort list of module.exports-assigned or `exports.X = ...` identifiers. String-only.
   - `hint` — optional short tag describing what the module looks like at a glance (e.g. `"xhr"`, `"string-table"`, `"hasher"`, `"unknown"`). Keep this CONSERVATIVE — if in doubt, `"unknown"`. No guessing.
   
   Schema-first: decide the JSON shape, write it in the script, run it, commit the output. Do not hand-edit the JSON.

3. **A module graph** — `output/captcha-orchestrator/module-graph.json`. Derived from the inventory above:
   - `nodes`: `[{id, byteLength, hint}]`
   - `edges`: `[{from, to}]` for every static `require` relationship.
   - `roots`: modules that are executed on bundle entry (the webpack entry point — typically module id 0 or the one passed to the runtime bootstrap).
   - `leaves`: modules that nobody requires (candidates for orphans or dynamic-load targets).
   
   Produced by the same `parse-bundle.js` (do not split into a second script). This is pure static structure; no runtime simulation.

4. **A written survey note** — `research/captcha-orchestrator/SURVEY.md` (a plain Markdown file, NOT a doc under `docs/`; `docs/CAPTCHA_ORCHESTRATOR.md` is 41.6's territory and MUST NOT be touched). Max ~150 lines. Required sections:
   - **Bundle shape**: how webpack wraps modules, what the entry point looks like, how `require` is dispatched. Include the actual code shape (short snippet, 5-10 lines) from `sample/t_captcha_slide.js` — do not paraphrase.
   - **Module count + size distribution**: a small histogram or summary (total modules, total bytes, largest 5 modules by byte length).
   - **Graph shape**: how many roots, how many leaves, max/average fan-out, any isolated subgraphs.
   - **Candidate modules for Track 2 DoD concepts** — for each of these 6 concepts, list the module IDs that look like they _might_ touch it, with a one-line justification grounded in what the script found (NOT a guess):
     - `vm-slide` loading / invocation
     - `vData` construction
     - verify POST body assembly
     - `collect` / `eks` handling
     - `nonce` / `sess` / `sig` origination
     - show-page entry flow
     
     If a concept has zero candidates, say so — that's a finding. Do not fabricate.
   - **Open questions for 41.5**: what a deep-analysis pass would still need to resolve (dynamic requires, indirect dispatch, obfuscation patterns worth knowing about).
   - **Tractability verdict** (one paragraph): is deep analysis in 41.5 likely to succeed on this bundle with the same acorn-based approach, or did you find something (heavy obfuscation, dynamic loading, eval, indirect dispatch, string-table opcode dispatch like ChaosVM) that warrants re-planning? This is the key input for the mid-phase check-in.

5. **Track README** — update `research/captcha-orchestrator/README.md`. If it doesn't exist, create it. Required sections per `.claude/rules/research-artifacts.md`: the open question this track exists to answer, current status (should be `partial` after this task), inputs (`sample/t_captcha_slide.js`), how to reproduce (`node research/captcha-orchestrator/parse-bundle.js`), and a link to `SURVEY.md`.

### Explicit non-goals
- **Do NOT write `docs/CAPTCHA_ORCHESTRATOR.md`.** That is 41.6 and depends on 41.5's findings.
- **Do NOT trace runtime flows across modules.** That is 41.5. If you find yourself writing prose about "and then module X calls Y which computes Z" — stop, that's out of scope. Stick to structural observation.
- **Do NOT rename webpack module IDs, pretty-print the bundle, or produce a decompiled output.** The deliverable is a MAP of the bundle, not a re-emission of it.
- **Do NOT analyze `sample/slide-jy.js`, `sample/vm_slide.js`, or `sample/captcha-har.har`.** 41.5 will cross-reference them.
- **Do NOT write tests.** Tests for parser scripts are a separate task if we decide to add them.
- **Do NOT commit large binary artifacts or multi-megabyte JSON.** The inventory JSON should be a few hundred KB at most. If it's larger, reduce per-module detail or store positional info more compactly.

### Implementation Steps
1. Read `project-brief.md` for the Track 2 DoD and `.claude/rules/research-artifacts.md` + `.claude/rules/output-versioning.md` for the artifact discipline. Also skim `research/vm-slide-stack-vm/README.md` as a template for what a good track README looks like post-Phase 40.
2. Read `tools/porting-pipeline/vm-parser.js` to see the established acorn pattern in this repo. Use the same import + options style.
3. Open `sample/t_captcha_slide.js` — first scan the head (~200 lines) and the tail (~100 lines) to identify the webpack runtime signature. Then determine exactly how modules are laid out: array of `function(module, exports, require) {...}`, object literal keyed by ID, or something else.
4. Build `parse-bundle.js` incrementally: bundle-open → module-container locator → per-module AST → per-module `require`-extraction → JSON writer. Test each stage by running the script and inspecting its JSON output.
5. Produce `modules.json`, `module-graph.json`, `SURVEY.md`, and the track `README.md`.
6. Run `npm test` — must stay at 353/353. (No new tests added by this task.)
7. Run `node research/captcha-orchestrator/parse-bundle.js` one last time after all files are written — confirm it's fully idempotent (same input produces identical output; `git diff output/captcha-orchestrator/` is empty the second time).

### Verification — report all of these
1. `ls -la research/captcha-orchestrator/ output/captcha-orchestrator/` — shows the new files (parse-bundle.js, SURVEY.md, README.md in the former; modules.json, module-graph.json in the latter).
2. `node research/captcha-orchestrator/parse-bundle.js` — runs cleanly; report total module count and total bytes.
3. `node research/captcha-orchestrator/parse-bundle.js && git status --short output/captcha-orchestrator/` — after a second run, no diff in `output/captcha-orchestrator/` (proves idempotence).
4. `wc -l research/captcha-orchestrator/SURVEY.md` — report the line count (target ~100-150, hard cap 200).
5. `jq '.[] | .id' output/captcha-orchestrator/modules.json | wc -l` — total module count. Report it.
6. `jq '.edges | length' output/captcha-orchestrator/module-graph.json` — total edge count.
7. `jq '.roots' output/captcha-orchestrator/module-graph.json` — root module(s).
8. `head -40 research/captcha-orchestrator/SURVEY.md` — first portion so the director can sanity-check tone and scope.
9. `npm test` — 353/353.
10. **Tractability verdict** — paste the one-paragraph verdict from the SURVEY.md here in the final report so the director can forward it to the user for the mid-phase check-in.

### Constraints
- **Do not make any git commits.** The director handles all commits after verification.
- **Do not modify `sample/`, `targets/`, `docs/`, `tools/`, `tests/`, or `output/` for anything other than the specific paths listed above.** The only touched files are: `research/captcha-orchestrator/parse-bundle.js`, `research/captcha-orchestrator/SURVEY.md`, `research/captcha-orchestrator/README.md`, `output/captcha-orchestrator/modules.json`, `output/captcha-orchestrator/module-graph.json`.
- **No new npm dependencies.** `acorn` is already in `package.json`. If you need a walker, use `acorn-walk` only if it's also already declared in `package.json`; otherwise hand-walk the AST — don't add packages.
- **Use CommonJS** (`'use strict';`, `require()`, `module.exports`). Match the project style strictly.
- **Do NOT write to `research/captcha-orchestrator/`** with JSON/large artifacts — those go under `output/`. Scripts and docs live in `research/`.
- **Honor all project rules**: `targets-readonly.md`, `verify-dont-assume.md`, `research-artifacts.md`, `output-versioning.md`, `coding-style.md`.
- **If the task is too difficult or impossible to complete** — e.g. the bundle doesn't look like webpack, the AST walk explodes, modules are obfuscated beyond static analysis — stop immediately and report back. Explain what you attempted, what went wrong, whether it's a tooling problem or a bundle-shape problem, and what a different approach might look like. Do not leave partial parse-bundle.js scripts or half-written SURVEY.md in the tree — clean up and report.

### Suggested Agent
`general-purpose` — this is an acorn-based structural survey. Needs a sharp subagent comfortable with AST walking and webpack bundle conventions. After it completes, the director reviews, then pauses for user check-in before 41.5.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
