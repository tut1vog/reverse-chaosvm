# Plan

## Status
Current phase: Phase 44 — vm-slide plaintext fingerprint reversal
Current task: 44.2 — Plaintext-build static decompile to pseudocode (pending dispatch)

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

**ID**: 44.2
**Title**: Plaintext-build static decompile to pseudocode
**Phase**: Phase 44 — vm-slide plaintext fingerprint reversal
**Status**: pending — awaiting dispatch.

### Goal
Produce a readable pseudocode decompilation of the plaintext-build + encrypt-driver function **fn 15918** (body `[15918, 16230]`), with enough detail to identify how the 112-byte plaintext buffer is assembled, how it is sliced into 14 × 8-byte blocks, and where each block's two uint32 words come from. Secondarily, follow the call edge from **fn 20539** (proxyXHR send-handler, body `[20539, 20796]`) at its `OP_66` pc **20749** into fn 15918 to determine where fn 15918's input buffer argument originates. Output lives in `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md`.

### Context (from 44.1 — verified)
- All 14 encrypt calls in a single vData run come from **one single call site**: `OP_66 CALL_GLOBAL` at pc **16182** inside fn 15918's body.
- fn 15918 has a 14-iteration loop: backedge `OP_06 15989` at pc 16064; loop body span `[15989, 16191]`.
- fn 15918 is a **sibling closure** of the XTEA encrypt closure (fn 15241). Both are spawned by factory fn 15220. Factory pc 16231 is `OP_58 15918 3 2 9 8 10 6 11 9 3 4` — fn 15918 captures 3 upvalues via pairs (2→9), (8→10), (6→11). **Local 10 ← factory slot 8** at spawn time; that upvalue is almost certainly the encrypt closure reference fn 15918 invokes at pc 16182.
- Static call-site scan of fn 15918 found 11 call/invoke ops including the target pc 16182 (`OP_66`), plus pcs 15950/15971 (OP_25), 16037/16039, 16131/16133, 16169/16171, 16197 — these are the helper calls fn 15918 makes for each iteration (slice/append/convert). 44.2 should map each of these to a semantic role.
- fn 15918 is called from fn 20539 (proxyXHR send-handler) at pc **20749** via `OP_66`. fn 20539's entry is called from native JS (harness-installed `XMLHttpRequest.prototype.send` replacement) — its "caller pc" in the runtime capture is stale (VM_EXIT, op 16), which is expected.
- Encrypt closure takes 3 args (FUNC_CREATE with 3 params); 44.1 noted locals 6 and 7 hold `v0, v1` at the call site; local 5 is the third arg (likely the destination buffer / index).
- vm-slide dispatch is stack-based; see `docs/VM_SLIDE_ARCHITECTURE.md` for the dispatch loop and `docs/VM_SLIDE_OPCODES.md` for the opcode table (53 non-null handlers).
- The 112-byte plaintext has 8 `key=value` pairs joined by `&` (exactly 8 `=`, 7 `&`). Per-run byte order varies; multiset is invariant within an environment.

### Inputs
- `output/vm-slide/bytecode.json` (24,273 elements; slice [15918, 16230] for fn 15918, [20539, 20796] for fn 20539).
- `output/vm-slide/disassembly-full.txt` (Phase 40.1 walker output — includes both functions, already decoded).
- `output/vm-slide/vdata-callgraph.json` (44.1 artifact — has the 11 static call sites inside fn 15918, the spawn-site capture pairs, and both function body ranges).
- `research/vm-slide-stack-vm/plaintext-callgraph.md` (44.1 narrative).
- `research/vm-slide-stack-vm/{walker,decoder,disassembler}.js` (Phase 39/40 tooling — reuse for any re-walks you need).
- `docs/VM_SLIDE_OPCODES.md`, `docs/VM_SLIDE_ARCHITECTURE.md` (authoritative opcode + dispatch semantics).
- `tests/fixtures/vdata-jsdom-capture.json`, `tests/fixtures/vdata-har-capture.json` (committed plaintexts to cross-check hypotheses against).

### Implementation Steps
1. **Slice and label fn 15918's body.** Extract the `[15918, 16230]` disassembly region. Annotate each instruction with its role: prologue (arg unpack, local init), loop header, loop body (iteration = one 8-byte block), loop tail, return. Use the existing disassembler text from `disassembly-full.txt`; do not re-run the walker unless you need to.
2. **Classify each of fn 15918's 11 call sites** by stack-effect reasoning: which are `slice`-style string/buffer carves, which are `charCodeAt`-style byte reads, which are uint32 packers, and which is the encrypt call at pc 16182. Pull operand/stack effects from `docs/VM_SLIDE_OPCODES.md`.
3. **Trace the v0/v1 uint32 words.** For the encrypt call at pc 16182, walk backward inside the loop body `[15989, 16191]` to find where locals 6 and 7 (the encrypt args) are written. Identify the byte-to-uint32 packing convention (LE per Phase 43). Cross-check against `tests/fixtures/vdata-jsdom-capture.json`'s `plaintext_blocks` — pick block N, reproduce its two words by hand from the first N×8 bytes of `plaintext_hex`, and confirm the packing matches.
4. **Trace fn 15918's input buffer argument.** fn 15918 takes N args; the primary is the 112-byte plaintext buffer (or the source it is assembled from). Identify which local receives it in fn 15918's prologue. Then cross fn boundary: inspect fn 20539's body around pc 20749 (the `OP_66` that calls fn 15918) and record what is pushed on the stack as fn 15918's arguments at that call site. Record the upstream data-flow one level back — enough to say "fn 20539 assembles X from Y and passes it to fn 15918".
5. **Produce pseudocode.** Write readable JS-like pseudocode for fn 15918, with comments naming each bytecode pc range. Keep opcode names where semantics are ambiguous; lift to JS where semantics are clear. The pseudocode must show: (a) arg unpack, (b) any pre-loop setup, (c) the 14-iteration loop structure, (d) per-iteration block extraction, (e) v0/v1 packing, (f) the encrypt call, (g) any post-loop assembly / return. Include a second, shorter pseudocode block for fn 20539's call site at pc 20749 (just enough context to see what flows into fn 15918).
6. **Open-questions list.** Any opcode semantics you could not pin down, any helpers whose role you could not classify, any data-flow edges you could not resolve — list them explicitly at the bottom of `PLAINTEXT-BUILD.md` so 44.3's dynamic instrumentation can resolve them.
7. **Write `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md`** with sections: Summary, Inputs, fn 15918 pseudocode, fn 20539 → fn 15918 call-site snippet, Block-extraction verification (the fixture cross-check from step 3), Helper call-site classification table, Open questions for 44.3.

### Verification
- [ ] `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md` exists and contains all seven sections above.
- [ ] Step 3's fixture cross-check is reproducible: the doc must state explicitly which fixture and which block it verified, and the v0/v1 values must match the fixture bytes when packed LE.
- [ ] Every claim about fn 15918's structure cites a specific bytecode pc range (verify-don't-assume rule).
- [ ] The 11 helper call sites inside fn 15918 are classified (even if some entries are "unknown — 44.3 owns"); no silent omissions.
- [ ] fn 20539 → fn 15918 call-site semantics documented at least at the level "X local holds the buffer that becomes fn 15918's arg N".
- [ ] No modifications to `targets/`, `sample/`, `tools/vdata-generator/`, `tools/scraper/`, `tests/fixtures/`, `docs/`, or the `research/vm-slide-stack-vm/vdata-*-trace.js` tracer files.
- [ ] `npm test` passes at **411/411**.

### Suggested Agent
`general-purpose` — static bytecode reading + pseudocode lifting. Different agent instance than 44.1 is acceptable but not required (44.2 is a continuation of the same static-analysis track, not an impl/tests pair).

