# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: 65.5 — End-to-end smoke test of the four protected pipelines

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
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | pending |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Current Task

**ID**: 65.5
**Title**: End-to-end smoke test of the four protected pipelines
**Phase**: Phase 65 — Legacy code cleanup
**Status**: pending (awaiting dispatch)

### Goal
Prove that nothing Phase 65 touched broke the four protected pipelines (decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper). `npm test` is the primary safety net — it already exercises the scraper + porting-pipeline codepaths — this task adds an invocation-level readiness check plus best-effort live runs.

### Context
- All four pipelines live under `tools/` and `research/`:
  - Decompiler: `node research/tdc-register-vm/run.js --input <path> --output <path>` (offline; requires a tdc.js file).
  - Auto-port pipeline: `node tools/porting-pipeline/run.js <tdc-path> [--skip-verify]` (offline; requires a tdc.js file).
  - Puppeteer CAPTCHA solver: `node tools/captcha-solver/cli.js --domain <host>` (live network; needs Chromium).
  - Node.js scraper: `node tools/scraper/cli.js --captcha-only --verbose` (live network).
- Fresh `tdc.js` acquisition requires the full captcha flow (prehandle → getSig → downloadTdc) — it can't be fetched standalone. The scraper's `--captcha-only` run fetches it internally during its pipeline; if that run succeeds, the captured tdc.js can be reused by the decompiler and porting pipeline. If the live run fails (rate-limiting, network), the offline tier is sufficient to declare the task passed.
- Baseline: `npm test` currently reports 230 pass / 0 fail / 2 skip.
- This task is **evidence gathering only** — do not modify any file. The agent's report is the deliverable.

### Implementation Steps

**Tier 1 — offline (hard requirements, must all pass)**:
1. `node --check research/tdc-register-vm/run.js`
2. `node --check tools/porting-pipeline/run.js`
3. `node --check tools/captcha-solver/cli.js`
4. `node --check tools/scraper/cli.js`
5. `npm test` — must print `230 pass / 0 fail / 2 skip`.
6. Confirm the two preserved dynamic tracers are still syntactically valid:
   - `node --check tools/dynamic-tracers/comparison-harness.js`
   - `node --check tools/dynamic-tracers/crypto-tracer-v3.js`

**Tier 2 — live network (best-effort; document outcome, do not fail the task if network is unreliable)**:
7. Run the scraper once with a 120s timeout: `timeout 120 node tools/scraper/cli.js --captcha-only --verbose 2>&1 | tail -60`. Report whether it produced a non-empty ticket or what stage it reached before timing out / erroring. If it wrote artifacts under `output/<hash>/`, note the paths.
8. If the scraper run landed a fresh `tdc.js` on disk (check `output/` for the most recent `tdc.js` — the scraper may or may not dump it; if not, skip this step rather than inventing one):
   - Run the auto-port pipeline against it: `timeout 180 node tools/porting-pipeline/run.js <path> --skip-verify 2>&1 | tail -30`. Report which stages completed.
   - Run the decompiler against it: `timeout 180 node research/tdc-register-vm/run.js --input <path> --output output/phase-65-smoke/decompile/ 2>&1 | tail -30`. Report whether the output directory was populated.
9. Puppeteer CAPTCHA solver: `timeout 120 node tools/captcha-solver/cli.js --domain example.com 2>&1 | tail -40`. Report whether it reached the solver step or what failed first.

**Treatment of network failures**: if Tier 2 steps fail for network/rate-limiting/headless-Chrome reasons (symptoms: HTTP 403/429, connection reset, `TimeoutError: Timed out after 120000 ms`, puppeteer launch failure), report the symptom verbatim and mark that step "inconclusive — network". This is acceptable; the task still passes if Tier 1 is green. Phase 62 established that `urlsec.qq.com` has rate-limiting, so these failures are expected and do not indicate breakage from Phase 65.

### Verification (director will treat the agent's report as evidence)
- [ ] All six Tier-1 checks pass (four `node --check`, one `npm test` at 230/0/2, and two tracer `node --check`).
- [ ] Tier-2 outcomes are documented with raw output (tail-40 excerpt per step is enough).
- [ ] No file in the repo was modified by the agent (confirm via `git status --short` — it should match the pre-task state: only the pre-existing `M research/vm-slide-stack-vm/FN-20539-SLOT8-HOP.md` and untracked `output/`).

### Suggested Agent
`general-purpose` — this is an evidence-gathering task (runs + reports), no code changes. No specialist needed.

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
