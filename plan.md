# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: **awaiting user decisions** (see Open questions below) before dispatching 65.4

---

## Phases

### Phase 65: Legacy code cleanup
> Remove unreferenced legacy code identified in the post-Phase-64 audit (dead captcha endpoint, jsdom vData harness, orphan tracers, broken fingerprint harvester) without disturbing the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper.

| ID | Task | Status |
|----|------|--------|
| 65.1 | Delete dead `_getSigLegacy()` method from `tools/captcha-solver/captcha-client.js` | done |
| 65.2 | Relocate `tools/scraper/vdata-harness.js` → `research/vm-slide-stack-vm/vdata-harness.js`; update 2 research-script importers, 4 research doc references, and the CLAUDE.md/README.md/scraper.js header carve-outs | done |
| 65.3 | Delete four orphan tracers in `tools/dynamic-tracers/`: `harness.js`, `encoding-tracer.js`, `instrument.js`, `payload-tracer.js` | done |
| 65.3.1 | (proposed) Delete `tools/token-generator/integration-verify.js` — surfaced as orphaned during 65.3 | **awaiting user decision** |
| 65.4 | Delete `tools/captcha-solver/fingerprint-harvester.js` (broken — references non-existent `src/bot/` and `browser-mock.js`; re-harvest capability not preserved) | **awaiting user decision** (delete vs. fix) |
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | pending |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Open questions — awaiting user decision before dispatching further

### Q1 — `tools/token-generator/integration-verify.js` is now doubly-orphaned (surfaced during 65.3)

**Finding**: `integration-verify.js` reads its ground-truth input from `output/dynamic/payload-trace.json`. That file was removed in Phase 64.1 (`output/` purge), and the capture tool that produced it (`payload-tracer.js`) was just deleted in 65.3. It also has **zero external references** in the repo — no `require()`, no `npm test` hookup, no doc link, no agent mention. It is not wired into any live pipeline.

**Options**:
- **(a) Delete** `integration-verify.js` as task 65.3.1 (fits the Phase 65 theme: "zero references + no way to run ⇒ dead").
- **(b) Rescue**: restore `payload-tracer.js` from git history and document the capture/verify workflow as a supported utility. Larger scope — outside Phase 65 as originally framed.
- **(c) Defer**: leave as-is for a future cleanup pass. The stale docstring at line 12 ("captured from tdc.js via payload-tracer.js") becomes a loose thread.

Director recommendation: **(a) delete**. The file has been non-runnable since 64.1 (4 commits back), no live pipeline depends on it, and we have just confirmed its capture tool was itself dead.

### Q2 — 65.4 trade-off for `fingerprint-harvester.js` (carried forward from plan init)

The file is broken-as-written: its module header points at `src/bot/fingerprint-harvester.js` and `browser-mock.js`, neither of which exists in the tree. Its expected output, `profiles/chrome-fingerprint.json`, is already committed — so the harvester currently produces no value for any live flow.

**Options**:
- **(a) Delete** (original plan default). Accepts losing the "re-harvest on a new machine" capability. If re-harvest is ever needed, a fresh harvester would have to be written — the current file cannot be revived by a path-fix alone.
- **(b) Fix**: repair the broken paths so the harvester runs again. Requires figuring out what `src/bot/fingerprint-harvester.js` and `browser-mock.js` were meant to point at (likely historical filenames from a pre-refactor layout).
- **(c) Defer**.

Director recommendation: **(a) delete** unless you plan to harvest a new profile soon. The committed `profiles/chrome-fingerprint.json` already covers the live scraper's needs.

---

## Next task (resumes once Q1 and Q2 are answered)

Whichever of `65.3.1` / `65.4` the user confirms will be fully scoped into a Current Task block before the next dispatch.

---

## Upcoming task briefs (for user review — not yet dispatched)

### 65.4 — Delete `fingerprint-harvester.js`

**Why**: `tools/captcha-solver/fingerprint-harvester.js` is orphaned (zero importers). Its module header points to non-existent paths (`src/bot/fingerprint-harvester.js`, `browser-mock.js`) — it is unrunnable as-written. The output it was designed to produce, `profiles/chrome-fingerprint.json`, is already committed.

**Trade-off to confirm with user before dispatching this task**: deleting removes the "re-harvest fingerprint on a new machine" capability. If that workflow is needed in the future, the harvester would need to be re-written (not merely un-deleted, since the paths it depends on no longer exist). If the user wants to preserve re-harvest, this task converts to "fix the harvester's paths" instead of a delete.

**Verification**:
- `grep -n "fingerprint-harvester" .` returns zero hits.
- `ls tools/captcha-solver/` — `fingerprint-harvester.js` absent.
- `npm test` — green.

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
