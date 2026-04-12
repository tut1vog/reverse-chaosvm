# captcha-orchestrator

## Open question

How does `t_captcha_slide.js` (213 KB) orchestrate the slide CAPTCHA — loading `vm-slide`, constructing the verify POST body, triggering `vData` injection, and talking to the captcha endpoints?

## Status

open

## Inputs

- `sample/t_captcha_slide.js` — 213 KB orchestrator script
- `sample/captcha-har.har` — captured network flow
- `sample/cap_union_prehandle` — prehandle response sample
- `sample/payload.txt` — verify POST body sample
- `sample/slide-jy.js` — jQuery (likely off-the-shelf, confirm and note in README)

## How to reproduce

No runnable artifacts yet — see `project-brief.md` §Stream B for the definition of done.

## Notes
