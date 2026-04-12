# Plan

## Status
Current phase: Phase 38 — Restructure
Current task: 38.4 — Fix latent string-literal path misses from 38.1

---

## Phases

### Phase 38: Restructure (Stream A — blocking)
> Reorganize the repo around the research phase. Preserve git history via `git mv`, rewrite `require()` paths, keep `npm test` at 296/296 as the pass/fail gate.

| ID | Task | Status |
|----|------|--------|
| 38.1 | Restructure repo into research/ + tools/ layout (git mv + require rewrites + package.json + README) | done |
| 38.2 | Create placeholder README.md files for the 5 research tracks | done |
| 38.3 | Triage `scripts/` one-offs into research tracks or bench | done |
| 38.4 | Fix latent string-literal path misses from 38.1 (survey.js, diagnose.js) | in-progress |
| 38.5 | Move the 5 previously-ambiguous scripts to their decided homes (user-confirmed 2026-04-12) | pending |

### Phase 39: vm-slide stack VM (Stream B — Track 1, top priority)
> Decompile `sample/vm_slide.js` — stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`). Produce decoder, disassembler, opcode table, architecture doc, and a top-level variants comparison.

| ID | Task | Status |
|----|------|--------|
| 39.1 | Implement vm-slide decoder + disassembler under `research/vm-slide-stack-vm/` | pending |
| 39.2 | Write tests for vm-slide decoder + disassembler | pending |
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from verified findings | pending |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | pending |

---

## Current Task

**ID**: 38.4
**Title**: Fix latent string-literal path misses from 38.1 (survey.js, diagnose.js)
**Phase**: Phase 38 — Restructure
**Status**: in-progress

### Goal
Rewrite two latent string-literal path references that task 38.1 missed because its rewriter only handled `require()` calls, not path literals inside `path.join()` invocations. Both files were moved (as `scripts/tdc-survey.js` → `research/template-pool/survey.js` and `scripts/tdc-diagnose.js` → `research/template-pool/diagnose.js`) and both still reference `pipeline/run.js` where they should now reference `tools/porting-pipeline/run.js`. These are latent runtime bugs, not test failures — tests don't cover the live-run scripts, so `npm test` stays green despite the bugs.

### Context
Exact locations and current content:

- `research/template-pool/survey.js:103` → `[path.join(PROJECT_ROOT, 'pipeline', 'run.js'), tempFile, '--skip-verify'],`
- `research/template-pool/diagnose.js:132` → `[path.join(PROJECT_ROOT, 'pipeline', 'run.js'), tempFile, '--skip-verify'],`

Both lines call `childProcess.execFile` (or similar) to spawn the porting pipeline's CLI runner. The correct post-restructure path segment is `'tools', 'porting-pipeline', 'run.js'` — the same fix pattern applied by 38.1 to `tests/test-auto-port.js:380` and `tools/scraper/scraper.js`.

Grep confirms these are the only two remaining stale string-literal references to the old directory names in any `.js` file (exhaustive grep was run across the whole tree before this task was added). Other findings from the same grep that are NOT in scope:

- `tools/dynamic-tracers/*.js` references to `path.join(PROJECT_ROOT, 'output', 'dynamic')` — the `output/dynamic/` directory convention is intentional and matches the output-versioning rule. Do not rewrite.
- `tools/dynamic-tracers/harness.js:26` → `path.join(PROJECT_ROOT, 'src', 'dynamic', 'instrument.js')` — a pre-existing dead path (no `src/` dir has ever existed in this repo). Not a 38.1 regression. Leave it; it's a separate known bug that can be fixed on a different task if the harness is ever revived.
- All `require('puppeteer')` / `import('puppeteer')` — the npm package, not the old `puppeteer/` directory.

### Implementation Steps
1. Read `research/template-pool/survey.js` around line 103 to confirm the exact current content.
2. Read `research/template-pool/diagnose.js` around line 132 to confirm the exact current content.
3. Edit `research/template-pool/survey.js`: change `path.join(PROJECT_ROOT, 'pipeline', 'run.js')` → `path.join(PROJECT_ROOT, 'tools', 'porting-pipeline', 'run.js')`.
4. Edit `research/template-pool/diagnose.js`: same change.
5. Run `npm test`. Must be 296/296 (tests don't cover this path, but confirm no regression).
6. Spot-check by reading the surrounding 5 lines of each file to confirm context is unchanged.

### Verification
- [ ] `grep -n "'pipeline', 'run.js'" research/template-pool/survey.js research/template-pool/diagnose.js` returns no matches.
- [ ] `grep -n "'tools', 'porting-pipeline', 'run.js'" research/template-pool/survey.js research/template-pool/diagnose.js` returns exactly one hit per file.
- [ ] `npm test` → 296/296.
- [ ] No files other than the two named are modified.

### Suggested Agent
`general-purpose` — trivial 2-file string-literal edit.

---
