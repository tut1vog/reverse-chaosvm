# Plan

## Status
Current phase: Phase 66 — Simplification Pass
Current task: 66.1 — Deletions + port-version Stage 1 reconciliation

---

## Phases

### Phase 66: Simplification Pass
> Shrink the project surface area to (1) pure-Node scraper, (2) Puppeteer scraper (renamed from `captcha-solver`), (3) porting pipeline, (4) docs. Inline `tools/token-generator/` and `tools/vdata-generator/` into `tools/scraper/`. Delete three obsolete research tracks, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`, and two dead tests. Decide on `tools/captcha-solver/live-submit.js`. Commit at the logical checkpoints recommended by the brief (after each structural task).

| ID | Task | Status |
|----|------|--------|
| 66.1 | Deletions + port-version.md Stage 1 reconciliation | in-progress |
| 66.2 | Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep | pending |
| 66.3 | Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`; land CLAUDE.md/README.md updates | pending |
| 66.4 | Investigate `tools/puppeteer/live-submit.js`; report recommendation and pause for user | pending |
| 66.5 | Act on live-submit decision (shape defined after 66.4) | pending |
| 66.6 | Final verification sweep + close phase (delete plan.md, project-brief.md) | pending |

---

## Current Task

**ID**: 66.1
**Title**: Deletions + port-version.md Stage 1 reconciliation
**Phase**: Phase 66 — Simplification Pass
**Status**: in-progress

### Goal
Execute all deletions called for in the brief (three `research/` subdirs, three files under `research/template-pool/`, two obsolete tests, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`), drop the two test names from `package.json`'s `test` script, and reconcile `.claude/commands/port-version.md` Stage 1 — which runs `node research/tdc-register-vm/decoder.js $ARGUMENTS` and would break the slash command once that decoder is deleted. `npm test` must remain green after this single commit.

### Context
Filesystem checks already performed — paths and importers confirmed:

**Deletions (whole directories)**:
- `research/tdc-register-vm/` (14 files, 12-step decompiler)
- `research/vm-slide-stack-vm/` (stack-VM analysis scripts)
- `research/captcha-orchestrator/` (orchestrator-flow analysis)

**Deletions (specific files)**:
- `research/template-pool/README.md`
- `research/template-pool/survey.js`
- `research/template-pool/diagnose.js`
- `tests/test-tdc-survey.js`
- `tests/test-tdc-diagnose.js`
- `.claude/skills/port-opcodes.md` (then remove the `.claude/skills/` directory, confirmed to contain no other files)
- `.claude/rules/research-artifacts.md`

After these deletions, `research/` contains exactly:
```
research/
└── template-pool/
    └── live-comparison.js
```

**`package.json` `test` script** currently lists both obsolete tests and must be updated:
```
"test": "node --test tests/test-vdata-generator-encoder.js tests/test-vdata-builder.js tests/test-vdata-for-post.js tests/test-scraper.js tests/test-structure-extractor.js tests/test-outer-pipeline.js tests/test-tdc-survey.js tests/test-tdc-diagnose.js tests/test-auto-port.js tests/test-phase49-profile-fixes.js"
```
Drop `tests/test-tdc-survey.js` and `tests/test-tdc-diagnose.js`; keep the other eight entries exactly as they are.

**`.claude/commands/port-version.md` Stage 1 reconciliation** (approved by user before dispatch):
Stage 1 (lines 16–28) currently runs `node research/tdc-register-vm/decoder.js $ARGUMENTS` to produce `output/<stem>/decoded.json`. Stages 2-4 take `$ARGUMENTS` directly and do not consume `decoded.json`, so Stage 1 is an orphan once the decoder is deleted. Rewrite: delete Stage 1 entirely and renumber existing Stages 2→1, 3→2, 4→3, 5→4. Update every in-body "Stage N" back-reference (grep for `Stage 2`, `Stage 3`, `Stage 4`, `Stage 5` after the rename).

**No other `.claude/commands/` file references the paths deleted here** — `scrape.md` references only `tools/scraper/cli.js`, which is untouched in this task.

**Dependency check** — these deletions have no remaining code consumers:
- `research/tdc-register-vm/` is referenced only by `.claude/commands/port-version.md` Stage 1 (handled above) and by prose in `research/vm-slide-stack-vm/` docs (those docs are themselves deleted).
- `research/vm-slide-stack-vm/` has no consumers outside its own directory (`research/captcha-orchestrator/` prose refers to it, but that directory is also deleted).
- `research/captcha-orchestrator/` has no consumers outside its own directory.
- `tests/test-tdc-survey.js` targets `research/template-pool/survey.js` (deleted together).
- `tests/test-tdc-diagnose.js` targets `research/template-pool/diagnose.js` (deleted together).
- `.claude/skills/port-opcodes.md` — no other skill or command references it.
- `.claude/rules/research-artifacts.md` — not referenced by `CLAUDE.md` or any other rule.

**CLAUDE.md's Documentation Index and existing rule listing** — already rewritten (unstaged) to the post-cleanup state: `research-artifacts` is no longer listed. No CLAUDE.md edit is needed in this task.

**Do not touch** `tests/fixtures/`, `tests/asset/`, `profiles/`, or `.claude/settings.local.json`. Do not touch `output/` or `results.json` at the repo root (untracked artifacts, out of scope for this pass).

### Implementation Steps
1. Edit `package.json`: in the `test` script, remove ` tests/test-tdc-survey.js tests/test-tdc-diagnose.js` (keep the surrounding whitespace tidy — exactly one space between remaining filenames).
2. Run `npm test` and confirm 8/8 test files pass — this is the pre-deletion checkpoint proving the suite is internally consistent before files disappear.
3. `git rm -r research/tdc-register-vm research/vm-slide-stack-vm research/captcha-orchestrator`.
4. `git rm research/template-pool/README.md research/template-pool/survey.js research/template-pool/diagnose.js`.
5. `git rm tests/test-tdc-survey.js tests/test-tdc-diagnose.js`.
6. `git rm .claude/skills/port-opcodes.md`, then `rmdir .claude/skills` (should be empty; fail loudly if not — investigate).
7. `git rm .claude/rules/research-artifacts.md`.
8. Edit `.claude/commands/port-version.md`:
   - Delete the block from line 14 (`---`) through line 30 (`---`), which is the whole Stage 1 section including its trailing separator.
   - Rewrite remaining stage headings: `## Stage 2 — Auto-Map Opcodes` → `## Stage 1 — Auto-Map Opcodes`, `## Stage 3 — Extract XTEA Key` → `## Stage 2 — Extract XTEA Key`, `## Stage 4 — Verify Token` → `## Stage 3 — Verify Token`, `## Stage 5 — Report` → `## Stage 4 — Report`.
   - Update every in-body `Stage N` back-reference (e.g. "opcode table from Stage 2" → "opcode table from Stage 1"). Grep the file after edits: `grep -n "Stage [1-5]" .claude/commands/port-version.md` and confirm each reference resolves to the renumbered scheme.
9. Run `npm test` again — must be 8/8 green.
10. Run the residual-reference sweep:
    - `grep -rn "research/tdc-register-vm\|research/vm-slide-stack-vm\|research/captcha-orchestrator" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .` → must return zero hits (excluding `plan.md` and `project-brief.md` themselves, which still reference the deleted paths as planning context and get removed in 66.6).
    - `grep -rn "research/template-pool/\(survey\|diagnose\|README\)" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .` → zero hits outside `plan.md`/`project-brief.md`.
    - `grep -rn "test-tdc-\(survey\|diagnose\)" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .` → zero hits outside `plan.md`/`project-brief.md`.
    - `grep -rn "skills/port-opcodes\|research-artifacts" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .` → zero hits outside `plan.md`/`project-brief.md`.

### Verification
- [ ] `git status --short` shows exactly: `M package.json`, `M .claude/commands/port-version.md`, and `D` entries for all deleted paths. No unexpected modifications.
- [ ] `ls research/` shows only `template-pool/`; `ls research/template-pool/` shows only `live-comparison.js`.
- [ ] `ls .claude/skills` fails with "No such file or directory" (directory removed).
- [ ] `.claude/rules/` contains exactly three files: `coding-style.md`, `output-versioning.md`, `verify-dont-assume.md`.
- [ ] `grep -n "Stage " .claude/commands/port-version.md` shows only `Stage 1` through `Stage 4`, no `Stage 5`, and every back-reference is consistent.
- [ ] `npm test` passes — 8 test files, all green.
- [ ] All four residual-reference greps from step 10 return zero hits outside `plan.md` and `project-brief.md`.

### Suggested Agent
`general-purpose` — mechanical deletion + one clear markdown rewrite with runnable verification. No specialized agent fits better.
