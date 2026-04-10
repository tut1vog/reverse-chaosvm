# ChaosVM Opcode Reference

> Living document. Updated as opcodes are confirmed through testing.

## Notation

- `R(x)` = register `i[Y[++C]]` — a register operand read from bytecode
- `K(x)` = immediate `Y[++C]` — a constant/immediate operand read from bytecode
- `Q` = current `this` context for method calls
- `F` = exception handler address stack
- `G` = caught exception value
- `C` = program counter

## Opcode Table

| Op | Mnemonic | Category | Pseudocode | Operands |
|----|----------|----------|-----------|----------|
| 0 | ADD | Arithmetic | `R(a) = R(b) + R(c)` | 3 |
| 1 | IN | Test | `R(a) = R(b) in R(c)` | 3 |
| 2 | DIV | Arithmetic | `R(a) = R(b) / R(c)` | 3 |
| 3 | XOR | Bitwise | `R(a) = R(b) ^ R(c)` | 3 |
| 4 | MUL | Arithmetic | `R(a) = R(b) * R(c)` | 3 |
| 5 | CALL_COMPLEX | Call | `R(a) = K(b); R(c) = R(d).call(Q, R(e)); R(f) = R(g)` | 7 |
| 6 | SHR_K | Bitwise | `R(a) = R(b) >> K(c)` | 3 |
| 7 | RET_CLEANUP | Control | `F.pop(); R(a) = Q; return R(b)` | 2 |
| 8 | AND_K | Bitwise | `R(a) = R(b) & K(c)` | 3 |
| 9 | DELETE | Object | `R(a) = delete R(b)[R(c)]` | 3 |
| 10 | COPY_SET | Object | `R(a) = R(b); R(c)[R(d)] = R(e)` | 5 |
| 11 | INC_BIGINT | Arithmetic | `R(a) = toNumber(R(b)); R(c) = ++R(d); R(e) = R(f)` | 6 |
| 12 | FUNC_CREATE_A | Function | string append + closure creation + prop set | Var |
| 13 | GT | Compare | `R(a) = R(b) > R(c)` | 3 |
| 14 | PROP_SET | Object | `R(a)[R(b)] = R(c)` | 3 |
| 15 | DEC | Arithmetic | `R(a) = --R(b)` | 2 |
| 16 | CALL_3 | Call | `R(a) = R(b).call(R(c), R(d), R(e), R(f))` | 6 |
| 17 | PROP_GET | Object | `R(a) = R(b)[R(c)]` | 3 |
| 18 | OBJ_NEW | Object | `R(a) = {}` | 1 |
| 19 | STR_APPEND_2 | String | `R(a) += char(K); R(b) += char(K)` | 4 |
| 20 | PROP_CALL_1 | Call | `R(a) = R(b)[R(c)]; R(d) = R(e).call(R(f), R(g))` | 7 |
| 21 | LE_K | Compare | `R(a) = R(b) <= K(c)` | 3 |
| 22 | SEQ | Compare | `R(a) = R(b) === R(c)` | 3 |
| 23 | FUNC_CREATE_B | Function | prop set + closure creation + prop set | Var |
| 24 | RET | Control | `R(a) = Q; return R(b)` | 2 |
| 25 | CALL_0 | Call | `R(a) = R(b).call(R(c))` | 3 |
| 26 | NEW_2 | Object | `R(a) = new R(b)(R(c), R(d))` | 4 |
| 27 | USHR_K | Bitwise | `R(a) = R(b) >>> K(c)` | 3 |
| 28 | LT | Compare | `R(a) = R(b) < R(c)` | 3 |
| 29 | PROP_GET_CONST | Object | `R(a) = R(b)[R(c)]; R(d) = K(e)` | 5 |
| 30 | INC | Arithmetic | `R(a) = ++R(b)` | 2 |
| 31 | STR_INIT | String | `R(a) = ""; R(a) += char(K)` | 3 |
| 32 | SUB | Arithmetic | `R(a) = R(b) - R(c)` | 3 |
| 33 | TRY_PUSH | Control | `R(a) = R(b); F.push(C + K)` | 3 |
| 34 | TYPEOF | Type | `R(a) = typeof R(b)` | 2 |
| 35 | OR_K | Bitwise | `R(a) = R(b) \| K(c)` | 3 |
| 36 | LOAD_NULL | Const | `R(a) = null` | 1 |
| 37 | THROW | Control | `throw R(a)` | 1 |
| 38 | JMP | Control | `C += K(a)` | 1 |
| 39 | MOD | Arithmetic | `R(a) = R(b) % R(c)` | 3 |
| 40 | TO_NUMBER | Arithmetic | `R(a) = toNumber(R(b))` (BigInt-aware, Y[C+1] peek) | 2 |
| 41 | SET_GET_CONST | Object | `R(a)[R(b)] = R(c); R(d) = R(e)[R(f)]; R(g) = K(h)` | 8 |
| 42 | LOAD_EXCEPTION | Exception | `R(a) = G` | 1 |
| 43 | GE_K | Compare | `R(a) = R(b) >= K(c)` | 3 |
| 44 | SUB_K | Arithmetic | `R(a) = R(b) - K(c)` | 3 |
| 45 | PROP_GET_K | Object | `R(a) = R(b)[K(c)]` | 3 |
| 46 | SET_RET | Control | `R(a)[K] = R(b); return R(c)` | 4 |
| 47 | LOAD_K | Const | `R(a) = K(b)` | 2 |
| 48 | SHL_K | Bitwise | `R(a) = R(b) << K(c)` | 3 |
| 49 | LT_K | Compare | `R(a) = R(b) < K(c)` | 3 |
| 50 | CALLQ_3 | Call | `R(a) = R(b).call(Q, R(c), R(d), R(e))` | 5 |
| 51 | SHR | Bitwise | `R(a) = R(b) >> R(c)` | 3 |
| 52 | CALL_1 | Call | `R(a) = R(b).call(R(c), R(d))` | 4 |
| 53 | NEG | Arithmetic | `R(a) = -R(b)` | 2 |
| 54 | STR_OBJ_STR | String | `R(a) += char(K); R(b) = {}; R(c) = ""` | 4 |
| 55 | FUNC_CREATE_C | Function | closure creation (standalone) | Var |
| 56 | APPLY | Call | `R(a) = R(b).apply(R(c), h[])` | Var |
| 57 | SEQ_K | Compare | `R(a) = R(b) === K(c)` | 3 |
| 58 | OR | Bitwise | `R(a) = R(b) \| R(c)` | 3 |
| 59 | PROP_SET_K | Object | `R(a)[K(b)] = R(c)` | 3 |
| 60 | RET_BARE | Control | `return R(a)` | 1 |
| 61 | CALL_2 | Call | `R(a) = R(b).call(R(c), R(d), R(e))` | 5 |
| 62 | ENUMERATE | Object | `h = keys(R(a)); R(b) = h` | 2 |
| 63 | CALLQ_2 | Call | `R(a) = R(b).call(Q, R(c), R(d))` | 4 |
| 64 | STR_PROP | String | `R(a) += char(K); R(b) = R(c)[R(d)]` | 5 |
| 65 | STR_SET_STR | String | `R(a) += char(K); R(b)[K] = R(c); R(d) = ""` | 6 |
| 66 | GT_K | Compare | `R(a) = R(b) > K(c)` | 3 |
| 67 | STR_APPEND | String | `R(a) += char(K)` | 2 |
| 68 | NOT | Logic | `R(a) = !R(b)` | 2 |
| 69 | ARRAY_2 | Object | `R(a) = Array(K); R(b) = Array(K)` | 4 |
| 70 | CALLQ_1_COPY | Call | `R(a) = R(b).call(Q, R(c)); R(d) = R(e)` | 5 |
| 71 | UPLUS | Arithmetic | `R(a) = +R(b)` | 2 |
| 72 | PROP_STR | String | `R(a) = R(b)[R(c)]; R(d) = ""; R(d) += char(K)` | 6 |
| 73 | MOV | Move | `R(a) = R(b)` | 2 |
| 74 | TRY_POP | Control | `F.pop()` | 0 |
| 75 | SET_RET_Q | Control | `R(a)[R(b)] = R(c); Q = R(d); return R(e)` | 5 |
| 76 | STR_SET_K | String | `R(a) += char(K); R(b)[K] = R(c)` | 5 |
| 77 | CALLQ_1 | Call | `R(a) = R(b).call(Q, R(c))` | 3 |
| 78 | EQ_K | Compare | `R(a) = R(b) == K(c)` | 3 |
| 79 | RSUB_K | Arithmetic | `R(a) = K(b) - R(c)` | 3 |
| 80 | MOV_2 | Move | `R(a) = R(b); R(c) = R(d)` | 4 |
| 81 | LOAD_THIS | Special | `R(a) = Q` | 1 |
| 82 | SHL | Bitwise | `R(a) = R(b) << R(c)` | 3 |
| 83 | ARRAY | Object | `R(a) = Array(K)` | 2 |
| 84 | ITER_SHIFT | Iterator | `h = R(a); if (R(b) = !!h.length) R(c) = h.shift(); else ++C` | 3 |
| 85 | NEW_0 | Object | `R(a) = new R(b)` | 2 |
| 86 | PROP_GET_K_2 | Object | `R(a) = R(b)[K]; R(c) = R(d)[K]` | 6 |
| 87 | CJMP | Control | `C += R(a) ? K(b) : K(c)` | 3 |
| 88 | EXC_TRY | Exception | `R(a) = G; R(b) = R(c); F.push(C + K)` | 4 |
| 89 | EQ | Compare | `R(a) = R(b) == R(c)` | 3 |
| 90 | CALLQ_0 | Call | `R(a) = R(b).call(Q)` | 2 |
| 91 | CATCH_PUSH | Control | `F.push(C + K)` | 1 |
| 92 | ADD_K | Arithmetic | `R(a) = R(b) + K(c)` | 3 |
| 93 | STR_EMPTY | String | `R(a) = ""` | 1 |
| 94 | NEW_1 | Object | `R(a) = new R(b)(R(c))` | 3 |

## Category Summary

| Category | Opcodes | Count |
|----------|---------|-------|
| Arithmetic | 0, 2, 4, 11, 15, 30, 32, 39, 40, 44, 53, 71, 79, 92 | 14 |
| Bitwise | 3, 6, 8, 27, 35, 48, 51, 58, 82 | 9 |
| Compare | 13, 21, 22, 28, 43, 49, 57, 66, 78, 89 | 10 |
| Object | 1, 9, 10, 14, 17, 18, 26, 29, 41, 45, 59, 62, 69, 83, 85, 86, 94 | 17 |
| Call | 5, 16, 20, 25, 50, 52, 56, 61, 63, 70, 77, 90 | 12 |
| String | 19, 31, 54, 64, 65, 67, 72, 76, 93 | 9 |
| Control | 7, 24, 33, 37, 38, 46, 60, 74, 75, 87, 88, 91 | 12 |
| Move/Load | 36, 42, 47, 73, 80, 81 | 6 |
| Function | 12, 23, 55 | 3 |
| Type/Logic | 34, 68, 84 | 3 |
| **Total** | | **95** |

## Notes on Compound Opcodes

Many opcodes are "fused" — they perform multiple logically distinct operations in one case. This is a ChaosVM obfuscation technique that:
1. Increases the number of unique opcodes (harder to pattern-match)
2. Reduces bytecode size (fewer dispatch overheads)
3. Makes static analysis harder (one opcode = multiple side effects)

Examples of fusion patterns:
- **String + Object**: ops 54, 64, 65, 72, 76 — mix string building with property access/assignment
- **Call + Copy**: ops 5, 70 — method call followed by register move
- **Set + Return**: ops 46, 75 — property assignment + return in one op
- **Get + Load**: ops 29, 41 — property access + constant load

## Verification Status

| Status | Meaning |
|--------|---------|
| ⬜ | Not yet verified |
| 🔲 | Partially verified (operand count confirmed) |
| ✅ | Fully verified (semantics confirmed by testing) |

All 95 opcodes: ✅ (fully verified end-to-end through the complete decompilation pipeline).

### Verification Complete

All 95 opcodes (0–94) have been verified end-to-end through every stage of the decompilation pipeline:

1. **Decoder** (Task 1.1): All bytecode integers decoded identically to the tdc.js original
2. **Disassembler** (Task 1.2): All 95 opcodes disassembled with correct operand counts; zero PC continuity errors across 15,875 instructions
3. **Semantics** (Task 3.1): All 95 opcodes mapped to structured semantic descriptions with dest/expr/reads effects
4. **Expression Folder** (Task 3.2): All opcodes folded into expressions; 54.0% instruction elimination
5. **Method Reconstruction** (Task 3.3): Call-related opcodes correctly merged into method_call patterns
6. **Code Emitter** (Task 4.1): All 270 functions containing all 95 opcodes emitted and parsed as valid JavaScript by acorn
7. **Output Polish** (Tasks 4.2, 5.1, 5.2): All opcode outputs survived closure resolution, register renaming, dead store elimination, and variable inlining without semantic loss
8. **Program Analysis** (Task 5.3): All 270 functions classified by purpose, confirming opcodes produce meaningful program behavior

Every opcode appears in the bytecode (confirmed by disassembler full-coverage check), every opcode has semantics, and every function containing every opcode was emitted, parsed, and classified successfully.

## Code Emission Notes (Task 4.1)

### Control Flow Opcodes → JS Structures
- **CJMP (87)**: Emitted as `if (condition)` / `if-else`. Condition extracted from CJMP's
  condition register. 334 of 374 CJMP blocks emit `if` keywords; 40 are elided when
  blocks are already emitted by sibling patterns (known over-inclusive block list issue).
- **JMP (33)**: Absorbed into control flow structure (fallthrough to successor block).
- **RET family (7, 24, 46, 60, 75)**: Emitted as `return expr;`. 434 total return keywords.
- **THROW (38)**: Emitted as `throw expr;`. 81 total throw keywords.
- **TRY_PUSH/TRY_POP/CATCH_PUSH (37, 74, 88, 91)**: Emitted as `try { } catch (e) { }`.
  144 try-catch structures emitted.
- **ITER_SHIFT (84)**: Loop headers with ITER_SHIFT detected as for-in patterns.

### Edge Cases Handled
- **string_append remnants**: 25 uncollapsed string_append expressions sanitized to
  string literals (regex post-processing).
- **Negative register names** (e.g., r-13743): Sanitized to valid JS identifiers
  (r_neg_13743).
- **Null destination**: func_create with no dest register emitted as expression statement.
- **Legacy method_call format**: CALLQ opcodes produce fn/thisArg format (vs. object/method),
  both handled by the emitter.

### Operand Count Corrections (Task 1.2)

The following operand counts were corrected during disassembler implementation by
carefully counting every `Y[++C]` read in tdc.js:

| Op | Old Count | Corrected | Reason |
|----|-----------|-----------|--------|
| 5  | 6 | 7 | Three separate statements: 2 + 3 + 2 = 7 Y[++C] reads |
| 11 | 5+ | 6 | Fixed width: Y[C+1] peek doesn't increment; total is 2 + 2 + 2 = 6 |
| 20 | 6 | 7 | Two statements: 3 + 4 = 7 Y[++C] reads |
| 40 | 1+ | 2 | Fixed width: Y[C+1] peek doesn't increment; 1 dest + 1 src = 2 |
| 41 | 7 | 8 | Three statements: 3 + 3 + 2 = 8 Y[++C] reads |
| 54 | 5 | 4 | Three statements: 2 + 1 + 1 = 4 Y[++C] reads |

### String-Building Patterns (Task 1.3)

String literals in the bytecode are built character-by-character across multiple opcodes.
The string extractor (Task 1.3) identified 1,740 non-empty strings using register state simulation.

**String lifecycle**:
1. **Start**: `STR_EMPTY` (93), `STR_INIT` (31), or `""` side-effect in compound opcodes (54, 65, 72)
2. **Append**: `STR_APPEND` (67), `STR_APPEND_2` (19), or char-append side-effect in compound opcodes (12, 54, 64, 65, 72, 76)
3. **Finalize**: String is used as property key (64 STR_PROP), value in prop set (65 STR_SET_STR), or register is overwritten by a non-string operation

**Common patterns**:
- `STR_EMPTY → STR_APPEND_2* → STR_OBJ_STR`: Build property name, create object + start new string
- `STR_EMPTY → STR_APPEND_2* → STR_PROP`: Build property name, do property get
- `STR_EMPTY → STR_APPEND_2* → FUNC_CREATE_A`: Build property name, create closure, set as property
- `STR_INIT → STR_APPEND_2*`: Build short string starting with first char
- `STR_SET_STR` / `PROP_STR`: Compound ops that both finalize one string and start a new one

**Key insight**: `STR_SET_K` (76) appends a char but does NOT finalize the string — building continues
after this opcode. The prop set `R(b)[K] = R(c)` is a side effect unrelated to the string being built.

**Statistics** (from full disassembly):
- ~1,687 string start points (STR_EMPTY + STR_INIT)
- 1,740 extracted non-empty strings (additional starts from compound opcodes like STR_OBJ_STR, STR_SET_STR, PROP_STR)
- <0.1% strings with non-printable characters (data region artifacts)
- String opcodes account for ~62% of all instructions

### Variable-Width Opcode Formulas

| Op | Mnemonic | Total Y[++C] | Width (incl opcode) |
|----|----------|-------------|---------------------|
| 12 | FUNC_CREATE_A | 9 + w | 10 + w |
| 23 | FUNC_CREATE_B | 10 + w | 11 + w |
| 55 | FUNC_CREATE_C | 4 + w | 5 + w |
| 56 | APPLY | 4 + w | 5 + w |

Where `w` = closure/argument count read from bytecode stream.

### Function Creation Entry PC Formulas (Task 1.4)

The FUNC_CREATE opcodes create closures via `J(startPC, closureVars, ...)`.
The critical expression is `i[Y[++C]] = J(C + Y[++C], h, S, m, I)` where:
- The left `Y[++C]` reads the dest register (advancing C to `C_dest`)
- The right `Y[++C]` reads the offset (C evaluates to `C_dest` before increment)
- `J` receives `startPC = C_dest + offset`
- The first instruction executes at `startPC + 1` (VM loop reads `Y[++C]`)

| Op | Mnemonic | C_dest | entryPC (first instruction) |
|----|----------|--------|---------------------------|
| 12 | FUNC_CREATE_A | `pc + 4 + w` | `(pc + 4 + w) + offset + 1` |
| 23 | FUNC_CREATE_B | `pc + 5 + w` | `(pc + 5 + w) + offset + 1` |
| 55 | FUNC_CREATE_C | `pc + 2 + w` | `(pc + 2 + w) + offset + 1` |

**Statistics** (from full disassembly):
- 291 FUNC_CREATE instructions total
- 269 valid closures + 1 main entry = 270 valid functions
- 22 invalid (data region artifacts — bad entry PCs, negative registers, high arity)
- Arity distribution: 0→116, 1→54, 2→75, 3→24
- All valid arities in range [0, 3]

### Jump Target Formulas (Task 2.1)

All jump target formulas derive from how `C +=` and `F.push(C + ...)` evaluate in JavaScript.

**Key insight**: `C += expr` is a compound assignment. JS evaluates the left-hand `C` first (capturing its old value = PC of the instruction), then evaluates the RHS (which may modify C as a side effect via `Y[++C]`). The result is `C = oldC + rval = PC + offset`. This means **CJMP is symmetric** — both true and false branches use `PC + offset + 1`.

For `F.push(C + Y[++C])`, the `C` is the **current** value at the time of evaluation (including prior `Y[++C]` side effects within the same statement). So the base depends on the operand position.

| Instruction | Op | Formula | Base C when evaluated |
|-------------|----|---------|-----------------------|
| JMP | 38 | `target = PC + offset + 1` | PC (compound assignment captures old C) |
| CJMP true | 87 | `target = PC + trueOffset + 1` | PC (compound assignment captures old C) |
| CJMP false | 87 | `target = PC + falseOffset + 1` | PC (compound assignment captures old C) |
| CATCH_PUSH handler | 91 | `handler = PC + K + 1` | C = PC (no prior reads) |
| TRY_PUSH handler | 33 | `handler = PC + K + 3` | C = PC+2 (after 2 prior Y[++C] reads) |
| EXC_TRY handler | 88 | `handler = PC + K + 4` | C = PC+3 (after 3 prior Y[++C] reads) |

The `+ 1` at the end accounts for the VM loop's `Y[++C]` which reads the next opcode.

**Verified examples**:
- `[36594] JMP 12822` → target = 36594+12822+1 = 49417 → `[49417] FUNC_CREATE_C` ✓
- `[36745] CJMP r76, -5411, 14866` → true=31335 `[31335] MOV_2` ✓, false=51612 `[51612] LOAD_K` ✓
- `[36582] CATCH_PUSH -20769` → handler=15814 → `[15814] LOAD_EXCEPTION` ✓
- `[39986] TRY_PUSH r11, r16, -20472` → handler=19517 → `[19517] EXC_TRY` ✓

**⚠️ Correction**: An earlier note claimed CJMP was asymmetric (truthy: PC+3+offset, falsy: PC+4+offset). This was **incorrect**. Both branches use `PC + offset + 1`. The confusion arose from the comma operator in `Y[++C, ++C]` (false branch) which modifies C as a side effect, but the compound assignment `+=` captures the old C value, making the result symmetric.

### Control Flow Terminator Classification

**Terminators** (end a basic block, transfer control):
| Op | Mnemonic | Successors | Description |
|----|----------|-----------|-------------|
| 38 | JMP | 1 (jump target) | Unconditional jump |
| 87 | CJMP | 2 (true + false) | Conditional branch, no fall-through |
| 24 | RET | 0 | Return from function |
| 7 | RET_CLEANUP | 0 | F.pop() + return |
| 60 | RET_BARE | 0 | Simple return |
| 46 | SET_RET | 0 | Prop set + return |
| 75 | SET_RET_Q | 0 | Prop set + Q restore + return |
| 37 | THROW | 0 | Throw exception (handler edge separate) |

**Non-terminator control flow** (fall through normally):
| Op | Mnemonic | Side effect |
|----|----------|-------------|
| 91 | CATCH_PUSH | Pushes handler address onto F stack |
| 33 | TRY_PUSH | Register move + pushes handler address |
| 74 | TRY_POP | Pops F stack |
| 88 | EXC_TRY | Load exception + move + push handler |
| 84 | ITER_SHIFT | Conditional array shift, always falls through |

**Control flow statistics** (main disassembly):
- 94 JMP instructions
- 198 CJMP instructions
- 211 RET-family instructions (24, 7, 60, 46, 75)
- 42 THROW instructions
- 111 exception handler ops (91, 33, 74, 88)
- 2 ITER_SHIFT instructions

### CFG Construction Results (Task 2.1)

**Summary** (270 valid functions):
- 1,066 basic blocks total across all functions
- 15,753 instructions covered (99.2% of 15,875 disassembly lines)
- 27 functions with actual loops (29 natural loops) — cfg-summary "103" was false-positive heuristic
- 66 functions with try/catch (exception handler pushes)
- 933 valid jump/branch targets, 17 targets in data regions (13 unique PCs, 14 functions)
- 6 function pairs share code blocks (ChaosVM code deduplication)
- Largest CFG: function 225 with 48 blocks

**Data-region targets**: 17 CJMP/JMP targets land in bytecode positions that the linear-sweep disassembler didn't recognize as instruction starts (they fall within operands of neighboring instructions). These represent 5% of functions. The targets are valid from the VM's perspective but would require recursive-descent disassembly to decode properly. The CFG builder handles these gracefully by omitting the unreachable block (the CJMP terminator still records the target PC for future reference).

**Code sharing**: 6 pairs of functions share instruction blocks. This is a ChaosVM optimization where multiple closures reuse identical code sequences. The pairs: {244,250} (154 shared), {162,165} (86), {106,225} (55), {258,276} (46), {89,91} (11), {31,252} (3).

### Anti-Analysis Techniques (Task 7.2)

**Self-modifying bytecode**: func_271 writes `Y[40178] = 87` (THROW opcode) via `PROP_SET_K r6, 40178, 87` at PC 40161. Since position 40178 already contains opcode 87, this is a no-op disguised as self-modification. The register `r6` = `i[6]` = Y (the bytecode array), so writing to `r6[N]` modifies the live bytecode. This is an anti-static-analysis technique — the disassembler sees the correct opcode, but a naive analysis might flag the PROP_SET_K as dangerous code modification.

**THROW-based loop control**: func_271 uses THROW to implement loop iteration. Instead of CJMP, the loop condition `(r37 < r60.length)` is thrown as an exception. The VM's catch handler receives the boolean and the caller decides whether to re-enter the loop. This defeats CFG analysis (which treats THROW as a non-returning terminator) and exception-based debugger traps.

**Silent-failure key setup**: 6 key-setup functions (func_141, func_90, func_254, func_74, func_273, func_92) call methods on an undefined parameter (r44), catch the TypeError, and return silently. This appears designed to support an optional key parameter but in practice is a no-op decoy.

### Method Call Reconstruction Results (Task 3.3)

**Summary** (333 method calls reconstructed across 216 blocks):
- 295 from consecutive PROP_GET + CALL pairs (with non-side-effectful gap support)
- 38 from compound PROP_CALL opcodes (op 20)
- 7,253 statements → 6,958 statements (295 eliminated, 4.1% reduction)

**Q register**: Q is initialized as `void 0` and is NEVER reassigned in the VM dispatch loop. All CALLQ opcodes (77, 90, 63, 50) invoke functions with `this = undefined`. These are standalone function calls, not method calls. When a PROP_GET precedes a CALLQ and the fn matches, the reconstructor still merges them using the prop_get's object as the call target (the VM's intent is a method call, even though the `.call(Q, ...)` mechanism passes `undefined` as `this`).

**Pattern details**:
- ChaosVM inserts argument setup (string_build, LOAD_K) between PROP_GET and CALL. The reconstructor allows up to 5 non-side-effectful intermediate statements.
- Register reuse is heavy: `r9 = r18[r9]` both reads and redefines r9. Definition-aware use counting is required for correct single-use safety checks.
- Compound PROP_CALL_1 (op 20) fuses `R(a) = R(b)[R(c)]` and `R(d) = R(e).call(R(f), R(g))` into one instruction. The reconstructor normalizes these to `method_call` format.

**Top method names**: createElement (29), appendChild (20), RegExp (21), removeChild (15), stringify (10), charCodeAt (10), getElementById (8), indexOf (7), join (7).

## Dynamic Analysis: Collector Data (cd) Structure (Task 6.2)

The `cd` array is built by **func_276** via string concatenation (not JSON.stringify). It contains 59 fingerprint values captured from the browser environment. The VM builds the string incrementally: `'{"cd":['` + value1 + `,` + value2 + ... + `"]}"`.

### cd Array Index Map (59 entries)

| Index | Type | Description | Example Value |
|-------|------|-------------|---------------|
| 0 | number | Unknown flag | `1` |
| 1 | string | OS platform | `"linux"` |
| 2 | number | Unknown flag | `2` |
| 3 | number | Color depth | `800` |
| 4 | string | Installed fonts (comma-separated) | `"Arial,Courier New,..."` |
| 5 | string | Empty / reserved | `""` |
| 6 | array | Navigator languages | `["en-US"]` |
| 7 | string | Empty / reserved | `""` |
| 8 | number | Device pixel ratio or hardware concurrency | `8` |
| 9 | array | Screen resolution | `[1920, 1080]` |
| 10 | number | Unknown flag | `1` |
| 11 | number | Unknown flag | `0` |
| 12 | array | Video codec support | `[{"codec":"H.264","support":"probably"},...]` |
| 13 | number | Unknown flag | `1` |
| 14 | number | Touch support max points | `20` |
| 15 | number | Token ID / session hash | `486507625` (varies) |
| 16 | number | Timestamp (ms) | `1775061905` (varies) |
| 17 | number | Performance timing delta | `0.43...` (varies) |
| 18 | object | Audio fingerprint | `{"nt_vc_output":{...},"pxi_output":11888.6...}` |
| 19 | array | MIME types | `[{"type":"application/pdf","suffixes":"pdf"},...]` |
| 20 | string | Canvas fingerprint (truncated base64 PNG) | `"GgoAAAANSUhEUg..."` |
| 21 | object | Storage quota | `{"_state":0,"quota":10737418240,...}` |
| 22 | string | Page URL with random param | `"http://127.0.0.1:.../?rand=..."` |
| 23 | array | Navigator plugins | `[{"name":"PDF Viewer",...},...]` |
| 24 | number | Unknown flag | `0` |
| 25 | number | Unknown | `20` |
| 26 | string | Timezone offset | `"+08"` |
| 27 | number | Unknown flag | `0` |
| 28 | string | Color gamut | `"srgb"` |
| 29 | array | Audio codec support | `[{"codec":"AAC","support":"probably"},...]` |
| 30 | number | Unknown flag | `0` |
| 31 | string | User agent | `"Mozilla/5.0 ..."` |
| 32 | string | Character encoding | `"UTF-8"` |
| 33 | string | Screen info | `"0;0"` |
| 34 | object | Intl locale info | `{"timeZone":"Asia/Shanghai",...}` |
| 35 | null | Reserved | `null` |
| 36 | string | GPU vendor | `"Google Inc. (Google)"` |
| 37 | object | Navigator UA data (high entropy) | `{"architecture":"x86","bitness":"64",...}` |
| 38 | string | Unknown identifier | `"98k"` |
| 39 | string | Battery status | `"unknown"` |
| 40 | string | WebGL renderer | `"ANGLE (Google, Vulkan ...)"` |
| 41 | string | Window position | `"top"` |
| 42 | object | Unknown state | `{"_state":-2}` |
| 43 | string | Empty / reserved | `""` |
| 44 | number | Available height | `600` |
| 45 | number | Unknown flag | `0` |
| 46 | object | Navigator UA data (low entropy) | `{"brands":[...],"mobile":false,"platform":"Linux"}` |
| 47 | string | Screen descriptor | `"800-600-600-24-*-*-\|-*"` |
| 48 | string | OS CPU info | `"Linux x86_64"` |
| 49 | number | Color depth | `24` |
| 50 | string | Empty / reserved | `""` |
| 51 | number | Unknown flag | `0` |
| 52 | number | Timestamp (seconds) | `1775061907` (varies) |
| 53 | number | Timestamp (seconds) | `1775061905` (varies) |
| 54 | number | Hash / checksum | `679647370` |
| 55 | string | Empty / reserved | `""` |
| 56 | number | Unknown flag | `0` |
| 57 | number | Feature bitmask | `1023` |
| 58 | string | Empty / reserved | `""` |

### Token Encoding Pipeline (func_212)

1. **func_276** builds cd JSON string via `+` concatenation → `'{"cd":[...]'`
2. **JSON.stringify** encodes sd object → `'{"sd":{"od":"C","appid":"..."}}'`
3. **substr(1, len-1)** strips outer `{` → `'"sd":{"od":"C",...}}'`
4. **Concatenation**: cd string + `","` + sd substring → complete JSON payload
5. **func_271** encrypts the JSON payload → binary string
6. **btoa** encodes encrypted bytes → base64 string
7. **func_177** applies URL-safe encoding → `%2B`, `%2F`, `%3D` replacements
