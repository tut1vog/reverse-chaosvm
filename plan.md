# Plan

## Status
Current phase: Phase 71 — X-Forwarded-For rate-limit bypass research
Current task: 71.3.1 — Fix per-attempt IP cache in driver

---

## Phases

### Phase 71: X-Forwarded-For rate-limit bypass research
> Empirically determine whether injecting a client-IP forwarding header on the `/cap_union_new_verify` POST bypasses the per-IP rate window that triggers `errorCode 12`.

| ID | Task | Status |
|----|------|--------|
| 71.1 | Add `--extra-header` capability to `tools/scraper/` (HTTP layer + CLI), wired through to the `/cap_union_new_verify` POST | done |
| 71.2 | Add a unit test that asserts the extra header propagates through `httpRequest` to the verify POST | done |
| 71.3 | Build experiment driver under `research/xff-spoof/` that runs N scraper invocations per condition with the candidate header set | done (with defect — see 71.3.1) |
| 71.3.1 | Fix `materializeHeaders` to mint the RFC 5737 IP once per call so all `RFC5737_RANDOM_IP` headers within one attempt agree | in-progress |
| 71.3.2 | Add a unit test asserting two `RFC5737_RANDOM_IP` headers in the same `materializeHeaders` call return the same value, and across separate calls return (with overwhelming probability) different values | pending |
| 71.4 | Execute the experiment and write `output/xff-spoof/results.md` with raw rows, errorCode histogram per condition, and interpretation | pending (blocked on 71.3.1 + 71.3.2) |
| 71.5 | If results are conclusive in either direction, update `docs/CAPTCHA_ORCHESTRATOR.md` §7/§9 with the finding | pending |

---

## Current Task

**ID**: 71.3.1
**Title**: Fix per-attempt IP cache in driver
**Phase**: Phase 71 — X-Forwarded-For rate-limit bypass research
**Status**: in-progress

### Goal
Patch `research/xff-spoof/run.js` so that within a single call to `materializeHeaders`, all headers carrying `valueTemplate: "RFC5737_RANDOM_IP"` resolve to the **same** RFC 5737 IP. Across separate calls (i.e. across attempts), the IP must continue to rotate as today.

### Why this matters
71.4's experiment matrix has two conditions whose semantics depend on header agreement within an attempt:
- `xff_xrealip` — `X-Forwarded-For` and `X-Real-IP` must announce the same client IP, otherwise the server cannot tell which one to trust and we are no longer testing what the matrix claims.
- `multi_header` — six different forwarding headers, all required to announce the same IP for the same reason.

The current driver (`research/xff-spoof/run.js:202-214`) calls `mintRfc5737Ip()` once per header inside the loop, so for these two conditions every header gets a fresh independent IP. The 71.4 dispatch correctly halted on this discovery rather than running a corrupted experiment.

### Context
- Defect site: `research/xff-spoof/run.js`, function `materializeHeaders(headerSpecs)` at lines 202–214. The `mintRfc5737Ip()` helper at lines 195–200 already does the right thing per call; only the caller needs to be fixed.
- The function is exported (line 592 — `module.exports`), so 71.3.2's test can import it directly.
- Coding style: CommonJS, 2-space, single quotes, semicolons.

### Implementation Steps
1. Read `research/xff-spoof/run.js` lines 195–214 to confirm the defect site.
2. Modify `materializeHeaders` to mint the IP lazily on first encounter and reuse the cached value for any subsequent `RFC5737_RANDOM_IP` header in the same call. Sketch:
   ```js
   function materializeHeaders(headerSpecs) {
     const out = {};
     let cachedIp = null;
     for (const h of headerSpecs) {
       let v;
       if (h.valueTemplate === 'RFC5737_RANDOM_IP') {
         if (cachedIp === null) cachedIp = mintRfc5737Ip();
         v = cachedIp;
       } else {
         v = h.value;
       }
       out[h.name] = v;
     }
     return out;
   }
   ```
3. Add a short comment above the function documenting the per-call caching contract — future maintainers must not "optimise" the cache away.
4. Do NOT add any test in this task — that's 71.3.2 on a different agent.

### Verification
- [ ] Show the diff of `materializeHeaders` before/after.
- [ ] Run a one-shot smoke check: write a 5-line throwaway Node snippet that requires the module, calls `materializeHeaders([{name:'A',valueTemplate:'RFC5737_RANDOM_IP'},{name:'B',valueTemplate:'RFC5737_RANDOM_IP'}])`, and asserts both headers got the same string. Confirm it passes. (Throwaway — don't commit it.)
- [ ] Re-run the existing dry-run: `node research/xff-spoof/run.js --dry-run --condition multi --header "X-Forwarded-For: RFC5737_RANDOM_IP" --header "X-Real-IP: RFC5737_RANDOM_IP" --n 3 --calibration-n 1 --out output/xff-spoof-dryrun/`. Inspect the resulting `runs.jsonl` and confirm: (a) within each attempt, both headers carry the same IP; (b) across the 3 attempts, the IPs differ. Quote three relevant rows.
- [ ] `npm test` is still green.

### Suggested Agent
`general-purpose` — trivial 5-line patch, no specialised agent needed.

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
