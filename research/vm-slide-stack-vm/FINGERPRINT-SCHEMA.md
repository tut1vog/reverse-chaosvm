# vm-slide vData fingerprint schema — Phase 44.4

## Summary

**Split pre-check outcome: (2) garbled keys.** A naive `split("&")` of the 112-byte decrypted plaintext produces exactly 8 parts in both committed fixtures (7 `&`, 8 `=`), but not one part has a clean field-name prefix — the field names are scrambled by a pre-cipher byte permutation.

That permutation is resolved in this task: module 40's `encryptData` (bytecode fn 13860, entry pc 13860) chains a **PKCS#7-style padder** (fn 13989) followed by an **AES-ShiftRows-style 16-byte block permutation** (fn 14153) before handing the bytes to module 41's XTEA encrypt (entry pc 15220 factory → inner block cipher at pc 15241, which is Phase 43's cipher). Inverting the permutation cleanly reveals the `key=value` pairs for both fixtures. The reference implementation in `build-fingerprint-plaintext.js` reproduces the 112-byte plaintext and the 152-char vData byte-for-byte against both committed fixtures (`vdata-jsdom-capture.json` and `vdata-har-capture.json`).

Three of fn 22317's four nested helper closures are decompiled here: fn 22400 builds `tp`, fn 22730 builds the digit array consumed by `obj.key`, fn 23399 builds `ss`. The remaining five fields (`version`, `py`, `env`, `inf`, `cLod`) are built inline in fn 22317's main body.

## Pre-check result

Both fixtures decrypt (XTEA-decrypt via Phase 43's key, LE uint32 packing) to exactly 112 bytes. Naive `split("&")` gives 8 parts but none of the parts match the hardcoded field names from fn 22317 — proving there is a pre-cipher transform. The 8/8 match on the delimiter count is a consequence of the ShiftRows permutation preserving byte frequency: every `&` and every `=` in the original kv string survives permutation, just at different positions.

### jsdom fixture (`tests/fixtures/vdata-jsdom-capture.json`)

Raw 112-byte plaintext (as `latin1`):

```
ite1on&nvtfpp=&==nr oepCaraton dpiouefle lrs t n(d ci''rs)en&agrkq&0Lp&eysyCs=Z==Con&dl0=o%ca2Lud&s=vi2TobDebCrn
```

Naive split-on-`&` (8 parts, no clean field names):

```
[0] "ite1on"      (no clean key)
[1] "nvtfpp=" (value "")
[2] "==nr oepCaraton dpiouefle lrs t n(d ci''rs)en"  (value starts with "=")
[3] "agrkq"       (no clean key)
[4] "0Lp"         (no clean key)
[5] "eysyCs=Z==Con"
[6] "dl0=o%ca2Lud"
[7] "s=vi2TobDebCrn"
```

After applying the **inverse** of fn 14153's 16-byte ShiftRows permutation:

```
inf=top&env=1&tp=Cannot read properties of null (reading 'src')&key=qLCZ&py=0&ss=0%2C&cLod=unloadTDC&version=2bb
```

Eight clean `key=value` pairs with 2 bytes of trailing padding (`bb` = alphabet index 2 repeated twice — so the pre-pad kv length was 110 bytes).

### HAR fixture (`tests/fixtures/vdata-har-capture.json`)

Raw 112-byte plaintext:

```
iimnfevn&=fr0=ae&700436t99p44=6865c=6Ll2oo40a2&dd&s=vi2To&DekCrne1s1Ls%y=2=2C2&1t2i2CdCdevcsm%l%&0kkkkkpkkykk=kk
```

After applying the inverse permutation:

```
inf=iframe&env=0&tp=7446039806946242560&cLod=loadTDC&version=2&key=21L2&ss=11%2Ctdc%2Cslide%2Cvm&py=0kkkkkkkkkkk
```

Eight clean pairs with 11 bytes of trailing `k` padding (alphabet index 11 = `k`; pre-pad length 101 bytes).

## Per-field source-rule table

Field order under the `sorted_name` column is the alphabetical order that fn 22317's `.sort()` call at pc 23949 requests. The observed **shipped** order differs in both fixtures (see "Field-order discrepancy" below).

| sorted_name | hardcoded_pc_range (fn 22317) | helper_function | source_rule | jsdom_fixture_value | har_fixture_value |
|---|---|---|---|---|---|
| `cLod` | 23062..23068 (name build), ~23070..23224 (value build, inline) | inline (main body) | Complex TDC-state probe: reads `window.TDC.getData(...)` (string literal at pcs 23162..23176), falls back to `"loadTDC"` / `"unloadTDC"` literals at pcs 23187..23222 depending on a `window`/`TDC` truthy chain. Captures `window.DEBUGMODE`-like env probes at pcs 23075..23145. Full decompile not required for Phase 44.4's cross-check — values observed match one of the three literals. | `"unloadTDC"` | `"loadTDC"` |
| `env` | 22695..22699 (name build), 22702..22719 (value build, inline) | inline (main body) | `require(0)() ? "0" : "1"` — captured slot 17 is fn 20970 slot 10 (`__importDefault(require(0))`). Char codes `49 / 48` at pcs 22710 / 22717. | `"1"` | `"0"` |
| `inf` | 23334..23338 (name build), 23340..23391 (value build, inline) | inline (main body) | `(window === U["top"]) ? "top" : "iframe"` — inline window/top strict-eq probe at pcs 23341..23363, literal `"iframe"` at pcs 23367..23379, literal `"top"` at pcs 23384..23389. | `"top"` | `"iframe"` |
| `key` | 23957..23962 (name build), 23964 (value load from slot 9) | fn 22730 (indirect — produces the digit-index array consumed by a caller-side lookup loop) | `slot9` accumulator built by the loop at pcs 23240..23328: `slot9 = slot8.charAt(digitArray[0]) + slot8.charAt(digitArray[1]) + …` where `slot8` = `require(18)(body, "sess") \|\| "abcdefghijklmn"` (pcs 23007..23056) and `digitArray = fn22730(body) \|\| new Array()` (pcs 22972..23004). fn 22730 itself: `require(0)() ? require(18)(body, "tlg").split("").map(c => parseInt(c, 10)) : [4, 2, 3, 10]`. | `"qLCZ"` (4 chars — jsdom has no slideBg, so `require(18)(body,"sess")` fell back to something short) | `"21L2"` (4 chars) |
| `py` | 22676..22678 (name build), 22684..22689 (value build, inline) | inline (main body) | `obj.py = arguments[1].py` — direct read of `options.py` via `MAKE_LOCAL_PAIR [slot4, "py"]` + `DEREF` at pcs 22683..22689. | `"0"` | `"0"` |
| `ss` | 23743..23745 (name build), 23748 (value load from slot 12) | fn 23399 | `encodeURIComponent(scripts.length + "," + scripts.map(s => require(32)(s.src)).filter(Boolean).join(","))` where `scripts = document.getElementsByTagName("script")`. Builds the literal `"document"` + `"getElementsByTagName"` + `"script"` at pcs 23415..23486, iterates over each script element, filters truthy `.src`, maps through captured `slot9` (parent slot 20 = fn 20970 slot 11), joins with `,`, prepends `scripts.length + ","`, then `encodeURIComponent`s the whole thing. Literal `"encodeURIComponent"` at pcs 23663..23697. | `"0%2C"` (0 scripts, `%2C` = `,`) | `"11%2Ctdc%2Cslide%2Cvm"` (11 scripts, 3 matched sources) |
| `tp` | 22392..22396 (name build), 22663..22671 (value build via fn 22400 then `STORE_REF`) | fn 22400 | Try `document.getElementById("slideBg").src.match(new RegExp("&sid=(.*?)&", ""))[1]`; on any throw return `e.message`; on null-match or post-`!require(0)()` fallback return the 10-char literal `"bbbbbbbbbb"`. Literal strings at pcs 22419..22509 (`"message"`, `"document"`, `"getElementById"`, `"slideBg"`, `"src"`, `"match"`, `"RegExp"`, `"&sid=(.*?)&"`, `"bbbbbbbbbb"`). | `"Cannot read properties of null (reading 'src')"` (the `e.message` catch-block branch — jsdom has no `slideBg` element) | `"7446039806946242560"` (captured sid integer) |
| `version` | 22369..22381 (name build), 22385 (value build, inline literal) | inline (main body) | `obj.version = "2"` — `OP_10 50` at pc 22385, literal `"2"`. | `"2"` | `"2"` |

## Pre-transform finding

**Module 40 is NOT pure XTEA.** Module 40 (webpack module ID `"40"`, factory entry pc 12655 — found by locating the `OP_04 OP_10 52 OP_10 48 OP_03` `"40"` literal at pc 12646 in the root-scope module-registration loop) contains a `tslib`-style `__createBinding` / `__setModuleDefault` boilerplate prologue, then installs three exports: `decryptData`, `encryptData`, `encryptField`. Its `encryptData` body — fn 13860, created at pc 13970 with captures `[parent10→slot7, parent11→slot8, parent9→slot10]` — chains:

```
step1 = slot7(plaintext)          // first pre-cipher transform
step2 = slot8(step1)              // second pre-cipher transform
try {
  return slot10.encrypt(step2, "34e2c8f07b5169ad")  // module 41 (XTEA)
} catch { return undefined }
```

The literal `"34e2c8f07b5169ad"` is built at pcs 13931..13961 (OP_04 + 16 × OP_10 with char codes `51,52,101,50,99,56,102,48,55,98,53,49,54,57,97,100`). **This is the XTEA key baked into `sample/vm_slide.js`, distinct from the `2e430f8c15b7da96` key the committed fixtures were captured with.** See "Sample-vs-fixture key drift" below.

`slot7` / `slot8` / `slot10` are the three captures of fn 13860, pinned to parent slots 10 / 11 / 9 of module 40's factory (entry pc 12655). The factory installs:

- **parent slot 9** ← `__importDefault(require(41))` — module 41 is the XTEA crypto module (factory entry pc 15220, the Phase 43 crypto region with the inner block cipher at pc 15241). Found by locating the `OP_04 OP_10 52 OP_10 49 OP_03` `"41"` literal at pc 15211 immediately after module 40's factory register.
- **parent slot 10** ← fn 13989 (created at pc 14140 with `OP_58 13989 0 1 3` — 0 captures, 1 arg). Body at entry pc 13989.
- **parent slot 11** ← fn 14153 (created at pc 14556 with `OP_58 14153 0 1 3` — 0 captures, 1 arg). Body at entry pc 14153.

### Transform 1: fn 13989 — PKCS#7-style padder with lookup-table pad char

Body `[13989, 14140]`, decompiled:

```js
function pad(s) {                                    // pc 13989
  var padLen = 16 - (s.length % 16);                 // pcs 14003..14025
  var padChar = "0abcdefghijklmnop".charAt(padLen);  // pcs 14031..14084
  var out = s;                                       // slot6 = slot3, pc 14087..14091
  while (padLen > 0) {                               // pcs 14113..14119
    out = out + padChar;                             // pcs 14122..14131
    padLen = padLen - 1;                             // pcs 14094..14107
  }
  return out;                                        // pcs 14136..14139
}
```

Key points:

- `padLen` is always in `[1, 16]` — when `s.length % 16 === 0` the formula gives `16`, so a full 16-byte block of padding is always appended (classical PKCS#7 behavior).
- The pad character is not the raw `padLen` byte (as in real PKCS#7) — it's a character from the 17-char lookup string `"0abcdefghijklmnop"` indexed by `padLen`. So `padLen=1 → 'a'`, `padLen=2 → 'b'`, …, `padLen=11 → 'k'`, …, `padLen=16 → 'p'`. Index 0 (`'0'`) is never produced because `padLen >= 1` always.
- This matches the trailing bytes observed after inverting the permutation: jsdom has `…version=2bb` (`padLen=2, char='b'`), HAR has `…py=0kkkkkkkkkkk` (`padLen=11, char='k'`). **Byte-identical match.**

### Transform 2: fn 14153 — 16-byte ShiftRows permutation

Body `[14153, 14556]`, decompiled:

```js
function permute(s) {                                // pc 14153
  var len = s.length;                                // pcs 14173..14192
  if (len % 16 !== 0) return s;                      // pcs 14195..14213 (misalignment bypass)
  var perm = new Array();                            // pcs 14220..14236
  perm[0]=0;  perm[1]=4;  perm[2]=8;   perm[3]=12;   // pcs 14236..14269
  perm[4]=5;  perm[5]=9;  perm[6]=13;  perm[7]=1;    // pcs 14272..14305
  perm[8]=10; perm[9]=14; perm[10]=2;  perm[11]=6;   // pcs 14308..14341
  perm[12]=15;perm[13]=3; perm[14]=7;  perm[15]=11;  // pcs 14344..14377
  var out = "";                                      // pc 14383..14387
  var i = 0;                                         // slot7
  while (i < len) {                                  // pcs 14390..14400
    var block = new Array();                         // pcs 14404..14420
    var k = 0;                                       // slot9
    while (k < 16) {                                 // pcs 14430..14440
      block.push(s.charAt(i + perm[k]));             // pcs 14443..14492
      k = k + 1;                                     // pcs 14493..14513
    }
    out = out + block.join("");                      // pcs 14516..14548
    i = i + 16;                                      // pcs 14539..14548
  }
  return out;                                        // pcs 14552..14555
}
```

The permutation `[0, 4, 8, 12, 5, 9, 13, 1, 10, 14, 2, 6, 15, 3, 7, 11]` laid out on a 4×4 column-major matrix is **exactly AES's ShiftRows** (assuming input bytes `[i, i+1, …, i+15]` are placed into the matrix in column-major order):

```
row 0 (shift 0): 0, 4, 8, 12    // unchanged
row 1 (shift 1): 5, 9, 13, 1    // left-rotate by 1 column
row 2 (shift 2): 10, 14, 2, 6   // left-rotate by 2 columns
row 3 (shift 3): 15, 3, 7, 11   // left-rotate by 3 columns
```

This is strong circumstantial evidence that vm-slide's pre-cipher transform was authored by someone who knew AES's internal structure and reused the ShiftRows step as a cheap diffusion layer in front of a non-AES block cipher (XTEA).

**The XTEA round parameters themselves remain classical** (32 rounds, delta `0x9E3779B9`, LE uint32 packing). Phase 43's encoder is byte-identical to vm-slide's module-41 encrypt.

## Reference JS implementation

See `research/vm-slide-stack-vm/build-fingerprint-plaintext.js`. Exports:

- `PAD_ALPHABET` — the 17-char `"0abcdefghijklmnop"` lookup string
- `PERM` — the 16-element ShiftRows permutation `[0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11]`
- `FIELD_NAMES_ALPHABETICAL` — the 8 hardcoded field names in alphabetical order
- `FIELD_ORDER_JSDOM`, `FIELD_ORDER_HAR` — the observed shipped orders for the two fixtures
- `padToBlock(s)` — fn 13989 implementation
- `permuteBlocks(s)` — fn 14153 implementation
- `buildJoined(obj, order)` — the fn 22317 8-iteration loop build
- `buildFingerprintPlaintext({obj, order})` — top-level: kv build → pad → permute → 112-byte Buffer

Feeding the output of `buildFingerprintPlaintext` to Phase 43's `tools/vdata-generator/encode.js` `encodeVData(buf)` reproduces the fixture vData string byte-for-byte.

## Byte-identical cross-check evidence

Script (inlineable):

```js
const { buildFingerprintPlaintext, FIELD_ORDER_JSDOM, FIELD_ORDER_HAR } =
  require('./research/vm-slide-stack-vm/build-fingerprint-plaintext.js');
const { encodeVData } = require('./tools/vdata-generator/encode.js');

const j = require('./tests/fixtures/vdata-jsdom-capture.json');
const jObj = {
  inf: 'top', env: '1',
  tp: "Cannot read properties of null (reading 'src')",
  key: 'qLCZ', py: '0', ss: '0%2C',
  cLod: 'unloadTDC', version: '2',
};
const jPlain = buildFingerprintPlaintext({ obj: jObj, order: FIELD_ORDER_JSDOM });
console.log('jsdom plaintext match:', jPlain.toString('hex') === j.plaintext_hex);
console.log('jsdom vdata match:    ', encodeVData(jPlain) === j.vdata_string);

const h = require('./tests/fixtures/vdata-har-capture.json');
const hObj = {
  inf: 'iframe', env: '0', tp: '7446039806946242560',
  cLod: 'loadTDC', version: '2', key: '21L2',
  ss: '11%2Ctdc%2Cslide%2Cvm', py: '0',
};
const hPlain = buildFingerprintPlaintext({ obj: hObj, order: FIELD_ORDER_HAR });
console.log('har plaintext match:', hPlain.toString('hex') === h.har_decrypted_plaintext_hex);
console.log('har vdata match:    ', encodeVData(hPlain) === h.har_vdata_string);
```

Actual output, captured 2026-04-15:

```
jsdom plaintext match: true
jsdom vdata match:     true
har plaintext match: true
har vdata match:     true
```

All four round-trips are byte-identical — every one of the 112 plaintext bytes and every one of the 152 vData base64 characters matches. The cipher half (Phase 43) and the pre-cipher pad+permute half (Phase 44.4) are therefore jointly byte-identical to vm-slide's live behavior for both committed fixtures.

## Open questions

1. **Field-order discrepancy.** fn 22317 at pc 23949 explicitly calls `.sort()` on the 8-element key array, but the observed shipped orders in both fixtures are **not** alphabetical. jsdom ships `[inf, env, tp, key, py, ss, cLod, version]`, HAR ships `[inf, env, tp, cLod, version, key, ss, py]` — neither matches `[cLod, env, inf, key, py, ss, tp, version]`. Hypotheses: (a) the `.sort()` comparator (fn 23898, 0-capture/0-arg empty body) returns undefined for all pairs and the sort is therefore a no-op that preserves insertion order, and the insertion order itself was perturbed somewhere upstream of the fixtures; (b) some platform-specific sort stability quirk rearranges entries; (c) the fixtures were captured from an older vm-slide build with a different comparator. Resolving this requires either (a) runtime trace of fn 22317 and inspection of the post-sort slot 13, or (b) a static read of fn 23898's body and an argument about what comparator it implements. Not blocking the cipher round-trip — the shipped order is an INPUT to this task's reference implementation, not a derived output — but closes a known unknown in fn 22317's behavior.
2. **Sample-vs-fixture key drift.** `sample/vm_slide.js` bakes in `"34e2c8f07b5169ad"` at bytecode pcs 13931..13961. The committed fixtures `tests/fixtures/vdata-{jsdom,har}-capture.json` were captured against a vm-slide build with key `"2e430f8c15b7da96"`, which does **not** appear anywhere in the committed `sample/vm_slide.js` bytecode (verified by exhaustive `OP_10` char-sequence scan). Phase 43's `tools/vdata-generator/encode.js` hardcodes the fixture key `"2e430f8c15b7da96"`, so encoder round-trips work, but this is a latent inconsistency: **`sample/vm_slide.js` and the committed fixtures are from different vm-slide builds**. Phase 43.2 documented the key as a "bytecode constant" without distinguishing which build's bytecode. Open action: decide whether to re-capture a fresh fixture against `sample/vm_slide.js`, or annotate Phase 43's doc to note the drift.
3. **fn 22730 `require(18)` role.** fn 22730 is passed `body` (the verify POST body that fn 22317's `arguments[0]` receives) and calls `require(18)(body, "tlg")` then `.split("").map(c => parseInt(c, 10))`. The purpose of the `"tlg"` string is unclear — likely a field key into a body that `require(18)` parses as query-string or JSON. `require(18)` decompile is deferred — 44.4 needed only to establish that fn 22730's output drives `obj.key` via the character-lookup loop at pcs 23240..23328. A full understanding of `obj.key`'s value-source rule requires decompiling `require(18)` (module 18, factory entry unknown).
4. **`obj.cLod` complex probe.** The cLod value-build region at pcs 23059..23224 contains repeated `"window"` lookups, a `"TDC"` key, a `"getData"` method lookup, and conditional fall-backs to the literals `"loadTDC"` / `"unloadTDC"`. The full conditional structure was not decompiled; both observed fixture values are one of the two literals, so the cross-check passes with a literal fall-back. An exhaustive decompile is worth doing in 44.4.x alongside the cLod edge cases (what input produces the live `window.TDC.getData(...)` return path?).
5. **44.5b productization.** `tools/vdata-generator/` currently exposes only the cipher half (`encodeVData(112-byte Buffer)`). 44.5b should wrap `buildFingerprintPlaintext` + `encodeVData` into a single public entry point `buildVData(obj, order)` and add a third fixture pair (or refresh the existing ones against `sample/vm_slide.js`) to cover the new plaintext-build layer in the test suite.
