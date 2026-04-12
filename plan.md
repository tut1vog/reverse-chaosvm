# Plan

## Status
Current phase: Phase 37
Current task: 37.7 — Archive project-brief.md and docs/PROGRESS.md

---

## Phases

### Phases 1-36: All prior work (done)
> See `history/` for detailed records.

### Phase 37: Project Cleanup
> Audit and clean up scripts, documentation, and tests.

| ID | Task | Status |
|----|------|--------|
| 37.1 | Remove obsolete scripts | done |
| 37.2 | Remove obsolete dynamic tracers and targets | done |
| 37.3 | Fix test-scraper-foundation.js template-cache lookup | done (resolved by 37.2) |
| 37.4 | Tests for template-cache fix | done (unnecessary) |
| 37.5 | Fix test-cfg.js func 272 edge case | done |
| 37.6 | Fix test-emit.js quality thresholds | done |
| 37.7 | Archive project-brief.md and docs/PROGRESS.md | in-progress |
| 37.8 | Update docs/WORKFLOW.md with Phase 11-36 epilogue | pending |
| 37.9 | Update README.md (template count, test count, phase references) | pending |
| 37.10 | Update CLAUDE.md — correct Phase 36 conclusion and add cleanup notes | pending |
| 37.11 | Update docs/VERSION_DIFFERENCES.md — close open questions | pending |
| 37.12 | Add Phase 36 diagnostic findings to docs | pending |

---

## Current Task

**ID**: 37.7
**Title**: Archive project-brief.md and docs/PROGRESS.md
**Phase**: Project Cleanup
**Status**: in-progress

### Goal
Mark two legacy documentation files as archived so they're not mistaken for current-state descriptions.

### Context
- `project-brief.md` — initial project brief, now superseded by CLAUDE.md's richer project description
- `docs/PROGRESS.md` — 1,262 lines of detailed task history from Phases 1-10, valuable as historical reference but misleading as "current state"

Neither should be deleted — they contain historical information. They just need clear ARCHIVED headers.

### Implementation Steps
1. Read the first ~30 lines of `project-brief.md`. Add a prominent header at the top:
   ```markdown
   > **ARCHIVED** — This is the original project brief. Current project state and architecture are described in `CLAUDE.md`. This file is preserved for historical reference.
   ```
2. Read the first ~30 lines of `docs/PROGRESS.md`. Add a prominent header at the top:
   ```markdown
   > **ARCHIVED** — This file documents Phases 1-10 in detail. For Phases 11-36 see `history/` day-files and `docs/WORKFLOW.md`. Preserved for historical reference.
   ```
3. Do not modify any other content in these files.

### Verification
- [ ] `head -5 project-brief.md` shows the ARCHIVED header
- [ ] `head -5 docs/PROGRESS.md` shows the ARCHIVED header
- [ ] Neither file was otherwise modified (check with `git diff --stat`)

### Suggested Agent
general-purpose — simple two-file edit
