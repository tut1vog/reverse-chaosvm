---
name: port-opcodes
description: "Step-by-step manual opcode mapping for ChaosVM tdc.js builds. Maps each switch/case handler in the VM dispatch loop to one of 95 known semantic operations."
---

# Manual Opcode Mapping for ChaosVM

This skill provides the complete procedure and pattern reference for manually mapping opcodes in a new tdc.js build. It is the knowledge base that the `opcode-mapper` agent draws from, and can also be used directly for hands-on mapping.

---

## Part 1 — Setup

### 1.1 Locate the VM Dispatch Function

The main VM function is named `__TENCENT_CHAOS_VM` in the source. Search for it:

```javascript
// Search patterns (any of these will locate it):
__TENCENT_CHAOS_VM
function __TENCENT_CHAOS_VM
```

If the function name has been mangled, look for the characteristic structure: a large function containing a `while` (or `for(;;)`) loop with a `switch` statement inside that has 94-95 `case` handlers. This is the only function in the file with that many cases.

### 1.2 Identify VM Variables by Structural Role

Variable names are minified and change between every build. You MUST identify them by structural role, not by name. Use these heuristics in order:

| Step | What to find | How to identify | Canonical name |
|------|-------------|-----------------|----------------|
| 1 | **Decoded integer array** | The large array indexed with `[++<something>]` in nearly every case handler | `bytecode` |
| 2 | **Program counter** | The variable that gets `++` inside the bytecode index expression: `bytecode[++pc]` | `pc` |
| 3 | **Register file** | An array indexed by bytecode reads: `regs[bytecode[++pc]]` — this is the destination/source of most operations | `regs` |
| 4 | **This context** | Appears as the second argument (after the method) in `.call(thisCtx, ...)` patterns in CALL-type handlers | `thisCtx` |
| 5 | **Catch stack** | An array that only appears in `.push()` and `.pop()` calls within TRY/CATCH/THROW handlers | `catchStack` |
| 6 | **Closure vars** | Used in FUNC_CREATE handlers to capture variables from the enclosing scope | `closureVars` |
| 7 | **Caught exception** | A single variable assigned in LOAD_EXCEPTION and EXC_TRY handlers — the caught error value | `excVal` (G in docs) |

**Identification procedure**: Start with `bytecode` and `pc` — find `[++X]` patterns that appear in almost every case. Then `regs` — find `Y[bytecode[++pc]]` where Y is the register array. Confirm `thisCtx` from `.call()` patterns. Confirm `catchStack` from push/pop in exception-related handlers.

### 1.3 Create a Working Mapping Table

Create a table with columns: `case number`, `raw handler code`, `normalized handler`, `matched mnemonic`, `confidence`, `notes`. Fill it in as you analyze each handler.

---

## Part 2 — Pattern Matching Reference Table

All 95 known operations from the reference build (`decompiler/disassembler.js` lines 27-123), organized by category. For each operation: the mnemonic, operand count, pseudocode, and the code pattern to match in a normalized handler.

### Arithmetic (14 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| ADD | 3 | `R(a) = R(b) + R(c)` | `regs[A] = regs[B] + regs[C]` |
| SUB | 3 | `R(a) = R(b) - R(c)` | `regs[A] = regs[B] - regs[C]` |
| MUL | 3 | `R(a) = R(b) * R(c)` | `regs[A] = regs[B] * regs[C]` |
| DIV | 3 | `R(a) = R(b) / R(c)` | `regs[A] = regs[B] / regs[C]` |
| MOD | 3 | `R(a) = R(b) % R(c)` | `regs[A] = regs[B] % regs[C]` |
| INC | 2 | `R(a) = ++R(b)` | `regs[A] = ++regs[B]` |
| DEC | 2 | `R(a) = --R(b)` | `regs[A] = --regs[B]` |
| NEG | 2 | `R(a) = -R(b)` | `regs[A] = -regs[B]` |
| UPLUS | 2 | `R(a) = +R(b)` | `regs[A] = +regs[B]` (unary plus / toNumber) |
| ADD_K | 3 | `R(a) = R(b) + K(c)` | `regs[A] = regs[B] + bytecode[++pc]` (immediate addend) |
| SUB_K | 3 | `R(a) = R(b) - K(c)` | `regs[A] = regs[B] - bytecode[++pc]` (immediate subtrahend) |
| RSUB_K | 3 | `R(a) = K(b) - R(c)` | `regs[A] = bytecode[++pc] - regs[C]` (reversed subtraction) |
| TO_NUMBER | 2 | `R(a) = toNumber(R(b))` | BigInt-aware number conversion; peeks at `bytecode[pc+1]` without incrementing |
| INC_BIGINT | 6 | `R(a) = toNumber(R(peek)); R(b) = ++R(c); R(d) = R(e)` | Compound: toNumber + increment + move in one handler |

### Bitwise (9 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| XOR | 3 | `R(a) = R(b) ^ R(c)` | `regs[A] = regs[B] ^ regs[C]` |
| OR | 3 | `R(a) = R(b) \| R(c)` | `regs[A] = regs[B] \| regs[C]` |
| SHL | 3 | `R(a) = R(b) << R(c)` | `regs[A] = regs[B] << regs[C]` |
| SHR | 3 | `R(a) = R(b) >> R(c)` | `regs[A] = regs[B] >> regs[C]` |
| AND_K | 3 | `R(a) = R(b) & K(c)` | `regs[A] = regs[B] & bytecode[++pc]` |
| OR_K | 3 | `R(a) = R(b) \| K(c)` | `regs[A] = regs[B] \| bytecode[++pc]` |
| SHL_K | 3 | `R(a) = R(b) << K(c)` | `regs[A] = regs[B] << bytecode[++pc]` |
| SHR_K | 3 | `R(a) = R(b) >> K(c)` | `regs[A] = regs[B] >> bytecode[++pc]` |
| USHR_K | 3 | `R(a) = R(b) >>> K(c)` | `regs[A] = regs[B] >>> bytecode[++pc]` |

### Comparison (10 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| GT | 3 | `R(a) = R(b) > R(c)` | `regs[A] = regs[B] > regs[C]` |
| LT | 3 | `R(a) = R(b) < R(c)` | `regs[A] = regs[B] < regs[C]` |
| EQ | 3 | `R(a) = R(b) == R(c)` | `regs[A] = regs[B] == regs[C]` (loose equality) |
| SEQ | 3 | `R(a) = R(b) === R(c)` | `regs[A] = regs[B] === regs[C]` (strict equality) |
| GT_K | 3 | `R(a) = R(b) > K(c)` | `regs[A] = regs[B] > bytecode[++pc]` |
| LT_K | 3 | `R(a) = R(b) < K(c)` | `regs[A] = regs[B] < bytecode[++pc]` |
| GE_K | 3 | `R(a) = R(b) >= K(c)` | `regs[A] = regs[B] >= bytecode[++pc]` |
| LE_K | 3 | `R(a) = R(b) <= K(c)` | `regs[A] = regs[B] <= bytecode[++pc]` |
| EQ_K | 3 | `R(a) = R(b) == K(c)` | `regs[A] = regs[B] == bytecode[++pc]` |
| SEQ_K | 3 | `R(a) = R(b) === K(c)` | `regs[A] = regs[B] === bytecode[++pc]` |

### Call Operations (12 operations)

Call operations are distinguished by (a) the number of arguments passed and (b) whether `this` comes from a register or from `thisCtx`.

**CALL family** — `this` is a register operand:

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| CALL_0 | 3 | `R(a) = R(b).call(R(c))` | `.call(regs[C])` — zero args, register `this` |
| CALL_1 | 4 | `R(a) = R(b).call(R(c), R(d))` | `.call(regs[C], regs[D])` — one arg, register `this` |
| CALL_2 | 5 | `R(a) = R(b).call(R(c), R(d), R(e))` | `.call(regs[C], regs[D], regs[E])` — two args, register `this` |
| CALL_3 | 6 | `R(a) = R(b).call(R(c), R(d), R(e), R(f))` | `.call(regs[C], ..., regs[F])` — three args, register `this` |

**CALLQ family** — `this` is `thisCtx` (the VM's Q variable):

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| CALLQ_0 | 2 | `R(a) = R(b).call(Q)` | `.call(thisCtx)` — zero args |
| CALLQ_1 | 3 | `R(a) = R(b).call(Q, R(c))` | `.call(thisCtx, regs[C])` — one arg |
| CALLQ_2 | 4 | `R(a) = R(b).call(Q, R(c), R(d))` | `.call(thisCtx, regs[C], regs[D])` — two args |
| CALLQ_3 | 5 | `R(a) = R(b).call(Q, R(c), R(d), R(e))` | `.call(thisCtx, ..., regs[E])` — three args |

**Compound/special call operations**:

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| CALL_COMPLEX | 7 | `R(a) = K; R(c) = R(d).call(Q, R(e)); R(f) = R(g)` | Fused: load constant + callQ_1 + register copy |
| PROP_CALL_1 | 7 | `R(a) = R(b)[R(c)]; R(d) = R(e).call(R(f), R(g))` | Fused: property get + call_1 |
| CALLQ_1_COPY | 5 | `R(a) = R(b).call(Q, R(c)); R(d) = R(e)` | Fused: callQ_1 + register copy |
| APPLY | var | `R(a) = R(b).apply(R(c), h[])` | Uses `.apply()` instead of `.call()`; reads a variable-length argument array from bytecode |

**How to distinguish CALL_1 vs CALLQ_1**: Look at the `.call()` invocation. If the first argument is a register read (`regs[bytecode[++pc]]`), it is a CALL variant. If the first argument is the `thisCtx` variable directly (not read from bytecode), it is a CALLQ variant.

### Control Flow (12 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| JMP | 1 | `C += K(a)` | `pc += bytecode[++pc]` — unconditional jump; adds an immediate offset to pc |
| CJMP | 3 | `C += R(a) ? K(b) : K(c)` | Conditional: reads a register as condition, then reads two immediate offsets (true/false branch targets) |
| RET | 2 | `R(a) = Q; return R(b)` | Saves `thisCtx` to a register and returns another register's value |
| RET_BARE | 1 | `return R(a)` | Simple return of a register value — no thisCtx save |
| RET_CLEANUP | 2 | `F.pop(); R(a) = Q; return R(b)` | Like RET but also pops the catch stack first |
| SET_RET | 4 | `R(a)[K] = R(b); return R(c)` | Property set with immediate key + return |
| SET_RET_Q | 5 | `R(a)[R(b)] = R(c); R(d) = Q; return R(e)` | Property set + thisCtx save + return |
| TRY_PUSH | 3 | `R(a) = R(b); F.push(C + K)` | Register copy + push catch address onto catchStack |
| TRY_POP | 0 | `F.pop()` | Pop catchStack — zero operands |
| CATCH_PUSH | 1 | `F.push(C + K)` | Push catch address only (no register copy) |
| THROW | 1 | `throw R(a)` | Throws the value in a register |
| EXC_TRY | 4 | `R(a) = G; R(b) = R(c); F.push(C + K)` | Compound: load exception + register copy + push catch address |

### Property Access (10 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| PROP_GET | 3 | `R(a) = R(b)[R(c)]` | Dynamic property read — both object and key are registers |
| PROP_SET | 3 | `R(a)[R(b)] = R(c)` | Dynamic property write |
| PROP_GET_K | 3 | `R(a) = R(b)[K(c)]` | Property read with immediate key (bytecode constant, not register) |
| PROP_SET_K | 3 | `R(a)[K(b)] = R(c)` | Property write with immediate key |
| PROP_GET_CONST | 5 | `R(a) = R(b)[R(c)]; R(d) = K(e)` | Fused: property get + load constant |
| PROP_GET_K_2 | 6 | `R(a) = R(b)[K]; R(c) = R(d)[K]` | Fused: two property gets with immediate keys |
| SET_GET_CONST | 8 | `R(a)[R(b)] = R(c); R(d) = R(e)[R(f)]; R(g) = K(h)` | Fused: property set + property get + load constant |
| COPY_SET | 5 | `R(a) = R(b); R(c)[R(d)] = R(e)` | Fused: register copy + property set |
| IN | 3 | `R(a) = R(b) in R(c)` | The `in` operator — checks property existence |
| DELETE | 3 | `R(a) = delete R(b)[R(c)]` | The `delete` operator |

### String Operations (9 operations)

String operations build strings character-by-character using `String.fromCharCode()` (or `+= char(K)` shorthand). This is a ChaosVM obfuscation technique to avoid string literals.

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| STR_INIT | 3 | `R(a) = ""; R(a) += char(K)` | Initialize empty string and append first character |
| STR_APPEND | 2 | `R(a) += char(K)` | Append one character (from immediate) to a string register |
| STR_EMPTY | 1 | `R(a) = ""` | Initialize empty string only (no append) |
| STR_APPEND_2 | 4 | `R(a) += char(K); R(b) += char(K)` | Append one character to each of two different string registers |
| STR_OBJ_STR | 4 | `R(a) += char(K); R(b) = {}; R(c) = ""` | Fused: string append + object creation + empty string init |
| STR_PROP | 5 | `R(a) += char(K); R(b) = R(c)[R(d)]` | Fused: string append + property get |
| STR_SET_STR | 6 | `R(a) += char(K); R(b)[K] = R(c); R(d) = ""` | Fused: string append + property set (immediate key) + empty string init |
| STR_SET_K | 5 | `R(a) += char(K); R(b)[K] = R(c)` | Fused: string append + property set (immediate key) |
| PROP_STR | 6 | `R(a) = R(b)[R(c)]; R(d) = ""; R(d) += char(K)` | Fused: property get + string init + string append |

### Object and Array Creation (7 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| OBJ_NEW | 1 | `R(a) = {}` | Create empty object |
| ARRAY | 2 | `R(a) = Array(K)` | Create array with immediate length |
| ARRAY_2 | 4 | `R(a) = Array(K); R(b) = Array(K)` | Fused: create two arrays |
| NEW_0 | 2 | `R(a) = new R(b)` | Constructor call with zero args |
| NEW_1 | 3 | `R(a) = new R(b)(R(c))` | Constructor call with one arg |
| NEW_2 | 4 | `R(a) = new R(b)(R(c), R(d))` | Constructor call with two args |
| ENUMERATE | 2 | `h = keys(R(a)); R(b) = h` | `for..in` enumeration — gets property keys |

### Data Movement (6 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| MOV | 2 | `R(a) = R(b)` | Simple register-to-register copy |
| MOV_2 | 4 | `R(a) = R(b); R(c) = R(d)` | Fused: two register copies |
| LOAD_K | 2 | `R(a) = K(b)` | Load immediate constant into register |
| LOAD_NULL | 1 | `R(a) = null` | Load null into register |
| LOAD_THIS | 1 | `R(a) = Q` | Load thisCtx into register |
| LOAD_EXCEPTION | 1 | `R(a) = G` | Load caught exception value into register |

### Type and Logic (3 operations)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| TYPEOF | 2 | `R(a) = typeof R(b)` | The `typeof` operator |
| NOT | 2 | `R(a) = !R(b)` | Logical NOT |
| ITER_SHIFT | 3 | `h = R(a); if (R(b) = !!h.length) R(c) = h.shift(); else ++C` | Iterator: checks array length, shifts next element or skips |

### Function Creation (3 operations — variable width)

| Mnemonic | Ops | Pseudocode | Pattern to match |
|----------|-----|-----------|------------------|
| FUNC_CREATE_A | var | string append + closure creation + prop set | Contains: string building, creating a new function that captures closureVars, and setting a property. Has a loop that reads a variable number of operands. |
| FUNC_CREATE_B | var | prop set + closure creation + prop set | Like A but starts with a property set instead of string building. |
| FUNC_CREATE_C | var | closure creation (standalone) | Standalone closure creation without the fused string/property operations. |

**How to identify FUNC_CREATE variants**: Look for handlers that (a) create a new function/closure, (b) reference `closureVars`, and (c) read a variable number of operands in a loop. Distinguish A/B/C by which additional operations are fused in.

---

## Part 3 — Handling Ambiguity

### When a handler does not cleanly match

1. **Normalize carefully**: Make sure all variable substitutions are correct. A wrong variable identification cascades into wrong pattern matches.
2. **Check for compound opcodes**: The handler may be a fusion of two simple operations. Look for semicolons or comma operators that separate independent sub-operations.
3. **Compare operand counts**: Count how many `bytecode[++pc]` reads occur in the handler. This gives the operand count, which narrows candidates significantly.
4. **Check the "Ops" column**: The operand count must match exactly (except for variable-width opcodes).

### Distinguishing similar opcodes

**CALL_N vs CALLQ_N**: The critical difference is the `this` binding.
- `CALL_N`: `.call(regs[bytecode[++pc]], ...)` — the `this` argument is read from bytecode (it is a register operand).
- `CALLQ_N`: `.call(thisCtx, ...)` — the `this` argument is the `thisCtx` variable directly (NOT read from bytecode via `++pc`).
- Count the total `bytecode[++pc]` reads: CALL_1 has 4 reads (dst, fn, this, arg1), CALLQ_1 has 3 reads (dst, fn, arg1).

**EQ vs SEQ / EQ_K vs SEQ_K**: Check whether the comparison uses `==` (loose) or `===` (strict). In minified code, `===` has three equal signs.

**PROP_GET_K vs LOAD_K**: Both read an immediate from bytecode, but PROP_GET_K uses it as a property key on an object (`regs[A] = regs[B][K]`), while LOAD_K stores it directly (`regs[A] = K`).

**RET vs RET_BARE vs RET_CLEANUP**:
- `RET`: two operations — save thisCtx + return. Has a `catchStack` reference? No.
- `RET_BARE`: just `return regs[A]` — simplest.
- `RET_CLEANUP`: like RET but with `catchStack.pop()` before the return.

**ADD vs ADD_K / SUB vs SUB_K**: Check whether the third operand is a register read (`regs[bytecode[++pc]]`) or a direct bytecode read (`bytecode[++pc]`). The `_K` variant uses the immediate value directly without indexing into the register file.

**STR_INIT vs STR_EMPTY**: STR_INIT does both `regs[A] = ""` and `regs[A] += char(K)` (2 bytecode reads). STR_EMPTY only does `regs[A] = ""` (1 bytecode read).

### Variable-width opcodes

These opcodes read a count from the bytecode stream and then consume that many additional operands:

- **FUNC_CREATE_A/B/C**: Read a count, then loop that many times reading register indices for closure variable capture. Distinguished by what operations are fused before/after the closure creation.
- **APPLY**: Reads an argument count, then reads that many register indices to build the argument array for `.apply()`.

To identify: look for a loop inside the case handler where the iteration count comes from `bytecode[++pc]`.

### Compound/fused opcodes

These are the hardest to map because they combine multiple simple operations:

| Mnemonic | Sub-operations |
|----------|---------------|
| CALL_COMPLEX | LOAD_K + CALLQ_1 + MOV |
| PROP_CALL_1 | PROP_GET + CALL_1 |
| CALLQ_1_COPY | CALLQ_1 + MOV |
| COPY_SET | MOV + PROP_SET |
| PROP_GET_CONST | PROP_GET + LOAD_K |
| SET_GET_CONST | PROP_SET + PROP_GET + LOAD_K |
| STR_APPEND_2 | STR_APPEND + STR_APPEND |
| STR_OBJ_STR | STR_APPEND + OBJ_NEW + STR_EMPTY |
| STR_PROP | STR_APPEND + PROP_GET |
| STR_SET_STR | STR_APPEND + PROP_SET_K + STR_EMPTY |
| STR_SET_K | STR_APPEND + PROP_SET_K |
| PROP_STR | PROP_GET + STR_INIT |
| PROP_GET_K_2 | PROP_GET_K + PROP_GET_K |
| ARRAY_2 | ARRAY + ARRAY |
| MOV_2 | MOV + MOV |
| SET_RET | PROP_SET_K + RET_BARE |
| SET_RET_Q | PROP_SET + RET |
| INC_BIGINT | TO_NUMBER + INC + MOV |
| EXC_TRY | LOAD_EXCEPTION + MOV + CATCH_PUSH |
| TRY_PUSH | MOV + CATCH_PUSH |

**Strategy**: If a handler has more sub-operations than any single known opcode, it might be a template-specific fusion not seen in Template A. Flag it for manual review.

**Template B differences**: Template B has 94 opcodes instead of 95. One compound opcode from Template A may be split into two simpler ones, or two opcodes may be merged. Check the total count to understand the template's fusion strategy.

---

## Part 4 — Output Format

### Opcode table JSON

The output file should be a JSON object mapping case numbers (as strings) to mnemonic names:

```json
{
  "0": "ADD",
  "1": "IN",
  "2": "DIV",
  "3": "XOR",
  ...
  "94": "NEW_1"
}
```

- Keys are the `case N:` numbers from the switch statement, as strings.
- Values are the exact mnemonic names from `docs/OPCODE_REFERENCE.md`.
- Every case handler must have an entry. No gaps, no duplicates.

### Cross-checking the mapping

After completing the table, verify:

1. **Total count**: The number of entries should equal the number of case handlers (94 or 95).
2. **No duplicate mnemonics**: Each mnemonic should appear exactly once. If a mnemonic appears twice, one of the mappings is wrong.
3. **No missing mnemonics**: Compare the set of mapped mnemonics against the full list of 95 known mnemonics. For Template A, all 95 should be present. For Template B (94 opcodes), exactly one will be missing or replaced.
4. **Operand count consistency**: For each entry, verify that the number of `bytecode[++pc]` reads in the raw handler matches the expected operand count for that mnemonic.
5. **Spot-check 5 easy opcodes**: Verify MOV, JMP, LOAD_NULL, NOT, and TRY_POP — these are simple and unambiguous, so if any of them are wrong, the variable identification in Part 1 is likely incorrect.

### Mapping notes file

In addition to the JSON table, produce a notes file (`opcode-mapping-notes.md`) documenting:

- Which VM variable names map to which canonical roles
- Any ambiguous handlers with the raw code and candidate matches
- Any handlers that do not match any known pattern (potential new opcodes)
- Template classification (A, B, or new) with reasoning
- Confidence level for each mapping (high/medium/low)
