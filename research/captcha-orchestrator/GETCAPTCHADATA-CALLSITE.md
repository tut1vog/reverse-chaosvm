# GETCAPTCHADATA-CALLSITE — the orchestrator does not call `getCaptchaData`

**Task**: Phase 44 / 44.4.5 — find the orchestrator-side call site where
`t_captcha_slide.js` invokes vm-slide's `exports.getCaptchaData` (fn 22317)
with an 8-field `obj` argument, and pin each of the 8 fingerprint fields
`{tp, key, py, env, version, cLod, inf, ss}` to an orchestrator-side source
expression.

**Result**: **the premise is wrong**. The orchestrator bundle contains zero
references to `getCaptchaData`, does not import it, does not call it, and
does not construct an 8-field `obj`. fn 22317 is an internal vm-slide webpack
module export (`n[4].getCaptchaData`, where `n[4]` is a vm-slide-internal
module's exports) — it is not exposed across the orchestrator/vm-slide
boundary at all. This task is therefore reported as a **partial** with the
call-site search exhausted and the reversal flagged for Phase 44.7.

**Scope**: pure static analysis of `sample/t_captcha_slide.js` (213 162
bytes, one logical line, webpack 4 bundle with 110 module slots / 50 live
modules). Cross-checked against `output/captcha-orchestrator/modules.json`,
`research/vm-slide-stack-vm/FN-22317-DECOMPILE.md`, and
`research/vm-slide-stack-vm/plaintext-callgraph.md`.

---

## 1. Call-site search

Literal greps against `sample/t_captcha_slide.js` (byte-exact, not
minifier-mangled because exported names on `exports` survive minification):

| term | count |
|---|---|
| `getCaptchaData` | **0** |
| `CaptchaData` | 0 |
| `captchaData` | 0 |
| `getCaptcha` | 0 |
| `chaos` / `Chaos` | 0 |
| `TENCENT_CHAOS` | 0 |
| `getVData` | 2 |
| `vData` | 1 |

All three vData-related hits cluster in a single 64-byte span at bundle
offsets 163046..163091, inside module 56 (`sourceRange [159126, 167171]`
per `output/captcha-orchestrator/modules.json`) — the orchestrator core
identified by Phase 41 (`docs/CAPTCHA_ORCHESTRATOR.md`). There is no
call to `getCaptchaData` anywhere in the orchestrator bundle, under any
name. There is also no indirect property access of the form
`["getCaptchaData"]` or `["get" + "CaptchaData"]` — the string does not
appear as a substring in any form.

## 2. What's actually at byte 163046

The only vData-related code in the orchestrator is a single IIFE inside
module 56, placed between the verify-body assembly and the `$.ajax` call.
Verbatim from `sample/t_captcha_slide.js`, bytes 162929..163108:

```js
!function(e){
  if (a.isLowIE()) {
    var t = Object(e), n = [];
    for (var i in t)
      t.hasOwnProperty(i) && n.push(i + "=" + t[i]);
    var o = window.getVData && window.getVData(n.join("&"));
    o && (e.vData = o);
  }
  var c = $.ajax({
    type: "POST",
    url: "/cap_union_new_verify",
    data: e,
    timeout: 15e3,
    dataType: "json",
    success: /* ... */
  });
}(d);
```

Observations, each citing `sample/t_captcha_slide.js`:

- **The call is gated on `a.isLowIE()`** (byte 162949). `a` is module 9's
  utility exports (per `docs/CAPTCHA_ORCHESTRATOR.md` and
  `research/captcha-orchestrator/PLAINTEXT-BUILD-ORIGIN.md`). On Chrome,
  `isLowIE()` returns `false` and the entire block is a no-op.
- **The invoked name is `window.getVData`, not `getCaptchaData`** (byte
  163046, 163063). These are different functions. `window.getVData` is
  vm-slide's fn 19702, installed at pc 20066 only on the IE9 path (see
  `research/vm-slide-stack-vm/VDATA-RESOLUTION.md`).
- **The argument is a joined key=value string, not an 8-field object**
  (byte 163046, `n.join("&")`). `n` is built by iterating `d`'s own-keys
  and pushing `i + "=" + d[i]`. `d` is the in-progress verify POST body,
  not the 8-field fingerprint object.
- **On Chrome the orchestrator sets nothing on `e.vData`**. `$.ajax`
  serializes `d` verbatim and calls `xhr.send(body)`. The vData field is
  appended by vm-slide's XHR send patch (fn 20539 / fn 15918 chain — see
  §5).

## 3. What `d` actually contains (the verify POST body)

To rule out that the 8 fingerprint fields could live on `d` under different
names, I walked every assignment to `d` in the `u()` submit callback
(bytes ~161500..163108 of `sample/t_captcha_slide.js`). The complete
field set:

| field | assignment site (approx byte) | source |
|---|---|---|
| `d = a.queryMap()` | 161970 | URL query params (sid, subsid, ...) |
| `d.cdata` | 162040 | challenge nonce via `l.challenge()` |
| `d.trycnt` via `T(f)` | 162105 | retry counter |
| `d.refreshcnt` via `T(f)` | 162105 | refresh counter |
| `d.slideValue` via `T(f)` | 162105 | slide coordinate |
| `d.dragobj` via `T(f)` | 162105 | drag waypoint array |
| `d.ans` | 162137 | per-click-point string |
| `d.vsig` | 162147 | capture-side signature |
| `d.websig` | 162161 | web signature |
| `d.subcapclass` | 162175 | CAPTCHA subtype |
| `d.pow_answer` | 162192 | proof-of-work answer |
| `d.pow_calc_time` | 162236 | PoW duration |
| `d[_.collectdata]` | 162287 | the `collect` token (tdc.js output) |
| `d.tlg` | 162310 | length of collect token |
| `d.asig` / `d.buid` | 162338 | only if `_.curenv !== "inner"` |
| `d.fpinfo` | 162460 | coordinate array `i` from slide solver |
| `d.eks` | 162472 | server-baked eks token via `R()` |
| `d.nonce` | 162484 | session nonce |
| `$.extend(d, o)` | 162497 | merge extra fields from callback arg |

**None of these are `tp`, `key`, `py`, `env`, `version`, `cLod`, `inf`,
or `ss`.** The 8-field fingerprint schema is not visible anywhere in
module 56. The orchestrator doesn't know those names exist.

## 4. Where the 8 fields actually come from (fn 22317 re-read)

Per `research/vm-slide-stack-vm/FN-22317-DECOMPILE.md` lines 382..408,
fn 22317's JavaScript-equivalent signature is:

```js
// fn 22317 — exports.getCaptchaData
// Parent: fn 20970 (vm-slide webpack/TS module factory)
// Captures: slot17..slot22 (imports from vm-slide-internal modules)
function getCaptchaData(body, options) {  // slot3 = body, slot4 = options
  var obj = new Object();
  obj.version = "2";
  obj.tp      = fn22400(...);            // computed from captures
  obj.key     = /* ... */;
  obj.py      = (capturedImport17() ? "0" : "1");
  obj.env     = /* ... */;
  obj.cLod    = /* ... */;
  obj.inf     = /* ... */;
  obj.ss      = /* ... */;
  // sort + join + XTEA + base64
  return body + "&vData=" + b64;
}
```

Two points that break the 44.4.5 premise:

1. **fn 22317 takes `(body, options)`, not `(obj)`.** The 8 fields are
   built *inside* fn 22317 from its closure captures (slots 17..22, which
   come from vm-slide-internal webpack imports resolved by fn 20970's
   prologue via `__importDefault(require(N))`) and — only *possibly* —
   from fields on `options`. The 8-field object is never passed in.
2. **fn 22317 is stored into `n[4].getCaptchaData`** (fn 20970 @ pc
   24252, per FN-22317-DECOMPILE.md line 47), where `n[4]` is the slot-4
   entry of fn 20970's *own* webpack `require`-arg map — a vm-slide
   module's exports object. There is no `window.*` write, no XHR-patch
   install, no cross-bundle leak. The name `getCaptchaData` never crosses
   the vm-slide / orchestrator boundary.

The only runtime `window.*` property that vm-slide installs is
`window.getVData`, and only on the IE9 path (fn 19702 @ pc 20066). That
is the entire surface area by which the orchestrator can reach anything
inside vm-slide by name.

## 5. But who DOES call fn 22317 then? — runtime callgraph disagrees with 44.2.6

`research/vm-slide-stack-vm/plaintext-callgraph.md` captures 14 runtime
caller pcs for the encrypt closure (`ENC_ENTRY = 15241`). All 14 fall
inside fn 15918 (body `[15918, 16230]`). The containing function one
frame up — the function that *calls* fn 15918 and supplies the plaintext —
is fn **20539**, not fn 22317. Line 111 of plaintext-callgraph.md:

> `20539 | 20797 | fn 20140 | proxyXHR send-handler (direct caller of 15918)`

fn 20539 is also the function that fn 20140 installs onto
`XMLHttpRequest.prototype.send` at pc 20808 (FN-22317-DECOMPILE.md
lines 18..20). On the observed Chrome HAR and jsdom traces, fn 20539 is
the live vData producer. fn 22317 was **not observed** in the runtime
callgraph at all.

This means Phase 44.2.6's classification — "fn 22317 is the live
producer, fn 20539 is dead code on the observed Chrome code path" — is
**the opposite of what the runtime trace shows**. The runtime evidence
says fn 20539 is live and fn 22317 is (or may be) the dead/alternate
path. I'm not claiming 44.2.6 is wrong outright — 44.2.6's static
argument that fn 20539's py-flag branch produces the wrong plaintext is
still on the table — but the two analyses contradict each other and the
contradiction is not resolved. 44.4.5's instructions inherited the
44.2.6 classification uncritically; this note flags that 44.4.5's search
for an "orchestrator caller of fn 22317" is chasing a non-existent
call site under a contested classification.

## 6. 8-field source map

Because there is no orchestrator call site, there is no orchestrator-side
source expression to pin for any of the 8 fields. The fields are all
built inside vm-slide bytecode (fn 22317 body `[22317, 24233]`) from
closure captures resolved by fn 20970's `__importDefault(require(N))`
prologue. For completeness, the map below records what
FN-22317-DECOMPILE.md pinned statically:

| field | source inside fn 22317 | orchestrator expression? |
|---|---|---|
| `version` | literal `"2"` at pc ~22382 | none — hardcoded |
| `tp` | helper closure fn 22400 result (pc 22663) | none — vm-slide-internal |
| `key` | computation inside fn 22317 body (unresolved in 44.2.6) | none |
| `py` | `capturedImport17() ? "0" : "1"` at pc 22706 | none — capture 17 |
| `env` | computation inside fn 22317 body (unresolved) | none |
| `cLod` | computation inside fn 22317 body (unresolved) | none |
| `inf` | computation inside fn 22317 body (unresolved) | none |
| `ss` | computation inside fn 22317 body (unresolved) | none |

The task's verification checkbox "Each of the 8 fingerprint fields has a
documented orchestrator-side source expression" **cannot be satisfied**:
there is no orchestrator-side source for any of them.

## 7. Oracle cross-check

The 44.4.5 task asks for a cross-check of at least one field against
`tests/fixtures/vdata-{jsdom,har}-capture.json`. Because there is no
orchestrator expression to test, the check that is actually meaningful
is the reverse one: given the fixture's observed vData string, does the
runtime callgraph say fn 20539 or fn 22317 produced it?
`plaintext-callgraph.md` pins this unambiguously to fn 20539 via the
14 runtime caller pcs in `output/vm-slide/vdata-callgraph.json`
`runtime_caller_pcs_raw`. No fn 22317 frame ever appears in the capture.
On the HAR fixture specifically, the producer is fn 20539, not fn 22317.

## 8. Contradictions with `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 / §517

Flagged for Phase 44.7 (which owns the doc rewrite):

- **§6.2 / §517 (Phase 42 narrative): XHR monkey-patch / IE9 `getVData`
  mechanism is the live vData injection path.** This note's §2 and §5
  *support* the XHR-monkey-patch half of that narrative against the
  Phase 44.2.6 reversal. The observed orchestrator source (§2, bytes
  162929..163108 of `sample/t_captcha_slide.js`) has no Chrome-path
  vData injection at all, and the runtime callgraph (§5) pins the live
  producer to fn 20539 — the function installed as
  `XMLHttpRequest.prototype.send` by fn 20140 at pc 20808. Phase 42's
  original mechanism is consistent with the orchestrator source and
  with the runtime trace. The 44.2.6 reclassification ("XHR monkey-patch
  is obsolete on Chrome; orchestrator calls getCaptchaData directly")
  is **not consistent** with the orchestrator source as read in §2: the
  orchestrator contains no call to `getCaptchaData` under any name.
- **44.2.6's "fn 22317 is the live HAR producer" claim.** This note
  does not refute it on its static merits (fn 22317's static structure
  does build an 8-field plaintext), but it flags that the runtime
  callgraph evidence points to fn 20539 and that 44.2.6's call-site
  premise (an orchestrator-side caller) does not exist in source.
  Phase 44.7 should reconcile the two analyses before rewriting §6.2.
- **Caller of fn 22317 (if any) is still unknown.** Neither §2
  (orchestrator bundle) nor `plaintext-callgraph.md` (runtime trace)
  finds one. Candidates a future task should explore: (a) fn 22317 is
  dead in the current build — an alternate build-flag/feature-gate
  path; (b) fn 22317 is called from a vm-slide-internal site that
  only fires under conditions not present in the HAR/jsdom fixtures
  (e.g. certain `subcapclass` values); (c) fn 20539 and fn 22317 share
  a caller by another indirection not yet walked. None of these are
  decidable from 44.4.5's static scope.

## 9. Recommendation

44.4.5 is **partial — call site does not exist**. Recommend:

1. Phase 44.7 rewrites `docs/CAPTCHA_ORCHESTRATOR.md` §6.2 / §517 to
   *restore* the Phase 42 XHR-monkey-patch / IE9 `getVData` mechanism
   as the canonical narrative, citing §2 + §5 of this note.
2. A new Phase 44.4.x task owns reconciling the runtime-callgraph
   evidence (plaintext-callgraph.md: fn 20539 is live) with the
   44.2.6 static argument (fn 22317 has the cleaner 8-field schema).
   This is a dynamic-trace follow-up: rerun `vdata-dynamic-trace.js`
   with an fn-22317-entry instrumentation point and confirm whether
   fn 22317 fires on any observed browser path.
3. Drop 44.4.5's "orchestrator-side source expression for each of
   the 8 fields" deliverable. There is no such expression.
