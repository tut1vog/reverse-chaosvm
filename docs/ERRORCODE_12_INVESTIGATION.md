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

Caveats:
- 28.6% success is far from 100%; other sub-signals (behavioral events,
  referer/cookie chain, TLS fingerprint) likely still contribute. The Phase 36
  hypotheses about behavioral scoring and reputation are not displaced — this
  survey only isolates the vData contribution.
- Sample sizes after exclusion (21 / 18) are small; the z-tests are directional
  evidence, not a tight effect-size estimate.
- The browser profile was built from the HAR oracle; field values drawn from
  that single capture may themselves become stale as Tencent rotates fixtures.

## Status

**Partially mitigated (2026-04-15).** vData fingerprint content has been shown
to materially affect errorCode 12 incidence, and the default scraper path now
uses browser-like vData values. Residual errorCode 12 is still the majority
outcome (61.9% valid), so behavioral / header-chain investigation from the
earlier "Next Investigation Steps" list remains relevant.
