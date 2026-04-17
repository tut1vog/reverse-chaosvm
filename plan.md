# Plan

## Status
Current phase: **Phase 53** — Collect token structural fix + audit-derived fixes
Current task: **53.1** — Decrypt both collect tokens and diff cd field arrays

**Phases 38–51 closed.** Detail in git log (`git log --grep="Task:"`) and `history/`.

---

## Phases

### Phases 38–50 — DONE
> Restructure, vm-slide reversal, captcha orchestrator, vData cipher+plaintext, scraper vData switchover, request-chain fidelity, TLS spike, Chrome-profile collect, session signals, errorCode -1 body content, vData plaintext fix. All closed.

### Phase 51: XTEA encryption fidelity — DONE
> Both collect and vData XTEA encryption confirmed correct for the live template. Three round-trip tests pass. Encryption eliminated as root cause.

### Eliminated hypotheses (Phases 47–51)
- Collect cd fingerprint values (profile refresh, coordinate ratio, field mapping)
- vData `inf`, `tp` field values
- TLS fingerprint (JA3 matches Chrome)
- Request chain completeness (all 12 HAR entries matched)
- Header ordering, caplog beacons
- XTEA encryption (collect + vData) — Phase 51

---

### Phase 52: Full-flow side-by-side audit (Puppeteer vs scraper)

> **Framing** — Phases 47–51 eliminated every targeted hypothesis (fingerprint fields, vData fields, TLS, request chain, XTEA encryption). ErrorCode -1 persists. Instead of guessing the next hypothesis, we build **comprehensive instrumentation** to capture every observable difference between the two flows in a single run. The output is a structured JSON log for each flow, containing every HTTP request/response (URL, method, headers, timing, status, body digest) and every generated token field (collect cd/sd, vData fields, behavioral events). A diff script then highlights every divergence — the root cause should be visible in the diff.

**Goal**: produce a structured side-by-side comparison that reveals **every** difference between a successful Puppeteer solve and a failing scraper solve.

**Success metric**: a diff report showing categorized differences (URLs, timing, headers, token fields, POST body fields) that narrows the root cause to 1–3 concrete items.

| ID | Task | Status |
|----|------|--------|
| 52.1 | Instrument `httpRequest` with request-level logging (URL, method, headers, timing, status, response size); instrument Puppeteer `captcha-solver.js` to capture the same data from Chrome DevTools Protocol. Both write to a common JSON schema under `output/phase-52-audit/`. | done |
| 52.2 | Instrument token generation: scraper logs decrypted collect fields (full cd array, sd object), behavioral events array, vData plaintext fields. Puppeteer captures the same from the intercepted verify POST body (decrypt collect, decode vData). Both append to the same audit JSON. | done |
| 52.3 | Build `scripts/audit-diff.js` that loads a Puppeteer audit log and a scraper audit log, diffs them field-by-field, and prints a categorized report: request-chain diffs, timing diffs, header diffs, POST body field diffs, collect cd diffs, sd diffs, vData field diffs, behavioral event shape diffs. | done |
| 52.4 | Run both flows, produce the diff report, and analyze findings. | done |

---

## Phase 52 Findings (2026-04-17)

Side-by-side audit identified 4 concrete differences between Puppeteer (errorCode=0) and scraper (errorCode=-1):

1. **🔴 Collect token length: 5144 vs 6540 (+27%)**. Scraper's 60-slot cdFieldOrder produces 55 cd fields + 5 behavioral events. Chrome's real TDC produces a shorter token — likely fewer fields or different serialization. Primary detection vector.
2. **🟡 Accept-Language mismatch**: scraper sends `en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7` on every request; Chrome sends `en-US,en;q=0.9`. Inconsistent with English-Chrome User-Agent.
3. **🟡 Missing slide-jy.js fetch**: regex `slide-jy` doesn't match live show page HTML; request silently skipped. Chrome always fetches it.
4. **🟡 Timing: scraper completes in 1.2s, Puppeteer in 5.0s**. Scraper caplog-pre→verify gap is 41ms vs 3314ms. No human-like delay simulation at the network level.

---

### Phase 53: Collect token structural fix + audit-derived fixes

> Fix all 4 differences identified by the Phase 52 audit. The collect token structural mismatch is the highest-priority item; the other three are quick fixes that reduce the scraper's overall bot fingerprint.

| ID | Task | Status |
|----|------|--------|
| 53.1 | Decrypt both collect tokens (Puppeteer + scraper) and diff the cd field arrays to identify exactly which fields/serialization differ. Write a script `scripts/collect-diff.js` that takes two collect strings + XTEA params and outputs a field-by-field comparison. | pending |
| 53.2 | Fix the scraper's collect generation to match Chrome's real cd field count and serialization for the live template. | pending |
| 53.3 | Fix Accept-Language to `en-US,en;q=0.9` across all scraper HTTP requests (captcha-client.js, scraper.js direct calls, caplog-beacon.js). | pending |
| 53.4 | Fix the slide-jy.js fetch: update the regex in scraper.js to match the live show page HTML, or use a broader pattern. | pending |
| 53.5 | Re-run the full audit (Puppeteer + scraper + diff) and verify that the fixes narrow or eliminate the errorCode -1. | pending |

---

## Current Task

**ID**: 53.1
**Title**: Decrypt both collect tokens and diff cd field arrays
**Phase**: Phase 53 — Collect token structural fix
**Status**: pending

### Goal
Decrypt the Puppeteer and scraper collect tokens captured during the Phase 52 audit, extract their cd field arrays, and produce a field-by-field diff that pinpoints exactly what the scraper sends differently from Chrome's real TDC.

### Context

**Inputs**:
- Puppeteer collect: 5144 chars, from `output/phase-52-audit/puppeteer-audit.json` → `tokens.collectEncoded`
- Scraper collect: 6540 chars, from `output/phase-52-audit/scraper-audit.json` → `tokens.collectEncoded`
- Puppeteer's TDC source: `output/puppeteer-capture/tdc-source.js` (162790 chars) — need XTEA key extraction
- Scraper's TDC auto-ported as hash `e6a45ba64d246f82` in `tools/scraper/cache/templates.json` — XTEA key already available

**The two flows got DIFFERENT tdc.js builds** (different sessions, Tencent may serve different builds per request). Both are "unknown" auto-ported templates with 60-slot cdFieldOrders. The scraper's template has 55 cd fields + 5 behavioral; the pipeline-config shows 54 cd + 6 behavioral for the other build.

**Collect token structure** (from `docs/TOKEN_FORMAT.md`):
- Base64 encoded → XTEA encrypted → plaintext is: `header|cd_string|sd_string` where `|` is the segment separator, cd_string is comma-separated values, sd_string is a JSON object.

**Decryption tools**:
- `tools/token-generator/decrypt.js` exports `decryptCollect(collectStr, params)` → `{ plaintext, parsed }`
- `decryptXtea(inputBytes, params)` does the raw XTEA decryption
- XTEA params format: `{ key: [4 uint32s], delta, rounds, keyModConstants: [4 ints], keyMods: {...} }`

**Key extraction**: To decrypt Puppeteer's collect, we need the XTEA key for its TDC build. Options:
1. Run the porting pipeline on `output/puppeteer-capture/tdc-source.js` to extract the key
2. Use the key-extractor agent/tool directly

### Implementation Steps
1. Extract XTEA key from the Puppeteer TDC source (run porting pipeline or key-extractor on `output/puppeteer-capture/tdc-source.js`)
2. Decrypt both collect tokens using their respective XTEA keys
3. Parse the plaintext: split by segment separator, extract cd array (comma-separated), extract sd JSON
4. Build `scripts/collect-diff.js` that:
   - Takes two audit JSON paths as args
   - Loads the collect tokens + XTEA params for each
   - Decrypts both
   - Compares: header segment, cd field count, cd field values (positionally), sd fields
   - Outputs a clear field-by-field diff
5. Run it on the Phase 52 captures

### Verification
- [ ] Both collect tokens decrypt successfully (plaintext is valid, not garbled)
- [ ] `scripts/collect-diff.js` runs without error and produces a clear diff showing field count differences, specific field value differences, and serialization differences
- [ ] The diff clearly explains the 1396-char length difference

### Suggested Agent
general-purpose — needs to run the porting pipeline, write decrypt/diff script, handle XTEA params from two different templates
