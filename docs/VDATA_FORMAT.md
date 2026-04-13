# vData Format Reference — vm-slide ChaosVM

> **Authoritative document for the cipher half of vm-slide's `vData` field.** Phase 43 (closed 2026-04-13). Supersedes the cipher-pipeline notes that previously lived only in `research/vm-slide-stack-vm/VDATA-PIPELINE.md`.
>
> **Scope is the cipher half only.** This doc covers how a 112-byte plaintext becomes the 152-character `vData` string. It does **not** cover where that 112-byte plaintext comes from — vm-slide builds it at runtime inside `proxyXHR` from a JS-environment fingerprint (`typeof`, property enumeration, object stringification), and reversing that builder is **Phase 44**, an open track. See `research/vm-slide-stack-vm/VDATA-PIPELINE.md` §8 for the open questions on the plaintext side.

## 1. Overview

`vData` is a 152-character form-field appended to Tencent's `/cap_union_new_verify` POST body by vm-slide's `XMLHttpRequest.prototype.send` monkey-patch (installed by the `proxyXHR` routine on non-IE browsers — see `docs/CAPTCHA_ORCHESTRATOR.md` §6). On IE9 and below the same value is computed by `window.getVData(query)` instead. Both code paths run the same cipher pipeline; only the plaintext source differs in the IE9 case.

```
┌──────────────────────────────────────────────────────────────────┐
│            vData field appended to the verify POST                │
│                  (152 characters, ends in YY)                     │
├──────────────────────────────────────────────────────────────────┤
│ 112-byte plaintext (Phase 44 — JS fingerprint)                   │
│   │                                                               │
│   │  Step 1: classical XTEA encrypt                              │
│   ▼  (32 rounds, delta 0x9E3779B9, LE uint32 packing)            │
│ 112-byte ciphertext (14 × 8-byte XTEA blocks)                    │
│   │                                                               │
│   │  Step 2: standard base64 with custom 65-char alphabet        │
│   ▼  (index 64 = `Y` = padding char; isNaN-guarded encoder)      │
│ 152-char vData string ending in "YY" (the 2 padding chars)        │
└──────────────────────────────────────────────────────────────────┘
```

**Verified.** The standalone reimplementation (`tools/vdata-generator/`) produces byte-identical output against two committed fixtures: `tests/fixtures/vdata-jsdom-capture.json` (synthetic via jsdom) and `tests/fixtures/vdata-har-capture.json` (a real Chrome 146 HAR capture from `sample/captcha-har.har`). Both directions (encode + decode + XTEA encrypt + XTEA decrypt) round-trip in `tests/test-vdata-generator-encoder.js` (Phase 43.4) and in the standalone `tests/fixtures/verify-vdata-fixtures.js` (Phase 43.2).

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
| Source | Bytecode constant inside vm-slide's `__TENCENT_CHAOS_STACK`, recovered live by `research/vm-slide-stack-vm/vdata-dynamic-trace.js` (Phase 43.1) and verified against the bytecode at the encrypt closure entry (pc 15241) |

The key is **constant across runs and across sessions**, identical between the jsdom harness and the real Chrome 146 HAR. It is not derived from session state, the verify POST body, the nonce, or the eks token.

> **Note on the two endiannesses**. The 16-byte key is read as four big-endian uint32 words to form the XTEA key schedule, but the per-block plaintext/ciphertext bytes are read and written as little-endian uint32 words. This split is unusual but is what the bytecode actually does — see `tools/vdata-generator/xtea.js` `keyFromHex` (BE) versus `xteaEncryptLE` (LE).

### Encoding alphabet

| Field | Value |
|---|---|
| Alphabet | `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY` |
| Length | 65 |
| Padding char | `Y` (index 64) |
| Source | Built at vm-slide bytecode pc 16932 by an `OP_04 + 65 × OP_10 + OP_24` string-build sequence; encoder body lives at pcs 17084..17418 with `isNaN`-guarded `OP_08 64` padding immediates at pcs 17395 and 17409. Recovered by `research/vm-slide-stack-vm/extract-alphabet.js` (Phase 43.2). |

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
const { encodeVData } = require('./tools/vdata-generator/encode.js');
const f = require('./tests/fixtures/vdata-jsdom-capture.json');
console.log(encodeVData(Buffer.from(f.plaintext_hex, 'hex')));
"
```

The HAR fixture (`tests/fixtures/vdata-har-capture.json`) demonstrates the same pipeline against a real Chrome 146 capture — same key, same alphabet, different plaintext, byte-identical reproduction of the live `vData` string.

## 5. Public API — `tools/vdata-generator/`

The standalone encoder is a five-file CommonJS module with no external dependencies.

| Module | Public exports | Purpose |
|---|---|---|
| `xtea.js` | `xteaEncryptBlock`, `xteaDecryptBlock`, `xteaEncryptLE(buf, keyWords)`, `xteaDecryptLE(buf, keyWords)`, `keyFromHex(hex)`, `XTEA_DELTA`, `XTEA_ROUNDS` | Classical XTEA. Block + buffer wrappers. |
| `custom-base64.js` | `customBase64Encode(buf) → string`, `customBase64Decode(str) → Buffer`, `OUTPUT_ALPHABET`, `PADDING_CHAR_INDEX` (= 64), `PADDING_CHAR` (= `'Y'`) | Standard base64 with the custom 65-char alphabet. |
| `encode.js` | `encodeVData(buf \| hex) → string`, `encryptOnly(buf \| hex) → Buffer`, `XTEA_KEY_HEX`, `KEY_WORDS`, `OUTPUT_ALPHABET`, `PLAINTEXT_LENGTH` (= 112), `EXPECTED_VDATA_LENGTH` (= 152) | Top-level encode API. Hardcoded key, pre-computed key schedule. Enforces 112-byte plaintext requirement. |
| `cli.js` | (script) | CLI: `--plaintext-hex <hex>` or stdin → `vData` to stdout. `--verbose` prints intermediate ciphertext to stderr. `--help` prints usage. |
| `README.md` | (doc) | Module-local quickstart. Defers to this file for the byte-level spec. |

**Example — programmatic**:
```javascript
const { encodeVData } = require('./tools/vdata-generator/encode.js');
const plaintext = Buffer.alloc(112); // your 112-byte fingerprint
const vdata = encodeVData(plaintext);
// vdata is a 152-char string ending in 'YY'
```

**Example — CLI**:
```bash
echo 697465316f6e... | node tools/vdata-generator/cli.js
node tools/vdata-generator/cli.js --plaintext-hex 697465316f6e... --verbose
```

`encodeVData` and `encryptOnly` both throw if the plaintext is not exactly 112 bytes. The error message names both the `112` requirement and **Phase 44** (the open track that owns reversing the plaintext builder). This is intentional: the boundary is enforced at runtime, not just documented, so callers cannot accidentally pass a too-short or too-long buffer through the cipher.

## 6. Provenance

Every claim in this doc is grounded in either bytecode reading, a dynamic trace, or a committed fixture. Pointers in chronological order:

| Claim | Source |
|---|---|
| Cipher is classical XTEA, not modified | Phase 40 walker output `output/vm-slide/disassembly-full.txt` at pcs 15241 (encrypt entry) and 15416 (decrypt entry); cross-checked by Phase 43.1 dynamic decrypt of HAR ciphertext with the recovered key |
| XTEA delta `0x9E3779B9`, 32 rounds | `OP_08` immediates at bytecode indices 15352 / 15530 (encrypt and decrypt round constants) |
| LE uint32 packing at the cipher boundary | Phase 43.1 dynamic trace `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — the captured pre-XTEA buffer matches the 112-byte plaintext only under LE packing |
| 16-byte XTEA key | Live capture of the encrypt closure call in Phase 43.1; confirmed identical between jsdom and HAR via decrypt round-trip |
| Alphabet length = 65, index 64 = padding | Phase 43.2 walker `research/vm-slide-stack-vm/extract-alphabet.js` reads `OP_04 + 65 × OP_10 + OP_24` at pc 16932; encoder body at pcs 17084..17418 contains `isNaN`-guarded `OP_08 64` padding immediates at pcs 17395 and 17409 |
| 152-char output ends in `YY` | Arithmetic: `112 = 37·3 + 1` → final group needs 2 padding chars. Verified against both fixtures. |
| Plaintext is a JS-environment fingerprint, not the verify POST body | Phase 43.1 — decrypt of both jsdom and HAR ciphertext yields a 112-byte `k=v&k=v&...` structure whose content differs from the verify POST and varies per run |
| No `10 40` trailer | Phase 43.2 — corrects the 43.1 reading that mistook the trailing `YY` padding for raw 6-bit values `(64 << 6) | 64 = 0x1040` |

**Research artifacts**:
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` — full research-track spec with all 8 sections.
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — instrumented jsdom harness; the dynamic oracle for new captures.
- `research/vm-slide-stack-vm/extract-alphabet.js` — bytecode walker that authoritatively counted the 65 alphabet characters.
- `research/vm-slide-stack-vm/VDATA-RESOLUTION.md` — Phase 42 mechanism resolution (XHR proxy installation).

**Test fixtures**:
- `tests/fixtures/vdata-jsdom-capture.json` — frozen single-run jsdom capture.
- `tests/fixtures/vdata-har-capture.json` — real Chrome 146 HAR reference vector.
- `tests/fixtures/verify-vdata-fixtures.js` — pure-JS standalone reference verifier (no jsdom).

**Test suite**: `tests/test-vdata-generator-encoder.js` — 14 suites, 58 tests; covers fixture round-trips, XTEA unit tests, base64 unit tests, encode API tests, and a reference-verifier sanity check.

**Related docs**:
- `docs/CAPTCHA_ORCHESTRATOR.md` §6 — where `vData` lives in the verify POST and how vm-slide installs the XHR proxy that ultimately calls this cipher.
- `docs/CHAOSVM_VARIANTS.md` — register-VM (`tdc.js`) vs stack-VM (`vm-slide`) comparison.
- `docs/VM_SLIDE_ARCHITECTURE.md` / `docs/VM_SLIDE_OPCODES.md` — vm-slide internals.

## 7. Open questions (Phase 44)

The cipher half is fully reproducible. The plaintext half is not. Specifically:

1. The exact 8 fields of the 112-byte `key=value&key=value&...` plaintext.
2. Their source values (which `typeof`, which property enumerations, which object stringifications).
3. The order in which they are concatenated (the per-run byte-order variability suggests memory-ordered iteration or an internal salt).
4. Why the schema produces a fixed character multiset across runs even though the byte order varies.

These are tracked in `research/vm-slide-stack-vm/VDATA-PIPELINE.md` §8 and will be addressed by Phase 44 (open, no active tasks). Until Phase 44 closes, byte-identical end-to-end `vData` reproducibility from scratch (without a captured plaintext) is not possible. The Phase 43 encoder is correct as a re-encoder — it produces byte-identical output given a captured 112-byte plaintext — but cannot synthesize a fresh plaintext on its own.
