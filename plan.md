# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: 65.6 — Delete `plan.md` and close Phase 65

---

## Phases

### Phase 65: Legacy code cleanup
> Remove unreferenced legacy code identified in the post-Phase-64 audit (dead captcha endpoint, jsdom vData harness, orphan tracers, broken fingerprint harvester) without disturbing the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper.

| ID | Task | Status |
|----|------|--------|
| 65.1 | Delete dead `_getSigLegacy()` method from `tools/captcha-solver/captcha-client.js` | done |
| 65.2 | Relocate `tools/scraper/vdata-harness.js` → `research/vm-slide-stack-vm/vdata-harness.js`; update 2 research-script importers, 4 research doc references, and the CLAUDE.md/README.md/scraper.js header carve-outs | done |
| 65.3 | Delete four orphan tracers in `tools/dynamic-tracers/`: `harness.js`, `encoding-tracer.js`, `instrument.js`, `payload-tracer.js` | done |
| 65.3.1 | Delete orphan `tools/token-generator/integration-verify.js` (user-confirmed) | done |
| 65.4 | Delete `tools/captcha-solver/fingerprint-harvester.js` (user-confirmed delete — re-harvest capability not preserved; committed `profiles/chrome-fingerprint.json` already covers the live scraper) | done |
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | done |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Current Task

**ID**: 65.6
**Title**: Delete `plan.md` and close Phase 65
**Phase**: Phase 65 — Legacy code cleanup
**Status**: pending (awaiting dispatch)

### Goal
Close Phase 65 by deleting `plan.md`. Mirrors Phase 64.10 precedent: the per-pass brief has served its purpose and the journal lives in `git log`.

### Implementation Steps
1. `git rm plan.md`.
2. Commit with subject `chore(cleanup): 65.6 — delete plan.md; Phase 65 complete`. Director handles the commit.

### Verification
- [ ] `ls plan.md` — fails.
- [ ] `git status --short` — clean (except the pre-existing `M research/vm-slide-stack-vm/FN-20539-SLOT8-HOP.md` and untracked `output/`, neither touched by Phase 65).
- [ ] `npm test` — still 230/0/2.

### Suggested Agent
Director handles directly — this is a one-line `git rm` followed by a commit. No subagent needed.

---

## Notes

- **Tests not in `npm test`** — `tests/test-behavioral-events.js`, `tests/test-chrome-profile-collect.js`, `tests/test-slide-solver.js`, `tests/test-slide-solver-real.js` exist in `tests/` but are absent from `package.json`'s test script. Out of Phase 65 scope; flagged for a future pass if the user wants them reviewed.
- **Backward-compat shims are intentionally preserved**: 2-element `keyModConstants` handling in `template-cache.js`, `collect-generator.js`, `key-extractor.js`, `token-verifier.js`; `colorGamutLegacy` / Flash-plugin fields in `collector-schema.js` (these describe legacy *browser* features, not legacy code).
- **Commit convention**: each task ships as its own `chore(cleanup): 65.M — <subject>` commit per Phase 64 precedent.
