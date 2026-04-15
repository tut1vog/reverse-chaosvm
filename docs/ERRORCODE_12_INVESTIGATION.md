# errorCode 12 Investigation

**Phase 36 diagnostic survey — 2026-04-12**

## Symptom

The `cap_union_new_verify` endpoint returns `errorCode: 12` (token rejected) for most scraper-generated tokens, even when the token is byte-identical to what the live VM would produce.

## What errorCode 12 is NOT

- **Not a token generation bug.** All 10 observed builds produce byte-identical tokens compared to the live VM (verified by `pipeline/token-verifier.js`).
- **Not pure IP-based rate limiting.** A normal browser session on the same IP continues to solve CAPTCHAs successfully after the scraper starts getting rejected. If this were pure IP throttling, the browser would also be blocked.
- **Not timing-dependent in the simple sense.** Attempts with varied delay (100ms–60s) show no correlation with outcome.
- **Not correlated with token size, nonce, or build/template.** All tokens are roughly equal size, nonce is static per appid (`eda1152f11f1daf0`), and the same build sees both success and failure responses.

## Observed Pattern (30-attempt survey)

| Attempts | Success rate |
|----------|--------------|
| 1        | 0% (cold-start penalty) |
| 2–9      | ~87.5% (7/8) |
| 10–30    | 0% (0/21)    |

Attempts are independent CAPTCHA sessions with fresh sig/session IDs each time. The server begins rejecting all tokens from the scraper after roughly 8–10 solves, while a real browser from the same IP continues to work.

## Hypothesis

The `cap_union_new_verify` endpoint performs some form of **fingerprint or behavioral scoring** beyond just validating the token. Candidates:

- **TLS/JA3 fingerprint detection** — probably not, since `cap_union_new_show` (which precedes verify) works fine from Node.js as long as `sess` is passed (verified 2026-04-11).
- **Behavioral event entropy analysis** — the scraper emits synthesized slideSd events; these may lack the entropy of real mouse movement and get flagged after a threshold of attempts.
- **Account/session reputation** — once the server has seen enough suspicious sessions from an IP, it downgrades the trust score and starts rejecting regardless of token correctness.
- **Cookie/referer chain** — the scraper submits without the upstream referer/cookie chain a browser would carry.

## Next Investigation Steps

If errorCode 12 is worth fixing:
1. Capture a real browser's behavioral event stream (slideSd payload) and replay it through the scraper.
2. Compare the scraper's and the browser's request headers byte-by-byte at the verify stage.
3. Test from a fresh IP — does the 8–10 attempt window reset?
4. Test with a warm-up phase (a few "real" solves via Puppeteer before the scraper attempts start).

## Phase 45.6 re-test — 2026-04-15 (vData fingerprint swap)

The Phase 36 survey above pre-dated the vm-slide `vData` reversal. In Phase 43/44
we pinned vData's cipher pipeline and plaintext schema, and in Phase 45 we swapped
the scraper's default vData generation from live jsdom (which leaks four
jsdom-specific field values `tp` / `cLod` / `inf` / `ss`) to the standalone
`buildVDataForPost` pipeline using HAR-derived browser-like values from
`profiles/vdata-browser-default.json`. Phase 45.6 measures the effect empirically.

**Survey protocol.** Same IP (`111.119.253.170`), same day (2026-04-15), 30
atomic `--captcha-only --retries 1` invocations per arm, one arm at a time, no
delay between attempts. Auto-port failures on two new tdc.js template hashes
(`88ebeea62f566ec5`, `f53142c54fc43699`) are unrelated to the vData payload and
are excluded from the rate calculations. Raw logs:
`output/phase-45-errorcode-12-survey/{default,legacy}.log`; parsed summary at
`output/phase-45-errorcode-12-survey/summary.json`.

| Arm     | Path                                   | N_total | N_valid | success (-1) | errorCode 12 | errorCode 9 |
|---------|----------------------------------------|---------|---------|--------------|--------------|-------------|
| default | `buildVDataForPost` + browser profile | 30      | 21      | **6 (28.6%)**| 13 (61.9%)   | 2 (9.5%)    |
| legacy  | jsdom vm-slide (`generateVData`)       | 30      | 18      | 0 (0.0%)     | **17 (94.4%)** | 1 (5.6%)  |

**Two-proportion z-tests** (errorCode 12 is primary, success rate is secondary):

- errorCode 12 rate: **default 61.9% vs legacy 94.4%**, z = −2.40 (p ≈ 0.016, significant at α = 0.05).
- Success rate: **default 28.6% vs legacy 0.0%**, z = +2.47 (p ≈ 0.014, significant at α = 0.05).

**Verdict: improved.** On the same IP and same day, swapping the live jsdom
vData path for the standalone browser-profile path recovers a non-zero success
rate on the verify endpoint and drops the errorCode 12 rate by ~33 percentage
points. Both effects are statistically significant at p < 0.05. This confirms
— empirically, for the first time in this project — that errorCode 12 is
sensitive to the content of the vData plaintext, not just to the presence of a
well-formed cipher blob. The four jsdom tells in the legacy path (`cLod =
'unloadTDC'`, `inf = 'top'`, `tp = 'Cannot read properties of null (reading
'src')'`, jsdom-derived `ss`) are visible fingerprint differentiators the
server scores on.

**Temporal ordering of outcomes.** The Phase 36 doc above described errorCode
12 as a saturation effect ("success on attempt 1, usually fails by attempt
10"). The Phase 45.6 data refines that picture — success and errorCode 12 are
**interleaved**, not strictly ordered, and the legacy arm has no cold-start
success at all. Per-attempt sequences (✓ = success −1, `12` = errorCode 12,
`9` = errorCode 9, `AP` = auto-port failure, excluded):

```
default:  1:✓  2:✓  3:12  4:✓  5:✓  6:12  7:12  8:AP  9:AP 10:✓
         11:12 12:✓ 13:12 14:12 15:12 16:AP 17:12 18:AP 19:AP 20:12
         21:AP 22:9  23:9  24:12 25:12 26:AP 27:AP 28:AP 29:12 30:12

legacy:   1:12  2:12  3:12  4:AP  5:9  6:12  7:12  8:12  9:12 10:12
         11:AP 12:12 13:12 14:12 15:AP 16:AP 17:12 18:AP 19:12 20:AP
         21:AP 22:12 23:AP 24:AP 25:12 26:AP 27:12 28:12 29:AP 30:12
```

Reading this:

1. errorCode 12 appears as early as **attempt 3** on the default arm, before
   successes at 4, 5, 10, and 12 — so "errorCode 12 only after a success"
   is false. The default arm produces both outcomes side-by-side in the
   early window.
2. There IS a saturation cutoff: the last default-arm success is at attempt
   **12**. Attempts 13–30 on both arms produce 14 valid samples and **zero**
   successes. Something degrades the session around attempt 10–12 regardless
   of which vData path is used.
3. The legacy arm **never hits a success window** — attempts 1, 2, 3 all
   return errorCode 12. Whatever scoring gate lets the default arm slip
   through in the first ~12 attempts is closed from attempt 1 against the
   jsdom-flavoured vData.

The sharper statement is therefore: **success requires a good vData AND an
early attempt index**. The default path unlocks the early-window opportunity
(without which the saturation-cutoff observation would be invisible); the
legacy path is gated out of that window entirely. errorCode 12 is thus driven
by at least two independent signals — one content-based (vData plaintext
fingerprint tells) and one rate-based (per-IP / per-session saturation around
attempt 10–12).

Caveats:
- 28.6% success is far from 100%; other sub-signals (behavioral events,
  referer/cookie chain, TLS fingerprint) likely still contribute. The Phase 36
  hypotheses about behavioral scoring and reputation are not displaced — this
  survey only isolates the vData contribution.
- Sample sizes after exclusion (21 / 18) are small; the z-tests are directional
  evidence, not a tight effect-size estimate. The "saturation at attempt ~12"
  observation is also a single-run finding and should be re-measured from a
  fresh IP before it is treated as pinned.
- The browser profile was built from the HAR oracle; field values drawn from
  that single capture may themselves become stale as Tencent rotates fixtures.

## Status

**Partially mitigated (2026-04-15).** vData fingerprint content has been shown
to materially affect errorCode 12 incidence, and the default scraper path now
uses browser-like vData values. Residual errorCode 12 is still the majority
outcome (61.9% valid), so behavioral / header-chain investigation from the
earlier "Next Investigation Steps" list remains relevant.

## Phase 46 lane-change surveys

Phase 45.6 revealed that all "successes" were `t03tserver...` bypass-lane
tickets issued with `errorCode: -1`; a real browser gets `t01.../t02...`
tickets with `errorCode: 0`. The content-layer changes in Phase 45 moved us
within the bypass lane but never onto the errorCode-0 lane. Phase 46 closes
the remaining wire-level gaps between the scraper and Chrome 146 one at a
time with a live re-measurement after each fix. The primary metric is now
the ticket prefix, not the success percentage.

### 46.3 — after restoring `/vm-slide.enc.js` fetch on the default path

30 atomic `--captcha-only --retries 1` invocations from `111.119.253.170`,
serial, no gap. Raw logs: `output/phase-46-errorcode-0/46.3-after-vmslide.{log,jsonl}`.

| Metric                               | 45.6 default (n=30) | 46.3 after-vmslide (n=30) |
|--------------------------------------|---------------------|---------------------------|
| t01 + t02 tickets                    | 0                   | **0**                     |
| t03tserver tickets                   | 6                   | 7                         |
| `errorCode: 0`                       | 0                   | **0**                     |
| `errorCode: -1`                      | 6                   | 7                         |
| `errorCode: 12`                      | 13                  | 19                        |
| `errorCode: 9`                       | 2                   | 0                         |
| null (auto-port / transport failure) | 15                  | 3                         |

**Verdict — null result on the primary metric.** Restoring the `/vm-slide.enc.js`
fetch produced zero `t01`/`t02` tickets. The `t03tserver` count moved 6 → 7
(two-proportion z ≈ 0.31, not significant), which is noise. The drop in null
rows (15 → 3) is consistent with fewer auto-port failures — the two tdc.js
templates missing from the porting cache during 45.6 either rotated out of
the live pool or sampling landed differently this run — and does not reflect
a substantive change in the scoring outcome.

**Interpretation.** The hypothesis that a missing `/vm-slide.enc.js` GET was
the single dominant wire-level tell is falsified. The fix is still correct —
Chrome unconditionally fetches that URL, so shipping 46.1 closed a real gap —
but closing vm-slide alone does not move the scoring lane. The lane gate
remains elsewhere in the request chain (telemetry beacons, header order,
or TLS fingerprint).

Next gate: 46.6 (after adding the two `/caplog` beacons).

### 46.6 — after adding the two `/caplog` telemetry beacons

30 atomic `--captcha-only --retries 1` invocations from `111.119.253.170`,
serial, no gap. Same protocol as 46.3. Raw logs:
`output/phase-46-errorcode-0/46.6-after-caplog.{log,jsonl}`.

| Metric                               | 46.3 (vm-slide) | 46.6 (+caplog) | Δ |
|--------------------------------------|-----------------|----------------|---|
| t01 + t02 tickets                    | 0               | **0**          | 0 |
| t03tserver tickets                   | 7               | 7              | 0 |
| `errorCode: 0`                       | 0               | **0**          | 0 |
| `errorCode: -1`                      | 7               | 7              | 0 |
| `errorCode: 12`                      | 19              | 18             | -1 |
| `errorCode: 9`                       | 0               | 0              | 0 |
| null                                 | 3               | 5              | +2 |

**Verdict — null result, again.** The ticket distribution is statistically
indistinguishable from 46.3. Two content-layer fixes (restoring the
`/vm-slide.enc.js` GET and emitting both `/caplog` telemetry beacons) have now
each passed a 30-attempt same-IP survey and each produced zero `t01`/`t02`
tickets. Both fixes are still correct at the wire level — Chrome really does
fetch vm-slide and really does emit the beacons — but neither is sufficient
to move the scoring lane.

**Phase 46 decision gate: fired.** Per the Phase 46 plan, if 46.3 AND 46.6
both return zero `t01`/`t02`, the director pauses and asks the user whether
to proceed with 46.7 (Chrome-canonical header ordering on the verify POST)
or jump straight to the TLS spike in 46.10. The evidence from 46.3 and 46.6
together — two independent content-layer additions with zero effect on the
primary metric — makes it increasingly likely that the lane gate sits below
the content layer, in header ordering or TLS fingerprint. 46.7's expected
effect is small; 46.10/46.11 (TLS impersonation) is the more impactful bet.

Director is paused here awaiting user decision.
