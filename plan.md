# Plan

## Status
Current phase: Phase 65 — Legacy code cleanup
Current task: 65.2 — Relocate `vdata-harness.js` out of `tools/scraper/`

---

## Phases

### Phase 65: Legacy code cleanup
> Remove unreferenced legacy code identified in the post-Phase-64 audit (dead captcha endpoint, jsdom vData harness, orphan tracers, broken fingerprint harvester) without disturbing the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper.

| ID | Task | Status |
|----|------|--------|
| 65.1 | Delete dead `_getSigLegacy()` method from `tools/captcha-solver/captcha-client.js` | done |
| 65.2 | Relocate `tools/scraper/vdata-harness.js` → `research/vm-slide-stack-vm/vdata-harness.js`; update 2 research-script importers, 4 research doc references, and the CLAUDE.md/README.md/scraper.js header carve-outs | pending |
| 65.3 | Delete four orphan tracers in `tools/dynamic-tracers/`: `harness.js`, `encoding-tracer.js`, `instrument.js`, `payload-tracer.js` | pending |
| 65.4 | Delete `tools/captcha-solver/fingerprint-harvester.js` (broken — references non-existent `src/bot/` and `browser-mock.js`; re-harvest capability not preserved) | pending |
| 65.5 | End-to-end smoke test of the four protected pipelines: decompiler, auto-port pipeline, Puppeteer CAPTCHA solver, Node.js scraper | pending |
| 65.6 | Delete `plan.md` and close Phase 65 | pending |

---

## Current Task

**ID**: 65.2
**Title**: Relocate `vdata-harness.js` out of `tools/scraper/`
**Phase**: Phase 65 — Legacy code cleanup
**Status**: pending (awaiting dispatch)

### Goal
Move `tools/scraper/vdata-harness.js` to its real conceptual home — the vm-slide stack VM research track — so the `tools/scraper/` tree cleanly reflects what the live Node-only scraper actually uses. After this task, jsdom/canvas are pure research-track dependencies and the scraper headers stop carrying the "retained for research" carve-out.

### Context
- The file is **not** imported by the live scraper. Only two research scripts depend on it:
  - `research/template-pool/survey.js:22` — `require('../../tools/scraper/vdata-harness')`
  - `research/template-pool/diagnose.js:24` — `require('../../tools/scraper/vdata-harness')`
- New path: `research/vm-slide-stack-vm/vdata-harness.js` (the harness executes `vm-slide.enc.js` inside jsdom — conceptually it's a white-box trace tool for the vm-slide stack VM).
- **Doc references** (paths only; text around them stays accurate):
  - `research/vm-slide-stack-vm/VDATA-PIPELINE.md:80`
  - `research/vm-slide-stack-vm/vdata-dynamic-trace.js:8` (source comment, not an import)
  - `research/vm-slide-stack-vm/BUILD-RECONCILE.md:96, 140`
  - `research/vm-slide-stack-vm/PHASE-45-FIELD-SOURCES.md:4`
- **Carve-outs to remove** (these are currently-uncommitted edits in the working tree — this task is the commit point):
  - `CLAUDE.md:8` — "…`jsdom` ^29 + `canvas` ^3 (research scripts and the legacy `tools/scraper/vdata-harness.js` only — the live scraper synthesizes vData without a DOM)." → simplify to something like "…`jsdom` ^29 + `canvas` ^3 (research scripts only — the live scraper runs entirely in Node with no DOM)."
  - `README.md:23` — same edit in parallel wording (the text is near-identical).
  - `tools/scraper/scraper.js:10` — header line referencing "jsdom-based tools/scraper/vdata-harness.js is retained only for research" — delete that clause; the header can simply state the scraper runs entirely in Node with no DOM.
- **Naming touch-up**: `tools/scraper/scraper.js:570` has a code comment `// Legacy synthetic mode: build cd from profiles/default.json`. The `--no-chrome-profile` path is a supported fallback, not deprecated legacy. Rename to `// Synthetic fallback mode: build cd from profiles/default.json`.
- **Before editing, re-read `tools/scraper/vdata-harness.js` in full** to confirm (a) it is self-contained or only requires relative paths that still resolve after the move, (b) any `require('./...')` or `require('../...')` statements inside it are updated correctly if affected by the new location. Its current location is `tools/scraper/`; the new location is `research/vm-slide-stack-vm/`. Depth-from-root is the same (2 levels), so sibling-sibling relative requires would change. Verify and adjust.

### Implementation Steps
1. Read `tools/scraper/vdata-harness.js` in full. Note every `require(...)` it makes and figure out each target's new relative path from `research/vm-slide-stack-vm/`. Adjust each require before the move, or adjust post-move — either ordering works; do whichever is cleanest in a single Edit.
2. Move the file: `git mv tools/scraper/vdata-harness.js research/vm-slide-stack-vm/vdata-harness.js`.
3. Update the two importers:
   - `research/template-pool/survey.js:22` → `require('../vm-slide-stack-vm/vdata-harness')`
   - `research/template-pool/diagnose.js:24` → `require('../vm-slide-stack-vm/vdata-harness')`
4. Update the four doc/path references to point at the new location. Preserve surrounding prose; only change the path string.
5. Simplify the two doc headers (`CLAUDE.md:8`, `README.md:23`) and the scraper-file header (`tools/scraper/scraper.js:10`) to drop the "retained legacy" carve-out. Keep the factual statement that the live scraper runs in Node with no DOM.
6. Rename the `// Legacy synthetic mode` comment at `tools/scraper/scraper.js:570` to `// Synthetic fallback mode`.

### Verification
- [ ] `grep -n "tools/scraper/vdata-harness" .` (via the Grep tool) returns **zero** hits anywhere in the repo outside `plan.md`.
- [ ] `ls tools/scraper/vdata-harness.js` → absent; `ls research/vm-slide-stack-vm/vdata-harness.js` → present.
- [ ] `node --check research/vm-slide-stack-vm/vdata-harness.js` parses clean.
- [ ] `node --check research/template-pool/survey.js` and `node --check research/template-pool/diagnose.js` parse clean.
- [ ] `node --check tools/scraper/scraper.js` parses clean.
- [ ] `npm test` — still 230 pass, 0 fail, 2 skip (or whatever the current baseline is — must not regress).
- [ ] `git diff --stat` shows: one rename (tools/scraper/vdata-harness.js → research/vm-slide-stack-vm/vdata-harness.js), edits to the 2 importers, edits to the 4 research docs, edits to CLAUDE.md / README.md / tools/scraper/scraper.js. No unrelated changes.

### Suggested Agent
`general-purpose` — mechanical rename + path updates across a small, fully-enumerated set of files. No domain expertise required.

---

## Upcoming task briefs (for user review — not yet dispatched)

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
