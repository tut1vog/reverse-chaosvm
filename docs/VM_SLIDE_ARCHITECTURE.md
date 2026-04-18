# vm-slide Stack VM Architecture Reference

## Overview

The vm-slide build the research scripts were run against is a stack-based ChaosVM variant (the `__TENCENT_CHAOS_STACK` global) used by Tencent's slide CAPTCHA. It is a **different VM** from the register-based `tdc.js` ChaosVM documented in `docs/VM_ARCHITECTURE.md`: instead of a switch-dispatched register machine, it is a table-dispatched stack machine with an explicit operand stack, a small dispatch table (69 slots), and an exception-history stack.

This document reflects analysis of that vm-slide build. First-pass source classification of all 53 non-null handler source strings has been validated by a control-flow-aware walker (`research/vm-slide-stack-vm/walker.js`) that decodes **14,134 instructions across 101 distinct function entries** with zero unreached bytecode bytes — the visited range `[0, 24273)` is fully covered, with 58.2% of bytes being instruction starts and the remainder being operand bytes of visited instructions. A cross-track investigation (`research/vm-slide-stack-vm/xtea-hunt.js`) confirmed the presence of **classical XTEA encrypt and decrypt closures** inside the bytecode at entry PCs `15241` and `15416`, both instantiated by an outer factory at entry PC `15220`. The earlier linear disassembler's pc=512 halt is now understood to have been caused entirely by `FUNC_CREATE` mis-parse, not by reaching a legitimate dispatch-table hole.

## File layout

The vm-slide source is a 43,688-byte single-line script. The top-level structure, verified by inspecting the file prefix and suffix, is:

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
- **Inline bytecode**: the 2nd argument to the outer `__TENCENT_CHAOS_VM` invocation is a literal number array. The decoder (`research/vm-slide-stack-vm/decoder.js`) extracts 24,273 elements from this literal.
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

The outer dispatch loop, quoted verbatim from the vm-slide source:

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
   - Opcode 16 — unconditionally `return true` (VM_EXIT, walker-verified terminator: returns truthy from every reachable call site and exits the outer `for(;!B;)` loop).
   - Opcode 61 — `return !!K` (RETURN_IF_EXC) — context-dependent terminator that breaks only when the exception latch `K` is non-null. The walker deliberately treats it as fall-through during static analysis because static reasoning cannot decide whether `K` is set.
3. **Post-loop rethrow**: `if (0, K) throw K;` — if an exception was latched into `K` (e.g. by a handler that copied the current exception value there), re-raise it into the outer try/catch.
4. **Return**: at the top-level invocation (`A === true` because no caller supplied `n`), the VM pops one value off the stack and returns a slice starting at `3 + __TENCENT_CHAOS_VM.v` — this is how the `__TENCENT_CHAOS_STACK.g` helper receives its result. Nested invocations return `n.pop()` directly.
5. **Exception path**: the `catch` clause pops one entry `o` off the catch stack `C`. Entries are 3-tuples `[catchPc, savedStackLen, exceptionSlot]` pushed by opcode 35. On a throw:
   - If `C` is empty, the exception propagates out of the VM.
   - Otherwise, `K` receives the caught value, `g` jumps to the saved pc, `n.length` is truncated to the saved stack depth, and if `exceptionSlot` is non-zero the caught value is stored into `n[exceptionSlot][0]` (so bytecode can `LOAD_LOCAL` it).

### Control-flow opcodes

The Phase 40.1 walker audited every handler body and identified the following five opcodes as control-flow-relevant. Every other handler is a straight-line fall-through. This enumeration is the basis for the walker's reachability analysis:

| Opcode | Role | Handler body | Walker treatment |
|---|---|---|---|
| 6 `JUMP` | Unconditional branch, terminator | `function(){g=m[g++]}` | Terminator; enqueue operand 0 as a branch target. |
| 16 `VM_EXIT` | Unconditional dispatch-loop exit | `function(){return!0}` | Terminator; exits the `for(;!B;) B=Q[m[g++]]()` inner loop by returning truthy. |
| 35 `TRY_PUSH` | Implicit branch (catch edge) | `function(){C.push([m[g++],n.length,m[g++]])}` | Not a direct branch in source, but the outer VM's `catch(I){...g=o[0]}` reaches the catch PC (operand 0) only via the exception path. Walker enqueues operand 0 as an implicit branch target. |
| 58 `FUNC_CREATE` | Nested VM invocation (closure) | variable-width, `3 + 2·A + C` operand bytes | Instantiates a nested `__TENCENT_CHAOS_VM` invocation at entry PC `K`. Walker enqueues `K` as a new function entry and advances past the variable-width operand tail. |
| 60 `JUMP_IF_TRUE` | Conditional branch (no pop) | `function(){var A=m[g++];n[n.length-1]&&(g=A)}` | Two-way; enqueue both operand 0 (taken) and fall-through. TOS is left in place. |

Across the entire 14,134-instruction walk, the walker hit **zero dispatch-table holes**. The 16 holes at slots `[9, 14, 18, 19, 22, 26, 27, 29, 30, 34, 43, 44, 48, 53, 57, 65]` are unreached by any code path in this vm-slide build.

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

**Implicit branches through `TRY_PUSH`**: although opcode 35 has no direct `g = ...` assignment in its handler body, its first operand (`catchPc`) is an edge from the VM's control-flow perspective — it is the only way the outer VM reaches the catch-block PC. The Phase 40.1 walker models this by enqueueing operand 0 of every `TRY_PUSH` as a branch target alongside the fall-through. Without this modeling, catch blocks would appear unreachable in the reachability graph.

**Opcode 61's context-dependent terminator**: `return !!K` only breaks the dispatch loop when the exception latch is non-null. Whether this fires at a given call site is a runtime property that static analysis cannot resolve, so the walker conservatively treats opcode 61 as fall-through. This keeps the walker sound — it may over-visit bytecode after a `RETURN_IF_EXC` that never actually falls through, but it will never miss reachable code.

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

When `A === true` (top-level), the VM pops one value and returns `n.slice(3 + __TENCENT_CHAOS_VM.v)` — a contiguous tail of the operand stack. The constant `__TENCENT_CHAOS_VM.v` is not assigned anywhere in the visible source; it is either left `undefined` (so `3 + undefined === NaN` and `slice(NaN)` yields the full array) or is patched in by an external loader. This remains an open question — see "Unresolved findings" below.

The consumer reads results with:

```js
__TENCENT_CHAOS_STACK.g = function () { return __TENCENT_CHAOS_STACK.shift()[0] };
```

`.shift()[0]` pulls the first element of the returned array and unwraps its single-cell wrapper — matching the operand-stack convention that local slots are stored as 1-element arrays. In practice this means the VM's outputs are queued FIFO into `__TENCENT_CHAOS_STACK`, and each call to `__TENCENT_CHAOS_STACK.g()` consumes one.

This is a noticeably different contract from the register-based `tdc.js` VM (see `docs/VM_ARCHITECTURE.md`), which returns a single value directly from the entry-point function and has no FIFO result queue.

## Bytecode format

The bytecode is a flat JavaScript number array embedded as the 2nd argument of the outermost `__TENCENT_CHAOS_VM(0, [...], window)` call. The decoder extracts **24,273 elements** (verified by `tests/test-vm-slide-decoder.js` against the committed bytecode fixture), substantially larger than the register-based `tdc.js` VM's ~7K `Y[]` array.

Format properties:

- **PC-indexed**: the pc `g` is an integer index into the array. Opcode 6 (`g = m[g++]`) writes pc absolutely, so jumps are absolute positions into this same array.
- **Inline operands**: every handler reads its operands via additional `m[g++]` after the initial opcode read. Operand counts are `{0: 37 handlers, 1: 14 handlers, 2: 1 handler (TRY_PUSH), 6: 1 handler (FUNC_CREATE, variable)}`.
- **Non-integer operands allowed**: the bytecode contains exactly one `0.5` element (verified by inspecting the decoded bytecode near the tail). No handler in the 53-entry table coerces operands to integers, so non-integer constants are legal and are passed through verbatim by `PUSH_K` / `PUSH_CHAR` / similar.
- **No stored opcode shuffle**: unlike `tdc.js` templates, where opcode numbering rotates between builds (see `docs/VERSION_DIFFERENCES.md`), the vm-slide dispatch table is a fixed literal inside the VM source. Porting across vm-slide builds would require re-parsing the dispatch-table literal, not an opcode-shuffle map.

## Observed coverage and limitations

**Behavioral coverage is now effectively complete for this vm-slide build.** The control-flow-aware walker (`research/vm-slide-stack-vm/walker.js`) decodes **14,134 instructions across 101 distinct function entries** — a 45.3× increase over the earlier linear disassembler's 312 instructions. Walker output is 14,486 lines of disassembly.

Key coverage facts:

- **Visited range `[0, 24273)`** — every byte of the 24,273-element bytecode is either an instruction start or an operand byte of a visited instruction. No dead regions remain.
- **58.2% of bytes are instruction starts**; the remaining 42% are operand bytes of visited instructions.
- **101 distinct function entries** — entry PC 0 plus 100 unique `K` values across 128 `FUNC_CREATE` sites (some factories share start PCs).
- **Zero dispatch-hole hits** across the whole walk. The 16 dispatch holes at slots `[9, 14, 18, 19, 22, 26, 27, 29, 30, 34, 43, 44, 48, 53, 57, 65]` are confirmed unreached in this vm-slide build. The Phase 39.1 pc=512 halt was caused entirely by `FUNC_CREATE` variable-width mis-parse, not by the linear walker legitimately reaching hole 65.
- **Opcode classifications validated**: every non-null handler has been observed firing at least once across the 14,134-instruction walk, so Phase 39.3's source-only classifications are now behaviorally grounded.

The honest remaining limitation is **module-export indirection**: static analysis cannot identify which real-world values are supplied as arguments to the XTEA factory (see "XTEA factory and closures" below), because the closures are stored into module exports and invoked indirectly through Tencent's CommonJS-style module system. Pinning the real-world callers requires runtime instrumentation or coordinated analysis with the `captcha-orchestrator` research track plus follow-up work on `eks` derivation.

## XTEA factory and closures

The Phase 40.6 cross-track investigation (`research/vm-slide-stack-vm/xtea-hunt.js`) identified a pair of classical-XTEA cipher closures embedded in the bytecode. They are created together by a single outer factory function:

- **Outer factory — entry PC `15220`.** Instantiated by a `FUNC_CREATE 15220 0 3 3 4 5` near PC `16835` from within a CommonJS-style `__esModule` module bootstrap routine. Takes **3 arguments** bound into local slots 3, 4, and 5. Local slot 4 holds the XTEA key material per the 40.6 disassembly windows; the other two slots have not been resolved statically.
- **Encrypt closure — entry PC `15241`.** Created by `FUNC_CREATE` at PC `15404` inside the factory body. Loop head at PC `15284`; 32-round loop bound is the `PUSH_K 84941944608` at PC `15284` (decimal `84941944608 = 32·0x9E3779B9`). Uses `ADD` for `sum += delta` and `v += ...`. Backward `JUMP 15284` at PC `15377` closes the loop. The delta `0x9E3779B9` (decimal `2654435769`) appears as the `PUSH_K` operand at bytecode index `15353`.
- **Decrypt closure — entry PC `15416`.** Created by `FUNC_CREATE` at PC `15579` inside the factory body. Loop head at PC `15459`; same `PUSH_K 84941944608` loop bound. Uses `SUB` for `sum -= delta` — the classical XTEA decrypt inverse. Backward `JUMP 15459` at PC `15552` closes the loop. The delta appears as the `PUSH_K` operand at bytecode index `15531`.

Both closures implement the **vanilla XTEA round** from Needham & Wheeler — shifts by 4 and 5, bitwise XOR, `sum & 3` and `(sum >>> 11) & 3` key indices, 32 iterations. The cipher is **classical XTEA, not the register-VM's modified variant**: see the "Differences from the register-based `tdc.js` VM" section below and `docs/CRYPTO_ANALYSIS.md`. The key is an argument to the factory rather than derived from a per-template STATE_A, so the register VM's cross-template key-modification findings do not apply to vm-slide.

The presence of both encrypt and decrypt strongly suggests vm-slide handles a round-trip cipher — the most likely use is `eks`-payload decryption on incoming data and verify-body encryption on outbound, but the module-export indirection described above prevents static pinning of the real-world callers. This is a natural handoff to the `captcha-orchestrator` research track and to future work on `eks` derivation.

See `research/vm-slide-stack-vm/xtea-hunt.js` for the reproducible analysis and the semantic disassembly windows around both closures.

## Unresolved findings

### Resolved in Phase 40

- **Opcode 58 (FUNC_CREATE) variable-length width** — resolved in Phase 40.1. The walker correctly decodes `FUNC_CREATE` as `3 + 2·A + C` runtime bytes and enqueues the entry PC `K` as a new function. The static `operandCount: 6` reported by the decoder was a lexical count of `m[g++]` expressions; the walker special-cases the two inline `for` loops. Phase 40.6 then confirmed `FUNC_CREATE` is the mechanism that instantiates the XTEA closures at runtime.
- **XTEA cipher presence and form** — resolved in Phase 40.6. The XTEA delta `0x9E3779B9` appears exactly twice in the bytecode, at indices `15353` and `15531`, both as `PUSH_K` operands. They anchor classical XTEA encrypt and decrypt closures (entry PCs `15241` and `15416`) created by a shared outer factory at entry PC `15220`. See "XTEA factory and closures" above.

### Still open

- **Real-world XTEA caller arguments.** The outer factory takes 3 arguments, and the closures it creates are stored into module exports. The actual inputs supplied by the real-world caller — key material, plaintext/ciphertext blocks, invocation order — cannot be resolved statically because of CommonJS-style module-export indirection through Tencent's loader. Pinning callers requires runtime instrumentation, or coordinated analysis with the `captcha-orchestrator` research track plus follow-up work on `eks` derivation.
- **Shared compiler backend across register VM and stack VM.** Whether `tdc.js` (register) and `vm-slide` (stack) share a common upstream bytecode compiler or are independent codegens remains an open question with no active task.
- **One bytecode element is `0.5`.** Located near the tail of the literal. No handler integer-coerces operands, so this is legal, but why the VM would push a half remains unexplained. Candidates include a Math argument, a coordinate, or a slide-puzzle interpolation constant. No active task.
- **Whether the 16 dispatch holes become reachable in any other vm-slide build.** Confirmed unreached in this build by the Phase 40.1 walker, but Tencent can ship a different vm-slide build that populates (or references) those slots.
- **The `__TENCENT_CHAOS_VM.v` return-slice constant** is never assigned in visible source (see "Return protocol" above). Whether this is deliberate (so `slice(NaN)` yields the whole array) or patched at load time remains unresolved.
- **Pass-through parameters `F`, `Y`, `c`** are forwarded by opcode 58 to nested invocations but never read by any of the 53 handlers in this build. They may be slots reserved for other vm-slide builds or consumed by opcodes in dispatch holes that aren't populated here.

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
| XTEA variant | Modified XTEA with per-template STATE_A key derivation via `keyModConstants` | **Classical XTEA** (Needham & Wheeler), key passed in as a factory argument |
| Cipher direction(s) present | Encrypt only (token generation) | **Both encrypt and decrypt** — `eks` round-trip hypothesis, see "XTEA factory and closures" |

The classical-vs-modified XTEA distinction is important for future porting work: the register VM's `keyModConstants` story does **not** apply to vm-slide. vm-slide's key is whatever the factory caller supplies.

See `docs/VM_ARCHITECTURE.md` for the register VM and `docs/VM_SLIDE_OPCODES.md` for the vm-slide opcode table.
