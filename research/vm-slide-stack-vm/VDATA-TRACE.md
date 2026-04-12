# VDATA-TRACE — where does `window.getVData` come from?

Task 42.1 resolution. Traces the three vData string anchors in the vm-slide
stack-VM bytecode (`output/vm-slide/bytecode.json`), identifies the property
write that installs `window.getVData`, and characterizes the installed
function body.

Reproduce with `node research/vm-slide-stack-vm/vdata-trace.js`. Output is
`output/vm-slide/vdata-anchors.json`.

## §1 Method

String reconstruction walks every `OP_04 (OP_10 <charCode>)*` run in the
CFG-reachable portion of the bytecode (seeded at pc=0 and every OP_58 `K`
operand, mirroring `research/vm-slide-stack-vm/walker.js`). A run is
terminated by either `OP_13` (resolve string as a key into the global scope
`U[]`) or the first non-append opcode (bare string literal left on the
stack). Runs with bare-literal termination are *not* rejected — strings
used as property names in a `[receiver, key]` pair or as arguments to
`RegExp` / `split` never pass through `OP_13`. I re-derived the decoder
inline rather than importing `walker.js` because `walker.js` does not
export its `readInstruction` helper; the decode semantics (including the
variable-width OP_58 handler) match `walker.js` verbatim.

Basic-block bounds for each anchor are computed by scanning the walked pc
list backward to the nearest terminator / branch (OP_06, OP_16, OP_60) and
forward to the same. Classification follows the stack-VM data flow from
the string run: if within 32 steps (allowing one OP_06 unconditional hop)
an `OP_24` (`A[0][A[1]] = TOS`) appears, the anchor is a property-set key
(`write`); if an `OP_54` / `OP_55` / `OP_02` / `OP_25` / `OP_66` / `OP_20`
consumes the value, it is a literal in a larger expression (`read`);
otherwise `unknown` with honest evidence.

## §2 Anchor inventory

### Anchor 1 — `"getVData"` — **write**

- `build_pc` 19681, `resolve_pc` 19696 (pc of last OP_10, run has no OP_13),
  byte length 17, enclosing block `[19666, 19700]`.

```
19667  OP_04
19668  OP_10 119          ; 'w'
19670  OP_10 105          ; 'i'
19672  OP_10 110          ; 'n'
19674  OP_10 100          ; 'd'
19676  OP_10 111          ; 'o'
19678  OP_10 119          ; 'w'     -> "window" on stack
19680  OP_32              ; push [U, pop()]  -> [globalScope, "window"]
19681  OP_04
19682  OP_10 103          ; 'g'
19684  OP_10 101          ; 'e'
19686  OP_10 116          ; 't'
19688  OP_10 86           ; 'V'
19690  OP_10 68           ; 'D'
19692  OP_10 97           ; 'a'
19694  OP_10 116          ; 't'
19696  OP_10 97           ; 'a'     -> "getVData" on stack
19698  OP_41              ; var A=pop,C=pop; push [C[0][C[1]], A]
                          ;   -> [U["window"], "getVData"] == [window, "getVData"]
19699  OP_06 20059        ; unconditional jump to the install site
  ; ... OP_06 hop to 20059 ...
20059  OP_58 19702 1 1 8 3 3  ; FUNC_CREATE, K=19702 (body entry PC)
20066  OP_24              ; A[0][A[1]] = TOS  ->  window["getVData"] = <fn>
```

### Anchor 2 — `"vData="` — **read**

- `build_pc` 19969, enclosing block `[19943, 20000]`, byte length 13. Used
  as the pattern argument to `new RegExp(...)` *inside* the `getVData`
  function body (i.e. this anchor is unrelated to the install; it is the
  body's own input-sniffing regex).

```
19955  OP_04
19956  OP_10 82           ; 'R'
...
19966  OP_10 112          ; 'p'
19968  OP_13              ; resolve -> RegExp global
19969  OP_04              ; anchor
19970..19980  OP_10 ...   ; "vData="
19982  OP_04              ; "" (second RegExp arg, flags)
19983  OP_66 2            ; invoke TOS as constructor with 2 args via U as
                          ;   receiver  -> RegExp("vData=", "")
19985..19992  "test"
19994  OP_03              ; reverse top two
19995  OP_00 7
19997  OP_02 1            ; method call: <regex>.test(<input>)
19999  OP_60 20005        ; branch if TOS truthy
```

### Anchor 3 — `"&vData="` — **read**

- `build_pc` 24210, enclosing block `[24086, 24233]`, byte length 15. Sits
  inside a `window.DEBUGMODE` branch near the end of the bytecode; it is
  concatenated with a register value and written to a local slot — i.e.
  debug-only URL construction. Not related to `window.getVData` and not
  reached on a normal Chrome 146 run (`window.DEBUGMODE` is undefined).

```
24197  OP_10 79           ; 'O'  (tail of "DEBUGMODE")
24199  OP_10 68           ; 'D'
24201  OP_10 69           ; 'E'
24203  OP_41              ; [window, "DEBUGMODE"]
24204  OP_54              ; property get  -> window.DEBUGMODE
24205  OP_05              ; pop
24206  OP_47 3            ; push [3]
24208  OP_00 3
24210  OP_04              ; anchor
24211..24223  "&vData="
24225  OP_20              ; concat
24226  OP_00 16           ; push register 16
24228  OP_20              ; concat
24229  OP_36              ; write result back into slot
```

## §3 Property-write identification

Anchor 1 at pc=19681 is unambiguously the site that installs
`window.getVData`. The argument chain is:

1. pc=19667..19679 builds the string `"window"` via the canonical `OP_04
   (OP_10)*` pattern.
2. pc=19680 `OP_32` — `n.push([U, n.pop()])` from the dispatch table:
   wraps the just-built `"window"` into a `[globalScope, "window"]` pair on
   TOS.
3. pc=19681..19696 builds `"getVData"`.
4. pc=19698 `OP_41` — `var A=n.pop(), C=n.pop(); n.push([C[0][C[1]], A])`.
   That pops `"getVData"` into A, pops `[U, "window"]` into C, and pushes
   `[U["window"], "getVData"]` = `[window, "getVData"]`. This is the
   canonical vm-slide shape for a property-access target: a two-element
   array where `[0]` is the receiver and `[1]` is the key.
5. pc=19699 `OP_06 20059` — unconditional jump to 20059.
6. pc=20059 `OP_58 19702 1 1 8 3 3` — FUNC_CREATE. From the dispatch-table
   source, OP_58 reads `K=m[g++], A=m[g++], C=m[g++]` then `2*A+C` more
   bytes, and pushes a closure that calls `__TENCENT_CHAOS_VM(K, m, U, p,
   E, F, Y, c)`. So `K=19702` is the body entry PC, `A=1` (one upvalue
   slot), `C=1` (one argument slot), and the remaining 5 bytes `8 3 3`
   plus the single `C` entry describe the upvalue/arg mapping. The closure
   is pushed on TOS as the value to be assigned.
7. pc=20066 `OP_24` — `var A=n[n.length-2]; A[0][A[1]] = n[n.length-1]`.
   With `n[len-2] = [window, "getVData"]` and `n[len-1] = <closure>`, this
   executes `window["getVData"] = <closure>`. That is the property write.

The `classification_evidence` field on anchor 1 in `vdata-anchors.json`
records the same chain in condensed form: "OP_24 (property set) reached
from the anchor within 9 steps (one OP_06 hop allowed); preceding OP_32
builds [U, objKey]; OP_41/OP_59 combines the resolved key with the
receiver; OP_58 creates the function value being assigned."

## §4 Function body boundary

From the OP_58 at pc=20059 the closure body starts at **pc=19702** (the
`K` operand). I determined the end by starting a fresh CFG walk from
pc=19702 that follows OP_06 and OP_60 targets, stops at any OP_16, and
does **not** recurse into nested OP_58 K entries (there are none in this
body — verified by histogramming opcode counts on the walked set).

The walk visited **216 instructions** spanning pc **19702..20058** (356
bytecode bytes) with exactly two OP_16 exits:

```
20033  OP_16              ; early-return exit via the 19999 OP_60 20005 branch
20058  OP_16              ; main fall-through exit (reached from 20054 OP_06 19915
                          ;   loop-back path ending at 20057 OP_04 / 20058 OP_16)
```

Every path from pc=19702 terminates at one of these two OP_16s. No path
crosses pc=20058. The install site at pc=20059 is therefore *outside* the
function body and unreachable from within it. I declare the function body
as `[19702, 20058]`. `disassembly-full.txt` has the function's first
instruction at its line `19702  OP_40 9`.

The OP_58 operand vector `1 1 8 3 3` with A=1 C=1 corresponds to the two
entries that follow K,A,C: upvalue pair `(p[1], n[8])` (one capture) and
argument mapping `Q[0]=3` (argument 0 binds to local slot 3). This matches
the orchestrator calling the function as `getVData(n.join("&"))` with one
string argument — the VM places that argument into slot 3.

## §5 Function body semantics — provisional

Calling convention: **one string argument** (matches `C=1` in the OP_58
operand and the orchestrator call shape). The prologue at pc=19702 is
`OP_40 9` (set stack length to 9) followed by `OP_42 2..7` (initialize
local slots 2..7 to `[]`), which is the vm-slide "allocate local-var
scope" idiom — consistent with a small helper that needs working
registers for string splits and loops.

Resolved external identifiers (OP_13 hits inside the body):

| pc | identifier |
|----|------------|
| 19845 | `Object` |
| 19955 | `RegExp` |

Bare-literal strings used as property keys or arguments:

| pc | string | use |
|----|--------|-----|
| 19724, 19775 | `"document"` | property lookup on U |
| 19742, 19793 | `"documentMode"` | `document.documentMode` test (IE check) |
| 19862 | `"py"` | unclear — some flag or short property name |
| 19873, 19880 | `"0"`, `"1"` | literal values |
| 19888, 20008 | `"split"` | string split method |
| 19900 | `"&"` | query-string separator |
| 19920 | `"length"` | array length |
| 19969 | `"vData="` | RegExp pattern (anchor 2) |
| 19985 | `"test"` | RegExp.test method |
| 20020 | `"="` | key=value separator |

Opcode histogram (walked, nested OP_58 excluded): 216 total instructions,
0 FUNC_CREATEs, 5 OP_54 property reads, 1 OP_55 call, 2 OP_66 `U`-receiver
calls, 3 OP_02 method calls, 1 OP_20 concat, 1 OP_24 property write, 6
OP_42 local-init, 6 OP_36 slot-write, 2 OP_16 exits.

Narrative (provisional — characterization, not decompilation):

1. IE-gate: reads `document.documentMode` twice (OP_54 at 19769 / 19819
   plus comparisons), selecting a code path.
2. Builds `new RegExp("vData=", "")` (pc 19955..19983) and invokes its
   `.test` method (pc 19985..19997) on something derived from the input
   — "does the input already contain `vData=`?". OP_60 at 19999 branches:
   one branch falls through to the OP_16 at 20033 (early return), the
   other jumps to 20034 for further processing.
3. The larger branch splits on `"&"` and `"="` (pc 19888 / 20008 / 19900
   / 20020), consistent with parsing the input as a query string. Loops
   back via OP_06 19915 at pc 20054.
4. Final exit at OP_16 pc 20058 is preceded by OP_04 (push `""`) at
   20057. Since vm-slide returns `A ? ... : n.pop()` from the dispatch
   loop, the actual return value depends on the stack state at the
   OP_16. The function almost certainly returns a string (consistent
   with the orchestrator assigning its result to `e.vData`).

Honest caveats:

- `"py"` (pc 19862) — unclear. `Object` resolves at pc 19845; the stack
  shape around that site is not obvious without a full decompile.
- The two document-mode checks suggest the function handles both IE and
  non-IE branches internally — which would explain why the orchestrator's
  `if (a.isLowIE())` branch appears redundant: `getVData` is installed
  unconditionally and self-branches on `document.documentMode`.
- I did **not** confirm whether the XTEA crypto that produces the
  152-char HAR value lives inside this function body. The histogram
  shows zero nested OP_58 and no crypto-looking OP_13 lookups (only
  `Object` and `RegExp`), so the crypto is probably *not* inside this
  body; the function more likely returns a concatenated query-string
  plus a pre-computed token lifted from a register initialized upstream.
  Confirming this is 42.2's job.
- Anchors 2 and 3 do **not** emit the `vData=` key that appears in the
  HAR POST body. Anchor 2 is a RegExp input test; anchor 3 is a
  debug-mode URL fragment elsewhere in the bytecode. The literal
  `vData=` in the HAR must come from the orchestrator side, which
  prepends the key before the value returned by `window.getVData(...)`
  (FLOW.md §6 records the orchestrator-side call as `e.vData = ...`).

## §6 Handoff to 42.2

Provisional resolution: on Chrome 146 (non-IE), vm-slide unconditionally
installs `window.getVData` via the property-write at pc=20066 in
`sample/vm_slide.js`, with the function body at bytecode pc `[19702,
20058]` (216 instructions, one argument, one OP_16 fall-through exit at
pc=20058). The function internally branches on `document.documentMode`,
uses `new RegExp("vData=")` to probe the incoming query string, splits on
`"&"` and `"="`, and almost certainly returns a string. It does not appear
to perform the XTEA / base64 work that generates the 152-char HAR value
directly in its own body (no nested OP_58, no crypto-looking OP_13
lookups).

Ambiguities for 42.2:

1. The provenance of the HAR value's crypto is still open. Candidates:
   (a) a register pre-computed upstream of `getVData` and merely
   interpolated in, (b) a second helper installed separately (there are
   many OP_58s in the bytecode — 42.2 should scan for another `window.*`
   property write whose key looks crypto-related), or (c) an external
   routine loaded by the page, referenced by a resolved global I did not
   recognize. Running the vm-slide body through a jsdom harness with
   `eval(sample/vm_slide.js)`, then calling `window.getVData(<same
   query>)`, and comparing the output byte-for-byte against the HAR
   `vData=` value would resolve this conclusively.
2. The OP_58 operand tail `1 1 8 3 3` is interpreted as A=1 C=1 plus
   `p[1]=n[8]` (upvalue) and `Q[0]=3` (arg slot). I did not trace what
   `n[8]` is at the point of function creation — it is likely the caller
   closure's `this` or a shared state table. 42.2 may need to know.
3. Anchors 2 and 3 are entirely unrelated to the install site. Please
   do not confuse `anchors[1..2]` in `vdata-anchors.json` with the vData
   key that appears in the HAR — the latter is prepended by the
   orchestrator, not by the vm-slide bytecode.
4. FLOW.md §9 Q1 should be re-opened against this resolution: the
   orchestrator's `if (a.isLowIE()) { window.getVData(...) }` branch is
   redundant on non-IE browsers precisely because vm-slide pre-installs
   `window.getVData` on every run. The `isLowIE` branch is a belt-and-
   braces fallback for environments where vm-slide bytecode is never
   executed.

---

## Correction from 42.2

The handoff paragraph above says "vm-slide pre-installs `window.getVData`
on every run" and calls the orchestrator's `isLowIE` branch "redundant on
non-IE browsers." **Both statements are incorrect.** Task 42.2 traced one
block up from this document's anchors and found the enclosing gate: at
bytecode pc 19636, vm-slide calls `<state>.isIE9Below()` and takes a
two-way branch. On Chrome 146 (the HAR) the branch evaluates false and
vm-slide falls through to call `<state>.proxyXHR(p[3])` at pc 19662, then
`OP_06 20070` at pc 19663 **skips the entire `getVData` install block**.
On the IE9-true branch vm-slide takes the jump target at pc 19666 and
reaches the install sequence this document traces. The two paths are
mutually exclusive, joined at pc 20070, and `window.getVData` is
**never installed at all** on Chrome 146.

The orchestrator's `if (a.isLowIE())` branch is **not redundant** — it
mirrors vm-slide's own IE9 gate and is the exclusive path on IE9 and
below. On Chrome, `vData` reaches the verify POST via vm-slide's
`proxyXHR` routine, which installs an `XMLHttpRequest.prototype` monkey
patch that encrypts payload data with modified XTEA + a custom 64-char
base64 alphabet (ingredients at bytecode indices 15352/15530 and pc
16932/17677) and injects `vData=<ciphertext>` into the outgoing POST
body before `send()` completes.

The physical opcode identification in §3 and §4 of this document is
unchanged — anchor 1 at pc=19681 really does build the `[window,
"getVData"]` descriptor, `OP_58 19702 1 1 8 3 3` at pc 20059 really
does FUNC_CREATE the body at `[19702, 20058]`, and `OP_24` at pc 20066
really is the property write. What was wrong was the characterisation
of the enclosing control-flow block in §3's "The `classification_evidence`
field..." narrative and in §6's handoff paragraph — neither traced the
outer branch.

See `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` §3 candidate (a/b)
and §4 "Partially resolved (static limit reached)" for the corrected
mechanism, the full `window-installs.json` enumeration, and the HAR
character-set verification against the custom alphabet.

(One minor operand-order note: 42.1 read the OP_58 tail `8 3 3` as `p[1]
= n[8]`; 42.2 reads it as `p[8] = n[3]`. The semantic conclusion — one
upvalue captured — is unchanged; the captured value is the outer
initializer's argument 0, a shared state handle, not a pre-computed
crypto blob. 42.2 is the correct reading.)
