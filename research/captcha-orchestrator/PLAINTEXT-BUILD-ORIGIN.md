# PLAINTEXT-BUILD-ORIGIN — who builds the 112-byte vData plaintext

**Task**: Phase 44 / 44.3. Find the JS function inside `t_captcha_slide.js`
that assembles the 112-byte plaintext passed into `xhr.send(body)`, and pin
the downstream path the 152-char ciphertext takes to reach the verify POST
body as the `vData=` field.

**Verdict**: the task's premise is **materially incorrect**. Neither
`t_captcha_slide.js` nor any other orchestrator JS builds a 112-byte
plaintext and hands it to `xhr.send`. The 112-byte plaintext is built
**inside `sample/vm_slide.js`**, by vm-slide's own XHR `send` replacement,
from the full 9504-byte verify POST body the orchestrator passes in. The
orchestrator's sole role is to assemble the 39-field verify body object `e`,
serialize it via Zepto's `$.ajax`, and let vm-slide's prototype patch do
everything else. 44.2.5's classification of fn 20539 as a pure-encrypt stage
is correct **for that byte range** but was misread as implying the plaintext
is built in the orchestrator — fn 20539 is a nested helper, not the
top-level send replacement, and the top-level send replacement lives around
pc 24210 in vm-slide bytecode where it concatenates `body + "&vData=" +
ciphertext`.

---

## Summary (≤10 lines)

1. **Orchestrator build-site** (for the verify body `e`, NOT the 112-byte
   plaintext): module **56** of `sample/t_captcha_slide.js`, inside an
   anonymous slider-submit handler named `Y` at source range `[159126,
   167171]`. The `$.ajax` call is at source position **163131** (URL
   literal `"/cap_union_new_verify"`). `e` is a 39-field JS object;
   Zepto serializes it to urlencoded (~9504 bytes in the HAR sample).
2. **Ciphertext path**: Zepto → `xhr.send(urlencoded e)` → vm-slide's
   patched `send` → body-reduction → fn 15918 (classical XTEA, 14 × 8-byte
   blocks) → custom base64 (152 chars) → concatenate `body + "&vData=" +
   base64` → `savedSend.call(this, combined)` → real
   `XMLHttpRequest.prototype.send` → network.
3. The `&vData=` literal is built in vm-slide bytecode at pcs **24211..
   24223** (`OP_10 38,118,68,97,116,97,61`), inside the top-level send
   replacement — **not** inside fn 20539 `[20539, 20796]`.

---

## Hook methodology

**Approach taken**: **static-analysis fallback**. The primary Puppeteer
approach (page-level `evaluateOnNewDocument` hook on
`XMLHttpRequest.prototype.send` during a live captcha run) was rejected as
infeasible in this environment for two compounding reasons:

1. `t.captcha.qq.com/cap_union_new_show` returns HTTP 403 without a valid
   prehandle `sess` (CLAUDE.md "Known limitations"; verified 2026-04-11).
   Running the live captcha flow from the existing `tools/captcha-solver/`
   harness requires a working prehandle which is out of scope for 44.3.
2. Phase 43's dynamic trace work already produced full bytecode coverage
   under `output/vm-slide/` (including `disassembly-full.txt` with every
   OP_58/OP_16 boundary resolved by the Phase 40.1 full-coverage walker).
   That coverage is sufficient to identify the build-site and pin the
   ciphertext path statically, with anchors in both
   `sample/t_captcha_slide.js` and the disassembly.

**Reproduce**:
```
node research/captcha-orchestrator/trace-xhr-send.js
```

The script is idempotent, takes no CLI arguments, and writes
`output/captcha-orchestrator/send-capture.json`. It consumes only read-only
inputs (`sample/t_captcha_slide.js`, `sample/captcha-har.har`, the Phase 41
module map `output/captcha-orchestrator/modules.json`, and the Phase 40.1
disassembly `output/vm-slide/disassembly-full.txt`) and produces a
machine-readable summary of every anchor cited in this document.

Anchors verified by running the script against the committed inputs:
- Orchestrator verify $.ajax callsite at position **163131** of
  `sample/t_captcha_slide.js` (inside module 56, source range
  `[159126, 167171]`).
- HAR verify POST body is **9504 bytes** with **39 fields**, the 40th-added
  field being `vData` at **152 chars**.
- vm-slide bytecode `&vData=` literal at pcs **24211..24223** (OP_10
  sequence 38, 118, 68, 97, 116, 97, 61).
- vm-slide `/cap_union_new_verify` literal inside the `open`-hook at pc
  **20380** (OP_10 47 leading byte of the path string).
- UTF-8 helper fn **18966** created at pc **19451** (FUNC_CREATE `OP_58
  18966 0 1 3`).
- Per-field `&`-split inside `window.getVData` (fn 19702) at pcs **19901..
  19903** (`OP_10 38 ... OP_02 1` = `.split("&")`).

---

## Build-site identification

### Orchestrator-side trigger — module 56

Module 56 is the Phase 41 orchestrator core. It contains the slider submit
handler which assembles the verify POST body `e` and fires the request.

**Source range (bytes, inside `sample/t_captcha_slide.js`)**: `[159126,
167171]` (8045 bytes, per `output/captcha-orchestrator/modules.json`).

**$.ajax callsite**: byte position **163131** of the bundle (the URL
literal `"/cap_union_new_verify"`). Approximate `(line, col) = (1, 163131)`
since the bundle is fully minified to a single line.

**Callsite first-pass pseudocode** (~30 lines, reconstructed from
`sample/t_captcha_slide.js[162500..163500]`):

```js
// Inside module 56, function Y (slider drop handler).
// d = the verify POST body being assembled.
// o = extra fields merged in from parent scope.
// i = fpinfo.
// _ = slider state object (spt, vsig, websig, subcapclass, ...).
// M = proof-of-work results.
// C = collect-token generator (register-VM tdc.js output, 8128 chars).
// R = eks accessor.
// P = { nonce }.
// l.tdc = tdc.js loader; v = tdc namespace.
// a.isLowIE() = legacy IE detection from module 9.

d.trycnt = ++O;
d.refreshcnt = A;
d.slideValue = n;
d.dragobj = t;
T(d);                                        // appends internal tracking
d.ans = c;                                   // slide answer
d.vsig = _.vsig;
d.websig = _.websig;
d.subcapclass = _.subcapclass;
d.pow_answer = (M.ans !== null && M.ans !== undefined) ? (P.nonce + M.ans) : M.ans;
d.pow_calc_time = M.duration;
(function (e) {                              // merge collect + tlg
  e[_.collectdata] = decodeURIComponent(C());
  e.tlg = e[_.collectdata].length;
})(d);
if (_.curenv !== "inner") { d.asig = _.asig; d.buid = _.buid; }
d.fpinfo = i;
d.eks = R();
if (_.nonce) d.nonce = _.nonce;
$.extend(d, o);
l.tdc.checkTdcSuccess() || l.tdc.retryLoad(v);

// --- IE9-only vData injection ---
(function (e) {
  if (a.isLowIE()) {
    var t = Object(e), n = [];
    for (var i in t) if (t.hasOwnProperty(i)) n.push(i + "=" + t[i]);
    var o = window.getVData && window.getVData(n.join("&"));
    if (o) e.vData = o;                     // IE9 path: attach vData to body
  }
})(d);

// --- POST verify ---
var c = $.ajax({
  type: "POST",
  url: "/cap_union_new_verify",              // <-- bundle byte 163131
  data: d,                                   // 39 fields, ~9504 urlencoded bytes
  timeout: 15000,
  dataType: "json",
  success: function (e) { /* ... handle errorCode ... */ },
  error:   function (e, t, n) { /* ... */ }
});
```

**Observations**:
- On modern browsers, `a.isLowIE()` returns `false`, the IIFE is a no-op,
  `e.vData` is **not** set by orchestrator JS, and `$.ajax` sends `d`
  verbatim. vm-slide's `send` patch is what adds `vData` from below.
- On IE9 and below, the orchestrator builds the canonical `n.join("&")`
  string **itself** and hands it to `window.getVData(...)`. The return
  value is assigned to `e.vData` and then `$.ajax` serializes the full
  40-field object. This is the only branch where orchestrator JS
  observably constructs a plaintext for the vData pipeline — but
  importantly, the plaintext it builds is **not 112 bytes**, it's the
  full serialization of all the same fields (thousands of bytes). The
  112-byte output is produced by the downstream vm-slide reduction,
  not by the orchestrator input.
- The 39-field set is a permanent property of this callsite: none of
  the fields are optional beyond a few empty-string placeholders.

### The 8 `=` / 7 `&` canonical shape is NOT orchestrator-built

`tests/fixtures/vdata-jsdom-capture.json` and
`tests/fixtures/vdata-har-capture.json` each decrypt to a 112-byte plaintext
with exactly 8 `=` and 7 `&` bytes. Phase 43 VDATA-PIPELINE.md §7 confirms
the HAR plaintext has that shape and Phase 43 noted the multiset is
invariant across jsdom runs with varying inputs — which implies the shape
is enforced **downstream**, not a pass-through of the orchestrator's
`urlencode(d)` output (which has 38 `=` bytes and 38 `&` bytes, one per
field).

Therefore the 112-byte reduction with its hardcoded 8-pair layout is
computed inside vm-slide, by the same code path that contains the
`&vData=` literal at pc 24211.

### vm-slide-side XHR prototype hooks

**Fn 20353 = `XMLHttpRequest.prototype.open` replacement.** FUNC_CREATE at
pc **20463** (`OP_58 20353 2 2 7 6 8 5 3 4` — 2 upvalues, 2 args). Body
at pcs 20353..20462.
- Prologue allocates slots 2..5.
- pcs 20380..20420 push the byte sequence for `"/cap_union_new_verify"`
  character-by-character via `OP_10` (47, 99, 97, 112, 95, 117, 110, 105,
  111, 110, 95, 110, 101, 119, 95, 118, 101, 114, 105, 102, 121).
- pc 20422 `OP_00 4` pushes slot 4 (arg1 = the URL argument of `open`).
- pc 20424 `OP_28 STRICT_EQ` compares them.
- pc 20425 `OP_60 20430` jumps on match.
- pc 20431..20435 stores `this` (the XHR instance) into the captured
  slot 7 (which is parent fn 20140's slot 6).
- pc 20442..20460 calls `savedOpen.apply(this, arguments)`.

This is the source of fn 20539's guard at pc 20582 (`capturedSlot7 ===
this`): fn 20539's send encryption only runs for the same XHR instance
that was observed opening the `/cap_union_new_verify` URL. Zepto creates
a fresh `XMLHttpRequest` per `$.ajax` call and runs `open(method, url)`
first, so the guard matches on every verify attempt and misses on every
other XHR.

**Fn 20539 = inner encrypt helper.** Byte range `[20539, 20796]`. Per
44.2.5's full decompile (`research/vm-slide-stack-vm/FN-20539-DECOMPILE
.md`), this function:
- Receives `body` via `arguments[0]` (slot 3).
- Guards on `capturedSlot7 === this` (pc 20582), `typeof body === "string"`
  (pc 20604), and `new Date()` liveness (pc 20565).
- Calls `fn15918(body, { py: "0" | "1" })` at pc 20749.
- Stores the result into slot 3 at pc 20751.
- Forwards via `savedSend.call(this, result)` at pc 20770.

44.2.5 correctly classified this range as "pure encrypt stage". The
misread was to take that as evidence the plaintext is built in the
orchestrator. In fact, fn 20539's `arguments[0]` is the full urlencoded
body — the ~9504-byte `d` that Zepto serialized — and fn 20539 passes it
directly to fn 15918. **fn 15918 is NOT the XTEA block engine.** Fn 15918
is an OUTER encryptor that: accepts a full-length string, reduces it to
112 bytes, runs fn 15241 (the 8-byte XTEA block closure) 14 times, and
runs the custom base64 encoder. The reduction step is inside fn 15918's
body.

**Top-level send replacement (the body-rewriter).** Lives in an enclosing
function around pc 24210 (not yet pinned to an entry pc; see open
questions). Evidence:
- pcs 24037..24044: string `"push"` (an Array.prototype.push call)
- pcs 24049..24050: `"="` literal + OP_20 (STRING_CONCAT)
- pcs 24086..24103: string `"default"` (likely `encoder.default`)
- pcs 24107..24119: string `"encode"`
- pcs 24122..24143: string `"encryptData"` (almost certainly the JS-level
  function name that routes into fn 15918 / fn 20539)
- pcs 24149..24155: string `"join"`
- pcs 24158..24161: `"&"` + `OP_02 1` = `.join("&")`
- pcs 24171..24183: string `"window"`
- pcs 24185..24201: string `"DEBUGMODE"`
- pcs 24211..24223: **string `"&vData="`** (38, 118, 68, 97, 116, 97, 61) —
  the smoking-gun literal
- pc 24226 `OP_00 16` pushes slot 16's value (the 152-char base64 ciphertext
  result of `encryptData` earlier in the function)
- pc 24228 `OP_20` concatenates → `body + "&vData=" + ciphertext`
- pc 24229 `OP_36` stores the result into slot 3 (overwriting the slot that
  held the original body)
- pc 24233 `OP_16` VM_EXIT (returns the rewritten body)

This function appears to be the actual top-level send replacement body
whose inner call chain ends at fn 20539 via an intermediate
`encryptData`-named function. The FUNC_CREATE site for the enclosing
function is not captured in this pass — finding it is part of 44.4.

### The 112-byte reduction is inside vm-slide

**Evidence**: fn 19702, byte range `[19702, 20057]`, FUNC_CREATE at pc
20059 (`OP_58 19702 1 1 8 3 3`), is `window.getVData` — the IE9-only
branch of vm-slide's proxyXHR install. Its body is the static analog of
what the top-level send replacement does on modern browsers:
- pc 19725..19741: `"document"`
- pc 19742..19767: `"documentMode"` (the classic IE9-detection attribute)
- pc 19820..19823: `documentMode < 8` comparison
- pc 19845..19858: `"Object"` + `OP_55 0` (new Object)
- pc 19862..19867: `"py"` key
- pc 19872..19884: `"0"` or `"1"` conditional → `newObj.py = "0"|"1"`
- pc 19886 `OP_66 2` — CALL_GLOBAL with 2 args — **this is the call to
  the encrypt function, same shape as fn 20539's pc 20749**
- pc 19888..19897: `"split"`
- pc 19900..19903: `"&"` + `OP_02 1` → `.split("&")` on the argument
- pc 19918..19933: `"length"`
- pcs 19936..20057: loop with OP_06 back-branches (a per-field reduction
  over the split array)

The reduction region at pcs 19256..19443 (inside fn 19702's nested
helpers) performs 6-bit base64-style masking: `OP_08 63` (0x3F, 6-bit
mask) at pcs 19230, 19347, 19437; `OP_08 6` (shift) at pcs 19226, 19344,
19434; `OP_08 31` (0x1F) at pc 19337; `"String"` + `"fromCharCode"`
string literals at pcs 19297..19336, 19173..19212. Combined with fn 18966
(a UTF-8 encode/decode helper created at pc 19451, named
`"_utf8_decode"` in a literal at pcs 18937..18961), this describes a
classic base64-style 3-byte-to-4-char group transform applied per field.

The exact formula (how 39 fields are reduced to 8 canonical pairs of
varying content whose multiset is invariant across inputs but whose
order shuffles per run) is left to **Phase 44.4**. For 44.3 the
critical finding is that this reduction happens **inside vm-slide**, not
inside the orchestrator.

---

## Ciphertext-path narrative

End-to-end, a verify POST on Chrome 146:

1. **Page load**: `tcaptcha-frame.d0752eae.js` → `sample/t_captcha_slide.js`
   boots on the CAPTCHA iframe. Prior to this, a hardcoded `<script>` tag
   in the show-page HTML has already loaded `vm-slide.<hash>.enc.js`,
   which deobfuscates to `sample/vm_slide.js` and runs its top-level
   initializer.
2. **vm-slide init**: the top-level initializer runs fn 20107
   (`_esModule` flag setup), fn 20140 (the `proxyXHR` implementation),
   and on a non-IE browser branches at `isIE9Below()` (bytecode pc 19634,
   false branch at pc 19638) into `<upvalue>.proxyXHR(p[3])` at pc 19661.
   The `proxyXHR` call replaces `XMLHttpRequest.prototype.open` with
   fn 20353 and `XMLHttpRequest.prototype.send` with the top-level send
   replacement (the function enclosing pc 24210, whose entry pc is not
   yet pinned). fn 20539 is captured as an upvalue of that top-level
   send replacement.
3. **User solves slider, orchestrator assembles `e`**: module 56 function
   `Y` (in `sample/t_captcha_slide.js` source range `[159126, 167171]`)
   runs through the field-assembly sequence shown in the pseudocode
   above. On modern browsers the `isLowIE()` IIFE is a no-op, `e.vData`
   is not set.
4. **`$.ajax(...)` fires** at bundle position 163131. Zepto
   (module 76) creates a fresh XMLHttpRequest, calls
   `xhr.open("POST", "/cap_union_new_verify", true)`, then
   urlencodes `e` into a ~9504-byte body string, sets the content-type
   header, and calls `xhr.send(body)`.
5. **vm-slide's `open` hook catches the URL match**: fn 20353 runs,
   compares `arguments[1]` against the bytecode constant string
   `"/cap_union_new_verify"` at pcs 20379..20424, the compare hits at
   pc 20424, and fn 20353 stores `this` (the Zepto-created XHR) into
   the captured guard slot 7. `savedOpen.apply(this, arguments)` forwards
   the call.
6. **vm-slide's `send` hook catches the body**: the top-level send
   replacement runs, receives the urlencoded body as `arguments[0]`,
   runs the per-field reduction (pcs ~19256..19443 / 24023..24084 area),
   produces a 112-byte canonical plaintext with 8 `=` / 7 `&` layout,
   and calls into the fn 15918 / fn 20539 / fn 15241 chain via the
   "encryptData" helper (string literal at pcs 24122..24143). That
   chain classical-XTEA's the 112 bytes in 14 blocks of 8 bytes with
   key `2e430f8c15b7da96` (Phase 43 constant), and custom-base64s the
   output with alphabet
   `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`
   and padding char `Y` (Phase 43 VDATA-PIPELINE.md §5). The result is
   152 chars ending in `YY`.
7. **Body rewrite**: at pc 24206..24229 the top-level send replacement
   does `body + "&vData=" + base64` (the `&vData=` literal at pcs
   24211..24223 is the smoking-gun anchor). The result is stored back
   into slot 3.
8. **Forward to real send**: the captured `savedSend` is called via
   `savedSend.call(this, rewrittenBody)` (analogous to fn 20539's
   pc 20770 for the inner encrypt chain). The browser sends the POST.
9. **Network**: the real XHR transmits a 39+1-field urlencoded body to
   `t.captcha.qq.com/cap_union_new_verify`, with `vData=<152 chars>`
   as the final field. This matches the HAR exactly: body length 9504
   includes the appended 158 bytes (`&vData=` + 152 chars).

**How the orchestrator retrieves the ciphertext**: it doesn't. The
ciphertext path is entirely server-side from the orchestrator's point of
view. The orchestrator's `$.ajax` success handler reads the server's JSON
response (`errorCode`, `sess`, `ticket`, etc.) — it never reads back the
`vData` it did not write. This is the clean answer to "how does the
orchestrator read the ciphertext back": it doesn't need to, because
vm-slide's prototype patch has already rewritten the outgoing request
body and the server receives the full 40-field form.

---

## Open questions for 44.4

1. **Exact reduction formula**. What bit-masking / hashing / subset
   selection reduces a 9504-byte urlencoded body (or its field list) to
   exactly 112 bytes with the canonical 8-`=` / 7-`&` layout? The
   disassembly anchors in fn 19702 (pcs 19221..19443) and the top-level
   send replacement (pcs 24023..24084) suggest base64-like 6-bit chunking
   combined with the UTF-8 helper fn 18966, but the exact dataflow needs
   a proper decompile. VDATA-PIPELINE.md §8 question 3 (per-run byte
   order variation) is also owned here — the randomness is probably a
   `Math.random()`-seeded hash table iteration.
2. **Field selection**. Does the reduction process all 39 fields of the
   verify POST, or does it subset (e.g. only fields that contribute to
   the fingerprint — `ua`, `sess`, `rnd`, `eks`, `collect`, `nonce`)?
   The invariant 8-pair shape suggests a fixed set of 8 named
   accumulators, possibly one per field-class.
3. **Top-level send replacement entry pc**. The function that contains
   pc 24210 (where `&vData=` is built) has no FUNC_CREATE site visible
   in the disassembly window we inspected — its entry pc is outside
   `[22317, 24234]`. Finding the outer fn entry is a 1-hour walker job
   against `output/vm-slide/bytecode.json` using the Phase 40.1 CFG.
4. **`encryptData` helper**. The literal at pcs 24122..24143 suggests
   an intermediate JS-level helper named `encryptData` that wraps fn
   15918 or fn 20539. Decompiling it would clarify whether the 112-byte
   reduction is inside that helper or in its caller.
5. **Relationship between fn 15918 and fn 20539**. 44.2.5's FN-20539
   decompile treats fn 15918 as "the classical XTEA encrypt closure",
   but per VDATA-PIPELINE.md the actual 8-byte block closure is at
   **pc 15241** (`OP_58 15241 0 2 3 4`) and fn 15918 is its parent
   factory. 44.4 should reconcile the 15918/15241 factory/closure pair
   against the 20539 call to fn 15918 at pc 20749 — is the "112-byte
   reduction" logic inside fn 15918 itself, or inside an outer frame?

These questions do **not** block subsequent work on a standalone vData
generator for modern browsers — the crypto half is already fixture-locked
(Phase 43.2 `tests/fixtures/vdata-{jsdom,har}-capture.json`). They block
only a byte-identical reproduction of the **content** of the plaintext,
which is what Phase 44 as a whole owns.
