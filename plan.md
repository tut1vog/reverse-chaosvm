# Plan

## Status
Current phase: Phase 70 — gitignore hygiene
Current task: 70.1 — Stop tracking tools/scraper/cache/ and ignore untracked output/ subdirs

---

## Phases

### Phase 70: gitignore hygiene
> Stop `git status` from surfacing run-local output/ noise, and stop tracking `tools/scraper/cache/templates.json` (a runtime cache, not a source artifact).

| ID | Task | Status |
|----|------|--------|
| 70.1 | Update .gitignore, git rm --cached the tracked cache file | in-progress |

---

## Current Task

**ID**: 70.1
**Title**: Update .gitignore, git rm --cached the tracked cache file
**Phase**: Phase 70 — gitignore hygiene
**Status**: in-progress

### Goal
Make git stop noticing `tools/scraper/cache/templates.json` (runtime cache — grows every scraper run, not a source artifact) and stop surfacing untracked run-local `output/` subdirs in `git status`. Preserve the three committed output subdirs (`output/phase-67-diagnosis/`, `output/port-survey/`, `output/scraper-stress/`) that back committed documentation.

### Context
- **`.gitignore` current contents** (6 entries):
  ```
  node_modules/
  .venv/
  output/dynamic/session-*.json
  *.pyc
  __pycache__/
  .claude/settings.local.json
  ```
- **Tracked under `output/`** (44 files total per `git ls-files output/`): three top-level subdirs — `output/phase-67-diagnosis/`, `output/port-survey/`, `output/scraper-stress/`. The `output/scraper-stress/results.md` file is cited from `docs/CAPTCHA_ORCHESTRATOR.md:703-718` (the `errorCode 12` IP-rate-limit finding), so these must remain tracked and readable.
- **Untracked under `output/`**: `phase-52-audit/`, `phase-55/`, `puppeteer-capture/`, `tdc-01/`…`tdc-30/`, `tdc-autoport-88ebeea62f566ec5/`, `tdc-autoport-f53142c54fc43699/`, `tdc-exp-A-1776485057791/`. Total ~1.4 MB on disk. Leaving on disk — only removing them from git's view.
- **`tools/scraper/cache/`**: contains only `templates.json` (30 KB, 2447 lines). Last touched by commits `b9870cd` (initial restructure) and `61257ef` (Phase 47.1 Chrome-profile collect). It is a runtime cache populated by scraper runs. User explicitly asked for it to stop being tracked.
- **Strategy**: whitelist-style pattern for `output/`. `output/*` ignores everything, then `!output/<subdir>/` lines re-allow each currently-tracked subdir. This way any new experiment directory is ignored by default; promoting future outputs to tracked state becomes a deliberate whitelist edit.

### Implementation Steps
1. Edit `.gitignore`:
   - **Delete** the existing `output/dynamic/session-*.json` line (redundant under the new `output/*` rule, per user instruction during plan confirmation).
   - **Append** a new section at the end, preserving the remaining existing entries:
     ```
     # output/ — ignore run-local artifacts by default; whitelist the subdirs we intentionally track
     output/*
     !output/phase-67-diagnosis/
     !output/port-survey/
     !output/scraper-stress/

     # runtime cache populated by tools/scraper — not a source artifact
     tools/scraper/cache/
     ```
2. Stop tracking the cache file without deleting it from disk:
   ```
   git rm --cached tools/scraper/cache/templates.json
   ```
3. Do NOT delete any files from disk.
4. Do NOT touch any file under `output/` — the whitelist keeps the three tracked subdirs intact; only `git status` presentation changes.

### Verification
- [ ] `git ls-files output/ | awk -F/ '{print $1"/"$2}' | sort -u` still prints exactly `output/phase-67-diagnosis`, `output/port-survey`, `output/scraper-stress` — no tracked files under output/ were removed.
- [ ] `git status --short` shows no `??` entries under `output/` (all untracked subdirs now ignored), and no `M tools/scraper/cache/templates.json`.
- [ ] `git check-ignore -v output/tdc-01 output/puppeteer-capture tools/scraper/cache/templates.json` prints a matching rule for each (all three should be ignored by the new `.gitignore` entries).
- [ ] `git check-ignore -v output/port-survey output/scraper-stress output/phase-67-diagnosis` exits non-zero for each (NOT ignored — whitelist works).
- [ ] `ls tools/scraper/cache/templates.json` still exists on disk (only the tracking was removed).
- [ ] `git diff --stat HEAD` on the staged state shows: `.gitignore` modified and `tools/scraper/cache/templates.json` deleted — nothing else.

### Suggested Agent
`general-purpose` — single `.gitignore` edit + one `git rm --cached`. No specialist needed.
