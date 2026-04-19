# vm-slide Stack VM Opcode Reference

## Overview

This is the opcode table for the `__TENCENT_CHAOS_STACK` stack-based ChaosVM variant implemented in the vm-slide build the research scripts were run against. Every row below is classified by reading the handler source string extracted by the decoder — Phase 39.1's decoder extracted all 53 non-null handlers and their literal `operandCount` from the dispatch-table array literal. Source classifications have now been validated against the Phase 40.1 walker's full-coverage disassembly (14,134 instructions across 101 function entries): every non-null handler has been observed firing at least once in real bytecode, so the table below is both semantically and behaviorally grounded.

For VM internals (register file, dispatch loop, exception handling, return protocol), see `docs/VM_SLIDE_ARCHITECTURE.md`.

## Coverage

Two different notions of "coverage" apply to this document:

- **Semantic coverage — complete.** All 53 non-null handlers in the 69-slot dispatch table have been read and classified from source. The table below is exhaustive for this build.
- **Behavioral coverage — effectively complete.** The Phase 40.1 control-flow-aware walker decoded 14,134 instructions across 101 distinct function entries, covering the entire `[0, 24273)` byte range of the bytecode (58.2% instruction starts, 42% operand bytes). Every non-null handler classified below has been observed firing at least once. The Phase 39.1 linear disassembler's ~2% coverage limitation is resolved: the pc=512 halt was caused by `FUNC_CREATE` variable-width mis-parse, not by legitimate data at opcode 65.

The 40.1 walker did not contradict any Phase 39.3 source-only classification. Where a row notes "walker-validated" below, the walker explicitly audited that opcode as part of its control-flow analysis.

## Notation

- **Opcode** — decimal index into the dispatch table `Q`.
- **Name** — descriptive uppercase mnemonic inferred from the handler body.
- **Operands** — number of bytes the handler reads from `m[g++]` after the opcode. `var` marks handlers whose width depends on already-read operand values.
- **Stack before → after** — the operand stack `n` shape around the handler invocation. `[..., x]` means "some prefix then x on top"; `pair` means a 2-element array `[obj, key]` or a local-slot ref; `ref` means a 1-element array `[slot]`.
- **Effect** — one-line summary of what the handler does. Cross-reference the decoder-extracted dispatch table for the exact source.

All handlers are zero-argument JavaScript functions; "returns true" / "returns false" below refers to the boolean the outer dispatch loop reads to decide whether to break out (see `docs/VM_SLIDE_ARCHITECTURE.md` / "Dispatch loop").

## Opcode table

| Opcode | Name | Operands | Stack before → after | Effect |
|---|---|---|---|---|
| 0 | LOAD_LOCAL | 1 | `[...]` → `[..., v]` | Push `n[K][0]` — read local slot K as a single-cell array and push its value. |
| 1 | ENUM_KEYS | 0 | `[..., obj]` → `[..., keys[]]` | Pop an object, push an array of its enumerable property names via `for (A in obj)`. |
| 2 | METHOD_CALL | 1 | `[..., pair, arg1...argK]` → `[..., result]` | Pop K args, pop `[recv, key]` pair, push `recv[key].apply(recv, args)`. |
| 3 | MK_PAIR | 0 | `[..., a, b]` → `[..., [a, b]]` | Pop two values, push a 2-element array built from them in original order (`[a,b].reverse()` is applied to `[b,a]` after the pops). |
| 4 | PUSH_EMPTY_STR | 0 | `[...]` → `[..., ""]` | Push an empty string. |
| 5 | POP | 0 | `[..., x]` → `[...]` | Pop and discard TOS. |
| 6 | JUMP | 1 | `[...]` → `[...]` | Absolute jump: `g = m[g++]`. Reads a target pc and writes it into the program counter. Walker-validated unconditional terminator; target = operand 0. |
| 7 | XOR | 0 | `[..., a, b]` → `[..., a ^ b]` | Bitwise XOR via in-place mutate of TOS-1 with popped TOS. |
| 8 | PUSH_K | 1 | `[...]` → `[..., K]` | Push the immediate operand K as-is. |
| 10 | STR_APPEND_CHAR | 1 | `[..., s]` → `[..., s + char(K)]` | In-place append `String.fromCharCode(K)` to TOS. |
| 11 | AND | 0 | `[..., a, b]` → `[..., a & b]` | Bitwise AND. |
| 12 | EQ | 0 | `[..., a, b]` → `[..., a == b]` | Loose equality (`==`). |
| 13 | LOAD_GLOBAL | 0 | `[..., key]` → `[..., U[key]]` | Replace TOS (string key) with `U[key]` — global/constant-pool lookup. |
| 15 | ITER_NEXT | 0 | `[..., arr]` → `[..., arr, value, true]` or `[..., arr, undefined, false]` | Iterator step: if `arr.length`, shift one value and push it with `true`; else push `undefined, false`. TOS `arr` is mutated in place. |
| 16 | VM_EXIT (a.k.a. RETURN) | 0 | `[..., x]` → `[..., x]` | `return true` — breaks the inner dispatch loop unconditionally so the outer loop can return the top-of-stack as the VM result. Walker-validated as the VM_EXIT terminator for every reachable call site; Phase 39.3's `RETURN` name is semantically correct. |
| 17 | PUSH_UNDEFINED | 0 | `[...]` → `[..., undefined]` | Push `undefined`. |
| 20 | ADD | 0 | `[..., a, b]` → `[..., a + b]` | Numeric/string `+`. |
| 21 | SUB | 0 | `[..., a, b]` → `[..., a - b]` | Numeric `-`. |
| 23 | LOGICAL_NOT | 0 | `[..., x]` → `[..., !x]` | Logical negation via pop/push. |
| 24 | STORE_REF | 0 | `[..., pair, v]` | Read TOS-1 as `[obj, key]` and assign `obj[key] = v`. Neither `pair` nor `v` is popped — the stack is left untouched. |
| 25 | NEW_METHOD | 1 | `[..., pair, arg1...argK]` → `[..., new recv[key](...args)]` | Pop K args, unshift `null` (for `Function.bind`), pop `[recv, key]` pair, construct via the `p()` helper: `new (recv[key])(...args)`. |
| 28 | STRICT_EQ | 0 | `[..., a, b]` → `[..., a === b]` | Strict equality (`===`). |
| 31 | GT | 0 | `[..., a, b]` → `[..., a > b]` | Greater-than. |
| 32 | MAKE_GLOBAL_REF | 0 | `[..., key]` → `[..., [U, key]]` | Pop a key, push a `[constPool, key]` reference pair — i.e. a writable reference into the global object. |
| 33 | CLEAR_EXCEPTION | 0 | `[...]` → `[...]` | Set `K = null`. Clears the exception latch after handling a caught throw. |
| 35 | TRY_PUSH | 2 | `[...]` → `[...]` | Push catch frame `[catchPc=K1, savedStackLen=n.length, exceptionSlot=K2]` onto the catch stack `C`. The first operand (catch PC) is an **implicit branch target** reached only via the outer VM's `catch(I){...g=o[0]}` block; the 40.1 walker enqueues operand 0 as a branch target to keep catch blocks reachable in the control-flow graph. |
| 36 | STORE_LOCAL_REF | 0 | `[..., [slot], v]` | In-place write: `n[n[n.length-2][0]][0] = n[n.length-1]`. Reads the single-element ref pair at TOS-1, looks up its slot, and stores the TOS into that slot's 0-cell. Stack unchanged. |
| 37 | MOD | 0 | `[..., a, b]` → `[..., a % b]` | Modulo. |
| 38 | DIV | 0 | `[..., a, b]` → `[..., a / b]` | Division. |
| 39 | DUP | 0 | `[..., x]` → `[..., x, x]` | Duplicate TOS. |
| 40 | SET_STACK_LEN | 1 | `[...]` → `[... truncated to K]` | Assign `n.length = K`. Trims the operand stack to an absolute length. |
| 41 | GET_PAIR | 0 | `[..., C, A]` → `[..., [C[0][C[1]], A]]` | Pop `A`, pop a `[obj, key]` pair `C`, push a new pair `[obj[key], A]`. Used to stage a for-in cursor: key on top, dereferenced value underneath. |
| 42 | ALLOC_LOCAL | 1 | `[...]` → `[...]` | Ensure `n[K]` exists as a 1-cell array — `n[K] = n[K] === undefined ? [] : n[K]`. |
| 45 | PUSH_NULL | 0 | `[...]` → `[..., null]` | Push `null`. |
| 46 | SHR | 0 | `[..., a, b]` → `[..., a >> b]` | Arithmetic right-shift. |
| 47 | MAKE_LOCAL_REF | 1 | `[...]` → `[..., [K]]` | Push a single-element array `[K]` — a reference to local slot K for later use with `LOAD_LOCAL_REF` / `STORE_LOCAL_REF`. |
| 49 | TRY_POP | 0 | `[...]` → `[...]` | Pop one entry off the catch stack `C` — end of `try` block without a throw. |
| 50 | REPLACE_TOP_K | 1 | `[..., x]` → `[..., K]` | Overwrite TOS in place with the immediate operand K. |
| 51 | SHL | 0 | `[..., a, b]` → `[..., a << b]` | Left-shift. |
| 52 | TYPEOF | 0 | `[..., x]` → `[..., typeof x]` | Pop, apply `typeof`, push. |
| 54 | DEREF | 0 | `[..., pair]` → `[..., pair[0][pair[1]]]` | Pop a `[obj, key]` pair, push `obj[key]` — read through an object reference. |
| 55 | NEW_FUNC | 1 | `[..., fn, arg1...argK]` → `[..., new fn(...args)]` | Pop K args, unshift `null`, pop a constructor, invoke via the `p()` helper: `new fn(...args)`. |
| 56 | OR | 0 | `[..., a, b]` → `[..., a \| b]` | Bitwise OR. |
| 58 | FUNC_CREATE | var (3 + 2·A + C) | `[...]` → `[..., fn]` | Closure factory. Reads header `K` (start-pc), `A` (capture count), `C` (argmap count); then `A` pairs of `[destSlot, srcSlot]` copied from the current operand stack into a capture frame `p[]`; then `C` argmap entries into `Q[]`. Pushes a new function `w` that, when called, copies `p[]`, installs `[this]`, `[arguments]`, and `[w]` into slots 0/1/2, maps up to `Q.length` caller arguments into their mapped slots, and invokes `__TENCENT_CHAOS_VM(K, m, U, A, E, F, Y, c)` as a nested VM. **Walker-resolved:** the Phase 40.1 walker correctly decodes the runtime width `3 + 2·A + C` bytes (the Phase 39.3 decoder's static `operandCount: 6` was a lexical count of `m[g++]` expressions). Phase 40.6 confirmed this opcode instantiates the XTEA encrypt/decrypt closures — see `docs/VM_SLIDE_ARCHITECTURE.md` "XTEA factory and closures". |
| 59 | MAKE_LOCAL_PAIR | 0 | `[..., slot, key]` → `[..., [n[slot][0], key]]` | Pop a key, pop a slot index, push a `[localValue, key]` pair — a reference-shaped 2-tuple backed by a local's current value. |
| 60 | JUMP_IF_TRUE | 1 | `[..., x]` | If TOS is truthy, `g = K`. **Does not pop** — TOS is left in place so later code can branch on it again or consume it. Walker-validated conditional branch with both operand 0 (taken) and fall-through edges enqueued. |
| 61 | RETURN_IF_EXC | 0 | `[...]` | `return !!K` — breaks the inner dispatch loop only if the exception latch `K` is set, letting the outer loop rethrow. Context-dependent terminator: truthy only when `K` is non-null, so static analysis cannot decide. The 40.1 walker deliberately treats it as fall-through to keep reachability sound. |
| 62 | GE | 0 | `[..., a, b]` → `[..., a >= b]` | Greater-or-equal. |
| 63 | LOAD_LOCAL_REF | 0 | `[..., [slot]]` → `[..., n[slot][0]]` | Pop a single-element ref array, push the referenced local's current value. Companion to `MAKE_LOCAL_REF` / `STORE_LOCAL_REF`. |
| 64 | SWAP_AT | 1 | `[..., x, ..., y]` → `[..., y, ..., x]` | Swap TOS with `n[n.length - 2 - K]`; push the old element from that depth. Effectively an indexed exchange useful for reordering without full shuffling. Phase 40.6 observed SWAP_AT repeatedly in the XTEA round body (e.g. at PCs 15334 and 15356) rearranging the top-of-stack to hoist locals into position for upcoming binary operations — the mechanics-only name `SWAP_AT` is supported by this usage context. |
| 66 | CALL_GLOBAL | 1 | `[..., fn, arg1...argK]` → `[..., result]` | Pop K args, pop a function, push `fn.apply(U, args)` — call with `this` bound to the constant pool (i.e. `window` at top level). |
| 67 | MUL | 0 | `[..., a, b]` → `[..., a * b]` | Multiplication. |
| 68 | USHR | 0 | `[..., a, b]` → `[..., a >>> b]` | Unsigned right-shift. |

53 rows, matching the 53 non-null entries in the decoder-extracted dispatch table (verified by counting non-null elements).

## Dispatch holes

The dispatch table `Q` is a 69-element sparse-array literal with 16 holes. These are not explicit `null` values in the source — they are gaps in the `[..., , func, , , func, ...]` literal that `JSON.stringify` and the Phase 39.1 decoder normalize to `null`. The Phase 40.1 walker's full-coverage walk confirmed that **none of the 16 holes are hit by any reachable code path in this vm-slide build** — they are confirmed unreached, not merely unobserved.

The 16 hole indices (verified against the decoder-extracted dispatch table):

- Slot 9: null — no handler in the source array literal
- Slot 14: null — no handler in the source array literal
- Slot 18: null — no handler in the source array literal
- Slot 19: null — no handler in the source array literal
- Slot 22: null — no handler in the source array literal
- Slot 26: null — no handler in the source array literal
- Slot 27: null — no handler in the source array literal
- Slot 29: null — no handler in the source array literal
- Slot 30: null — no handler in the source array literal
- Slot 34: null — no handler in the source array literal
- Slot 43: null — no handler in the source array literal
- Slot 44: null — no handler in the source array literal
- Slot 48: null — no handler in the source array literal
- Slot 53: null — no handler in the source array literal
- Slot 57: null — no handler in the source array literal
- Slot 65: null — no handler in the source array literal (Phase 39.1's linear disassembler halted at pc=512 on a decoded "opcode 65"; Phase 40.1 showed this was a `FUNC_CREATE` mis-parse, not a legitimate hole hit)

## Unresolved entries

No opcode in the table above required a `?NAME` fallback — all 53 handlers classify cleanly from their source bodies. The two quirks flagged in Phase 39.3 have since been resolved:

- **Opcode 58 (FUNC_CREATE) operand width — resolved in Phase 40.1.** The decoder's static `operandCount: 6` was a lexical count of `m[g++]` expressions; the true runtime width is `3 + 2·A + C` bytes because the two inline `for` loops execute `A` and `C` times respectively. The Phase 40.1 walker special-cases this handler and correctly advances through all 128 `FUNC_CREATE` sites in the bytecode. Phase 40.6 then confirmed `FUNC_CREATE` is the mechanism that instantiates the classical-XTEA encrypt and decrypt closures at runtime.
- **Opcode 64 (SWAP_AT) naming — resolved in Phase 40.6.** Phase 40.6 observed SWAP_AT in the XTEA round body (e.g. at PCs 15334 and 15356) used to rearrange the top-of-stack so that locals land in the correct positions for upcoming binary operations (shift/XOR/add). The mechanics-only name `SWAP_AT` is a good fit for this usage — no rename is needed.

## Opcodes in the XTEA factory

Phase 40.6 enumerated the opcodes that appear inside the classical-XTEA encrypt and decrypt closures (entries PC 15241 and PC 15416). This is the **minimum viable opcode set** for porting vm-slide's XTEA step to a standalone implementation — any future reimplementation that restricts itself to these 22 opcodes will handle both cipher directions:

- **Locals / references:** `LOAD_LOCAL`, `MAKE_LOCAL_REF`, `LOAD_LOCAL_REF`, `STORE_LOCAL_REF`, `MAKE_LOCAL_PAIR`, `DEREF`
- **Constants / stack manipulation:** `PUSH_K`, `DUP`, `POP`, `SWAP_AT`, `REPLACE_TOP_K`
- **Arithmetic / bitwise:** `ADD`, `SUB`, `AND`, `XOR`, `SHL`, `USHR`
- **Comparison / logic:** `EQ`, `LOGICAL_NOT`
- **Control flow:** `JUMP`, `JUMP_IF_TRUE`
- **Closure creation:** `FUNC_CREATE` (only used by the outer factory that spawns the encrypt/decrypt pair)

Notably absent from the round body: `SHR`, `MUL`, `DIV`, `MOD`, `OR` — classical XTEA uses neither signed right-shift nor arithmetic besides add/sub. See `docs/VM_SLIDE_ARCHITECTURE.md` "XTEA factory and closures" for the full structural description.

## Cross-references

- `docs/VM_SLIDE_ARCHITECTURE.md` — register file, dispatch loop, exception model, bytecode format, return protocol, and open cross-track findings.
- `docs/OPCODE_REFERENCE.md` — opcode table for the register-based `tdc.js` ChaosVM (the different-variant counterpart to this doc).
- `docs/VM_ARCHITECTURE.md` — architecture reference for the register-based `tdc.js` ChaosVM.
- `docs/CRYPTO_ANALYSIS.md` — XTEA round constants and key-derivation details for the register-based `tdc.js` (modified XTEA). Note that vm-slide uses classical XTEA with a key passed in as a factory argument, not the register VM's STATE_A-derived key, so the `keyModConstants` story does not apply here.
