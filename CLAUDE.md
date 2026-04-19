# reverse-chaosvm

Research platform for reverse-engineering Tencent's ChaosVM (JSVMP) — a family of JavaScript bytecode virtual machines used in Tencent's CAPTCHA stack. Delivers a `tdc.js` register-VM decompiler, a standalone `collect` / `vData` token generator (byte-identical to live traffic), an automated porting pipeline for new `tdc.js` builds, a Puppeteer-based CAPTCHA solver, and a headless Node-only urlsec scraper (no browser, no DOM).

## Stack
- **Runtime**: Node.js ≥18, CommonJS (`'use strict';`, `require()`, `module.exports`).
- **Python**: 3.x — only for `tools/captcha-solver/slide-solver.py` (OpenCV).
- **Key dependencies**: `acorn` ^8 (AST parsing — porting pipeline), `puppeteer` ^24 + `puppeteer-extra-plugin-stealth` ^2 (CAPTCHA solver + dynamic tracing), `jsdom` ^29 + `canvas` ^3 (research scripts only — the live scraper runs entirely in Node with no DOM).

## Directory Layout

```
reverse-chaosvm/
├── research/                    # one subdir per VM variant or open question
│   ├── tdc-register-vm/         # 12-step decompile pipeline (register-machine VM)
│   ├── vm-slide-stack-vm/       # stack-based ChaosVM (__TENCENT_CHAOS_STACK) analysis
│   ├── captcha-orchestrator/    # t_captcha_slide.js flow analysis
│   └── template-pool/           # live template survey + classifier
├── tools/                       # stable runnable utilities
│   ├── token-generator/         # standalone collect-token generator
│   ├── porting-pipeline/        # parse → opcode-map → key-extract → verify
│   ├── scraper/                 # headless urlsec scraper (pure Node, no DOM, no browser)
│   ├── captcha-solver/          # Puppeteer CAPTCHA solver + OpenCV slide solver
│   ├── vdata-generator/         # byte-identical vData builder
│   └── dynamic-tracers/         # runtime instrumentation harnesses
├── docs/                        # technical reference — see index below
├── profiles/                    # browser fingerprint profiles
├── tests/                       # node --test suite (fixtures under tests/fixtures/)
└── README.md                    # public overview
```

Neither the scraper nor the porting pipeline keeps local copies of `tdc.js`: fresh sources are fetched at runtime from `urlsec.qq.com` (or supplied by the caller as an argument).

## Canonical Commands

```bash
# Install
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Test suite
npm test

# Register-VM decompiler — takes a runtime-supplied tdc.js path
node research/tdc-register-vm/run.js --input <path-to-tdc.js> --output output/<stem>

# Standalone collect token generator
node tools/token-generator/cli.js --profile profiles/default.json
node tools/token-generator/cli.js --profile profiles/default.json --verbose

# Automated porting pipeline (new tdc.js build → working token generator)
node tools/porting-pipeline/run.js <path-to-tdc.js>
node tools/porting-pipeline/run.js <path-to-tdc.js> --skip-verify

# Headless urlsec scraper (no Puppeteer; fetches live tdc.js at runtime)
node tools/scraper/cli.js --captcha-only --verbose
node tools/scraper/cli.js --verbose https://example.com

# Puppeteer CAPTCHA solver
node tools/captcha-solver/cli.js --domain example.com
node tools/captcha-solver/cli.js --domain example.com --headful
```

## Rules (load on demand)

Each rule file below is a focused behavioral contract. Read a rule file **when its trigger matches your task** — do not auto-load all rules.

- `.claude/rules/coding-style.md` — read before writing or editing any JavaScript or Python file.
- `.claude/rules/verify-dont-assume.md` — read before documenting or modifying XTEA parameters, opcode semantics, token structure, or any fact cited from `docs/`.
- `.claude/rules/output-versioning.md` — read before running any pipeline, tracer, or survey script that writes artifacts to disk.
- `.claude/rules/research-artifacts.md` — read before creating files under `research/` or writing new docs under `docs/` tied to a research track.

## Key VM Internals (register-machine reference)

Symbol names differ per build. Identify VM variables by **structural role**, not by name.

| Role | Description |
|---|---|
| `bytecode` | Decoded integer array (e.g. `Y[]` in the reference build) |
| `pc` | Program counter |
| `regs` | Register file (r0–r20+) |
| `thisCtx` | Current `this` for method calls |
| `catchStack` | Exception handler address stack |
| `closureVars` | Captured closure variables |

The stack-based `vm-slide` variant has different internals — do not assume these names apply there. See `docs/VM_SLIDE_ARCHITECTURE.md`.

## Documentation Index

| Doc | Owns |
|---|---|
| `docs/TOKEN_FORMAT.md` | `collect` token spec — encoding layers, XTEA, segment layout |
| `docs/TOKEN_DECRYPTION.md` | How to decrypt a captured token |
| `docs/COLLECTOR_SCHEMA.md` | 59-field browser fingerprint schema |
| `docs/COLLECT_FINGERPRINT_ANALYSIS.md` | `cd` fingerprint field analysis |
| `docs/CRYPTO_ANALYSIS.md` | Modified XTEA key derivation and round constants |
| `docs/VDATA_FORMAT.md` | `vData` byte-level spec — tdc runtime-state probe, pad + ShiftRows + XTEA + custom base64 |
| `docs/EKS_FORMAT.md` | `eks` token — current facts and open questions |
| `docs/CAPTCHA_ORCHESTRATOR.md` | `t_captcha_slide.js` end-to-end flow + verify-body origination |
| `docs/VM_ARCHITECTURE.md` | Register-machine internals, opcode dispatch |
| `docs/OPCODE_REFERENCE.md` | 95 opcodes for the Template A reference, operands and stack effects |
| `docs/VM_SLIDE_ARCHITECTURE.md` | Stack-based ChaosVM internals |
| `docs/VM_SLIDE_OPCODES.md` | Opcode table for `__TENCENT_CHAOS_STACK` |
| `docs/CHAOSVM_VARIANTS.md` | Register-based vs stack-based ChaosVM comparison |
| `docs/VERSION_DIFFERENCES.md` | Opcode shuffle analysis and porting strategy across templates |
| `docs/HAR_ANALYSIS.md` | Network flow analysis of the CAPTCHA protocol |

All documentation is reference material — verify against live behavior before trusting. See `.claude/rules/verify-dont-assume.md`.

## Durable Facts

**tdc.js register-machine VM**
- Decompiler pipeline proven on the Template A reference build.
- Standalone byte-identical `collect` token generator for Templates A, B, C.
- Automated porting pipeline (`parse → opcode-map → key-extract → verify`) produces byte-identical tokens for every `tdc.js` build observed to date.

**Templates** (register-machine `tdc.js`)

| Template | Example `TDC_NAME` | Opcodes | XTEA key |
|---|---|---|---|
| A | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` | 95 | `6257584F 462A4564 636A5062 6D644140` |
| B | `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` | 94 | `6B516842 4D554B69 69655456 452C233E` |
| C | `WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE` | 100 | `5949415A 454D6265 6D686358 6C66525F` |

XTEA delta (`0x9E3779B9`) and round count (32) are constant across templates. `STATE_A` key and key-modification constants vary per template and are extracted dynamically by `tools/porting-pipeline/key-extractor.js`. `eks` is server-baked into every `tdc.js` response (line 123) — extract via regex or `TDC.getInfo().info`; see `docs/EKS_FORMAT.md`.

**vm-slide stack VM + vData**
- Stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, ~53 non-null handlers). Classical XTEA (32 rounds, delta `0x9E3779B9`); runtime key is sourced from the bytecode or via a seed→key transform depending on the build.
- `vData` pipeline: 8-field tdc runtime-state probe → PKCS#7 pad to 112 bytes → ShiftRows permute → XTEA encrypt → custom 65-char base64 (padding character `Y`, index 64). Round-trip fixtures at `tests/fixtures/vdata-{har,jsdom}-capture.json`.
- Three public APIs in `tools/vdata-generator/`: `encodeVData` (cipher-only), `buildVData` (replay-with-substitution), `buildVDataFromObj` (from-obj synthesis with seeded PRNG).

## Planning Context

For the current work pass — intent, scope, and any active unknowns — see `project-brief.md` when it exists. The repo has no long-running planning artifact; each short-lived project pass writes a brief at the start and deletes it when the pass is done.
