# tools/scraper/vdata-generator

Standalone byte-identical encoder for vm-slide's vData pipeline.

**Three entry points:**

1. **Cipher-only `encode` (Phase 43, shipped):** takes a 112-byte plaintext
   and emits the 152-char vData string. XTEA + custom base64.
2. **Replay-with-substitution `buildVData` (Phase 44.5a):** takes a captured
   8-field fingerprint object (`{tp, key, py, env, version, cLod, inf, ss}`),
   an optional join-order array, and an optional override map, and emits
   the 152-char vData string. Wraps the pre-cipher plaintext builder
   (kv build → PKCS#7-style pad → ShiftRows-style permute) and the Phase 43
   cipher into one call. Both committed fixtures round-trip byte-identically
   through this path; see `cli.js replay --self-check`.
3. **Full-synthesis `buildVDataFromObj` (Phase 44.5b, this task):** takes the
   same 8-field obj but does NOT require a caller-supplied join order.
   Constructs the schema array in fn 22317's literal source order
   (`['tp','key','py','env','version','cLod','inf','ss']`) and shuffles it
   via the exact comparator shape fn 23898 uses at runtime
   (`arr.sort(() => rng() > 0.5 ? -1 : 1)`) before joining. Nondeterministic
   by default (uses `Math.random`), matching vm-slide's true runtime
   behavior. Two deterministic escape hatches: `--seed <n>` (seeded
   mulberry32 PRNG) and `--order <path>` (explicit override).

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
| XTEA key (hex)      | `32653433306638633135623764613936` (ASCII `2e430f8c15b7da96`)        | `docs/VDATA_FORMAT.md` §3             |
| XTEA delta          | `0x9E3779B9`                                                         | `docs/VDATA_FORMAT.md` §3             |
| XTEA rounds         | 32                                                                   | `docs/VDATA_FORMAT.md` §3             |
| Block packing       | little-endian uint32 pairs                                           | `docs/VDATA_FORMAT.md` §3             |
| Output alphabet     | `GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY`   | `docs/VDATA_FORMAT.md` §3             |
| Padding char index  | 64 (`Y`)                                                             | `docs/VDATA_FORMAT.md` §2             |
| Plaintext size      | 112 bytes (14 blocks)                                                | `docs/VDATA_FORMAT.md` §2             |
| Output size         | 152 chars                                                            | `docs/VDATA_FORMAT.md` §2             |

## CLI usage

### Cipher-only mode (Phase 43)

```bash
# Argument form:
node tools/scraper/vdata-generator/cli.js --plaintext-hex <224-hex-char string>

# Stdin form:
echo <224-hex-char string> | node tools/scraper/vdata-generator/cli.js

# Verbose (key + ciphertext hex to stderr; stdout stays clean):
node tools/scraper/vdata-generator/cli.js --plaintext-hex <hex> --verbose
```

### Replay mode (Phase 44.5a)

```bash
# Self-check both committed fixtures end-to-end:
node tools/scraper/vdata-generator/cli.js replay --self-check

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
node tools/scraper/vdata-generator/cli.js replay \
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
node tools/scraper/vdata-generator/cli.js replay \
  --obj /tmp/har-obj.json --order /tmp/har-order.json
# -> reproduces the HAR fixture's har_vdata_string byte-for-byte

# Substitution: override one or more fields and re-emit:
echo '{"key":"ZZZZ"}' > /tmp/ov.json
node tools/scraper/vdata-generator/cli.js replay \
  --obj /tmp/jsdom-obj.json --order /tmp/jsdom-order.json --overrides /tmp/ov.json
# -> a new 152-char vData string on the Phase 43 alphabet
```

### From-obj mode (Phase 44.5b)

Full synthesis: give it the 8-field obj and it picks the join order itself
(matching fn 22317's `arr.sort(() => Math.random() > 0.5 ? -1 : 1)` shuffle).
Nondeterministic by default — different invocations produce different
(equally valid) vData strings.

```bash
# Self-check (one fixture via --seed, the other via --order, both byte-identical):
node tools/scraper/vdata-generator/cli.js from-obj --self-check

# Nondeterministic (real Math.random, default):
node tools/scraper/vdata-generator/cli.js from-obj --obj /tmp/jsdom-obj.json
# -> a fresh 152-char vData each call

# Deterministic via seeded mulberry32 PRNG:
node tools/scraper/vdata-generator/cli.js from-obj --obj /tmp/jsdom-obj.json --seed 84121
# -> reproduces the jsdom fixture's vdata_string on Node 20
#    (HAR fixture: --seed 53818)

# Deterministic via explicit order override (skips shuffle entirely):
node tools/scraper/vdata-generator/cli.js from-obj \
  --obj /tmp/jsdom-obj.json --order /tmp/jsdom-order.json
# -> reproduces the jsdom fixture's vdata_string byte-for-byte
```

**Seeded-PRNG fixture reproduction note:** the `--seed` flag uses an inline
mulberry32 PRNG (no dependencies, ~8 lines). A sweep of seeds 0..200000
against the exact comparator shape above found working seeds for both
committed fixtures under Node 20 / V8 TimSort:

| Fixture | Captured order                              | Working seed |
|---------|----------------------------------------------|--------------|
| HAR     | `[inf,env,tp,cLod,version,key,ss,py]`        | `53818`      |
| jsdom   | `[inf,env,tp,key,py,ss,cLod,version]`        | `84121`      |

These seeds are stable for a given Node major version's sort algorithm
but are NOT portable across engines — a different sort implementation
would make a different sequence of comparator calls and produce a
different order for the same seed. For portable deterministic reproduction
use `--order`, which bypasses the shuffle entirely. The sweep harness
lives at `output/vdata-generator-smoke/seed-sweep.js`.

**Difference from `replay`:** `replay` takes a full `{obj, order}` pair
captured from a real vm-slide run and re-encodes it (optionally with
substitutions). `from-obj` takes only `obj` and picks the order itself,
reproducing fn 22317's live behavior.

Stdout receives the 152-char vData string + newline. Errors and verbose
diagnostics go to stderr. Exit codes: `0` success, `1` runtime error,
`2` argument error.

## Programmatic API

```js
// Cipher-only (Phase 43):
const { encodeVData, encryptOnly } = require('./tools/scraper/vdata-generator/encode.js');
const vdata = encodeVData(buf112);          // Buffer or hex string -> 152-char string
const ciphertext = encryptOnly(buf112);     // Buffer or hex string -> 112-byte Buffer

// Replay-with-substitution (Phase 44.5a):
const { buildVData } = require('./tools/scraper/vdata-generator/replay.js');
const out = buildVData({
  obj: { inf: 'top', env: '1', tp: '...', key: 'qLCZ', py: '0',
         ss: '0%2C', cLod: 'unloadTDC', version: '2' },
  order: ['inf','env','tp','key','py','ss','cLod','version'], // optional
  overrides: { key: 'ZZZZ' },                                   // optional
});

// Full-synthesis from-scratch (Phase 44.5b):
const { buildVDataFromObj } = require('./tools/scraper/vdata-generator/build-from-obj.js');
const v1 = buildVDataFromObj({ obj });                  // nondeterministic
const v2 = buildVDataFromObj({ obj, seed: 84121 });     // deterministic via seed
const v3 = buildVDataFromObj({ obj, order: ['inf','env','tp','key','py','ss','cLod','version'] }); // explicit

// Scraper entry point: key computed from POST body (Phase 45.2):
const { buildVDataForPost } = require('./tools/scraper/vdata-generator/for-post.js');
const profile = {
  tp: '7446039806946242560',
  py: '0',
  env: '0',
  version: '2',
  cLod: 'loadTDC',
  inf: 'iframe',
  ss: '11%2Ctdc%2Cslide%2Cvm',
  // key: '__COMPUTED__'  // optional sentinel; absent is also fine
};
const body = 'tlg=8128&sess=s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79s';
const vdata = buildVDataForPost(body, { profile });
if (vdata.length !== 152) throw new Error('expected 152-char vData');

// Pre-cipher plaintext builder, exposed standalone:
const { buildPlaintext } = require('./tools/scraper/vdata-generator/build-plaintext.js');
const buf112 = buildPlaintext({ obj, order });
```

### Caller preconditions for `buildVDataForPost`

- The `postBody` MUST contain a `tlg=<digits>` substring where every digit
  value is a valid index into the `sess` value (the orchestrator sets
  `tlg = collect.length`, so the scraper wiring in Phase 45.4 must ensure
  this before calling `buildVDataForPost`).
- The `postBody` MUST contain a `sess=<string>` substring whose length is at
  least `max(digits) + 1`.
- `profile.key` must be absent or equal to the literal `'__COMPUTED__'`
  sentinel; any other value throws. `overrides.key` is likewise rejected.
  The computed `key` comes from `computeKeyField(postBody)` unconditionally —
  a body-independent key would be a trivial server-side detector.

`encodeVData` / `encryptOnly` accept either a `Buffer` or an even-length hex
string and throw if the plaintext is not exactly 112 bytes. `buildVData` and
`buildPlaintext` produce 112-byte plaintexts from any 8-field fingerprint
object (the joined `key=value&...` string is padded out to a 16-byte
boundary by the porter of fn 13989).

## Provenance

- `docs/VDATA_FORMAT.md` — authoritative end-to-end spec for the cipher and plaintext halves (supersedes the earlier research-track notes).
- `tests/fixtures/vdata-jsdom-capture.json` — synthetic fixture (jsdom capture).
- `tests/fixtures/vdata-har-capture.json` — real Chrome 146 HAR fixture.
- `tests/fixtures/verify-vdata-fixtures.js` — 43.2 reference verifier (logic copied here, then factored).
- The 65-char alphabet was extracted from vm-slide pc 16932. The logic for `build-plaintext.js` was originally ported verbatim from an earlier reference replay tool.
