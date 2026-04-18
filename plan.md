# Plan

## Status
Current phase: **Phase 64** — Cleanup pass
Current task: **64.8** — Rewrite `docs/HAR_ANALYSIS.md`

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
| 64.2 | Remove `targets/`, `sample/`, `results.json`, **21 broken-by-implication test files** (9 originally listed + 12 decompiler snapshots exposed by 64.1); update `package.json`'s `test` script; trim Groups B/F from `tests/test-vdata-for-post.js`; leave `TODO(follow-up)` in `tools/captcha-solver/live-submit.js` above the `sample/` reads | done |
| 64.3 | Remove 5 dead research tracks (`research/errorcode-12/`, `research/scraper-tls-impersonation/`, `research/collector-fields/`, `research/eks-payload/`, `research/key-mod/`), `docs/ERRORCODE_12_INVESTIGATION.md`, and orphan `tests/test-token-isolation.js` (imports just-deleted module) | done |
| 64.4 | Remove `scripts/`, `history/`, `docs/PROGRESS.md`, `docs/WORKFLOW.md`, `docs/CONVENTIONS.md` | done |
| 64.5 | Remove `.claude/commands/fetch-latest.md` and `.claude/rules/targets-readonly.md` | done |
| 64.6 | Remove `decompile` script from `package.json` | done |
| 64.7 | Doc path sweep — scrub `targets/tdc*.js` and `sample/*` citations across `docs/` (excluding `HAR_ANALYSIS.md`), `README.md`, and `.claude/` (agents, commands, skills) | done |
| 64.8 | Rewrite `docs/HAR_ANALYSIS.md` — abstract description of the captured flow, cross-references to current docs, protocol analysis preserved | pending |
| 64.9 | Dependency usage audit — report remaining references to `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `canvas` after earlier cleanup tasks land (report only — do not remove) | pending |
| 64.10 | Final: delete `plan.md` and `project-brief.md` | pending |

---

## Blocker resolution — Option A selected (2026-04-18)
User confirmed Option A: expand 64.2's deletion scope to also include the 12 register-VM decompiler snapshot test files plus Groups B/F inside `tests/test-vdata-for-post.js`. The diagnosis that follows is preserved as the audit trail for the scope decision.

## Blocker — 64.2 verification failed (resolved by Option A above)

### What happened
- Subagent completed all 64.2 deletions and edits correctly (targets/, sample/, results.json, 9 test files gone; package.json test script trimmed to 22 entries; TODO block inserted at `tools/captcha-solver/live-submit.js:495-509` above the `sample/` reads).
- `npm test` reports **51 failures across 12 surviving test files** + 2 failing subtests inside `tests/test-vdata-for-post.js`. The root cause is the previous task (64.1): deleting `output/` removed committed artifacts that **12 register-VM decompiler tests read as inputs**. Deleting `sample/captcha-har.har` in 64.2 additionally breaks 2 HAR-oracle subtests.

### Scope gap
The brief's execution guidance said "The suite will shrink by 9 tests (input files being deleted) — the remaining tests must still pass." This undercounted by 12 whole test files + 2 subtests. The undercounted tests fall into two classes:

**Class A — register-VM decompiler snapshot tests (12 files)** — read committed artifacts from `output/` that 64.1 deleted. These validate the decompiler pipeline against pinned intermediate outputs (disasm, cfg, patterns, semantics, folded output, reconstructed source, emitted code, collector schema, vm-slide dispatch table, etc.). The production decompiler lives in `research/tdc-register-vm/` and the `tools/porting-pipeline/*` chain — output can be regenerated at any time by re-running the pipeline. These tests are effectively dev-process snapshots, not durable interface contracts.

Failing tests and the `output/*` paths they read:

| Test file | Reads |
|---|---|
| `tests/test-disasm.js` | `output/disasm-full.txt`, `output/disasm-main.txt` |
| `tests/test-strings.js` | `output/strings.txt` |
| `tests/test-cfg.js` | `output/cfg.json`, `output/disasm-full.txt`, `output/functions.json` |
| `tests/test-patterns.js` | `output/cfg-summary.txt`, `output/cfg.json`, `output/patterns-summary.txt`, `output/patterns.json` |
| `tests/test-semantics.js` | `output/disasm-full.txt` |
| `tests/test-fold.js` | `output/cfg.json`, `output/disasm-full.txt`, `output/fold-examples.txt`, `output/fold-summary.txt`, `output/strings.json` |
| `tests/test-reconstruct.js` | `output/cfg.json`, `output/disasm-full.txt`, `output/strings.json` |
| `tests/test-emit.js` | `output/cfg.json`, `output/decompiled.js`, `output/emit-samples.txt`, `output/emit-summary.txt`, `output/fold-summary.txt`, `output/functions.json`, `output/patterns.json` |
| `tests/test-collector-schema.js` | `output/dynamic/collector-map.json` |
| `tests/outer-pipeline.test.js` | `output/dynamic/collector-map.json`, `output/dynamic/encoding-trace.json`, `output/token/outer-pipeline-verify.json` |
| `tests/test-vm-slide-decoder.js` | `output/vm-slide/bytecode.json`, `output/vm-slide/disassembly.txt`, `output/vm-slide/dispatch-table.json` |
| `tests/test-vm-slide-walker.js` | `output/vm-slide/disassembly-full.txt` |

**Class B — HAR-oracle subtests in `tests/test-vdata-for-post.js`** — load `sample/captcha-har.har` as a "load-bearing" byte-identity reference:
- `Group B — computeKeyField HAR oracle (load-bearing)` (line 135)
- `Group F — buildVDataForPost HAR byte-identity (end-to-end)` (line 200)

Groups A, C, D, E, G do not depend on `sample/` and should survive. The durable byte-identical round-trip guarantee is already covered by `tests/fixtures/vdata-{har,jsdom}-capture.json` — tests `encoder fixture round-trip: HAR` and `encoder fixture round-trip: jsdom` in `tests/test-vdata-generator-encoder.js` continue to pass.

### Options for remediation

**Option A — Expand deletion scope (recommended).** Add the 12 Class A test files to 64.2's deletion list, trim the 2 Class B subtests from `tests/test-vdata-for-post.js` (keeping Groups A/C/D/E/G), and update `package.json`'s test script to drop the 12 Class A entries. Result: suite drops from 22 back down to 10 surviving files (~65 subtests remain). Rationale: these tests are dev-process snapshots tied to artifacts that the brief explicitly deemed re-runnable residue; the byte-identity guarantee moves fully to the `tests/fixtures/vdata-*` round-trip fixtures, which are the durable acceptance bar per `CLAUDE.md`'s durable facts. Stable VM decompiler validation lives at the pipeline level (`tools/porting-pipeline/` + live verifier), not at the snapshot-test level.

**Option B — Preserve snapshot fidelity.** Commit a minimal subset of `output/*` artifacts and `sample/captcha-har.har` as `tests/fixtures/*`, then rewrite the 12 + 2 tests to read from `tests/fixtures/` instead of `output/` / `sample/`. Rationale: keeps the decompiler snapshot tests as a regression safety net. Cost: ~15 file moves + 14 test edits; contradicts the brief's framing that `output/` is dev residue.

**Option C — Revert everything.** Revert commits `e38b7f6` (scaffold+plan) and `66fc01c` (64.1 output/ delete); redesign the cleanup pass around preserving test-input subdirectories under `output/` and `sample/`. Rationale: start over with a more accurate scope. Cost: lose the already-completed 64.1 delete and the scaffold commit; requires rewriting the brief's "Planned — deletions" section for `output/` and `sample/`.

### Recommendation
**Option A.** The decompiler-snapshot tests lock in an intermediate representation that is regenerated on every porting run; they fail closed when the pipeline evolves, which is why `output/` accumulated stale data in the first place. The durable contract is byte-identical token generation (green via `tests/fixtures/vdata-*` round-trips and the porting pipeline's own verifier step). Expanding the delete scope by 12 files + 2 subtests keeps the cleanup's "strip dev residue" intent intact.

### Pending working-tree state (for Option A or B — discarded for C)
- `targets/` (6 files), `sample/` (7 files), `results.json`, and 9 test files are staged-deleted in the working tree (currently unstaged after `git restore --staged .` — diff preserved).
- `package.json` test script trimmed to 22 entries (working tree modified).
- `tools/captcha-solver/live-submit.js:495-509` has the TODO block inserted (working tree modified).
- No git commits have landed for this task yet — 64.2's work is purely in the working tree.

## Current Task

**ID**: 64.8
**Title**: Rewrite `docs/HAR_ANALYSIS.md` — abstract description of the captured flow, cross-references to current docs, protocol analysis preserved
**Phase**: Phase 64 — Cleanup pass
**Status**: in-progress

### Goal
Produce a replacement `docs/HAR_ANALYSIS.md` that documents the CAPTCHA protocol (endpoint sequence, headers, body formats) as durable reference material, without any references to the deleted `sample/captcha-har.har` file or the "Task 10.5 — our bot vs real browser" phase-narrative framing. Cross-reference the three surviving docs that own the collect / vData / orchestrator findings.

### Context

**Current file** (134 lines). Key content:
- Section "Source" cites `sample/captcha-har.har` — must go.
- "Complete Request Inventory" — 12 requests with method, host, path, size. Durable protocol reference. **Keep**, drop the "Our Bot?" column (phase-narrative).
- "🚨 SMOKING GUN: `vData` Field" — Task-10 investigation framing. **Abstract** into a statement that vData is generated by `vm-slide.enc.js` via jQuery's `$.ajaxPrefilter`. Cross-ref `docs/VDATA_FORMAT.md` and `docs/CAPTCHA_ORCHESTRATOR.md` for details.
- "How vData is Generated" — 5 bullet steps. **Keep**, remove the "our bot is missing" framing.
- `tcaptcha-slide.js` code snippet — durable protocol detail. **Keep**.
- "Why This Causes errorCode 9" — Task-10 phase content. **Drop** entirely — the investigation is closed and documented in git log.
- "Other Missing/Wrong Fields" tables — phase-specific prose. **Drop or abstract to "the 39-field verify POST schema"** with cross-ref to the generator code in `tools/token-generator/` or `tools/scraper/`.
- "Subsid Tracking" — durable behavior observation. **Keep** as a protocol note.
- "Referer on Verify" — durable protocol detail. **Keep**.
- Everything past line 80 (not seen in the preview) should be reviewed and kept/dropped by the same criteria.

### Transformation rules

1. **Replace the Source reference**: "Source: `sample/captcha-har.har`" → "Source: a Chrome 146 HAR captured solving a slider CAPTCHA on `urlsec.qq.com/check.html`. The captured flow has 12 requests, no WebSockets."

2. **Drop investigation framing**: any mention of "our bot", "smoking gun", "Attempt N", "errorCode 9" (as a debug framing), "Task 10.5", or scraper-vs-browser deltas — remove.

3. **Keep protocol analysis**: the 12-request sequence with method/host/path/size; the vm-slide-enc.js vData injection mechanism; the 39-field POST body schema; Subsid / Referer observations.

4. **Add cross-references**:
   - First mention of vData → link `docs/VDATA_FORMAT.md` (byte-level spec) and `docs/CAPTCHA_ORCHESTRATOR.md` (orchestration flow).
   - First mention of the verify POST → link `docs/TOKEN_FORMAT.md` (collect spec) and `docs/CAPTCHA_ORCHESTRATOR.md` (body origination).
   - `tdc.js` mention → link `docs/TOKEN_FORMAT.md`.

5. **Title and opening**: rename section title from "HAR Traffic Analysis — Task 10.5.1" to "HAR Analysis — CAPTCHA Protocol Flow". Opening paragraph should state the purpose: this doc documents the observed HTTP flow of Tencent's slider CAPTCHA protocol, captured from a real Chrome browser, as durable protocol reference material.

6. **Size target**: ≤ 100 lines after rewrite. If content to preserve is larger than that, prioritize the Request Inventory, vData injection mechanism, and protocol observations (Subsid, Referer) — drop anything that's investigation-flavored or duplicated in other docs.

### Implementation Steps
1. `cd /home/ubun/github.com/tut1vog/reverse-chaosvm`.
2. Read the full current `docs/HAR_ANALYSIS.md` (134 lines).
3. Identify every durable protocol observation and every phase-narrative/investigation fragment.
4. Write the replacement content by transforming, cutting, and cross-referencing per the rules above.
5. Overwrite `docs/HAR_ANALYSIS.md` with the new content.
6. Run `npm test` — must stay green (no tests depend on this doc, but confirm).
7. Grep checks: `grep -cE 'sample/captcha-har|Task 10\.|SMOKING GUN|our bot|errorCode 9' docs/HAR_ANALYSIS.md` → `0`.

### Verification — capture exact output
- `wc -l docs/HAR_ANALYSIS.md` → ≤ `100`.
- `grep -cE 'sample/|Task 10\.|SMOKING GUN|our bot|errorCode 9' docs/HAR_ANALYSIS.md` → `0`.
- `grep -cE 'VDATA_FORMAT\.md|TOKEN_FORMAT\.md|CAPTCHA_ORCHESTRATOR\.md' docs/HAR_ANALYSIS.md` → ≥ `3` (at least one link to each).
- The 12-request inventory (or equivalent table) still present.
- `npm test 2>&1 | tail -8` → `# fail 0`.
- `git diff --stat docs/HAR_ANALYSIS.md` — should show a substantial diff (most of the file changed).
- `git diff --cached --name-only` — only `docs/HAR_ANALYSIS.md` staged; no other files changed.

### Constraints
- **Do not make any git commits.** The director handles the final commit after verification.
- **Do not modify any file other than `docs/HAR_ANALYSIS.md`**. Do not touch tools/, tests/, research/, profiles/, CLAUDE.md, README.md, other docs/, .claude/, package.json, plan.md, project-brief.md, .gitignore.
- **Do not invent protocol facts**. Every claim in the rewrite must be traceable to content in the original file or to the surviving docs (VDATA_FORMAT.md, TOKEN_FORMAT.md, CAPTCHA_ORCHESTRATOR.md). If a fact is ambiguous, drop it or mark it "observed".
- **Do not add file-system references to deleted paths**. No `sample/`, no `targets/`, no `scripts/`, no `output/*.json` as inputs to the reader, no `history/*.md`. Internal links to surviving docs (VDATA_FORMAT.md, etc.) are fine.
- **Preserve Markdown structure**: valid tables, valid headings, fenced code blocks for any code snippets.

### Report back
Under 350 words:
1. Line counts: before, after.
2. Summary of what was kept vs cut vs rewritten.
3. Which surviving docs are cross-referenced and from where.
4. `npm test` summary.
5. Grep verification output.
6. Any facts from the original that you weren't sure about and dropped (for director review).

### Suggested Agent
general-purpose — in-place rewrite with structured editorial judgment; benefits from reading the surviving cross-ref docs first to get phrasing consistent.

### Goal
Replace every stale reference to a deleted path (from 64.1–64.6) with an abstract description. Preserve technical content. Leave `docs/HAR_ANALYSIS.md` alone — 64.8 rewrites it wholesale. No test code touches this, but `npm test` must stay green.

### Transformation rules

**`targets/tdc*.js` citations**:
- `targets/tdc.js` → "the Template A reference build" (or phrase as appropriate to context — it's the reference build in every repo citation).
- `targets/tdc-v2.js` / `tdc-v3.js` / `tdc-v4.js` / `tdc-v5.js` / `tdc-live.js` → the specific template (B, C, or other) by name, OR a generic "a known tdc.js build" when the specific template isn't the point.
- `targets/tdc*.js` / `across targets/` → "across known templates A / B / C" or "across the register-machine tdc.js builds observed to date".
- "in `targets/`" / "read-only `targets/`" language → remove or rephrase as "the caller-supplied target path" (the tools now take a path argument).

**`sample/*` citations**:
- `sample/vm_slide.js` → "the vm-slide build the research scripts were run against".
- `sample/t_captcha_slide.js` → "the `t_captcha_slide.js` build the research scripts were run against".
- `sample/captcha-har.har` → "the captured CAPTCHA HAR the research scripts were run against" (or rephrase to a protocol-level description when possible).
- `sample/slide-jy.js` → "the jQuery-style bundle fetched during the slide flow".
- `sample/bot.py`, `sample/payload.txt`, `sample/cap_union_prehandle` — unlikely to be cited; if they are, abstract them similarly.

**Known handoffs from 64.3 / 64.4 / 64.6 (must all be fixed)**:
- `docs/VM_SLIDE_ARCHITECTURE.md` — 4 refs to `research/eks-payload/`, 2 refs to `research/key-mod/` (both dead tracks). Replace with abstract descriptions of what was in those tracks, or cut if the surrounding paragraph is about the dead track itself.
- `docs/CAPTCHA_ORCHESTRATOR.md` — 3 refs to `docs/ERRORCODE_12_INVESTIGATION.md` (deleted doc). Remove or rewrite the sentences.
- `docs/VERSION_DIFFERENCES.md:373` — "See `scripts/tdc-survey.js` for survey methodology" — scripts/ is gone. Either describe the methodology in-line or remove the pointer.
- `README.md:220-223` — table rows for `WORKFLOW.md`, `CONVENTIONS.md`, `PROGRESS.md` (deleted docs). Remove those rows.
- `README.md:251` — `npm run decompile` reference. Replace with the direct-invocation form documented in `CLAUDE.md`: `node research/tdc-register-vm/run.js --input <path> --output output/<stem>`, or cut if the surrounding prose is otherwise broken.
- `tests/test-tdc-diagnose.js:4` and `tests/test-tdc-survey.js:4` — stale header comments pointing at `scripts/tdc-diagnose.js` / `scripts/tdc-survey.js`. These are code comments, not doc citations. The brief's scope for 64.7 is docs + README + `.claude/`. **Skip these two test-file comments** — note in the report that they exist but are out of this task's scope (they can be handled in a follow-up pass if the user wants).

**Brief's explicit doc sweep list** (scrub all of these):
- `docs/CHAOSVM_VARIANTS.md`, `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/CAPTCHA_ORCHESTRATOR.md`, `docs/VDATA_FORMAT.md`, `docs/TOKEN_FORMAT.md`, `docs/TOKEN_DECRYPTION.md`, `docs/COLLECTOR_SCHEMA.md`, `docs/COLLECT_FINGERPRINT_ANALYSIS.md`, `docs/CRYPTO_ANALYSIS.md`, `docs/EKS_FORMAT.md`, `docs/OPCODE_REFERENCE.md`, `docs/VM_ARCHITECTURE.md`, `docs/VERSION_DIFFERENCES.md`.
- `README.md` — sweep same stale paths; cut any phase-narrative prose (e.g. "Phase 47 proved X" or "Phase 63 slim scraper" prose in the README should be cut or abstracted). Match the style of the refreshed `CLAUDE.md` — concise, no phase narrative. Keep the usage sections. Don't change the project description at the top unless the paths in it are stale.
- `.claude/agents/key-extractor.md`, `.claude/agents/opcode-mapper.md`, `.claude/agents/token-verifier.md` — replace "`targets/*.js` (READ ONLY)" / "never modify `targets/`" language with "the caller-supplied target path". The agents are always invoked with a path argument.
- `.claude/commands/port-version.md` — update argument description and example so it no longer implies `targets/tdc-v*.js`. The command still takes a path; make the example a fresh-fetch path (e.g. `./output/puppeteer-capture/tdc-source.js` or a temp path).
- `.claude/commands/scrape.md` — sweep for `targets/`/`sample/` references (likely none, verify).
- `.claude/skills/port-opcodes.md` — path sweep.

**Do not modify**:
- `docs/HAR_ANALYSIS.md` — 64.8 rewrites it.
- Any file under `tools/`, `tests/`, `research/`, `profiles/`.
- `CLAUDE.md` — already refreshed in the scaffold.
- `package.json`, `plan.md`, `project-brief.md`, `.gitignore`.
- `.claude/rules/*.md` — all four surviving rules (coding-style, output-versioning, research-artifacts, verify-dont-assume) are already refreshed in the scaffold; the patterns above shouldn't touch them.

**Preserve technical content**. This is pure reference scrubbing. Do not delete or rewrite protocol analysis, field tables, opcode tables, XTEA parameter discussions, fingerprint schemas, or algorithmic descriptions. If a paragraph's entire purpose is "this is the specific file the research script was run against" and that sentence is the only point, the abstracted version is fine; but keep everything else.

### Before-edit discovery
Before editing, run the following and save the output as your starting checklist — the specific line numbers/files are the scope:

```bash
# 1. Stale sample/ and targets/ citations across the doc sweep set
grep -rnE '(sample/|targets/)[a-zA-Z0-9_.-]+' \
  docs/ README.md .claude/agents/ .claude/commands/ .claude/skills/ \
  2>/dev/null | grep -v 'docs/HAR_ANALYSIS\.md'

# 2. "targets/" READ ONLY / never-modify patterns
grep -rnE '(READ ONLY|never modify).{0,40}targets/' \
  docs/ README.md .claude/ 2>/dev/null | grep -v 'docs/HAR_ANALYSIS\.md'

# 3. Deleted-doc / deleted-track name references
grep -rnE '(ERRORCODE_12_INVESTIGATION|PROGRESS\.md|WORKFLOW\.md|CONVENTIONS\.md|eks-payload|key-mod|errorcode-12|scraper-tls-impersonation|collector-fields)' \
  docs/ README.md .claude/ 2>/dev/null | grep -v 'docs/HAR_ANALYSIS\.md'

# 4. Deleted scripts references
grep -rnE 'scripts/[a-zA-Z0-9_.-]+\.(js|py)' \
  docs/ README.md .claude/ 2>/dev/null | grep -v 'docs/HAR_ANALYSIS\.md'

# 5. npm run decompile
grep -rnE 'npm run decompile' docs/ README.md .claude/ 2>/dev/null
```

### Implementation Steps
1. Run the 5 grep queries and save their combined output as the work queue. Every hit outside `docs/HAR_ANALYSIS.md` must be addressed.
2. For each file that has hits, read it, apply the transformation rules above, then verify the file re-reads cleanly (no broken Markdown tables, no orphan sentences). Preserve file-level anchors, section headers, and technical content.
3. For `README.md` specifically: also cut phase-narrative prose (e.g. "Phase 47 eliminated X", "Phase 63 slim scraper", etc.). Match the compact reference-style of the refreshed `CLAUDE.md`. Keep the usage commands, directory layout, and stack section.
4. For `.claude/agents/*.md` (3 files) and `.claude/commands/port-version.md`: rewrite the "target path" convention language to reflect that the caller always supplies a path argument.
5. Run `npm test` — must stay green.
6. Re-run the 5 grep queries — all 5 should now return empty output (or only lines in `docs/HAR_ANALYSIS.md`, which is out of scope).

### Verification — capture exact output
- Re-run each of the 5 grep queries. All 5 should be empty when restricted to the sweep surface (exclude HAR_ANALYSIS.md).
- `npm test 2>&1 | tail -8` → `# fail 0`.
- `git diff --cached --name-only | sort` → only files within the sweep set (docs/<various>.md, README.md, .claude/agents/<3 files>.md, .claude/commands/<maybe 2>.md, .claude/skills/port-opcodes.md). No files under `tools/`, `tests/`, `research/`, `profiles/`. No changes to `CLAUDE.md`, `package.json`, `plan.md`, `project-brief.md`.
- For each modified agent file (`key-extractor.md`, `opcode-mapper.md`, `token-verifier.md`): `grep -iE 'targets/\*\.js|READ ONLY|never modify.*targets/' <file>` → `0` matches.
- For `README.md`: `grep -nE 'npm run decompile|WORKFLOW\.md|CONVENTIONS\.md|PROGRESS\.md|targets/tdc|sample/' README.md` → `0` matches (the `targets/` in grep is specifically the deleted directory, not arbitrary uses of the word "targets" in prose).

### Report back
Under 500 words:
1. The Before-edit grep findings (count per file).
2. Per-file summary of what you changed and why.
3. The After-edit grep findings (should be empty per query).
4. `npm test` summary.
5. Any files with hits in the Before scan that you intentionally didn't change, with justification.
6. Any surprises.

### Constraints
- **Do not make any git commits.** The director handles the final commit after verification.
- **Do not modify** `docs/HAR_ANALYSIS.md`, any file under `tools/`/`tests/`/`research/`/`profiles/`, `CLAUDE.md`, `package.json`, `plan.md`, `project-brief.md`, `.claude/rules/*.md`, `.claude/settings.local.json` (if present), or `.gitignore`.
- **Do not add or remove files** — this is an edit-only pass.
- **Preserve technical accuracy**. If you're uncertain whether a change preserves meaning, leave the text as-is and flag it in the report for director review.
- **Do not invent facts**. When replacing "in `targets/tdc.js`" with "in the Template A reference build", the original sentence's subject must actually be about the Template A reference build. If the context is ambiguous, use a generic phrasing ("in one of the known register-machine tdc.js builds") rather than asserting template identity.
- **If the task becomes too large or ambiguous**, stop partway and report — do not press on with uncertain edits.

### Suggested Agent
general-purpose — large-surface reference scrub with mechanical transformation rules; benefits from careful reading of surrounding context before each edit.

### Goal
Land the Option A remediation: on top of the already-done 64.2 work (still unstaged in the working tree), delete the 12 decompiler-snapshot test files and trim Groups B/F from `tests/test-vdata-for-post.js`. Update `package.json`'s `test` script to drop the 12 additional entries. `npm test` must be fully green before commit.

### Context

**Already done in working tree (preserve)**:
- Deletions: `targets/` (6 files), `sample/` (7 files), `results.json`, 9 test files (`test-decoder`, `test-deobfuscator`, `test-key-extractor`, `test-opcode-mapper`, `test-vm-parser`, `test-pipeline-integration`, `test-request-chain-fidelity`, `test-scraper-foundation`, `test-vdata-generator`).
- `package.json` test script already trimmed to 22 entries (the 8 of the 9 referenced).
- TODO block at `tools/captcha-solver/live-submit.js:495-509` above the `sample/` reads.

**New deletions to land in this pass (12 additional test files)**:
1. `tests/test-disasm.js`
2. `tests/test-strings.js`
3. `tests/test-cfg.js`
4. `tests/test-patterns.js`
5. `tests/test-semantics.js`
6. `tests/test-fold.js`
7. `tests/test-reconstruct.js`
8. `tests/test-emit.js`
9. `tests/test-collector-schema.js`
10. `tests/outer-pipeline.test.js`
11. `tests/test-vm-slide-decoder.js`
12. `tests/test-vm-slide-walker.js`

All 12 appear in the current `package.json` `test` script and must be removed from that line in the same change. After this pass, the test script should list exactly 10 files:
- `tests/test-vdata-generator-encoder.js`
- `tests/test-vdata-builder.js`
- `tests/test-vdata-for-post.js`
- `tests/test-scraper.js`
- `tests/test-structure-extractor.js`
- `tests/test-outer-pipeline.js`
- `tests/test-tdc-survey.js`
- `tests/test-tdc-diagnose.js`
- `tests/test-auto-port.js`
- `tests/test-phase49-profile-fixes.js`

**Trim in `tests/test-vdata-for-post.js`**:
- Remove Group B (test block at lines 133-140) and Group F (test block at lines 198-235). Remove the supporting helper `loadHarVerifyBody` (lines 67-78), the constants `HAR_SAMPLE_PATH` (line 47), `HAR_OBJ` (lines 53-62), `HAR_ORDER` (line 63), and the `buildVDataFromObj` import (lines 23-25) if they become dead code after the two groups are gone. Keep Groups A/C/D/E/G, plus `FIXTURES_DIR`, `HAR_FIXTURE_PATH`, and anything else they still need. Preserve comment headers for the surviving groups.

### Implementation Steps
1. `cd /home/ubun/github.com/tut1vog/reverse-chaosvm`. Confirm working tree contains the pre-existing 64.2 work (the 23 deletions, `package.json` mod, `live-submit.js` mod — none staged).
2. `git rm tests/test-disasm.js tests/test-strings.js tests/test-cfg.js tests/test-patterns.js tests/test-semantics.js tests/test-fold.js tests/test-reconstruct.js tests/test-emit.js tests/test-collector-schema.js tests/outer-pipeline.test.js tests/test-vm-slide-decoder.js tests/test-vm-slide-walker.js` — stages 12 deletions.
3. Read `package.json` and edit the `test` script to remove the 12 additional `tests/<name>.js` tokens. The final line should list only the 10 test files above. Preserve single-space separation. Do not reformat any other part of the file.
4. Read `tests/test-vdata-for-post.js` and remove Group B (lines 133-140) and Group F (lines 198-235), plus the now-dead imports / constants / helpers (`HAR_SAMPLE_PATH`, `HAR_OBJ`, `HAR_ORDER`, `loadHarVerifyBody`, `buildVDataFromObj` import). Verify the file still parses and that surviving groups A, C, D, E, G are untouched. Keep comment headers and empty separator lines between surviving groups.
5. Run `npm test`. It must exit 0 with `# fail 0`.
6. Stage the remaining 64.2 work that wasn't previously staged: `git add package.json tools/captcha-solver/live-submit.js tests/test-vdata-for-post.js` and confirm `git status --short` shows only the expected paths staged.

### Verification — capture exact output
- For each of the 12 newly deleted test files: `test ! -e tests/<name>.js && echo GONE || echo PRESENT` → `GONE` (report the summary).
- `node --input-type=commonjs -e "const p=require('./package.json'); const t=p.scripts.test.match(/tests\\/[^ ]+\\.js/g) || []; console.log('count:', t.length); console.log(t.sort().join('\\n'));"` → `count: 10` and the exact 10 expected filenames sorted.
- `grep -c 'Group B\|Group F\|loadHarVerifyBody\|HAR_SAMPLE_PATH\|HAR_OBJ\|HAR_ORDER\|buildVDataFromObj' tests/test-vdata-for-post.js` → `0` (no lingering references to the deleted pieces).
- `node --check tests/test-vdata-for-post.js` → exits 0 (file parses).
- `npm test 2>&1 | tail -10` → capture the TAP summary (`# tests`, `# pass`, `# fail 0`, `# skipped`, `# duration_ms`). `# fail` must be `0`.
- `git status --short` → full output. Expect: deletions for `targets/` (6), `sample/` (7), `results.json`, 21 tests (9 prior + 12 new), `D` entries totaling 35; `M` entries for `package.json`, `tools/captcha-solver/live-submit.js`, `tests/test-vdata-for-post.js`. No entries outside these sets (other than `M plan.md` which the director owns and you should leave alone).

### Constraints
- **Do not make any git commits.** The director handles the final commit after verification.
- **Do not modify any file not listed above.** No docs, no other tests, no `tools/` changes beyond what's already done, no `.claude/`, no `CLAUDE.md`, no `README.md`, no `plan.md`, no `project-brief.md`, no `.gitignore`, no `profiles/`, no `research/`, no `node_modules/`, no `package-lock.json`.
- **Preserve the existing TODO block** at `tools/captcha-solver/live-submit.js:495-509`. Do not re-edit that file unless you accidentally reverted the prior work, in which case reapply it verbatim (check with `grep -c 'TODO(follow-up): live-submit.js disk reads' tools/captcha-solver/live-submit.js` — should already be `1`).
- **If `npm test` fails** after your edits, stop. Do not patch tests or add mocks. Report the failing tests with exact error output.
- **If the task is too difficult or impossible**, stop immediately and report back with what you attempted and what went wrong.

### Warnings
Prior attempt (same task ID, pre-remediation) completed the file operations but `npm test` reported 51 failures because 64.1's deletion of `output/` had already broken 12 decompiler-snapshot tests that read `output/*.json` and `output/*.txt` as inputs. The original 64.2 prompt listed only 9 test deletions — the brief undercounted test dependencies. The expanded scope above is the remediation. Don't re-run the original 9-test deletion plan; build on the existing working-tree state.

### Report back
Return a concise report (under 300 words):
1. Literal output of each Verification command.
2. The final `test` script line from `package.json` (exact).
3. The line range you removed from `tests/test-vdata-for-post.js` (before / after line counts).
4. The `npm test` summary lines (`# tests X`, `# pass X`, `# fail 0`, `# duration_ms`).
5. Any surprises or deviations.

### Suggested Agent
general-purpose — precision deletion + small in-file edit + test-suite verification.

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
