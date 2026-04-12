# captcha-orchestrator

## Open question

How does `t_captcha_slide.js` (213 KB) orchestrate the slide CAPTCHA — loading
`vm-slide`, constructing the verify POST body, triggering `vData` injection,
and talking to the captcha endpoints?

## Status

partial (flow traced, public doc pending) — structural survey complete
(task 41.4) and end-to-end flow trace complete (task 41.5, see FLOW.md).
`docs/CAPTCHA_ORCHESTRATOR.md` is still deferred to 41.6. One scoped open
question remains: `vData` origination on modern browsers cannot be
resolved statically — see FLOW.md section 9.

## Inputs

- `sample/t_captcha_slide.js` — 213,162-byte webpack 4 bundle, 50 non-empty
  modules, entry id 64. This is the only input consumed by the 41.4 survey.
- Additional inputs planned for 41.5 deep analysis:
  - `sample/captcha-har.har` — captured network flow
  - `sample/cap_union_prehandle` — prehandle response sample
  - `sample/payload.txt` — verify POST body sample
  - `sample/slide-jy.js` — likely off-the-shelf jQuery/Zepto; confirm via diff
    against module 76 in the 41.5 pass

## How to reproduce

```
# 41.4 structural survey: emits modules.json + module-graph.json
# plus 41.5 gate-1 dynamic-require audit: dynamic-requires.json
node research/captcha-orchestrator/parse-bundle.js

# 41.5 verify-body origination table (reads modules.json + HAR):
node research/captcha-orchestrator/trace-flow.js

# 41.5 slide-jy.js vs module 76 classification:
node research/captcha-orchestrator/slide-jy-diff.js
```

All three scripts are idempotent — running each twice produces byte-
identical output under `output/captcha-orchestrator/`. No CLI arguments;
the input paths are hard-coded to `sample/t_captcha_slide.js`,
`sample/captcha-har.har`, and `sample/slide-jy.js`.

Outputs:

- `output/captcha-orchestrator/modules.json` — per-module inventory.
- `output/captcha-orchestrator/module-graph.json` — `{nodes, edges, roots,
  leaves, stats, entryId}` static graph.
- `output/captcha-orchestrator/dynamic-requires.json` — task 41.5 gate-1
  audit. Reports 0 real dynamic requires out of 4 suspect call sites
  (all four shadowed by local bindings).
- `output/captcha-orchestrator/verify-body-origination.json` — task 41.5
  deliverable. Machine-readable origination table for all 39 fields in
  the `/cap_union_new_verify` POST body in `sample/captcha-har.har`.
- `output/captcha-orchestrator/slide-jy-diff.md` — task 41.5 deliverable.
  Short classification of module 76 vs `sample/slide-jy.js` (verdict:
  different libraries — module 76 is Zepto, slide-jy.js is jQuery 1.11.3).

## Documents

- `SURVEY.md` — structural findings from task 41.4: bundle shape, module
  size distribution, graph shape, candidate modules for each Track 2 DoD
  concept, open questions for 41.5, and the tractability verdict.
- `FLOW.md` — task 41.5 end-to-end flow analysis: scope, early-gate
  results, module 8 / 56 / 76 deep reads, end-to-end numbered flow,
  verify POST origination table, doc reconciliation, open questions.
- `MODULE-41-NOTES.md` — task 41.5 gate-2 bounded spike on module 41.
  Verdict: i18n caption table, parked (not on critical path).

## Notes

- Every claim in `SURVEY.md` is reproducible from `modules.json` +
  `module-graph.json`. No runtime tracing was performed.
- `docs/CAPTCHA_ORCHESTRATOR.md` is deferred until 41.5 deep-analysis
  findings are available.
