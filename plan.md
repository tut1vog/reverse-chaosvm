# Plan

## Status
Current phase: Phase 43 — Byte-identical vData generator
Current task: **paused for user review** — 43.1 revealed plaintext is a JS-environment fingerprint (not the verify POST body), which reshapes what 43.3's "standalone generator" can deliver. Awaiting user decision on Phase 43 scope.

**Dispatch order** (user-confirmed 2026-04-13): 43.0 → 43.1 → 43.2 → 43.3 → 43.4 → 43.5. Rationale: rename frees the namespace for the new standalone; hybrid static+dynamic extraction narrows the pipeline; validation fixture locks the ground truth; impl then tests (different agents per impl/tests separation); docs last, director-owned.

**Phase 43 recommendation (user-confirmed 2026-04-13)**: use the existing `tools/scraper/vdata-generator.js` jsdom harness as the dynamic oracle instead of Puppeteer — it already runs vm-slide's real bytecode through its XHR proxy path, so its output is ground truth. Puppeteer live capture via `tools/captcha-solver/live-submit.js` kept as an optional tail validation vector in 43.4.

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
> Decompile `sample/vm_slide.js` — stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`). First-pass documentation with ~2% coverage limitation.

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
| 40.6 | Cross-track XTEA investigation — CONFIRMED classical XTEA, both encrypt (entry 15241) and decrypt (entry 15416) | done |

### Phase 41: Captcha orchestrator (Stream B Track 2) — DONE

| ID | Task | Status |
|----|------|--------|
| 41.1 | Add `config.target` type guard to `TemplateCache.seed()` | done |
| 41.2 | Tests for the type guard | done |
| 41.3 | Clean up stale describe-block text at `tests/test-auto-port.js:358` | done |
| 41.4 | Captcha orchestrator survey — webpack module graph + candidate mapping | done |
| 41.5 | Captcha orchestrator deep analysis — end-to-end flow trace + 39-field origination | done |
| 41.6 | Write `docs/CAPTCHA_ORCHESTRATOR.md` | done |
| 41.7 | Bump `research/captcha-orchestrator/README.md` status + populate reproducibility | done |

### Phase 42: vData runtime binding reversal — DONE

| ID | Task | Status |
|----|------|--------|
| 42.1 | vm-slide vData static trace — locate `OP_04 OP_10* OP_13` anchors for `getVData`/`vData=`/`&vData=` | done |
| 42.2 | Cross-reference FLOW.md §6 + HAR + crypto provenance scan — mechanism resolved (Chrome: XHR proxy; IE9: `window.getVData`) | done |
| 42.3 | Docs bookkeeping — `docs/CAPTCHA_ORCHESTRATOR.md` + `FLOW.md` §9 Q1 + README bumps + CLAUDE.md Project Memory | done |

### Phase 43: Byte-identical vData generator (Stream B Track 2 follow-up, in progress)
> Ship `tools/vdata-generator/` — a standalone white-box reimplementation of vm-slide's vData pipeline that produces byte-identical output matching a captured HAR vector. Builds on Phase 42's resolved mechanism: classical XTEA (delta `0x9E3779B9`, 32 rounds, encrypt entry pc 15241, decrypt entry pc 15416) + custom 64-char base64 alphabet `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` at pc 16932. What's still unknown: (a) exact 16-byte XTEA key, (b) exact plaintext layout fed into encrypt, (c) output assembly (is base64 the entire vData or is there a wrapper?). Reference vector: 152-char vData from `sample/captcha-har.har`.

| ID | Task | Status |
|----|------|--------|
| 43.0 | Rename `tools/scraper/vdata-generator.js` → `tools/scraper/vdata-harness.js` + update all imports (director-owned) | done |
| 43.1 | Hybrid static+dynamic XTEA/plaintext extraction via jsdom harness instrumentation + Phase 40 walker cross-check | done |
| 43.2 | Validation trace against HAR fixture — produce committed `tests/fixtures/vdata-har-capture.json` | **blocked on user decision** |
| 43.3 | Standalone generator `tools/vdata-generator/{xtea.js, custom-base64.js, plaintext.js, cli.js}` | pending |
| 43.4 | Tests for the standalone generator (different agent) + optional live fresh-capture validation via `tools/captcha-solver/live-submit.js` | pending |
| 43.5 | Docs — new `docs/VDATA_FORMAT.md`, update `docs/CAPTCHA_ORCHESTRATOR.md` §6 with byte-level spec, track README + CLAUDE.md Project Memory bumps (director-owned) | pending |

---

## Current Task

**PAUSED** — awaiting user decision on Phase 43 scope.

### Why paused

43.1 revealed a foundational surprise: the **plaintext that vm-slide encrypts is not the verify POST body** — it is a JS-environment fingerprint built by the `proxyXHR` body from `typeof`, property enumeration, and object stringification of the jsdom / real-browser runtime. Decryption of the HAR reference vData with our recovered XTEA key produces `"iimnfevn&=fr0=ae&700436t99p44=6865c=6Ll2oo40a2&dd&s=vi2To&DekCrne1s1Ls%y=2=2C2&1t2i2CdCdevcsm%l%&0kkkkkpkkykk=kk"` — 112 bytes shaped as 8 `key=value` pairs joined by `&`, structurally identical to our jsdom plaintext but with different content (jsdom has parens/apostrophes/spaces, HAR has lots of `k`s and digits).

What IS byte-identical between our jsdom environment and the HAR reference:
- XTEA key `2e430f8c15b7da96` (16 ASCII bytes; constant in bytecode, not session-derived)
- Classical XTEA, 32 rounds, delta `0x9E3779B9`, little-endian uint32 packing
- Constant 2-byte trailer `10 40` after the 112-byte ciphertext
- Custom 64-char base64 alphabet at bytecode pc 16932
- Pipeline shape: 14 × 8-byte XTEA blocks + 2-byte trailer → 114 bytes → 152 base64 chars

What IS NOT byte-identical: the plaintext **content**, because jsdom's JS runtime is not byte-equivalent to real Chrome 146. The plaintext schema (8 fields, their names, their source) is unknown, and per-run byte order varies even with identical inputs — suggesting either memory-order-dependent iteration or an internal salt.

### What this means for Phase 43's definition of "byte-identical"

Phase 43's DoD was: ship `tools/vdata-generator/` that produces byte-identical vData matching a captured vector. 43.1 proves the **cipher half** of that pipeline is byte-identical reproducible — a standalone XTEA + custom-base64 implementation today can already encode any plaintext into a vData string that Tencent's decryptor would accept. But the **plaintext half** (the fingerprint build) is not yet understood, and its resolution requires decompiling the proxyXHR body (bytecode pcs ~19500..20800).

The user now faces three branching choices:

**Option A — Narrow Phase 43 to the cipher pipeline only** (fast, clean).
Ship `tools/vdata-generator/` as a pure encoder: given a plaintext byte buffer and the recovered XTEA key, produce the 152-char vData string (with the fixed `10 40` trailer and the custom base64 alphabet). Tests verify (a) byte-identical round-trip against jsdom harness output, (b) byte-identical round-trip against the HAR reference (using the decrypted HAR plaintext as the input). This ships in 43.3-43.5 as originally planned, ~2-3 tasks, ~1 session. The generator is useful for anyone who has a way to obtain valid plaintext (e.g. by running vm-slide in jsdom and extracting the plaintext before encrypt). It does NOT produce "new" vData from scratch — only re-encodes existing plaintext.

**Option B — Extend Phase 43 to include the plaintext build** (slow, complete).
Add a new task 43.1.5 "decompile the proxyXHR body and reverse the plaintext fingerprint schema", before 43.3. This unblocks a full standalone generator that, given only a set of environment inputs (UA, screen size, etc), can produce a valid vData from scratch. Scope: read bytecode pcs ~15000..20800 using the Phase 40 walker, identify every `typeof`/`Object.keys`/`toString`/`String` call that feeds the 112-byte buffer, decompile the field schema, reimplement it in JS. Likely 2-4 additional sessions of dense bytecode reading. Higher risk — the plaintext build is likely the most obfuscated part of vm-slide, and Tencent may have added anti-analysis tricks there. Matches the original Phase 43 ambition but is substantially bigger.

**Option C — Ship Option A now, open Phase 44 for Option B** (pragmatic split).
Lock in the 43.1 finding + the cipher-only generator as a closeable Phase 43. Open Phase 44 "vm-slide plaintext fingerprint reversal" as an independent research track. This gives immediate value from 43.1's solid result without committing to the open-ended decompile work.

### My recommendation

Option C. Reasons:
1. 43.1's result is a genuinely useful standalone artifact — a cipher encoder with recovered key + pipeline spec. Shipping it as `tools/vdata-generator/` (Option A) captures that value immediately.
2. The plaintext reversal is genuinely a different scale of work — probably the largest single investigation in the project so far — and it deserves its own phase header and its own history. Bolting it onto Phase 43 would inflate the phase beyond what the original task framing supports.
3. Phase 44 can be dispatched right after Phase 43 closes, so there is no velocity loss. The user can also defer Phase 44 indefinitely without losing Phase 43's artifacts.

### Artifacts from 43.1 available now
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` — 8-section spec doc
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — reproducible instrumented harness
- `output/vm-slide/vdata-pipeline.json` — machine-readable spec
- `output/vm-slide/vdata-dynamic-trace.json` — raw trace window
- `research/vm-slide-stack-vm/README.md` — updated with reproduction command

**Waiting on**: user to pick Option A, B, or C (or propose a fourth).
