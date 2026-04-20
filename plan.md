# Plan

## Status
Current phase: Phase 67 — Porting pipeline stress test
Current task: 67.3 — Diagnose why `extractThisCtx` misses on `f53142c5` and `88ebeea6`

---

## Phases

### Phase 67: Porting pipeline stress test (30 live tdc.js builds)
> Run the auto-porting pipeline against 30 freshly-fetched `tdc.js` builds; fix the Stage-1 `extractThisCtx` failure so all 30 auto-port and all 9 unique XTEA keys are extracted.

| ID | Task | Status |
|----|------|--------|
| 67.1 | Fetch 30 live tdc.js builds via handshake | done |
| 67.2 | Run porting pipeline on all 30 builds, aggregate survey | done |
| 67.3 | Diagnose why `extractThisCtx` misses on `f53142c5` and `88ebeea6` | in-progress |
| 67.4 | Extend `extractThisCtx` to cover the new AST pattern | pending |
| 67.5 | Re-run full 30-build survey; verify 30/30 pass + aggregate all 9 XTEA keys | pending |

---

## Current Task

**ID**: 67.3
**Title**: Diagnose why `extractThisCtx` misses on `f53142c5` and `88ebeea6`
**Phase**: Phase 67 — Porting pipeline stress test
**Status**: in-progress

### Goal
Produce a written diagnosis pinpointing the exact AST pattern that the current `extractThisCtx` function in `tools/porting-pipeline/vm-parser.js` fails to recognize on the two failing source hashes, so 67.4 can implement a targeted extension without regressing Templates A/B/C. Investigation-only — no code changes.

### Context
The 67.2 survey (results at `output/port-survey/results.json`, summary at `output/port-survey/results.md`) ran the auto-porting pipeline against 30 live `tdc.js` builds. 24/30 passed with byte-identical token verification; 6/30 failed at Stage 1 with `Could not identify thisCtx variable`. The 6 failures concentrate on 2 unique source hashes:

- `f53142c54fc43699` — builds tdc-08, tdc-11 — `TDC_NAME=dNiffQDBnfBhFYVHJUXMVbRchmDEmPaH`
- `88ebeea62f566ec5` — builds tdc-09, tdc-17, tdc-19, tdc-27 — `TDC_NAME=UAniMSgbcnMTPUjjGcEVEnBCQgkKHVWS`

Failing extractor is `extractThisCtx` in `tools/porting-pipeline/vm-parser.js:172-206`. It walks the VM switch looking for `CallExpression` of shape:

```js
regs[bytecode[++pc]].call(thisCtxIdentifier, ...args)
```

and treats the most-frequent first-argument identifier (that is not `regs`, `bytecode`, or `pc`) as `thisCtx`. When `candidates` is empty, the caller throws `Could not identify thisCtx variable`. So the builds either (a) use a different call-receiver shape, (b) pass `thisCtx` not as a plain `Identifier` (e.g. as a `MemberExpression` like `someObj.ctx`), (c) use a different call-dispatch primitive (e.g. `Function.prototype.apply`, a helper like `g.call.apply`, or a runtime-built `[fn, thisCtx]` pair), or (d) obfuscate so the `call` property is neither `Identifier('call')` nor `Literal('call')` (e.g. computed `[varHoldingStringCall]`).

Sources to read:
- Failing:
  - `output/port-survey/sources/tdc-08.js` (hash f53142c5…)
  - `output/port-survey/sources/tdc-09.js` (hash 88ebeea6…)
- Passing reference (for structural contrast):
  - `output/port-survey/sources/tdc-01.js` (hash 8f1d32be…) — caseCount 96, unknown template, passes
  - `output/port-survey/sources/tdc-10.js` (hash daf0c711…) — caseCount 94, Template B, passes

Each file is a single minified line (~200 KB). The VM is `__TENCENT_CHAOS_VM` and dispatches through a `SwitchStatement` with the most cases in the file (see `findVmSwitch` at `vm-parser.js:72-82`). Use the acorn AST walkers already in `vm-parser.js` (`walk`, `findFirst`, `findAll`) if it helps — but the goal is **diagnosis**, not a patch.

### Implementation Steps
1. For each of the 4 sources (`tdc-01.js`, `tdc-08.js`, `tdc-09.js`, `tdc-10.js`): write a short throwaway Node script that parses the file with `acorn`, locates the VM switch, identifies `bytecodeVar` / `pcVar` / `regsVar` the same way `vm-parser.js` does (reuse the existing helpers; you can `require('./tools/porting-pipeline/vm-parser.js')` if its helpers are exported, otherwise inline them).
2. In each VM switch, enumerate every `CallExpression` whose callee is a `MemberExpression`. Group them by the shape of the callee (literal vs computed property, what the object looks like) and the shape of the first argument. Count how many match the exact pattern `extractThisCtx` currently requires.
3. Specifically for the two failing sources, find the case(s) that correspond to a CALLQ-style opcode and dump the raw JS slice (via `source.slice(node.start, node.end)`) for 3–5 representative examples. Compare against the analogous cases in `tdc-01.js` / `tdc-10.js`.
4. From that evidence, state **one concrete diagnosis**: exactly what new shape(s) of call expression carry `thisCtx` in the failing builds, and which identifier(s) play the `thisCtx` role in each.
5. Recommend a minimal extension to `extractThisCtx` — describe the new AST match rule(s) in plain terms (not code). Confirm Templates A/B/C (`tdc-01`, `tdc-10`, and ideally one C sample `tdc-20.js`) still match the original rule under the recommended extension.

### Verification
- [ ] Diagnosis report written to `output/phase-67-diagnosis/extractThisCtx-report.md` (follow `.claude/rules/output-versioning.md` — stable path, not timestamped).
- [ ] Report includes: (a) exact AST shape(s) found in `tdc-08.js` and `tdc-09.js` that the current extractor misses, (b) 3+ cited JS snippets per failing source copied from the live files, (c) identifier name(s) that should be returned as `thisCtx` for each failing hash, (d) confirmation that the recommended extension does not regress `tdc-01.js`, `tdc-10.js`, `tdc-20.js`.
- [ ] Any throwaway analysis scripts are placed under `output/phase-67-diagnosis/` — **not** under `tools/` or `research/` (per `.claude/rules/output-versioning.md`).

### Suggested Agent
`general-purpose` — structural reverse-engineering across several large minified JS files; no domain-specific agent fits better.
