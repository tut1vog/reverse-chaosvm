# Plan

## Status
Current phase: Phase 66 — Simplification Pass
Current task: 66.2 — Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep

---

## Phases

### Phase 66: Simplification Pass
> Shrink the project surface area to (1) pure-Node scraper, (2) Puppeteer scraper (renamed from `captcha-solver`), (3) porting pipeline, (4) docs. Inline `tools/token-generator/` and `tools/vdata-generator/` into `tools/scraper/`. Delete three obsolete research tracks, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`, and two dead tests. Decide on `tools/captcha-solver/live-submit.js`. Commit at the logical checkpoints recommended by the brief (after each structural task), then batch prose/doc citation cleanup into one dedicated sweep at the end.

| ID | Task | Status |
|----|------|--------|
| 66.1 | Deletions + port-version.md Stage 1 reconciliation | done |
| 66.2 | Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep | in-progress |
| 66.3 | Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`; land CLAUDE.md/README.md updates | pending |
| 66.4 | Investigate `tools/puppeteer/live-submit.js`; report recommendation and pause for user | pending |
| 66.5 | Act on live-submit decision (shape defined after 66.4) | pending |
| 66.6 | Doc-citation sweep — update prose/comments/JSON metadata that cites deleted or renamed paths | pending |
| 66.7 | Final verification sweep + close phase (delete plan.md, project-brief.md) | pending |

---

## Current Task

**ID**: 66.2
**Title**: Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep
**Phase**: Phase 66 — Simplification Pass
**Status**: in-progress

### Goal
Rename `tools/captcha-solver/` to `tools/puppeteer/` via `git mv` (so it records as a rename, not delete+add), update every `require(...)` that points into the renamed directory, update the `solve:puppeteer` script in `package.json`, and update the one already-known stale path in `.claude/rules/coding-style.md` (line 14: `tools/captcha-solver/slide-solver.py`). File basenames inside the directory are unchanged — only the directory name moves.

### Context
Fresh greps performed against the current (post-66.1) working tree; these are the exact importers that must be updated:

**Code-level `require()` references** (from `tools/`, `tests/`, `research/`):
- `tools/scraper/scraper.js:21` — `require('../captcha-solver/captcha-client')`
- `tools/scraper/scraper.js:23` — `require('../captcha-solver/slide-solver')`
- `tools/scraper/caplog-beacon.js:21` — `require('../captcha-solver/captcha-client')`
- `tools/porting-pipeline/structure-extractor.js:25` — `require('../captcha-solver/captcha-client')`
- `research/template-pool/live-comparison.js:24` — `require('../../tools/captcha-solver/captcha-client')`
- `tests/test-slide-solver.js:24` — `require('../tools/captcha-solver/slide-solver.js')` (not currently in `npm test`, but still must be updated so the file is not left broken)
- `tests/test-slide-solver-real.js:11` — `require('../tools/captcha-solver/slide-solver.js')` (not in `npm test`, same reason)

**Internal requires that need NO change** (sibling-relative, move together with the directory):
- `tools/captcha-solver/cli.js:18` — `require('./captcha-solver')` — stays unchanged after the move.
- `tools/captcha-solver/live-submit.js` — internal requires of `../token-generator/...` stay unchanged in this task (token-generator is not moved until 66.3; this file's fate will be decided in 66.4).

**`package.json`** — one script path to update:
- `"solve:puppeteer": "node tools/captcha-solver/cli.js"` → `"node tools/puppeteer/cli.js"`

**`.claude/rules/coding-style.md`** — line 14 currently reads:
- `- **Language**: Node.js for all JavaScript. Python is only used for `tools/captcha-solver/slide-solver.py` (OpenCV).`
This is an executable-relevant path embedded in the rule body (`slide-solver.py` is a real file that is being renamed along with its directory), not a prose citation. Update to `tools/puppeteer/slide-solver.py`. This is the only `.claude/` file that needs a 66.2 edit — `.claude/commands/scrape.md` references only `tools/scraper/cli.js` (unchanged), and `.claude/commands/port-version.md` does not reference `captcha-solver`.

**Do NOT update in this task** (deferred to 66.6 doc-citation sweep):
- Any prose/comment/docstring citation of `tools/captcha-solver/` in `docs/*.md`, `tests/*.md`, file-header comments, or JSON metadata. 66.6 will batch these with the `research/*` citation cleanup from 66.1.

**Do NOT touch** `CLAUDE.md` or `README.md` — those already describe the post-cleanup state with `tools/puppeteer/` as the correct path, and will land staged in 66.3. Don't touch `tests/fixtures/`, `tests/asset/`, `profiles/`, or `.claude/settings.local.json`.

### Implementation Steps
1. `git mv tools/captcha-solver tools/puppeteer` from the repo root. Verify with `git status --short` that the rename is recorded as `R  tools/captcha-solver/X -> tools/puppeteer/X` for every file.
2. Update `require()` paths in each of the seven importers listed in the Context section. All updates are a literal substring replacement of `captcha-solver` → `puppeteer` inside the `require(...)` string. Do not touch anything else in these files.
3. Update `package.json`: change `"solve:puppeteer": "node tools/captcha-solver/cli.js"` → `"node tools/puppeteer/cli.js"`. No other edits to the file.
4. Update `.claude/rules/coding-style.md:14`: replace `tools/captcha-solver/slide-solver.py` → `tools/puppeteer/slide-solver.py`. No other edits.
5. Run the code-level-importer sweep (this must return zero hits):
   ```
   grep -rn -e "require([^)]*captcha-solver" --include='*.js' .
   grep -rn -e "tools/captcha-solver" --include='*.json' .
   ```
   The `.js` grep catches any missed `require()`. The `.json` grep catches any missed script path in `package.json` or fixtures.
6. Run `npm test` — must be 8/8 green (same 8 files as the post-66.1 baseline).
7. Run `node tools/puppeteer/cli.js --help` — must exit 0 and print usage referring to the new path.

### Verification
- [ ] `git status --short` shows `tools/captcha-solver/*` → `tools/puppeteer/*` recorded as `R  ` renames (not delete+add pairs) for every file in the directory, plus `M .claude/rules/coding-style.md`, `M package.json`, and `M` entries for the seven importer files listed above.
- [ ] `grep -rn -e "require([^)]*captcha-solver" --include='*.js' .` returns zero hits.
- [ ] `grep -rn "tools/captcha-solver" --include='*.json' .` returns zero hits.
- [ ] `grep -n "solve:puppeteer" package.json` shows the new path `tools/puppeteer/cli.js`.
- [ ] `grep -n "slide-solver.py" .claude/rules/coding-style.md` shows the new path `tools/puppeteer/slide-solver.py`.
- [ ] `npm test` passes — 8 test files, same baseline as post-66.1.
- [ ] `node tools/puppeteer/cli.js --help` exits 0.
- [ ] Residual prose/comment citations of `tools/captcha-solver/` in `docs/*.md` and elsewhere are **expected to exist after this task** — they will be cleaned up in 66.6. Do not fail verification on those.

### Suggested Agent
`general-purpose` — mechanical rename + require-string sweep with one ancillary config update; no specialized agent fits better.
