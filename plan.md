# Plan

## Status
Current phase: Phase 43 — Standalone vData cipher encoder (narrowed per user Option C, 2026-04-13)
Current task: 43.5 — Docs for the vData cipher encoder (director-owned)

**Dispatch order** (user-confirmed 2026-04-13): 43.0 ✅ → 43.1 ✅ → 43.2 ✅ → 43.3 ✅ → 43.4 ✅ → 43.5. Phase 43 narrowed on 2026-04-13 to the cipher half of the vData pipeline only — the plaintext-fingerprint half moved to the new Phase 44 track per user Option C. The generator ships as a pure re-encoder that consumes a plaintext byte buffer and emits the 152-char vData string byte-for-byte; Phase 44 will reverse the fingerprint build separately if/when the user wants it.

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
| 43.5 | Docs — new `docs/VDATA_FORMAT.md` (authoritative byte-level spec), update `docs/CAPTCHA_ORCHESTRATOR.md` §6, track README + CLAUDE.md Project Memory bumps (director-owned) | in-progress |

### Phase 44: vm-slide plaintext fingerprint reversal (open track, no active tasks)
> Separate track opened 2026-04-13 (user Option C). Phase 44's goal is to decompile the `proxyXHR` body inside `sample/vm_slide.js` (bytecode pcs roughly 15000..20800, densely clustered around 19500..20800) and reverse the **plaintext-build half** of the vData pipeline — the JS-environment fingerprint computation that produces the 112-byte `k=v&k=v&...` structure vm-slide feeds into the XTEA encrypt.

> **What is known** (from 43.1): the plaintext is 112 bytes, structured as 8 `key=value` pairs joined by `&` (8 `=`, 7 `&`). It is computed from `typeof`, property enumeration, and object stringification of the JS runtime — NOT the verify POST body. Per-run byte order varies even with identical input (memory-ordered iteration or internal salt). The proxyXHR is installed via the non-IE branch at bytecode pcs 19636..19663.

> **What is not known**: the exact 8 fields, their names, their source values, how they're ordered, whether/how a salt is mixed in, the padding scheme if any, why the schema produces a fixed character multiset. See `research/vm-slide-stack-vm/VDATA-PIPELINE.md` §8 questions 1-4 for the starting list.

> **Starting inputs**: `output/vm-slide/bytecode.json`, `output/vm-slide/disassembly-full.txt`, `research/vm-slide-stack-vm/walker.js`, `research/vm-slide-stack-vm/vdata-dynamic-trace.js` (as a runtime oracle for cross-checking decompile hypotheses).

> **Status**: open, no active tasks. Phase 44 will be decomposed into tasks when the user chooses to dispatch it — likely after Phase 43 closes. This placeholder exists so the track is visible in `plan.md` and `history/20260413.md` records the split.

---

## Current Task

**ID**: 43.5
**Title**: Docs for the vData cipher encoder — `docs/VDATA_FORMAT.md` + cross-references
**Phase**: Phase 43 — Standalone vData cipher encoder
**Status**: in-progress — director-owned (no subagent)

### Goal
Land the authoritative byte-level cipher spec for vm-slide's vData pipeline at `docs/VDATA_FORMAT.md`, update `docs/CAPTCHA_ORCHESTRATOR.md` §6 to point at it, refresh `research/vm-slide-stack-vm/README.md` with the Phase 43 closeout, and bump the CLAUDE.md Documentation table to list the new doc. CLAUDE.md Project Memory was already corrected during 43.2 — only the Documentation table needs the new row. Director-owned; no subagent dispatched.

### Inputs (read-only references)
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` — research-track spec; `docs/VDATA_FORMAT.md` is the user-facing distillation (link from doc → research, not the other way).
- `tools/vdata-generator/{xtea.js, custom-base64.js, encode.js, README.md}` — public API to document.
- `tests/fixtures/{vdata-jsdom-capture.json, vdata-har-capture.json}` — example vectors to embed in the doc.
- `docs/TOKEN_FORMAT.md` — closest-analog existing user-facing crypto spec; mirror its section structure and depth.
- `docs/CAPTCHA_ORCHESTRATOR.md` — §6 needs a "see VDATA_FORMAT.md for the cipher spec" pointer + a one-paragraph correction note on the "10 40 trailer" phantom.

### Implementation Steps
1. Read `docs/TOKEN_FORMAT.md` to mirror its structure (scope / pipeline / parameters / worked example / provenance).
2. Write `docs/VDATA_FORMAT.md`: scope (cipher half only, Phase 44 owns plaintext-build), pipeline (3 steps), parameters table (XTEA key, alphabet, padding, lengths), worked example using one of the committed fixtures (show plaintext_hex → ciphertext_hex → vdata_string), provenance (cite bytecode pcs + research/ artifacts), explicit "10 40 trailer was a phantom" correction note for future readers, public API surface table for `tools/vdata-generator/`.
3. Edit `docs/CAPTCHA_ORCHESTRATOR.md` §6 (vData mechanism section): add a forward link to `docs/VDATA_FORMAT.md`, add the trailer-phantom correction.
4. Edit `research/vm-slide-stack-vm/README.md`: bump status to reflect Phase 43 closeout (cipher half done, fixtures + encoder + tests + doc all landed); add a 43.5 bullet pointing at the new `docs/VDATA_FORMAT.md`.
5. Edit `CLAUDE.md` Documentation table: add a row for `docs/VDATA_FORMAT.md` between the existing vm-slide entries.
6. Run `npm test` — must remain 411/411.

### Verification
- [ ] `docs/VDATA_FORMAT.md` exists with the 6 sections from step 2.
- [ ] Worked example in the doc round-trips against a real fixture (verify by hand or with the encoder one-liner).
- [ ] `docs/CAPTCHA_ORCHESTRATOR.md` §6 links forward to `docs/VDATA_FORMAT.md` and contains the trailer-phantom correction.
- [ ] `research/vm-slide-stack-vm/README.md` lists the 43.5 doc and reflects Phase 43 closeout.
- [ ] `CLAUDE.md` Documentation table contains the new `docs/VDATA_FORMAT.md` row.
- [ ] `npm test` 411/411 unchanged.

### Suggested Agent
Director-owned (no dispatch). Documentation work the director writes itself per the Verify-mode rule.

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
