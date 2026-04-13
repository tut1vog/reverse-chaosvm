# Plan

## Status
Current phase: Phase 44 — vm-slide plaintext fingerprint reversal (**planned 2026-04-13, awaiting user dispatch trigger**)
Current task: 44.1 — Encrypt-callsite back-walk + plaintext-build call graph (pending; user will trigger dispatch later — director must NOT auto-dispatch)

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
| 44.1 | Encrypt-callsite back-walk + plaintext-build call graph (static + runtime caller-PC capture) | pending |
| 44.2 | Plaintext-build static decompile to pseudocode — `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md` | pending |
| 44.3 | Dynamic property-read instrumentation — tap OP_47/OP_60/string-build inside the plaintext-build pc range, dump every `(object, key, value)` tuple, cross-check against the captured 112-byte plaintext to identify the 8 fields | pending |
| 44.3.5 | Real-Chrome differential capture via Puppeteer — capture a third fixture from production Chrome using the `tools/captcha-solver/` infrastructure; cross-validate the schema from 44.3 against a non-jsdom environment | pending |
| 44.4 | Per-run order resolution — run the instrumented harness ≥20 times across both jsdom and real Chrome, determine whether order varies (memory iteration) or content varies (internal salt); blocking for 44.5b | pending |
| 44.5a | Standalone plaintext builder — replay-with-substitution. `tools/vdata-generator/build-plaintext.js` (initial form) reads a captured plaintext + a field-value override map and emits a substituted 112-byte plaintext. Early Stream-B checkpoint that validates the schema from 44.2/44.3 without depending on 44.4. | pending |
| 44.5b | Standalone plaintext builder — full synthesis. Extends 44.5a with a from-scratch builder that reads a JS environment description and emits a fresh 112-byte plaintext matching the order distribution from 44.4. Adds `--from-env` CLI flag. Depends on 44.4. | pending |
| 44.6 | Tests for the plaintext builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' plaintexts → vData strings end-to-end (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the now-complete plaintext spec; mark Phase 44 closed in `plan.md` + `research/vm-slide-stack-vm/README.md`; bump `CLAUDE.md` Project Memory to record full end-to-end byte-identical vData reproducibility | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

---

## Current Task

**ID**: 44.1
**Title**: Encrypt-callsite back-walk + plaintext-build call graph
**Phase**: Phase 44 — vm-slide plaintext fingerprint reversal
**Status**: pending — Phase 44 plan accepted (9-task variant, user-confirmed 2026-04-13). User explicitly deferred dispatch — director must wait for an explicit "go" / "dispatch 44.1" / equivalent before invoking the subagent. **Do not auto-dispatch even if the user sends an unrelated message next.**

### Goal
Identify the function (or chain of functions) inside vm-slide's `proxyXHR` body that constructs the 112-byte plaintext buffer fed into the encrypt closure at pc 15241. Produce a directed call graph from XHR-`send` entry to the encrypt callsite, plus the bytecode pc ranges that 44.2 will decompile.

### Context
The encrypt closure entry is bytecode pc **15241**, instantiated at pc 15404 by `OP_58 15241 0 2 3 4` (FUNC_CREATE with 3 args, key in local 4). The closure is stored into Tencent's module-export table and invoked indirectly — there is no inline call to it at pc 15404. Phase 40.6 noted this opacity and Phase 43.1 worked around it by tapping the closure entry directly via `vdata-dynamic-trace.js`'s instrumented dispatch loop.

For 44.1 we need the **caller side**: which function in the proxyXHR pc range (~19500..20800, with possible upstream call sites) builds the args before each encrypt call? Two complementary approaches:

1. **Static back-walk**. Search the disassembly for every `OP_58` / `OP_60` site that could plausibly invoke the encrypt closure via the module-export indirection. Cross-reference with the FUNC_CREATE-based function-entry table to find the smallest function that contains those calls.
2. **Runtime caller-PC capture**. Extend `vdata-dynamic-trace.js` with a tap that, on every entry to the encrypt closure (pc 15241), records the **return PC** from the call frame (or equivalently, the most recent dispatch loop PC immediately before the call). Run once and dump the 14 caller PCs. The smallest contiguous range covering all 14 is the plaintext-build region.

### Inputs
- `output/vm-slide/disassembly-full.txt` (Phase 40.1 walker output, all 14,134 reachable instructions).
- `output/vm-slide/bytecode.json`.
- `research/vm-slide-stack-vm/walker.js` (control-flow walker — has the function-entry table).
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` (existing instrumentation — extend).
- `tests/fixtures/vdata-jsdom-capture.json` (oracle).
- `docs/VM_SLIDE_OPCODES.md` (call/return opcode semantics).

### Implementation Steps
1. From `walker.js`'s function-entry table, list every reachable function entry whose body contains an `OP_58` referencing pc 15241 (instantiation) or any `OP_60` / `OP_58` whose target lives downstream of the module-export table.
2. Add a runtime caller-PC tap to a copy of `vdata-dynamic-trace.js` (do NOT modify the original — make `vdata-callgraph-trace.js` next to it). Capture the dispatch loop PC immediately preceding each entry into pc 15241. Run once, dump the 14 caller PCs.
3. Identify the smallest set of function entries containing all 14 caller PCs. That set is the plaintext-build region.
4. Write `research/vm-slide-stack-vm/plaintext-callgraph.md` documenting: the encrypt callsite chain, the function-entry list to be decompiled in 44.2, the dispatch tree (with a small ASCII diagram), and the runtime PC capture results.
5. Cross-check: the captured caller PCs should be inside the regions 44.1's static back-walk identified.

### Verification
- [ ] `research/vm-slide-stack-vm/vdata-callgraph-trace.js` exists and produces a 14-element caller-PC list when run against `sample/vm_slide.js` via the same jsdom harness pattern as `vdata-dynamic-trace.js`.
- [ ] Caller PCs match (or are sub-ranges of) the static back-walk results.
- [ ] `research/vm-slide-stack-vm/plaintext-callgraph.md` exists with the call graph, function-entry list, and PC-range output for 44.2.
- [ ] No modifications to `research/vm-slide-stack-vm/vdata-dynamic-trace.js`, `tools/vdata-generator/`, `tests/fixtures/`, `targets/`, or `sample/`.
- [ ] `npm test` 411/411 unchanged.

### Suggested Agent
`general-purpose` — bytecode disassembly walking + jsdom instrumentation extension. Same shape of work as 43.1.

### Goal
Add a `node --test` test file (or files) under `tests/` that exercises `tools/vdata-generator/{xtea.js, custom-base64.js, encode.js}` and asserts byte-identical output against both committed fixtures. Wire `tests/fixtures/verify-vdata-fixtures.js` into the suite as a sanity check. Per impl/tests separation rule, this MUST be a different agent than the one that wrote 43.3.

### Context
43.3 shipped `tools/vdata-generator/` with `xtea.js` (classical XTEA), `custom-base64.js` (standard b64 with custom 65-char alphabet, index-64 padding), `encode.js` (`encodeVData`, `encryptOnly`, hardcoded XTEA key), and `cli.js`. Director-verified round-trips:
- `encodeVData(Buffer.from(jsdom.plaintext_hex, 'hex')) === jsdom.vdata_string` ✅
- `encodeVData(Buffer.from(har.har_decrypted_plaintext_hex, 'hex')) === har.har_vdata_string` ✅
- CLI stdin + arg form both produce the matching string ✅
- CLI rejects bad input with exit 2 + clear error message ✅

The existing test layout uses `node --test` with files named `tests/test-*.js`. See `tests/test-token-generator.js` for the closest analog (standalone cipher tool with fixture-based byte-identical assertions).

### Inputs
- `tools/vdata-generator/{xtea.js, custom-base64.js, encode.js, cli.js}` — subject under test.
- `tests/fixtures/{vdata-jsdom-capture.json, vdata-har-capture.json}` — committed fixtures.
- `tests/fixtures/verify-vdata-fixtures.js` — independent reference verifier from 43.2.
- `tests/test-token-generator.js` — example test file to mirror in style.

### Implementation Steps
1. Create `tests/test-vdata-generator-encoder.js` (or similar — match existing naming) using `node:test` + `node:assert/strict`.
2. Top-level fixture round-trip suite: load both JSON fixtures and assert `encodeVData(Buffer.from(plaintext_hex, 'hex')) === expected_vdata_string` for each. Also assert `encryptOnly(...).toString('hex') === ciphertext_hex` for each.
3. XTEA unit tests: round-trip random and edge-case 8-byte blocks (`xteaEncryptBlock`/`xteaDecryptBlock`); buffer-level `xteaEncryptLE`/`xteaDecryptLE` round trip on multi-block inputs; reject non-multiple-of-8 with clear error; `keyFromHex` rejects wrong-length hex.
4. Custom base64 unit tests: encode/decode round trip on 1..8 byte inputs (covering all 3 padding cases: 0/1/2 chars trailing); confirm hardcoded alphabet length is 65 and `PADDING_CHAR_INDEX === 64`; decode rejects non-alphabet chars; encode of exactly 112 bytes always ends in `YY`.
5. `encode.js` API tests: 112-byte plaintext requirement enforced (wrong length throws with a message mentioning Phase 44); accepts both Buffer and hex string input forms; produces 152-char output; rejects bad type input (TypeError).
6. Wire `tests/fixtures/verify-vdata-fixtures.js` into the suite as a sanity check — either by `require()`ing its exported functions and asserting both round-trips, or by spawning it as a subprocess and asserting exit 0. Either is fine; pick whichever matches the existing test patterns.
7. Run `npm test` and confirm new tests pass and the total goes from 353 → 353+N green.

### Verification
- [ ] New test file(s) under `tests/` follow `tests/test-*.js` naming and use `node:test` + `node:assert/strict`.
- [ ] `npm test` passes; total test count strictly greater than 353; no failures.
- [ ] Both fixture round-trips (jsdom + HAR) are asserted in the new tests, not just smoke-checked.
- [ ] At least one unit test each for `xtea.js`, `custom-base64.js`, and `encode.js` public surfaces.
- [ ] Edge cases covered: wrong plaintext length, non-multiple-of-8 XTEA input, non-alphabet base64 chars, wrong-type input to `encodeVData`.
- [ ] `tests/fixtures/verify-vdata-fixtures.js` still exits 0 standalone AND its checks are re-asserted from inside the suite.
- [ ] No edits to `tools/vdata-generator/` (the encoder is the subject under test, not under modification).
- [ ] No new dependencies in `package.json`.
- [ ] No writes to `targets/`, `sample/`, `tools/scraper/`, `research/`, or `tests/fixtures/`.

### Warnings
- **Different agent than 43.3.** This is a hard rule from the director's impl/tests separation policy. The agent writing tests must approach the encoder as a consumer, not as the author. Do not modify the encoder to make tests easier — file a remediation back to the director if you find a real bug.

### Suggested Agent
`general-purpose` — straightforward Node test authoring against an existing module + fixtures. Different agent instance than the one that did 43.3.

### Goal
Produce two committed test fixtures under `tests/fixtures/` that 43.3's encoder can target for byte-identical verification, and resolve the 43.1 open caveat about whether vm-slide's custom base64 alphabet at bytecode pc 16932 is 64 or 65 chars. No encoder code yet — 43.2 is fixture capture + spec confirmation.

### Context
43.1 left two deferred items blocking 43.3 impl:

1. **Non-idempotent live_run in `output/vm-slide/vdata-pipeline.json`** — `live_run.vdata` and `live_run.ciphertext_hex` vary per run because jsdom's object-enumeration order is non-deterministic and (likely) vm-slide uses an internal salt. The stable fields (`xtea_key_hex`, `encrypt_entry_pc`, `har_reference`, `plaintext_blocks` structure) are stable across re-runs. For 43.3's tests to pass deterministically, one run must be **frozen** as a committed fixture. Test time MUST NOT re-run the jsdom harness.

2. **Alphabet-length = 65 mystery**. `research/vm-slide-stack-vm/vdata-dynamic-trace.js` line 59..60 hardcodes the alphabet as the 65-char string `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`. The decoder iterates `i < alphabet.length` so maps `Y` → index 64. By arithmetic coincidence `(64<<6)|64 = 0x1040`, which produces the constant `10 40` trailer bytes when `YY` appears as the last two chars of a base64 group. This works but is suspicious — real 6-bit base64 has 64 values, not 65. Two hypotheses:
   - (a) Tencent's alphabet is genuinely 65 chars and `Y` at index 64 is a deliberate "overflow" trick used to emit the `10 40` trailer without a separate write — i.e. the trailer is literally "encode two Y's at the end" rather than "append two bytes `10 40`". This would mean the trailer is part of the base64 encode, not a separate step.
   - (b) The alphabet is actually 64 chars and the hardcoded string in `vdata-dynamic-trace.js` has an extra character somewhere (maybe `Y` is a typo for something else, or the real alphabet ends at `m`). The trailer `10 40` would then be a separate 2-byte append before the base64 encode, which happens to always encode to `YY` if `Y` maps to 64 in the corrected alphabet.

   43.2 must read the bytecode at pc 16932 directly via `output/vm-slide/bytecode.json` + `output/vm-slide/disassembly-full.txt` to settle this. The alphabet is built by a sequence of `OP_04 (OP_10 ch)*` string-build opcodes starting at pc 16932 — count the `OP_10` steps to get the authoritative length, then compare char-for-char to the hardcoded string.

### Inputs
- `output/vm-slide/vdata-pipeline.json` — machine-readable 43.1 spec. Read `xtea_key_hex`, `plaintext_blocks`, `har_reference.*`, `output_alphabet`.
- `output/vm-slide/bytecode.json` — decoded 24,273-element bytecode. Slice around index 16932 to read the alphabet-build sequence.
- `output/vm-slide/disassembly-full.txt` — Phase 40.1 full-coverage walker disassembly. Look for the `OP_04` starting pc 16932 and read the `OP_10` run that follows.
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` §6 — already cites pc 16932 for the alphabet load; confirm against your direct read.
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` lines 59-60 — the hardcoded alphabet string to verify or correct.
- `sample/captcha-har.har` — the full verify POST + response. Extract the reference vData and the surrounding field set if needed.
- `research/vm-slide-stack-vm/decoder.js`, `research/vm-slide-stack-vm/disassembler.js` — Phase 40 tooling. `OP_04` = PUSH_STR_EMPTY, `OP_10` = STR_APPEND_CHAR (or similar — confirm from `docs/VM_SLIDE_OPCODES.md`).
- `docs/VM_SLIDE_OPCODES.md` — authoritative opcode table.

### Implementation Steps

1. **Read the alphabet from bytecode directly**. Write (or reuse existing walker/disassembler output) to dump the instruction sequence starting at pc 16932. Count the `OP_10` steps. The sequence is `OP_04` (push empty string) then N × `OP_10 <char_code>` (append one character), followed by some consumer. The total N gives the true alphabet length. Also record the exact character sequence for char-for-char comparison against `vdata-dynamic-trace.js`'s hardcoded string.

2. **Update `research/vm-slide-stack-vm/VDATA-PIPELINE.md`** §5 and §8 (whichever sections describe the alphabet) with the definitive finding:
   - If 65 chars: note explicitly that `Y` at index 64 is the trailer-encoding trick, explain the bit arithmetic, correct §5/§8 to remove the "alphabet length = 65 is suspicious" open question.
   - If 64 chars: correct `vdata-dynamic-trace.js` hardcoded alphabet to the true 64-char form; note the trailer `10 40` is then a separate 2-byte append (verify by recomputing the jsdom and HAR decode against the corrected alphabet).
   In either case, §4/§5 of VDATA-PIPELINE.md should end up fully consistent with the bytecode reality, not with the 43.1 hardcoded guess.

3. **Freeze one deterministic jsdom capture as a committed fixture**. Run the existing `research/vm-slide-stack-vm/vdata-dynamic-trace.js` once. From the resulting `output/vm-slide/vdata-pipeline.json`, copy the *stable* fields and the *one captured run* into a new file `tests/fixtures/vdata-jsdom-capture.json` with this schema:

   ```json
   {
     "source": "research/vm-slide-stack-vm/vdata-dynamic-trace.js",
     "captured_at": "2026-04-13",
     "notes": "Frozen single-run capture of the jsdom harness for 43.3 byte-identical tests. Re-running the harness produces a DIFFERENT capture due to non-deterministic fingerprint byte order; this fixture is the canonical test input.",
     "xtea_key_hex": "32653433306638633135623764613936",
     "output_alphabet": "<verified from step 1 — 64 or 65 chars>",
     "plaintext_hex": "<112 bytes hex>",
     "plaintext_blocks": [[v0, v1], ...14 entries],
     "ciphertext_hex": "<114 bytes hex, including 10 40 trailer>",
     "vdata_string": "<152 chars>",
     "trailer_hex": "1040"
   }
   ```

   The fixture must be self-sufficient: 43.3 and 43.4 will read this file directly, feed `plaintext_hex` (or `plaintext_blocks`) into the standalone encoder, and assert the output equals `vdata_string` byte-for-byte.

4. **Freeze the HAR reference as a committed fixture**. Write `tests/fixtures/vdata-har-capture.json`:

   ```json
   {
     "source": "sample/captcha-har.har",
     "notes": "HAR reference vector from a real Chrome 146 capture of Tencent's captcha. Decrypted plaintext used as 43.3 test input to prove the encoder is byte-identical against live traffic — NOT just against jsdom.",
     "xtea_key_hex": "32653433306638633135623764613936",
     "output_alphabet": "<same as jsdom fixture>",
     "har_vdata_string": "7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4lsXbEguCZ7eZtjCMfbg9*wbiQoH_4-hrxaM7THpUbbQuqIfPi5vl549PdPPu64P-GnmSuAKqlxUcL9yFjBMA5RsJRiYY",
     "har_ciphertext_hex": "41f4f30830245004c817d13ca796e26dac36059827adca2f08edff6b2863d24071b5fdb709f50a2be7deada1e197dc283ec8d8c90ab21d361f5a8b15bc8a20a6430685be3e7897d074c2eea28a635eb58d8025250a154df0d363e6135b03afca8e7cd795eb846950e24e67e7091f6d461040",
     "har_decrypted_plaintext_hex": "<112 bytes hex — decrypt the HAR ciphertext with the XTEA key using classical XTEA + LE packing>",
     "har_decrypted_plaintext_ascii": "iimnfevn&=fr0=ae&700436t99p44=6865c=6Ll2oo40a2&dd&s=vi2To&DekCrne1s1Ls%y=2=2C2&1t2i2CdCdevcsm%l%&0kkkkkpkkykk=kk",
     "trailer_hex": "1040"
   }
   ```

   `har_decrypted_plaintext_hex` must be computed — do not hand-guess. Use the standalone classical XTEA decrypt already written inside `vdata-dynamic-trace.js` (or copy the inline decrypt the director used during 43.1 verification) against `har_ciphertext_hex[:224 hex chars]` (= 112 bytes = 14 blocks) to produce the plaintext bytes. Store hex + ASCII for human-readability. Store the trailer separately.

5. **Self-check the fixtures** by re-decoding each fixture's `vdata_string` / `har_vdata_string` against the verified alphabet and confirming the result matches `ciphertext_hex` / `har_ciphertext_hex` byte-for-byte. Also decrypt each fixture's ciphertext (first 112 bytes, LE packing, 32 rounds XTEA with `xtea_key_hex`) and confirm it matches the stored `plaintext_hex` / `har_decrypted_plaintext_hex`. Both round-trips must hold before you commit the fixtures.

6. **Write a short self-check script** `tests/fixtures/verify-vdata-fixtures.js` (or equivalent under `research/vm-slide-stack-vm/`) that a future test task (43.4) can invoke to re-run the round-trip verification at test time. This script is pure-JS (no jsdom), reads the two fixtures, and exits 0 if both round-trips hold. Node built-ins only. Use whichever location (`tests/fixtures/` or `research/vm-slide-stack-vm/`) is consistent with the project's testing conventions — check how existing tests load fixtures first.

7. **Update `research/vm-slide-stack-vm/README.md`** — add a 43.2 bullet under "Phase 42/43 findings" pointing to the fixture files + self-check script; list the alphabet-length resolution.

8. **Do NOT** create `tools/vdata-generator/`. That is 43.3's directory.

### Warnings

- **No jsdom in test-time fixtures**. The committed fixture must contain fully-resolved hex strings + the vdata output. 43.4's tests will NOT re-run jsdom; they will read the static JSON and assert encoder output matches.
- **Do not modify `tools/scraper/vdata-harness.js`**. Production harness; has its own tests.
- **Do not touch `targets/` or `sample/`**. Read-only per `.claude/rules/targets-readonly.md`.
- **Do not make any git commits**. Director owns all commits after verification.
- **If Step 1 reveals the alphabet is 64 chars** (i.e. the `Y` at index 64 in `vdata-dynamic-trace.js`'s hardcoded string is an extra character that does not exist in the bytecode), you MUST correct `vdata-dynamic-trace.js` to match the true 64-char alphabet AND re-run it to re-derive `output/vm-slide/vdata-pipeline.json`, then rebuild both fixtures from the corrected output. This is important because 43.3's encoder will use whatever fixture you commit — if the fixture is based on a wrong alphabet, the encoder will be wrong.
- **If the task is too difficult or impossible to complete**, stop immediately and report back. In particular: if the alphabet is 65 chars AND decoding the HAR reference produces byte-identical bytes AND decoding the jsdom live run produces byte-identical bytes, but you cannot explain *why* 65 chars works, report the evidence and let the director decide whether to proceed or dispatch a deeper investigation.

### Verification
- [ ] Step 1 produces a definitive answer: the custom base64 alphabet is N chars (where N is 64 or 65), with the character sequence exactly matching the bytecode at pc 16932, verified by counting `OP_10` opcodes after `OP_04` at that pc.
- [ ] `tests/fixtures/vdata-jsdom-capture.json` exists, follows the schema above, and is valid JSON.
- [ ] `tests/fixtures/vdata-har-capture.json` exists, follows the schema above, and is valid JSON.
- [ ] Both fixtures round-trip: decoding `vdata_string` with the verified alphabet produces `ciphertext_hex`; decrypting `ciphertext_hex[:112]` with classical XTEA + LE packing + `xtea_key_hex` produces `plaintext_hex`.
- [ ] `verify-vdata-fixtures.js` (or equivalent) runs and exits 0. Does not require jsdom.
- [ ] `research/vm-slide-stack-vm/VDATA-PIPELINE.md` is corrected/updated to reflect the true alphabet length.
- [ ] `research/vm-slide-stack-vm/README.md` has a 43.2 bullet pointing at the new artifacts.
- [ ] `npm test` passes at 353/353 (or 354+ if you wire the self-check into package.json — but prefer to leave that for 43.4).
- [ ] No writes under `tools/vdata-generator/`.
- [ ] No modifications to `tools/scraper/vdata-harness.js`, `targets/`, or `sample/`.

### Suggested Agent
`general-purpose` — bytecode reading, fixture authoring, JSON round-trip verification. No specialist agent fits better.
