# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: 65.4 — Delete `tools/captcha-solver/fingerprint-harvester.js`

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
| 65.4 | Delete `tools/captcha-solver/fingerprint-harvester.js` (user-confirmed delete — re-harvest capability not preserved; committed `profiles/chrome-fingerprint.json` already covers the live scraper) | pending |
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | pending |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Current Task

**ID**: 65.4
**Title**: Delete `tools/captcha-solver/fingerprint-harvester.js`
**Phase**: Phase 65 — Legacy code cleanup
**Status**: pending (awaiting dispatch)

### Goal
Delete a broken, orphan harvester that is unrunnable as-written and produces an output already committed to the repo. User has confirmed delete over fix; re-harvest capability is intentionally dropped.

### Context (verified by the director against the working tree)
- File: `tools/captcha-solver/fingerprint-harvester.js`. Exists at that path.
- Zero external references repo-wide: `grep 'fingerprint-harvester'` returns only two hits outside `plan.md`, and both are self-references inside the file itself (line 4 header title, line 12 usage comment pointing at the broken `src/bot/` path).
- Module header (line 12) documents the expected invocation as `node src/bot/fingerprint-harvester.js` — the `src/bot/` directory does not exist in the current tree. The harvester is therefore unrunnable without reconstructing a path layout that was removed in an earlier refactor.
- Expected output `profiles/chrome-fingerprint.json` is already committed; the live scraper's fingerprint needs are fully covered.
- **Sibling files in `tools/captcha-solver/` are live and must not be touched**: `captcha-client.js`, `captcha-solver.js`, `cli.js`, `live-submit.js`, `slide-solver.js`, `slide-solver.py`. Confirm they all remain after the delete.

### Implementation Steps
1. One Bash call: `git rm tools/captcha-solver/fingerprint-harvester.js`.
2. Do not touch any other file. In particular, do not modify `profiles/chrome-fingerprint.json` or any sibling in `tools/captcha-solver/`.

### Verification
- [ ] `ls tools/captcha-solver/fingerprint-harvester.js` — fails.
- [ ] `ls tools/captcha-solver/` — returns exactly six entries: `captcha-client.js`, `captcha-solver.js`, `cli.js`, `live-submit.js`, `slide-solver.js`, `slide-solver.py`.
- [ ] Grep for `fingerprint-harvester` repo-wide — zero hits outside `plan.md`.
- [ ] `npm test` — baseline holds at 230 pass / 0 fail / 2 skip.
- [ ] `git status --short` — one staged `D` line for `tools/captcha-solver/fingerprint-harvester.js`.

### Suggested Agent
`general-purpose` — one-file delete with verification sweep. Trivial.

---

## Upcoming task briefs (for user review — not yet dispatched)

### 65.5 — End-to-end smoke test of the four protected pipelines

**Why**: The user's explicit constraint is that the decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, and Node.js scraper must all still work after Phase 65. `npm test` covers the scraper's unit tests and the port pipeline's auto-port test but does not actually *run* the four pipelines end to end. This task runs each one once.

**Approach**:
- **Decompiler**: `node research/tdc-register-vm/run.js --input <fresh tdc.js> --output output/phase-65-smoke/decompile/` — confirm the 12-step pipeline produces its expected output artifacts without error.
- **Auto-port pipeline**: `node tools/porting-pipeline/run.js <same fresh tdc.js>` — confirm it produces `opcode-table.json`, `xtea-params.json`, `pipeline-config.json` under `output/<sourcehash>/` and that the verify step reports byte-identical match.
- **Puppeteer CAPTCHA solver**: If network is available, run `node tools/captcha-solver/cli.js --domain example.com` once and confirm the returned ticket is non-empty. If network is unavailable, fall back to `node --check` + unit tests.
- **Node.js scraper**: If network is available, run `node tools/scraper/cli.js --captcha-only --verbose` once and confirm the returned ticket is non-empty. If network is unavailable, fall back to `node --check tools/scraper/cli.js` and rely on `tests/test-scraper.js` coverage from `npm test`.

**Verification**: each of the four pipelines produces its documented artifact or output on at least one happy-path run; where network is unavailable, the fallback (syntax check + unit tests) is logged in the task journal.

### 65.6 — Close Phase 65

Mirror `64.10`: `git rm plan.md`, commit as `chore(cleanup): 65.6 — delete plan.md; Phase 65 complete`. No other changes.

---

## Notes

- **Tests not in `npm test`** — `tests/test-behavioral-events.js`, `tests/test-chrome-profile-collect.js`, `tests/test-slide-solver.js`, `tests/test-slide-solver-real.js` exist in `tests/` but are absent from `package.json`'s test script. Out of Phase 65 scope; flagged for a future pass if the user wants them reviewed.
- **Backward-compat shims are intentionally preserved**: 2-element `keyModConstants` handling in `template-cache.js`, `collect-generator.js`, `key-extractor.js`, `token-verifier.js`; `colorGamutLegacy` / Flash-plugin fields in `collector-schema.js` (these describe legacy *browser* features, not legacy code).
- **Commit convention**: each task ships as its own `chore(cleanup): 65.M — <subject>` commit per Phase 64 precedent.
