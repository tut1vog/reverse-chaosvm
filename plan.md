# Plan

## Status
Current phase: Phase 67 — Porting pipeline stress test
Current task: 67.1 — Fetch 30 live tdc.js builds

---

## Phases

### Phase 67: Porting pipeline stress test (30 live tdc.js builds)
> Run the auto-porting pipeline against 30 freshly-fetched `tdc.js` builds; surface and fix any templates that fail to auto-port.

| ID | Task | Status |
|----|------|--------|
| 67.1 | Fetch 30 live tdc.js builds via handshake | in-progress |
| 67.2 | Run porting pipeline on all 30 builds, aggregate survey | pending |
| 67.3 | Triage (conditional — plan-revision trigger based on 67.2 results) | pending |

---

## Current Task

**ID**: 67.1
**Title**: Fetch 30 live tdc.js builds
**Phase**: Phase 67 — Porting pipeline stress test
**Status**: in-progress

### Goal
Fetch 30 fresh `tdc.js` builds from `urlsec.qq.com` using the existing `CaptchaClient` handshake (no CAPTCHA solve needed) and persist them plus an index to `output/port-survey/` for downstream pipeline runs.

### Context
- Entry point is `tools/puppeteer/captcha-client.js`, which exports `CaptchaClient`. The minimal handshake for getting a session-specific `tdc.js` is `getSig(session)` followed by `downloadTdc(sig)` — no slide-solve required. See `tools/puppeteer/captcha-client.js:449` (`getSig`) and `:814` (`downloadTdc`).
- `DEFAULT_AID` is exported from `tools/puppeteer/captcha-solver.js` (currently `2046626881` for `urlsec.qq.com`); use it as the default.
- `tools/scraper/tdc-utils.js` exports `extractTdcName`, `computeSourceHash`, and `extractEks` — use `extractTdcName` and `computeSourceHash` for the index.
- Known templates: A = 95 opcodes, B = 94, C = 100 (see `CLAUDE.md`). A naive `caseCountGuess` can be computed cheaply as `source.match(/case\s+\d+\s*:/g)?.length` — not authoritative (deobfuscation may hide cases), but useful metadata for the survey.
- Output rules (`.claude/rules/output-versioning.md`): research-track artifacts live under `output/<track>/`. Use `output/port-survey/` and stable filenames (`tdc-01.js` … `tdc-30.js`). Do **not** add timestamp suffixes — overwriting on re-run is correct behavior.
- Coding rules (`.claude/rules/coding-style.md`): CommonJS, `'use strict';`, 2-space indent, single quotes, semicolons, `const`/`let` only, no new npm deps (the harness should use only what the scraper/puppeteer code already requires).

### Implementation Steps
1. Create `research/port-survey/fetch-30.js`. It must:
   - Instantiate a `CaptchaClient` with `aid = DEFAULT_AID` and the default `urlsec.qq.com` referer.
   - In a loop of 30 iterations (configurable via a `COUNT` constant or `--count` flag; keep default 30):
     - Start a fresh session: build a `session` object the way `scraper.js` does (see `tools/scraper/scraper.js` around the `getSig`/`downloadTdc` calls for the expected shape). Create a fresh `CookieJar` per iteration so sessions don't bleed.
     - `const sig = await client.getSig(session);`
     - `const source = await client.downloadTdc(sig);`
     - Compute `sourceHash` via `computeSourceHash(source)` and `TDC_NAME` via `extractTdcName(source)`.
     - Write the source to `output/port-survey/sources/tdc-NN.js` where `NN` is the 1-based index zero-padded to 2 digits.
     - Push `{ index: NN, sourceHash, TDC_NAME, length: source.length, caseCountGuess: (source.match(/case\s+\d+\s*:/g) || []).length }` onto an in-memory array.
     - If a `sourceHash` has been seen before in this run, log a warning line to stderr (`[fetch-30] dup hash <hash> at index NN (already at index MM)`) but **still save the file and record the entry** — duplicates are interesting data for the survey.
     - Sleep 500–1500 ms (`setTimeout` promise wrapper) between iterations to avoid hammering the server.
   - After the loop, write `output/port-survey/sources.json` with the full array pretty-printed.
   - On any per-iteration error, log the error with the index, skip that index (leave a gap — do **not** retry), and continue. Emit a final summary line: `fetched M/30 sources, K unique hashes` on stdout.
2. Make the script runnable via `node research/port-survey/fetch-30.js` — add a tiny arg parser only if needed (`--count N` is optional).
3. Dry-run once with `--count 2` locally to validate the handshake path and the output layout, then run the full `--count 30`.
4. Do **not** modify `tools/puppeteer/captcha-client.js` or any file outside `research/port-survey/`. This is purely additive.

### Verification
- [ ] `ls output/port-survey/sources/*.js | wc -l` reports **≥ 30** (allow a few retries/gaps only if clearly logged; the expected steady state is 30).
- [ ] `node -e "const r=JSON.parse(require('fs').readFileSync('output/port-survey/sources.json','utf8')); console.log('rows', r.length, 'unique', new Set(r.map(e=>e.sourceHash)).size, 'with_name', r.filter(e=>e.TDC_NAME).length)"` prints `rows 30 unique <N> with_name 30` (N may be < 30 if the server happens to serve the same build twice — that's fine; log shows duplicates).
- [ ] Every row in `sources.json` has a non-empty `sourceHash` (64 hex chars) and a non-empty `TDC_NAME`.
- [ ] A representative file (e.g. `output/port-survey/sources/tdc-01.js`) begins with `window.TDC_NAME = "..."` (sanity-check the downloaded source is the real thing, not a compressed blob or an error page).
- [ ] No files were written outside `output/port-survey/` or `research/port-survey/`.

### Suggested Agent
`general-purpose` — light CommonJS scripting against existing library code; no specialist domain needed.
