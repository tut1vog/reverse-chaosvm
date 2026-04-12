# Plan

## Status
Current phase: Phase 41 — minor cleanup + Captcha orchestrator (Stream B Track 2)
Current task: 41.2 — Tests for the TemplateCache.seed() type guard

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
| 41.2 | Tests for the type guard | in-progress |
| 41.3 | Clean up stale describe-block text at `tests/test-auto-port.js:358` (says "pipeline/run.js" but the assertion underneath uses the post-restructure path) | pending |
| 41.4 | Captcha orchestrator survey — acorn-parse `sample/t_captcha_slide.js`, enumerate webpack modules, map the module graph, identify which modules touch vm-slide loading / verify POST / vData construction. Source-only, no deep analysis yet. | pending |
| 41.5 | Captcha orchestrator deep analysis — trace the show-page → vm-slide fetch → vData compute → verify POST flow across the relevant modules identified by 41.4. Cross-reference `sample/captcha-har.har` network trace. Confirm `sample/slide-jy.js` is vanilla jQuery. | pending |
| 41.6 | Write `docs/CAPTCHA_ORCHESTRATOR.md` from 41.4/41.5 findings. Required sections per DoD: show-page load, vm-slide fetch, vData compute, verify POST assembly, ticket return, plus an origination table for `collect`/`eks`/`vData`/`nonce`/`sess`/`sig`. | pending |
| 41.7 | Update `research/captcha-orchestrator/README.md` — promote status `open → partial` (or `closed` if 41.5 reached full understanding) and populate How-to-reproduce + Notes from the committed artifacts. | pending |

---










## Current Task

**ID**: 41.2
**Title**: Tests for the `TemplateCache.seed()` `config.target` type guard
**Phase**: Phase 41 — Minor cleanup + Captcha orchestrator (Stream B Track 2)
**Status**: in-progress

### Goal
Add test coverage for the one-line guard added by 41.1. Must exercise both the defective-config case (missing `target`, non-string `target`) and confirm `seed()` no longer throws when such a config exists under the override directory, while still correctly processing well-formed sibling configs in the same scan.

### Context
41.1 added this guard at `tools/scraper/template-cache.js:112`, immediately after the `xteaParams` guard and before `path.join(__dirname, '..', '..', 'targets', config.target)`:

```js
if (typeof config.target !== 'string') continue;
```

Before the guard, a `pipeline-config.json` containing `xteaParams` but missing `target` would blow up the entire `seed()` call with `TypeError: The "path" argument must be of type string. Received undefined` — taking out any sibling configs that would have been processed after the faulty one.

**Test file**: extend `tests/test-scraper-foundation.js` (this is where the existing `TemplateCache.seed()` tests live). Use the `seed(outputDirOverride)` parameter with a temp directory — do NOT touch the real `output/` directory. The existing tests in that file show the established pattern for temp-dir fixtures; follow it.

**Minimum required cases** (pick concise names):
1. **missing target**: seed a temp output dir with one `bad-v/pipeline-config.json` whose body has `xteaParams: {...}` but no `target` key. Call `seed(tempDir)`. Assert it does not throw and the cache remains empty for that entry.
2. **non-string target**: same as above but `target: 123` (or `null`). Assert no throw, no cache entry.
3. **mixed dir**: temp dir with both a faulty config (missing `target`) AND a well-formed sibling config that points to a real `targets/` file (reuse whichever target the existing tests in `test-scraper-foundation.js` already use — likely `tdc.js`). Assert the well-formed sibling is still cached; the faulty one is silently skipped. This is the regression case — proves one broken config no longer takes out the rest of the scan.

Keep the xteaParams body minimal but valid enough for `seed()` to proceed past the first guard (key/delta/rounds/keyModConstants/keyMods/caseCount) — copy the shape from an existing test fixture in the same file.

### Implementation Steps
1. Read `tests/test-scraper-foundation.js` end-to-end to understand the existing `TemplateCache.seed()` test pattern: how temp dirs are created, how fixture configs are written, how the test asserts on cache contents, and how cleanup is done. Match that pattern exactly.
2. Read `tools/scraper/template-cache.js` `seed()` (post-41.1) to confirm the guard location and the full list of fields copied from `config.xteaParams` into the cache entry — so the fixture configs have enough fields to reach the cache-write path when `target` is valid.
3. Add the three test cases above under the existing `TemplateCache.seed` describe-block (or create one if none exists — but one almost certainly already exists). No refactoring of existing tests.
4. Run `node --test tests/test-scraper-foundation.js` — must pass including your new cases.
5. Run `npm test` — must be 353/353 (350 + 3 new) or whatever count the 3 new cases produce. Report the exact count.

### Verification — report all of these
1. `git diff --stat tests/test-scraper-foundation.js` — only this file changed, only additions (no deletions or deletions should be limited to whitespace inside the describe block).
2. `git diff tools/scraper/template-cache.js` — must be EMPTY (this task is tests only — 41.1 already committed the production change).
3. `node --test tests/test-scraper-foundation.js` — new cases pass.
4. `npm test` — report the full `# tests / # pass / # fail` block. Should be 350 + N where N is the number of new test cases.
5. **Negative sanity check**: temporarily revert the 41.1 guard locally in a scratch way (e.g. comment out line 112 of `template-cache.js`), rerun just the new tests, confirm at least one fails with a `TypeError` from `path.join`, then restore line 112 and confirm all pass again. Report this back. This is the critical proof that the new tests actually exercise the guard. DO NOT leave the guard commented out.

### Constraints
- **Do not make any git commits.** The director handles all commits after verification.
- **Do not modify `tools/scraper/template-cache.js`** (41.1's production change is already in). The only file you may edit is `tests/test-scraper-foundation.js`.
- **Do not modify any other test file**, any fixture under `targets/`, or any production code.
- **Do not use the real `output/` directory** — always pass a temp dir via `seed(tempDir)`. Clean it up in `afterEach` / `after` the same way existing tests do.
- **Follow the existing test style** in `tests/test-scraper-foundation.js` — CommonJS, node:test, node:assert, 2-space indent, single quotes, semicolons.
- **If the task is too difficult or impossible to complete**, stop immediately and report. Do not leave partial or broken tests in the tree.

### Suggested Agent
`general-purpose` — standard test authoring against an existing test file with a well-defined guard contract. Different agent than the one that did 41.1, per the impl/tests separation rule.

---

## Phase 41 execution strategy

After 41.1 and 41.2 (cleanup + tests) and 41.3 (describe text cleanup), 41.4 is a **survey** task that characterizes the orchestrator file before any deep analysis. After 41.4 returns, the director will **pause for a mid-phase check-in** so the user can confirm the deep-analysis scope based on what the survey finds. If the module structure is clean and tractable, 41.5-41.7 auto-continue. If the survey reveals something unexpected (heavy obfuscation, dynamic loading, indirect dispatch that static analysis can't follow), the director re-plans before dispatching deep analysis.

This mirrors the 39.2→39.3 mid-track strategy call pattern from Phase 39: survey → pause → deep analysis.
