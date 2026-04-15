# Plan

## Status
Current phase: Phase 44 — vm-slide fingerprint schema + JS vData builder (final revision user-approved 2026-04-13)
Current task: 44.0.1 — Reconcile `sample/vm_slide.js` bytecode vs fixture-generating build (plan revision pending user review 2026-04-15)

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
| 44.0.1 | **[NEW — revision 2026-04-15]** Bytecode build reconciliation — resolve whether `sample/vm_slide.js` matches the fixture-generating build. Grep `output/vm-slide/bytecode.json` for both XTEA key strings (`2e430f8c15b7da96` = Phase 43 constant vs `34e2c8f07b5169ad` = 44.4 subagent's pc 13931 finding). Trace the fn 13860 encrypt path to the key constant it actually references and confirm which key is live. Produce `research/vm-slide-stack-vm/BUILD-RECONCILE.md` (≤2 pages): which key is in the bytecode, where the 44.4 subagent's second key came from (misread vs real), and a verdict: **(A)** `sample/vm_slide.js` IS the fixture-generating build (Finding 2 dismissed), **(B)** there are two keys in one build used on different paths, or **(C)** the fixtures come from a different build entirely. If (C), identify the actual fixture-generating file (candidates: a cached `vm-slide.e201876f.enc.js` in the jsdom harness, a HAR-embedded copy, etc.) and document how to obtain it. Pure static work, ≤30 min. Blocks 44.4.1 and 44.5b. | pending |
| 44.4.1 | **[NEW — revision 2026-04-15]** Sort-order contradiction resolution — re-read fn 22317's `.sort()` call at pc 23949 and the comparator fn 23898 body end-to-end. Determine whether: (i) 44.2.6 misread the sort target pc / the sort call operates on a different array, (ii) fn 23898 is non-lexicographic (perhaps sorts by a hashed / index / reversed value), or (iii) the `.sort()` is conditional on a branch not taken in the fixture runs. Reconcile against both fixture orders (jsdom `[inf,env,tp,key,py,ss,cLod,version]`, HAR `[inf,env,tp,cLod,version,key,ss,py]`). Produce `research/vm-slide-stack-vm/SORT-ORDER-RESOLUTION.md` with the verdict + pseudocode of the comparator. If the comparator is a computable function of `obj`, encode it in `build-fingerprint-plaintext.js` so 44.5b can compute `order` from scratch without caller input. Byte-level cross-check: invoke `buildFingerprintPlaintext({obj})` (no `order` argument) against both fixtures and confirm the computed order matches observed. Depends on 44.0.1. ≤1 hour. Blocks 44.5b. | pending |
| 44.4.5 | **Orchestrator `getCaptchaData` invocation site** — static search in `sample/t_captcha_slide.js` for the import of the vm-slide webpack export `getCaptchaData` and its call site. Pin the JS expression that builds `obj` at the call site and map its 8 properties to orchestrator-side sources (session, ua, timestamps, etc.). Closes the gap 44.3 missed. ≤1 hour static work. | pending |
| 44.3.5 | Real-Chrome differential capture — third fixture from production Chrome; capture target simplifies to the full 9504-byte verify POST body + its 152-char vData string pair; used as a cross-check for 44.4's value-source rules across environments | pending |
| 44.5a | Replay-with-substitution builder. Reads a captured fingerprint object (8 properties) + override map; emits a substituted `obj`; calls into 44.5b's builder. Trivial wrapper after 44.5b lands. | pending |
| 44.5b | **From-scratch `build-vdata.js --from-obj`**. Input: an 8-property fingerprint object JSON. Output: 152-char vData string. Pure JS: replicates fn 22317's alphabetical sort + key=value join, then calls the Phase 43 encoder. Deterministic, no runtime env probing. Depends on 44.4. | pending |
| 44.6 | Tests for the vData builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' vData strings end-to-end from an `(obj, body)` pair (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the 8-field schema + source-rule table + the fn 22317 `getCaptchaData` entry-point narrative; **further correct `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 + §517** (mechanism is orchestrator calls vm-slide webpack export `getCaptchaData`, NOT an XHR monkey-patch on Chrome; remove the 44.3-introduced 9504→112 reduction hypothesis from §517); mark Phase 44 closed; bump CLAUDE.md Project Memory to record the full 4-layer pipeline | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

> **Plan revision 2026-04-15 (pending user approval)**: 44.4 completed and surfaced two facts that warrant insertion of **44.0.1** (bytecode build reconciliation) and **44.4.1** (sort-order contradiction resolution) before continuing. New dispatch order: 44.0.1 → 44.4.1 → 44.4.5 → 44.3.5 → 44.5a → 44.5b → 44.6 → 44.7. Rationale: 44.0.1 is foundational — if `sample/vm_slide.js` isn't the fixture-generating build, every Phase 44 pc reference is suspect, and 44.4.1 would be analyzing the wrong function. 44.4.1 unblocks 44.5b's from-scratch synthesis (reference impl currently requires caller-supplied `order`).

---

## Current Task

**ID**: 44.0.1
**Title**: Bytecode build reconciliation — resolve XTEA key drift surfaced by 44.4
**Phase**: Phase 44 — vm-slide fingerprint schema + JS vData builder
**Status**: pending — revision pending user approval 2026-04-15; dispatch on user trigger only.

### Goal
Resolve the XTEA key drift surfaced by 44.4: the subagent reported `sample/vm_slide.js` bakes key `34e2c8f07b5169ad` at bytecode pc 13931, but both committed fixtures encrypt with `2e430f8c15b7da96` (the Phase 43 constant extracted from the same file). Only one of these can be right. Determine which, and confirm whether `sample/vm_slide.js` IS the fixture-generating build — if not, every bytecode pc cited throughout Phase 44 is suspect and must be re-anchored to the correct build before 44.4.1 and 44.5b can proceed. Deliverable: `research/vm-slide-stack-vm/BUILD-RECONCILE.md` ≤2 pages.

### Context (post-44.4)
- `sample/vm_slide.js` is the source file that `output/vm-slide/bytecode.json` (24,273 elements) was produced from by `research/vm-slide-stack-vm/decoder.js`.
- Phase 43 established that XTEA key `2e430f8c15b7da96` is the bytecode constant — it's recorded in CLAUDE.md Project Memory under "Phase 42" as "with key `2e430f8c15b7da96` (16 ASCII bytes, bytecode constant)". Phase 43's `tools/vdata-generator/xtea.js` encodes this same key into round operations, and round-trips byte-identically against both committed fixtures.
- The 44.4 subagent claimed fn 13860 (webpack module 40 factory entry pc 12655, encrypt body entry pc 13860) calls into a key constructed from `34e2c8f07b5169ad` at pc 13931. This is a direct conflict with Phase 43's established fact.
- Both `tests/fixtures/vdata-jsdom-capture.json` and `tests/fixtures/vdata-har-capture.json` store XTEA key words in their `xtea_key_words_be` field and `xtea_key_hex` — both report `2e430f8c15b7da96`.
- The jsdom fixture was produced by running `tools/scraper/vdata-harness.js` (which loads a vm-slide file into jsdom) against a captured `vm-slide.enc.js` build. The HAR fixture comes from a real Chrome 146 capture. Both use the same key → both targets ran the same vm-slide build, or both builds happen to share the key.
- 44.4 still passed byte-level round-trip verification, which means the padder alphabet (`"0abcdefghijklmnop"` at fn 13989), the ShiftRows PERM table (at fn 14153), and the XTEA key used by the fixtures are mutually consistent. But it does NOT prove the rest of fn 22317 / fn 13860 read by the subagent matches the fixture build.

### Implementation Steps
1. **Grep the bytecode for both key strings.** In `output/vm-slide/bytecode.json` (a JSON array of 24,273 integers/strings), scan for the substring `2e430f8c15b7da96` and `34e2c8f07b5169ad` at string-constant positions. Expected locations: each 16-byte ASCII key appears as either (a) a single string constant emitted by `OP_04`, or (b) a concatenation of shorter chunks. Report the pc ranges for each occurrence.
2. **Trace the fn 13860 encrypt path to the key it actually uses.** Starting from fn 13860 body `[13860, ...]`, follow the opcodes until the XTEA call (module 41). The key is loaded as an argument to the XTEA call. Walk the stack / reg file back from that call site to find which string constant supplied the key. Report the pc of the `OP_04` that built the key and the string's content.
3. **Check pc 13931 directly.** The subagent cited pc 13931 as the location of `34e2c8f07b5169ad`. Read the opcodes at pcs 13920..13945 and confirm what's actually there. If it's a string constant, report its content. If the subagent misread, note what's actually at pc 13931.
4. **Cross-check with Phase 43 extraction.** `tools/vdata-generator/xtea.js` encodes `2e430f8c15b7da96` as 4 uint32 words. Confirm that `research/vm-slide-stack-vm/vdata-dynamic-trace.js` (Phase 43's dynamic oracle) extracted the same key at runtime. Grep for the key string in tracer source to confirm.
5. **Verdict.** Write `research/vm-slide-stack-vm/BUILD-RECONCILE.md` with one of three verdicts:
   - **(A)** `sample/vm_slide.js` IS the fixture-generating build; only key `2e430f8c15b7da96` exists in the bytecode; the subagent's pc 13931 reading was a misread (explain what's actually there). Finding 2 dismissed. Phase 44 decompile work stands as-is.
   - **(B)** Both keys exist in `sample/vm_slide.js`; different paths use different keys. Explain which path each key is used on and which one the `encryptData` export takes. Phase 44 decompile work needs to follow the live path.
   - **(C)** `sample/vm_slide.js` and the fixture-generating build are different. Identify the actual fixture-generating file (candidates: the harness may cache `vm-slide.e201876f.enc.js` or similar under `tools/scraper/`, the HAR fixture may contain the URL the real Chrome captured). Document how to obtain the correct build and decode it into a separate `output/vm-slide-fixture/bytecode.json`. Phase 44 must then be re-anchored against that bytecode.

### Verification
- [ ] `research/vm-slide-stack-vm/BUILD-RECONCILE.md` exists with one of the three verdicts clearly stated.
- [ ] Grep results for both key strings against `output/vm-slide/bytecode.json` are reported with pc ranges.
- [ ] pc 13931's actual content is reported verbatim — either confirming or refuting the 44.4 subagent's reading.
- [ ] The fn 13860 encrypt path → XTEA call → key-argument chain is traced and the string constant supplying the key is identified by pc.
- [ ] If verdict (C), the path to the correct fixture-generating build is documented and a plan for re-anchoring is provided.
- [ ] No modifications to: `targets/`, `sample/`, `tools/vdata-generator/`, `tests/fixtures/`, `docs/`, or any existing `research/vm-slide-stack-vm/FN-*-DECOMPILE.md` / `FINGERPRINT-SCHEMA.md` / `PLAINTEXT-BUILD.md` / `build-fingerprint-plaintext.js`. New artifacts only.

### Constraints
- **Do not make any git commits.** Director owns all commits.
- **Do not modify `targets/` or `sample/`.** Tencent's property.
- **Pure static analysis.** No tracers, harnesses, jsdom runs.
- **Verify, don't assume.** Every claim must reference a specific pc in `output/vm-slide/bytecode.json`.
- **If the task is too difficult or impossible**, stop immediately and report. Do not leave broken files.

### Reporting
1. Grep results: pc ranges for `2e430f8c15b7da96` and `34e2c8f07b5169ad` in `output/vm-slide/bytecode.json`.
2. pc 13931 actual content.
3. fn 13860 → XTEA call → key pc trace.
4. Verdict (A/B/C) with one-paragraph justification.
5. Path to `BUILD-RECONCILE.md`.

### Suggested Agent
`general-purpose` — pure bytecode grep + pc walk. Expected ≤30 min.


