# Plan

## Status
Current phase: Phase 44 — vm-slide fingerprint schema + JS vData builder (Stream B — deliverables)
Current task: 44.5b — from-scratch `build-vdata.js --from-obj` (full synthesis builder)

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
| 44.2.8 | **[2026-04-15 — done]** fn 20539 inner slot 8 identity + per-run order source — **reversal-of-reversal**. Slot 8 = **fn 22317 = `module.exports.getCaptchaData`** (FUNC_CREATE pc 24234, body `[22317..24233]`, exported by webpack module fn 20970 at pc 24252). Call chain: vm-slide-internal orchestrator `init(getCaptchaData)` at fn 19604 → `require(44).proxyXHR(getCaptchaData)` at pc 19661 → fn 20140 (proxyXHR) receives it as its single arg, bound to slot 3 → fn 20539 captures fn 20140 slot 3 as inner slot 8 → fn 20539 pc 20749 `OP_66 2` calls `slot8(body, {py}) = fn 22317(body, {py})` → fn 22317 calls fn 13860 → returns rewritten body → fn 20539 does `savedSend.call(this, result)`. **Per-run order source: fn 23898's `Math.random() > 0.5 ? -1 : 1` comparator IS the live mechanism**, inside fn 22317 at pcs 23898..23949 (FUNC_CREATE 23945, sort call 23949) — 44.4.1's finding was correct all along. Runtime cross-check: `all_entry_counts[22317]=1`, `all_entry_counts[23898]=15` (TimSort compares for 8-element sort), `all_entry_counts[13860]=1`. **44.4.5 misread `vdata-callgraph.json`** — that file only captures encrypt-entry events and their reconstructed ancestors, NOT all closure entries. fn 22317 was in `all_entry_counts` all along; 44.4.5 checked the wrong field. **44.2.7's "pure gate+forward" reading of fn 20539 still stands** — fn 20539 really is a thin wrapper; the kv-string builder it calls is fn 22317 (slot 8) via the outer-function-arg binding, not via a statically-visible call. Deliverable: `research/vm-slide-stack-vm/FN-20539-SLOT8-HOP.md` (9 sections, 26 KB). No dynamic-trace extension needed. | done |
| 44.4.1 | **[2026-04-15 — UN-RETIRED post-44.2.8]** fn 23898 Math.random comparator — finding is CORRECT. Runtime trace shows 15 entries = TimSort comparisons for one 8-element sort, first-call args `(string[3]="key", string[2]="tp")` are both members of fn 22317's 8-field schema array, direct proof fn 23898 is the comparator on the live path. 44.2.7's earlier "drop as unreached" conclusion was based on an incomplete reading of the same trace (missed that the 15 entries are sort-comparison callbacks, not unrelated DOM helper calls). | done |
| 44.2.7 | **[2026-04-15]** fn 20539 full end-to-end decompile + real plaintext-build pin — runtime-validated. fn 20539 FUNC_CREATE pc 20797 confirmed; install onto `XHR.prototype.send` at pc 20808 (`OP_24`); sibling `.open` wrapper fn 20353 installed at pc 20473 is the shared-guard writer that records `this` when `.open("/cap_union_new_verify")` is called. fn 20539 is a pure gate+forward: receives the full 9345-byte form-encoded POST body as `arguments[0]`, calls an intermediate function (slot 8 → fn 13860) with `(body, {py})`, receives back the rewritten body, passes it to `savedSend.call`. Injection is body-append: final 9504 = 9345 + `&vData=` + 152-char base64. `ancestor_chains` in `vdata-callgraph.json` are a tracer artifact (host-JS transitions collapsed into VM ticks), NOT a real call stack — 44.4.5's chain reading was wrong on that point. **8-field schema pinned LIVE** from a runtime capture of fn 13860's 110-byte first arg: `env=1&key=qLCZ&version=2&cLod=unloadTDC&ss=0%2C&tp=<captured JS error>&py=0&inf=top`. Field set `{env,key,version,cLod,ss,tp,py,inf}` matches the 44.2.6 names — but it is a **tdc runtime-state probe**, not a navigator/screen fingerprint (`tp` is a captured JS error message; `inf` is iframe-position; `cLod` is a lifecycle marker). Runtime XTEA key = the bytecode literal `34e2c8f07b5169ad`, not the `2e430f8c15b7da96` runtime-key claim from Phase 42 — reconciliation still owed to 44.5a. **Unresolved**: the exact FUNC_CREATE stored in fn 20140's slot 3 (fn 20539's inner slot 8) that directly calls fn 13860. Deliverables: `research/vm-slide-stack-vm/FN-20539-DECOMPILE-44.2.7.md`, `research/vm-slide-stack-vm/trace-fn20539-entry.js`, `output/vm-slide/fn-20539-entry-trace.json`. | done |
| 44.3.5 | **[DEFERRED post-44.2.8 — optional]** Real-Chrome differential capture — validation step, not discovery. May be picked up before or after 44.6 if test suite motivates it. | deferred |
| 44.5a | **[2026-04-15 done]** Shipped `tools/vdata-generator/{build-plaintext.js, replay.js}` + `replay` CLI subcommand + `--self-check` flag + README. `buildVData({obj, order, overrides})` reproduces both committed fixtures byte-identically (self-check green). Cipher-only mode (`--plaintext-hex`) preserved unchanged. npm test 411/411 — no regressions. No modifications to protected paths. | done |
| 44.5b | **[2026-04-15 unblocked post-44.2.8]** From-scratch `tools/vdata-generator/build-from-obj.js`. Input: the 8-field fingerprint object (`{tp,key,py,env,version,cLod,inf,ss}`) OR a captured window/document environment to probe. Output: 152-char vData string. Replicates fn 22317's field-order schema array `["tp","key","py","env","version","cLod","inf","ss"]`, the `Math.random()>0.5?-1:1` shuffle (optionally with a seeded PRNG for deterministic fixture round-trips), the `&`-joined kv string, and the Phase 43 encoder. | pending |
| 44.6 | Tests for the vData builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' vData strings end-to-end from an `(obj, body)` pair (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | **[EXPANDED post-44.2.7]** Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the 8-field tdc-runtime-state-probe schema (`env, key, version, cLod, ss, tp, py, inf`) + source-rule table + the fn 20539 `proxyXHR` XHR-send-handler entry-point narrative (body-rewrite injection via `savedSend.call` at pc 20751, final 9504 = 9345 + `&vData=` + 152). **Correct `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 + §517** to restore Phase 42's XHR monkey-patch mechanism (fn 20539 installed at pc 20808 onto `XHR.prototype.send`, fn 20353 installed at pc 20473 onto `XHR.prototype.open` as the shared-guard writer) and remove 44.2.6's fn 22317 `getCaptchaData` misattribution + the 44.3-introduced 9504→112 reduction hypothesis. **Reconcile the runtime XTEA key** — document that the bytecode literal seed `34e2c8f07b5169ad` is ALSO the runtime key observed live (contradicting Phase 42/CLAUDE.md's `2e430f8c15b7da96` claim; fold the reconciliation owed by 44.5a into this task). Mark Phase 44 closed; bump CLAUDE.md Project Memory to record the full pipeline + corrected key story. | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

> **Plan revision 2026-04-15 (user-approved, in progress)**: 44.4 surfaced two facts that warranted insertion of **44.0.1** (bytecode build reconciliation — done, verdict A+nuance) and **44.4.1** (sort-order contradiction resolution — done, verdict: randomised comparator). Current dispatch order: ~~44.0.1~~ → ~~44.4.1~~ → **44.4.5** → 44.3.5 → 44.5a → 44.5b → 44.6 → 44.7. 44.4.1's outcome has a downstream implication: 44.5b cannot have a canonical default join order — from-scratch synthesis must either accept a pre-ordered obj or seed its own RNG (to be reflected in 44.5b's task spec when drafted).

---

> **Plan revision 2026-04-15 (minimal-change, user-approved)**: 44.4.5 disproved 44.2.6's premise that fn 22317 is the live Chrome `getCaptchaData` producer. The orchestrator `sample/t_captcha_slide.js` contains zero references to `getCaptchaData`; the only vData code path is an `isLowIE()`-gated IIFE calling `window.getVData`; runtime callgraph shows 14/14 encrypt calls pass through fn 15918, one frame below fn 20539 (the `proxyXHR` XHR monkey-patch, FUNC_CREATE at pc 20797). 44.2.6's reclassification of fn 20539 as dead code was wrong. **Minimal-change response**: insert **44.2.7** (fn 20539 full decompile) as the only structural change and dispatch it next. The rest of the Phase 44 task list (44.3.5 → 44.5a → 44.5b → 44.6 → 44.7) stays as drafted; it will be re-examined against 44.2.7's findings when they land. This avoids re-planning on top of unverified assumptions a second time.

> **Mental-model status post-44.4.5** (what 44.2.7 must settle or leave standing): (1) Phase 42's XHR-patch mechanism on Chrome appears to stand — 44.2.7 should confirm fn 20539 is the live producer; (2) fn 22317 is an internal/reserved vm-slide export not called on the observed Chrome path; (3) 44.4.1's `Math.random()` comparator is in fn 23898, only referenced by fn 22317 — unreached at runtime; real per-run order source is inside fn 20539's subtree; (4) `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` is still byte-identical to both fixtures, so the padder + ShiftRows + XTEA + base64 pipeline shape is correct — 44.2.6 got the pipeline right, just attached it to the wrong function. 44.2.7's job is to move the attach point from fn 22317 to the real producer in fn 20539's subtree.

---

## Current Task

**ID**: 44.5b
**Title**: From-scratch `build-vdata.js --from-obj` (full synthesis builder)
**Phase**: Phase 44 — Stream B deliverables
**Status**: pending — ready for dispatch.

### Goal
Ship the full-synthesis from-scratch vData builder under `tools/vdata-generator/`: a `build-from-obj.js` module + `from-obj` CLI subcommand that accepts the 8-field fingerprint object (`{tp, key, py, env, version, cLod, inf, ss}`) and emits a 152-char vData string **without** requiring a caller-supplied field order. The builder must replicate fn 22317's runtime behavior: construct the schema array in the fixed source order `["tp","key","py","env","version","cLod","inf","ss"]`, shuffle via a `Math.random()>0.5?-1:1` comparator (with an optional `--seed` flag that swaps in a seeded PRNG for deterministic fixture round-trips), join as `&`-separated `key=value` pairs to produce 110 bytes pre-pad, and pipe through the already-shipped Phase 43 cipher encoder (via 44.5a's `buildPlaintext` + `encode`) to emit the 152-char vData string.

### Context
- **Phase 44 discovery is fully resolved (44.2.8).** The pipeline in fn 22317: (1) build 8 field values, (2) construct the schema array in fixed source order `["tp","key","py","env","version","cLod","inf","ss"]` at pcs 23753..23894, (3) `arr.sort(fn 23898)` at pc 23949 where fn 23898 is `Math.random() > 0.5 ? -1 : 1`, (4) per-element loop emits `name + "=" + obj[name]` in shuffled order at pcs 23985..24084, (5) `arr.join("&")` at pc 24161, (6) `encryptData` (fn 13860).
- **44.5a shipped the replay wrapper** (`tools/vdata-generator/{build-plaintext.js, replay.js}`) and a `replay` CLI subcommand. It requires the caller to pass `order` explicitly — that works for fixture replay but is unfriendly for real use. 44.5b adds the from-scratch entry point that handles order internally.
- **Math.random shuffle means nondeterminism by default.** For from-scratch use, different runs will produce different valid vData strings. Byte-identical fixture round-trip requires either: (a) swapping in a seeded PRNG whose `Math.random()` call sequence matches the captured shuffle, or (b) accepting the captured field order as an override. Provide BOTH via `--seed <n>` (seeded Node-compatible xorshift or mulberry32 PRNG) and `--order <path>` (captured order override). Default behavior with no flags: real `Math.random`.
- **Seeded-PRNG fixture replay is a stretch goal.** Node's Array.prototype.sort uses TimSort, which makes a specific sequence of comparison calls (the HAR fixture captured 15 comparisons per 8-element sort per 44.2.8). Reproducing the exact shuffle from a seed requires knowing the exact comparator call sequence the runtime took. If you can't get this to work in a reasonable time, **document the limitation** and ship with `--order` override as the deterministic escape hatch — do not rabbit-hole on PRNG reverse engineering.
- **Reuse 44.5a's building blocks.** `buildPlaintext({obj, order})` in `tools/vdata-generator/build-plaintext.js` already does the kv-join + pad + permute. Do not duplicate that logic; call it. You only need to add the shuffle step that produces the `order` array before calling it, plus the seeded-PRNG hook.
- **Fixtures**: `tests/fixtures/vdata-{jsdom,har}-capture.json`. The HAR fixture's captured order `[inf,env,tp,cLod,version,key,ss,py]` is the reference for "what the shuffle produced in one real-Chrome run".
- **Impl/tests separation**: do NOT write test files under `tests/`. 44.6 owns tests.

### Implementation Steps
1. **Read the 44.5a files** (`tools/vdata-generator/build-plaintext.js`, `replay.js`, `cli.js`, `README.md`) to understand the current API surface. Your new code composes with them.
2. **Add `tools/vdata-generator/build-from-obj.js`.** Export `buildVDataFromObj({obj, seed})`:
   - Start with the schema array `['tp','key','py','env','version','cLod','inf','ss']`.
   - If `seed` is provided, create a seeded PRNG (pure JS, e.g. mulberry32 — small, well-known, single-function); otherwise use real `Math.random`.
   - Shuffle the schema array using `arr.sort(() => rng() > 0.5 ? -1 : 1)` — matching fn 23898's comparator exactly.
   - Call `buildPlaintext({obj, order: shuffled})` from 44.5a.
   - Call the Phase 43 `encode` to get the 152-char vData.
   - Return the vData string.
3. **Add `from-obj` CLI subcommand** in `tools/vdata-generator/cli.js`:
   - `--obj <path>` — required, 8-field fingerprint JSON.
   - `--seed <n>` — optional integer seed for deterministic output.
   - `--order <path>` — optional explicit order override (escape hatch if seeded PRNG can't reproduce a target). When provided, bypasses the shuffle entirely.
   - Prints the resulting 152-char vData string to stdout.
   - Keep `replay` and the existing cipher-only mode working unchanged.
4. **Attempt seeded-PRNG fixture round-trip.** Try to find a seed that, under mulberry32 + `arr.sort(cmp)` with Node's TimSort, reproduces the HAR fixture's captured order `[inf,env,tp,cLod,version,key,ss,py]` starting from schema-source order. If you find one in ≤ 30 minutes of experimentation, record it in a comment. If you don't find one, **document the limitation** in the README (see step 6) and continue — the `--order` override is the deterministic path. Do NOT rabbit-hole.
5. **Add a `--self-check` mode** to the `from-obj` subcommand that: reads both fixtures, runs `buildVDataFromObj({obj, seed: <discovered-seed-or-null>})` with `--order` fallback if no seed works, asserts byte-identical match, exits non-zero on mismatch.
6. **Update `tools/vdata-generator/README.md`** to add a `from-obj` section: explain the mode, document the shuffle behavior (nondeterministic by default, `--seed` for deterministic, `--order` for explicit override), show CLI examples, and clearly state the seeded-PRNG limitation if step 4 couldn't find a reproducing seed.

### Verification
- [ ] `tools/vdata-generator/build-from-obj.js` exists and exports `buildVDataFromObj({obj, seed})`.
- [ ] `node tools/vdata-generator/cli.js from-obj --obj <fixture-derived>.json` prints a 152-char string on the Phase 43 alphabet (length + alphabet check; byte content varies because default is real Math.random).
- [ ] `node tools/vdata-generator/cli.js from-obj --obj <jsdom-obj>.json --order <jsdom-order>.json` prints the exact jsdom fixture vData string.
- [ ] Same with HAR fixture.
- [ ] `from-obj --self-check` exits 0 (using whichever mechanism works: seeded PRNG or `--order` fallback).
- [ ] `replay --self-check` still exits 0 (44.5a's path is unbroken).
- [ ] Cipher-only mode (`--plaintext-hex`) still works.
- [ ] `npm test` still 411/411.
- [ ] No modifications to `targets/`, `sample/`, `tests/fixtures/`, existing `docs/`, any existing research note, or `research/vm-slide-stack-vm/build-fingerprint-plaintext.js`.

### Constraints
- **Do not make any git commits.** Director handles commits.
- **Do not modify** `targets/`, `sample/`, `tests/fixtures/`, existing docs, or any existing research note or research tool.
- **No new npm dependencies.** Pure Node.js built-ins + existing project files only. mulberry32 is ~8 lines of JS — write it inline, don't npm-install a PRNG library.
- **Impl/tests separation**: no files under `tests/`. 44.6 owns tests.
- **Match 44.5a's conventions.** Read 44.5a's output first and mirror the module layout, naming, and CLI style.
- **Coding style**: CommonJS, 2-space indent, single quotes, semicolons, `const`/`let`.
- **Hard time budget on seeded-PRNG experimentation: 30 minutes.** If it doesn't work, document the limitation and move on.
- **If the task is too difficult**, stop and report exactly what blocked you.

### Suggested Agent
`general-purpose` — small composition task with one interesting unknown (seeded-PRNG shuffle reproduction). Skills: CommonJS, CLI argv, basic PRNG implementation (mulberry32), understanding of Node's Array.prototype.sort behavior. Expected ~1–2 hours.
