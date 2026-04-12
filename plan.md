# Plan

## Status
Current phase: Phase 37
Current task: 37.8 — Update docs/WORKFLOW.md and README.md

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
| 37.7 | Archive project-brief.md and docs/PROGRESS.md | done |
| 37.8 | Update docs/WORKFLOW.md + README.md | in-progress |
| 37.9 | (merged into 37.8) | done |
| 37.10 | Update CLAUDE.md — correct Phase 36 conclusion | pending |
| 37.11 | Update docs/VERSION_DIFFERENCES.md — close open questions | pending |
| 37.12 | Add Phase 36 diagnostic findings to docs | pending |

---

## Current Task

**ID**: 37.8
**Title**: Update docs/WORKFLOW.md and README.md
**Phase**: Project Cleanup
**Status**: in-progress

### Goal
Update two stale reference docs: add a Phase 11-36 epilogue to WORKFLOW.md, and fix stale counts/references in README.md.

### Context

**docs/WORKFLOW.md** (333 lines) ends with:
> Phases 1–8: ✅ Complete | 28 tasks total | 28 test rounds | All passing
> Phase 9: ✅ Complete (9.1–9.6 all passing)
> Phase 10: ✅ Complete (conditional) — Puppeteer solver works, jsdom solver gets errorCode 9
> **Summary**: 51 test rounds across 10 phases.

Needs an epilogue listing Phases 11-36 with one-line summaries, pointing to `history/` for details.

**README.md** stale references (from grep):
- Line 27: "Tested on 5 builds across 3 distinct templates" — should reflect 10+ observed builds
- Line 116: "Test suite (90 passing, 2 known issues)" — now 296 passing, 0 issues
- Line 185: "3 distinct templates observed" — 10+ now
- Line 220: "10-phase development workflow (51 test rounds)" — more phases now
- Line 271-273: "90 of 92 tests pass" + known failures — all 296 pass now

### Implementation Steps

#### Part A: docs/WORKFLOW.md
Append a new section after the "Current Status" section:

```markdown
---

## Epilogue: Phases 11–36

After the initial 10 phases, work continued through 26 more phases focused on multi-version support, automated porting, and live validation. Each phase is recorded in day-files under `history/` (e.g. `history/20260409.md`). Summary by phase:

- **Phase 11–20**: Automated porting pipeline (vm-parser, opcode-mapper, key-extractor, token-verifier); support for Templates A, B, C; multi-build verification
- **Phase 21–27**: Headless scraper (`scraper/`); jsdom vData generation; slide CAPTCHA HTTP flow; template cache with source-hash keys
- **Phase 28–32**: Live testing; corrected documentation (TLS 403 was sess-missing, not TLS fingerprinting); source-hash cache key (replacing TDC_NAME)
- **Phase 33**: TDC survey — collected 10 unique builds from live rotation, documented errorCode distribution
- **Phase 34**: vm-parser obfuscation support (bracket-notation thisCtx extraction, catch-var fallback heuristic)
- **Phase 35**: Source deobfuscator for string-decoder + helper-wrapper obfuscation; all 10 builds now port successfully
- **Phase 36**: errorCode 12 diagnostic survey — determined token rejection correlates with fingerprint/rate-limit, not token generation
- **Phase 37**: Project cleanup — removed 20 obsolete files, fixed all test failures (296/296), archived legacy docs

For task-level detail see `history/YYYYMMDD.md` day-files.
```

#### Part B: README.md

Apply the following edits:

1. Line 27 — change:
   - FROM: `Tested on 5 builds across 3 distinct templates — all produce byte-identical tokens.`
   - TO: `Tested on 10+ live builds across multiple template architectures — all produce byte-identical tokens.`

2. Line 116 — change:
   - FROM: `# Test suite (90 passing, 2 known issues)`
   - TO: `# Test suite (296 passing, all green)`

3. Line 185 — change:
   - FROM: `3 distinct templates observed. Each has a unique XTEA key.`
   - TO: `10+ distinct builds observed in live rotation across multiple template architectures. Each build has a unique XTEA key.`

4. Line 220 — change:
   - FROM: `10-phase development workflow (51 test rounds)`
   - TO: `Multi-phase development workflow — see history/ for per-phase day-files`

5. Lines 271-274 — change the test results section. Find:
   ```
   90 of 92 tests pass. The 2 failures are known pre-existing issues:
   - `test-cfg.js`: 583/584 assertions pass (1 edge case in func 272)
   - `test-emit.js`: Code quality threshold assertions (cosmetic, not functional)
   ```
   REPLACE with:
   ```
   All 296 tests pass.
   ```

### Verification
- [ ] `grep -n "51 test rounds\|90 of 92\|3 distinct templates\|583/584" README.md docs/WORKFLOW.md` returns no hits
- [ ] `tail -20 docs/WORKFLOW.md` shows the Phase 11-36 epilogue
- [ ] `npm test` still 296/296

### Suggested Agent
general-purpose — documentation edits across 2 files
