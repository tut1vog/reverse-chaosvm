# Plan

## Status
Current phase: **Phase 64** — Cleanup pass
Current task: **64.2** — Remove `targets/`, `sample/`, `results.json`, 9 broken test files; update `package.json` test script; TODO comment in `live-submit.js`

> Phases 38–63 closed (errorCode -1 → 0 investigation). Detail in `git log`.

---

## Phases

### Phases 38–63 — DONE
> Investigation pass that took the scraper from persistent errorCode -1 to errorCode 0. Phase 63 closed with a slim scraper that uses the standalone-proven flow. All prior tasks archived — see `git log --grep="Task:"`.

### Phase 64: Cleanup pass
> Strip development residue (`output/`, `targets/`, `sample/`, `history/`, `scripts/`, dead research tracks, 9 tests, 4 docs, stale `plan.md`), scrub dangling path references across docs + README + `.claude/`, rewrite `docs/HAR_ANALYSIS.md`, leave `tools/captcha-solver/live-submit.js` with a `TODO(follow-up)` marker, flag (do not remove) dependency suspects, keep `npm test` green. Final act: delete `plan.md` and `project-brief.md` themselves.

| ID | Task | Status |
|----|------|--------|
| 64.1 | Remove `output/` (252 tracked files + all untracked content) | done |
| 64.2 | Remove `targets/`, `sample/`, `results.json`, the 9 broken-by-implication test files; update `package.json`'s `test` script; leave `TODO(follow-up)` in `tools/captcha-solver/live-submit.js` above the `sample/` reads | pending |
| 64.3 | Remove 5 dead research tracks (`research/errorcode-12/`, `research/scraper-tls-impersonation/`, `research/collector-fields/`, `research/eks-payload/`, `research/key-mod/`) and `docs/ERRORCODE_12_INVESTIGATION.md` | pending |
| 64.4 | Remove `scripts/`, `history/`, `docs/PROGRESS.md`, `docs/WORKFLOW.md`, `docs/CONVENTIONS.md` | pending |
| 64.5 | Remove `.claude/commands/fetch-latest.md` and `.claude/rules/targets-readonly.md` | pending |
| 64.6 | Remove `decompile` script from `package.json` | pending |
| 64.7 | Doc path sweep — scrub `targets/tdc*.js` and `sample/*` citations across `docs/` (excluding `HAR_ANALYSIS.md`), `README.md`, and `.claude/` (agents, commands, skills) | pending |
| 64.8 | Rewrite `docs/HAR_ANALYSIS.md` — abstract description of the captured flow, cross-references to current docs, protocol analysis preserved | pending |
| 64.9 | Dependency usage audit — report remaining references to `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `canvas` after earlier cleanup tasks land (report only — do not remove) | pending |
| 64.10 | Final: delete `plan.md` and `project-brief.md` | pending |

---

## Current Task

**ID**: 64.2
**Title**: Remove `targets/`, `sample/`, `results.json`, 9 broken test files; update `package.json` test script; TODO comment in `live-submit.js`
**Phase**: Phase 64 — Cleanup pass
**Status**: in-progress

### Goal
Collapse five tightly coupled deletions into one coherent commit so the test suite never goes through an intermediate broken state:
1. Delete `targets/` (6 `tdc*.js` files — scraper fetches live; porting pipeline takes a path argument).
2. Delete `sample/` (7 files — breaks `tools/captcha-solver/live-submit.js` by design; TODO marker lands in the same commit).
3. Delete `results.json` (216 KB scraper run dump at repo root).
4. Delete the 9 test files listed below and remove the 8 of them that are referenced from `package.json`'s `test` script in the same change.
5. Leave a `TODO(follow-up)` block in `tools/captcha-solver/live-submit.js` above the reads of `sample/slide-jy.js` / `sample/vm_slide.js` explaining the file is intentionally broken — the follow-up is to fetch these sources over the wire instead of disk.

`npm test` must stay green after the change — the suite shrinks by exactly 9 tests.

### Context

**`targets/` contents** (all to delete):
- `targets/tdc-live.js`, `targets/tdc-v2.js`, `targets/tdc-v3.js`, `targets/tdc-v4.js`, `targets/tdc-v5.js`, `targets/tdc.js`

**`sample/` contents** (all to delete):
- `sample/bot.py`, `sample/cap_union_prehandle`, `sample/captcha-har.har`, `sample/payload.txt`, `sample/slide-jy.js`, `sample/t_captcha_slide.js`, `sample/vm_slide.js`

**Test files to delete** (9 total — paths under `tests/`):
1. `tests/test-decoder.js`          (referenced in `package.json` test script)
2. `tests/test-deobfuscator.js`     (referenced)
3. `tests/test-key-extractor.js`    (referenced)
4. `tests/test-opcode-mapper.js`    (referenced)
5. `tests/test-vm-parser.js`        (referenced)
6. `tests/test-pipeline-integration.js`   (referenced)
7. `tests/test-request-chain-fidelity.js` (NOT referenced — orphan test file; delete the file only, no package.json change)
8. `tests/test-scraper-foundation.js`     (referenced)
9. `tests/test-vdata-generator.js`        (referenced)

**`package.json` test-script update**: the current `test` script is a single `node --test <file> <file> ...` line listing 31 test files. Remove the 8 that are scheduled for deletion. Leave everything else in that script untouched (including `test-outer-pipeline.js`, `outer-pipeline.test.js`, `test-vdata-generator-encoder.js`, `test-vdata-builder.js`, `test-vdata-for-post.js`, `test-scraper.js`, `test-structure-extractor.js`, `test-tdc-survey.js`, `test-tdc-diagnose.js`, `test-vm-slide-decoder.js`, `test-vm-slide-walker.js`, `test-auto-port.js`, `test-phase49-profile-fixes.js`, and the other surviving entries). Do NOT touch `dependencies`, `scripts.decompile` (removed later in 64.6), `scripts.token:standalone`, or `scripts.solve:puppeteer`.

**`tools/captcha-solver/live-submit.js` TODO block**: the file reads `sample/slide-jy.js` and `sample/vm_slide.js` from disk somewhere around lines 496–508 (line numbers are approximate — locate the actual reads). It will throw at runtime once `sample/` is gone. Do NOT attempt to fix the reads — the user has acknowledged this as a deliberate follow-up. Add a block comment immediately above the first `sample/` read that documents:
- The file is broken at runtime until the `sample/slide-jy.js` and `sample/vm_slide.js` sources are fetched over the wire instead of read from disk.
- The fix is to replicate the fresh-fetch pattern the scraper already uses for `tdc.js`.
- Label the block `TODO(follow-up): live-submit.js disk reads` so it's greppable.

**Protected** (do not modify): `tools/token-generator/`, `tools/porting-pipeline/`, `tools/scraper/`, `tools/captcha-solver/captcha-client.js`, `tools/captcha-solver/slide-solver.js`, `tools/captcha-solver/slide-solver.py`, `tools/vdata-generator/`, `research/tdc-register-vm/`, `research/vm-slide-stack-vm/`, `research/captcha-orchestrator/`, `research/template-pool/`, `tests/fixtures/`. Do not modify any test files other than the 9 being deleted. Do not modify any docs in this task — doc sweeps are in 64.7 / 64.8.

**Known acceptable follow-on**: `tests/fixtures/vdata-har-capture.json` contains a metadata field `"source": "sample/captcha-har.har"`. Leave it alone — the field is documentation, not a read target, and it's explicitly called out as acceptable in the brief.

### Implementation Steps
1. `git rm -r targets/ sample/` — stages the 13 deletions.
2. `git rm results.json` — stages that deletion.
3. `git rm tests/test-decoder.js tests/test-deobfuscator.js tests/test-key-extractor.js tests/test-opcode-mapper.js tests/test-vm-parser.js tests/test-pipeline-integration.js tests/test-request-chain-fidelity.js tests/test-scraper-foundation.js tests/test-vdata-generator.js` — stages the 9 test deletions.
4. Read `package.json` and edit the `test` script: remove the 8 referenced test filenames (leave spacing/structure consistent with the rest of the line). Do not reformat the rest of the file.
5. Read `tools/captcha-solver/live-submit.js`, locate the `sample/slide-jy.js` and `sample/vm_slide.js` read sites (around lines 496–508), and insert the `TODO(follow-up)` block immediately above the first such read. Keep indentation consistent with the surrounding code.
6. Run `npm test`. It must complete successfully. The suite should now run 22 test entries (31 − 8 — one of the 9 is not in the script).

### Verification — capture exact output of each
- `test ! -e targets/ && echo GONE || echo PRESENT` → `GONE`
- `test ! -e sample/ && echo GONE || echo PRESENT` → `GONE`
- `test ! -e results.json && echo GONE || echo PRESENT` → `GONE`
- For each of the 9 test files: `test ! -e tests/<name> && echo GONE || echo PRESENT` → `GONE` (run via a loop and report the summary)
- `grep -E 'test-(decoder|deobfuscator|key-extractor|opcode-mapper|vm-parser|pipeline-integration|scraper-foundation|vdata-generator)\.js' package.json` → no matches (the 8 referenced filenames are gone from the script). Note `test-vdata-generator-encoder.js` and similar must still be present — be precise with the regex to avoid false positives.
- `grep -c 'TODO(follow-up): live-submit.js disk reads' tools/captcha-solver/live-submit.js` → at least `1`
- `npm test` → exits 0. Capture the final "pass X / fail 0" summary line.
- `git status --short | awk '$1 ~ /^[MD]/ {print}' | grep -v '^M  package.json$' | grep -v '^M  tools/captcha-solver/live-submit.js$' | grep -v '^D  targets/' | grep -v '^D  sample/' | grep -v '^D  results.json$' | grep -v '^D  tests/' | wc -l` → `0` (nothing else has been modified)

### Constraints
- **Do not make any git commits.** The director handles all commits after verification.
- **Do not modify any file not listed above.** Specifically: no docs, no other test files, no `tools/` code beyond the `live-submit.js` TODO, no `.claude/`, no `CLAUDE.md`, no `README.md`, no `plan.md`, no `project-brief.md`, no `.gitignore`, no `profiles/`, no `research/`.
- **Do not attempt to make `live-submit.js` functional.** The TODO marker is the entirety of the fix for this pass.
- **If `npm test` fails**, stop immediately. Do not attempt to fix the failure by patching tests or adding mocks. Report the failing tests with their exact error output and stop. An unexpected failure outside the 9 deletions means something else changed and the root cause must be diagnosed by the director before continuing.
- **If the task is too difficult or impossible to complete**, stop immediately and report back. Explain what you attempted, what went wrong, and why. Do not leave behind partial or broken changes.

### Report back
Return a concise report (under 300 words) containing:
1. Literal output of each Verification command.
2. The final line number range where you inserted the TODO block in `live-submit.js`.
3. The new `test` script line from `package.json` (exact).
4. The `npm test` summary line.
5. Any surprises.

### Suggested Agent
general-purpose — targeted deletion + small precision edits + test-suite verification.

---

## Execution Notes

- **Scaffold baseline**: before dispatching 64.1, the director commits the currently-uncommitted scaffold changes (`CLAUDE.md`, `.claude/rules/*.md` refresh, deleted `.claude/settings.json`, revised `project-brief.md`) together with this fresh `plan.md` as a single `chore(ai):` commit. Non-scaffold uncommitted changes (stray `output/*` edits, `results.json` edit) are left unstaged — they'll be swept by 64.1 / 64.2 anyway.
- **Test cadence**: run `npm test` after 64.2, 64.3, 64.4, 64.6, 64.8 — not just at the end. A regression outside the 9 expected deletions halts the pass for diagnosis.
- **Protected paths**: `tools/token-generator/`, `tools/porting-pipeline/`, `tools/scraper/`, `tools/captcha-solver/{captcha-client,slide-solver}.js`, `tools/captcha-solver/slide-solver.py`. Doc sweeps touching these halt for user confirmation.
- **Final cleanup (64.10)**: deletes both `plan.md` (this file) and `project-brief.md`. The commit body is the final journal entry for the pass.
