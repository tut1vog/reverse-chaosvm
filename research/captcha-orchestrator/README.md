# captcha-orchestrator

## Open question

How does `t_captcha_slide.js` (213 KB) orchestrate the slide CAPTCHA — loading
`vm-slide`, constructing the verify POST body, triggering `vData` injection,
and talking to the captcha endpoints?

## Status

closed (mechanism) — full flow documented end-to-end. `vData` runtime
binding resolved in Phase 42 via static decode of `sample/vm_slide.js`:
on modern browsers vm-slide's `proxyXHR` installs an
`XMLHttpRequest.prototype` monkey-patch that encrypts payload data via
modified XTEA + a custom 64-char base64 alphabet and injects
`vData=<ciphertext>` into the verify POST body; on IE9 and below vm-slide
installs `window.getVData` directly and the orchestrator's
`if (a.isLowIE())` branch calls it. See
`research/vm-slide-stack-vm/{VDATA-TRACE,VDATA-RESOLUTION}.md` and the
rewritten `docs/CAPTCHA_ORCHESTRATOR.md` §6 for the full narrative.

**Narrower follow-up still available** (not required by the Track 2 DoD):
extract the exact XTEA key bytes used for the vData pipeline, characterise
the plaintext structure, and produce a standalone byte-identical `vData`
generator. Phase 42 resolved mechanism, not reproducibility.

Track history: structural survey 41.4 (`SURVEY.md`), end-to-end flow
trace 41.5 (`FLOW.md`), public reference 41.6 (`docs/CAPTCHA_ORCHESTRATOR.md`),
README bump 41.7, `vData` static trace 42.1
(`research/vm-slide-stack-vm/VDATA-TRACE.md`), cross-reference +
provenance 42.2 (`research/vm-slide-stack-vm/VDATA-RESOLUTION.md`), docs
bookkeeping 42.3.

## Inputs

- `sample/t_captcha_slide.js` — 213,162-byte webpack 4 bundle, 50 non-empty
  modules, entry id 64. Primary input for the 41.4 structural survey and
  the 41.5 flow trace.
- `sample/captcha-har.har` — captured network flow. Source of the verify
  POST body used to build the 39-field origination table.
- `sample/slide-jy.js` — jQuery 1.11.3 reference used for the module 76
  library classification.
- `sample/vm_slide.js` — stack-VM bundle referenced in 41.5 for the `vData`
  runtime-binding hypothesis; not decoded in this track (see
  `research/vm-slide-stack-vm/`).
- `sample/cap_union_prehandle` — prehandle response sample.
- `sample/payload.txt` — verify POST body sample.

## How to reproduce

```
# 41.4 structural survey + 41.5 gate-1 dynamic-require audit:
#   sample/t_captcha_slide.js
#     -> output/captcha-orchestrator/modules.json
#     -> output/captcha-orchestrator/module-graph.json
#     -> output/captcha-orchestrator/dynamic-requires.json
node research/captcha-orchestrator/parse-bundle.js

# 41.5 verify-body origination table:
#   modules.json + sample/captcha-har.har
#     -> output/captcha-orchestrator/verify-body-origination.json
node research/captcha-orchestrator/trace-flow.js

# 41.5 slide-jy.js vs module 76 classification:
#   sample/slide-jy.js + module 76 body
#     -> output/captcha-orchestrator/slide-jy-diff.md
node research/captcha-orchestrator/slide-jy-diff.js
```

All three scripts are idempotent and take no CLI arguments — running each
twice produces byte-identical output under `output/captcha-orchestrator/`.

## Documents

Research-side notes (under `research/captcha-orchestrator/`):

- `SURVEY.md` — task 41.4 structural findings: bundle shape, module size
  distribution, graph shape, candidate modules for each Track 2 DoD
  concept, open questions for 41.5, tractability verdict.
- `FLOW.md` — task 41.5 end-to-end flow analysis: scope, early-gate
  results, module 8 / 56 / 76 deep reads, numbered end-to-end flow,
  verify POST origination table, doc reconciliation, open questions.
- `MODULE-41-NOTES.md` — task 41.5 gate-2 bounded spike on module 41.
  Verdict: i18n caption table, parked (not on critical path).

Public reference (under `docs/`):

- `docs/CAPTCHA_ORCHESTRATOR.md` — task 41.6 public reference doc.
  Authoritative write-up of the orchestrator flow, verify-body
  origination, and the `vData` open question.

Machine-readable artifacts (under `output/captcha-orchestrator/`):

- `modules.json` — per-module inventory.
- `module-graph.json` — `{nodes, edges, roots, leaves, stats, entryId}`
  static graph.
- `dynamic-requires.json` — task 41.5 gate-1 audit. Reports 0 real
  dynamic requires out of 4 suspect call sites (all four shadowed by
  local bindings).
- `verify-body-origination.json` — task 41.5 deliverable. Machine-
  readable origination table for all 39 fields in the
  `/cap_union_new_verify` POST body in `sample/captcha-har.har`.
- `slide-jy-diff.md` — task 41.5 deliverable. Short classification of
  module 76 vs `sample/slide-jy.js` (verdict: different libraries —
  module 76 is Zepto, slide-jy.js is jQuery 1.11.3).

## Open questions

- **Byte-identical `vData` reproducibility (narrower follow-up)**. Phase 42
  resolved the vData mechanism statically (see `research/vm-slide-stack-vm/
  VDATA-RESOLUTION.md`). What remains is extracting the exact XTEA key
  bytes used by the vData pipeline (distinct from the register-VM `collect`
  key), characterising the plaintext structure being encrypted, and
  producing a standalone byte-identical `vData` generator under `tools/`.
  The ingredients are known: XTEA delta `0x9E3779B9` at bytecode indices
  15352 (encrypt) / 15530 (decrypt), a 64-char custom base64 alphabet at
  pc 16932, and a char-set validation regex at pc 17677. The productive
  follow-up would decompile the XHR proxy body (bytecode pcs roughly
  15000..20700) and use the Phase 40 vm-slide decoder to extract the key
  schedule.

## Notes

- Every claim in `SURVEY.md` and `FLOW.md` is reproducible from the
  committed artifacts under `output/captcha-orchestrator/`. No runtime
  tracing was performed in this track.
