# collector-fields

## Open question

Known Unknown #6 from `project-brief.md` — is the 59-field collector schema constant across every `tdc.js` template, or template-specific? The current standalone token generator bakes in a 59-field `cdFieldOrder` derived from Template A (`targets/tdc.js`). Templates B and C produce byte-identical tokens with the existing pipeline, but no cross-template verification of the field count or field ordering has been committed. This track owns the investigation: capture Chrome's decrypted `cd` array from live CAPTCHA sessions across multiple templates, match each field against the collector schema, and establish whether field count, field ordering, or both rotate with template.

## Status

partial

## Inputs

- `tools/captcha-solver/captcha-client.js` — prehandle + show-page flow used to capture a live session
- `tools/scraper/tdc-utils.js` — `extractTdcName` / `extractEks` for identifying the live template
- `tools/scraper/template-cache.js` — cached XTEA params keyed by TDC_NAME
- `tools/token-generator/collector-schema.js` — the 59-field reference schema being validated
- `tools/porting-pipeline/{vm-parser,opcode-mapper,key-extractor}.js` — fallback for templates not yet in the cache
- Live `t.captcha.qq.com` CAPTCHA session (prehandle + show-page + `TDC.getData(true)` capture)

## How to reproduce

```
node research/collector-fields/discover-field-order.js
node research/collector-fields/discover-field-order.js --headful
```

## Notes
