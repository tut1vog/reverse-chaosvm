# Plan

## Status
Current phase: **Phase 46** — Request-chain fidelity + TLS impersonation, errorCode 0 path (confirmed 2026-04-15)
Current task: 46.2 — Tests for 46.1 (pending dispatch)

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
| 46.2 | **Tests for 46.1** (different agent). Lock the wire-level invariant that both `legacyVdata=false` and `legacyVdata=true` issue at least one GET to a URL matching `/vm-slide(\.[^/]+)?\.enc\.js` per `solveCaptcha()`, via a local HTTP server that the scraper is pointed at (through a URL-rewriting test double or a globally-mocked `httpRequest`). Assert that the default path does NOT skip this request. One regression-oriented test file under `tests/`. `npm test` must stay green. | pending |
| 46.3 | **Live re-measurement after 46.1** (director-owned, live network). 30 atomic default-path invocations from the same IP, same protocol as 45.6 (`--captcha-only --retries 1`, no gap, single arm). Record ticket prefix per attempt and bucket errorCode outcomes. Compare to the 45.6 default-arm baseline and to the Phase 45.6 gap1s follow-up. The primary question is **whether any attempt flips from `t03tserver` to `t01` or `t02`**. Log to `output/phase-46-errorcode-0/46.3-after-vmslide.{log,jsonl}`. Writes a short verdict block in `docs/ERRORCODE_12_INVESTIGATION.md` and appends a passed/failed entry to `history/<YYYYMMDD>.md`. | pending |
| 46.4 | **Add `/caplog` telemetry beacons around verify.** Real browser sends a `/caplog?appid=20128&1=0&2=0&3=0&4=0&5=<ts>&6=<ts>&...` GET between tdc.js load and verify, and a second `/caplog?appid=20128&27=<slide_dx>&29=&31=<num>&32=0&...` GET AFTER verify. HAR entries 7 and 9 (see `sample/captcha-har.har`). Both are fire-and-forget — the response doesn't affect the scraper's state machine. Implementation goal: port the two beacon URL shapes from HAR (field-by-field table in the task's Context when dispatched), emit the pre-verify beacon after step 4 (downloadTdc) and before step 8 (verify), emit the post-verify beacon after step 8 regardless of errorCode. Use sensible placeholder values for fields we cannot synthesize (e.g. timer fields get `Date.now()` and recent deltas). Keep both beacons under a `--skip-caplog` escape hatch for isolation during 46.6 and for the existing offline tests. | pending |
| 46.5 | **Tests for 46.4** (different agent). Assert both beacons fire in the correct sequence relative to verify, assert the URL shape matches the HAR-derived template (parameter names and ordering, not values), assert `--skip-caplog` suppresses both. Use the same local-HTTP-server / httpRequest-mock approach as 46.2. | pending |
| 46.6 | **Live re-measurement after 46.4** (director-owned, live network). Same protocol as 46.3. Primary question: any `t01`/`t02` ticket. Log to `output/phase-46-errorcode-0/46.6-after-caplog.{log,jsonl}`. Verdict block appended to `docs/ERRORCODE_12_INVESTIGATION.md`. **Decision gate**: if 46.3 AND 46.6 both return zero `t01`/`t02`, the director pauses here and asks the user whether to proceed with 46.7 or jump straight to the TLS spike in 46.10. | pending |
| 46.7 | **Reorder verify headers to match Chrome's canonical sequence.** Chrome 146 emits verify POST headers in the order: `Host → Connection → Content-Length → sec-ch-ua → X-Requested-With → sec-ch-ua-mobile → User-Agent → sec-ch-ua-platform → Content-Type → Accept → Origin → Sec-Fetch-Site → Sec-Fetch-Mode → Sec-Fetch-Dest → Referer → Accept-Encoding → Accept-Language` (derived from HAR). Node's `http.request` emits headers in JS-object-insertion order, so this is reachable without monkey-patching: the fix is to rebuild the headers object at `tools/captcha-solver/captcha-client.js:1007` in the exact Chrome order, explicitly setting `Host` and `Connection` too (Node will normally auto-insert them, but it places them in its own slots — passing them in `headers` with the right ordering overrides that). If JS object property iteration turns out to be non-deterministic for our case (it isn't in modern V8, but confirm), fall back to writing the HTTP request via a raw socket through `net.Socket` / `tls.connect`. Only the `cap_union_new_verify` request matters for this phase — do not touch the header order of prehandle / show / hycdn (we don't have a canonical order for them and they aren't what the server scores). | pending |
| 46.8 | **Tests for 46.7** (different agent). Capture the actual outbound header sequence using a `https.request` monkey-patch in a test harness (same technique as the 2026-04-15 `/tmp/intercept.js` spike), assert the sequence matches Chrome's canonical order byte-for-byte for `/cap_union_new_verify`. Do not assert header order for other endpoints — they're out of scope. | pending |
| 46.9 | **Live re-measurement after 46.7** (director-owned, live network). Same protocol as 46.3 / 46.6. Primary question: any `t01`/`t02` ticket. Log to `output/phase-46-errorcode-0/46.9-after-header-order.{log,jsonl}`. **Decision gate**: if still zero `t01`/`t02`, the director pauses and presents the full gap ladder + options for the TLS spike. | pending |
| 46.10 | **TLS fingerprint impersonation — research spike** (director + possibly research subagent). NOT an implementation task yet. Evaluate three options: (a) wrap the `curl-impersonate` binary (`curl_chrome116`) as a subprocess and pipe the verify POST through it — simplest, least integration; (b) use a Node binding like `node-curl-impersonate` or `undici` with a custom `Dispatcher` that uses a TLS context built to match Chrome's JA3/JA4; (c) hand-roll a TLS ClientHello via `tls.connect` with overridden cipher list, extensions, GREASE, and ALPN. Produce `research/scraper-tls-impersonation/README.md` summarizing the three options, Node + OpenSSL version compatibility, observed JA3 of Node's default HTTPS stack (via live test against `ja3er.com` or equivalent), and a recommendation. No code changes to `tools/` in this task. | pending |
| 46.11 | **Decision point** (director + user). Present the 46.10 spike findings to the user. Decide one of: (i) commit to implementing the recommended TLS option as tasks 46.12/46.13/46.14, (ii) close Phase 46 with the content-layer fixes shipped and the TLS gate documented, (iii) pivot to a Puppeteer-based `scraper` variant as a separate phase. This task explicitly pauses for user input before any further work. | pending |

**Decisions made at plan time**:
1. **Why fix in this order and not parallel?** Each fix is a hypothesis test against the same endpoint. Running them in parallel would conflate which fix flipped which outcome. The live re-measurement gates (46.3, 46.6, 46.9) are how we learn.
2. **Why director-owned surveys, not subagent?** Same reason as Phase 45.6 — live network traffic with reputational cost, and the inspection work is small enough that a subagent's context overhead isn't justified.
3. **Why no tests for 46.10?** It's research, not code. If 46.11 greenlights implementation, tests get dispatched as follow-up tasks at that point.
4. **Impl/tests separation**: 46.1/46.2, 46.4/46.5, 46.7/46.8 are paired with different agents per project rule.
5. **Abort protocol**: each live-measurement task (46.3, 46.6, 46.9) inherits Phase 45.6's abort rule — if the first 5 invocations return non-errorCode-12 / non-errorCode-0 failures (transport errors, 403s, 500s), stop and report.
6. **Auto-port failures**: the 45.6 survey showed two new tdc.js template hashes the porting pipeline cannot map. These will reduce N_valid in every live survey this phase. If the failure rate exceeds ~50% on any arm, the director will pause and ask whether to extend the porting pipeline first — that would be a separate phase (47?).

**Open questions deferred out of Phase 46**:
- Rate/session saturation around attempt ~12 (the Phase 45.6 follow-up hypothesis). Phase 46 assumes surveys are short enough that saturation is a background constant affecting both pre- and post-fix runs equally. If we ever see a fix that flips a bunch of attempts on attempts 1–10 but nothing on 11–30, saturation becomes foreground again.
- Template pool extension. The auto-port failures on `88ebeea62f566ec5` / `f53142c54fc43699` point at a real gap in `tools/porting-pipeline/template-cache.json` but fixing it is out of scope here.

---

## Current Task

**ID**: 46.2
**Title**: Tests for 46.1 — default path must issue a vm-slide GET
**Phase**: Phase 46 — Request-chain fidelity + TLS impersonation, errorCode 0 path
**Status**: pending dispatch

### Goal
Lock in a regression test that proves both `legacyVdata=false` (default) and `legacyVdata=true` (legacy) scraper paths issue at least one GET to a URL matching `/vm-slide(\.[^/]+)?\.enc\.js` during a single `solveCaptcha()` invocation. This is the wire-level invariant that task 46.1 just restored; without a test it will quietly regress the next time someone is tempted to "optimize" the default path.

### Context
- **Task 46.1 just landed**: `tools/scraper/scraper.js` now unconditionally calls `this._getVmSlideSource(sig)` in the step-(k) block (~lines 571–576). Both paths must trigger the fetch.
- **Fetch strategies** live in `_getVmSlideSource` (~lines 310–410 in `tools/scraper/scraper.js`). It tries three strategies in order: (1) extract the URL from the show-page HTML and fetch it; (2) extract from the config URL; (3) fallback path. The URL pattern we want to assert against is `/vm-slide(\.[^/]+)?\.enc\.js` — the hash segment is optional because the hashed filename can change build-to-build.
- **Existing mocking patterns**: search `tests/` for other tests that exercise `Scraper` end-to-end against a local HTTP server or against a mocked `httpRequest`. Candidates to look at for the established pattern:
  - `tests/test-scraper-foundation.js`
  - `tests/test-scraper-vdata-switchover.js` (Phase 45.4/45.5 offline tests — most relevant; they already bypass live network)
  - any helper under `tests/helpers/` or `tests/fixtures/` that stubs `https.request` or stands up a loopback server
  The reuse rule: prefer extending the existing stubbing helper over inventing a new one. Read the existing helpers first and match their shape.
- **Two legitimate approaches**:
  1. **Local HTTP server** that the scraper is pointed at via a URL-rewriting layer or environment variable. Record received request URLs and assert on them.
  2. **Monkey-patch `httpRequest`** (or whatever wrapper the scraper uses — check `tools/scraper/scraper.js` imports) to record call URLs and return canned responses. This is the lighter-weight approach and matches what the 45.5 offline tests already do.
  Pick whichever fits the existing test harness. Do not invent a third approach.
- **What to assert**: that the recorded request list contains at least one GET whose URL matches `/vm-slide(\.[^/]+)?\.enc\.js` — for BOTH `new Scraper({ legacyVdata: false })` AND `new Scraper({ legacyVdata: true })`. Two tests, one per flag. Ideally share a helper that runs a single `solveCaptcha()` under the mock and returns the recorded request list.
- **Anti-goal**: do not assert on response bodies, vData content, or the final verify outcome. Scope is narrowly the wire-level "did we issue the vm-slide GET" invariant. Keep the canned responses minimal — just enough for `solveCaptcha()` to progress far enough that the step-(k) fetch happens. If the existing 45.5 offline tests already drive the scraper through step (k), extend them rather than building new canned responses from scratch.
- **File location**: one new file under `tests/`, named to match project convention (e.g. `tests/test-scraper-vm-slide-fetch.js` or whatever matches neighbouring file naming). Use `node --test` — check another test file for the exact import shape (`const { test } = require('node:test');` etc.).
- **targets/** and **sample/** remain read-only.

### Implementation Steps
1. Read `tools/scraper/scraper.js` to identify how HTTPS requests are made (`httpRequest` helper? direct `https.request`? something in `tools/scraper/` shared module?). Find the seam where the test can record requests without touching the network.
2. Read `tests/test-scraper-vdata-switchover.js` (and any other offline scraper tests) to learn the existing mock pattern and canned-response shape. Reuse it.
3. Read `tests/test-scraper-foundation.js` if you need a simpler template.
4. Create the new test file. Structure:
   - one shared helper that constructs a `Scraper`, runs `solveCaptcha()` against the mock, and returns the list of recorded request URLs
   - test A: default path (`legacyVdata: false`) → assert the URL list contains a match for `/vm-slide(\.[^/]+)?\.enc\.js`
   - test B: legacy path (`legacyVdata: true`) → same assertion
5. Run `node --test tests/test-scraper-vm-slide-fetch.js` (or whatever you named it) and confirm both tests pass.
6. Run `npm test` end-to-end and confirm the whole suite stays green. Expected count is 506 + however many tests you added (2 minimum). Report the final `# tests` / `# pass` / `# fail` counts.
7. Do NOT commit. The director commits after verification.

### Verification
- [ ] New test file exists under `tests/` and is picked up by `npm test` (no manual wiring needed — node --test auto-discovers).
- [ ] At least 2 new tests, one asserting the default path issues the vm-slide GET, one asserting the legacy path issues it.
- [ ] URL match uses a regex tolerant of optional build-hash segments: `/vm-slide(\.[^/]+)?\.enc\.js`.
- [ ] Test assertions are meaningful: they fail if the step-(k) call is reverted to the `if (this.legacyVdata)` gate. (Manually confirm by temporarily re-gating and re-running — the default-path test must go red. Revert the file change before reporting.)
- [ ] `npm test` passes 508/508 (or whatever 506 + N_new_tests adds up to). No pre-existing tests regress.
- [ ] No changes outside `tests/` except optional reuse of an existing test helper.

### Constraints
- **Do not make any git commits.** The director handles all commits after verification.
- **Different agent from 46.1** per impl/tests separation rule. Approach the scraper code as a consumer, not as the author.
- **Do not modify `tools/scraper/scraper.js`** or any other production code. This is a tests-only task.
- **Do not make any live network requests from the test.** Everything must run offline.
- **Do not add new npm dependencies.** Use Node built-ins (`node:http`, `node:test`, `node:assert`) and whatever helpers already exist under `tests/`.
- **Follow `.claude/rules/coding-style.md`**: CommonJS, 2-space indent, single quotes, semicolons, `const`/`let`, camelCase.
- **Follow `.claude/rules/verify-dont-assume.md`**: confirm the meaningful-failure check in the verification list — don't just trust that the test fails when broken.
- **If the task is too difficult or impossible to complete**, stop immediately and report back with what you tried and why it's blocked. Do not leave partial or broken tests.

### Suggested Agent
**general-purpose** — tests task, no specialized agent needed. Must be a different agent instance than the one that did 46.1 (the project rule is instance-level independence, not agent-type).
