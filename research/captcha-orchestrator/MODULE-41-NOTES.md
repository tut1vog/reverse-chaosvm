# Module 41 — 15-minute spike (task 41.5 gate 2)

Module 41 is the largest module in `sample/t_captcha_slide.js` at 62,329
bytes (29% of the whole bundle). The task 41.4 structural survey flagged it
as the top obfuscation risk because it has 1 outgoing edge, zero
`exports.<name>` assignments, and was labelled `string-table-candidate` by
the heuristic in `parse-bundle.js`. This note records the 15-minute
bounded spike asked for by task 41.5 gate 2.

## Verbatim — first 600 bytes of the module body

From `modules.json[41].sourceRange = [78330, 140659]`:

```
function(e,t,n){"use strict";var r=n(0).getQueryParam,i=["c1","c2","c3","c4","c5","c6","c7","c8","c9","c10","c11","c12","c13","c14","c15","c16","c17","c18","c19","c20","puzzle1","puzzle2","puzzle3","puzzle4","puzzle5","puzzle6","puzzle7","puzzle8","puzzle9","puzzle10","c21","c22","c23","aged","appid-region-wrong"],a={"zh-cn":["\u70b9\u51fb\u5f00\u59cb\u9a8c\u8bc1","\u5b89\u5168\u9a8c\u8bc1","\u9a8c\u8bc1\u6210\u529f\uff0c\u7cbe\u51c6\u65e0\u654c\u4e86\uff01","\u95ee\u9898\u53cd\u9988","\u6362\u4e00\u5f20\u56fe\u7247","\u9a8c\u8bc1"
```

## Verbatim — last 400 bytes of the module body

```
&(u.c19="\u53cd\u994b"),"ar"!==n&&"he"!==n&&"iw"!==n||(u.rightToLeft=!0),u.currentLanguage=n},u.get=function(e){var t=u[e];if(!t)for(var n=0;n<i.length;n++)if(i[n]===e){t=a.en[n];break}return t||""},u.initWxLang=function(e){try{var t=r("wxLang")||u.langExist(e),n=r("lang");if(o[n])return void u.init(o[n]);t?u.init(t):(t=window.captchaConfig.lang,o[t]?u.init(o[t]):u.init())}catch(i){}},e.exports=u}</nul>
```

## Observations

- **Top** declares a fixed array of string keys — `c1..c23`, `puzzle1..puzzle10`,
  `aged`, `appid-region-wrong`. These are exactly the UI caption keys used
  throughout module 56 (orchestrator core) via `i.c11`, `i.puzzle6`,
  `i.statusFail`, `i.get('aged')`, etc., where `var i = n(41)`.
- **Middle** is an object `a` mapping language codes (`zh-cn`, presumably
  `zh-tw`, `en`, `fr`, `de`, `ja`, `ko`, `ar`, `he`, `iw`, ...) to parallel
  arrays of Chinese/English/... localized strings indexed 1:1 with `i`.
- **Bottom** defines `u.init(lang)` which copies `a[lang]` into `u` by
  name, `u.langExist`, `u.get(key)` with a fall-through to `a.en[...]`,
  and `u.initWxLang()` which looks up the requested language from URL
  query (`wxLang`, `lang`) or `window.captchaConfig.lang`. `u.rightToLeft`
  is set for `ar`/`he`/`iw`. `e.exports = u`.
- Module 41's single outgoing edge (`[0]`) is used only for
  `n(0).getQueryParam` — the URL-query helper from the exported-star
  aggregator module 0. There is **no** opcode dispatch, **no** numeric
  table, **no** base64 / hex-encoded payload, **no** `eval`, **no**
  `Function(` constructor. The byte length is dominated by raw UTF-8
  caption text in ~10 languages.

## Why the 41.4 heuristic mis-tagged it

`parse-bundle.js` currently tags a module `string-table-candidate` when
`stringLiteralCount > 200 && largestStringLiteral < 120`. Module 41 trips
the threshold because every single UI caption is a separate short string
literal in the source; the heuristic correctly identifies "lots of short
strings," but cannot distinguish i18n data from obfuscated opcodes. It
also reports 0 exports because the module ends with `e.exports = u`
(object-default export), and the current extractor only picks up
`exports.<name> = ...` and `Object.defineProperty(t, ...)`. Both are
known-accurate-at-the-structural-level mis-identifications, not bugs in
the spike.

## Verdict

**Module 41 is the i18n caption table. It is NOT on the critical path for
the 41.5 flow analysis and does NOT need a dedicated follow-up task.**

Module 56 does not make any decisions based on the *values* of module 41's
captions — it just looks up `i.c11`, `i.puzzle6`, etc. and pastes them
into the DOM as UI labels. Tracing the verify POST body, the show-page
load flow, the vm-slide script loader, and the ajax layer can proceed
without decoding module 41 byte-by-byte. The FLOW.md write-up names
module 41 only as the source of `var i = n(41)` in module 56.

One minor follow-up is worth filing (not for 41.5): the `parse-bundle.js`
export extractor should grow a `module.exports = <Identifier>` case so
modules like 41 (and 45, 46, 55, 68, ...) stop reporting empty `exports`
arrays in `modules.json`. This is a polish item, not a correctness issue.
