# Plan

## Status
Current phase: Phase 37
Current task: 37.2 — Remove obsolete dynamic tracers and targets

---

## Phases

### Phases 1-36: All prior work (done)
> See `history/` for detailed records. Key milestones: decompiler pipeline,
> byte-identical token generator, automated porting pipeline (all 10 templates),
> headless scraper, errorCode 12 diagnosed as fingerprint/rate-limit issue.

### Phase 37: Project Cleanup
> Audit and clean up scripts, documentation, and tests. Remove obsolete files,
> fix inaccurate docs, update stale references, fix the 3 permanently-failing tests.

| ID | Task | Status |
|----|------|--------|
| 37.1 | Remove obsolete scripts | done |
| 37.2 | Remove obsolete dynamic tracers and targets | in-progress |
| 37.3 | Fix test-scraper-foundation.js template-cache lookup | pending |
| 37.4 | Tests for template-cache fix | pending |
| 37.5 | Fix test-cfg.js func 272 edge case | pending |
| 37.6 | Fix test-emit.js quality thresholds | pending |
| 37.7 | Archive project-brief.md and docs/PROGRESS.md | pending |
| 37.8 | Update docs/WORKFLOW.md with Phase 11-36 epilogue | pending |
| 37.9 | Update README.md (template count, test count, phase references) | pending |
| 37.10 | Update CLAUDE.md — correct Phase 36 conclusion and add cleanup notes | pending |
| 37.11 | Update docs/VERSION_DIFFERENCES.md — close open questions | pending |
| 37.12 | Add Phase 36 diagnostic findings to docs | pending |

---

## Current Task

**ID**: 37.2
**Title**: Remove obsolete dynamic tracers and targets
**Phase**: Project Cleanup
**Status**: in-progress

### Goal
Delete 4 superseded dynamic tracers and 4 ad-hoc target files that have no ongoing value.

### Context
The `dynamic/` directory has versioned tracers where older versions are superseded. The `targets/` directory has ad-hoc captures that aren't canonical versions.

### Implementation Steps
1. Delete the following 4 dynamic tracers:
   - `dynamic/v2-token-capture.js` (0 references, superseded by pipeline)
   - `dynamic/chunk-tracer.js` (0 references, one-off tracer)
   - `dynamic/crypto-tracer.js` (superseded by crypto-tracer-v3.js)
   - `dynamic/crypto-tracer-v2.js` (superseded by crypto-tracer-v3.js)
2. Delete the following 4 target files:
   - `targets/tdc-capture.js` (ad-hoc capture, only referenced from output/)
   - `targets/tdc-captured.js` (duplicate concept)
   - `targets/tdc-diag.js` (untracked diagnostic copy)
   - `targets/tdc-live-test.js` (untracked test copy — this is a file, not a directory)
3. Also check if `targets/tdc-live-test` (directory) exists and remove if so.
4. Verify no remaining files import or reference the deleted files.
5. Run `npm test`.

### Verification
- [ ] All 8 files deleted
- [ ] grep for each deleted filename returns no hits in active code
- [ ] `npm test` still 293/296

### Suggested Agent
general-purpose — straightforward file deletion
