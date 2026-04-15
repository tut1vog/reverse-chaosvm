# Phase 45.1 — Per-field source decisions for live scraper vData use

Phase 45 swaps the scraper's vData generator from "run vm-slide live in jsdom"
(`tools/scraper/vdata-harness.js`) to the standalone byte-identical pipeline in
`tools/vdata-generator/`. That pipeline consumes an 8-field plaintext object
`{tp, key, py, env, version, cLod, inf, ss}`, but the scraper no longer has the
live vm-slide runtime around to compute those fields. 45.1 is the decision gate:
for each field, classify the source as **port-as-code** (the scraper computes
it per-request), **profile-supplied** (the caller hands in a browser-like
default), or **inline default** (a single hardcoded value).

The two committed fixtures `tests/fixtures/vdata-{jsdom,har}-capture.json` give
us ground truth for both the jsdom-leaky values (which we must NOT reproduce in
the scraper) and the real Chrome 146 values (which we want to imitate). HAR is
the browser-like target; jsdom is the anti-target.

Evidence base: `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` (per-field
decompile of fn 22317 and helpers fn 22400 / fn 22730 / fn 23399) and
`docs/VDATA_FORMAT.md` §7 (the authoritative public field table).

## 1. Decision Table

| Field | Classification | Browser-like default (HAR) | Justification (variability / source / port cost / static-tell risk) | Port scope (if port-as-code) |
|---|---|---|---|---|
| `key` | **port-as-code** | n/a (computed per-request) | (a) Varies every call — depends on the verify POST body, which differs across sessions. (b) Runtime source in the scraper IS available: it is the POST body the scraper already builds before calling the vData generator. (c) Port cost: moderate; fn 22730 + caller loop at pcs 23240..23328 are fully decompiled in `FINGERPRINT-SCHEMA.md`, BUT the digest bottoms out in `require(18)(body, "tlg")` and `require(18)(body, "sess")` — module 18 is not yet decompiled (see §4). (d) Static-tell risk if we hardcoded it: **severe**. A verify body that hashes to the same `key` regardless of body content is a one-line server-side detector (`key == f(body)` check). This is the load-bearing field of vData as a behavioral signal. | Port fn 22730 + the pc 23240..23328 caller loop + module 18's `(body, tag)` two-argument API (tags `"tlg"` and `"sess"` at minimum). Input: POST body string. Output: 4-character alphanumeric string. See §2 for the spec. |
| `tp` | **profile-supplied** | `'7446039806946242560'` | (a) Varies between sessions but observed values are stable within a session. HAR's value is a 19-digit numeric ID (likely a captured captcha session snowflake); jsdom's value is `"Cannot read properties of null (reading 'src')"` — a runtime-error `.message` from the `slideBg` image lookup failing under jsdom. (b) Runtime source in the scraper: **unavailable** without running vm-slide live. fn 22400's happy path reads `document.getElementById("slideBg").src.match(/&sid=(.*?)&/)[1]` — that DOM element only exists inside the captcha iframe, which the scraper doesn't have. The catch-path produces jsdom-flavored error strings. (c) Port cost of the happy path: low mechanically but would require the scraper to fabricate a plausible `slideBg` `src` URL, which is tantamount to supplying the value directly. (d) Static-tell risk: low — a stable numeric ID in `tp` blends in with the real Chrome population, and any JS runtime error string (the jsdom category) is an immediate tell. Profile-supplying it with the HAR value is strictly better than any code we'd write. | — |
| `ss` | **profile-supplied** | `'11%2Ctdc%2Cslide%2Cvm'` | (a) Varies with the script-tag inventory of the hosting page. HAR's value says "11 script tags, 3 of which have sources whose `require(32)(...)` keys match tdc/slide/vm"; jsdom's `"0%2C"` means "0 script tags, no matches". (b) Runtime source in the scraper: **unavailable** — fn 23399 iterates `document.getElementsByTagName("script")` and pipes each `src` through `require(32)`. The scraper has no DOM at all, let alone one that mirrors the show-page's script inventory. (c) Port cost: moderate-to-high — would require decompiling module 32 AND statically modelling the show-page's script inventory, and the result would still be brittle against Tencent rotating the inventory. (d) Static-tell risk: low — `"11%2Ctdc%2Cslide%2Cvm"` was captured from a real Chrome session so it matches whatever classifier Tencent applies. If Tencent rotates the inventory meaningfully, 45.x can refresh the profile default. | — |
| `py` | **profile-supplied** | `'0'` | (a) In both fixtures the observed value is `'0'`, but fn 22317 reads it via `arguments[1].py` — the second argument the orchestrator passes in. In principle any stringable value. (b) Runtime source in the scraper: the scraper is the caller, so it _could_ supply any value, but it has no "correct" one to compute — `py` is semantically orchestrator options, not runtime state. (c) Port cost: n/a — there is nothing to port. (d) Static-tell risk: low if defaulted to the one observed value `'0'`. Exposing it through the profile (rather than inlining) leaves room for 45.x to sweep if errorCode 12 correlates with it. | — |
| `env` | **inline default** | `'0'` | (a) Binary `'0'` | `'1'`. HAR = `'0'`, jsdom = `'1'`. The rule is `require(0)() ? '0' : '1'` — a single runtime probe (likely "is this the top frame / expected host?"). (b) Runtime source in the scraper: absent — we don't run module 0. (c) Port cost: nontrivial (module 0 not decompiled) and low-value because it's a 1-bit field. (d) Static-tell risk: low — HAR's `'0'` is the browser-like branch. Tying it to the profile layer adds ceremony for no gain; if it later turns out to matter we upgrade it to profile-supplied in 45.x. | — |
| `version` | **inline default** | `'2'` | (a) Constant in the bytecode — `OP_10 50` at pc 22385 loads the literal `"2"`. No variability at all. (b) n/a. (c) Zero. (d) Zero. Safe to inline. | — |
| `cLod` | **inline default** | `'loadTDC'` | (a) Three observed values (`"loadTDC"`, `"unloadTDC"`, plus a `window.TDC.getData(...)` fallback that neither fixture hit). HAR = `"loadTDC"`, jsdom = `"unloadTDC"` — so `"unloadTDC"` is a direct jsdom tell. (b) Runtime source: absent — the branch reads tdc.js lifecycle flags the scraper isn't carrying. (c) Port cost: nontrivial (not fully decompiled; see FINGERPRINT-SCHEMA.md §"cLod"). (d) Static-tell risk: `"loadTDC"` is the HAR value so it matches real traffic. If Tencent ever starts verifying the `window.TDC.getData(...)` branch existed we'd need to upgrade. | — |
| `inf` | **inline default** | `'iframe'` | (a) Two values: `'top'` | `'iframe'`. HAR = `'iframe'` (real show-page loads vm-slide inside the captcha iframe); jsdom = `'top'` (jsdom window === jsdom.top) — so `'top'` is a direct jsdom tell. Rule: `window === window.top ? 'top' : 'iframe'`. (b) Runtime source: absent — the scraper has no window. (c) Zero (constant-fold). (d) Low — `'iframe'` matches the production embedding. | — |

Summary:
- 1 port-as-code: `key`.
- 3 profile-supplied: `tp`, `ss`, `py`.
- 4 inline defaults: `env`, `version`, `cLod`, `inf`.

## 2. `key` Digest Porting Spec

**Note on the task prompt.** The 45.1 brief says the `key` digest "is already
implemented in `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` —
find it and name the function". That is not the case as of this task. The file
implements the pad + permute chain (fn 13989 + fn 14153) and wires it through
to the pre-cipher plaintext, but it takes `obj.key` as a caller-supplied string.
The only functions it exports are `padToBlock`, `permuteBlocks`, `buildJoined`,
and `buildFingerprintPlaintext`. A grep for `tlg`, `22730`, `parseInt`, and
`digest` across the file confirms there is no digest implementation present.
The committed fixtures supply the `key` value as a captured string
(`"qLCZ"` for jsdom, `"21L2"` for HAR) and the reference impl round-trips
byte-identically because it never recomputes it.

**Therefore 45.2 is the first task that actually ports fn 22730.** This
section is a porting spec written for 45.2, not a review of existing code.

### 2.1 Bytecode evidence

From `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` (per-field table row
for `key`, and the pseudocode directly quoted from the fn 22317 decompile):

- **Caller-side accumulator loop** (pcs 23240..23328) — runs inside fn 22317:
  ```js
  // pcs 23007..23056
  slot8 = require(18)(body, "sess") || "abcdefghijklmn";
  // pcs 22972..23004
  digitArray = fn22730(body) || new Array();
  // pcs 23240..23328
  slot9 = "";
  for (var i = 0; i < digitArray.length; i++) {
    slot9 += slot8.charAt(digitArray[i]);
  }
  obj.key = slot9;
  ```
- **fn 22730 body** (entry pc 22972, 1-arg closure, captures `[parent17→slot8,
  parent18→slot9]`):
  ```js
  function fn22730(body) {
    return require(0)()
      ? require(18)(body, "tlg").split("").map(function (c) { return parseInt(c, 10); })
      : [4, 2, 3, 10];
  }
  ```

So the observed output (`"qLCZ"` / `"21L2"`) is a **4-character indexed pick**
from the 14-char default charset `"abcdefghijklmn"` (or from whatever
`require(18)(body, "sess")` returns if that is non-empty), using the digits
that `require(18)(body, "tlg")` produces as character indices into the charset.

### 2.2 Function to port

**Port target name (proposed)**: `computeKeyField(body)`.
- **Input**: `body` — the verify-POST body string the scraper is about to send.
- **Output**: the 4-character string to write to `obj.key`.
- **Length is NOT fixed**. Both fixtures happen to ship a 4-char key, and the
  bytecode's "fallback digit array" is `[4, 2, 3, 10]` (4 entries), but the
  happy-path length is whatever `require(18)(body, "tlg").length` is. 45.2
  must verify whether the digit array is always 4 long against a recaptured
  fixture, or whether the length varies per body.

### 2.3 Dependencies / constants

- **Module 18** (`require(18)`): NOT yet decompiled. It is called with two
  arguments, `(body, tag)`, and used with two tags:
  - `"tlg"` → returns a digit string (each character is a 0..9 numeric that
    gets `parseInt`'d into an index).
  - `"sess"` → returns a charset string whose length is at least 14 (indices
    up to 13 appear in the fallback array `[4, 2, 3, 10]` — max 10 — but
    could exceed 14 in the happy path). Falls back to the literal
    `"abcdefghijklmn"` if module-18 returns falsy.
- **Module 0** (`require(0)()` — called with no args): predicate. Same
  predicate as the `env` field (`env = require(0)() ? '0' : '1'`). In the HAR
  fixture it returned truthy (env = `'0'`). When false, fn 22730 returns the
  hardcoded array `[4, 2, 3, 10]`.

The `require(18)` spec must be pinned before 45.2 can ship a port. Until
it is, the port reduces to "call out to module 18" — i.e. it is blocked on
a decompile task.

### 2.4 Edge cases the scraper's POST body might hit

These are bodies that real browsers rarely produce but the scraper might,
and 45.2's test fixture set should cover them before declaring `computeKeyField`
live-ready:

1. **Empty body.** Does `require(18)("", "tlg")` throw, return empty, or return
   a default? The `|| new Array()` fallback at pc 22972..23004 suggests the
   caller tolerates falsy, so `slot9 = ""` and `obj.key = ""` — but a 0-length
   key is itself a tell.
2. **Body with no `tlg` field.** `"tlg"` looks like a sub-key the module-18
   parser looks up inside the body. If the body is query-string-encoded and
   has no `tlg=…` segment, we need to know whether the result is empty,
   `undefined`, or a fixed default. The fallback branch `[4, 2, 3, 10]` is
   gated on `require(0)()`, NOT on whether `"tlg"` is present.
3. **Non-ASCII bytes in the body.** `parseInt(c, 10)` of a non-digit character
   returns `NaN`, and `charset.charAt(NaN)` returns `""`. The accumulated
   `slot9` would then be short / empty. The scraper's bodies should be
   ASCII-safe already, but 45.2's harness must assert this.
4. **Body whose `"sess"` lookup yields a string shorter than `max(digitArray)`.**
   `charAt(OOB) === ""`. The key string would then have gaps. The
   `|| "abcdefghijklmn"` fallback at pcs 23007..23056 exists exactly to avoid
   this for empty bodies, but it only triggers on falsy — a 3-char `"sess"`
   return would survive and still produce out-of-range lookups.
5. **Key length ≠ 4.** Both committed fixtures ship 4-char keys, but the
   happy path has no length constraint. 45.2 must confirm empirically (by
   replaying real traffic) that Tencent's verifier accepts any length or
   requires exactly 4.

None of these edge cases are exercised by the existing reference impl — it
takes `obj.key` as a fixed string — so 45.2 will need a fresh test harness.

## 3. Browser Profile Template

The file 45.4 creates will be `profiles/vdata-browser-default.json`. Its
target shape is a single object that `buildVDataFromObj({ obj })` accepts
verbatim (with the `key` slot populated by `computeKeyField(body)` at
request time — `"__COMPUTED__"` here is the placeholder the loader will
detect and substitute).

```json
{
  "tp": "7446039806946242560",
  "key": "__COMPUTED__",
  "py": "0",
  "env": "0",
  "version": "2",
  "cLod": "loadTDC",
  "inf": "iframe",
  "ss": "11%2Ctdc%2Cslide%2Cvm"
}
```

**Field provenance**: every non-`key` value is copied verbatim from
`tests/fixtures/vdata-har-capture.json`'s recovered plaintext (see
`research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` §"HAR fixture"). The
`key` slot is explicitly a placeholder sentinel — it is NOT a valid key
because Tencent's verifier would (almost certainly) check `key` against
its own char-lookup digest of the body. The scraper loader for this profile
in 45.3/45.4 must replace `__COMPUTED__` with the output of the ported
`computeKeyField(body)` before handing the obj to `buildVDataFromObj`.

### 3.1 Sanity check against `buildVDataFromObj` — ran 2026-04-15

Ran at the CLI from the repo root:

```bash
node -e "const {buildVDataFromObj}=require('./tools/vdata-generator/build-from-obj.js'); \
  const obj={tp:'7446039806946242560',key:'AAAA',py:'0',env:'0',version:'2',\
  cLod:'loadTDC',inf:'iframe',ss:'11%2Ctdc%2Cslide%2Cvm'}; \
  console.log(buildVDataFromObj({obj, order:['inf','env','tp','cLod','version','key','ss','py']}).length);"
```

Output: `152`. Exit code: `0`. Re-ran a second time without `order` (to
exercise the nondeterministic happy path): also `152`. Both confirm that
the profile shape above is consumable by `buildVDataFromObj` with the
placeholder substituted to a plausible 4-char string.

Note on the entry point: the task brief's example uses
`require('./tools/vdata-generator')`, but `tools/vdata-generator/` has no
`index.js`. The three public entry points live in their own files:
`encode.js`, `replay.js`, and `build-from-obj.js`. The direct require of
`./tools/vdata-generator/build-from-obj.js` (used above) is the shape
already documented in `tools/vdata-generator/README.md` §"Programmatic API".

## 4. Open Questions / Rejected Alternatives

### 4.1 Rejected alternatives

- **Port fn 22400 (the `tp` helper) end-to-end.** Rejected. The happy path
  reads a DOM element (`#slideBg`) that lives inside the captcha iframe, and
  the fallback path produces JS runtime error strings that are themselves
  jsdom/Node tells (`"Cannot read properties of null (reading 'src')"`).
  There is no "neutral" runtime output of fn 22400 that the scraper can
  produce — either we need a fake DOM with a fake `slideBg` whose `src`
  contains `&sid=…`, which is strictly worse than supplying the captured
  string directly, or we emit an error-message branch and leak the runtime.
- **Port fn 23399 (the `ss` helper) end-to-end.** Rejected for the same
  reason. Its input is the live show-page's script inventory, which the
  scraper doesn't have. Any synthetic inventory we build is a static tell
  against Tencent's view of what the show-page actually ships. Cheaper to
  profile-supply the captured HAR value and refresh it from live HAR data
  when Tencent rotates.
- **Inline `tp` to a single static string.** Rejected. `tp` is the most
  session-shaped of the eight fields; inlining it to one constant maximises
  the detector surface (every scraper-generated vData carries the exact
  same `tp`). Profile-supplying leaves room for 45.x to rotate it per-profile
  or per-session without a code change.
- **Profile-supply `key`.** Rejected, detector-obvious: `key` is a digest
  over the verify POST body, so a fixed `key` paired with a varying body is
  trivially detectable (`key == f(body)` server-side). This is the one
  field where port-as-code is mandatory.
- **Inline `py` to `'0'`.** Ambiguous. Current pick is profile-supplied
  because `py` is routed through `arguments[1]` and the orchestrator could
  supply any stringable value in the future. Keeping it in the profile lets
  us sweep it if errorCode 12 correlates with `py`. If 45.2 finds no
  variability, 45.x can demote it to inline.

### 4.2 Open questions

1. **Module 18 decompile.** Blocks the `key` port. 45.2 must decompile
   module 18's `(body, tag)` API, at minimum for the tags `"tlg"` and
   `"sess"`. Factory entry PC is not yet known — locate via the
   `OP_04 OP_10 "1" OP_10 "8"` literal scan in the root-scope webpack
   module-registration loop (same technique as module 40 / module 41
   were found in Phase 44.4).
2. **Module 0 predicate semantics.** `require(0)()` gates both `env` and
   fn 22730's digit-array fallback. We treat the HAR branch (truthy) as the
   target, but we have not actually decompiled module 0's body. If it probes
   something the scraper fails — e.g. "is there a real navigator.sendBeacon?" —
   the env=`'0'` inline default breaks silently and we need to profile-supply
   it instead. Low priority because env is binary, but a 45.x follow-up.
3. **`cLod` third branch.** The pcs 23059..23224 region has a `window.TDC.getData(...)`
   call that neither committed fixture exercised. If Tencent's verifier
   inspects `cLod` shape-beyond-the-two-literals, the inline default fails.
   Track for 45.x.
4. **Key length ≠ 4 case.** Both fixtures ship 4-char `key` values but the
   happy-path digest has no length constraint. Before committing the
   `computeKeyField` port, 45.2 should replay against a body that causes
   the digit array to be shorter or longer and confirm Tencent's verifier
   accepts both.
5. **Node 20 vs Node 22+ sort order.** `buildVDataFromObj` inherits the
   Phase 44.5b reproducibility caveat — the seeded-PRNG path is locked to
   Node 20's TimSort. The scraper is nondeterministic in production (no
   seed, no explicit `order`), so this does not block 45.x shipping, but
   the test harness that proves the profile integration works must pick
   one of: `--order` explicit, `--seed` + Node 20 pin, or accept any
   152-char output without asserting the exact string.
6. **Fixture build drift.** See `BUILD-RECONCILE.md` — the committed HAR
   fixture was captured against a vm-slide build with XTEA key
   `2e430f8c15b7da96`, whereas `sample/vm_slide.js` bakes in
   `34e2c8f07b5169ad`. Encoder round-trips work (Phase 43's encoder pins
   the fixture key), but if 45.x ever recaptures HAR the `ss`/`tp`/`cLod`
   defaults in §3 may need a refresh from the new capture.
