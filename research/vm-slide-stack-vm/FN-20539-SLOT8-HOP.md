# fn 20539 slot-8 hop — identity, per-run order source, and reconciliation

**Task**: Phase 44 / 44.2.8 — close the two open threads from
`FN-20539-DECOMPILE-44.2.7.md`:
1. The exact identity of the function fn 20539 captures as inner slot 8
   (= fn 20140's slot 3), which fn 20539 calls as `slot8(body, {py})` at
   pc 20749.
2. The concrete mechanism that produces the per-run shuffle of the 8
   field names (jsdom run order ≠ HAR run order ≠ 44.2.7 run order).

This note is a **delta** to 44.2.7's decompile, not a rewrite. Citations
resolve against `output/vm-slide/disassembly-full.txt` and
`output/vm-slide/fn-20539-entry-trace.json`. Both 44.2.6's
`FN-22317-DECOMPILE.md` and 44.4.1's `SORT-ORDER-RESOLUTION.md` had the
fn 22317 / fn 23898 internals correct; what they were missing was the
**runtime liveness link** that 44.2.7 finally captured. 44.2.8 connects
that link.

---

## TL;DR

- **Slot-8 hop = fn 22317**, exported as `module.exports.getCaptchaData`
  by webpack module body fn 20970 at pc 24252.
- **fn 22317 IS reached** on every verify send. Runtime entry count
  matches fn 20539 and fn 13860 (1, 1, 1) and the captured first-args
  `(string[9345], {py})` are byte-identical to the args fn 20539 forwards
  at pc 20749.
- **Per-run order source = a randomised `Array.prototype.sort` comparator
  inside fn 22317 itself**: pc 23945 creates fn 23898, pc 23949 calls
  `nameArray.sort(fn23898)`. fn 23898's body is the textbook
  `Math.random() > 0.5 ? 1 : -1` shuffle. Category (iii) from the task
  brief.
- **44.2.6 and 44.4.1 are vindicated**, not retired. They were correct
  about fn 22317's structure and fn 23898's comparator semantics; what
  was missing was the fn 20539 → fn 22317 runtime call edge that 44.2.7's
  entry trace proves and 44.2.8 pins statically.

---

## 1. fn 20140 body range and its slot-3 write

`OP_40 7` at pc 20140 (`disassembly-full.txt` line 11988) opens fn 20140's
body. The body extends to `OP_16` at pc 20812. Confirmed by:
- the JUMP at pc 20536 lands at pc 20797 (the `OP_58 20539` FUNC_CREATE),
  meaning fn 20539's body 20539..20796 is nested inside fn 20140's body;
- the JUMP at pc 20350 lands at pc 20463 (the `OP_58 20353` FUNC_CREATE),
  meaning fn 20353's body 20353..20462 is nested too;
- pc 20813 (`OP_58 20140 0 1 3`, line 12375) is the FUNC_CREATE for
  fn 20140 itself, which therefore lives in fn 20140's PARENT.

fn 20140's FUNC_CREATE `OP_58 20140 0 1 3` decodes as:
captureCount = 0, argc = 1, argmap = [3]. So fn 20140 takes exactly one
argument, which lands in **its slot 3**.

That means fn 20140's slot 3 is **already populated at function entry by
its single caller's argument** — there is no `OP_36 STORE_LOCAL_REF ... 3`
needed inside fn 20140's body to write slot 3 from another value, because
the argument-binding `OP_42 3` (pc 20146, line 11992) does it implicitly.

Cross-check: search of fn 20140's body (pcs 20140..20812) for any
`OP_36 ... 3` confirms the value of slot 3 is never overwritten after
entry. The runtime trace confirms shape:
`first_args_by_id["20140"] = [{ kind: "function" }]` — the single
argument is a function object, exactly what fn 20539 then captures as
its inner slot 8 via `OP_58 20539 3 1 7 6 8 3 9 4 3` (capture pair
`8 ← outer 3`).

## 2. fn 20140's parent and the proxyXHR install path

fn 20140's FUNC_CREATE at pc 20813 lives inside fn 20107
(`OP_40 6` at pc 20107, line 11970). fn 20107 is itself a webpack module
factory: its FUNC_CREATE `OP_58 20107 0 3 3 4 5` (pc 20823) takes 3 args
(module, exports, require). The relevant prologue in fn 20107:

| pc | op | meaning |
|---|---|---|
| 20117 | `OP_47 4` | push slot 4 (= `exports`) |
| 20119..20134 | `OP_10 …` × 8 | build literal `"proxyXHR"` |
| 20136 | `OP_59` | combine into ref pair `[exports, "proxyXHR"]` |
| 20137 | `OP_06 20813` | JUMP over fn 20140's body |
| 20813 | `OP_58 20140 0 1 3` | push fn 20140 closure |
| 20818 | `OP_24` | STORE_REF: `exports.proxyXHR = fn 20140` |

So **fn 20140 IS exported as `module.exports.proxyXHR`** by fn 20107's
module body. The function passed as fn 20140's single argument when it
runs is therefore whatever the caller of `proxyXHR(…)` passes in.

That caller is fn 19604, the `init` function exported by fn 19507's
module. fn 19604's body (pcs 19604..20058) contains the
`isIE9Below()` gate from Phase 42:

| pc | op | meaning |
|---|---|---|
| 19612..19633 | literal build + `OP_59` | `someExports.isIE9Below` ref pair |
| 19634 | `OP_02 0` | call `isIE9Below()` |
| 19636 | `OP_60 19666` | JZ to IE9 path |
| 19639 | `OP_47 5` | push slot 5 (= captured outer slot 6 = `require(44)` = the proxyXHR module exports) |
| 19641..19658 | literal build | `"proxyXHR"` |
| 19659 | `OP_00 3` | push slot 3 = fn 19604's only argument |
| 19661 | `OP_02 1` | `proxyModule.proxyXHR(arg)` |

Per fn 19604's FUNC_CREATE `OP_58 19604 2 1 4 7 5 6 3` (pc 20073):
captureCount = 2 (inner 4 ← outer 7, inner 5 ← outer 6), argc = 1,
argmap = [3]. fn 19507's outer slots 6 and 7 are
`require(44)` and `require(32)` respectively, populated at fn 19507 pcs
19567..19586. **Module 44 = the proxyXHR module (fn 20107's exports)**.

So the static call chain is:
```
someCaller → fn 19604(getCaptchaDataFn)             // exported as init
    → require(44).proxyXHR(getCaptchaDataFn)        // pc 19661
        → fn 20140(getCaptchaDataFn)                // single arg → slot 3
            → fn 20539 captures slot 3 as inner slot 8
                → at pc 20749, fn 20539 calls slot8(body, {py})
                    = getCaptchaDataFn(body, {py})
```

The "function passed in by `init`'s caller" is what becomes fn 20539's
slot 8. To finish identifying it, we need to find which function the
orchestrator passes to `init`.

## 3. Slot-8 hop identity: it is fn 22317

The hop identity is pinned by **direct runtime evidence + a static name
match**:

**Runtime** (`output/vm-slide/fn-20539-entry-trace.json`):
- `all_entry_counts["20539"] = 1`
- `all_entry_counts["13860"] = 1`
- `all_entry_counts["22317"] = 1`
- `first_args_by_id["22317"] = [{ kind: "string", length: 9345, head:
  "aid=2046626881&protocol=https&accver=1&showtype=popup&ua=…" },
  { kind: "object", keys: ["py"] }]`
- `first_args_by_id["20539"] = [{ kind: "string", length: 9345, head:
  "aid=2046626881&protocol=https&…" }]`

The 9345-byte string head is **byte-identical** between the fn 20539
arg0 and the fn 22317 arg0. The fn 22317 arg1 is the `{py}` object.
fn 20539's body is `slot8(body, {py})` at pc 20749 (`OP_66 2`). There is
no other live function on the run path that takes `(string[9345],
{py:…})`. The slot-8 hop and fn 22317 are the same function, called once
per send.

**Static name match**: fn 22317's FUNC_CREATE at pc 24234
(`OP_58 22317 6 2 17 10 18 12 19 9 20 11 21 8 22 7 3 4`) lives inside
fn 20970's body (`OP_40 13` at pc 20970, line 12465; body span
20970..24256, terminated by `OP_16` at pc 24256). fn 20970 is itself a
webpack module factory — its own FUNC_CREATE `OP_58 20970 0 3 3 4 5` at
pc 24257 has argc=3 argmap=[3,4,5] = `(module, exports, require)`. The
relevant tail in fn 20970:

| pc | op | meaning |
|---|---|---|
| 22282 | `OP_47 4` | push slot 4 (= `exports`) |
| 22284..22311 | `OP_10 …` × 14 | build literal `"getCaptchaData"` |
| 22313 | `OP_59` | combine into ref pair `[exports, "getCaptchaData"]` |
| 22314 | `OP_06 24234` | JUMP over fn 22317's body (and over fn 22038/22400/22730/23399/23898 nested bodies) |
| 24234 | `OP_58 22317 …` | push fn 22317 closure (capturing 6 outers, taking 2 args) |
| 24252 | `OP_24` | STORE_REF: `exports.getCaptchaData = fn 22317` |

So **fn 22317 IS exported as `module.exports.getCaptchaData`** by fn
20970's module body. Module 32 in `require(32)` (fn 19507 pc 19580) is
fn 20970's module — and `module32.getCaptchaData = fn 22317` is the
function fn 19604 receives as its single argument from `init`'s caller,
which becomes fn 20140's slot 3 → fn 20539's slot 8.

Compatible with this: fn 20843 (the proxyXHR sister submodule body, at
pcs 20843..20949) calls `module43.getCaptchaData` at pc 20945 via
`m76.init(m43.getCaptchaData)` (literal `"init"` at 20902..20911,
literal `"getCaptchaData"` at 20914..20943). The exact module-id
numbering of 32 vs 43 is webpack-internal and depends on the live build,
but the structural fact stands: **everything that calls `init` passes
`getCaptchaData` as its argument**, and `getCaptchaData` everywhere
resolves to fn 22317.

**fn 22317 body range**: pcs 22317..24233 (`OP_40 23` at line 13287
through `OP_16` at line 14470). Argc = 2 (slot 3 = body, slot 4 =
options). Captures 6 outers (slot 17 ← outer 10, slot 18 ← outer 12,
slot 19 ← outer 9, slot 20 ← outer 11, slot 21 ← outer 8, slot 22 ←
outer 7).

**One-sentence role**: fn 22317 receives the orchestrator's full POST
body and the `{py}` flag from fn 20539, builds an 8-field key/value
accumulator object on local slot 6 from environment probes (`tdc.getData`,
`window.top === window`, etc.), shuffles a name array via a randomised
sort comparator, joins the fields in that shuffled order to a 110-byte
`name=value&…` string, calls `encryptData` (= fn 13860) on it, and
returns `originalBody + "&vData=" + base64(ciphertext)`.

## 4. Walking fn 22317

This walk is intentionally light because `FN-22317-DECOMPILE.md` (44.2.6)
already covers fn 22317 opcode-by-opcode; this section only covers the
parts load-bearing for 44.2.8's two open questions (the slot-8 identity
and the per-run order). All citations below are pcs in
`disassembly-full.txt`.

### 4a. Argument binding and accumulator init (pcs 22317..22349)

```
22317  OP_40 23                 ; allocate 23 locals
22319..22347 OP_42 2..16        ; clear locals 2..16
22349 OP_47 6                   ; push slot 6 (the kv accumulator object)
```

Slot 3 = `body` (string, 9345 bytes), slot 4 = `{py}` (object), slot 6 =
the kv accumulator object that all `STORE_REF` writes below populate.
Other slots are scratch.

### 4b. py + env (pcs 22351..22725)

The first two `STORE_REF` writes onto slot 6 set the keys observed in
the runtime trace:

| pc | key | value |
|---|---|---|
| 22351..22387 | `"object"` | typeof check (selects between `"o"`-shaped values, side-effect setup) |
| 22675..22719 | `"py"` | `args.py` from slot 4 |
| 22693..22719 | `"env"` | ternary on `slot17.<call>` → `"1"` or `"0"` (slot 17 = captured outer slot 10) |
| 22725 | `OP_47 7` | push slot 7 (the helper for cLod state) |
| 22727 | `OP_06 22972` | JUMP over fn 22730's nested body |

(Where the body branches into nested fn 22400 at pc 22663 and fn 22730
at pc 22972, those bodies are skipped by JUMPs — they are local helper
factories called once for `cLod` state and array-iter helpers
respectively. They are not part of the slot-8 walk.)

### 4c. cLod, ss, key, version, tp, inf (pcs 22972..23394)

After the JUMP over fn 22730 (pc 22965 OP_06 22866 — a backward branch
into the cLod loop body — and pc 22968 OP_47 5 followed by pc 22971
OP_16 close fn 22730's nested body), control resumes with field writes:

| pc range | key set on slot 6 | source |
|---|---|---|
| 22981..23004 | `"Array"` (Array.isArray probe sets cLod state) | call result |
| 23013..23022 | `"sess"` | call into slot 17 (`get tdc.sess`) |
| 23028..23056 | (pool of single chars `abcdefghijklmn`) | random `key` value pool |
| 23061..23089 | `"cLod"` | result of `slot8(window?...)` |
| 23076..23110 | `"window"` typeof and `loadTDC` / `unloadTDC` literals | branch on whether `window.TDC` exists |
| 23113..23223 | `"window".TDC.<unloadTDC|loadTDC>` | `cLod` value selection |
| 23227..23260 | (`"length"` probe on collected pool) | array length read |
| 23268..23329 | `"charAt"` loop on pool | builds the random `key` 4-character value |
| 23331..23393 | `"inf"` ← `"top" : "iframe"` | branch on `window.top === window` |

Each of these `OP_24 STORE_REF` writes targets slot 6 (the accumulator
object). After this section, slot 6 has all 8 fields populated:
`{tp, key, py, env, version, cLod, inf, ss}` plus `sess` (which is held
separately and emitted later).

### 4d. The order array (pcs 23769..23895)

This is the load-bearing section for the per-run order question.
Immediately after the script-collection helper fn 23399 (created at
pc 23727 and called at 23735), fn 22317 builds an Array literal
containing the 8 field names:

| pc | op | semantics |
|---|---|---|
| 23753 | `OP_47 13` | push slot 13 (target for the Array) |
| 23755..23767 | `OP_10 …` + `OP_55 0` | new Array (`[]`) |
| 23769 | `OP_39` | duplicate top |
| 23770 | `OP_08 0` | push int literal 0 |
| 23772..23778 | `OP_10 116, 112` | string `"tp"` |
| 23778 | `OP_24` | STORE_REF: `arr[0] = "tp"` |
| 23782..23793 | int 1, `"key"`, STORE_REF | `arr[1] = "key"` |
| 23796..23805 | int 2, `"py"`, STORE_REF | `arr[2] = "py"` |
| 23808..23819 | int 3, `"env"`, STORE_REF | `arr[3] = "env"` |
| 23822..23841 | int 4, `"version"`, STORE_REF | `arr[4] = "version"` |
| 23844..23857 | int 5, `"cLod"`, STORE_REF | `arr[5] = "cLod"` |
| 23860..23871 | int 6, `"inf"`, STORE_REF | `arr[6] = "inf"` |
| 23874..23883 | int 7, `"ss"`, STORE_REF | `arr[7] = "ss"` |
| 23885..23894 | `OP_10 …` | string `"sort"` |

After pc 23894 the stack holds `[arr, "sort"]` ready for a method call.

### 4e. The randomised comparator (pcs 23898..23949)

Immediately following the literal build, fn 22317 nests fn 23898 and
calls `arr.sort(fn 23898)`:

```
23898  OP_40 3                 ; fn 23898 body start, 3 locals
23900  OP_42 2                 ; (no args bound — a 2-arg comparator stub)
23902..23925 OP_10 + OP_32 + OP_41
                                ; build "Math" GET, then ".random" GET
23926  OP_02 0                 ; call Math.random()
23928  OP_08 0.5               ; push 0.5
23930  OP_31                   ; >  comparison
23931  OP_60 23941              ; JZ to false branch
23933  OP_50 0                 ; (push frame zero / coerce)
23935  OP_08 1                 ; push 1
23937  OP_21                   ; negate => -1
23938  OP_06 23944              ; JUMP to return
23941  OP_05                   ; (pop on false branch)
23942  OP_08 1                 ; push 1
23944  OP_16                   ; RETURN
23945  OP_58 23898 0 0          ; create fn 23898 closure (no captures, no args used)
23949  OP_02 1                  ; call arr.sort(comparator)
23951  OP_36                    ; STORE_LOCAL (assigns sorted result back)
```

This is the textbook Fisher-Yates anti-pattern:
```js
arr.sort(function () {
  return Math.random() > 0.5 ? -1 : 1;
});
```
which produces a per-call non-uniform but observably-different
permutation of the 8-element array on every send.

### 4f. The per-name `name=value` join loop (pcs 23985..24084)

After the sort, fn 22317 walks the now-shuffled name array and builds
the kv string by reading `accumulator[name]` for each name in shuffled
order and pushing `name + "=" + value` strings into a result array on
slot 14:

| pc | op | semantics |
|---|---|---|
| 23985..23990 | `OP_47 14`, `OP_55 0`, `OP_36`, `OP_08 0` | new Array on slot 14, init i=0 |
| 23995 | (loop top) | `OP_47 10` push i |
| 23997..24014 | `OP_63`, `OP_47 13`, build `"length"`, `OP_59 OP_54` | read `arr.length` |
| 24015..24017 | `OP_62 OP_23 OP_60` | `i < length` test, JZ to loop end |
| 24023..24028 | `OP_47 15`, push i, read `arr[i]` | current name → slot 15 |
| 24037..24046 | build `"push"` | push method |
| 24047 | `OP_00 15` | push name |
| 24049..24052 | build `"="` + concat | `name + "="` |
| 24053..24058 | `OP_47 6`, `OP_00 15` push name, `OP_59 OP_54` | read `accumulator[name]` |
| 24059 | `OP_20` | concat with `"="`-prefixed left side |
| 24060 | `OP_02 1` | `slot14.push(name + "=" + value)` |
| 24062..24083 | i++, JUMP back to 23995 | |

After the loop, slot 14 holds the array of 8 `"name=value"` strings in
the **shuffled order set by the fn 23898 sort**.

### 4g. join → encryptData → vData injection (pcs 24086..24232)

```
24086  OP_47 16                 ; push slot 16 (a captured outer)
24088  OP_47 21                 ; push slot 21 (= captured outer slot 8 = the encryptData module exports)
24090..24105 build "default"
24106..24119 build "encode" + OP_41
                                ; resolves slot21.default.encode
24120  OP_47 22                 ; push slot 22 (= captured outer slot 7 = sister helper)
24122..24145 build "encryptData" + OP_59
                                ; resolves <something>.encryptData
24146  OP_47 14                 ; push the array of "name=value" strings
24148..24157 build "join"
24158..24159 build "&"
24161  OP_02 1                 ; call arr.join("&") → 110-byte kv string
24163  OP_02 1                 ; call encryptData(kvString) → ciphertext base64
24165  OP_02 1                 ; call default.encode(...) → wrapped result
24167  OP_36                    ; store result into slot 16
24170..24205 build "window", GET "DEBUGMODE", OP_54 DEREF
                                ; (debug branch left disabled)
24206  OP_47 3                 ; push slot 3 (= original body, the 9345-byte string)
24208  OP_00 3                 ; ditto (assignment target ref)
24210..24225 build "&vData=" literal, OP_20 concat
                                ; → "&vData=" + ciphertext (?)
24226  OP_00 16                 ; push slot 16 (the encoded result)
24228  OP_20                    ; concat with original body + "&vData="
24229  OP_36                    ; store back into slot 3
24230  OP_64 0                  ; (push frame zero)
24232  OP_05                    ; pop
24233  OP_16                    ; RETURN slot 3
```

The runtime trace confirms exactly this shape: fn 22317 returns a string
of length **9345 + 7 + 152 = 9504**, which is the value fn 20539 then
forwards via `savedSend.call(this, …)` at pc 20770. The fn 13860 entry
trace's first arg
`env=1&key=qLCZ&version=2&cLod=unloadTDC&ss=0%2C&tp=Cannot read
properties of null (reading 'src')&py=0&inf=top` is the
`arr.join("&")` output for the 44.2.7 run's specific shuffle order.

The encryptData ref chain
(`slot21.default.encode(slot22.encryptData(arr.join("&")))`) maps onto
the runtime pipeline 44.2.7 documented:
- `slot22.encryptData` → fn 13860 (the encrypt entry)
- which internally → fn 13989 (pad) → fn 14153 (permute) → fn 15918
  (XTEA) → fn 15591/fn 15735 (base64 emit)
- `slot21.default.encode` is the URL-safe wrap shown by 44.2.7's
  9504-byte trailer (it is currently a passthrough that adds the
  `&vData=` framing — but the actual `&vData=` literal is built
  inside fn 22317 at pcs 24210..24224, see the alphabet above).

## 5. Per-run order source

**Mechanism (category iii from the 44.2.8 brief)**: a randomised
`Array.prototype.sort` comparator inside the same function that builds
the kv string. **Every pc** is in §4d–4e above. Compactly:

| pc | role |
|---|---|
| 23753..23894 | fn 22317 builds `arr = ["tp","key","py","env","version","cLod","inf","ss"]` |
| 23898..23944 | nested fn 23898 body: `return Math.random() > 0.5 ? -1 : 1` |
| 23945 | `OP_58 23898 0 0` — push fn 23898 closure (no captures) |
| 23949 | `OP_02 1` — call `arr.sort(fn 23898)` |
| 23951 | `OP_36` STORE_LOCAL — write back the (mutated) sorted array |
| 23985..24084 | per-element loop emits `"name=" + acc[name]` in the new shuffled order |
| 24161 | `OP_02 1` — `arr.join("&")` produces the 110-byte string in shuffled order |

This explains both committed fixtures:
- jsdom fixture order `[inf, env, tp, key, py, ss, cLod, version]`
  — one shuffle draw.
- HAR fixture order `[inf, env, tp, cLod, version, key, ss, py]` —
  another shuffle draw from the same comparator.
- 44.2.7 run order `[env, key, version, cLod, ss, tp, py, inf]` — a
  third draw.

All three are permutations of the same 8-element schema set produced by
the same call site. **There is no environment-dependent ordering, no
property-iteration accident, no prologue shuffle elsewhere.** Per-run
order is solely the result of `arr.sort(fn 23898)`.

## 6. Runtime cross-check

`output/vm-slide/fn-20539-entry-trace.json` `all_entry_counts`
(extracted verbatim):

```
20539: 1
20140: 1
20353: 1
22317: 1
13860: 1
13989: 1
14153: 1
15220: 1
15918: 1
15241: 14
15591: 32
15735: 28
23898: 15
```

- fn 22317 enters **once**, the same as fn 20539 and fn 13860. This is
  the core liveness check: the slot-8 hop must enter exactly once per
  send, and fn 22317 does.
- fn 23898 enters 15×. JavaScript engines on 8-element sort with a
  non-deterministic comparator typically perform between O(n log n) and
  O(n²) comparisons. Node 18's TimSort on the jsdom run did 15
  comparisons. This is consistent with 1 sort call per send, NOT with
  8 or 15 unrelated DOM operations as 44.2.7 §8 incorrectly speculated.
- `first_args_by_id["23898"] = [{"kind":"string","length":3,"head":"key"},
  {"kind":"string","length":2,"head":"tp"}]` is the FIRST comparison
  in that sort: `cmp("key", "tp")`. Both strings are members of the
  exact 8-element schema array built at pcs 23769..23884. This is direct
  proof — not just a structural match — that fn 23898 is invoked as the
  comparator for the schema array, not a DOM-helper.
- `first_args_by_id["22317"] = [{"kind":"string","length":9345,"head":
  "aid=2046626881&protocol=https&accver=1&showtype=popup&…"},
  {"kind":"object","keys":["py"]}]` matches fn 20539's first arg
  byte-for-byte and the `{py}` object built by fn 20539 at pc 20705..20748.
  This is direct proof that fn 22317 IS the function fn 20539 calls at
  pc 20749.

## 7. Reconciliation with prior 44.2.x notes

- **`FN-22317-DECOMPILE.md` (44.2.6)**: structurally correct, classification
  wrong. Its "fn 20539 dead code on Chrome path" verdict was based on a
  static body-replacement hypothesis that runtime contradicted in 44.2.7.
  fn 20539 IS live, fn 22317 IS the function it calls, and the
  `&vData=` literal at pcs 24210..24224 is **not** the global anomaly
  44.2.6 thought it was — it is the fn 22317 vData injection 44.2.5
  attributed to fn 20539. fn 22317 is the actual injection site, fn
  20539 is the gate that forwards to it.
- **`SORT-ORDER-RESOLUTION.md` (44.4.1)**: correct on every claim. fn
  23898 IS the comparator, the sort IS at pc 23949, and the schema array
  IS built at pcs 23769..23884. 44.2.7 §8's "drop as unreached" verdict
  was a misreading of `first_args_by_id["23898"]` as a DOM helper —
  44.2.8 retracts that. fn 23898 is the live comparator, on the live
  path, called once per send (at 15 comparisons) for the actual
  fingerprint name shuffle. **44.4.1 stands as committed.**
- **`FN-20539-DECOMPILE-44.2.7.md`**: §3 and §5 correct. §7 ("Unresolved
  hop") is now closed by this note: fn 20139's slot 3 = fn 20140's
  argument = fn 22317 (passed in via fn 19604 → `proxyXHR(fn 22317)`).
  §8 "44.4.1 drop as unreached" is retracted.

## 8. What this unlocks for 44.5b

The from-scratch builder (`build-fingerprint-plaintext.js`) needs to
replicate fn 22317's behavior. The minimal recipe to produce a
**byte-identical** kv string (matching the cipher half end-to-end) is:

1. **Compute all 8 field values deterministically** for the target
   environment. The runtime values for the 44.2.7 run were:
   - `env`: `"1"` (Chrome path; `"0"` on IE9 branch)
   - `key`: 4 random chars from pool `abcdefghijklmn`
   - `version`: `"2"` (constant in this build)
   - `cLod`: `"unloadTDC"` or `"loadTDC"` depending on tdc lifecycle
     state at send time
   - `ss`: solver state counter (URL-encoded)
   - `tp`: captured JS error message string (anti-debug probe)
   - `py`: `"0"` or `"1"` from fn 20539's `XHR.prototype.send !== self`
     check
   - `inf`: `"top"` if `window.top === window` else `"iframe"`
2. **Build the schema name array exactly as fn 22317 does**:
   `["tp","key","py","env","version","cLod","inf","ss"]` — **this fixed
   source order is the pre-shuffle baseline. Do not alphabetise.**
3. **Shuffle** by calling `arr.sort(() => Math.random() > 0.5 ? -1 :
   1)`. To produce a byte-identical replay against a captured fixture,
   the from-scratch builder needs either:
   - a **seeded PRNG** that reproduces the same comparison sequence the
     captured run used (15 comparisons for the jsdom path with Node
     18 TimSort), or
   - to **fix the order to a captured permutation** (e.g., the HAR
     fixture's `[inf, env, tp, cLod, version, key, ss, py]`) and run
     the rest of the pipeline against that, validating against the
     committed `vdata-har-capture.json` fixture.
4. **Join** with `&`, **call `encryptData`** (the existing tools/vdata
   pipeline already covers fn 13860 → fn 13989 → fn 14153 → fn 15918 →
   fn 15591), and **append `"&vData=" + ciphertext`** to the original
   body.

The known-correct replay oracle `build-fingerprint-plaintext.js`
(`./research/vm-slide-stack-vm/build-fingerprint-plaintext.js`)
already encodes some of this; 44.5b's job is to make the schema-array
construction + sort step explicit and parameterise it on either
(seeded PRNG) or (fixed-permutation replay) — pick the latter for
fixture round-trips and the former for live token generation.

## 9. Open follow-ups (deliberately out of 44.2.8 scope)

- The 8 individual field **value builders** inside fn 22317 (e.g., the
  `Math.random()` 4-char `key` builder at pcs 23227..23329, the
  `tdc.getData()` solver-state probe for `ss`, the captured-error probe
  for `tp`) are only sketched in §4c. Pinning each pc-by-pc is
  Phase 44.6's job (taxonomy of pre-pad fields).
- The exact module ids `m32` (= getCaptchaData module fn 20970) and
  `m44` (= proxyXHR module fn 20107) for this build need confirmation
  against `output/vm-slide/window-installs.json` if downstream code
  needs to reach them by id.
- `fn-13860-caller-trace.json` was NOT generated for 44.2.8 — the
  static walk + the existing 44.2.7 entry-counts trace were sufficient
  to pin both open questions. Adding a caller-frame tracer is unneeded
  unless 44.6 requires it.
