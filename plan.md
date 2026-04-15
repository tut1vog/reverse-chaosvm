# Plan

## Status
Current phase: **Phase 46** — Request-chain fidelity + TLS impersonation, errorCode 0 path (confirmed 2026-04-15)
Current task: **46.10** — TLS fingerprint impersonation research spike (HOLD DISPATCH — plan drafted 2026-04-15, awaiting user confirmation)

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
| 46.10 | **TLS impersonation — Puppeteer-reuse feasibility + integration design spike** (research subagent, no production code). **Approach pre-selected by user 2026-04-15**: option (c) from the original three-way matrix — reuse the in-repo Puppeteer install (already a dep of `tools/captcha-solver/`) as the TLS transport for the verify POST. Deliverable: (a) empirical JA3/JA4 capture from headless Puppeteer Chromium confirming it matches a real Chrome 146 fingerprint on the wire, (b) integration-design doc under `research/scraper-tls-impersonation/` covering browser-lifecycle strategy, verify-POST routing mechanism, header-order preservation, error / timeout handling, and the integration seam in `tools/captcha-solver/captcha-client.js`, (c) a single concrete recommendation for 46.12's implementation shape (e.g. long-lived shared page vs per-request, `page.evaluate(fetch(...))` vs CDP `Network.continueRequest`). | in-progress |
| 46.11 | **Design review gate** (director + user). Present 46.10's JA3 capture + integration design. User accepts, revises, or rejects. On accept → dispatch 46.12 (impl, subagent), 46.13 (tests, different subagent), 46.14 (director-owned live re-measurement with same protocol as 46.3 / 46.6). On reject → revisit alternative approaches (a)/(b) or pivot. | pending |

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

**ID**: 46.10
**Title**: TLS impersonation — Puppeteer-reuse feasibility + integration design spike
**Phase**: Phase 46 — Request-chain fidelity + TLS impersonation, errorCode 0 path
**Status**: HOLD DISPATCH — plan drafted 2026-04-15, approach pre-selected by user, awaiting user confirmation of the task spec below

### Goal
Produce enough empirical evidence and integration design to greenlight (or reject) a 46.12 implementation that routes the scraper's `cap_union_new_verify` POST through the already-installed headless Puppeteer / Chromium as the TLS layer. Deliverable is a research doc + captured fingerprint artifacts, not production code. After this task the director + user will decide in 46.11 whether to dispatch implementation.

### Context
- **Approach pre-selected by user decision 2026-04-15**: option (c) from the original three-way impersonation matrix — reuse the in-repo Puppeteer install as the TLS transport. Rationale is captured in the phase-46 "Decisions made at plan time" section (item 7). The three-way matrix is OFF the table for this spike; do not spend time surveying curl-impersonate binaries or Node native bindings.
- **Where we are in Phase 46**: 46.3 (restored `/vm-slide.enc.js` fetch) and 46.6 (added both `/caplog` beacons) each shipped offline-verified, each passed their live gate with 0/30 `t01`+`t02` tickets. The content layer is empirically exhausted. Remaining plausible lane gate: TLS fingerprint (header order is deferred as the weakest remaining axis).
- **What already exists in-repo that we are reusing**:
  - `tools/captcha-solver/` uses Puppeteer 24 with `puppeteer-extra-plugin-stealth`. `npm install` already wires this up; the captcha-solver CLI (`node tools/captcha-solver/cli.js --domain example.com`) exercises it live today. Read `tools/captcha-solver/cli.js` and `tools/captcha-solver/captcha-solver.js` first to confirm the launch flags, stealth plugin hookup, and whether a reusable `Browser` / `Page` is exposed.
  - `tools/captcha-solver/captcha-client.js` contains the verify POST builder (the construction seam that 46.12 would route through a different transport). Read around line 1007 (the current `https.request` call site) to understand the exact shape of the request object that needs to cross the Node↔Chromium boundary.
- **What headless vs headful Chromium may differ on**: headless Chromium historically shares the same Chrome networking stack as headful, so JA3/JA4 ought to match a real Chrome 146 ClientHello on the wire. But some build flags (`--headless=new` vs the old headless, `--disable-features=...`, stealth-plugin tweaks) can change TLS extension ordering or GREASE emission. The spike must verify empirically — do not assume.
- **Integration-design open questions** the deliverable must answer:
  1. **Browser lifecycle**: one long-lived `Browser` + one reusable `Page` kept alive across many scraper invocations, or spun up per invocation? Per-invocation is simpler to reason about but adds ~500–1500 ms per verify; shared is faster but introduces a global and a cleanup story.
  2. **Request routing mechanism**: `await page.evaluate(async (req) => fetch(req.url, {...})...)` (simple, preserves Chrome's TLS + HTTP stack, but `fetch` reorders headers — does Chrome's `fetch` preserve the HAR-observed Chrome header order?) vs `CDP Network.continueRequest` interception (lets us set headers in an explicit order but is a more complex setup) vs `page.setRequestInterception(true)` + a dummy navigation (hybrid). Pick one with a concrete justification.
  3. **Header-order preservation**: Chrome 146's verify POST header sequence is already pinned from HAR (see the 46.7 task body above in the Phase 46 table for the list). Does the chosen routing mechanism preserve that exact sequence on the wire? If not, document what order it produces and judge whether the difference is server-detectable.
  4. **User-Agent / navigator plumbing**: current scraper UA is `Chrome/146.0.0.0` (pinned in `tools/scraper/scraper.js:66`). When the verify POST rides through Puppeteer, the UA string in the HTTP headers must still match. Does `page.setUserAgent(ua)` also change the `sec-ch-ua` / client hints headers to match? If not, that is a gap to document.
  5. **Error handling**: what happens when the page crashes mid-request, when Chromium OOMs, when the verify returns a transport error vs an `errorCode 12` response? Implementation design must specify a fallback (retry on a fresh page, fall through to the current Node HTTPS path, hard-fail, etc).
  6. **Cookie isolation**: verify that the Puppeteer-routed POST does NOT inherit cookies from earlier pages in the same browser context (Phase 46 framing confirmed `t.captcha.qq.com` uses no cookies, so this is a safety check, not a feature).
  7. **Integration seam**: should 46.12 introduce a new `tools/captcha-solver/puppeteer-transport.js` module with a `async sendVerify(request): Response` interface that the existing `captcha-client.js` calls via a feature flag (`--via-puppeteer`, default off until 46.14 greenlights it)? Recommend exactly one shape for 46.12 to implement.
- **Research-artifact track**: this task creates a brand-new track `research/scraper-tls-impersonation/` per `.claude/rules/research-artifacts.md`. Track directory is source-only; captured fingerprint artifacts go under `output/scraper-tls/`.
- **Network access required**: the spike hits one public JA3-reporting endpoint. Candidates in preference order: `https://tls.peet.ws/api/all`, `https://tls.browserleaks.com/json`, `https://check.ja3.zone/`. If all three are unreachable from the sandbox, fall back to a cited reference from the curl-impersonate release notes for Chrome 146 and document the fallback. Do NOT hit `t.captcha.qq.com` from the spike — that endpoint is reserved for director-owned live surveys.

### Implementation Steps
1. **Read the seam first**. `tools/captcha-solver/cli.js`, `tools/captcha-solver/captcha-solver.js`, and `tools/captcha-solver/captcha-client.js` (focus on the verify POST construction near line 1007). Write down in the README what concrete request object shape crosses the boundary today (method, URL, header map, body).
2. **Create the track scaffolding**. `research/scraper-tls-impersonation/README.md` with the sections required by `.claude/rules/research-artifacts.md` (open question, status = partial, inputs, reproduction, findings placeholder). Note in the status section that the three-way matrix was collapsed by user decision on 2026-04-15.
3. **Capture Node scraper ClientHello** as a baseline. Small script at `research/scraper-tls-impersonation/capture-node-ja3.js` using Node built-ins only — an HTTPS GET to one of the JA3-reporting endpoints with the scraper's exact `DEFAULT_USER_AGENT`. Save raw response to `output/scraper-tls/node-default.json`. Extract and record JA3 + JA3_hash + JA4 + JA4_hash in the README.
4. **Capture headless Puppeteer ClientHello**. Small script at `research/scraper-tls-impersonation/capture-puppeteer-ja3.js` that launches headless Chromium via the existing `puppeteer` dep (reuse the same launch flags as `tools/captcha-solver/` if possible to stay consistent), navigates to the JA3-reporting endpoint, reads the JSON, closes the browser. Save raw response to `output/scraper-tls/chrome-puppeteer.json`. Extract JA3/JA4 hashes into the README.
5. **Diff the three** (Node baseline, Puppeteer capture, published Chrome 146 reference). Tabulate cipher suite ordering, GREASE presence, extension order, signature algorithms, ALPN. Expected outcome: Puppeteer ≈ Chrome 146, Node ≠ both. If Puppeteer diverges meaningfully from Chrome 146 on a detectable axis, that is a red flag the deliverable must surface prominently and 46.11 must see.
6. **Answer each of the seven integration-design open questions** from the Context section above, in their own subsection of the README. Concrete, specific answers — not "TBD". If an answer requires empirical confirmation (e.g. "does `page.evaluate(fetch)` preserve Chrome's header order on the wire?"), write the small script that confirms it and save the artifact under `output/scraper-tls/`. Questions whose answers depend on runtime verification must cite the artifact; questions answered from documentation must cite the doc URL.
7. **Produce a single recommendation** for 46.12 at the bottom of the README under `## Recommendation for 46.12`. Name the concrete module/file layout, the chosen routing mechanism, the browser-lifecycle strategy, and the feature-flag shape. 2–6 sentences. This is what 46.11 will accept, revise, or reject.
8. Leave `tools/`, `tests/`, and `package.json` untouched. No dependency additions. No production code changes.

### Verification
- [ ] `research/scraper-tls-impersonation/README.md` exists, follows the track template, and explicitly records that the three-way matrix was collapsed by user decision 2026-04-15.
- [ ] `research/scraper-tls-impersonation/capture-node-ja3.js` and `capture-puppeteer-ja3.js` exist as reproducible source.
- [ ] `output/scraper-tls/node-default.json` contains a real Node HTTPS JA3/JA4 capture.
- [ ] `output/scraper-tls/chrome-puppeteer.json` contains a real headless Puppeteer JA3/JA4 capture. (If Puppeteer cannot reach the JA3 endpoint from the sandbox, a cited published reference for Chrome 146 is the fallback — README must document which path was used.)
- [ ] README prints the three hashes side-by-side (Node baseline, Puppeteer, Chrome 146 reference) and states whether Puppeteer matches Chrome 146 empirically.
- [ ] README answers all seven integration-design open questions with concrete, specific answers. Empirical answers cite their `output/scraper-tls/*` artifact; documentation answers cite their URL.
- [ ] `## Recommendation for 46.12` section names exactly one integration shape: routing mechanism, browser lifecycle, feature-flag shape, target files.
- [ ] `git diff tools/ tests/ package.json package-lock.json` is empty at report time.
- [ ] `npm test` still 518/518 green (smoke check — no production code touched).

### Constraints
- **Approach is pre-selected**. Do NOT survey curl-impersonate or Node native bindings. Do NOT produce a three-way matrix. The user has already picked option (c).
- **No production code changes**. Writes are allowed only under `research/scraper-tls-impersonation/` (source) and `output/scraper-tls/` (artifacts).
- **No dependency additions**. `puppeteer` is already in `package.json`; use it. Capture scripts for the Node baseline use only Node built-ins.
- **No requests to `t.captcha.qq.com`** from the spike. That endpoint is reserved for director-owned live surveys (46.14).
- **`targets/` and `sample/` are read-only** per `.claude/rules/targets-readonly.md`.
- **If Puppeteer is not actually reusable on this box** (install broken, Chromium missing, sandbox blocks browser launch), stop and report — do not attempt a fix. That finding is itself the deliverable and will reopen the approach decision in 46.11.
- **If headless Puppeteer Chromium's JA3 diverges from real Chrome 146 in a detectable way**, surface that loudly in the README. The recommendation section must then either propose a mitigation (e.g. headful mode, specific launch flags) or flag the approach as blocked and ask 46.11 to reconsider.
- **Do not make any git commits.** The director handles all commits after verification.

### Suggested Agent
`general-purpose` — the task mixes reading existing Puppeteer integration code, running capture scripts (both Node HTTPS and headless Chromium), and technical writing (the README and design answers). No specialised agent fits better.
