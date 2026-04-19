# Plan

## Status
Current phase: Phase 66 — Simplification Pass
Current task: 66.5 — Delete `tools/puppeteer/live-submit.js`

---

## Phases

### Phase 66: Simplification Pass
> Shrink the project surface area to (1) pure-Node scraper, (2) Puppeteer scraper (renamed from `captcha-solver`), (3) porting pipeline, (4) docs. Inline `tools/token-generator/` and `tools/vdata-generator/` into `tools/scraper/`. Delete three obsolete research tracks, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`, and two dead tests. Decide on `tools/puppeteer/live-submit.js`. Commit at the logical checkpoints recommended by the brief (after each structural task), then batch prose/doc citation cleanup into one dedicated sweep at the end.

| ID | Task | Status |
|----|------|--------|
| 66.1 | Deletions + port-version.md Stage 1 reconciliation | done |
| 66.2 | Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep | done |
| 66.3 | Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`; land CLAUDE.md/README.md updates | done |
| 66.4 | Investigate `tools/puppeteer/live-submit.js`; report recommendation (user accepted: delete) | done |
| 66.5 | Delete `tools/puppeteer/live-submit.js` (dead code — no consumer, broken at runtime) | in-progress |
| 66.6 | Doc-citation sweep — update prose/comments/JSON metadata that cites deleted or renamed paths | pending |
| 66.7 | Final verification sweep + close phase (delete plan.md, project-brief.md) | pending |

---

## Current Task

**ID**: 66.5
**Title**: Delete `tools/puppeteer/live-submit.js`
**Phase**: Phase 66 — Simplification Pass
**Status**: in-progress

### Goal
Remove `tools/puppeteer/live-submit.js` from the tree. Per 66.4's investigation the file has no consumer, is already broken at runtime (reads `sample/slide-jy.js` and `sample/vm_slide.js`, both deleted in Phase 64.2 — explicit `TODO` at line 496), and its claimed sibling `chrome-cd-inject.js` also doesn't exist. User accepted the delete recommendation. No replacement is created — if the investigation-harness capabilities are wanted later, they'll be rebuilt cleanly inside `tools/porting-pipeline/`.

### Context
- External references outside `plan.md` / `project-brief.md` (both scheduled for deletion in 66.7) and the file itself: **none** (confirmed by `grep -rn "live-submit" --include='*.js' --include='*.json' --include='*.md' --include='*.py'`).
- Slash commands: neither `.claude/commands/scrape.md` nor `.claude/commands/port-version.md` references `live-submit`.
- `CLAUDE.md` directory layout lists `tools/puppeteer/` without naming `live-submit.js` as a kept component; `README.md` likewise. No doc edit needed for this deletion.
- The file's internal imports (updated in 66.3) and its stale docstring disappear with the file — nothing to clean up externally.

### Implementation Steps
1. `git rm tools/puppeteer/live-submit.js`.
2. Run `npm test` — must be 8/8 green (same 214/0/2 baseline).
3. Run `node tools/puppeteer/cli.js --help` — must exit 0 (confirms the kept CLI still resolves its `./captcha-solver` sibling).
4. Run one sweep to confirm no straggler references remain in code/config/docs outside the two planning files:
   ```
   grep -rn "live-submit" --include='*.js' --include='*.json' --include='*.md' --include='*.py' --exclude-dir=output --exclude-dir=node_modules --exclude-dir=.git .
   ```
   Expected hits: only `plan.md` and `project-brief.md`. Any other hit is a leftover to surface before committing.

### Verification
- [ ] `git status --short` shows `D  tools/puppeteer/live-submit.js` and no other unexpected entries.
- [ ] `npm test` passes (214/0/2).
- [ ] `node tools/puppeteer/cli.js --help` exits 0.
- [ ] Post-delete `live-submit` sweep returns only `plan.md` and `project-brief.md` hits.

### Executor
Director (trivial one-file `git rm` + verification; dispatch overhead would exceed the work).
