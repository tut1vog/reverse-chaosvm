# fn 22317 full static decompile + reconciliation with fn 20539

**Task**: Phase 44 / 44.2.6 — decompile vm-slide's fn 22317 end-to-end and
reconcile its role with fn 20539. Resolves the 44.3 paradox: fn 20539 has
zero `OP_10 61`/`OP_10 38` emissions, yet the vm-slide bytecode globally
contains a `"&vData="` literal at pcs 24210..24224.

Scope: pure static analysis of `output/vm-slide/bytecode.json` rooted at
entry pc 22317, with full walks of parent fn 20970 (the container of fn
22317) and fn 20140 (the container of fn 20539) for installer reconciliation.
Walker: an ad-hoc `/tmp/fn22317/walk.js` clone of `research/vm-slide-stack-vm/walker.js`
that can walk from a single entry without recursing into nested FUNC_CREATEs.

---

## Summary

**Classification of fn 20539: (IV) dead code on the observed Chrome code
path.** fn 20539 IS installed as `XMLHttpRequest.prototype.send` by fn
20140 at pc 20808 (`OP_24` STORE_REF following the property-access pair
`[(XHR.prototype), "send"]` built at pcs 20476..20535, with fn 20539 itself
pushed by `OP_58 20539 3 1 ...` at pc 20797). The install itself is
byte-proved. However, fn 20539's decompiled semantics are **whole-body
replacement**: on any run where its `capturedSlot7 === this` and `typeof
body === "string"` guards pass, it calls `savedSend.call(this,
fn15918(body, {py: ...}))`, which would replace the caller's XHR body
wholesale with the 152-char XTEA-+-base64 ciphertext. This contradicts
the HAR fixture `sample/captcha-har.har` which shows the `/cap_union_new_verify`
POST body is **9504 bytes** with `vData=<152 chars>` as the 40th field, NOT
152 bytes total. Therefore on the observed jsdom/Chrome path, fn 20539
cannot have run — it is either not reached (proxyXHR never actually
invoked on this code path) or its guards always fall through. The live
producer of the HAR `vData` field is **fn 22317**, a webpack/TS module
export bound to `exports.getCaptchaData` inside fn 20970 at pc 24252 (NOT
an XHR prototype patch), which independently computes `vData` via
`capturedSlot21.default.encode(capturedSlot22.encryptData(slot14.join("&")))`
at pcs 24086..24167 and appends `&vData=<cipher>` to its first string
argument at pcs 24210..24229 before returning the concatenation. fn 22317
and fn 20539 are **not** in a caller/callee relationship — their parents
differ (fn 22317's parent is fn 20970, fn 20539's parent is fn 20140), they
do not reference each other, and they end up producing vData via
independent XTEA chains. fn 22317 is the live vData producer; fn 20539 is
installed-but-dead.

**Is fn 22317 the installed `XMLHttpRequest.prototype.send` replacement?**
No. fn 22317 has no XHR-prototype STORE_REF anywhere in its call path. It
is stored into `exports.getCaptchaData` by fn 20970 at pc 24252
(`OP_24` with the access pair `[(n[4]), "getCaptchaData"]` built at
pcs 22282..22313). fn 20970 itself is a webpack TS module factory (0
captures, 3 args `(module, exports, require)` from its creation site
`OP_58 20970 0 3 3 4 5` at pc 24257 in the root entry 0).

**Where is the 9504→112 reduction?** There is no such reduction. The
Phase 43 "112-byte plaintext" is not obtained by reducing a 9504-byte
body. It is **built from a hardcoded 8-key schema** `["tp", "key", "py",
"env", "version", "cLod", "inf", "ss"]` populated into a fresh Array via
`new Array()` at pc 23983, filled from a per-field loop reading fn
22317's captures and a sorted-keys array, then joined with `"&"` at pc
24161 (`slot14.join("&")`). The 44.3 hypothesis that masks `OP_08 63` /
`OP_08 6` / `OP_08 31` perform a byte-reducing base64-style accumulator
is not supported by fn 22317's body — those masks at pcs 24035..24086 are
inside the `push`-into-slot-14 loop computing the per-field `key + "=" +
value` strings, not reducing bytes.

---

## fn 22317 full pseudocode

**Body bounds** (pinned by control-flow walker from entry 22317):
`[22317, 24233]` inclusive. Terminator is `OP_16 VM_EXIT` at pc 24233.
637 reachable instructions. Four nested FUNC_CREATE sites are spawned
inside fn 22317 but not recursed into by this walk: fn 22400 @ pc 22663,
fn 22730 @ pc 22972, fn 23399 @ pc 23727, fn 23898 @ pc 23945 (a 0-cap /
0-arg micro-closure used as the `.sort()` comparator at pc 23949).

**Creation site**: pc 24234 inside fn 20970, with operand
`OP_58 22317 6 2 17 10 18 12 19 9 20 11 21 8 22 7 3 4`. Unpacked via the
FUNC_CREATE handler (`K, A, C; then 2*A+C operand bytes`):

| | value | meaning |
|---|---|---|
| entry K | 22317 | fn 22317's first PC |
| capture count A | 6 | 6 captures |
| arg count C | 2 | 2 declared args |
| capture pairs (dst, src) | `(17,10) (18,12) (19,9) (20,11) (21,8) (22,7)` | child slot ← parent slot |
| argmap | `(3, 4)` | arguments[0]→slot 3, arguments[1]→slot 4 |

Per the FUNC_CREATE closure body (`p[dst] = n[src]`), fn 22317's slot 17
is a shared-cell alias for fn 20970's slot 10, slot 18 for parent slot
12, ..., **slot 21 for parent slot 8, slot 22 for parent slot 7**. Slots
21 and 22 are load-bearing: they hold the vData-cipher module imports
(see "Reduction boundary" below).

### Local-allocation prologue [22317, 22349]

```text
22317  OP_40 23          // n.length = 23 — 23 locals
22319  OP_42 2            // allocate slot 2 (selfFn ref) if not already
22321  OP_42 3            // alloc slot 3 — arguments[0] already routed here
22323  OP_42 4            // alloc slot 4 — arguments[1]
22325  OP_42 5            // alloc slot 5
22327  OP_42 6            // alloc slot 6 — the fresh result-object ref used in many build sites
22329  OP_42 7            // alloc slot 7
22331  OP_42 8            // alloc slot 8
22333  OP_42 9            // alloc slot 9
22335  OP_42 10           // alloc slot 10 — loop counter
22337  OP_42 11           // alloc slot 11
22339  OP_42 12           // alloc slot 12
22341  OP_42 13           // alloc slot 13 — sorted-keys Array
22343  OP_42 14           // alloc slot 14 — result Array of `key=value` strings
22345  OP_42 15           // alloc slot 15 — per-iteration field-value reference
22347  OP_42 16           // alloc slot 16 — final vData ciphertext (base64)
```

No `OP_42` for slots 17-22 because those are aliased to parent cells by
FUNC_CREATE itself — `OP_42` is a no-op for already-allocated slots.

### First half: build the field-value object in slot 6 [22349, 23740]

```text
22349  OP_47 6               // push [6] — the result-object ref
22351  OP_04                 // push ""
22352..22362  OP_10 chain     // append "Object"
22364  OP_13                 // GLOBAL_LOOKUP: TOS = U["Object"]
22365  OP_55 0               // NEW 0: new Object()
22367  OP_39                 // DUP
22368..22382  OP_10 chain     // "version"
22383  OP_03                 // reverse pair → [key, obj]
22384..22386  OP_10 '2'       // push "2"
22387  OP_24                 // STORE_REF: obj.version = "2"
22388  OP_05  OP_05           // cleanup
22390  OP_39                 // DUP obj
22391..22396  OP_10 "tp"      // build "tp"
22397  OP_06 22663            // JUMP 22663 (skip nested FUNC_CREATE for fn 22400)
```

The prologue builds a new `Object` in slot 6 and starts chaining
property assignments with `.version = "2"`. Subsequent assignments
(`.tp`, `.key`, `.py`, `.env`, `.cLod`, `.inf`, `.ss`) are scattered across
the rest of the first half because each VALUE computation involves
calling captured helpers, reading `arguments[1]` (slot 4 = options), and
occasionally spawning tiny nested closures for timing/number-to-string
work.

Selected evidence:

- **pc 22663** — `OP_58 22400 1 0 7 17` creates a 0-arg closure with one
  capture (child slot 7 ← parent slot 17 = fn 20970 slot 10 = the
  `__importDefault(require(0))` module). Then `OP_66 0` at pc 22669
  *calls* that closure immediately (`CALL_GLOBAL 0`) to obtain a value
  stored back into the object under `.tp`.
- **pc 22702** — `OP_00 17` reads captured slot 17 for a truthiness
  check (`OP_60 22715`). At pc 22715 the branch picks `"0"`, else `"1"`
  — the same py-flag pattern that fn 20539 uses at pcs 20691..20744. So
  fn 22317 carries its own py-flag derivation, independent of fn 20539.
- **pc 22972** — `OP_58 22730 2 1 8 17 9 18 3` creates a 1-arg closure
  with captures (slot8←parent 17, slot9←parent 18) for another helper
  call chain feeding `.env`.
- **pc 23302 `OP_02 1`** — METHOD_CALL with 1 arg somewhere in the
  middle of the field-build section (several sibling `OP_02 1` sites at
  pcs 23302, 23949, 24060, 24161, 24163, 24165 — all method calls on
  pair-typed stack entries).
- **pc 23727** — `OP_58 23399 2 0 8 19 9 20` creates a 0-arg 2-capture
  closure reading fn 20970 slots 9 and 11.

The per-field assignment sites collectively populate the result object
in slot 6 with the eight fingerprint fields. The fields are assigned in
source-code order, which is not the same order the final plaintext uses
— see the sort step next.

### Second half: build sorted-keys Array in slot 13 [23740, 23953]

```text
23740  OP_47 6               // ref to result-object slot
23742..23746 OP_10 "ss"       // final field build "ss"
23748  OP_00 12               // push slot 12 value
23750  OP_24                  // obj.ss = slot12Value
23751  OP_05  OP_05
23753  OP_47 13               // ref [13]
23755..23766  OP_10 "Array"
23766  OP_13                  // GLOBAL_LOOKUP: U["Array"]
23767  OP_55 0                // new Array()
23769  OP_39                  // DUP
23770  OP_08 0                // push 0 (index)
23772  OP_03                  // reverse → [0, array]
23773..23776 OP_10 "tp"
23778  OP_24                  // array[0] = "tp"
23779  OP_05  OP_05
23781  OP_39
23782  OP_08 1
23784  OP_03
23785..23790 OP_10 "key"
23792  OP_24                  // array[1] = "key"
... (identical pattern for indices 2..7) ...
23796  OP_08 2  → "py"        // array[2] = "py"
23808  OP_08 3  → "env"       // array[3] = "env"
23822  OP_08 4  → "version"   // array[4] = "version"
23844  OP_08 5  → "cLod"      // array[5] = "cLod"
23860  OP_08 6  → "inf"       // array[6] = "inf"
23874  OP_08 7  → "ss"        // array[7] = "ss"
23885..23894 OP_10 "sort"     // build "sort" literal
23894  OP_03                  // reverse → pair for method-call
23895  OP_06 23945            // JUMP 23945
23945  OP_58 23898 0 0        // push empty 0/0 closure (the .sort comparator — empty
                                //  body that defaults to string compare; body is [23898, ~])
23949  OP_02 1                // METHOD_CALL 1: array.sort(comparator)
23951  OP_36                  // STORE_LOCAL_REF: slot13 = sortedArray
```

**This is the hardcoded 8-field schema.** The keys are built in source
order `["tp", "key", "py", "env", "version", "cLod", "inf", "ss"]`, then
`.sort()`'d into alphabetical order:
`["cLod", "env", "inf", "key", "py", "ss", "tp", "version"]`. The loop
that follows reads slot 13 in sorted order.

### Loop: fill slot 14 (result Array) with `key=value` strings [23953, 24086]

```text
23954  OP_47 6                 // ref to result-object
23956..23962  OP_10 "key"      // (diagnostic — a "key" literal; part of a small build)
23963  OP_59                   // makes pair (obj, "key")
23964  OP_00 9                 // push slot 9
23966  OP_24                   // obj.key = slot9Value  (alt: patches last field)
23967  OP_05  OP_05
23969  OP_47 14                // ref [14]
23971..23980  OP_10 "Array"
23982  OP_13                   // GLOBAL_LOOKUP
23983  OP_55 0                 // new Array()
23985  OP_36                   // STORE_LOCAL_REF: slot14 = []
23986  OP_05  OP_05
23988  OP_47 10  OP_08 0  OP_36  // slot10 = 0 (loop counter)
23993  OP_05  OP_05

23995  OP_47 10                // loop header: push [10]
23997  OP_63                   // push n[[10][0]][0] = slot10 value
23998  OP_47 13                // push [13]
24000..24012 OP_10 "length"
24013  OP_59                   // pair (slot13, "length")
24014  OP_54                   // DEREF → slot13.length (=8)
24015  OP_62                   // TOS = (slot10Value >= 8)
24016  OP_23                   // LOGICAL_NOT: (slot10Value < 8)
24017  OP_60 24023              // JUMP_IF_TRUE 24023 — continue loop body
24019  OP_05                    // loop exit cleanup
24020  OP_06 24086              // JUMP 24086 — exit loop

24023  OP_05                    // loop body: drop the bool
24024  OP_47 15                 // push [15]
24026  OP_47 13                 // push [13]
24028  OP_00 10                 // push slot10 value (index)
24030  OP_59                    // pair (slot13, index)
24031  OP_54                    // DEREF → slot13[index] = sorted key name
24032  OP_36                    // slot15 = keyName
24033  OP_05  OP_05
24035  OP_47 14                 // push [14]
24037..24044  OP_10 "push"
24046  OP_59                    // pair (slot14, "push")
24047  OP_00 15                 // push slot15 (keyName)
24049..24051  OP_10 "="          // append "=" — OP_04 then OP_10 61
24052  OP_20                    // CONCAT: keyName + "="
24053  OP_47 6                  // push [6]
24055  OP_00 15                 // push slot15 (keyName)
24057  OP_59                    // pair (obj, keyName)
24058  OP_54                    // DEREF → obj[keyName]
24059  OP_20                    // CONCAT: keyName + "=" + obj[keyName]
24060  OP_02 1                  // METHOD_CALL 1: slot14.push(kv)
24062  OP_05
24063  OP_47 10  OP_39 OP_63    // increment loop counter via slot10 = slot10 + 1
24067  OP_39  OP_64 1  OP_64 0
24072  OP_08 1  OP_20  OP_36    // slot10 += 1 (via OP_20 concat on numbers = +)
24076  OP_05
24077  OP_50 0                  // housekeeping immediate
24079  OP_64 0  OP_56           // bitwise OR, restacking
24082  OP_05
24083  OP_06 23995              // JUMP back to loop header
```

**Observations**:

- The loop iterates `slot10` from 0 to `slot13.length - 1`, which is 0
  to 7 because slot 13 is the 8-element sorted-keys Array.
- Each iteration reads `slot13[slot10]` (a key name), looks up
  `resultObj[keyName]` via the `[6]` ref, concatenates `key + "=" +
  value`, and pushes the string into slot 14.
- At loop end, slot 14 is `[ "cLod=...", "env=...", "inf=...",
  "key=...", "py=...", "ss=...", "tp=...", "version=..." ]`. With 8 `=`
  characters. When joined with "&" (next section) there are 7 `&`
  characters. That exactly matches the Phase 43 112-byte plaintext
  shape: `8 × "=" + 7 × "&"` = 15 delimiter chars + ~97 payload chars =
  112 bytes.

### Cipher chain: slot 16 = encode(encryptData(slot14.join("&"))) [24086, 24168]

```text
24086  OP_47 16                 // ref [16]
24088  OP_47 21                 // push [21] = ref to fn 22317 slot 21 =
                                //   fn 20970 slot 8 = __importDefault(require(42))
24090..24103  OP_10 "default"
24105  OP_59                    // pair (slot21Val, "default")
24106..24117  OP_10 "encode"
24119  OP_41                    // CHAIN: pair ((slot21Val).default, "encode")
24120  OP_47 22                 // push [22] = fn 20970 slot 7 =
                                //   __importDefault(require(40))
24122..24143  OP_10 "encryptData"
24145  OP_59                    // pair (slot22Val, "encryptData")
24146  OP_47 14                 // push [14]
24148..24155  OP_10 "join"
24157  OP_59                    // pair (slot14, "join")
24158..24159  OP_04 OP_10 38     // push "&"
24161  OP_02 1                  // METHOD_CALL 1: slot14.join("&") → plaintext
24163  OP_02 1                  // METHOD_CALL 1: slot22.encryptData(plaintext) → cipher
24165  OP_02 1                  // METHOD_CALL 1: slot21.default.encode(cipher) → b64
24167  OP_36                    // STORE_LOCAL_REF: slot16 = b64
```

**This is the full vData pipeline in three nested method calls at pcs
24161, 24163, 24165.** The three `OP_02 1` in succession unwind:

```
slot14.join("&")          // plaintext, 112 bytes
  → slot22.encryptData(pt) // XTEA, 112 bytes ciphertext (14 blocks × 8 bytes)
  → slot21.default.encode(ct) // base64 with custom 65-char alphabet, 152 chars
```

The `encryptData` and `.default.encode` helpers are imported from vm-slide
modules 40 and 42 (via fn 20970's `__importDefault(require(...))` chain
at pcs 21206..21251; see "Installer evidence" below). They are **not**
direct calls to fn 15918 / fn 15241 — instead, encryptData is a webpack
module-level wrapper whose body eventually reaches the cipher region at
pc 15241. fn 20539 reaches the same cipher region via a DIFFERENT
wrapper chain (direct OP_66 at pc 20749 on fn 15918). The two paths
converge at pc 15241 but diverge at their callers — which is consistent
with 44.1's runtime trace where all 14 encrypt-entry events were logged
at pc 16182 (inside fn 15918). Whether 44.1 saw fn 20539's path or fn
22317's path (or both) depends on how module 40's `encryptData` ends up
calling fn 15918 — an open question, not decidable from fn 22317's body
alone.

### Tail: `&vData=` concat + VM_EXIT [24168, 24233]

```text
24167  OP_36                      // (recap) slot16 = b64 vData
24168  OP_05  OP_05                // cleanup
24170..24181  OP_10 "window"
24183  OP_32                       // push [U, "window"]
24184..24201  OP_10 "DEBUGMODE"
24203  OP_41                       // chain pair [window, "DEBUGMODE"]
24204  OP_54                       // DEREF → window.DEBUGMODE
24205  OP_05                       // POP — value discarded (dev-only hook)
24206  OP_47 3                     // push [3] — ref to slot 3 = arguments[0] (body)
24208  OP_00 3                     // push slot 3 value
24210  OP_04                       // push ""
24211  OP_10 38                    // append "&"
24213  OP_10 118                   // append "v"
24215  OP_10 68                    // append "D"
24217  OP_10 97                    // append "a"
24219  OP_10 116                   // append "t"
24221  OP_10 97                    // append "a"
24223  OP_10 61                    // append "="
24225  OP_20                       // CONCAT: body + "&vData="
24226  OP_00 16                    // push slot 16 = b64 vData
24228  OP_20                       // CONCAT: body + "&vData=" + vData
24229  OP_36                       // slot3 = that string (STORE_LOCAL_REF via [3] ref)
24230  OP_64 0                     // swap TOS with n[-2] (move result above [3] ref)
24232  OP_05                       // drop the [3] ref
24233  OP_16                       // VM_EXIT — return TOS = the concatenated string
```

The tail reads `window.DEBUGMODE` as a live-environment probe and discards
the value (similar to fn 20539's `new Date()` probe at pc 20565). Then it
builds the literal `"&vData="` character-by-character (pcs 24211..24223,
char codes 38, 118, 68, 97, 116, 97, 61), appends it to the arg-0 body,
appends the slot-16 ciphertext, and returns the full concatenation.

### High-level JS equivalent

```js
// fn 22317 — exports.getCaptchaData
// Parent: fn 20970 (a webpack/TS module factory)
// Captures: slot17=parent10, slot18=parent12, slot19=parent9,
//           slot20=parent11, slot21=parent8 (base64 module),
//           slot22=parent7 (encryptData module)
// Args: (body, options)                          // slot3, slot4
function getCaptchaData(body, options) {
  var obj = new Object();
  obj.version = "2";
  obj.tp = /* helper closure fn 22400 result */;
  obj.key = /* ... */;
  obj.py = (capturedImport17() ? "0" : "1");       // pc 22706
  obj.env = /* ... */;
  obj.cLod = /* ... */;
  obj.inf = /* ... */;
  obj.ss = /* ... */;
  var sortedKeys = new Array();
  sortedKeys[0] = "tp"; sortedKeys[1] = "key"; sortedKeys[2] = "py";
  sortedKeys[3] = "env"; sortedKeys[4] = "version"; sortedKeys[5] = "cLod";
  sortedKeys[6] = "inf"; sortedKeys[7] = "ss";
  sortedKeys.sort();                               // alphabetical
  var kvArr = new Array();
  for (var i = 0; i < sortedKeys.length; i++) {
    var k = sortedKeys[i];
    kvArr.push(k + "=" + obj[k]);
  }
  var _probe = window.DEBUGMODE;                    // discarded
  var plaintext = kvArr.join("&");                  // 112 bytes, 8 pairs
  var cipher    = capturedSlot22.encryptData(plaintext);
  var b64       = capturedSlot21.default.encode(cipher);
  return body + "&vData=" + b64;
}
```

---

## Reduction boundary

**There is no 9504→112 reduction inside fn 22317.** The 112-byte
plaintext is **constructed**, not reduced: fn 22317 builds a new Object
with exactly 8 string fields (`tp`, `key`, `py`, `env`, `version`,
`cLod`, `inf`, `ss`), populates them from its captures and its
`arguments[1]` options object, sorts the keys alphabetically, walks
`sortedKeys[i] + "=" + obj[sortedKeys[i]]` into a 8-element Array at pcs
23995..24083, and joins with `"&"` at pc 24161 to produce the 112-byte
string. The total size is 112 bytes because the 8 per-field
`key=value` strings plus 7 `&` separators happen to sum to 112.

**Location**:

| pc range | role |
|---|---|
| 22349..23740 | per-field value computation (populates `obj` in slot 6) |
| 23753..23951 | builds the sorted 8-key Array in slot 13 |
| 23969..24083 | walks the Array, pushing `k=v` strings into slot 14 |
| 24146..24161 | `slot14.join("&")` → the 112-byte plaintext (transient stack value) |
| 24161..24167 | XTEA encrypt + base64 encode → slot 16 (vData ciphertext) |
| 24206..24229 | `arg0 + "&vData=" + slot16` concat + slot-3 STORE |

**Delegation pattern**: the cipher half (XTEA + base64) is **delegated**
to the captured imports slot22.encryptData and slot21.default.encode,
which are webpack-module exports from vm-slide modules 40 and 42
respectively (resolved by fn 20970's prologue via
`__importDefault(require(N))`). The plaintext build happens **inline**
inside fn 22317 — it is not delegated. The `9504 → 112` hypothesis from
44.3 does not apply: no 9504-byte input ever touches fn 22317. The 9504
bytes are the verify POST body that the orchestrator passes to fn 22317
as `arguments[0] = body`, which fn 22317 treats as **opaque** — it
neither reads nor reduces it — and simply concatenates `&vData=<cipher>`
onto its end.

---

## `&vData=` concat + forward call sites

- **`&vData=` literal construction**: pcs 24210..24223 via `OP_04` +
  7 × `OP_10` (char codes 38, 118, 68, 97, 116, 97, 61).
- **`&vData=` concat to body**: pc 24225 `OP_20` (body + "&vData=").
- **ciphertext append**: pc 24226 `OP_00 16` (push slot 16) + pc 24228
  `OP_20` (result + ciphertext).
- **Store into slot 3 (arg0 reference)**: pc 24229 `OP_36`.
- **Return site**: pc 24233 `OP_16` VM_EXIT — returns TOS
  (the concatenated string).
- **`savedSend.call` forwarding site**: **NONE.** fn 22317 does not
  forward to any saved send. It is a pure function that RETURNS the
  built string. The caller (the orchestrator module, presumably module
  56 per Phase 41 docs) is expected to call `xhr.send(returnedString)`
  itself.

This absence of a forwarding site is the single strongest piece of
evidence that fn 22317 is **not** an XHR send replacement — it has no
`savedSend` capture and no `.call`/`.apply` sites targeting a saved send.

---

## Installer evidence

**Locating the parent of fn 22317 and fn 20539**:

A walk-from-zero of the full bytecode enumerates 101 FUNCTION entries
and 100 FUNC_CREATE sites (verified by
`/tmp/fn22317/find-parent.js`). For each of the 101 entries, walking
its body (without recursing into nested FUNC_CREATEs) and checking for
the creation-site PCs 20797 (fn 20539), 24234 (fn 22317), 20813 (fn
20140) gives:

```
entry 20107 contains pc 20813 (fn 20140 create site)  body size=23
entry 20140 contains pc 20797 (fn 20539 create site)  body size=165
entry 20970 contains pc 24234 (fn 22317 create site)  body size=151
```

- **fn 20140 is the parent of fn 20539** (matches the existing
  `FN-20539-DECOMPILE.md` claim). fn 20140 is called `proxyXHR` in the
  Phase 42 flow docs.
- **fn 20970 is the parent of fn 22317** — a webpack/TS module
  factory with 0 captures and 3 declared args (argmap `3, 4, 5` → the
  webpack `(module, exports, require)` triple). fn 20970 is created at
  pc 24257 inside the root entry 0 via `OP_58 20970 0 3 3 4 5`.
- **fn 20970 and fn 20140 are NOT the same function.** fn 20539 and
  fn 22317 therefore have **different installer contexts** and are not
  in a caller/callee relationship.

**fn 20140's prototype assignments** (the Chrome `send` install chain):

```text
20152  OP_47 4                      // push [4] — slot 4 will hold original send
20154..20213  build [[U,"XMLHttpRequest"], "prototype"] chained pair, then "send"
20214  OP_54                          // DEREF → XMLHttpRequest.prototype.send
20215  OP_36                          // slot4 = originalSend  ← savedSend capture

20218  OP_47 5                        // push [5] — slot 5 will hold original open
20220..20279  chained pair build → XMLHttpRequest.prototype.open
20280  OP_54                          // DEREF
20281  OP_36                          // slot5 = originalOpen

20284  OP_47 6                        // push [6]
20286  OP_17                          // push undefined
20287  OP_36                          // slot6 = undefined  ← the shared signal cell

20290..20349  build the pair [(XHR.prototype), "open"] (target for open STORE)
20350  OP_06 20463                    // JUMP

20463  OP_58 20353 2 2 7 6 8 5 3 4    // push fn 20353 closure:
                                       //   captures (slot7←parent6, slot8←parent5),
                                       //   argmap (arg0→3, arg1→4)
20473  OP_24                          // STORE_REF:
                                       //   XMLHttpRequest.prototype.open = fn 20353
20476..20535  build the pair [(XHR.prototype), "send"] (target for send STORE)
20536  OP_06 20797                    // JUMP

20797  OP_58 20539 3 1 7 6 8 3 9 4 3  // push fn 20539 closure:
                                       //   captures (slot7←parent6, slot8←parent3,
                                       //             slot9←parent4),
                                       //   argmap (arg0→3)
20808  OP_24                          // STORE_REF:
                                       //   XMLHttpRequest.prototype.send = fn 20539
20811  OP_17                          // push undefined
20812  OP_16                          // VM_EXIT
```

So fn 20140 installs **two** prototype replacements:
- `XMLHttpRequest.prototype.open = fn 20353` (at pc 20473)
- `XMLHttpRequest.prototype.send = fn 20539` (at pc 20808)

**fn 20353's URL-guard write-through to the shared cell** (decompiled
here for completeness, body `[20353, 20462]`, 59 instructions):

```text
20353  OP_40 9                      // 9 locals
20355..20363  OP_42 2..5 + JUMP 20374
20366  OP_33                        // catch handler entry (CLEAR_EXCEPTION)
20367  OP_35 20441 0  ...            // nested TRY
20374  OP_42 6                       // alloc slot 6 — catch write slot
20376  OP_35 20366 6                 // main-body TRY_PUSH
20379..20420  OP_10 chain             // build "/cap_union_new_verify"
20422  OP_00 4                       // push slot 4 value (arg1 = url)
20424  OP_28                         // STRICT_EQ: url === "/cap_union_new_verify"
20425  OP_60 20430                   // if TRUE → 20430
20427  OP_06 20439                   // else → 20439 (skip write)

20430  OP_05                         // drop TRUE
20431  OP_47 7                       // push [7] — ref to slot 7
                                      // slot 7 is captured from parent slot 6 ---
                                      // the shared signal cell that fn 20539 reads
20433  OP_00 0                       // push n[0][0] = this (the XHR)
20435  OP_36                         // STORE_LOCAL_REF: slot7 = this
20436  OP_64 0  OP_05                 // cleanup
20439  OP_05  OP_49                   // continue
20441  OP_61                          // RETURN_IF_EXC
20442  OP_47 8                        // push [8] — slot 8 = captured originalOpen
20444..20455  OP_10 "apply" build      // "apply"
20455  OP_59                          // pair (originalOpen, "apply")
20456  OP_00 0                        // push this
20458  OP_00 1                        // push arguments
20460  OP_02 2                        // METHOD_CALL 2: originalOpen.apply(this, arguments)
20462  OP_16                          // VM_EXIT
```

fn 20353 is the `open()` replacement. On each call, it compares the URL
(slot 4 = arg1) against the string `"/cap_union_new_verify"`. On a
match, it writes `this` (the XHR instance) into its slot 7 — which by
FUNC_CREATE aliasing is the same cell as fn 20140's slot 6 AND fn
20539's slot 7. Then it forwards to `originalOpen.apply(this,
arguments)`.

**This resolves the fn 20539 open question from the existing
FN-20539-DECOMPILE.md §"Open questions" #1.** The captured slot-6 cell
is a per-XHR-instance gate: if `xhr.open("POST", "/cap_union_new_verify",
...)` has been called, fn 20353 stamps the XHR instance into the shared
cell, and the subsequent `fn 20539(send)` call sees `capturedSlot7 ===
this` as true and proceeds to encrypt. For any other URL (or no open at
all), the cell stays `undefined`, and fn 20539 falls through to
`savedSend.apply(this, arguments)`.

**fn 20970's module-factory prologue and getCaptchaData binding**
(body `[20970, 24256]`, 151 reachable instructions):

```text
20970  OP_40 13                      // 13 locals
20972..20992  OP_42 2..12              // allocate slots 2..12 (13 total)
20994  OP_47 6                        // push [6]
20996  OP_00 0                        // push n[0][0] = this (= the webpack module cache)
20998  OP_60 21003                    // if truthy → init path
21000  OP_06 21039                    // else → 21039 (skip __importDefault init)

21003..21037  build "__importDefault" and DEREF this["__importDefault"]
21039  OP_60 21137                    // if already defined → skip create
21042  OP_06 21132                    // else → create fn 21045

21132  OP_58 21045 0 1 3              // push fn 21045 closure (the __importDefault helper)
21137  OP_36                          // store into the prior ref
21138..21139 cleanup

21140  OP_47 4                        // push [4] — slot 4 = exports object (arg 1 of module)
21142..21161  OP_10 "__esModule"
21163  OP_59                          // pair (exports, "__esModule")
21164  OP_08 0  OP_23                  // push 0, LOGICAL_NOT → true
21167  OP_24                          // STORE_REF: exports.__esModule = true
21168..21169  cleanup

21170  OP_47 4                        // push [4] — exports ref
21172..21199  OP_10 "getCaptchaData"
21201  OP_59                          // pair (exports, "getCaptchaData")
21202  OP_17                          // push undefined (placeholder)
21203  OP_24                          // STORE_REF: exports.getCaptchaData = undefined
21204..21205  cleanup

21206  OP_47 7                        // push [7] — slot 7 target
21208  OP_00 5                        // push slot 5 value = arg2 = require
21210  OP_08 40                        // push 40
21212  OP_66 1                         // call require(40)
21214  OP_36                          // slot7 = require(40)
21215..21216 cleanup

21217  OP_47 8                        // push [8]
21219  OP_00 6                        // slot 6 = __importDefault
21221  OP_00 5                        // slot 5 = require
21223  OP_08 42  OP_66 1               // call require(42)
21227  OP_66 1                         // __importDefault(require(42))
21229  OP_36                          // slot8 = __importDefault(require(42))
                                      //         ← the base64-encoder module

21230..21231 cleanup
21232  OP_47 9                        // push [9]
21234  OP_00 5  OP_08 32  OP_66 1     // require(32)
21240  OP_36                          // slot9 = require(32)

21241..21242 cleanup
21243  OP_47 10                       // push [10]
21245  OP_00 5  OP_08 0  OP_66 1      // require(0)
21251  OP_05  OP_06 21321

... (more factory bindings — fn 21255, fn 21333 closures) ...

22273  OP_58 22038 0 2 3 4            // push fn 22038 closure (stored into slot 12 via
                                       //  the ref pushed earlier)
22279  OP_36                          // store

22282  OP_47 4                        // push [4] — exports ref
22284..22313  OP_10 "getCaptchaData"
22313  OP_59                          // pair (exports, "getCaptchaData")
22314  OP_06 24234                    // JUMP over fn 22317's body

24234  OP_58 22317 6 2 ...             // push fn 22317 closure (6 captures, 2 args)
24252  OP_24                          // STORE_REF:
                                       //   exports.getCaptchaData = fn 22317   ← THE BINDING
24253..24254 cleanup
24255  OP_17                          // push undefined
24256  OP_16                          // VM_EXIT (module factory returns)
```

**Critical finding**: at pc 24252 the STORE_REF writes fn 22317 into
`exports.getCaptchaData`. There is **no** `XMLHttpRequest.prototype.*`
string anywhere in fn 20970's body (nor any `window.*` store beyond the
discarded DEBUGMODE probe). fn 22317 is **not** installed on any
prototype. It is a plain module export.

The **parent captures** that fn 22317 binds to:

| fn 22317 slot | fn 20970 slot | origin |
|---|---|---|
| 17 | 10 | `require(0)` (the "zero" module, often a utility aggregator) |
| 18 | 12 | fn 22038 closure (a per-module helper) |
| 19 | 9 | `require(32)` |
| 20 | 11 | fn 21255 closure |
| **21** | **8** | **`__importDefault(require(42))`** — the **base64 encoder module** |
| **22** | **7** | **`require(40)`** — the **encryptData (XTEA wrapper) module** |

So fn 22317's `slot22.encryptData(plaintext)` call at pc 24163 resolves
to the webpack module at require-id 40, and its `slot21.default.encode(cipher)`
call at pc 24165 resolves to `require(42).default.encode`. These are
intra-vm-slide webpack modules — their bodies were walked as siblings in
the 100 FUNC_CREATE total, but identifying them by their module-ID-to-entry-PC
mapping is out of scope for 44.2.6.

---

## fn 20539 role reconciliation

**Classification verdict: (IV) dead code on the observed Chrome code
path.**

**Evidence for installation** (contradicts pure-dead-code readings):

- fn 20140 pc 20808 `OP_24` stores fn 20539 into the pair
  `[(XHR.prototype), "send"]` built at pcs 20476..20535. The install is
  real in the bytecode. fn 20140 is called **if reached** from its
  parent fn 20107 at pc 20813, and fn 20107 is called from its own
  parent somewhere in root entry 0 at pc 20256 or earlier. Following
  the full install chain back to root entry 0 is out of scope here but
  is not contested.

**Evidence for deadness on the observed Chrome path** (HAR fixture):

- `sample/captcha-har.har` shows the POST `/cap_union_new_verify` body
  is **9504 bytes** with `vData=<152 chars>` embedded as the 40th
  `key=value` field.
- Per `FN-20539-DECOMPILE.md`, fn 20539 on the encrypt path replaces
  the caller's entire body with the 152-char XTEA+base64 ciphertext via
  `savedSend.call(this, ciphertext)` at pc 20770. That output would be
  152 bytes, not 9504.
- A 152-byte body is not what the HAR shows. Therefore fn 20539's
  encrypt path cannot have been taken for this request.
- fn 20539 could still have run and taken its **apply-passthrough**
  tail (pcs 20774..20796) on a guard failure, in which case the body
  passes through unchanged. However, this is not distinguishable from
  "fn 20539 was never installed at all" for the purposes of the HAR —
  the net effect on the body is identical. Functionally, fn 20539 is a
  no-op on this request.
- Given that fn 22317 independently produces an identical-shape vData
  and appends it to the body, and given that fn 20539's apply-passthrough
  would forward the already-appended body unchanged, the **production
  vData origin is fn 22317**, not fn 20539.

**Evidence against classifications (I), (II), (III), (V)**:

- **(I) fn 22317 is a helper called from fn 20539**: No. fn 20539's
  captured helper slot (slot 8) is parent slot 3 of fn 20140 per
  FN-20539-DECOMPILE.md §Arg-and-local table, which is unrelated to fn
  22317. fn 22317 has a different parent (fn 20970) and fn 20539 has no
  mechanism to reach fn 22317 through its captures or through any
  OP_66/OP_02 call site in `[20539, 20796]`.
- **(II) fn 20539 is a helper called from fn 22317**: No. fn 22317's
  captures (parent slots 7, 8, 9, 10, 11, 12) do not include anything
  resolving to fn 20539. fn 22317's only cipher calls go through
  `slot22.encryptData(...)` at pc 24163 and `slot21.default.encode(...)`
  at pc 24165, both resolving to webpack-module imports, not to fn
  20539.
- **(III) sibling handling a different code path**: Close, but the
  HAR evidence goes further than "different code path" — it shows fn
  20539's encrypt path would produce an output inconsistent with the
  observed traffic. fn 20539 either does not run at all or runs through
  its apply-passthrough tail (the guard failing). Both outcomes are
  "dead code" for the vData-producing role. (III) would be correct if
  fn 20539 ran and produced some DIFFERENT output visible in the HAR,
  which is not the case.
- **(V) something else**: The evidence supports a clean (IV)
  classification; no need to invoke a more complex hybrid.

**Note on fn 20353 (the URL-guarded cell-write)**: fn 20353 IS live on
the Chrome path — it is the `open()` patch. On every XHR open, it
checks the URL against `/cap_union_new_verify` and stamps the XHR
instance into the shared cell. If fn 20140 is reached, fn 20353 is
installed, and any test for "is fn 20353 live" can be run dynamically.
That does not affect fn 20539's (IV) classification for this task —
fn 20353's encrypt-enable gate is orthogonal to whether fn 20539's
encrypt path would produce a body shape consistent with the HAR.

---

## Implications for 44.4

**44.4 should NOT reverse a "9504→112 reduction formula".** That
hypothesis is refuted: there is no reduction. The 112-byte plaintext is
**constructed inside fn 22317** from an 8-field schema `["cLod", "env",
"inf", "key", "py", "ss", "tp", "version"]` (after alphabetical sort of
the source-order schema) whose values come from:
- fn 22317's arguments[1] (slot 4 = the caller-supplied options object)
- its captures from fn 20970 (slots 17-22 aliased to parent 10, 12, 9,
  11, 8, 7)
- the handful of nested helper closures (fn 22400 at pc 22663, fn
  22730 at pc 22972, fn 23399 at pc 23727) that compute individual
  field values.

**The real 44.4 scope**: decompile the per-field value-computation
region `[22349, 23740]` of fn 22317. For each of the 8 fields, pin
exactly which capture or helper produces the string, and whether the
value is deterministic. The fixture
`tests/fixtures/vdata-jsdom-capture.json` has a 112-byte plaintext
whose decoded ASCII is `b"ite1on&nvtfpp=&==nr oepCaraton dpiouefle lrs
t n(d ci''rs)en&agrkq&0Lp&eysyCs=Z==Con&dl0=o%ca2Lud&s=vi2TobDebCrn"` —
which has 7 `&` and 8 `=` (consistent with 8 pairs) but appears
byte-scrambled, NOT a plain `k1=v1&k2=v2` form. That scrambling is
**additional transformation** happening somewhere between `slot14.join("&")`
at pc 24161 and the encryptData call at pc 24163 — possibly inside
module 40's `encryptData` pre-processing. 44.4 should either:
1. Decompile the per-field value-computation region of fn 22317 first
   (to verify whether any field's value is an already-scrambled string),
   and if the individual values are clean, then
2. Decompile vm-slide's webpack module 40's `encryptData` entry to find
   the pre-XTEA scrambling step.

One of those two will explain the jsdom fixture's byte shuffling.

**The 44.3 register-machine `isIE9Below()` gate claim still needs
verification** — but is orthogonal to this task. fn 20970/22317 look like
a TS-compiled webpack module, not a browser-version gate.

**FN-20539-DECOMPILE.md open question #1 is closed**: the captured
slot-6 cell is a per-XHR-instance encrypt-enable flag, written by fn
20353 (the open patch) iff `arguments[1] === "/cap_union_new_verify"`.
fn 20539 reads it as its `capturedSlot7 === this` guard at pc 20582.
This is per-XHR-instance URL-gated send encryption, byte-proved.

**CAPTCHA_ORCHESTRATOR.md §6 and §517 (Phase 41/42) claim that
vm-slide's proxyXHR patches `send` to produce vData.** That claim is
**partially true but misleading**: fn 20140's `send` patch (fn 20539)
exists but would produce a 152-byte whole-body replacement that does
not match the HAR. The actual vData producer visible in the HAR is
fn 22317, reached via the orchestrator's import of the vm-slide
`getCaptchaData` export, not via the XHR prototype patch. 44.5 (docs
update) should revise the claim to reflect this split.

---

## Open questions

1. **Which code path does the orchestrator actually use — fn 20539
   (via xhr.send interception) or fn 22317 (via `getCaptchaData`
   import)?** The HAR body shape rules out fn 20539 for this request,
   leaving fn 22317 as the only viable producer. But it is logically
   possible for the orchestrator to call both: fn 22317 first to
   produce `body + "&vData=X"`, then `xhr.send(result)` which passes
   through fn 20539's apply-passthrough (because slot 6 is `undefined`
   — fn 20353 only stamps it on `/cap_union_new_verify`, and
   `xhr.open("POST", "/cap_union_new_verify", ...)` would STAMP it,
   which would then mean fn 20539 tries to encrypt the already-vData-bearing
   body at 9504 bytes). That is the actual contradiction: if the
   orchestrator uses fn 22317 AND opens the XHR to
   `/cap_union_new_verify` AND fn 20140 has run, fn 20539 WILL run on
   the send path and WILL encrypt the 9504-byte body, producing a
   152-char output. HAR body is 9504 bytes, not 152. **Therefore fn
   20140 has NOT run in this HAR capture** — proxyXHR was never
   actually invoked. This is the simplest consistent explanation.
   Verifying this claim requires tracing the install chain from root
   entry 0 through fn 20107 → fn 20140, which is a separate task.

2. **Which webpack module IDs correspond to which vm-slide function
   entries?** `require(40)` and `require(42)` inside fn 20970 map to
   two specific function entries that implement `encryptData` and the
   base64 alphabet encoder respectively. Identifying them requires
   reverse-engineering vm-slide's webpack require-table (the module
   ID → entry PC map stored in some global array at root-module init
   time). Out of scope for 44.2.6.

3. **Per-field value-build semantics.** Fields `.tp`, `.key`, `.py`,
   `.env`, `.version="2"`, `.cLod`, `.inf`, `.ss` — only `.version` is
   pinned (`"2"` at pc 22387). The other 7 fields' value computations
   involve OP_02 method calls on captured helper closures. Decompiling
   them is 44.4's scope.

4. **Why fn 22317's byte-scrambled plaintext fixture**. The
   jsdom-captured plaintext (`tests/fixtures/vdata-jsdom-capture.json`)
   has 7 `&` and 8 `=` matching the schema but is byte-shuffled beyond
   a clean `k1=v1&...` form. Hypothesis: module 40's `encryptData`
   applies a per-byte permutation before XTEA. Verifiable by decompiling
   module 40's entry. Out of scope for 44.2.6.

5. **fn 22317's four nested FUNC_CREATE entries** (fn 22400 at pc
   22663, fn 22730 at pc 22972, fn 23399 at pc 23727, fn 23898 at pc
   23945). These are per-field helper closures. fn 23898 is created
   with 0 args and 0 captures immediately before an `OP_02 1` on
   `[sortedArray, "sort"]`, so it is the `.sort()` comparator — a 0-arg
   no-op function that defers to string comparison. The other three
   are per-field helpers whose bodies are not walked in this task.

6. **fn 20970's full slot map** (all 13 slots and where each gets
   assigned). Slots 4, 5, 6 (arg1, arg2, exports helpers) and 7, 8, 9,
   10 (imported modules) and 11, 12 (intermediate closures) are
   partially resolved above. A complete slot-by-slot table for fn
   20970 would make future module-resolution tasks easier but is not
   needed for 44.2.6's verdict.
