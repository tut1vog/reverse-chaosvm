# Plan

## Status
Current phase: Phase 38 — Restructure
Current task: 38.2 — Create placeholder README.md files for the 5 research tracks

---

## Phases

### Phase 38: Restructure (Stream A — blocking)
> Reorganize the repo around the research phase. Preserve git history via `git mv`, rewrite `require()` paths, keep `npm test` at 296/296 as the pass/fail gate.

| ID | Task | Status |
|----|------|--------|
| 38.1 | Restructure repo into research/ + tools/ layout (git mv + require rewrites + package.json + README) | done |
| 38.2 | Create placeholder README.md files for the 5 research tracks | in-progress |
| 38.3 | Triage `scripts/` one-offs into research tracks or bench | pending |

### Phase 39: vm-slide stack VM (Stream B — Track 1, top priority)
> Decompile `sample/vm_slide.js` — stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`). Produce decoder, disassembler, opcode table, architecture doc, and a top-level variants comparison.

| ID | Task | Status |
|----|------|--------|
| 39.1 | Implement vm-slide decoder + disassembler under `research/vm-slide-stack-vm/` | pending |
| 39.2 | Write tests for vm-slide decoder + disassembler | pending |
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from verified findings | pending |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | pending |

---

## Current Task

**ID**: 38.2
**Title**: Create placeholder README.md files for the 5 research tracks
**Phase**: Phase 38 — Restructure
**Status**: in-progress

### Goal
Create a minimal `README.md` scaffold for each of the five new research tracks so every track is ready to receive work. `research/tdc-register-vm/` already exists via `git mv` and does not need a new README from this task.

### Context
After task 38.1, the following track directories exist but are empty or do not exist yet (need `mkdir`):

- `research/vm-slide-stack-vm/` — top priority, Track 1 (Phase 39). Open question: how does the stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, ~36 opcodes) used in `sample/vm_slide.js` work?
- `research/captcha-orchestrator/` — open question: how does `sample/t_captcha_slide.js` orchestrate the slide CAPTCHA end-to-end?
- `research/eks-payload/` — open question: what is the structure of the 232-byte `eks` payload baked into every `tdc.js` at line 123?
- `research/template-pool/` — open question: how many distinct `tdc.js` templates does Tencent rotate through, and how often?
- `research/key-mod/` — open question: are the XTEA key-modification constants identical across Templates A, B, C, or do they differ?

Each track's README must follow `.claude/rules/research-artifacts.md` requirements: **open question**, **status** (open / partial / closed), **inputs** (which `targets/`/`sample/` files it reads), and **how to reproduce** the latest run from the command line.

At this stage every README is a placeholder: status is `open`, and the "how to reproduce" section should simply say "No runnable artifacts yet — see `project-brief.md` for the definition of done."

Full detail for each track (DoD, inputs, permitted outputs) is in `project-brief.md` under "Stream B — Research tracks". The README should cite that as the authoritative source rather than duplicate it.

### Implementation Steps
1. Read `.claude/rules/research-artifacts.md` to confirm the README shape.
2. Read the five track sections in `project-brief.md` (Tracks 1–5) so every README's "open question" and "inputs" match the brief verbatim.
3. `mkdir -p` each of the five directories under `research/`.
4. Write a `README.md` in each with this shape:
   - `# <track-name>`
   - `## Open question` — one paragraph, taken from `project-brief.md`.
   - `## Status` — `open` (all tracks are brand-new).
   - `## Inputs` — bullet list of the `targets/` / `sample/` files the track reads.
   - `## How to reproduce` — single sentence: "No runnable artifacts yet — see `project-brief.md` §Stream B for the definition of done."
   - `## Notes` — empty heading, placeholder for working notes.
5. Do not create any source files yet. Do not create any `dead-ends/` directory yet (rule says "when a script is abandoned", not pre-emptively).

### Verification
- [ ] `ls research/{vm-slide-stack-vm,captcha-orchestrator,eks-payload,template-pool,key-mod}/README.md` — all five files exist.
- [ ] Each README has the five required sections (`Open question`, `Status`, `Inputs`, `How to reproduce`, `Notes`). `grep -c '^## ' research/<track>/README.md` returns 5 for each.
- [ ] Each `Open question` paragraph matches the corresponding track description in `project-brief.md` (the subagent should quote the brief, not paraphrase).
- [ ] No source files (`.js`, `.py`) created in any track directory.
- [ ] `npm test` still 296/296 (sanity — creating docs shouldn't touch tests, but confirm).

### Suggested Agent
`general-purpose` — lightweight documentation scaffolding, no specialized expertise needed.

### Context
Pre-restructure state (verified by the director):

- Clean working tree. Baseline: `npm test` → 296/296 (Phase 37 closing state).
- Old directories still live at the root: `decompiler/`, `token/`, `pipeline/`, `scraper/`, `puppeteer/`, `dynamic/`.
- `research/` and `tools/` do not yet exist.
- 122 `require()` occurrences of the old directory names across **42 files**, grouped as:
  - **Source code**: `scraper/{cli.js,collect-generator.js,scraper.js}`, `pipeline/{run.js,structure-extractor.js,token-verifier.js}`, `dynamic/comparison-harness.js`.
  - **Tests** (18 files): `tests/test-{semantics,slide-solver-real,deobfuscator,scraper-foundation,auto-port,pipeline-integration,opcode-mapper,disasm,collector-schema,cfg,outer-pipeline,vm-parser,scraper,reconstruct,emit,decoder,fold,strings,slide-solver,structure-extractor,key-extractor,vdata-generator}.js` plus `tests/outer-pipeline.test.js`.
  - **Scripts** (8 files): `scripts/{live-comparison,tdc-survey,discover-field-order,tdc-diagnose,decrypt-collect,token-isolation-test,chrome-cd-inject,live-captcha-submit}.js`.
  - **Docs / meta**: `docs/TOKEN_DECRYPTION.md` (1), `docs/TOKEN_FORMAT.md` (6), `project-brief.md` (1 — historical example; leave as-is since project-brief already references both old and new paths in running text), `.claude/commands/fetch-latest.md` (1).

The full directory-rename map:

| Old path | New path |
|----|----|
| `decompiler/` | `research/tdc-register-vm/` |
| `token/` | `tools/token-generator/` |
| `pipeline/` | `tools/porting-pipeline/` |
| `scraper/` | `tools/scraper/` |
| `puppeteer/` | `tools/captcha-solver/` |
| `dynamic/` | `tools/dynamic-tracers/` |

`package.json` script targets that need updating:
- `decompile` — currently points into `decompiler/`
- `token:standalone` — currently points into `token/`
- `solve:puppeteer` — currently points into `puppeteer/`
- `test` — the list of test files doesn't reference old dirs directly, but verify
- Any other script — enumerate all and rewrite anything matching the old prefixes

`CLAUDE.md` and `README.md` canonical command tables already document the **new** paths (they were refreshed in the scaffold pass). After the moves they must still match reality — re-verify, do not rewrite the docs to match any accidental drift in the move.

Protected paths that must NOT be modified in this task: `targets/**`, `sample/**`, `.claude/rules/**`, `history/**`. `history/<YYYYMMDD>.md` entries are factual records — do not rewrite old path references inside them. `docs/WORKFLOW.md` phase history is also a factual record and must not have old paths rewritten (per project-brief).

The restructure must also touch (because they contain path references to the old layout):
- `scripts/*.js` require() statements.
- `.claude/commands/fetch-latest.md` — tracked, rewrite the command examples.
- `docs/TOKEN_DECRYPTION.md`, `docs/TOKEN_FORMAT.md` — rewrite the one and six code-example references respectively.
- Do **not** rewrite old paths inside `docs/WORKFLOW.md`, `history/*.md`, or `project-brief.md` narrative — these are historical records.
- `.claude/agents/*.md` — grep and rewrite any still-live path references (brief mentioned these may contain stale paths).

### Implementation Steps
1. **Record baseline.** Run `npm test` and confirm 296/296. If it is not already green, stop and report — do not begin the move.
2. **Create parent directories** with `mkdir -p research tools`.
3. **Perform the six `git mv` operations** in the order given in the brief. Use `git mv` (not `mv`) so git tracks the renames and preserves blame/history:
   - `git mv decompiler research/tdc-register-vm`
   - `git mv token tools/token-generator`
   - `git mv pipeline tools/porting-pipeline`
   - `git mv scraper tools/scraper`
   - `git mv puppeteer tools/captcha-solver`
   - `git mv dynamic tools/dynamic-tracers`
4. **Rewrite `require()` paths project-wide.** Enumerate every file with an old-path reference via `Grep`, then rewrite each one. Patterns to rewrite (accounting for `./`, `../`, `../../` variants):
   - `decompiler/...` → `research/tdc-register-vm/...`
   - `token/...` → `tools/token-generator/...`
   - `pipeline/...` → `tools/porting-pipeline/...`
   - `scraper/...` → `tools/scraper/...`
   - `puppeteer/...` → `tools/captcha-solver/...`
   - `dynamic/...` → `tools/dynamic-tracers/...`
   Apply to source files under the moved trees, all of `tests/`, all of `scripts/`, `docs/TOKEN_DECRYPTION.md`, `docs/TOKEN_FORMAT.md`, `.claude/commands/*.md`, and `.claude/agents/*.md`.
   **Do not touch**: `history/**`, `docs/WORKFLOW.md`, `project-brief.md`, `targets/**`, `sample/**`, `.claude/rules/**`.
5. **Update `package.json`.** Rewrite `scripts.decompile`, `scripts.token:standalone`, `scripts.solve:puppeteer`, and any other `scripts.*` entry that references the old paths. Verify `scripts.test`.
6. **Re-verify `CLAUDE.md` and `README.md` command tables** against reality — they already document the new paths. If any command no longer runs as written after the moves, fix the doc to match the new reality (not the other way around).
7. **Run `npm test`.** Must be exactly 296/296. If any test fails, stop, report the diff, do **not** modify tests to make them pass. The rule is: restructure is mechanical; any test that breaks is a require-path miss that must be corrected at the path, not at the test.
8. **Do not commit.** The director commits after verification.

### Verification
- [ ] `npm test` → 296/296 passing.
- [ ] `git status` shows renames (via `git mv`), not deletes + adds. Spot-check a few entries in `git status --short` or `git diff --stat -M` — renamed files should appear with `R` status when staged.
- [ ] `ls decompiler token pipeline scraper puppeteer dynamic 2>&1` all return "No such file or directory".
- [ ] `ls research/tdc-register-vm tools/token-generator tools/porting-pipeline tools/scraper tools/captcha-solver tools/dynamic-tracers` all succeed.
- [ ] `grep -rE "require\\(['\\\"]\\.\\.?/(decompiler|token|pipeline|scraper|puppeteer|dynamic)[/'\\\"]" --include='*.js' .` returns no matches (excluding `history/`, `node_modules/`).
- [ ] `node -e "require('./tools/token-generator/cli.js')"` (or the appropriate entry) loads without ModuleNotFoundError. Same for `./research/tdc-register-vm/run.js`.
- [ ] `cat package.json` shows no `scripts.*` entries pointing into `decompiler/`, `token/`, `pipeline/`, `scraper/`, `puppeteer/`, or `dynamic/`.
- [ ] The commands in `CLAUDE.md` "Canonical Commands" section still run without error (spot-check: `node research/tdc-register-vm/run.js --help` or equivalent, `node tools/token-generator/cli.js --help`).

### Suggested Agent
`general-purpose` — this is a large mechanical `git mv` + path-rewrite task spanning ~42 files. Needs tool breadth (Bash, Grep, Edit) and careful sequencing, not specialized expertise.

---
