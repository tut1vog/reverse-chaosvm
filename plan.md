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
| 51.2 | vData XTEA key verification — decrypt the Puppeteer-captured vData with the scraper's reference key (`2e430f8c15b7da96`), verify we get valid kv plaintext. If not: instrument vm-slide to extract the live key. | done |
| 51.3 | Fix + re-test if either test reveals a mismatch | done (n/a — both tests passed) |

---

## Phase 51 Complete

All three tests in `scripts/test-xtea-fidelity.js` pass:
- **Test A** (self round-trip): collect XTEA encrypt/decrypt recovers plaintext exactly
- **Test B** (cross-validation): Puppeteer collect decrypts to valid 60-field cd + 8-key sd JSON
- **Test C** (vData key): Puppeteer vData decrypts to valid 98-char kv plaintext: `ss=11%2Ctdc%2Cslide%2Cvm&tp=...&inf=top&key=41yy&py=0&env=0&version=2&cLod=loadTDC`

**Conclusion**: Both XTEA encryption layers (collect token and vData) are correct for the live template. XTEA encryption eliminated as root cause for errorCode -1. The server can decrypt both payloads — the rejection must be content-level or session-level.
