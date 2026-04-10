# Naming & Output Conventions

## Language

All tooling, scripts, and tests MUST be written in **Node.js (CommonJS)**.

**Exception**: Python + OpenCV is used for the slide CAPTCHA solver (`puppeteer/slide-solver.py`).

## File Organization

```
decompiler/        — ChaosVM decompiler pipeline (reusable)
  run.js           — Unified CLI entry point
  decoder.js       — Base64 + varint/zigzag decoder
  disassembler.js  — Bytecode → text disassembly
  cfg-builder.js   — Control flow graph construction
  code-emitter.js  — AST → JavaScript code generation
  (+ 8 more modules, see decompiler/README.md)

token/             — Standalone token generation pipeline
  crypto-core.js   — Modified XTEA cipher implementation
  outer-pipeline.js — Token assembly (segments, encoding)
  generate-token.js — Integrated token generator
  collector-schema.js — 59-field fingerprint schema
  cli.js           — CLI entry point

puppeteer/         — Puppeteer CAPTCHA solver (production)
  cli.js           — CLI entry point
  captcha-solver.js — Chrome-driven CAPTCHA flow
  captcha-client.js — HTTP client for CAPTCHA endpoints
  slide-solver.js  — Python OpenCV wrapper
  slide-solver.py  — Canny + NCC template matching

dynamic/           — Puppeteer-based dynamic tracers (reference)

output/            — Generated artifacts (decompiler output)
  dynamic/         — Dynamic analysis captures

profiles/          — Browser fingerprint profiles
sample/            — Reference files (HAR, bot.py, etc.)
archive/           — Historical reports
tests/             — Reusable test suite
docs/              — Documentation
```

## Naming Conventions

### VM Internals Mapping

| Original (tdc.js) | Canonical Name | Description |
|--------------------|---------------|-------------|
| `Y[]` | `bytecode` | Decoded integer array |
| `C` | `pc` | Program counter |
| `i[]` | `regs` | Register file |
| `Q` | `thisCtx` | Current `this` for method calls |
| `F[]` | `catchStack` | Exception handler address stack |
| `G` | `caughtException` | Last caught exception |
| `S` | `outerScope` | Outer scope reference |
| `m` | `moduleRef` | Module/global reference |
| `E` | `closureVars` | Captured closure variables |
| `I` | `errorHandler` | Top-level error handler |
| `h` | `tempArray` | Temporary array (varargs, closures) |
| `w` | `tempCounter` | Loop counter for multi-operand ops |

### Disassembly Format

```
[PC]  MNEMONIC  r<dst>, r<src1>, r<src2>    ; comment
```

Example:
```
[0042]  ADD         r8, r9, r10                 ; r8 = r9 + r10
[0046]  PROP_GET    r11, r3, r12                ; r11 = this[r12]
[0050]  CALL_1      r13, r11, r3, r14           ; r13 = r11.call(this, r14)
```

- `r0`–`r7` are the pre-initialized registers (scope, module, closures, this, args, self, bytecode, zero)
- `r8+` are dynamically allocated
- `K(n)` denotes an immediate constant value (not a register)

### Opcode Mnemonics

See `OPCODE_REFERENCE.md` for the complete mapping (95 opcodes, 0–94).

### Decompiled Output Variables

- Use `camelCase` for all variables
- Prefer descriptive names derived from context (e.g., `cookieStr`, `userAgent`)
- When context is unclear, use `v0`, `v1`, etc. (prefixed with `v`)
- Function parameters: `arg0`, `arg1`, ... or meaningful names when purpose is clear

## Code Style (Tooling)

- 2-space indentation
- Single quotes for strings
- Semicolons required
- `const` / `let` preferred over `var`
- `'use strict';` at top of every source file
- No external dependencies unless absolutely necessary (prefer Node.js built-ins)
