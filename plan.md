# Plan

## Status
Current phase: Phase 44 — vm-slide 9504→112 reduction reversal (**second revision user-approved 2026-04-13**)
Current task: 44.2.6 — fn 22317 full static decompile + reconciliation with fn 20539 (pending dispatch)

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
| 44.2.6 | **fn 22317 full static decompile + reconciliation with fn 20539** — decompile fn 22317 body `[22317, ~24234]` end-to-end; answer (i) is fn 22317 the installed `XMLHttpRequest.prototype.send` replacement? (ii) what is fn 20539's actual role? (iii) does fn 22317 perform the 9504→112 reduction itself or delegate? (iv) locate the `&vData=` concat + `savedSend.call` sites | pending |
| 44.3.5 | Real-Chrome differential capture — third fixture from production Chrome; capture target is now the **full 9504-byte verify POST body + its vData ciphertext** pair so 44.4's reduction formula can be cross-checked against a non-jsdom environment | pending |
| 44.4 | **9504→112 reduction formula reversal** — once 44.2.6 names the reduction region, decompile it; determine which of the 39 input fields feed the reduction + the per-accumulator rule. Ground truth: committed HAR fixture has both the 9504-byte body AND the XTEA-decrypted 112-byte output; candidate formulas checkable byte-for-byte. Deliverable: `research/vm-slide-stack-vm/REDUCTION-FORMULA.md` + JS reference impl | pending |
| 44.5a | Replay-with-substitution builder. Reads a captured 9504-byte body + field override map, emits a substituted body. Thin wrapper once 44.5b lands. | pending |
| 44.5b | **From-scratch 9504→112→encrypt pipeline**. `tools/vdata-generator/build-vdata.js`: input = a 39-field verify body (or the subset feeding the reduction); output = 152-char vData string. Pure JS, builds on Phase 43 encoder + 44.4 reduction. Deterministic (no per-run randomness to model). | pending |
| 44.6 | Tests for the plaintext builder (different agent per impl/tests separation) — unit tests per field source rule + integration tests asserting byte-identical reproduction of all three fixtures' plaintexts → vData strings end-to-end (jsdom + HAR + real-Chrome from 44.3.5) | pending |
| 44.7 | Docs closeout (director-owned) — expand `docs/VDATA_FORMAT.md` §1 with the complete plaintext spec; **fix `docs/CAPTCHA_ORCHESTRATOR.md` §517 + §6.2** (whole-body-replacement correction from 44.2.5); mark Phase 44 closed; bump CLAUDE.md Project Memory | pending |

> **Scope decisions (user-confirmed 2026-04-13)**: 9-task variant. (1) Real-Chrome differential capture **YES** → 44.3.5 added. (2) Per-run order resolution **REQUIRED**, not nice-to-have → 44.4 is blocking for 44.5b. (3) 44.5 builder design **BOTH** → split into 44.5a (replay-with-substitution, ships first) + 44.5b (full synthesis, depends on 44.4). User explicitly asked the director to record this decision but **NOT auto-dispatch** 44.1 — dispatch is on user trigger only.

---

## Current Task

**ID**: 44.2.6
**Title**: fn 22317 full static decompile + reconciliation with fn 20539
**Phase**: Phase 44 — vm-slide 9504→112 reduction reversal
**Status**: pending — awaiting user dispatch trigger (revised plan approved 2026-04-13).

### Goal
Decompile vm-slide's fn 22317 (body approximately `[22317, 24234]`, ≈1917 instructions, spawned by `OP_58` at pc 24234) end-to-end and reconcile it with fn 20539 (the function 44.2.5 decompiled). Answer four questions with pc-grounded evidence:
1. Is fn 22317 the installed `XMLHttpRequest.prototype.send` replacement on the Chrome code path?
2. If so, what is fn 20539's actual role? Sibling helper? `.call`/`.apply` handler? Dead code? IE fallback? Something else?
3. Does fn 22317's prologue perform the 9504-byte → 112-byte reduction itself, or does it delegate to helpers (and if so, which pc range)?
4. Where inside fn 22317 is the `&vData=` concat site (we know the literal is built at pcs 24211..24223) and where is the `savedSend.call(this, body_with_vData)` call site that actually forwards to the original send?

Deliverable: `research/vm-slide-stack-vm/FN-22317-DECOMPILE.md`.

### Context (post-44.3, verified)
- Director byte-verified directly against `output/vm-slide/bytecode.json`:
  - pcs 24210..24224 spell `"&vData="` via `OP_04, OP_10 38, OP_10 118, OP_10 68, OP_10 97, OP_10 116, OP_10 97, OP_10 61`.
  - FUNC_CREATE `OP_58` at pc 24234 targets entry pc 22317 — establishing fn 22317 body as `[22317, ~24234]`. The exact body end is not yet pinned; the subagent must confirm by walking from entry 22317 until the terminating `OP_13 RETURN` / `OP_16 VM_EXIT` is reached.
  - Global `OP_10 61` count = 12 sites, `OP_10 38` count = 10 sites. fn 20539's body `[20539, 20796]` contains zero of either. Both facts are simultaneously true — the 44.2.5 scoped byte-check stands, but the global view shows fn 22317 is a separate function with its own `&vData=` emission.
- HAR evidence (`sample/captcha-har.har`): verify POST body = 9504 bytes, 39 fields, `vData` is the 40th (last) field at 152 chars. So vm-slide **appends** `&vData=<ciphertext>` to an existing body — it does NOT perform whole-body replacement as 44.2.5 had concluded for fn 20539.
- Phase 43's "112-byte plaintext" is a VM-internal XTEA input, not a wire body. It is computed by reducing the 9504-byte body via some chain inside vm-slide — 44.3 hypothesized a 6-bit / base64-style accumulator reduction based on `OP_08 63` / `OP_08 6` / `OP_08 31` mask-shift patterns at pcs 19221..19443 and 24023..24084, but this is unverified and lives in 44.4's scope (this task just needs to find the *entry point* and *delegation pattern*, not the full reduction formula).
- fn 20539 decompile (Phase 44.2.5, `research/vm-slide-stack-vm/FN-20539-DECOMPILE.md`) is solid at the per-pc level:
  - fn 20539 body `[20539, 20796]`, spawned by parent fn 20140 at pc 20797 via `OP_58 20539 3 1 7 6 8 3 9 4 3` (3 args, capture pairs).
  - Slot 3 = `arguments[0]` at entry (string body parameter, type-guarded at pc 20604).
  - Slot 4 = py-flag bool (first-written at pc 20618).
  - Slot 8 = fn 15918 (captured upvalue from parent slot 3).
  - Slot 9 = savedSend (captured upvalue from parent slot 4).
  - Tail: at pc 20749 calls `fn 15918.apply(U, [slot3, {py: slot4?"1":"0"}])`; at pc 20751 stores return into slot 3; at pc 20770 calls `savedSend.call(this, slot3_ciphertext)`.
  - 44.2.5 concluded fn 20539 IS the installed send replacement. Given 44.3's findings that must be **partially wrong** — either fn 20539 is a sibling/fallback path and fn 22317 is the primary replacement, OR fn 22317 is a helper fn 20539 calls under specific conditions, OR fn 20539 is dead code in the Chrome path, OR the Chrome code path has two-stage encryption through both functions. The subagent must reconcile.
- Parent function fn 20140 (body starts at 20140; FUNC_CREATE `OP_58` at pc 20813 targets entry 20140): this is the installer. It is the function that assigns `XMLHttpRequest.prototype.send = <some closure>`. Whatever closure fn 20140 installs IS the installed send replacement. The subagent may need to read fn 20140's body to determine which closure (fn 20539, fn 22317, or a third) is the actual installation target — and whether fn 22317 is even reachable from the Chrome code path at all.
- Other relevant sibling functions surfaced by the FUNC_CREATE scan inside this region (targets in `[20000, 24210]`, ordered by `func_create_pc`):
  - fn 20353 (FUNC_CREATE at pc 20463) — 44.3 hypothesized this as the `open` hook; unverified.
  - fn 20539 (FUNC_CREATE at pc 20797) — the 44.2.5-decompiled function.
  - fn 20140 (FUNC_CREATE at pc 20813) — parent of fn 20539, likely the installer.
  - fn 20107 (FUNC_CREATE at pc 20823).
  - fn 20843 (FUNC_CREATE at pc 20950).
  - fn 21045 (FUNC_CREATE at pc 21132).
  - fn 21255 (FUNC_CREATE at pc 21321).
  - fn 21333 (FUNC_CREATE at pc 22025).
  - fn 22038 (FUNC_CREATE at pc 22273).
  - fn 22400 (FUNC_CREATE at pc 22663).
  - fn 22730 (FUNC_CREATE at pc 22972).
  - fn 23399 (FUNC_CREATE at pc 23727).
  - fn 23898 (FUNC_CREATE at pc 23945).
  - fn 22317 (FUNC_CREATE at pc 24234).
  - fn 20970 (FUNC_CREATE at pc 24257).

### Inputs
- `output/vm-slide/bytecode.json` — 24,273-element decoded bytecode. Slice `[22317, 24234]` for fn 22317; slice `[20140, 20797]` or similar for fn 20140 if you need the installer.
- `output/vm-slide/disassembly-full.txt` — Phase 40.1 full-coverage walker output. fn 22317 is reachable from the root (Phase 40.6 confirmed XTEA handlers including 15918/15241/15416 are all reachable), so the walker should have decoded it. Prefer this over re-walking.
- `research/vm-slide-stack-vm/walker.js`, `decoder.js`, `disassembler.js` — Phase 39/40 tooling. Re-walk specific regions if `disassembly-full.txt` is sparse for fn 22317.
- `research/vm-slide-stack-vm/FN-20539-DECOMPILE.md` — the 44.2.5 deliverable. Canonical reference for what fn 20539 does per-pc.
- `research/vm-slide-stack-vm/PLAINTEXT-BUILD.md` — the 44.2 fn 15918 decompile. Useful for reference on the XTEA-driver's internals.
- `research/vm-slide-stack-vm/plaintext-callgraph.md` — the 44.1 call-graph artifact. Shows that fn 20539 → fn 15918 is one live chain (`OP_66` at pc 20749). If fn 22317 is also a live caller of fn 15918 via some other `OP_66`, the runtime call-graph tracer (`research/vm-slide-stack-vm/vdata-callgraph-trace.js`) already captured that in its runtime output at `output/vm-slide/vdata-callgraph.json` — grep it for call-sites into pc 15241.
- `docs/VM_SLIDE_OPCODES.md` — authoritative opcode table. Especially important for this task: `OP_58` FUNC_CREATE operand layout, the prototype-assignment opcodes (`OP_24` STORE_REF or equivalent), and the call opcodes (`OP_02`, `OP_25`, `OP_55`, `OP_66`).
- `docs/VM_SLIDE_ARCHITECTURE.md` — dispatch loop and frame-entry convention.
- `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 (post-44.3 edit) — context on the append-mode vData mechanism.
- `research/captcha-orchestrator/PLAINTEXT-BUILD-ORIGIN.md` (44.3) — 44.3's hypotheses about fn 22317 being the top-level send replacement. Use as a hypothesis, NOT as ground truth.
- `sample/captcha-har.har` — HAR fixture with the 9504-byte verify POST body, for cross-checking.
- `tests/fixtures/vdata-jsdom-capture.json`, `tests/fixtures/vdata-har-capture.json` — committed 112-byte XTEA inputs (still correctly named as hex even if the "plaintext" label is misleading).

### Implementation Steps
1. **Pin fn 22317's actual body bounds.** Start walking from entry pc 22317. Use `walker.js`'s function-entry table to confirm the entry; walk forward until the first dominating `OP_13 RETURN` / `OP_16 VM_EXIT` that leaves no dangling reachable code behind (standard terminator for stack-VM functions). Record the exact `body_end` pc. The ≈24234 figure is just the FUNC_CREATE pc; the actual body may end earlier at the function's own terminator.
2. **Read fn 20140's body** (or the section that contains `OP_58 20539 ...` at pc 20797 and `OP_58 22317 ...` at pc 24234 — they may both be inside the same parent). Identify the actual installer: find the `XMLHttpRequest.prototype.send = <closure>` assignment. The closure's FUNC_CREATE pc tells you which function (fn 20539 or fn 22317 or a third) is the true installed replacement. If both FUNC_CREATEs are inside the same parent, there may be two sibling closures installed onto *different* methods (e.g. fn 20539 = `send`, fn 22317 = `open` — or vice versa — or something subtler). Ground every claim in specific pcs.
3. **Decompile fn 22317's prologue** (first ~100 instructions, until the first significant branching). Identify: arg count, arg-to-local mapping, closure captures, any type guards on arg 0 (analogous to fn 20539's pc 20604 `OP_52 TYPEOF arguments[0]` guard). If fn 22317 is the real send replacement, it should have a similar string guard near the top.
4. **Find the `&vData=` concat site inside fn 22317.** We know the `"&vData="` literal is built at pcs 24211..24224 via seven `OP_10` char-append instructions. The concat site is whatever `OP_05` (or equivalent string-concat opcode per `docs/VM_SLIDE_OPCODES.md`) consumes that built string plus the already-encrypted ciphertext. The directly-following instruction after the literal is built should be the concat. Record the pc and describe the data flow.
5. **Find the `savedSend.call(this, body_with_vData)` forwarding site.** After the `&vData=` concat, fn 22317 must eventually invoke the original `XMLHttpRequest.prototype.send` on the rewritten body. Look for `OP_02` METHOD_CALL with operand `"call"` or `OP_66` CALL_GLOBAL against a captured upvalue. Record which local holds the `savedSend` reference and which local holds the rewritten body at the call site.
6. **Find fn 22317's reduction call.** Before the `&vData=` concat, fn 22317 must have called the reduction (9504 → 112 bytes) and then the XTEA-encrypt-and-base64 chain (which produces the 152-char ciphertext). Identify the call sites and pcs. Determine whether the reduction is:
   - (a) inlined inside fn 22317 itself (lots of `OP_08 63` / `OP_08 6` / `OP_08 31` mask-shift ops and string-build opcodes in fn 22317's body middle region), OR
   - (b) delegated to a helper function via `OP_66` (record which function is called), OR
   - (c) delegated to fn 20539 (which would finally reconcile fn 20539's role).
   Don't reverse the reduction formula itself — that's 44.4. Just find the boundary.
7. **Pin fn 20539's actual role.** Based on what fn 22317 does and what fn 20140 installs, classify fn 20539 as one of:
   - **(I)** The installed send replacement (fn 22317 is a helper it calls).
   - **(II)** A helper fn 22317 calls (fn 22317 is the installed replacement).
   - **(III)** A sibling that handles a different code path (e.g. IE fallback, `.call`/`.apply` handler, or a different URL condition).
   - **(IV)** Dead code in the Chrome path.
   - **(V)** Something else — document it.
   Ground the choice in fn 20140's installer code, not in fn 20539's own body (fn 20539's own body is already 44.2.5).
8. **Write `research/vm-slide-stack-vm/FN-22317-DECOMPILE.md`** with exactly these sections:
   - **Summary** (≤15 lines, with the classification verdict for fn 20539 stated unambiguously in the first sentence).
   - **fn 22317 full pseudocode** — prologue + middle + tail with inline pc comments (~ every 5-10 lines). Scope constraint: only fn 22317 itself, not the reduction helpers if any.
   - **Reduction boundary** — the pc at which fn 22317 either starts the inline reduction OR delegates to a helper. If delegated, name the helper function. Do NOT reverse the formula.
   - **`&vData=` concat + forward call sites** — the pc of the concat, the pc of the `savedSend.call`, and the local slots involved.
   - **Installer evidence** — the pcs inside fn 20140 (or whatever parent) that assign `XMLHttpRequest.prototype.send = <closure>`; which closure is installed; how fn 22317 relates.
   - **fn 20539 role reconciliation** — the classification verdict (I-V) from step 7, with supporting pc references.
   - **Implications for 44.4** — which region 44.4 should decompile to reverse the reduction formula.
   - **Open questions** — anything you could not resolve.
9. **Report the verdict first** in your reply so the director can decide 44.4's scope immediately. Then the artifact path, then the npm test tail, then open questions.

### Verification
- [ ] `research/vm-slide-stack-vm/FN-22317-DECOMPILE.md` exists with all eight sections listed.
- [ ] fn 22317's body end pc is pinned (not left as ≈24234).
- [ ] The fn 20539 role classification (I-V) is stated unambiguously in the Summary's first sentence, with specific pc citations.
- [ ] The `&vData=` concat pc is named explicitly.
- [ ] The `savedSend.call` forwarding pc is named explicitly.
- [ ] The reduction boundary is named (either an inline region inside fn 22317 with pc range, or a delegated helper function with entry pc).
- [ ] Installer evidence: specific pc(s) inside fn 20140 (or whatever parent) where the `XMLHttpRequest.prototype.send` assignment happens, with the closure identity.
- [ ] `npm test` passes at **411/411**.
- [ ] No modifications to `targets/`, `sample/`, `tools/`, `tests/fixtures/`, `docs/`, `research/vm-slide-stack-vm/{FN-20539-DECOMPILE,PLAINTEXT-BUILD,plaintext-callgraph,vdata-*-trace}.*`, or `research/captcha-orchestrator/`. New artifact only.

### Constraints
- **Do not make any git commits.** Director owns all commits after verification.
- **Do not modify `targets/`, `sample/`**. Tencent's property.
- **Verify, don't assume.** Every pseudocode line must trace to a specific bytecode pc. Do NOT introduce hypotheses that are not byte-grounded — the point of 44.2.6 is to eliminate the remaining ambiguity about fn 20539's role, not to substitute a new un-verified hypothesis.
- **Do not reverse the 9504→112 reduction formula.** That is 44.4's scope. 44.2.6 only pins the reduction's *location* and *delegation pattern*.
- **Do NOT re-run any tracers, harnesses, or jsdom environments.** Pure static analysis.
- **Pay special attention to `OP_10 & / =` global placements.** The 12 `OP_10 61` and 10 `OP_10 38` sites in the bytecode may hint at other unnoticed literal-build sites relevant to the reduction — cross-reference them with fn 22317's body range and note any that fall inside.
- **Byte-level verification of load-bearing claims is REQUIRED.** For any claim about a specific opcode sequence (e.g. "fn 22317 ends with OP_13 RETURN at pc X"), cite the raw bytecode.json slice, not just the disassembly text.
- **If the task reveals that the Chrome path uses THREE functions** (fn 20140 installer, fn 22317, fn 20539 all with live roles), that's a legitimate finding — document all three. Classification (V) is valid.
- **If the task is genuinely impossible** (e.g. fn 22317 uses opcodes not documented in `docs/VM_SLIDE_OPCODES.md` and not inferrable from other functions' usage), stop, write FN-22317-DECOMPILE.md with whatever you resolved + an explicit scope-reduction note listing the unresolvable opcodes, and report. Do not leave broken files.

### Suggested Agent
`general-purpose` — pure static bytecode reading. Same shape as 44.2, 44.2.5, 44.3's fallback path. ~1–2 hours expected.

