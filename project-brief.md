# Project Brief — Cleanup Pass

> Durable project facts (stack, directory layout, canonical commands, rules, template table, durable findings) live in `CLAUDE.md` and `.claude/rules/`. This brief is the planning input for cc-project-director: what this cleanup pass changes, what it leaves alone, and what follow-ups it intentionally defers. The director's **final task** is to delete this file.

## Project Overview

`reverse-chaosvm` is a research platform for reverse-engineering Tencent's ChaosVM (JSVMP). The stable deliverables — a `tdc.js` register-VM decompiler, a byte-identical `collect` / `vData` token generator, an automated porting pipeline for new `tdc.js` builds, a Puppeteer CAPTCHA solver, and a headless jsdom urlsec scraper — all work. After several months of phase-numbered debugging (phases 45–63), the tree has accumulated development residue: `output/` artifacts that are all re-runnable, phase-numbered debugging scripts, per-day history logs, dead research tracks, and 9 tests whose inputs are about to be deleted. This pass strips the residue and leaves the stable core plus the docs that explain how `collect` and `vData` are generated.

## Current State

**Stable and working — do not touch**:
- `tools/token-generator/` — standalone collect-token generator, byte-identical for Templates A / B / C.
- `tools/porting-pipeline/` — `parse → opcode-map → key-extract → verify` automation for new `tdc.js` builds.
- `tools/scraper/` — headless urlsec scraper (jsdom, no browser). Fetches live `tdc.js` at runtime.
- `tools/captcha-solver/captcha-client.js`, `tools/captcha-solver/slide-solver.js`, `tools/captcha-solver/slide-solver.py` — Puppeteer CAPTCHA solver + OpenCV slide solver.
- `tools/vdata-generator/` — vData builder with three public APIs (encode, replay, from-obj).
- `research/tdc-register-vm/` — 12-step decompiler pipeline; required by `npm test`.
- `research/vm-slide-stack-vm/`, `research/captcha-orchestrator/`, `research/template-pool/` — provenance for the vm-slide + orchestrator docs.
- Fixtures under `tests/fixtures/` — vData round-trip fixtures are the byte-identical acceptance bar and must stay green.

**Dev residue to strip** — see "Scope / Planned" below for the full list.

## Constraints

- **Don't touch** `tools/token-generator/`, `tools/porting-pipeline/`, `tools/scraper/`, or the three protected captcha-solver files. If a sweep across `docs/` needs to change a path reference there, stop and confirm.
- **`npm test` must stay green** after the cleanup. The suite will shrink by 9 tests (input files being deleted) — the remaining tests must still pass. If anything breaks beyond the 9 expected deletions, stop and diagnose.
- **No new dependencies**. If `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, or `canvas` appear unused after cleanup, flag and ask — do not remove.
- **Node.js ≥18 CommonJS only** (see `.claude/rules/coding-style.md`).
- **Byte-identical vData fixtures** at `tests/fixtures/vdata-{har,jsdom}-capture.json` must round-trip through `tools/vdata-generator/` after cleanup.

## Scope

### Stable (preserved as-is)

- `tools/**` — all six subdirectories, except the three below that get light path-reference sweeps.
- `research/tdc-register-vm/`, `research/vm-slide-stack-vm/`, `research/captcha-orchestrator/`, `research/template-pool/`.
- `docs/` — all files except the four scheduled for deletion below; `HAR_ANALYSIS.md` is rewritten in place.
- `profiles/`, `tests/fixtures/`, `README.md` (README gets a path sweep), `CLAUDE.md` (already refreshed in the scaffold).
- `.claude/rules/*.md` (already refreshed in the scaffold), `.claude/agents/*`, `.claude/commands/port-version.md`, `.claude/commands/scrape.md`, `.claude/skills/port-opcodes.md`.

### Planned — deletions

Paths to remove wholesale (tracked + untracked):

- `targets/` — all six `tdc*.js` files. Scraper fetches live at runtime; porting pipeline takes a path argument.
- `sample/` — all seven files. Accept that `tools/captcha-solver/live-submit.js` becomes broken; see "Known Unknowns".
- `output/` — all 252 tracked files + all untracked content. All artifacts are re-runnable.
- `history/` — five per-day journal files.
- `scripts/` — 14 phase-numbered debugging scripts (none referenced from `tools/`, `tests/`, or `package.json`).
- `research/errorcode-12/`, `research/scraper-tls-impersonation/`, `research/collector-fields/`, `research/eks-payload/`, `research/key-mod/` — debug tracks and README-only stubs.

Individual files to remove:

- `plan.md` (root).
- `results.json` (root — 216 KB scraper run dump).
- `docs/PROGRESS.md`, `docs/WORKFLOW.md`, `docs/CONVENTIONS.md`, `docs/ERRORCODE_12_INVESTIGATION.md`.
- `.claude/commands/fetch-latest.md` (command's purpose — saving to `targets/` — is gone).
- `.claude/rules/targets-readonly.md` (no referent).
- `project-brief.md` itself (this file) — **final task** of the cleanup, after all other work is committed.

Tests to remove (listed in `package.json`'s `test` script; remove from the script in the same change):

- `tests/test-decoder.js`
- `tests/test-deobfuscator.js`
- `tests/test-key-extractor.js`
- `tests/test-opcode-mapper.js`
- `tests/test-vm-parser.js`
- `tests/test-pipeline-integration.js`
- `tests/test-request-chain-fidelity.js`
- `tests/test-scraper-foundation.js`
- `tests/test-vdata-generator.js`

### Planned — edits

- **`package.json`**
  - Drop the `decompile` script.
  - Drop the 9 deleted tests from the `test` script.
  - Do **not** remove any `dependencies` entries — flag `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `canvas` if usage is ambiguous after cleanup; confirm with user before removing.

- **`docs/HAR_ANALYSIS.md`** — rewrite to reflect current knowledge:
  - Replace all references to a specific `sample/captcha-har.har` file with an abstract description of the captured flow.
  - Cross-reference the vData and collect generation findings as they stand now (see `docs/VDATA_FORMAT.md`, `docs/TOKEN_FORMAT.md`, `docs/CAPTCHA_ORCHESTRATOR.md`).
  - Keep the analysis of the protocol (endpoint sequence, headers, body formats) — that part is durable.

- **`docs/*.md` path sweep** — for the remaining docs (all except `HAR_ANALYSIS.md` which is being rewritten anyway), scrub dangling `targets/tdc-v*.js` and `sample/*` citations:
  - `CHAOSVM_VARIANTS.md`, `VM_SLIDE_ARCHITECTURE.md`, `VM_SLIDE_OPCODES.md`, `CAPTCHA_ORCHESTRATOR.md`, `VDATA_FORMAT.md`, `TOKEN_FORMAT.md`, `TOKEN_DECRYPTION.md`, `COLLECTOR_SCHEMA.md`, `COLLECT_FINGERPRINT_ANALYSIS.md`, `CRYPTO_ANALYSIS.md`, `EKS_FORMAT.md`, `OPCODE_REFERENCE.md`, `VM_ARCHITECTURE.md`, `VERSION_DIFFERENCES.md`.
  - Replace "observed in `sample/vm_slide.js`" → "observed in the vm-slide build the research scripts were run against". Same pattern for `sample/t_captcha_slide.js`, `sample/captcha-har.har`, `sample/slide-jy.js`.
  - Replace "in `targets/tdc.js`" / "across `targets/tdc*.js`" → "in the Template A reference build" / "across known templates A / B / C".
  - Preserve all technical content — this is pure reference scrubbing.

- **`README.md`** — sweep same stale paths; cut any phase-narrative prose; match the style of the refreshed `CLAUDE.md`.

- **`.claude/agents/key-extractor.md`**, **`.claude/agents/opcode-mapper.md`**, **`.claude/agents/token-verifier.md`** — replace "`targets/*.js` (READ ONLY)" and "never modify `targets/`" language with "the caller-supplied target path"; the agents are always invoked with a path argument.

- **`.claude/commands/port-version.md`** — update argument description and example so it no longer implies `targets/tdc-v*.js`. The command still takes a path; just make the example a fresh-fetch path.

- **`.claude/commands/scrape.md`** — sweep for `targets/`/`sample/` references (likely none, verify).

- **`.claude/skills/port-opcodes.md`** — same path sweep.

### Execution guidance

- Suggested commit batching (one logical change per commit so reverts are granular):
  1. Drop `output/` (tracked — largest single delete; prep the tree).
  2. Drop `targets/`, `sample/`, `results.json`, and the broken-by-implication test files in one commit; update `package.json`'s `test` script in the same change so the suite stays green.
  3. Drop the dead research tracks (`errorcode-12`, `scraper-tls-impersonation`, `collector-fields`, `eks-payload`, `key-mod`) and `research/errorcode-12/`-linked `docs/ERRORCODE_12_INVESTIGATION.md`.
  4. Drop `scripts/`, `history/`, `plan.md`, `docs/PROGRESS.md`, `docs/WORKFLOW.md`, `docs/CONVENTIONS.md`.
  5. Drop `.claude/commands/fetch-latest.md` and `.claude/rules/targets-readonly.md`.
  6. Drop `package.json`'s `decompile` script.
  7. Doc path sweep across `docs/`, `README.md`, and `.claude/` (agents, commands, skills).
  8. Rewrite `docs/HAR_ANALYSIS.md`.
  9. Run `npm test` — expect all remaining suites green.
  10. Final commit: delete `project-brief.md` (this file).

- After each batch, run `git status` and confirm only the intended paths changed.
- Run `npm test` after steps 2, 3, and 8, not just at the end.
- If any test fails outside the expected 9 deletions, stop and diagnose — do not press on.

## Known Unknowns

- **`tools/captcha-solver/live-submit.js` will throw at runtime** after `sample/` is deleted: it hard-fails on missing `sample/slide-jy.js` / `sample/vm_slide.js` at lines 496–508. User has acknowledged this as a deliberate follow-up — the file should fetch those sources over the wire instead of reading from disk. Do **not** attempt to fix this during cleanup; just leave a `TODO(follow-up)` comment block above the broken reads pointing to this brief's "Known Unknowns" section.
- **`tests/fixtures/vdata-har-capture.json`** contains a metadata field `"source": "sample/captcha-har.har"` pointing to a file that will no longer exist. The fixture itself is self-contained (the `"source"` is documentation, not a read target). Leave it in place; no edit required.
- **Dependency cleanup** is **out of scope**. If `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, or `canvas` become unused after this pass, flag in the final report but do not remove from `package.json`.
