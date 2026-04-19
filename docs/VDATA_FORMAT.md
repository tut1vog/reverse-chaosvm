# vData Format Reference — vm-slide ChaosVM

> **Authoritative document for vm-slide's `vData` field, end-to-end.** Phase 43 closed the cipher half (2026-04-13); Phase 44 closed the plaintext half (2026-04-15). Supersedes the earlier research-track cipher-pipeline notes.
>
> **Scope**: both halves. This doc covers the 8-field tdc-runtime-state-probe that vm-slide assembles inside `fn 22317 = module.exports.getCaptchaData`, the padder + ShiftRows permuter + classical XTEA + custom base64 pipeline that turns it into a 152-character string, and the `tools/scraper/vdata-generator/` public API (three modes: cipher-only, replay-with-substitution, from-obj synthesis).

## 1. Overview

`vData` is a 152-character form-field appended to Tencent's `/cap_union_new_verify` POST body by vm-slide's `XMLHttpRequest.prototype.send` monkey-patch (installed by the `proxyXHR` routine on non-IE browsers — see `docs/CAPTCHA_ORCHESTRATOR.md` §6). On IE9 and below the same value is computed by `window.getVData(query)` instead. Both code paths run the same cipher pipeline; only the plaintext source differs in the IE9 case.

**Live Chrome entry chain** (Phase 44.2.8, runtime-validated):

```
vm-slide internal orchestrator (fn 19604)
  → init(getCaptchaData)                                  // passes fn 22317 as arg
  → require(44).proxyXHR(getCaptchaData)     pc 19661
  → fn 20140 (proxyXHR) binds getCaptchaData as slot 3
  → fn 20539 FUNC_CREATE pc 20797, captures slot 3 as inner slot 8
  → fn 20539 installed onto XHR.prototype.send  pc 20808 (OP_24)
  → fn 20353 sibling .open wrapper installed    pc 20473 (guards on URL == "/cap_union_new_verify")
  [later, on the verify POST send:]
  → fn 20539 runs with body = arguments[0]  (9345-byte urlencoded POST body)
  → fn 20539 pc 20749 OP_66 2 calls slot8(body, {py}) = fn 22317(body, {py})
  → fn 22317 = module.exports.getCaptchaData  (body [22317..24233], exported at pc 24252 by webpack module fn 20970)
      builds 8-field tdc-runtime-state probe (§8)
      shuffles field order via fn 23898 (Math.random() > 0.5 ? -1 : 1) at pc 23949
      joins as k=v&k=v&... (110 bytes for the committed fixtures)
      → fn 13860 encryptData (webpack module 40):
          PKCS#7-style pad to 112 bytes (fn 13989, alphabet "0abcdefghijklmnop")
          ShiftRows permute (fn 14153, PERM=[0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11])
          XTEA encrypt (module 41, 14 blocks, classical, LE packing)
          custom base64 encode (pc 16932 alphabet, pcs 17084..17418 encoder, Y = padding)
          returns 152-char vData string ending in YY
  → fn 20539 body-appends &vData=<152 chars> at pc 20751, calls savedSend.call(this, rewritten)
      final body: 9504 = 9345 + 7 ("&vData=") + 152
```

```
┌──────────────────────────────────────────────────────────────────┐
│            vData field appended to the verify POST                │
│                  (152 characters, ends in YY)                     │
├──────────────────────────────────────────────────────────────────┤
│ 8 key=value pairs (Phase 44 — tdc runtime-state probe, §8)       │
│ Fields: tp, key, py, env, version, cLod, inf, ss                  │
│   │   Step 0: shuffle field order via Math.random (fn 23898)     │
│   │           join as "k=v&k=v&..." (≤110 bytes for fixtures)    │
│   ▼                                                               │
│ ≤110-byte kv string                                               │
│   │   Step 1a: PKCS#7-style pad to 112 bytes (fn 13989)          │
│   │            alphabet "0abcdefghijklmnop", padLen=16-(len%16)  │
│   ▼                                                               │
│ 112-byte padded plaintext                                         │
│   │   Step 1b: ShiftRows permute (fn 14153)                      │
│   │            PERM=[0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11]      │
│   ▼                                                               │
│ 112-byte permuted plaintext (14 × 16-byte AES-style blocks)       │
│   │   Step 2: classical XTEA encrypt (module 41)                 │
│   ▼            32 rounds, delta 0x9E3779B9, LE uint32 packing    │
│ 112-byte ciphertext (14 × 8-byte XTEA blocks)                    │
│   │   Step 3: standard base64 with custom 65-char alphabet       │
│   ▼            (index 64 = `Y` = padding char)                    │
│ 152-char vData string ending in "YY" (the 2 padding chars)        │
└──────────────────────────────────────────────────────────────────┘
```

**Verified.** The standalone reimplementation (`tools/scraper/vdata-generator/`) produces byte-identical output against two committed fixtures: `tests/fixtures/vdata-jsdom-capture.json` (synthetic via jsdom) and `tests/fixtures/vdata-har-capture.json` (a real Chrome 146 HAR capture). Both directions (encode + decode + XTEA encrypt + XTEA decrypt) round-trip in `tests/test-vdata-generator-encoder.js` (Phase 43.4) and in the standalone `tests/fixtures/verify-vdata-fixtures.js` (Phase 43.2).

## 2. Pipeline

The cipher half has exactly two steps. Plaintext is always exactly 112 bytes; output is always exactly 152 characters.

### Step 1 — Classical XTEA encrypt

| Parameter | Value |
|---|---|
| Algorithm | Classical XTEA (Tiny Encryption Algorithm, eXtended) |
| Block size | 8 bytes (two `uint32`s) |
| Block count | 14 (= 112 ÷ 8) |
| Rounds per block | 32 |
| Delta constant | `0x9E3779B9` |
| Word packing | **Little-endian** uint32 read/write |
| Key | 16 bytes, hardcoded; see §3 |
| Mode | ECB (each 8-byte block encrypted independently — no IV, no chaining) |

There is no padding, no IV, and no MAC. The 112-byte plaintext is split into 14 contiguous 8-byte blocks; each block is encrypted in place; the result is a 112-byte ciphertext.

### Step 2 — Standard base64 with a custom 65-character alphabet

| Parameter | Value |
|---|---|
| Alphabet | `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` |
| Alphabet length | **65 characters** (indices 0..63 are data; index **64 = `Y`** is the padding char) |
| Padding character | `Y` (the analog of `=` in RFC 4648) |
| Encoder shape | Standard base64 with `isNaN`-guarded byte reads — when input bytes run out at the end, the corresponding output positions emit `Y` instead of an alphabet symbol |
| Special chars | `-`, `_`, `*` (the three non-alphanumeric data symbols) |

For a 112-byte input, `112 = 37·3 + 1`. The first 37 input groups produce 4 data chars each (148 chars total). The final group has only 1 data byte, so the encoder emits 2 data chars + 2 padding chars (`YY`) — giving 152 chars total. **Every well-formed `vData` string ends in `YY`.**

> **Correction (Phase 43.2).** Earlier 43.1 documentation described a "constant 2-byte trailer `10 40`" appended after the 14 ciphertext blocks. That was a phantom: the 43.1 decoder iterated `i < alphabet.length`, mapping `Y` to index 64, then read the trailing `YY` as raw 6-bit values: `(64 << 6) | 64 = 0x1040`. The real encoder is standard base64 with `Y` as the padding character; there is no trailer in the encoder input.

## 3. Cryptographic Parameters

### XTEA key

| Field | Value |
|---|---|
| Key bytes (hex) | `32 65 34 33 30 66 38 63 31 35 62 37 64 61 39 36` |
| Key bytes (ASCII) | `2e430f8c15b7da96` |
| Length | 16 bytes (the 4-uint32 XTEA key schedule) |
| Word-packing for the schedule | **Big-endian** (each 4-byte slice → one uint32) |
| Schedule words | `[0x32653433, 0x30663863, 0x31356237, 0x64613936]` |
| Source | Bytecode constant inside vm-slide's `__TENCENT_CHAOS_STACK`, recovered live by Phase 43.1 dynamic tracing and verified against the bytecode at the encrypt closure entry (pc 15241) |

The key is **constant across runs and across sessions**, identical between the jsdom harness and the real Chrome 146 HAR. It is not derived from session state, the verify POST body, the nonce, or the eks token.

> **Note on the two endiannesses**. The 16-byte key is read as four big-endian uint32 words to form the XTEA key schedule, but the per-block plaintext/ciphertext bytes are read and written as little-endian uint32 words. This split is unusual but is what the bytecode actually does — see `tools/scraper/vdata-generator/xtea.js` `keyFromHex` (BE) versus `xteaEncryptLE` (LE).

> **Key reconciliation across builds (Phase 44.0.1, updated Phase 44.2.7)**. Two hex strings have been observed in vm-slide traces, and they correspond to two different builds (or two different sampling points):
>
> - `2e430f8c15b7da96` — the key observed in the encrypt closure's local 4 when Phase 43 dynamic-traced the jsdom harness. Both committed fixtures (`tests/fixtures/vdata-{jsdom,har}-capture.json`) round-trip byte-identically with this key, so it is the canonical key for the `tools/scraper/vdata-generator/` reference implementation and for all `tests/fixtures/verify-vdata-fixtures.js` assertions.
> - `34e2c8f07b5169ad` — the 16-byte bytecode literal pushed into fn 13860 at pcs 13931 and 15149 inside a later vm-slide build observed during research. This is ALSO the value observed live as fn 15918's second argument by the 44.2.7 tracer, which means that vm-slide build encrypts with the bytecode literal directly (no seed→key transform on that build).
>
> The 44.0.1 reconciliation originally hypothesized a seed→key prologue transform inside fn 13860 on that vm-slide build. The 44.2.7 runtime capture shows no such transform — the literal IS the runtime key. The remaining contradiction (the fixtures' canonical key `2e43...` vs the vm-slide build's runtime key `34e2...`) therefore reduces to "the committed fixtures were generated against a different vm-slide build than the one the later research scripts were run against." This does not affect the fixture reproducibility contract or any Phase 43/44 deliverable — reconfirming which live build `tests/fixtures/` was captured from is an optional follow-up.

### Encoding alphabet

| Field | Value |
|---|---|
| Alphabet | `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` |
| Length | 65 |
| Padding char | `Y` (index 64) |
| Source | Built at vm-slide bytecode pc 16932 by an `OP_04 + 65 × OP_10 + OP_24` string-build sequence; encoder body lives at pcs 17084..17418 with `isNaN`-guarded `OP_08 64` padding immediates at pcs 17395 and 17409. Recovered by a Phase 43.2 bytecode walker. |

The alphabet was wrongly described in earlier notes as a "64-char alphabet". It contains **65 distinct characters** because vm-slide stores the data symbols and the padding symbol in a single contiguous string and indexes into it directly by 6-bit value, with index 64 conventionally meaning padding. The semantics are still standard base64 — `Y` plays the same role `=` plays in RFC 4648.

## 4. Worked Example

This is the jsdom fixture (`tests/fixtures/vdata-jsdom-capture.json`).

**Plaintext** (112 bytes, hex):
```
697465316f6e266e76746670703d263d3d6e72206f657043617261746f6e
206470696f7565666c65206c72732074206e28642063692727727329656e
266167726b7126304c70266579737943733d5a3d3d436f6e26646c303d6f
256361324c756426733d766932546f6244656243726e
```

ASCII rendering (note: this is the jsdom-environment fingerprint from one frozen run — the bytes are not human-meaningful):
```
ite1on&nvtfpp=&==nr oepCaraton dpiouefle lrs t n(d ci''rs)en&agrkq&0Lp&eysyCs=Z==Con&dl0=o%ca2Lud&s=vi2TobDebCrn
```

**XTEA encrypt** with key `32653433306638633135623764613936` → 112-byte ciphertext (hex, first 64 chars shown):
```
13e9139a842df5eca35e6ef7554c1880461450354e51f442a63e6f4fd2a015f5...
```

**Standard base64 encode** with the 65-char alphabet (index 64 `Y` = padding) → 152-char `vData` string:
```
crojBb7JsxZuqB8N9vXCicCvvy9OvMR5Qu6*jsSi1MvyJVF2J3bo7dO6OaSjOvFnNetQqVDq3z7eVUy0DiOylPgqSlmIjnMMDEJQelKZ3w88v516OboSLxfrNu1A9rE2EguCZ7eZtjLuqum1_Er5QXYY
```

Note the trailing `YY` — the 2 padding chars for the 1-data-byte-in-final-group case. Reproduce with:

```bash
node -e "
const { encodeVData } = require('./tools/scraper/vdata-generator/encode.js');
const f = require('./tests/fixtures/vdata-jsdom-capture.json');
console.log(encodeVData(Buffer.from(f.plaintext_hex, 'hex')));
"
```

The HAR fixture (`tests/fixtures/vdata-har-capture.json`) demonstrates the same pipeline against a real Chrome 146 capture — same key, same alphabet, different plaintext, byte-identical reproduction of the live `vData` string.

## 5. Public API — `tools/scraper/vdata-generator/`

The standalone generator is a CommonJS module with no external dependencies. It exposes **three** modes of increasing power:

1. **Cipher-only** (Phase 43) — `encodeVData(plaintext)`: caller supplies a pre-built 112-byte plaintext, module runs the cipher pipeline only. Used when you already have a captured plaintext.
2. **Replay with substitution** (Phase 44.5a) — `buildVData({obj, order, overrides})`: caller supplies a captured 8-field `obj` + the observed `order`, optionally overrides individual fields, module builds the kv string + runs the cipher pipeline. Used for fixture replay and field-substitution experiments.
3. **From-obj synthesis** (Phase 44.5b) — `buildVDataFromObj({obj, seed, order})`: caller supplies an 8-field `obj`, module shuffles the field order via `Math.random` (default) or mulberry32 seeded PRNG (`--seed`) or an explicit `order` override, then runs the full pipeline. Used for end-to-end from-scratch generation.

| Module | Public exports | Purpose |
|---|---|---|
| `xtea.js` | `xteaEncryptBlock`, `xteaDecryptBlock`, `xteaEncryptLE(buf, keyWords)`, `xteaDecryptLE(buf, keyWords)`, `keyFromHex(hex)`, `XTEA_DELTA`, `XTEA_ROUNDS` | Classical XTEA. Block + buffer wrappers. |
| `custom-base64.js` | `customBase64Encode(buf) → string`, `customBase64Decode(str) → Buffer`, `OUTPUT_ALPHABET`, `PADDING_CHAR_INDEX` (= 64), `PADDING_CHAR` (= `'Y'`) | Standard base64 with the custom 65-char alphabet. |
| `encode.js` | `encodeVData(buf \| hex) → string`, `encryptOnly(buf \| hex) → Buffer`, `XTEA_KEY_HEX`, `KEY_WORDS`, `OUTPUT_ALPHABET`, `PLAINTEXT_LENGTH` (= 112), `EXPECTED_VDATA_LENGTH` (= 152) | Top-level cipher-only API. Hardcoded key, pre-computed key schedule. Enforces 112-byte plaintext requirement. |
| `build-plaintext.js` | `buildPlaintext({obj, order}) → string` | Builds the ≤110-byte `k=v&k=v&...` kv string from an 8-field obj + explicit order. Ports an earlier reference replay tool verbatim. |
| `replay.js` | `buildVData({obj, order, overrides}) → string` | Phase 44.5a replay entry point. Merges overrides via spread, calls `buildPlaintext`, pipes through `encodeVData`. |
| `build-from-obj.js` | `buildVDataFromObj({obj, seed, order}) → string`, `SCHEMA` (= `['tp','key','py','env','version','cLod','inf','ss']`), `mulberry32`, `shuffleSchema` | Phase 44.5b from-obj entry point. Three order sources: explicit `order` override, seeded mulberry32 PRNG (`seed`), or live `Math.random` (default). |
| `cli.js` | (script) | CLI with three subcommands: cipher-only (`--plaintext-hex <hex>` or stdin), `replay` (`--obj`, `--order`, `--overrides`, `--self-check`, `--verbose`), `from-obj` (`--obj`, `--seed`, `--order`, `--self-check`, `--verbose`). `--help` prints usage. |
| `README.md` | (doc) | Module-local quickstart + CLI examples. Defers to this file for the byte-level spec. |

**Example — cipher-only (Phase 43)**:
```javascript
const { encodeVData } = require('./tools/scraper/vdata-generator/encode.js');
const plaintext = Buffer.alloc(112); // your captured 112-byte plaintext
const vdata = encodeVData(plaintext);
// vdata is a 152-char string ending in 'YY'
```

**Example — replay (Phase 44.5a)**:
```javascript
const { buildVData } = require('./tools/scraper/vdata-generator/replay.js');
const obj = { inf: 'top', env: '1', tp: '...', key: 'qLCZ', py: '0', ss: '0%2C', cLod: 'unloadTDC', version: '2' };
const order = ['inf', 'env', 'tp', 'key', 'py', 'ss', 'cLod', 'version'];
const vdata = buildVData({ obj, order });
// Byte-identical to tests/fixtures/vdata-jsdom-capture.json.vdata_string
```

**Example — from-obj (Phase 44.5b)**:
```javascript
const { buildVDataFromObj } = require('./tools/scraper/vdata-generator/build-from-obj.js');
const obj = { /* 8 fields in any key order */ };
const vdata1 = buildVDataFromObj({ obj });                 // random Math.random order
const vdata2 = buildVDataFromObj({ obj, seed: 84121 });    // deterministic (Node 20 TimSort)
const vdata3 = buildVDataFromObj({ obj, order: [...] });   // explicit override (portable)
```

**Example — CLI**:
```bash
# cipher-only
echo 697465316f6e... | node tools/scraper/vdata-generator/cli.js
node tools/scraper/vdata-generator/cli.js --plaintext-hex 697465316f6e... --verbose

# replay
node tools/scraper/vdata-generator/cli.js replay --self-check
node tools/scraper/vdata-generator/cli.js replay --obj obj.json --order order.json --overrides '{"key":"ZZZZ"}'

# from-obj
node tools/scraper/vdata-generator/cli.js from-obj --self-check
node tools/scraper/vdata-generator/cli.js from-obj --obj obj.json --seed 84121
```

`encodeVData` and `encryptOnly` both throw if the plaintext is not exactly 112 bytes. The error message references this doc so callers cannot accidentally pass a too-short or too-long buffer through the cipher.

**Seed portability caveat**: the seeded-PRNG path reproduces captured fixtures only under Node 20's TimSort sort algorithm. Seeds are not stable across Node major versions (Node 22+ uses a different sort) or across JS engines. For portable fixture replay use the explicit `order` path; reserve `seed` for Node-20-specific reproduction. Committed Node-20 seeds: HAR fixture = `53818`, jsdom fixture = `84121`.

## 6. Provenance

Every claim in this doc is grounded in either bytecode reading, a dynamic trace, or a committed fixture. Pointers in chronological order:

| Claim | Source |
|---|---|
| Cipher is classical XTEA, not modified | Phase 40 walker disassembly at pcs 15241 (encrypt entry) and 15416 (decrypt entry); cross-checked by Phase 43.1 dynamic decrypt of HAR ciphertext with the recovered key |
| XTEA delta `0x9E3779B9`, 32 rounds | `OP_08` immediates at bytecode indices 15352 / 15530 (encrypt and decrypt round constants) |
| LE uint32 packing at the cipher boundary | Phase 43.1 dynamic trace — the captured pre-XTEA buffer matches the 112-byte plaintext only under LE packing |
| 16-byte XTEA key | Live capture of the encrypt closure call in Phase 43.1; confirmed identical between jsdom and HAR via decrypt round-trip |
| Alphabet length = 65, index 64 = padding | Phase 43.2 bytecode walker reads `OP_04 + 65 × OP_10 + OP_24` at pc 16932; encoder body at pcs 17084..17418 contains `isNaN`-guarded `OP_08 64` padding immediates at pcs 17395 and 17409 |
| 152-char output ends in `YY` | Arithmetic: `112 = 37·3 + 1` → final group needs 2 padding chars. Verified against both fixtures. |
| Plaintext is a tdc runtime-state probe, not the verify POST body nor a browser fingerprint | Phase 44.2.8 — fn 22317 `module.exports.getCaptchaData` walked end-to-end. Five fields inline (`py`, `env`, `version`, `cLod`, `inf`), three helpers decompiled (`tp` = fn 22400, `key` = fn 22730 via `require(18)(body,'tlg')`, `ss` = fn 23399). `tp` is a captured JS runtime error string — not a fingerprint. See §7.1. |
| Per-call field order is randomized, not derived from `obj` | Phase 44.4.1 — fn 23898 body `[23898..23944]` is `Math.random() > 0.5 ? -1 : 1`, created at pc 23945, passed to `arr.sort` at pc 23949. Runtime cross-check: `all_entry_counts[23898] = 15` per send (TimSort comparisons for an 8-element sort). See §7.2. |
| Pre-cipher transform chain is pad → ShiftRows → XTEA | Phase 44.4 — fn 13860 (webpack module 40) decompiled to fn 13989 (PKCS#7-style padder, alphabet `"0abcdefghijklmnop"`) → fn 14153 (ShiftRows permuter, `PERM = [0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11]`) → XTEA. See §7.3. |
| No `10 40` trailer | Phase 43.2 — corrects the 43.1 reading that mistook the trailing `YY` padding for raw 6-bit values `(64 << 6) | 64 = 0x1040` |

**Test fixtures**:
- `tests/fixtures/vdata-jsdom-capture.json` — frozen single-run jsdom capture.
- `tests/fixtures/vdata-har-capture.json` — real Chrome 146 HAR reference vector.
- `tests/fixtures/verify-vdata-fixtures.js` — pure-JS standalone reference verifier (no jsdom).

**Test suite**: `tests/test-vdata-generator-encoder.js` — 14 suites, 58 tests; covers fixture round-trips, XTEA unit tests, base64 unit tests, encode API tests, and a reference-verifier sanity check. `tests/test-vdata-builder.js` — 14 black-box tests across 5 suites (Phase 44.6): replay round-trip, from-obj `order` override, from-obj default `Math.random` shape, seeded-PRNG path (Node-20-guarded), fixture integrity canary.

**Related docs**:
- `docs/CAPTCHA_ORCHESTRATOR.md` §6 — where `vData` lives in the verify POST and how vm-slide installs the XHR proxy that ultimately calls this cipher.
- `docs/CHAOSVM_VARIANTS.md` — register-VM (`tdc.js`) vs stack-VM (`vm-slide`) comparison.
- `docs/VM_SLIDE_ARCHITECTURE.md` / `docs/VM_SLIDE_OPCODES.md` — vm-slide internals.

## 7. Plaintext Schema — 8-field tdc runtime-state probe (Phase 44 closeout)

The pre-cipher kv string is built inside **fn 22317**, the function exported as `module.exports.getCaptchaData` by vm-slide's webpack module fn 20970 (write at pc 24252, FUNC_CREATE at pc 24234, body `[22317..24233]`, argc = 2). Note that the name `getCaptchaData` is misleading — this function is **not** a browser-fingerprint collector. It is a **tdc runtime-state probe** that reports lifecycle, DOM embedding, captured error state, and a small hashed digest derived from the caller-supplied body. `tp` in particular is a captured JS runtime error string (e.g. `"Cannot read properties of null (reading 'src')"`), not a "type" or similar static field.

The schema is **8 fields, fixed**. Every call produces a kv string of the form `k1=v1&k2=v2&k3=v3&k4=v4&k5=v5&k6=v6&k7=v7&k8=v8` with exactly 8 `=` and 7 `&`. The order of the fields varies per call because of the Fisher-Yates anti-pattern shuffle (§7.2).

### 7.1 Field table

| Field | Source function / rule | Runtime sample (jsdom fixture) | Runtime sample (HAR fixture) |
|---|---|---|---|
| `tp` | fn 22400 — captures a JS runtime error string observed during page load; returns the error `.message` or a fallback empty string | `Cannot read properties of null (reading 'src')` | `7446039806946242560` |
| `key` | fn 22730 → `require(18)(body, 'tlg')` — char-lookup-loop digest of `arguments[0]` (the caller's body) under tag `"tlg"`, returns a 4-character alphanumeric code | `qLCZ` | `21L2` |
| `py` | `arguments[1].py` — pulled directly from the second argument (`{py}`) | `0` | `0` |
| `env` | `require(0)() ? '0' : '1'` — single module-0 predicate; `'1'` in the observed jsdom run, `'0'` in the observed HAR run | `1` | `0` |
| `version` | string literal `"2"` (hardcoded in fn 22317) | `2` | `2` |
| `cLod` | TDC lifecycle probe (pcs 23059..23224) — reads state flags from the tdc object, returns `"loadTDC"` or `"unloadTDC"` depending on whether the register-VM `tdc.js` init has completed | `unloadTDC` | `loadTDC` |
| `inf` | `window === window.top ? 'top' : 'iframe'` — iframe-position probe | `top` | `iframe` |
| `ss` | fn 23399 — small helper that emits a percent-encoded CSV-like summary string | `0%2C` | `11%2Ctdc%2Cslide%2Cvm` |

Five fields are built inline in fn 22317 (`py`, `env`, `version`, `cLod`, `inf`); three delegate to helper functions (`tp` = fn 22400, `key` = fn 22730, `ss` = fn 23399). All three helpers were decompiled during the Phase 44 closeout.

### 7.2 Per-call field-order shuffle

After the 8 fields are assembled into an array at pcs 23753..23894, fn 22317 calls `arr.sort(cmp)` at pc 23949 where `cmp` is a 2-arg closure created by `OP_58 23898 0 0` at pc 23945. The comparator body `[23898..23944]` is:

```javascript
// fn 23898 — the textbook JS Fisher-Yates anti-pattern
function cmp(a, b) {
  return Math.random() > 0.5 ? -1 : 1;
}
```

This is the classic "random shuffle via a nondeterministic comparator" footgun — it does not produce a uniform permutation, but it DOES scramble the order nondeterministically on every call. This is why the two committed fixtures ship different orders (`[inf,env,tp,key,py,ss,cLod,version]` for jsdom vs `[inf,env,tp,cLod,version,key,ss,py]` for HAR) despite having the same schema. Runtime cross-check: the fn-20539 entry trace shows `all_entry_counts[23898] = 15` per send, consistent with Node's TimSort comparing an 8-element array 15 times.

**Determinism implications for reproducers**:
- To byte-identically reproduce a captured fixture, you must supply the observed `order` explicitly (the `--order` / `{obj, order}` path in `tools/scraper/vdata-generator/`). This is portable across Node versions.
- Alternatively, under Node 20 TimSort specifically, a mulberry32-seeded `Math.random` replacement can reproduce the observed order: HAR fixture seed = `53818`, jsdom fixture seed = `84121`. Seeds are not portable to Node 22+ (different sort algorithm) or other JS engines.
- For synthesizing a fresh `vData` (no captured reference), any order will do — Tencent's verifier accepts whatever order the shuffle produces.

### 7.3 Pre-cipher transform chain (fn 13860 = webpack module 40 `encryptData`)

Once fn 22317 has built the kv string, it passes the result to fn 13860 which runs three sub-steps before the XTEA stage proper:

1. **PKCS#7-style pad (fn 13989)** — pads the ≤110-byte kv string to exactly 112 bytes using the alphabet `"0abcdefghijklmnop"`. Pad length = `16 - (len % 16)`; each pad byte is `alphabet[padLen]`, so a 6-byte pad emits `"ffffff"`, a 12-byte pad emits `"llllllllllll"`, etc. This is not RFC 5652 PKCS#7 — it uses printable characters instead of the pad-length byte — but the structure is analogous.
2. **ShiftRows permute (fn 14153)** — applies an AES-ShiftRows-style byte permutation to each 16-byte block with `PERM = [0,4,8,12,5,9,13,1,10,14,2,6,15,3,7,11]`. The forward permutation is used on encrypt; the inverse is used when decrypting a captured ciphertext back to the kv string.
3. **XTEA encrypt (module 41)** — 14 × 8-byte classical XTEA blocks with the key and parameters from §3.

All three sub-steps are ported into `tools/scraper/vdata-generator/build-plaintext.js` (steps 1–2) and `tools/scraper/vdata-generator/encode.js` (step 3). The logic was originally ported verbatim from an earlier reference replay tool.

### 7.4 Reproducibility contract

Phase 44 closes `vData` end-to-end reproducibility. Three specific claims:

1. Given a captured 112-byte plaintext, `encodeVData` reproduces the captured `vData` string byte-identically (Phase 43 closeout — 14-block XTEA + custom base64).
2. Given the captured 8-field `obj` + `order` from a fixture, `buildVData({obj, order})` reproduces the captured `vData` string byte-identically (Phase 44.5a closeout).
3. Given just the 8-field `obj`, `buildVDataFromObj({obj, seed: <Node-20 seed>})` reproduces the captured `vData` string byte-identically under Node 20 (Phase 44.5b closeout). Without `seed` or `order`, it produces a fresh valid `vData` on every call.

All three claims are locked down by `tests/test-vdata-builder.js` (Phase 44.6) and `tests/test-vdata-generator-encoder.js` (Phase 43.4). `npm test` is green end-to-end.
