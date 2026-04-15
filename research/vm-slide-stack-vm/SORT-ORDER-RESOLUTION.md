# SORT-ORDER-RESOLUTION (Phase 44.4.1)

## Verdict

**Hypothesis (ii) holds: fn 23898 is non-lexicographic.**

fn 22317 really does call `arr.sort(cmp)` at pc 23949, and the comparator
fn 23898 is the well-known JavaScript Fisher-Yates anti-pattern:

```js
function cmp() {
  return Math.random() > 0.5 ? 1 : -1;
}
```

Each call to `getCaptchaData` shuffles the 8-key schema array
`['tp','key','py','env','version','cLod','inf','ss']` into a fresh,
uniformly-random-ish permutation, and the kv-loop at pcs 23995..24084
joins the fields in that shuffled order. The two committed fixture orders
(`[inf,env,tp,key,py,ss,cLod,version]` for jsdom and
`[inf,env,tp,cLod,version,key,ss,py]` for HAR) are simply two different
draws from this shuffle. Neither is alphabetical and neither needs to be.

Phase 44.2.6's note that the sort exists at pc 23949 is **correct** about
the call site; what 44.2.6 missed was that the comparator itself is
randomised, not lexicographic.

## fn 22317: sort call site (pcs 23882..23951)

The sort target is the 8-element schema array built at pcs 23769..23884
(`OP_55 0` at pc 23767 is `new Array(...)`, then 8 `arr[i] = name` writes
via `OP_24 STORE_REF`). After the schema is fully built, fn 22317 stages
the receiver and the comparator:

```
23882  OP_24                      ; arr[7] = "ss"
23883  OP_05                      ; pop index pair cleanup
23884  OP_05
23885  OP_04                      ; ""
23886  OP_10 115                  ; "s"
23888  OP_10 111                  ; "so"
23890  OP_10 114                  ; "sor"
23892  OP_10 116                  ; "sort"
23894  OP_03  MK_PAIR              ; -> [arr, "sort"]
23895  OP_06 23945                 ; jump over closure body
                                   ; (skips fn 23898's body literal)

; --- fn 23898 body lives in [23898, 23944] (skipped at runtime, see
;     "fn 23898 body" below) ---

23945  OP_58 23898 0 0             ; FUNC_CREATE entry=23898, 0 captures, 0 argmap
                                   ; pushes the comparator closure
23949  OP_02 1                     ; METHOD_CALL with 1 arg
                                   ; -> arr["sort"].apply(arr, [cmp])
23951  OP_36                       ; STORE_LOCAL_REF (write back into local ref)
```

The receiver of `OP_02 1` is the `[arr, "sort"]` pair built at pcs
23885..23894; the single argument is the comparator closure pushed by
`OP_58` at pc 23945. So the call is exactly `arr.sort(cmp)`.

After 23951 the loop at pcs 23995..24084 iterates the (now shuffled)
local-10 array via `OP_47 10 OP_63` + length compare + `OP_06 23995` back
edge, and inside the loop `OP_47 10 OP_63 OP_47 14 ... OP_02 1` invokes
`arr[i]`, building `key + "=" + obj[key]` for each entry and pushing them
into the `kvArr` that is later joined with `"&"` at pc 24161
(`OP_02 1` calling `kvArr["join"]`).

## fn 23898: comparator body (pcs 23898..23944)

Walked instruction-by-instruction from `output/vm-slide/disassembly-full.txt`
(line 14265 onward). Every pc cited:

```
23898  OP_40 3                    ; SET_STACK_LEN 3 (function prologue)
23900  OP_42 2                    ; ALLOC_LOCAL 2 (reserve a local slot)
23902  OP_04                      ; push ""
23903  OP_10 77                   ; "M"
23905  OP_10 97                   ; "Ma"
23907  OP_10 116                  ; "Mat"
23909  OP_10 104                  ; "Math"
23911  OP_32  MAKE_GLOBAL_REF     ; -> [U, "Math"]
23912  OP_04                      ; push ""
23913  OP_10 114                  ; "r"
23915  OP_10 97                   ; "ra"
23917  OP_10 110                  ; "ran"
23919  OP_10 100                  ; "rand"
23921  OP_10 111                  ; "rando"
23923  OP_10 109                  ; "random"
23925  OP_41  GET_PAIR            ; pop "random" + [U,"Math"], push
                                  ; [Math, "random"]
23926  OP_02 0  METHOD_CALL       ; Math.random.apply(Math, [])
                                  ; -> Math.random()
23928  OP_08 0.5                  ; push 0.5
23930  OP_31  GT                  ; -> Math.random() > 0.5
23931  OP_60 23941  JUMP_IF_TRUE  ; if true, jump to 23941 (does not pop)
23933  OP_50 0  REPLACE_TOP_K 0   ; (false branch) replace top with 0
23935  OP_08 1                    ; push 1
23937  OP_21  SUB                 ; 0 - 1 = -1
23938  OP_06 23944  JUMP          ; jump to return
23941  OP_05  POP                 ; (true branch) pop the truthy condition
23942  OP_08 1                    ; push 1
23944  OP_16  RETURN              ; return TOS  (1 in true arm, -1 in false)
```

Pseudocode:

```js
function cmp(/* a, b — unused */) {
  if (Math.random() > 0.5) return 1;
  return -1;
}
```

This is a textbook randomised "shuffle by sort" comparator. It does not
read its arguments, does not perform a lexicographic compare, and is not
guarded by any branch in the caller — every call to fn 22317 reaches pc
23949.

## Why the fixtures look "wrong"

Both fixture orders are valid samples from the random shuffle. `Math.random`
is not seeded, the V8 PRNG state at the moment of the jsdom run differs
from the moment of the HAR run, and the field ordering is **observably
non-deterministic between runs** even on the same machine. There is no
hidden lexicographic rule to recover.

Hypothesis (i) (44.2.6 misread the pc) is rejected: the sort call site is
exactly where 44.2.6 said it was; only the comparator's nature was misread.

Hypothesis (iii) (sort is conditional) is rejected: pc 23895 is an
unconditional `OP_06` jump, not a conditional branch. The closure body
[23898..23944] is skipped at construction time but always executes when
the comparator is invoked by `Array.prototype.sort`.

## Change to `build-fingerprint-plaintext.js`

`order` is now optional. When the caller omits it, the builder defaults to
`Object.keys(obj)`, leveraging JavaScript's insertion-order guarantee for
string keys. This lets a caller express any desired join order simply by
constructing the obj with keys in that order — which is exactly what the
fixture-replay path does:

```js
const obj = {};
obj.inf = ...;        // order matches the captured run
obj.env = ...;
obj.tp  = ...;
obj.key = ...;
// ...
const plaintext = buildFingerprintPlaintext({ obj });   // no order arg
```

The existing `{ obj, order }` signature still works for callers that prefer
to pass an explicit override (for example, when the obj was built by some
unordered process and the order must be supplied separately).

## Cross-check (without caller-supplied `order`)

Inverse-permuted both fixtures (`PERM` from `build-fingerprint-plaintext.js`),
parsed each plaintext into an insertion-ordered `obj`, then called
`buildFingerprintPlaintext({ obj })` without an `order` argument. Both
returned 112 bytes that compare byte-identical to the fixture
`plaintext_hex` / `har_decrypted_plaintext_hex`:

```
jsdom len=112 match=true keys=["inf","env","tp","key","py","ss","cLod","version"]
har   len=112 match=true keys=["inf","env","tp","cLod","version","key","ss","py"]
```

(The sanity-check script lives only as an inline `node -e` snippet — no
new file under `tests/` per the task's no-test-fixtures constraint. Re-run
locally with the snippet in this file's git history, or any equivalent
inverse-permute + parse + rebuild.)

## Implications for downstream work

- The reference impl can no longer claim to "produce" a fingerprint
  plaintext from raw collector output alone; it requires either a
  pre-ordered obj or an explicit `order`. A live productisation in
  `tools/vdata-generator/` (Phase 44.5b) must seed its own RNG (or accept
  one) when emitting fresh vData strings for a real session — there is no
  canonical join order to default to.
- Any future test that wants byte-identical reproduction of a fixture must
  either build the obj in observed order or pass `order` explicitly. Tests
  must NOT rely on `Math.random()` to reproduce a captured fixture.
- Phase 44.5 (whatever-builds-the-obj) is unaffected: it owns the
  per-field source rules, not the join order.

## Pc citation index

| Concern | Pc | File line |
|---|---|---|
| Schema array `new Array(0)` | 23767 | disassembly-full.txt L14174 |
| Schema entry "tp" written | 23778 | L14181 |
| Schema entry "ss" written (last) | 23882 | L14254 |
| `[arr, "sort"]` pair built | 23894 | L14262 |
| Skip-over-closure jump | 23895 | L14263 |
| fn 23898 body start | 23898 | L14265 |
| `Math.random()` invocation | 23926 | L14281 |
| `> 0.5` compare | 23930 | L14283 |
| Conditional branch | 23931 | L14284 |
| Returns `-1` arm | 23933..23938 | L14285..14288 |
| Returns `+1` arm | 23941..23942 | L14290..14291 |
| fn 23898 RETURN | 23944 | L14292 |
| `FUNC_CREATE 23898` | 23945 | L14293 |
| `arr.sort(cmp)` METHOD_CALL | 23949 | L14294 |
| Join loop back-edge | 24083 | L14384 |
| `kvArr.join("&")` | 24161 | L14428 |
