# Token Decryption Guide — Tencent TDC CAPTCHA Payload

How to extract and decrypt browser fingerprint data from a live TDC CAPTCHA request.

## Quick Start

```js
const { decodeToken, urlDecode } = require('./jsdom');

// Extract the `collect` field from the CAPTCHA POST payload
const payload = require('fs').readFileSync('payload.txt', 'utf8').trim();
const collectRaw = payload.match(/collect=([^&]+)/)[1];

// IMPORTANT: Preserve '+' as a base64 character (not a space)
const collect = decodeURIComponent(collectRaw.replace(/\+/g, '%2B'));

// Decrypt and parse
const result = decodeToken(collect);

console.log(result.cdParsed);   // Array of 60 fingerprint entries
console.log(result.sdParsed);   // Session data (slide trajectory, etc.)
```

> **Key compatibility:** The XTEA key is hardcoded in `token/crypto-core.js` (extracted from `tdc.js`). This key is shared across `tdc.js`, `tdc-v3.js`, and `tdc-v4.js`. If a different TDC build uses a different key, `decryptionOk` will be `true` but `parseOk` will be `false` — the JSON will be garbage.

---

## The CAPTCHA POST Payload

When a user completes a Tencent CAPTCHA challenge, the browser sends a POST request containing ~35 parameters. The encrypted fingerprint is in the `collect` field.

### Parameter Reference

| Parameter | Size | Description |
|-----------|------|-------------|
| `aid` | 10 chars | App ID — identifies the integrating service |
| `protocol` | ~5 | `https` or `http` |
| `accver` | 1 | Account version (always `1`) |
| `showtype` | ~5 | CAPTCHA presentation mode: `popup`, `embed` |
| `ua` | ~150 | User-Agent string, **base64-encoded** |
| `sess` | ~320 | Session token (server-issued, opaque) |
| `sid` | ~19 | Session ID (numeric string) |
| `rnd` | ~6 | Random nonce (numeric) |
| `prehandleLoadTime` | ~3 | Time (ms) for pre-handle load |
| `createIframeStart` | 13 | Timestamp (ms) when CAPTCHA iframe was created |
| `subsid` | ~2 | Sub-session ID |
| `ans` | ~8 | CAPTCHA answer — e.g. `"464,158;"` (slide x,y coordinates) |
| **`collect`** | **~9000** | **Encrypted fingerprint token (this is the main payload)** |
| `tlg` | ~4 | Token length (echoes `collect.length`) |
| `eks` | ~310 | Encrypted key schedule (different XTEA key — not decryptable with our key) |
| `nonce` | 16 | Server-provided nonce (hex string) |
| `vlg` | ~5 | Version/log flags: `"0_0_1"` |
| `vData` | ~150 | Verification data (different encryption — not decryptable with our key) |

### Fields We Cannot Decrypt

- **`eks`** — Encrypted key schedule, uses a different XTEA key. Decryption produces binary garbage.
- **`vData`** — Verification data, also uses a different key. Uses URL-safe base64 (`*` for `+`, `_` for `/`).
- **`sess`** — Server-issued session token, URL-safe base64 with `-` and `_`.

---

## Decryption Pipeline

The `collect` field goes through 5 encoding layers. To decode, peel them off outermost-first:

```
collect string
    │
    ▼  (no URL decoding needed — '+' is literal base64, not space)
Base64 decode
    │
    ▼  Raw bytes (ECB mode — each 8-byte block independent)
XTEA decrypt (32 rounds, key = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140])
    │
    ▼  Strip trailing \0 and spaces
JSON parse
    │
    ▼
{"cd": [...], "sd": {...}}
```

### Gotcha: `+` Handling

When the `collect` field appears in `application/x-www-form-urlencoded` POST data, `+` is a valid base64 character, **not** a space. If you extract it with `URLSearchParams`, it will silently convert `+` to spaces, corrupting the base64 and producing partial decryption failures.

**Correct extraction:**
```js
const collectRaw = payload.match(/collect=([^&]+)/)[1];
const collect = decodeURIComponent(collectRaw.replace(/\+/g, '%2B'));
```

**Wrong extraction:**
```js
const params = new URLSearchParams(payload);
const collect = params.get('collect'); // BROKEN — '+' becomes ' '
```

---

## Decrypted Payload Structure

The decrypted JSON has two top-level fields:

```json
{
  "cd": [ ... ],   // Collector data — 60 browser fingerprint entries
  "sd": { ... }    // Session data — CAPTCHA interaction telemetry
}
```

### `cd` — Collector Data (Browser Fingerprint)

The `cd` array contains interleaved keys and values. Keys are numeric indices that map to specific browser APIs. See `docs/COLLECTOR_SCHEMA.md` for the full 59-field reference.

**Example decoded fingerprint (from a real Chrome 146 / Windows / Intel Iris Xe machine):**

| Index | Field | Value |
|-------|-------|-------|
| 1 | OS platform | `"windows"` |
| 2 | Screen width | `1707` |
| 4 | Detected fonts | Arial, Arial Black, Courier New, SimSun, SimHei, Microsoft YaHei... (27 fonts) |
| 6 | Languages | `["en-US", "zh-CN", "zh"]` |
| 8 | Screen resolution | `[360, 360]` |
| 12 | Video codecs | H.264 ✓, H.265 ✓, VP8 ✓, VP9 ✓, AV1 ✓, Theora ✗ |
| 18 | Audio fingerprint | `{nt_vc_output: {ac-baseLatency: 0.01, ac-sampleRate: 48000, ...}, pxi_output: 10240}` |
| 20 | WebGL canvas | Base64-encoded rendered image |
| 25 | Video codecs (alt) | Same as index 12 but via `HTMLVideoElement.canPlayType()` |
| 26 | Timezone offset | `"+08"` |
| 28 | Color gamut | `"srgb"` |
| 29 | Audio codecs | AAC ✓, MP3 ✓, Ogg Vorbis/Opus ✓, WAV ✓, FLAC ✓ |
| 31 | User-Agent | `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/146.0.0.0"` |
| 34 | Intl options | `{timeZone: "Asia/Shanghai", calendar: "gregory", locale: "en-GB"}` |
| 36 | Vendor | `"Google Inc. (Intel)"` |
| 37 | UA client hints | `{architecture: "x86", bitness: "64", brands: [...], platform: "Windows", platformVersion: "19.0.0"}` |
| 40 | GPU renderer | `"ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A0) Direct3D11 vs_5_0 ps_5_0, D3D11)"` |
| 41 | Frame status | `"iframe"` |
| 42 | WebGPU limits | `{maxTextureDimension1D: 16384, maxBufferSize: 2147483648, ...}` |
| 46 | UA data (low-entropy) | `{brands: [{brand: "Chromium", version: "146"}, ...], mobile: false, platform: "Windows"}` |
| 48 | Platform | `"Win32"` |
| 57 | Feature bitmask | `1023` (= 0x3FF, all 10 feature bits set) |

#### Behavioral Events (Index 1, second occurrence)

The `cd` array includes a behavioral events sub-array — raw mouse/keyboard/touch events recorded during the CAPTCHA interaction:

```
[eventType, deltaX, deltaY, timestamp, 0, 0, 0, 0]
```

| eventType | Meaning |
|-----------|---------|
| 1 | `mousemove` |
| 2 | `mousedown` |
| 3 | `mouseup` |
| 4 | `focus` / initial state |

Example: `[1, -11, -13, 32, 0, 0, 0, 0]` = mouse moved (-11, -13) pixels, 32ms since last event.

### `sd` — Session Data (CAPTCHA Telemetry)

The `sd` object contains interaction-specific data that changes per CAPTCHA attempt.

| Field | Type | Description |
|-------|------|-------------|
| `od` | string | CAPTCHA type: `"C"` = slide captcha |
| `clientType` | string | Client identifier (empty = web) |
| `coordinate` | array | Slide answer: `[x, y, confidence]` |
| `trycnt` | number | Attempt count (starts at 1) |
| `refreshcnt` | number | Times user refreshed the CAPTCHA |
| `slideValue` | array | Mouse drag trajectory — see below |
| `dragobj` | number | Drag target object ID |
| `ft` | string | Fingerprint token (short hash) |

#### `slideValue` — Mouse Drag Trajectory

This is the core anti-bot signal. Each entry is `[dx, dy, dt]`:

| Field | Description |
|-------|-------------|
| `dx` | Horizontal pixel delta since last sample |
| `dy` | Vertical pixel delta since last sample |
| `dt` | Time delta in milliseconds since last sample |

**Example trajectory (first 10 samples):**
```
[74, 287, 155]   ← initial grab position (large coords)
[2, 0, 6]       ← dragging right, 6ms
[1, 0, 8]       ← smooth movement
[2, 1, 8]       ← slight upward drift
[3, 0, 8]       ← accelerating
[2, 1, 6]       ← faster sample rate
[2, 0, 6]
[2, 0, 9]
[1, 0, 8]
[2, 0, 8]
```

The server analyzes this trajectory for:
- **Velocity distribution** — humans show acceleration/deceleration curves; bots move linearly
- **Micro-tremors** — real hands produce small Y-axis jitter even on horizontal drags
- **Timing patterns** — human frame rates are uneven; `requestAnimationFrame` bots produce ~16ms intervals
- **Endpoint precision** — humans overshoot and correct; bots land exactly

The trajectory ends with a sentinel: `[-1, 0, 259]` followed by `[0, 0, 0]`.

---

## Programmatic Usage

### Decrypt a token from a saved payload file

```js
const { decrypt } = require('./token/crypto-core');

const payload = require('fs').readFileSync('payload.txt', 'utf8').trim();
const collectRaw = payload.match(/collect=([^&]+)/)[1];
const collect = decodeURIComponent(collectRaw.replace(/\+/g, '%2B'));

const rawBytes = Buffer.from(collect, 'base64').toString('binary');
const decrypted = decrypt(rawBytes);
const trimmed = decrypted.replace(/[\0 ]+$/, '');
const parsed = JSON.parse(trimmed);

// Access fingerprint fields
console.log('OS:', parsed.cd[1]);          // "windows"
console.log('UA:', parsed.cd[parsed.cd.indexOf(31) + 1]);
console.log('GPU:', parsed.cd[parsed.cd.indexOf(40) + 1]);

// Access session data
console.log('CAPTCHA type:', parsed.sd.od);
console.log('Slide trajectory points:', parsed.sd.slideValue.length);
```

### Using the library API

```js
const { decodeToken } = require('./jsdom');

const result = decodeToken(collectString);

if (result.parseOk) {
  console.log('Fingerprint entries:', result.cdParsed.length);
  console.log('Session data:', result.sdParsed);
} else {
  console.log('Decryption failed — wrong XTEA key for this TDC build');
  console.log('Error:', result.parseError);
}
```

### Return value of `decodeToken()`

```js
{
  // Parsing status
  decryptionOk: true,       // XTEA decryption succeeded (always true unless input is corrupt)
  parseOk: true,            // JSON parsed successfully (false if wrong XTEA key)
  parseError: null,         // Error message if parseOk is false

  // Parsed data
  cdParsed: [...],          // Array of fingerprint entries (interleaved key-value)
  sdParsed: {...},          // Session data object
  cdString: '{"cd":[...]}', // Raw cd JSON string
  sdString: '"sd":{...}}',  // Raw sd JSON string

  // Decrypted plaintext
  decrypted: {
    full: '{"cd":[...],"sd":{...}}',
    length: 6972
  },

  // Segment size estimates
  segmentSizes: { hash: 48, header: 144, cdBody: 6702, sig: 88, total: 6976 },

  // Metadata
  tokenLength: 9304,        // Original URL-encoded token length
  base64Length: 9304,        // Base64 string length
  rawLength: 6976            // Raw encrypted bytes
}
```

---

## Differences from Generated Tokens

| Aspect | Generated (jsdom) | Live (browser) |
|--------|-------------------|----------------|
| Token size | ~4,500 chars | ~9,300 chars |
| cd entries | 59 | 60 |
| Behavioral events | Synthetic (fixed patterns) | Real mouse movements |
| slideValue | Not present | 100+ real drag samples |
| WebGL image | Mock (1×1 pixel) | Real rendered scene |
| Audio fingerprint | Estimated values | Actual AudioContext output |
| Fonts | Profile-based list | Real DOM measurement |
| WebGPU limits | Not collected | Full `GPUAdapterLimits` |
| GPS/coordinate | Absent | Slide answer position |

The live token is roughly 2× larger because it includes real behavioral telemetry (mouse events, drag trajectory) and richer fingerprint data (WebGPU, full canvas/WebGL renders).

---

## Related Documents

- `docs/TOKEN_FORMAT.md` — Encoding layers, segment layout, XTEA crypto parameters
- `docs/COLLECTOR_SCHEMA.md` — All 59 collector field definitions with browser APIs
- `docs/CRYPTO_ANALYSIS.md` — XTEA key extraction and cipher analysis
- `docs/JSDOM_GENERATOR.md` — Generating synthetic tokens with jsdom
