# Plan

## Status
Current phase: **Phase 51** — XTEA encryption fidelity
Current task: **51.1** — Collect token round-trip test

**Phases 38–50 closed.** Detail in git log (`git log --grep="Task:"`) and `history/`. Single-line summaries below.

---

## Phases

### Phases 38–46 — DONE
> Restructure, vm-slide reversal, captcha orchestrator, vData cipher+plaintext, scraper vData switchover, request-chain fidelity, TLS spike. All closed. See `history/`.

### Phase 47: Chrome-profile collect replay — DONE
> Scraper uses real Chrome cd values. Null result: 0/30 t01/t02, but errorCode -1 identified as the real gap.

### Phase 48: Session-level signal investigation — DONE
> Request-chain completion, caplog beacons. errorCode 12 = IP rate limit. errorCode -1 = verify POST body content. Pivoted to body diff.

### Phase 49: errorCode -1 root cause — collect token content — DONE
> POST body diff script, Chrome profile refresh (auto-refresh from Puppeteer capture), coordinate ratio fix. Two live measurements: 0/8 errorCode 0. **Collect token fingerprint values eliminated as root cause.**

### Phase 50: vData plaintext fix — DONE
> Decrypted Puppeteer vData: found `inf="top"` (not "iframe") and `tp=session.sid` (not static). Fixed both. Null result: 0/4 errorCode 0. **vData plaintext field values eliminated as root cause.**

### Eliminated hypotheses (Phases 47–50)
- Collect cd fingerprint values (profile refresh, coordinate ratio, field mapping)
- vData `inf`, `tp` field values
- TLS fingerprint (JA3 matches Chrome)
- Request chain completeness (all 12 HAR entries matched)
- Header ordering, caplog beacons

---

### Phase 51: XTEA encryption fidelity

> **Framing** — Phases 49–50 fixed all known plaintext differences between Puppeteer and scraper (collect cd values, sd coordinate, vData inf/tp). ErrorCode -1 persists. Since content fixes have no effect, the hypothesis shifts to the **encryption layer**: if the scraper's auto-ported XTEA keyMod constants are wrong for the live template, the server decrypts the collect token to garbled data — making all plaintext-level fixes irrelevant. Similarly, if the vData XTEA key doesn't match the live vm-slide build, the server can't decrypt vData at all.
>
> **Two tests**: (1) Verify the scraper's collect token encryption round-trips correctly by encrypting a known plaintext, decrypting with the same params, and checking for identity. (2) Verify the vData XTEA key matches the live build by capturing Puppeteer's vData and decrypting it with the scraper's key.

**Goal**: confirm or deny that the scraper's XTEA encryption (both collect and vData) is correct for the live template.

**Success metric**: both round-trip tests pass (encryption is correct) or one fails (root cause found).

| ID | Task | Status |
|----|------|--------|
| 51.1 | Collect token XTEA round-trip — encrypt a known plaintext with auto-ported params, decrypt, verify identity. Also: capture a fresh Puppeteer collect token on the same template, decrypt with the same params, verify valid JSON. | pending |
| 51.2 | vData XTEA key verification — run Puppeteer to capture vData, decrypt with the scraper's reference key (`2e430f8c15b7da96`), verify we get valid kv plaintext. If not: instrument vm-slide to extract the live key. | pending |
| 51.3 | Fix + re-test if either test reveals a mismatch | pending |

---

## Current Task

**ID**: 51.1
**Title**: Collect token XTEA round-trip test
**Phase**: Phase 51 — XTEA encryption fidelity
**Status**: pending

### Goal
Verify that the scraper's auto-ported XTEA params (key + keyMods) for the live template produce correct encryption that the server can decrypt. Two sub-tests:

**Test A — Self round-trip**: Take a known plaintext (e.g. `{"cd":[1,2,3],"sd":{"od":"C"}}`), encrypt it with the scraper's XTEA params for the current live template, decrypt it with the same params, verify the plaintext is recovered exactly.

**Test B — Cross-validation**: Run a fresh Puppeteer capture (`tools/captcha-solver/cli.js`), capture the tdc-source.js, auto-port it to extract XTEA params, then decrypt the Puppeteer's collect token with those params. If the decrypted output is valid JSON with `cd` and `sd` keys, the params are correct.

### Context
- Auto-porting: `tools/porting-pipeline/run.js <tdc-source> --skip-verify` → outputs XTEA params to `output/<stem>/xtea-params.json`
- Key extractor: `tools/porting-pipeline/key-extractor.js` — Puppeteer-based dynamic tracer
- The scraper's template cache (`tools/scraper/template-cache.js`) caches ported params per source hash
- The scraper's collect generator encrypts with keyMods from the ported config
- **Key concern**: the `keyModConstants` (per-index additions to the XTEA key schedule) are extracted by tracing the cipher rounds. If the tracer misidentifies the pattern (e.g. wrong indices), every block using that key index decrypts wrong on the server.

### Implementation Steps
1. Write `scripts/test-xtea-fidelity.js` that:
   a. Runs `tools/captcha-solver/cli.js` once (or re-uses latest capture) to get tdc-source.js + verify-post.json
   b. Auto-ports the tdc-source via the pipeline to get XTEA params
   c. **Test A**: encrypt a test plaintext, decrypt, assert identity
   d. **Test B**: decrypt the Puppeteer capture's collect token, assert valid JSON with cd/sd
   e. Print PASS/FAIL for each sub-test
2. Save output to `output/phase-51-xtea-fidelity/`

### Verification
- [ ] `node scripts/test-xtea-fidelity.js` runs and reports PASS/FAIL for both sub-tests
- [ ] If PASS: the XTEA params are correct, root cause is elsewhere
- [ ] If FAIL: identifies which keyMod index is wrong

### Suggested Agent
general-purpose — needs to read porting pipeline code, run the pipeline, write test script
