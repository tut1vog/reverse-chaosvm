# reverse-chaosvm

Minimal toolkit for working with Tencent's ChaosVM (JSVMP) CAPTCHA stack. Two scrapers take a domain end-to-end against `urlsec.qq.com`, and a porting pipeline resolves the per-build parameters of any new register-machine `tdc.js`.

## What this project does

1. **Pure-Node end-to-end scraper** — `tools/scraper/` fetches `tdc.js` at runtime, solves the slide CAPTCHA with OpenCV, synthesizes a byte-identical `vData`, and submits the verification ticket to `urlsec.qq.com`. No browser, no DOM.
2. **Puppeteer scraper** — `tools/puppeteer/` drives Chrome (via `puppeteer-extra` + stealth) and logs the full request flow plus token contents for verification or capture.
3. **Porting pipeline** — `tools/porting-pipeline/` takes any new register-machine `tdc.js` build through `parse VM → map opcodes → extract XTEA key → verify token`, producing byte-identical tokens for every observed build.

## Stack

- **Runtime**: Node.js ≥ 18, CommonJS.
- **Python**: 3.x — only for the OpenCV slide solver (`tools/puppeteer/slide-solver.py`).
- **Key dependencies**: `acorn` (porting pipeline AST parsing), `puppeteer` + `puppeteer-extra-plugin-stealth` (puppeteer scraper, porting-pipeline tracers).

## Quick start

```bash
# Install
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Test suite
npm test

# Pure-Node scraper (no Puppeteer; fetches live tdc.js at runtime)
node tools/scraper/cli.js --captcha-only --verbose
node tools/scraper/cli.js --verbose https://example.com

# Puppeteer scraper (drives Chrome, logs requests + tokens)
node tools/puppeteer/cli.js --domain example.com
node tools/puppeteer/cli.js --domain example.com --headful

# Porting pipeline (new tdc.js build → working token generator)
node tools/porting-pipeline/run.js <path-to-tdc.js>
node tools/porting-pipeline/run.js <path-to-tdc.js> --skip-verify

# Standalone collect token generator (library inside scraper)
node tools/scraper/token-generator/cli.js --profile profiles/default.json

# Standalone vData generator (library inside scraper)
node tools/scraper/vdata-generator/cli.js --help
```

## Directory layout

```
reverse-chaosvm/
├── tools/
│   ├── scraper/             # pure-Node scraper + inlined token-generator/ + vdata-generator/
│   ├── puppeteer/           # Puppeteer CAPTCHA solver + OpenCV slide solver
│   ├── porting-pipeline/    # parse → opcode-map → key-extract → verify
│   └── dynamic-tracers/     # standalone Puppeteer tracers
├── research/
│   └── template-pool/       # live-comparison.js — end-to-end integration example
├── docs/                    # 15 reference docs — see Documentation
├── profiles/                # browser fingerprint profiles
├── tests/                   # node --test suite
└── README.md
```

Neither scraper nor the porting pipeline keeps local copies of `tdc.js` — fresh sources are fetched at runtime from `urlsec.qq.com` (or supplied as an argument).

## Templates (register-machine `tdc.js`)

| Template | Example `TDC_NAME` | Opcodes | XTEA key |
|---|---|---|---|
| A | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` | 95 | `6257584F 462A4564 636A5062 6D644140` |
| B | `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` | 94 | `6B516842 4D554B69 69655456 452C233E` |
| C | `WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE` | 100 | `5949415A 454D6265 6D686358 6C66525F` |

XTEA delta (`0x9E3779B9`) and round count (32) are constant across templates. `STATE_A` key and key-modification constants vary per template and are extracted dynamically by `tools/porting-pipeline/key-extractor.js`. `eks` is server-baked into every `tdc.js` response (line 123); see `docs/EKS_FORMAT.md`.

## Documentation

| Document | Owns |
|---|---|
| [TOKEN_FORMAT.md](docs/TOKEN_FORMAT.md) | `collect` token spec — encoding layers, XTEA, segment layout |
| [TOKEN_DECRYPTION.md](docs/TOKEN_DECRYPTION.md) | How to decrypt a captured token |
| [COLLECTOR_SCHEMA.md](docs/COLLECTOR_SCHEMA.md) | 59-field browser fingerprint schema |
| [COLLECT_FINGERPRINT_ANALYSIS.md](docs/COLLECT_FINGERPRINT_ANALYSIS.md) | `cd` fingerprint field analysis |
| [CRYPTO_ANALYSIS.md](docs/CRYPTO_ANALYSIS.md) | Modified XTEA key derivation and round constants |
| [VDATA_FORMAT.md](docs/VDATA_FORMAT.md) | `vData` byte-level spec |
| [EKS_FORMAT.md](docs/EKS_FORMAT.md) | `eks` token — current facts and open questions |
| [CAPTCHA_ORCHESTRATOR.md](docs/CAPTCHA_ORCHESTRATOR.md) | `t_captcha_slide.js` end-to-end flow |
| [VM_ARCHITECTURE.md](docs/VM_ARCHITECTURE.md) | Register-machine internals, opcode dispatch |
| [OPCODE_REFERENCE.md](docs/OPCODE_REFERENCE.md) | 95 opcodes for the Template A reference |
| [VM_SLIDE_ARCHITECTURE.md](docs/VM_SLIDE_ARCHITECTURE.md) | Stack-based ChaosVM internals (vData consumer) |
| [VM_SLIDE_OPCODES.md](docs/VM_SLIDE_OPCODES.md) | Opcode table for `__TENCENT_CHAOS_STACK` |
| [CHAOSVM_VARIANTS.md](docs/CHAOSVM_VARIANTS.md) | Register-based vs stack-based ChaosVM comparison |
| [VERSION_DIFFERENCES.md](docs/VERSION_DIFFERENCES.md) | Opcode shuffle analysis and porting strategy across templates |
| [HAR_ANALYSIS.md](docs/HAR_ANALYSIS.md) | Network flow analysis of the CAPTCHA protocol |

## Requirements

- Node.js ≥ 18
- Python 3 + OpenCV (slide solver only)

## License

Research / educational use. The `tdc.js` files are Tencent's property; this project fetches them at runtime and does not redistribute them.
