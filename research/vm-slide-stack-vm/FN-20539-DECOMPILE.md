# fn 20539 full static decompile — `XMLHttpRequest.prototype.send` replacement

**Task**: Phase 44 / 44.2.5 — settle the pivot premise by decompiling vm-slide's
`fn 20539` end-to-end from bytecode. Resolves the "pure encrypt stage vs.
self-contained fingerprint builder" question that 44.2 left ambiguous.

Scope: pure static analysis of bytecode range `[20539, 20796]` (257 bytes,
~110 instructions) in `output/vm-slide/bytecode.json` via
`output/vm-slide/disassembly-full.txt`. No tracers, no jsdom. The parent
closure-factory site at pc 20797 (`OP_58 20539 3 1 7 6 8 3 9 4 3`) was read to
pin the capture slots and the argmap.

---

## Summary

**Classification: (A) pure encrypt stage.** fn 20539 is a monkey-patch
installed on `XMLHttpRequest.prototype.send` that takes exactly one argument
— the externally-supplied `body` string — encrypts it by calling fn 15918
(the classical-XTEA encrypt closure) with a `{py: "0"|"1"}` options flag, and
forwards the encrypted result to the **captured saved send** via
`savedSend.call(this, encrypted)`. The function **never reads environment
objects, never enumerates properties, never concatenates `&` or `=` literals**.
Whatever 112-byte plaintext fn 15918 sees, fn 20539 received as
`arguments[0]`. The Phase 43 `docs/CAPTCHA_ORCHESTRATOR.md` §517 claim that
vm-slide's proxyXHR "builds the plaintext at runtime from typeof /
enumeration / stringification" is **not supported by fn 20539's bytecode**.
The single most diagnostic piece of evidence is the absence of any `OP_52`
(TYPEOF) against anything but `arguments[0]`, any `OP_01` (ENUM_KEYS), any
property-name string literals beyond the small DOM/call vocabulary listed in
the "String literals" appendix below, combined with the direct
`arguments[0] → fn15918 → savedSend` data flow.

---

## fn 20539 full pseudocode

Entry convention: the parent factory at pc 20797 creates this closure with
`OP_58 20539 3 1 [7←6] [8←3] [9←4] [argmap[0]=3]`. Per the `FUNC_CREATE`
handler source (`output/vm-slide/dispatch-table.json[58]`), every closure
call enters the nested VM with a local-slot array `A` prefilled as:

```
n[0] = [this]                       // per FUNC_CREATE: A[0] = [this]
n[1] = [arguments]                  // A[1] = [arguments]
n[2] = [w]                          // A[2] = [selfFn]  — fn 20539 itself
n[3] = [arguments[0]]               // via argmap Q[0]=3 → slot 3 gets arg 0
n[4] = (undefined — p[4] not set)   // freshly allocated below
n[5] = (undefined — p[5] not set)
n[6] = (undefined — p[6] not set, allocated below)
n[7] = p[7] = (parent n[6])[0] cell // capture
n[8] = p[8] = (parent n[3])[0] cell // capture: fn 15918
n[9] = p[9] = (parent n[4])[0] cell // capture: original send
```

Per PLAINTEXT-BUILD.md §3 (44.2), parent fn 20140 is the `proxyXHR`
initializer, where parent slot 3 holds the fn 15918 encrypt closure and
parent slot 4 holds the original `XMLHttpRequest.prototype.send`. Parent
slot 6 (captured into our slot 7) is used as a guard compared against
`this` at pc 20582 — see "Open questions".

### Prologue [20539, 20612] — 37 instructions

```text
// pc 20539  OP_40 10     n.length = 10              // trim to fixed frame
// pc 20541  OP_42 2      alloc slot 2 if missing    // (selfFn — already set by FUNC_CREATE)
// pc 20543  OP_42 3      alloc slot 3 if missing    // arg0 already routed here by argmap
// pc 20545  OP_42 4      alloc slot 4               // fresh: will hold py-flag bool
// pc 20547  OP_42 5      alloc slot 5               // fresh: unused in body
// pc 20549  OP_06 20560  JUMP 20560                 // skip the catch entry block at 20552
//
// -- catch-handler entry (reached only via catchPc of TRY_PUSH at pc 20562) --
// pc 20552  OP_33        CLEAR_EXCEPTION            // K = null
// pc 20553  OP_35 20775 0 TRY_PUSH catchPc=20775 excSlot=0   // nested try (vestigial — popped next)
// pc 20556  OP_49        TRY_POP                    // immediately pop
// pc 20557  OP_06 20775  JUMP 20775                 // → tail RETURN_IF_EXC path (apply-passthrough)
//
// -- straight-line prologue body from 20560 --
// pc 20560  OP_42 6      alloc slot 6               // fresh: scratch for new Date() probe
// pc 20562  OP_35 20552 6 TRY_PUSH catchPc=20552 excSlot=6
//                        // guard the entire main path; any throw → 20552 → 20775 → apply-passthrough
// pc 20565  OP_04 … 20575 OP_25 0
//                        // PUSH_EMPTY_STR; STR_APPEND_CHAR 68,97,116,101 → "Date";
//                        // MAKE_GLOBAL_REF [U,"Date"]; NEW_METHOD 0 → new Date()
// pc 20577  OP_05        POP                        // discard the Date — used purely as a
//                                                   // liveness/availability probe (see notes)
// pc 20578  OP_00 7      push n[7][0]               // capture: parent slot 6
// pc 20580  OP_00 0      push n[0][0] = this
// pc 20582  OP_28        STRICT_EQ                  // TOS = (capture7 === this)
// pc 20583  OP_60 20588  JUMP_IF_TRUE 20588         // (TRUE)  → continue to "string" check
// pc 20585  OP_06 20606  JUMP 20606                 // (FALSE) → branch into JUMP_IF_TRUE at 20606
//                                                   // where TOS is still the FALSE bool, so it
//                                                   // falls through to 20608 POP; 20609 JUMP 20774
//                                                   // → apply-passthrough. Effect: if the guard
//                                                   // fails, encrypt is skipped.
// pc 20588  OP_05        POP                        // drop the TRUE bool
// pc 20589  OP_04..20602 OP_10 …
//                        // PUSH_EMPTY_STR; append 115,116,114,105,110,103 → "string"
// pc 20602  OP_00 3      push slot 3 value = arg0 (the body)
// pc 20604  OP_52        TYPEOF                     // TOS = typeof body
// pc 20605  OP_12        EQ                         // TOS = (typeof body == "string")
// pc 20606  OP_60 20612  JUMP_IF_TRUE 20612         // if string → main body
// pc 20608  OP_05        POP                        // drop the bool
// pc 20609  OP_06 20774  JUMP 20774                 // → apply-passthrough tail
```

**Observations for classification**:
- The only environment read in the prologue is `new Date()` at pc 20565..20575,
  whose result is **immediately popped** at pc 20577. It is not consumed.
  This is a liveness probe — its only purpose is to throw if the host
  environment does not expose `Date` as a constructor, which the guarding
  `TRY_PUSH` at 20562 catches and redirects to apply-passthrough.
- The only `OP_52 TYPEOF` in the whole prologue is at pc 20604 against
  `slot 3` (the argument). No typeof probing of any other value.
- The only `OP_32 MAKE_GLOBAL_REF` in the prologue is the one building
  `Date` at pc 20574. No global reads of `window.*`, `navigator.*`, or
  document / screen / history — which would be the hallmark of a
  fingerprint builder.
- No `OP_01 ENUM_KEYS` anywhere in fn 20539 (verified: the opcode does
  not appear in the 20539..20796 window).

### Main body [20612, 20751] — the fn 15918 call site

```text
// (reached from pc 20606 JUMP_IF_TRUE 20612 when typeof body === "string")
// pc 20612  OP_05        POP                        // drop the TRUE bool from prologue
// pc 20613  OP_47 4      push [4]                   // MAKE_LOCAL_REF 4
// pc 20615  OP_08 1      push 1
// pc 20617  OP_23        LOGICAL_NOT                // → false
// pc 20618  OP_36        STORE_LOCAL_REF            // n[4] = false  (py-flag default)
// pc 20619  OP_05        POP                        // drop false
// pc 20620  OP_05        POP                        // drop [4] ref
//
// -- test whether XMLHttpRequest.prototype.send is still === w (self) --
// pc 20621..20670
//            PUSH_EMPTY_STR; append 88,77,76,72,116,116,112,82,101,113,117,101,115,116 → "XMLHttpRequest"
//            MAKE_GLOBAL_REF                        // [U, "XMLHttpRequest"]
//            PUSH_EMPTY_STR; append 112,114,111,116,111,116,121,112,101 → "prototype"
//            GET_PAIR                               // [U.XMLHttpRequest, "prototype"]
// pc 20671..20680
//            PUSH_EMPTY_STR; append 115,101,110,100 → "send"
//            GET_PAIR                               // [(U.XMLHttpRequest).prototype, "send"]
// pc 20681  OP_54        DEREF                      // → XMLHttpRequest.prototype.send
// pc 20682  OP_00 2      push n[2][0] = self (fn 20539 itself = w)
// pc 20684  OP_28        STRICT_EQ                  // (send === w)
// pc 20685  OP_23        LOGICAL_NOT                // !(send === w)
// pc 20686  OP_60 20691  JUMP_IF_TRUE 20691         // if send !== w → flip py flag to true
// pc 20688  OP_06 20701  JUMP 20701
//
// pc 20691  OP_05        POP                        // drop the bool
// pc 20692  OP_47 4      push [4]
// pc 20694  OP_08 0      push 0
// pc 20696  OP_23        LOGICAL_NOT                // → true
// pc 20697  OP_36        STORE_LOCAL_REF            // n[4] = true
// pc 20698  OP_64 0      SWAP_AT 0                  // restacking (effectively a cleanup)
// pc 20700  OP_05        POP
//
// -- build the {py: "0"|"1"} options object and call fn 15918 --
// pc 20701  OP_05        POP                        // drop residual
// pc 20702  OP_47 3      push [3]                   // ref to slot 3 (for later STORE_LOCAL_REF)
// pc 20704  OP_00 8      push n[8][0]               // captured fn 15918 (encrypt closure)
// pc 20706  OP_00 3      push slot 3 value          // the body string
// pc 20708..20721
//            PUSH_EMPTY_STR; append 79,98,106,101,99,116 → "Object"; LOAD_GLOBAL → U["Object"]
// pc 20722  OP_55 0      NEW_FUNC 0                  // newObj = new Object()
// pc 20724  OP_39        DUP                         // [..., [3], fn15918, body, newObj, newObj]
// pc 20725..20730
//            PUSH_EMPTY_STR; append 112,121 → "py"; MK_PAIR → [newObj, "py"]
// pc 20731  OP_00 4      push slot 4 value (the py-flag bool)
// pc 20733  OP_60 20742  JUMP_IF_TRUE 20742          // bool does NOT pop
//
// -- if py-flag is false: push "0" --
// pc 20735  OP_05        POP                         // drop the false bool
// pc 20736  OP_04; OP_10 48 → "0"
// pc 20739  OP_06 20746  JUMP 20746
//
// -- if py-flag is true: push "1" --
// pc 20742  OP_05        POP                         // drop the true bool
// pc 20743  OP_04; OP_10 49 → "1"
//
// -- common continuation --
// pc 20746  OP_24        STORE_REF                   // newObj.py = "0"|"1"  (stack unchanged)
// pc 20747  OP_05        POP                         // drop the "0"/"1" value
// pc 20748  OP_05        POP                         // drop the [newObj,"py"] ref pair
// pc 20749  OP_66 2      CALL_GLOBAL 2               // fn15918.apply(U, [body, newObj])
//                        // stack was [..., [3], fn15918, body, newObj] → [..., [3], result]
// pc 20751  OP_36        STORE_LOCAL_REF             // n[3][0] = result  (slot 3 now holds
//                                                    //  the 152-char base64 ciphertext)
```

### Tail [20751, 20796] — forward encrypted body to saved send

```text
// pc 20752  OP_05        POP                         // drop result
// pc 20753  OP_05        POP                         // drop [3] ref
// pc 20754  OP_47 9      push [9]                    // ref to slot 9 = captured savedSend
// pc 20756..20765
//            PUSH_EMPTY_STR; append 99,97,108,108 → "call"
//            MAKE_LOCAL_PAIR                         // [savedSend, "call"]
// pc 20766  OP_00 0      push this
// pc 20768  OP_00 3      push slot 3 = encrypted ciphertext
// pc 20770  OP_02 2      METHOD_CALL 2               // savedSend.call(this, ciphertext)
// pc 20772  OP_49        TRY_POP                     // end of the TRY_PUSH 20562 region
// pc 20773  OP_16        VM_EXIT                     // return the METHOD_CALL result
//
// -- apply-passthrough tail: reached from 20609 (typeof != string) and
//    from 20557 (catch-handler after any main-path throw) --
// pc 20774  OP_49        TRY_POP
// pc 20775  OP_61        RETURN_IF_EXC               // rethrow if K is set
// pc 20776  OP_47 9      push [9]                    // ref to slot 9 = savedSend
// pc 20778..20789
//            PUSH_EMPTY_STR; append 97,112,112,108,121 → "apply"
//            MAKE_LOCAL_PAIR                         // [savedSend, "apply"]
// pc 20790  OP_00 0      push this
// pc 20792  OP_00 1      push n[1][0] = arguments
// pc 20794  OP_02 2      METHOD_CALL 2               // savedSend.apply(this, arguments)
// pc 20796  OP_16        VM_EXIT                     // return result (end of function)
```

### Consolidated high-level JS equivalent

```js
// fn 20539 — XMLHttpRequest.prototype.send replacement
// Caller-side: installed by parent fn 20140 at pc 20797 via
//   OP_58 20539 3 1 [7←6] [8←3] [9←4] [argmap[0]=3]
// Captures: slot7 = parent slot 6 (guard), slot8 = fn 15918 (encrypt),
//           slot9 = original savedSend.
function w(/* body */) {
  var body = arguments[0];          // slot 3
  var pyFlag = false;               // slot 4, default
  try {                             // TRY_PUSH at pc 20562, catchPc = 20552
    new Date();                     // liveness probe; throws → catch → apply-passthrough
    if (capturedSlot7 !== this) {   // guard at pc 20582; if false → apply-passthrough
      return savedSend.apply(this, arguments);
    }
    if (typeof body !== "string") { // pc 20602..20605
      return savedSend.apply(this, arguments);
    }
    if (XMLHttpRequest.prototype.send !== w) {  // pc 20621..20686
      pyFlag = true;
    }
    var ciphertext = fn15918(body, { py: pyFlag ? "1" : "0" });  // pc 20749
    return savedSend.call(this, ciphertext);                     // pc 20770
  } catch (e) {
    return savedSend.apply(this, arguments);   // pc 20774..20796
  }
}
```

---

## Arg-and-local table

| slot | at entry (after FUNC_CREATE + OP_40 10) | after prologue [20539..20611] | after fn 15918 call at pc 20751 |
|---|---|---|---|
| 0 | `[this]` — the XHR instance (or whatever the caller set as receiver) | unchanged | unchanged |
| 1 | `[arguments]` — the `arguments` object of the send call | unchanged | unchanged |
| 2 | `[w]` — fn 20539 itself (selfFn) | unchanged | unchanged |
| 3 | `[arguments[0]]` — the caller-supplied body string (via argmap Q[0]=3) | unchanged (the typeof == "string" check reads but does not mutate) | **overwritten** with the 152-char base64 ciphertext via STORE_LOCAL_REF at pc 20751 |
| 4 | `[undefined]` (freshly allocated by OP_42 4 at pc 20545; p[4] was not captured) | **initialized to `false`** at pc 20613..20618; possibly flipped to `true` at pc 20691..20697 if `XMLHttpRequest.prototype.send !== w` | unchanged (no longer read after pc 20731) |
| 5 | `[undefined]` (fresh, OP_42 5 at pc 20547) | unchanged — never read in the body | unchanged |
| 6 | `[undefined]` (fresh, OP_42 6 at pc 20560) | unchanged after the `new Date()` probe which does not write it — slot 6 is the TRY_PUSH exception-write slot only; only written if the try body throws | unchanged |
| 7 | `[parent n[6][0]]` — captured at closure creation; read-only for the lifetime of the call | compared against `this` at pc 20582 but not mutated | unchanged |
| 8 | `[parent n[3][0]]` — captured **fn 15918** (the classical-XTEA encrypt closure, per 44.2 and the PLAINTEXT-BUILD.md §3 callsite) | read at pc 20704 as the function to call; never written | unchanged |
| 9 | `[parent n[4][0]]` — captured **original `XMLHttpRequest.prototype.send`** (saved before monkey-patch, per 44.2) | unread until the tail; never written | unchanged — read as `.call` receiver at pc 20754 or `.apply` receiver at pc 20776 |

**Slot 3 identity pin**: `OP_40 10` (pc 20539) + `OP_42 3` (pc 20543) create the
slot; the argmap entry `Q[0]=3` in the parent's `OP_58` header at pc 20797
routes `arguments[0]` into `n[3]` at each call (FUNC_CREATE closure body:
`A[Q[C]] = [arguments[C]]`). The first write in fn 20539 itself that touches
slot 3 is the STORE_LOCAL_REF at **pc 20751**, which overwrites it with the
fn 15918 return value. Between pc 20539 and pc 20751, the only read of slot 3
is `OP_00 3` at pc 20602 (for the `typeof` probe) and pc 20706 (as the
first arg to fn 15918). The prologue does not mutate slot 3.

**Slot 4 identity pin**: `OP_42 4` at pc 20545 allocates the slot fresh
(p[4] was not a capture). The first write is `OP_36` at pc 20618 setting
`n[4] = false`. A conditional second write at pc 20697 sets `n[4] = true`
iff `XMLHttpRequest.prototype.send !== w`. At the fn 15918 call, slot 4's
value becomes the `"0"` or `"1"` string stored into `newObj.py`. This is
the **entire** role of slot 4 — it is a py-flag carrying a first-install
indicator into the encryptor. It is not a buffer, it is not related to
fn 15918's slot-4 first loop semantics, and it definitely is not the
"saved send === current send" reading from 44.2 §7 — 44.2 mis-read which
send-equality branch wrote which bool, but the correct flag value matches
the same semantic: "is this the first invocation before the patch is
visible".

---

## Classification verdict: (A) pure encrypt stage

Evidence, with pc references:

1. **Only one data input**, received as `arguments[0]` and routed to
   slot 3 via the parent closure's argmap `Q[0]=3` at pc 20797. No other
   external data source is read by the function.
2. **No environment probing in the prologue.** The prologue's only global
   access is `new Date()` at pc 20565..20575, whose result is POPped at
   pc 20577 — it is a try/catch liveness probe, not a data source. There is
   no `OP_01 ENUM_KEYS` anywhere in 20539..20796. There is no `OP_52 TYPEOF`
   anywhere except pc 20604 (against `slot 3`).
3. **No string-concatenation of `key=value&...`.** The only `OP_10`-built
   string literals in the function are (in order): `"Date"`, `"string"`,
   `"XMLHttpRequest"`, `"prototype"`, `"send"`, `"Object"`, `"py"`, `"0"`,
   `"1"`, `"call"`, `"apply"`. None of these are fingerprint field names, and
   no `&` (38) or `=` (61) character byte is ever pushed via `OP_10`.
4. **Slot 3 flows verbatim into fn 15918.** At pc 20706, `OP_00 3` pushes
   the unmodified body string as fn 15918's first argument. The prologue
   never writes slot 3.
5. **The result is forwarded to the captured original send.** At pc 20770,
   `savedSend.call(this, ciphertext)` sends the encrypted body to the
   real `XMLHttpRequest.prototype.send`. On any failure path (non-string
   body, failed guard, thrown exception), the tail at pc 20776..20796 calls
   `savedSend.apply(this, arguments)` — full pass-through.

Therefore fn 20539 **receives** a 112-byte plaintext from the JS caller and
**produces** its XTEA-encrypt-+-base64 encoded form as the body forwarded to
the real `send`. It is a monkey-patch send replacement, and the 112-byte
plaintext originates **outside vm-slide**. The 44.2 pivot premise stands;
the `CAPTCHA_ORCHESTRATOR.md` §517 claim that vm-slide's proxyXHR builds the
plaintext from environment probes is contradicted by this decompile.

Classification (C) "hybrid" is ruled out because the prologue performs zero
augmentation — the body string bytes delivered to fn 15918 at pc 20706 are
literally `arguments[0]`, untouched.

---

## Fixture cross-check

The committed jsdom and HAR fixtures each carry a 112-byte plaintext with
exactly 8 `=` bytes and 7 `&` bytes forming 8 `key=value` pairs separated by
7 `&`. Under classification (A), this shape must be produced by the
orchestrator (`t_captcha_slide.js`, module 56 per Phase 41) and delivered
verbatim via `xhr.send(plaintext)`.

Check: is there any mechanism by which fn 20539's body could produce 8 `=`
or 7 `&` characters out of thin air? **No.** The only characters ever
written into any string inside fn 20539 are the ones enumerated in
"Evidence (3)" above, none of which are `=` (61) or `&` (38). There is no
`String.fromCharCode`-style opcode that assembles arbitrary character codes
from data; `OP_10` takes an immediate operand baked into the bytecode. A
grep over the fn 20539 byte range `[20539, 20796]` in bytecode.json for the
operand pair `[10, 61]` or `[10, 38]` returns zero matches (spot-checkable).

So the observed `&`- and `=`-delimited plaintext shape is, under our
classification, an assertion that the orchestrator builds this form and
passes it as the send body. Phase 44's downstream tasks (44.3 and onward)
need to reverse the orchestrator's body-build path to explain the 8-pair
shape, the per-run-variable content, and why it happens to be exactly 112
bytes.

Consistency with 44.2: PLAINTEXT-BUILD.md §3 pinned fn 20539 slot 3 as "the
112-byte plaintext". That claim stands. PLAINTEXT-BUILD.md §7's "slot 4
contradiction" was a confusion about the TWO different slot-4s involved
(fn 20539 slot 4 = py-flag bool, fn 15918 slot 4 = something fn 15918 slices).
Resolving fn 15918's slot 4 is a separate task owned by 44.2's fn 15918
decompile and is out of scope here.

---

## Implications for 44.3 / 44.4 / 44.5b

**44.3 (orchestrator plaintext assembly)**: Target **`t_captcha_slide.js`,
module 56** (the Phase-41 orchestrator core), not vm-slide bytecode.
Reverse the XHR send body-build path: find where the 112-byte
`key=value&...` string is assembled, who supplies the 8 keys and their
values, and why the final size is exactly 112 bytes. fn 20539 is confirmed
to be a pass-through sink — it does not add, remove, or reshape a single
byte of the plaintext.

**44.4 (plaintext field taxonomy)**: The 8 key=value pairs' semantic meaning
comes from the orchestrator's build-site, not from vm-slide. Once 44.3
locates the build-site, 44.4 enumerates the fields there (likely JS-level
`navigator.*`, `window.screen.*`, or timing values — but this is a
prediction, not a finding). Do **not** look for these inside vm-slide.

**44.5b (CAPTCHA_ORCHESTRATOR.md §517 correction)**: `docs/CAPTCHA_ORCHESTRATOR.md`
§517 needs to be revised to remove the claim that vm-slide's proxyXHR
"builds the plaintext at runtime from typeof / enumeration / stringification".
The correct statement is: vm-slide's proxyXHR **monkey-patches
`XMLHttpRequest.prototype.send`** and encrypts whatever string body the
caller passes; the plaintext is built by the orchestrator before it reaches
the patched send. The py flag is `"1"` on the first invocation (before the
patch is observable via `XMLHttpRequest.prototype.send === w`) and `"0"`
thereafter. 44.5b should also pin the exact parent closure (fn 20140) and
the capture slots documented above.

---

## Open questions

1. **Parent slot 6 guard semantic (pc 20582 `STRICT_EQ capture7 === this`).**
   Captured from parent fn 20140 slot 6; cannot be resolved without
   decompiling fn 20140's prologue. It is used as a pre-gate: if the guard
   fails, fn 20539 falls through to apply-passthrough without encrypting.
   Candidates include: the XHR instance captured at install time, the
   saved `XMLHttpRequest.prototype` object, or a sentinel from the
   orchestrator. Needs parent-function decompile or a dynamic trace to pin.
2. **The `{py}` options flag consumption inside fn 15918.** fn 15918
   receives a 2-arg call `(body, {py})`. 44.2's read of fn 15918's slot 4
   first-loop is inconsistent with this shape (the loop treats slot 4 as a
   16-byte sliceable buffer). Either 44.2 mis-read fn 15918's first loop or
   the loop is dead code on the encrypt path. **Out of scope here**; owned
   by a follow-up fn 15918 re-read task in Phase 44.
3. **Why the `new Date()` liveness probe at pc 20565..20577.** A `Date`
   constructor is always available in DOM environments; the probe seems
   vestigial. It may be dead IE9-era detection, or an anti-DevTools timing
   trick. Not load-bearing for the classification; leaving unresolved.
4. **How many of the 101 FUNC_CREATE sites in vm-slide also replace `send`.**
   Static analysis of fn 20539 alone cannot rule out additional vm-slide
   internal send-patches that target the already-patched prototype. Phase
   41's flow analysis (`docs/CAPTCHA_ORCHESTRATOR.md` §5) is the authority
   on the install count, but that doc's own §517 is incorrect per this
   decompile, so 44.5b should audit the full install chain.

---

## Appendix — String literals built by fn 20539

Every string literal assembled by `OP_10` bytes in `[20539, 20796]`:

| char-code sequence (pc range) | literal |
|---|---|
| 68,97,116,101 (20566..20572) | `"Date"` |
| 115,116,114,105,110,103 (20590..20600) | `"string"` |
| 88,77,76,72,116,116,112,82,101,113,117,101,115,116 (20622..20648) | `"XMLHttpRequest"` |
| 112,114,111,116,111,116,121,112,101 (20652..20668) | `"prototype"` |
| 115,101,110,100 (20672..20678) | `"send"` |
| 79,98,106,101,99,116 (20709..20719) | `"Object"` |
| 112,121 (20726..20728) | `"py"` |
| 48 (20737) | `"0"` |
| 49 (20744) | `"1"` |
| 99,97,108,108 (20757..20763) | `"call"` |
| 97,112,112,108,121 (20779..20787) | `"apply"` |

No `&` (38), no `=` (61), no fingerprint-field names, no `navigator`,
`screen`, `document`, `window`, `toString`, or `hasOwnProperty`. This table
is the strongest single piece of negative evidence for classification (A).
