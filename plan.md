# Plan

## Status
Current phase: Phase 44 — vm-slide fingerprint schema + JS vData builder (final revision user-approved 2026-04-13)
Current task: 44.4 — Per-field value-source pin + pre-cipher transform check (pending dispatch)

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
| 44.4 | **Per-field value-source pin + pre-cipher transform check** — decompile fn 22317's 3 non-comparator nested helpers (entries 22400, 22730, 23399) + spot-check webpack module 40 for any pre-XTEA byte transform; produce an 8-row schema table `(field_name, source_rule)`; deliver `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` + a reference JS `buildFingerprintPlaintext(obj)`. Cheap pre-check: split fixture XTEA-input hex on `&`/`=` and see whether the 8 keys match `[cLod, env, inf, key, py, ss, tp, version]` before decompiling — if they do, 44.4 is confirmation work. | pending |
| 44.4.5 | **Orchestrator `getCaptchaData` invocation site** — static search in `sample/t_captcha_slide.js` for the import of the vm-slide webpack export `getCaptchaData` and its call site. Pin the JS expression that builds `obj` at the call site and map its 8 properties to orchestrator-side sources (session, ua, timestamps, etc.). Closes the gap 44.3 missed. ≤1 hour static work. | pending |
| 44.3.5 | Real-Chrome differential capture — third fixture from production Chrome; capture target simplifies to the full 9504-byte verify POST body + its 152-char vData string pair; used as a cross-check for 44.4's value-source rules across environments | pending |
| 44.5a | Replay-with-substitution builder. Reads a captured fingerprint object (8 properties) + override map; emits a substituted `obj`; calls into 44.5b's builder. Trivial wrapper after 44.5b lands. | pending |
| 44.5b | **From-scratch `build-vdata.js --from-obj`**. Input: an 8-property fingerprint object JSON. Output: 152-char vData string. Pure JS: replicates fn 22317's alphabetical sort + key=value join, then calls the Phase 43 encoder. Deterministic, no runtime env probing. Depends on 44.4. | pending |
| 44.6 | Tests for the vData builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' vData strings end-to-end from an `(obj, body)` pair (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the 8-field schema + source-rule table + the fn 22317 `getCaptchaData` entry-point narrative; **further correct `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 + §517** (mechanism is orchestrator calls vm-slide webpack export `getCaptchaData`, NOT an XHR monkey-patch on Chrome; remove the 44.3-introduced 9504→112 reduction hypothesis from §517); mark Phase 44 closed; bump CLAUDE.md Project Memory to record the full 4-layer pipeline | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

---

## Current Task

**ID**: 44.4
**Title**: Per-field value-source pin + pre-cipher transform check
**Phase**: Phase 44 — vm-slide fingerprint schema + JS vData builder
**Status**: pending — awaiting user dispatch trigger (final revision approved 2026-04-13).

### Goal
For each of vm-slide's hardcoded 8 fingerprint fields (`tp`, `key`, `py`, `env`, `version`, `cLod`, `inf`, `ss` — sorted alphabetically to `[cLod, env, inf, key, py, ss, tp, version]`), determine the value-source rule — i.e. for each field, what JS expression inside fn 22317 (or its nested helpers) produces the value that gets joined into `key=value` pairs. Also spot-check whether webpack module 40's `encryptData` applies any pre-XTEA byte transform to the joined string (candidate: UTF-8 escaping, URL encoding, prefix/suffix, or per-byte obfuscation), since the fixture XTEA-inputs look garbled vs a clean `cLod=...&env=...` read. Deliverable: `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` with an 8-row table + a reference JS `buildFingerprintPlaintext(obj)` function + a byte-identical cross-check against the committed fixtures.

### Context (post-44.2.6, byte-verified)
- fn 22317 (body `[22317, 24233]`) is `exports.getCaptchaData`, a pure function bound at pc 24252 inside parent fn 20970.
- fn 22317's signature is `(body_string, obj) → body_string + "&vData=" + ciphertext`.
- The 8 field names are hardcoded strings built at pcs 23755..23880 via `OP_04 + OP_10` chains. Sorted alphabetically at pc 23949 via `.sort()` with comparator fn 23898 (one of four nested FUNC_CREATEs inside fn 22317).
- 8-iteration loop at pcs 23995..24083 builds `key + "=" + obj[key]` per field; `=` is `OP_10 61` at pc 24050.
- Join with `"&"` at pc 24161 (`OP_10 38`).
- Cipher delegated to webpack modules 40 (`encryptData`, slot 22 capture) at pc 24163 and 42 (`encode`, slot 21 capture) at pc 24165.
- fn 22317 has **four nested FUNC_CREATEs**: entry 22400, 22730, 23399, 23898. Per 44.2.6's report, **fn 23898 is the `.sort()` comparator**; the **other three (22400, 22730, 23399) are per-field value-build helpers** and are not yet decompiled.
- vm-slide has a webpack-style module system internally. fn 20970 is the module factory that exports `getCaptchaData`. It imports webpack modules 40 and 42 into fn 22317 via the slot-22 / slot-21 captures (see `FN-22317-DECOMPILE.md` for the capture pair details).
- Phase 43's `tools/vdata-generator/encode.js`'s `encodeVData(112-byte buffer)` produces a byte-identical 152-char vData against both `tests/fixtures/vdata-jsdom-capture.json` and `tests/fixtures/vdata-har-capture.json`. So **Phase 43 already round-trips the cipher half byte-for-byte** — whatever happens inside webpack module 40's `encryptData` ultimately matches classical XTEA (32 rounds, delta `0x9E3779B9`, LE uint32 packing, key `2e430f8c15b7da96`). If module 40 includes a pre-transform, Phase 43's encoder must already absorb it into its "plaintext" input. This is important: **if we feed the exact correct pre-transformed string to Phase 43's encoder, we get the fixture vData**.

### Cheap first step — split-on-`&/=` pre-check (DO THIS FIRST)
Before decompiling anything, run this sanity check against both committed fixtures:

```js
// Both fixtures store the XTEA input as plaintext_hex (jsdom) / har_decrypted_plaintext_hex (HAR).
const hex = require('./tests/fixtures/vdata-har-capture.json').har_decrypted_plaintext_hex;
const str = Buffer.from(hex, 'hex').toString('binary'); // or 'latin1' / utf8 as appropriate
const pairs = str.split('&');                           // should be 8 chunks
const kv = pairs.map(p => {
  const eq = p.indexOf('=');
  return { k: p.slice(0, eq), v: p.slice(eq + 1) };
});
console.log(kv.map(x => x.k));  // expected: [cLod, env, inf, key, py, ss, tp, version]
```

**Two possible outcomes**:
1. **Clean split** — if the 8 `k` values exactly equal the hardcoded schema, then `encryptData` is pure XTEA-and-base64 with no pre-transform, and the 44.4 task collapses to reading off `(k, v)` pairs from both fixtures to infer value-source rules empirically. 44.4 becomes a short analysis task, not a full decompile.
2. **Garbled keys** — if the `k` values are not recognizable as the hardcoded schema, there IS a pre-cipher transform inside webpack module 40. 44.4 then has to decompile module 40 to find the transform + decompile fn 22317's 3 per-field helpers to pin value sources. Full static decompile work.

Report which outcome you see as the first sentence of your reply, before any other work. If outcome (1), skip directly to the 3-helper decompile with empirical cross-check. If outcome (2), decompile module 40 first, then the 3 helpers, then rebuild.

### Implementation Steps
1. **Run the split-on-`&/=` pre-check** against both committed fixtures. Record the result. Decide outcome (1) or (2).
2. **Decompile fn 22317's 3 per-field helpers** — entries 22400, 22730, 23399. Each is a nested closure spawned by a FUNC_CREATE inside fn 22317's body `[22317, 24233]`. Find the 3 FUNC_CREATE sites by scanning fn 22317's body for `OP_58` opcodes whose target matches 22400 / 22730 / 23399. Those spawn sites tell you the capture pairs, which tell you the closure's upvalues. Then decompile each helper's body end-to-end following the same methodology as 44.2.5 (fn 20539) and 44.2.6 (fn 22317). For each helper, determine:
   - **Which field(s) it builds a value for.** A helper might handle one field or multiple. Use the call sites inside fn 22317's 8-iter loop to see which keys invoke which helper.
   - **The value-source rule.** Common candidates: constant string, property read on `obj` (`obj[fieldName]`), property read on a captured closure upvalue, runtime read (unlikely per 44.2.5/44.2.6 evidence), string concatenation of several of the above, `toString()`-on-something, etc.
3. **Cross-check the schema against both fixtures.** For each committed fixture, use the values observed in the XTEA input (via the split from step 1 or via field-position analysis if the split was garbled) and verify they match what each helper's value-source rule would produce. If the fixtures agree with the rules, the schema is pinned; if not, the rule(s) need refinement.
4. **If webpack module 40 needs decompiling (outcome 2)**: module 40 is imported into fn 20970 and captured into fn 22317 slot 22. Find its entry pc by tracing the webpack `__webpack_require__(40)` mechanism inside fn 20970. Phase 41's tooling under `research/captcha-orchestrator/parse-bundle.js` can help if vm-slide uses the same webpack structure (likely; both bundles are webpack 4). Once module 40's entry pc is known, decompile its `encryptData` export (whatever function it exports). Determine whether it is pure XTEA or has a pre-transform.
5. **Implement a reference JS `buildFingerprintPlaintext(obj)`** that replicates fn 22317 steps 1-4 (hardcoded schema, alphabetical sort, loop-build `key=value` pairs, join with `&`) plus any pre-transform from webpack module 40. Keep it under `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` for now (44.5b will productize it into `tools/vdata-generator/build-vdata.js`). **Cross-check byte-identically**: `Phase43encoder(buildFingerprintPlaintext(fixtureObj)) === fixtureVdataString` must hold for both `tests/fixtures/vdata-jsdom-capture.json` and `tests/fixtures/vdata-har-capture.json`. If it does not, the schema or the pre-transform (or both) is wrong; iterate.
6. **Write `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md`** with:
   - **Summary** (≤10 lines; outcome of the split pre-check + the verdict on whether module 40 has a pre-transform).
   - **Pre-check result** — the 8 `(k, v)` pairs for each fixture as they split from the hex, commented with hex-byte slices.
   - **Per-field source-rule table** — 8 rows, columns `(sorted_name, hardcoded_pc_range, helper_function, source_rule, jsdom_fixture_value, har_fixture_value)`.
   - **Pre-transform finding** (if any) — the webpack module 40 `encryptData` behavior between the joined string and the XTEA input. If pure XTEA with no pre-transform, state that explicitly.
   - **Reference JS implementation** — inline the `buildFingerprintPlaintext(obj)` code, or reference the committed file.
   - **Byte-identical cross-check evidence** — the exact lines of output from running the reference impl against both fixtures, showing the expected vs actual vData strings match.
   - **Open questions** — anything you could not resolve.

### Verification
- [ ] `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` exists with all six sections.
- [ ] The split pre-check result is stated unambiguously in the Summary first sentence.
- [ ] The 8-row per-field source-rule table has a row per sorted field name with a pinned source rule (or an explicit "unknown — refer to open questions" entry, with justification).
- [ ] `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` exists and exports a `buildFingerprintPlaintext(obj)` function.
- [ ] `Phase43encoder(buildFingerprintPlaintext(fixtureObj)) === fixtureVdataString` holds **byte-identically** for both the jsdom fixture and the HAR fixture. Show the comparison output in the deliverable.
- [ ] If decompiling module 40 was required, its entry pc and behavior are documented (not handwaved).
- [ ] `npm test` passes at **411/411**.
- [ ] No modifications to: `targets/`, `sample/`, `tools/vdata-generator/` (44.5b owns productization), `tests/fixtures/`, `docs/`, or any existing `research/vm-slide-stack-vm/FN-*-DECOMPILE.md` / `PLAINTEXT-BUILD.md` / `plaintext-callgraph.md` / `vdata-*-trace.js`. New artifacts only.

### Constraints
- **Do not make any git commits.** Director owns all commits.
- **Do not modify `targets/` or `sample/`.** Tencent's property.
- **Verify, don't assume.** Every claim must trace to a specific bytecode pc OR a reproducible byte-level cross-check against a fixture.
- **Byte-level verification of load-bearing static claims must be done globally, not scoped to one function.** The 44.2.5 scope error was function-scoped and missed fn 22317 entirely. For any claim like "module 40 has no pre-transform", cross-check by running the pure encoder against a hand-built plaintext and comparing against the fixture vData.
- **Try the cheap split-on-`&/=` pre-check FIRST.** It may collapse the entire task to a trivial empirical analysis. Do not jump straight to decompiling three helpers before checking the fixture structurally.
- **Do not productize into `tools/vdata-generator/`.** That is 44.5b's scope. The reference implementation for 44.4 lives under `research/vm-slide-stack-vm/` as a throwaway verification artifact.
- **Do NOT re-run any tracers, harnesses, or jsdom environments.** Pure static analysis + fixture byte-level cross-check.
- **If outcome (2) and decompiling module 40 is genuinely infeasible within this task scope**, report what you established, propose splitting the task, and stop. Do not leave broken files. Classification "partial — module 40 deferred to 44.4.x" is acceptable as long as the 3 fn 22317 helpers are done and the split pre-check is recorded.

### Reporting
Report back in this order:
1. **Pre-check outcome first, one sentence**: outcome (1) clean split / outcome (2) garbled keys.
2. For outcome (1): the 8 `(k, v)` pairs for each fixture.
3. For each of the 3 per-field helpers (entries 22400, 22730, 23399): which field(s) it builds and its value-source rule.
4. Pre-transform finding (module 40 is pure XTEA or has transform X).
5. Byte-identical cross-check result (`buildFingerprintPlaintext(obj) → encodeVData → fixture vData` byte-for-byte).
6. Path to `FINGERPRINT-SCHEMA.md` and `build-fingerprint-plaintext.js`.
7. `npm test` tail confirming 411/411.
8. Open questions for 44.4.5 / 44.5b / 44.7.

### Suggested Agent
`general-purpose` — static bytecode reading + fixture byte-level cross-check. Same shape as 44.2.5, 44.2.6. Expected ≤2 hours.

