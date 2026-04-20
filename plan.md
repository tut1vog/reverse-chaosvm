# Plan

## Status
Current phase: Phase 68 — Live scraper stress test
Current task: awaiting plan revision — 68.1 done; 68.2 direction depends on user decision

---

## Phases

### Phase 68: Live scraper stress test (30 runs against urlsec.qq.com)
> Run the pure-Node scraper 30 times end-to-end against the live CAPTCHA endpoint; verify the 67.4 porting-pipeline fix covers every live template and inventory the errorCode distribution — especially any remaining errorCode 12.

| ID | Task | Status |
|----|------|--------|
| 68.1 | Build scraper-stress driver + run N=30, emit per-run results + summary | done |
| 68.2 | (conditional) Triage based on 68.1 outcomes | pending |

---

_68.1 findings (no Current Task until user decides):_
- **Auto-port**: 0 failures in 30 runs across 10 distinct TDC_NAMEs. The 67.4 extractThisCtx patch covers every hash the live server served during the test. One new hash surfaced (`e2170903e201e018` / `DkPDkCnAekYMgVghTDOeSKmVZbkVCQUG` / caseCount=93) that was not in the 67.5 survey's 9 hashes — so the live universe is now known to be ≥10.
- **errorCode distribution**: `{0: 7, 12: 23}`. Strictly time-sequenced — first 7 iterations all succeed (errorCode 0), remaining 23 all fail with errorCode 12. Affects every TDC_NAME that appears post-cliff; the same TDC_NAMEs (e.g. `GCDJAPicKHeHfOBnn…`, `UAniMSgbcnMTPUjjG…`, `XcabTONObCYZeEGNP…`) appear in both halves. Not a per-template problem.
- **Signature matches server-side session/rate limiting**: abrupt cliff after a burst of successes, no recovery within the 30-run window, orthogonal to TDC_NAME / sourceHash / caseCount. Consistent with the soft-retryable handling described in `docs/CAPTCHA_ORCHESTRATOR.md:703-708` (module 56 `case 12: m.showCoverError("puzzle9", …)`).
