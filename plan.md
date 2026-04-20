# Plan

## Status
Current phase: Phase 67 — Porting pipeline stress test
Current task: none — Phase 67 complete

---

## Phases

### Phase 67: Porting pipeline stress test (30 live tdc.js builds)
> Run the auto-porting pipeline against 30 freshly-fetched `tdc.js` builds; fix the Stage-1 `extractThisCtx` failure so all 30 auto-port and all 9 unique XTEA keys are extracted.

| ID | Task | Status |
|----|------|--------|
| 67.1 | Fetch 30 live tdc.js builds via handshake | done |
| 67.2 | Run porting pipeline on all 30 builds, aggregate survey | done |
| 67.3 | Diagnose why `extractThisCtx` misses on `f53142c5` and `88ebeea6` | done |
| 67.4 | Extend `extractThisCtx` to cover the new AST pattern | done |
| 67.5 | Re-run full 30-build survey; verify 30/30 pass + aggregate all 9 XTEA keys | done |
