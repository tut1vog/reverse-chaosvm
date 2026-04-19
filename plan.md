# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: 65.1 — Delete dead `_getSigLegacy()` method from captcha-client.js

---

## Phases

### Phase 65: Legacy code cleanup
> Remove unreferenced legacy code identified in the post-Phase-64 audit (dead captcha endpoint, jsdom vData harness, orphan tracers, broken fingerprint harvester) without disturbing the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper.

| ID | Task | Status |
|----|------|--------|
| 65.1 | Delete dead `_getSigLegacy()` method from `tools/captcha-solver/captcha-client.js` | pending |
| 65.2 | Relocate `tools/scraper/vdata-harness.js` → `research/vm-slide-stack-vm/vdata-harness.js`; update 2 research-script importers, 4 research doc references, and the CLAUDE.md/README.md/scraper.js header carve-outs | pending |
| 65.3 | Delete four orphan tracers in `tools/dynamic-tracers/`: `harness.js`, `encoding-tracer.js`, `instrument.js`, `payload-tracer.js` | pending |
| 65.4 | Delete `tools/captcha-solver/fingerprint-harvester.js` (broken — references non-existent `src/bot/` and `browser-mock.js`; re-harvest capability not preserved) | pending |
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | pending |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Current Task

**ID**: 65.1
**Title**: Delete dead `_getSigLegacy()` method from captcha-client.js
**Phase**: Phase 65 — Legacy code cleanup
**Status**: in-progress

### Goal
Remove a dead captcha endpoint method that has zero callers and whose target endpoint (`/cap_union_new_getsig`) returns 404 as of 2026 per the file's own comment. Smallest, lowest-risk task — serves as Phase 65 warmup.

### Context
- File: `tools/captcha-solver/captcha-client.js`.
- Method `_getSigLegacy()` span (verified by Read): **doc comment starts at line 453, method closes at line 557**. Delete lines 453–557 inclusive. The blank line at 558 stays and becomes the separator between `getSig()` (ends at 451) and `_getShowConfig()` (starts at 559).
- `grep '_getSigLegacy|getSigLegacy'` across the whole repo returns exactly one hit: the definition itself. Zero callers.
- **Narrative comments at lines 442–444 and 562–564 refer to "the legacy endpoint" (i.e., the `/cap_union_new_getsig` URL), NOT to the method `_getSigLegacy`. They remain factually correct after the method is gone. Leave them alone.**
- The live code path is `getSig()` (line 449) → `_getShowConfig()` (line 451). `_getShowConfig()` begins at line 559.

### Implementation Steps
1. Delete lines 453–557 (the doc comment through the closing `}` of `_getSigLegacy`). After the edit, line 451's `}` (end of `getSig`) is followed by a blank line, then the `/**` at (old) line 559 starting `_getShowConfig`'s doc.
2. Do NOT modify the narrative comments in `getSig()` (lines 442–444) or `_getShowConfig()` (lines 562–564) — they correctly reference the *endpoint*, not the deleted method.
3. Do not touch any other method, field, or import in the file.

### Verification
- [ ] `grep -n "_getSigLegacy\|getSigLegacy" .` returns zero hits (ripgrep via the Grep tool; exclude `node_modules/` and `.git/`).
- [ ] `node -c tools/captcha-solver/captcha-client.js` (via `node --check`) — parses clean.
- [ ] `npm test` — all currently-green suites still pass; no new failures.
- [ ] `git diff --stat tools/captcha-solver/captcha-client.js` shows a single-file change with deletions only (no unrelated additions).

### Suggested Agent
`general-purpose` — small, mechanical deletion on a well-scoped file; doesn't need a specialist.

---

## Upcoming task briefs (for user review — not yet dispatched)

### 65.2 — Relocate `vdata-harness.js` out of `tools/scraper/`

**Why**: `tools/scraper/vdata-harness.js` is not imported by the live scraper. Only `research/template-pool/{survey,diagnose}.js` depend on it. Per `.claude/rules/research-artifacts.md`, research-only tools belong inside a research track. Its conceptual home is the vm-slide stack VM research track (it executes `vm-slide.enc.js` in jsdom), so it moves to `research/vm-slide-stack-vm/vdata-harness.js`.

**Touches**:
- Move the file.
- Update imports in `research/template-pool/survey.js:22` and `research/template-pool/diagnose.js:24` from `'../../tools/scraper/vdata-harness'` to `'../vm-slide-stack-vm/vdata-harness'`.
- Update doc path references in `research/vm-slide-stack-vm/VDATA-PIPELINE.md:80`, `research/vm-slide-stack-vm/vdata-dynamic-trace.js:8` (comment), `research/vm-slide-stack-vm/PHASE-45-FIELD-SOURCES.md:4`, `research/vm-slide-stack-vm/BUILD-RECONCILE.md:96,140`.
- Remove the "legacy `tools/scraper/vdata-harness.js`" carve-outs from `CLAUDE.md:8`, `README.md:23`, and `tools/scraper/scraper.js:10`. After the move, jsdom is only a research-track dependency; the scraper header can simply say "Runs entirely in Node — no jsdom, no browser" without the retained-legacy clause.
- Rename "Legacy synthetic mode" comment at `tools/scraper/scraper.js:570` to a neutral "Synthetic fallback mode" (the `--no-chrome-profile` path is a supported fallback, not legacy).

**Verification**:
- `grep -n "tools/scraper/vdata-harness" .` returns zero hits (all cited paths updated).
- `node --check research/template-pool/survey.js` and `node --check research/template-pool/diagnose.js` parse clean.
- `node --check research/vm-slide-stack-vm/vdata-harness.js` parses clean at its new path.
- `npm test` — green.

### 65.3 — Delete four orphan tracers

**Why**: `tools/dynamic-tracers/{harness.js, encoding-tracer.js, instrument.js, payload-tracer.js}` have zero references anywhere in the repo (tools, tests, docs, agents, research scripts). `comparison-harness.js` and `crypto-tracer-v3.js` are preserved — they are cited as reference material in `.claude/agents/{key-extractor,token-verifier}.md`.

**Verification**:
- `grep -n "harness.js\|encoding-tracer\|instrument.js\|payload-tracer"` across the repo returns no matches pointing into `tools/dynamic-tracers/` beyond the deleted files themselves.
- `ls tools/dynamic-tracers/` returns exactly `comparison-harness.js` and `crypto-tracer-v3.js`.
- `npm test` — green.

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
