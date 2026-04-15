# Plan

## Status
Current phase: Phase 44 — vm-slide fingerprint schema + JS vData builder (major plan revision needed 2026-04-15 post-44.4.5)
Current task: **plan revision pending user review** — 44.4.5 disproved 44.2.6's premise; remaining Phase 44 tasks need restructure before dispatch

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
| 44.3.5 | Real-Chrome differential capture — third fixture from production Chrome; capture target simplifies to the full 9504-byte verify POST body + its 152-char vData string pair; used as a cross-check for 44.4's value-source rules across environments | pending |
| 44.5a | Replay-with-substitution builder. Reads a captured fingerprint object (8 properties) + override map; emits a substituted `obj`; calls into 44.5b's builder. Trivial wrapper after 44.5b lands. | pending |
| 44.5b | **From-scratch `build-vdata.js --from-obj`**. Input: an 8-property fingerprint object JSON. Output: 152-char vData string. Pure JS: replicates fn 22317's alphabetical sort + key=value join, then calls the Phase 43 encoder. Deterministic, no runtime env probing. Depends on 44.4. | pending |
| 44.6 | Tests for the vData builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' vData strings end-to-end from an `(obj, body)` pair (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the 8-field schema + source-rule table + the fn 22317 `getCaptchaData` entry-point narrative; **further correct `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 + §517** (mechanism is orchestrator calls vm-slide webpack export `getCaptchaData`, NOT an XHR monkey-patch on Chrome; remove the 44.3-introduced 9504→112 reduction hypothesis from §517); mark Phase 44 closed; bump CLAUDE.md Project Memory to record the full 4-layer pipeline | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

> **Plan revision 2026-04-15 (user-approved, in progress)**: 44.4 surfaced two facts that warranted insertion of **44.0.1** (bytecode build reconciliation — done, verdict A+nuance) and **44.4.1** (sort-order contradiction resolution — done, verdict: randomised comparator). Current dispatch order: ~~44.0.1~~ → ~~44.4.1~~ → **44.4.5** → 44.3.5 → 44.5a → 44.5b → 44.6 → 44.7. 44.4.1's outcome has a downstream implication: 44.5b cannot have a canonical default join order — from-scratch synthesis must either accept a pre-ordered obj or seed its own RNG (to be reflected in 44.5b's task spec when drafted).

---

---

## Pending Plan Revision (2026-04-15, awaiting user approval)

**Trigger**: 44.4.5 disproved 44.2.6's core premise. fn 22317 is not the live Chrome producer — the orchestrator never imports or calls `getCaptchaData`. The live producer is in fn 20539's callgraph (the `proxyXHR` XHR monkey-patch path, installed at pc 20808 as `XMLHttpRequest.prototype.send`), which 44.2.6 had reclassified as dead code.

**Proposed restructure** (9 Phase 44 items pending become 8, plus one insertion):

1. **Insert 44.2.7 — fn 20539 full end-to-end decompile.** Walk fn 20539's body, identify its plaintext-build call chain, pin the caller of fn 15918 (the runtime frame the callgraph recorded), and determine which function in fn 20539's subtree actually constructs the 112-byte XTEA input. Replaces 44.2.6's wrong classification of fn 20539 as dead code. Expected ~2–4 hours static + optional dynamic trace.
2. **Re-open the per-run order question.** 44.4.1's `Math.random()` comparator is in fn 23898, which is only referenced by fn 22317 — unreachable on the Chrome path. The real source of jsdom/HAR order divergence must be in fn 20539's callgraph. Fold this into 44.2.7's scope, or add a 44.2.8 subtask after 44.2.7 identifies the real plaintext builder.
3. **Retain `build-fingerprint-plaintext.js` as-is.** The padder + ShiftRows permuter + XTEA + base64 pipeline is structurally correct and round-trips both fixtures byte-identical. 44.2.6 correctly reverse-engineered the pipeline shape; it just attached it to the wrong function. The reference impl is still valid as a replay tool — only the caller-side `obj` construction story needs to be rewritten.
4. **Cancel or rescope 44.4.5 follow-up on `getCaptchaData`.** The export exists in vm-slide but the orchestrator doesn't call it. Options: (a) leave it as documented dead/reserved code and move on, (b) add a narrow task to search for whoever (if anyone) reads `n[4].getCaptchaData` — possibly via a wider dynamic trace across UA branches.
5. **Keep 44.3.5 (real-Chrome differential capture) as planned.** Still valuable — maybe more so now, since it would let us cross-check fn 20539's plaintext build against real Chrome output without trusting the jsdom harness.
6. **Unblock 44.5a (replay-with-substitution builder).** Does not depend on the caller-side question being answered — it replays a captured fingerprint via the already-correct reference impl.
7. **44.5b (from-scratch builder) now depends on 44.2.7**, not 44.4.1. From-scratch synthesis needs the real plaintext-build rules from fn 20539's subtree, not the dead fn 22317/fn 23898 randomiser.
8. **44.6 (tests) unchanged in scope** but will run against whatever 44.5a/44.5b produces.
9. **44.7 (docs closeout)**: revert 44.2.6's reclassification of Phase 42 mechanism; restore the XHR-patch narrative; document fn 22317 as internal/reserved; document fn 20539 as the live Chrome producer.

**Proposed new dispatch order**: **44.2.7** → 44.3.5 → 44.5a → (44.2.8 if needed) → 44.5b → 44.6 → 44.7.

**Director recommends** confirming this revision before dispatching anything. 44.2.7 is the immediate next task and is the foundation for everything downstream — it's worth scoping carefully.

**Alternative (minimal-change)**: if you'd rather not reopen the mental model yet, keep 44.2.7 as the ONLY change and defer the rest until 44.2.7's findings come back. This is the lower-risk path.

---

## Current Task

**Status**: **HELD — plan revision pending user review.** 44.4.5 closed 2026-04-15 with a premise-disproving verdict (see above). No task is in-progress. Director is waiting for user to confirm the proposed restructure in the "Pending Plan Revision" section above before rewriting this block and dispatching the next task.


