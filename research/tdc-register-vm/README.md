# ChaosVM Decompiler

Decompiles Tencent ChaosVM (JSVMP) bytecode from `tdc.js` into readable JavaScript.

## Quick Start

```bash
# Full decompile pipeline
node decompiler/run.js --input tdc.js --output output/

# Individual steps
node decompiler/run.js --input tdc.js --step decode
node decompiler/run.js --input tdc.js --step disasm
node decompiler/run.js --input tdc.js --step decompile
```

## Pipeline Steps

| Step | Input | Output | Description |
|------|-------|--------|-------------|
| decode | tdc.js | bytecode-main.json | Base64 + varint/zigzag decode |
| disasm | bytecode-main.json | disasm-full.txt | Bytecode to text disassembly |
| strings | disasm-full.txt | strings.json/txt | Extract string literals |
| functions | disasm-full.txt | functions.json/txt | Detect function boundaries |
| cfg | disasm-full.txt + functions.json | cfg.json | Build control flow graphs |
| patterns | cfg.json + disasm | patterns.json | Recognize if/while/try patterns |
| semantics | disasm-full.txt | (console) | Verify opcode semantic coverage |
| fold | cfg.json + disasm | (in-memory) | Fold registers into expressions |
| reconstruct | (fold output) | (in-memory) | Reconstruct method calls |
| emit | (all above) | decompiled.js | Emit JavaScript code |
| polish | decompiled.js | decompiled-polished.js | Rename, inline, dead store elim |
| analyze | decompiled-polished.js | decompiled-annotated.js | Classify and annotate functions |

## Output Files

After a full `decompile` run:

- **`decompiled-annotated.js`** — Final annotated output (the main deliverable)
- **`decompiled-polished.js`** — Polished output without annotations
- **`decompiled.js`** — Raw decompiled output before polish
- **`disasm-full.txt`** — Complete disassembly listing
- **`strings.json`** — All extracted string literals
- **`functions.json`** — Function boundary table (270 functions)
- **`cfg.json`** — Control flow graphs for all functions
- **`patterns.json`** — Recognized structural patterns
- **`program-analysis.json`** — Function classifications
- **`program-summary.txt`** — High-level program description

## Architecture

The decompiler pipeline:

```
tdc.js (586 lines, obfuscated)
  |
  v
[decoder.js] Base64 -> varint/zigzag -> integer array (70,017 ints)
  |
  v
[disassembler.js] Walks bytecode, decodes 95 opcodes -> 15,875 instructions
  |
  v
[string-extractor.js] Finds char-by-char string construction -> 1,740 strings
[function-extractor.js] Detects closure creation opcodes -> 270 functions
  |
  v
[cfg-builder.js] Splits into basic blocks, builds edges -> 1,066 blocks
  |
  v
[pattern-recognizer.js] Identifies if/else, while, for, try/catch
  |
  v
[opcode-semantics.js] Annotates each opcode with reads/writes/effects
  |
  v
[expression-folder.js] Folds register operations into expression trees
  |
  v
[method-reconstructor.js] Merges PROP_GET + CALL into obj.method()
  |
  v
[code-emitter.js] Generates JavaScript from expressions + control flow
  |
  v
[output-polish.js] Closure resolution, register renaming, inlining
  |
  v
[program-analyzer.js] Classifies functions by purpose, adds doc comments
  |
  v
decompiled-annotated.js (7,362 lines, readable)
```

## Modules

Each module exports functions usable independently:

| Module | Key Exports |
|--------|-------------|
| decoder.js | `decode(b64string)`, `base64Decode(str)` |
| disassembler.js | `disassemble(bytecode, startPC)`, `OPCODES` |
| string-extractor.js | `extractStrings(disasmLines)` |
| function-extractor.js | `extractFunctions(disasmLines)` |
| cfg-builder.js | `buildCFG(disasmLines, functions)` |
| pattern-recognizer.js | `recognizeAllPatterns(cfgData, disasmLines)` |
| opcode-semantics.js | `getSemantics(op, operands)`, `parseDisasmToIR(line)` |
| expression-folder.js | `foldAll(cfg, disasmLines)`, `renderExpr(expr)` |
| method-reconstructor.js | `reconstructAll(foldedMap)` |
| code-emitter.js | `emitAll(...)`, `emitProgram(...)` |
| output-polish.js | `polishAll(code, funcTable)` |
| program-analyzer.js | `analyzeFunctions(...)`, `annotateCode(...)` |

## Known Limitations

- **Opcode table is template-specific**: The opcode-to-operation mapping in `disassembler.js` and `opcode-semantics.js` is hardcoded for one specific VM template. Tencent rotates templates with fully reshuffled opcodes. To decompile a different template, you'd need to re-derive the opcode table.
- **Entry point hardcoded**: The entry point PC depends on the template. The decoder auto-detects from the last line, but the disassembler defaults to PC=0 for full coverage.
- **No automatic opcode identification**: There's no automated way to map opcodes between templates. See `docs/VERSION_DIFFERENCES.md` for how templates differ.

## Using on a New tdc.js Version

If the new version uses the **same VM template** (same opcode mapping):
1. Just run `node decompiler/run.js --input new-tdc.js --output output-new/`

If it uses a **different template** (different opcode mapping):
1. The `decode` and `disasm` steps will still work (bytecode format is the same)
2. But disassembly mnemonics will be wrong (opcodes are shuffled)
3. You'd need to re-derive the opcode table by analyzing the `switch` statement in the new template's VM interpreter
4. See `docs/VERSION_DIFFERENCES.md` for guidance
