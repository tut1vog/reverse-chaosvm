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
| 51.1 | Collect token XTEA round-trip — encrypt a known plaintext with auto-ported params, decrypt, verify identity. Also: capture a fresh Puppeteer collect token on the same template, decrypt with the same params, verify valid JSON. | done |
| 51.2 | vData XTEA key verification — decrypt the Puppeteer-captured vData with the scraper's reference key (`2e430f8c15b7da96`), verify we get valid kv plaintext. If not: instrument vm-slide to extract the live key. | pending |
| 51.3 | Fix + re-test if either test reveals a mismatch | pending |

---

## Current Task

**ID**: 51.2
**Title**: vData XTEA key verification
**Phase**: Phase 51 — XTEA encryption fidelity
**Status**: pending

### Goal
Verify the scraper's vData XTEA key matches the live vm-slide build by decrypting the Puppeteer-captured vData from `output/puppeteer-capture/verify-post.json` using the scraper's reference key (`2e430f8c15b7da96`). If decryption produces valid key=value plaintext, the key is correct. If not, instrument vm-slide to extract the live key.

### Context
- Puppeteer capture `output/puppeteer-capture/verify-post.json` has `vData` field: `"VueBKpkQNbhk8PJ_PeBGUrZa0SQPFx78UAhqWVgeezUpKA*ve*PQ6N3w9sDZZt1oEJ6cgPkA*6IszW6wXxShntDQwNwNrzCkpXo6ZdlScDNnPyVjyb*GScppLGfpD*256njvt-OW9r-jnadWhe91IGYY"`
- vData pipeline: custom 65-char base64 decode → XTEA decrypt → un-ShiftRows → un-PKCS#7-pad → plaintext
- Reference key: `2e430f8c15b7da96` (16 ASCII bytes → 4 LE uint32s)
- Encoder/decoder in `tools/vdata-generator/encode.js`
- Test fixtures in `tests/fixtures/vdata-{jsdom,har}-capture.json` round-trip with this key

### Implementation Steps
1. Add a Test C to `scripts/test-xtea-fidelity.js` (or write a separate script) that:
   a. Reads the `vData` field from verify-post.json
   b. Decodes with the vData custom base64 alphabet
   c. Decrypts with the reference XTEA key
   d. Un-ShiftRows and un-pads
   e. Checks if output looks like valid kv pairs (e.g. contains `key=` or `tp=` or `inf=`)
   f. Prints PASS/FAIL

### Verification
- [ ] Script runs and reports PASS/FAIL for vData decryption
- [ ] If PASS: vData key confirmed correct for live build
- [ ] If FAIL: raw hex output shows garbled data, confirming key mismatch

### Suggested Agent
general-purpose — needs vdata-generator encode.js, fixture format knowledge
