# vm-slide Stack VM Architecture Reference

## Overview

`sample/vm_slide.js` is a stack-based ChaosVM variant (the `__TENCENT_CHAOS_STACK` global) used by Tencent's slide CAPTCHA. It is a **different VM** from the register-based `tdc.js` ChaosVM documented in `docs/VM_ARCHITECTURE.md`: instead of a switch-dispatched register machine, it is a table-dispatched stack machine with an explicit operand stack, a small dispatch table (69 slots), and an exception-history stack.

This is a **first-pass reference based on Phase 39 source inspection**. The linear disassembler in `research/vm-slide-stack-vm/disassembler.js` currently decodes 312 instructions from pc=0 to pc=512 before halting on a legitimate dispatch-table hole (opcode 65 at pc=512), which is approximately **2% of the 24,273-element bytecode**. Full-coverage analysis requires a control-flow-aware walker and is deferred to **Phase 40 task 40.1**. The opcode semantics below are derived by reading all 53 non-null handler source strings committed in `output/vm-slide/dispatch-table.json`, so the semantic coverage of this doc is complete even where behavioral coverage (observed instruction decodings) is not.

## File layout

`sample/vm_slide.js` is a 43,688-byte single-line script. The top-level structure, verified by inspecting the file prefix and suffix, is:

```js
var __TENCENT_CHAOS_STACK = function () {
  function __TENCENT_CHAOS_VM(g, m, U, n, E, F, Y, c) {
    var A = !n;
    g = +g, m = m || [0], n = n || [[this], [{}]], E = E || {};
    var w, C = [], K = null;
    function p() { return function (A, C, K) { return new (Function.bind.apply(A, C)) }.apply(null, arguments) }
    Function.prototype.bind || (w = [].slice, Function.prototype.bind = function (A) { /* polyfill */ });
    var Q = [ /* 69 dispatch-table slots — 53 non-null handler functions, 16 sparse holes */ ];
    for (0; ;) try {
      for (var B = false; !B;) B = Q[m[g++]]();
      if (0, K) throw K;
      return A ? (n.pop(), n.slice(3 + __TENCENT_CHAOS_VM.v)) : n.pop();
    } catch (I) {
      0; var o = C.pop();
      if (o === undefined) throw I;
      K = I, g = o[0], n.length = o[1], o[2] && (n[o[2]][0] = K);
    }
  }
  return __TENCENT_CHAOS_VM(0, [ /* inline bytecode — 24,273 numeric elements */ ], window);
}();
__TENCENT_CHAOS_STACK.g = function () { return __TENCENT_CHAOS_STACK.shift()[0] };
```

Key anchors:

- **Dispatch table `Q`**: 69 slots, 53 non-null handlers, 16 sparse-array holes. Each non-null entry is a zero-argument function that reads operands via `m[g++]` and manipulates the operand stack `n`.
- **Inline bytecode**: the 2nd argument to the outer `__TENCENT_CHAOS_VM` invocation is a literal number array. The Phase 39.1 decoder (`research/vm-slide-stack-vm/decoder.js`) extracts 24,273 elements from this literal.
- **Outer invocation**: `__TENCENT_CHAOS_VM(0, [...bytecode...], window)` — pc starts at 0, constant pool is `window`, and all other arguments default inside the function.
- **Result helper**: `__TENCENT_CHAOS_STACK.g = function(){ return __TENCENT_CHAOS_STACK.shift()[0] }`. The VM invocation returns an array-like; callers pull one result at a time by shifting and unwrapping the single-cell pair.

## Register file

The VM's state is the set of named parameters and locals of `__TENCENT_CHAOS_VM`. Variable names are specific to this build; other `__TENCENT_CHAOS_STACK` builds will rename them, so identify each register by its **structural role** (what handlers read from it and write to it), not by name.

| Symbol in this build | Canonical role | Purpose |
|---|---|---|
| `g` | `pc` | Program counter; every handler that consumes operands advances pc via `m[g++]`; opcode 6 (JUMP) writes it directly |
| `m` | `bytecode` | Linear numeric array passed as the 2nd argument; opcodes and operands are interleaved and read through `m[g++]` |
| `U` | `constPool` | 3rd argument; in the top-level invocation this is `window`. Handlers 13, 32, and 66 read from it by string key |
| `n` | `opStack` | Operand stack; initialized to `[[this], [{}]]` when not supplied by caller. Every non-control handler manipulates `n` |
| `E` | `env` | Environment / closure scope; captured by `FUNC_CREATE` (opcode 58) and forwarded into nested `__TENCENT_CHAOS_VM` invocations. Defaults to `{}` |
| `C` | `catchStack` | Exception-handler stack; opcode 35 pushes `[catchPc, savedStackLen, exceptionSlot]` entries, opcode 49 pops one, and the outer `catch` consumes one on throw |
| `K` | `exception` | Current caught exception value; set by the outer `catch` clause, read by opcode 61, cleared by opcode 33 |

Helper locals `w`, `A`, and the closure `p()` are implementation details: `w` exists only for the `Function.prototype.bind` polyfill; `A` is a "is this the top-level invocation?" flag (`!n`); `p` is the `new`-with-args helper used by opcodes 25 and 55.

Extra parameters `F`, `Y`, and `c` are forwarded through to nested VM invocations by opcode 58 (FUNC_CREATE) but no handler in the 53-entry dispatch table reads from them in this build. They are pass-through slots whose purpose must be determined from callers outside this source file; do not speculate on their semantics.

## Operand stack semantics

The operand stack `n` is a plain JavaScript array. When the VM is invoked at top level, it is initialized to:

```js
n = [[this], [{}]]
```

Both initial entries are **single-cell arrays**, not bare values. This is a load-bearing invariant: handlers that produce **references to local slots** package them as single-element arrays (`[slot]`, see opcode 47), and the dereference handlers (0, 54, 63, 36, 24) consistently treat slot-indexed `n[i]` as if `n[i][0]` is the live value.

Stack access patterns observed in the 53 handlers:

- **Push** — `n.push(x)` (pushes one element)
- **Pop** — `n.pop()` (pops one element, returns it)
- **Peek** — `n[n.length - 1]` / `n[n.length - 2]` (read TOS or TOS-1 in place)
- **In-place mutate** — `n[n.length - 2] = n[n.length - 2] OP n.pop()` (binary ops write through TOS-1 and consume TOS)
- **Trim** — `n.length -= A` / `n.length = K` (discard a tail of the stack without individually popping)
- **Swap at depth** — opcode 64 swaps TOS with `n[n.length - 2 - K]`

Handler bodies never touch `n[i]` for `i < 2` directly except via the reference-pair handlers — slots 0 and 1 are the `[this]` and `[{}]` cells mentioned above and act as pseudo-registers for the outermost frame.

## Dispatch loop

The outer dispatch loop, quoted verbatim from `sample/vm_slide.js`:

```js
for (0; ;)
  try {
    for (var B = false; !B;) B = Q[m[g++]]();
    if (0, K) throw K;
    return A ? (n.pop(), n.slice(3 + __TENCENT_CHAOS_VM.v)) : n.pop();
  } catch (I) {
    0; var o = C.pop();
    if (o === undefined) throw I;
    K = I, g = o[0], n.length = o[1], o[2] && (n[o[2]][0] = K);
  }
```

Execution sequence:

1. **Inner loop**: read an opcode byte with `m[g++]`, invoke the handler `Q[opcode]()`, and continue as long as the handler returns a falsy value.
2. **Halt condition**: a handler returning truthy breaks the inner loop. Two handlers can do this:
   - Opcode 16 — unconditionally `return true` (RETURN).
   - Opcode 61 — `return !!K` (RETURN_IF_EXC) — breaks only when an exception is live.
3. **Post-loop rethrow**: `if (0, K) throw K;` — if an exception was latched into `K` (e.g. by a handler that copied the current exception value there), re-raise it into the outer try/catch.
4. **Return**: at the top-level invocation (`A === true` because no caller supplied `n`), the VM pops one value off the stack and returns a slice starting at `3 + __TENCENT_CHAOS_VM.v` — this is how the `__TENCENT_CHAOS_STACK.g` helper receives its result. Nested invocations return `n.pop()` directly.
5. **Exception path**: the `catch` clause pops one entry `o` off the catch stack `C`. Entries are 3-tuples `[catchPc, savedStackLen, exceptionSlot]` pushed by opcode 35. On a throw:
   - If `C` is empty, the exception propagates out of the VM.
   - Otherwise, `K` receives the caught value, `g` jumps to the saved pc, `n.length` is truncated to the saved stack depth, and if `exceptionSlot` is non-zero the caught value is stored into `n[exceptionSlot][0]` (so bytecode can `LOAD_LOCAL` it).

## Exception handling

Exception handling is split across four handlers and the outer try/catch:

| Handler | Source | Role |
|---|---|---|
| 35 | `C.push([m[g++], n.length, m[g++]])` | `TRY_PUSH` — register a catch frame with 2 operands: catch-pc and exception-store slot. `n.length` is captured live at push time. |
| 49 | `C.pop()` | `TRY_POP` — discard the most recent catch frame (end of `try` block with no throw). |
| 33 | `K = null` | `CLEAR_EXCEPTION` — clear the exception latch after handling. |
| 61 | `return !!K` | `RETURN_IF_EXC` — break the dispatch loop so the outer loop's `if (0, K) throw K` can re-raise a latched exception up the stack. |

The outer catch block quoted in the dispatch-loop section reads catch frames in push order and restores pc, stack depth, and optionally the exception slot.

No handler pushes onto `C` more than once per invocation, and no handler writes to `K` directly except opcode 33 (clear). The exception value arrives via the outer `catch` clause, not via a bytecode operation.

## Constant pool

The `U` register is the VM's constant pool. In the top-level invocation it is bound to `window`, so constant lookups are really global-object property lookups keyed by a string already on the operand stack. Three handlers touch `U`:

| Handler | Source | Effect |
|---|---|---|
| 13 | `n[n.length - 1] = U[n[n.length - 1]]` | `LOAD_GLOBAL` — replace TOS (a string key) with `window[key]`. |
| 32 | `n.push([U, n.pop()])` | `MAKE_GLOBAL_REF` — pop a key, push a `[window, key]` reference pair suitable for `DEREF` / `STORE_REF`. |
| 66 | `n.push(n.pop().apply(U, args))` | `CALL_GLOBAL` — apply a function with `this = window`. |

Using `window` as a constant pool works because every constant the VM references is either (a) a real global like `Date` or `navigator`, or (b) a property the loader attached to `window` before the VM started. Handlers never index `U` by integer — the stack always supplies a string or symbol.

## Return protocol

Top-level invocation returns a value via the operand stack:

```js
return A ? (n.pop(), n.slice(3 + __TENCENT_CHAOS_VM.v)) : n.pop();
```

When `A === true` (top-level), the VM pops one value and returns `n.slice(3 + __TENCENT_CHAOS_VM.v)` — a contiguous tail of the operand stack. The constant `__TENCENT_CHAOS_VM.v` is not assigned anywhere in the visible source; it is either left `undefined` (so `3 + undefined === NaN` and `slice(NaN)` yields the full array) or is patched in by an external loader. **This is an open question — it should be resolved during Phase 40 task 40.1 once full-coverage disassembly reveals how the VM consumes its own return value.**

The consumer reads results with:

```js
__TENCENT_CHAOS_STACK.g = function () { return __TENCENT_CHAOS_STACK.shift()[0] };
```

`.shift()[0]` pulls the first element of the returned array and unwraps its single-cell wrapper — matching the operand-stack convention that local slots are stored as 1-element arrays. In practice this means the VM's outputs are queued FIFO into `__TENCENT_CHAOS_STACK`, and each call to `__TENCENT_CHAOS_STACK.g()` consumes one.

This is a noticeably different contract from the register-based `tdc.js` VM (see `docs/VM_ARCHITECTURE.md`), which returns a single value directly from the entry-point function and has no FIFO result queue.

## Bytecode format

The bytecode is a flat JavaScript number array embedded as the 2nd argument of the outermost `__TENCENT_CHAOS_VM(0, [...], window)` call. Phase 39.1's decoder extracts **24,273 elements** (verified by `tests/test-vm-slide-decoder.js` and committed to `output/vm-slide/bytecode.json`), substantially larger than the register-based `tdc.js` VM's ~7K `Y[]` array.

Format properties:

- **PC-indexed**: the pc `g` is an integer index into the array. Opcode 6 (`g = m[g++]`) writes pc absolutely, so jumps are absolute positions into this same array.
- **Inline operands**: every handler reads its operands via additional `m[g++]` after the initial opcode read. Operand counts are `{0: 37 handlers, 1: 14 handlers, 2: 1 handler (TRY_PUSH), 6: 1 handler (FUNC_CREATE, variable)}`.
- **Non-integer operands allowed**: the bytecode contains exactly one `0.5` element (verified by inspecting `output/vm-slide/bytecode.json` near the tail). No handler in the 53-entry table coerces operands to integers, so non-integer constants are legal and are passed through verbatim by `PUSH_K` / `PUSH_CHAR` / similar.
- **No stored opcode shuffle**: unlike `tdc.js` templates, where opcode numbering rotates between builds (see `docs/VERSION_DIFFERENCES.md`), the vm-slide dispatch table is a fixed literal inside the VM source. Porting across vm-slide builds would require re-parsing the dispatch-table literal, not an opcode-shuffle map.

## Observed coverage and limitations

**The current linear disassembler decodes 312 instructions from pc=0 to pc=512 before halting on a dispatch-table hole (opcode 65 is null).** This is approximately 2% of the 24,273-element bytecode. The remaining 98% is either reachable only via control-flow paths the linear walker does not follow (jumps like `OP_06 1568` at pc=4 target absolute addresses far from the linear frontier, exception unwinding through the catch stack, embedded data regions dereferenced as operands but never executed), or legitimately unreachable. **Full-coverage analysis is deferred to Phase 40 task 40.1 (control-flow-aware disassembler upgrade).**

Specific consequences of the 2% coverage limit for this document:

- Opcode semantics are classified from **handler source strings** (complete, all 53 non-null slots covered). This is static and does not depend on disassembler reach.
- Stack-effect descriptions are derived from the handler body alone, not from observed run-time stack shapes. Where a handler's stack effect depends on a captured operand value (opcodes 2, 25, 40, 55, 58, 66), the description cites the operand without speculating on typical values.
- **No control-flow claims are made about the bytecode as a whole** — we do not yet know how many basic blocks, functions, or exception regions the full bytecode contains, only that the first 513 elements hold 312 decodable instructions plus one null-handler hole.
- The 16 dispatch holes are documented below, but whether they are ever referenced by any opcode anywhere in the bytecode cannot be determined until Phase 40 task 40.1 completes.

## Unresolved findings

- **Opcode 58 (FUNC_CREATE) is variable-length.** Its source reads three header operands (`K` = start-pc, `A` = capture-count, `C` = argmap-count), then `2*A` operands for the captured-slot pairs, then `C` operands for the argmap. The decoder reports a static operand count of 6 because there are six literal `m[g++]` expressions in the handler body, but the true instruction width at runtime is `3 + 2A + C` bytes. The linear disassembler must be taught this shape in Phase 40 task 40.1.
- **The XTEA round constant `0x9E3779B9` (decimal `2654435769`) appears exactly twice in the bytecode — confirmed classical XTEA (Phase 40 task 40.6).** Verified by counting occurrences in `output/vm-slide/bytecode.json`. Both occurrences live inside `PUSH_K` (opcode 8) immediate operands at bytecode indices `15353` and `15531`, each inside a distinct function: **encrypt** (entry PC `15241`) and **decrypt** (entry PC `15416`). Both functions implement the full classical-XTEA round structure — 32 iterations bounded by `sum == 32*delta` (`PUSH_K 84941944608` at PC `15284` and `15454`), shifts by 4 and 5 (`PUSH_K 4; SHL` / `PUSH_K 5; USHR`), bitwise XOR, key indexing via `sum & 3` and `(sum >>> 11) & 3`, a `[v0, v1]` block read from local slot 3 as the first argument, and a key array read from local slot 4 as the second argument. Encrypt uses `ADD` for `sum += delta` and `v += ...`; decrypt mirrors it with `SUB` and `sum -= delta`, matching the classical XTEA decrypt inverse. The backward JUMPs closing the loops are `15377 → 15284` (encrypt) and `15552 → 15459` (decrypt). Both closures are created by an outer factory function at entry PC `15220`, which stores them as locals and is itself instantiated by a CommonJS-style module bootstrap routine near PC `16835` (`FUNC_CREATE 15220 0 3 3 4 5`, three arguments). **The cipher is classical XTEA, not the register-VM's modified XTEA** — the round math is the vanilla form from Needham & Wheeler, and the key is passed in as an argument rather than derived from a per-template STATE_A. The actual payload per call is whatever the module caller supplies as argument 1 (a 2-element `[v0, v1]` 64-bit block); pinning the real-world callers (is it `eks`? is it the verify-POST body?) requires tracing the module-export keys or runtime instrumentation, and is left as follow-up work. See `research/vm-slide-stack-vm/xtea-hunt.js` for the reproducible analysis and the semantic disassembly windows around both deltas.
- **One bytecode element is `0.5`.** Located near the tail of the literal. No handler integer-coerces operands, so this is legal, but why the VM would push a half is unclear — candidates include a Math.pow/Math.sqrt argument, a progress-bar coordinate, or a slide-puzzle interpolation constant. Full-coverage disassembly in Phase 40 task 40.1 will show which opcode reads it.
- **The 16 dispatch-table holes** — indices `[9, 14, 18, 19, 22, 26, 27, 29, 30, 34, 43, 44, 48, 53, 57, 65]` — are sparse-array gaps in the `Q = [...]` literal, not `null` values. It is unknown whether any of them are referenced by the bytecode; if they are, the VM will throw `TypeError: Q[op] is not a function` and the catch stack will handle it. Opcode 65 at pc=512 is where the linear disassembler halts, which proves at least one hole is reachable. The others remain untested.
- **The `__TENCENT_CHAOS_VM.v` return-slice constant** is never assigned in visible source (see "Return protocol" above). Whether this is deliberate (so `slice(NaN)` yields the whole array) or patched at load time is unresolved.
- **Pass-through parameters `F`, `Y`, `c`** are forwarded by opcode 58 to nested invocations but never read by any of the 53 handlers in this build. They may be slots reserved for future opcodes, or they may be consumed by opcodes in dispatch holes that aren't populated in this particular VM instance.

## Differences from the register-based `tdc.js` VM

A side-by-side comparison will live in the future `docs/CHAOSVM_VARIANTS.md` (Phase 39 task 39.4, not yet written). At a glance:

| Axis | `tdc.js` (register) | `vm-slide` (stack) |
|---|---|---|
| Execution model | Register file `i[]` addressed by index operands | Operand stack `n[]` with push/pop/peek/in-place mutate |
| Dispatch | `switch(Y[++C])` with 95 explicit `case` clauses | Table lookup `Q[m[g++]]()` over 69 slots (53 non-null) |
| Operand width | Fully inline after opcode, varies per opcode | Fully inline after opcode; one variable-length handler (opcode 58) |
| Exception stack | `F[]` — addresses only; `G` holds caught value | `C[]` — 3-tuples `[catchPc, savedLen, exceptionSlot]`; `K` holds caught value |
| Return | Entry point returns a single value directly | Returns a stack slice; consumer reads via `__TENCENT_CHAOS_STACK.g = function(){ return __TENCENT_CHAOS_STACK.shift()[0] }` FIFO helper |
| Bytecode size | ~7K elements (`tdc.js` Template A: 7,200 ish) | 24,273 elements |
| Operand types | Integers only (decoded through varint + zigzag) | Integers, and at least one non-integer (`0.5`) |
| Opcode shuffling across builds | Confirmed, template-specific | Unknown; dispatch table is a source-level literal, not an encoded map |

See `docs/VM_ARCHITECTURE.md` for the register VM and `docs/VM_SLIDE_OPCODES.md` for the vm-slide opcode table.
