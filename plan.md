# Plan

## Status
Current phase: Phase 71 — X-Forwarded-For rate-limit bypass research
Current task: 71.3.2 — Regression test for per-call IP cache

---

## Phases

### Phase 71: X-Forwarded-For rate-limit bypass research
> Empirically determine whether injecting a client-IP forwarding header on the `/cap_union_new_verify` POST bypasses the per-IP rate window that triggers `errorCode 12`.

| ID | Task | Status |
|----|------|--------|
| 71.1 | Add `--extra-header` capability to `tools/scraper/` (HTTP layer + CLI), wired through to the `/cap_union_new_verify` POST | done |
| 71.2 | Add a unit test that asserts the extra header propagates through `httpRequest` to the verify POST | done |
| 71.3 | Build experiment driver under `research/xff-spoof/` that runs N scraper invocations per condition with the candidate header set | done (with defect — see 71.3.1) |
| 71.3.1 | Fix `materializeHeaders` to mint the RFC 5737 IP once per call so all `RFC5737_RANDOM_IP` headers within one attempt agree | done |
| 71.3.2 | Add a unit test asserting two `RFC5737_RANDOM_IP` headers in the same `materializeHeaders` call return the same value, and across separate calls return (with overwhelming probability) different values | in-progress |
| 71.4 | Execute the experiment and write `output/xff-spoof/results.md` with raw rows, errorCode histogram per condition, and interpretation | pending (blocked on 71.3.2) |
| 71.5 | If results are conclusive in either direction, update `docs/CAPTCHA_ORCHESTRATOR.md` §7/§9 with the finding | pending |

---

## Current Task

**ID**: 71.3.2
**Title**: Regression test for per-call IP cache
**Phase**: Phase 71 — X-Forwarded-For rate-limit bypass research
**Status**: in-progress

### Goal
Pin the per-call IP-cache contract in `materializeHeaders` with a regression test so future refactors cannot silently re-introduce the per-header minting bug. The test must assert both halves: (a) two `RFC5737_RANDOM_IP` headers in the SAME call return the SAME IP, and (b) across separate calls the IP changes (with overwhelming probability — RFC 5737 yields ~762 distinct IPs, so a 5-iteration test has effectively zero collision risk).

### Context
- The fix landed in 71.3.1 — see `materializeHeaders` in `research/xff-spoof/run.js` (around lines 199–217 after the patch). The function is exported via `module.exports = { ..., materializeHeaders, ... }` (line ~592 — exact line moves with the patch).
- A non-template header (`{name, value}` literal) must still be returned verbatim. The test should cover that too — a refactor that broke the literal path would be just as bad as one that broke the cache.
- Existing test conventions: `tests/` directory, `node:test` framework, `npm test` runner (`package.json` `scripts.test` lists each test file explicitly — the new file must be appended to that list, same as 71.2 did).
- The test harness at `tests/test-scraper-extra-headers.js` (added in 71.2) is the precedent for a small, focused unit test in this project. Mirror its style — `'use strict';`, `const { test } = require('node:test')`, `const assert = require('node:assert/strict')`, suite + cases.
- Coding style: CommonJS, 2-space, single quotes, semicolons.
- This is a pure unit test with no I/O — it requires the driver module, calls the exported function directly, asserts on returned values.

### Implementation Steps
1. Read `research/xff-spoof/run.js` to confirm `materializeHeaders` and `mintRfc5737Ip` are still exported and behave as the patch intended.
2. Skim `tests/test-scraper-extra-headers.js` for style/structure conventions, then create `tests/test-xff-spoof-driver.js` (or a similarly clear name — match the project's existing prefix conventions). Its suite must contain at minimum:
   - **Case A — intra-call agreement**: call `materializeHeaders` once with three `RFC5737_RANDOM_IP` headers (`X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`); assert all three returned values are strictly equal.
   - **Case B — inter-call divergence**: call `materializeHeaders` 5 times with the same 2-header spec; collect the IP from each call; assert at least 4 of the 5 IPs are distinct (a tiny tolerance against the astronomically unlikely event of two random calls colliding — RFC 5737 has 762 possible IPs so 5-call collision probability is ~0.013, but treating it as "all 5 must differ" creates a flaky test). Quote the IPs in the failure message so a flake is debuggable.
   - **Case C — literal value passthrough**: call with `[{name:'X-Custom', value:'literal-value'}]`; assert the result is `{ 'X-Custom': 'literal-value' }`. Then call with a mix of literal + template; assert literal stays untouched and template gets a minted IP.
   - **Case D — IP shape**: call with one `RFC5737_RANDOM_IP` header N times; assert every returned IP matches `^(192\.0\.2|198\.51\.100|203\.0\.113)\.([1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-4])$` (RFC 5737 documentation blocks, host octets 1–254). This pins the IP-shape contract too.
3. Append the new test file to `package.json`'s `scripts.test` (same pattern 71.2 used).

### Verification
- [ ] `npm test` passes including the new test file. Quote the new test names and the final summary line.
- [ ] **Mutation check**: temporarily revert `materializeHeaders` to the broken pre-71.3.1 form (mint per header, no cache) — Case A must fail. Quote the failure output. Then restore the cached version and confirm green again.
- [ ] **Test-runs-fast and IO-free**: confirm the new test file's runtime is under ~100ms (it should be — pure function, no spawn, no fs).
- [ ] No implementation files modified in the final state — only `tests/test-xff-spoof-driver.js` (new) and `package.json` (one-line append).

### Suggested Agent
`general-purpose` — straightforward unit-test addition. **Must be a different agent from the one that wrote 71.3.1** so the test author approaches the contract independently rather than mirroring the implementation's exact shape.

### Context
- Capability layer landed in 71.1: `tools/scraper/cli.js --extra-header "Name: Value"` (repeatable), wired to the `/cap_union_new_verify` POST only.
- Driver location: `research/xff-spoof/run.js` (per the existing pattern set by `research/template-pool/live-comparison.js`).
- Output location: `output/xff-spoof/` per `.claude/rules/output-versioning.md`. Artefacts:
  - `output/xff-spoof/runs.jsonl` — one line per scraper run, fields: `{ts, condition, attempt, headers, exitCode, errorCode, ticket?, elapsedMs, sourceHashShort, tdcName?, errorKind?, stderrTail?}`.
  - `output/xff-spoof/summary.json` — per-condition aggregates: `{condition, n, successCount, errorCodeHistogram, headerProfile}`.
  - The driver writes filenames stable across runs (so consecutive runs `git diff` cleanly per the output-versioning rule).
- Each run shells out to `node tools/scraper/cli.js --captcha-only --verbose --extra-header ... --extra-header ...` as a child process. Parse stdout/stderr to extract `errorCode`, `ticket`, `sourceHash`, `TDC_NAME`. The scraper already prints these in `--verbose` mode — read its source if you need to confirm the exact format.
- Sample-size and condition-list configurability is essential — 71.4 will pick the experiment matrix; 71.3 should accept it as either CLI args or a config file. Pick whichever is simpler.
- Each condition uses **a fresh randomised fake IP per attempt** (drawn from RFC 5737 documentation blocks 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24) to prevent the server from blacklisting a single fake IP across all attempts within a condition. The driver mints these.
- The driver MUST detect "IP already burned" before starting: run a brief calibration of K (e.g. K=2) control attempts; if both return `errorCode 12`, abort the whole run and tell the operator the IP is already in the rate window — running further conditions would produce a noise-only result.
- The driver MUST optionally re-run the control condition at the end (a "post-control") so 71.4 can rule out "rate window naturally expired mid-run". Make this opt-in via a flag.
- Each scraper invocation can take 5–15s (slide solve via Python OpenCV + several HTTP round trips). Sequential execution is correct — do NOT parallelise. Parallel runs would burn the IP unevenly and confuse causal attribution.
- Coding style: CommonJS, 2-space, single quotes, semicolons.

### Implementation Steps
1. Read `tools/scraper/cli.js` (entry point) and the relevant verbose-output bits of `tools/scraper/scraper.js` to confirm the exact stdout format the driver will parse — specifically, where the final result (errorCode, ticket, sourceHash short, TDC_NAME) is printed.
2. Read `research/template-pool/live-comparison.js` to mirror the directory and CLI conventions for a research driver.
3. Create `research/xff-spoof/run.js`. CLI surface:
   - `--config <path>` (optional) — JSON file with `{conditions: [{name, headers: [...]}], n: <int>, calibrationN: <int>, postControl: bool}`.
   - Inline flags as alternatives if a config file is too heavy: `--condition <name>:<headerlist>` (repeatable), `--n <int>`, `--calibration-n <int>`, `--post-control`.
   - `--out <dir>` defaulting to `output/xff-spoof/`.
   - `--help` showing the usage.
4. Implementation contract:
   - Validate the IP isn't already burned via a `calibrationN` control batch. If exhausted, exit non-zero with a clear message and write nothing under `output/xff-spoof/` (so a stale prior run isn't overwritten).
   - For each condition (in order), run N attempts. For each attempt: mint a fresh fake IP from RFC 5737 blocks, build the `--extra-header` argv, spawn `node tools/scraper/cli.js --captcha-only --verbose <headers>`, capture exit code + stdout + stderr, parse the result fields, append one line to `runs.jsonl`, log a short progress line to stderr.
   - After all conditions, if `postControl` is on, run another N control attempts.
   - Write `summary.json` with per-condition aggregates.
   - Print a final one-line per-condition summary to stdout (e.g. `control: n=10 success=2 ec12=8`).
5. The driver itself must NOT run the experiment as part of its own verification — that's 71.4. The driver's own tests/verification use a stub or `--dry-run` flag to prove the orchestration logic without making real network calls.

### Verification
- [ ] `node research/xff-spoof/run.js --help` prints usage, including the `--config`, `--n`, `--calibration-n`, `--post-control`, `--out` flags.
- [ ] `node research/xff-spoof/run.js --dry-run --condition "test:X-Forwarded-For=1.2.3.4" --n 2 --out output/xff-spoof-dryrun/` (or whatever your dry-run incantation is) — produces `runs.jsonl` (with stub data) and `summary.json` under `output/xff-spoof-dryrun/`, makes zero real network calls, and exits 0. Show the first few lines of each artefact.
- [ ] When `--dry-run` is off but `tools/scraper/cli.js` is replaced (in-process or via PATH) by a stub that returns a canned `errorCode 12`, the driver correctly aborts the calibration phase and writes nothing under `output/`. Demonstrate this with whatever stubbing mechanism you build in.
- [ ] Sequential execution is enforced (no `Promise.all` over the spawn calls). Show the relevant code comment or the explicit awaiting pattern.
- [ ] `npm test` is still green (no regressions).

### Suggested Agent
`general-purpose` — straightforward Node child-process orchestration. No specialised agent needed.
