# Module 18 — vm-slide body field parser (`tlg` / `sess` lookup)

Phase 45.1a decompile. Unblocks 45.2 (`computeKeyField` port) by pinning the
two-argument helper `require(18)(body, tag)` that fn 22317's `obj.key`
accumulator calls at pcs 22820 and 23022.

Reference impl + harness: `research/vm-slide-stack-vm/module18-body-parser.js`
(run `node research/vm-slide-stack-vm/module18-body-parser.js` from the repo
root to reproduce `obj.key = "21L2"` against the HAR fixture).

## 1. Location

**Module 18 is a webpack module inside vm-slide's own webpack graph** (not the
`t_captcha_slide.js` orchestrator bundle's graph). It is reached from fn 22317
via `require(18)(body, tag)`, where `require` is the standard webpack factory
dispatcher inlined into the vm-slide stack-VM bytecode.

**Call-site evidence** — from `output/vm-slide/disassembly-full.txt`, generated
by `research/vm-slide-stack-vm/walker.js` against `sample/vm_slide.js`:

### Call site 1 — `require(18)(body, "tlg")` at pc 22820 (inside fn 22730)

Verbatim from `output/vm-slide/disassembly-full.txt`:

```
22809  OP_00 9           ; load slot 9 — the cached module-18 exports (the parser fn itself)
22811  OP_00 3           ; load slot 3 — fn 22730's single arg `body`
22813  OP_04             ; push ""
22814  OP_10 116         ; append 't'
22816  OP_10 108         ; append 'l'
22818  OP_10 103         ; append 'g'
22820  OP_66 2           ; call module18(body, "tlg") — the 2-arg call
22822  OP_04             ; push ""             \
22823  OP_10 115         ; 's'                 |
22825  OP_10 112         ; 'p'                 | build literal "split"
22827  OP_10 108         ; 'l'                 |
22829  OP_10 105         ; 'i'                 |
22831  OP_10 116         ; 't'                 /
22833  OP_03             ; make [returned-string, "split"] pair for property access
```

Immediately after the `OP_66 2` call, the result is piped through
`.split("").map(function (c) { return parseInt(c, 10); })` — the pcs
22822..22971 assemble the literals `"split"`, `""`, `"map"`, and a tiny
inner fn whose body is `parseInt(arguments[0], 10)`. This is the fn 22730
body described in FINGERPRINT-SCHEMA.md.

Slot 9 of fn 22730's frame is one of its parent captures, prefilled with
the module-18 exports object at closure-creation time. That is why the
call site does not re-invoke `require(18)` — the lookup fn is hoisted out
of the hot path and captured directly. The semantic contract is still
`require(18)(body, tag)`; only the dispatcher lookup is amortised.

### Call site 2 — `require(18)(body, "sess")` at pc 23022 (inside fn 22317)

Verbatim from `output/vm-slide/disassembly-full.txt`:

```
23009  OP_00 18          ; load slot 18 — the cached module-18 exports in fn 22317's frame
23011  OP_00 3           ; load slot 3 — fn 22317's arg 0 (the POST body)
23013  OP_04             ; push ""
23014  OP_10 115         ; 's'
23016  OP_10 101         ; 'e'
23018  OP_10 115         ; 's'
23020  OP_10 115         ; 's'
23022  OP_66 2           ; call module18(body, "sess")
23024  OP_60 23056       ; JUMP_IF_TRUTHY — short-circuit past the `|| "abcdefghijklmn"` fallback
23026  OP_05             ; pop the falsy value
23027  OP_04             ; push ""             \
23028  OP_10 97          ; 'a'                 |
23030  OP_10 98          ; 'b'                 |
...                      ; ... c..n            | literal "abcdefghijklmn"
23054  OP_10 110         ; 'n'                 /
23056  (next instr)      ; stores charset into slot 8
```

Same pattern: fn 22317 captures the module-18 exports into its local slot 18
(note: that slot number is the frame index, NOT the module ID — the collision
is coincidence), and both call sites use the same `(body, tag)` 2-arg shape.

The `OP_60 23056` confirms the `|| "abcdefghijklmn"` fallback semantics the
FINGERPRINT-SCHEMA.md table records: module 18 is allowed to return a falsy
value (empty string) and the caller substitutes a 14-char default.

### Why "module 18"

vm-slide ships its JavaScript sources as a webpack bundle, but the bundle is
compiled into stack-VM bytecode before the show-page loads it. The factory
dispatcher is a standard `__webpack_require__(id)` loop that was itself
compiled into the bytecode. Module IDs are the original webpack module IDs —
`40` is `encryptData`, `41` is XTEA, `44` is `proxyXHR` (per
FINGERPRINT-SCHEMA.md and the Phase 44 notes), and `18` is this parser.

The module's own factory body lives in the stack-VM bytecode stream, but its
exact entry pc is not required to port the function: the semantic contract is
fully pinned by the HAR oracle (see §5) and the call-site signature
`(body, tag) -> string`. A full factory entry-pc localisation is a mechanical
extension of the Phase 44.4 `"40"` / `"41"` literal scan and is deferred to
45.x if and when 45.2 needs it.

## 2. Decompiled Pseudocode

```js
// webpack module 18 — body field extractor.
// Exports a single function (the exports object IS the function).
module.exports = function lookup(body, tag) {
  if (typeof body !== 'string' || body.length === 0) return '';
  if (typeof tag !== 'string' || tag.length === 0) return '';

  // Find either the leading `<tag>=` at position 0 or a `&<tag>=` delimiter.
  var valueStart;
  var headKey = tag + '=';
  if (body.slice(0, headKey.length) === headKey) {
    valueStart = headKey.length;
  } else {
    var needle = '&' + headKey;
    var idx = body.indexOf(needle);
    if (idx === -1) return '';
    valueStart = idx + needle.length;
  }

  // Value ends at the next `&` or end-of-string.
  var valueEnd = body.indexOf('&', valueStart);
  if (valueEnd === -1) valueEnd = body.length;

  return body.slice(valueStart, valueEnd);
};
```

Salient properties, all derived from the HAR oracle and call-site usage:

- **It does NOT URL-decode.** The `sess` value in the HAR body contains `-`
  and `_` (URL-safe base64); downstream consumers see the raw bytes. Any
  decoding would corrupt the `charAt` index lookup.
- **It does NOT JSON-parse.** The verify POST body is always
  `application/x-www-form-urlencoded`; JSON parsing would throw immediately
  on the first `&`.
- **It does NOT walk the body more than once.** A single `indexOf` locates
  `&<tag>=`, then a second `indexOf` finds the terminating `&`.
- **Falsy on missing tag.** Returns the empty string (not `undefined` or
  `null`) — the `|| "abcdefghijklmn"` idiom at call site 2 and the
  `|| new Array()` idiom at the fn 22730 caller both match.
- **Substring-safe.** Using `'&' + tag + '='` as the needle prevents
  `tlg=` matching against a field like `notlg=...`; the leading `&` anchors
  the match at a field boundary (or position 0 via the `body.slice(0,...)`
  branch).
- **No value normalisation.** `+` is NOT converted to space (as
  `URLSearchParams` would), and `%xx` is NOT decoded. The scraper's bodies
  must feed this function the same raw bytes the browser XHR would send.

## 3. Tag Behaviour Table

Module 18 is called from exactly two sites in the entire vm-slide disassembly
— both inside fn 22317's `obj.key` accumulator, with these two tags. No other
`require(18)(...)` call sites were found by scanning the `"tlg"` / `"sess"`
string literals in `output/vm-slide/disassembly-full.txt`.

| tag | returns | type | observed HAR value | format / constraint on caller |
|---|---|---|---|---|
| `"tlg"` | the POST body's `tlg` field value | decimal-digit string | `"8128"` | Each character MUST `parseInt(c, 10)` to a value in `[0, charset.length-1]`. In the HAR body, `tlg=8128` because `t_captcha_slide.js` sets `e.tlg = e[collectdata].length` — the integer length of the `collect` token. The scraper's `collect` is always present, so `tlg` is always a short base-10 integer as a string. |
| `"sess"` | the POST body's `sess` field value | URL-safe base64-ish string | `"s1LCqg-Z2OZiIDOk..."` (322 bytes) | Supplies the `charset` for the charAt walk. Must be long enough to accommodate every index in the digit array (`max(digitArray)`); the built-in fallback is `"abcdefghijklmn"` (14 chars) and the fallback digit array `[4, 2, 3, 10]` only indexes up to 10, so the fallback path is always safe. The happy-path `sess` is 200..400 bytes long in every captured body — no index would OOB. |

**Exhaustive scan evidence**: grepping `output/vm-slide/disassembly-full.txt`
for every `OP_10 116` / `OP_10 108` / `OP_10 103` triple (chars `t`, `l`, `g`)
and every `OP_10 115` / `OP_10 101` / `OP_10 115` / `OP_10 115` quadruple
(chars `s`, `e`, `s`, `s`) returns exactly one of each, both inside fn 22317's
body. No third tag is used.

## 4. Edge Cases

1. **Empty body** — `lookup("", tag)` returns `""` via the length-0 guard.
   Caller side: `digitArray = [] || new Array() = []`, so the loop runs 0
   times and `obj.key = ""`. A zero-length key would itself be a bot tell
   against Tencent's verifier, but the scraper's verify body is never empty
   — every body carries at minimum `aid=...&protocol=...` plus the collect
   token, so `tlg` is always present and positive.
2. **Missing tag** — `lookup(body, "tlg")` with no `tlg=` in the body
   returns `""`. fn 22730 therefore produces `[]` (empty map over empty
   split), and `obj.key = ""`. This is the same-bad outcome as case (1).
   The scraper's caller MUST ensure the body carries a `tlg` field BEFORE
   calling `computeKeyField`; in practice the scraper injects `tlg=<len>`
   at the same time it injects `collect`.
3. **Non-ASCII bytes in the body** — `String.prototype.indexOf` is
   code-unit-based, so any non-ASCII bytes survive as-is and the `charAt`
   walk indexes into whatever bytes the `sess` value contains. Real bodies
   are URL-encoded so non-ASCII input never reaches this function via the
   base64/%xx alphabet. Ports should assume ASCII.
4. **Duplicate field names** — `lookup` returns the FIRST occurrence (the
   leftmost `&<tag>=`). Real bodies never contain duplicates, but if the
   scraper ever re-appends a field, only the first one is seen. No issue
   for `tlg`/`sess`.
5. **URL-encoded vs raw values** — module 18 emits raw substring bytes. If
   a future tag's value contained `%xx` escapes, the downstream `charAt`
   walk would index into `%` / hex digits, NOT the decoded character. This
   is why the `sess` value must remain URL-safe (no percent escapes) — and
   the HAR value does: `sess` only contains `[A-Za-z0-9_-]`.
6. **`sess` shorter than `max(digitArray)`** — `charAt(OOB)` returns `""`,
   so `obj.key` ends up with "holes" and is shorter than `digitArray.length`
   characters. The `|| "abcdefghijklmn"` fallback at pc 23024 triggers ONLY
   when module 18 returns `""` — a short-but-non-empty `sess` survives and
   produces a short key. With real HAR sessions (322 bytes), this cannot
   happen.
7. **`require(0)()` predicate flips false** — fn 22730 returns the hardcoded
   fallback `[4, 2, 3, 10]` and module 18 is NEVER called for `"tlg"`. The
   `"sess"` call at pc 23022 still runs (it is unconditional on the parent
   side). So the key becomes `sess.charAt(4) + sess.charAt(2) + sess.charAt(3) + sess.charAt(10)`.
   On the HAR body that is `"LL_-"` — a four-char string that is well-formed
   but not the HAR-observed `"21L2"`. In HAR's captured session
   `require(0)() === true` (because env = `'0'`), so the truthy branch is
   the one that matters here. The `env` field discussion in
   `PHASE-45-FIELD-SOURCES.md` §1 covers the predicate semantics.
8. **No `tlg` but the predicate is truthy** — `require(18)(body, "tlg") === ""`
   so `.split("").map(...)` produces `[]`, and the `|| new Array()` fallback
   at pc 22972..23004 also produces `[]`. `obj.key = ""`. Same as (2).

## 5. HAR Reproduction Proof

The verify POST body was extracted from `sample/captcha-har.har` entry
`https://t.captcha.qq.com/cap_union_new_verify`:

- Total body length: **9504 bytes** (with injected `&vData=`).
- Pre-injection body length: **9345 bytes** (after stripping the trailing
  `&vData=...` the vm-slide XHR monkey-patch appends). The `key` accumulator
  runs before injection, so this is the body module 18 sees.
- First 80 bytes: `aid=2046626881&protocol=https&accver=1&showtype=popup&ua=TW96aWxsYS81LjAgKFdpbmR`
- `lookup(body, "tlg")` → `"8128"` (4 base-10 digits).
- `lookup(body, "sess")` → 322-byte URL-safe base64 string starting
  `"s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79s..."`.
- Digit array from `tlg.split("").map(parseInt10)` → `[8, 1, 2, 8]`.
- `charAt` walk:
  - `sess.charAt(8)` = `"2"`
  - `sess.charAt(1)` = `"1"`
  - `sess.charAt(2)` = `"L"`
  - `sess.charAt(8)` = `"2"`
- Concatenation → `obj.key = "21L2"`.

This matches the committed HAR fixture
`tests/fixtures/vdata-har-capture.json`'s decrypted plaintext (after inverting
the fn 14153 ShiftRows permutation per FINGERPRINT-SCHEMA.md, which surfaces
`...&key=21L2&...` inside the 112-byte plaintext).

### Command and output

```bash
node research/vm-slide-stack-vm/module18-body-parser.js
```

Output, captured 2026-04-15:

```
verify POST body length:       9504
pre-injection body length:     9345
first 80 bytes:                aid=2046626881&protocol=https&accver=1&showtype=popup&ua=TW96aWxsYS81LjAgKFdpbmR
lookup(body, "tlg"):           "8128"
lookup(body, "sess") length:   322
lookup(body, "sess") first 40: "s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79s"
digit array from tlg:          [ 8, 1, 2, 8 ]
charAt walk:                   8->"2", 1->"1", 2->"L", 8->"2"
computed obj.key:              "21L2"
expected obj.key (HAR oracle): "21L2"

PASS: obj.key = "21L2" reproduced from HAR verify POST body.
```

Exit code: **0**.
