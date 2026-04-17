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

1. **~~🔴 Collect token length: 5144 vs 6540 (+27%)~~** — **DEBUNKED by 53.1**: both tokens have exactly 60 cd fields. Size difference is from content (pageUrl 715 chars + behavioral events 524 chars), not structure.
2. **🟡 Accept-Language mismatch**: scraper sends `en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7` on every request; Chrome sends `en-US,en;q=0.9`. Inconsistent with English-Chrome User-Agent.
3. **🟡 Missing slide-jy.js fetch**: regex `slide-jy` doesn't match live show page HTML; request silently skipped. Chrome always fetches it.
4. **🟡 Timing: scraper completes in 1.2s, Puppeteer in 5.0s**. Scraper caplog-pre→verify gap is 41ms vs 3314ms. No human-like delay simulation at the network level.

## Phase 53.1 Findings (2026-04-17)

Decrypted both collect tokens and ran semantic field matching across different template orderings:
- **Both tokens have exactly 60 cd fields** — field count is NOT the issue.
- **22 of 27 semantically identified fields match exactly** between Puppeteer and scraper.
- **pageUrl**: scraper sends the full `cap_union_new_show?aid=...&protocol=...` URL (779 chars); Puppeteer's TDC only captures `?rand=...` (64 chars). This is a detection vector — the full URL leaks the captcha context.
- **3 fields in Puppeteer but missing/empty in scraper**: `sid` (session ID), `webglImage` (WebGL canvas fingerprint), `webglRenderer` ("Intel Iris OpenGL Engine"). These are jsdom limitations — jsdom can't render WebGL canvases.
- **33 Puppeteer fields and 36 scraper fields remain unidentified** by pattern matching — need semantic mapping to determine if any differ materially.
- **sd object**: 6/8 keys match; `slideValue` and `ft` differ as expected (session-specific).

**Updated hypothesis**: The collect structural mismatch is NOT the root cause. New suspects:
1. **pageUrl** leaking full captcha URL (easy fix)
2. **Missing WebGL fingerprint** in jsdom (hard — may need a static fingerprint value)
3. **Some of the 33 unidentified fields** may contain bot-detectable values (need mapping)
4. Accept-Language, timing, slide-jy.js fetch (original items 2-4)

---

### Phase 53: Audit-derived fixes + collect field investigation

> Fix the concrete differences identified by the Phase 52 audit and Phase 53.1 collect diff. The collect token length difference is debunked — both have 60 fields. Focus shifts to pageUrl content, Accept-Language, timing, and unidentified field mapping.

| ID | Task | Status |
|----|------|--------|
| 53.1 | Decrypt both collect tokens and diff cd field arrays | done |
| 53.2 | Fix pageUrl in collect: scraper should capture only the short `?rand=...` URL, not the full show URL with all params. | done |
| 53.3 | Fix Accept-Language to `en-US,en;q=0.9` across all scraper HTTP requests. | pending |
| 53.4 | Fix the slide-jy.js fetch: update the regex in scraper.js to match the live show page HTML. | pending |
| 53.5 | Add human-like timing delays: randomized pause between show page load and verify POST (2-5s). | pending |
| 53.6 | Re-run the full audit (Puppeteer + scraper + collect-diff) and verify that fixes narrow or eliminate errorCode -1. | pending |

---

## Current Task

**ID**: 53.2
**Title**: Fix pageUrl in collect token
**Phase**: Phase 53 — Audit-derived fixes
**Status**: pending

### Goal
Fix the scraper's collect generator so that the `pageUrl` cd field contains a short `?rand=...` URL (matching Chrome's real TDC behavior) instead of the full `cap_union_new_show?aid=...&protocol=...` URL which leaks captcha context.

### Context

The collect-diff (53.1) showed Puppeteer's pageUrl is `"https://t.captcha.qq.com/cap_union_new_show?rand=1519713624347"` while the scraper sends the full show URL with all query parameters (779 chars). The real TDC.js running in Chrome's iframe only sees `location.href` which is the short rand-only URL after the redirect — the full URL with all params is the initial navigation URL, not what the iframe sees.

**Files to investigate**:
- `tools/scraper/collect-generator.js` — where `pageUrl` is set in the cd array
- `profiles/default.json` — may contain a `pageUrl` field
- The scraper's template cdFieldOrder to find which index `pageUrl` maps to

### Implementation Steps
1. Find where `pageUrl` is populated in `tools/scraper/collect-generator.js`
2. Change it to generate a short `https://t.captcha.qq.com/cap_union_new_show?rand=<timestamp>` URL
3. Verify the change doesn't break test suite

### Verification
- [ ] `npm test` passes (296/296)
- [ ] Running `node scripts/collect-diff.js` shows pageUrl now matches the short format

### Suggested Agent
general-purpose — simple code change in the collect generator
