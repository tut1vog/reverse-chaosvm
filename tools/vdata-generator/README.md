# tools/vdata-generator

Standalone byte-identical encoder for vm-slide's vData pipeline.

**Two entry points:**

1. **Cipher-only `encode` (Phase 43, shipped):** takes a 112-byte plaintext
   and emits the 152-char vData string. XTEA + custom base64.
2. **Replay-with-substitution `buildVData` (Phase 44.5a, this task):** takes
   a captured 8-field fingerprint object (`{tp, key, py, env, version, cLod,
   inf, ss}`), an optional join-order array, and an optional override map,
   and emits the 152-char vData string. Wraps the pre-cipher plaintext
   builder (kv build → PKCS#7-style pad → ShiftRows-style permute) and the
   Phase 43 cipher into one call. Both committed fixtures round-trip
   byte-identically through this path; see `cli.js replay --self-check`.

A future from-scratch builder that does **not** require a captured `obj`
(synthesizing all 8 fields from environment introspection alone) is planned
as task **44.5b**.

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

### Cipher-only mode (Phase 43)

```bash
# Argument form:
node tools/vdata-generator/cli.js --plaintext-hex <224-hex-char string>

# Stdin form:
echo <224-hex-char string> | node tools/vdata-generator/cli.js

# Verbose (key + ciphertext hex to stderr; stdout stays clean):
node tools/vdata-generator/cli.js --plaintext-hex <hex> --verbose
```

### Replay mode (Phase 44.5a)

```bash
# Self-check both committed fixtures end-to-end:
node tools/vdata-generator/cli.js replay --self-check

# Replay an obj + explicit order from JSON files (jsdom fixture form):
cat > /tmp/jsdom-obj.json <<'JSON'
{
  "inf": "top",
  "env": "1",
  "tp": "Cannot read properties of null (reading 'src')",
  "key": "qLCZ",
  "py": "0",
  "ss": "0%2C",
  "cLod": "unloadTDC",
  "version": "2"
}
JSON
cat > /tmp/jsdom-order.json <<'JSON'
["inf","env","tp","key","py","ss","cLod","version"]
JSON
node tools/vdata-generator/cli.js replay \
  --obj /tmp/jsdom-obj.json --order /tmp/jsdom-order.json
# -> reproduces the jsdom fixture's vdata_string byte-for-byte

# HAR fixture form (different order):
cat > /tmp/har-obj.json <<'JSON'
{
  "inf": "iframe",
  "env": "0",
  "tp": "7446039806946242560",
  "cLod": "loadTDC",
  "version": "2",
  "key": "21L2",
  "ss": "11%2Ctdc%2Cslide%2Cvm",
  "py": "0"
}
JSON
cat > /tmp/har-order.json <<'JSON'
["inf","env","tp","cLod","version","key","ss","py"]
JSON
node tools/vdata-generator/cli.js replay \
  --obj /tmp/har-obj.json --order /tmp/har-order.json
# -> reproduces the HAR fixture's har_vdata_string byte-for-byte

# Substitution: override one or more fields and re-emit:
echo '{"key":"ZZZZ"}' > /tmp/ov.json
node tools/vdata-generator/cli.js replay \
  --obj /tmp/jsdom-obj.json --order /tmp/jsdom-order.json --overrides /tmp/ov.json
# -> a new 152-char vData string on the Phase 43 alphabet
```

Stdout receives the 152-char vData string + newline. Errors and verbose
diagnostics go to stderr. Exit codes: `0` success, `1` runtime error,
`2` argument error.

## Programmatic API

```js
// Cipher-only (Phase 43):
const { encodeVData, encryptOnly } = require('./tools/vdata-generator/encode.js');
const vdata = encodeVData(buf112);          // Buffer or hex string -> 152-char string
const ciphertext = encryptOnly(buf112);     // Buffer or hex string -> 112-byte Buffer

// Replay-with-substitution (Phase 44.5a):
const { buildVData } = require('./tools/vdata-generator/replay.js');
const out = buildVData({
  obj: { inf: 'top', env: '1', tp: '...', key: 'qLCZ', py: '0',
         ss: '0%2C', cLod: 'unloadTDC', version: '2' },
  order: ['inf','env','tp','key','py','ss','cLod','version'], // optional
  overrides: { key: 'ZZZZ' },                                   // optional
});

// Pre-cipher plaintext builder, exposed standalone:
const { buildPlaintext } = require('./tools/vdata-generator/build-plaintext.js');
const buf112 = buildPlaintext({ obj, order });
```

`encodeVData` / `encryptOnly` accept either a `Buffer` or an even-length hex
string and throw if the plaintext is not exactly 112 bytes. `buildVData` and
`buildPlaintext` produce 112-byte plaintexts from any 8-field fingerprint
object (the joined `key=value&...` string is padded out to a 16-byte
boundary by the porter of fn 13989).

## Provenance

- `research/vm-slide-stack-vm/extract-alphabet.js` — extracts the 65-char alphabet from vm-slide pc 16932.
- `research/vm-slide-stack-vm/vdata-dynamic-trace.js` — original dynamic-trace harness.
- `research/vm-slide-stack-vm/VDATA-PIPELINE.md` — authoritative spec (43.1 + 43.2 corrections).
- `tests/fixtures/vdata-jsdom-capture.json` — synthetic fixture (jsdom capture).
- `tests/fixtures/vdata-har-capture.json` — real Chrome 146 HAR fixture.
- `tests/fixtures/verify-vdata-fixtures.js` — 43.2 reference verifier (logic copied here, then factored).
- `research/vm-slide-stack-vm/build-fingerprint-plaintext.js` — Phase 44.4 reference replay tool. The logic for `build-plaintext.js` was copied verbatim from this file (per `.claude/rules/research-artifacts.md`, tools must not import from `research/`).
- `research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md` — schema for the 8 fingerprint fields and the per-fixture observed orders.
