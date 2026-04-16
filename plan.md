# Plan

## Status
Current phase: **Phase 46** — Request-chain fidelity + TLS impersonation, errorCode 0 path (confirmed 2026-04-15)
Current task: **46.11** — Design review gate (awaiting user decision on 46.10 findings)

**Phases 38–45 closed.** Detail lives in `history/<YYYYMMDD>.md` and in the per-track docs under `docs/` + `research/`. Single-row summaries below.

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
> Reversed the 8-field tdc runtime-state probe (`{tp,key,py,env,version,cLod,inf,ss}`) inside fn 22317 = `module.exports.getCaptchaData`, pinned the pre-cipher transform chain (pad fn 13989 → ShiftRows fn 14153 → XTEA fn 13860), and shipped three-mode `tools/vdata-generator/` (cipher-only, replay-with-substitution, from-obj synthesis). Per-call order is driven by fn 23898's `Math.random() > 0.5 ? -1 : 1` comparator (classical Fisher-Yates anti-pattern). Authoritative spec: `docs/VDATA_FORMAT.md` §1+§7. Call-chain: `docs/CAPTCHA_ORCHESTRATOR.md` §6. Deliverable: `tools/vdata-generator/{build-plaintext,replay,build-from-obj}.js` + `tests/test-vdata-builder.js` (14 tests), 425/425 npm test green.

| ID | Task | Status |
|----|------|--------|
| 44.1–44.4 | Stream A: callsite back-walk, static decompile, orchestrator trace, per-field source pin, pre-cipher transform chain | done |
| 44.0.1 / 44.4.1 / 44.4.5 / 44.2.5 / 44.2.6 / 44.2.7 / 44.2.8 | Discovery corrections: bytecode-build reconciliation (`34e2…` seed vs `2e43…` runtime key), sort-order = `Math.random` comparator, `getCaptchaData` invocation site, fn 20539 slot 8 hop, fn 22317 as live producer | done |
| 44.5a / 44.5b | Stream B: replay-with-substitution + from-obj synthesis + seeded PRNG | done |
| 44.6 | Tests (14 new, different agent) | done |
| 44.7 | Docs closeout: `VDATA_FORMAT.md` §1+§7, `CAPTCHA_ORCHESTRATOR.md` §6, CLAUDE.md project memory | done |
| 44.3.5 | Real-Chrome differential capture (optional) | deferred |

### Phase 45: Scraper vData switchover + errorCode 12 re-test — DONE (2026-04-15)
> Swapped the scraper's default vData generation from live jsdom (leaked `tp`/`cLod`/`inf`/`ss` as jsdom tells) to standalone `buildVDataForPost` + HAR-derived `profiles/vdata-browser-default.json`; legacy jsdom path retained behind `--legacy-vdata`. 30+30 A/B from IP `111.119.253.170`: default 28.6% success vs legacy 0.0%; default 61.9% errorCode 12 vs legacy 94.4%. Two-proportion z-tests significant at p<0.05 on both metrics — verdict **(a) improved**. Follow-up analysis revealed every default-path "success" was a `t03tserver` bypass-lane ticket (`errorCode: -1`), never a `t01`/`t02` full-verify ticket (`errorCode: 0`); this finding motivates Phase 46. `docs/ERRORCODE_12_INVESTIGATION.md` updated; raw logs under `output/phase-45-errorcode-12-survey/`.

| ID | Task | Status |
|----|------|--------|
| 45.1 / 45.1a | Per-field source decisions + module 18 body-parser decompile (HAR oracle `obj.key="21L2"` reproduced) | done |
| 45.2 / 45.3 | Port `computeKeyField` + `buildVDataForPost` entry point; 37 black-box tests (462/462 green) | done |
| 45.4 / 45.5 | Scraper wiring swap behind `--legacy-vdata`; 44 offline tests proving default vs legacy divergence (506/506 green) | done |
| 45.6 | Empirical errorCode 12 re-test (director-owned, live network) — verdict (a) improved, p<0.05 | done |

---

### Phase 46: Request-chain fidelity + TLS impersonation, errorCode 0 path (confirmed 2026-04-15)

> **Framing** — Phase 45.6 surfaced the real picture: every "success" the scraper got was a `t03tserver...` ticket issued with `errorCode: -1`, which is Tencent's **bypass / pity-ticket lane**, not the full-verification lane. A real browser gets `t01...` / `t02...` tickets with `errorCode: 0`. The two lanes use different routing decisions at the verify endpoint, and everything we optimised in Phase 45 (vData plaintext content) moved us within the bypass lane only — it never put us on the `errorCode 0` path because we were never knocking on that door.
>
> Wire-level diff of the scraper's verify POST against `sample/captcha-har.har` (see 2026-04-15 conversation log): all 17 header **values** match Chrome 146, HTTP/1.1 matches, `Connection: keep-alive` matches (Node's `https.globalAgent` defaults to `keepAlive=true`), the POST body matches byte-for-byte (Phase 45.5 locked this down), and Tencent's `t.captcha.qq.com` doesn't use cookies at all — both sides send an empty Cookie header. What actually differs is **request-chain fidelity** (which JS files and telemetry beacons the IP fetched before and after verify), **header insertion order**, and **TLS fingerprint (JA3/JA4)**.
>
> Phase 46's goal is to close these gaps in order of estimated impact, with a live-network re-measurement after each content fix, and decide whether to commit to TLS impersonation based on whether the content-layer fixes alone are enough to flip at least one attempt from `errorCode -1` / `t03tserver` to `errorCode 0` / `t01`. This is a lane-change phase, not a rate-improvement phase — the primary success metric is the ticket prefix, not the success percentage.

**Goal**: obtain at least one `errorCode: 0` response with a `t01...` / `t02...` ticket from the scraper, from the same IP we've been running from, without resorting to Puppeteer.

**Success metric (primary)**: any single invocation returning `errorCode: 0`. Secondary: the distribution of ticket prefixes (`t01` / `t02` / `t03tserver`) across a 30-attempt survey compared to the Phase 45.6 default-arm baseline (0 × `t01`, 0 × `t02`, 6 × `t03tserver`, 15 × non-success).

**Abort / pivot conditions**:
- If 46.3, 46.6, and 46.9 all show zero `t01`/`t02` tickets in their post-fix surveys, the remaining gate is almost certainly TLS/JA3. At that point the director will pause, present the evidence to the user, and ask whether to (i) commit to the TLS spike in 46.10/46.11, (ii) declare the content-layer exhausted and close Phase 46 with the gate documented, or (iii) pivot to a Puppeteer-based path.
- If any earlier task produces `errorCode: 0`, pause immediately and present — we will want to freeze the state, capture a fixture, and decide whether to keep going for rate improvement or declare victory.

| ID | Task | Status |
|----|------|--------|
| 46.1 | Restore `/vm-slide.enc.js` live fetch on the default scraper path | done |
| 46.2 | Tests for 46.1 — wire-level vm-slide-fetch invariant locked offline (3 new tests, 509/509 green) | done |
| 46.3 | Live re-measurement after 46.1 — 0/30 t01/t02 (null result; vm-slide alone does not move the lane) | done |
| 46.4 | Add `/caplog` telemetry beacons around verify — caplog-beacon.js + solveCaptcha wiring + `--skip-caplog` flag (byte-for-byte HAR match) | done |
| 46.5 | Tests for 46.4 — 9 tests locking PRE_KEYS / POST_KEYS sequences + ordering + skipCaplog suppression (518/518) | done |
| 46.6 | Live re-measurement after 46.4 — 0/30 t01/t02 (null result; caplog does not move the lane). **Decision gate fired — awaiting user decision.** | done |
| 46.7 | Chrome-canonical verify header ordering — **deferred 2026-04-15** per user decision after the 46.6 gate. Content-layer is empirically exhausted (two null results in 46.3 and 46.6), header order is the weakest remaining fingerprint axis, so jump straight to the TLS spike. May be revisited if 46.10/46.11 land without lane change. | deferred |
| 46.8 | Tests for 46.7 — **deferred 2026-04-15** (paired with 46.7). | deferred |
| 46.9 | Live re-measurement after 46.7 — **deferred 2026-04-15** (paired with 46.7). | deferred |
| 46.10 | TLS impersonation — Puppeteer-reuse feasibility + integration design spike | done |
| 46.11 | Design review gate — present 46.10 findings for user decision | in-progress |

**Decisions made at plan time**:
1. **Why fix in this order and not parallel?** Each fix is a hypothesis test against the same endpoint. Running them in parallel would conflate which fix flipped which outcome. The live re-measurement gates (46.3, 46.6, 46.9) are how we learn.
2. **Why director-owned surveys, not subagent?** Same reason as Phase 45.6 — live network traffic with reputational cost, and the inspection work is small enough that a subagent's context overhead isn't justified.
3. **Why no tests for 46.10?** It's research, not code. If 46.11 greenlights implementation, tests get dispatched as follow-up tasks at that point.
4. **Impl/tests separation**: 46.1/46.2, 46.4/46.5, 46.12/46.13 are paired with different agents per project rule.
7. **Why pre-select Puppeteer reuse (option c) without running the three-way matrix?** User decision 2026-04-15 after the 46.6 decision gate. Rationale: Puppeteer is already an in-repo dependency (`tools/captcha-solver/` runs it live today), so the install-cost and maintenance-risk columns of the original matrix are zero for option (c) and unambiguously worse for (a) curl-impersonate binary and (b) Node native binding. Headless Chromium shares the networking stack with headful Chrome, so JA3/JA4 match is expected by construction — the spike still captures it empirically to avoid surprises (some headless builds disable GREASE or strip extensions). Runtime cost per request is the only dimension where (c) is meaningfully worse than (a)/(b), and the scraper's target rate is low enough that a few hundred ms of browser-side latency per verify is acceptable. Collapsing the original three-way matrix into "verify (c) empirically + design the integration" cuts the spike's scope roughly in half.
5. **Abort protocol**: each live-measurement task (46.3, 46.6, 46.9) inherits Phase 45.6's abort rule — if the first 5 invocations return non-errorCode-12 / non-errorCode-0 failures (transport errors, 403s, 500s), stop and report.
6. **Auto-port failures**: the 45.6 survey showed two new tdc.js template hashes the porting pipeline cannot map. These will reduce N_valid in every live survey this phase. If the failure rate exceeds ~50% on any arm, the director will pause and ask whether to extend the porting pipeline first — that would be a separate phase (47?).

**Open questions deferred out of Phase 46**:
- Rate/session saturation around attempt ~12 (the Phase 45.6 follow-up hypothesis). Phase 46 assumes surveys are short enough that saturation is a background constant affecting both pre- and post-fix runs equally. If we ever see a fix that flips a bunch of attempts on attempts 1–10 but nothing on 11–30, saturation becomes foreground again.
- Template pool extension. The auto-port failures on `88ebeea62f566ec5` / `f53142c54fc43699` point at a real gap in `tools/porting-pipeline/template-cache.json` but fixing it is out of scope here.

---

## Current Task

**ID**: 46.11
**Title**: Design review gate — present 46.10 findings for user decision
**Phase**: Phase 46 — Request-chain fidelity + TLS impersonation, errorCode 0 path
**Status**: in-progress — awaiting user review

### Goal
Present the 46.10 TLS impersonation spike findings and integration design to the user. User accepts → dispatch 46.12 (implementation) + 46.13 (tests). User revises → update plan accordingly. User rejects → revisit alternatives or pivot.

### 46.10 Findings Summary
- **Puppeteer JA3 matches Chrome 146 exactly**: `8061a5edbfa5eab7663a5e5aff0118ab`. Node.js is trivially distinguishable (`0cce74b0...`, 59 cipher suites, no GREASE, HTTP/1.1 only). No red flags.
- **Recommended routing**: `page.evaluate(fetch(...))` from a page navigated to `t.captcha.qq.com` origin. Empirically confirmed: same-origin fetch produces correct Origin, Referer, Sec-Fetch-* headers. Chrome's H2 HPACK handles header order by construction.
- **Browser lifecycle**: one long-lived `Browser` + one reusable `Page` across the 30-attempt survey run. Re-launch on crash, limit to 1 retry.
- **Integration seam**: new `tools/captcha-solver/puppeteer-transport.js` with `sendVerify({url, method, headers, body}) → {statusCode, headers, body}`. Conditional in `captcha-client.js` verify method, gated behind `--chrome-tls` / `usePuppeteerTransport` flag.
- **Files for 46.12**: (1) new `puppeteer-transport.js`, (2) edit `captcha-client.js`, (3) edit `captcha-solver/cli.js`, (4) edit `scraper/cli.js`.
- Full detail: `research/scraper-tls-impersonation/README.md`

### Decision required
Accept, revise, or reject the integration design before dispatching 46.12.
