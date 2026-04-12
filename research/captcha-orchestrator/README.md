# captcha-orchestrator

## Open question

How does `t_captcha_slide.js` (213 KB) orchestrate the slide CAPTCHA — loading
`vm-slide`, constructing the verify POST body, triggering `vData` injection,
and talking to the captcha endpoints?

## Status

partial — structural survey of `sample/t_captcha_slide.js` complete (task
41.4). Deep flow analysis and `docs/CAPTCHA_ORCHESTRATOR.md` are deferred to
41.5 and 41.6.

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
node research/captcha-orchestrator/parse-bundle.js
```

The script is idempotent — running it twice produces byte-identical output
under `output/captcha-orchestrator/`. No CLI arguments; the input path is
hard-coded at `sample/t_captcha_slide.js`.

Outputs:

- `output/captcha-orchestrator/modules.json` — per-module inventory
  (byte range, source lines, byte length, static require edges, best-effort
  exports, conservative structural hint, raw signal flags).
- `output/captcha-orchestrator/module-graph.json` — `{nodes, edges, roots,
  leaves, stats, entryId}` static graph derived from the inventory.

## Documents

- `SURVEY.md` — structural findings from task 41.4: bundle shape, module
  size distribution, graph shape, candidate modules for each Track 2 DoD
  concept, open questions for 41.5, and the tractability verdict.

## Notes

- Every claim in `SURVEY.md` is reproducible from `modules.json` +
  `module-graph.json`. No runtime tracing was performed.
- `docs/CAPTCHA_ORCHESTRATOR.md` is deferred until 41.5 deep-analysis
  findings are available.
