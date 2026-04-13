# vData plaintext-build call graph

**Task**: Phase 44 / 44.1 — Encrypt-callsite back-walk + plaintext-build call
graph.

**Status**: closed. Runtime-captured 14/14 caller pcs for the encrypt closure
and resolved the full inside-VM call chain from vm-slide's proxyXHR entry
down to the XTEA encrypt closure. Static back-walk results are consistent
with the runtime capture.

**Inputs**:
- `sample/vm_slide.js` (read-only, Tencent's property)
- `sample/captcha-har.har` (verify POST field set)
- `sample/slide-jy.js` (Zepto-ish shim used by vm-slide in jsdom)
- `output/vm-slide/bytecode.json` — decoded 24,273-element bytecode
- `output/vm-slide/dispatch-table.json` — 69-slot dispatch table
- `output/vm-slide/disassembly-full.txt` — Phase 40.1 walker output

**Reproduce**:

```bash
node research/vm-slide-stack-vm/vdata-callgraph-trace.js
# writes output/vm-slide/vdata-callgraph.json
```

The tracer boots jsdom, loads `sample/slide-jy.js` and a patched copy of
`sample/vm_slide.js` with dispatch-loop and closure-entry taps injected,
then fires a `jQuery.ajax POST` against `/cap_union_new_verify`. Each enter
event records its own `lastDispPc` — the most recent outer-frame dispatch
tick seen at the moment of the call — so the direct caller pc for every
call is captured without any backward-walk heuristic.

---

## Runtime capture: 14 caller pcs for the encrypt closure

Every one of the 14 encrypt calls in a single vData run enters the encrypt
closure (`ENC_ENTRY = 15241`) from the **same caller pc**:

| # | caller pc | caller op | containing fn |
|---|---|---|---|
| 1..14 | **16182** | `OP_66` CALL_GLOBAL | fn 15918 |

This is not a sampling artifact: `enc#1`..`enc#14` in
`output/vm-slide/vdata-callgraph.json` under `runtime_caller_pcs_raw` all
show `{ pc: 16182, op: 66 }`. Function 15918's body (reconstructed by the
walker's per-entry DFS with hard boundaries on FUNC_CREATE entry pcs) is
`[15918, 16230]` — the 14 caller pcs all fall inside it.

The CALL_GLOBAL opcode at pc 16182 is preceded by three `LOAD_LOCAL`
instructions (`OP_00 10`, `OP_00 6`, `OP_00 7` at pcs 16176, 16178, 16180):
load local 10 (the encrypt closure), local 6 (v0), local 7 (v1), then
`OP_66 2` invokes it with two args. This matches the expected shape for
the XTEA encrypt closure — arg 0 is `[v0, v1]` (packed as two uint32s) and
there is no third numeric argument (the key is bound into slot 4 of the
closure at factory-spawn time, not passed per call).

## Full call chain (inside-VM, from proxyXHR send-handler down to encrypt)

Resolved by walking the recorded enter event list: for each enter event we
look backward for the most recent *enter* whose callee K equals the
containing function of the current caller pc — that enter is the one that
brought the VM into that function.

```
native JS (jQuery $.ajax POST / XHR.send)
    |
    | (proxyXHR-installed XHR.send replacement — a vm-spawned closure
    |  invoked as a JS function, so no in-VM opcode triggers its entry;
    |  the enter-event tap still fires at __TENCENT_CHAOS_VM boundary)
    v
fn 20539  body=[20539, 20796], size=152 instructions
    | OP_66 CALL_GLOBAL at pc 20749
    v
fn 15918  body=[15918, 16230], size=197 instructions   <-- PLAINTEXT-BUILD LOOP
    | OP_66 CALL_GLOBAL at pc 16182   (x14)
    v
fn 15241  body=[15241, 15415], ENC_ENTRY (XTEA encrypt closure)
```

**ASCII dispatch tree** (read top-to-bottom as the live call stack for each
of the 14 encrypt calls):

```
[JS host: jQuery $.ajax -> XHR.open/send]
           |
           v
  fn 20539   (proxyXHR send-handler; 1 enter per verify POST)
           |
           v  pc 20749  OP_66
  fn 15918   (plaintext-build + encrypt driver; 1 enter per verify POST,
              contains a 14-iteration loop body in pcs 15989..16191)
           |
           v  pc 16182  OP_66   (x14 loop iterations)
  fn 15241   (XTEA encrypt closure, ENC_ENTRY; 14 enters per verify POST)
```

## Closure spawn sites (how each of the above closures comes into being)

From `key_closure_spawn_sites` in the artifact:

| Closure | FUNC_CREATE pc | Spawned inside | Role |
|---|---|---|---|
| 15241 (encrypt) | 15404 | fn 15220 (FACTORY) | XTEA encrypt closure — key baked into local 4 |
| 15416 (decrypt) | 15579 | fn 15220 (FACTORY) | XTEA decrypt closure — key baked into local 4 |
| 15591 | 15724 | fn 15220 (FACTORY) | XTEA round helper / byte-packer (name TBD in 44.2) |
| 15735 | 15815 | fn 15220 (FACTORY) | helper ("StringfromCharCode" string built just before spawn) |
| **15918** | **16231** | **fn 15220 (FACTORY)** | **plaintext-build loop; target of 44.2** |
| 19604 | 20073 | fn 19507 | proxyXHR outer initializer (Phase 42 "outer init") |
| 20353 | 20463 | fn 20140 | proxyXHR helper (XHR.open / send patch scaffolding) |
| 20539 | 20797 | fn 20140 | proxyXHR send-handler (direct caller of 15918) |
| 20843 | 20950 | fn 0 (top-level) | top-level proxyXHR install helper |

Notably, the entire XTEA cipher machinery (closures 15241 / 15416 / 15591 /
15735 / 15918) is spawned by one factory — function 15220 (Phase 40.6's
`FACTORY_ENTRY`). Function 15918 is a sibling of the encrypt closure, not
a grandchild; it is spawned by the same factory that spawns encrypt/decrypt,
stored somewhere reachable from fn 20539, and later called from the
proxyXHR send-handler.

## Static back-walk vs runtime capture

**Agreement.** The runtime-captured caller pc 16182 falls inside the
statically-attributed body of fn 15918 (walker per-entry DFS body
`[15918, 16230]`). The static call-site enumerator (ops 2, 25, 55, 66)
found **11 call sites** inside fn 15918's body, of which 16182 is one.
Only 16182 was observed at runtime as the actual caller of ENC_ENTRY;
the other call sites invoke `Array.slice`, `Array.push`, and similar JS
built-ins via the constant-pool lookup pattern visible in the
surrounding disassembly (see `docs/VM_SLIDE_OPCODES.md` op 66 for the
dispatch semantics).

**Consistent with Phase 40.6.** Phase 40.6's static analysis identified
pc 15404 as the OP_58 that spawns the encrypt closure; the
`static_enc_func_create_sites` field confirms that site, and identifies
its containing function as **fn 15220** (the factory). This is the same
factory that spawns decrypt (pc 15579) and the plaintext-build driver
(pc 16231) — no surprises.

**Caveat on the `caller_pc` field of upper-frame enter events.** The
enter event for fn 20539 shows a `caller_pc` of 20462 with op=16
(`VM_EXIT`), and fn 20843's enter shows pc 20949 op 6 (`JUMP`). Neither
of those is a real call opcode — they are *stale* values of `lastDispPc`
left over from the previous VM return, because fn 20539 / fn 20353 / fn
20843 are all invoked from **native JS** (via the proxyXHR XHR interceptor
path). There is no in-VM opcode triggering those entries, so the most
recent in-VM tick is whatever the VM last executed before returning to
native JS. Only the two call edges that live entirely inside the VM —
`fn 20539 -> fn 15918` at pc 20749 and `fn 15918 -> fn 15241` at pc 16182
— are real CALL_GLOBAL sites with op=66. This matches the expected
architecture: the outermost VM frame (fn 20539) is the XHR.send patch
itself, entered from JS.

## Target for 44.2: decompile fn 15918

**Pc range to decompile**: `[15918, 16230]` (197 instructions).

**Entry prologue** (pcs 15918..15934): `OP_40 12` allocates local-stack
length 12, then `OP_42 2..8` ensure locals 2..8 are initialized as
single-cell arrays, then `OP_47 6` makes a ref to local 6 — standard
function prologue.

**String table in the prologue**: multiple char-code sequences visible
via `OP_10 K` immediate pushes build the literal strings `"Array"`
(twice, pcs 15936..15950 and 15957..15971), `"slice"` (pcs 16013..16023
and 16079..16123 and 16147..16158), `"length"` (pc 16079..16090), and
implicitly `"encrypt"` — the loop body is clearly walking an input and
slicing it into 8-byte blocks for the encrypt closure.

**Loop structure**: pc 16064 is `OP_06 15989` — an unconditional backward
jump from the loop tail at pc 16064 to the loop head at pc 15989. The
loop terminator is at pc 16099 `OP_06 16227` (forward jump to the tail of
the function, before `OP_16` at 16230).

**Call sites inside fn 15918** (all OP_66 CALL_GLOBAL unless noted):

| pc | op | arg count | intended callee (inferred from disassembly context) |
|---|---|---|---|
| 15950 | OP_25 NEW_METHOD | 1 | `new Array(2)` — allocates 2-element array |
| 15971 | OP_25 NEW_METHOD | 1 | `new Array(4)` — allocates 4-element array |
| 16039 | OP_66 CALL_GLOBAL | 1 | `slice(..)` — on local 5 (the input buffer) |
| 16133 | OP_66 CALL_GLOBAL | 1 | `slice(..)` — two more slice calls |
| 16169 | OP_02 METHOD_CALL | 2 | `.slice(start, end)` method on the input |
| **16182** | **OP_66 CALL_GLOBAL** | **2** | **`encrypt(v0, v1)` — the XTEA encrypt closure** |

Task 44.2 should decompile this function body into pseudo-JS to reveal
the exact plaintext construction logic: how the `key=value&` pairs are
formed, how they get packed into uint32 pairs, and where the fingerprint
fields come from (i.e. what local 5, local 6, local 7 hold on entry and
where they are populated upstream in fn 20539).

**Secondary target**: decompile fn 20539 `[20539, 20796]` after fn 15918
is understood. That function is the proxyXHR send-handler and holds the
upstream of local 5 / local 6 / local 7 (the raw input buffer consumed
by fn 15918). Without knowing 20539, it may not be possible to determine
where the 8 `key=value` pairs originate — they could come from `e.body`
(i.e. the outgoing XHR payload), from a separately-built fingerprint
object, or from a merge of both.

## 14 caller pcs (raw)

From `runtime_caller_pcs_raw` in `output/vm-slide/vdata-callgraph.json`
(run 2026-04-13):

```
enc#1  { pc: 16182, op: 66 }
enc#2  { pc: 16182, op: 66 }
enc#3  { pc: 16182, op: 66 }
enc#4  { pc: 16182, op: 66 }
enc#5  { pc: 16182, op: 66 }
enc#6  { pc: 16182, op: 66 }
enc#7  { pc: 16182, op: 66 }
enc#8  { pc: 16182, op: 66 }
enc#9  { pc: 16182, op: 66 }
enc#10 { pc: 16182, op: 66 }
enc#11 { pc: 16182, op: 66 }
enc#12 { pc: 16182, op: 66 }
enc#13 { pc: 16182, op: 66 }
enc#14 { pc: 16182, op: 66 }
```

All 14 come from a single call site inside fn 15918's 14-iteration loop.
This is consistent with the Phase 43.2 finding that the vData plaintext
is exactly 112 bytes (14 × 8-byte XTEA blocks) and that the plaintext is
8 `key=value` pairs joined by `&`.

## Cross-references

- `research/vm-slide-stack-vm/vdata-callgraph-trace.js` — the tracer
  that produced the runtime capture.
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — Phase 43.1
  baseline tracer (unmodified; reference for the patch strategy).
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` §8 — Phase 43 note on
  the open plaintext-build question this task partially answers.
- `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` — Phase 42 proof that
  `vData` is injected by a proxyXHR-installed `XHR.send` monkey-patch
  (candidate b+), which is what puts fn 20539 at the top of the
  inside-VM call chain.
- `docs/VM_SLIDE_ARCHITECTURE.md` — VM dispatch loop, register file,
  return protocol.
- `docs/VM_SLIDE_OPCODES.md` — authoritative opcode table; call
  semantics for ops 2, 25, 55, 66.
- `docs/VDATA_FORMAT.md` — Phase 43 cipher spec (XTEA key, custom
  base64 alphabet). The plaintext half documented there is still open
  pending 44.2.
- `output/vm-slide/vdata-callgraph.json` — machine-readable artifact
  for this task.
