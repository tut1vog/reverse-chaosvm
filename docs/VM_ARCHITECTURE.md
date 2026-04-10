# ChaosVM Architecture Reference

## Overview

`tdc.js` is a Tencent ChaosVM (JSVMP — JavaScript Virtual Machine Protection) protected script. It implements a custom bytecode interpreter that executes obfuscated instructions instead of plain JavaScript. The file is 586 lines and consists of three major sections.

## File Structure

### Section 1: Polyfills (Lines 1–113)

Compatibility shims for older environments:

| Lines | Purpose |
|-------|---------|
| 1 | `window.TDC_NAME` — global identifier for this TDC instance |
| 3–8 | `clampInt8(value)` — clamps to signed 8-bit integer range [-128, 127] |
| 9–21 | `String.prototype.includes` polyfill |
| 22–38 | `Array.prototype.includes` polyfill |
| 39–113 | `Int8Array` polyfill (full implementation with `set`, `subarray`, `slice`) |

### Section 2: Global Hooks (Lines 115–122)

```js
window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = function() { return new Date() }
window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = function(a, b) { return Date[a].apply(Date, b) }
```

These are **external helper functions** the VM bytecode calls to interact with the `Date` API. The VM dispatches to them by name from within bytecode execution.

### Section 3: The VM (Lines 123–585)

The `window.FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` variable holds the **base64-encoded bytecode payload** (line 123). This appears to be a secondary/config bytecode.

The `__TENCENT_CHAOS_VM` function (lines 124–585) is the VM factory. It returns a function that accepts a bytecode string and executes it.

Line 586 invokes the VM with the **main bytecode payload**.

## VM Internals

### Bytecode Encoding Pipeline

```
Base64 string
  → Y(A): base64 decode to byte array
    → J(A): varint + zigzag decode to integer array
      → Y[] (the opcode+operand stream)
```

#### Step 1: Base64 Decode — `Y(A)` (lines 136–145)

Standard base64 decode using alphabet `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=`. The lookup table `E` (line 135) maps character codes to 6-bit values. Returns an array of bytes (0–255).

#### Step 2: ZigZag-Varint Decode — `J(A)` (lines 149–184)

Converts the byte array into a signed integer array using:
- **Variable-length encoding**: Each byte uses 7 data bits + 1 continuation bit (MSB). If MSB is 0 (byte ≥ 0 as signed Int8), the value is complete. Up to 5 bytes per integer.
- **ZigZag encoding** via `S(A)`: `A >> 1 ^ -(1 & A)` — maps unsigned integers to signed (0→0, 1→-1, 2→1, 3→-2, ...).

The decoded integer array `Y[]` is the **bytecode stream** — a flat array of opcodes and inline operands.

### Base64 Lookup Table Construction

The lookup table `E` is built by `g(A, B, g)` (lines 127–134):

```js
var E = g(0, 43, 0)          // 43 zeros (chars 0-42)
  .concat([62, 0, 62, 0, 63]) // '+' → 62, '/' → 63
  .concat(g(51, 10, 1))       // '0'-'9' → 52-61
  .concat(g(0, 8, 0))         // 8 zeros (padding)
  .concat(g(0, 25, 1))        // 'A'-'Z' → 0-25 (but offset, actually 1-25)
  .concat([0, 0, 0, 0, 63, 0])
  .concat(g(25, 26, 1));      // 'a'-'z' → 26-51 (but offset, 26-51)
```

Note: The `g` function generates arithmetic sequences: `g(start, count, step)` → `[start+step, start+2*step, ...]`. This is a compact way to build the base64 index lookup.

### VM Execution Engine

The core interpreter is the `J` function (lines 189–582), which is a **closure-based recursive VM**.

#### Function Signature

```js
J(g, E, S, m, I)
```

| Param | Purpose |
|-------|---------|
| `g` | Starting program counter (index into `Y[]`) |
| `E` | Closure variables array (captured from parent scope) |
| `S` | Outer scope reference (scope chain) |
| `m` | Module/global reference |
| `I` | Error handler function |

#### VM Registers / State

The returned inner function `o()` sets up:

```js
var i = [S, m, E, this, arguments, o, Y, 0];
//   0  1  2   3      4        5  6  7
```

| Index | Name | Purpose |
|-------|------|---------|
| `i[0]` | S | Outer scope |
| `i[1]` | m | Module/global reference |
| `i[2]` | E | Closure variables |
| `i[3]` | this | `this` binding of current call |
| `i[4]` | arguments | Arguments of current call |
| `i[5]` | o | Self-reference (for recursion) |
| `i[6]` | Y | Bytecode array (full stream) |
| `i[7]` | 0 | General-purpose (initialized to 0) |

Additional local state:
- `C` — **Program Counter** (index into `Y[]`)
- `Q` — **`this` context** for method calls (`undefined` initially)
- `F` — **Exception handler stack** (array of PC addresses to jump to on catch)
- `G` — **Caught exception value** (set in the catch block)
- `h`, `w`, `K` — Temporary variables for multi-step opcodes

#### Register File

`i[]` serves as an **expandable register file**. Opcodes address registers by index from the bytecode stream: `i[Y[++C]]`. Registers 0–7 are pre-initialized; higher indices are allocated dynamically as needed during execution.

### Dispatch Loop

```js
while (true) {
    switch (Y[++C]) {   // read opcode, advance PC
        case 0: ...      // each case is one opcode
        case 1: ...
        ...
        case 94: ...
    }
}
```

- **95 opcodes** (0–94)
- Operands are **inline** — read from `Y[]` via `Y[++C]` after the opcode
- Some opcodes are **compound** (multiple operations fused into one case for obfuscation)

### Exception Handling

```js
} catch (g) {
    if (F.length > 0) { B = C; A = [] }
    G = g;                    // store exception
    A.push(C);                // record PC for stack trace
    if (0 === F.length) {
        throw I ? I(g, i, A) : g   // no handler → rethrow (or call error handler)
    }
    C = F.pop();              // jump to handler address
    A.pop()
}
```

- `F[]` is the **try-catch stack**: opcodes push handler addresses onto it
- On exception: `G = caught_value`, then `C = F.pop()` to jump to handler
- If `F` is empty: rethrow (or invoke `I` error handler with exception + register state + PC trace)
- `A[]` and `B` track exception history (for debugging/anti-tamper)

### Function Creation

The VM creates closures via `J(...)` called within opcodes 12, 23, and 55:

1. Build a `h[]` array of captured variables from current registers
2. Call `J(C + offset, h, S, m, I)` — creates a new VM function starting at relative PC
3. Set the function's `.length` property via `Object.defineProperty` (to match expected arity)

Each created closure is itself a VM-executed function — when called, it enters the same dispatch loop at its own starting PC.

### Entry Point

The last line (586) invokes the VM:
```js
__TENCENT_CHAOS_VM("rgEUzvYH6JEI...")
```

The factory:
1. Decodes the base64 string into integer array `Y[]`
2. Creates the interpreter `J` bound to this bytecode
3. Line 583: `return E ? S : J` — if closure vars `E` were passed, return `S` (scope); otherwise return `J` (the callable function)

For the top-level call, `E` is undefined, so `J` is returned. `J` is then immediately invoked (the bytecode string is the argument to the factory, not to `J`). Actually — looking more carefully: the factory function returned by `__TENCENT_CHAOS_VM` is a function `g(g, E)` (line 186) that takes a bytecode string and optional closures. The call on line 586 passes the main bytecode, which triggers `J` to be built and the initial `o()` function to be returned/called.

## Key Observations for Decompilation

1. **Register-based VM**: Not a stack machine. Operands are register indices.
2. **Inline operands**: No separate operand decoding — everything is in the flat `Y[]` array.
3. **Variable-width instructions**: Each opcode consumes a different number of `Y[++C]` reads.
4. **Compound opcodes**: Many cases perform 2–3 operations (e.g., property access + string build + assignment). This is likely an obfuscation technique to increase instruction diversity.
5. **Closures as bytecode offsets**: Function creation uses relative offsets into the same bytecode array.
6. **No explicit stack**: Uses `F[]` only for exception handler addresses, not for operands.
7. **String building**: Strings are built character-by-character using `String.fromCharCode(Y[++C])` across multiple opcodes (31, 67, 19, etc.).
8. **`Q` (this) management**: Several opcodes implicitly use `Q` for `.call(Q, ...)` patterns. Tracking `Q` is critical for decompilation.
9. **Two bytecode payloads**: The short one on line 123 and the main one on line 586.
10. **Anti-debug**: The `I` error handler and `A[]` PC trace suggest anti-tampering capabilities.

## Webpack-Like Module System (Discovered in Phase 4–5)

The bytecode implements a **webpack-compatible module system** that organizes the program into 80 independently-loadable collector modules.

### Module Loader Architecture

- **func_164 (orchestrator)**: Sets up the module loader object with standard webpack properties:
  - `m` — module definitions (the array of 80 collector functions)
  - `c` — module cache (loaded modules are cached by index)
  - `d` — `defineProperty` helper for exports
  - `r` — marks module as ES module (`__esModule = true`)
  - `t` — module wrapper (creates fake namespace objects)
  - `n` — `getDefaultExport` helper
  - `o` — `hasOwnProperty` check
  - `p` — public path (empty string)
  - `s` — entry module index

- **func_198 (`__webpack_require__`)**: The core require function:
  1. Checks if module is in cache (`c[moduleId]`) — if so, returns `cache.exports`
  2. Creates a new module object: `{ i: moduleId, l: false, exports: {} }`
  3. Calls the module function: `modules[moduleId].call(module.exports, module, module.exports, __webpack_require__)`
  4. Marks module as loaded: `module.l = true`
  5. Returns `module.exports`

### Module Initialization Flow

1. **func_0 (entry point)** creates an array `r8[]` containing 80 collector module functions
2. Each module function is a closure created by FUNC_CREATE opcodes in the bytecode
3. func_0 passes the module array to **func_164**, which wires up the loader
4. func_164 calls `__webpack_require__(entryModuleIndex)` to boot the application
5. The entry module (func_53) sets up the TDC public API

## Collector Module Pattern (Discovered in Phase 5)

Each of the 80 collector modules follows a consistent pattern:

```javascript
// Module N — wrapped in try/catch for resilience
function module_N(module, exports, __webpack_require__) {
  try {
    // Collect one category of fingerprint data
    var result = /* ... fingerprinting logic ... */;
    module.exports = result;
  } catch (e) {
    // Silently catch errors — individual collector failures
    // don't crash the overall fingerprinting process
    module.exports = null;  // or default value
  }
}
```

**Key characteristics**:
- Every collector is wrapped in try/catch — a single collector failure doesn't prevent other fingerprints from being collected
- Collectors are independent and can execute in any order
- Each collector typically accesses one browser API (canvas, WebGL, audio, etc.)
- Results are aggregated by the orchestrator into a combined fingerprint object
- 144 try-catch blocks were identified across 66 functions — the majority are collector wrappers

## TDC Public API (Discovered in Phase 5)

**func_53** (the TDC initialization module) exposes four methods on `window.TDC`:

| Method | Purpose |
|--------|---------|
| `TDC.getInfo()` | Returns the collected fingerprint data as an encoded string. This is the primary output — it aggregates all 80 collector results, serializes them, and likely encrypts/encodes the result for transmission to `captcha.gtimg.com`. |
| `TDC.setData(data)` | Accepts configuration data from the captcha system (e.g., challenge parameters, session tokens). Called before `getInfo()` to provide context for the fingerprint collection. |
| `TDC.clearTc()` | Clears previously collected fingerprint data and resets internal state. Used between captcha challenges or page navigations. |
| `TDC.getData()` | Returns raw collected data (before encoding). Likely used internally or for debugging. |

### External Dependencies

TDC relies on two global helper functions defined in the host page (lines 115–122 of tdc.js):

- `window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF()` — Returns `new Date()` (time provider)
- `window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO(a, b)` — Calls `Date[a].apply(Date, b)` (Date method dispatch)

These are injected outside the VM to prevent the bytecode from being analyzed in isolation — the VM calls them by their obfuscated global names during fingerprint collection.
