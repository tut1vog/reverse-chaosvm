# Plan

## Status
Current phase: Phase 67 — Porting pipeline stress test
Current task: 67.5 — Re-run full 30-build survey; verify 30/30 pass + aggregate all 9 XTEA keys

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
| 67.5 | Re-run full 30-build survey; verify 30/30 pass + aggregate all 9 XTEA keys | in-progress |

---

## Current Task

**ID**: 67.5
**Title**: Re-run full 30-build survey; verify 30/30 pass + aggregate all 9 XTEA keys
**Phase**: Phase 67 — Porting pipeline stress test
**Status**: in-progress

### Goal
Re-execute `research/port-survey/port-all.js` against the 30 captured `tdc.js` sources with the patched `extractThisCtx` in place and confirm that all 30 builds auto-port to byte-identical `collect` tokens. Aggregate the 9 unique XTEA keys into the survey summary.

### Context
67.4 extended `extractThisCtx` in `tools/porting-pipeline/vm-parser.js` to recognize the obfuscated-property CALLQ shape. A smoke test through the real `parseVmFunction` entry point resolves the expected `thisCtx` identifier on all five reference sources, including the two previously-failing hashes (`f53142c5` → `_0x4f6760`, `88ebeea6` → `_0x54b916`). `npm test` stays green (214 pass, 0 fail).

The 67.2 survey driver at `research/port-survey/port-all.js` loops over the 30 sources in `output/port-survey/sources/`, invokes `portVersion()` with verification enabled, and writes `output/port-survey/results.json` + `output/port-survey/results.md`. Prior run: 24/30 green, 6/30 Stage 1 failures; wall clock ~334s. After 67.4, the 6 failures are expected to flip to green.

### Implementation Steps
_Director runs these directly; no subagent dispatch. This task is pure verification of 67.4's end-to-end impact._

1. Re-run the survey: `node research/port-survey/port-all.js`.
2. Read `output/port-survey/results.json` and confirm: `total=30, green=30, verifyMismatch=0, stageFailures=0`. Previously-failing indices (08, 09, 11, 17, 19, 27) now have `success:true`, `verifyMatch:true`, non-null `xteaKeyHex`.
3. Extract the aggregated XTEA key set (one entry per unique `sourceHash`) and append a summary section to `output/port-survey/results.md` — or emit a companion `output/port-survey/xtea-keys.md` table keyed by source hash + TDC_NAME.
4. Spot-check that the three previously-passing hashes that already had recorded keys (`8f1d32be`, `daf0c711`, `02fd132e` etc.) return byte-identical keys to the 67.2 run — i.e. the patch caused no drift on sources it was already handling correctly.

### Verification
- [ ] `output/port-survey/results.json` totals: `{total:30, green:30, verifyMismatch:0, stageFailures:0}`.
- [ ] Indices 08, 09, 11, 17, 19, 27 all have `success:true` and non-null `xteaKeyHex`.
- [ ] All 9 unique source hashes have a recorded XTEA key.
- [ ] Keys for previously-green sources are unchanged from the 67.2 run.
- [ ] `output/port-survey/results.md` (or a sibling `xtea-keys.md`) carries the aggregated key table.

### Suggested Agent
Director-run (no subagent). Single script invocation plus a written summary.

### Goal
Patch `extractThisCtx` in `tools/porting-pipeline/vm-parser.js` to additively recognize the obfuscated-property CALLQ shape — `regs[bc[++pc]][decoder(0xNN)](thisCtxIdent, …)` — so source hashes `f53142c54fc43699` and `88ebeea62f566ec5` stop failing Stage 1, while the three passing reference builds (Templates A/B/C) keep returning the same `thisCtx` identifier as before.

### Context
67.3 produced a full diagnosis at `output/phase-67-diagnosis/extractThisCtx-report.md` with independent verification (snippet counts match: 6 for tdc-08, 5 for tdc-09). Key findings:

- Failing extractor is `extractThisCtx` in `tools/porting-pipeline/vm-parser.js:172-206`.
- Failing sources carry `thisCtx` through a call whose `callee.property` is a `CallExpression` (`decoder(0xNN)`) that runtime-decodes to `"call"`. Current rule only accepts `Identifier('call')` or `Literal('call')`, so it matches 0 candidates and throws.
- Expected `thisCtx` returns under the extension:
  - `f53142c54fc43699` → `_0x4f6760` (6 matches)
  - `88ebeea62f566ec5` → `_0x54b916` (5 matches)
- On passing sources the winning Identifier under the extension is identical to the original winner, just with higher counts (extension is strictly additive and non-regressing).

Exact recommended rule from 67.3 §4:

> Keep the original rule. Also accept the property as **any `CallExpression` whose callee is an `Identifier` and which takes a single argument of type `Literal`**. All other constraints stay unchanged: callee object must be `regs[bytecode[++pc]]`; `arguments[0]` must be a plain `Identifier` whose name is not `regs`/`bytecode`/`pc`.

Concretely, extend the property-shape check at lines 178-179 with a third branch:

```
property.type === 'Identifier' && property.name === 'call'
OR (property.type === 'Literal' && property.value === 'call')
OR (property.type === 'CallExpression'
    && property.callee.type === 'Identifier'
    && property.arguments.length === 1
    && property.arguments[0].type === 'Literal')
```

No other line in `extractThisCtx` changes. The outer candidate dedup + the arg0-Identifier guard on 187-190 handle the rest.

### Implementation Steps
1. Open `tools/porting-pipeline/vm-parser.js` and read `extractThisCtx` (lines 172-206). Preserve the existing file-header comment block on that function.
2. Modify only the inner property-shape condition on lines 178-179 so it additionally matches the `CallExpression(Identifier, [Literal])` shape described above. Keep formatting consistent with surrounding code (2-space indent, single quotes, semicolons, `const`/`let` only — per `.claude/rules/coding-style.md`). Do not introduce new helpers unless the inline condition becomes unreadable; if extracted, keep the helper local to the file.
3. Leave every other function untouched. Do not touch `opcode-mapper.js`, `key-extractor.js`, `token-verifier.js`, `run.js`, or any other file.
4. After editing, verify the patch locally with the ad-hoc script from 67.3 (re-run `node output/phase-67-diagnosis/verify-extension.js …`) to confirm the expected identifiers come back out — but do not commit any changes to files under `output/phase-67-diagnosis/` as part of this task; those are 67.3 artifacts.
5. Do **not** run the full porting pipeline or the 30-build survey. Those are 67.5's job; keep this task scoped to the parser patch.

### Verification
- [ ] `tools/porting-pipeline/vm-parser.js` diff is limited to `extractThisCtx` (lines ~172-206); no unrelated edits.
- [ ] Run `node -e` smoke tests or a small script that parses the 5 reference sources and calls the (now patched) `extractThisCtx` — director will invoke the existing `output/phase-67-diagnosis/verify-extension.js` against the updated logic. Expected output matches:
  - tdc-01.js → `_0x5ae5b4` (count ≥ 6)
  - tdc-10.js → `_0x5c6106` (count ≥ 7)
  - tdc-20.js → `_0x1e1607` (count ≥ 6)
  - tdc-08.js → `_0x4f6760` (count ≥ 6)  ← **previously failed**
  - tdc-09.js → `_0x54b916` (count ≥ 5)  ← **previously failed**
- [ ] `npm test` passes (`node --test`).
- [ ] No changes under `output/`, `research/`, or any other tool directory.

### Suggested Agent
`general-purpose` — small, localized parser patch. Must be a different agent instance than the one that produced the 67.3 diagnosis (code and implementation go to different agents per the Implementation/Tests Separation rule, and here the diagnosis author should not implement the patch they designed).
