# fn 20539 end-to-end — runtime validation + real caller chain

**Task**: Phase 44 / 44.2.7 — decompile fn 20539 end-to-end and pin the real
caller chain from `XMLHttpRequest.prototype.send` interception down to the
XTEA encrypt closure (fn 15241). This note does NOT replace
`FN-20539-DECOMPILE.md` (44.2.5); it validates 44.2.5's static walk against
runtime traces, corrects the 44.4.5 misreading of `vdata-callgraph.json`,
and pins the real pipeline chain below fn 20539.

**Reproducer**: `research/vm-slide-stack-vm/trace-fn20539-entry.js` →
`output/vm-slide/fn-20539-entry-trace.json`.

---

## 1. fn 20539 body, install site, and sibling open-wrapper

Confirmed by reading `output/vm-slide/disassembly-full.txt` and walking
`output/vm-slide/bytecode.json`:

| Fact | pc (decimal) | Evidence |
|---|---|---|
| fn 20140 body start (`proxyXHR` installer) | 20140 | `OP_40 7` at line 11988 of disassembly-full.txt. |
| fn 20140 saves `XHR.prototype.send` → slot 4 | 20152..20215 | String `"XMLHttpRequest"` (20155..20181), `"prototype"` (20185..20201) GET_PAIR, `"send"` (20205..20213) GET_PAIR, `OP_54` DEREF, `OP_36` STORE_LOCAL_REF. |
| fn 20140 saves `XHR.prototype.open` → slot 5 | 20218..20281 | Same pattern as send, with literal `"open"` (20270..20277). |
| fn 20140 initializes slot 6 = `{}` (the shared guard cell) | 20284..20287 | `OP_47 6`; `OP_17` push empty object; `OP_36` STORE_LOCAL_REF. |
| fn 20140 builds `XHR.prototype.open` ref pair on stack | 20290..20349 | Identical literal build to slot-5 load, ends in two GET_PAIRs leaving `[(XHR.prototype), "open"]` on the stack. |
| fn 20140 `JUMP 20463` (skip fn 20353 body) | 20350 | `OP_06 20463`. |
| **fn 20353 body (`.open` wrapper)** | 20353..20462 | `OP_40 9` (20353), `OP_16` VM_EXIT (20462). |
| fn 20353 FUNC_CREATE in fn 20140 | 20463 | `OP_58 20353 2 2 7 6 8 5 3 4` ⇒ K=20353, captureCount=2 (inner 7 ← outer 6 empty object, inner 8 ← outer 5 original open), argc=2, argmap [3,4]. |
| fn 20140 installs fn 20353 as `XHR.prototype.open` | 20473 | `OP_24` STORE_REF writes the closure into the ref pair from 20290..20349. |
| fn 20140 builds `XHR.prototype.send` ref pair on stack | 20476..20535 | Literal `"XMLHttpRequest"` / `"prototype"` / `"send"` (pcs 20477..20534); ends with two GET_PAIRs. |
| fn 20140 `JUMP 20797` (skip fn 20539 body) | 20536 | `OP_06 20797`. |
| **fn 20539 body (`.send` wrapper)** | 20539..20796 | `OP_40 10` (20539), `OP_16` VM_EXIT (20796). |
| fn 20539 FUNC_CREATE in fn 20140 | 20797 | `OP_58 20539 3 1 7 6 8 3 9 4 3` ⇒ K=20539, captureCount=3 (inner 7 ← outer 6 shared guard cell, inner 8 ← outer 3 = fn 20140's single argument, inner 9 ← outer 4 original send), argc=1, argmap [3]. |
| fn 20140 installs fn 20539 as `XHR.prototype.send` | 20808 | `OP_24` STORE_REF. |
| fn 20140 tail | 20809..20812 | `OP_05` x2, `OP_17` (push new `{}` as return value), `OP_16` VM_EXIT. |

The 44.4.5 anchors for fn 20539 (FUNC_CREATE at 20797, install at 20808)
match exactly. The Phase 42 `pc 19662` and `pc 20066` anchors in
`CAPTCHA_ORCHESTRATOR.md §proxyXHR gate` describe a **different** event:
the `isIE9Below()` branch in fn 19507/fn 19604, which then **calls** fn
20140 to run the install sequence above. Both anchor sets are correct; they
sit at different levels of the same stack.

## 2. Sibling `.open` wrapper (fn 20353) is the shared-guard writer

Walking fn 20353 (lines 12110–12170 of disassembly-full.txt) with the
correct capture/argmap layout from step 1:

```js
// fn 20353 — XMLHttpRequest.prototype.open replacement
// At entry:
//   slot 0 = this, slot 1 = arguments, slot 2 = self
//   slot 3 = arguments[0]  (method — unused)
//   slot 4 = arguments[1]  (url)
//   slot 7 = captured outer-slot-6 empty-object CELL
//            (this is the same cell fn 20539 reads as its inner slot 7)
//   slot 8 = captured outer-slot-5 = original XHR.prototype.open
function openWrapper(/* method, url */) {
  try {                                                   // OP_35 20441 0 @ 20367
    if (arguments[1] === "/cap_union_new_verify") {       // OP_10.."/cap_union_new_verify" @ 20379..20420, OP_00 4, OP_28 @ 20422..20424
      slot7 = this;                                       // OP_47 7, OP_00 0, OP_36 @ 20431..20435
    }
  } catch (e) {}
  return origOpen.apply(this, arguments);                 // OP_47 8, "apply", OP_59, OP_00 0, OP_00 1, OP_02 2 @ 20442..20460
}
```

**Purpose**: fn 20353 is NOT a fingerprint builder. It is a one-line
side-effect wrapper that, when the caller opens a request to
`/cap_union_new_verify`, writes `this` (the XHR instance) into the shared
cell that fn 20539 reads as its inner slot 7. fn 20539 then uses that cell
as a gate: encrypt only the body whose XHR instance was last opened with
the verify URL. Everything else passes through untouched.

This resolves "Open question 1" left at the end of 44.2.5's fn 20539
decompile: the parent-slot-6 guard semantic is "did the most recent
`.open()` target the verify endpoint."

## 3. fn 20539 body reading reaffirmed

`FN-20539-DECOMPILE.md` (44.2.5) walked pc 20539..20796 one opcode at a
time and produced a pseudocode that matches the disassembly line-for-line.
44.2.7 re-verified every pc in the prologue, main body, and tail against
`disassembly-full.txt` and did not find a single deviation. The
consolidated JS equivalent from that note stands as-written; see its
"Consolidated high-level JS equivalent" section. The only correction
needed here is to replace its working name for the closure in slot 8 —
which 44.2.5 assumed to be `fn 15918` — with the runtime-observed
**encryptData wrapper** (see §5). The body-level call flow is otherwise
accurate:

```
fn 20539(body) {
  // gated by capturedGuard === this and typeof body === 'string'
  var py = (XHR.prototype.send !== self);
  var ciphertext = slot8(body, { py: py ? "1" : "0" });   // pc 20749 OP_66 2
  return savedSend.call(this, ciphertext);                // pc 20770 OP_02 2
}
```

## 4. `ancestor_chains` in `vdata-callgraph.json` are a tracer artifact

The 44.1 `vdata-callgraph-trace.js` attaches each `__VMTAP_ENTER(K)` event
to the most recent in-range `__VMTAP_DISPATCH(pc, op)` event in a single
linear timeline. It then reconstructs an "ancestor chain" by recursively
searching backward for a previous ENTER whose callee equals the function
containing the current caller_pc. This scheme ONLY works when every
cross-function transition goes through a VM-level call opcode — i.e., it
breaks whenever control leaves the vm-slide dispatch loop through a host
boundary (e.g., through `XMLHttpRequest.prototype.send`, which vm-slide
has patched with fn 20539, and which is invoked by **native** jQuery
`xhr.send(body)` from the orchestrator).

Concrete evidence that the chain is synthetic:

- `vdata-callgraph.json` reports for all 14 encrypt calls:
  `enter_k=20539, caller_pc=20462, caller_op=16, caller_fn=20353`.
- pc 20462 is `OP_16 VM_EXIT` (end of fn 20353). VM_EXIT cannot invoke a
  function. The op is a return, not a call.
- The same chain repeats for `enter_k=20353, caller_pc=20949,
  caller_op=16, caller_fn=20843` and `enter_k=20843, caller_pc=20967,
  caller_op=6, caller_fn=0` — pc 20949 and 20967 are also VM_EXIT / JUMP
  opcodes respectively, not calls.

Interpretation: the chain reconstructor's backward walk across the
verify-time host boundary (`jQuery.ajax → native xhr.open → fn 20353 tail →
native xhr.send → fn 20539`) collapsed the host-to-VM re-entry into the
nearest previous VM tick, which is fn 20353's own VM_EXIT. The real
dynamic call stack **at the moment fn 20539 runs** is:

```
native: jQuery.ajax.send → XMLHttpRequest.send (patched) → fn 20539(body)
```

There is no fn 20353 → fn 20539 VM-level call. fn 20353 and fn 20539 are
**siblings** installed onto `XHR.prototype.open` and `XHR.prototype.send`
respectively; the orchestrator invokes them sequentially from native JS.

This is the error at the root of 44.4.5's "fn 20539 is the frame above fn
15918" premise. The **individual step** `enter_k=15918, caller_pc=20749,
caller_op=66, caller_fn=20539` is still correct (pc 20749 is a real
`OP_66 2` call inside fn 20539's body, and fn 15918's body covers [15918,
16230]), but the whole ancestor chain above that step is
tracer-synthesized.

## 5. Real runtime pipeline below fn 20539

`trace-fn20539-entry.js` patches vm-slide's closure-entry tap with a
per-K counter + first-args capture, runs the jsdom harness (jQuery 1.11.3
+ HAR-sourced fields posted to `/cap_union_new_verify`), and dumps every
unique closure entry in the run. Result (`output/vm-slide/fn-20539-entry-trace.json`):

| Entry | Count | First-call args (kind + length) | Role |
|---|---|---|---|
| fn 20353 | 1 | `("POST", "/cap_union_new_verify", true, null, null)` | `.open` wrapper. |
| **fn 20539** | **1** | **`(string[9345])`** | `.send` wrapper. arg0 is the full orchestrator-built form-encoded POST body. |
| fn 20140 | 1 | `(function)` | proxyXHR installer. Its one argument becomes fn 20539's inner slot 8. |
| fn 13860 | 1 | `(string[110])` | `encryptData` entry. Receives **110 bytes** (not 112). |
| fn 13989 | 1 | `(string[110])` | PKCS#7-style padder (pinned by 44.2.6). Produces 112 bytes. |
| fn 14153 | 1 | `(string[112])` | ShiftRows-style permuter (pinned by 44.2.6). Reorders bytes within the 112-byte block. |
| fn 15220 | 1 | `(object, object, function)` | Encrypt closure factory (per Phase 43). |
| **fn 15918** | **1** | **`(string[112], string[16])`** | XTEA wrapper. arg0 = permuted 112-byte plaintext; arg1 = 16-byte runtime key `"34e2c8f07b5169ad"`. |
| fn 15241 | **14** | `([v0,v1], [k0,k1,k2,k3])` | Single-block XTEA encrypt (classical, 32 rounds). |
| fn 15591 | 32 | `(string[4])` | Inner cipher helper (likely 4-char base64 emit block). |
| fn 15735 | 28 | `(number)` | Inner cipher helper. |

**Final XHR body** (captured by the pre-installed native send hook, which
fn 20539 forwards to via `savedSend.call(this, ...)`):
- length 9504 = 9345 (original body) + 159 (`&vData=` + 152 base64 chars).
- `vData` field is present and 152 chars long, starting `Vq66lx8GseOZ...`.

So the **runtime chain above fn 15241 is**:

```
native jQuery.ajax → native XHR.send (patched)
  → fn 20539 (arg: 9345-byte form-encoded body)
    → slot8(body, {py})          // pc 20749 OP_66 2
      (slot8 is NOT fn 15918; see below)
        → fn 13860 (arg: 110-byte pre-plaintext)      // encryptData entry
          → fn 13989 (110→112 pad)
          → fn 14153 (permute 112)
          → fn 15220 (factory call — probably a closure refresh)
          → fn 15918 (arg: permuted 112 + 16-byte key)
            → fn 15241 ×14                            // 14 XTEA-encrypt blocks
          → fn 15591 ×32, fn 15735 ×28                // base64 emit
    → savedSend.call(this, <body with &vData=... appended>)
```

**Correction to 44.2.5**: 44.2.5's fn 20539 decompile assumed "slot 8 =
fn 15918". That was based on reading Phase 43's `PLAINTEXT-BUILD.md §3`
which says slot 8 holds "the encrypt closure." Runtime contradicts:
`fn_15918_enter_count = 1` and fn 15918's args are `(string[112],
string[16])`, but fn 20539 calls slot 8 with `(string[9345], {py:
"0"|"1"})`. Slot 8 must therefore be a wrapper function that converts
`(body, options)` → `(112-byte permuted plaintext, key)` before calling
fn 15918. The leading candidate is **fn 13860** itself (the `encryptData`
entry, count 1, args `string[110]` — consistent with a prologue that
extracts 110 bytes of fingerprint from the body or from a parallel
closure-captured fingerprint buffer and then invokes the padder →
permuter → XTEA loop → base64 pipeline). Pinning the exact identity of
slot 8 statically is unresolved at 44.2.7 close; see §7.

**Correction to 44.4.5**: the "fn 20539 is the frame above fn 15918" claim
is **literally true** in the sense that static pc 20749 (`OP_66 2`) inside
fn 20539's body calls the closure that recursively reaches fn 15918. It is
**misleading** in that 44.4.5 treated the call as direct (one VM call
from 20539 to 15918), when the runtime shows an intermediate pipeline (fn
13860 → fn 13989 → fn 14153 → fn 15220 → fn 15918) plus at least one
possibly-native hop. The "real fingerprint schema" the task asked for is
**not inside fn 20539's immediate body** — fn 20539 just forwards `(body,
{py})`.

## 6. vData injection site

Runtime-confirmed: fn 20539 eventually calls `savedSend.call(this, ...)`
at pc 20770 with a string that is 9504 bytes long. The original body was
9345 bytes. Difference = 159 = exactly `"&vData=" + (152-char base64)`.
Injection is therefore **body rewrite by append**: the value returned
from slot8(body, {py}) is `body + "&vData=" + base64(xtea(permute(pad(
fingerprint))))`. fn 20539 stores it back into slot 3 at pc 20751 (`OP_36`
STORE_LOCAL_REF) and then pushes slot 3 as the `.call` argument at pc
20768 (`OP_00 3`). No header set, no URL change — only body replacement
with an appended field.

This matches what `vdata-callgraph-trace.js` captures via its
pre-installed `XMLHttpRequest.prototype.send` hook and what
`tests/fixtures/vdata-har-capture.json` recorded from a real Chrome 146
session (vData appears as a URL-encoded form field in the POST body).

## 6b. Pre-pad plaintext schema (runtime-pinned — bonus finding)

When `trace-fn20539-entry.js` dumps the first-arg head for every closure
entry, the 110-byte first arg of fn 13860 comes out as:

```
env=1&key=qLCZ&version=2&cLod=unloadTDC&ss=0%2C&tp=Cannot read properties of null (reading 'src')&py=0&inf=top
```

Exactly **8 `key=value` pairs** joined by `&`. The 8 field names are:

| Field | Example value | Evidence |
|---|---|---|
| `env` | `1` | constant-ish environment type |
| `key` | `qLCZ` | 4-char random, likely session nonce |
| `version` | `2` | constant |
| `cLod` | `unloadTDC` | lifecycle event name captured from tdc.js `c`all-flow `L`ifecycle `O`nun`L`oa`D` ? |
| `ss` | `0,` (URL-encoded `0%2C`) | slide-solver state counter |
| `tp` | `Cannot read properties of null (reading 'src')` | captured JS **error message** — this is a runtime anti-debug probe that deliberately accesses `.src` on null and catches |
| `py` | `0` | the flag fn 20539 computes at pc 20613..20697 (flipped to `1` on first XHR send before `XHR.prototype.send === self` becomes visible) |
| `inf` | `top` | iframe-position probe (`window.top === window` ? `"top"` : `"sub"`) |

The fn 13860 first-arg bytes are identical to the fn 13989 first-arg
bytes (fn 13989 is the 110→112 padder, which fn 13860 calls with its own
incoming plaintext). fn 14153 (the permuter) is entered with the **110
plus 2-byte `bb` padding = 112 bytes** (`...&inf=topbb`), then its output
is what fn 15918 sees as its first 112-byte arg (the scrambled string
starting `s%e12n&svp=Cy0&==...`).

Implication: the **real "fingerprint schema"** the 44.2.7 task asked for
is not an 8-field environment probe (navigator / screen / platform). It
is an **8-field runtime-state probe** of tdc's own lifecycle: an env
type, a session nonce, a version, a lifecycle marker, a solver counter,
a captured error message, fn 20539's own py flag, and an iframe probe.
**`py` is contributed by fn 20539 itself**; every other field is built
elsewhere and passed into the slot-8 wrapper as part of the 110-byte
string.

Per-run order source: 44.2.7 does not pin the ordering mechanism (it is
upstream of fn 13860 and therefore outside the immediate fn 20539
subtree), but the runtime tap shows that the ORDER at fn 13860 entry is
what downstream tasks should treat as canonical — not any order derived
from object iteration by fn 20539. The two committed fixtures' observed
orders (jsdom `[inf,env,tp,key,py,ss,cLod,version]`, HAR `[inf,env,tp,
cLod,version,key,ss,py]`) and the 44.2.7 run's order
`[env,key,version,cLod,ss,tp,py,inf]` are all permutations of the same
8-field set; the builder varies the order per run. Finding the exact
randomization source is Phase 44's remaining open thread and belongs to
the function that constructs the 110-byte string — NOT fn 20539 or
fn 23898.

## 7. Unresolved hop: fn 20539 slot 8 → fn 13860 identity

What 44.2.7 did NOT resolve statically: the exact identity of the function
stored in fn 20140's slot 3 at the moment fn 20140 runs (which fn 20539
then captures as its inner slot 8). Candidates from `ancestor_chains`
(`key_closure_spawn_sites`):
- fn 20140 is spawned at pc 20813 by fn 20843 with argc=1. So fn 20843
  passes one function to fn 20140 at some OP_66 call site. Walking fn
  20843 (pc 20843..20949) and decompiling it to find what function it
  passes is the logical next step.
- Runtime says fn 20843 is entered 1×, with args `(object, object,
  function)` — it's a CommonJS-style module factory receiving `(module,
  exports, require)`. The `function` there is the module's `require`, so
  fn 20843 is the outermost module body for the proxyXHR submodule.

The likely shape is: fn 20843 requires some crypto-helper module (call it
fn F), then calls fn 20140(F). fn F is then captured as fn 20539's slot 8
and gets called as `F(body, {py})`. Runtime shows F → fn 13860 directly
(fn 13860 enters 1× with `string[110]` — which must be the projection fn
F produces from the 9345-byte body). Pinning exactly where fn F turns
9345 bytes into 110 bytes is the real "fingerprint builder" question and
is the rescoped target for Phase 44 downstream tasks (see §8). This is
**not inside fn 20539**; fn 20539's entire role is:
1. gate on verify-URL match,
2. flip the py flag based on `XHR.prototype.send` equality,
3. call slot8(body, {py}),
4. forward result to savedSend.

## 8. Downstream Phase 44 rescoping

- **44.3.5** (plaintext builder inside vm-slide) — **stays open but
  narrows**. The builder is not in fn 20539 or its lexical subtree inside
  vm-slide's main body; it is in the 1×-invoked function that fn 20539's
  slot 8 points to (runtime evidence fn 13860's first arg is 110-byte
  string). Next step: decompile fn 20843 to find which function fn 20843
  passes into fn 20140, then decompile that function to find where its
  110-byte string comes from. Candidate root: fn 13860's own prologue.
- **44.5a** (runtime key reconciliation) — **unchanged**. Task still owns
  the `34e2c8f07b5169ad` seed → runtime key transform. Runtime confirms
  the key at fn 15918 entry is 16 ASCII bytes matching `34e2c8f07b5169ad`,
  which is the bytecode literal (NOT the Phase 42 observed key
  `2e430f8c15b7da96`). The transform named in BUILD-RECONCILE.md is still
  owed; 44.2.7 does not advance it.
- **44.5b** (CAPTCHA_ORCHESTRATOR.md §517 correction) — **unchanged**.
  The proxyXHR-does-not-build-the-plaintext claim from 44.2.5 is
  re-confirmed by runtime. The doc correction is still owed.
- **44.6** (plaintext field taxonomy) — **rescope**. The working
  assumption "8 `key=value` pairs enumerated by object iteration" is
  **not supported** by the runtime data. The 112-byte plaintext observed
  at fn 15918 entry is the **post-permute** state. The pre-permute
  state is the 112-byte output of fn 13989, and the pre-pad state is the
  110-byte first-arg of fn 13860. The field taxonomy question belongs to
  the pre-pad layer, which lives inside whatever function produces that
  110-byte string (fn 13860's caller or fn 13860's prologue). 44.6 should
  be rewritten as "decompile fn 13860's prologue and reverse the 110-byte
  pre-plaintext shape."
- **44.7** (fixture round-trip) — **unchanged**. The jsdom and HAR
  fixtures round-trip the cipher half; the pre-pad shape is orthogonal.
- **44.4.1** (randomised comparator in fn 23898) — **drop as unreached**.
  Runtime shows fn 23898 enters 15×, but with args `(string:3, string:2)`
  — that's consistent with a DOM-string helper, not a plaintext
  assembler. It is on the run path but not for vData; it likely runs for
  a different sort. The Math.random comparator there is still present
  but not load-bearing for fingerprint ordering.

## 9. Reproducer

```bash
npm install                                        # jsdom, canvas
node research/vm-slide-stack-vm/trace-fn20539-entry.js
# writes output/vm-slide/fn-20539-entry-trace.json
# counts fn 20353 / 20539 / 15918 / 15241 entries
# captures first-call args for every closure entry in the run
```

Committed supporting artifacts:
- `output/vm-slide/fn-20539-entry-trace.json` — the trace output this
  note cites.
- `output/vm-slide/vdata-callgraph.json` — the 44.1 artifact, preserved
  as-is. §4 explains which parts are real vs. synthetic.
- `output/vm-slide/disassembly-full.txt` — the disassembly every pc
  citation resolves against.

## 10. Summary

- fn 20539 and its sibling fn 20353 are both installed by fn 20140 at pcs
  20473 and 20808 respectively, onto `XHR.prototype.open` and
  `XHR.prototype.send`. Install site and fn 20140's parent chain (fn
  20843 → fn 20140) are confirmed.
- fn 20539's body is a pure gate + forward: check guard, check `typeof
  body === "string"`, compute `py` flag, call slot8(body, {py}), call
  savedSend.call(this, result). It does NOT build a 112-byte plaintext.
  This reaffirms the 44.2.5 static walk.
- The runtime caller of fn 15918 is fn 20539 — but only in the sense of
  a deep chain through a hidden intermediate (runtime-observed fn 13860
  with 110-byte first arg, then fn 13989 and fn 14153). The
  `ancestor_chains` structure in `vdata-callgraph.json` is a tracer
  artifact and is NOT a real dynamic call stack; 44.4.5 misread it.
- vData is injected by **body rewrite with append**: final body =
  original body + `"&vData=" + base64(xtea(permute(pad(fingerprint))))`,
  written back onto fn 20539's slot 3 at pc 20751 and forwarded via
  `savedSend.call(this, slot3)` at pc 20770.
- The fingerprint builder remains inside vm-slide, but at a different
  function than the task expected: it is upstream of fn 13860, not
  inside fn 20539. Phase 44's downstream tasks should target fn 13860's
  prologue / fn 20843's slot-to-slot-3 trace.
