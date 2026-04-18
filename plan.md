# Plan

## Status
Current phase: **Phase 63** — Slim scraper: standalone-proven flow
Current task: **Phase 63 complete** — slim scraper gets errorCode 0

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
| 53.3 | Fix Accept-Language to `en-US,en;q=0.9` across all scraper HTTP requests. | done |
| 53.4 | Fix the slide-jy.js fetch: add fallback to canonical CDN URL when sig._html unavailable. | done |
| 53.5 | Add human-like timing delays: randomized pause between show page load and verify POST (2-5s). | done |
| 53.6 | Re-run the full audit (Puppeteer + scraper + collect-diff) and verify that fixes narrow or eliminate errorCode -1. | done |

---

## Phase 53.6 Results (2026-04-17)

- Puppeteer: **errorCode 0** (success)
- Scraper: **errorCode -1** (failure — unchanged)
- Collect size gap narrowed from 1396 chars (27%) to 468 chars (9%) — pageUrl fix working
- All 4 fixes confirmed working: pageUrl short, Accept-Language matches, slide-jy.js fetched, 2.2s delay applied

---

### Phase 54: Fix dropped -1 slot values in collect generation

> **Root cause identified**: `chromeFieldOrder` maps 6 template positions to `-1` (unmapped canonical index). `_generateCollectChrome` treats ALL `-1` slots as behavioral event slots — only placing events at the `hashPosition`, and pushing empty strings for the rest. But 5 of these 6 slots contain real fingerprint data captured from Chrome: `webglVendor` (cd[7]), `webglRenderer` (cd[19]), an unknown field (cd[34]), `webglImage` (cd[36]), and `sid` (cd[49]). Only cd[28] is the real behavioral events slot. The empty strings are a clear bot signal.

| ID | Task | Status |
|----|------|--------|
| 54.1 | Fix `_generateCollectChrome` to preserve captured values for non-hashPosition -1 slots instead of emptying them. | done |
| 54.2 | Re-run audit — errorCode still -1. 2 of 4 missing fields now present (webglRenderer, detectedFonts). webglImage and sid still missing due to template rotation: cp.cd[i] indexes by profile template order, not live template order. | done |
| 54.3 | Store unmapped -1 values as pool; inject into live template's -1 slots. | done |

---

## Phase 54.3 Results (2026-04-17)

- ErrorCode still -1 despite webglImage + webglRenderer now matching
- Pool approach restored 2 more fields but sid and detectedFonts still Puppeteer-only (template rotation shuffles pool order)

---

### Phase 55: Verify POST body fidelity + collect sid session binding

> Two parallel investigations:
> (A) **Verify POST body fidelity**: compare the exact byte-level POST body encoding between the scraper's `URLSearchParams` serialization and the real jQuery `$.param()` encoding Chrome uses. Differences in encoding (e.g., `+` vs `%20` for spaces, `%3D` vs `=` in base64, field ordering) could cause server rejection.
> (B) **Collect token sid binding**: the collect token's cd array contains a stale `sid` from the profile (`7450533642822729728`), while the verify POST's `sid` field is the live session's value. If the server cross-checks these, the mismatch triggers rejection. Fix by substituting the live session's sid into the correct -1 slot before collect generation.

| ID | Task | Status |
|----|------|--------|
| 55.1 | Capture a Puppeteer verify POST body (raw bytes) and a scraper verify POST body side-by-side. Diff field-by-field: encoding differences, field order, content-type, body length. Write `scripts/verify-body-diff.js`. | done |
| 55.2 | Fix sid in collect: identify which -1 slot contains sid (by matching the numeric string pattern), substitute `session.sid` at generation time instead of using the stale profile value. | done |
| 55.3 | Re-run audit with both fixes and check errorCode. | done |

---

## Phase 55.3 Results (2026-04-17)

- Puppeteer: **errorCode 0** (success)
- Scraper: **errorCode -1** (still failing)
- **🔴 CRITICAL: POST body encoding mismatch discovered.** The real browser (`t_captcha_slide.js`) builds the verify POST body via **custom string concatenation** (`key + '=' + value` joined with `&`), NOT `$.param()` or `URLSearchParams`. Base64 characters (`+`, `/`, `=`) and delimiters (`,`, `;`) appear **raw** in the wire format. The scraper's `URLSearchParams` percent-encodes them (`%2B`, `%2F`, `%3D`, `%2C`, `%3B`), causing:
  1. **`tlg` vs collect length mismatch**: `tlg` records pre-encoding length (~5100), but percent-encoded collect is ~6000 chars on the wire — server detects the discrepancy.
  2. **`vData` computed over wrong body**: vData is the HMAC-like digest of the POST body. Scraper computes it over percent-encoded text; server expects it over the raw-concat text.
  3. **`ans` encoding**: browser sends `495,35;` raw, scraper sends `516%2C158%3B`.
- Sid fix working: live session sid now in POST body fields.
- `subcapclass` differs: Puppeteer sends `""`, scraper sends `"15"` — minor, but worth matching.

---

### Phase 56: Fix POST body encoding to match browser's raw concatenation

> **Root cause fix.** The real browser uses custom string concatenation (not $.param/URLSearchParams) to build the verify POST body. Base64 chars appear raw. The scraper must match this exactly. Additionally, vData must be computed over the same raw-format body.

| ID | Task | Status |
|----|------|--------|
| 56.1 | Replace `serializePostFields()` (URLSearchParams) with a raw-concat serializer that matches the browser's format: `key=value` joined by `&`, NO percent-encoding of base64 chars. Also fix `vData` to be appended raw (not via `encodeURIComponent`). Fix `subcapclass` to match Puppeteer (empty string). | done |
| 56.2 | Re-run audit with the encoding fix and check errorCode. Run verify-body-diff to confirm encoding now matches. | done |

---

## Current Task

**ID**: 56.1
**Title**: Replace POST body serializer with raw-concat format
**Phase**: Phase 56 — Fix POST body encoding
**Status**: pending

### Goal
Replace the scraper's `URLSearchParams`-based POST body serializer with a raw string concatenation format that matches what `t_captcha_slide.js` produces in the real browser. This is the most likely root cause of errorCode=-1.

### Context

**Current flow** (scraper):
1. `serializePostFields(postFields)` at line 62 uses `URLSearchParams` — encodes `+` → `%2B`, `/` → `%2F`, `=` → `%3D`, `,` → `%2C`, `;` → `%3B`, spaces → `+`
2. vData computed over this percent-encoded body
3. `captcha-client.js` line 1047: `prebuiltBody + '&vData=' + encodeURIComponent(vData)` — vData also percent-encoded

**Target flow** (real browser):
1. Custom concatenation: `key=value&key=value` with NO encoding of any characters
2. vData computed over this raw body
3. vData appended as `&vData=<raw vData>` (no encoding)

**Files to modify**:
- `tools/scraper/scraper.js` — replace `serializePostFields()` body with raw concat
- `tools/captcha-solver/captcha-client.js` — fix `prebuiltBody + '&vData='` path to append vData raw
- `tools/scraper/scraper.js` line ~337 — set `subcapclass` to empty string (matching Puppeteer)

### Implementation Steps
1. In `serializePostFields()` (line 62), replace `URLSearchParams` with: `Object.keys(fields).map(k => k + '=' + (fields[k] == null ? '' : String(fields[k]))).join('&')`
2. In `captcha-client.js` line 1047, change `encodeURIComponent(vData)` to just `vData` (raw append)
3. In `tools/scraper/scraper.js`, find the `subcapclass` field in the POST fields object and ensure it's `''` not `'15'`
4. Verify vData is computed over the raw-concat body (it should be, since `buildVDataForPost(serializedBody, ...)` uses the serialized body directly)

### Verification
- [ ] `npm test` passes
- [ ] `serializePostFields('a+b', '=/=')` produces `a+b==/=` (no encoding)
- [ ] Running verify-body-diff on captures shows encoding now matches browser format

### Suggested Agent
general-purpose — targeted serializer fix

---

### Phase 57: Fix behavioral event format to match real browser

> **Three critical format mismatches** in `generateBehavioralEvents()`:
> 1. **Timestamps**: real browser uses deltas (ms since previous event) for events[1+]; scraper uses absolute epoch ms for ALL events.
> 2. **Event sequence**: real browser does init(4)→cursor-position(1)→mousedown(2)→drag-moves(1×N)→mouseup(3); scraper does init(4)→drag-moves(1×N)→mousedown(2)→jitter(1×M)→mouseup(3) — physically impossible ordering.
> 3. **Coordinate semantics**: real browser's first mousemove is absolute screen position (dx=159,dy=811); scraper uses incremental slide deltas from the start.
>
> Fixing these requires capturing a detailed Puppeteer behavioral event trace, reverse-engineering the exact schema, then rewriting `generateBehavioralEvents()` to match.

| ID | Task | Status |
|----|------|--------|
| 57.1 | Capture multiple Puppeteer behavioral event arrays via collect-diff (3+ runs), document the exact schema: event type codes, timestamp format (absolute vs delta), coordinate semantics (absolute screen vs incremental drag), event sequence order, count ranges, dx/dy value ranges. Write `output/phase-57/behavioral-event-schema.json`. | done |
| 57.2 | Rewrite `generateBehavioralEvents()` in `tools/scraper/collect-generator.js` to match the documented schema: correct event sequence, delta timestamps, correct coordinate system. | done |
| 57.3 | Write tests for the new `generateBehavioralEvents()` that assert: correct event type sequence, timestamps are deltas (not absolute), first move uses screen coordinates, total drag dx ≈ xAnswer. | done |
| 57.4 | Re-run audit (Puppeteer + scraper + collect-diff) and check errorCode. | done |

---

## Phase 57.4 Results (2026-04-17)

- Puppeteer: **errorCode 0** (success)
- Scraper: **errorCode -1** (still failing)
- Behavioral event format fix confirmed working: correct type sequence (4,1,2,1..1,3), delta timestamps, deceleration curve, dx sum = xAnswer
- **New finding: aggressive template rotation** — scraper received 103-opcode template (not A=95, B=94, or C=100). Puppeteer also got an unknown template. collect-diff failed to decrypt either token.
- POST body structure verified: all 39 fields match between Puppeteer and scraper (modulo session-specific values)

**Eliminated hypotheses (Phases 47–57)**:
- All prior Phase 47–56 eliminations still hold
- Phase 57: behavioral event format (timestamp, sequence, coordinates) — now matches real browser, still errorCode -1

---

### Phase 58: Controlled collect corruption experiment

> **Research question**: Does the verify endpoint validate collect token *contents*, and what error codes map to what failure modes? By running 5 test cases through the real Puppeteer browser (identical TLS, headers, vData, session) and varying ONLY the collect token, we isolate collect as the single variable.

| ID | Task | Status |
|----|------|--------|
| 58.1 | Build `scripts/collect-experiment.js` — a Puppeteer script that runs 5 CAPTCHA solves, each with a different collect token variant, records errorCode for each. | done |
| 58.2 | Run the experiment, analyze results, document findings in `output/phase-58/`. | done |

---

## Phase 58 Results (2026-04-18)

### Error code mapping discovered:

| Test | Collect | errorCode | Interpretation |
|------|---------|-----------|---------------|
| A (baseline) | Chrome's real TDC collect | **0** | ✅ Control passes — flow works |
| B (garbled) | Random base64 | *crashed* | Template rotation (96 opcodes) — key extraction returned null, not a script bug |
| C (empty) | `""` | **12** | Server requires non-empty collect |
| D (scraper-collect) | Our `generateCollect()` | **0** | 🔴 **Our collect generator is NOT the cause of errorCode -1** |
| E (poisoned) | Valid structure, Bot/1.0 + all zeros | **12** | Server decrypts and scores individual cd field values |

### Key findings:

1. **errorCode 12 = fingerprint/content rejection** — the server decrypts the collect token and inspects individual cd field values. Both empty collect (C) and poisoned fields (E) produce errorCode 12.
2. **🔴 CRITICAL: Test D got errorCode 0** — our standalone `generateCollect()` with live XTEA params + Chrome profile, sent through the real Puppeteer browser flow, produces a valid ticket. This proves **the scraper's collect token is accepted when the surrounding context is a real browser**. The errorCode -1 in the headless scraper is NOT caused by the collect token itself.
3. **errorCode -1 ≠ errorCode 12** — the scraper gets -1, not 12. This means the server can decrypt and validate the scraper's collect fine (otherwise it would return 12). The -1 is from something else entirely — likely the request context (TLS, headers, request chain, timing, IP reputation) rather than token content.
4. **Template rotation is aggressive** — hit templates with 94, 96, and 98 opcodes across 5 runs. Test B's 96-opcode template isn't in the known set (A=95, B=94, C=100).

### Implications for root cause:
- Collect token content is **eliminated** as the errorCode -1 root cause.
- errorCode 12 is the fingerprint scoring error code; -1 is something different.
- Next investigation should focus on what differs between Puppeteer's fetch() and the scraper's HTTP client at the transport/session level.

---

### Phase 59: Cookie inspection — Puppeteer vs scraper

> **Hypothesis**: Chrome accumulates cookies during the CAPTCHA flow (prehandle → show page → TDC load → verify) that the scraper's `CookieJar` may miss or handle differently. The verify endpoint may check for these cookies.
>
> **Key observation**: In the Puppeteer flow, prehandle is done via Node.js `CaptchaClient` (its own cookie jar), but the show page is loaded in Chrome (Chrome's native cookie jar). Cookies from prehandle are **not transferred** to Chrome — yet it works. This means the critical cookies come from the show page and its sub-resources, not prehandle.
>
> **Approach**: Instrument both flows to dump every cookie at each step, then diff.

| ID | Task | Status |
|----|------|--------|
| 59.1 | Build `scripts/cookie-inspector.js` — Puppeteer script that runs a full CAPTCHA solve and dumps Chrome's cookie jar at each step: after prehandle, after show page load, after TDC loads, after verify POST. Also dump `Set-Cookie` headers from every response. Write to `output/phase-59/puppeteer-cookies.json`. | done |
| 59.2 | Instrument the scraper to log every `Set-Cookie` header received and every `Cookie` header sent, at each flow step. Run the scraper and dump to `output/phase-59/scraper-cookies.json`. Confirm `TDC_itoken` is absent. | done |
| 59.3 | Diff the two cookie logs. | done (superseded — diff obvious from 59.1+59.2: Chrome has TDC_itoken, scraper has nothing) |

---

## Phase 59 Results (2026-04-18)

**59.1**: Chrome has exactly 1 cookie: `TDC_itoken` (format `<uint32>%3A<unix_timestamp>`), set by `tdc.js` via `document.cookie` — NOT by any `Set-Cookie` header. Zero server-set cookies across the entire flow.

**59.2**: Scraper cookie jar is empty throughout. No `Set-Cookie` headers received, no `Cookie` header sent on verify. jsdom DOES capture `TDC_itoken` when tdc.js runs, but the scraper never reads it.

**Diff**: Chrome sends `Cookie: TDC_itoken=...` on verify POST. Scraper sends no `Cookie` header at all.

---

### Phase 60: Inject TDC_itoken cookie into scraper verify POST

> **Root cause fix.** Phase 59 proved Chrome sends `TDC_itoken` on the verify POST (set by tdc.js via `document.cookie`). The scraper sends no cookies. The cookie format is `<uint32>%3A<unix_timestamp>`. Fix: generate and inject into cookie jar before verify.

| ID | Task | Status |
|----|------|--------|
| 60.1 | Add TDC_itoken generation to scraper.js: inject into `client.cookieJar` before verify POST. | done |
| 60.2 | Run the scraper and check errorCode. | done |

---

## Phase 60.2 Results (2026-04-18)

- Scraper: **errorCode -1** (still failing)
- `TDC_itoken` confirmed injected in logs: `3573759151%3A1776494487`
- Ran 3 times, consistently -1
- **TDC_itoken cookie alone is NOT the root cause** (or not the only factor)
- Notably: server returned a ticket even with errorCode -1 (`t03tserver9x25...`)

**Eliminated hypotheses (Phases 47–60)**:
- All prior Phase 47–57 eliminations still hold
- Phase 58: collect token content (accepted when sent via Puppeteer)
- Phase 60: TDC_itoken cookie (injected, still -1)

**Remaining transport-layer suspects**:
1. TLS fingerprint (Node.js vs Chrome BoringSSL — JA3 checked in Phase 48 but may need re-examination)
2. HTTP/2 vs HTTP/1.1 (Chrome uses H2, Node.js https uses H1.1)
3. TCP/IP stack fingerprint
4. Connection reuse pattern (Chrome reuses one TLS connection; scraper may open fresh per request)

---

### Phase 61: TLS fingerprint test via curl-impersonate

> **Hypothesis**: The verify endpoint fingerprints the TLS ClientHello (JA3/JA4). Node.js uses OpenSSL with different cipher suites, extensions, and ordering vs Chrome's BoringSSL. This is the last remaining transport-layer difference — the HTTP headers are essentially identical between scraper and Puppeteer.
>
> **Test design**: Run the scraper's normal flow for everything *except* the final verify POST. Instead of sending via Node.js `https.request()` (OpenSSL), dump the complete request (headers + body) and replay it via `curl-impersonate-chrome` (BoringSSL, Chrome TLS fingerprint). If errorCode changes from -1 to 0, TLS fingerprint is the root cause.
>
> **Tool**: `curl-impersonate-chrome` is installed at `/usr/local/bin/curl-impersonate-chrome` — uses BoringSSL (same as Chrome), supports HTTP/2, and mimics Chrome's exact TLS ClientHello.

| ID | Task | Status |
|----|------|--------|
| 61.1 | Build `scripts/tls-experiment.js` — runs scraper flow through vData generation, then sends verify POST via `curl-impersonate-chrome` subprocess instead of Node.js https. Records errorCode. Also runs a control: same body via Node.js `https` (normal scraper path) for comparison. | done |
| 61.2 | Run the experiment, analyze results. | done |

---

## Phase 61 Results (2026-04-18)

### 🔴 BREAKTHROUGH: Both transports succeed — errorCode 0!

| Run | Test A (curl-impersonate) | Test B (Node.js https) |
|-----|---------------------------|------------------------|
| Run 1 | errorCode 0, valid ticket | errorCode 0, valid ticket |
| Run 2 | auto-port failed (template rotation) | errorCode 0, valid ticket |
| Run 3 | errorCode 0, valid ticket | errorCode 0, valid ticket |

**Key findings**:
1. **TLS fingerprint is definitively NOT the issue** — Node.js OpenSSL works fine (errorCode 0).
2. **The scraper's modules work correctly** — this script uses the same `generateCollect()`, `buildVDataForPost()`, `serializePostFields()`, `httpRequest()` and gets success.
3. **The bug is in the scraper's integration/orchestration** — the script reconstructs the flow from imported modules and succeeds; the actual `TencentCaptchaScraper` class fails with -1.
4. **Template rotation is aggressive** — hit templates with 91 and 103 opcodes. 91-opcode template auto-ports successfully and works.

**Eliminated hypotheses (Phases 47–61)**:
- All prior Phase 47–60 eliminations still hold
- Phase 61: TLS fingerprint (OpenSSL and BoringSSL both succeed)
- Phase 61 BONUS: the entire token generation pipeline (collect, vData, behavioral events, XTEA) works — errorCode 0 via Node.js

**Root cause is narrowed to**: something the `TencentCaptchaScraper` class does differently from `tls-experiment.js` during the CAPTCHA flow. The difference is NOT in:
- Token generation (same modules, same output)
- TLS/transport layer (same `httpRequest()`)
- Headers (script copies the same header set)
- POST body encoding (same `serializePostFields()`)

**Likely suspects**:
1. **Request chain**: the scraper may make different/extra HTTP requests, or skip some, leaving a different server-side session state
2. **Timing/ordering**: the scraper may do requests in a different order or with different timing
3. **Cookie state**: the script hardcodes `Cookie: TDC_itoken=...` in headers; the scraper injects via `cookieJar`
4. **Session params**: the script may use different `prehandle`/`getSig` params than the scraper

---

### Phase 62: Isolate the scraper-vs-standalone divergence

> **Root cause narrowed**: The standalone `tls-experiment.js` uses the same modules as the scraper and gets errorCode 0, while the scraper gets -1. Code review shows headers, body, URL, and cookies are functionally identical between both paths. The fastest approach: add debug dumps to the actual scraper verify path, run it, and diff against tls-experiment's verify request byte-by-byte.

| ID | Task | Status |
|----|------|--------|
| 62.1 | Dump and diff scraper vs standalone verify requests; isolate sub-resource fetch impact | done |

---

## Phase 62 Results (2026-04-18)

### Verify request diff: structurally identical
- Added `DUMP_VERIFY` env var hook to `httpRequest()` in captcha-client.js
- Captured exact wire-level requests from both scraper and standalone
- **All headers identical** (modulo session-specific values and a cosmetic sec-ch-ua typo in standalone)
- **Body structure identical** (same field order, same encoding, same vData format)
- **URL identical**: `https://t.captcha.qq.com/cap_union_new_verify`
- **Cookie identical**: `TDC_itoken=<random>%3A<timestamp>`

### Sub-resource isolation: NOT the differentiator
- Built `scripts/subreq-isolation.js` to test each sub-resource fetch individually
- Result: errorCode 12 for ALL tests including the baseline (no extra fetches)
- Reason: **IP rate limiting** kicked in after ~20 requests during investigation

### IP rate limiting confirmed
- tls-experiment.js initially got errorCode 0 (3 consecutive runs, 4 successful tests)
- After ~20 total requests, ALL code paths (scraper, standalone, curl-impersonate) return errorCode 12
- errorCode 12 = IP/fingerprint reputation exhausted

### Revised understanding of errorCode -1
The scraper's persistent errorCode -1 (from before this investigation) is likely the SAME IP reputation scoring at a lower confidence level:
- **errorCode 0**: clean, pass
- **errorCode -1**: suspicious/low reputation (scraper's normal state — accumulated from prior test sessions)
- **errorCode 12**: high-confidence rejection (after exhausting IP with many requests)

### Key takeaway
**The standalone pipeline works.** When the IP reputation is clean, `tls-experiment.js` gets errorCode 0 using Node.js https (same modules as the scraper). This proves:
1. TLS fingerprint is NOT the issue
2. Collect token content is NOT the issue (Phase 58 + Phase 61)
3. POST body encoding is correct
4. Headers are correct
5. The flow works end-to-end

**The scraper's -1 is likely IP reputation**, not a code bug. Testing from a fresh IP would confirm this.

---

### Phase 63: Slim scraper — adopt the standalone-proven flow

> **Motivation**: `scripts/tls-experiment.js` gets errorCode 0 using the same Node.js modules as the scraper. It skips 4 sub-resource fetches and sends verify via `httpRequest()` directly instead of through `client.verify()`. Phase 63 rewrites `solveCaptcha()` to use this proven minimal flow, keeping the rest of the scraper (urlsec query, retry logic, CLI) intact.

| ID | Task | Status |
|----|------|--------|
| 63.1 | Rewrite `solveCaptcha()` to use standalone's minimal flow: drop sub-resource fetches, send verify via `httpRequest()` directly. Remove legacy vdata, caplog, vm-slide fetch. Delete 3 obsolete test files. | done |
| 63.2 | Tests: ensure `npm test` still passes; run `--captcha-only --verbose` and confirm errorCode. | done |

---

## Phase 63 Results (2026-04-18)

### 🟢 errorCode 0 — CAPTCHA solved on first attempt!

The slim scraper works end-to-end. The root cause of the persistent errorCode -1 (Phases 47–62) was the orchestration overhead in `solveCaptcha()` — extra sub-resource fetches and/or the `client.verify()` path. The proven minimal flow (prehandle → getSig → images → tdc → collect → vData → direct httpRequest verify) succeeds.

| Run | errorCode | Ticket | Template |
|-----|-----------|--------|----------|
| 1 | **0** | `t03tserverwO2F...` | 96 opcodes (auto-ported) |

---

## Archived Current Task (Phase 58.1)

**ID**: 58.1
**Title**: Build the collect corruption experiment script
**Phase**: Phase 58 — Controlled collect corruption experiment
**Status**: done

### Context (archived)

**Base flow to reuse**: `tools/captcha-solver/live-submit.js` already implements the full Puppeteer CAPTCHA flow:
1. Launch browser (steps 1–3: prehandle → show page → solve slider)
2. Extract XTEA params from live TDC (step 4–6: parse VM → map opcodes → extract key)
3. Capture Chrome's real collect token (step 7: TDC.getData)
4. Generate standalone collect (step 8: `generateCollect()`)
5. Build POST fields → run jQuery.ajax in Chrome for vData → capture body (step 9)
6. Submit via Chrome fetch() (step 10)
7. Parse errorCode (step 11)

**The experiment modifies step 8 only** — instead of always using `generateCollect()`, each test case substitutes a different collect value into the `postFields.collect` field before step 9.

**Five test cases**:
| ID | Name | Collect value | What it tests |
|----|------|--------------|---------------|
| A | baseline | Chrome's real TDC-generated collect (from step 7) | Control — expect errorCode 0 |
| B | garbled | Random base64 string, same length as A's collect | Does server parse collect structure at all? |
| C | empty | Empty string `""` | Is collect required? |
| D | scraper-collect | Our `generateCollect()` output using Chrome profile + live XTEA params | Is our collect generator the -1 cause? Isolates collect from all other scraper diffs |
| E | poisoned | Valid collect structure via `generateCollect()` but with poisoned cd fields: `userAgent="Bot/1.0"`, all coordinate fields `"0"`, all timestamp fields `"0"` | Does server score individual field values? |

**Each test case needs a fresh session** because each verify call consumes the session. The script runs 5 sequential full CAPTCHA solves (prehandle → show → solve → verify). This means 5 separate browser pages, but they can share the same browser instance.

**Key files to reference**:
- `tools/captcha-solver/live-submit.js` — the full flow to fork from (lines 1–1490)
- `tools/scraper/collect-generator.js` — `generateCollect()`, `buildDefaultCdArray()`, `generateBehavioralEvents()`
- `tools/token-generator/outer-pipeline.js` — `buildSdString()`, `buildCdString()`
- `tools/captcha-solver/captcha-client.js` — `CaptchaClient` class for prehandle/show
- `tools/captcha-solver/slide-solver.js` — `solveSlider()`
- `profiles/default.json` — Chrome fingerprint profile

**Important implementation details**:
- The `tlg` field must match the collect length (it's a length check): `tlg: String(collectVal.length)`
- vData is computed over the serialized POST body including collect — so each test case's vData will differ (correct behavior — vData is session-specific)
- For test E (poisoned), override specific cd array fields before passing to `generateCollect()` via profile overrides
- For test B (garbled), generate random base64: `crypto.randomBytes(N).toString('base64')` where N produces the same base64 length as the real collect
- Write results to `output/phase-58/collect-experiment.json` with per-test-case entries

### Implementation Steps
1. Create `scripts/collect-experiment.js` that:
   - Imports the same dependencies as `live-submit.js`
   - Defines 5 test case generators (functions that produce collect values given Chrome's collect and XTEA params)
   - For each test case, runs the full flow: launch page → navigate to captcha → solve slider → extract XTEA → generate the test-specific collect → build POST fields → vData via Chrome → submit via fetch → record result
   - Handles failures gracefully (template rotation may prevent some test cases from running — record the failure and continue)
   - Writes structured results to `output/phase-58/collect-experiment.json`
2. The result JSON should include for each test case: `{testId, testName, collectDescription, collectLength, errorCode, httpStatus, ticket, template, tdcName, timestamp, error?}`
3. Add `--headful` flag support for debugging

### Verification
- [ ] `node scripts/collect-experiment.js --headful` runs without crashing (may run only 1-2 test cases successfully due to rate limiting)
- [ ] Output file `output/phase-58/collect-experiment.json` exists and contains structured per-test-case results
- [ ] Test A (baseline with Chrome's real collect) returns errorCode 0 at least once
- [ ] Each test case's `tlg` field matches its collect length

### Suggested Agent
general-purpose — Puppeteer scripting, forking from live-submit.js
