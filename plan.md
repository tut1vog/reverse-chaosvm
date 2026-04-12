# Plan

## Status
Current phase: Phase 37
Current task: 37.5 — Fix test-cfg.js func 272 edge case

---

## Phases

### Phases 1-36: All prior work (done)
> See `history/` for detailed records. Key milestones: decompiler pipeline,
> byte-identical token generator, automated porting pipeline (all 10 templates),
> headless scraper, errorCode 12 diagnosed as fingerprint/rate-limit issue.

### Phase 37: Project Cleanup
> Audit and clean up scripts, documentation, and tests. Remove obsolete files,
> fix inaccurate docs, update stale references, fix the 2 permanently-failing tests.

| ID | Task | Status |
|----|------|--------|
| 37.1 | Remove obsolete scripts | done |
| 37.2 | Remove obsolete dynamic tracers and targets | done |
| 37.3 | Fix test-scraper-foundation.js template-cache lookup | done (resolved by 37.2) |
| 37.4 | Tests for template-cache fix | done (unnecessary — 37.3 resolved by cleanup) |
| 37.5 | Fix test-cfg.js func 272 edge case | in-progress |
| 37.6 | Fix test-emit.js quality thresholds | pending |
| 37.7 | Archive project-brief.md and docs/PROGRESS.md | pending |
| 37.8 | Update docs/WORKFLOW.md with Phase 11-36 epilogue | pending |
| 37.9 | Update README.md (template count, test count, phase references) | pending |
| 37.10 | Update CLAUDE.md — correct Phase 36 conclusion and add cleanup notes | pending |
| 37.11 | Update docs/VERSION_DIFFERENCES.md — close open questions | pending |
| 37.12 | Add Phase 36 diagnostic findings to docs | pending |

---

## Current Task

**ID**: 37.5
**Title**: Fix test-cfg.js func 272 edge case
**Phase**: Project Cleanup
**Status**: in-progress

### Goal
Fix the 1 failing assertion in test-cfg.js: function 272 block b3 has a JMP with 0 successors (expected 1). Target address 41580 isn't resolved as a valid block boundary.

### Context
- Test file: `tests/test-cfg.js`
- CFG builder: `decompiler/cfg-builder.js`
- The test asserts that every JMP instruction should have exactly 1 successor (its target block)
- Function 272 block b3 has a JMP whose target address (41580) doesn't resolve to a block start
- This is the only failure out of 584 assertions in the file
- Current baseline: 294/296 tests pass, 2 known failures (test-cfg.js and test-emit.js)

### Implementation Steps
1. Read `tests/test-cfg.js` to find the exact assertion for func 272
2. Read `decompiler/cfg-builder.js` to understand how JMP targets are resolved to block boundaries
3. Investigate what's at address 41580 in the disassembly — is it a valid instruction? Past the function boundary? An unreachable dead code target?
4. Either:
   - (a) Fix the CFG builder to handle this edge case correctly, OR
   - (b) If the JMP target is genuinely outside the function (dead code / unreachable), document this as a known limitation and adjust the test assertion with a comment explaining why

### Verification
- [ ] `node --test tests/test-cfg.js` passes with 0 failures
- [ ] No other test regressions: `npm test` ≥ 294/296

### Suggested Agent
general-purpose — requires investigation of disassembly output and CFG builder logic
