# Plan

## Status
Current phase: **Phase 55** — Verify POST body fidelity + collect sid binding
Current task: **55.1** — Verify POST body byte-level diff

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
| 57.3 | Write tests for the new `generateBehavioralEvents()` that assert: correct event type sequence, timestamps are deltas (not absolute), first move uses screen coordinates, total drag dx ≈ xAnswer. | pending |
| 57.4 | Re-run audit (Puppeteer + scraper + collect-diff) and check errorCode. | pending |

---

## Current Task

**ID**: 57.2
**Title**: Rewrite generateBehavioralEvents() to match real browser schema
**Phase**: Phase 57 — Fix behavioral event format
**Status**: in-progress

### Goal
Rewrite `generateBehavioralEvents()` in `tools/scraper/collect-generator.js` so the output matches the schema documented in `output/phase-57/behavioral-event-schema.json`.

### Context
**Schema** (from 3 real Puppeteer captures, `output/phase-57/behavioral-event-schema.json`):
- 8-element tuples: `[type, dx, dy, timestamp, 0, 0, 0, 0]`
- Event[0] `type=4`: init, dx=-1, dy=-1, **absolute** epoch ms
- Event[1] `type=1`: cursor-to-handle, dx=159, dy=811 (absolute screen coords), ts=delta ms (1222–1513)
- Event[2] `type=2`: mousedown, dx=0, dy=0, ts=delta ms (167–201)
- Events[3..N-1] `type=1`: drag moves, dx=incremental (decelerating, total≈xAnswer), dy=[-1,2] jitter, ts=delta ms (30–84)
- Event[N] `type=3`: mouseup, dx=[-2,1], dy=[0,1], ts=delta ms (141–153)
- Total events: 21–22 (17–18 drag moves)
- Trailing fields [4-7] always zero

**Current bugs in the scraper's `generateBehavioralEvents()`** (line 228–278):
1. ALL timestamps are absolute epoch ms — should be delta ms for events[1+]
2. Sequence is init→drag→mousedown→jitter→mouseup — should be init→cursor→mousedown→drag→mouseup
3. No cursor-position event (event[1] with absolute screen coords)
4. No decelerating dx pattern (real data shows large dx early, small dx late)

**File to modify**: `tools/scraper/collect-generator.js`, function `generateBehavioralEvents` at line 228.

**Function signature**: `generateBehavioralEvents(xAnswer, slideY, timestamp)` — keep the same signature.

### Implementation Steps
1. Read `output/phase-57/behavioral-event-schema.json` for exact ranges
2. Rewrite the function body:
   - Event[0]: `[4, -1, -1, timestamp, 0, 0, 0, 0]` (absolute epoch — already correct)
   - Event[1]: `[1, 159, slideY || 811, randInt(1222,1513), 0, 0, 0, 0]` (cursor position, delta ms)
   - Event[2]: `[2, 0, 0, randInt(167,201), 0, 0, 0, 0]` (mousedown, delta ms)
   - Events[3..N-1]: type=1 drag moves. Generate 17–18 moves. dx values must: (a) sum to ≈xAnswer, (b) decelerate (large→small), (c) include small jitter. dy=randInt(-1,2). ts=randInt(30,84) delta ms.
   - Event[N]: `[3, randInt(-2,1), randInt(0,1), randInt(141,153), 0, 0, 0, 0]` (mouseup, delta ms)
3. Ensure the function still returns `Array<number[]>` (same shape)

### Verification
- [ ] `npm test` passes (all existing tests)
- [ ] Output matches schema: correct type sequence `4,1,2,1,...,1,3`
- [ ] Event[0] timestamp is absolute, events[1+] timestamps are small deltas (not epoch)
- [ ] Sum of drag dx values ≈ xAnswer (within ±5)
- [ ] 21–22 total events

### Suggested Agent
general-purpose — targeted function rewrite

---

## Old Current Task (archived)

**ID**: 55.1
**Title**: Verify POST body byte-level diff
**Phase**: Phase 55 — Verify POST body fidelity + collect sid binding
**Status**: pending

### Goal
Capture the exact verify POST bodies from both Puppeteer and scraper, then diff them field-by-field at the byte level. Identify any encoding differences that could cause server rejection.

### Context

**Scraper encoding**: uses `URLSearchParams.toString()` (Node.js built-in). This encodes:
- Spaces as `+`
- Non-unreserved chars as `%XX`
- Values via `encodeURIComponent()` internally

**Chrome/jQuery encoding**: uses `jQuery.param()` which:
- Encodes spaces as `+` (same)
- Does NOT encode `*` (jQuery quirk)
- May handle `=` in base64 differently

**Key suspect**: The `collect` field value contains base64 with `+`, `/`, `=` characters. `URLSearchParams` encodes `=` as `%3D`, `+` as `%2B`, `/` as `%2F`. jQuery's `$.param()` may preserve some of these or encode differently.

**Files**:
- Scraper body: built by `serializePostFields()` in `tools/scraper/scraper.js:62-69`
- Chrome body: built by `captcha-client.js` verify(), uses either jQuery prebuilt or manual `encodeURIComponent` fallback
- Puppeteer capture: can intercept via Chrome DevTools Protocol `Network.requestWillBeSent`

### Implementation Steps
1. Instrument Puppeteer's captcha-solver to capture the raw verify POST body bytes and write to `output/phase-55/puppeteer-verify-body.txt`
2. Instrument scraper to write its `serializedBody + '&vData=...'` to `output/phase-55/scraper-verify-body.txt`
3. Write `scripts/verify-body-diff.js` that:
   - Loads both body strings
   - Splits by `&`, then by `=` to get field/value pairs
   - Compares field order
   - For each field, compares encoding byte-by-byte
   - Highlights encoding differences (e.g., `%2B` vs `+`, `%3D` vs `=`)
4. Run and analyze

### Verification
- [ ] Both body captures exist
- [ ] Diff script produces clear field-by-field comparison
- [ ] Any encoding differences are documented

### Suggested Agent
general-purpose — instrumentation + diff scripting

### Goal
Fix `_generateCollectChrome` in `tools/scraper/scraper.js` so that non-hashPosition `-1` slots in the `cdFieldOrder` pass through the captured Chrome values from the profile's `cd` array, instead of being replaced with empty strings.

### Context

**The bug** is at lines 554-559 of `tools/scraper/scraper.js`:
```js
if (idx === -1) {
  if (i === hashPos) {
    cdArray.push(behavioralEvents);
  } else {
    cdArray.push('');  // ← BUG: should push cp.cd[i] instead
  }
}
```

The profile's `cd` array (template-ordered, 60 entries) has the real captured Chrome values at these positions. The fix is: `cdArray.push(cp.cd[i])` instead of `cdArray.push('')`.

**Affected fields** (5 of 6 `-1` slots):
- cd[7] = `"Intel Inc."` (webglVendor)
- cd[19] = `"Intel Iris OpenGL Engine"` (webglRenderer)
- cd[34] = `"unknown"` (unidentified field)
- cd[36] = WebGL canvas fingerprint (base64, ~1KB)
- cd[49] = `"7450533642822729728"` (session ID)

Only cd[28] is the real behavioral events slot (correctly handled by hashPosition logic).

**Note on `sid`**: cd[49] is a session-specific value. It should NOT be the stale captured value — it should be the current session's `sid` from `sig.sid` or `session.sid`. Consider substituting it per-session like timestamps are.

### Implementation Steps
1. Change `cdArray.push('')` to `cdArray.push(cp.cd[i])` for non-hashPosition -1 slots
2. Add per-session substitution for sid (cd[49]) using the live session's sid value
3. Run `npm test` to verify

### Verification
- [ ] `npm test` passes (530/530)
- [ ] Running collect-diff shows webglImage, webglRenderer, webglVendor, sid now present in scraper token

### Suggested Agent
general-purpose — targeted fix in _generateCollectChrome
