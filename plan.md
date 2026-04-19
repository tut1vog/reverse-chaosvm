# Plan

## Status
Current phase: Phase 66 — Simplification Pass
Current task: 66.6 — Doc-citation sweep (prose/comments/JSON metadata for deleted + renamed paths)

---

## Phases

### Phase 66: Simplification Pass
> Shrink the project surface area to (1) pure-Node scraper, (2) Puppeteer scraper (renamed from `captcha-solver`), (3) porting pipeline, (4) docs. Inline `tools/token-generator/` and `tools/vdata-generator/` into `tools/scraper/`. Delete three obsolete research tracks, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`, two dead tests, and `tools/puppeteer/live-submit.js` (per 66.4 investigation, user-accepted delete). Commit at the logical checkpoints recommended by the brief (after each structural task), then batch prose/doc citation cleanup into one dedicated sweep at the end.

| ID | Task | Status |
|----|------|--------|
| 66.1 | Deletions + port-version.md Stage 1 reconciliation | done |
| 66.2 | Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep | done |
| 66.3 | Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`; land CLAUDE.md/README.md updates | done |
| 66.4 | Investigate `tools/puppeteer/live-submit.js`; report recommendation (user accepted: delete) | done |
| 66.5 | Delete `tools/puppeteer/live-submit.js` (dead code) | done |
| 66.6 | Doc-citation sweep — update prose/comments/JSON metadata that cites deleted or renamed paths | in-progress |
| 66.7 | Final verification sweep + close phase (delete plan.md, project-brief.md) | pending |

---

## Current Task

**ID**: 66.6
**Title**: Doc-citation sweep — update prose/comments/JSON metadata that cites deleted or renamed paths
**Phase**: Phase 66 — Simplification Pass
**Status**: in-progress

### Goal
Consolidate all prose/comment/JSON-metadata updates deferred from tasks 66.1–66.3 into one sweep: (a) swap citations of the three **moved** tool paths to their new locations, and (b) editorially handle citations to the three **deleted** `research/` tracks and the two specifically-deleted `research/template-pool/` files. After this task, `grep` should find zero stale references in all file types (not just `.js`/`.json`) except inside `plan.md` and `project-brief.md`, which are themselves deleted in 66.7. `npm test` must stay green — this is a prose-only task, no runtime paths change.

### Context

**Path mappings for moved files (mechanical substring swap):**

| Old path in prose | New path |
|---|---|
| `tools/captcha-solver/` | `tools/puppeteer/` |
| `tools/token-generator/` | `tools/scraper/token-generator/` |
| `tools/vdata-generator/` | `tools/scraper/vdata-generator/` |

**Editorially-treated references to deleted paths:**

- `research/tdc-register-vm/` — 12-step decompiler, deleted wholesale.
- `research/vm-slide-stack-vm/` — stack-VM analysis scripts + notes, deleted wholesale.
- `research/captcha-orchestrator/` — orchestrator-flow analysis, deleted wholesale.
- `research/template-pool/{survey.js,diagnose.js,README.md}` — deleted (only `live-comparison.js` remains in that directory).
- `.claude/skills/port-opcodes.md` — deleted.
- `.claude/rules/research-artifacts.md` — deleted.
- `chrome-cd-inject.js` — referenced only in a stale docstring; never existed in the current repo.
- `sample/slide-jy.js`, `sample/vm_slide.js` — `sample/` was deleted in Phase 64.2; any remaining citation is a dead link.

**Known prose-citation hit sites (from earlier grep runs, paths adjusted for post-66.3 moves):**

- `tools/scraper/vdata-generator/README.md` (formerly `tools/vdata-generator/README.md`) — multiple citations of deleted research tracks and moved tools.
- `tools/scraper/vdata-generator/{build-key-field.js, xtea.js, replay.js, custom-base64.js, for-post.js, encode.js, build-plaintext.js, build-from-obj.js, cli.js}` — file-header block comments citing `research/vm-slide-stack-vm/` (or similar).
- `tools/scraper/token-generator/*.js` — possibly similar file-header block comments (verify with grep).
- `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/CHAOSVM_VARIANTS.md`, `docs/VERSION_DIFFERENCES.md`, `docs/VDATA_FORMAT.md`, `docs/CAPTCHA_ORCHESTRATOR.md`, `docs/VM_SLIDE_OPCODES.md` — heavy citations of deleted research tracks; also have `tools/token-generator/` and `tools/vdata-generator/` path citations.
- `docs/TOKEN_FORMAT.md`, `docs/TOKEN_DECRYPTION.md` — cite `tools/token-generator/*.js` paths.
- `tests/fixtures/vdata-jsdom-capture.json` — `"source"` metadata field citing a deleted research path.
- `tests/test-vdata-for-post.js` — comment citing a deleted research path.
- `.claude/rules/output-versioning.md` — uses `research/vm-slide-stack-vm` as an example in the rule's body (at least two spots).
- `.claude/agents/opcode-mapper.md` — one citation line.
- `tools/puppeteer/cli.js` — banner usage strings may still reference the old `captcha-solver/cli.js` path (verify with a fresh `grep`).
- `tools/puppeteer/captcha-solver.js` — file-header comment may cite old path.

**Treatment rules:**

1. **Renamed/moved path** (any of the three moves in the table above): swap the path substring. Never delete the surrounding prose. If the swap leaves a sentence awkwardly phrased, leave the prose structure alone — we're cleaning paths, not rewriting docs.
2. **Deleted research-track citation**: apply one of these three treatments, picking the one that leaves the surrounding prose most coherent:
   - **Drop the pointer, keep the claim**: remove the "see `research/X/Y.md`" clause; the sentence still stands.
   - **Past-tense attribution**: rewrite to "originally derived from prior research analysis" or similar without naming the deleted file.
   - **Delete the sentence**: if the sentence exists *only* to point at the deleted file and has no standalone value.
3. **Deleted file reference in JSON metadata** (e.g. `tests/fixtures/vdata-jsdom-capture.json` `"source"` field): if the field describes provenance, either replace the value with a short attribution string (e.g. `"deleted — see git history"`) or remove the field. Prefer removing unless a test actually reads it.
4. **Deleted tooling-path reference inside a skill/rule body** (`.claude/rules/output-versioning.md`, `.claude/agents/opcode-mapper.md`): the rule/agent is about policy — its examples should be live. Replace the dead example path with a current valid one (e.g. swap `research/vm-slide-stack-vm` for `tools/scraper/vdata-generator` where the point is to illustrate output-versioning).
5. **Do not touch** `plan.md`, `project-brief.md`, `tests/asset/`, `profiles/`, `.claude/settings*.json`, `CLAUDE.md`, `README.md`, or anything under `output/`. CLAUDE.md and README.md landed accurate in 66.3's commit; they should not be touched here.

**Not in scope**:
- JavaScript identifiers named `captchaSolver`, `tokenGenerator`, `vdataGenerator` — these are code identifiers, not paths. Leave alone.
- The `tools/puppeteer/cli.js` line 18 `require('./captcha-solver')` — this is the correct intra-package require of the sibling file `captcha-solver.js` (file basename unchanged in 66.2). Leave alone.

### Implementation Steps

1. **Run the comprehensive stale-reference sweep and enumerate hits.** Six greps to run and save to a working note (they'll guide your editing):
   ```
   grep -rn "tools/captcha-solver" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .
   grep -rnE "(^|[^/])tools/token-generator" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .
   grep -rnE "(^|[^/])tools/vdata-generator" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .
   grep -rn -e "research/tdc-register-vm" -e "research/vm-slide-stack-vm" -e "research/captcha-orchestrator" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .
   grep -rn -e "research/template-pool/survey" -e "research/template-pool/diagnose" -e "research/template-pool/README" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .
   grep -rn -e "sample/slide-jy" -e "sample/vm_slide" -e "chrome-cd-inject" --exclude-dir=node_modules --exclude-dir=output --exclude-dir=.git .
   ```

2. **For each hit that is NOT in `plan.md` or `project-brief.md`, classify** using the Treatment rules above, then apply the edit. Keep a running tally per category so you can report volume.

3. **Rerun all six greps after edits** — hits outside `plan.md` and `project-brief.md` must be zero. If any survive, either they should have been edited (fix), or they're a sixth category I didn't anticipate (stop and report).

4. **Run `npm test`** — must be 8/8 green (same 214/0/2 baseline). No prose edit should break tests, but confirm.

### Verification

- [ ] All six stale-reference greps return zero hits outside `plan.md` and `project-brief.md`.
- [ ] `npm test` passes (214/0/2).
- [ ] `git diff --stat` shows the edits are prose-only (docs, comments, READMEs, JSON metadata). No `.js` file outside `tools/*/cli.js` (usage banners) and file-header comment blocks should change meaningfully. No `require()` string should change (all were fixed in 66.1–66.3). Spot-check one modified `.js` to confirm the diff touches only a comment block.
- [ ] `node tools/scraper/cli.js --help`, `node tools/puppeteer/cli.js --help`, `node tools/scraper/token-generator/cli.js --help`, `node tools/scraper/vdata-generator/cli.js --help`, `node tools/porting-pipeline/run.js --help` all exit 0 (confirms no accidental breakage of CLI usage strings).

### Suggested Agent
`general-purpose` — the sweep is mechanical but the deleted-research citations need light editorial judgment; no other agent fits the mixed prose-edit workload.
