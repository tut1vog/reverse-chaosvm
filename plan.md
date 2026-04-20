# Plan

## Status
Current phase: Phase 68 — Live scraper stress test
Current task: 68.1 — Build scraper-stress driver + run N=30, categorize errorCode distribution + auto-port failures

---

## Phases

### Phase 68: Live scraper stress test (30 runs against urlsec.qq.com)
> Run the pure-Node scraper 30 times end-to-end against the live CAPTCHA endpoint; verify the 67.4 porting-pipeline fix covers every live template and inventory the errorCode distribution — especially any remaining errorCode 12.

| ID | Task | Status |
|----|------|--------|
| 68.1 | Build scraper-stress driver + run N=30, emit per-run results + summary | in-progress |
| 68.2 | (conditional) Triage based on 68.1 outcomes | pending |

---

## Current Task

**ID**: 68.1
**Title**: Build scraper-stress driver + run N=30, emit per-run results + summary
**Phase**: Phase 68 — Live scraper stress test
**Status**: in-progress

### Goal
Produce a reproducible harness that runs the pure-Node scraper 30 times against the live `urlsec.qq.com` CAPTCHA endpoint (CAPTCHA-only, no urlsec query), captures one verify-attempt outcome per run, and writes structured per-run results plus a summary identifying (a) any `Unknown template … auto-port failed` rows and their sourceHashes, (b) the full errorCode histogram — in particular, the count of errorCode 12, which has been a long-running unresolved failure mode.

### Context
The scraper's programmatic entry point is `tools/scraper/scraper.js`:

```js
const Scraper = require('./tools/scraper/scraper');
const s = new Scraper({ maxRetries: 1, verbose: false });
await s.init();
const result = await s.solveCaptcha();   // { errorCode, ticket, randstr } or throws
```

The built-in retry loop (lines 451-712) retries on non-zero errorCodes and hides intermediate errorCodes from the caller. For a clean 30-run distribution we want **exactly one** end-to-end attempt per iteration, so `maxRetries: 1` is mandatory.

Behavior of `solveCaptcha()` with `maxRetries: 1`:
- On `errorCode === 0` or (`errorCode === -1 && ticket`): returns `{errorCode, ticket, randstr}` normally.
- On any other non-zero errorCode: throws `Error('CAPTCHA verify returned errorCode <N>')`. The numeric code is parseable from the message via `/errorCode (-?\d+)/`.
- On auto-port failure: throws `Error('Unknown template (hash=<sha>, …), auto-port failed')`.
- On network / image-download / slider errors: throws various other Error messages.

Each iteration must capture all of these so the summary can break them down. The template cache is persisted on disk, so runs 2..30 should skip auto-port for already-seen hashes. That means most iterations only exercise the full auto-port path when the server returns a hash we haven't resolved yet — which post-67.4 should be nobody, but that's exactly what this task checks.

Convention reference (follow `research/port-survey/port-all.js`):
- Driver under `research/scraper-stress/run-30.js` (CommonJS, `'use strict';`).
- Outputs under `output/scraper-stress/` (stable filenames per `.claude/rules/output-versioning.md`): `results.json` (one row per run, full shape) + `results.md` (summary).
- No dependencies beyond what `tools/scraper/scraper.js` and Node built-ins already pull in (acorn + puppeteer are already transitive).

### Implementation Steps
1. Create `research/scraper-stress/run-30.js` with a file-header block comment stating its responsibility.
2. Parse CLI args: `--count N` (default 30), `--delay-ms M` (default 1500 — inter-run pause to avoid aggressive rate-limiting). No other flags.
3. For `i = 1..N`:
   - Record `startedAt = new Date().toISOString()`, `t0 = Date.now()`.
   - `const s = new Scraper({ maxRetries: 1, verbose: false });`
   - `await s.init();`
   - `try { result = await s.solveCaptcha(); }` — on success, capture `{errorCode, ticketPresent: !!result.ticket, randstrPresent: !!result.randstr}`.
   - `catch (err) { capture err.message; parse errorCode via regex; classify failureKind }`.
   - Regardless of outcome, capture `tdcName`, `sourceHash`, `caseCount` — for hashes already in the template cache (`output/port-survey/` directory scheme won't exist here — use the scraper's own cache location). To get these reliably, instrument via the verbose log is brittle; instead, subclass or monkey-patch is heavy. **Simplest approach: read them off `s._templateCache` after a successful/failed `solveCaptcha` using the fact that `_autoPort` and `_resolveTemplate` cache by `sourceHash`**. If that's not exposed, fall back to re-reading the verbose log. Acceptable compromise: leave `tdcName`/`sourceHash`/`caseCount` as `null` in rows where the iteration threw before the template resolution step (e.g. network failures at prehandle/getSig), and populate them otherwise.
   - `elapsedMs = Date.now() - t0`.
   - Push a row. Log `[stress] i/N status=<ok|err> errorCode=<n> hash=<sha[:8]>`.
   - `await sleep(delayMs)` between iterations (not after the last).
4. At the end, compute summaries:
   - `totals: {count, success, fail}` (success = errorCode 0 OR errorCode -1 with ticket).
   - `errorCodeHistogram: { "<code>": <count>, "throw: <class>": <count> }` — classify thrown errors into buckets: `thrown:unknown-template`, `thrown:errorCode-<n>` (parseable), `thrown:network`, `thrown:other`.
   - `autoPortFailures: [{ index, sourceHash, tdcName }]` if any.
   - `perTdcName: { tdcName: { count, successCount, errorCodes: {...} }}` — breakdown keyed by observed TDC_NAME.
5. Write `output/scraper-stress/results.json` (array of rows) and `output/scraper-stress/results.md` (tables: totals, errorCodeHistogram, autoPortFailures, perTdcName).
6. Print the totals + histogram to stdout at the end so the director can see the outcome without reading the file.

### Constraints for the subagent
- **Do not make any git commits.** Director owns all commits.
- **Do not** modify any file under `tools/` or `docs/`. This task only writes a new driver under `research/scraper-stress/` and its outputs under `output/scraper-stress/`.
- **Do not** invoke `npm test`, the porting-pipeline CLI, or the existing port-survey. Your only execution target is the stress driver you write.
- **Do not** add new npm dependencies. Use Node built-ins + what `tools/scraper/scraper.js` already requires.
- Respect `.claude/rules/coding-style.md` (CommonJS, 2-space, single quotes, semicolons, `const`/`let`, brief file-header comment).
- Respect `.claude/rules/output-versioning.md` (stable filenames under `output/scraper-stress/`; no timestamped subdirs).

### Verification
- [ ] `research/scraper-stress/run-30.js` exists and is runnable: `node research/scraper-stress/run-30.js --count 30 --delay-ms 1500`.
- [ ] `output/scraper-stress/results.json` has exactly 30 full-shape rows; no placeholder strings like `"TODO"` or `null` in fields other than the ones documented as conditionally null.
- [ ] `output/scraper-stress/results.md` includes: totals, errorCode histogram, per-TDC_NAME breakdown, and an `autoPortFailures` section (empty list is fine if zero).
- [ ] Driver prints a one-line totals summary to stdout at the end.
- [ ] No unexpected files created outside `research/scraper-stress/` and `output/scraper-stress/`.

### Suggested Agent
`general-purpose` — small driver that composes the existing Scraper API; runs against live traffic; handles errors structurally. No specialized agent fits better.
