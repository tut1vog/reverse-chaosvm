# Plan

## Status
Current phase: Phase 44 — vm-slide fingerprint schema + JS vData builder (rescoped 2026-04-15 post-44.2.7, user-approved)
Current task: 44.2.8 — fn 20539 inner slot 8 → fn 13860 hop identity + per-run order source (hard-stop 2h)

**Phase 43 closed 2026-04-13** in dispatch order 43.0 ✅ → 43.1 ✅ → 43.2 ✅ → 43.3 ✅ → 43.4 ✅ → 43.5 ✅. Cipher half of vm-slide's vData is now byte-identical reproducible via `tools/vdata-generator/` against both jsdom and real Chrome 146 HAR fixtures.

**Phase 44 dispatch order** (user-confirmed 2026-04-13, 9-task variant): 44.1 → 44.2 → 44.3 → **44.3.5** → 44.4 → **44.5a → 44.5b** → 44.6 → 44.7. User picked all three director recommendations: real-Chrome differential capture as a third fixture (44.3.5), per-run order resolution treated as required (44.4 is blocking, not optional), and the 44.5 builder split into replay-with-substitution (44.5a, ships first) plus full-synthesis (44.5b, depends on 44.4). Stream A (44.1-44.4) is discovery — pins the field schema. Stream B (44.5a-44.7) is the deliverable.

**Dispatch policy for Phase 44**: the user has explicitly asked the director NOT to auto-continue into 44.1 after this plan revision. The director will Orient and present a "ready to dispatch 44.1?" prompt on the next user message; dispatch only fires when the user explicitly says go. Phase 43 narrowed on 2026-04-13 to the cipher half of the vData pipeline only — the plaintext-fingerprint half moved to the new Phase 44 track per user Option C. The generator ships as a pure re-encoder that consumes a plaintext byte buffer and emits the 152-char vData string byte-for-byte; Phase 44 will reverse the fingerprint build separately if/when the user wants it.

**Phase 43 recommendation (user-confirmed 2026-04-13)**: use the existing `tools/scraper/vdata-harness.js` jsdom harness as the dynamic oracle for test-time validation. Puppeteer live capture via `tools/captcha-solver/live-submit.js` kept as an optional tail-validation vector in 43.4.

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

### Phase 43: Standalone vData cipher encoder (narrowed 2026-04-13, in progress)
> Ship `tools/vdata-generator/` — a standalone white-box reimplementation of the **cipher half** of vm-slide's vData pipeline: XTEA encrypt + standard base64 (custom 65-char alphabet, index 64 = padding). Consumes a pre-computed 112-byte plaintext and emits the 152-char vData string byte-for-byte. Does NOT produce new vData from scratch — it is a pure encoder. The plaintext-fingerprint half moved to Phase 44 per user Option C (2026-04-13).

> **Established facts** (43.1 + 43.2): XTEA key `2e430f8c15b7da96` (16 ASCII bytes, bytecode constant). Classical XTEA, 32 rounds, delta `0x9E3779B9`, little-endian uint32 packing. Pipeline = 14 × 8-byte XTEA blocks (= 112 bytes) → 152 chars of standard base64 with custom alphabet `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` (length 65, index 64 `Y` = padding char, RFC 4648 role of `=`). 112 bytes need 2 padding chars → every vData ends in `YY`. **Correction from 43.1**: there is NO `10 40` trailer — that was a mis-decoding of the `YY` padding as raw 6-bit values (`(64<<6)|64 = 0x1040`). Real encoder is standard base64 with `isNaN`-guarded padding at bytecode pcs 17084..17418. Verified by 43.2 against both jsdom and HAR reference vectors, byte-for-byte both directions.

| ID | Task | Status |
|----|------|--------|
| 43.0 | Rename `tools/scraper/vdata-generator.js` → `tools/scraper/vdata-harness.js` + update all imports (director-owned) | done |
| 43.1 | Hybrid static+dynamic XTEA/plaintext extraction via jsdom harness instrumentation + Phase 40 walker cross-check | done |
| 43.2 | Freeze deterministic jsdom + HAR fixtures under `tests/fixtures/`; re-verify custom base64 alphabet length directly from `output/vm-slide/bytecode.json` at pc 16932 | done |
| 43.3 | Standalone cipher encoder `tools/vdata-generator/{xtea.js, custom-base64.js, encode.js, cli.js}` — pure JS, no jsdom/vm-slide dep, byte-identical against both fixtures | done |
| 43.4 | Tests for the encoder (different agent per impl/tests separation) — byte-identical assertions against both fixtures + unit tests for XTEA and custom base64 | done |
| 43.5 | Docs — new `docs/VDATA_FORMAT.md` (authoritative byte-level spec), update `docs/CAPTCHA_ORCHESTRATOR.md` §6, track README + CLAUDE.md Documentation table bumps (director-owned) | done |

### Phase 44: vm-slide plaintext fingerprint reversal (planned 2026-04-13, awaiting user dispatch trigger)
> Reverse the JS-environment fingerprint builder inside vm-slide's `proxyXHR` body so that vData can be generated end-to-end from scratch (combining with the Phase 43 cipher encoder). Two streams: **Stream A (44.1-44.4)** is discovery — pin the field schema. **Stream B (44.5a-44.7)** is the deliverable — standalone plaintext builder + tests + docs.

> **Established facts (Phase 43.1, 43.2)**:
> - Plaintext is exactly 112 bytes. Always.
> - Structure: 8 `key=value` pairs joined by `&` (exactly 8 `=`, exactly 7 `&`).
> - Per-run byte order varies; per-run character multiset is invariant. Three independent jsdom runs against `{a:'1'}`, `{foo:'bar'}`, and the full HAR field set all produced the same multiset → the plaintext is **independent of the verify POST field set**.
> - jsdom multiset and real-Chrome HAR multiset have the same shape (8`=`/7`&`) but different content (jsdom has spaces/parens/apostrophes; HAR has digits/`k`s) → the plaintext is a **runtime fingerprint that diverges between environments**, not a constant.
> - Encrypt closure entry pc **15241**; created at pc 15404 by `OP_58 15241 0 2 3 4`. Captured live by `research/vm-slide-stack-vm/vdata-dynamic-trace.js`. Each run produces exactly 14 encrypt calls (= 14 × 8 = 112 bytes).
> - The encrypt closure is reached via the module-export table — not invoked inline at the FUNC_CREATE site. Caller path is opaque to static analysis without back-walking.

> **Open questions (Phase 44 owns)**:
> 1. Which 8 fields exist? What are their names?
> 2. What value-source rule does each field follow? (`typeof`, property read, object stringification, `Function.toString()`, ...)
> 3. What governs the per-run byte-order variability? (memory-iteration order vs internal salt vs both)
> 4. Why is the multiset invariant if the order is not? (engineered constants vs derived from a fixed environment)
> 5. Why exactly 112 bytes? (engineered field widths, padding, truncation?)

> **Starting inputs**: `output/vm-slide/bytecode.json` (24,273 elements), `output/vm-slide/disassembly-full.txt` (Phase 40.1 walker output), `research/vm-slide-stack-vm/{walker,decoder,disassembler}.js`, `research/vm-slide-stack-vm/vdata-dynamic-trace.js` (live oracle), `tests/fixtures/vdata-{jsdom,har}-capture.json` (ground truth — both fixtures contain the captured 112-byte plaintext for cross-checking decompile hypotheses).

| ID | Task | Status |
|----|------|--------|
| 44.1 | Encrypt-callsite back-walk + plaintext-build call graph (static + runtime caller-PC capture) | done |
| 44.2 | Plaintext-build static decompile to pseudocode — `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md` | done |
| 44.2.5 | fn 20539 full static decompile — settle pivot premise → verdict **(A) pure encrypt stage**, orchestrator builds plaintext | done |
| 44.3 | Orchestrator plaintext-build JS-level trace — static-fallback deliverable; inverted Phase 44 model (orchestrator builds 39-field 9504-byte body; vm-slide reduces it to the 112-byte XTEA input; `&vData=` literal at pcs 24211..24223 lives in fn 22317, not fn 20539) | done |
| 44.2.6 | **fn 22317 full static decompile + reconciliation with fn 20539** — decompile fn 22317 body `[22317, 24233]` end-to-end → fn 22317 = **`exports.getCaptchaData`** (pure function at pc 24252 store to exports), NOT a send replacement; 8-key schema **hardcoded** `[tp,key,py,env,version,cLod,inf,ss]` sorted alphabetically at pc 23949; NO 9504→112 reduction exists; fn 20539 classified **(IV) dead code** on Chrome path | done |
| 44.4 | **Per-field value-source pin + pre-cipher transform check** — outcome (2) garbled; module 40 resolved as padder (fn 13989 PKCS#7-style) → ShiftRows permuter (fn 14153, `PERM=[0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11]`) → XTEA; 3 helpers decompiled (fn 22400=tp, fn 22730=key-prep, fn 23399=ss); 5 fields inline; `FINGERPRINT-SCHEMA.md` + `build-fingerprint-plaintext.js` byte-identical both fixtures | done |
| 44.0.1 | **[2026-04-15]** Bytecode build reconciliation — verdict **(A) with nuance**: `sample/vm_slide.js` IS the fixture-generating build; both keys real and from same build. `34e2c8f07b5169ad` is the bytecode-literal **pre-cipher seed** pushed at pcs 13931 and 15149 into fn 13860; `2e430f8c15b7da96` is the **runtime** XTEA round key observed in the encrypt closure's local 4 after fn 13860's prologue transform. No re-decode needed; all Phase 44 pc anchors stand. See `research/vm-slide-stack-vm/BUILD-RECONCILE.md`. | done |
| 44.4.1 | **[2026-04-15]** Sort-order contradiction resolution — verdict **(ii) randomised comparator**: fn 23898 body `[23898..23944]` is `Math.random() > 0.5 ? 1 : -1` (textbook JS Fisher-Yates anti-pattern). Sort call site at pc 23949 confirmed exactly where 44.2.6 reported it; only the comparator's nature was misread. Fixture orders are random draws, not derivable from `obj` alone. `build-fingerprint-plaintext.js` updated: `order` is now optional, defaults to `Object.keys(obj)`. Both committed fixtures byte-identical without caller-supplied `order`. See `research/vm-slide-stack-vm/SORT-ORDER-RESOLUTION.md`. **Implication for 44.5b**: no canonical default join order exists — from-scratch synthesis must either accept a pre-ordered obj or seed its own RNG. | done |
| 44.4.5 | **[2026-04-15]** Orchestrator `getCaptchaData` invocation site — **verdict: premise disproven**. `sample/t_captcha_slide.js` contains ZERO `getCaptchaData`/`CaptchaData`/`chaos` occurrences. Only vData code path is an `isLowIE()`-gated IIFE at bytes 162929..163108 calling `window.getVData` (Phase 42's IE9 path). Runtime callgraph `output/vm-slide/vdata-callgraph.json` shows 14/14 encrypt calls pass through fn 15918 — fn 22317 is not in the live trace. **Implications**: 44.2.6's "fn 22317 is live `getCaptchaData`" and "fn 20539 is dead code" classifications are both wrong on the Chrome path; Phase 42's XHR-monkey-patch mechanism stands; 44.4.1's `Math.random()` comparator finding is in a function that isn't called at runtime. See `research/captcha-orchestrator/GETCAPTCHADATA-CALLSITE.md`. | done (partial, premise-disproving) |
| 44.2.8 | **[NEW — revision 2026-04-15 post-44.2.7]** fn 20539 inner slot 8 → fn 13860 hop identity + per-run order source. Pin the exact FUNC_CREATE stored in fn 20140's slot 3 (fn 20539's inner slot 8) that calls fn 13860 directly with `(body, {py})`. Narrow walk of fn 20843 (proxyXHR submodule factory). Also pin where the per-run field ordering of the 8-field kv string comes from (upstream of fn 13860 — V8 enumeration order / insertion order / explicit shuffle / other). **Hard stop at 2 hours**: if static walking doesn't resolve, return a partial note naming the opaque pc and recommend a dynamic trace. Blocking 44.5b. | pending |
| 44.4.1 | **[2026-04-15 — RETIRED post-44.2.7]** fn 23898 Math.random comparator — confirmed unreached on the Chrome path (entered 15× with `(string:3, string:2)` as a DOM helper, per `output/vm-slide/fn-20539-entry-trace.json`). Finding stands for fn 22317's code but that subtree is not live. No further action. | retired |
| 44.2.7 | **[2026-04-15]** fn 20539 full end-to-end decompile + real plaintext-build pin — runtime-validated. fn 20539 FUNC_CREATE pc 20797 confirmed; install onto `XHR.prototype.send` at pc 20808 (`OP_24`); sibling `.open` wrapper fn 20353 installed at pc 20473 is the shared-guard writer that records `this` when `.open("/cap_union_new_verify")` is called. fn 20539 is a pure gate+forward: receives the full 9345-byte form-encoded POST body as `arguments[0]`, calls an intermediate function (slot 8 → fn 13860) with `(body, {py})`, receives back the rewritten body, passes it to `savedSend.call`. Injection is body-append: final 9504 = 9345 + `&vData=` + 152-char base64. `ancestor_chains` in `vdata-callgraph.json` are a tracer artifact (host-JS transitions collapsed into VM ticks), NOT a real call stack — 44.4.5's chain reading was wrong on that point. **8-field schema pinned LIVE** from a runtime capture of fn 13860's 110-byte first arg: `env=1&key=qLCZ&version=2&cLod=unloadTDC&ss=0%2C&tp=<captured JS error>&py=0&inf=top`. Field set `{env,key,version,cLod,ss,tp,py,inf}` matches the 44.2.6 names — but it is a **tdc runtime-state probe**, not a navigator/screen fingerprint (`tp` is a captured JS error message; `inf` is iframe-position; `cLod` is a lifecycle marker). Runtime XTEA key = the bytecode literal `34e2c8f07b5169ad`, not the `2e430f8c15b7da96` runtime-key claim from Phase 42 — reconciliation still owed to 44.5a. **Unresolved**: the exact FUNC_CREATE stored in fn 20140's slot 3 (fn 20539's inner slot 8) that directly calls fn 13860. Deliverables: `research/vm-slide-stack-vm/FN-20539-DECOMPILE-44.2.7.md`, `research/vm-slide-stack-vm/trace-fn20539-entry.js`, `output/vm-slide/fn-20539-entry-trace.json`. | done |
| 44.3.5 | **[NARROWED post-44.2.7]** Real-Chrome differential capture — third fixture from production Chrome; capture target = the 9345-byte pre-injection POST body + the 9504-byte post-injection body + the 152-char vData string. No longer needed for schema discovery (44.2.7 pinned it live); now a cross-environment shape cross-check — confirm the 8-field tdc-state-probe schema survives the jsdom → real Chrome transition, and confirm the `tp` field carries a different (real-Chrome) JS error than jsdom's `"Cannot read properties of null (reading 'src')"`. | pending |
| 44.5a | Replay-with-substitution builder. Reads a captured fingerprint object (8 properties) + override map; emits a substituted `obj`; calls into 44.5b's builder. Trivial wrapper after 44.5b lands. | pending |
| 44.5b | **From-scratch `build-vdata.js --from-obj`**. Input: an 8-property fingerprint object JSON. Output: 152-char vData string. Pure JS: replicates fn 22317's alphabetical sort + key=value join, then calls the Phase 43 encoder. Deterministic, no runtime env probing. Depends on 44.4. | pending |
| 44.6 | Tests for the vData builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' vData strings end-to-end from an `(obj, body)` pair (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | **[EXPANDED post-44.2.7]** Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the 8-field tdc-runtime-state-probe schema (`env, key, version, cLod, ss, tp, py, inf`) + source-rule table + the fn 20539 `proxyXHR` XHR-send-handler entry-point narrative (body-rewrite injection via `savedSend.call` at pc 20751, final 9504 = 9345 + `&vData=` + 152). **Correct `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 + §517** to restore Phase 42's XHR monkey-patch mechanism (fn 20539 installed at pc 20808 onto `XHR.prototype.send`, fn 20353 installed at pc 20473 onto `XHR.prototype.open` as the shared-guard writer) and remove 44.2.6's fn 22317 `getCaptchaData` misattribution + the 44.3-introduced 9504→112 reduction hypothesis. **Reconcile the runtime XTEA key** — document that the bytecode literal seed `34e2c8f07b5169ad` is ALSO the runtime key observed live (contradicting Phase 42/CLAUDE.md's `2e430f8c15b7da96` claim; fold the reconciliation owed by 44.5a into this task). Mark Phase 44 closed; bump CLAUDE.md Project Memory to record the full pipeline + corrected key story. | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

> **Plan revision 2026-04-15 (user-approved, in progress)**: 44.4 surfaced two facts that warranted insertion of **44.0.1** (bytecode build reconciliation — done, verdict A+nuance) and **44.4.1** (sort-order contradiction resolution — done, verdict: randomised comparator). Current dispatch order: ~~44.0.1~~ → ~~44.4.1~~ → **44.4.5** → 44.3.5 → 44.5a → 44.5b → 44.6 → 44.7. 44.4.1's outcome has a downstream implication: 44.5b cannot have a canonical default join order — from-scratch synthesis must either accept a pre-ordered obj or seed its own RNG (to be reflected in 44.5b's task spec when drafted).

---

> **Plan revision 2026-04-15 (minimal-change, user-approved)**: 44.4.5 disproved 44.2.6's premise that fn 22317 is the live Chrome `getCaptchaData` producer. The orchestrator `sample/t_captcha_slide.js` contains zero references to `getCaptchaData`; the only vData code path is an `isLowIE()`-gated IIFE calling `window.getVData`; runtime callgraph shows 14/14 encrypt calls pass through fn 15918, one frame below fn 20539 (the `proxyXHR` XHR monkey-patch, FUNC_CREATE at pc 20797). 44.2.6's reclassification of fn 20539 as dead code was wrong. **Minimal-change response**: insert **44.2.7** (fn 20539 full decompile) as the only structural change and dispatch it next. The rest of the Phase 44 task list (44.3.5 → 44.5a → 44.5b → 44.6 → 44.7) stays as drafted; it will be re-examined against 44.2.7's findings when they land. This avoids re-planning on top of unverified assumptions a second time.

> **Mental-model status post-44.4.5** (what 44.2.7 must settle or leave standing): (1) Phase 42's XHR-patch mechanism on Chrome appears to stand — 44.2.7 should confirm fn 20539 is the live producer; (2) fn 22317 is an internal/reserved vm-slide export not called on the observed Chrome path; (3) 44.4.1's `Math.random()` comparator is in fn 23898, only referenced by fn 22317 — unreached at runtime; real per-run order source is inside fn 20539's subtree; (4) `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` is still byte-identical to both fixtures, so the padder + ShiftRows + XTEA + base64 pipeline shape is correct — 44.2.6 got the pipeline right, just attached it to the wrong function. 44.2.7's job is to move the attach point from fn 22317 to the real producer in fn 20539's subtree.

---

## Current Task

**ID**: 44.2.8
**Title**: fn 20539 inner slot 8 → fn 13860 hop identity + per-run order source
**Phase**: Phase 44 — vm-slide fingerprint schema + JS vData builder
**Status**: pending — ready for dispatch on next user trigger (director holding per user instruction).

### Goal
Close the last open hop in 44.2.7's runtime-validated call chain by pinning the exact FUNC_CREATE stored in fn 20140's slot 3 — the function that fn 20539 reads as its inner slot 8 and invokes with `(body, {py})` to obtain the rewritten body. 44.2.7 confirmed the call happens and that the callee eventually reaches fn 13860 with a 110-byte pre-pad plaintext, but the intermediate function's identity is still opaque. **Also** pin where the per-run ordering of the 8-field kv string comes from — the order divergence between the jsdom fixture (`[inf,env,tp,key,py,ss,cLod,version]`) and the HAR fixture (`[inf,env,tp,cLod,version,key,ss,py]`) is driven by something upstream of fn 13860 that 44.2.7 did not pin. This is the last discovery needed before 44.5b can produce byte-identical vData from an 8-property object.

### Context (from 44.2.7, runtime-validated)
- **Install anchors**: fn 20140 is the proxyXHR installer. Inside its body, it creates fn 20353 (FUNC_CREATE ~pc 20464) and installs it onto `XHR.prototype.open` via `OP_24` at pc 20473. It also creates fn 20539 (FUNC_CREATE at pc 20797, `OP_58 20539 3 1 7 6 8 3`) and installs it onto `XHR.prototype.send` via `OP_24` at pc 20808. fn 20353 is the shared-guard writer (records `this` when `.open("/cap_union_new_verify")` is called, into fn 20140's slot-6 cell, which fn 20539 reads as its inner slot 7).
- **The open hop**: fn 20539's inner slot 8 holds a function that it calls with `(body, {py})` and whose return value replaces `body` before `savedSend.call(this, body)`. 44.2.7 proved at runtime that this function's subtree reaches fn 13860 with a 110-byte `env=1&key=qLCZ&version=2&cLod=unloadTDC&ss=0%2C&tp=<captured JS error>&py=0&inf=top` — i.e. the kv-string builder + fn 13860 call live inside (or behind) this slot-8 hop. The exact FUNC_CREATE for slot 8 was not statically pinned. 44.2.7's §7 ("Unresolved hop") named fn 20843 — the proxyXHR submodule factory — as the most likely walk target because that's where fn 20140's slot 3 should be written.
- **Likely shape**: either (a) slot 8 IS fn 13860 (`encryptData`) directly, receiving `(body, {py})` and projecting to its 110-byte working buffer from closure-captured state (requires fn 13860's prologue to build the kv string itself), or (b) slot 8 is a thin wrapper that builds the kv string, calls fn 13860, and returns the rewritten body. Runtime entry counts in `output/vm-slide/fn-20539-entry-trace.json` can disambiguate: if fn 13860 enters 1× per send and some other small function also enters 1× per send, candidate (b); if only fn 13860 enters, candidate (a). Both candidates constrain where the kv string is built.
- **Per-run order source**: neither 44.4.1 (fn 23898 `Math.random()` — retired as unreached) nor 44.2.7 pinned the real mechanism. Candidates: (i) V8 property-enumeration order varying between jsdom and Chrome; (ii) insertion order controlled by the builder's statement sequence; (iii) a separate `Math.random()`/counter-backed shuffle inside slot 8's subtree; (iv) fn 13860's prologue shuffling. Whichever it is, it lives in the same code region as the slot-8 hop, so this task resolves both in one walk.
- **Pre-pad plaintext is 110 bytes, post-pad is 112.** The PKCS#7-style padder (fn 13989) + ShiftRows-style permuter (fn 14153) live inside fn 13860's chain and were already pinned by 44.4 — do not re-walk them.
- **Reference artifacts** (read, do not modify):
  - `research/vm-slide-stack-vm/FN-20539-DECOMPILE-44.2.7.md` — the walk you are continuing. §7 names the exact unresolved question.
  - `output/vm-slide/fn-20539-entry-trace.json` — runtime entry counts and first-call args for every closure entry in one jsdom run. Read `all_entry_counts` to identify which functions enter 1× per send (candidates for the slot-8 hop).
  - `output/vm-slide/bytecode.json`, `output/vm-slide/disassembly-full.txt` — ground truth.
  - `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` — 8-field names and semantics (runtime-validated by 44.2.7).
  - `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` — known-correct replay tool; oracle for testing hypotheses. Do NOT modify.
  - `research/vm-slide-stack-vm/trace-fn20539-entry.js` — 44.2.7's tracer. Extend it (or add a sibling tracer) if static walking leaves gaps.

### Starting inputs
- `research/vm-slide-stack-vm/FN-20539-DECOMPILE-44.2.7.md` (read §3, §5, §7 end-to-end first).
- `output/vm-slide/fn-20539-entry-trace.json` (`all_entry_counts`, `fn_20539_first_args`, `fn_15918_first_args`).
- `output/vm-slide/bytecode.json`, `output/vm-slide/disassembly-full.txt`.
- fn 20140's body range and its slot-write sequence (the `OP_36 STORE_LOCAL_REF` that writes slot 3) — 44.2.7 did not cite this directly; find it.
- fn 20843 (proxyXHR submodule factory per 44.2.7 §7) — walk if it turns out to be the parent.

### Implementation Steps
1. **Locate fn 20140's body range and slot-3 write.** fn 20140 is the parent of both fn 20353 (`.open` wrapper) and fn 20539 (`.send` wrapper). Find its FUNC_CREATE pc; find the `OP_36 STORE_LOCAL_REF ... 3` inside its body that writes slot 3 with a FUNC_CREATE or a `__webpack_require__` return. Cite the pc. If the write is a `__webpack_require__` call, resolve the requested module id to a FUNC_CREATE via `output/vm-slide/window-installs.json` or the webpack module table.
2. **Resolve the slot-3 FUNC_CREATE.** Whatever function is written into fn 20140's slot 3, that is fn 20539's inner slot 8. Identify its FUNC_CREATE pc and body range. If it's fn 13860 itself, note that and jump to step 4. If it's a wrapper, walk it in step 3.
3. **If a wrapper, walk it end-to-end.** Pseudocode with every pc cited. Identify (a) how it reads its two args `(body, {py})`, (b) where it builds the kv string (look for `OP_04`+`OP_10` string pushes of field names `env`, `key`, `version`, `cLod`, `ss`, `tp`, `py`, `inf` and join logic), (c) where it calls fn 13860, (d) where it returns the rewritten body.
4. **Pin the per-run order source.** In whichever function builds the kv string, identify the concrete mechanism producing the field order. Cite every pc involved. Name it in one of the categories (i)–(iv) listed in Context, or introduce a new category if none fit.
5. **Cross-check with runtime entry counts.** Read `output/vm-slide/fn-20539-entry-trace.json` `all_entry_counts` for every function you named in steps 2–4. The slot-8 hop should enter exactly as many times as fn 20539 (once per instrumented send). If it doesn't, your static read is wrong — re-check.
6. **Optional dynamic-trace extension** (only if static walking leaves the identity opaque after ~1 hour): add a small hook to `research/vm-slide-stack-vm/trace-fn20539-entry.js` (or a new standalone tracer) that captures, on entry to fn 13860, the calling function's FUNC_CREATE id. Save output to `output/vm-slide/fn-13860-caller-trace.json`. Clearly comment the new hook as 44.2.8 work.
7. **Write `research/vm-slide-stack-vm/FN-20539-SLOT8-HOP.md`** (target: 1–2 pages):
   - fn 20140 body range + slot-3 write pc.
   - Slot-8 hop identity: FUNC_CREATE pc, body range, one-sentence role description.
   - If a wrapper: pseudocode of its body with pcs cited.
   - Per-run order source: concrete mechanism + every pc involved.
   - Runtime cross-check: entry counts confirming the hop is on the live path.
   - "What this unlocks for 44.5b": how the from-scratch builder should replicate the per-run order (accept a pre-ordered obj, seed its own PRNG with a known seed, use JS insertion order, etc.).

### Verification
- [ ] `research/vm-slide-stack-vm/FN-20539-SLOT8-HOP.md` exists with the six sections above.
- [ ] fn 20140 body range cited with FUNC_CREATE pc.
- [ ] Slot-3 write inside fn 20140 cited with `OP_36` pc and resolved FUNC_CREATE id.
- [ ] Slot-8 hop FUNC_CREATE and body range cited.
- [ ] If the hop is a wrapper, its body is fully walked with every pc cited; if it is fn 13860 directly, fn 13860's prologue is walked up to the first kv-string read.
- [ ] Per-run order source named concretely with pc citations. "Unknown" is acceptable ONLY if the subagent has proven via dynamic trace that the order is NOT derivable statically from the body being walked (i.e. the order comes from a caller further up).
- [ ] Runtime cross-check: the slot-8 hop function's `all_entry_counts` value is reported and matches fn 20539's count.
- [ ] No modifications to: `targets/`, `sample/`, `tools/`, `tests/fixtures/`, `docs/`, `research/vm-slide-stack-vm/build-fingerprint-plaintext.js`, `research/vm-slide-stack-vm/FN-20539-DECOMPILE-44.2.7.md`, or any existing committed research note. New artifacts only, plus an optional, clearly-commented dynamic-tracer addition.
- [ ] **Hard stop at ~2 hours of static walking.** If the identity is still opaque, return a partial note naming the exact opaque pc and recommending a narrower dynamic trace — do not rabbit-hole.

### Constraints
- **Do not make any git commits.** Director owns all commits.
- **Do not modify** `targets/`, `sample/`, `tools/`, `tests/fixtures/`, `docs/`, `build-fingerprint-plaintext.js`, or any existing committed research note.
- **Verify, don't assume.** Every claim cites a pc in `bytecode.json` / `disassembly-full.txt` or a runtime event in a captured trace. This is the same rule 44.2.6 violated by naming fn 22317 without checking the callgraph — the cost of that mistake was two remediation tasks.
- **Hard time budget**: ~2 hours static. If blocked, stop, write a partial note, report back.
- **If the task is too difficult or impossible**, stop and report exactly where the walk went opaque; do not leave behind speculative pseudocode.

### Suggested Agent
`general-purpose` — narrow bytecode walk + runtime cross-check + short research note. Skills needed: stack-VM opcode fluency, closure-capture / slot-reference resolution, familiarity with 44.2.7's decompile to build on (not redo) its findings.

### Goal
Decompile the `proxyXHR` XHR-send handler (fn 20539) end-to-end, pin the full call chain from the intercepted `XMLHttpRequest.prototype.send` invocation down to the XTEA encrypt closure at pc 15241, and identify the real plaintext builder that produces the 112-byte pre-cipher input on the Chrome code path. Determine whether the 8-field schema `{tp,key,py,env,version,cLod,inf,ss}` still holds (44.2.6 got the pipeline shape right but attached it to fn 22317, which the runtime trace says isn't called), where the per-run field ordering actually comes from (44.4.1's `Math.random()` comparator in fn 23898 is unreachable on this path), and how fn 20539 attaches the resulting 152-char vData string to the intercepted XHR (body substitution? URL append? header set?). Deliverable is `research/vm-slide-stack-vm/FN-20539-DECOMPILE.md` with body range, full-walker pseudocode, caller-chain map, real fingerprint schema, per-run-order source, and an updated Phase 44 mental model.

### Context (post-44.4.5)
- **fn 22317 is not in the runtime callgraph.** `output/vm-slide/vdata-callgraph.json` captures 14 encrypt-entry events (ENC_ENTRY=15241), all arriving at caller pc 16182 inside fn 15918 (`containing_range: [15918, 16230]`). The frame one level up is reported as fn 20539 by the subagent that closed 44.4.5. Verify that claim as step 1 of this task — do not assume it without re-checking.
- **fn 20539's FUNC_CREATE is at pc 20797**: `OP_58 20539 3 1 7 6 8 3`. Director verified this in `output/vm-slide/bytecode.json`. The captured slots `3 1 7 6 8 3` are the closure's argmap — fn 20539 takes 3 args with a specific argmap pattern.
- **fn 20539 is installed at pc ~20808 as `XMLHttpRequest.prototype.send`.** 44.4.5's subagent cited pc 20808 for the install site. This should show up in the disassembly as a sequence that builds the `XMLHttpRequest.prototype.send` property path and writes the fn 20539 closure onto it.
- **Phase 42's original finding** (documented in `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 / §517 before 44.2.6's reclassification) said proxyXHR is installed at pc 19662 on the Chrome path and at pc 20066 as `window.getVData` on IE9. The 19662 number may reference a different install (the fn 20539 FUNC_CREATE at pc 20797 + install at 20808 is a nearby but distinct anchor). Reconcile these during the walk.
- **The pipeline shape is known and still valid.** `build-fingerprint-plaintext.js` (post-44.4.1) reproduces both committed fixtures byte-identical via `kvString → PKCS#7-style pad with alphabet '0abcdefghijklmnop' → ShiftRows-style 16-byte permute via PERM=[0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11] → XTEA encrypt → custom base64 encode`. So fn 20539's subtree MUST be calling functions that implement this same pipeline — the helper chain (fn 13989 padder, fn 14153 permuter, module 40 encryptData at fn 13860, module 41 XTEA at fn 15220, module 42 base64) is already pinned. The open question is: which function in fn 20539's subtree is the kv-string BUILDER that feeds into this pipeline, and what is its field/value logic?
- **The only vData path in the orchestrator** is the `isLowIE()`-gated IIFE calling `window.getVData`. On Chrome that branch is skipped, so vData must be injected by proxyXHR intercepting the verify POST body. fn 20539's XHR `send` handler likely: (a) inspects the intercepted request to decide whether to inject, (b) builds the fingerprint kv-string from closure-captured or runtime-probed values, (c) runs it through the pipeline, (d) rewrites the request body to include `&vData=<encoded>`. Confirm each of these steps during the walk.
- **Per-run ordering source.** 44.4.1's `Math.random()` finding in fn 23898 is now known to be unreached on this path. Whatever causes the jsdom vs HAR fixture orders to differ lives inside fn 20539's subtree. Candidates: (i) V8 property-enumeration order varying between jsdom and Chrome; (ii) an insertion-order-preserving builder where the caller chooses order based on some runtime condition; (iii) a separate `Math.random()` call inside fn 20539's subtree; (iv) a timer / counter / hashmap-bucket ordering. Your decompile should identify the actual source.
- **Existing related notes** (reference as needed, do not re-derive):
  - `research/vm-slide-stack-vm/FN-22317-DECOMPILE.md` — previous (wrong-attachment) decompile of the pipeline helpers. The fn 13860 / fn 13989 / fn 14153 / fn 15220 / fn 15241 references in that note are still valid; only the fn 22317 framing is wrong.
  - `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` — 8-field schema as observed in the fixtures. Values are valid (they match the fixtures byte-for-byte); their producing pc anchors in fn 22317 are valid as definitions but may not be the runtime-invoked producers.
  - `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md` — earlier working notes.
  - `research/vm-slide-stack-vm/SORT-ORDER-RESOLUTION.md` — 44.4.1's walk of fn 23898; no longer on the live path but the walker technique is worth re-reading.
  - `research/vm-slide-stack-vm/BUILD-RECONCILE.md` — seed `34e2c8f07b5169ad` at pcs 13931/15149 vs runtime key `2e430f8c15b7da96` in local 4 of encrypt closure.
  - `research/vm-slide-stack-vm/plaintext-callgraph.md` — contains the runtime caller list showing fn 15918 / pc 16182 as the frame directly calling ENC_ENTRY=15241.
  - `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — the live oracle, jsdom-backed. Can be extended to capture additional stack frames (e.g. caller chain up from fn 15918) if static walking leaves gaps.
  - `research/captcha-orchestrator/GETCAPTCHADATA-CALLSITE.md` — 44.4.5's negative-result note.
- **Reference impl** `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` is the byte-identical oracle for the pipeline's output. Do NOT modify it in this task — it is known-correct as a replay tool. If your decompile reveals a different real fingerprint schema than what it encodes, FLAG the discrepancy but leave the file alone (44.5b will rewrite the caller-side builder later).

### Starting inputs
- `output/vm-slide/bytecode.json` — 24,273 elements, pc-indexed.
- `output/vm-slide/disassembly-full.txt` — Phase 40.1 full walker output. Already covers fn 20539 and fn 15918 (confirm body ranges during the walk).
- `output/vm-slide/vdata-callgraph.json` — runtime caller PCs, must-read for confirming the fn 20539 → fn 15918 frame relationship.
- `output/vm-slide/dispatch-table.json`, `output/vm-slide/vdata-anchors.json`, `output/vm-slide/vdata-pipeline.json`, `output/vm-slide/window-installs.json` — supplementary anchors.
- `sample/vm_slide.js` — original source, read-only, for sanity-checking constants and string literals.
- `tests/fixtures/vdata-{jsdom,har}-capture.json` — ground-truth fixtures. `plaintext_hex` / `har_decrypted_plaintext_hex` are the exact 112-byte buffers fn 20539's subtree must produce; use these as an oracle when testing candidate plaintext-build hypotheses.
- `research/vm-slide-stack-vm/{walker,decoder,disassembler}.js` — re-usable walker tooling if you need to re-run the walker on a specific range.

### Implementation Steps
1. **Confirm fn 20539's body range and install site.** Locate the FUNC_CREATE at pc 20797 in `disassembly-full.txt`; confirm `OP_58 20539 3 1 7 6 8 3`. Walk forward from pc 20797 to find how the closure is consumed (likely a `__webpack_require__` store or a property-write onto `XMLHttpRequest.prototype.send`). Identify the install pc (should be near 20808 per 44.4.5's claim). Identify fn 20539's body range — run the walker's existing fn-range logic against entry 20539 or manually walk from pc 20539 until the closing `OP_16` RETURN / end-of-function marker. Cite both endpoints with pc.
2. **Cross-check runtime callgraph.** Read `output/vm-slide/vdata-callgraph.json` end-to-end. Confirm that all 14 runtime caller pcs are 16182 in fn 15918 `[15918, 16230]`. The file does NOT currently record the frame above fn 15918 — 44.4.5's subagent claimed it's fn 20539 but did not show a direct trace; you may need to extend `research/vm-slide-stack-vm/vdata-dynamic-trace.js` to capture the caller frame of fn 15918 (by recording a PC-trace at the moment fn 15918 is entered) to prove or disprove the fn 20539 → fn 15918 link. Do this BEFORE assuming fn 20539 is the right entry — if the frame above fn 15918 is a different function, all downstream work pivots.
3. **Walk fn 20539 end-to-end.** Read the disassembly of the body range found in step 1 (expected ~300–800 opcodes, possibly larger). Express in pseudocode with every pc cited. Identify: (a) the closure captures — fn 20539's `OP_58` had argmap `3 1 7 6 8 3`, so three arguments with a specific capture pattern; determine what each captured slot holds by cross-referencing the caller at pc 20797's enclosing function; (b) the sequence of reads from the intercepted XHR's args (`this.url`, `arguments[0]` = the send body, etc.); (c) any branching on URL (does it only inject vData when the URL looks like `/cap_union_new_verify`?); (d) the call sites that lead into fn 15918 or the pipeline helpers (fn 13989 padder, fn 14153 permuter, fn 13860 encryptData, fn 15220 XTEA, module 42 base64).
4. **Walk the plaintext builder.** The kv-string construction MUST exist somewhere in fn 20539's subtree. Look for: `OP_04`+`OP_10` string pushes building field names, `OP_41` GET_PAIR reads of property values, a join loop that concatenates `key+"="+value` pairs with `&`. Identify the function(s) that do this. For each of the observed fingerprint fields (jsdom: `[inf,env,tp,key,py,ss,cLod,version]`; HAR: `[inf,env,tp,cLod,version,key,ss,py]`), locate the producing code. Note whether this subtree uses the SAME 8 field names as fn 22317's schema or a different set.
5. **Pin the per-run-order source.** Where does the jsdom vs HAR order divergence come from on this path? Look for: (i) an explicit shuffle (`Math.random()`-backed comparator like 44.4.1 found in fn 23898, but located somewhere reachable from fn 20539); (ii) a `for (var k in obj)` loop that exposes V8 property-enumeration order; (iii) a hash-bucket iteration; (iv) something else. Name the concrete mechanism and cite every pc involved.
6. **Pin the vData injection site.** After the pipeline emits the 152-char base64 string, fn 20539 must attach it to the intercepted XHR. Find the write site. Look for: a string replacement on the send body, an append of `&vData=<str>` to a form-encoded body, a URL mutation, a header set via `this.setRequestHeader`. Cite the pc. Cross-check against the HAR fixture's captured POST body to confirm the injection format matches reality.
7. **Cross-check against the reference impl.** Feed a known input through the pipeline as fn 20539 does and compare against the reference impl `build-fingerprint-plaintext.js` output. If the inputs and outputs match byte-for-byte, the pipeline is validated from a new (correct) entry point. If they differ, FLAG the discrepancy with a concrete pc citation showing where fn 20539's path diverges.
8. **Write `research/vm-slide-stack-vm/FN-20539-DECOMPILE.md`** (target: ~2–4 pages; research note, not a full doc rewrite):
   - fn 20539 body range + FUNC_CREATE + install pc.
   - Full-walker pseudocode with every pc cited.
   - Caller chain: intercepted XHR send → fn 20539 → (intermediate functions) → fn 15918 → ENC_ENTRY 15241. Show every intermediate function with pc entry/range.
   - Real fingerprint schema: field names, value-source rules, per-run-order source.
   - vData injection site on the intercepted request.
   - "Updated Phase 44 mental model" section: what this task settles, what it leaves open, which tasks (44.3.5, 44.5a, 44.5b, 44.6, 44.7) need rescoping in light of the new findings and why.
   - If any step required a dynamic-trace extension, note that `research/vm-slide-stack-vm/vdata-dynamic-trace.js` was modified and briefly describe what was added.
9. **Optional dynamic-trace extension.** If and only if static walking cannot resolve a step (e.g. dispatch through a closure table, a call target that depends on runtime state), extend `research/vm-slide-stack-vm/vdata-dynamic-trace.js` to capture the missing frame/value by adding a hook. Reuse the existing instrumentation pattern; do not rewrite the tracer. Keep the modification small and documented in a comment referencing 44.2.7.

### Verification
- [ ] `research/vm-slide-stack-vm/FN-20539-DECOMPILE.md` exists with the six sections listed in step 8.
- [ ] fn 20539 body range cited with FUNC_CREATE pc (= 20797 or a corrected value with evidence).
- [ ] Runtime callgraph confirmation: direct evidence (not assumption) that fn 20539 is the frame above fn 15918 at runtime. A dynamic-trace capture under `output/vm-slide/` or an inline note with captured PC stacks is acceptable.
- [ ] fn 20539's body fully walked end-to-end with every pc cited.
- [ ] Real plaintext-build call chain pinned from fn 20539 entry through to the caller of fn 15918.
- [ ] Real fingerprint schema documented: field names, per-field source expressions, per-run-ordering mechanism.
- [ ] vData injection site on the intercepted request pinned with a pc citation.
- [ ] Reference impl `build-fingerprint-plaintext.js` either validated against fn 20539's actual pipeline output OR a discrepancy is flagged with concrete pc evidence.
- [ ] Updated Phase 44 mental model section explicitly states which downstream tasks (44.3.5, 44.5a, 44.5b, 44.6, 44.7) are affected and how.
- [ ] No modifications to: `targets/`, `sample/`, `tools/`, `tests/fixtures/`, `docs/`, `research/vm-slide-stack-vm/build-fingerprint-plaintext.js`. New research artifacts plus an optional, clearly-scoped edit to `research/vm-slide-stack-vm/vdata-dynamic-trace.js` only.

### Constraints
- **Do not make any git commits.** Director owns all commits.
- **Do not modify `targets/` or `sample/`.** Tencent's property.
- **Do not modify `build-fingerprint-plaintext.js`.** It is known-correct as a replay tool; 44.5b will rewrite caller-side logic in a separate task.
- **Verify, don't assume.** Every claim must cite a specific pc in `output/vm-slide/bytecode.json` or `disassembly-full.txt`, or a specific captured event in a dynamic trace. The key mistake 44.2.6 made was assuming fn 22317 was on the live path without checking the runtime callgraph — do not repeat that pattern. In step 2 specifically, confirm the fn 20539 → fn 15918 frame relationship via direct evidence before walking fn 20539's body.
- **Dynamic tracer extension is allowed but scoped.** If you need a new capture, add a small hook to `research/vm-slide-stack-vm/vdata-dynamic-trace.js` that records the missing data; keep the diff small and clearly commented as 44.2.7 work. Do not rewrite the tracer architecture.
- **If the task is too deep or blocked by an unresolvable dispatch**, stop and report. Produce a partial deliverable showing how far you got, which exact pc / function is opaque, and recommend either a narrower dynamic trace or a follow-up 44.2.7.x subtask. Do not force a full walk through a 10+-level chain — decompose it.
- **Warnings from prior attempts** (read before starting): 44.2.6 confidently classified fn 22317 as `exports.getCaptchaData` and fn 20539 as dead code without checking the runtime callgraph; 44.4.5 then spent an hour discovering the orchestrator does not import `getCaptchaData`. The correction cost two subtasks. The runtime callgraph (`output/vm-slide/vdata-callgraph.json`) is ground truth for which functions are live — consult it first and frequently. If static walking and runtime trace disagree, trust the trace.

### Suggested Agent
`general-purpose` — bytecode walk + call-chain trace + optional dynamic-tracer hook + research note. Expected ~3–5 hours including optional dynamic capture. Skills needed: Phase 39/40 walker familiarity, stack-VM opcode fluency, ability to follow closure captures and argmaps, ability to extend the existing jsdom-backed tracer if static falls short.


