# Plan

## Status
Current phase: **Phase 45** — Scraper vData switchover + errorCode 12 re-test (revised 2026-04-15 post-45.1, user-confirmed)
Current task: 45.6 — Empirical errorCode 12 re-test (director-owned, live network — awaiting user go-ahead)

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
| 44.5b | **[2026-04-15 done]** Shipped `tools/vdata-generator/build-from-obj.js` + `from-obj` CLI subcommand with `--obj`, `--seed`, `--order`, `--self-check`. Inline mulberry32 PRNG. Seeded-PRNG experiment found working seeds for BOTH fixtures under Node 20 TimSort: HAR=53818, jsdom=84121 (beat the 30-min budget in <1s). `from-obj --self-check` exits green using `--order` for HAR and `--seed 84121` for jsdom; `--order` path works for both as the portable escape hatch. Nondeterministic default with real `Math.random` also works. npm test 411/411. No regressions. | done |
| 44.6 | **[2026-04-15 done]** Shipped `tests/test-vdata-builder.js` (14 new tests across 5 suites, black-box discipline: only imports `buildVData` and `buildVDataFromObj`, no internals). Test groups: A replay byte-identical round-trip + no-op overrides + length-matched substitution, B from-obj `order` override, B' from-obj default-`Math.random` shape, C seeded PRNG Node-20-guarded, E fixture integrity canary. Shape helper `assertValidVData` reused across A/B/C. npm test 411→425 (+14), 0 failures, 0 skipped under Node 20.20.0. `package.json` test-script list appended with the new file (explicit file list, not glob-based). No modifications to `tools/vdata-generator/`, `tests/fixtures/`, or any other protected path. | done |
| 44.7 | **[2026-04-15 done]** Docs closeout (director-owned). `docs/VDATA_FORMAT.md` §1 rewritten with end-to-end entry chain; new §7 adds 8-field per-field source table, per-call Fisher-Yates shuffle walk, pad+ShiftRows+XTEA transform chain; §5 public-API table adds `build-plaintext.js` / `replay.js` / `build-from-obj.js` + three-mode examples; §6 provenance table updated with Phase 44 rows; §3 adds the `2e43...`/`34e2...` key reconciliation note. `docs/CAPTCHA_ORCHESTRATOR.md` §6 `vData` subsection corrects the Phase 44.3 "caller-supplied body" misattribution with a full Phase 44.2.8 call chain and a note that `getCaptchaData` is bound inside vm-slide (not in `t_captcha_slide.js`). `CLAUDE.md` Project Memory: new "vData plaintext-build — Phase 44 solved" block, "XTEA key reconciliation" block, documentation-table row for VDATA_FORMAT.md updated to reflect end-to-end scope. Phase 44 closed; no subagent dispatched (director-owned). | done |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

> **Plan revision 2026-04-15 (user-approved, in progress)**: 44.4 surfaced two facts that warranted insertion of **44.0.1** (bytecode build reconciliation — done, verdict A+nuance) and **44.4.1** (sort-order contradiction resolution — done, verdict: randomised comparator). Current dispatch order: ~~44.0.1~~ → ~~44.4.1~~ → **44.4.5** → 44.3.5 → 44.5a → 44.5b → 44.6 → 44.7. 44.4.1's outcome has a downstream implication: 44.5b cannot have a canonical default join order — from-scratch synthesis must either accept a pre-ordered obj or seed its own RNG (to be reflected in 44.5b's task spec when drafted).

---

> **Plan revision 2026-04-15 (minimal-change, user-approved)**: 44.4.5 disproved 44.2.6's premise that fn 22317 is the live Chrome `getCaptchaData` producer. The orchestrator `sample/t_captcha_slide.js` contains zero references to `getCaptchaData`; the only vData code path is an `isLowIE()`-gated IIFE calling `window.getVData`; runtime callgraph shows 14/14 encrypt calls pass through fn 15918, one frame below fn 20539 (the `proxyXHR` XHR monkey-patch, FUNC_CREATE at pc 20797). 44.2.6's reclassification of fn 20539 as dead code was wrong. **Minimal-change response**: insert **44.2.7** (fn 20539 full decompile) as the only structural change and dispatch it next. The rest of the Phase 44 task list (44.3.5 → 44.5a → 44.5b → 44.6 → 44.7) stays as drafted; it will be re-examined against 44.2.7's findings when they land. This avoids re-planning on top of unverified assumptions a second time.

> **Mental-model status post-44.4.5** (what 44.2.7 must settle or leave standing): (1) Phase 42's XHR-patch mechanism on Chrome appears to stand — 44.2.7 should confirm fn 20539 is the live producer; (2) fn 22317 is an internal/reserved vm-slide export not called on the observed Chrome path; (3) 44.4.1's `Math.random()` comparator is in fn 23898, only referenced by fn 22317 — unreached at runtime; real per-run order source is inside fn 20539's subtree; (4) `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` is still byte-identical to both fixtures, so the padder + ShiftRows + XTEA + base64 pipeline shape is correct — 44.2.6 got the pipeline right, just attached it to the wrong function. 44.2.7's job is to move the attach point from fn 22317 to the real producer in fn 20539's subtree.

### Phase 45: Scraper vData switchover + errorCode 12 re-test (drafted 2026-04-15)
> Replace the scraper's jsdom-harness vData generation with the standalone `tools/vdata-generator/` pipeline (Phase 44 deliverable), supplying **browser-like field values** instead of the jsdom-specific ones that leak through today. Then re-run the 30-attempt survey from `docs/ERRORCODE_12_INVESTIGATION.md` to measure whether errorCode 12 improves.

> **Motivation — why the swap is worth trying**. The scraper currently runs vm-slide live inside jsdom via `tools/scraper/vdata-harness.js` (step 4 of `scraper.js`:525, `generateVData` call). jsdom produces structurally distinct field values versus a real Chrome browser, visible in the two committed fixtures:
> - `tp` — jsdom: `Cannot read properties of null (reading 'src')` (a jsdom DOM error on a missing `<img src>`); real Chrome HAR: `7446039806946242560` (a numeric snowflake-like ID). Fundamentally different shape.
> - `cLod` — jsdom: `unloadTDC`; real Chrome HAR: `loadTDC`. The scraper never boots the register-VM `tdc.js` in the same jsdom context, so vm-slide's lifecycle probe reads "unloaded".
> - `inf` — jsdom: `top`; real Chrome HAR: `iframe`. The scraper loads vm-slide at the top window; a real show-page runs it inside a captcha iframe.
> - `ss`, `env` — smaller but similar divergences.
>
> Every one of those four mismatches is a fingerprintable tell. errorCode 12 currently starts rejecting after ~8–10 solves with no IP-level explanation (`docs/ERRORCODE_12_INVESTIGATION.md`), which is consistent with Tencent's server-side scoring accumulating these vData-tell signals over a session. The Phase 44 `tools/vdata-generator/build-from-obj.js` lets us pick every field value deliberately, so we can supply browser-like values and test the hypothesis.

> **Why not "just also solve errorCode 12"**. This plan does NOT claim the swap will fix errorCode 12. It treats the swap as a one-variable experiment: change vData generation to use browser-like field values via the standalone pipeline, re-run the survey, and observe. If success rate improves, we've closed one vector; if it doesn't, we've ruled one hypothesis out and narrowed the search.

> **Scope boundary**. Phase 45 only touches vData generation and its direct consumers. Out of scope: changing the behavioural event stream (`slideSd`), rewriting request headers, live Puppeteer warm-up, TLS/JA3 manipulation. Those remain candidates in `docs/ERRORCODE_12_INVESTIGATION.md` for later phases if Phase 45 doesn't move the needle.

> **Key load-bearing fact**. The only vData field that is data-dependent on the POST body is `key` (= `fn 22730 → require(18)(body,'tlg')`, a char-lookup-loop digest). Every other field is either a caller-supplied constant, a runtime-probe with a small fixed set of possible values, or a piece of tdc state. So the standalone swap needs exactly one body-dependent helper ported (the `key` digest); everything else can be caller-supplied from a static "browser profile".

> **Two streams**:
> - **Stream A (45.1 → 45.2 → 45.3)**: Productise the plaintext builder. Decide per-field source (port vs. caller-supplied), add `buildVDataForPost(body, options)` entry point, tests.
> - **Stream B (45.4 → 45.5 → 45.6)**: Wire into scraper, test, run the empirical errorCode 12 survey.

> **Starting inputs**: `tools/vdata-generator/` (Phase 44 deliverable), `tools/scraper/{scraper.js, vdata-harness.js}`, `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` (per-field decompile), `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` (reference impl — now the source for porting the `key` digest), `tests/fixtures/vdata-{jsdom,har}-capture.json` (observed values for both field types), `sample/captcha-har.har` (real Chrome POST body for verifying the `key` digest), `docs/ERRORCODE_12_INVESTIGATION.md` (baseline success rate and survey protocol).

| ID | Task | Status |
|----|------|--------|
| 45.1 | **Per-field source decisions** — read `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` + `build-fingerprint-plaintext.js`, classify each of the 8 fields as (a) **port-as-code** (must be computed per-request from inputs), (b) **profile-supplied** (caller hands in a browser-like value from a config), or (c) **inline default** (single hardcoded browser-like value). Produce `research/vm-slide-stack-vm/PHASE-45-FIELD-SOURCES.md` with the decision table, browser-like default values grounded in the HAR fixture, and the porting scope for Stream A. No code. | done |
| 45.1a | **Decompile module 18 (`tlg` / `sess` lookups)** — new prerequisite discovered by 45.1. Module 18 is the body-parser `require(18)(body, tag)` that both fn 22730 (`key` digest) and the surrounding accumulator loop call. It is NOT decompiled anywhere in `research/vm-slide-stack-vm/`. Produce (a) a new research note `research/vm-slide-stack-vm/MODULE-18-BODY-PARSER.md` with the decompiled function, the exact behaviour for tags `"tlg"` and `"sess"`, input/output types, edge cases (empty body, missing tag, non-ASCII bytes), and (b) a runnable reference impl `research/vm-slide-stack-vm/module18-body-parser.js` whose output on the HAR fixture's verify POST body matches the HAR `obj.key = "21L2"` when plugged through the fn 22730 accumulator loop from `PHASE-45-FIELD-SOURCES.md` §2.1. This is the gate for 45.2. | done |
| 45.2 | **Port the `key` field digest + add `buildVDataForPost` entry point** — port fn 22730 + module 18 (via the 45.1a reference impl at `research/vm-slide-stack-vm/module18-body-parser.js`) into `tools/vdata-generator/build-key-field.js`, exporting `lookupFormField` + `computeKeyField`. Add `tools/vdata-generator/for-post.js` exporting `buildVDataForPost(postBody, {profile, overrides, order, ie9Fallback})`. Add a `for-post` CLI subcommand. Update the README with the new mode and caller preconditions. | done |
| 45.3 | **Tests for 45.2** (different agent per impl/tests separation) — lock down `computeKeyField` against the HAR fixture and `buildVDataForPost` against synthetic + HAR byte-identity. 37 scenarios across 7 groups; 462/462 npm test green. | done |
| 45.4 | **Scraper wiring swap** — default path now calls `buildVDataForPost`; legacy jsdom harness retained behind `--legacy-vdata`. `profiles/vdata-browser-default.json` created. 462/462 tests still green. | done |
| 45.5 | **Tests for 45.4** (different agent) — 44 offline subtests across 5 groups. Inline vData decoder built from existing exports proves default path carries HAR-derived values (`cLod=loadTDC`, `inf=iframe`) and legacy path carries three distinct jsdom tells. 506/506 npm test green. | done |
| 45.6 | **Empirical errorCode 12 re-test** (director-owned; live network) — run the 30-attempt survey from `docs/ERRORCODE_12_INVESTIGATION.md` §"Observed Pattern" against the live `cap_union_new_verify` endpoint, with the new vData pipeline. Record success rate in the same attempts-bucket shape (1, 2–9, 10–30). Then run a matched control with `--legacy-vdata` back-to-back from the same IP. Update `docs/ERRORCODE_12_INVESTIGATION.md` with both result rows and a verdict: (a) vData-pipeline swap improved the success rate (Phase 45 goal achieved), (b) neutral (swap is correct but errorCode 12 is elsewhere; refocus on behavioural / header vectors), or (c) regressed (new pipeline has a defect; roll back, investigate). Commit the updated investigation doc + any observed error bodies as the deliverable. | pending |

> **Scope decisions for user review**:
> 1. **Stream A porting scope**: 45.1 is the decision task. Recommendation — port ONLY the `key` digest (mandatory, body-dependent), keep the other 7 fields as profile-supplied with browser-like defaults drawn from the HAR fixture. The helpers for `tp` / `ss` (fn 22400 / fn 23399) are extra work for uncertain gain since we can't verify real-browser outputs without a live Chrome capture pipeline.
> 2. **Is `--legacy-vdata` worth keeping?** Recommendation — yes. Swap is a hypothesis test; keeping the old path behind a flag lets 45.6 run a matched A/B from the same IP in one session.
> 3. **Directly commit to Phase 45, or narrow-scope proof-of-concept first?** Recommendation — commit. The tasks are small (each single-session), and 45.6 is the only live-network step. If 45.1's decisions turn out wrong, we'll replan at that gate.
> 4. **Where do browser-like field defaults come from?** The HAR fixture captures one real Chrome 146 session; 45.1 will pin the default values from that fixture's `obj`. This is a single-sample profile — if Tencent fingerprints on per-session variance, we may need to rotate profiles in a future phase.

> **Dispatch order (proposed)**: 45.1 → 45.2 → 45.3 → 45.4 → 45.5 → 45.6. Each transition goes through normal verify + commit gates. 45.6 is the only task with live-network side effects; all others are local and side-effect-free.

> **Non-goals (out of scope)**:
> - Rewriting the scraper's behavioural event stream (`slideSd`)
> - Puppeteer warm-up / browser reputation building
> - TLS/JA3 fingerprint shaping
> - Rotating among multiple browser profiles (we ship a single default profile)
> - Reconfirming which vm-slide build the fixtures came from (carried forward as optional Phase 45.x if needed; see Phase 44.2.7 key reconciliation note)

---


---

## Current Task

**ID**: 45.6
**Title**: Empirical errorCode 12 re-test (director-owned, live network)
**Phase**: Phase 45 — Scraper vData switchover + errorCode 12 re-test
**Status**: pending — **awaiting user go-ahead before live network traffic**

### Goal
Run the 30-attempt empirical survey from `docs/ERRORCODE_12_INVESTIGATION.md` §"Observed Pattern" against the live `cap_union_new_verify` endpoint, with the 45.4 vData pipeline as the default. Immediately re-run a matched 30-attempt control with `--legacy-vdata` from the same IP. Compare success rates in the same attempts-bucket shape (1, 2–9, 10–30) and update `docs/ERRORCODE_12_INVESTIGATION.md` with a verdict: (a) swap improved success rate (Phase 45 goal achieved), (b) neutral (swap is correct but errorCode 12 is elsewhere), or (c) regressed (roll back and investigate).

### Why this task is director-owned and gated on user approval
- It is the ONLY live-network side-effect in Phase 45. Every prior task (45.1 → 45.5) is local and reversible.
- Hitting Tencent's verify endpoint 60 times in a short window from a single IP is the exact pattern that can trip the `errorCode 12` scoring we're trying to measure — the survey is self-referentially sensitive. Running it before Stream A is fully ready, or without the user explicitly opting in to the reputational cost, would burn our measurement budget.
- Phase 45's draft plan explicitly flagged 45.6 as needing director ownership and user validation before dispatch.

### Stream A readiness checklist (all ✅ as of 2026-04-15 post-45.5)
- [x] 45.1 — Per-field source decisions committed
- [x] 45.1a — Module 18 body-parser decompiled, HAR oracle `obj.key = "21L2"` reproduced byte-identically
- [x] 45.2 — `computeKeyField` + `buildVDataForPost` ported into `tools/vdata-generator/`
- [x] 45.3 — 37 black-box tests including HAR byte-identity gate — all green
- [x] 45.4 — Scraper wired to default to `buildVDataForPost`, legacy jsdom path preserved behind `--legacy-vdata`
- [x] 45.5 — 44 offline tests prove default and legacy paths diverge correctly (browser-profile values vs. jsdom tells)
- [x] Full test suite: 506/506 green

### Survey protocol (to be executed once the user approves)
1. Start from a fresh IP (ideally one that has NOT been used for recent `errorCode 12` measurements). The director will confirm the IP with the user before starting.
2. Set `--retries 1` so each attempt is a single solve, not a retry loop — we want to count one attempt per scraper invocation.
3. Run the scraper 30 times with the DEFAULT path (`node tools/scraper/cli.js --captcha-only --verbose` without `--legacy-vdata`). Log each invocation's final result: `success`, `errorCode=<n>`, or transport error. Keep attempt index 1..30.
4. Without rotating IP, immediately run 30 more invocations with `--legacy-vdata` (`node tools/scraper/cli.js --captcha-only --verbose --legacy-vdata`). Same logging.
5. Classify each attempt into a bucket: attempt 1, attempts 2–9, attempts 10–30. Record success count per bucket per path.
6. Compare the two runs attempt-by-attempt and bucket-by-bucket. The `docs/ERRORCODE_12_INVESTIGATION.md` baseline is "success on attempt 1, usually fails by attempt 10" — look for divergence from that pattern on either path.

### Output artifacts
- `output/phase-45-errorcode-12-survey/default.log` — 30-attempt raw log for the default path
- `output/phase-45-errorcode-12-survey/legacy.log` — 30-attempt raw log for the legacy path
- `output/phase-45-errorcode-12-survey/summary.json` — bucket counts and verdict
- Edited `docs/ERRORCODE_12_INVESTIGATION.md` — new section with the two result rows, a verdict classification ((a)/(b)/(c) above), and next-phase direction if applicable
- Any interesting error response bodies captured during the survey, added as fixtures under `tests/fixtures/` ONLY if they would serve future investigation

### Verification
- [ ] Both runs completed without the scraper code itself crashing (network errors from Tencent are fine — they ARE the data).
- [ ] Summary matches the raw logs.
- [ ] `docs/ERRORCODE_12_INVESTIGATION.md` edit lands in the same commit as the summary artifact.
- [ ] Verdict is justified by the observed data, not wishful thinking.

### Constraints
- **Awaiting user go-ahead.** Do not start running invocations without explicit approval — the director will pause here and present the readiness checklist to the user.
- **Abort condition**: if the first 5 default-path attempts all return non-errorCode-12 failures (e.g. transport errors, 403s, HTTP 500s from the endpoint), stop and report — we'd be measuring noise, not signal.
- **IP stability**: once the default-path survey starts, do not switch IPs, restart the VPN, or rotate sessions. The matched A/B depends on same-IP control.
- **No session leakage between the two 30-attempt runs**: the scraper creates fresh sessions per invocation, so this should be automatic, but confirm.

### Suggested owner
**Director** (this planner) — not a subagent. The director runs the scraper directly, collects logs, computes the summary, and edits `docs/ERRORCODE_12_INVESTIGATION.md`. Subagents are not used for live-network tasks in this project.
