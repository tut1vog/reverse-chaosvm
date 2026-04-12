# template-pool

## Open question

How many distinct ChaosVM templates does Tencent rotate through in the live tdc.js CDN? What is the distribution over time?

## Status

partial

## Inputs

- Live `tdc.js` fetches via `curl` — no artificial rate limit, but halt on 403/429
- Existing `output/tdc-survey*/` artifacts from prior exploratory runs as a starting corpus

## How to reproduce

```
node research/template-pool/survey.js --attempts 30 --verbose --save-sources
node research/template-pool/diagnose.js --attempts 30 --verbose
```

## Notes
