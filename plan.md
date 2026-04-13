# Plan

## Status
Current phase: Phase 44 — vm-slide 9504→112 reduction reversal (**re-pivoted 2026-04-13 after 44.3 found the orchestrator does NOT build a 112-byte body; vm-slide reduces the 9504-byte verify body into the 112-byte XTEA input**)
Current task: — (none; 44.3 done, Phase 44 tasks 44.4/44.5b awaiting second plan revision)

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
| 44.3 | **Orchestrator plaintext-build JS-level trace** — hook `XHR.prototype.send` before vm-slide's proxyXHR install, capture the 112-byte body + JS stacktrace, back-walk in `t_captcha_slide.js` to name the orchestrator function that assembled it + pin the ciphertext's path to the verify POST | done (static-fallback; **inverted Phase 44 model** — orchestrator builds 39-field 9504-byte body, vm-slide reduces it to 112 bytes) |
| 44.3.5 | Real-Chrome differential capture via Puppeteer — third fixture from production Chrome; capture target is the orchestrator pre-encrypt body + surrounding verify POST body | pending |
| 44.4 | **Orchestrator 8-field schema pin** — run the 44.3 harness ≥20x across jsdom + real Chrome; for each captured plaintext parse the 8 `key=value` pairs; determine field names, value-source rules, order-mechanism, per-run variability source | pending |
| 44.5a | Plaintext builder: replay-with-substitution. `tools/vdata-generator/build-plaintext.js` reads a captured plaintext + field-value override map, emits a substituted 112-byte plaintext. Early Stream-B checkpoint. | pending |
| 44.5b | **Plaintext builder: from-scratch JS synthesis**. Extends 44.5a with `--from-env` — consumes a JS environment description, emits a fresh 112-byte plaintext matching 44.4's schema + order distribution. Pure JS, not a bytecode walker. Depends on 44.4. | pending |
| 44.6 | Tests for the plaintext builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' plaintexts → vData strings end-to-end (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the complete plaintext spec; **fix `docs/CAPTCHA_ORCHESTRATOR.md` §517 + §6.2** (whole-body-replacement correction from 44.2.5); mark Phase 44 closed; bump CLAUDE.md Project Memory | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

---

## Current Task

— None. Phase 44 awaiting second plan revision (third-level re-pivot).

**Status after 44.3 (2026-04-13)**: 44.3's investigation met its verification checklist (build-site located, docs corrected, tests green) but the **finding itself inverts the pivot model I took the user through on 2026-04-13**. Director-verified against the HAR fixture `sample/captcha-har.har`:
- The verify POST body is **9504 bytes** with **39 fields** joined by `&`. `vData` appears as the 40th (last-ish) field at **152 chars**.
- There is **no** `xhr.send(<112-byte body>)` call anywhere. The orchestrator builds a standard multi-field form body via Zepto's `$.ajax({data: d})` where `d` is a 39-field JS object assembled inside module 56 function `Y` (`sample/t_captcha_slide.js` byte range [159126, 167171], `$.ajax` callsite at byte 163131).
- vm-slide appends `&vData=<ciphertext>` onto the outgoing 9504-byte body. The `&vData=` literal is built inside vm-slide bytecode at pcs **24211..24223** via `OP_10 38 118 68 97 116 97 61` — director byte-verified directly from `output/vm-slide/bytecode.json`.
- The `&vData=` literal lives inside a **different function than fn 20539** — specifically fn 22317 (body range approximately [22317, 24234], based on FUNC_CREATE at pc 24234 targeting entry 22317). fn 20539's body [20539, 20796] contains zero `OP_10 61` or `OP_10 38` instructions, consistent with 44.2.5's static claim. Both facts are simultaneously true — vm-slide has more than one relevant function.
- **Phase 43's "112-byte plaintext" was never a wire-observable buffer.** Phase 43 computed it by running XTEA decrypt on the observed 152-char vData ciphertext. The 112-byte result has 8 `=` / 7 `&` shape, but it is a **VM-internal XTEA input**, not something any XHR body ever contained. The label "plaintext" in `tests/fixtures/vdata-*-capture.json` has been misleading since Phase 43.1.

**Corrected model (post-44.3)**:
```
orchestrator (module 56 fn Y)
    builds 39-field JS object d
    calls Zepto $.ajax({data: d})         <- d has 39 fields
    which calls xhr.send(urlencoded d)    <- 9504-byte body
      |
      v
vm-slide's installed XMLHttpRequest.prototype.send replacement
    (some function that uses fn 22317's `&vData=` literal at pc 24211;
     relationship to fn 20539 NOT YET RECONCILED)
    reduces the 9504-byte body to a 112-byte XTEA input
    (44.3 hypothesizes a 6-bit / base64-style accumulator reduction
     based on OP_08 63 / OP_08 6 / OP_08 31 mask-shift patterns at
     pcs 19221..19443 and 24023..24084; NOT YET VERIFIED)
    XTEA-encrypts via fn 15918 / fn 15241 chain
    base64s via Phase 43 custom alphabet
    appends "&vData=" + <152-char ciphertext> to the 9504-byte body
    forwards to savedSend.call(this, body + "&vData=" + ciphertext)
    which actually sends over the wire
```

**What still holds from prior tasks**:
- 44.1 (encrypt-callsite back-walk): solid. fn 15918 @ pc 16182 is the 14x XTEA call site.
- 44.2 (fn 15918 decompile): solid for the XTEA loop. The arg-to-local mapping for slot 4 is still ambiguous (first-loop reads slot 4 as 16-byte sliceable buffer) but this does not affect the reduction-formula question.
- 44.2.5 (fn 20539 decompile): solid for fn 20539 internally. But 44.2.5's **conclusion** that fn 20539 is "the" installed send replacement with "whole-body replacement" is **incomplete** — fn 20539 may be a secondary helper (e.g. a `.call`/`.apply` handler replacement, or a different code path) while fn 22317 is the actual `.send` replacement that does the append-mode rewrite. 44.2.5's bytecode-level claims about fn 20539's body stand; the functional-role claim does not.

**What needs to change**:
1. New task **44.2.6 — fn 22317 full static decompile + reconciliation with fn 20539** (~1–2 hours, ~1917 instructions in [22317, 24234]). Analogous to 44.2.5 but for the fn 22317 body. Must answer: (i) is fn 22317 the actual installed `XMLHttpRequest.prototype.send` replacement? (ii) is fn 20539 a sibling, a helper, or dead code? (iii) what does the prologue of fn 22317 do with its argument 0 — does it reduce it to 112 bytes, or does it dispatch to fn 20539 or to fn 15918 directly?
2. **Retarget 44.4** from "orchestrator 8-field schema pin" to **"9504→112 reduction formula reversal"**. Decompile the reduction region (will be named by 44.2.6). Determine which of the 39 fields feed into the reduction, how the 8 accumulators are shaped, and what the per-accumulator rule is. Ground truth: the committed fixtures give us both the 9504-byte body (HAR) and the 112-byte XTEA input (decrypted from vData) — so we can check any candidate reduction formula byte-for-byte against the fixtures.
3. **Retarget 44.5b** from "from-scratch JS environment fingerprint builder" to **"from-scratch JS 9504→112→encrypt pipeline"**. Input: a 39-field verify POST body shape (or just the fields the reduction consumes). Output: the 152-char vData string. This is substantially easier than the original 44.5b draft because the reduction is deterministic given the input body — no per-run variability to model except whatever the reduction itself introduces.
4. **44.5a (replay-with-substitution)** — still structurally valid but the substitution target is now "the 9504-byte body", not "the 112-byte intermediate". Likely ships as a slim wrapper that just calls 44.5b with a modified body.
5. **44.6, 44.7** — structurally unchanged.
6. **44.3.5 (real-Chrome capture)** — capture target shifts from "orchestrator pre-encrypt body" to "the full verify POST body + vData ciphertext pair". Still produces a third fixture. Unchanged shape.

**Also noted**: 44.3 wrote surgical edits to `docs/CAPTCHA_ORCHESTRATOR.md` §517 and §6.2 — these corrections are **mostly** right (the §6.2 append-mode correction matches HAR evidence; the §517 "not-a-JS-environment-fingerprint" correction is right) but they rest on 44.3's un-verified claim about fn 22317 being the installed send replacement. Director will commit them as-is because (a) they are strictly better than the current text and (b) 44.2.6 will refine them further if fn 22317's actual role differs.

**Director will present the revised plan on the next user message.** No dispatch until user confirms the second revision.

