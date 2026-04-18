# Plan

## Status
Current phase: **Phase 64** — Cleanup pass
Current task: **64.1** — Remove `output/` (tracked + untracked)

> Phases 38–63 closed (errorCode -1 → 0 investigation). Detail in `git log`.

---

## Phases

### Phases 38–63 — DONE
> Investigation pass that took the scraper from persistent errorCode -1 to errorCode 0. Phase 63 closed with a slim scraper that uses the standalone-proven flow. All prior tasks archived — see `git log --grep="Task:"`.

### Phase 64: Cleanup pass
> Strip development residue (`output/`, `targets/`, `sample/`, `history/`, `scripts/`, dead research tracks, 9 tests, 4 docs, stale `plan.md`), scrub dangling path references across docs + README + `.claude/`, rewrite `docs/HAR_ANALYSIS.md`, leave `tools/captcha-solver/live-submit.js` with a `TODO(follow-up)` marker, flag (do not remove) dependency suspects, keep `npm test` green. Final act: delete `plan.md` and `project-brief.md` themselves.

| ID | Task | Status |
|----|------|--------|
| 64.1 | Remove `output/` (252 tracked files + all untracked content) | pending |
| 64.2 | Remove `targets/`, `sample/`, `results.json`, the 9 broken-by-implication test files; update `package.json`'s `test` script; leave `TODO(follow-up)` in `tools/captcha-solver/live-submit.js` above the `sample/` reads | pending |
| 64.3 | Remove 5 dead research tracks (`research/errorcode-12/`, `research/scraper-tls-impersonation/`, `research/collector-fields/`, `research/eks-payload/`, `research/key-mod/`) and `docs/ERRORCODE_12_INVESTIGATION.md` | pending |
| 64.4 | Remove `scripts/`, `history/`, `docs/PROGRESS.md`, `docs/WORKFLOW.md`, `docs/CONVENTIONS.md` | pending |
| 64.5 | Remove `.claude/commands/fetch-latest.md` and `.claude/rules/targets-readonly.md` | pending |
| 64.6 | Remove `decompile` script from `package.json` | pending |
| 64.7 | Doc path sweep — scrub `targets/tdc*.js` and `sample/*` citations across `docs/` (excluding `HAR_ANALYSIS.md`), `README.md`, and `.claude/` (agents, commands, skills) | pending |
| 64.8 | Rewrite `docs/HAR_ANALYSIS.md` — abstract description of the captured flow, cross-references to current docs, protocol analysis preserved | pending |
| 64.9 | Dependency usage audit — report remaining references to `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `canvas` after earlier cleanup tasks land (report only — do not remove) | pending |
| 64.10 | Final: delete `plan.md` and `project-brief.md` | pending |

---

## Current Task

**ID**: 64.1
**Title**: Remove `output/` (tracked + untracked)
**Phase**: Phase 64 — Cleanup pass
**Status**: in-progress

### Goal
Delete all contents of `output/` — 252 tracked files plus all untracked subdirectories (phase-48-session-audit, phase-49-body-diff, phase-51-xtea-fidelity, phase-55, phase-57, phase-58, etc.). Every artifact is re-runnable from the stable tools. This is the largest single delete; prepping the tree makes the subsequent batches easier to reason about.

### Context

- `output/` contains run artifacts from Phases 38–63 — all re-runnable from `tools/token-generator/`, `tools/porting-pipeline/`, `tools/scraper/`, and friends. Nothing in `output/` is an input to any surviving script or test.
- `git ls-files output/` reports 252 tracked files. Untracked content (see `git status` snapshot) also lives under `output/` and must be removed.
- `.gitignore` currently has no `output/` entry. After this task, `output/` should simply not exist — whether to ignore it in the future is out of scope for this cleanup.
- No production code depends on `output/`. `research/**/README.md` may reference `output/<track>/` paths as documentation of where artifacts go — that's fine, those docs survive.
- Untracked working-tree modifications (`.claude/rules/*.md`, `CLAUDE.md`, `project-brief.md`, etc.) are unrelated and must not be touched by this task.

### Implementation Steps
1. `git rm -r output/` to remove all 252 tracked files.
2. `rm -rf output/` to remove remaining untracked contents.
3. Confirm `output/` is gone: `ls output/ 2>&1` should report "No such file or directory".
4. Confirm staged removals are exactly the 252 tracked files — no collateral.

### Verification
- [ ] `test ! -e output/` exits 0 (directory is gone)
- [ ] `git ls-files output/` produces zero lines
- [ ] `git status --short | grep '^.D output/' | wc -l` equals 252 (exactly the tracked files, staged for deletion)
- [ ] `git diff --cached --name-only | grep -v '^output/' | wc -l` equals 0 (no non-`output/` paths staged)
- [ ] `npm test` still runs (deferred to 64.2 since test script update is there — but `node -e "require('./package.json')"` succeeds)

### Suggested Agent
general-purpose — pure deletion work, no code generation or analysis required.

---

## Execution Notes

- **Scaffold baseline**: before dispatching 64.1, the director commits the currently-uncommitted scaffold changes (`CLAUDE.md`, `.claude/rules/*.md` refresh, deleted `.claude/settings.json`, revised `project-brief.md`) together with this fresh `plan.md` as a single `chore(ai):` commit. Non-scaffold uncommitted changes (stray `output/*` edits, `results.json` edit) are left unstaged — they'll be swept by 64.1 / 64.2 anyway.
- **Test cadence**: run `npm test` after 64.2, 64.3, 64.4, 64.6, 64.8 — not just at the end. A regression outside the 9 expected deletions halts the pass for diagnosis.
- **Protected paths**: `tools/token-generator/`, `tools/porting-pipeline/`, `tools/scraper/`, `tools/captcha-solver/{captcha-client,slide-solver}.js`, `tools/captcha-solver/slide-solver.py`. Doc sweeps touching these halt for user confirmation.
- **Final cleanup (64.10)**: deletes both `plan.md` (this file) and `project-brief.md`. The commit body is the final journal entry for the pass.
