# Collect Token Fingerprint Analysis — Chrome vs Node.js Scraper

> **Phase 46 investigation** (2026-04-16). Captured a live Puppeteer/Chrome 146 `collect` token, decrypted it, and round-tripped the plaintext back to a byte-identical ciphertext. This document records the 60-field `cd` array from a real Chrome session, classifies each field by volatility, and identifies what the Node.js scraper must replicate.

## 1. Round-Trip Verification

Both `collect` and `vData` tokens round-trip through decrypt → re-encrypt with byte-identical output:

| Token | Pipeline | Plaintext size | Ciphertext size | Round-trip |
|-------|----------|---------------|-----------------|------------|
| `collect` | URL-decode → base64-decode → XTEA-ECB decrypt (Template C key) | 3,637 bytes JSON | 4,856 chars base64 | ✅ byte-identical |
| `vData` | custom-base64-decode → XTEA decrypt → un-ShiftRows → unpad → repad → ShiftRows → XTEA encrypt → custom-base64-encode | 98 bytes URL-encoded KV | 152 chars custom-base64 | ✅ byte-identical |

**Implication**: the encryption pipelines in `tools/token-generator/` and `tools/vdata-generator/` are correct. Any difference between the scraper's output and Chrome's output comes from the **plaintext content**, not the cipher.

## 2. Token Format: Single-Blob vs 4-Segment

The captured tdc.js build (`TDC_NAME: gUbSKiHCiVNcdeXaKTECbTOEkdOclkcR`, Template C, 100 opcodes) uses **single-blob** encryption: the entire `{"cd":[...],"sd":{...}}` payload is XTEA-ECB encrypted as one continuous stream, then base64-encoded. There is no 4-segment split (header / hash / cdBody / sig).

The scraper's `collect-generator.js` already supports this via the `singleBlob: true` option. The porting pipeline's `structure-extractor.js` detects the format and sets it in `pipeline-config.json`.

## 3. Field Order Shuffle

Template C reorders the 59 base fields via a `fieldOrder` array (extracted by `structure-extractor.js`). The captured token has **60 cd fields** (59 base + 1 behavioral-events insertion). The field order for this build is:

```
[37, 42, 32, 44, 33, 26, 11, 0, 24, 5, 46, 29, 7, -1, 20, 17, 28, -1, 27, 21, 30, 45, 1, 43, 50, 16, 48, 51, 56, -1, 55, -1, 12, 41, -1, 47, 22, 57, 58, 6, 23, 35, 2, 9, 31, 19, 10, 15, 25, 18, 13, 53, 14, 38, 3, 54, 52, 34, 49, 8]
```

Where `-1` entries are behavioral-event insertion points (populated with mouse/touch event logs and timing data).

## 4. The 60 cd Fields — Full Annotated Table

Captured from headless Puppeteer/Chrome 146 on 2026-04-16 (5 captures, all identical). Field identity determined by value content (not schema position, since Template C shuffles the order).

### Classification Key

- **STATIC**: same value on every machine/session — can be hardcoded
- **PER-MACHINE**: depends on browser/OS/hardware — stable across sessions on same machine, must match a real Chrome profile
- **PER-SESSION**: changes every invocation — timestamps, session IDs, event logs, slide interaction data

### cd array (60 fields, Template C order)

| idx | Nature | Identity | Value |
|-----|--------|----------|-------|
| 0 | PER-MACHINE | highEntropyValues | `{_state:0, architecture:"", bitness:"", brands:[], fullVersionList:[], mobile:false, model:"", platform:"", platformVersion:"", uaFullVersion:"", wow64:false}` |
| 1 | PER-MACHINE | permissionStatus | `{_state:-2}` (async rejected in headless) |
| 2 | PER-MACHINE | characterSet | `"UTF-8"` |
| 3 | PER-MACHINE | viewportWidth | `600` |
| 4 | PER-MACHINE | screenPosition | `"1;0"` |
| 5 | PER-MACHINE | timezoneOffset | `"+08"` |
| 6 | STATIC | touchSupport | `0` |
| 7 | STATIC | sessionStorageAvail | `1` |
| 8 | STATIC | indexedDbAvail | `0` |
| 9 | STATIC | flashFonts | `""` (always empty — Flash is dead) |
| 10 | PER-MACHINE | userAgentData | `{brands:[], mobile:false, platform:""}` |
| 11 | PER-MACHINE | audioCodecs | `[{codec:"AAC",support:"probably"}, {codec:"MP3",support:"probably"}, {codec:"Ogg Vorbis",support:"probably"}, {codec:"WAV",support:"probably"}, {codec:"M4A",support:"maybe"}, {codec:"FLAC",support:"probably"}, {codec:"AIFF",support:""}]` |
| 12 | STATIC | webrtcIp | `""` (empty in headless — no WebRTC) |
| 13 | PER-MACHINE | webglRenderer | `"Intel Iris OpenGL Engine"` |
| 14 | PER-MACHINE | webglImage | base64 PNG, ~90 chars (WebGL canvas render) |
| 15 | PER-MACHINE | canvasHash/float | `0.4289999008178711` |
| 16 | PER-MACHINE | colorGamut | `"srgb"` |
| 17 | **PER-SESSION** | **sessionId (sid)** | `"7450441658890645504"` — the `sid` from prehandle |
| 18 | STATIC | adBlockDetected | `0` |
| 19 | PER-MACHINE | storageEstimate | `{_state:0, quota:10737418240, usage:null, usageDetails:{}}` |
| 20 | STATIC | headlessFlag | `0` (stealth plugin passes) |
| 21 | STATIC | webdriverFlag | `0` (stealth patches `navigator.webdriver`) |
| 22 | PER-MACHINE | osPlatform | `"windows"` |
| 23 | STATIC | doNotTrack | `""` |
| 24 | STATIC | cssOverflowResult | `""` |
| 25 | **PER-SESSION** | **timestampInit** | `1776323715` (unix seconds) |
| 26 | PER-MACHINE | platform | `"Linux x86_64"` |
| 27 | STATIC | callCounter | `0` |
| 28 | STATIC | cookiesEnabled | `0` |
| 29 | **PER-SESSION** | **eventLog** | `[[4,-1,-1,<ms_ts>,0,0,0,0], [1,159,812,1286,...], ...]` — mouse/touch/key events with relative ms timestamps |
| 30 | STATIC | errorLog | `""` |
| 31 | PER-MACHINE | webglVendor | `"Intel Inc."` |
| 32 | PER-MACHINE | videoCodecs | `[{codec:"H.264",support:"probably"}, {codec:"H.264 High",support:"probably"}, {codec:"H.265/HEVC",support:""}, {codec:"VP8",support:"probably"}, {codec:"VP9",support:"probably"}, {codec:"AV1",support:"probably"}, {codec:"Ogg Theora",support:""}, {codec:"WebM VP9",support:"probably"}]` |
| 33 | PER-MACHINE | frameStatus | `"top"` |
| 34 | PER-MACHINE | connectionType | `"unknown"` |
| 35 | PER-MACHINE | screenComposite | `"800-600-600-24-*-*-|-*"` |
| 36 | **PER-SESSION** | **pageUrl** | `"https://t.captcha.qq.com/cap_union_new_show?rand=<random>"` |
| 37 | PER-MACHINE | featureBitmask | `1023` |
| 38 | STATIC | detectedFonts | `""` (empty in headless — no font measurement) |
| 39 | PER-MACHINE | languages | `["en-US","en"]` |
| 40 | PER-MACHINE | plugins | `[{name:"PDF Viewer",...}, {name:"Chrome PDF Plugin",...}, {name:"Chrome PDF Viewer",...}, {name:"Microsoft Edge PDF Viewer",...}, {name:"WebKit built-in PDF",...}]` |
| 41 | PER-MACHINE | connectionInfo | `null` |
| 42 | PER-MACHINE | devicePixelRatio | `2` |
| 43 | PER-MACHINE | screenResolution | `[1280,1400]` |
| 44 | PER-MACHINE | userAgent | `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"` |
| 45 | PER-MACHINE | mimeTypes | `[{type:"application/pdf",suffixes:"pdf"}, {type:"text/pdf",suffixes:"pdf"}]` |
| 46 | STATIC | localStorageAvail | `1` |
| 47 | PER-MACHINE | audioHash | `37437602` |
| 48 | PER-MACHINE | hardwareConcurrency | `4` |
| 49 | PER-MACHINE | audioFingerprint | `{nt_vc_output:{ac-baseLatency:0.01, ac-outputLatency:0, ac-sampleRate:44100, ac-maxChannelCount:2, ac-numberOfInputs:1, ac-numberOfOutputs:1, ac-channelCount:2, ac-channelCountMode:"max", ac-channelInterpretation:"speakers", ac-fftSize:2048, ac-frequencyBinCount:1024, ac-minDecibels:-100, ac-maxDecibels:-30, ac-smoothingTimeConstant:0.8}, pxi_output:{pxi-output:35.74996, ...}}` |
| 50 | PER-MACHINE | maxTouchPoints | `1` |
| 51 | **PER-SESSION** | **timestampCollectionEnd** | `1776323717` (unix seconds) |
| 52 | STATIC | colorDepthRelated | `0` |
| 53 | CONSTANT | internalToken | `"98k"` |
| 54 | PER-MACHINE | availHeight | `800` |
| 55 | PER-MACHINE | performanceHash | `1283372547` |
| 56 | **PER-SESSION** | **timestampCollectionStart** | `1776323715` (unix seconds) |
| 57 | PER-MACHINE | intlOptions | `{timeZone:"Asia/Shanghai", calendar:"gregory", numberingSystem:"latn", locale:"en-US"}` |
| 58 | PER-MACHINE | colorDepth | `24` |
| 59 | STATIC | field_59 | `8` (new in 60-field template, purpose unknown) |

### sd object (slide interaction data — all PER-SESSION)

| Field | Nature | Value |
|-------|--------|-------|
| od | STATIC | `"C"` |
| clientType | STATIC | `""` |
| coordinate | PER-SESSION | `[10, 60, 1.8559]` — [leftOffset, topOffset, ratio] from CSS layout |
| trycnt | PER-SESSION | `1` |
| refreshcnt | PER-SESSION | `0` |
| slideValue | PER-SESSION | `[[160,813,53],[88,0,15],...]` — mouse drag trajectory |
| dragobj | STATIC | `1` |
| ft | PER-SESSION | `"6f_7Pfn_H"` — timing fingerprint hash |

### Summary Counts

| Nature | Count | Notes |
|--------|-------|-------|
| PER-SESSION | 7 cd + 4 sd | Timestamps, sid, pageUrl, eventLog, slide data |
| PER-MACHINE | 33 cd | Browser/OS/GPU fingerprint — stable per machine |
| STATIC/CONSTANT | 20 cd + 2 sd | Same everywhere — hardcoded |

## 5. Scraper Strategy: Chrome-Profile Replay

The scraper does NOT need to probe browser APIs. Instead:

1. **Capture once** from Puppeteer/Chrome: save the 60-field `cd` array as a JSON profile (`profiles/chrome-fingerprint.json`).
2. **On each scraper run**: load the profile, substitute the 7 PER-SESSION fields (timestamps, sid, pageUrl, eventLog), keep all 33 PER-MACHINE fields and 20 STATIC fields verbatim from the profile.
3. **Encrypt** with the correct template's XTEA key + field order + single-blob mode.

This produces a `collect` token that is structurally and content-wise identical to what Chrome would emit. The only differences are the PER-SESSION fields, which must differ per invocation anyway.

### What changes from the current scraper

The current scraper builds the cd array from `profiles/default.json` via `buildDefaultCdArray()` in `collector-schema.js`. This function synthesizes fingerprint values from a JSON profile that was manually constructed — it doesn't use values captured from a real Chrome session.

The new approach:
- Replace `profiles/default.json` with `profiles/chrome-fingerprint.json` — a real Chrome capture.
- The profile contains the full 60-field cd array (already in Template C order) with all PER-MACHINE and STATIC values baked in.
- At generation time, only the 7 PER-SESSION fields are substituted: `cd[17]` (sid), `cd[25]`/`cd[51]`/`cd[56]` (timestamps), `cd[29]` (eventLog), `cd[36]` (pageUrl), and the sd object.
- Use `cdArrayOverride` option in `generateCollect()` to bypass `buildDefaultCdArray()` entirely.

## 6. Artifacts

| Artifact | Contents |
|----------|----------|
| Puppeteer verify-POST capture | Raw POST body from Chrome (39 fields) |
| Decrypted collect plaintext | Decrypted `{cd, sd}` JSON |
| `cd` array snapshot | Just the 60-element cd array |
| `sd` object snapshot | Just the sd object |
| Porting-pipeline template config | Auto-ported template config (key, field order, structure) |
| Porting-pipeline XTEA params | XTEA key + keyMods for this build |
