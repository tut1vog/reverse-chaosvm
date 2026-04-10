# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Does

Reverse engineering Tencent's ChaosVM (JSVMP) — a JavaScript bytecode virtual machine used for browser fingerprinting. Three main deliverables:

1. **Decompiler** (`decompiler/`): 12-step pipeline transforming obfuscated `tdc.js` → readable JS
2. **Token generator** (`token/`): Standalone XTEA reimplementation producing byte-identical tokens
3. **CAPTCHA solver** (`puppeteer/`): Puppeteer + OpenCV slide solver

All `targets/*.js` files are **read-only** analysis targets (Tencent's property). Never modify them.

## Commands

```bash
# Install dependencies
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Run full test suite (11/13 pass; 2 known failures in test-cfg.js and test-emit.js)
npm test

# Run a single test file
node --test tests/test-decoder.js

# Full decompiler pipeline — always pass --input and --output explicitly
node decompiler/run.js --input targets/tdc.js --output output/tdc
# or via npm (runs against reference build):
npm run decompile

# Individual pipeline steps:
node decompiler/run.js --input targets/tdc.js --output output/tdc --step decode
node decompiler/run.js --input targets/tdc.js --output output/tdc --step disasm
node decompiler/run.js --input targets/tdc.js --output output/tdc --step cfg
# ... (decode → disasm → strings → functions → cfg → patterns → semantics → fold → reconstruct → emit → polish → analyze)

# Token generation — standalone (byte-identical reimplementation)
node token/cli.js --profile profiles/default.json
node token/cli.js --profile profiles/default.json --verbose

# CAPTCHA solver (requires Python + OpenCV)
node puppeteer/cli.js --domain example.com
node puppeteer/cli.js --domain example.com --headful   # visible browser for debug

# Port a new tdc version (slash command)
/port-new-version targets/tdc-v4.js

# Dynamic token tracing
/trace-token targets/tdc.js eks
```

## Project Structure

```
targets/              Read-only tdc builds (analysis targets)
  tdc.js              Reference build — fully analyzed
  tdc-v2.js           Different template (94 opcodes, tdc-v4/v5 not yet ported)
  tdc-v3.js           Same template as tdc.js (identical bytecode)
  tdc-v4.js           Not yet ported
  tdc-v5.js           Not yet ported

decompiler/           12-step decompile pipeline
token/                Standalone collect token generator (byte-identical)
puppeteer/            Puppeteer CAPTCHA solver
dynamic/              Runtime tracers (crypto, payload, encoding, chunk, comparison)
output/tdc/           Decompiler artifacts for reference build
output/<version>/     Per-version artifacts (create before running pipeline)
profiles/             Browser fingerprint profiles
tests/                Test suite
docs/                 Technical reference documentation
sample/               Reference files (HAR capture, bot.py)
```

## Architecture

### Decompiler Pipeline (`decompiler/`)

Sequential 12-step pipeline — each step reads artifacts written by prior steps.
`run.js` orchestrates all steps; individual modules are independently importable.
**The opcode table in `disassembler.js` is hardcoded for `tdc.js`.** A new table
must be derived for each distinct VM template before the pipeline can run on it.

```
decoder.js            base64 → varint/zigzag → integer array (invariant across all builds)
disassembler.js       integer array → text disassembly (opcode table is build-specific)
string-extractor.js   disassembly → string literals
function-extractor.js → function boundary table
cfg-builder.js        → control flow graph
pattern-recognizer.js → if/while/for/try patterns
opcode-semantics.js   → semantic annotations
expression-folder.js  → register ops → expression trees
method-reconstructor.js → obj.prop + call → obj.method()
code-emitter.js       → JavaScript AST → source code
output-polish.js      → rename/inline/dead-store elimination
program-analyzer.js   → function classification + doc comments
```

### Token Pipeline (`token/`)

`generate-token.js` wires together `collector-schema.js` (59-field fingerprint schema) →
`outer-pipeline.js` (segment assembly, btoa, URL encoding) → `crypto-core.js`
(Modified XTEA encryption). Produces byte-identical output to the real VM for `tdc.js`.

Two tokens are sent in the verify POST:
- **`collect`** — `TDC.getData()` — fully reimplemented standalone (`token/`)
- **`eks`** — `TDC.getInfo().info` — server-baked into tdc.js, extracted verbatim (see `docs/EKS_FORMAT.md`)

### CAPTCHA Solver (`puppeteer/`)

`captcha-client.js` implements the 4-endpoint HTTP flow (prehandle → getsig → image download → verify POST). `slide-solver.js` calls Python's `slide-solver.py` (Canny edge detection + normalized cross-correlation via OpenCV) for pixel offset. `captcha-solver.js` drives headless Chrome with stealth plugin.

### Key VM Internals Mapping (reference build: `targets/tdc.js`)

| tdc.js symbol | Canonical name | Role |
|---|---|---|
| `Y[]` | `bytecode` | Decoded integer array |
| `C` | `pc` | Program counter |
| `i[]` | `regs` | Register file (r0–r20+) |
| `Q` | `thisCtx` | Current `this` for method calls |
| `F[]` | `catchStack` | Exception handler address stack |
| `E` | `closureVars` | Captured closure variables |

Variable names differ per build — identify by structural role, not by name.

## Multi-Version Pipeline

Tencent serves from a pool of VM templates with fully reshuffled opcodes per template.
`decoder.js` works on all builds unchanged. Everything else requires a new opcode table.

To port a new build: `/port-new-version targets/tdc-vN.js`
To investigate a token: `/trace-token targets/tdc-vN.js <type>`
For manual opcode porting: `/port-opcodes` skill

See `docs/VERSION_DIFFERENCES.md` for the full porting strategy and what changes vs what stays the same.

## Code Conventions

- **Language**: Node.js CommonJS (`'use strict';`, `require()`/`module.exports`) for all JS. Python only for `slide-solver.py`.
- **Style**: 2-space indentation, single quotes, semicolons required, `const`/`let` over `var`.
- **Dependencies**: Minimize external deps — prefer Node.js built-ins.
- **Disassembly format**: `[PC]  MNEMONIC  r<dst>, r<src1>, r<src2>    ; comment`
- **Decompiled variable names**: camelCase; `v0`, `v1`... when context unclear; `arg0`, `arg1`... for parameters.
- **Output directories**: always versioned — `output/<target-stem>/` (see `.claude/rules/output-versioning.md`)

## Known Issues / Limitations

- The decompiler's opcode table is hardcoded for the `tdc.js` template. See `docs/VERSION_DIFFERENCES.md`.
- `eks` token is server-baked (not generated by the VM). See `docs/EKS_FORMAT.md`.
- `test-cfg.js`: 583/584 assertions pass (1 edge case in func 272).
- `test-emit.js`: Code quality threshold assertions fail (cosmetic, not functional).

## Documentation

| Doc | Owns |
|-----|------|
| `docs/VM_ARCHITECTURE.md` | Register machine internals, opcode dispatch |
| `docs/OPCODE_REFERENCE.md` | All 95 opcodes with operands and stack effects |
| `docs/TOKEN_FORMAT.md` | collect token spec — encoding layers, XTEA, segment layout (**authoritative**) |
| `docs/EKS_FORMAT.md` | eks token — known facts and investigation findings |
| `docs/COLLECTOR_SCHEMA.md` | 59-field browser fingerprint schema |
| `docs/CRYPTO_ANALYSIS.md` | Modified XTEA key derivation and round constants |
| `docs/TOKEN_DECRYPTION.md` | How to decrypt a captured token |
| `docs/HAR_ANALYSIS.md` | Network flow analysis of the CAPTCHA protocol |
| `docs/VERSION_DIFFERENCES.md` | Opcode shuffle analysis and porting strategy |
| `docs/CONVENTIONS.md` | Code style, naming, disassembly format |
| `docs/WORKFLOW.md` | Development phase log |
| `docs/PROGRESS.md` | Task-by-task progress (51 rounds) |

## Project Memory

### Current State (2026-04-07)

**Solved**:
- `collect` token: byte-identical standalone reimplementation in `token/`
- Decompiler pipeline: fully working for `targets/tdc.js` (reference build)
- CAPTCHA solver: Puppeteer-based, functional via `puppeteer/`
- `eks` token: server-baked into every `tdc.js` response — no crypto to reverse, extract via
  regex on fetched source or `TDC.getInfo().info`. See `docs/EKS_FORMAT.md`.

**Active investigation**:
- Multi-version pipeline: `tdc-v2` through `tdc-v5` opcode tables not yet mapped

**Version status**:
| Target | Template | Decoded | Opcode table | Pipeline | Token verified |
|--------|----------|---------|--------------|----------|----------------|
| tdc.js | A | ✅ | ✅ (95 opcodes) | ✅ | ✅ byte-identical |
| tdc-v2.js | B | ✅ decoder works | ❌ not mapped | ❌ | ❌ |
| tdc-v3.js | A (same as tdc.js) | ✅ | ✅ reuse tdc.js table | untested | untested |
| tdc-v4.js | unknown | ✅ decoder works | ❌ | ❌ | ❌ |
| tdc-v5.js | unknown | ✅ decoder works | ❌ | ❌ | ❌ |

**Open questions**:
- Does the XTEA key (STATE_A) change between templates? Only verified for tdc.js.
- What is inside the eks payload? Same cd/sd structure as collect, or different?
- How many distinct templates does Tencent serve from their pool?
