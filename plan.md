# Plan

## Status
Current phase: Phase 44 — vm-slide fingerprint schema + JS vData builder (**simplified 2026-04-13 after 44.2.6 pinned fn 22317 = `getCaptchaData` with hardcoded 8-key schema**)
Current task: — (none; 44.2.6 done — Phase 44 downstream scope simplified dramatically; awaiting final plan revision for user review)

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
| 44.3.5 | Real-Chrome differential capture — third fixture from production Chrome; capture target is now the **full 9504-byte verify POST body + its vData ciphertext** pair so 44.4's reduction formula can be cross-checked against a non-jsdom environment | pending |
| 44.4 | **9504→112 reduction formula reversal** — once 44.2.6 names the reduction region, decompile it; determine which of the 39 input fields feed the reduction + the per-accumulator rule. Ground truth: committed HAR fixture has both the 9504-byte body AND the XTEA-decrypted 112-byte output; candidate formulas checkable byte-for-byte. Deliverable: `research/vm-slide-stack-vm/REDUCTION-FORMULA.md` + JS reference impl | pending |
| 44.5a | Replay-with-substitution builder. Reads a captured 9504-byte body + field override map, emits a substituted body. Thin wrapper once 44.5b lands. | pending |
| 44.5b | **From-scratch 9504→112→encrypt pipeline**. `tools/vdata-generator/build-vdata.js`: input = a 39-field verify body (or the subset feeding the reduction); output = 152-char vData string. Pure JS, builds on Phase 43 encoder + 44.4 reduction. Deterministic (no per-run randomness to model). | pending |
| 44.6 | Tests for the plaintext builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' plaintexts → vData strings end-to-end (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the complete plaintext spec; **fix `docs/CAPTCHA_ORCHESTRATOR.md` §517 + §6.2** (whole-body-replacement correction from 44.2.5); mark Phase 44 closed; bump CLAUDE.md Project Memory | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

---

## Current Task

— None. Phase 44 model simplified by 44.2.6; final plan revision awaiting user review.

### The real pipeline (post-44.2.6, byte-verified)

```
orchestrator (t_captcha_slide.js)
    builds 39-field verify body d (9504 bytes)
    builds 8-property fingerprint object obj = { tp, key, py, env, version, cLod, inf, ss }
    calls vm-slide's exports.getCaptchaData(body_string, obj)   <- fn 22317
           |
           v
fn 22317 (pure function, body [22317, 24233]):
    1. hardcoded 8-key array built at pcs 23755..23880: [tp, key, py, env, version, cLod, inf, ss]
    2. sorted alphabetically at pc 23949 via .sort() with comparator fn 23898
       -> sorted order: [cLod, env, inf, key, py, ss, tp, version]
    3. loop 8x: per-field build "key + = + obj[key]" via OP_10 61 at pc 24050
    4. join with "&" at pc 24161 (OP_10 38)
    5. call encryptData via webpack module 40 capture (slot 22) at pc 24163
           -> this is where XTEA happens (fn 15918 / fn 15241 chain)
    6. call base64 encode via webpack module 42 capture (slot 21) at pc 24165
           -> Phase 43 custom alphabet
    7. build "&vData=" literal at pcs 24210..24224 (OP_04 + 7x OP_10)
    8. concat body + "&vData=" + ciphertext at pcs 24225/24228 (OP_20)
    9. return concatenated string at pc 24233 (OP_16 VM_EXIT)
    -> NO savedSend.call anywhere
    -> NO 9504->112 reduction anywhere
```

### What's resolved
- **Field schema**: 8 fields, names hardcoded in bytecode, sorted alphabetically → `cLod=<>&env=<>&inf=<>&key=<>&py=<>&ss=<>&tp=<>&version=<>`.
- **Join mechanism**: fixed-order alphabetical sort of fixed-name schema. No per-run randomness at the sort step. The per-run variability Phase 43 observed in the "plaintext" must come from per-run variability in the field values, not in field order.
- **Cipher path**: confirmed XTEA (fn 15918 chain) + custom base64 (Phase 43 alphabet) via webpack modules 40 and 42 imported into fn 20970 as slots 22 and 21.
- **fn 22317 as `getCaptchaData`**: it is a webpack module export, invoked directly by the orchestrator JS as `getCaptchaData(body, obj)`. NOT reached via XHR monkey-patch.
- **fn 20539 role**: dead code on the Chrome path. fn 20140 does install it as `XMLHttpRequest.prototype.send` at pc 20808, but this install path is never exercised under Chrome/jsdom (either fn 20140 is itself dead, or the orchestrator never calls any XHR-triggering code between fn 20140's install and the `getCaptchaData` direct call). The observed wire behavior is entirely explained by the orchestrator calling `getCaptchaData` directly.
- **Phase 43 cipher encoder**: still byte-identically correct. The `tests/fixtures/vdata-*-capture.json` "plaintext" is the XTEA input fed into webpack module 40's `encryptData`. Re-labeling it "xtea_input_hex" would be more accurate but does not change the bytes.
- **docs/CAPTCHA_ORCHESTRATOR.md**: the §6.2 append-mode correction (from 44.3) is **correct**, but the *mechanism* is not "vm-slide's proxyXHR send patch" — it's "the orchestrator calls vm-slide's `exports.getCaptchaData`". §6.2 needs a further correction by 44.7.

### What's still open (down from "a lot" to "two things")
1. **Per-field value sources**. For each of the 8 fields `(cLod, env, inf, key, py, ss, tp, version)`, what JS expression computes its value inside fn 22317? The 3 nested per-field helper closures inside fn 22317 (entries 22400, 22730, 23399) are where the per-field value-building logic lives. 44.4 now owns decompiling these three helpers and determining value sources.
2. **Orchestrator call site for `getCaptchaData`**. Where inside `t_captcha_slide.js` is `vm-slide.exports.getCaptchaData(body, obj)` actually invoked? What is `obj` at the call site? This is a relatively small static question now that we know what to look for — it's a call to a named import from the vm-slide webpack bundle. (This is what 44.3 should have been; 44.3 found the orchestrator build site for the 39-field verify body but missed the separate call to getCaptchaData.)

### Downstream Phase 44 tasks — proposed redraft (for user review)
- **44.4 (retarget again)** → **Decompile fn 22317's 3 per-field helper closures + webpack module 40** to pin the 8 value-source rules AND confirm whether webpack module 40 is pure XTEA or has any pre-cipher byte transform (which would explain why the observed fixture "plaintext" bytes look garbled vs a clean `cLod=...` string). Ground truth cross-check: once the 8 values are known for a HAR run, the Phase 43 encoder should produce a byte-identical vData from a hand-built plaintext. Deliverable: `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` + a reference JS implementation of `buildFingerprintPlaintext(obj)`.
- **44.3 (subsumed)** → close as done. Its findings about the orchestrator verify-body assembly + the `$.ajax` callsite at byte 163131 stand. The part it missed (where the orchestrator calls `getCaptchaData`) is absorbed into a new micro-task **44.4.5** — static find of the `getCaptchaData` import + invocation site in `sample/t_captcha_slide.js`. Small, ≤1 hour.
- **44.3.5** → keep. Real-Chrome third fixture. Capture target simplifies to the verify POST body + vData string (same as before). Still needed as a cross-check for 44.4's value-source rules across environments.
- **44.5a** → keep. Replay-with-substitution. Substitution target is now the 8 fingerprint-object properties (not the 9504-byte body). Trivial to implement once 44.4 lands.
- **44.5b** → keep, simplified. `tools/vdata-generator/build-vdata.js --from-obj`. Input: the 8 fingerprint-object properties as a JSON object. Output: the 152-char vData string. Just calls the 44.4 reference implementation + Phase 43 encoder. No bytecode walker, no environment probes.
- **44.6** → keep. Unit tests per field source rule + integration tests against all three fixtures end-to-end (jsdom + HAR + real-Chrome). Different agent per impl/tests separation.
- **44.7 (expanded)** → expand `docs/VDATA_FORMAT.md` §1 with the 8-field schema + source-rule table + the fn 22317 `getCaptchaData` entry point. Further corrections to `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 (mechanism is orchestrator-calls-export, not send-patch) and §517 (remove remaining 9504→112 reduction hypothesis that 44.3 introduced; replace with the 8-field schema truth). Mark Phase 44 closed.
- **Parked forever**: The 9504→112 reduction task, the order-mechanism resolution task, the XMLHttpRequest.prototype.send patch mechanism — none of these exist in the real pipeline. fn 20539's "slot 4 contradiction" is also no longer relevant because fn 20539 is dead code; noting it as a curiosity for future researchers but not worth decompiling.

**Director will present the final plan revision on the next user message.** No dispatch until user confirms.

