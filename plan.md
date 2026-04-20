# Plan

## Status
Current phase: Phase 69 — Puppeteer CLI default output path
Current task: 69.1 — Fix default output path to output/puppeteer/results.json

---

## Phases

### Phase 69: Puppeteer CLI default output path
> Stop `tools/puppeteer/cli.js` from writing `results.json` at the repo root; land it under `output/puppeteer/` per `.claude/rules/output-versioning.md`.

| ID | Task | Status |
|----|------|--------|
| 69.1 | Fix default output path in tools/puppeteer/cli.js + delete stray file | in-progress |

---

## Current Task

**ID**: 69.1
**Title**: Fix default output path in tools/puppeteer/cli.js + delete stray file
**Phase**: Phase 69 — Puppeteer CLI default output path
**Status**: in-progress

### Goal
Change the default `--output` value in `tools/puppeteer/cli.js` from the bare relative `'results.json'` (which resolves against CWD and lands at the repo root) to a stable absolute path under `output/puppeteer/results.json`. Ensure the destination directory is created on demand, update the in-file help text, and delete the stray `results.json` currently sitting at the repo root. This brings the CLI into compliance with `.claude/rules/output-versioning.md`.

### Context
- **Target file**: `tools/puppeteer/cli.js`. All four `results.json` references live here (lines 12, 26, 31, 75). No README or `docs/` reference the default path.
- **Lines 12, 26, 31**: help text / usage comment strings — all mention `results.json` as the default or example.
- **Line 75**: `const output = args.output || 'results.json';` — the actual default.
- **Line 145**: `fs.writeFileSync(output, JSON.stringify(results, null, 2));` — the write site; currently does not `mkdirSync` the parent directory.
- **Output-versioning rule** (`.claude/rules/output-versioning.md`): artifacts must live under `output/<stem>/`. The appropriate stem for this tool is `output/puppeteer/` (sibling of the existing `output/puppeteer-capture/` which the same CLI already writes success captures into at line 98 — reuse the same convention).
- **Stray file**: `results.json` at the repo root (212 KB, Apr 19). Confirmed to be CLI output via schema match; safe to delete because the canonical scraper-stress results are already committed under `output/scraper-stress/` (per `8b680bb`).
- **Style**: CommonJS, 2-space indent, `const`, single quotes (`.claude/rules/coding-style.md`).

### Implementation Steps
1. Edit `tools/puppeteer/cli.js:75` — replace `const output = args.output || 'results.json';` with an absolute path built via `path.resolve(__dirname, '..', '..', 'output', 'puppeteer', 'results.json')` when `args.output` is absent. Keep the `args.output` override path unchanged (absolute-or-relative at the caller's discretion).
2. Before the `fs.writeFileSync(output, ...)` call at line 145, add `fs.mkdirSync(path.dirname(output), { recursive: true });` so the default directory is created if missing.
3. Update the three help-text references (lines 12, 26, 31) to reflect the new default — e.g. `(default: output/puppeteer/results.json)`.
4. Delete the stray file: `git rm` is not applicable (it's untracked); use `rm results.json` from the repo root.
5. Do NOT create `output/puppeteer/` ahead of time; the `mkdirSync` at runtime handles it.

### Verification
- [ ] `node tools/puppeteer/cli.js --help` prints the new default string (`output/puppeteer/results.json`).
- [ ] `grep -n "results\.json" tools/puppeteer/cli.js` shows the four sites updated consistently — no lingering bare `'results.json'` defaults.
- [ ] `ls results.json` at repo root returns "No such file".
- [ ] Code read confirms `fs.mkdirSync(path.dirname(output), { recursive: true })` runs before `fs.writeFileSync(output, ...)` on line 145.
- [ ] `node -e "require('./tools/puppeteer/cli.js')"` parses without syntax error (the file exits immediately if argv is empty, which is fine — we only need the parse to succeed; use `--help` to trigger clean exit: `node tools/puppeteer/cli.js --help`).

### Suggested Agent
`general-purpose` — single-file edit with a tiny deletion and help-text sync; no specialist needed.
