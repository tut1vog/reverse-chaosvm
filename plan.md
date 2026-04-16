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

## Current Task

Phase 47 complete. No current task.

### Phase 47.3 Results — Chrome-profile collect survey (30 attempts, 2026-04-16)

| Metric | Phase 45.6 | Phase 46.3 | Phase 46.6 | **Phase 47.3** |
|--------|-----------|-----------|-----------|--------------|
| Total | 30 | 30 | 30 | **30** |
| Success (rc=0) | ~9 | ~10 | ~10 | **10** |
| t01/t02 tickets | 0 | 0 | 0 | **0** |
| t03 tickets | ~9 | ~10 | ~10 | **10** |
| errorCode 12 | ~10 | ~10 | ~10 | **11** |

**Conclusion**: Chrome-profile collect replay produced **no change** in ticket prefix distribution. All 10 successful tickets remain `t03tserver`. The `t03tserver` routing decision is not driven by the collect token's fingerprint content (field values or token size). The ~5K Chrome-profile token behaves identically to the ~10K synthetic token from the server's perspective.
