# captcha-orchestrator — structural survey (task 41.4)

Source-only structural survey of `sample/t_captcha_slide.js` (213,162 bytes).
All claims below are reproducible from `output/captcha-orchestrator/modules.json`
and `output/captcha-orchestrator/module-graph.json`, produced by
`node research/captcha-orchestrator/parse-bundle.js`.

This document is **structural**. It is not a control-flow or behavior analysis.
Runtime flow tracing and the authoritative `docs/CAPTCHA_ORCHESTRATOR.md` are
deferred to 41.5 and 41.6.

## Bundle shape

The bundle is a standard webpack 4 IIFE with a flat module array. The runtime
wrapper (verbatim, first ~360 bytes of the file, whitespace preserved) is:

```
!function(e){var t={};function n(r){if(t[r])return t[r].exports;var i=t[r]={i:r,l:!1,exports:{__esModule: undefined}};return e[r].call(i.exports,i,i.exports,n),i.l=!0,i.exports}n.m=e,n.c=t,n.d=function(e,t,r){n.o(e,t)||Object.defineProperty(e,t,{enumerable:!0,get:r})}, ... n.p="",n(n.s=64)}([function(e,t,n){...},function(e,t,n){...},...])
```

Decoded:

- The outer IIFE takes a single parameter `e` — the module array.
- `t` is the module cache, `n` is the webpack `require` function.
- Each module is invoked via `e[r].call(i.exports, i, i.exports, n)`, so every
  module wrapper has signature `function(module, exports, require)` — the
  **third positional parameter of every wrapper is `require`**.
- `n.s = 64` sets the webpack entry module. Confirmed programmatically:
  `module-graph.json.entryId === 64`.
- `n.p = ""` — empty public path.
- The module array has trailing sparse holes (`,,,,,,,...`) visible at the tail
  of the file; `parse-bundle.js` records these as `isEmpty: true` slots.

Inside each module, `require(<id>)` is called by name: the third wrapper
parameter appears as a plain identifier applied to a numeric literal, e.g.
`n(1)`, `n(4)`, `n(16)`. All static edges in `modules.json[*].requires` are
extracted by matching `<requireParam>(<NumericLiteral>)` inside each module's
AST. No dynamic require patterns (`n(someVar)`, `n.apply(...)`) were observed
during the pass; if any are present they would silently drop from the edge
list — see Open questions.

## Module count and size distribution

- **Total array slots**: 110
- **Non-empty modules**: 50
- **Empty slots** (sparse holes): 60
- **Total module bytes** (sum of wrapper source ranges): 212,113 — essentially
  the whole bundle modulo the ~1 KB webpack runtime prelude.

**Top 5 largest modules by byteLength** (from `modules.json`):

| id  | bytes  | hint                    | requires | sample exports             |
|-----|--------|-------------------------|----------|----------------------------|
| 41  | 62,329 | string-table-candidate  | 1 (→ 0)  | (none statically exported) |
| 11  | 33,230 | string-table-candidate  | 0        | `all`, `keys`              |
| 76  | 27,825 | jquery-like             | 0        | `ajax`, `ajaxJSONP`, `Event`, `active` (43 total) |
| 16  | 16,833 | string-table-candidate  | 1 (→ 5)  | `UAParser`, `name`, `version`, `major` |
| 56  |  8,045 | unknown                 | 21       | (none statically exported) |

Module 41 alone is 29% of the bundle. Its single outgoing edge targets module 0,
and it exposes zero static `exports.*` assignments — the classic shape of a
preprocessed string-literal table or an obfuscated opaque blob exported via
end-of-module `module.exports = ...` assignment (not picked up by the current
`exports.<name>` scan). Its true nature is an open question for 41.5.

## Graph shape

From `module-graph.json`:

- **Nodes**: 110 (50 non-empty + 60 empty slots)
- **Edges**: 91 static `require` edges across all non-empty modules
- **Roots** (non-empty modules never targeted by any static edge): `[64]`.
  Single-root graph; module 64 is the webpack entry and is never `require`'d
  from any other module.
- **Leaves** (non-empty modules with zero outgoing edges): 24
- **Max fan-out**: 21 (module 56)
- **Average fan-out** over non-empty modules: 1.82
- **Dynamic requires observed**: 0 (static-literal-only extraction; see
  Open questions for confidence bound).
- **Isolated subgraphs**: none detected. Every non-empty module is reachable by
  static-edge traversal from module 64 when inbound-edge membership is used as
  the reachability check (only module 64 has zero in-edges).

## Candidate modules for Track 2 DoD concepts

Candidates below are proposed from **structural evidence only** — string-literal
content in the source range and module graph position. Each is a lead, not a
conclusion. The justifications cite the exact signal; reproduce them by
`grep`'ing the relevant byte range in `sample/t_captcha_slide.js` using the
`sourceRange` from `modules.json`.

### (a) vm-slide loading

- **Module 8** (1,441 B, 2 outgoing). Exports `getScript`, `getScriptUrl`,
  `isIframeSupportCdnDomain`. `signals.sawScriptTagCreate = true`. This is the
  dynamic-script loader — the most plausible vm-slide fetcher. Reachable from
  the entry (64) indirectly via the require graph.
- **Module 66** (776 B). `sawScriptTagCreate = true`. Secondary script-tag
  constructor; role unknown.
- **Module 76** (27,825 B) — Zepto-like ajax layer, `sawXhr = true`, owns
  `ajaxJSONP`/`ajax`/`getJSON`. Present for completeness: vm-slide could in
  principle be fetched via ajax, but the exported surface and the `getScript`
  naming in module 8 point more strongly at 8.

### (b) vData construction

- **Module 56** (8,045 B, 21 outgoing). Source range contains the literal
  strings `vData`, `collect`, `eks`, `nonce`, `sess`, `sig=`, and `cap_union`
  — every single Track 2 DoD keyword is co-located in this one module.
  This is the central orchestrator / state assembler. It is required directly
  from the entry module 64.

### (c) verify POST body assembly

- **Module 56**, same justification as (b) — the `sig=` and `cap_union` literals
  sit inside the same byte range as `vData`/`nonce`/`sess`.
- **Module 40** (638 B) — contains `cap_union` literal; small — likely a URL
  or endpoint constant module consumed by 56.
- **Module 58** (2,044 B) — contains `prehandle` literal; likely the prehandle
  request builder.

### (d) collect / eks handling

- **Module 56** — contains both `collect` and `eks` literals.
- **Module 16** (16,833 B) — contains the `eks` literal. This module also
  statically exports `UAParser`, `name`, `version`, `major` — the `ua-parser-js`
  library. Two possibilities: (i) module 16 _is_ `ua-parser-js` and the `eks`
  hit is incidental (user-agent parse rule), (ii) module 16 also holds an
  eks-related helper co-bundled with UA parsing. Needs byte-level inspection in
  41.5.

### (e) nonce / sess / sig origination

- **Module 56** — all three literals present.
- **Module 49** (5,971 B) — `nonce` literal; mid-sized, required from module 50.
- **Module 52** (3,798 B) — `nonce` literal.
- **Module 20, 30, 45, 55, 68** — each contains the `sess` literal in their
  source range. Together with 56 these form the set of candidate readers /
  writers of session state. No claim yet about which one _originates_ sess vs.
  merely reads it from a shared store — that distinction requires flow analysis
  in 41.5.

### (f) show-page entry flow

- **Module 64** (1,016 B, 8 outgoing: `[3, 8, 10, 37, 45, 56, 65, 76]`). This is
  the webpack entry. It is the single root of the require graph. Its direct
  dependency set is a very strong shortlist for the first layer of show-page
  bootstrap: URL helpers (3), script loader (8), error-code helpers (10),
  unknowns 37/45/65, the orchestrator (56), and Zepto (76). A deep-analysis
  pass should treat module 64 as the entry point and walk this first-level set
  before descending.

## Open questions for 41.5

1. **Dynamic requires**: `parse-bundle.js` matches only `<require>(<numeric
   literal>)`. If any module uses `n(someVar)` or spreads require through a
   table indirection, those edges are missing. A sanity pass during 41.5 should
   grep each module's source range for the require-parameter name followed by
   non-numeric arguments and add any findings as annotated edges.
2. **Module 41 nature**: 62 KB, 1 outgoing edge, zero static `exports.<name>`
   assignments. Strongest candidates are (i) a preprocessed string/config table,
   (ii) an obfuscated payload assigned via `module.exports = ...`, or (iii) a
   bundled third-party library that uses a CommonJS bottom-of-file export.
   Needs a byte-level read.
3. **Module 11 nature**: 33 KB with exports `all`, `keys` — plausibly a big
   static data table (emoji/locale/fingerprint maps). Confirm.
4. **`exports.<name> = ...` coverage**: the current extractor misses
   `module.exports = X` and `t.default = X` style exports. Several modules in
   the table show `exports: []` despite plainly being functional (e.g. module
   56). A second-pass extractor should add `module.<name>` and default-export
   shapes.
5. **Zepto / jQuery classification**: module 76 is structurally jQuery/Zepto
   (owns `ajaxJSONP`, `ajax`, `Event`, `css`, `animate`, ~43 exports) but the
   project-brief flags `sample/slide-jy.js` as likely off-the-shelf jQuery. It
   is worth diff'ing 76 against `sample/slide-jy.js` to confirm whether 76 is
   the vendored copy or a trimmed subset.
6. **String-table opcode dispatch**: no evidence of a ChaosVM-style dispatch
   switch was found in any module (no `0x9E3779B9` hits, no 90+ case switches
   surfaced during the scan). Module 41 remains the most likely place for
   obfuscated opcode material hidden as a string table — rule in or out.
7. **Candidate set for concept (e) is too wide**: six modules touch `sess`.
   41.5 needs a flow-sensitive pass to distinguish the single writer from the
   readers.

## Tractability verdict

The bundle is a clean, flat webpack 4 module array with 50 live modules, a
single-root require graph rooted at module 64, and no dynamic-require patterns
observed in the static pass. Every Track 2 DoD concept (`vData`, `collect`,
`eks`, `nonce`, `sess`, `sig`, `cap_union`, `prehandle`) is anchored to a small
and structurally obvious set of candidates — module 56 alone contains every
keyword, and module 8 is unambiguously the script loader. An acorn-based
deep-analysis pass in 41.5 is very likely to succeed for mapping the
show-page-load → vm-slide-fetch → vData-compute → verify-POST flow and for
identifying the origination points of the verify-body fields. The two real
risks are (i) module 41's 62 KB opaque blob, which may be obfuscated enough to
resist static analysis and need a small dynamic harness, and (ii) potential
dynamic `n(var)` requires that the current pass cannot see — neither of which
is disqualifying, but both should be sanity-checked early in 41.5 before
committing to a pure-static approach.
