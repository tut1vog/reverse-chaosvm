# CAPTCHA Orchestrator Reference — `t_captcha_slide.js`

Public reference for the Tencent CAPTCHA slide orchestrator bundle served as
`/1/tcaptcha-slide.29a33140.js`. This document is the Track 2 public deliverable
for Phase 41; it transcribes the findings recorded in
`research/captcha-orchestrator/FLOW.md` (static end-to-end trace) and
`research/captcha-orchestrator/SURVEY.md` (structural baseline). Every claim
below cites either a module id with a short role anchor or a FLOW.md section.

**Source reference**: `sample/t_captcha_slide.js` (213,162 bytes), webpack 4
IIFE, entry module 64. HAR evidence comes from `sample/captcha-har.har` (one
successful desktop verification: prehandle → show → tdc.js → bundle →
vm-slide.enc.js → verify).

**See also**:

- `docs/TOKEN_FORMAT.md` — how the `collect` token carried by the verify POST
  is built by the register-VM `tdc.js`.
- `docs/EKS_FORMAT.md` — how the `eks` field served by the orchestrator is
  server-baked into `tdc.js`.
- `docs/HAR_ANALYSIS.md` — network-level flow view of the CAPTCHA protocol.
- `docs/ERRORCODE_12_INVESTIGATION.md` — verify `errorCode 12` handling.
- `research/captcha-orchestrator/FLOW.md` — research-side narrative, 9 sections.
- `research/captcha-orchestrator/SURVEY.md` — structural baseline (bundle
  shape, module count, graph shape).
- `output/captcha-orchestrator/verify-body-origination.json` — 39-field
  origination table in machine-readable form.

---

## 1. Overview

`sample/t_captcha_slide.js` is the webpack 4 orchestrator bundle that drives
Tencent's slide-CAPTCHA iframe. It is a standard webpack 4 IIFE with a flat
module array. The runtime wrapper walks every module via
`e[r].call(i.exports, i, i.exports, n)`, so every module wrapper has the
canonical signature `function(module, exports, require)` — the third
positional parameter of every wrapper is the `require` function. The entry
module is module 64, declared by `n(n.s = 64)` in the wrapper (SURVEY.md
"Bundle shape").

Bundle-level facts (reproducible from `output/captcha-orchestrator/modules.json`
and `module-graph.json`):

- **Total array slots**: 110.
- **Non-empty modules**: 50.
- **Empty slots** (sparse holes): 60.
- **Static require edges**: 91.
- **Leaves** (modules with zero outgoing edges): 24.
- **Max fan-out**: 21 (module 56).
- **Single root**: module 64 is the only non-empty module that is never
  `require`'d from anywhere else.
- **Dynamic requires**: none. FLOW.md §2 gate 1 ran a dynamic-require audit
  that walked every webpack wrapper, pre-collected the hoisted bindings of each
  enclosing scope, and reported any `<requireParam>(<non-numeric>)` call site.
  Four suspect sites were found (modules 39, 59, 67, 76); all four are
  identifier-shadowing false positives (e.g. in module 76 Zepto redefines `n`
  as an internal function). The static require-edge graph is therefore
  **complete** — nothing is hidden behind a dynamic lookup.

Sections 2–4 walk the four key subgraphs. Section 5 tabulates the origination
of every field in the verify POST body. Section 6 drills into the six Track 2
DoD fields. Section 7 covers ticket return. Section 8 enumerates the remaining
open questions. Section 9 reconciles with the pre-existing docs.

---

## 2. End-to-end flow

Transcribed from FLOW.md §6. HAR entry numbers refer to
`sample/captcha-har.har`.

1. **Prehandle** (HAR 1). Parent page calls
   `GET /cap_union_prehandle?aid=...&ua=...` as JSONP. Response
   `_aq_266977({state:1, sess:"s1aovgi...", subcapclass:"15", ...})` — this is
   the first `sess` token. The parent page bakes it into the show-page URL.
2. **Show-page URL construction.** Parent builds
   `/cap_union_new_show?aid=...&sess=<from prehandle>&sid=...&rnd=...
   &prehandleLoadTime=...&createIframeStart=...&global=0&subsid=10&...` and
   inserts the iframe (HAR 2). Every upstream passthrough field listed in §5
   is exactly one key from this show-URL query.
3. **Show-page HTML** (HAR 2 response body) inlines
   `window.captchaConfig = { dcFileName:"tdc.js?app_data=...&js_data=...",
   vmFileName:"", websig:"", collectdata:"collect", vsig:"",
   nonce:"eda1152f11f1daf0", sess:"s1LCqg-...", cdnPic1, cdnPic2, iscdn:"1",
   vmByteCode:"", vmAvailable:"", capSrc:"capFrame", spt:"46", curenv:"inner",
   ticket:"", randstr:"", powCfg:{md5:"",prefix:""} }`. This is the canonical
   configuration object the orchestrator reads from; the show-page also
   installs an inline `<script>` that seeds `window.timing`.
4. **Show-page `<script>` tags**, loaded in order:
   (a) `<script src="/tdc.js?app_data=...&js_data=...">` (HAR 3) — the
       register-VM `tdc.js` from `docs/TOKEN_FORMAT.md`; installs `window.TDC`
       with `getData`, `setData`, `clearTc`, `getInfo`.
   (b) `<script src="https://captcha.gtimg.com/1/tcaptcha-slide.29a33140.js"
       crossorigin="anonymous">` (HAR 4) — this orchestrator bundle;
       byte-identical (sha256) to `sample/t_captcha_slide.js`.
   (c) `<script src="/vm-slide.e201876f.enc.js">` (HAR 5) — the stack VM
       (`research/vm-slide-stack-vm/`). **Hardcoded directly in the show-page
       HTML**, NOT loaded by the orchestrator bundle. FLOW.md §3 traces
       module 8's only call site and shows it fetches `/slide-jy.js` (jQuery),
       not `vm-slide.enc.js`; the 41.4 survey guess that module 8 was the
       vm-slide loader was wrong.
   (d) Tail recovery script: if `!window.TCaptchaLoaded`, reinsert
       `/tcaptcha-slide.29a33140.js` and send a `cap_monitor` ping.
5. **tdc.js runs** (HAR 3). `window.TDC` is installed. Subsequent
   `TDC.getData(true)` calls return the URL-encoded `collect` token;
   `TDC.getInfo().info` returns the server-baked `eks` string
   (`docs/EKS_FORMAT.md`).
6. **Bundle runs** (HAR 4). Module 64 is invoked by `n(n.s = 64)`:
   - `n(65)` error-handler side-effect installer.
   - `r.loadReady()` (module 45) posts `{type:10, loadstate:0}` to the parent
     frame via `postMessage`.
   - Library selection:
     * If `captchaConfig.ticket && randstr` (server pre-solved): call
       `verifySuccess` immediately and skip everything.
     * Else if the user agent matches
       `/(iPhone|iPad|iPod|Android|ios|SymbianOS|Mobile)/i` (mobile): install
       `window.$ = n(76)` (inline Zepto), then call `n(56)()`.
     * Else (desktop): `getScript({src: htdocsPath + "/slide-jy.js",
       successCheck: () => !!window.$, success: f, error: retry-from-root})`.
       `f()` polls every 20 ms until `window.$` is assigned, then calls
       `n(56)()`.
   - Sets `window.TCaptchaLoaded = true`.
7. **vm-slide.enc.js runs** (HAR 5), independent of the bundle. It is the
   stack VM (`__TENCENT_CHAOS_STACK`, `docs/VM_SLIDE_ARCHITECTURE.md`).
   Early in its outer initializer (decoded bytecode pc=19604..20069) it
   runs a two-way gate at pc 19636 — `OP_60 19666` — calling
   `<state>.isIE9Below()` and branching:
   - **On IE9 and below** (the jump-target branch): vm-slide builds the
     property-access descriptor `[window, "getVData"]` and installs a
     closure at pc=20066 via `OP_24` (property set). `window.getVData`
     becomes a live function the orchestrator's `if (a.isLowIE())`
     branch can call.
   - **On modern browsers** (Chrome 146 in this HAR — the fall-through
     branch): vm-slide builds the descriptor `[<state>, "proxyXHR"]`,
     invokes it with one argument via `OP_02 1` at pc 19662, and then
     `OP_06 20070` skips the entire `getVData` install block. The
     `proxyXHR` routine monkey-patches `XMLHttpRequest.prototype.send`
     / `open` (the string `"XMLHttpRequest"` appears 5× inside the
     vm-slide bytecode, with `"send"`/`"open"` references at pcs
     20154..20671), so **every subsequent XHR made from the page is
     intercepted**. In particular the orchestrator's later verify POST
     is intercepted and has `vData=<ciphertext>` injected into its
     body before the underlying `send()` completes. See §6 `vData` for
     the full resolution and
     `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` for the trace.
   - Either way, module 71 still tolerates absence of `window.vm.entry`
     (it is a separate binding not covered by either branch in this
     HAR, consistent with `vmByteCode` being empty).
8. **slide-jy.js runs** (HAR 4 — jQuery 1.11.3 in the desktop HAR).
   `window.$` is assigned. Module 64's `f()` observes it and calls `n(56)()`.
9. **Module 56 init** (FLOW.md §4.3): `l.tdc.link(v)`, `l.vm.init()` (no-op
   when `vmByteCode` is empty), PoW WebWorker warm-up (skipped when `powCfg`
   is absent), DOM click-handler wiring, then `N()` paints the initial UI
   state. `N()` installs the slide-drag handler via module 67 and loads the
   slide background + thumb via module 68's image loader
   (`/cap_union_new_getcapbysig?aid=...&sess=...&sid=...&img_index=1|2`, or
   `/hycdn?...` when `iscdn=1`). `U()` then arms `z.movable(true)`.
10. **User drags the slide.** Module 67 tracks up to 300 samples, computes
    per-step deltas, and fires the drag-release callback from module 56 with
    `(dropXY, targetIdx, coordArray)`.
11. **Drag-release → verify POST** (FLOW.md §4.4):
    - `l.tdc.setData({coordinate:[bgX, bgY, rate]})`.
    - Awaits three fences: PoW (skipped), slide coordinates (already present),
      `l.vm.run(cb)` (instant no-op returning `{vlg:"0_0_1"}` when the
      stack VM is not armed).
    - `u()` assembles `d = a.queryMap()` plus the 13-field write block
      described in §4 of this doc.
    - `$.ajax({ type:"POST", url:"/cap_union_new_verify", data:d,
      timeout:15000, dataType:"json", success, error })` (HAR 6).
12. **Server response** (HAR 6). `200 { errorCode:"0", randstr:"@Ucm",
    ticket:"t03tserver...", errMessage:"", sess:"" }`. Module 56's success
    handler unconditionally rotates `sess` (`e.sess && w(e.sess)`, where
    `w = n(30).updateSession`), then switches on `parseInt(e.errorCode, 10)`.
    On `0` it calls `s.verifySuccess({ticket, randstr})` (module 45), which
    posts `{type:3, ticket, randstr, errorCode, errorMessage, ret}` to the
    parent frame via `postMessage` — **the parent page receives the ticket
    through a `message` event, not as an HTTP response**.

---

## 3. Orchestrator core — module 56

Module 56 is the orchestrator. 8,045 bytes, 21 outgoing require edges:
`[0, 1, 3, 10, 30, 37, 39, 40, 41, 45, 46, 47, 48, 58, 59, 67, 68, 70, 74,
75, 109]`. It statically exports nothing via `exports.<name>` — it ends with
`e.exports = function() { ... }`, a default-exported zero-argument function
that is invoked by module 64 as `n(56)()` after `window.$` is ready (once on
mobile with Zepto, once on desktop after jQuery is fetched).

### 3.1 Top-of-module wiring

FLOW.md §4.1 reads the first ~350 bytes of module 56 and resolves all 21
`require` edges to the short aliases used in the rest of the module:

| alias | `require` | role |
|------|-----------|------|
| `r`  | `window.timing`           | show-page inline timing object |
| `i`  | `n(41)`                   | i18n caption table (see §8) |
| `a`  | `n(30)`                   | URL query + sess cache |
| `o`  | `n(67)`                   | slide drag handler |
| `s`  | `n(45)`                   | `postMessage` to parent frame |
| `c`  | `n(68)`                   | image loader (slide bg + thumb) |
| `u`  | `n(40)`                   | platform / config helper |
| `l`  | `n(70)`                   | `{vm, tdc, challenge}` barrel (modules 71 / 38 / 72) |
| `d`  | `n(74)`                   | TuCao feedback |
| `f`  | `n(0).addUrlParam`        | URL param helper |
| `p`  | `n(46)`                   | rem / dpr layout helper |
| `h`  | `n(39)`                   | subsid helper |
| `m`  | `n(59)`                   | DOM status / shake / loading |
| `g`  | `n(58)`                   | caplog reporter |
| `v`  | `n(37)`                   | `cap_monitor` reporter |
| `b`  | `n(47)`                   | cached DOM refs |
| `w`  | `n(30).updateSession`     | sess rotation |
| `y`  | `n(48).default`           | PoW WebWorker wrapper |
| `k`  | `n(10).getErrorRes`       | error-result fabrication |
| `x`  | `n(3)`                    | URL helpers (`getHref`, `getQueryParam`) |
| `S`  | `n(1).isTouchEventSupported` | pointer-type probe |

Then `_ = window.captchaConfig`, `E = l.tdc`, and the three critical
pass-through aliases that define the transport-only behaviour for the two
register-VM tokens:

```js
T = E.setData;   // -> window.TDC.setData
C = E.getData;   // -> window.TDC.getData(true)
R = E.getEks;    // -> (window.TDC.getInfo() || {}).info
```

`E.setData` / `E.getData` / `E.getEks` are thin wrappers defined in module 38
(the "tdc adapter"), which is re-exported through the module 70 barrel.
Module 56 never computes `collect` or `eks` itself — it reads them off the
`window.TDC` surface installed by `tdc.js` and places them on the verify-body
dictionary.

### 3.2 Fan-out subgraph by role

From FLOW.md §4.2, the 21 outgoing edges of module 56 group as:

- **Verify-body feeders**: 38 (tdc), 70 ({vm, tdc, challenge} barrel), 71 (vm
  adapter), 72 (PoW challenge), 30 (sess + queryMap), 67 (drag coords), 48
  (PoW WebWorker), 73 (md5), 74 (feedback payload), 39 (subsid).
- **Network loops**: jQuery or Zepto `$.ajax` from `window.$`, 58 (caplog
  reporter), 37 (`cap_monitor` reporter — distinct from caplog), 10 (error
  ticket fabrication on triple-failure), 59 (DOM error-note display), 68
  (image loader for slide + background).
- **Utility / DOM**: 41 (i18n captions), 47 (cached DOM refs), 45 (postMessage
  to parent frame), 46 (flexible rem / dpr), 40 (platform / config helper),
  75 (TCSDK android open-link shim), 109 (empty side-effect module).
- **URL helpers**: 0 (re-exports of 1/2/3/4/13/14/15), 1
  (`isTouchEventSupported`), 3 (`getHref` / `getQueryParam` / `addUrlParam`).

### 3.3 DoD keyword write sites inside module 56

Each Track 2 DoD keyword appears **exactly once** textually inside module 56's
byte range. Transcribed from FLOW.md §4.2:

| keyword    | role in module 56                                                                                                                        |
|------------|------------------------------------------------------------------------------------------------------------------------------------------|
| `vData`    | Write: `e.vData = o` inside the `if (a.isLowIE())` guarded block — this path runs **only on IE9 and below**. On modern browsers the orchestrator never writes this field; vm-slide's XHR proxy injects `vData=<ciphertext>` into the POST body before `send()` completes. See §6 for the full resolution. |
| `collect`  | Write: `e[_.collectdata] = decodeURIComponent(C())`, where `_.collectdata === "collect"` in the HAR. `C = E.getData` → `window.TDC.getData(true)`. |
| `eks`      | Write: `d.eks = R()`. `R = E.getEks` → `(window.TDC.getInfo() \|\| {}).info`.                                                            |
| `nonce`    | Read: `_.nonce` (`window.captchaConfig.nonce`). Write: `_.nonce && (d.nonce = _.nonce)`. Module 56 never mutates it.                     |
| `sess`     | Write: indirect via `w(e.sess)` where `w = n(30).updateSession`, on both the `/cap_union_new_getsig` success handler (`n && w(n)`) and the `/cap_union_new_verify` success handler (`e.sess && w(e.sess)`). |
| `sig=`     | Appears only as the literal suffix inside `d.vsig = _.vsig; d.websig = _.websig;` — both `vsig` and `websig` end in `sig`. There is **no** free-floating `sig=` field in the POST body. |
| `cap_union`| Three URLs: `/cap_union_new_verify` (POST), `/cap_union_new_getsig` (POST), and `/cap_union_new_getcapbysig` (indirectly via module 40's `cgiImg`). |

### 3.4 The verify-POST IIFE

FLOW.md §4.4 reads the drag-release body verbatim. On drag-release, module 56
runs (faithful simplification of the byte range):

```js
z.movable(false);
var iSlide = b.imgSlide.offset();
var oBg    = b.imgBg.offset();
var c = [{
  left: Math.floor((iSlide.left - b.operation.offset().left) / _.rate),
  top:  Math.floor(parseInt(_.spt, 10))
}];
l.tdc.setData({
  coordinate: [Math.ceil(oBg.left), Math.ceil(oBg.top), Number(_.rate.toFixed(4))]
});
// then an inner function(e, t, n) { ... }(c, t, n)
```

The inner function awaits three independent sub-results before firing
`$.ajax`:

1. **PoW fence**. If `I = captchaConfig.powCfg.md5 && .nonce` is truthy, run
   `j.run(P, cb)` (module 48 WebWorker, falling back to module 52 sync
   `getWorkloadResult`). Otherwise set `c |= 1` and `M.ans = ""`.
2. **Slide-drag coordinates**, already supplied via the outer `(e, t, n)`
   params.
3. **`l.vm.run(cb)`**, which calls `a.run(cb)` when `vmAvailable && vmByteCode`
   and otherwise still fires the callback with `{vlg:"0_0_1"}` so the fence
   completes.

When both status bits are set (`c === 3`), the inner `u()` fires. It reads
`var d = a.queryMap()` to seed `d` with the iframe URL's full query string
(the 24 upstream passthrough fields in §5), injects the slide-challenge
counter via
`(function(e, t){ var n = l.challenge(); t.push([0, 0, n]); e.cdata = n })(d, n)`,
writes the drag + metadata fields onto `d`
(`trycnt`, `refreshcnt`, `slideValue`, `dragobj`, `ans`, `vsig`, `websig`,
`subcapclass`, `pow_answer`, `pow_calc_time`, `collect`/`tlg` pair,
`asig`/`buid` only for `_.curenv !== "inner"`, `fpinfo`, `eks`, `nonce`),
merges the `vm.run` result via `$.extend(d, o)` (contributing `vlg`), runs
the `isLowIE()`-guarded `window.getVData` block (§6), and finally fires
`$.ajax({ type:"POST", url:"/cap_union_new_verify", data:d, timeout:15000,
dataType:"json", success, error })`.

### 3.5 The refresh (`q`) / getsig loop

On `errorCode === 9` (wrong answer) or any other soft-retryable branch,
module 56 calls `q()`. Guarded by an in-flight flag `V`, `q()` clears tdc
data, re-inits vm, optionally triggers `l.tdc.retryLoad(v)` (which uses
**module 66** — a second script loader — to re-fetch `tdc.js`, not module 8),
and POSTs the iframe URL query (via `a.getQuery(true)`, minus the old `rand`
and plus a new one) to `/cap_union_new_getsig`. The response rotates `sess`,
`vsig`, `capChallenge`, `cdnPic1`/`cdnPic2`/`iscdn`, and the slide drop
position `_.spt = e.inity`; module 68 reloads the background and thumb; and
`U()` re-arms the drag handler. If `e.ret === 52`, the path short-circuits
to `s.frequencyLimit()` (postMessage type 11 to parent). Errors report to
`cap_monitor` via module 37 as `ERROR_TYPE_AJAX_GETSIG = 9`.

---

## 4. Verify POST assembly

The orchestrator POSTs a single `application/x-www-form-urlencoded` request
to `/cap_union_new_verify`. The body has 39 fields. Of these:

- **24 fields are upstream query passthroughs** — copied verbatim from the
  show-page iframe URL query via `a.queryMap()` (module 30).
- **15 fields are written inside the orchestrator** — 13 by module 56 itself
  (inside the inner `u()` function described in §3.4), one by module 30
  (`sess`, via the module-private cache that `queryMap()` copies from), and
  one by module 71 (`vlg`, merged in by `$.extend(d, o)`).

The successful response shape in the HAR is
`{ errorCode, randstr, ticket, errMessage, sess }` (HAR 6). On `errorCode
=== 0` module 56 forwards `{ticket, randstr}` to the parent frame via module
45 (§7).

The full per-field origination table is in §5.

---

## 5. Verify POST origination table

Source: `output/captcha-orchestrator/verify-body-origination.json` — 39 rows,
zero leftover HAR fields. Each row records `{name, sample_value_prefix,
sample_value_length, origin_module, origin_lines, assembly_method,
provenance}`. Sample values are truncated to roughly 60 characters with `…`;
provenance is summarised to one sentence per row. Line numbers under `Lines`
are `{line, startCol, endCol}` relative to the single-line bundle.

### 5.1 Upstream query passthroughs (24 fields)

Every field in this group is copied verbatim from the show-page iframe URL
query into `d` by `a.queryMap()` (module 30, line 1 of the bundle). The
iframe URL query was itself populated by the show-page server.

| Field | Sample (HAR) | Origin | Assembly | Provenance |
|-------|--------------|--------|----------|------------|
| `aid` | `2046626881` | upstream | `queryMap()` | show-URL query passthrough. |
| `protocol` | `https` | upstream | `queryMap()` | show-URL query passthrough. |
| `accver` | `1` | upstream | `queryMap()` | show-URL query passthrough. |
| `showtype` | `popup` | upstream | `queryMap()` | show-URL query passthrough. |
| `ua` | `TW96aWxsYS81LjAgKFdpbmRvd3MgTlQgMTAuMDsgV2luNjQ7IHg2NCkgQXBw…` | upstream | `queryMap()` | show-URL query passthrough; server-collected at show time, not re-derived by the orchestrator. |
| `noheader` | `1` | upstream | `queryMap()` | show-URL query passthrough. |
| `fb` | `1` | upstream | `queryMap()` | show-URL query passthrough. |
| `aged` | `0` | upstream | `queryMap()` | show-URL query passthrough. |
| `enableAged` | `0` | upstream | `queryMap()` | show-URL query passthrough. |
| `enableDarkMode` | `0` | upstream | `queryMap()` | show-URL query passthrough. |
| `grayscale` | `1` | upstream | `queryMap()` | show-URL query passthrough. |
| `dyeid` | `0` | upstream | `queryMap()` | show-URL query passthrough. |
| `clientype` | `2` | upstream | `queryMap()` | show-URL query passthrough. |
| `fwidth` | `0` | upstream | `queryMap()` | show-URL query passthrough. |
| `sid` | `7446039806946242560` | upstream | `queryMap()` | show-URL query passthrough. |
| `wxLang` | *(empty)* | upstream | `queryMap()` | show-URL query passthrough. |
| `tcScale` | `1` | upstream | `queryMap()` | show-URL query passthrough. |
| `uid` | *(empty)* | upstream | `queryMap()` | show-URL query passthrough. |
| `cap_cd` | *(empty)* | upstream | `queryMap()` | show-URL query passthrough. |
| `rnd` | `482076` | upstream | `queryMap()` | show-URL query passthrough. |
| `prehandleLoadTime` | `154` | upstream | `queryMap()` | show-URL query passthrough. |
| `createIframeStart` | `1775274230429` | upstream | `queryMap()` | show-URL query passthrough. |
| `global` | `0` | upstream | `queryMap()` | show-URL query passthrough. |
| `subsid` | `10` | upstream | `queryMap()` | show-URL query passthrough. |

### 5.2 Orchestrator-computed fields (15 fields)

| Field | Sample (HAR) | Origin | Assembly | Provenance |
|-------|--------------|--------|----------|------------|
| `sess` | `s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79sPMuyqb5noaX6jB_lzSqX…` | mod 30 (`updateSession`, line 1 col 72222–72235) | Server-baked in prehandle JSONP, carried in the iframe URL `?sess=`, rotated by `/cap_union_new_getsig` responses via `updateSession()`. | Module 30 caches `sess` in a module-private slot, seeds it from `window.captchaConfig.sess`, exposes `queryMap()` that copies it into `d`, and exposes `updateSession()` which module 56 calls from the getsig + verify success handlers (`e.sess && w(e.sess)`) to rotate the value mid-session. |
| `cdata` | `0` | mod 56 (line 1 col 162440–162449) | `(function(e,t,n){ ... e.cdata = n })(d, n)` using `l.challenge()` from module 72. | Module 72 (md5 from `n(73)`) brute-forces a PoW challenge (`randstr \|\| n` for `n < M`) when `window.captchaConfig.capChallenge` is populated; returns the counter as a number. Module 56 stores it in `d.cdata`. Zero in this HAR because `capChallenge` is unset. |
| `ans` | `484,46;` | mod 56 (line 1 col 162512–162519) | `d.ans = c` after concatenating the slide-drag coord string `c`. | Built by iterating the per-step coordinate array produced by the slide drag handler (module 67) and concatenating `Math.floor(left) + "," + Math.floor(top) + ";"` for each point. In the HAR this reduces to a single `484,46;` — one coarse-grained drop point. |
| `vsig` | *(empty)* | mod 56 (line 1 col 162520–162533) | `d.vsig = _.vsig` reading `window.captchaConfig.vsig`. | Server-provided per-challenge token carried in `captchaConfig` and refreshed by `/cap_union_new_getsig` responses (`t && (_.vsig = t)`). Empty in this HAR. |
| `websig` | *(empty)* | mod 56 (line 1 col 162534–162551) | `d.websig = _.websig` reading `window.captchaConfig.websig`. | Server-baked in the show-page `captchaConfig` block. Empty in this HAR. |
| `subcapclass` | *(empty)* | mod 56 (line 1 col 162552–162579) | `d.subcapclass = _.subcapclass`. | Server-baked in `captchaConfig`. The prehandle JSONP returned `subcapclass:"15"` but the show-URL query drops the field; probably benign (server knows what class it serves). |
| `pow_answer` | *(empty)* | mod 56 (line 1 col 162580–162593) | `d.pow_answer = P.nonce + M.ans` from the WebWorker PoW result. | When `captchaConfig.powCfg.md5` and `.prefix` are present, module 56 runs a WebWorker (module 48 → worker in module 49 → hash in module 52) to brute-force an md5 prefix. Empty in this HAR because `powCfg` is absent. |
| `pow_calc_time` | `0` | mod 56 (line 1 col 162653–162679) | `d.pow_calc_time = M.duration`. | Duration (ms) of the PoW WebWorker run. Zero in this HAR. |
| `collect` | `7kNjUPia0j76nra/Tpik+hZK9DftzSpurs2y2OKR3MO4Fq1Cuqw2pvk9vKmx…` (8128 chars) | mod 56 (line 1 col 162692–162732) | `e[_.collectdata] = decodeURIComponent(C())` using `tdc.getData()` from module 38 / 70. | Module 38 wraps `window.TDC.getData(true)` (tdc.js register-VM output); module 70 re-exports it as `tdc.getData`; module 56 reads it through `C = E.getData` and URL-decodes into the field whose name is `_.collectdata` (`"collect"` in this HAR). Same token as `docs/TOKEN_FORMAT.md`. |
| `tlg` | `8128` | mod 56 (line 1 col 162733–162762) | `e.tlg = e[_.collectdata].length`. | Length in characters of the URL-decoded collect-token string — a cheap client-side integrity tag. |
| `fpinfo` | *(empty)* | mod 56 (line 1 col 162823–162833) | `d.fpinfo = i` inside the `vm.run` callback. | In the `vm.run` completion handler module 56 receives per-drag fingerprint data as `i` and stores it on `d.fpinfo`. Empty in this HAR because vm is not armed (`vmAvailable` empty, `vmByteCode` empty). |
| `eks` | `+dIC7DOymyJE6Xf1wlsyPi7PrW+JPX8NXGBs23csIVcQkvBvn9mjSBDJvqyS…` (312 chars) | mod 56 (line 1 col 162834–162843) | `d.eks = R()` calling `tdc.getEks()` from module 38 / 70. | Module 38 exposes `getEks: function(){ return (window.TDC.getInfo() \|\| {}).info \|\| ""; }`; module 70 re-exports it as `tdc.getEks`; module 56 reads it via `R = E.getEks`. This is exactly the `eks` string server-baked into `tdc.js` line 123 and surfaced through `TDC.getInfo().info`, consistent with `docs/EKS_FORMAT.md`. |
| `nonce` | `eda1152f11f1daf0` | mod 56 (line 1 col 162854–162869) | `_.nonce && (d.nonce = _.nonce)`. | Module 56 reads `window.captchaConfig.nonce`, server-baked in the show-page HTML alongside `sess`. The orchestrator never mutates it. |
| `vlg` | `0_0_1` | mod 71 (line 1 col 179149–179155) | `t.vlg = [vmAvailable?1:0, vmByteCode?1:0, 1].join("_")`, merged into `d` via `$.extend(d, o)` in module 56. | Three-digit availability signal for the stack-VM integration. Both flags are `0` in this HAR because `captchaConfig.vmAvailable` and `captchaConfig.vmByteCode` are empty strings. |
| `vData` | `7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4…` (152 chars) | vm-slide XHR proxy (bytecode pcs ~15000–20700) injects the field into the POST body before `send()` completes — the orchestrator itself never writes `d.vData` on Chrome. | Chrome path: vm-slide's `proxyXHR` (called at bytecode pc 19662) installs an `XMLHttpRequest.prototype` monkey-patch that encrypts payload data via modified XTEA (delta `0x9E3779B9` at bytecode[15352]/[15530]) + a custom 64-char base64 alphabet at bytecode pc 16932 (`GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` — contains `-_*`) and injects the result as `vData=<ciphertext>` into the outgoing body. IE9 fallback: vm-slide installs `window.getVData` at pc 20066 on the `isIE9Below()` branch, and the orchestrator's `if (a.isLowIE())` block writes `e.vData = window.getVData(n.join("&"))` directly. Resolved Phase 42; see §6 and `research/vm-slide-stack-vm/{VDATA-TRACE,VDATA-RESOLUTION}.md`. |

---

## 6. Critical fields in detail

Short narratives for each Track 2 DoD field, pulling the evidence together
from §3 and §5.

### `collect`

**Module 56 is transport-only for `collect`.** The token is composed entirely
by the register-VM `tdc.js`; module 56 reads it off `window.TDC` via
`C = E.getData` (`= window.TDC.getData(true)` through module 38) and writes
it to `e[_.collectdata]` after URL-decoding. The field name is chosen by the
server through `captchaConfig.collectdata` — `"collect"` in the HAR. See
`docs/TOKEN_FORMAT.md` for the token structure (header / hash / cdBody / sig
segments, modified XTEA encryption, 59 collector fields). FLOW.md §4.2 +
origination row.

### `eks`

**Module 56 is transport-only for `eks`.** Read via `R = E.getEks`
(`= (window.TDC.getInfo() || {}).info` through module 38) and written to
`d.eks`. `eks` is server-baked into `tdc.js` around line 123 and surfaced
through `TDC.getInfo().info`; the orchestrator does not derive a different
"eks for slide" value. See `docs/EKS_FORMAT.md`. FLOW.md §4.2 + origination
row.

### `vData`

> **For the byte-level cipher specification (XTEA key, alphabet, padding scheme, worked example, public API), see `docs/VDATA_FORMAT.md` — the authoritative Phase 43 doc.** This section covers only where `vData` enters the verify POST and how vm-slide installs the XHR proxy that calls the cipher; the cipher itself moved to `VDATA_FORMAT.md` when the standalone `tools/vdata-generator/` encoder shipped (Phase 43, 2026-04-13).

**Resolved in Phase 42** via static decode of the `vm-slide.e201876f.enc.js`
stack-VM bytecode. The orchestrator's `if (a.isLowIE()) { var o =
window.getVData && window.getVData(n.join("&")); o && (e.vData = o) }` block
is not the primary path — it's the IE9-only fallback. On modern browsers
`vData` arrives via a different mechanism installed by vm-slide itself.
`research/vm-slide-stack-vm/VDATA-TRACE.md` (task 42.1) and
`research/vm-slide-stack-vm/VDATA-RESOLUTION.md` (task 42.2) document the
static trace in full; the summary:

**Two mutually exclusive paths, gated inside vm-slide at bytecode pc 19636**.
Early in vm-slide's outer initializer (`OP_60 19666` at pc 19636),
`<state>.isIE9Below()` is called. On the truthy result the VM takes the
install branch; on the falsy result it falls through to the proxy branch.
The two branches are joined at pc 20070 and nothing from the install block
is reachable on the fall-through path.

- **Chrome path (the HAR)** — fall-through at pc 19638. vm-slide builds
  the descriptor `[<state>, "proxyXHR"]` via `OP_47 5` → `OP_04 (OP_10)* OP_59`
  (`"proxyXHR"` at pc 19641) and invokes it with one argument (`OP_00 3`
  then `OP_02 1` at pc 19662). The `proxyXHR` routine installs an
  `XMLHttpRequest.prototype` monkey-patch (the string `"XMLHttpRequest"`
  appears 5× at bytecode pcs 20154 / 20220 / 20290 / 20476 / 20621, with
  `"send"` at 20204/20526/20671 and `"open"` at 20270/20340). The patched
  `send` intercepts the orchestrator's later `/cap_union_new_verify` POST
  and appends `&vData=<ciphertext>` onto the outgoing body before forwarding
  to the real `XMLHttpRequest.prototype.send`. The `&vData=` literal is
  built inside vm-slide bytecode at pcs **24211..24223** (`OP_10 38 118 68
  97 116 97 61`), inside the enclosing function that contains pc 24210 —
  see `research/captcha-orchestrator/PLAINTEXT-BUILD-ORIGIN.md` §"Build-
  site identification" for the full decompile of the open-hook (fn 20353
  at pcs 20353..20462, which guards on URL `== "/cap_union_new_verify"`
  at pc 20424 and captures `this` as the verify XHR instance) and the
  send-hook body-rewrite chain. `OP_06 20070` at pc 19663 then skips the
  entire `getVData` install block. On this path `window.getVData` is
  **never installed**, so the orchestrator's `if (a.isLowIE())` guard
  evaluates false and module 56 never writes `d.vData` itself — the field
  materializes inside the proxy.
- **IE9 fallback** — jump-target branch at pc 19666. vm-slide builds the
  descriptor `[window, "getVData"]` (build `"window"` at pc 19667, `OP_32`
  at 19680 to form `[U, "window"]`, build `"getVData"` at pc 19681, `OP_41`
  at 19698 to yield `[window, "getVData"]`), then `OP_06 20059` jumps over
  the inline function body to `OP_58 19702 1 1 8 3 3` at pc 20059 — a
  FUNC_CREATE that captures one upvalue and declares one string argument
  whose body lives at bytecode pcs `[19702, 20058]` (216 instructions, two
  `OP_16` exits at 20033 and 20058). `OP_24` at pc 20066 then assigns the
  closure into `window["getVData"]`. On this path the orchestrator's
  `if (a.isLowIE())` guard is true and module 56 explicitly calls
  `window.getVData(n.join("&"))` and assigns the return value to
  `e.vData`. The installed function internally branches on
  `document.documentMode`, uses `new RegExp("vData=")` as a recursion guard,
  and splits the input query string on `"&"` and `"="` before emitting the
  ciphertext.

**Crypto** (summary — full spec in `docs/VDATA_FORMAT.md`). The cipher that produces the 152-char HAR value lives in
vm-slide, outside the `getVData` function body. **Phase 43 closed-form result**: classical XTEA (32 rounds, delta `0x9E3779B9`, LE uint32 packing, 16-byte key `2e430f8c15b7da96`) followed by standard base64 with a custom 65-char alphabet where index 64 (`Y`) is the padding character. Pipeline = 14 × 8-byte XTEA blocks (= 112 bytes plaintext) → 152 chars of base64 ending in `YY`. **Phase 43.2 correction**: earlier notes claimed a "constant 2-byte trailer `10 40`" — that was a phantom from mis-decoding the trailing `YY` padding chars as raw 6-bit values (`(64<<6)|64 = 0x1040`). There is no trailer; the encoder input is 112 bytes flat. Static evidence from
`research/vm-slide-stack-vm/VDATA-RESOLUTION.md`:

- The **XTEA delta** `0x9E3779B9` (= 2654435769) appears as `OP_08`
  immediate operands at bytecode indices **15352** and **15530** —
  positionally consistent with encrypt and decrypt routines of a classical
  32-round XTEA.
- A **custom 64-character base64 alphabet**
  `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` is
  pre-baked as a string constant at bytecode pc 16932. The alphabet uses
  `-`, `_`, `*` as its three non-alphanumeric members — matching the exact
  special characters observed in the HAR value.
- A **char-set validation regex** `[^A-Za-z0-9\-\_\*]` lives at pc 17677.
- **HAR value verification**: every character in the full 152-char HAR
  `vData` value
  (`7MjK5yGovGjw1scdQ6-F-LXDV2iAI0b*5ONmLZ4uWoVzJMDN5MvSSrMxILt4lsXbEguCZ7eZtjCMfbg9*wbiQoH_4-hrxaM7THpUbbQuqIfPi5vl549PdPPu64P-GnmSuAKqlxUcL9yFjBMA5RsJRiYY`)
  is a member of that alphabet. Zero outliers. This is conclusive static
  evidence that vm-slide's alphabet produces the observed value.

**Why `window.getVData` is the only `window.*` property vm-slide installs**.
Task 42.2 ran a full-bytecode enumeration of `[window, <key>] + FUNC_CREATE
+ OP_24` property-set patterns (`research/vm-slide-stack-vm/vdata-provenance.js`
→ `output/vm-slide/window-installs.json`). Exactly one entry: `getVData`.
vm-slide does not expose a second global for the crypto — the XHR proxy
keeps everything inside a closure.

**What's now resolved** (Phase 43, 2026-04-13). The XTEA key is `2e430f8c15b7da96`; the cipher is classical (not modified) XTEA with LE uint32 packing; the alphabet is 65 chars with `Y` as the padding char; byte-identical reproducibility for the cipher half is achieved by `tools/vdata-generator/` against both a synthetic jsdom fixture and a real Chrome 146 HAR capture — see `docs/VDATA_FORMAT.md` for the full spec and `tests/test-vdata-generator-encoder.js` for the test coverage.

**What's now resolved — plaintext half** (Phase 44, 2026-04-15). The 112-byte pre-cipher plaintext is NOT a reduction of the caller's 9345-byte POST body. It is a fresh **8-field tdc runtime-state probe** built inside `fn 22317 = module.exports.getCaptchaData` (webpack module fn 20970, exported at bytecode pc 24252, FUNC_CREATE at pc 24234, body `[22317..24233]`). The field schema is fixed: `{tp, key, py, env, version, cLod, inf, ss}`. Five fields are built inline (`py` = `arguments[1].py`, `env` = `require(0)() ? '0' : '1'`, `version` = literal `"2"`, `cLod` = TDC lifecycle probe, `inf` = `window===window.top?'top':'iframe'`); three delegate to helpers (`tp` = fn 22400 captures a JS runtime error string, `key` = fn 22730 via `require(18)(body,'tlg')` char-lookup digest of `arguments[0]`, `ss` = fn 23399). See `docs/VDATA_FORMAT.md` §7 for the full per-field table, source rules, and the `tools/vdata-generator/` `replay` + `from-obj` public API.

**Live Chrome call chain, end-to-end** (Phase 44.2.8):

```
vm-slide internal orchestrator (fn 19604, INSIDE vm-slide — not in this bundle)
  → init(getCaptchaData)                                          # fn 22317 passed as the arg
  → require(44).proxyXHR(getCaptchaData)            pc 19661
  → fn 20140 (proxyXHR) binds getCaptchaData as slot 3
  → fn 20539 FUNC_CREATE pc 20797 captures slot 3 as inner slot 8
  → fn 20539 installed onto XHR.prototype.send      pc 20808 (OP_24)
  → fn 20353 .open wrapper installed                pc 20473 (guards on URL == "/cap_union_new_verify")
  [later, on the verify POST send:]
  → fn 20539 runs with body = arguments[0]         (9345-byte urlencoded POST body)
  → fn 20539 pc 20749 OP_66 2 calls slot8(body, {py})  = fn 22317(body, {py})
  → fn 22317 builds the 8-field tdc-runtime-state probe, shuffles the order
      via fn 23898's Math.random() > 0.5 ? -1 : 1 comparator (pc 23949),
      pads + ShiftRows-permutes + XTEA-encrypts + base64-encodes → 152-char vData
  → fn 20539 body-appends &vData=<152 chars>        pc 20751
  → fn 20539 calls savedSend.call(this, rewritten_body)
      final body: 9504 = 9345 + 7 ("&vData=") + 152
```

The important mental-model correction: **`getCaptchaData` is defined and bound inside vm-slide itself, not in `t_captcha_slide.js`**. `sample/t_captcha_slide.js` contains zero references to `getCaptchaData`, `CaptchaData`, `TENCENT_CHAOS`, etc. (confirmed by `research/captcha-orchestrator/GETCAPTCHADATA-CALLSITE.md`). The orchestrator bundle's only vData-related code is the `if (a.isLowIE())` IIFE at bytes 162929..163108 that calls `window.getVData` on the IE9 fallback path — on modern browsers this is a no-op, and the Chrome path is entirely driven by vm-slide's internal `fn 19604 → init → proxyXHR(fn 22317) → fn 20539 XHR.send patch → fn 22317 kv build + encrypt` chain described above.

**Historical correction note.** An earlier draft of this section (pre-Phase 44) stated that the 112-byte plaintext is "a canonical reduction of the caller-supplied verify body (`arguments[0]`)". That was incorrect. `arguments[0]` is read by fn 22317 only as an input to the `key` digest helper (fn 22730 → `require(18)(body,'tlg')`); the other 7 fields are independent runtime-state probes with no dependence on the POST body at all. The `tp` field is a JS runtime error string captured at page load, not a field derived from the body. The `&vData=` literal at bytecode pcs 24211..24223 lives inside **fn 22317**, not inside a separate "send replacement" function at pc 24210. See `research/vm-slide-stack-vm/FN-20539-SLOT8-HOP.md` for the pc-level reconciliation of this misreading.

### `nonce`

Server-baked in the show-page inline `window.captchaConfig.nonce`. Module 56
reads it (`_.nonce`) and passes it through unchanged to `d.nonce`. In this
HAR: `eda1152f11f1daf0`. Module 56 never mutates it. FLOW.md §6 step 3 +
origination row.

### `sess`

Server-baked in `captchaConfig.sess` (itself seeded from the prehandle JSONP
response and then potentially rotated by the show-page server), cached
module-private inside module 30, and copied into `d` by `a.queryMap()`. It
is **rotated mid-session** by module 30's `updateSession` (aliased as `w`
inside module 56), which is called on both the `/cap_union_new_verify` and
`/cap_union_new_getsig` success responses: `e.sess && w(e.sess)` in the
verify handler and `n && w(n)` in the getsig handler. FLOW.md §4.2 + §4.6.

### `vsig` and `websig` (the DoD `sig` keyword)

There is **no free-floating `sig=` field** in the verify body. The DoD
keyword `sig` resolves to two separate fields that both end in `sig`:

- **`vsig`** — read from `window.captchaConfig.vsig`; refreshed by
  `/cap_union_new_getsig` responses (`t && (_.vsig = t)`). Empty in this HAR.
- **`websig`** — read from `window.captchaConfig.websig`; server-baked in
  the show-page `captchaConfig` block. Empty in this HAR.

FLOW.md §4.2 `sig=` row + origination rows.

### Briefly: the two PoW subsystems

- **`cdata` + `ans`** (slide-side PoW, module 72): a client-side md5 brute
  force via `$.challenge()` (module 72 uses md5 from `n(73)`) over `randstr`
  and `capChallenge`. Returns `0` and leaves `cdata=0` when `capChallenge`
  is unset, which is the HAR state. The counter is also pushed into the
  drag coordinate array as `[0, 0, n]`, so it ends up inside `ans=`
  alongside the real drag coordinates.
- **`pow_answer` + `pow_calc_time`** (WebWorker PoW, module 48): a **separate**
  md5 PoW run in a WebWorker via module 48 → worker module 49 → hash module
  52, driven by `captchaConfig.powCfg = {md5, prefix}`. Empty in this HAR
  because `powCfg` is unset. This is distinct from the `$.challenge()` loop
  above; both can coexist.

---

## 7. Ticket return via `postMessage`

On `errorCode === 0`, module 56's verify success handler first unconditionally
rotates `sess` (`e.sess && w(e.sess)`), then calls
`m.showSuccess(z.dragDuration, () => s.verifySuccess({ticket: e.ticket,
randstr: e.randstr}))`. Module 45's `verifySuccess` serialises
`{type:3, ticket, randstr, errorCode, errorMessage, ret}` and invokes
`o.targets.parent.send(JSON.stringify(...))`, i.e. the **ticket is delivered
to the parent page via `window.postMessage`**, not as an HTTP response. The
parent page's own `message` event listener consumes the ticket.

Module 56 distinguishes the following non-zero error codes (FLOW.md §4.6):

- **9** — wrong answer: show `puzzle8` cover, shake, call `q()` (refresh /
  getsig loop, §3.5).
- **12** — soft fail: show `puzzle9` cover with refresh hook `q`. Consistent
  with `docs/ERRORCODE_12_INVESTIGATION.md`.
- **16 / 20 / 21** — session expired: `s.sessionTimeout()` (postMessage
  type 12 to parent).
- **30 / 51** — hybrid verify handoff: `s.hybridVerify(e.sess, h.get())`
  (postMessage type 8 with `sess` + `subsid`).
- **50** — position out of tolerance: shake + `z.moveBack(true)`.
- **52** — appid region wrong: show `appid-region-wrong` cover error.
- **default** — show `c23` ("unknown error") cover error with the raw
  `errorCode` embedded.

Caplog event 27 (`verify` timing) is pushed and sent by module 58 after
every response regardless of outcome.

---

## 8. Known limitations and open questions

- **`vData` runtime binding — mechanism resolved in Phase 42, byte-level
  reproducibility still open.** Phase 42 static-traced vm-slide's bytecode
  and established (a) the Chrome path via an `XMLHttpRequest.prototype`
  monkey-patch installed by `proxyXHR` at pc 19662, (b) the IE9 fallback
  via a direct `window.getVData` install at pc 20066, (c) the modified-XTEA
  + custom-base64 crypto ingredients at bytecode indices 15352 / 15530
  (XTEA delta) and pc 16932 (alphabet). See §6 for the full narrative and
  `research/vm-slide-stack-vm/{VDATA-TRACE,VDATA-RESOLUTION}.md` for the
  static traces. The original FLOW.md §9 Q1 "jQuery `ajaxPrefilter`
  hypothesis" was wrong in its specific hook mechanism but correct about
  the location (vm-slide); the actual hook is on
  `XMLHttpRequest.prototype`, which is why it also works when module 56
  uses Zepto instead of jQuery.
  What is **still open** is byte-level reproducibility: the exact XTEA key
  bytes used for vData (distinct from the register-VM `collect` key), the
  exact plaintext structure being encrypted, and a standalone
  byte-identical vData generator. Track 2's DoD did not require this. If
  pursued, the follow-up would decompile the XHR proxy body (bytecode pcs
  roughly 15000..20700), extract the XTEA key schedule via dynamic
  tracing, and build a standalone generator under `tools/`.
- **Module 41 is the i18n caption table**, not obfuscated opcodes or an
  encoded payload. It is the largest module in the bundle (62,329 bytes,
  29% of the whole) and the 41.4 survey flagged it as the top obfuscation
  risk. The 41.5 15-minute spike (see
  `research/captcha-orchestrator/MODULE-41-NOTES.md`) confirmed it defines
  `i = ["c1".."c23", "puzzle1".."puzzle10", "aged", "appid-region-wrong"]`
  plus a language map `a = { "zh-cn": [...], "en": [...], ... }` and
  exports `u` with `u.init`, `u.get`, `u.initWxLang`, `u.rightToLeft`.
  Module 56 reads captions through `var i = n(41); i.c11; i.puzzle6;
  i.get('aged')`. Not on the critical path for the verify flow; parked.
- **Module 76 is Zepto, `sample/slide-jy.js` is jQuery 1.11.3** — different
  libraries, not the same codebase minified differently. Evidence is in
  `output/captcha-orchestrator/slide-jy-diff.md`: slide-jy.js has an explicit
  `"1.11.3"` version literal, a `noConflict` UMD footer, ~47 `extend`
  occurrences, and no `Zepto` / `ajaxJSONP` tokens; module 76 has a `Zepto`
  literal, exports `ajaxJSONP` (a Zepto-only method), no `noConflict`, no
  `jQuery.fn.init`, no `Sizzle`, and only ~3 `extend` occurrences. Module
  64 picks between them at load time — mobile user agents use
  `window.$ = n(76)` (inline Zepto), desktop user agents fetch
  `/slide-jy.js` via `getScript` and poll for `window.$`.
- **`parse-bundle.js` export extractor does not yet recognize default-export
  forms.** The current extractor only picks up `exports.<name> = ...` and
  `Object.defineProperty(t, ...)`; it misses `e.exports = <Identifier>` and
  `module.exports = <Identifier>`. As a result, several modules (41, 45,
  46, 55, 56, 58, 68, 74) show empty `exports` arrays in `modules.json`
  despite being functional. Non-blocking polish (FLOW.md §9 Q4).
- **`subcapclass` dropped between prehandle and show.** Prehandle JSONP
  returned `subcapclass:"15"`; the show-page URL query omits it and
  `captchaConfig.subcapclass` is `""`, so the verify POST body has
  `subcapclass=`. Probably benign — the server knows what class it is
  serving — but worth noting (FLOW.md §9 Q2).
- **`window.timing` wiring** (FLOW.md §9 Q5). Module 56 reads `r =
  window.timing` as a pre-existing object; it is set up by an inline
  `<script>` at the top of the show-page HTML (HAR 2 response, first ~500
  bytes). Module 58 also consumes it. Not a bundle concern.

---

## 9. Reconciliation with existing docs

FLOW.md §8 is a read-only cross-check against the pre-existing register-VM
documentation. **No contradictions were found.** Each bullet below records a
"consistent with" finding; no edits to the other docs are required.

- **`docs/TOKEN_FORMAT.md`** — consistent. The `collect` field in the verify
  POST is the same token described in `TOKEN_FORMAT.md`: produced by
  `window.TDC.getData(true)` in the register-VM `tdc.js`, URL-encoded on the
  wire, field name set by `captchaConfig.collectdata` (`"collect"` in this
  HAR). The orchestrator only wraps + URL-decodes it; it does not re-encode
  or re-segment. `TOKEN_FORMAT.md` remains the authoritative spec for how
  the token is **built**; this document adds the single anchor for how it
  is **consumed** (`e[_.collectdata] = decodeURIComponent(C())` in module
  56). FLOW.md §8 "No contradiction."
- **`docs/EKS_FORMAT.md`** — consistent. `EKS_FORMAT.md` says `eks` is
  server-baked into `tdc.js` around line 123 and accessible via
  `window.TDC.getInfo().info`. FLOW.md §8 confirms that module 38 defines
  `getEks: function(){ return (l() || {}).info || ""; }` (where `l` wraps
  `window.TDC.getInfo()`) and module 56 reads it via
  `R = n(70).tdc.getEks`. FLOW.md §8 also fills in an unknown noted in
  `EKS_FORMAT.md`: in the slide-CAPTCHA verify path, the `eks` field in
  the POST body **is** the `TDC.getInfo().info` value — the orchestrator
  does not derive a different "eks for slide" value.
- **`docs/HAR_ANALYSIS.md`** — consistent. The endpoint list traced in
  FLOW.md §6 matches `HAR_ANALYSIS.md`'s network flow:
  `cap_union_prehandle` (GET, JSONP), `cap_union_new_show` (GET, HTML),
  `tdc.js` (GET, JS), `tcaptcha-slide.29a33140.js` (GET, JS),
  `vm-slide.e201876f.enc.js` (GET, JS), `cap_union_new_verify` (POST,
  url-encoded, 39 fields, JSON response), and the retry loop via
  `cap_union_new_getsig`.
- **`docs/ERRORCODE_12_INVESTIGATION.md`** — consistent. Module 56 treats
  `errorCode 12` as a soft-retryable failure via `case 12:
  m.showCoverError("puzzle9", null, q, a.queryParam("sid"))`, with no
  special cleanup beyond the `e.sess && w(e.sess)` that runs
  unconditionally before the switch. This matches the investigation's
  finding that 12 is not plain IP rate limiting.
