# tools/vdata-generator

Standalone byte-identical encoder for vm-slide's vData cipher pipeline (Phase 43).

**Scope — cipher half only.** This tool takes a 112-byte plaintext and emits
the 152-char vData string. The 112-byte plaintext is a JS-environment
fingerprint that vm-slide's `proxyXHR` builds at runtime; **reversing the
plaintext builder is Phase 44** and is not handled here. You supply the
plaintext; this tool runs the cipher.

## Pipeline

1. **XTEA encrypt** — classical XTEA, 32 rounds, delta `0x9E3779B9`, LE uint32
   packing, 14 × 8-byte blocks. Key recovered from vm-slide bytecode.
2. **Custom base64** — standard 3-byte → 4-sextet base64 using a 65-char
   alphabet read directly from vm-slide pc 16932. Index 64 (`Y`) is the
   padding character. 112 bytes → 152 chars, always ending in `YY`.

There is no separate trailer. The `YY` suffix is the base64 padding pair
for the final group (1 data byte + 2 padding chars). The 43.1 "10 40
trailer" reading was wrong; corrected by 43.2.

## Crypto parameters

| Parameter           | Value                                                                | Source                                |
|---------------------|----------------------------------------------------------------------|---------------------------------------|
| XTEA key (hex)      | `32653433306638633135623764613936` (ASCII `2e430f8c15b7da96`)        | `VDATA-PIPELINE.md` §3                |
| XTEA delta          | `0x9E3779B9`                                                         | `VDATA-PIPELINE.md` §3                |
| XTEA rounds         | 32                                                                   | `VDATA-PIPELINE.md` §3                |
| Block packing       | little-endian uint32 pairs                                           | `VDATA-PIPELINE.md` §3                |
| Output alphabet     | `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`   | `VDATA-PIPELINE.md` §5                |
| Padding char index  | 64 (`Y`)                                                             | `VDATA-PIPELINE.md` §6                |
| Plaintext size      | 112 bytes (14 blocks)                                                | `VDATA-PIPELINE.md` §3                |
| Output size         | 152 chars                                                            | `VDATA-PIPELINE.md` §6                |

## CLI usage

```bash
# Argument form:
node tools/vdata-generator/cli.js --plaintext-hex <224-hex-char string>

# Stdin form:
echo <224-hex-char string> | node tools/vdata-generator/cli.js

# Verbose (key + ciphertext hex to stderr; stdout stays clean):
node tools/vdata-generator/cli.js --plaintext-hex <hex> --verbose
```

Stdout receives the 152-char vData string + newline. Errors and verbose
diagnostics go to stderr. Exit codes: `0` success, `1` runtime error,
`2` argument error.

## Programmatic API

```js
const { encodeVData, encryptOnly } = require('./tools/vdata-generator/encode.js');

const vdata = encodeVData(buf112);          // Buffer or hex string -> 152-char string
const ciphertext = encryptOnly(buf112);     // Buffer or hex string -> 112-byte Buffer
```

Both functions accept either a `Buffer` or an even-length hex string, and
throw if the resulting plaintext is not exactly 112 bytes.

## Provenance

- `research/vm-slide-stack-vm/extract-alphabet.js` — extracts the 65-char alphabet from vm-slide pc 16932.
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — original dynamic-trace harness.
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` — authoritative spec (43.1 + 43.2 corrections).
- `tests/fixtures/vdata-jsdom-capture.json` — synthetic fixture (jsdom capture).
- `tests/fixtures/vdata-har-capture.json` — real Chrome 146 HAR fixture.
- `tests/fixtures/verify-vdata-fixtures.js` — 43.2 reference verifier (logic copied here, then factored).
