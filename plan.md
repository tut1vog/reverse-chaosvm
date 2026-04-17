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
| 48.2 | Complete the request chain — add missing fetches, fix headers, remove legacy getsig | done |
| 48.3 | Tests for 48.2 | done |
| 48.4 | Request timing — add realistic inter-request delays matching HAR timing profile | deferred |
| 48.5 | Tests for 48.4 | deferred |
| 48.6 | Live re-measurement (director-owned, 30 attempts) — compare errorCode distribution | done |
| 48.6.1 | TLS fingerprint rotation + errorCode 12 investigation | done |
| 48.7 | Decision gate — closed, pivoted to Phase 49 | done |

**Key findings from investigation**:
- HAR request chain (12 entries): prehandle → show → hycdn×2 → tdc.js → **tcaptcha-slide.js** → vm-slide.enc.js → **slide-jy.js** → caplog → verify → caplog → urlsec
- Scraper skips entries 6 (`tcaptcha-slide.29a33140.js` from `captcha.gtimg.com`) and 8 (`slide-jy.js` from `captcha.gtimg.com`). These are loaded from local `sample/` instead.
- Zero cookies in both HAR and scraper — cookies are not a differentiator.
- Prehandle response structure is identical (same keys, same extra/rainbow config).
- The `sess` token is opaque and server-generated — it may already encode routing at prehandle time.
- **errorCode 12 = pure IP rate limit** (frequency-based, ~3 attempts per time window). Not TLS-fingerprint-differentiated — tested with 14 distinct JA3 hashes via curl-impersonate + Node.js cipher permutations; all profiles exhausted simultaneously. User confirmed: triggering errorCode 9 too frequently on a real browser also produces errorCode 12.
- **errorCode -1 is the real signal gap**: scraper always gets -1, Puppeteer always gets 0. Both get `t03tserver` tickets. The -1 vs 0 difference is in the **verify POST body content** (collect token, vData, behavioral data), not in HTTP transport, TLS, headers, or request chain.
- `t03tserver` may simply be the normal ticket prefix for this appid — even Puppeteer with real Chrome gets it.

---

### Phase 49: errorCode -1 root cause — verify POST body diff

> **Framing** — Phase 48 narrowed the problem: errorCode 12 is pure IP rate limiting (solved by backing off). The real gap is **errorCode -1** (scraper) vs **errorCode 0** (Puppeteer). Both get `t03tserver` tickets. The difference must be in the verify POST body content — something the server inspects in the collect token, vData, behavioral data, or field relationships that the scraper gets wrong.
>
> **Approach**: capture the exact verify POST body from both Puppeteer (ec=0) and the scraper (ec=-1), decrypt both collect tokens and both vData payloads, and diff field-by-field to identify what the scraper produces differently.

**Goal**: identify which field(s) in the verify POST body cause the server to return errorCode -1 instead of 0, and fix them.

**Success metric**: scraper achieves errorCode 0 on verify responses.

| ID | Task | Status |
|----|------|--------|
| 49.1 | Write POST body diff script — reconstruct scraper's Chrome-profile verify POST body (collect + vData + all fields) without live network, compare against committed Puppeteer capture, save diff to `output/phase-49-body-diff/` | done |
| 49.2 | Fix scraper collect+sd to match Puppeteer: coordinate ratio, detectedFonts, per-session hash randomization, chrome profile refresh | done |
| 49.3 | Tests for 49.2 — verify chrome profile values + coordinate ratio + diff script | done |
| 49.4 | Live re-measurement (director-owned) — null result: 0/5 errorCode 0 | done |

---

## Current Task

**ID**: 49.4
**Title**: Live re-measurement — null result
**Phase**: Phase 49 — errorCode -1 root cause
**Status**: done

### Result
5/5 errorCode -1 (plus 1 errorCode 12 rate-limit). Profile + coordinate fixes did NOT change the errorCode. The root cause is NOT in the collect token's static fingerprint values or sd.coordinate ratio.

### Remaining hypotheses (priority order)
1. **vData content mismatch** — the standalone vData generator builds from a static profile; the real vm-slide computes live values. Fields like `tp` (JS runtime error string), `ss` (TDC lifecycle state), `py` (orchestrator argument) may differ.
2. **Behavioral events quality** — synthetic mouse trajectories may be statistically distinguishable from real ones.
3. **Collect token encryption keyMods** — the live Template C build (`gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR`, 100 opcodes) may use different keyMod constants than what the auto-porting pipeline extracts.
4. **Session-level server decision** — the server may decide errorCode at prehandle time based on IP/history, making the verify body content irrelevant.

### Decision gate
Profile/coordinate fixes are preserved (they're correct regardless). Phase 49 closes as a **partial result** — 49.2 fixes were valid improvements, but errorCode -1 persists. Need user input on next direction.
