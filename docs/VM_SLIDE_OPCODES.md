# vm-slide Stack VM Opcode Reference

## Overview

This is the opcode table for the `__TENCENT_CHAOS_STACK` stack-based ChaosVM variant implemented in `sample/vm_slide.js`. Every row below is classified by reading the handler source string committed in `output/vm-slide/dispatch-table.json` — Phase 39.1's decoder extracted all 53 non-null handlers and their literal `operandCount` from the dispatch-table array literal. Classification is at **Phase 39 first-pass level**: each handler body has been read and described, but behavioral validation against real disassembled instructions is limited by the current ~2% linear-disassembly coverage (see "Coverage caveat" below).

For VM internals (register file, dispatch loop, exception handling, return protocol), see `docs/VM_SLIDE_ARCHITECTURE.md`.

## Coverage caveat

Two different notions of "coverage" apply to this document:

- **Semantic coverage — complete.** All 53 non-null handlers in the 69-slot dispatch table have been read and classified from source. The table below is exhaustive for this build.
- **Behavioral coverage — partial (~2%).** The linear disassembler in `research/vm-slide-stack-vm/disassembler.js` decodes 312 instructions from pc=0 to pc=512 before halting on a dispatch-table hole (opcode 65 at pc=512). This covers approximately 2% of the 24,273-element bytecode. Therefore, while every opcode is documented here, only a subset have been **observed** firing in the disassembly output. **Phase 40 task 40.1 will close the behavioral-coverage gap with a control-flow-aware disassembler upgrade.**

Where a classification below depends on subtle handler-body behavior (in-place mutation vs pop-and-push, variable operand widths, iterator-like pair shapes), the description reflects the source literally. If full-coverage disassembly in Phase 40 contradicts any row here, that row should be corrected then.

## Notation

- **Opcode** — decimal index into the dispatch table `Q`.
- **Name** — descriptive uppercase mnemonic inferred from the handler body.
- **Operands** — number of bytes the handler reads from `m[g++]` after the opcode. `var` marks handlers whose width depends on already-read operand values.
- **Stack before → after** — the operand stack `n` shape around the handler invocation. `[..., x]` means "some prefix then x on top"; `pair` means a 2-element array `[obj, key]` or a local-slot ref; `ref` means a 1-element array `[slot]`.
- **Effect** — one-line summary of what the handler does. Cross-reference `output/vm-slide/dispatch-table.json` for the exact source.

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
| 6 | JUMP | 1 | `[...]` → `[...]` | Absolute jump: `g = m[g++]`. Reads a target pc and writes it into the program counter. |
| 7 | XOR | 0 | `[..., a, b]` → `[..., a ^ b]` | Bitwise XOR via in-place mutate of TOS-1 with popped TOS. |
| 8 | PUSH_K | 1 | `[...]` → `[..., K]` | Push the immediate operand K as-is. |
| 10 | STR_APPEND_CHAR | 1 | `[..., s]` → `[..., s + char(K)]` | In-place append `String.fromCharCode(K)` to TOS. |
| 11 | AND | 0 | `[..., a, b]` → `[..., a & b]` | Bitwise AND. |
| 12 | EQ | 0 | `[..., a, b]` → `[..., a == b]` | Loose equality (`==`). |
| 13 | LOAD_GLOBAL | 0 | `[..., key]` → `[..., U[key]]` | Replace TOS (string key) with `U[key]` — global/constant-pool lookup. |
| 15 | ITER_NEXT | 0 | `[..., arr]` → `[..., arr, value, true]` or `[..., arr, undefined, false]` | Iterator step: if `arr.length`, shift one value and push it with `true`; else push `undefined, false`. TOS `arr` is mutated in place. |
| 16 | RETURN | 0 | `[..., x]` → `[..., x]` | `return true` — breaks the inner dispatch loop unconditionally so the outer loop can return the top-of-stack as the VM result. |
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
| 35 | TRY_PUSH | 2 | `[...]` → `[...]` | Push catch frame `[catchPc=K1, savedStackLen=n.length, exceptionSlot=K2]` onto the catch stack `C`. |
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
| 58 | FUNC_CREATE | var (3 + 2·A + C) | `[...]` → `[..., fn]` | Closure factory. Reads header `K` (start-pc), `A` (capture count), `C` (argmap count); then `A` pairs of `[destSlot, srcSlot]` copied from the current operand stack into a capture frame `p[]`; then `C` argmap entries into `Q[]`. Pushes a new function `w` that, when called, copies `p[]`, installs `[this]`, `[arguments]`, and `[w]` into slots 0/1/2, maps up to `Q.length` caller arguments into their mapped slots, and invokes `__TENCENT_CHAOS_VM(K, m, U, A, E, F, Y, c)` as a nested VM. See "Unresolved entries" below — the **static** `operandCount` reported by the decoder is 6, but the **runtime** width depends on `A` and `C`. |
| 59 | MAKE_LOCAL_PAIR | 0 | `[..., slot, key]` → `[..., [n[slot][0], key]]` | Pop a key, pop a slot index, push a `[localValue, key]` pair — a reference-shaped 2-tuple backed by a local's current value. |
| 60 | JUMP_IF_TRUE | 1 | `[..., x]` | If TOS is truthy, `g = K`. **Does not pop** — TOS is left in place so later code can branch on it again or consume it. |
| 61 | RETURN_IF_EXC | 0 | `[...]` | `return !!K` — breaks the inner dispatch loop only if the exception latch `K` is set, letting the outer loop rethrow. |
| 62 | GE | 0 | `[..., a, b]` → `[..., a >= b]` | Greater-or-equal. |
| 63 | LOAD_LOCAL_REF | 0 | `[..., [slot]]` → `[..., n[slot][0]]` | Pop a single-element ref array, push the referenced local's current value. Companion to `MAKE_LOCAL_REF` / `STORE_LOCAL_REF`. |
| 64 | SWAP_AT | 1 | `[..., x, ..., y]` → `[..., y, ..., x]` | Swap TOS with `n[n.length - 2 - K]`; push the old element from that depth. Effectively an indexed exchange useful for reordering without full shuffling. |
| 66 | CALL_GLOBAL | 1 | `[..., fn, arg1...argK]` → `[..., result]` | Pop K args, pop a function, push `fn.apply(U, args)` — call with `this` bound to the constant pool (i.e. `window` at top level). |
| 67 | MUL | 0 | `[..., a, b]` → `[..., a * b]` | Multiplication. |
| 68 | USHR | 0 | `[..., a, b]` → `[..., a >>> b]` | Unsigned right-shift. |

53 rows, matching the 53 non-null entries in `output/vm-slide/dispatch-table.json` (verified by counting non-null elements of the committed JSON fixture).

## Dispatch holes

The dispatch table `Q` is a 69-element sparse-array literal with 16 holes. These are not explicit `null` values in the source — they are gaps in the `[..., , func, , , func, ...]` literal that `JSON.stringify` and the Phase 39.1 decoder normalize to `null`. Whether any of them are reachable from the committed bytecode is unknown (Phase 40 task 40.1 will decide this once a control-flow-aware walker is in place).

The 16 hole indices (verified against `output/vm-slide/dispatch-table.json`):

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
- Slot 65: null — no handler in the source array literal (**halts the linear disassembler at pc=512**)

## Unresolved entries

No opcode in the table above required a `?NAME` fallback — all 53 handlers classify cleanly from their source bodies. However, two handlers have quirks that Phase 40 task 40.1 / task 40.3 will revisit using full-coverage disassembly as ground truth:

- **Opcode 58 (FUNC_CREATE) operand width.** The decoder reports `operandCount: 6` because it counts lexical `m[g++]` expressions in the handler body: 3 in the header (`K`, `A`, `C`) + 2 inside the first `for` loop body (`p[m[g++]] = n[m[g++]]`) + 1 inside the second `for` loop body. At runtime the first loop runs `A` times and the second runs `C` times, so the true instruction width is `3 + 2·A + C` bytes. Any linear disassembler that trusts the static count of 6 will mis-align at every `FUNC_CREATE` site. Phase 40 task 40.1 must upgrade the disassembler to special-case this handler.
- **Opcode 64 (SWAP_AT) naming.** The handler source is `var A = m[g++], C = n[n.length - 2 - A]; n[n.length - 2 - A] = n.pop(); n.push(C)`. The operation is unambiguous — it swaps TOS with an element at depth `2 + K` and places the displaced element on top — but the intent is less clear without seeing it in real bytecode contexts. Candidate interpretations include stack-slot rotate for multi-return handling, re-ordering of function-call argument stacks before an `apply`, or internal assembler hygiene for loops. The name `SWAP_AT` describes the mechanics; Phase 40 task 40.3 should observe real call sites and either confirm or rename it.

## Cross-references

- `docs/VM_SLIDE_ARCHITECTURE.md` — register file, dispatch loop, exception model, bytecode format, return protocol, and open cross-track findings.
- `docs/OPCODE_REFERENCE.md` — opcode table for the register-based `tdc.js` ChaosVM (the different-variant counterpart to this doc).
- `docs/VM_ARCHITECTURE.md` — architecture reference for the register-based `tdc.js` ChaosVM.
- `docs/CRYPTO_ANALYSIS.md` — XTEA round constants and key-derivation details; relevant to the vm-slide `0x9E3779B9` finding (Phase 40 task 40.6).
- `research/vm-slide-stack-vm/` — source artifacts for Phase 39 (decoder, disassembler, tests).
- `output/vm-slide/dispatch-table.json` — raw handler source for all 69 dispatch slots (the primary input for this document).
- `output/vm-slide/bytecode.json` — 24,273-element bytecode array extracted from `sample/vm_slide.js`.
- `output/vm-slide/disassembly.txt` — current 312-instruction linear disassembly output (halts at pc=512).
