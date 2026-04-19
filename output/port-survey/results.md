# Port Survey Results

total=30, fully_green=24, verify_mismatch=0, stage_failures=6, unique_hashes=9

## Outcomes

### fully_green (24)

| index | sourceHash[:8] | TDC_NAME | template | caseCount | failedStage | error(short) |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | unknown | 96 |  |  |
| 02 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | unknown | 98 |  |  |
| 03 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | unknown | 98 |  |  |
| 04 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | unknown | 91 |  |  |
| 05 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | unknown | 96 |  |  |
| 06 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | unknown | 96 |  |  |
| 07 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | unknown | 96 |  |  |
| 10 | daf0c711 | FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | B | 94 |  |  |
| 12 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | unknown | 91 |  |  |
| 13 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | unknown | 98 |  |  |
| 14 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | unknown | 91 |  |  |
| 15 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | unknown | 98 |  |  |
| 16 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | unknown | 98 |  |  |
| 18 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | unknown | 91 |  |  |
| 20 | 02fd132e | gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | C | 100 |  |  |
| 21 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | unknown | 96 |  |  |
| 22 | daf0c711 | FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | B | 94 |  |  |
| 23 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | unknown | 96 |  |  |
| 24 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | unknown | 91 |  |  |
| 25 | 02fd132e | gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | C | 100 |  |  |
| 26 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | unknown | 96 |  |  |
| 28 | daf0c711 | FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | B | 94 |  |  |
| 29 | 27dda893 | HhXakMGlnYKgNcBiVFZCDckSRgJKTmgA | unknown | 103 |  |  |
| 30 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | unknown | 91 |  |  |

### verify_mismatch (0)

_none_

### stage_failures (6)

| index | sourceHash[:8] | TDC_NAME | template | caseCount | failedStage | error(short) |
| --- | --- | --- | --- | --- | --- | --- |
| 08 | f53142c5 | dNiffQDBnfBhFYVHJUXMVbRchmDEmPaH |  |  | 1 | Could not identify thisCtx variable |
| 09 | 88ebeea6 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS |  |  | 1 | Could not identify thisCtx variable |
| 11 | f53142c5 | dNiffQDBnfBhFYVHJUXMVbRchmDEmPaH |  |  | 1 | Could not identify thisCtx variable |
| 17 | 88ebeea6 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS |  |  | 1 | Could not identify thisCtx variable |
| 19 | 88ebeea6 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS |  |  | 1 | Could not identify thisCtx variable |
| 27 | 88ebeea6 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS |  |  | 1 | Could not identify thisCtx variable |

## Dedup consistency

| sourceHash[:8] | indices | outcomes_agree |
| --- | --- | --- |
| 8f1d32be | 01,05,07 | yes |
| e6a45ba6 | 02,03,13,15,16 | yes |
| 3429444f | 04,12,14,18,24,30 | yes |
| e5341ccb | 06,21,23,26 | yes |
| f53142c5 | 08,11 | yes |
| 88ebeea6 | 09,17,19,27 | yes |
| daf0c711 | 10,22,28 | yes |
| 02fd132e | 20,25 | yes |
| 27dda893 | 29 | yes |
