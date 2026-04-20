# XTEA keys aggregated across the 30-build port survey

Source: `research/port-survey/port-all.js` against `output/port-survey/sources/tdc-{01..30}.js`. Extracted by `tools/porting-pipeline/key-extractor.js` (Stage 3 of the porting pipeline). One row per unique `sourceHash`; the 30-build sample covered 9 unique hashes after dedup.

Constants across every build: XTEA delta `0x9E3779B9`, 32 rounds.

| sourceHash[:16] | TDC_NAME | caseCount | templateLabel | STATE_A (key) |
| --- | --- | --- | --- | --- |
| 8f1d32beb4fcaa4d | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 96 | unknown | `0x55475B3B 0x5A171D5A 0x6C6C6E4D 0x55586866` |
| e6a45ba64d246f82 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | unknown | `0x4F4D6852 0x61426747 0x45535C40 0x6C3B4158` |
| 3429444f324c6110 | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | 91 | unknown | `0x63303C45 0x6D436969 0x53163E47 0x52506845` |
| e5341ccb12b78e65 | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | 96 | unknown | `0x4E49314A 0x67666C43 0x44576B4E 0x592E4D42` |
| f53142c54fc43699 | dNiffQDBnfBhFYVHJUXMVbRchmDEmPaH | 92 | unknown | `0x6D6D4E56 0x6D425240 0x6156573D 0x5A634859` |
| 88ebeea62f566ec5 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS | 99 | unknown | `0x6648444A 0x4557416D 0x48606037 0x4B362E4C` |
| daf0c711ccb82124 | FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | 94 | B       | `0x4A5A4764 0x5A535642 0x48633D42 0x573C4437` |
| 02fd132edb24a8c1 | gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | 100 | C       | `0x45294039 0x43694241 0x675E503A 0x67646B56` |
| 27dda893f81dbc4f | HhXakMGlnYKgNcBiVFZCDckSRgJKTmgA | 103 | unknown | `0x42322B41 0x63514754 0x63435742 0x655A4F3D` |

## Notes

- All 9 hashes auto-ported to byte-identical `collect` tokens in the 67.5 survey run. Per-build pipeline artifacts (opcode-table.json, xtea-params.json, pipeline-config.json) live under `output/tdc-NN/` (untracked).
- The `templateLabel` column reflects the legacy A/B/C classifier (95/94/100 caseCounts). Only 2 of the 9 observed hashes hit a classifier bucket; the pipeline works byte-identically on the other 7 despite the `unknown` label. The label is cosmetic; the pipeline does not branch on it.
- The two hashes that previously failed Stage 1 on 67.2 — `f53142c5…` and `88ebeea6…` — were recovered by the 67.4 extension to `extractThisCtx`, which handles a CALLQ callee property of the runtime-decoded form `decoder(0xNN)` in addition to the literal `.call` / `['call']` forms.
- Keys on the 7 previously-green hashes are byte-identical to the 67.2 run — the 67.4 parser patch introduced no drift on sources it was already handling correctly.
