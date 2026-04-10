# Scraper Fixes Required for 98-Opcode Template (60-Field cd Array)

## sd Structure Differences

### Browser sd fields
- `od`: "C" (present in both)
- `clientType`: "" (browser only)
- `coordinate`: [10, 60, 1.8559] (browser only)
- `trycnt`: 1 (browser only)
- `refreshcnt`: 0 (browser only)
- `slideValue`: [[159,812,99], ...] 35 entries of [dx, dy, dt] (browser only)
- `dragobj`: 1 (browser only)
- `ft`: "6f_7Pfn_H" (browser only)

### Scraper sd fields
- `od`: "C" (present in both)
- `appid`: "2046626881" (scraper only -- WRONG, should not be here)
- `nonce`: "eda1152f11f1daf0" (scraper only -- WRONG, should not be here)
- `token`: "test_token_123" (scraper only -- WRONG, should not be here)

### Missing from scraper sd (CRITICAL)
- `clientType` (empty string)
- `coordinate` [ansX, ansY, elapsed] -- slide answer coordinates
- `trycnt` -- attempt counter
- `refreshcnt` -- CAPTCHA refresh counter
- `slideValue` -- mouse/touch drag trajectory [[x, y, dt], ...]
- `dragobj` -- drag interaction type (1)
- `ft` -- fingerprint token string

### Extra in scraper sd (should be removed)
- `appid`, `nonce`, `token` -- these are verify POST parameters, NOT sd fields

## Field Count Difference

Browser cd: **60 fields** (indices 0-59)
Scraper cd: **59 fields** (indices 0-58)

The extra field is at **browser index 55**: `behavioralEvents` -- an array of arrays recording
mouse/touch movement events during the CAPTCHA interaction. Format:
```
[[eventType, x, y, timestamp_or_delta, 0, 0, 0, 0], ...]
```
Event types observed: 4 = init/focus, 1 = mousemove, 2 = mousedown(?), 3 = mouseup(?)

This field does **not exist** in the 59-field schema and must be added for the new template.

## Field Ordering (98-Opcode Template vs Old Schema)

The 98-opcode template completely reshuffles the cd array. Below is the reordering map.
Format: `browser[i] = schema[j]` where j is the old schema index.

```
browser[ 0] = schema[35]  connectionInfo        (null)
browser[ 1] = schema[26]  timezoneOffset        ("+08")
browser[ 2] = schema[23]  plugins               ([{name,desc,filename},...])
browser[ 3] = schema[24]  indexedDbAvail         (0)
browser[ 4] = schema[ 5]  flashFonts            ("")
browser[ 5] = schema[18]  audioFingerprint       ({nt_vc_output, pxi_output})
browser[ 6] = schema[29]  audioCodecs           ([{codec,support},...])
browser[ 7] = schema[ 2]  touchSupport          (2)
browser[ 8] = schema[40]  webglRenderer         ("Intel Iris OpenGL Engine")
browser[ 9] = schema[44]  availHeight           (600)
browser[10] = schema[41]  frameStatus           ("top")
browser[11] = schema[45]  headlessFlag          (0)
browser[12] = schema[55]  cssOverflowResult     ("")
browser[13] = schema[28]  colorGamut            ("srgb")
browser[14] = schema[16]  timestampInit         (1775814897)
browser[15] = schema[46]  userAgentData         ({brands,mobile,platform})
browser[16] = schema[20]  webglImage            ("GgoAAAAN...")
browser[17] = schema[ 8]  hardwareConcurrency   (8)
browser[18] = schema[12]  videoCodecs           ([{codec,support},...])
browser[19] = schema[58]  errorLog              ("")
browser[20] = schema[47]  screenComposite       ("800-600-600-24-*-*-|-*")
browser[21] = schema[14]  maxTouchPoints        (4)
browser[22] = schema[31]  userAgent             ("Mozilla/5.0 ...")
browser[23] = schema[37]  highEntropyValues     ({_state,architecture,...})
browser[24] = schema[27]  adBlockDetected       (0)
browser[25] = schema[21]  storageEstimate       ({_state,quota,...})
browser[26] = schema[ 3]  viewportWidth         (800)
browser[27] = schema[50]  doNotTrack            ("")
browser[28] = schema[57]  featureBitmask        (1023)
browser[29] = schema[36]  vendor                ("Intel Inc.")
browser[30] = schema[15]  canvasHash            (1189887932)
browser[31] = schema[52]  timestampCollectionEnd (1775814894)
browser[32] = schema[54]  performanceHash       (681731712)
browser[33] = schema[ 9]  screenResolution      ([1280, 1400])
browser[34] = schema[33]  screenPosition        ("1;0")
browser[35] = schema[56]  canvasBlocked         (0)
browser[36] = schema[11]  sessionStorageAvail   (0)
browser[37] = schema[13]  localStorageAvail     (1)
browser[38] = schema[30]  webdriverFlag         (0)
browser[39] = schema[51]  cookiesEnabled        (0)
browser[40] = schema[ 4]  detectedFonts         ("7448307515255877632" -- now a hash, not font names)
browser[41] = schema[22]  pageUrl               ("https://t.captcha.qq.com/...")
browser[42] = schema[38]  internalToken         ("98k")
browser[43] = schema[ 0]  callCounter           (1)
browser[44] = schema[ 6]  languages             (["en-US", "en"])
browser[45] = schema[32]  characterSet          ("UTF-8")
browser[46] = schema[25]  maxTouchPointsDup     (0 in browser -- possibly dropped/zeroed)
browser[47] = schema[ 7]  colorGamutLegacy      ("")
browser[48] = schema[17]  mathFingerprint       (1.0739998817443848)
browser[49] = schema[34]  intlOptions           ({timeZone,calendar,...})
browser[50] = schema[19]  mimeTypes             ([{type,suffixes},...])
browser[51] = schema[39]  connectionType        ("unknown")
browser[52] = schema[53]  timestampCollectionStart (1775814894)
browser[53] = schema[10]  devicePixelRatio      (1)
browser[54] = schema[ 1]  osPlatform            ("windows")
browser[55] = NEW FIELD   behavioralEvents      ([[4,-1,-1,ts,...],[1,x,y,dt,...],...])
browser[56] = schema[42]  permissionStatus      ({_state:-2})
browser[57] = schema[48]  platform              ("Linux x86_64")
browser[58] = schema[43]  webrtcIp              ("")
browser[59] = schema[49]  colorDepth            (24)
```

## Value Issues

### CRITICAL: Scraper videoCodecs corrupted (browser[18], scraper[12])
The scraper's first H.264 codec entry has behavioral event data appended to the codec string:
`"H.264[[4,-1,-1,1775817045783,0,0,0,0]]"` instead of `"H.264"`.
This is a **bug** -- event data is being concatenated into the videoCodecs array.

### CRITICAL: Scraper UA reveals headless browser (browser[22], scraper[31])
Browser: `"Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/146.0.0.0 Safari/537.36"`
Scraper: `"Mozilla/5.0 (X11; Linux x86_64) ... HeadlessChrome/146.0.0.0 Safari/537.36"`
The `HeadlessChrome` identifier is an instant detection flag.

### CRITICAL: Scraper sd structure is completely wrong
The scraper puts `appid`, `nonce`, `token` in sd instead of the required CAPTCHA interaction
fields (`slideValue`, `coordinate`, `trycnt`, `refreshcnt`, `dragobj`, `ft`).

### HIGH: Scraper pageUrl exposes local server (browser[41], scraper[22])
Browser: `https://t.captcha.qq.com/cap_union_new_show?rand=...`
Scraper: `http://127.0.0.1:46577/?rand=...` -- reveals non-browser environment.

### HIGH: Scraper webglRenderer reveals SwiftShader (browser[8], scraper[40])
Browser: `"Intel Iris OpenGL Engine"`
Scraper: `"ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)...))"` -- SwiftShader is
a software renderer commonly associated with headless/CI environments.

### HIGH: Scraper vendor mismatch (browser[29], scraper[36])
Browser: `"Intel Inc."` (from real GPU)
Scraper: `"Google Inc. (Google)"` -- identifies as Google browser vendor, not GPU vendor.
Note: This field is `navigator.vendor` (browser vendor), not GPU vendor. The browser value
`"Intel Inc."` is unusual -- this may be a spoofed or non-standard browser.

### HIGH: Scraper highEntropyValues too detailed (browser[23], scraper[37])
Browser has empty/minimal values (architecture:"", brands:[]) suggesting the API was blocked.
Scraper has full values (architecture:"x86", brands populated) -- inconsistent with a browser
that blocks UA client hints.

### HIGH: Scraper userAgentData inconsistent (browser[15], scraper[46])
Browser: `{brands:[], mobile:false, platform:""}` (empty/blocked)
Scraper: `{brands:[{Not-A.Brand, Chromium}], mobile:false, platform:"Linux"}` (populated)
The browser blocked UA-CH but the scraper reports full data -- a detectable inconsistency.

### MEDIUM: Scraper languages too short (browser[44], scraper[6])
Browser: `["en-US", "en"]`
Scraper: `["en-US"]` -- missing secondary language.

### MEDIUM: Scraper screenResolution unrealistic (browser[33], scraper[9])
Browser: `[1280, 1400]`
Scraper: `[1920, 1080]` -- values should match the spoofed environment.

### MEDIUM: Scraper detectedFonts format change (browser[40], scraper[4])
Browser: `"7448307515255877632"` (numeric hash)
Scraper: `"Arial,Courier New,Times New Roman,..."` (font name list)
The new template hashes fonts instead of listing names. Scraper must adapt.

### MEDIUM: Scraper osPlatform inconsistent with UA (browser[54], scraper[1])
Browser: `"windows"` (matching Windows UA)
Scraper: `"linux"` (matching Linux UA) -- this is internally consistent for the scraper
but if UA is fixed to Windows, osPlatform must also change.

### LOW: maxTouchPoints and maxTouchPointsDup values differ (browser[21,46])
Browser: maxTouchPoints=4, maxTouchPointsDup=0
Scraper: maxTouchPoints=20, maxTouchPointsDup=20
Value 20 is unrealistically high for a desktop browser.

### LOW: Audio fingerprint values differ (browser[5], scraper[18])
Browser: pxi_output=10240 (integer -- typical for real audio hardware)
Scraper: pxi_output=11888.616... (float -- may indicate emulated audio)

## Critical Fixes Needed (Priority Order)

### P0 -- Blocking (token will be rejected)

1. **Fix sd structure**: Remove `appid`, `nonce`, `token` from sd. Add `clientType`, `coordinate`,
   `trycnt`, `refreshcnt`, `slideValue`, `dragobj`, `ft` fields with proper CAPTCHA interaction data.

2. **Reorder cd array to 60-field layout**: The entire cd array must be reordered from the old
   59-field schema ordering to the new 98-opcode template ordering documented above.

3. **Add behavioralEvents field (new index 55)**: Generate plausible mouse/touch movement events
   in the format `[[eventType, x, y, timestamp_or_delta, 0, 0, 0, 0], ...]`.

4. **Fix videoCodecs corruption**: The first codec entry has event data concatenated to the string.
   Investigate and fix the bug causing `"H.264[[4,-1,-1,..."` instead of `"H.264"`.

### P1 -- High Priority (likely detection signals)

5. **Remove HeadlessChrome from UA**: Use a non-headless Chrome UA string, or use
   `--user-agent` flag in Puppeteer to override.

6. **Fix pageUrl**: Must point to the real CAPTCHA URL, not localhost.

7. **Fix webglRenderer**: Replace SwiftShader with a realistic GPU renderer string.

8. **Fix userAgentData/highEntropyValues consistency**: Either block both (empty values) to match
   a privacy-focused browser, or populate both realistically -- they must be consistent.

9. **Change detectedFonts to hash format**: The new template produces a numeric hash string
   instead of comma-separated font names.

### P2 -- Medium Priority (may cause scoring penalties)

10. **Add secondary language**: `["en-US", "en"]` instead of `["en-US"]`.

11. **Fix maxTouchPoints**: Use 0 or a realistic value (not 20) for a desktop browser without touch.

12. **Ensure osPlatform matches UA**: If UA says Windows, osPlatform must be "windows".

13. **Fix audio fingerprint**: Use integer pxi_output (e.g., 10240) to match real hardware.

14. **Adjust screenResolution**: Match the spoofed viewport dimensions.
