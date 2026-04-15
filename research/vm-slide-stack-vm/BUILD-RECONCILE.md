# Phase 44.0.1 — Bytecode build reconciliation

**Question**: Phase 43 pinned the XTEA key as `2e430f8c15b7da96`. Phase 44.4 reported a
different key `34e2c8f07b5169ad` loaded at pc 13931 in fn 13860. Which is real, and is
`sample/vm_slide.js` the fixture-generating build?

**Verdict: (A) `sample/vm_slide.js` IS the fixture-generating build. Both keys are real
and both come from the same build — they sit on opposite sides of a pre-cipher
transform.** No build drift. Phase 44 pc references stand. Finding 44.4.1
(the "second key") is reclassified as the **pre-transform seed**, not a separate key.

## Evidence

### 1. Grep against `output/vm-slide/bytecode.json`

Bytecode is a flat integer array (24,273 elements). String constants are encoded as
per-char `OP_10 <charcode>` pairs, not ASCII runs. A contiguous ASCII-byte search
against the JSON file finds nothing. Scanning for `(10, printable)*` runs of length ≥8
(i.e. string-literal pushes) recovers:

| Needle              | Pcs where push-string appears   |
|---------------------|----------------------------------|
| `34e2c8f07b5169ad`  | **13931, 15149**                 |
| `2e430f8c15b7da96`  | (not present anywhere)          |
| `2e430f8c`          | (not present)                   |
| `15b7da96`          | (not present)                   |
| `34e2c8f0`          | (only as the prefix of the two above) |
| `7b5169ad`          | (only as the suffix of the two above) |

Neither key appears as raw ASCII in `sample/vm_slide.js` source text either
(`grep` count = 0 for all four substrings).

### 2. pc 13931 verbatim content

`output/vm-slide/disassembly-full.txt` lines 8159–8183:

```
13928  OP_00 5
13930  OP_04
13931  OP_10 51        ; '3'
13933  OP_10 52        ; '4'
13935  OP_10 101       ; 'e'
13937  OP_10 50        ; '2'
13939  OP_10 99        ; 'c'
13941  OP_10 56        ; '8'
13943  OP_10 102       ; 'f'
13945  OP_10 48        ; '0'
13947  OP_10 55        ; '7'
13949  OP_10 98        ; 'b'
13951  OP_10 53        ; '5'
13953  OP_10 49        ; '1'
13955  OP_10 54        ; '6'
13957  OP_10 57        ; '9'
13959  OP_10 97        ; 'a'
13961  OP_10 100       ; 'd'
13963  OP_02 2
13965  OP_49
...
13970  OP_58 13860 3 1 7 10 8 11 10 9 3    ; CALL fn 13860
```

So `OP_04` opens an array literal, 16 `OP_10` pushes assemble the string `"34e2c8f07b5169ad"`, `OP_02 2` + `OP_49` close the builder, and pc 13970 CALLs fn 13860. The string `34e2c8f07b5169ad` is therefore **pushed by fn 13860's caller as an argument**, not loaded inside fn 13860's body. The 44.4 subagent reading of "the key at pc 13931" is structurally accurate about the pc but mis-labels the string as *the* XTEA key. It is the **pre-cipher seed** passed into fn 13860.

The same 16-char literal is also pushed at pc 15149, followed by the same shape
(`y`, `p`, `t` tail at 15140..15145 is the preceding `OP_10` trio feeding the outer
`encrypt` method-name string — unrelated). The duplication is expected: vm-slide
builds the encrypt and decrypt closures through the same factory and passes the
seed in twice.

### 3. Phase 43's `2e430f8c15b7da96` is the **runtime** key

`research/vm-slide-stack-vm/vdata-dynamic-trace.js`:

- Line 48: `VM_SLIDE_PATH = path.join(ROOT, 'sample', 'vm_slide.js')` — the
  dynamic tracer loads the exact same file the decoder ingests.
- Lines 415–447: `recoverPipeline()` does not pull a string literal out of the
  bytecode. It reads **local slot 4** of the encrypt closure's stack frame the
  first time fn 13860 (encrypt entry) is hit, expecting either a 16-byte
  `<arr>` or four uint32 words. Whatever the VM has placed into that slot by
  the time the function body starts executing is recorded as `xtea_key_hex`.
- That captured value is `2e430f8c15b7da96` (= fixture `xtea_key_hex`
  `32653433306638633135623764613936`, which is the ASCII-hex of those 16 bytes —
  verified by `Buffer.from('3265...3936','hex').toString('ascii') === '2e430f8c15b7da96'`).

The dynamic value and the bytecode-literal value are therefore related by the
sequence of opcodes between the caller's `OP_58 13860` and the first dispatch tick
inside fn 13860 where local 4 is sampled — i.e. **whatever transform fn 13860's
prologue (or a wrapper factory between 13970 and the actual cipher loop) applies
to the incoming seed**. Nibble-level inspection confirms the two strings are not
related by any trivial byte/nibble reversal or single XOR mask; the transform is
non-trivial (matching the subagent's Phase 44.4 characterisation of a *pre-cipher
transform* — `XTEA_FUNC_PRE_DISPATCH` in their note).

### 4. Fixture-generating build

- `tools/scraper/vdata-harness.js` takes `vmSlideSource` as a string parameter —
  it hardcodes no path. Its only caller under `tools/scraper/` is
  `scraper.js:525`, which resolves `vmSlidePath = path.join(PROJECT_ROOT,
  'sample', 'vm_slide.js')` (line 199) as the default source, with a
  best-effort override to live-fetch from the show page when available.
- `tools/captcha-solver/live-submit.js` also reads `sample/vm_slide.js`.
- Fixture files `tests/fixtures/vdata-{jsdom,har}-capture.json` and
  `sample/vm_slide.js` and `output/vm-slide/bytecode.json` were all last
  touched at the same timestamp (Apr 14 09:43).
- Both committed fixtures report the **same** `xtea_key_hex`
  (`32653433306638633135623764613936` → `2e430f8c15b7da96`). The HAR fixture is a
  real Chrome 146 capture; the jsdom fixture was produced by the harness
  loading `sample/vm_slide.js`. The two matching = `sample/vm_slide.js` reproduces
  live-traffic behaviour byte-identically (already established Phase 43).
- `sample/vm_slide.js` is unambiguously the same build the committed fixtures were
  generated against.

## Implications

1. **Every pc reference in Phase 44 decompile work stays valid.** fn 22317, fn
   13860, fn 13989, fn 14153, fn 22400, fn 22730, fn 23399 all resolve against
   `output/vm-slide/bytecode.json`, which is the decode of the fixture-generating
   build.
2. **Finding 44.4.1 is reclassified, not dismissed.** The subagent correctly
   located a 16-byte key-shaped literal at pc 13931 inside fn 13860's caller
   path. It is the **seed** fed through the pre-cipher transform, not the XTEA
   round key. The transform between this seed and the runtime key
   `2e430f8c15b7da96` is the piece Phase 44.4 already flagged as
   `XTEA_FUNC_PRE_DISPATCH` / "pre-cipher transform pinned".
3. **Nomenclature for Phase 44 downstream work**:
   - `xtea_seed_hex = "34e2c8f07b5169ad"` — 16 ASCII bytes pushed at pcs 13931
     and 15149, baked into `sample/vm_slide.js` bytecode.
   - `xtea_key_hex  = "2e430f8c15b7da96"` — 16 ASCII bytes observed in the
     encrypt closure's local 4 at runtime; the value XTEA actually consumes.
   - The transform `seed → key` is currently black-box; pinning it statically is
     a Phase 44 follow-up task.
4. **No re-decode required.** `output/vm-slide/bytecode.json` is correct; no
   secondary `output/vm-slide-fixture/` directory is needed.

## Cross-checks performed

- `grep` for every substring of both keys in `sample/vm_slide.js` (source text) and
  `output/vm-slide/bytecode.json` (flat integer array). Only `34e2c8f07b5169ad`
  is present, at pcs 13931 and 15149, as `OP_10` per-char pushes.
- Confirmed `tools/scraper/vdata-harness.js` loads `vmSlideSource` from
  `sample/vm_slide.js` via `scraper.js:199`.
- Confirmed `research/vm-slide-stack-vm/vdata-dynamic-trace.js:48` loads the
  same file.
- Confirmed `tests/fixtures/vdata-{jsdom,har}-capture.json` both use
  `xtea_key_hex = "32653433306638633135623764613936"` which decodes to
  `2e430f8c15b7da96`.
- Confirmed `research/vm-slide-stack-vm/decoder.js:20` decodes
  `sample/vm_slide.js` as its default input.
