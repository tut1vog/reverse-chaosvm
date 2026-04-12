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

## Status

Open. Token generation is verified correct; the remaining issue is on the request-presentation / behavioral side.
