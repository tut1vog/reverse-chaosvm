# Plan

## Status
Current phase: Phase 66 — Simplification Pass
Current task: 66.3 — Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`

---

## Phases

### Phase 66: Simplification Pass
> Shrink the project surface area to (1) pure-Node scraper, (2) Puppeteer scraper (renamed from `captcha-solver`), (3) porting pipeline, (4) docs. Inline `tools/token-generator/` and `tools/vdata-generator/` into `tools/scraper/`. Delete three obsolete research tracks, `.claude/skills/port-opcodes.md`, `.claude/rules/research-artifacts.md`, and two dead tests. Decide on `tools/captcha-solver/live-submit.js`. Commit at the logical checkpoints recommended by the brief (after each structural task), then batch prose/doc citation cleanup into one dedicated sweep at the end.

| ID | Task | Status |
|----|------|--------|
| 66.1 | Deletions + port-version.md Stage 1 reconciliation | done |
| 66.2 | Rename `tools/captcha-solver/` → `tools/puppeteer/` + code-level path sweep | done |
| 66.3 | Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`; land CLAUDE.md/README.md updates | in-progress |
| 66.4 | Investigate `tools/puppeteer/live-submit.js`; report recommendation and pause for user | pending |
| 66.5 | Act on live-submit decision (shape defined after 66.4) | pending |
| 66.6 | Doc-citation sweep — update prose/comments/JSON metadata that cites deleted or renamed paths | pending |
| 66.7 | Final verification sweep + close phase (delete plan.md, project-brief.md) | pending |

---

## Current Task

**ID**: 66.3
**Title**: Inline `tools/token-generator/` + `tools/vdata-generator/` under `tools/scraper/`
**Phase**: Phase 66 — Simplification Pass
**Status**: in-progress

### Goal
Move `tools/token-generator/` → `tools/scraper/token-generator/` and `tools/vdata-generator/` → `tools/scraper/vdata-generator/` via `git mv` so both records as renames. Update every code-level `require()` that crosses the moved boundary, update two `package.json` script paths, update one internal cross-import inside the moved token-generator tree, and stage the already-modified `CLAUDE.md` and `README.md` — which were pre-written to describe this post-inline state and become accurate only once this task lands. `npm test` must stay green.

### Context
Fresh greps performed against the current (post-66.2) working tree; these are the exact `require()` sites that must be updated:

**From `tools/scraper/` (siblings become children — `../` collapses to `./`):**
- `tools/scraper/collect-generator.js:19` — `require('../token-generator/collector-schema.js')` → `require('./token-generator/collector-schema.js')`
- `tools/scraper/collect-generator.js:25` — `require('../token-generator/outer-pipeline.js')` → `require('./token-generator/outer-pipeline.js')`
- `tools/scraper/collect-generator.js:26` — `require('../token-generator/generate-token.js')` → `require('./token-generator/generate-token.js')`
- `tools/scraper/scraper.js:25` — `require('../vdata-generator/for-post')` → `require('./vdata-generator/for-post')`

**From `tools/puppeteer/` (cross-sibling now goes via scraper):**
- `tools/puppeteer/live-submit.js:32` — `require('../token-generator/outer-pipeline')` → `require('../scraper/token-generator/outer-pipeline')`

**From `tools/porting-pipeline/` (cross-sibling now goes via scraper):**
- `tools/porting-pipeline/token-verifier.js:18` — `require('../token-generator/generate-token.js')` → `require('../scraper/token-generator/generate-token.js')`
- `tools/porting-pipeline/token-verifier.js:19` — `require('../token-generator/outer-pipeline.js')` → `require('../scraper/token-generator/outer-pipeline.js')`
- `tools/porting-pipeline/structure-extractor.js:26` — `require('../token-generator/outer-pipeline')` → `require('../scraper/token-generator/outer-pipeline')`
- `tools/porting-pipeline/structure-extractor.js:27` — `require('../token-generator/collector-schema')` → `require('../scraper/token-generator/collector-schema')`

**From `tools/dynamic-tracers/` (brief missed this; verified via grep):**
- `tools/dynamic-tracers/comparison-harness.js:47` — `require('../token-generator/generate-token.js')` → `require('../scraper/token-generator/generate-token.js')`
- `tools/dynamic-tracers/comparison-harness.js:48` — `require('../token-generator/crypto-core.js')` → `require('../scraper/token-generator/crypto-core.js')`

**From `tests/` (add an extra `scraper/` segment to the relative path):**
- `tests/test-outer-pipeline.js:17` — `require('../tools/token-generator/generate-token')` → `require('../tools/scraper/token-generator/generate-token')` [in `npm test`]
- `tests/test-chrome-profile-collect.js:22` — `require('../tools/token-generator/outer-pipeline.js')` → `require('../tools/scraper/token-generator/outer-pipeline.js')` [not in `npm test` but update anyway]
- `tests/test-vdata-generator-encoder.js:24,32,42` — `../tools/vdata-generator/{xtea.js,custom-base64.js,encode.js}` → `../tools/scraper/vdata-generator/{xtea.js,custom-base64.js,encode.js}` [in `npm test`]
- `tests/test-vdata-builder.js:22,23` — `../tools/vdata-generator/{replay.js,build-from-obj.js}` → `../tools/scraper/vdata-generator/{replay.js,build-from-obj.js}` [in `npm test`]
- `tests/test-vdata-for-post.js:17,20` — `../tools/vdata-generator/{build-key-field.js,for-post.js}` → `../tools/scraper/vdata-generator/{build-key-field.js,for-post.js}` [in `npm test`]

**Internal cross-import inside the moved tree** (brief flagged; verified):
- `tools/token-generator/decrypt.js:157` currently reads `const { generateCollect } = require('../scraper/collect-generator.js');`. After `git mv`, the file is at `tools/scraper/token-generator/decrypt.js` and `collect-generator.js` is a parent-sibling, so the require becomes `require('../collect-generator.js')`. Update.

**Sibling-relative internal requires inside each moved directory** (`./xxx.js` patterns between files in the same directory):
- Stay unchanged — they move together with their containing directory.

**`package.json`** — one script path to update:
- `"token:standalone": "node tools/token-generator/cli.js"` → `"node tools/scraper/token-generator/cli.js"`

**`research/template-pool/live-comparison.js`** — NO change for this task. Fresh grep confirms it does not import from `tools/token-generator/` or `tools/vdata-generator/`; its only `tools/*` imports are scraper, puppeteer, and porting-pipeline — all paths unaffected by this move.

**CLAUDE.md and README.md (already unstaged-modified before the phase started)** — both docs describe the post-inline state (`tools/scraper/token-generator/`, `tools/scraper/vdata-generator/`) and are currently inaccurate because the code hasn't caught up yet. After this task lands, the docs will match reality. **Stage them as part of this task's commit.**

**Do NOT update in this task** (deferred to 66.6 doc-citation sweep):
- Any prose/comment citation of `tools/token-generator/` or `tools/vdata-generator/` in `docs/*.md`, file-header comments (the moved dirs each have ~10 files with comment headers that may cite paths), `tools/scraper/token-generator/README.md` or `tools/scraper/vdata-generator/README.md` if they exist. 66.6 will batch these with the earlier-deferred cleanup.

**Do NOT touch** `tests/fixtures/`, `tests/asset/`, `profiles/`, `.claude/settings*.json`, `plan.md`, `project-brief.md`, `results.json`, or anything under `output/`.

### Implementation Steps
1. `git mv tools/token-generator tools/scraper/token-generator`.
2. `git mv tools/vdata-generator tools/scraper/vdata-generator`.
3. Verify both moves with `git status --short` — expect `R  tools/token-generator/X -> tools/scraper/token-generator/X` and `R  tools/vdata-generator/X -> tools/scraper/vdata-generator/X` for every file in each directory.
4. Update the fifteen code-level `require()` call sites listed in the Context section (4 from scraper, 1 from puppeteer, 4 from porting-pipeline, 2 from dynamic-tracers, 1 + 1 + 3 + 2 + 2 = 9 from tests, minus overlap gives the 15 call sites). Each edit is a narrow substring replacement in the `require(...)` string. Do not modify anything else in these files.
5. Update the internal cross-import in `tools/scraper/token-generator/decrypt.js:157` — `require('../scraper/collect-generator.js')` → `require('../collect-generator.js')`.
6. Update `package.json`: `"token:standalone"` script — `tools/token-generator/cli.js` → `tools/scraper/token-generator/cli.js`. No other edits.
7. Stage `CLAUDE.md` and `README.md` for inclusion in this commit (`git add CLAUDE.md README.md`). Do NOT modify their contents — they were pre-written by the user and describe the post-66.3 reality. Just include them in the staging area so they land with this task.
8. Run the code-level-importer sweep — all four must return zero hits:
   ```
   grep -rn -E "require\(['\"]\.\./token-generator" --include='*.js' .
   grep -rn -E "require\(['\"]\.\./vdata-generator" --include='*.js' .
   grep -rn -E "require\(['\"]\.\./\.\./tools/token-generator" --include='*.js' .
   grep -rn -E "require\(['\"]\.\./\.\./tools/vdata-generator" --include='*.js' .
   ```
   Plus one more to catch any `package.json` leftovers:
   ```
   grep -rn "tools/token-generator\|tools/vdata-generator" --include='*.json' .
   ```
9. Run `npm test` — must be 8/8 green (same baseline as post-66.2).
10. Run `node tools/scraper/token-generator/cli.js --help` — must exit 0.
11. Run `node tools/scraper/vdata-generator/cli.js --help` — must exit 0.

### Verification
- [ ] `git status --short` shows every file in the former `tools/token-generator/` recorded as `R  tools/token-generator/X -> tools/scraper/token-generator/X`, ditto for `vdata-generator`. No delete+add pairs.
- [ ] Modified entries include all fifteen importer files plus `tools/scraper/token-generator/decrypt.js`, `package.json`, `CLAUDE.md`, `README.md`. No unexpected modifications.
- [ ] All five post-edit grep sweeps from step 8 return zero hits.
- [ ] `grep -n "token:standalone" package.json` shows `tools/scraper/token-generator/cli.js`.
- [ ] `npm test` passes — 8 test files, same baseline as post-66.2.
- [ ] `node tools/scraper/token-generator/cli.js --help` and `node tools/scraper/vdata-generator/cli.js --help` both exit 0.
- [ ] Residual prose/comment citations of `tools/token-generator/` or `tools/vdata-generator/` in docs, file-header comments, and README files under the moved dirs are **expected to exist after this task** — they will be cleaned up in 66.6. Do not fail verification on those.

### Suggested Agent
`general-purpose` — mechanical `git mv` + require-path sweep with one narrowly-scoped cross-import fix and one config update. No specialized agent fits better.
