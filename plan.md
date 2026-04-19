# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: 65.3 — Delete four orphan tracers from `tools/dynamic-tracers/`

---

## Phases

### Phase 65: Legacy code cleanup
> Remove unreferenced legacy code identified in the post-Phase-64 audit (dead captcha endpoint, jsdom vData harness, orphan tracers, broken fingerprint harvester) without disturbing the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper.

| ID | Task | Status |
|----|------|--------|
| 65.1 | Delete dead `_getSigLegacy()` method from `tools/captcha-solver/captcha-client.js` | done |
| 65.2 | Relocate `tools/scraper/vdata-harness.js` → `research/vm-slide-stack-vm/vdata-harness.js`; update 2 research-script importers, 4 research doc references, and the CLAUDE.md/README.md/scraper.js header carve-outs | done |
| 65.3 | Delete four orphan tracers in `tools/dynamic-tracers/`: `harness.js`, `encoding-tracer.js`, `instrument.js`, `payload-tracer.js` | pending |
| 65.4 | Delete `tools/captcha-solver/fingerprint-harvester.js` (broken — references non-existent `src/bot/` and `browser-mock.js`; re-harvest capability not preserved) | pending |
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | pending |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Current Task

**ID**: 65.3
**Title**: Delete four orphan tracers from `tools/dynamic-tracers/`
**Phase**: Phase 65 — Legacy code cleanup
**Status**: pending (awaiting dispatch)

### Goal
Delete four dynamic-tracer scripts that have zero references anywhere in the repo (tools, tests, docs, agents, research). Reduces the `tools/dynamic-tracers/` tree to just the two files actually cited by the agent definitions.

### Context (all verified by the director against the working tree)
- Current contents of `tools/dynamic-tracers/`:
  - `comparison-harness.js` — **keep**; cited at `.claude/agents/token-verifier.md:115`.
  - `crypto-tracer-v3.js` — **keep**; cited at `.claude/agents/key-extractor.md:35, 106` and `docs/CRYPTO_ANALYSIS.md:337`.
  - `encoding-tracer.js` — **delete**; zero references (verified).
  - `harness.js` — **delete**; zero references (verified).
  - `instrument.js` — **delete**; zero references (verified).
  - `payload-tracer.js` — **delete**; zero references (verified).
- Reference verification: Grep for `dynamic-tracers/(harness|encoding-tracer|instrument|payload-tracer)` across the repo returns **zero matches**. Grep for `dynamic-tracers/(comparison-harness|crypto-tracer-v3)` returns the 4 citations above — both preserved.
- The delete targets are self-contained — no sibling tracer or research script requires them.

### Implementation Steps
1. `git rm tools/dynamic-tracers/harness.js tools/dynamic-tracers/encoding-tracer.js tools/dynamic-tracers/instrument.js tools/dynamic-tracers/payload-tracer.js` via a single Bash call.
2. Do not touch `comparison-harness.js` or `crypto-tracer-v3.js`.
3. Do not touch any other file in the repo. In particular, do not modify `docs/CRYPTO_ANALYSIS.md`, `.claude/agents/token-verifier.md`, or `.claude/agents/key-extractor.md` — their references still resolve because they point at the two preserved tracers.

### Verification (run each check and paste raw output)
- [ ] `ls tools/dynamic-tracers/` — returns exactly two files: `comparison-harness.js`, `crypto-tracer-v3.js`.
- [ ] Grep `harness\.js|encoding-tracer|instrument\.js|payload-tracer` repo-wide — the only hits should reference `comparison-harness.js` (the word "harness.js" is a substring of "comparison-harness.js") or appear inside `plan.md`. No hits pointing into `tools/dynamic-tracers/` beyond `comparison-harness.js` itself. If a hit elsewhere references one of the four deleted filenames by exact basename, stop and report — that indicates a reference we missed.
- [ ] `npm test` — still **230 pass, 0 fail, 2 skip**. Report the `# tests / # pass / # fail / # skipped` lines.
- [ ] `git status --short` shows four `D` entries under `tools/dynamic-tracers/` and no unrelated additions/modifications you made.

### Suggested Agent
`general-purpose` — four-file delete with one verification sweep. Trivial.

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
