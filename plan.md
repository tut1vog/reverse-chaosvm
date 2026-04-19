# Plan

## Status
Current phase: Phase 66 — Simplification Pass
Current task: 66.7 — Final verification sweep + close phase

---

## Phases

### Phase 66: Simplification Pass
> Shrink the project surface area to (1) pure-Node scraper, (2) Puppeteer scraper (renamed from `captcha-solver`), (3) porting pipeline, (4) docs. Inline `tools/token-generator/` and `tools/vdata-generator/` into `tools/scraper/`. Delete three obsolete research tracks, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`, two dead tests, and `tools/puppeteer/live-submit.js` (per 66.4 investigation, user-accepted delete). Then sweep prose/comment/JSON citations of deleted and renamed paths. Close with final verification.

| ID | Task | Status |
|----|------|--------|
| 66.1 | Deletions + port-version.md Stage 1 reconciliation | done |
| 66.2 | Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep | done |
| 66.3 | Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`; land CLAUDE.md/README.md updates | done |
| 66.4 | Investigate `tools/puppeteer/live-submit.js`; report recommendation (user accepted: delete) | done |
| 66.5 | Delete `tools/puppeteer/live-submit.js` (dead code) | done |
| 66.6 | Doc-citation sweep — update prose/comments/JSON metadata that cites deleted or renamed paths | done |
| 66.7 | Final verification sweep + close phase (delete plan.md, project-brief.md) | in-progress |

---

## Current Task

**ID**: 66.7
**Title**: Final verification sweep + close phase
**Phase**: Phase 66 — Simplification Pass
**Status**: in-progress

### Goal
Run one consolidated verification against the end-of-phase working tree — every stale-reference grep clean (modulo the two intentional past-tense annotations in `CLAUDE.md`), every CLI `--help` exit 0, `npm test` green — then delete `plan.md` and `project-brief.md` to close Phase 66. Matches the pattern of `793a26b chore(cleanup): 64.10 — delete plan.md and project-brief.md; Phase 64 complete` and `afd91a8 chore(cleanup): 65.6 — delete plan.md; Phase 65 complete`.

### Context
- All structural work is landed (66.1–66.5). Doc-citation sweep landed in 66.6.
- Remaining non-plan/brief hits across all stale-reference greps: exactly 2 lines in `CLAUDE.md` (lines 24–25, past-tense "inlined from former tools/..." annotations). These are intentional historical prose that the user authored; leave them.
- `tests/fixtures/` untouched (per phase constraints). `profiles/` untouched. `.claude/settings*.json` untouched. `output/` and `results.json` remain untracked artifacts.
- `CLAUDE.md` and `README.md` describe post-cleanup reality accurately; no further edits needed.

### Implementation Steps (executed directly by director)
1. Run `npm test`; confirm 214 pass / 0 fail / 2 skipped baseline.
2. Run `node tools/scraper/cli.js --help`, `node tools/puppeteer/cli.js --help`, `node tools/scraper/token-generator/cli.js --help`, `node tools/scraper/vdata-generator/cli.js --help`; each must exit 0.
3. Re-run the six stale-reference greps; confirm each returns only hits in `plan.md`, `project-brief.md`, or the two acknowledged `CLAUDE.md` annotations.
4. `git rm plan.md project-brief.md`.
5. `git status --short` — expect exactly two `D` lines for the planning files, nothing else.
6. Commit with subject `chore(cleanup): 66.7 — delete plan.md and project-brief.md; Phase 66 complete`.

### Verification
- [ ] `npm test` passes (214/0/2).
- [ ] All four kept-CLI `--help` invocations exit 0.
- [ ] Post-deletion greps return zero hits for all six stale-reference patterns (the two `CLAUDE.md` annotations remain — they're intentional).
- [ ] `git log --grep="Phase 66" --oneline` shows seven commits (66.1 through 66.7 plus the initialisation commit).

### Executor
Director — trivial verification + two-file `git rm` + commit.
