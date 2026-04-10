# reverse-chaosvm

Reverse engineering Tencent's ChaosVM (JSVMP) — a bytecode virtual machine used for browser fingerprinting and bot detection. This project decompiles the obfuscated `tdc.js` into readable JavaScript, generates valid TDC tokens, and solves Tencent slide CAPTCHAs.

```
tdc.js (586 lines, obfuscated bytecode VM)
    ↓  decompiler pipeline (12 steps)
decompiled-annotated.js (7,362 lines, readable JavaScript)
    ↓  reverse-engineered token format
standalone token generator (byte-identical to tdc.js output)
    ↓  CAPTCHA automation
slide CAPTCHA solver (Puppeteer + OpenCV)
```

## What This Project Does

1. **Decompiles ChaosVM bytecode** — A 12-step pipeline transforms the 586-line obfuscated `tdc.js` into 7,362 lines of readable, annotated JavaScript. Decodes 70,017 bytecode integers, disassembles 95 unique opcodes, extracts 1,740 string literals, identifies 270 functions, and reconstructs control flow.

2. **Generates valid TDC tokens** — Standalone reimplementation (`token/`): Modified XTEA encryption and 59-field collector schema from scratch. Produces byte-identical tokens to the real VM.

3. **Solves Tencent slide CAPTCHAs** — Puppeteer-based bot that intercepts CAPTCHA images, solves the slide puzzle with OpenCV (Canny edge detection + normalized cross-correlation), performs a realistic mouse drag, and captures the verification ticket.

## Quick Start

```bash
# Install dependencies
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Decompile tdc.js
node decompiler/run.js --input tdc.js --output output/

# Generate a TDC token (standalone — uses reverse-engineered pipeline)
node token/cli.js --profile profiles/default.json

# Solve a slide CAPTCHA
node puppeteer/cli.js --domain example.com
```

## Project Structure

```
reverse-chaosvm/
│
├── tdc.js                      # Primary analysis target (READ-ONLY)
├── tdc-v2.js ... tdc-v4.js     # Alternate VM templates for comparison
│
├── decompiler/                 # ChaosVM decompiler pipeline
│   ├── run.js                  # Unified CLI entry point
│   ├── decoder.js              # Base64 + varint/zigzag decoder
│   ├── disassembler.js         # Bytecode → text disassembly (95 opcodes)
│   ├── string-extractor.js     # String literal extraction (1,740 strings)
│   ├── function-extractor.js   # Function boundary detection (270 functions)
│   ├── cfg-builder.js          # Control flow graph (1,066 basic blocks)
│   ├── pattern-recognizer.js   # if/while/for/try pattern recognition
│   ├── opcode-semantics.js     # Opcode semantic annotations
│   ├── expression-folder.js    # Register ops → expression trees
│   ├── method-reconstructor.js # obj.prop + call → obj.method()
│   ├── code-emitter.js         # Expression trees → JavaScript
│   ├── output-polish.js        # Rename, inline, dead-store elimination
│   └── program-analyzer.js     # Function classification + doc comments
│
├── token/                      # Standalone token generator (byte-identical)
│   ├── cli.js                  # CLI entry point
│   ├── crypto-core.js          # Modified XTEA encryption
│   ├── outer-pipeline.js       # Token assembly (header + hash + cd + sig)
│   ├── collector-schema.js     # 59-field browser fingerprint schema
│   └── generate-token.js       # Integrated generator
│
├── puppeteer/                  # CAPTCHA solver
│   ├── cli.js                  # CLI — batch or single domain
│   ├── captcha-solver.js       # Puppeteer stealth + drag automation
│   ├── captcha-client.js       # HTTP client (prehandle/show/verify)
│   ├── slide-solver.js         # Node.js wrapper for Python solver
│   ├── slide-solver.py         # OpenCV Canny + NCC solver
│   └── fingerprint-harvester.js# Capture real Chrome fingerprints
│
├── dynamic/                    # Puppeteer-based runtime tracers (reference)
│   ├── harness.js              # Instrumented browser runner
│   ├── crypto-tracer*.js       # XTEA key/round tracing
│   ├── encoding-tracer.js      # Base64/URL encoding tracing
│   └── payload-tracer.js       # Token assembly tracing
│
├── output/                     # Decompiler output artifacts
│   ├── decompiled-annotated.js # Final output (7,362 lines)
│   ├── disasm-full.txt         # Full disassembly listing
│   ├── strings.json            # Extracted string literals
│   ├── functions.json          # Function boundary table
│   ├── cfg.json                # Control flow graphs
│   └── ...                     # Other intermediate artifacts
│
├── profiles/                   # Browser fingerprint profiles
│   ├── default.json            # Default profile for token generation
│   └── chrome-fingerprint.json # Harvested real Chrome fingerprint
│
├── tests/                      # Test suite (11 passing, 2 known issues)
├── docs/                       # Technical documentation (13 files)
├── sample/                     # Reference files (HAR capture, bot.py)
└── archive/                    # Historical test reports (51 rounds)
```

## Components

### Decompiler

A 12-step pipeline that transforms ChaosVM bytecode into readable JavaScript:

```bash
# Full pipeline (produces output/decompiled-annotated.js)
node decompiler/run.js --input tdc.js --output output/

# Individual steps
node decompiler/run.js --input tdc.js --step decode     # Extract bytecode
node decompiler/run.js --input tdc.js --step disasm     # Disassemble
node decompiler/run.js --input tdc.js --step strings    # Extract strings
node decompiler/run.js --input tdc.js --step functions   # Find functions
node decompiler/run.js --input tdc.js --step cfg        # Build CFG
node decompiler/run.js --input tdc.js --step decompile  # All steps
```

Each module is independently importable — see [`decompiler/README.md`](decompiler/README.md).

**Limitation**: The opcode table is hardcoded for one VM template. Tencent rotates templates with reshuffled opcodes. See [docs/VERSION_DIFFERENCES.md](docs/VERSION_DIFFERENCES.md).

### Token Generator (Standalone)

Reimplements the entire token pipeline from scratch — Modified XTEA encryption, 59-field collector schema, 4-segment token assembly. Produces byte-identical output to the real VM.

```bash
node token/cli.js --profile profiles/default.json
node token/cli.js --profile profiles/default.json --verbose
```

### CAPTCHA Solver (Puppeteer)

Solves Tencent slide CAPTCHAs using a headless Chrome browser with stealth plugin:

```bash
# Single domain
node puppeteer/cli.js --domain example.com

# Batch from file
node puppeteer/cli.js --domains domains.txt --output results.json

# Visible browser for debugging
node puppeteer/cli.js --domain example.com --headful
```

Requires Python with OpenCV for the slide puzzle solver:
```bash
python3 -m venv .venv
.venv/bin/pip install opencv-python-headless numpy
```

## Documentation

| Document | Description |
|----------|-------------|
| [VM_ARCHITECTURE.md](docs/VM_ARCHITECTURE.md) | ChaosVM internals — bytecode encoding, register machine, opcode dispatch |
| [OPCODE_REFERENCE.md](docs/OPCODE_REFERENCE.md) | All 95 opcodes with operands, stack effects, and semantics |
| [TOKEN_FORMAT.md](docs/TOKEN_FORMAT.md) | Complete token specification — encoding layers, XTEA encryption, segment layout |
| [COLLECTOR_SCHEMA.md](docs/COLLECTOR_SCHEMA.md) | 59-field browser fingerprint schema (cd array) |
| [CRYPTO_ANALYSIS.md](docs/CRYPTO_ANALYSIS.md) | Modified XTEA analysis — key derivation, round constants, block cipher |
| [TOKEN_DECRYPTION.md](docs/TOKEN_DECRYPTION.md) | How to decode and decrypt captured tokens |
| [HAR_ANALYSIS.md](docs/HAR_ANALYSIS.md) | Network flow analysis of the CAPTCHA protocol |
| [VERSION_DIFFERENCES.md](docs/VERSION_DIFFERENCES.md) | Differences between tdc.js template versions |
| [WORKFLOW.md](docs/WORKFLOW.md) | 10-phase development workflow (51 test rounds) |
| [CONVENTIONS.md](docs/CONVENTIONS.md) | Code style and project conventions |
| [TOKEN_PIPELINE.md](docs/TOKEN_PIPELINE.md) | Early token pipeline notes (superseded by TOKEN_FORMAT.md) |
| [PROGRESS.md](docs/PROGRESS.md) | Detailed task-by-task progress log |

## How ChaosVM Works

Tencent's ChaosVM (JSVMP) protects JavaScript by compiling it into custom bytecode executed by an embedded virtual machine:

```
Original JavaScript
    ↓  (Tencent's compiler — server-side, not public)
Bytecode (base64-encoded in tdc.js)
    ↓  base64 decode → varint/zigzag decode
Integer array (70,017 values for the main payload)
    ↓  VM interpreter (register machine with 20+ registers)
Runtime execution (browser fingerprinting, token generation)
```

The VM is a **register machine** with:
- 20+ general-purpose registers (`r0`–`r20`)
- A value stack for expression evaluation
- An exception handler stack (`F[]`)
- A call stack for function frames
- 95 opcodes covering arithmetic, property access, function calls, control flow, type coercion, and string operations

The VM collects 59 browser fingerprint fields (screen resolution, WebGL renderer, audio context, canvas hash, installed fonts, etc.), encrypts them with Modified XTEA, and assembles a ~4,500-character URL-encoded token.

## npm Scripts

```bash
npm run decompile          # Full decompiler pipeline
npm run token:standalone   # Generate token via standalone pipeline
npm run solve:puppeteer    # Solve CAPTCHA via Puppeteer
npm test                   # Run test suite
```

## Tests

```bash
# Run all tests
npm test

# Run individual tests
node --test tests/test-decoder.js
node --test tests/test-disasm.js
node --test tests/test-slide-solver.js
```

11 of 13 tests pass. The 2 failures are known pre-existing issues:
- `test-cfg.js`: 583/584 assertions pass (1 edge case in func 272)
- `test-emit.js`: Code quality threshold assertions (cosmetic, not functional)

## Requirements

- **Node.js** >= 18
- **Python 3** + OpenCV (for slide solver only)

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy
```

## License

Research/educational use. The `tdc.js` files are Tencent's property and included as read-only analysis targets.
