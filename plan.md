# Plan

## Status
Current phase: Phase 38 — Restructure
Current task: 38.3 — Triage `scripts/` one-offs into research tracks or bench

---

## Phases

### Phase 38: Restructure (Stream A — blocking)
> Reorganize the repo around the research phase. Preserve git history via `git mv`, rewrite `require()` paths, keep `npm test` at 296/296 as the pass/fail gate.

| ID | Task | Status |
|----|------|--------|
| 38.1 | Restructure repo into research/ + tools/ layout (git mv + require rewrites + package.json + README) | done |
| 38.2 | Create placeholder README.md files for the 5 research tracks | done |
| 38.3 | Triage `scripts/` one-offs into research tracks or bench | in-progress |

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

**ID**: 38.3
**Title**: Triage `scripts/` one-offs into research tracks or bench
**Phase**: Phase 38 — Restructure
**Status**: in-progress

### Goal
Decide per-file whether each of the 8 one-off exploratory scripts currently under `scripts/` belongs under a research track, as a stable bench tool, or as a dead-end archive. Move each file to its decided home. This closes the "Scripts directory triage" known-unknown from `project-brief.md`.

### Context
Current contents of `scripts/` (all 8 files):

1. `tdc-survey.js` — 539-line survey tool that fetches N fresh `tdc.js` builds, runs the porting pipeline, classifies templates. Written in Phase 33. Directly feeds the `research/template-pool/` track's definition of done. **Proposed move**: `research/template-pool/survey.js` (renamed).
2. `tdc-diagnose.js` — enhanced survey script that captures per-attempt diagnostics for errorCode 12 investigation. Written in Phase 36. Feeds Known Unknown #6 (errorCode 12). No active research track owns errorCode 12 yet. **Proposed move**: `research/template-pool/diagnose.js` (co-located with the sibling survey script — both do live CAPTCHA runs and write under `output/tdc-diagnose/` or `output/tdc-survey/`).
3. `live-comparison.js` — imports `scripts/tdc-survey.js` (and other moved files). Phase 33-era tooling for comparing live runs. **Proposed move**: `research/template-pool/live-comparison.js`.
4. `discover-field-order.js` — one-off that discovers the collector field-order. Feeds Known Unknown #6 "Collector field count across templates" (deferred/lower priority). **Proposed move**: `research/template-pool/dead-ends/discover-field-order.js` if no longer used, or keep under a new track. Ambiguous — ask the user if uncertain, per the brief's "If the decision is ambiguous for any file, ask the user — do not delete" rule.
5. `decrypt-collect.js` — one-off decryption tool referenced by `docs/TOKEN_DECRYPTION.md` as an example. This is a stable reference tool, not research. **Proposed move**: `tools/token-generator/decrypt-collect.js` — but this path is under a Protected path (`tools/token-generator/**` is read-only except for new files; adding a new file should be allowed). Confirm with director rules. Alternative: leave it in `scripts/` as a bench tool.
6. `token-isolation-test.js` — one-off investigation of token-generation isolation. Historical, likely unused now. **Proposed move**: archive it. Ambiguous — ask the user.
7. `chrome-cd-inject.js` — one-off Chrome DevTools protocol injection experiment. Historical, likely unused. **Proposed move**: archive it. Ambiguous — ask the user.
8. `live-captcha-submit.js` — one-off live-submit harness. Historical, likely unused. **Proposed move**: archive it. Ambiguous — ask the user.

**Director decision for this task**: only move files where the destination is unambiguous (files 1, 2, 3 into `research/template-pool/`). For every ambiguous file (4, 5, 6, 7, 8), the subagent must stop and return a decision matrix to the director — do not guess, do not delete. The brief explicitly forbids deleting ambiguous files.

Archive convention: abandoned scripts go under `research/<track>/dead-ends/` per `.claude/rules/research-artifacts.md`, with a one-paragraph note in the track's `README.md` explaining why. If the director decides to archive files 6/7/8, they will go under `research/template-pool/dead-ends/` (or another track, depending on the decision).

### Implementation Steps
1. Read `.claude/rules/research-artifacts.md` to confirm archive conventions and research-track discipline.
2. Read `project-brief.md` Known Unknown #1 ("Scripts directory triage") to confirm the policy.
3. For files **1, 2, 3** (`tdc-survey.js`, `tdc-diagnose.js`, `live-comparison.js`):
   a. `git mv scripts/tdc-survey.js research/template-pool/survey.js`
   b. `git mv scripts/tdc-diagnose.js research/template-pool/diagnose.js`
   c. `git mv scripts/live-comparison.js research/template-pool/live-comparison.js`
   d. Fix any `require()` path references inside these three files (depth changes from `scripts/` to `research/template-pool/`) AND any test files under `tests/` that import from `../scripts/tdc-survey`, `../scripts/tdc-diagnose`, etc. (`tests/test-tdc-survey.js` and `tests/test-tdc-diagnose.js` are the known importers.)
   e. Update `package.json` `scripts.test` list: the two test files reference `scripts/` paths by import — the tests themselves may not need renaming, but confirm that `node --test tests/test-tdc-survey.js` and `tests/test-tdc-diagnose.js` still pass.
4. Update `research/template-pool/README.md`:
   - Change `Status` from `open` to `partial` (there are now committed scripts under the track).
   - Add a `## How to reproduce` section with actual commands for survey, diagnose, live-comparison (replacing the placeholder "No runnable artifacts yet").
5. For files **4, 5, 6, 7, 8**: **STOP**. Produce a decision matrix in the return report — for each of the five ambiguous files, include: what the file does (1 sentence from reading it), proposed destination, why it is ambiguous, and a specific yes/no question for the director to answer. Do NOT move, delete, or edit these five files in this task.
6. Run `npm test`. Must still be 296/296. If the move of files 1, 2, 3 broke `test-tdc-survey.js` or `test-tdc-diagnose.js`, the failure is almost certainly a missed `require()` path update.

### Verification
- [ ] `ls scripts/` shows exactly 5 files remaining: `decrypt-collect.js`, `discover-field-order.js`, `chrome-cd-inject.js`, `live-captcha-submit.js`, `token-isolation-test.js` (the ambiguous ones).
- [ ] `ls research/template-pool/` shows `README.md`, `survey.js`, `diagnose.js`, `live-comparison.js`.
- [ ] `git status --short` shows three `R` rename entries (scripts → research/template-pool), not delete+add pairs.
- [ ] `npm test` → 296/296.
- [ ] `grep -rE "require\\(['\"]\\.\\.?/scripts/(tdc-survey|tdc-diagnose|live-comparison)" --glob '!history/**' --glob '!node_modules/**' --glob '!docs/WORKFLOW.md' --glob '!project-brief.md' --glob '!plan.md'` returns no matches.
- [ ] `research/template-pool/README.md` has `Status: partial` and a populated `How to reproduce` section.
- [ ] Return report includes a decision matrix for the five ambiguous files, with one question per file for the director.

### Suggested Agent
`general-purpose` — small mechanical move + path rewrite plus a judgment-required return report. No specialized expertise needed.

### Context
Pre-restructure state (verified by the director):

- Clean working tree. Baseline: `npm test` → 296/296 (Phase 37 closing state).
- Old directories still live at the root: `decompiler/`, `token/`, `pipeline/`, `scraper/`, `puppeteer/`, `dynamic/`.
- `research/` and `tools/` do not yet exist.
- 122 `require()` occurrences of the old directory names across **42 files**, grouped as:
  - **Source code**: `scraper/{cli.js,collect-generator.js,scraper.js}`, `pipeline/{run.js,structure-extractor.js,token-verifier.js}`, `dynamic/comparison-harness.js`.
  - **Tests** (18 files): `tests/test-{semantics,slide-solver-real,deobfuscator,scraper-foundation,auto-port,pipeline-integration,opcode-mapper,disasm,collector-schema,cfg,outer-pipeline,vm-parser,scraper,reconstruct,emit,decoder,fold,strings,slide-solver,structure-extractor,key-extractor,vdata-generator}.js` plus `tests/outer-pipeline.test.js`.
  - **Scripts** (8 files): `scripts/{live-comparison,tdc-survey,discover-field-order,tdc-diagnose,decrypt-collect,token-isolation-test,chrome-cd-inject,live-captcha-submit}.js`.
  - **Docs / meta**: `docs/TOKEN_DECRYPTION.md` (1), `docs/TOKEN_FORMAT.md` (6), `project-brief.md` (1 — historical example; leave as-is since project-brief already references both old and new paths in running text), `.claude/commands/fetch-latest.md` (1).

The full directory-rename map:

| Old path | New path |
|----|----|
| `decompiler/` | `research/tdc-register-vm/` |
| `token/` | `tools/token-generator/` |
| `pipeline/` | `tools/porting-pipeline/` |
| `scraper/` | `tools/scraper/` |
| `puppeteer/` | `tools/captcha-solver/` |
| `dynamic/` | `tools/dynamic-tracers/` |

`package.json` script targets that need updating:
- `decompile` — currently points into `decompiler/`
- `token:standalone` — currently points into `token/`
- `solve:puppeteer` — currently points into `puppeteer/`
- `test` — the list of test files doesn't reference old dirs directly, but verify
- Any other script — enumerate all and rewrite anything matching the old prefixes

`CLAUDE.md` and `README.md` canonical command tables already document the **new** paths (they were refreshed in the scaffold pass). After the moves they must still match reality — re-verify, do not rewrite the docs to match any accidental drift in the move.

Protected paths that must NOT be modified in this task: `targets/**`, `sample/**`, `.claude/rules/**`, `history/**`. `history/<YYYYMMDD>.md` entries are factual records — do not rewrite old path references inside them. `docs/WORKFLOW.md` phase history is also a factual record and must not have old paths rewritten (per project-brief).

The restructure must also touch (because they contain path references to the old layout):
- `scripts/*.js` require() statements.
- `.claude/commands/fetch-latest.md` — tracked, rewrite the command examples.
- `docs/TOKEN_DECRYPTION.md`, `docs/TOKEN_FORMAT.md` — rewrite the one and six code-example references respectively.
- Do **not** rewrite old paths inside `docs/WORKFLOW.md`, `history/*.md`, or `project-brief.md` narrative — these are historical records.
- `.claude/agents/*.md` — grep and rewrite any still-live path references (brief mentioned these may contain stale paths).

### Implementation Steps
1. **Record baseline.** Run `npm test` and confirm 296/296. If it is not already green, stop and report — do not begin the move.
2. **Create parent directories** with `mkdir -p research tools`.
3. **Perform the six `git mv` operations** in the order given in the brief. Use `git mv` (not `mv`) so git tracks the renames and preserves blame/history:
   - `git mv decompiler research/tdc-register-vm`
   - `git mv token tools/token-generator`
   - `git mv pipeline tools/porting-pipeline`
   - `git mv scraper tools/scraper`
   - `git mv puppeteer tools/captcha-solver`
   - `git mv dynamic tools/dynamic-tracers`
4. **Rewrite `require()` paths project-wide.** Enumerate every file with an old-path reference via `Grep`, then rewrite each one. Patterns to rewrite (accounting for `./`, `../`, `../../` variants):
   - `decompiler/...` → `research/tdc-register-vm/...`
   - `token/...` → `tools/token-generator/...`
   - `pipeline/...` → `tools/porting-pipeline/...`
   - `scraper/...` → `tools/scraper/...`
   - `puppeteer/...` → `tools/captcha-solver/...`
   - `dynamic/...` → `tools/dynamic-tracers/...`
   Apply to source files under the moved trees, all of `tests/`, all of `scripts/`, `docs/TOKEN_DECRYPTION.md`, `docs/TOKEN_FORMAT.md`, `.claude/commands/*.md`, and `.claude/agents/*.md`.
   **Do not touch**: `history/**`, `docs/WORKFLOW.md`, `project-brief.md`, `targets/**`, `sample/**`, `.claude/rules/**`.
5. **Update `package.json`.** Rewrite `scripts.decompile`, `scripts.token:standalone`, `scripts.solve:puppeteer`, and any other `scripts.*` entry that references the old paths. Verify `scripts.test`.
6. **Re-verify `CLAUDE.md` and `README.md` command tables** against reality — they already document the new paths. If any command no longer runs as written after the moves, fix the doc to match the new reality (not the other way around).
7. **Run `npm test`.** Must be exactly 296/296. If any test fails, stop, report the diff, do **not** modify tests to make them pass. The rule is: restructure is mechanical; any test that breaks is a require-path miss that must be corrected at the path, not at the test.
8. **Do not commit.** The director commits after verification.

### Verification
- [ ] `npm test` → 296/296 passing.
- [ ] `git status` shows renames (via `git mv`), not deletes + adds. Spot-check a few entries in `git status --short` or `git diff --stat -M` — renamed files should appear with `R` status when staged.
- [ ] `ls decompiler token pipeline scraper puppeteer dynamic 2>&1` all return "No such file or directory".
- [ ] `ls research/tdc-register-vm tools/token-generator tools/porting-pipeline tools/scraper tools/captcha-solver tools/dynamic-tracers` all succeed.
- [ ] `grep -rE "require\\(['\\\"]\\.\\.?/(decompiler|token|pipeline|scraper|puppeteer|dynamic)[/'\\\"]" --include='*.js' .` returns no matches (excluding `history/`, `node_modules/`).
- [ ] `node -e "require('./tools/token-generator/cli.js')"` (or the appropriate entry) loads without ModuleNotFoundError. Same for `./research/tdc-register-vm/run.js`.
- [ ] `cat package.json` shows no `scripts.*` entries pointing into `decompiler/`, `token/`, `pipeline/`, `scraper/`, `puppeteer/`, or `dynamic/`.
- [ ] The commands in `CLAUDE.md` "Canonical Commands" section still run without error (spot-check: `node research/tdc-register-vm/run.js --help` or equivalent, `node tools/token-generator/cli.js --help`).

### Suggested Agent
`general-purpose` — this is a large mechanical `git mv` + path-rewrite task spanning ~42 files. Needs tool breadth (Bash, Grep, Edit) and careful sequencing, not specialized expertise.

---
