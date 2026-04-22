# Plan

## Status
Current phase: Phase 71 — X-Forwarded-For rate-limit bypass research
Current task: 71.4 — Execute the XFF-spoof experiment (awaiting user confirmation of matrix)

---

## Phases

### Phase 71: X-Forwarded-For rate-limit bypass research
> Empirically determine whether injecting a client-IP forwarding header on the `/cap_union_new_verify` POST bypasses the per-IP rate window that triggers `errorCode 12`.

| ID | Task | Status |
|----|------|--------|
| 71.1 | Add `--extra-header` capability to `tools/scraper/` (HTTP layer + CLI), wired through to the `/cap_union_new_verify` POST | done |
| 71.2 | Add a unit test that asserts the extra header propagates through `httpRequest` to the verify POST | done |
| 71.3 | Build experiment driver under `research/xff-spoof/` that runs N scraper invocations per condition with the candidate header set | done |
| 71.4 | Execute the experiment and write `output/xff-spoof/results.md` with raw rows, errorCode histogram per condition, and interpretation | in-progress |
| 71.5 | If results are conclusive in either direction, update `docs/CAPTCHA_ORCHESTRATOR.md` §7/§9 with the finding | pending |

---

## Current Task

**ID**: 71.4
**Title**: Execute the XFF-spoof experiment
**Phase**: Phase 71 — X-Forwarded-For rate-limit bypass research
**Status**: in-progress (awaiting user confirmation of experiment matrix)

### Goal
Run the live experiment using the driver from 71.3, gather empirical evidence of whether any of the candidate client-IP forwarding headers measurably affects the `errorCode 12` rate window, and write `output/xff-spoof/results.md` with the raw per-run rows, per-condition aggregates, and a written interpretation that 71.5 can use to update the docs.

### Experiment matrix (proposed — user confirms before dispatch)

Total budget: **~46 attempts from a single IP**, sequentially. Sample size deliberately small per condition because the IP burns fast and the goal is qualitative ("does this header reset the window?") not statistical.

Order of execution:

| # | Condition | Headers | N | Purpose |
|---|---|---|---|---|
| 1 | `control_pre` | _(calibration, none)_ | 2 | Baseline check; if both ec12 → ABORT, IP already burned |
| 2 | `control_burn` | _(none)_ | 8 | Burn the IP intentionally; provides the fresh-IP success curve |
| 3 | `xff_only` | `X-Forwarded-For: <RFC5737>` | 4 | Standard reverse-proxy header |
| 4 | `xrealip_only` | `X-Real-IP: <RFC5737>` | 4 | nginx convention |
| 5 | `xff_xrealip` | `X-Forwarded-For: <RFC5737>`, `X-Real-IP: <RFC5737>` (same IP) | 4 | Most common combination |
| 6 | `cf_connecting_ip` | `CF-Connecting-IP: <RFC5737>` | 4 | Cloudflare convention |
| 7 | `true_client_ip` | `True-Client-IP: <RFC5737>` | 4 | Akamai / Cloudflare Enterprise convention |
| 8 | `x_originating_ip` | `X-Originating-IP: <RFC5737>` | 4 | Older Microsoft / mail convention |
| 9 | `x_client_ip` | `X-Client-IP: <RFC5737>` | 4 | Generic |
| 10 | `multi_header` | All six above, all carrying the same RFC5737 IP | 4 | Belt-and-braces — if anything is honoured, this hits it |
| 11 | `control_post` | _(none)_ | 4 | Verify the IP is still burned (rules out "rate window expired naturally during the run") |

Each `RFC5737` placeholder is freshly minted per attempt by the driver — no fake IP is reused across attempts within or across conditions, so the server cannot fingerprint a single fake IP.

Decision rule for each treatment condition: if `successCount > 0` while `control_post` is still all ec12, that header had a measurable effect. Multiple positive treatments would suggest the upstream parses XFF/X-Real-IP/etc. and trusts whichever it finds first.

### Context
- Driver landed in 71.3: `research/xff-spoof/run.js`. Supports `--config <path>` or inline `--condition`/`--header` flags, plus `--n`, `--calibration-n`, `--post-control`, `--out`, `--dry-run`.
- The driver writes `runs.jsonl` and `summary.json` under `--out` (default `output/xff-spoof/`). Per `.claude/rules/output-versioning.md`, filenames are stable across runs — a re-run overwrites them.
- Each scraper attempt takes 5–15s. Sequential by design. Total wall time for 46 attempts: roughly 4–12 minutes.
- The slide solver (Python OpenCV) must be available (`python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy`). Confirm before running.
- Coding style for any helper / config file: CommonJS / 2-space / single quotes / semicolons.

### Implementation Steps
1. Author `research/xff-spoof/config.json` encoding the matrix above (or pass it inline — config is preferred for reproducibility and so 71.4's commit captures the exact experiment).
2. Confirm the slide solver venv is healthy: `python3 -c "import cv2, numpy"`. If it errors, the operator should fix it before proceeding.
3. Run `node research/xff-spoof/run.js --config research/xff-spoof/config.json --post-control --out output/xff-spoof/`. Tail stderr for the per-attempt progress lines. If calibration aborts, stop and report.
4. After the run completes, inspect `output/xff-spoof/runs.jsonl` and `summary.json`.
5. Author `output/xff-spoof/results.md` capturing: the experiment matrix used, the per-condition aggregate table, the raw row table, and a 2–3 paragraph **Interpretation** section answering: did any treatment condition show a measurable `successCount > 0` against a still-burned `control_post`? If yes, which? If no, the lead is closed and the per-IP rate limit is not bypassable via header spoofing from this client.

### Verification
- [ ] `output/xff-spoof/runs.jsonl` exists and contains one line per attempt (≥ calibration + treatment + post-control rows). Quote the first 3 and last 3 lines.
- [ ] `output/xff-spoof/summary.json` exists. Quote it in full.
- [ ] `output/xff-spoof/results.md` exists with sections: Matrix, Per-condition table, Raw rows, Interpretation. Quote the Interpretation section in full in the report.
- [ ] If calibration aborted, the run script exited non-zero and `output/xff-spoof/` was not created — stop and ask for guidance rather than retrying blindly.
- [ ] `npm test` is still green.

### Suggested Agent
`general-purpose` — runs the driver, inspects artefacts, writes the markdown summary. No code changes expected; if any are needed, escalate to the director rather than fixing inline.

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
