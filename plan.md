# Plan

## Status
Current phase: Phase 43 — Byte-identical vData generator
Current task: 43.1 — Hybrid static+dynamic XTEA/plaintext extraction

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
| 43.1 | Hybrid static+dynamic XTEA/plaintext extraction via jsdom harness instrumentation + Phase 40 walker cross-check | in-progress |
| 43.2 | Validation trace against HAR fixture — produce committed `tests/fixtures/vdata-har-capture.json` | pending |
| 43.3 | Standalone generator `tools/vdata-generator/{xtea.js, custom-base64.js, plaintext.js, cli.js}` | pending |
| 43.4 | Tests for the standalone generator (different agent) + optional live fresh-capture validation via `tools/captcha-solver/live-submit.js` | pending |
| 43.5 | Docs — new `docs/VDATA_FORMAT.md`, update `docs/CAPTCHA_ORCHESTRATOR.md` §6 with byte-level spec, track README + CLAUDE.md Project Memory bumps (director-owned) | pending |

---

## Current Task

**ID**: 43.1
**Title**: Hybrid static+dynamic XTEA/plaintext extraction
**Phase**: Phase 43 — Byte-identical vData generator
**Status**: in-progress

### Goal
Pin down the exact byte-level pipeline that converts a verify POST body into the `vData` string. Produce a written, reproducible specification of: (a) the XTEA key (16 bytes, classical variant), (b) the plaintext structure being encrypted (what fields are concatenated, in what order, with what separators and padding), (c) the ciphertext → custom-base64 transform, and (d) where each stage lives in `sample/vm_slide.js` bytecode. This is the foundational task that everything else in Phase 43 depends on. No standalone code under `tools/` yet — 43.1 is research.

### Context
Phase 42 already resolved the *mechanism*: on Chrome vm-slide calls `<state>.proxyXHR(p[3])` at bytecode pc 19662, which installs an `XMLHttpRequest.prototype.send`/`open` monkey-patch. The monkey-patch intercepts the orchestrator's verify POST and rewrites the body to append `vData=<ciphertext>`. What's still unknown is the byte-level detail of that rewrite.

Known crypto ingredients (from `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` §3 + Phase 40.6):
- **Classical XTEA** (not the modified variant used by the register-VM `tdc.js` family). Encrypt closure entry pc 15241, decrypt closure entry pc 15416. Delta `0x9E3779B9` at bytecode indices 15352 and 15530. 32 rounds (sum-bounded at `32·delta = 84941944608`). Both encrypt and decrypt are instantiated by a single outer factory at entry pc 15220, spawned via `FUNC_CREATE 15220 0 3 3 4 5` near pc 16835; the factory takes 3 arguments including key material in local slot 4 (Phase 40.6 finding).
- **Custom 64-char base64 alphabet** at pc 16932: `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`. Every character in the 152-char HAR `vData` value is a member of this alphabet (zero outliers — verified by 42.2).
- **Char-set validator regex** at pc 17677: `[^A-Za-z0-9\-\_\*]`. Matches the alphabet's non-alphanumerics.
- **Reference HAR `vData` value** (from `sample/captcha-har.har`): `7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4lsXbEguCZ7eZtjCMfbg9*wbiQoH_4-hrxaM7THpUbbQuqIfPi5vl549PdPPu64P-GnmSuAKqlxUcL9yFjBMA5RsJRiYY` (152 chars, `len % 4 == 0`, decodes to 114 raw bytes ≈ 14 × 8-byte XTEA blocks).

What's *still unknown* from Phase 42 and needs 43.1 to resolve:
1. **Exact 16-byte XTEA key** — constant baked into bytecode, or derived at runtime from session state?
2. **Exact plaintext layout** — is it the query-string `n.join("&")` shape the orchestrator's `window.getVData` fallback uses (`aid=...&protocol=...&accver=...&...`)? Or the raw POST body? Or a session-state snapshot? What padding scheme reaches the 114-byte boundary?
3. **XHR proxy body pc range** — Phase 42 localized it to approximately pcs 15000..20700 but did not decompile it. 43.1 must identify the specific entry pc of the proxy function, the path from there to the XTEA encrypt call, and the path from XTEA encrypt output to the custom-base64 transform.
4. **Output assembly** — is the final `vData=<base64>` built inside vm-slide and the entire `key=value` pair injected, or does vm-slide return just the value and the XHR proxy prepends the `vData=`?

### Two-pronged approach

**Prong A — Dynamic trace via jsdom harness instrumentation.**

The existing `tools/scraper/vdata-harness.js` (just renamed by 43.0) already executes `sample/vm_slide.js` inside jsdom with a pre-installed `XMLHttpRequest.prototype.send` hook. For 43.1 we extend the harness temporarily — NOT in production code, but in a new research script under `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — to capture the crypto internals:

1. **Before loading vm-slide into jsdom**, install hooks on all the primitives XTEA might use: `Uint8Array`, `Uint32Array`, `DataView`, `Array.prototype.push`, `String.prototype.charCodeAt`, `String.fromCharCode`. Record every call.
2. **After vm-slide loads but before firing the XHR**, capture a snapshot of the jsdom global object. Diff against the pre-load snapshot to see every property vm-slide installed. This is how we find the `proxyXHR` reference and any key material that made it to globals.
3. **During the verify-POST fire**, observe the order of primitive calls between the harness's body serialization and the final `send` invocation. The XTEA 32-round structure is unmistakable: 32 consecutive iterations where a running `sum` folds `delta=0x9E3779B9` with bit-mixed `v0`/`v1` words. Record the key bytes as they're XORed.
4. **Capture** `{pre_body, post_body, plaintext_bytes, key_bytes, ciphertext_bytes, vData_string}` as JSON.

The big advantage of Prong A: we don't need to read vm-slide disassembly to get the answer. The dynamic trace hands us the key and plaintext directly.

**Prong B — Static cross-check via Phase 40 walker.**

Prong A gives us the ground truth. Prong B confirms it lives where we think it lives and that the static bytecode structure matches what we observed dynamically. Use `research/vm-slide-stack-vm/walker.js` to enumerate function bodies in pcs 15000..20700. Cross-reference against `output/vm-slide/window-installs.json` (42.2) and Phase 40.6's findings about the XTEA factory at pc 15220. Produce a short annotated disassembly window covering:
- The outer factory at pc 15220 and its arguments
- The two closures it spawns (encrypt entry 15241, decrypt entry 15416)
- The `proxyXHR` function body (wherever it turns out to live — Phase 42 localized to ~15000..20700)
- The call path from `proxyXHR` to the encrypt closure

This locks the dynamic trace onto bytecode coordinates so future builds can be diffed against it.

### Inputs (read these)
- `sample/vm_slide.js` — vm-slide source (read-only target).
- `sample/captcha-har.har` — the HAR capture. Extract the full verify-POST field set (`sample/payload.txt` is a related sample) and the reference `vData` string above.
- `sample/slide-jy.js` — jQuery 1.11.3, used by the harness to serialize the POST body in exactly the shape vm-slide expects.
- `tools/scraper/vdata-harness.js` — the existing jsdom harness. Read its full 98 lines before writing the instrumented variant — you'll reuse its jsdom bootstrap, pre-send hook pattern, and user-agent stubbing.
- `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` — Phase 42's write-up. Section §3 lists every known crypto-adjacent pc. Section §4 is the resolution verdict. Section §5 is a suggested 42.3 hand-off that Phase 43 is executing.
- `research/vm-slide-stack-vm/VDATA-TRACE.md` — Phase 42.1 static trace with the 42.2 correction post-script. Use for pc coordinates of the `getVData` IE9 branch; *not* the proxyXHR branch you care about.
- `docs/CAPTCHA_ORCHESTRATOR.md` §6 — the `vData` sub-section. Reconcile any byte-level finding here.
- `output/vm-slide/bytecode.json` — the decoded 24,273-element bytecode array. Read-via-index in your research script.
- `output/vm-slide/disassembly-full.txt` — full-coverage CFG walker output from Phase 40.1. Use for static cross-reference.
- `output/vm-slide/window-installs.json` — reproducible `[window, <key>]` install enumeration from 42.2.
- `research/vm-slide-stack-vm/walker.js`, `decoder.js`, `disassembler.js` — Phase 40 tooling. The walker exposes a function-body enumerator; the disassembler produces the text format used in `disassembly-full.txt`.
- `research/vm-slide-stack-vm/xtea-hunt.js` — Phase 40.6's annotated XTEA disassembly script. Use for the encrypt/decrypt closure shape reference.
- **Do NOT** touch `targets/` or `sample/` files — read-only per `.claude/rules/targets-readonly.md`.

### Implementation Steps

1. **Set up the research directory**. Create `research/vm-slide-stack-vm/vdata-dynamic-trace.js` as a new file (not in `tools/`, this is research). Add a short comment block pointing back to Phase 43 and this plan task.

2. **Build the instrumented jsdom harness**. Start from the structure of `tools/scraper/vdata-harness.js` — same jsdom bootstrap, same pre-send hook, same jQuery + vm-slide load order. Extend with the instrumentation hooks listed under Prong A step 1. The hooks should be installed on `dom.window.*` BEFORE vm-slide is injected. All hook output should go to an in-memory trace array, not stdout, so you can post-process it.

3. **Fire a verify POST using the HAR field set**. Parse `sample/captcha-har.har` (or read `sample/payload.txt` if it contains the same body) to reconstruct the exact field set that produced the reference `vData`. Feed it to the instrumented harness. Confirm the final captured body contains a `vData=` tail (proof the harness works).

4. **Identify the XTEA call window**. Post-process the hook trace to find the 32-iteration pattern that folds `0x9E3779B9`. The `sum` variable starts at 0 (encrypt) or `32·delta` (decrypt) and steps by ±delta per round. Once you find the window, read the key bytes: classical XTEA references `key[sum & 3]` and `key[(sum >>> 11) & 3]` inside each round, so every round touches exactly 2 of the 4 key words. After 32 rounds all 4 words have been referenced. Extract them.

5. **Identify the plaintext**. Before the first XTEA round, the harness should have observed the caller of the encrypt entry. Capture its input — the plaintext bytes — as an array. Decode it as UTF-8 and as hex. Record both.

6. **Identify the output path**. After the 32nd round, observe where the ciphertext goes. Trace it through the custom-base64 transform (the alphabet at pc 16932; a lookup-table encode). Confirm the resulting string matches the reference `vData`.

7. **Emit the dynamic artifacts**:
   - `output/vm-slide/vdata-pipeline.json` — `{xtea_key_hex, plaintext_hex, plaintext_utf8_or_null, ciphertext_hex, vdata_string, plaintext_source_description, output_alphabet, reference_har_match: bool}`.
   - `output/vm-slide/vdata-dynamic-trace.json` — full hook trace, truncated to the XTEA window ±50 calls. For debugging future builds.

8. **Static cross-check (Prong B)**. Use `research/vm-slide-stack-vm/walker.js` and `decoder.js` to enumerate function bodies in the range pcs 15000..20700. Identify which function body is the `proxyXHR` implementation (look for string table references to `XMLHttpRequest`, `send`, `open` — Phase 42.2 found those at pcs 20154/20220/20290/20476/20621 for `XMLHttpRequest`, 20204/20526/20671 for `send`, 20270/20340 for `open`). Locate the call from the proxy body into the encrypt closure at pc 15241.

9. **Write `research/vm-slide-stack-vm/VDATA-PIPELINE.md`**. Required sections:
   - §1 Scope: what 43.1 resolves vs what it does not
   - §2 Dynamic trace methodology: how the instrumented harness works, reproduction command
   - §3 XTEA key: 16 bytes hex, plus the classical-variant confirmation (round count, delta, bit-mix pattern)
   - §4 Plaintext: byte-level layout, field order, separators, padding scheme, UTF-8 decoding
   - §5 Output: custom-base64 encode confirmation, alphabet cross-reference, final string assembly
   - §6 Static bytecode coordinates: pcs for the proxyXHR body, the encrypt call site, the plaintext constructor (if distinct), the base64 transform
   - §7 Reference HAR match: show the full transform `(fields) → (plaintext) → (ciphertext) → (vData)` against the `sample/captcha-har.har` field set, and whether it reproduces the reference 152-char value
   - §8 Open questions (if any) for 43.2+

10. **Update `research/vm-slide-stack-vm/README.md`** — add `vdata-dynamic-trace.js` to the "How to reproduce" section and add a short bullet under Phase 42 findings pointing to VDATA-PIPELINE.md.

### Warnings

- **Do not modify `tools/scraper/vdata-harness.js`**. The instrumentation lives in a separate research script. The harness is production code used by the scraper and its test; adding crypto-tracing hooks there would pollute its API and slow its tests.
- **Do not write anything under `tools/vdata-generator/`**. That directory is reserved for 43.3 (implementation). 43.1 is research only.
- **Classical XTEA — not modified XTEA**. The register-VM `tdc.js` family uses a *modified* XTEA (key modification constants per template, see `docs/CRYPTO_ANALYSIS.md`). vm-slide uses *classical* XTEA per Phase 40.6. Do not import or reuse the register-VM's XTEA implementation — write a fresh classical one if your trace needs a reference decoder.
- **Byte-identical is the bar, not "approximately matches"**. If your Prong A dynamic trace reproduces a 152-char output that matches the reference HAR `vData` byte-for-byte, 43.1 is a pass. If it matches in structure but not in bytes, dig deeper before declaring success — the key or plaintext is likely off by a field order or a padding byte.
- **The reference HAR may have been captured with a specific session/timestamp state**. If the plaintext includes a session-derived field (which is likely), the instrumented harness will produce a *different* vData than the HAR reference even when everything works correctly — because the session state differs. This is fine for 43.1 as long as you can explain *why* they differ (i.e. "this field of the plaintext is the session token, which is different between the HAR capture and this run"). 43.2 will build a deterministic fixture against the exact HAR field set.
- **Do NOT make any git commits**. The director handles all commits after verification.
- **If the task is too difficult or impossible to complete**, stop immediately and report back. Explain what you attempted, what went wrong, and why you believe the task cannot be completed as specified. Do not leave behind partial or broken changes. In particular: if the instrumentation hooks interfere with vm-slide's execution (e.g. the hook machinery causes vm-slide to detect instrumentation and take a different branch), report it — don't fight it. The fallback is a pure-static approach using the Phase 40 walker, which the director can re-plan around.

### Verification
- [ ] `node research/vm-slide-stack-vm/vdata-dynamic-trace.js` runs idempotently and writes `output/vm-slide/vdata-pipeline.json` + `output/vm-slide/vdata-dynamic-trace.json`
- [ ] `output/vm-slide/vdata-pipeline.json` contains a 16-byte `xtea_key_hex` (32 hex chars), a non-empty `plaintext_hex`, a non-empty `ciphertext_hex`, and a 152-char `vdata_string` whose character set is a subset of the custom alphabet
- [ ] `VDATA-PIPELINE.md` §7 shows the full transform reproducing the reference HAR `vData` byte-for-byte — or, if session-state differs, clearly explains which plaintext field diverges and why
- [ ] `VDATA-PIPELINE.md` §6 cites static bytecode pcs for (a) the proxyXHR body entry, (b) the encrypt call site, (c) the plaintext construction site, (d) the base64 transform site, each confirmed by a disassembly snippet from `output/vm-slide/disassembly-full.txt`
- [ ] `npm test` still passes at 353/353 (no regressions; 43.1 should not touch production code)
- [ ] `grep -R "vdata-generator" tools/` returns only the forward-looking JSDoc reference in `vdata-harness.js` (no accidental early writes to `tools/vdata-generator/`)

### Suggested Agent
`general-purpose` — Prong A (jsdom instrumentation + dynamic tracing) is script-authoring and data-wrangling, Prong B (static cross-check) is reading existing Phase 40 tooling and `output/vm-slide/disassembly-full.txt`. No specialist agent fits this shape better.
