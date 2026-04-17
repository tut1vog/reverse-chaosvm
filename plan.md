# Plan

## Status
Current phase: **Phase 52** — Full-flow side-by-side audit (Puppeteer vs scraper)
Current task: **52.1** — Instrument `httpRequest` and Puppeteer with request-level logging

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
| 52.3 | Build `scripts/audit-diff.js` that loads a Puppeteer audit log and a scraper audit log, diffs them field-by-field, and prints a categorized report: request-chain diffs, timing diffs, header diffs, POST body field diffs, collect cd diffs, sd diffs, vData field diffs, behavioral event shape diffs. | pending |
| 52.4 | Run both flows, produce the diff report, and analyze findings. | pending |

---

## Current Task

**ID**: 52.3
**Title**: Build audit-diff.js — categorized comparison of two audit logs
**Phase**: Phase 52 — Full-flow side-by-side audit
**Status**: pending

### Goal
Build `scripts/audit-diff.js` that loads a Puppeteer and scraper audit log, diffs them field-by-field, and prints a categorized report: request-chain diffs, header diffs, POST body field diffs, token field diffs, timing diffs. The output should narrow the root cause to 1–3 concrete items.

### Context
52.1 + 52.2 are done. Both flows write `output/phase-52-audit/{scraper,puppeteer}-audit.json` with identical schemas: `{ source, timestamp, requests[], tokens{}, result }`. Each request entry has: seq, step, method, url, requestHeaders, requestBodyDigest, responseStatus, responseHeaders, responseSize, startTime, duration, error. Token fields: collectLength, collectEncoded, eks, vData, ans, slideSd, behavioralEventsCount, nonce, vsig, websig, sess, tlg, sid.

### Implementation Steps
1. Read both JSON files
2. Diff request chains (match by step label, compare URL patterns, methods, header sets, response statuses)
3. Diff token fields (compare lengths, values where same-session tokens aren't expected to match but field presence/length/shape should)
4. Diff POST field coverage (scraper logs all 38+ verify fields, Puppeteer captures from raw POST body)
5. Report categorized diffs with severity

### Verification
- [ ] `node scripts/audit-diff.js output/phase-52-audit/puppeteer-audit.json output/phase-52-audit/scraper-audit.json` runs without error on sample data
- [ ] Output clearly categorizes differences
- [ ] `npm test` still passes

### Suggested Agent
general-purpose
