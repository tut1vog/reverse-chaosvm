# errorcode-12

## Open question

When the standalone scraper submits a `collect` token to the `t.captcha.qq.com` verify endpoint, the server frequently returns `errorCode 12`. Phase 36 (see `docs/ERRORCODE_12_INVESTIGATION.md`) ruled out pure IP rate limiting as the cause — the same IP alternating Chrome and scraper requests sees Chrome succeed while the scraper fails, so the signal is request-shaped, not source-shaped. The token-vs-transport isolation hypothesis is still unresolved: it is not yet proven whether the failing signal is inside the standalone `collect` token itself (cd array values, field ordering, serialization) or in the transport layer around it (TLS fingerprint, `vData`, POST encoding, header ordering). Current working theory is fingerprint/behavioral scoring on the server side. This track owns the investigation of what `errorCode 12` actually measures and how to avoid it.

## Status

partial

## Inputs

- `docs/ERRORCODE_12_INVESTIGATION.md` — Phase 36 reference doc ruling out IP rate limiting
- `sample/` HAR captures of successful Chrome verify flows
- `research/errorcode-12/token-isolation-test.js` — swaps the `collect` field in a real Chrome verify POST with a standalone-generated token
- `research/errorcode-12/chrome-cd-inject.js` — feeds Chrome's decrypted `cd` array into the standalone `generateCollect()` via `cdArrayOverride`
- `tools/captcha-solver/{captcha-client,slide-solver,captcha-solver}.js` — the live Chrome solve flow the isolation tests ride on top of
- Live `t.captcha.qq.com` verify endpoint

## How to reproduce

```
node research/errorcode-12/token-isolation-test.js
node research/errorcode-12/token-isolation-test.js --no-swap
node research/errorcode-12/token-isolation-test.js --headless
```

```
node research/errorcode-12/chrome-cd-inject.js
node research/errorcode-12/chrome-cd-inject.js --headful
node research/errorcode-12/chrome-cd-inject.js --retries 3
```

## Notes
