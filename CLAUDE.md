# reverse-chaosvm

Research platform for reverse-engineering Tencent's **ChaosVM** (JSVMP) — a family of JavaScript bytecode virtual machines used in Tencent's CAPTCHA stack for browser fingerprinting and behavioral protection. The project started as a `tdc.js` decompiler + token generator + headless scraper; it is now a **research lab** for the full ChaosVM variant family (register-based `tdc.js` + stack-based `vm-slide.enc.js` + whatever else Tencent ships).

Current working deliverables (all stable, preserved through the restructure):

1. **Register-machine ChaosVM decompiler** — 12-step pipeline transforming obfuscated `tdc.js` → readable JS.
2. **Standalone `collect` token generator** — byte-identical XTEA reimplementation for all known `tdc.js` templates.
3. **Automated `tdc.js` porting pipeline** — parse → opcode-map → key-extract → verify, one command per new build.
4. **Puppeteer CAPTCHA solver** — OpenCV slide-puzzle solver, captures real verification tickets.
5. **Headless scraper** — Puppeteer-free urlsec scraper using jsdom for `vData` generation.

All `targets/*.js` and `sample/*.js` files are **read-only** analysis targets (Tencent's property). Never modify them.

## Research Phase (current)

**Goal**: reverse-engineer the ChaosVM variants we have not yet decompiled, close the open technical unknowns, and restructure the repo so research tracks live alongside each other as first-class citizens.

**Priority backlog** (see `project-brief.md` for full detail):

1. **vm-slide stack VM** — decompile `sample/vm_slide.js` / `vm-slide.enc.js`. Stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, ~36 opcodes). Never ported through the existing register-machine pipeline.
2. **Captcha orchestrator** — analyze `sample/t_captcha_slide.js` (213 KB): how it loads `vm-slide`, constructs verify POST bodies, triggers vData injection.
3. **eks payload** — 232 bytes, server-baked into `tdc.js` at line 123. Structure, fields, relationship to session still unknown.
4. **Template pool survey** — classify many fresh live `tdc.js` builds and measure Tencent's template rotation.
5. **Key-modification constants** — cross-template diff of the XTEA key-mod constants between Templates A, B, C.
6. **Collector field count** — is 59 template-specific, or constant?
7. **errorCode 12** — confirm whether verify-endpoint 12 is fingerprint/behavioral scoring.

Planning artifacts: `project-brief.md` (research phase intent + director permissions), `plan.md` (live task state), `history/<YYYYMMDD>.md` (per-day research log).

## Stack
- **Language / runtime**: Node.js ≥18, CommonJS (`'use strict';`, `require()`, `module.exports`).
- **Python**: 3.x, only for `tools/captcha-solver/slide-solver.py` (OpenCV).
- **Key deps**: `acorn` ^8 (AST parsing for porting pipeline), `jsdom` ^29 (vData environment for the scraper), `puppeteer` ^24 + `puppeteer-extra-plugin-stealth` (dynamic tracing and CAPTCHA solver), `canvas` ^3 (jsdom DOM rendering).

## Directory Layout

```
reverse-chaosvm/
├── targets/                     # read-only — Tencent's obfuscated tdc.js builds
├── sample/                      # read-only — reference captures (HAR, vm-slide, t_captcha_slide)
│
├── research/                    # one subdir per VM variant or open question
│   ├── tdc-register-vm/         # register-machine decompile pipeline (was decompiler/)
│   ├── vm-slide-stack-vm/       # top priority — stack-based ChaosVM decoder/disassembler
│   ├── captcha-orchestrator/    # t_captcha_slide.js flow analysis
│   ├── eks-payload/             # eks structure reversal
│   ├── template-pool/           # live survey + template classifier
│   └── key-mod/                 # cross-template key-mod constant comparison
│
├── tools/                       # runnable utilities (stable working code)
│   ├── token-generator/         # standalone tdc.js token generator (was token/)
│   ├── porting-pipeline/        # automated tdc.js porting pipeline (was pipeline/)
│   ├── scraper/                 # headless urlsec scraper (was scraper/)
│   ├── captcha-solver/          # Puppeteer CAPTCHA solver (was puppeteer/)
│   └── dynamic-tracers/         # runtime instrumentation (was dynamic/)
│
├── scripts/                     # exploratory one-off scripts — triaged into research/ over time
├── output/                      # pipeline and tracer artifacts — always output/<target-stem>/
├── profiles/                    # browser fingerprint profiles for token generation
├── tests/                       # node --test suite (currently 296/296 green)
├── docs/                        # technical reference + per-track research docs
├── history/                     # per-day research logs
├── project-brief.md             # research phase intent and backlog
├── plan.md                      # live task state
└── README.md                    # public overview
```

**Directory semantics**:
- `research/<track>/` owns the analysis artifacts, notes, and source code for one ChaosVM variant or open question. Each track is self-contained.
- `tools/<tool>/` owns runnable utilities that the scraper/decompiler path depends on. These are stable — research extends them, does not rewrite them.
- `targets/` and `sample/` never change. `.claude/rules/targets-readonly.md` enforces this.

## Canonical Commands

```bash
# Install
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Test suite (must stay green — currently 296/296)
npm test
node --test tests/test-decoder.js          # single file

# tdc.js decompile pipeline (register-machine VM)
node research/tdc-register-vm/run.js --input targets/tdc.js --output output/tdc
npm run decompile

# Standalone collect token generator
node tools/token-generator/cli.js --profile profiles/default.json
node tools/token-generator/cli.js --profile profiles/default.json --verbose

# Automated porting pipeline (new tdc.js build → working token generator)
node tools/porting-pipeline/run.js targets/tdc-vN.js
node tools/porting-pipeline/run.js targets/tdc-vN.js --skip-verify

# CAPTCHA solver (Puppeteer + OpenCV)
node tools/captcha-solver/cli.js --domain example.com
node tools/captcha-solver/cli.js --domain example.com --headful

# Headless urlsec scraper (no Puppeteer)
node tools/scraper/cli.js --captcha-only --verbose
node tools/scraper/cli.js --verbose https://example.com
```

> **Restructure note**: the paths above reflect the target layout. The restructure task (first item in `project-brief.md`) is what moves the files; until it completes, old paths (`decompiler/run.js`, `token/cli.js`, `pipeline/run.js`, `puppeteer/cli.js`, `scraper/cli.js`) are still the live entry points.

## Rules (load on demand)

Each rule file below is a focused behavioral contract. Read a rule file **when its trigger matches your task** — do not auto-load all rules.

- `.claude/rules/targets-readonly.md` — read before editing or creating files; enforces the read-only contract for `targets/` and `sample/`.
- `.claude/rules/verify-dont-assume.md` — read before documenting or modifying anything involving XTEA parameters, opcode semantics, token structure, or docs-derived facts.
- `.claude/rules/coding-style.md` — read before writing or editing any JavaScript or Python file.
- `.claude/rules/output-versioning.md` — read before running any pipeline, tracer, or survey script that writes artifacts to disk.
- `.claude/rules/research-artifacts.md` — read before creating files under `research/` or writing new docs under `docs/` tied to a research track.

## Key VM Internals (register-machine reference build: `targets/tdc.js`)

| tdc.js symbol | Canonical name | Role |
|---|---|---|
| `Y[]` | `bytecode` | Decoded integer array |
| `C` | `pc` | Program counter |
| `i[]` | `regs` | Register file (r0–r20+) |
| `Q` | `thisCtx` | Current `this` for method calls |
| `F[]` | `catchStack` | Exception handler address stack |
| `E` | `closureVars` | Captured closure variables |

Variable names differ per build — identify by structural role, not by name. The stack-based vm-slide variant has **different internals** — do not assume these names apply there.

## Planning Context

For the current research phase — intent, scope, director permissions, and priority backlog — see **`project-brief.md`**. For live task state see **`plan.md`**. For per-day research progress see **`history/<YYYYMMDD>.md`**.

## Project Memory — Established Facts (as of 2026-04-13)

**tdc.js register-machine VM — solved**:
- Decompiler pipeline fully working for `targets/tdc.js` (Template A, reference build).
- Standalone byte-identical `collect` token generator for Templates A, B, C.
- Automated porting pipeline: parse → opcode-map → key-extract → verify. All 5 known targets produce byte-identical tokens.
- 296/296 tests green. Phase 37 cleanup archived obsolete files and legacy docs.

**Template table** (register-machine `tdc.js`):

| Target    | Template | TDC_NAME                           | Opcodes | Mapped | XTEA Key                              | Token verified |
|-----------|----------|-------------------------------------|---------|--------|----------------------------------------|----------------|
| tdc.js    | A        | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` | 95      | 95/95  | `6257584F 462A4564 636A5062 6D644140` | byte-identical |
| tdc-v2.js | B        | `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` | 94      | 92/94  | `6B516842 4D554B69 69655456 452C233E` | byte-identical |
| tdc-v3.js | A        | (same as tdc.js)                    | 95      | 95/95  | (same as tdc.js)                       | byte-identical |
| tdc-v4.js | A        | (same as tdc.js)                    | 95      | 95/95  | (same as tdc.js)                       | byte-identical |
| tdc-v5.js | C        | `WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE` | 100     | 91/100 | `5949415A 454D6265 6D686358 6C66525F` | byte-identical |

- **XTEA delta and round count are constant across all templates** (`delta = 0x9E3779B9`, `rounds = 32`).
- **Each template has a unique STATE_A key.** Dynamically extracted by `tools/porting-pipeline/key-extractor.js`.
- **`eks` token is server-baked** into every `tdc.js` response (line 123). Not generated by the VM — extract via regex or `TDC.getInfo().info`. See `docs/EKS_FORMAT.md`.

**vm-slide stack VM — Phase 39/40 solved, Phase 41 flow documented, Phase 42 vData mechanism resolved**:
- Stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, 53 non-null handlers, ~69 dispatch slots). Full-coverage control-flow-aware disassembler (Phase 40.1). Classical XTEA confirmed in the bytecode: encrypt closure at entry PC 15241, decrypt at 15416, delta `0x9E3779B9`. See `docs/VM_SLIDE_ARCHITECTURE.md` + `docs/VM_SLIDE_OPCODES.md` + `docs/CHAOSVM_VARIANTS.md`.
- **`t_captcha_slide.js` orchestrator bundle** (Phase 41): standard webpack 4, 50 live modules, single-root graph rooted at module 64, 91 static edges. Module 56 is the orchestrator core; `collect`/`eks`/`nonce`/`sess` are all transport-only or server-baked. See `docs/CAPTCHA_ORCHESTRATOR.md`. `vm-slide.e201876f.enc.js` is loaded by a hardcoded `<script>` tag in the show-page HTML, NOT by the orchestrator bundle. Module 76 is Zepto; `sample/slide-jy.js` is jQuery 1.11.3 — different libraries selected at load time by user agent.
- **`vData` runtime binding** (Phase 42): resolved in mechanism. On Chrome 146, vm-slide's outer initializer branches on `isIE9Below()` at bytecode pc 19636 and falls through to call `proxyXHR(ctx)` at pc 19662, which installs an `XMLHttpRequest.prototype.send`/`open` monkey-patch. The patched `send` intercepts the orchestrator's verify POST and injects `vData=<ciphertext>` into the body. On IE9 and below, the same gate instead installs `window.getVData` at pc 20066 (function body `[19702, 20058]`), which the orchestrator's `if (a.isLowIE())` branch calls explicitly. The two paths are mutually exclusive. Crypto is **classical** XTEA (32 rounds, delta `0x9E3779B9`, LE uint32 packing; encrypt closure at pc 15241, decrypt at pc 15416) with key `2e430f8c15b7da96` (16 ASCII bytes, bytecode constant), followed by **standard base64 with a 65-char custom alphabet** at pc 16932 (`GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`) where index 64 (`Y`) is the padding character — the role `=` plays in RFC 4648 — emitted by an `isNaN`-guarded encoder at pcs 17084..17418. Pipeline = 14 × 8-byte blocks (112 bytes) → 152 base64 chars ending in `YY` padding. (Phase 43.2 corrected the earlier 43.1 reading that claimed a 2-byte `10 40` trailer — that was a mis-decoding of the `YY` padding as raw 6-bit values: `(64<<6)|64 = 0x1040`.) vm-slide installs exactly one `window.*` property (`getVData`, only on IE9) — no secondary crypto helper. See `research/vm-slide-stack-vm/{VDATA-TRACE,VDATA-RESOLUTION}.md` for the static traces.

**vData cipher pipeline — Phase 43.1/43.2 solved**:
- XTEA key, cipher form, base64 alphabet, padding scheme, and full pipeline shape all pinned. Two committed fixtures under `tests/fixtures/{vdata-jsdom-capture.json, vdata-har-capture.json}` round-trip byte-for-byte both directions (decode↔encode and XTEA encrypt↔decrypt) against the reference verifier `tests/fixtures/verify-vdata-fixtures.js`. The HAR fixture is a real Chrome 146 capture, proving live-traffic byte-identical reproducibility for the cipher half.
- **Plaintext-build (fingerprint) half is NOT solved** — the 112-byte plaintext is a JS-environment fingerprint computed inside vm-slide's `proxyXHR`, not the verify POST body. Per-run byte order varies. Phase 44 (open, no active tasks) owns reversing it. See `research/vm-slide-stack-vm/VDATA-PIPELINE.md` §8.

**Known limitations**:
- **vData plaintext-build is open.** See above + Phase 44 in `plan.md`.
- `urlsec.qq.com` now serves click-image CAPTCHAs for some endpoints — the scraper currently handles slide only.
- `cap_union_new_show` returns HTTP 403 when called without a valid `sess` from prehandle (NOT TLS fingerprinting — verified 2026-04-11).
- errorCode 12 on token verify: not pure IP rate limiting; likely fingerprint/behavioral scoring. See `docs/ERRORCODE_12_INVESTIGATION.md`.

## Documentation

| Doc | Owns |
|-----|------|
| `docs/VM_ARCHITECTURE.md` | Register-machine internals, opcode dispatch (`tdc.js` family) |
| `docs/OPCODE_REFERENCE.md` | All 95 opcodes for `tdc.js` with operands and stack effects |
| `docs/TOKEN_FORMAT.md` | `collect` token spec — encoding layers, XTEA, segment layout (authoritative) |
| `docs/EKS_FORMAT.md` | `eks` token — current facts + open questions |
| `docs/COLLECTOR_SCHEMA.md` | 59-field browser fingerprint schema |
| `docs/CRYPTO_ANALYSIS.md` | Modified XTEA key derivation and round constants |
| `docs/TOKEN_DECRYPTION.md` | How to decrypt a captured token |
| `docs/HAR_ANALYSIS.md` | Network flow analysis of the CAPTCHA protocol |
| `docs/CAPTCHA_ORCHESTRATOR.md` | `t_captcha_slide.js` end-to-end flow + verify-body origination table (vm-slide track, Phase 41; vData mechanism resolved in Phase 42) |
| `docs/CHAOSVM_VARIANTS.md` | Top-level comparison of register-based (`tdc.js`) vs stack-based (`vm-slide`) ChaosVM variants (Phase 39) |
| `docs/VM_SLIDE_ARCHITECTURE.md` | Stack-based ChaosVM internals — `__TENCENT_CHAOS_STACK`, dispatch loop, register file (Phase 39 + 40) |
| `docs/VM_SLIDE_OPCODES.md` | Opcode table for `__TENCENT_CHAOS_STACK` — 53 non-null handlers (Phase 39 + 40 full-coverage walker) |
| `docs/VERSION_DIFFERENCES.md` | Opcode shuffle analysis and porting strategy across templates |
| `docs/ERRORCODE_12_INVESTIGATION.md` | Phase 36 findings on verify-endpoint errorCode 12 |
| `docs/CONVENTIONS.md` | Code style, naming, disassembly format |
| `docs/WORKFLOW.md` | Development phase log |

**New docs planned for the research phase** (written as each track produces verified findings):
- `docs/TEMPLATE_POOL.md` — live template pool survey results.

**All documentation should be treated as reference — verify against live behavior before trusting.** See `.claude/rules/verify-dont-assume.md`.
