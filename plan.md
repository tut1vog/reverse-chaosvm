# Plan

## Status
Current phase: Phase 71 — X-Forwarded-For rate-limit bypass research
Current task: 71.4 — Execute the XFF-spoof experiment

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
| 71.3.2 | Add a unit test asserting two `RFC5737_RANDOM_IP` headers in the same `materializeHeaders` call return the same value, and across separate calls return (with overwhelming probability) different values | done |
| 71.4 | Execute the experiment and write `output/xff-spoof/results.md` with raw rows, errorCode histogram per condition, and interpretation | in-progress |
| 71.5 | If results are conclusive in either direction, update `docs/CAPTCHA_ORCHESTRATOR.md` §7/§9 with the finding | pending |

---

## Current Task

**ID**: 71.4
**Title**: Execute the XFF-spoof experiment
**Phase**: Phase 71 — X-Forwarded-For rate-limit bypass research
**Status**: in-progress

### Goal
Run the live experiment using the (now-patched) driver, gather empirical evidence of whether any of the candidate client-IP forwarding headers measurably affects the `errorCode 12` rate window, and write `output/xff-spoof/results.md` with the raw per-run rows, per-condition aggregates, and a written interpretation that 71.5 can use to update the docs.

### Experiment matrix (frozen by the user, unchanged from the original 71.4 brief)

| # | Condition | Headers | N |
|---|---|---|---|
| 1 | `control_pre` | none (calibration) | 2 |
| 2 | `control_burn` | none | 8 |
| 3 | `xff_only` | `X-Forwarded-For` | 4 |
| 4 | `xrealip_only` | `X-Real-IP` | 4 |
| 5 | `xff_xrealip` | `X-Forwarded-For` + `X-Real-IP` (same IP) | 4 |
| 6 | `cf_connecting_ip` | `CF-Connecting-IP` | 4 |
| 7 | `true_client_ip` | `True-Client-IP` | 4 |
| 8 | `x_originating_ip` | `X-Originating-IP` | 4 |
| 9 | `x_client_ip` | `X-Client-IP` | 4 |
| 10 | `multi_header` | all six headers above, same fresh IP per attempt | 4 |
| 11 | `control_post` | none | 4 |

Total: 46 sequential attempts from a single IP. Headers using `valueTemplate: "RFC5737_RANDOM_IP"` are now (post-71.3.1) cached per call so all forwarding headers within one attempt agree on the same minted IP — the matrix is faithfully representable in the driver's config schema.

### Context
- Driver: `research/xff-spoof/run.js` (post-71.3.1 + 71.3.2). CLI surface: `--config <path>`, `--n`, `--calibration-n`, `--post-control`, `--out`, `--dry-run`. The driver's `--help` is the authoritative reference.
- Output rule (`.claude/rules/output-versioning.md`): every artefact lands under `output/xff-spoof/` with stable filenames (`runs.jsonl`, `summary.json`, `results.md`).
- Each scraper attempt takes 5–15s. Sequential by design. Total wall time ~4–12 min.
- Slide solver venv: `.venv/bin/python -c "import cv2, numpy"` (already confirmed healthy in the prior 71.4 dispatch — `cv2 4.13.0`, `numpy 2.4.4`).

### Implementation Steps
1. Pre-flight: re-confirm slide solver venv healthy; `output/xff-spoof/` does not exist (or is safe to overwrite).
2. Author `research/xff-spoof/config.json` encoding the matrix above using the driver's documented schema (`{n, calibrationN, postControl, conditions: [{name, n?, headers}]}`). If the driver does not support per-condition `n` overrides (read its source to confirm), split the run into multiple invocations: one for `control_burn` (`--n 8`), one for the 8 treatment conditions (`--n 4 --calibration-n 0`), and one for `control_post` (`--n 4 --calibration-n 0`); concatenate the resulting JSONL into a single `runs.jsonl`. Whichever path you take, capture the exact commands in `results.md` for reproducibility.
3. Run the experiment(s). Tail stderr for per-attempt progress. If calibration aborts, stop and report — do NOT retry.
4. Inspect `output/xff-spoof/runs.jsonl` and `summary.json`.
5. Author `output/xff-spoof/results.md` with: Matrix, Totals, errorCode histogram, Per-condition breakdown, Raw rows, Interpretation. Match the structure of `output/scraper-stress/results.md` where reasonable. Interpretation must answer: did `control_burn` actually burn the IP? Did any treatment produce `successCount > 0`? Did `control_post` stay all-ec12 (rules out natural window expiry)? Bottom-line verdict — is XFF-style spoofing a viable bypass, or is the lead closed? Be honest about N=4 limitations. Per `.claude/rules/verify-dont-assume.md`, every claim must be backed by the committed JSONL.

### Verification
- [ ] Quote pre-flight: venv check, `output/xff-spoof/` initial state.
- [ ] Quote `research/xff-spoof/config.json` (or the exact list of commands run).
- [ ] Quote first 3 + last 3 lines of `output/xff-spoof/runs.jsonl`. Total line count ≥ 46 (assuming calibration didn't abort).
- [ ] Quote `output/xff-spoof/summary.json` in full.
- [ ] Quote the **Interpretation** section of `output/xff-spoof/results.md` in full.
- [ ] `npm test` is still green.

### Suggested Agent
`general-purpose` — runs the driver, inspects artefacts, writes the markdown. No code changes expected; if any are needed, escalate to the director.

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
