# Plan

## Status
Current phase: **Phase 47** — Chrome-profile collect replay
Current task: **47.1** — Wire `profiles/chrome-fingerprint.json` into the scraper's collect generator

**Phases 38–46 closed.** Detail lives in `history/<YYYYMMDD>.md` and in the per-track docs under `docs/` + `research/`. Single-row summaries below.

---

## Phases

### Phase 38: Restructure (Stream A — blocking) — DONE
> Reorganize the repo around the research phase. Preserve git history via `git mv`, rewrite `require()` paths, keep `npm test` at 296/296 as the pass/fail gate.

| ID | Task | Status |
|----|------|--------|
| 38.1 | Restructure repo into research/ + tools/ layout (git mv + require rewrites + package.json + README) | done |
| 38.2 | Create placeholder README.md files for the 5 research tracks | done |
| 38.3 | Triage `scripts/` one-offs into research tracks or bench | done |
| 38.4 | Fix latent string-literal path misses from 38.1 (survey.js, diagnose.js) | done |
| 38.5 | Move the 5 previously-ambiguous scripts to their decided homes (user-confirmed 2026-04-12) | done |

### Phase 39: vm-slide stack VM (Stream B — Track 1) — DONE

| ID | Task | Status |
|----|------|--------|
| 39.1 | Implement vm-slide decoder + disassembler under `research/vm-slide-stack-vm/` | done |
| 39.2 | Write tests for vm-slide decoder + disassembler | done |
| 39.3 | Write `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` from source inspection | done |
| 39.4 | Write `docs/CHAOSVM_VARIANTS.md` — top-level register-vs-stack comparison | done |
| 39.5 | Update `project-brief.md` + refresh track README to `partial` | done |

### Phase 40: Phase-39 follow-ups + session cleanup — DONE

| ID | Task | Status |
|----|------|--------|
| 40.1 | Upgrade vm-slide disassembler with control-flow-aware walker | done |
| 40.2 | Tests for control-flow walker | done |
| 40.3 | Refresh `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` using full-coverage disassembly | done |
| 40.4 | Diagnose intermittent `tests/test-scraper-foundation.js → template-cache: lookup` flake | done |
| 40.5 | Resolve orphaned `tests/test-auto-port.js` | done |
| 40.6 | Cross-track XTEA investigation — CONFIRMED classical XTEA, encrypt pc 15241, decrypt pc 15416 | done |

### Phase 41: Captcha orchestrator (Stream B Track 2) — DONE

| ID | Task | Status |
|----|------|--------|
| 41.1 | Add `config.target` type guard to `TemplateCache.seed()` | done |
| 41.2 | Tests for the type guard | done |
| 41.3 | Clean up stale describe-block text at `tests/test-auto-port.js:358` | done |
| 41.4 | Captcha orchestrator survey — webpack module graph + candidate mapping | done |
| 41.5 | Captcha orchestrator deep analysis — end-to-end flow trace + 39-field origination | done |
| 41.6 | Write `docs/CAPTCHA_ORCHESTRATOR.md` | done |
| 41.7 | Bump `research/captcha-orchestrator/README.md` status + reproducibility | done |

### Phase 42: vData runtime binding reversal — DONE

| ID | Task | Status |
|----|------|--------|
| 42.1 | vm-slide vData static trace — `OP_04 OP_10* OP_13` anchors for `getVData`/`vData=`/`&vData=` | done |
| 42.2 | Cross-reference FLOW.md §6 + HAR + crypto provenance scan — mechanism resolved | done |
| 42.3 | Docs bookkeeping — `docs/CAPTCHA_ORCHESTRATOR.md` + `FLOW.md` §9 Q1 + README bumps + CLAUDE.md Project Memory | done |

### Phase 43: Standalone vData cipher encoder — DONE (2026-04-13)
> Shipped `tools/vdata-generator/` — pure-JS re-encoder (XTEA + custom 65-char base64) producing byte-identical 152-char vData from a 112-byte plaintext. Authoritative spec in `docs/VDATA_FORMAT.md`.

| ID | Task | Status |
|----|------|--------|
| 43.0–43.5 | Rename + hybrid extraction + fixtures + encoder + tests + docs | done |

### Phase 44: vm-slide plaintext fingerprint reversal — DONE (2026-04-15)
> Reversed the 8-field tdc runtime-state probe, pinned the pre-cipher transform chain, and shipped three-mode `tools/vdata-generator/`. 425/425 tests green.

| ID | Task | Status |
|----|------|--------|
| 44.1–44.7 | Stream A + Stream B + tests + docs | done |

### Phase 45: Scraper vData switchover + errorCode 12 re-test — DONE (2026-04-15)
> Swapped vData generation to standalone builder with HAR-derived profile. 30+30 A/B showed improvement (28.6% vs 0.0% success, p<0.05) but all successes were `t03tserver` bypass-lane tickets.

| ID | Task | Status |
|----|------|--------|
| 45.1–45.6 | Per-field source decisions + port + wiring + tests + live re-test | done |

### Phase 46: Request-chain fidelity + TLS impersonation — CLOSED (2026-04-16)
> Content-layer fixes (vm-slide fetch, caplog beacons) produced 0/60 t01/t02 tickets across two live surveys. TLS spike confirmed Puppeteer JA3 matches Chrome 146 exactly (JA3 `8061a5ed...`), but **live Puppeteer test** (5/5 errorCode 0) still produced only `t03tserver` tickets — proving **TLS is not the lane gate**. The `t03tserver` routing decision is upstream of TLS fingerprinting. New finding: the collect token content (fingerprint values) differs significantly between the scraper's jsdom-synthesized profile and real Chrome — this is the next hypothesis.

| ID | Task | Status |
|----|------|--------|
| 46.1 | Restore `/vm-slide.enc.js` live fetch on the default scraper path | done |
| 46.2 | Tests for 46.1 | done |
| 46.3 | Live re-measurement — 0/30 t01/t02 | done |
| 46.4 | Add `/caplog` telemetry beacons around verify | done |
| 46.5 | Tests for 46.4 | done |
| 46.6 | Live re-measurement — 0/30 t01/t02 | done |
| 46.7–46.9 | Header ordering — deferred | deferred |
| 46.10 | TLS impersonation spike — Puppeteer JA3 matches Chrome 146 | done |
| 46.11 | Design review — **pivoted**: Puppeteer live test showed TLS is not the lane gate. `t03tserver` persists even with real Chrome. New direction: Chrome-profile collect replay (Phase 47). | done |

---

### Phase 47: Chrome-profile collect replay

> **Framing** — Phase 46.11's live Puppeteer test (5/5 `errorCode: 0`, all `t03tserver`) proved that even with real Chrome's TLS stack, the verify endpoint still routes to the bypass lane. The `t03tserver` decision is not driven by TLS fingerprint, header order, or request-chain fidelity (all of which Puppeteer matches perfectly). The remaining hypothesis: **the collect token's fingerprint content** from the scraper's jsdom environment is detectably different from a real Chrome session.
>
> Evidence: the scraper's collect token was ~10K–19K chars while Chrome's is ~4.9K chars. Decryption revealed the plaintext structure is identical (`{cd:[60 fields], sd:{8 keys}}`), and both tokens round-trip byte-identically through the XTEA pipeline. The difference is in the cd field values: the scraper synthesizes them from a manually-constructed `profiles/default.json`, while Chrome populates them from real browser APIs. Of 60 cd fields, only 7 are per-session (timestamps, sid, eventLog, pageUrl); the other 53 are static fingerprint values that can be replayed from a Chrome capture.
>
> Phase 47's goal: make the scraper use real Chrome-captured fingerprint values for the collect token, then re-test to see if this changes the lane assignment.

**Goal**: scraper produces a `collect` token whose plaintext cd array matches a real Chrome session's values (except for the 7 per-session fields), and we re-test whether this moves us off `t03tserver`.

**Success metric**: any improvement in ticket prefix distribution (t01/t02 appearance) or errorCode distribution compared to the Phase 45.6 / 46.3 / 46.6 baselines.

| ID | Task | Status |
|----|------|--------|
| 47.1 | Wire `profiles/chrome-fingerprint.json` into the scraper's collect generator — load Chrome cd array, substitute per-session fields, encrypt with template-appropriate XTEA params in single-blob mode | done |
| 47.2 | Tests for 47.1 — Chrome-profile collect token round-trip verification | done |
| 47.3 | Live re-measurement (director-owned, 30 attempts) — compare ticket prefix distribution against Phase 46 baselines | done |

**Decisions**:
1. **Why not just use Puppeteer for everything?** The scraper's value is that it runs without a browser (jsdom only). Puppeteer is heavy, slow, and detectable in other ways. If Chrome-profile replay works, we keep the lightweight path.
2. **What about per-template field order?** The Chrome profile was captured from Template C. If the server serves a different template, the field order will differ. The scraper already handles this via `cdFieldOrder` from the porting pipeline. But the cd VALUES should be template-independent (they're browser fingerprint data, not template-specific). The scraper will use the Chrome profile values and reorder them per the served template's field order.
3. **What about the eventLog and slideValue?** These are per-session behavioral data. The scraper already generates synthetic mouse trajectories. The eventLog (cd[29]) needs realistic Chrome-style event entries — the current scraper may generate a different format. Task 47.1 should inspect and match the Chrome format.

---

### Phase 48: Session-level signal investigation

> **Framing** — Phases 45–47 eliminated all client-side payload differences (vData, collect content, TLS, beacons) without changing the lane assignment. The scraper gets `errorCode: -1` + `t03tserver` while real Chrome (both manual HAR and Puppeteer) gets `errorCode: 0` + `t03tserver`. Critically, even **Puppeteer** (real Chrome, real TLS, real JS execution) gets `errorCode: 0` but still `t03tserver` — so `t03tserver` may be the normal ticket for this appid. The actionable gap is `errorCode: -1` vs `errorCode: 0`.
>
> **Primary hypothesis**: the server tracks the request chain per `sess` token. A real browser session issues 11 requests in a specific order with specific timing; the scraper skips some (notably `tcaptcha-slide.js` and `slide-jy.js` fetches) and issues others in a different order/timing. The server observes these gaps and downgrades the session to `errorCode: -1`.
>
> **Secondary hypotheses** (lower priority, investigated only if request-chain completion doesn't help):
> - IP reputation: this IP has been hammering the endpoint for weeks
> - `sess` token contains pre-baked routing: the server decides the lane at prehandle time based on IP/history, and no subsequent behavior can change it
> - Puppeteer automation detection: `navigator.webdriver` or other automation signals leak into the collect token despite stealth plugin

**Goal**: identify which session-level signal(s) cause the scraper to get `errorCode: -1` instead of `errorCode: 0`, and fix them.

**Success metric**: scraper achieves `errorCode: 0` on at least some verify responses.

| ID | Task | Status |
|----|------|--------|
| 48.1 | Full request-chain diff — scraper vs HAR: instrument the scraper to log every outbound request, compare against HAR entry-by-entry, document all gaps | done |
| 48.2 | Complete the request chain — add `tcaptcha-slide.js` and `slide-jy.js` fetches at the correct positions with correct Referer/Sec-Fetch headers | pending |
| 48.3 | Tests for 48.2 | pending |
| 48.4 | Request timing — add realistic inter-request delays matching HAR timing profile (prehandle→show: ~100ms, show→images: ~50ms, images→tdc: ~200ms, etc.) | pending |
| 48.5 | Tests for 48.4 | pending |
| 48.6 | Live re-measurement (director-owned, 30 attempts) — compare errorCode distribution | pending |
| 48.7 | Decision gate: if 48.6 shows no improvement, investigate IP reputation (try from a different IP) or Puppeteer-only path | pending |

**Key findings from investigation**:
- HAR request chain (12 entries): prehandle → show → hycdn×2 → tdc.js → **tcaptcha-slide.js** → vm-slide.enc.js → **slide-jy.js** → caplog → verify → caplog → urlsec
- Scraper skips entries 6 (`tcaptcha-slide.29a33140.js` from `captcha.gtimg.com`) and 8 (`slide-jy.js` from `captcha.gtimg.com`). These are loaded from local `sample/` instead.
- Zero cookies in both HAR and scraper — cookies are not a differentiator.
- Prehandle response structure is identical (same keys, same extra/rainbow config).
- The `sess` token is opaque and server-generated — it may already encode routing at prehandle time.
- The Puppeteer result (`errorCode: 0` + `t03tserver`) proves the payload content is sufficient for errorCode 0 — the gap is in the request chain or session behavior, not the verify POST body.

---

## Current Task

**ID**: 48.2
**Title**: Complete the request chain — add missing fetches, fix headers, remove legacy getsig
**Phase**: Phase 48 — Session-level signal investigation
**Status**: pending

### Goal
Close the 5 HIGH-severity gaps found in 48.1 so the scraper's request chain matches a real Chrome 146 session: add `tcaptcha-slide.js` + `slide-jy.js` fetches, remove the legacy getsig 404 round-trip, fix vm-slide fetch headers, and fix caplog beacon headers.

### Context (from 48.1 findings — `output/phase-48-session-audit/request-chain-diff.md`)

**5 HIGH-severity gaps to fix:**
1. **Missing `tcaptcha-slide.js` fetch** (HAR entry 6): `GET captcha.gtimg.com/1/tcaptcha-slide.29a33140.js`. Must be fetched after `tdc.js` and before `vm-slide.enc.js`. The URL comes from the show page HTML (a `<script src="...">` tag). HAR shows no `Sec-Fetch-*` headers on this request.
2. **Missing `slide-jy.js` fetch** (HAR entry 8): `GET captcha.gtimg.com/1/slide-jy.js`. Must be fetched after `vm-slide.enc.js` and before the caplog beacon. The URL also comes from the show page HTML. HAR shows no `Sec-Fetch-*` headers.
3. **Extra `GET /cap_union_new_getsig` 404** (between entries 1 and 2): `captcha-client.js:369` tries legacy `_getSigLegacy()` first, gets 404, then falls back to `_getShowConfig()`. Real Chrome never hits this endpoint. Fix: make `getSig()` go directly to `_getShowConfig()`.
4. **`_getVmSlideSource` headers missing** (entry 7): `scraper.js:377` calls `httpRequest(url, { timeout: 10000 })` with NO headers. Must send `User-Agent`, `Referer` (show page URL), `Accept: */*`, `Sec-Fetch-Dest: script`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin`, `sec-ch-ua*`.
5. **`fireBeacon` headers wrong** (entries 9, 11): `caplog-beacon.js:162-177` sends `Accept: */*` and `Referer: https://t.captcha.qq.com/`. Must send `Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`, Referer = full show page URL, `Sec-Fetch-Dest: image`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin`, plus `sec-ch-ua*`.

**Files to edit:**
- `tools/captcha-solver/captcha-client.js` — remove legacy getsig path from `getSig()` (line 369-381)
- `tools/scraper/scraper.js` — add `tcaptcha-slide.js` and `slide-jy.js` fetches after tdc.js download and before caplog; fix `_getVmSlideSource` header arguments; pass show page URL to `fireBeacon`
- `tools/scraper/caplog-beacon.js` — update `fireBeacon` to accept and use show page URL as Referer, send correct Accept and Sec-Fetch headers

**Request chain after fix (must match HAR order):**
1. prehandle → 2. show → 3. hycdn bg → 4. hycdn slice → 5. tdc.js → 6. tcaptcha-slide.js → 7. vm-slide.enc.js → 8. slide-jy.js → 9. caplog pre → 10. verify POST → 11. caplog post → 12. urlsec

### Implementation Steps
1. In `captcha-client.js`, change `getSig()` to skip the legacy `_getSigLegacy()` attempt and go directly to `_getShowConfig()`.
2. In `scraper.js`, after `downloadTdc()` returns, parse the show page HTML (available via `sig._html`) to extract the `tcaptcha-slide.js` URL and `slide-jy.js` URL, then fire GET requests for both (fire-and-forget, discard bodies). Use appropriate headers matching HAR.
3. In `scraper.js`, update all `_getVmSlideSource` httpRequest calls to include the full `_headers()` set with `Sec-Fetch-Dest: script`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin`, `Referer: <show page URL>`.
4. In `caplog-beacon.js`, update `fireBeacon` signature to accept `referer` option, and fix the headers to send `Accept: image/avif,...`, correct Referer, and `Sec-Fetch-*`.
5. In `scraper.js`, pass the show page URL to `fireBeacon` calls.

### Verification
- [ ] `npm test` passes (all 425+ tests green)
- [ ] `node -e "const S = require('./tools/scraper/scraper'); const s = new S({verbose:true}); s.init().then(() => console.log('ok'))"` succeeds
- [ ] Reading the modified code confirms: no legacy getsig call, tcaptcha-slide.js + slide-jy.js fetches present, vm-slide headers fixed, caplog headers fixed

### Suggested Agent
`general-purpose` — HTTP client + scraper code edits
