# Collector Data Schema — TDC Fingerprint Fields

This document describes all 59 fields in the `cdArray` (collector data array) that forms the fingerprint payload of the TDC token. Each field corresponds to a webpack module loaded by the collector orchestrator (func_99, module 7).

## Overview

The TDC fingerprinting system collects 59 data points from the browser environment. These are assembled into a JSON array (`cd`) and encrypted into the token payload. The fields cover:

- **Hardware** (4 fields): CPU cores, touch capability, touch points
- **Screen** (7 fields): resolution, color depth, viewport, DPI, positions
- **Browser** (17 fields): UA, plugins, storage, platform, languages, etc.
- **Fingerprint** (8 fields): canvas, WebGL, audio, fonts, codecs, bitmask
- **Timing** (5 fields): timestamps, timezone, performance hash
- **Network** (3 fields): connection type, WebRTC IP
- **Internal** (3 fields): call counter, token marker, error log

## Field Reference

### Hardware

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 2 | touchSupport | number | `"ontouchstart" in div` | Touch capability: 1=touch, 2=no touch | `2` |
| 8 | hardwareConcurrency | number | `navigator.hardwareConcurrency` | Logical CPU cores | `8` |
| 14 | maxTouchPoints | number | `navigator.maxTouchPoints` | Max simultaneous touch points | `20` |
| 25 | maxTouchPointsDup | number | `navigator.maxTouchPoints` | Duplicate cross-validation of index 14 | `20` |

### Screen

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 3 | viewportWidth | number | `window.innerWidth` | Browser viewport width (px) | `800` |
| 9 | screenResolution | array | `screen.width, screen.height` | [width, height] | `[1920, 1080]` |
| 10 | devicePixelRatio | number | `window.devicePixelRatio` | Pixel density ratio | `1` |
| 28 | colorGamut | string | `matchMedia("(color-gamut: srgb)")` | CSS color gamut | `"srgb"` |
| 33 | screenPosition | string | `screenX + ";" + screenY` | Window position | `"0;0"` |
| 44 | availHeight | number | `screen.availHeight` | Available screen height | `600` |
| 47 | screenComposite | string | Multiple screen properties | Composite: "W-H-aH-CD-*-*-\|-*" | `"800-600-600-24-*-*-|-*"` |
| 49 | colorDepth | number | `screen.colorDepth` | Color depth in bits | `24` |

### Browser

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 1 | osPlatform | string | `navigator.userAgent` (parsed) | OS name: windows/macos/linux/android/ios | `"linux"` |
| 6 | languages | array | `navigator.languages` | Preferred languages | `["en-US"]` |
| 7 | colorGamutLegacy | string | `matchMedia(...)` | Legacy CSS media query result | `""` |
| 11 | sessionStorageAvail | number | `window.sessionStorage` | Session storage: 0=available | `0` |
| 13 | localStorageAvail | number | `window.localStorage` | Local storage: 1=available | `1` |
| 19 | mimeTypes | array | `navigator.mimeTypes` | Registered MIME types | `[{type, suffixes}]` |
| 21 | storageEstimate | object | `navigator.storage.estimate()` | Storage quota (async, has `_state`) | `{_state:0, quota:...}` |
| 22 | pageUrl | string | `location.href` | Current page URL | `"http://..."` |
| 23 | plugins | array | `navigator.plugins` | Browser plugins | `[{name, description, filename}]` |
| 24 | indexedDbAvail | number | `window.indexedDB` | IndexedDB: 0=available | `0` |
| 27 | adBlockDetected | number | DOM ad element injection | Ad blocker: 0=none, 1=detected | `0` |
| 30 | webdriverFlag | number | `navigator.webdriver` | Automation detection flag | `0` |
| 31 | userAgent | string | `navigator.userAgent` | Full UA string | `"Mozilla/5.0 ..."` |
| 32 | characterSet | string | `document.characterSet` | Document encoding | `"UTF-8"` |
| 36 | vendor | string | `navigator.vendor` | Browser vendor | `"Google Inc. (Google)"` |
| 37 | highEntropyValues | object | `navigator.userAgentData.getHighEntropyValues()` | UA client hints (async, has `_state`) | `{_state:0, architecture:"x86", ...}` |
| 41 | frameStatus | string | `window.top === window` | Frame context: "top" or "frame" | `"top"` |
| 42 | permissionStatus | object | `navigator.permissions.query()` | Permission state (async, has `_state`) | `{_state:-2}` |
| 45 | headlessFlag | number | Internal heuristics | Headless browser detection | `0` |
| 46 | userAgentData | object | `navigator.userAgentData` | Low-entropy UA client hints | `{brands, mobile, platform}` |
| 48 | platform | string | `navigator.platform` | Platform identifier | `"Linux x86_64"` |
| 50 | doNotTrack | string | `navigator.doNotTrack` | DNT preference | `""` |
| 51 | cookiesEnabled | number | `navigator.cookieEnabled` | Cookie support flag | `0` |
| 55 | cssOverflowResult | string | `CSS.supports()` or similar | CSS feature detection result | `""` |

### Fingerprint

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 4 | detectedFonts | string | DOM font measurement | Comma-separated detected fonts | `"Arial,Courier New,..."` |
| 5 | flashFonts | string | Flash plugin (deprecated) | Flash-based font list | `""` |
| 12 | videoCodecs | array | `HTMLVideoElement.canPlayType()` | Video codec support | `[{codec, support}]` |
| 15 | canvasHash | number | `canvas.toDataURL()` → hash | Canvas fingerprint (32-bit hash) | `991783254` |
| 17 | mathFingerprint | number | `Math.random()` / `performance.now()` | Floating-point entropy source | `0.841...` |
| 18 | audioFingerprint | object | `AudioContext`, `AnalyserNode` | Audio stack fingerprint | `{nt_vc_output, pxi_output}` |
| 20 | webglImage | string | `WebGLRenderingContext.toDataURL()` | WebGL rendered image (base64) | `"GgoAAAAN..."` |
| 29 | audioCodecs | array | `HTMLAudioElement.canPlayType()` | Audio codec support | `[{codec, support}]` |
| 40 | webglRenderer | string | `WEBGL_debug_renderer_info` | GPU renderer string | `"ANGLE (Google, ...)"` |
| 56 | canvasBlocked | number | Canvas comparison test | Canvas blocking: 0=normal | `0` |
| 57 | featureBitmask | number | Multiple feature tests | Combined feature bitmask | `1023` |

### Timing

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 16 | timestampInit | number | `Math.round(Date.now()/1000)` | Init timestamp (unix seconds) | `1775062183` |
| 26 | timezoneOffset | string | `Date.getTimezoneOffset()` | Timezone offset string | `"+08"` |
| 34 | intlOptions | object | `Intl.DateTimeFormat().resolvedOptions()` | Internationalization info | `{timeZone, calendar, ...}` |
| 52 | timestampCollectionEnd | number | `Math.round(Date.now()/1000)` | Collection end timestamp | `1775062186` |
| 53 | timestampCollectionStart | number | `Math.round(Date.now()/1000)` | Collection start timestamp | `1775062183` |
| 54 | performanceHash | number | `performance.now()` derived | Performance timing hash | `679647370` |

### Network

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 35 | connectionInfo | null | `navigator.connection` | Network info (null when unavailable) | `null` |
| 39 | connectionType | string | `navigator.connection.effectiveType` | Connection type or "unknown" | `"unknown"` |
| 43 | webrtcIp | string | `RTCPeerConnection` | Local IP via WebRTC | `""` |

### Internal

| Index | Name | Type | Browser API | Description | Example |
|-------|------|------|-------------|-------------|---------|
| 0 | callCounter | number | Internal counter | getInfo call count (starts at 1) | `1` |
| 38 | internalToken | string | Internal | Hardcoded check value | `"98k"` |
| 58 | errorLog | string | Internal | Collection error log | `""` |

## Async Fields (`_state` convention)

Three fields use an async pattern with a `_state` property:

| Field | Index | `_state` Values |
|-------|-------|----------------|
| storageEstimate | 21 | 0=resolved, -1=pending, -2=rejected |
| highEntropyValues | 37 | 0=resolved, -1=pending, -2=rejected |
| permissionStatus | 42 | 0=resolved, -1=pending, -2=rejected |

When `_state` is 0, the remaining properties contain the resolved data. When -2, the async operation timed out or was rejected (common in headless browsers).

## Module Loading Order

The collector orchestrator (func_99, webpack module 7) loads 59 modules in this order, mapping sequentially to cdArray indices 0–58:

```
Module IDs: 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 23, 24,
            1, 31, 33, 34, 35, 36, 37, 39, 40, 41, 42, 43, 44, 45, 30, 46,
            47, 48, 49, 50, 51, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
            65, 66, 67, 68, 70, 71, 72, 73, 74, 75, 76
```

Each module exports `{ get: function() { return [value]; } }`. The orchestrator calls each module's `get()` and stores `result[0]` into the cdArray.

## Notes

- Fields marked with `/* UNCERTAIN */` in the code have ambiguous API attribution
- The `screenComposite` (index 47) format uses viewport width, not screen.width
- Timestamps are in Unix seconds (not milliseconds)
- The `featureBitmask` (index 57) value 1023 = 0x3FF = 10 bits, each representing a boolean feature check
- The `internalToken` (index 38) "98k" appears to be a hardcoded anti-tamper marker
