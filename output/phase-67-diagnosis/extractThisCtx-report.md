# extractThisCtx failure diagnosis — `f53142c5…` and `88ebeea6…`

Scope: stage 1 of `tools/porting-pipeline/run.js` fails with `Could not identify thisCtx variable` on two unique source hashes surfaced by the 30-build port survey. This report diagnoses why, cites raw code, and recommends an additive extension to `extractThisCtx` in `tools/porting-pipeline/vm-parser.js:172-206`.

All evidence below was produced by the investigation scripts committed next to this report:

- `analyze-calls.js` — enumerates every `CallExpression` in the VM switch, groups by callee shape, prints example snippets.
- `verify-extension.js` — applies the original rule and the proposed extension side-by-side, returning the winning candidate under each.
- `collect-snippets.js` — prints every `regs[bc[++pc]].<prop>(Identifier,…)` match with its enclosing `case N:` label.

Output files next to this report:

- `analyze-calls.out`
- `verify-extension.out`
- `collect-snippets.out`

## TL;DR

- The two failing hashes retain the literal property `'call'` in their AST, but every occurrence is a **register-to-register** `regs[bc[++pc]]['call'](regs[bc[++pc]], …)` where arg0 is a `MemberExpression`, not an `Identifier` — so the existing rule yields zero candidates and the stage throws.
- The actual thisCtx-taking CALLQ handler in these builds uses an **obfuscated property access**: `regs[bc[++pc]][<stringDecoder>(<hexLit>)](<thisCtx Identifier>, …)`, where `<stringDecoder>` is the per-build string-array decoder function (e.g. `_0x79777a` in tdc-08, `_0x1ab1ec` in tdc-09). At runtime the computed key decodes to `"call"`, but acorn sees a `CallExpression` as the property, which the current rule does not recognise.
- Fix: extend the extractor to accept **any** property access form on `regs[bc[++pc]]` (Identifier, string Literal, or computed-CallExpression key), keeping the arg0=Identifier constraint unchanged. This recovers the winning identifier for both failing hashes and leaves all three passing reference builds on the same winning name.

## 1. Exact AST shape of the missed calls

### `f53142c54fc43699` (example: `output/port-survey/sources/tdc-08.js`)

VM variables resolved by stages that succeed first:

- `bytecode = _0x3ff919`
- `pc = _0x15c987`
- `regs = _0x4a24ea`
- (switch has 92 cases; `extractBytecodeAndPc` and `extractRegs` both succeed — see `analyze-calls.out:1-2`)

The CALLQ-shaped handlers look like:

```
_0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760, _0x4a24ea[_0x3ff919[++_0x15c987]])
```

Structurally:

- `node.callee` is a `MemberExpression`.
- `node.callee.object` is `regs[bc[++pc]]` (passes `isRegsBytecodePc`).
- `node.callee.computed === true` and `node.callee.property.type === 'CallExpression'`. Specifically the property is `_0x79777a(0x10e)` — a single-argument call to the build's string-decoder. In `describeNode` terms: `Call(Id(_0x79777a), n=1)`.
- `node.arguments[0].type === 'Identifier'` with name `_0x4f6760` — this is the thisCtx.

The current rule in `vm-parser.js:177-184` requires `node.callee.property` to be `Identifier('call')` or `Literal('call')`. A `CallExpression` property is neither, so the match at line 178 fails and the candidate tally stays at zero (`analyze-calls.out:47`; `verify-extension.out:19`).

There is exactly one literal `['call']` occurrence in tdc-08 (`analyze-calls.out:53`):

```
case 67:  _0x4a24ea[_0x3ff919[++_0x15c987]]['call'](_0x4a24ea[_0x3ff919[++_0x15c987]])
```

Its arg0 is `regs[bc[++pc]]`, i.e. a `MemberExpression`, so even this one literal `call` is filtered out by the `firstArg.type === 'Identifier'` guard on line 187.

### `88ebeea62f566ec5` (example: `output/port-survey/sources/tdc-09.js`)

VM variables resolved (`analyze-calls.out:65`):

- `bytecode = _0xc06ffc`
- `pc = _0x536cc0`
- `regs = _0x29ce13`
- 99 switch cases.

The CALLQ handler shape is the same family as tdc-08, with a different decoder and a different hex key:

```
_0x29ce13[_0xc06ffc[++_0x536cc0]][_0x1ab1ec(0x149)](_0x54b916, _0x29ce13[_0xc06ffc[++_0x536cc0]])
```

- `node.callee.property` is `CallExpression(_0x1ab1ec, [Literal(0x149)])`.
- `node.arguments[0]` is `Identifier('_0x54b916')` — this is the thisCtx.

tdc-09 also contains four literal `['call']` occurrences, but every one of them is a register-to-register form with a `MemberExpression` arg0 — confirmed by re-parsing and dumping each occurrence (run of the ad-hoc verification step: all four print `arg0.type=MemberExpression`):

```
case 11:  _0x29ce13[_0xc06ffc[++_0x536cc0]]['call'](_0x29ce13[_0xc06ffc[++_0x536cc0]], _0x29ce13[_0xc06ffc[++_0x536cc0]], _0x29ce13[_0xc06ffc[++_0x536cc0]])
case 53:  _0x29ce13[_0xc06ffc[++_0x536cc0]]['call'](_0x29ce13[_0xc06ffc[++_0x536cc0]], _0x29ce13[_0xc06ffc[++_0x536cc0]])
```

The existing rule therefore also matches zero candidates on tdc-09 (`verify-extension.out:24`).

### What the shape is *not*

The following alternative shapes were considered and ruled out by enumerating every `CallExpression` in the VM switch (`analyze-calls.out:5-44` for tdc-08, 68-108 for tdc-09):

- **`.apply` instead of `.call`**: no `["apply"]` property on a `regs[bc[++pc]]` callee object in either failing source. (tdc-20 has one, not these.)
- **Helper/wrapper function**: the top-shape frequency is dominated by `_0x79777a(hex)` / `_0x1ab1ec(hex)` decoder calls as standalone CallExpressions, not by a CALLQ helper invoked with `[fn, thisArg]`. No `Reflect.apply` or `Function.prototype.call.call` patterns appear anywhere in the switch.
- **`thisCtx` as a MemberExpression**: no — arg0 for the decoder-property shape is consistently `Identifier('_0x4f6760')` / `Identifier('_0x54b916')` across multiple cases (see §2).
- **Completely different primitive**: no. The structural skeleton `regs[bc[++pc]].<prop>(arg0, …)` is present; only the `<prop>` spelling changed to a runtime-decoded key. The `['call']` literal form still exists but is used for a *different* opcode — the register-register CALLQ — that happens to pass a register as the this-arg.

## 2. Representative raw snippets

Taken verbatim via `source.slice(node.start, node.end)` (see `collect-snippets.out`). All six tdc-08 matches and all five tdc-09 matches are shown because the extension's evidence rests on a consistent arg0 across multiple handlers.

### tdc-08.js — arg0 = `_0x4f6760` in all six

```
case 4:   _0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760, _0x4a24ea[_0x3ff919[++_0x15c987]])
case 26:  _0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760, _0x4a24ea[_0x3ff919[++_0x15c987]])
case 37:  _0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760, _0x4a24ea[_0x3ff919[++_0x15c987]], _0x4a24ea[_0x3ff919[++_0x15c987]], _0x4a24ea[_0x3ff919[++_0x15c987]])
case 61:  _0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760, _0x4a24ea[_0x3ff919[++_0x15c987]], _0x4a24ea[_0x3ff919[++_0x15c987]])
case 74:  _0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760)
case 76:  _0x4a24ea[_0x3ff919[++_0x15c987]][_0x79777a(0x10e)](_0x4f6760, _0x4a24ea[_0x3ff919[++_0x15c987]])
```

The property key `_0x79777a(0x10e)` decodes at runtime to the string `"call"` — reinforced by the existence of the literal `'call'` fallback at tdc-08 case 67 (different opcode, same method name).

### tdc-09.js — arg0 = `_0x54b916` in all five

```
case 8:   _0x29ce13[_0xc06ffc[++_0x536cc0]][_0x1ab1ec(0x149)](_0x54b916, _0x29ce13[_0xc06ffc[++_0x536cc0]])
case 32:  _0x29ce13[_0xc06ffc[++_0x536cc0]][_0x1ab1ec(0x149)](_0x54b916, _0x29ce13[_0xc06ffc[++_0x536cc0]], _0x29ce13[_0xc06ffc[++_0x536cc0]])
case 36:  _0x29ce13[_0xc06ffc[++_0x536cc0]][_0x1ab1ec(0x149)](_0x54b916)
case 41:  _0x29ce13[_0xc06ffc[++_0x536cc0]][_0x1ab1ec(0x149)](_0x54b916, _0x29ce13[_0xc06ffc[++_0x536cc0]], _0x29ce13[_0xc06ffc[++_0x536cc0]], _0x29ce13[_0xc06ffc[++_0x536cc0]])
case 78:  _0x29ce13[_0xc06ffc[++_0x536cc0]][_0x1ab1ec(0x149)](_0x54b916, _0x29ce13[_0xc06ffc[++_0x536cc0]])
```

## 3. Identifier that should play the thisCtx role

- `f53142c54fc43699` (tdc-08 and tdc-11): **`_0x4f6760`** — 6 occurrences, unanimous winner among arg0 Identifiers under the extension.
- `88ebeea62f566ec5` (tdc-09, tdc-17, tdc-19, tdc-27): **`_0x54b916`** — 5 occurrences, unanimous winner.

These names are per-build locals (not stable across hashes); the extractor only needs to *identify* the variable name from the AST — downstream stages refer to it by role.

## 4. Recommended extension to `extractThisCtx`

Plain-English rule to add to `vm-parser.js:172-206`:

> Keep the original rule (callee property is the Identifier `call` or the string Literal `"call"`). In addition, accept the property as **any `CallExpression` whose callee is an Identifier and which takes a single argument of type `Literal`** — this is the per-build string-array decoder call form `decoder(0xNN)`. The remaining constraints stay exactly the same: the callee object must be `regs[bytecode[++pc]]`, and `arguments[0]` must be a plain `Identifier` whose name is not `regs` / `bytecode` / `pc`. The first-argument Identifier with the highest occurrence count across the switch wins.

Concretely, extend the property-shape check currently at lines 178-179 with a third branch:

```
property === Identifier('call')
  OR property === Literal('call')
  OR (property.type === 'CallExpression'
      AND property.callee.type === 'Identifier'
      AND property.arguments.length === 1
      AND property.arguments[0].type === 'Literal')
```

No other line in `extractThisCtx` needs to change. The outer loop already dedups candidates by name and picks the highest count, and the `firstArg` guard on lines 187-190 already rules out `regs` / `bytecode` / `pc`.

### Why this is additive and safe

For the three passing reference builds, the winning Identifier under both rules is the same (see `verify-extension.out`):

| source | original best (count) | extension best (count) |
| --- | --- | --- |
| tdc-01.js | `_0x5ae5b4` (1) | `_0x5ae5b4` (6) |
| tdc-10.js | `_0x5c6106` (1) | `_0x5c6106` (7) |
| tdc-20.js | `_0x1e1607` (1) | `_0x1e1607` (6) |
| tdc-08.js | — (0) | `_0x4f6760` (6) |
| tdc-09.js | — (0) | `_0x54b916` (5) |

The additional matches surfaced by the extension in passing builds are *the same identifier as the literal-`call` match* — i.e. the obfuscated-property form in these builds also decodes to `"call"` at runtime and carries the same thisCtx. The extension therefore strictly increases confidence in the winner on passing builds, while recovering a winner on failing builds.

Two specific tie-break concerns, checked:

- **Could a different Identifier arg0 appear in another `regs[bc[++pc]][decoder(N)](…)` case and outrank the real thisCtx?** Across the five analysed sources no such competitor appears in `verify-extension.out` — the candidate map for each file has exactly one key. The shape `regs[bc[++pc]][<anything>](Identifier, …)` with an Identifier arg0 is highly discriminating in practice because most handlers pass register-indexed operands (which are MemberExpressions, not Identifiers).
- **Could non-CALLQ handlers also pass an Identifier arg0 through a decoded-property call?** In principle yes (e.g. a `regs[bc[++pc]][decoder(M)](pc, 1)` for pc-increment arithmetic — see shape "Id(_0x361e76)\[<computed>\] args=\[Id,Lit\]" at tdc-08 case 34). Those shapes are filtered out by the **callee-object** constraint `isRegsBytecodePc`: their callee object is a *different* local (e.g. `_0x361e76` — a helper object that holds arithmetic methods), not `regs[bc[++pc]]`. The extension keeps `isRegsBytecodePc` intact, so those false positives stay out.

### Optional tighter variant

If you want to narrow the accepted property shape further, you can require the property's `CallExpression` callee to be the Identifier that most frequently appears as a zero-arg or literal-arg call at the module top level (the string-array decoder). That's not necessary — the arg0=Identifier + callee-object=`regs[bc[++pc]]` filters are already tight enough across all five reference builds — and it would require probing outside the switch. Recommendation: **do not tighten**; keep the rule as described in §4.

## 5. Counts per source

| source | total `CallExpression` in switch | matches under **current** rule | matches under **extension** rule | best under current | best under extension |
| --- | --- | --- | --- | --- | --- |
| tdc-08.js (`f53142c5`) | 122 | 0 | 6 | — | `_0x4f6760` |
| tdc-09.js (`88ebeea6`) | 127 | 0 | 5 | — | `_0x54b916` |
| tdc-01.js (`8f1d32be`) | 126 | 1 | 6 | `_0x5ae5b4` | `_0x5ae5b4` |
| tdc-10.js (`daf0c711`) | 136 | 1 | 7 | `_0x5c6106` | `_0x5c6106` |
| tdc-20.js (`02fd132e`) | 140 | 1 | 6 | `_0x1e1607` | `_0x1e1607` |

Source of the "total in switch" count: `analyze-calls.out` (lines 3, 66, 129, 194, 257 for tdc-08 / 09 / 01 / 10 / 20 respectively). Match counts: `verify-extension.out`.

## Appendix A — how to reproduce

```
node output/phase-67-diagnosis/analyze-calls.js \
  output/port-survey/sources/tdc-08.js \
  output/port-survey/sources/tdc-09.js \
  output/port-survey/sources/tdc-01.js \
  output/port-survey/sources/tdc-10.js \
  output/port-survey/sources/tdc-20.js

node output/phase-67-diagnosis/verify-extension.js \
  output/port-survey/sources/tdc-01.js \
  output/port-survey/sources/tdc-10.js \
  output/port-survey/sources/tdc-20.js \
  output/port-survey/sources/tdc-08.js \
  output/port-survey/sources/tdc-09.js

node output/phase-67-diagnosis/collect-snippets.js \
  output/port-survey/sources/tdc-08.js \
  output/port-survey/sources/tdc-09.js \
  output/port-survey/sources/tdc-01.js \
  output/port-survey/sources/tdc-10.js \
  output/port-survey/sources/tdc-20.js
```

All scripts write to stdout only; redirect to the matching `*.out` files to regenerate evidence. No artifacts outside `output/phase-67-diagnosis/` are created.
