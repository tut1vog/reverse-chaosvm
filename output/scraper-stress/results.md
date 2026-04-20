# Scraper stress test — N=30 runs

Totals: count=30, success=7, fail=23

## errorCode histogram

| bucket | count |
|---|---|
| 0 | 7 |
| 12 | 23 |

## Auto-port failures (0)

_none_

## Per-TDC_NAME breakdown

| TDC_NAME | count | successCount | errorCodes |
|---|---|---|---|
| BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | 4 | 0 | 12=4 |
| DkPDkCnAekYMgVghTDOeSKmVZbkVCQUG | 2 | 0 | 12=2 |
| FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | 2 | 0 | 12=2 |
| GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 5 | 1 | 0=1, 12=4 |
| HhXakMGlnYKgNcBiVFZCDckSRgJKTmgA | 2 | 0 | 12=2 |
| SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | 3 | 3 | 0=3 |
| UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS | 2 | 1 | 0=1, 12=1 |
| XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 6 | 1 | 0=1, 12=5 |
| dNiffQDBnfBhFYVHJUXMVbRchmDEmPaH | 1 | 0 | 12=1 |
| gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | 3 | 1 | 0=1, 12=2 |

## Rows

| idx | success | errorCode | hash[:8] | TDC_NAME | caseCount | elapsedMs | failureKind |
|---|---|---|---|---|---|---|---|
| 1 | true | 0 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | 96 | 5217 |  |
| 2 | true | 0 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | 96 | 3445 |  |
| 3 | true | 0 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | 4615 |  |
| 4 | true | 0 | 88ebeea6 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS | 99 | 12820 |  |
| 5 | true | 0 | e5341ccb | SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk | 96 | 5012 |  |
| 6 | true | 0 | 02fd132e | gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | 100 | 4441 |  |
| 7 | true | 0 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 96 | 3784 |  |
| 8 | false | 12 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | 91 | 6134 | errorCode-12 |
| 9 | false | 12 | 88ebeea6 | UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS | 99 | 3718 | errorCode-12 |
| 10 | false | 12 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | 3513 | errorCode-12 |
| 11 | false | 12 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 96 | 3460 | errorCode-12 |
| 12 | false | 12 | 02fd132e | gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | 100 | 4689 | errorCode-12 |
| 13 | false | 12 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | 91 | 4576 | errorCode-12 |
| 14 | false | 12 | 27dda893 | HhXakMGlnYKgNcBiVFZCDckSRgJKTmgA | 103 | 2141 | errorCode-12 |
| 15 | false | 12 | f53142c5 | dNiffQDBnfBhFYVHJUXMVbRchmDEmPaH | 92 | 4505 | errorCode-12 |
| 16 | false | 12 | e2170903 | DkPDkCnAekYMgVghTDOeSKmVZbkVCQUG | 93 | 5123 | errorCode-12 |
| 17 | false | 12 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | 6347 | errorCode-12 |
| 18 | false | 12 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | 91 | 4044 | errorCode-12 |
| 19 | false | 12 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | 4326 | errorCode-12 |
| 20 | false | 12 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | 5027 | errorCode-12 |
| 21 | false | 12 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 96 | 3471 | errorCode-12 |
| 22 | false | 12 | e6a45ba6 | XcabTONObCYZeEGNPRmPGBQbTmYKEAHj | 98 | -833 | errorCode-12 |
| 23 | false | 12 | 27dda893 | HhXakMGlnYKgNcBiVFZCDckSRgJKTmgA | 103 | 5056 | errorCode-12 |
| 24 | false | 12 | 3429444f | BGDfWkdQOJJJTnHCNCnZRJZJSeFRWONJ | 91 | 3861 | errorCode-12 |
| 25 | false | 12 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 96 | 5494 | errorCode-12 |
| 26 | false | 12 | 02fd132e | gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR | 100 | 6177 | errorCode-12 |
| 27 | false | 12 | daf0c711 | FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | 94 | 4093 | errorCode-12 |
| 28 | false | 12 | 8f1d32be | GCDJAPicKHeHfOBnnYMEdUgUkTnAhOFV | 96 | 4495 | errorCode-12 |
| 29 | false | 12 | e2170903 | DkPDkCnAekYMgVghTDOeSKmVZbkVCQUG | 93 | 4664 | errorCode-12 |
| 30 | false | 12 | daf0c711 | FVgbJVJYTmGMFSCMcnTkYjmSFkYnESZF | 94 | 5012 | errorCode-12 |

## Interpretation

The 23 `errorCode 12` failures are **IP-based rate limiting** (confirmed
empirically 2026-04-20). The shape of this run — 7 successes from a
single public IP followed by 23 consecutive `errorCode 12` failures —
is consistent with a per-IP rate window on `cap_union_new_verify`:

- The error is independent of the `tdc.js` build (10 distinct source
  hashes seen in the run; 9 appeared among the failures).
- Four TDC_NAMEs flipped from success to `errorCode 12` within the same
  run (`XcabTONOb…` 1→5, `UAniMSgb…` 1→1, `GCDJAPicK…` 1→4, `gUbSKiHC…`
  1→2), so the rejection is not per-build nor per-TDC_NAME but tied to
  the calling client.

See `docs/CAPTCHA_ORCHESTRATOR.md` §7 for the updated error-code
semantics.

