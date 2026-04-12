# captcha-orchestrator — end-to-end flow analysis (task 41.5)

Source-level trace of the CAPTCHA flow implemented in
`sample/t_captcha_slide.js`, the webpack 4 bundle served as
`/1/tcaptcha-slide.29a33140.js`. Builds on the structural survey in
`SURVEY.md` (task 41.4). Every claim below cites a module id from
`output/captcha-orchestrator/modules.json` plus a short verbatim
excerpt; the HAR evidence comes from `sample/captcha-har.har`
(one full successful verification: show, prehandle, tdc.js, bundle,
vm-slide.enc.js, verify).

This file is the research-side input for task 41.6. 41.6 owns
`docs/CAPTCHA_ORCHESTRATOR.md`; do NOT treat FLOW.md as a public doc.

## 1. Scope and method

Static-only analysis of four subgraphs in `sample/t_captcha_slide.js`:
the webpack entry (module 64), the script loader (module 8 and its
subgraph), the orchestrator core (module 56 and its 21-edge subgraph
including the `tdc`/`vm`/`challenge` barrel module 70, the tdc adapter
module 38, the vm-slide adapter module 71, the PoW challenge module
72, the DOM refs module 47, the ajax/verify loop, the getsig loop,
and the caplog module 58), and the ajax layer (module 76). Everything
was read from the byte ranges recorded in `modules.json`, with the AST
shape confirmed by `parse-bundle.js`.

Field origination was cross-checked against `sample/captcha-har.har`:
all 39 `cap_union_new_verify` POST body fields were enumerated, each
one was matched to a writer in the bundle (or marked "upstream" when
it came through unchanged from the iframe URL query), and the per-field
narrative was dumped to
`output/captcha-orchestrator/verify-body-origination.json` by
`research/captcha-orchestrator/trace-flow.js`. Module 76 was classified
against `sample/slide-jy.js` by `research/captcha-orchestrator/slide-jy-diff.js`
(probes: distinctive jQuery / Zepto markers + version literals). The
static-only approach held for 38 of 39 verify fields; the exception
(`vData` on modern browsers) is reported in section 9.

## 2. Early-gate results

### Gate 1 — dynamic requires

`parse-bundle.js` now emits
`output/captcha-orchestrator/dynamic-requires.json` alongside
`modules.json` and `module-graph.json`. The audit walks every webpack
wrapper, pre-collects the hoisted `var` / function / param bindings of
each enclosing scope, and reports any `<requireParam>(<non-numeric>)`
call site with a `shadowed` flag indicating whether the callee identifier
was rebound inside the current scope chain.

Result: **4 suspect call sites, 0 real dynamic requires**. The four
suspects are:

| module | site                                                  | shadowed by |
|-------:|-------------------------------------------------------|-------------|
| 39     | `return n(e,t)` inside the subsid helper              | `var r = function(){ ... var n = function(t,n){ ... } ... }()` |
| 59     | `n()` — 3rd wrapper param reused as callback alias    | local `var n` in an animationEnd handler |
| 67     | `n && n()` — drag-handler user callback               | `M(e){ var t, n; }` — local `var n` |
| 76     | `n()` inside Zepto IIFE                               | Zepto redefines `n` as an internal function |

All four are safely false positives, which means the static require-edge
graph built in 41.4 (91 edges, 24 leaves, entry 64) is **complete** —
nothing is hidden behind a dynamic lookup. The pure-static flow trace
below is therefore exhaustive at the inter-module edge level.

### Gate 2 — module 41 tractability

See `MODULE-41-NOTES.md` for the full spike notes. Bottom line: module
41 is the i18n caption table (`c1..c23`, `puzzle1..puzzle10`, `aged`,
plus `a = { "zh-cn": [...], "en": [...], ... }`), exporting `u` which
module 56 reads for UI captions via `var i = n(41); i.c11, i.puzzle6,
...`. **Not** obfuscated opcodes, **not** an encoded payload, **not**
on the critical path for the verify flow. Parked with a one-line
follow-up (grow `parse-bundle.js` export extractor to recognize
`module.exports = <Identifier>`).

### Gate 3 — flow-trace feasibility

Held for 38 of 39 verify body fields (see section 7). The single
exception is `vData`: the only lexical write to `vData` in the
orchestrator bundle is inside `if (a.isLowIE()) { ... }` using
`window.getVData`, and `getVData` is not defined anywhere in
`sample/t_captcha_slide.js`, `sample/tdc.js` (the HAR-served build),
or `sample/vm_slide.js` (which is the encoded `__TENCENT_CHAOS_STACK`
stack-VM blob and opaque to grep). The HAR was captured on Chrome 146
where `isLowIE()` is false and yet `vData` is present in the verify
POST body, which means the live binding is installed at runtime by a
script whose content we cannot read statically. The rest of the flow
remains cleanly traceable; this is a scoped, well-defined open question
for a dedicated follow-up, not a reason to abandon the static pass.

## 3. Module 8 — script loader (NOT the vm-slide loader)

Module 8 (1,441 bytes) is a generic script-tag injector exporting
`getScript`, `getScriptUrl`, `isIframeSupportCdnDomain`.

`getScript({src, successCheck, success, error, crossOrigin, timeout,
inHead})` appends a `<script>` tag to head or body, attaches
`onload`/`onreadystatechange` handlers, polls `successCheck()` on
load, and retries up to 3 times with a 15-second watchdog.
`getScriptUrl()` throws a synthetic `Error` and regexes the stack for
the first `https?://...js` URL (own-CDN detection).
`isIframeSupportCdnDomain()` combines IE ≤ 9, wechat miniprogram,
CSP-source, and low-Android-QQ checks.

**Who calls it.** Module 64 binds `var a = n(8).getScript` and the
ONLY call site in the bundle is
`a({src: htdocsPath + "/slide-jy.js", successCheck: () => !!window.$,
success: f, error: retry-from-root})`. In other words, **module 8's
sole job inside the bundle is to fetch `/slide-jy.js` (jQuery)** —
it is **not** used to fetch `vm-slide.enc.js`. See §6 for how vm-slide
is actually loaded, and §8 for the reconciliation with the 41.4
survey language that called module 8 "the vm-slide script loader
candidate" (the survey was guessing from signals, not tracing the
call graph).

Module 66 (776 bytes, also `sawScriptTagCreate=true`) is a second
internal script loader used exclusively by module 38's `retryLoad`
to re-fetch `tdc.js` when `window.TDC` failed to materialize. It
is not used for vm-slide either.

## 4. Module 56 — orchestrator core

8,045 bytes, 21 outgoing edges:
`[0, 1, 3, 10, 30, 37, 39, 40, 41, 45, 46, 47, 48, 58, 59, 67, 68, 70, 74, 75, 109]`.
Statically exports nothing via `exports.<name>` — it ends with
`e.exports = function() { ... }`, i.e. a default-export zero-argument
function that is the orchestrator entry point. Module 64 invokes it as
`n(56)()` twice: once on mobile (`c === true`) where Zepto has already
been installed as `window.$ = n(76)`, and once on desktop after
`getScript({src: .../slide-jy.js})` resolves and `window.$` becomes
jQuery.

### 4.1 Top-of-module wiring (static `var` binds)

All 21 `require` edges of module 56 resolved by reading the first ~350
bytes of its body. Short-name → module → role:
`r=window.timing` (show-page inline timing),
`i=n(41)` (i18n captions),
`a=n(30)` (URL query + sess cache),
`o=n(67)` (slide drag handler),
`s=n(45)` (postMessage to parent),
`c=n(68)` (image loader),
`u=n(40)` (platform/config helper),
`l=n(70)` ({vm, tdc, challenge} barrel — modules 71/38/72),
`d=n(74)` (TuCao feedback),
`f=n(0).addUrlParam`,
`p=n(46)` (rem/dpr),
`h=n(39)` (subsid),
`m=n(59)` (DOM status / shake / loading),
`g=n(58)` (caplog reporter),
`v=n(37)` (cap_monitor reporter),
`b=n(47)` (cached DOM refs),
`w=n(30).updateSession`,
`y=n(48).default` (PoW WebWorker wrapper),
`k=n(10).getErrorRes`,
`x=n(3)` (URL helpers),
`S=n(1).isTouchEventSupported`.
Then `_=window.captchaConfig`, `E=l.tdc`, and the three critical
pass-throughs: **`T=E.setData`**, **`C=E.getData`**, **`R=E.getEks`**
(wrappers around `window.TDC.setData/getData/getInfo().info`).

### 4.2 DoD keyword inventory for this module

Each Track 2 DoD keyword appears **exactly once textually** inside module
56's byte range (other mentions of "sess" and "nonce" live in module 30
and in the `a.queryParam("sid")` helpers, but not inside module 56's own
source). The one-shot mentions in module 56 are:

| keyword     | role in module 56                                                                 |
|-------------|-----------------------------------------------------------------------------------|
| `vData`     | Write: `e.vData = o` inside `if (a.isLowIE())` guarded block (see §9).            |
| `collect`   | Write: `e[_.collectdata] = decodeURIComponent(C())` where `_.collectdata="collect"` in HAR. Read: `C = E.getData` from module 38 (i.e. `window.TDC.getData(true)`). |
| `eks`       | Write: `d.eks = R()`. Read: `R = E.getEks` → `(window.TDC.getInfo()||{}).info`.   |
| `nonce`     | Read: `_.nonce` (`window.captchaConfig.nonce`). Write: `_.nonce && (d.nonce=_.nonce)`. Module 56 never mutates it. |
| `sess`      | Write: indirect via `w(e.sess)` where `w = n(30).updateSession`, on both the `/cap_union_new_getsig` success handler (`n && w(n)`) and the `/cap_union_new_verify` success handler (`e.sess && w(e.sess)`). |
| `sig=`      | This substring appears only as the literal suffix inside `d.vsig=_.vsig;d.websig=_.websig;` — i.e. both `vsig` and `websig` end in `sig` inside the concatenated body; there is no free-floating `sig=` field in the POST body. |
| `cap_union` | Three URLs: `/cap_union_new_verify` (POST), `/cap_union_new_getsig` (POST), and `/cap_union_new_getcapbysig` indirectly via module 40.`cgiImg`. |

The fan-out subgraph breakdown:

- **Verify-body feeders**: 38 (tdc), 70 (vm/tdc/challenge barrel), 71 (vm
  adapter), 72 (PoW challenge), 30 (sess + queryMap), 67 (drag coords),
  48 (PoW WebWorker), 73 (md5), 74 (feedback payload), 39 (subsid).
- **Network loops**: jQuery/`$.ajax` from `window.$`, 58 (caplog reporter),
  37 (cap_monitor reporter — distinct from caplog), 10 (error ticket
  fabrication on triple-failure), 59 (DOM error-note display), 68 (image
  loader for slide + bg).
- **Utility / DOM**: 41 (i18n captions), 47 (DOM refs), 45 (postMessage
  to parent frame), 46 (flexible rem/dpr), 40 (platform/config helper),
  75 (TCSDK android open-link shim), 109 (empty side-effect module).
- **URL helpers**: 0 (re-exports of 1/2/3/4/13/14/15), 1
  (`isTouchEventSupported`), 3 (`getHref`/`getQueryParam`/`addUrlParam`),
  74 uses 38.

### 4.3 Entry function (module 56 `e.exports = function() { ... }`)

Invoked by module 64 after `window.$` is ready. The body is
approximately:

```js
l.tdc.link(v);                    // register module 38 -> window.TDC side-channel
l.vm.init();                      // new window.vm.entry(_.vmByteCode) if available
if (I) { j = new y; j.run(P, ...); }   // warm up PoW WebWorker if powCfg present
/* bind click handlers: close, btnBack, aged, feedback, reload, ... */
N();                              // paint initial UI state (captcha with loading class)
```

`N()` configures DOM styles from `i` / `b` / `p`, then calls
`z = o(b.operation, [b.imgSlide, b.btnSlide], clearErrorNote,
      function dragEnd(dragObj, targetIdx, coordArray){ ... })` to
install the slide-drag handler. The fourth argument is the callback
invoked when the user releases the drag: it captures the slide
coordinates, runs the PoW + vm-run completion fence, and fires the
verify POST.

### 4.4 The verify-POST IIFE

On drag-release, module 56 runs this (simplified but faithful to the
byte range):

```js
z.movable(false);
var iSlide  = b.imgSlide.offset();
var oBg     = b.imgBg.offset();
var c = [{
  left: Math.floor((iSlide.left - b.operation.offset().left) / _.rate),
  top:  Math.floor(parseInt(_.spt, 10))
}];
l.tdc.setData({
  coordinate: [Math.ceil(oBg.left), Math.ceil(oBg.top), Number(_.rate.toFixed(4))]
});
// -- then an inner function compose(e, t, n) -- see below
```

The inner `function(e, t, n){ ... }(c, t, n)` is the heart of the build.
It awaits three independent sub-results before firing `$.ajax`:

1. **PoW** — if `I = captchaConfig.powCfg.md5 && .nonce` is truthy, run
   `j.run(P, cb)` (module 48 WebWorker, falls back to module 52 sync
   `getWorkloadResult`); otherwise mark as done with `c |= 1` and
   `M.ans = ""`.
2. **slide-drag coordinates** — from the outer `(e, t, n)` params.
3. **vm.run** — `l.vm.run(function(e){ o = e; c |= 2; u(); })`. Module
   71's `run` calls `a.run(cb)` if `vmAvailable && vmByteCode` and
   produces `{vlg, vmData, vmtime}`; otherwise it still fires the
   callback with just `{vlg: "0_0_1"}` so the fence completes.

When both bits are set (`c === 3`), the inner `u()` fires, which:

- Reads `var d = a.queryMap()` — takes the iframe URL's query string
  as the starting dict (sess, aid, sid, subsid, rnd, and all the other
  show-URL params).
- Injects the slide-challenge counter via
  `(function(e, t){ var n = l.challenge(); t.push([0, 0, n]); e.cdata = n })(d, n)`.
  `l.challenge()` (module 72) brute-forces an md5 PoW over `randstr||i`
  for `i < capChallenge.M` and returns the matching counter — see §4.5.
- Writes the drag + metadata fields onto `d`:
  `trycnt, refreshcnt, slideValue, dragobj`, `ans` (comma/semicolon-
  separated coords), `vsig`, `websig`, `subcapclass`, `pow_answer`,
  `pow_calc_time`, `collect` / `tlg` pair, `asig`/`buid` (only for
  `_.curenv !== "inner"`), `fpinfo`, `eks`, `nonce`.
- `$.extend(d, o)` — merges the vm.run result into `d`. In the HAR
  this contributes only `vlg = "0_0_1"`.
- Checks `l.tdc.checkTdcSuccess()` and, if `window.TDC` didn't load,
  triggers `l.tdc.retryLoad(v)` (which uses module 66, NOT module 8,
  to re-fetch `tdc.js`).
- Runs the `isLowIE()` guarded `window.getVData` block (see §9).
- `$.ajax({ type: "POST", url: "/cap_union_new_verify", data: d,
           timeout: 15000, dataType: "json", success, error })`.

### 4.5 `l.challenge()` — module 72 (slide-side PoW)

Module 72 exports a zero-arg function that reads `a.capChallenge`
from `window.captchaConfig`, and when it is an object of shape
`{randstr: string, M: string|number, ans: string}`, brute-forces
`md5(randstr + i)` for `i < Math.min(M, 1000)` looking for a hit
against `ans` (case-insensitive). The loop index `i` of the match
is the return value. When `capChallenge` is absent (HAR case) the
function returns `0`, which is why `d.cdata = 0` in the HAR. The
md5 implementation is `n(73)`. The counter is also pushed into the
drag coordinate array as `[0, 0, n]`, so it ends up as part of the
`ans=` field alongside the real drag coordinates.

### 4.6 Verify response handler

Success handler first unconditionally rotates `sess` (`e.sess &&
w(e.sess)`), then switches on `parseInt(e.errorCode, 10)`:

- **0** — success: `m.showSuccess(z.dragDuration, () =>
  s.verifySuccess({ticket: e.ticket, randstr: e.randstr}))`. Module
  45's `verifySuccess` serializes `{type:3, ticket, randstr,
  errorCode, errorMessage, ret}` and calls
  `o.targets.parent.send(...)`, i.e. the **ticket is delivered to
  the parent page through `window.postMessage`**, not as an HTTP
  response.
- **9** — wrong answer: show `puzzle8` note, shake, then call `q()`
  (refresh/getsig loop, §4.7).
- **12** — soft fail: show `puzzle9` cover error with refresh hook
  `q`. Consistent with `docs/ERRORCODE_12_INVESTIGATION.md`.
- **16 / 20 / 21** — session expired: `s.sessionTimeout()` (postMessage
  type 12 to parent).
- **50** — position out of tolerance: shake + `z.moveBack(true)`.
- **30 / 51** — hybrid verify handoff: `s.hybridVerify(e.sess, h.get())`
  (postMessage type 8 with sess + subsid).
- **52** — appid region wrong: show `appid-region-wrong` cover error.
- default — show `c23` ("unknown error") cover error with `errorCode`
  embedded.

Caplog event 27 (`verify` timing) is pushed and sent after every
response regardless of outcome.

### 4.7 The refresh (`q`) / getsig loop

The `q()` function is the "wrong answer, try again" path. Guarded by
an in-flight flag `V`, it clears tdc data, re-inits vm, optionally
triggers `l.tdc.retryLoad(v)` (which uses **module 66** — the second
script loader — to re-fetch `tdc.js`), and POSTs the iframe URL
query (via `a.getQuery(true)`, minus the old `rand` and plus a new
one) to `/cap_union_new_getsig`. The response rotates `sess`,
`vsig`, `capChallenge`, `cdnPic1/cdnPic2/iscdn`, and the slide drop
position `_.spt = e.inity`; then module 68 reloads the background +
thumb images, and `U()` re-arms the drag handler. If `e.ret === 52`,
the path short-circuits to `s.frequencyLimit()` (postMessage type 11
to parent). Errors report to `cap_monitor` via module 37 as
`ERROR_TYPE_AJAX_GETSIG = 9`.

## 5. Module 76 — ajax layer

See `output/captcha-orchestrator/slide-jy-diff.md` for the full
probe table. **Verdict: module 76 is Zepto** (embedded as a webpack
module); `sample/slide-jy.js` is **jQuery 1.11.3** (standalone).
They are different libraries, not the same codebase minified
differently.

Evidence summary (the diff doc has the full table):

- Module 76 (27,825 bytes): contains `Zepto` literal, exports
  `ajaxJSONP` (a Zepto-only method — jQuery uses
  `$.ajax({dataType:"jsonp"})` instead), no `noConflict`, no
  `jQuery.fn.init`, no `Sizzle`, only ~3 `extend` occurrences.
- slide-jy.js (96,410 bytes): explicit `"1.11.3"` version literal,
  `noConflict` UMD footer, ~47 `extend` occurrences, no `Zepto`
  literal, no `ajaxJSONP`.

Module 64 picks between them by user agent:

```js
var c = /(iPhone|iPad|iPod|Android|ios|SymbianOS|Mobile)/i.test(navigator.userAgent);
...
if (h && m) { r.verifySuccess({ticket: h, randstr: m}); }      // server pre-solved
else if (c) { window.$ = n(76); n(56)(); }                      // mobile: inline Zepto
else { a({src: ..."/slide-jy.js", success: f, error: retry}); } // desktop: fetch jQuery
```

Desktop branches always go through `getScript` → `/slide-jy.js` →
poll `window.$` → `n(56)()`. Mobile branches skip the network fetch
entirely and use `n(76)` directly. The `$.ajax` call in module 56 is
therefore against `window.$` of whichever library was installed —
both expose `$.ajax({type, url, data, dataType, timeout, success,
error})` with the same shape, which is why module 56 can be library-
agnostic.

## 6. End-to-end flow

Numbered, one step = one observable action. HAR entry numbers refer
to `sample/captcha-har.har` (12 entries total).

1. **prehandle** (HAR 1): parent page calls
   `GET /cap_union_prehandle?aid=...&ua=...&...` as JSONP. Response
   `_aq_266977({state:1, sess:"s1aovgi...", subcapclass:"15", ...})`.
   This is the **first** session token; it is then baked into the
   show-page URL on the next hop.
2. **show-page iframe URL construction**: parent builds
   `/cap_union_new_show?aid=...&sess=<from prehandle>&sid=...&rnd=...
   &prehandleLoadTime=...&createIframeStart=...&global=0&subsid=10&...`
   and inserts the iframe. HAR 2. The show-URL query is exactly the
   24 upstream passthrough fields in §7.
3. **show-page HTML** (HAR 2 response body) inlines
   `window.captchaConfig = {dcFileName:"tdc.js?app_data=...&js_data=...",
   vmFileName:"", websig:"", collectdata:"collect", vsig:"",
   nonce:"eda1152f11f1daf0", sess:"s1LCqg-...", cdnPic1, cdnPic2,
   iscdn:"1", vmByteCode:"", vmAvailable:"", capSrc:"capFrame",
   spt:"46", curenv:"inner", ticket:"", randstr:"",
   powCfg:{md5:"",prefix:""}}`. Pre-bakes: `nonce`, `sess`
   (server may rotate vs prehandle), `collectdata` (field name for
   the collect token), `vmByteCode` + `vmAvailable` empty (so
   module 71's vm integration is inert), `powCfg` absent (no PoW),
   `capChallenge` absent (so `l.challenge()` returns 0 → `cdata=0`).
4. **Show-page script tags**, loaded in order:
   (a) `<script src="/tdc.js?app_data=...&js_data=...">` (HAR 3) —
       the register-VM `tdc.js` from `docs/TOKEN_FORMAT.md`. Installs
       `window.TDC` with `getData`, `setData`, `clearTc`, `getInfo`.
       The server-baked `js_data` URL query parameter seeds the
       register-machine with its bytecode + keys.
   (b) `<script src="https://captcha.gtimg.com/1/tcaptcha-slide.29a33140.js" crossorigin="anonymous">`
       (HAR 4) — byte-identical to `sample/t_captcha_slide.js`
       (verified: same length 213,162, same sha256).
   (c) `<script src="/vm-slide.e201876f.enc.js">` (HAR 5) — stack VM
       (`research/vm-slide-stack-vm/`). **Hardcoded directly in the
       show-page HTML** — NOT loaded by the orchestrator bundle.
   (d) Tail recovery script: if `!window.TCaptchaLoaded`, reinsert
       `/tcaptcha-slide.29a33140.js` and send a `cap_monitor` ping.
5. **tdc.js runs**, installs `window.TDC`. Subsequent
   `TDC.getData(true)` calls return the URL-encoded `collect` token;
   `TDC.getInfo().info` returns the server-baked `eks` string per
   `docs/EKS_FORMAT.md`.
6. **Bundle runs** (`n(n.s=64)` → module 64):
   - `n(65)` error-handler side-effect installer.
   - `r.loadReady()` (module 45) — `postMessage({type:10,loadstate:0})`
     to parent frame.
   - Decides ajax library:
     * If `captchaConfig.ticket && randstr` (server pre-solved): call
       `verifySuccess` immediately, skip everything.
     * Else if mobile UA: `window.$ = n(76)` (inline Zepto), call
       `n(56)()`.
     * Else (desktop): `getScript({src: htdocsPath + "/slide-jy.js",
       successCheck: () => !!window.$, success: f, error: retry-from-root})`.
       `f()` polls every 20 ms until `window.$` is assigned, then
       calls `n(56)()`.
   - Sets `window.TCaptchaLoaded = true`.
7. **vm-slide.enc.js runs** (HAR 5), independent of the bundle.
   Stack-VM encoded (`__TENCENT_CHAOS_STACK`) and opaque to grep.
   May or may not install `window.vm.entry`; module 71 tolerates
   absence.
8. **slide-jy.js runs** (HAR 4 — jQuery 1.11.3 in desktop HAR).
   `window.$` is assigned. Module 64's `f()` observes it, calls
   `n(56)()`.
9. **Module 56 init** (see §4.3): `l.tdc.link(v)`, `l.vm.init()`
   (no-op with empty bytecode), PoW warm-up (skipped — no powCfg),
   DOM handlers, `N()` → install drag handler via module 67, load
   slide images via module 68 (`/cap_union_new_getcapbysig?aid=...&
   sess=...&sid=...&img_index=1|2` or `/hycdn?...` when `iscdn=1`),
   then `U()` arms `z.movable(true)`.
10. **User drags slide**. Module 67 tracks movement up to 300
    samples, computes per-step deltas, fires drag-release callback
    from module 56 with `(dropXY, targetIdx, coordArray)`.
11. **Drag-release → verify POST** (see §4.4):
    - `l.tdc.setData({coordinate:[bgX, bgY, rate]})`.
    - Awaits three fences: PoW, slide coords (already present),
      vm.run (instant no-op returning `{vlg:"0_0_1"}`).
    - `u()` assembles `d = a.queryMap()` + 13 writes from §4.4.
    - `$.ajax({type:"POST", url:"/cap_union_new_verify", data:d,
      timeout:15000, dataType:"json", success, error})` (HAR 6).
12. **Server response** (HAR 6 response):
    `200 {"errorCode":"0","randstr":"@Ucm","ticket":"t03tserver...",
    "errMessage":"","sess":""}`. Module 56 success handler rotates
    `sess` (empty → clear), switches on `errorCode` — on 0, calls
    `s.verifySuccess({ticket, randstr})` which is module 45's
    `parent.postMessage({type:3, ticket, randstr, ...})`. **The
    parent page receives the ticket via message event**, not as an
    HTTP response to any of its own scripts.

## 7. Verify POST origination table

Full machine-readable form:
`output/captcha-orchestrator/verify-body-origination.json` — 39 rows
(0 leftover HAR fields), each with `{name, sample_value_prefix,
sample_value_length, origin_module, origin_lines, assembly_method,
provenance}`. 41.6 should embed the JSON verbatim in
`docs/CAPTCHA_ORCHESTRATOR.md`.

**Shape summary**: 24 of 39 fields are upstream passthroughs from the
iframe URL query via `a.queryMap()` (module 30). The other 15 are
written inside the orchestrator:

| field            | origin module                                          | summary |
|------------------|--------------------------------------------------------|---------|
| `sess`           | mod 30 (`updateSession`)                               | Server-baked in `window.captchaConfig.sess`, rotated mid-session by verify + getsig success handlers. |
| `cdata`          | mod 56 (`e.cdata = n`), inner fn `(e,t){ n = l.challenge() }` | `l.challenge()` = module 72, server PoW md5 brute-force counter (returns 0 when `capChallenge` unset — HAR state). |
| `ans`            | mod 56 (`d.ans = c`)                                   | Slide drag coords joined as `"Math.floor(left),Math.floor(top);"` strings by module 67's drag handler. HAR value `484,46;`. |
| `vsig`, `websig`, `subcapclass` | mod 56 (`d.vsig=_.vsig`, etc.)         | Read straight from `window.captchaConfig`; refreshed by getsig. Empty in HAR. |
| `pow_answer`     | mod 56 (`d.pow_answer = P.nonce + M.ans`)              | Module 48 WebWorker md5 PoW (fallback module 52 sync, n(73) = md5). Empty in HAR — `powCfg.md5`/`prefix` absent. |
| `pow_calc_time`  | mod 56 (`d.pow_calc_time = M.duration`)                | Ms of the PoW WebWorker run. |
| `collect`        | mod 56 (`e[_.collectdata] = decodeURIComponent(C())`)  | `C = n(70).tdc.getData` → `window.TDC.getData(true)` from tdc.js. Field name set by `captchaConfig.collectdata` ("collect" in HAR). Same token as `docs/TOKEN_FORMAT.md`. |
| `tlg`            | mod 56 (`e.tlg = e[_.collectdata].length`)             | Length of URL-decoded collect token. |
| `fpinfo`         | mod 56 (`d.fpinfo = i`)                                | `i` is the vm.run callback's fingerprint argument. Empty in HAR (vm not armed). |
| `eks`            | mod 56 (`d.eks = R()`)                                 | `R = n(70).tdc.getEks` → `(window.TDC.getInfo() || {}).info`. Server-baked string per `docs/EKS_FORMAT.md`. |
| `nonce`          | mod 56 (`_.nonce && (d.nonce = _.nonce)`)              | Read straight from `window.captchaConfig.nonce` (server-baked in show-page HTML: `nonce:"eda1152f11f1daf0"`). |
| `vlg`            | mod 71 (`t.vlg = [...].join("_")`), `$.extend(d,o)` in mod 56 | Three-digit `[vmAvailable?1:0, vmByteCode?1:0, 1]` availability signal. HAR value `0_0_1`. |
| `vData`          | mod 56 (`e.vData = o`, isLowIE guard)                  | **ORIGIN UNRESOLVED STATICALLY** — see §9. Only lexical write is behind `isLowIE()`, uses `window.getVData`, but `getVData` is undefined in the bundle, tdc.js, and vm_slide.js, and HAR was captured on Chrome 146. |

HAR-prefix values for each of the 15 non-upstream fields and all 24
upstream fields are in `verify-body-origination.json`.

## 8. Reconciliation with prior docs

This is a read-only cross-check. No docs are edited by 41.5 — 41.6
owns the reconciliation in the public doc.

### `docs/HAR_ANALYSIS.md`

To be reconciled by 41.6. FLOW.md gives the endpoint list that the
live 41.5 HAR contains: `cap_union_prehandle` (GET, JSONP),
`cap_union_new_show` (GET, HTML), `tdc.js` (GET, JS),
`tcaptcha-slide.29a33140.js` (GET, JS = our bundle),
`vm-slide.e201876f.enc.js` (GET, JS = stack VM),
`cap_union_new_verify` (POST, url-encoded, 39 fields, responds JSON
with `{errorCode, randstr, ticket, errMessage, sess}`). Refresh /
retry loop (not exercised in this HAR) goes through
`cap_union_new_getsig` (POST, responds `{ret, sess, vsig, inity,
cdnPic1, cdnPic2, iscdn, chlg}`). Image fetches use
`cap_union_new_getcapbysig` (module 40 `cgiImg`) with
`?aid=...&sess=...&sid=...&img_index=1|2`.

### `docs/TOKEN_FORMAT.md`

FLOW.md confirms that `collect` in the verify POST is the same token
documented in `TOKEN_FORMAT.md`: produced by `window.TDC.getData(true)`
from `tdc.js`, URL-encoded on the wire, field name set by
`captchaConfig.collectdata` ("collect" in this HAR). `docs/TOKEN_FORMAT.md`
is an authoritative spec for how the token is BUILT (by the register-
VM tdc.js); FLOW.md adds the anchor for how it is CONSUMED (one call
site, `e[_.collectdata] = decodeURIComponent(C())` in module 56).
No contradiction.

### `docs/EKS_FORMAT.md`

`docs/EKS_FORMAT.md` says eks is server-baked into tdc.js around line
123 and accessible via `window.TDC.getInfo().info`. FLOW.md confirms
the same surface: module 38 defines
`getEks: function(){ return (l()||{}).info || ""; }` where
`l = function(){ return typeof o.getInfo === "function" && o.getInfo() || {}; }`
and `o = window.TDC`, and module 56 reads it via
`R = n(70).tdc.getEks; ... d.eks = R()`. **No contradiction** for
tdc.js. FLOW.md also fills in an unknown noted in the EKS doc: in the
slide-CAPTCHA verify path, the `eks` field in the POST body **is** the
`TDC.getInfo().info` value — the orchestrator does not derive a
different "eks for slide" value.

### `docs/VM_ARCHITECTURE.md`, `docs/OPCODE_REFERENCE.md`, `docs/CRYPTO_ANALYSIS.md`

Not directly relevant to the orchestrator — FLOW.md does not interact
with register-VM internals. Module 38 is a thin adapter over
`window.TDC`; module 56 is library-agnostic wrt the register VM.

### `docs/ERRORCODE_12_INVESTIGATION.md`

FLOW.md confirms the `errorCode 12` handling path: in module 56's
verify success handler, `case 12` calls
`m.showCoverError("puzzle9", null, q, a.queryParam("sid"))` which is
the "verify error, try again" cover modal with refresh callback `q`.
The orchestrator treats 12 identically to a soft-retryable failure;
there is no special cleanup or sess rotation beyond the `e.sess &&
w(e.sess)` that runs unconditionally before the switch. Consistent
with the doc's finding that 12 is NOT plain IP rate limiting.

## 9. Open questions for later tasks

### Q1. `vData` origination on modern browsers (HIGH priority)

Static state: the only lexical write in the orchestrator bundle is
inside `if (a.isLowIE()) { ... var o = window.getVData &&
window.getVData(n.join("&")); o && (e.vData = o) }`. `window.getVData`
is undefined in `sample/t_captcha_slide.js` (1 grep hit, the write
above — zero definitions), in the HAR-served `tdc.js` (132,906 bytes,
zero hits for `getVData` OR `vData`), and textually absent from
`sample/vm_slide.js` (43,688 bytes — but that file is the encoded
`__TENCENT_CHAOS_STACK` blob and runtime-installed globals are
opaque to grep).

HAR state: `vData` is present in the Chrome-146 HAR verify body
(`vData=7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt...`),
and the HAR-served orchestrator bundle is byte-identical (sha256 match)
to `sample/t_captcha_slide.js`. So the write must happen at runtime
from a source we cannot read statically.

Hypotheses, in decreasing plausibility:

1. **`vm-slide.e201876f.enc.js` installs a `$.ajaxPrefilter` or
   `$.ajaxTransport`** that rewrites POST bodies to add `vData` before
   they hit the network. jQuery 1.11.3 supports both hooks; a
   runtime-installed prefilter is invisible to static grep over the
   orchestrator bundle, which is exactly the pattern observed.
2. **vm-slide installs `window.getVData`** and some other site-specific
   script patches the `isLowIE` path — less clean, harder to reconcile
   with the byte-identical bundle.
3. **vm-slide mutates the `d` object via a MutationObserver or form
   hook** — harder to falsify statically.

Follow-up options: (a) dynamic jsdom harness that executes
`vm-slide.e201876f.enc.js` and logs `window.*` writes + `$.ajaxSettings`
mutations; (b) stack-VM bytecode decode of `vm_slide.js` via
`research/vm-slide-stack-vm/` tooling, grepping the decompiled output
for `getVData`, `vData`, `ajaxPrefilter`, `ajaxTransport`,
`ajaxSettings`; (c) Puppeteer with `chrome.debugger`
set-breakpoint-on-property-write against `window.getVData` / `$.ajax`.

This is the single open question exposed by 41.5 and does not block
41.6 from writing the public doc.

**Resolution post-script (Phase 42, 2026-04-13)**. Q1 is now resolved in
mechanism. Hypothesis 1 is wrong in its specific hook (it is NOT a jQuery
`ajaxPrefilter`/`ajaxTransport`) but right in its location
(`vm-slide.e201876f.enc.js`). Follow-up option (b) — stack-VM bytecode
decode via `research/vm-slide-stack-vm/` — was the productive path.

Tasks 42.1 and 42.2 statically traced vm-slide's bytecode and established:

1. vm-slide has a two-way runtime branch at bytecode pc 19636 (`OP_60
   19666`) calling `<state>.isIE9Below()`. The two branches are mutually
   exclusive and join at pc 20070.
2. **Chrome path** (fall-through on non-IE): vm-slide builds the property
   descriptor `[<state>, "proxyXHR"]` and invokes it with one argument at
   pc 19662 (`OP_02 1`). The `proxyXHR` routine installs an
   `XMLHttpRequest.prototype` monkey-patch — `"XMLHttpRequest"` appears 5×
   at pcs 20154 / 20220 / 20290 / 20476 / 20621 inside vm-slide, with
   `"send"`/`"open"` references. The patched `send` intercepts the
   orchestrator's later verify POST and injects `vData=<ciphertext>` into
   the body. `window.getVData` is **never installed** on Chrome — the
   jump `OP_06 20070` at pc 19663 skips the entire install block.
3. **IE9 fallback** (jump target): vm-slide builds `[window, "getVData"]`
   and installs the closure at `OP_24` pc 20066 with body brackets
   `[19702, 20058]`. This is what Hypothesis 2 pointed at — but only for
   IE9 browsers; the orchestrator's `if (a.isLowIE())` branch then calls
   the installed function explicitly. The branch is not redundant; it
   mirrors vm-slide's own IE9 gate.
4. **Crypto pipeline ingredients all present in vm-slide**: XTEA delta
   `0x9E3779B9` as `OP_08` immediate at bytecode indices 15352 (encrypt)
   and 15530 (decrypt), a custom 64-char base64 alphabet at pc 16932
   (`GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` —
   contains `-_*`), and a char-set validation regex `[^A-Za-z0-9\-\_\*]`
   at pc 17677. The full 152-char HAR `vData` value's character set is a
   strict subset of the alphabet (zero outliers), confirming the
   alphabet-to-HAR-value linkage.
5. **Window-install enumeration**: the full-bytecode scan in
   `research/vm-slide-stack-vm/vdata-provenance.js` →
   `output/vm-slide/window-installs.json` found exactly **one**
   `window.*` property that vm-slide installs — `getVData`, on the IE9
   branch. The Chrome-path crypto stays entirely inside the XHR proxy
   closure.

See `research/vm-slide-stack-vm/VDATA-TRACE.md` (task 42.1) for the
property-write trace and `research/vm-slide-stack-vm/VDATA-RESOLUTION.md`
(task 42.2) for the cross-reference, IE-gate discovery, and full crypto
provenance scan. The public doc `docs/CAPTCHA_ORCHESTRATOR.md` §6 `vData`
was rewritten with the resolved mechanism.

What remains open (narrower follow-up, not Phase 42 scope): exact XTEA
key bytes, exact plaintext structure, and byte-identical reproducibility
via a standalone vData generator. Track 2's DoD did not require this.

### Q2. subcapclass dropped between prehandle and show

Prehandle JSONP returned `subcapclass:"15"`; show-page URL query
omits it and the show-page `captchaConfig.subcapclass` is `""`, so
the verify POST body has `subcapclass=`. Probably benign (the server
knows what class it's serving). Worth noting for 41.6.

### Q3. Module 41 i18n completeness

Parked (see MODULE-41-NOTES.md).

### Q4. parse-bundle.js export extractor coverage

Minor polish: recognize `module.exports = <Identifier>` and
`e.exports = <Identifier>` default-export forms. Not blocking for 41.6.

### Q5. window.timing wiring

Set up by an inline `<script>` at the top of the show-page HTML (HAR
entry 2 response, first ~500 bytes). Module 56 and 58 use it as an
external API. Worth a one-line mention in the public doc.
