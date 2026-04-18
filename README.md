# reverse-chaosvm

Research platform for reverse-engineering Tencent's ChaosVM (JSVMP) — a family of JavaScript bytecode virtual machines used in Tencent's CAPTCHA stack. Delivers a `tdc.js` register-VM decompiler, a standalone `collect` / `vData` token generator (byte-identical to live traffic), an automated porting pipeline for new `tdc.js` builds, a Puppeteer-based CAPTCHA solver, and a headless jsdom urlsec scraper.

## What this project does

1. **Decompiles ChaosVM bytecode** — a 12-step pipeline transforms the obfuscated register-machine `tdc.js` into readable annotated JavaScript (bytecode decoding, 95-opcode disassembly, string/function extraction, CFG, pattern recognition, expression folding, code emission).

2. **Generates valid TDC tokens standalone** — reimplements the modified-XTEA encryption and the 59-field collector schema from scratch. Produces byte-identical `collect` tokens to live traffic for Templates A / B / C.

3. **Generates byte-identical `vData`** — standalone `vData` builder for the vm-slide stack VM: 8-field tdc runtime-state probe → PKCS#7-style pad → ShiftRows → classical XTEA → custom base64. Three public APIs (cipher-only, replay-with-substitution, from-obj synthesis).

4. **Automated porting pipeline** — takes any new register-machine `tdc.js` build through 4 stages (parse VM → map opcodes → extract XTEA key → verify token). Produces byte-identical tokens for every observed build.

5. **Solves Tencent slide CAPTCHAs** — Puppeteer-based bot that intercepts CAPTCHA images, solves the slide puzzle with OpenCV (Canny edge detection + normalized cross-correlation), performs a realistic mouse drag, and captures the verification ticket.

6. **Headless urlsec scraper** — jsdom-based scraper that fetches `tdc.js` at runtime, solves the slide CAPTCHA, and submits the ticket to `urlsec.qq.com` without Puppeteer.

## Stack

- **Runtime**: Node.js >= 18, CommonJS.
- **Python**: 3.x — only for the OpenCV slide solver.
- **Key dependencies**: `acorn` ^8 (AST parsing — porting pipeline), `jsdom` ^29 (vData generation — headless scraper), `puppeteer` ^24 + `puppeteer-extra-plugin-stealth` ^2 (CAPTCHA solver + dynamic tracing), `canvas` ^3 (jsdom DOM rendering).

## Quick start

```bash
# Install
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Test suite
npm test

# Register-VM decompiler — takes a caller-supplied tdc.js path
node research/tdc-register-vm/run.js --input <path-to-tdc.js> --output output/<stem>

# Standalone collect token generator
node tools/token-generator/cli.js --profile profiles/default.json

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

## Directory layout

```
reverse-chaosvm/
├── research/                    # one subdir per VM variant or open question
│   ├── tdc-register-vm/         # 12-step decompile pipeline (register-machine VM)
│   ├── vm-slide-stack-vm/       # stack-based ChaosVM analysis
│   ├── captcha-orchestrator/    # t_captcha_slide.js flow analysis
│   └── template-pool/           # live template survey + classifier
├── tools/                       # stable runnable utilities
│   ├── token-generator/         # standalone collect-token generator
│   ├── porting-pipeline/        # parse → opcode-map → key-extract → verify
│   ├── scraper/                 # headless urlsec scraper (jsdom, no browser)
│   ├── captcha-solver/          # Puppeteer CAPTCHA solver + OpenCV slide solver
│   ├── vdata-generator/         # byte-identical vData builder
│   └── dynamic-tracers/         # runtime instrumentation harnesses
├── docs/                        # technical reference — see documentation index
├── profiles/                    # browser fingerprint profiles
├── tests/                       # node --test suite (fixtures under tests/fixtures/)
└── README.md
```

Neither the scraper nor the porting pipeline keeps local copies of `tdc.js`: fresh sources are fetched at runtime from `urlsec.qq.com` (or supplied by the caller as an argument).

## Templates (register-machine `tdc.js`)

| Template | Example `TDC_NAME` | Opcodes | XTEA key |
|---|---|---|---|
| A | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` | 95 | `6257584F 462A4564 636A5062 6D644140` |
| B | `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` | 94 | `6B516842 4D554B69 69655456 452C233E` |
| C | `WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE` | 100 | `5949415A 454D6265 6D686358 6C66525F` |

XTEA delta (`0x9E3779B9`) and round count (32) are constant across templates. `STATE_A` key and key-modification constants vary per template and are extracted dynamically by `tools/porting-pipeline/key-extractor.js`. `eks` is server-baked into every `tdc.js` response (line 123) — extract via regex or `TDC.getInfo().info`; see `docs/EKS_FORMAT.md`.

## Documentation

| Document | Owns |
|---|---|
| [TOKEN_FORMAT.md](docs/TOKEN_FORMAT.md) | `collect` token spec — encoding layers, XTEA, segment layout |
| [TOKEN_DECRYPTION.md](docs/TOKEN_DECRYPTION.md) | How to decrypt a captured token |
| [COLLECTOR_SCHEMA.md](docs/COLLECTOR_SCHEMA.md) | 59-field browser fingerprint schema |
| [COLLECT_FINGERPRINT_ANALYSIS.md](docs/COLLECT_FINGERPRINT_ANALYSIS.md) | `cd` fingerprint field analysis |
| [CRYPTO_ANALYSIS.md](docs/CRYPTO_ANALYSIS.md) | Modified XTEA key derivation and round constants |
| [VDATA_FORMAT.md](docs/VDATA_FORMAT.md) | `vData` byte-level spec — tdc runtime-state probe, pad + ShiftRows + XTEA + custom base64 |
| [EKS_FORMAT.md](docs/EKS_FORMAT.md) | `eks` token — current facts and open questions |
| [CAPTCHA_ORCHESTRATOR.md](docs/CAPTCHA_ORCHESTRATOR.md) | `t_captcha_slide.js` end-to-end flow + verify-body origination |
| [VM_ARCHITECTURE.md](docs/VM_ARCHITECTURE.md) | Register-machine internals, opcode dispatch |
| [OPCODE_REFERENCE.md](docs/OPCODE_REFERENCE.md) | 95 opcodes for the Template A reference, operands and stack effects |
| [VM_SLIDE_ARCHITECTURE.md](docs/VM_SLIDE_ARCHITECTURE.md) | Stack-based ChaosVM internals |
| [VM_SLIDE_OPCODES.md](docs/VM_SLIDE_OPCODES.md) | Opcode table for `__TENCENT_CHAOS_STACK` |
| [CHAOSVM_VARIANTS.md](docs/CHAOSVM_VARIANTS.md) | Register-based vs stack-based ChaosVM comparison |
| [VERSION_DIFFERENCES.md](docs/VERSION_DIFFERENCES.md) | Opcode shuffle analysis and porting strategy across templates |
| [HAR_ANALYSIS.md](docs/HAR_ANALYSIS.md) | Network flow analysis of the CAPTCHA protocol |

## Requirements

- **Node.js** >= 18
- **Python 3** + OpenCV (for slide solver only)

## License

Research/educational use. The `tdc.js` files are Tencent's property; this project fetches them at runtime and does not redistribute them.
