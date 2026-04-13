# vData plaintext-build — fn 15918 pseudocode decompile

**Task**: Phase 44 / 44.2 — static pseudocode decompile of vm-slide's
plaintext-build + XTEA-encrypt-driver function `fn 15918`
(body `[15918, 16230]`), plus the call-site context in `fn 20539` at
pc 20749 where the input buffer originates.

**Status**: closed for the cipher-driver loop; one static contradiction
around the first sub-loop logged to open questions for 44.3 to resolve
with a runtime trace.

## Summary

`fn 15918` is a **driver closure**, not the fingerprint builder. Its
second loop (pcs 16074..16224) iterates `i = 0, 8, 16, ..., 104` over a
112-byte input buffer held in local slot 3, slicing it 8 bytes at a time
into two 4-byte halves, packing each half into a LE uint32 via captured
upvalue slot 9, calling the XTEA encrypt closure (upvalue slot 10,
pinned by Phase 40.6 / 44.1) with the `[v0, v1]` pair, unpacking the
mutated words back to a 4-byte string via captured upvalue slot 11, and
appending the 8 ciphertext bytes to an accumulator in slot 8. After 14
iterations slot 8 holds the raw (pre-base64) XTEA ciphertext, which
fn 15918 returns.

The plaintext buffer itself — the 112-byte `key=value&...` fingerprint —
is **not built inside fn 15918**. It is passed in as argument 0 by the
fn 20539 proxyXHR send-handler at pc 20749, which in turn reads it from
its own local 3 — the `body` argument the orchestrator code passed to
the intercepted `XMLHttpRequest.prototype.send(body)` call. **The
fingerprint is therefore built upstream of vm-slide**, in the orchestrator
bundle (`t_captcha_slide.js`). Phase 44.3 owns tracing where the
orchestrator assembles those 8 `key=value` pairs.

A short first sub-loop (pcs 15989..16064) appears to pack a 16-byte
value from local 4 into 4 uint32 words stored in local 7. Local 4 is
fn 15918's argument 1, which fn 20539 constructs at pc 20722..20749 as
a plain `{py: "0" or "1"}` Object — an object that has no `.slice`
method. The static read is unambiguous, so this is filed as an open
question in section 7: either the first loop is effectively a no-op via
a path I have not traced, or slot 4's runtime value differs from the
static call-site reading. 44.3 dynamic instrumentation will resolve
this.

## Inputs

- `output/vm-slide/bytecode.json` — 24,273-element bytecode.
- `output/vm-slide/disassembly-full.txt` — Phase 40.1 full-coverage
  walker output. Both `fn 15918` `[15918, 16230]` and `fn 20539`
  `[20539, 20796]` are decoded here; this doc reads them as-is.
- `output/vm-slide/dispatch-table.json` — 69-slot dispatch table source
  bodies. Used to pin precise stack effects for OP_47 / OP_59 / OP_63 /
  OP_36 / OP_54 / OP_41 / OP_58 / OP_64 (the ones whose behaviour is
  not immediately obvious from the mnemonic).
- `output/vm-slide/vdata-callgraph.json` — 44.1 artifact. Used for:
  - `covering_function_entries` — fn 15918 body range confirmation
  - `static_cross_check[0].static_call_site_count = 11` — call-site
    count target for the classification table
  - `ancestor_chains` — confirms `fn 20539 --pc 20749--> fn 15918
    --pc 16182 x14--> fn 15241` call chain
  - `key_closure_spawn_sites[15918].spawn_pc = 16231` — OP_58 operand
    bytes read from `bytecode.json` at that offset
- `docs/VM_SLIDE_OPCODES.md` — authoritative opcode table. Stack
  effects for all 53 handlers below come from this doc cross-checked
  against the raw handler sources in `dispatch-table.json`.
- `tests/fixtures/vdata-jsdom-capture.json` — jsdom run fixture with
  `plaintext_hex` and `plaintext_blocks_le`. Used for the block-zero
  LE-packing cross-check in section 5.
- `research/vm-slide-stack-vm/plaintext-callgraph.md` — 44.1 narrative.
  Starting-point context only; not restated here.

## 1. fn 15918 body structure (by pc range)

| pc range | role |
|---|---|
| 15918..15934 | prologue: stack-len 12, alloc locals 2..8, push `[6]` ref |
| 15936..15954 | pre-loop: `slot6 = new Array(2)` |
| 15955..15975 | pre-loop: `slot7 = new Array(4)` |
| 15976..15981 | pre-loop: `slot8 = ""` (output accumulator) |
| 15982..15988 | pre-loop: `slot5 = 0` (loop index `i`) |
| 15989..16000 | **first loop** header: `while (i < 4) { ... }` |
| 16002..16063 | first loop body: `slot7[i] = uPack(slot4.slice(4*i, 4*(i+1)))` |
| 16064 | first loop backedge: `OP_06 15989` |
| 16067..16073 | between loops: reset `slot5 = 0` |
| 16074..16100 | **second loop** header: `while (i < slot3.length) { ... }` |
| 16102..16175 | second loop body part A: pack one 8-byte block into `slot6 = [v0, v1]` |
| 16176..16184 | second loop body part B: `encrypt(slot6, slot7)` via upvalue slot 10 |
| 16185..16213 | second loop body part C: unpack encrypted words and append to `slot8` |
| 16214..16223 | second loop body part D: `slot5 = i + 8` |
| 16224 | second loop backedge: `OP_06 16074` |
| 16227..16230 | epilogue: push slot 8, VM_EXIT (return `slot8`) |

Slots used inside fn 15918:

| slot | role | how initialised |
|---|---|---|
| 0 | `[this]` | auto by FUNC_CREATE closure |
| 1 | `[arguments]` | auto by FUNC_CREATE closure |
| 2 | `[w]` (self-ref) | auto by FUNC_CREATE closure |
| 3 | **arg 0** — 112-byte plaintext string (`key=value&...`) | argmap `[3, 4]` entry 0 = slot 3 |
| 4 | **arg 1** — flag/options object `{py: "0"\|"1"}` (see §7 for unresolved usage) | argmap `[3, 4]` entry 1 = slot 4 |
| 5 | loop index `i` | `slot5 = 0` at pcs 15982..15986 |
| 6 | `new Array(2)` — `[v0, v1]` block container | pcs 15936..15952 |
| 7 | `new Array(4)` — 4 uint32 words populated by first loop | pcs 15955..15973 |
| 8 | `""` — output ciphertext accumulator (returned) | pcs 15976..15979 |
| 9 | **upvalue** — uint32-packer (4-byte buffer → LE uint32) | capture from parent (fn 15220); role pinned by use sites 16039, 16133, 16171 and by the LE-packing cross-check in §5 |
| 10 | **upvalue** — XTEA encrypt closure (ENC_ENTRY = pc 15241) | capture from parent fn 15220 — this is the 44.1 / Phase 40.6 encrypt closure reference |
| 11 | **upvalue** — uint32-unpacker (LE uint32 → 4-byte string) | capture from parent (fn 15220); role pinned by use sites 16197, 16207 (output-phase) |

Capture mapping read from `bc[16231..16242] = [58, 15918, 3, 2, 9, 8, 10, 6, 11, 9, 3, 4]`
via the OP_58 handler source
`for(B=0;B<A;B++) p[m[g++]] = n[m[g++]]`:
`p[9] = n[8]`, `p[10] = n[6]`, `p[11] = n[9]`. So fn 15918 slot 9 is
copied from fn 15220's slot 8, slot 10 from slot 6, slot 11 from slot 9.
(44.1's slot-9/10/11 numbering stands; the parent-side src slots I
read here differ from 44.1's narrative but do not affect the fn 15918
semantics — slot 10 is definitively the encrypt closure per the
runtime trace showing enter events from pc 16182 into ENC_ENTRY.)

## 2. fn 15918 pseudocode

```js
// fn 15918  body [15918, 16230]  spawned at pc 16231 by factory fn 15220
// capture frame: slot 9 = uint32Pack(bytes4)  (upvalue from parent)
//                slot 10 = xteaEncrypt(pair, extra)  (upvalue, ENC_ENTRY=15241)
//                slot 11 = uint32Unpack(u32)  (upvalue from parent)
// argmap: arg 0 -> slot 3, arg 1 -> slot 4
function fn15918(arg0_plaintext_112, arg1_py_flag_obj) {
  // ---- prologue (pcs 15918..15934) ----
  // OP_40 12: set stack length to 12
  // OP_42 2..8: ensure locals 2..8 are 1-cell arrays
  // OP_47 6: push [6] (ref to slot 6; will be consumed by the first STORE_LOCAL_REF)

  // ---- pre-loop setup (pcs 15936..15988) ----
  let slot6 = new Array(2);      // pcs 15936..15952  (via OP_25 1 at pc 15950: `new U.Array(2)`)
  let slot7 = new Array(4);      // pcs 15955..15973  (via OP_25 1 at pc 15971: `new U.Array(4)`)
  let slot8 = "";                // pcs 15976..15979
  let i    = 0;                  // pcs 15982..15986  (slot 5)

  // ---- first loop (pcs 15989..16064) ----
  // Header (pcs 15989..15999): while (i < 4)
  //   15989 OP_47 5 / 15991 OP_63: load i
  //   15992 OP_08 4: push 4
  //   15994 OP_62 / 15995 OP_23: !(i >= 4) = (i < 4)
  //   15996 OP_60 16002: JUMP_IF_TRUE -> loop body at 16002
  //   15998 OP_05 / 15999 OP_06 16067: else jump past loop to 16067
  while (i < 4) {
    // Body (pcs 16002..16063): slot7[i] = uPack(slot4.slice(4*i, 4*(i+1)))
    //   16002 OP_05:      pop cond
    //   16003 OP_47 7:    push [7]    (write-target ref, slot 7)
    //   16005 OP_00 5:    push i
    //   16007 OP_59:      MAKE_LOCAL_PAIR -> [slot7_array, i]  (write target slot7[i])
    //   16008 OP_00 9:    push upvalue_9  (uPack)
    //   16010 OP_47 4:    push [4]
    //   16012..16023:     build "slice"
    //   16023 OP_59:      MAKE_LOCAL_PAIR -> [slot4_value, "slice"]
    //   16024 OP_08 4:    push 4
    //   16026 OP_00 5:    push i
    //   16028 OP_67:      MUL -> 4*i
    //   16029 OP_08 4:    push 4
    //   16031 OP_00 5:    push i
    //   16033 OP_08 1:    push 1
    //   16035 OP_20:      ADD -> i+1
    //   16036 OP_67:      MUL -> 4*(i+1)
    //   16037 OP_02 2:    METHOD_CALL 2: slot4.slice(4*i, 4*(i+1))
    //   16039 OP_66 1:    CALL_GLOBAL 1: uPack(slot4.slice(4*i, 4*(i+1)))
    //   16041 OP_24:      STORE_REF:  slot7[i] = result    (non-popping)
    //   16042..16043 POP POP
    slot7[i] = uPack(slot4.slice(4*i, 4*(i+1)));

    // Increment (pcs 16044..16063): i += 1
    //   Uses a register-file dance with OP_47 5 / OP_39 / OP_63 / OP_39
    //   / OP_64 1 / OP_64 0 / OP_08 1 / OP_20 / OP_36 / OP_05 / OP_50 0
    //   / OP_64 0 / OP_56 / OP_05.  Net effect: slot5 = slot5 + 1.
    //   (See §7 — the SWAP_AT/REPLACE_TOP_K/OR micro-dance is opaque
    //   but the pattern matches the standard "load-DUP-increment-store"
    //   idiom modulo a stray OR with 0 that leaves the sum unchanged.)
    i++;
    // 16064 OP_06 15989: JUMP back to header
  }

  // After first loop: slot7 holds 4 uint32 words packed from slot4's
  // bytes 0..16.  (See §7 — slot 4 is newObj from fn 20539 at pc 20749,
  // which has no .slice method in the statically visible construction,
  // so either the first loop is a no-op at runtime or slot 4's runtime
  // value differs from the static call-site read.)

  // ---- between loops (pcs 16067..16073): reset i = 0 ----
  i = 0;
  // 16067 OP_47 5 / 16069 OP_08 0 / 16071 OP_36 / 16072..16073 POP POP

  // ---- second loop (pcs 16074..16224) ----
  // Header (pcs 16074..16100): while (i < slot3.length)
  //   16074 OP_47 5 / 16076 OP_63: load i
  //   16077 OP_47 3 / 16079..16090 "length" / 16092 OP_59 / 16093 OP_54:
  //     DEREF to get slot3.length
  //   16094 OP_62 / 16095 OP_23: !(i >= slot3.length) = (i < slot3.length)
  //   16096 OP_60 16102: JUMP_IF_TRUE -> loop body
  //   16098 OP_05 / 16099 OP_06 16227: else jump to epilogue
  while (i < slot3.length) {        // slot3 = 112-byte plaintext; loop runs 14 times
    // Body part A (pcs 16102..16175): pack one 8-byte block into slot6 = [v0, v1]
    //   pcs 16103..16137 produce   slot6[0] = uPack(slot3.slice(i,   i+4))  // v0
    //   pcs 16138..16175 produce   slot6[1] = uPack(slot3.slice(i+4, i+8))  // v1
    //
    //   Low-level decode of pcs 16103..16137:
    //     16103 OP_47 6:       push [6]         (write target slot6)
    //     16105 OP_08 0:       push 0
    //     16107 OP_59:         MAKE_LOCAL_PAIR -> [slot6_array, 0]
    //     16108 OP_00 9:       push upvalue_9   (uPack)
    //     16110 OP_47 3:       push [3]
    //     16112..16123 "slice"
    //     16123 OP_59:         MAKE_LOCAL_PAIR -> [slot3_value, "slice"]
    //     16124 OP_00 5:       push i
    //     16126 OP_00 5:       push i
    //     16128 OP_08 4:       push 4
    //     16130 OP_20:         ADD -> i+4
    //     16131 OP_02 2:       METHOD_CALL slot3.slice(i, i+4)
    //     16133 OP_66 1:       CALL_GLOBAL uPack(slot3.slice(i, i+4))
    //     16135 OP_24:         STORE_REF slot6[0] = that
    //     16136..16137 POP POP
    //   Analogous pattern for slot6[1] at pcs 16138..16175, using
    //   slot3.slice(i+4, i+8).
    slot6[0] = uPack(slot3.slice(i,     i + 4));   // v0 = LE uint32 of bytes[i..i+4]
    slot6[1] = uPack(slot3.slice(i + 4, i + 8));   // v1 = LE uint32 of bytes[i+4..i+8]

    // Body part B (pcs 16176..16184): call encrypt
    //   16176 OP_00 10: push upvalue_10   (xteaEncrypt closure, ENC_ENTRY=15241)
    //   16178 OP_00 6:  push slot6         = [v0, v1]
    //   16180 OP_00 7:  push slot7         = 4-uint32 buffer from first loop
    //   16182 OP_66 2:  CALL_GLOBAL 2: xteaEncrypt(slot6, slot7)  <-- the 14x encrypt call
    //   16184 OP_05:    POP discard return value (encrypt mutates slot6 in place)
    xteaEncrypt(slot6, slot7);
    // Per Phase 43 (VDATA_FORMAT.md): classical XTEA with 32 rounds,
    // delta 0x9E3779B9, key "2e430f8c15b7da96" baked into the encrypt
    // closure. The encrypt closure mutates its first arg (the
    // [v0, v1] pair) in place with the ciphertext words. See §7 for
    // the unresolved role of the second arg (slot 7).

    // Body part C (pcs 16185..16213): append ciphertext bytes to slot8
    //   16185 OP_47 8:    push [8]      (write target slot8)
    //   16187 OP_39:      DUP  ([8], [8])
    //   16188 OP_63:      LOAD_LOCAL_REF -> slot8 value (pops one [8])
    //                      stack: [..., [8], slot8_value]
    //   16189 OP_00 11:   push upvalue_11 (uUnpack: uint32 -> 4-byte string)
    //   16191 OP_47 6:    push [6]
    //   16193 OP_08 0:    push 0
    //   16195 OP_59:      MAKE_LOCAL_PAIR -> [slot6_array, 0]
    //   16196 OP_54:      DEREF -> slot6[0] (now the encrypted v0)
    //   16197 OP_66 1:    CALL_GLOBAL uUnpack(slot6[0])  -> 4-char string
    //   16199 OP_00 11:   push upvalue_11 again
    //   16201 OP_47 6 / 16203 OP_08 1 / 16205 OP_59 / 16206 OP_54:
    //     DEREF slot6[1] (encrypted v1)
    //   16207 OP_66 1:    CALL_GLOBAL uUnpack(slot6[1])  -> 4-char string
    //   16209 OP_20:      ADD (string concat) -> 8-char block string
    //   16210 OP_20:      ADD -> slot8_value + 8-char block string
    //   16211 OP_36:      STORE_LOCAL_REF: slot8 = slot8 + block string
    //   16212..16213 POP POP
    slot8 = slot8 + uUnpack(slot6[0]) + uUnpack(slot6[1]);

    // Body part D (pcs 16214..16223): i += 8
    //   16214 OP_47 5 / 16216 OP_39 / 16217 OP_63:
    //     push [5], [5], slot5_value -> stack has two [5] refs and the value
    //   16218 OP_08 8 / 16220 OP_20:  push 8, ADD -> i + 8
    //   16221 OP_36:     STORE_LOCAL_REF slot5 = i + 8
    //   16222..16223 POP POP
    i = i + 8;
    // 16224 OP_06 16074: JUMP back to header
  }

  // ---- epilogue (pcs 16227..16230) ----
  // 16227 OP_47 8 / 16229 OP_63: load slot8
  // 16230 OP_16: VM_EXIT (returns TOS)
  return slot8;   // 14 * 8 = 112 bytes of raw XTEA ciphertext
}
```

## 3. fn 20539 -> fn 15918 call-site snippet (pcs 20702..20751)

```js
// fn 20539  body [20539, 20796]  = proxyXHR's XMLHttpRequest.prototype.send patch
// argmap: arg 0 -> slot 3  (single argument: the body string passed to xhr.send(body))
// captures from parent fn 20140 (OP_58 at pc 20797, captures bytes [7,6,8,3,9,4]):
//   p[7] = n[6]  -> slot 7 from parent slot 6
//   p[8] = n[3]  -> slot 8 from parent slot 3  <-- this is fn 15918
//   p[9] = n[4]  -> slot 9 from parent slot 4

// Immediately upstream context (pcs 20612..20701) establishes fn 20539 slot 4:
//   - at pcs 20621..20681: dereferences XMLHttpRequest.prototype.send
//   - at pcs 20682..20700: compares it against slot 2 (the saved original
//     send reference) via OP_28 STRICT_EQ
//   - slot 4 := (savedSend === currentSend ? false : true)
//     i.e. slot 4 is a boolean flag: has the XHR send prototype been
//     re-patched since we installed our handler?

// Call site (pcs 20702..20751):
//   20702 OP_47 3:    push [3]              (ref, prepared for later STORE)
//   20704 OP_00 8:    push slot 8           (captured upvalue = fn 15918)
//   20706 OP_00 3:    push slot 3           (arg 0 to fn 15918 = the send body)
//   20708..20721:     build "Object", LOAD_GLOBAL -> U.Object
//   20722 OP_55 0:    NEW_FUNC 0: new U.Object()  -> newObj = {}
//   20724 OP_39:      DUP                   (needed so one copy survives for the call)
//   20725..20730:     build "py", MK_PAIR -> [newObj, "py"]
//   20731 OP_00 4:    push slot 4           (the boolean flag)
//   20733 OP_60 20742: JUMP_IF_TRUE 20742 (non-popping)
//   20735..20739:     fall-through branch (slot4 false): push "0", jump 20746
//   20742..20745:     taken branch (slot4 true):         push "1"
//   20746 OP_24:      STORE_REF newObj.py = "0" or "1"   (non-popping)
//   20747..20748 POP POP                    (clean pair + value)
//   20749 OP_66 2:    CALL_GLOBAL 2: fn15918.apply(U, [slot3, newObj])
//   20751 OP_36:      STORE_LOCAL_REF: slot3 = return value of fn 15918
fn20539_callsite: {
  let newObj = new Object();
  newObj.py = slot4 ? "1" : "0";                // "is-patched" flag
  slot3 = fn15918(slot3, newObj);                // slot3 was send body; becomes ciphertext
  // slot3 is later used at pcs 20754..20770 to concat "call" / "apply"
  // handlers against other captured slots before the enclosing send
  // handler returns — that tail is outside the 20-instruction window
  // task 44.2 scopes.
}
```

So **fn 20539 slot 3 (the send body) is the 112-byte plaintext** that
fn 15918 receives as its argument 0. Upstream of fn 20539, slot 3 is
the single argument fn 20539's caller (native JS — the patched
`XMLHttpRequest.prototype.send`) was invoked with. That means the
fingerprint is built by the orchestrator bundle `t_captcha_slide.js`
BEFORE the xhr.send call — **vm-slide only encrypts it**. 44.3 owns
the orchestrator-side trace.

## 4. Per-iteration block extraction (one-sentence summary)

Loop index `i` in local slot 5, advancing by 8 each iteration; on each
iteration the body packs `slot3.slice(i, i+4)` and `slot3.slice(i+4, i+8)`
into `slot6[0]` and `slot6[1]` respectively via captured upvalue slot 9
(a LE uint32 packer), calls `xteaEncrypt(slot6, slot7)` via captured
upvalue slot 10 at pc 16182, then appends `uUnpack(slot6[0]) + uUnpack(slot6[1])`
to `slot8` via captured upvalue slot 11.

## 5. Block-extraction fixture cross-check

Fixture: `tests/fixtures/vdata-jsdom-capture.json` (jsdom single-run
capture, committed 2026-04-13).

Block index verified: **0**.

Plaintext slice (first 8 bytes of `plaintext_hex`):
```
69 74 65 31 6f 6e 26 6e        (ASCII: "ite1on&n")
```

Expected block from fixture `plaintext_blocks_le[0]`:
```
[ 828732521, 1848012399 ]
```

LE uint32 packing by hand (what the pseudocode does for v0 and v1):

```
v0 = LE(69 74 65 31) = 0x31656574... wait let me do this right
   bytes are [0x69, 0x74, 0x65, 0x31]
   LE uint32 = 0x69 | (0x74 << 8) | (0x65 << 16) | (0x31 << 24)
             = 0x31657469
             = 828732521   decimal  ✓

v1 = LE(6f 6e 26 6e)
   bytes are [0x6f, 0x6e, 0x26, 0x6e]
   LE uint32 = 0x6f | (0x6e << 8) | (0x26 << 16) | (0x6e << 24)
             = 0x6e266e6f
             = 1848012399  decimal  ✓
```

Both match `plaintext_blocks_le[0]` exactly. This confirms:

1. Upvalue slot 9 in fn 15918 is a **little-endian 4-byte → uint32
   packer**.
2. fn 15918's second loop extracts plaintext bytes in plain sequential
   order (i, i+1, ..., i+7 per iteration).
3. The pseudocode's `slot6[0] = uPack(slot3.slice(i, i+4))` /
   `slot6[1] = uPack(slot3.slice(i+4, i+8))` decoding is correct at
   least for block 0, and by structural induction for all 14 blocks
   (the slicing expression is constant across iterations).

(A second cross-check against `tests/fixtures/vdata-har-capture.json`
would exercise a different plaintext but the same pack operation; the
single-fixture check above is already sufficient to ground the LE
packing claim because the same 4-byte-slice -> uint32 relation holds
regardless of which plaintext is used.)

## 6. Helper call-site classification table

All 11 call sites inside fn 15918 `[15918, 16230]` as enumerated by the
44.1 static scan in `output/vm-slide/vdata-callgraph.json`
(`static_cross_check[0].static_call_site_count = 11`):

| # | pc | op | args | role |
|---|---|---|---|---|
| 1 | 15950 | OP_25 NEW_METHOD | 1 | `new U.Array(2)` — allocate slot6 as 2-element array for `[v0, v1]` |
| 2 | 15971 | OP_25 NEW_METHOD | 1 | `new U.Array(4)` — allocate slot7 as 4-element array (first-loop destination) |
| 3 | 16037 | OP_02 METHOD_CALL | 2 | `slot4.slice(4*i, 4*(i+1))` — first-loop source slice (see §7 open question) |
| 4 | 16039 | OP_66 CALL_GLOBAL | 1 | `uPack(<slice>)` — upvalue slot 9, first loop: 4 bytes → LE uint32 |
| 5 | 16131 | OP_02 METHOD_CALL | 2 | `slot3.slice(i, i+4)` — second-loop first-half source slice |
| 6 | 16133 | OP_66 CALL_GLOBAL | 1 | `uPack(<slice>)` — upvalue slot 9, second loop: v0 packer |
| 7 | 16169 | OP_02 METHOD_CALL | 2 | `slot3.slice(i+4, i+8)` — second-loop second-half source slice |
| 8 | 16171 | OP_66 CALL_GLOBAL | 1 | `uPack(<slice>)` — upvalue slot 9, second loop: v1 packer |
| 9 | **16182** | **OP_66 CALL_GLOBAL** | **2** | **`xteaEncrypt(slot6, slot7)`** — upvalue slot 10, the 14x XTEA encrypt call (Phase 40.6 / 44.1 identity) |
| 10 | 16197 | OP_66 CALL_GLOBAL | 1 | `uUnpack(slot6[0])` — upvalue slot 11, LE uint32 → 4-byte string (ciphertext v0) |
| 11 | 16207 | OP_66 CALL_GLOBAL | 1 | `uUnpack(slot6[1])` — upvalue slot 11, LE uint32 → 4-byte string (ciphertext v1) |

Of these, the encrypt call at pc 16182 is the one runtime-observed 14
times per vData run (all 14 caller pcs in `vdata-callgraph.json`
`runtime_caller_pcs_raw` are `{pc: 16182, op: 66}`).

## 7. Open questions for 44.3

1. **First-loop slot 4 contradiction (high priority).** The static
   disassembly at pcs 16010..16039 unambiguously reads
   `slot4.slice(4*i, 4*(i+1))` four times over i=0..3. But the fn 20539
   call site at pc 20749 passes `{py: "0"|"1"}` (constructed at pcs
   20722..20746 via `new U.Object()` + `.py = "0"|"1"`) as argument 1,
   which becomes fn 15918 slot 4. Plain objects don't have `.slice`.
   So one of the following must be true, and 44.3 must pick with a
   runtime trace:
   - **(a)** The first loop is unreachable at runtime via a path I
     haven't seen (e.g. an exception swallowed somewhere, or an
     alternative fn 20539 dispatch that goes somewhere else on Chrome).
     A VM-level dispatch tap at fn 15918 entry recording operand-stack
     effects per instruction pc, or a tap on the OP_02 at pc 16037
     recording the receiver type, would confirm.
   - **(b)** The newObj constructed in fn 20539 at pc 20722 has
     additional mutations or a prototype swap I missed in the
     20702..20751 window. Dynamic trace of fn 20539 entry recording
     the shape of arg 1 at pc 20749 would confirm.
   - **(c)** The fn 20539 entry point I'm reading is dead (a spare /
     older variant) and the live proxyXHR send-handler is a different
     fn entirely. 44.1's runtime trace already rules this out for the
     encrypt call chain (caller_fn=20539 is pinned), so (c) is low
     probability.

   Until this resolves, the first-loop pseudocode `slot7[i] = uPack(slot4.slice(...))`
   is a static reading, not a verified runtime behaviour.

2. **Role of slot 7 in the encrypt call.** At pc 16182 the encrypt
   closure is invoked as `xteaEncrypt(slot6, slot7)`. Classical XTEA
   encrypt takes exactly one `[v0, v1]` pair input; the key is baked
   into the closure. What does slot 7 (the 4-uint32 buffer from the
   first loop) do in the encrypt closure? Possibilities:
   - Per-call round-key / IV-like input that is XORed into v0/v1
     before the standard 32 XTEA rounds (which would mean vm-slide's
     XTEA is non-classical in a way not captured by
     `docs/VDATA_FORMAT.md` — but 43.2 tests pass byte-for-byte
     against classical XTEA with key "2e430f8c15b7da96", so this is
     unlikely).
   - An ignored / defensive second argument that the encrypt closure
     accepts via `arguments` but never reads (consistent with
     byte-identity of the cipher output to classical XTEA).
   - Used only when the first-loop path does populate slot 7
     non-trivially — i.e. bound up with open question #1.

   Cheapest disambiguation: a tap inside the encrypt closure that
   records `arguments.length` and whether arg 1 is read. If arg 1 is
   never referenced, the second argument is vestigial.

3. **First-loop i-increment micro-dance (pcs 16044..16063).** The
   increment block `OP_47 5 / OP_39 / OP_63 / OP_39 / OP_64 1 / OP_64 0
   / OP_08 1 / OP_20 / OP_36 / OP_05 / OP_50 0 / OP_64 0 / OP_56 / OP_05`
   achieves `slot5 = slot5 + 1` but mixes in a REPLACE_TOP_K 0 and an OR,
   which on the surface look superfluous. The pseudocode collapses this
   to `i++` but does not prove the collapse. If 44.3 is instrumenting
   the first loop anyway to resolve question #1, it is worth recording
   slot 5's value at the loop tail per iteration to confirm the
   increment is exactly `+1` and the OR-with-0 is a no-op (as
   expected for `(x | 0)` idioms).

4. **Upvalues slot 9 / slot 11 parent provenance.** The OP_58 capture
   bytes at pc 16231 resolve slot 9 to parent slot 8 and slot 11 to
   parent slot 9 (via the `p[m[g++]] = n[m[g++]]` loop in the OP_58
   handler). These parent slots live in fn 15220 (the XTEA factory),
   which also spawns the encrypt closure at pc 15404 and the decrypt
   closure at pc 15579. Identifying which FUNC_CREATE inside fn 15220
   spawns the uint32 packer (→ parent slot 8) and which spawns the
   uint32 unpacker (→ parent slot 9) is mechanical but out of scope
   for 44.2. 44.3 can confirm by placing a dispatch tap on FUNC_CREATE
   sites inside fn 15220 and logging the resulting closure entry pcs.

5. **Fingerprint plaintext construction (the big one).** fn 15918 is
   the *cipher driver*. The 112-byte plaintext `key=value&...` string
   is built elsewhere, passed to `xhr.send(body)` by the orchestrator
   bundle. 44.3 must trace the orchestrator (`t_captcha_slide.js` —
   Phase 41 mapped it to module 56) to identify where the 8
   `key=value` pairs originate, what each field represents, and which
   browser APIs feed them. This is the remaining gap between Phase 43
   (cipher half solved) and a complete vData generator.

## References

- `docs/VM_SLIDE_OPCODES.md` — opcode table
- `docs/VM_SLIDE_ARCHITECTURE.md` — dispatch loop, register file, call convention
- `docs/VDATA_FORMAT.md` — Phase 43 cipher spec (XTEA key, base64 alphabet)
- `research/vm-slide-stack-vm/plaintext-callgraph.md` — 44.1 runtime call-chain narrative
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` — Phase 43 pipeline summary
- `output/vm-slide/vdata-callgraph.json` — 44.1 runtime + static cross-check artifact
- `tests/fixtures/vdata-jsdom-capture.json` — frozen jsdom plaintext fixture used in §5
