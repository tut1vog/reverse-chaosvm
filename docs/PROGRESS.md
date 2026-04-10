# Progress & Task Tracker

## Current State

**Phase**: 10 — Headless CAPTCHA Solver Bot
**Status**: Task 10.10 DONE (TLS NOT blocker) → Task 10.11 (collect token diff)
**Last updated**: 2026-04-04
**Goal**: Build a CAPTCHA solver bot that passes Tencent's server-side validation

---

## Strategic Pivot: jsdom → Puppeteer Hybrid

**Decision**: After 5 rounds of incremental HTTP fixes (10.5.1–10.5.5), all HTTP-visible differences from HAR are eliminated but errorCode 9 persists. The remaining causes are **beyond HTTP formatting**:

1. **Collect token quality** (most likely): jsdom TDC produces ~5800 chars vs real Chrome ~8128 chars. Missing ~2300 chars = missing browser fingerprint data (canvas hash, WebGL renderer, audio context, font enumeration, etc.) that jsdom simply cannot provide.
2. **TLS fingerprint**: Node.js `https` module has a different JA3/JA4 hash than Chrome.
3. **No real DOM environment**: tdc.js fingerprints the browser environment — jsdom lacks real canvas, WebGL, AudioContext, etc.

**Approach**: Use Puppeteer (stealth) to run TDC in a **real Chrome** context. Two options:

- **Option A — Hybrid**: Keep our fast Node.js HTTP client for prehandle/show/images, use Puppeteer only for TDC collect generation. Still has TLS mismatch on verify request.
- **Option B — Full Puppeteer**: Drive the entire CAPTCHA flow through a real Chrome page. Fixes TLS + collect + DOM fingerprint all at once. Simpler, more reliable, but heavier.

**Recommendation**: **Option B — Full Puppeteer** (with stealth). Reasons:
- TLS fingerprint on verify POST may also matter — Option A doesn't fix this
- Simpler code: no need to serialize session state between Node.js HTTP and browser context
- `puppeteer-extra-plugin-stealth` patches all common headless detection vectors
- We keep our slide-solver (Python OpenCV) and just inject the answer coordinates
- The existing captcha-client.js HTTP logic becomes reference/fallback code

---

## Current Task

### Task 10.9: Harvest Real Chrome Fingerprints for jsdom Replay ✅

**Verdict**: PASS (round-050) — 13/13 automated tests pass, 4 minor warnings. 67 API fields harvested, real canvas/WebGL/audio fingerprints replayed in jsdom. Live test criterion deferred to task 10.10.

---

### Task 10.10: TLS Fingerprint Hypothesis — curl-impersonate Verify ✅

**Verdict**: DONE — TLS is **NOT** the blocker. A/B test ran live: Node.js (OpenSSL) → errorCode 9, curl-impersonate (Chrome BoringSSL) → errorCode 9. Both rejected identically. The remaining blocker is the **collect token content** itself — jsdom's TDC execution produces structurally different data than real Chrome even with harvested fingerprints.

---

### Task 10.11: Fix jsdom Collect Token — Close the 14-Field Gap ← ACTIVE

**Objective**: Fix the 14 mismatched fields in the jsdom collect token so it matches what a real Chrome on this machine would produce, bringing match rate from 72.5% to ≥95%.

**Background — What calibrate.js Revealed**:
Running `node jsdom/calibrate.js chrome-real-harvested --dump` shows 14 mismatches between the jsdom token (with harvested profile) and the Puppeteer ground truth (`output/dynamic/collector-map.json`). The ground truth was captured from Puppeteer running on **this Linux server** with headless Chrome. The harvested profile was captured on this same machine but reports Windows values because the mock is overriding with a Windows profile. The fix is straightforward: make the harvested profile match THIS machine's actual values.

**The 14 Mismatches (ranked by likely server impact)**:

Category A — **Profile/mock bugs** (harvested profile says Windows, but machine is Linux):
1. `[1] osPlatform`: "windows" → should be "linux" 
2. `[31] userAgent`: Windows UA → should be Linux headless Chrome UA
3. `[48] platform`: "Win32" → should be "Linux x86_64"
4. `[36] vendor`: "Intel Inc." (WebGL) → should be "Google Inc. (Google)" (SwiftShader on this server)
5. `[40] webglRenderer`: "Intel Iris OpenGL Engine" → should be ANGLE/SwiftShader string

Category B — **jsdom environment limitations** (mock needs improvement):
6. `[8] deviceMemory`: null → should be 8
7. `[11] sessionStorageAvail`: 10001 → should be 0 (sessionStorage works but probe returns wrong code)
8. `[24] indexedDbAvail`: 1 → should be 0 (indexedDB probe returning wrong value)
9. `[25] hardwareConcurrency`: 4 → should match actual CPU cores (20 on this server, or use harvested value)
10. `[37] highEntropyValues`: `{_state: -2}` → should have full brands/architecture/bitness data
11. `[46] userAgentData`: "" → should have brands/mobile/platform object

Category C — **Minor/possibly ignorable**:
12. `[6] languages`: `["en-US","en"]` → `["en-US"]` (extra "en" in array)
13. `[14] vmInternalCount`: 21 → 20 (off-by-one in internal counter)
14. `[57] featureBitmask`: 607 → 1023 (bitmask reflects which features were detected)

**Also structural**: jsdom produces **60** cd entries (extra behavioral init event at cd[11]), Puppeteer produces **59**. The calibrate.js already handles this by splicing, but the server may not. This could itself cause errorCode 9.

**Input**:
- `jsdom/browser-mock.js` — the mock layer to fix
- `puppeteer/fingerprint-harvester.js` — re-run to capture THIS machine's real values
- `output/dynamic/collector-map.json` — ground truth (Puppeteer on this machine)
- `output/chrome-fingerprint.json` — current harvested profile (has Windows values)
- Calibrate output above (the 14 mismatches)

**Expected Output**:

1. **Re-run fingerprint harvester** on this machine to capture Linux Chrome values (not Windows):
   - The harvester uses Puppeteer stealth which already runs on this machine
   - Remove any Windows UA override — let it use the real headless Chrome UA
   - Output updated `output/chrome-fingerprint.json` with Linux-native values
   - Key fields: osPlatform=linux, platform=Linux x86_64, UA=headless Chrome, vendor/renderer=SwiftShader

2. **Fix `jsdom/browser-mock.js`** for Category B issues:
   - `deviceMemory`: mock `navigator.deviceMemory` to return harvested value (or os.cpus().length-based heuristic)
   - `sessionStorageAvail`: fix probe to return 0 (sessionStorage available) — check what code path returns 10001
   - `indexedDbAvail`: fix probe to return 0 — check how TDC tests indexedDB availability
   - `hardwareConcurrency`: use `os.cpus().length` or harvested value
   - `highEntropyValues`: mock `navigator.userAgentData.getHighEntropyValues()` to return full data (brands, architecture, bitness, etc.) from harvested profile
   - `userAgentData`: mock `navigator.userAgentData` object with brands/mobile/platform

3. **Fix Category C issues**:
   - `languages`: ensure mock returns exactly `["en-US"]` (single element, no "en" suffix)
   - `vmInternalCount`: investigate why off-by-one (may be caused by extra cd[11] entry)
   - `featureBitmask`: this is a computed bitmask of which features TDC detected — fixing Category B items should automatically fix the bitmask

4. **Investigate the extra cd[11] entry** (60 vs 59 fields):
   - Determine why jsdom TDC inserts an extra behavioral init event
   - If possible, prevent it (it's caused by how events are injected before collection)
   - If not preventable, document that the server sees 60 fields and this may matter

**Verification Method**:
1. Run `node puppeteer/fingerprint-harvester.js` → updated `output/chrome-fingerprint.json` with Linux values
2. Run `node jsdom/calibrate.js chrome-real-harvested --dump` → count mismatches
3. **Pass if**: ≤4 mismatches (all session-dependent: canvasHash, timestamps, mathFingerprint, pageUrl)
4. Run `node jsdom-solver/solver.js --domain urlsec.qq.com` → check errorCode
5. If errorCode=0 → jsdom path works!
6. If errorCode=9 → remaining issue is structural (60 vs 59 entries, or server-side behavioral analysis)

**Pass Criteria**:
1. Harvested profile uses Linux Chrome values (not Windows)
2. Calibrate diff shows ≤4 mismatches (only session-dependent fields)
3. `featureBitmask` matches ground truth (all features detected)
4. No Category A or B mismatches remain
5. Token length closer to Puppeteer baseline (~4600 chars)

**Failure Impact**: If errorCode 9 persists even with <4 mismatches, the blocker is the structural difference (60 vs 59 cd entries) or something in the `sd` portion of the token, or server-side behavioral analysis that detects jsdom's event timing patterns. At that point, the jsdom approach may not be viable without substantially more effort, and the Puppeteer path (which already works) should be the production solution.

**Notes**:
- The harvester currently has `--window-size=1920,1080` and navigates to `about:blank`. Consider navigating to `https://example.com` to get valid `storageEstimate` and `userAgentData` values.
- The featureBitmask (607 vs 1023) is a strong signal — 607 in binary is `1001011111` while 1023 is `1111111111`. The 0 bits indicate features TDC tried to detect but failed in jsdom. Fixing the Category B mocks should flip those bits.
- `sessionStorageAvail=10001` is suspicious — this looks like a TDC error code for "sessionStorage threw an exception", likely because jsdom's sessionStorage behaves differently under certain conditions.
- **Do NOT modify `captcha-puppeteer.js`** — the Puppeteer solver works and is separate.

**Objective**: Test whether Node.js's TLS fingerprint (JA3/JA4) is causing the jsdom path's errorCode 9, by routing the verify POST through `curl-impersonate` which mimics Chrome's TLS handshake.

**Background — Why TLS Is the Prime Suspect**:
After task 10.9, the jsdom path has real Chrome fingerprints in the collect token. The progression:
- Pre-10.9: errorCode=12 (bad fingerprints → server rejects before checking answer)
- Post-10.9: errorCode=9 (fingerprints pass, but something else fails)
- Puppeteer path: errorCode=0 (real Chrome TLS + real fingerprints → success)
- bot.py/DrissionPage: errorCode=0 (real Chrome TLS → success)

The only remaining difference between jsdom+Node.js HTTP and Puppeteer is the **TLS layer**. Node.js `https` module uses OpenSSL with a completely different cipher suite ordering, TLS extensions, and ALPN negotiation than Chrome. Tencent's server can fingerprint the TLS ClientHello (JA3/JA4 hash) and compare it against the claimed User-Agent. Node.js TLS ≠ Chrome/146 UA → session flagged → errorCode 9.

**Approach**: Use `curl-impersonate-chrome` (a patched curl that mimics Chrome's exact TLS fingerprint) as a subprocess for **only the verify POST**. All other requests (prehandle, getSig, images) can stay on Node.js `https` since they're GETs that don't seem to be TLS-checked (or share the same TLS session). The verify POST is the critical request where the server validates the CAPTCHA solution.

**Input**:
- `puppeteer/captcha-client.js` — `httpRequest()` function (line 126) and `verify()` method (line 859)
- `puppeteer/solver.js` — orchestrator that calls `client.verify()`
- `curl-impersonate` binary (needs installation — see Tool Request)

**Expected Output**:

1. **`puppeteer/curl-impersonate.js`** — A small wrapper module that:
   - Exports `curlPost(url, { headers, body, cookieJar })` → `Promise<{ statusCode, headers, body }>`
   - Spawns `curl-impersonate-chrome` as a child process with:
     - `--http2` (Chrome uses HTTP/2)
     - `-H` for each header (same headers as `captcha-client.js` verify)
     - `-b` for cookies from the cookie jar
     - `-d @-` to pipe the POST body via stdin (avoids shell escaping issues with base64 collect tokens)
     - `-s` (silent) `-w '\n%{http_code}'` to capture status code
     - `--compressed` for accept-encoding
   - Parses stdout into `{ statusCode, body }`
   - Falls back to Node.js `httpRequest` if `curl-impersonate-chrome` is not found
   - Has a `isAvailable()` function that checks if the binary exists in PATH

2. **`puppeteer/captcha-client.js`** — Modified `verify()` method:
   - Add an option `useCurlImpersonate: true` (default: `false` for backward compat)
   - When enabled, use `curlPost()` instead of `httpRequest()` for the verify POST only
   - Pass the same headers, cookies, and body as the current implementation
   - Parse the response identically (JSONP → JSON)

3. **`puppeteer/solver.js`** — Add `--curl-impersonate` CLI flag:
   - When passed, sets `useCurlImpersonate: true` on the CaptchaClient
   - Log whether curl-impersonate is available at startup
   - Also support `--tls-test` mode: run TWO verify attempts on the same challenge:
     1. First with Node.js `https` (expect errorCode 9)
     2. Then with `curl-impersonate` (expect different errorCode)
     This A/B test definitively isolates TLS as the variable.

**Verification Method**:
1. **Structural**: `curl-impersonate.js` exports `curlPost` and `isAvailable`, and handles missing binary gracefully
2. **Unit**: Mock subprocess call verifies correct curl flags are passed
3. **Integration**: `isAvailable()` returns true after installation
4. **Live A/B test**: Run `node jsdom-solver/solver.js --tls-test --domain urlsec.qq.com`
   - Log both results side by side
   - If Node.js → errorCode 9 AND curl-impersonate → errorCode 0: **TLS confirmed as blocker**
   - If both → errorCode 9: TLS is NOT the blocker, move to hypothesis 2 (collect token diff)
   - If both → errorCode 0: something else changed (unlikely but good)

**Pass Criteria**:
1. `curl-impersonate-chrome` binary is installed and callable
2. `curlPost()` successfully sends a POST with Chrome TLS fingerprint
3. `isAvailable()` correctly detects binary presence
4. Live test with `--curl-impersonate` flag runs end-to-end
5. A/B test (`--tls-test`) produces clear diagnostic output comparing errorCodes
6. The hypothesis is definitively confirmed or refuted by the A/B result

**Failure Impact**: If TLS is NOT the blocker (both paths return errorCode 9), we know the remaining issue is in the collect token content itself — jsdom's TDC execution produces structurally different data than real Chrome even with harvested fingerprints. Next step would be task 10.11: decrypt and diff collect tokens from jsdom vs Puppeteer field-by-field.

**Notes**:
- `curl-impersonate` must impersonate a Chrome version close to our UA (Chrome/146). The `curl-impersonate-chrome` binary uses Chrome's BoringSSL and exact cipher suite. Use the latest available version.
- Cookie handling: the jsdom path accumulates cookies across prehandle → getSig → show → verify. All cookies must be passed to curl-impersonate via `-b "name1=val1; name2=val2"`.
- The `--tls-test` A/B mode must use a **single CAPTCHA session** — get one challenge, solve it once, then try verifying with both TLS stacks. This ensures the only variable is TLS. Note: after the first verify (even if rejected), the session may be invalidated, so try curl-impersonate FIRST (it's the one we want to test), then Node.js.
- HTTP/2: Chrome negotiates HTTP/2 via ALPN. curl-impersonate handles this automatically. Node.js `https` defaults to HTTP/1.1. This is part of the TLS fingerprint — the ALPN extension in ClientHello reveals HTTP/2 support.
- If `curl-impersonate` is not packaged for Ubuntu Noble, build from source or use the prebuilt Docker image. Alternative: the `node-curl-impersonate` npm package wraps the binary.

**Tool Request**:
- **BLOCKING**: Install `curl-impersonate-chrome`. Options (in priority order):
  1. `apt install curl-impersonate` (if available in Ubuntu 24.04 repos)
  2. Download prebuilt binary from https://github.com/lwthiker/curl-impersonate/releases (x86_64 Linux)
  3. `npm install node-curl-impersonate` (npm wrapper — may bundle the binary)
  4. Build from source (last resort)
- Verify installation: `curl-impersonate-chrome --version` should work

**Objective**: Build a Puppeteer-based fingerprint harvester that captures the exact raw API return values from a real Chrome session, then update `browser-mock.js` to replay those real values in jsdom — producing a collect token with genuine fingerprint data.

**Background — Why This Should Work**:
The jsdom path currently produces ~5800-char collect tokens with **fake** fingerprint values (stub canvas hash, synthetic WebGL image, hardcoded audio fingerprint). The server rejects these (errorCode=12) because the fingerprint data is obviously synthetic. But if we capture the **exact values** a real Chrome produces and replay them in jsdom, the collect token will contain genuine fingerprint data that passes consistency checks.

Key insight: TDC's 59 collector modules each call specific browser APIs and record the return values. We don't need to reimplement Chrome's rendering — we just need to **record what Chrome returns** and **play it back**.

**Input**:
- `docs/COLLECTOR_SCHEMA.md` — all 59 fields and their browser APIs
- `jsdom/browser-mock.js` — current mock layer (needs profile update)
- `output/dynamic/collector-map.json` — ground truth collector output from a prior Puppeteer run

**Expected Output**:

1. **`puppeteer/fingerprint-harvester.js`** — Puppeteer script that:
   - Launches real Chrome (with stealth)
   - Navigates to a blank page
   - Executes JS in-page to capture raw API values for every TDC probe:
     - `canvas.toDataURL()` after drawing the same shapes TDC draws (text + arc + rect)
     - WebGL `canvas.toDataURL()` after the same draw calls TDC makes
     - `AudioContext` → `OscillatorNode` → `AnalyserNode` pipeline output (the `pxi_output` float)
     - `navigator.*` properties (UA, platform, languages, plugins, mimeTypes, etc.)
     - `screen.*` properties
     - `window.*` properties (innerWidth, devicePixelRatio, etc.)
     - `HTMLVideoElement.canPlayType()` for all codecs TDC checks
     - `HTMLAudioElement.canPlayType()` for all codecs TDC checks
     - Font detection results (TDC's font probe technique)
     - `navigator.userAgentData.getHighEntropyValues()` result
     - `navigator.storage.estimate()` result
     - `Intl.DateTimeFormat().resolvedOptions()`
     - WebGL `getParameter()` for all param IDs TDC queries
     - WebGL `getSupportedExtensions()` list
     - `performance.now()` characteristics
   - Saves everything to `output/chrome-fingerprint.json`

2. **`jsdom/browser-mock.js`** — updated to:
   - Load `output/chrome-fingerprint.json` as a new profile (e.g., `'chrome-real-harvested'`)
   - For canvas: mock `toDataURL()` to return the exact captured data URL string
   - For WebGL: mock `readPixels` and the canvas `toDataURL()` to return the captured WebGL image
   - For audio: return the captured `pxi_output` and `nt_vc_output` values exactly
   - All other fields: use the harvested values instead of hardcoded guesses

3. **`puppeteer/collect-generator.js`** — updated to use `'chrome-real-harvested'` profile by default

**Verification Method**:
1. Run `node puppeteer/fingerprint-harvester.js` → produces `output/chrome-fingerprint.json`
2. Run collect generator with the harvested profile → produces collect token
3. Compare the collect token's cd array (decrypt it) against `collector-map.json` from a real Puppeteer session — the fingerprint fields (canvas hash, WebGL image, audio fingerprint) should match or be very close
4. Run `node jsdom-solver/solver.js --domain urlsec.qq.com` with the new profile → check errorCode
5. If errorCode=0 → jsdom path works with real fingerprints
6. If errorCode=9 → fingerprints are good but coordinates still off
7. If errorCode=12 → remaining blocker is TLS fingerprint (separate task)

**Pass Criteria**:
1. Harvester runs in Puppeteer and captures ≥40 distinct API values to JSON
2. `browser-mock.js` loads the harvested profile and returns exact captured values
3. Canvas `toDataURL()` returns the real Chrome data URL (not a stub)
4. WebGL image in the collect token matches the harvested WebGL image
5. Audio fingerprint values match exactly (float comparison)
6. Collect token generated with harvested profile has correct/realistic fingerprint fields
7. Live test produces errorCode ≠ 12 (proving fingerprint quality improved)

**Failure Impact**: If errorCode=12 persists even with real Chrome fingerprints, the blocker is definitively NOT fingerprint quality — it's TLS fingerprint (JA3/JA4 hash of Node.js `https`). That would be task 10.10: route verify through `curl-impersonate` or similar.

**Notes**:
- The harvester needs to replicate the **exact drawing operations** TDC performs for canvas and WebGL fingerprinting. Check the decompiled collector modules to see what draw calls TDC makes (fillText with specific font, arc, fillRect for canvas; specific shaders for WebGL).
- Canvas hash (field 15) is computed by TDC from `toDataURL()` — we need the raw data URL, not the hash. TDC will hash it itself.
- The harvested fingerprint is **machine-specific** — it's valid for this server/GPU combination. If you move to a different machine, re-run the harvester.
- Font detection: TDC uses the "font width measurement" technique (measure text width with a test font vs fallback). The harvester should run TDC's actual font probe or capture the final font list.
- Three async fields (storageEstimate, highEntropyValues, permissionStatus) need their resolved values captured.
- **Do NOT modify `captcha-puppeteer.js`** — the Puppeteer CAPTCHA solver is working and separate from this.
- The `canvas` npm package may still be used for 2D context operations that TDC does beyond fingerprinting (e.g., drawing the slider). The harvested `toDataURL` value should only override the fingerprint-specific canvas operations.

**Tool Request**:
- None blocking — Puppeteer and stealth plugin are already installed from task 10.6.

---

### Task 10.8: Brute-Force jsdom Calibration + Fix Retry Logic ✅

**Verdict**: PASS (round-049) — 17/17 structural tests pass. Live sweep ran successfully. errorCode=12 on first attempt (not errorCode=9). **Calibration is definitively NOT the jsdom blocker.** The server rejects the request before evaluating coordinates — the problem is upstream (fingerprint quality or TLS). This confirms the jsdom path needs real fingerprint data, not coordinate tuning.

**Objective**: Find the correct natural-pixel calibration by trying a range of values against the live server, and fix the retry logic to fetch fresh challenges.

**Background**:
- `ans.x` is in natural pixel space (HAR: ans=484 at display=344px — can't be CSS)
- Current `NATURAL_CALIBRATION = -50` (from -25 CSS / 0.5 ratio) is almost certainly wrong
- The correct value is a fixed constant. The server tells us pass/fail. Just try values.
- Candidate range: **-5 to -50** in steps of ~5 (based on: Puppeteer implies ~-13, bot.py at ratio=0.5 implies -50, truth is somewhere in between)
- Additionally, retries currently re-download the same images (same URLs → same cached puzzle), guaranteeing repeated failure. Must call `getCapBySig()` for a fresh challenge.

**Input**:
- `puppeteer/solver.js` — calibration constant (line ~68) and retry logic (line ~447-456)
- `puppeteer/captcha-client.js` — `getCapBySig()` exists at line 649

**Expected Output**:

1. **`puppeteer/solver.js`** — new `--calibration-sweep` CLI mode:
   - When invoked with `--calibration-sweep`, run a single session per calibration value
   - Try values: `[-5, -10, -13, -15, -20, -25, -30, -35, -40, -45, -50]`
   - For each: get a fresh challenge (prehandle → show → images), solve, apply that calibration, verify
   - Log: `[sweep] cal=${value} raw=${rawOffset} naturalX=${naturalX} → errorCode=${code}`
   - Stop on first errorCode=0 and report the winning calibration
   - Add a 2-second delay between attempts to avoid rate limiting
   - This is a diagnostic mode, not the normal flow

2. **`puppeteer/solver.js`** — fix retry logic:
   - In the wrong-answer retry block (line ~447-456), call `sig = await client.getCapBySig(session, sig)` then `images = await client.downloadImages(sig)` to get a fresh puzzle
   - Log that a fresh challenge was fetched

3. **`puppeteer/solver.js`** — update `NATURAL_CALIBRATION`:
   - After the sweep finds the winning value, hardcode it as the new `NATURAL_CALIBRATION`
   - Remove or simplify `computeNaturalX` if it's just `rawOffset + constant`

**Verification Method**:
1. Run `node jsdom-solver/solver.js --calibration-sweep --domain urlsec.qq.com`
2. Observe which calibration value (if any) returns errorCode=0
3. If a value wins: update `NATURAL_CALIBRATION`, run normal mode, confirm errorCode=0
4. If NO value wins: we definitively know calibration is not the blocker (it's collect/TLS/session)
5. Verify retry fetches fresh images: on errorCode=9 retry, raw offset should differ between attempts

**Pass Criteria**:
1. Sweep mode runs and tests ≥10 calibration values against live server
2. Each attempt logs calibration value, rawOffset, naturalX, and errorCode
3. Retry logic calls `getCapBySig()` (verified by different rawOffset on retry)
4. If a winning calibration is found → `NATURAL_CALIBRATION` is updated and normal mode succeeds
5. If no winner → logged results prove the problem is not calibration

**Failure Impact**: This definitively answers whether calibration is the jsdom blocker. If yes, one constant change fixes everything. If no, we stop chasing coordinates and focus on collect token quality.

**Notes**:
- Each sweep attempt needs a **full fresh session** (new prehandle → show → images → solve → verify). You can't reuse the same session/images because the server's expected answer changes per challenge.
- Rate limiting: 2s between attempts. If the server starts returning non-9 errors (e.g., rate limit), stop and wait.
- The sweep should use the existing jsdom collect/vData generation — we're only varying the calibration constant.
- **Do NOT modify `captcha-puppeteer.js`** — this task is purely about the jsdom/HTTP path.
- If the sweep is too slow (11 values × ~5s each ≈ 1 minute), that's fine. It's a one-time diagnostic.

---

### Task 10.6: Puppeteer Stealth CAPTCHA Solver ✅

**Verdict**: PASS (round-046) — 12/12 structural tests pass. Live test runs end-to-end: Chrome launches, CAPTCHA renders, images intercepted, slide solved, drag performed, verify response captured. errorCode=9 (wrong answer — calibration bug, see 10.6.1).

---

### Task 10.6.1: Fix Slide Offset Calibration + Log Collect Length ✅

**Verdict**: PASS (round-047) — 10/10 structural tests pass. Live test: errorCode=0, ticket obtained, urlsec reCode=0. **CAPTCHA fully solved via Puppeteer.** Key findings: dynamic ratio was 1.8557 (not 0.5), -25 calibration critical, collect=5176 chars from real Chrome.

---

### Task 10.7: Back-Port Calibration Fixes to jsdom/HTTP Path ✅

**Verdict**: PASS (round-048) — 17/17 tests pass. calibrationOffset() removed, CALIBRATION_OFFSET=-25 constant, computeNaturalX decoupled. Deterministic output confirmed. errorCode=9 persists (calibration value uncertain).

**Objective**: Apply the calibration and coordinate math lessons from the Puppeteer success (10.6.1) to the jsdom/HTTP path in `solver.js`. The jsdom path has two bugs: (1) random jitter in calibrationOffset(), (2) hardcoded ratio=0.5 that may be wrong.

**Background — What Puppeteer Revealed**:
The Puppeteer success proved:
- Dynamic ratio (1.8557 at that viewport) was **critical** — hardcoded 0.5 gave answers ~4x off
- Fixed -25 calibration (no random jitter) is what `bot.py` uses
- Both `bot.py` and Puppeteer work by **physically dragging** a slider in a real browser, so the ratio converts rawOffset (natural pixels) to CSS drag distance

**The jsdom Coordinate Problem**:
The jsdom path is fundamentally different — it doesn't drag anything. It:
1. Gets `rawOffset` from OpenCV (natural pixel space, 680px-wide image)
2. Converts to CSS: `cssOffset = round(rawOffset * ratio + calibration)`  
3. Passes `cssOffset` to TDC as `ans.x` and `slideValue` (for collect token generation)
4. Converts back to natural: `naturalX = floor(cssOffset / ratio)`
5. Sends `ans: "naturalX,slideY;"` in the verify POST

With ratio=0.5, calibration=-25, rawOffset=477:
- cssOffset = round(477 * 0.5 - 25) = 214
- naturalX = floor(214 / 0.5) = 428
- Answer sent: "428,slideY;" — that's **49 natural pixels off** from the raw OpenCV answer

The round-trip through CSS space introduces a large error. The -25 CSS calibration becomes -50 in natural pixels at ratio=0.5.

**Key Question**: What coordinate space does the server expect in the `ans` field? Two possibilities:
- **Natural pixels (680-wide)**: Then rawOffset is already close, just needs ~-13 to -15 px calibration (matching -25 CSS at ratio≈1.86)
- **CSS pixels (340-wide)**: Then ratio=0.5 is correct for the math, but -25 CSS is a huge correction

**Fixes Required**:

**Fix 1: Remove random jitter** — `calibrationOffset()` in `solver.js` should return -25 (fixed), not -25±5 (random). This is confirmed by both `bot.py` and the Puppeteer success.

**Fix 2: Fix the coordinate math** — The current round-trip (natural→CSS→natural) amplifies calibration error. Two approaches:

- **Option A (conservative)**: Keep ratio=0.5, just fix jitter. The answer math becomes: `naturalX = floor((rawOffset * 0.5 - 25) / 0.5)` = `floor(rawOffset - 50)`. This is a -50 natural pixel offset.
- **Option B (correct the round-trip)**: Since the `ans` field is in natural pixel space and `rawOffset` is already in natural pixel space, compute: `naturalX = rawOffset + NATURAL_CALIBRATION` where `NATURAL_CALIBRATION ≈ -13` (derived from -25 CSS / 1.86 ratio observed in Puppeteer). Still pass `cssOffset` to TDC for collect token consistency.

**Recommendation**: Implement **Option B** — decouple the answer calculation from the CSS calculation:
```
// For TDC collect token (CSS pixel space, assuming 340px display):
const cssOffset = Math.round(rawOffset * 0.5 - 25);
// For verify answer (natural pixel space, 680px image):  
const naturalX = Math.round(rawOffset - 13);
```
This way the CSS value fed to TDC is consistent with a 340px display assumption, but the answer sent to the server uses a more accurate calibration in the correct coordinate space.

**Input**:
- `puppeteer/solver.js` — lines 77-95 (`calibrationOffset`, `applyCalibration`) and lines 236-268 (solve loop)
- `reports/round-047.md` — Puppeteer metrics: ratio=1.8557, calibration=-25, raw=477→css=860
- `bot.py` — lines 79-81: reference formula

**Expected Output**:
1. **`puppeteer/solver.js`** — three changes:
   - **Fix 1**: `calibrationOffset()` → returns fixed -25 (no random). Or better: replace with `const CALIBRATION_OFFSET = -25;`
   - **Fix 2**: Decouple answer coordinates from CSS coordinates in the solve loop:
     - `cssOffset` still uses `ratio * rawOffset + CALIBRATION_OFFSET` (for TDC collect)
     - `naturalX` uses `Math.round(rawOffset + NATURAL_CALIBRATION)` where `NATURAL_CALIBRATION = Math.round(CALIBRATION_OFFSET / DEFAULT_RATIO)` = -50 (at ratio=0.5) — OR a fixed -13 if we believe the Puppeteer ratio is canonical
   - **Fix 3**: Export `CALIBRATION_OFFSET` constant (match Puppeteer module), remove `calibrationOffset` function export
2. **Log the coordinate breakdown** — update the log line to show both cssOffset and naturalX independently

**Verification Method**:
1. Structural: `calibrationOffset()` function no longer has `Math.random()`
2. Structural: `CALIBRATION_OFFSET = -25` constant exists
3. Structural: `naturalX` calculation is decoupled from `cssOffset / ratio` round-trip (or at minimum, calibration has no jitter)
4. Unit test: Given rawOffset=477, ratio=0.5, verify cssOffset and naturalX values are deterministic (same output every call)
5. Live test: Run `node jsdom-solver/solver.js --domain urlsec.qq.com`, report errorCode. (Expected: still errorCode=9 due to collect token quality, but coordinates will be more accurate)

**Pass Criteria**:
1. All structural checks pass
2. Unit test confirms deterministic output (no randomness)
3. Live test runs and logs coordinate breakdown
4. errorCode is documented (0=unexpected bonus, 9=expected, tells us remaining issue is collect/TLS not coordinates)

**Failure Impact**: Low — this is a cleanup/alignment task. The Puppeteer path already works. But fixing jsdom coordinates removes one variable if we later improve collect token quality.

**Notes**:
- The jsdom path will likely still return errorCode=9 even with perfect coordinates. The 10.5.5 investigation proved the remaining blocker is collect token quality (5176 chars from real Chrome vs ~5800 from jsdom, both shorter than the 8128 in HAR). The server rejects jsdom sessions for fingerprint reasons, not coordinate reasons.
- This task is about **correctness and code quality** — removing randomness, aligning with bot.py, and ensuring coordinates are as accurate as possible.
- Do NOT change `captcha-puppeteer.js` — it's working. Only modify `solver.js`.
- The `applyCalibration` function is also used in exports — update callers/exports accordingly.

**Objective**: Fix the slide offset calculation to match `bot.py`'s proven formula, and add request interception to log the collect token length from the Puppeteer flow. The tester confirmed the -25 base calibration was accidentally removed.

**Input**:
- `puppeteer/captcha-puppeteer.js` — line 346: `cssOffset = Math.round(rawOffset * this.ratio)` (missing calibration)
- `bot.py` — lines 79-81: the working formula `final_distance = (raw_offset * ratio) + calibration` where `calibration = -25`
- `reports/round-046.md` — tester's analysis

**Root Cause Analysis**:
`bot.py` does TWO things we're missing:

1. **Dynamic ratio** (line 79): `ratio = bg_element.rect.size[0] / natural_width` — reads the ACTUAL rendered width of `#slideBg` and divides by the natural image width. NOT hardcoded 0.5.
2. **Base calibration of -25** (line 80): `calibration = -25 + random.randint(-5, 5)` — the user asked to remove the random jitter but keep the -25 base.

With raw=511, the difference is huge:
- Current: `round(511 * 0.5)` = 256 CSS px
- With bot.py formula (assuming ratio≈0.5): `round(511 * 0.5) - 25` = 231 CSS px
- That 25px gap is ~7% of the track width — definitely enough to fail.

**Expected Output**:
1. **`puppeteer/captcha-puppeteer.js`** — two fixes:
   - **Fix A: Dynamic ratio** — after CAPTCHA renders, read `#slideBg` element's rendered width via `page.evaluate()`, compute `ratio = renderedWidth / naturalWidth` where `naturalWidth` comes from the intercepted bg image dimensions. Fall back to 0.5 if element not found.
   - **Fix B: -25 calibration** — apply `cssOffset = Math.round(rawOffset * ratio) - 25` (fixed base, NO random jitter)
   - **Fix C: Log collect length** — add a `page.on('request')` interceptor that logs the POST body length of the verify request, specifically the `collect` field length. This tells us if the real browser produces ~8128 chars.
   - **Fix D: Remove dead `calibrationOffset()` export**
2. **Live test log** — run solver, report: errorCode, collect length, ratio used, cssOffset

**Verification Method**:
1. Structural: `calibrationOffset()` is no longer exported
2. Structural: `_performDrag` or `solve` uses dynamic ratio from `#slideBg` element
3. Structural: cssOffset formula includes `- 25`
4. Structural: verify request body is logged (collect field length)
5. Live test: run `node jsdom-solver/solver.js --domain urlsec.qq.com`, capture errorCode + collect length

**Pass Criteria**:
1. All 4 structural checks pass
2. Live test completes — collect length is logged (expecting ~8000+ chars from real Chrome)
3. errorCode is logged — if 0, we're done; if 9, we have collect length data to debug further
4. cssOffset in log shows the -25 adjustment was applied

**Failure Impact**: If offset is still wrong after -25 calibration, the OpenCV template matching itself may need tuning (threshold, method). If collect is still short, the CAPTCHA page's tdc.js may not be loading properly in Puppeteer.

**Notes**:
- **Dynamic ratio is critical**: The rendered CAPTCHA width depends on viewport, CSS, and device pixel ratio. Don't assume 0.5 — read it from the DOM like bot.py does.
- **How to get natural width**: Either (a) read the intercepted bg image buffer's dimensions (e.g., with a PNG/JPEG header parser), or (b) use `page.evaluate(() => document.querySelector('#slideBg').naturalWidth)`. Option (b) is simpler.
- **Request interception for logging**: Use `page.on('request')` alongside the existing `page.on('response')`. For the verify POST, parse the body with `URLSearchParams` and log `collect.length`.
- **Don't change the drag behavior** — the ease-out curve from 10.6 is fine. Only change the offset calculation.
- **The -25 may need tuning**: If -25 doesn't work, try -20 or -30. The exact value compensates for the template matching algorithm's offset. But start with -25 since that's what bot.py uses.

---

### Task 10.5.5: Full HAR Alignment ✅

**Verdict**: PASS (round-045) — 33/33 tests pass. All 5 categories of HTTP differences fixed. Live test errorCode 9 persists — cause is beyond HTTP formatting (collect token quality / TLS fingerprint). Pivoting to Puppeteer hybrid.

---

### Task 10.5.1: HAR Traffic Analysis ✅ (director analysis)

**Verdict**: COMPLETE — Root cause identified. See `docs/HAR_ANALYSIS.md`.

**Root cause**: Missing `vData` field in verify POST. `vData` is a 152-char token generated by `vm-slide.enc.js` (a ChaosVM bytecode script) via jQuery ajaxPrefilter. Without it, server returns errorCode 9 regardless of answer/collect content.

---

### Task 10.5.5 (archived): Full HAR Alignment — Match Every Request Exactly

**Objective**: Stop fixing one difference at a time. Align ALL HTTP requests (prehandle, show page, images, verify) with the HAR capture exactly — params, headers, URLs. Then run a live test.

**Why**: We've done 4 rounds of incremental fixes (vData, field order, jQuery serialization, probe). Each fix was correct but errorCode 9 persists. The vm-slide probe proved vData generation is clean. The remaining differences are scattered across multiple requests — any one could flag the session. Fix them all at once.

**Input**:
- `captcha-har.har` — ground truth for all 12 requests
- `puppeteer/captcha-client.js` — HTTP client
- `puppeteer/solver.js` — orchestrator

**Remaining differences to fix** (5 categories):

**1. Prehandle URL params** — 8 missing, 2 extra:
```
MISSING: enableAged=0, grayscale=1, dyeid=0, elder_captcha=0, wb=2, version=1.1.0, subsid=9, sess=
EXTRA (remove): graession, wxLang
FIX js= hash: /tcaptcha-frame.a29e0c59.js → /tcaptcha-frame.d0752eae.js
Match param ORDER to HAR exactly.
```

**2. Image download URLs** — wrong endpoint:
```
REAL:  /hycdn?index=1&image=<imageId>?aid=<aid>&sess=<sess>...
OURS:  /cap_union_new_getcapbysig?img_index=1&aid=<aid>&sess=<sess>...
The show page config has cdnPic1/cdnPic2 fields with the correct hycdn URLs. Use them directly.
```

**3. Verify request headers** — missing Chrome client hints:
```
ADD: sec-ch-ua: "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"
ADD: sec-ch-ua-mobile: ?0
ADD: sec-ch-ua-platform: "Windows"
ADD: Cache-Control: no-cache
ADD: Pragma: no-cache
ADD: Sec-Fetch-Dest: empty
ADD: Sec-Fetch-Mode: cors
ADD: Sec-Fetch-Site: same-origin
```

**4. All request headers** — add client hints to ALL requests, not just verify:
```
Check HAR headers for prehandle, show page, images, TDC, vm-slide — add matching headers.
```

**5. Subsid counter** — hardcoded 1 everywhere:
```
Real browser: prehandle=9, show=10, hycdn=11,12, caplog=13, verify POST subsid=10 (show page value)
At minimum: increment subsid for each request in the session.
Simple implementation: start at 1, increment per request.
```

**Expected Output**:
1. **`puppeteer/captcha-client.js`** — all 5 categories fixed:
   - `prehandle()` params match HAR exactly (order + values)
   - `_getShowConfig()` uses correct image URLs from cdnPic1/cdnPic2
   - `downloadImages()` uses hycdn URLs (not getcapbysig)
   - `verify()` sends Chrome client hint headers
   - All methods send matching headers (sec-ch-ua, Sec-Fetch-*, Cache-Control)
   - Subsid increments per request
2. **`puppeteer/solver.js`** — any needed adjustments
3. **Live test log** — run solver, capture full request/response trace, report errorCode

**Verification Method**:
1. **Param-by-param comparison**: For each of the 4 request types (prehandle, show, images, verify), extract URL params / POST body and diff against HAR. Zero unexplained differences.
2. **Header comparison**: For the verify POST, diff all headers against HAR. Only acceptable differences: Cookie (session-specific), Content-Length (data-dependent), Referer (session-specific URL).
3. **Live test**: Run solver. Report errorCode.

**Pass Criteria**:
1. All 5 categories of differences fixed
2. Live test errorCode documented
3. If errorCode 0: we're done
4. If errorCode 9: document EXACTLY what still differs from HAR (should be nothing except session-specific values and collect size)

**Failure Impact**: If errorCode 9 persists after matching HAR exactly, the remaining cause is either collect token quality (5800 vs 8128 chars) or server-side session state that can't be replicated without running the full iframe JS in a real browser. At that point we'd switch to a Puppeteer hybrid approach.

**Notes**:
- **This is the "fix everything at once" task**. No more incremental single-fix rounds.
- **Prehandle is the most critical fix** — it's the FIRST request and establishes the session. Missing params here could cause the server to flag the entire session from the start.
- **Image URL endpoint matters** — using `getcapbysig` instead of `hycdn` is a bot fingerprint (real browsers never call getcapbysig for the initial load).
- **js= hash**: The tcaptcha-frame JS filename hash changes between versions. Use the one from the HAR or fetch the current one dynamically.
- **Don't over-engineer subsid** — just start at 1 and increment. The exact starting number (9 in HAR) depends on the outer page's SDK, which varies.
- **After this task**: If still errorCode 9, the only remaining suspect is collect size (5800 vs 8128). That would require improving the jsdom TDC mocks to produce more fingerprint data, which is a separate investigation.

---

### Task 10.5.4: vm-slide.enc.js Dynamic Probe ✅

**Verdict**: PASS (round-044) — 19/19 tests pass. vm-slide reads only `navigator.userAgent` (3×), `Date.now()` (1×), `document.readyState` (1×), `createElement('fake')` (1×). **No bot detection, no fingerprinting.** vData generation is clean — the problem is elsewhere.

---

### Task 10.5.4 (original plan): vm-slide.enc.js Dynamic Probe — What Does It Read?

**Objective**: Instrument the jsdom environment with Proxy traps to log **every browser API access** that `vm-slide.enc.js` makes during execution and vData generation. Determine whether it fingerprints the environment (and could detect jsdom) or purely computes vData from the POST body.

**Input**:
- `puppeteer/vdata-generator.js` — current vData generator (working but possibly producing invalid vData)
- `puppeteer/cache/vm-slide.e201876f.enc.js` — ChaosVM bytecode
- `puppeteer/cache/slide-jy.js` — jQuery

**Expected Output**:
- **`puppeteer/debug/vm-slide-probe.js`** — standalone diagnostic script that:
  1. Creates a jsdom window
  2. Wraps these objects with deep Proxy logging **before** loading any scripts:
     - `window.navigator` — all property reads (userAgent, platform, webdriver, plugins, etc.)
     - `window.document` — property reads (cookie, referrer, hidden, visibilityState, etc.)
     - `window.screen` — all property reads
     - `window.location` — all property reads
     - `window` top-level — reads of chrome, opera, __phantomas, _phantom, callPhantom, Buffer, process, etc. (common bot detection props)
     - `window.HTMLCanvasElement.prototype` — getContext, toDataURL calls
     - `window.Date` — constructor calls, now() calls
     - `window.Math` — random() calls
     - `window.performance` — timing reads
     - `window.XMLHttpRequest.prototype` — open/send interception (already done, but log args)
  3. Loads jQuery (`slide-jy.js`)
  4. Loads `vm-slide.enc.js`
  5. Triggers `$.ajax({ type: 'POST', url: '/cap_union_new_verify', data: testFields })`
  6. Prints a **categorized report** to stdout:
     ```
     === NAVIGATOR READS ===
     navigator.userAgent (1 time)
     navigator.platform (2 times)
     navigator.webdriver (1 time)  ← BOT DETECTION
     ...
     
     === DOCUMENT READS ===
     document.cookie (3 times)
     ...
     
     === WINDOW GLOBAL READS ===
     window.chrome (1 time)  ← BOT DETECTION  
     window.__phantomas (1 time)  ← BOT DETECTION
     ...
     
     === CANVAS/WEBGL ===
     (none or list)
     
     === DATE/MATH/TIMING ===
     Date.now() (5 times)
     Math.random() (3 times)
     ...
     
     === XHR ACTIVITY ===
     open('POST', '/cap_union_new_verify')
     send(body: 4523 chars, vData appended: yes, vData length: 152)
     
     === SUMMARY ===
     Total unique properties accessed: N
     Bot-detection properties accessed: N (list them)
     Fingerprinting APIs used: N (list them)
     Environment-independent (pure body hash): yes/no
     ```

**Verification Method**:
1. Script runs without errors and produces the categorized report
2. Every property access by vm-slide.enc.js during load AND during $.ajax trigger is captured
3. Bot-detection properties are flagged (navigator.webdriver, window.chrome, window.__phantomas, etc.)
4. Report clearly answers: does vm-slide fingerprint the environment, or just hash the POST body?

**Pass Criteria**:
1. Probe script executes and produces a readable categorized report
2. At minimum captures: navigator reads, document reads, window global reads, Date/Math usage
3. Report identifies all bot-detection-relevant property accesses
4. Clear conclusion: "vm-slide reads N environment properties" or "vm-slide only accesses XHR/POST body"

**Failure Impact**: Without understanding what vm-slide reads, we're guessing. This probe is cheap (~1 hour) and tells us exactly where to focus.

**Notes**:
- **Proxy approach**: Use `new Proxy(target, { get(t,p) { log(p); return Reflect.get(t,p); } })`. For nested objects (navigator.plugins[0].name), wrap the returned object too if it's an object.
- **Two phases of execution**: vm-slide runs code (a) when first loaded (initialization), and (b) when the XHR hook fires during $.ajax. Log both phases separately — initialization reads might differ from per-request reads.
- **Don't just log — categorize**: Group by object (navigator, document, window, screen) and flag known bot-detection properties with a marker like `← BOT DETECTION`.
- **Known bot-detection properties to flag**:
  - `navigator.webdriver` (true in automation)
  - `window.chrome` (missing in non-Chrome)
  - `window.__phantomas`, `window._phantom`, `window.callPhantom` (PhantomJS)
  - `window.Buffer`, `window.process` (Node.js detection)
  - `window.emit`, `window.domAutomation` (Selenium)
  - `document.hidden` (headless detection)
  - `navigator.plugins.length === 0` (headless detection)
  - `navigator.languages` (missing in headless)
- **Test fields**: Use realistic-looking fields from the solver (aid, sess, collect, etc.) — the vData computation may behave differently with empty vs real values.
- **Keep it simple**: This is a diagnostic script, not production code. Readability > elegance.

---

### Task 10.5.3: Fix POST Body Field Order + jQuery Serialization ✅

**Verdict**: PASS (round-043) — 43/43 tests pass. Field order matches HAR exactly in both files. jQuery serialization path wired correctly. showUrl stored and used as Referer. **Live test still returns errorCode 9** — field order was necessary but not sufficient.

---

### Task 10.5.3 (original plan): Fix POST Body Field Order + Live Integration Test

**Objective**: Fix the verify POST body to use the **exact field order** from the show page URL params (matching real browser behavior), then run a live integration test. The current field order is wrong — 30/38 fields are in different positions vs the real browser — which likely invalidates vData since it's a signature over the POST body string.

**Input**:
- `captcha-har.har` — ground truth field order (show page URL → verify POST)
- `puppeteer/captcha-client.js` — verify() method builds POST body in wrong order
- `puppeteer/solver.js` — vdataFields built in wrong order
- `docs/HAR_ANALYSIS.md` — reference analysis

**Root cause of continued errorCode 9**:
The real browser's verify POST body is built by `queryMap()` which reads the **iframe URL params in their original order**. The iframe URL = show page URL, so the field order is:

```
PHASE 1 — queryMap base (from show page URL param order):
 1. aid           9. enableAged    17. wxLang
 2. protocol     10. enableDarkMode 18. tcScale
 3. accver       11. grayscale     19. uid
 4. showtype     12. dyeid         20. cap_cd
 5. ua           13. clientype     21. rnd
 6. noheader     14. sess (overridden with show config sess)
 7. fb           15. fwidth        22. prehandleLoadTime
 8. aged         16. sid           23. createIframeStart
                                   24. global
                                   25. subsid

PHASE 2 — verify-specific fields appended by tcaptcha-slide.js:
26. cdata        30. subcapclass   34. tlg
27. ans          31. pow_answer    35. fpinfo
28. vsig         32. pow_calc_time 36. eks
29. websig       33. collect       37. nonce
                                   38. vlg

PHASE 3 — vm-slide hook appends:
39. vData
```

Our bot puts `enableAged, grayscale, dyeid, global, clientype` at the END (positions 34–38) instead of positions 9–13 and 24. This means the POST body string that vData is computed over is different from what the server expects when it revalidates.

**Expected Output**:
1. **`puppeteer/captcha-client.js` fix**: Rebuild `postFields` in verify() to match the exact real browser field order (25 queryMap fields in show page URL order, then 13 verify-specific fields)
2. **`puppeteer/solver.js` fix**: Rebuild `vdataFields` in the SAME order so vData is computed over an identical body string
3. **`puppeteer/captcha-client.js` fix**: Store the full show page URL during `_getShowConfig()` as `sig.showUrl` and use it as the verify Referer
4. **Live test results**: Run `node jsdom-solver/solver.js --domain example.com` with verbose logging and report the errorCode

**Verification Method**:
1. **Field order test**: Extract field names from our POST body string (split on `&`, take keys before `=`) and compare against HAR's field order — must match for all 38 pre-vData fields
2. **vData consistency test**: The POST body string passed to `generateVData()` must be byte-identical to the POST body string passed to `verify()` (minus the `&vData=...` suffix)
3. **Live test**: Run solver against live server. Report exact errorCode.

**Pass Criteria**:
1. Field order in both solver.js vdataFields AND captcha-client.js postFields matches HAR exactly (all 38 fields in correct positions)
2. Show page URL stored and used as Referer
3. Live test errorCode documented
4. If errorCode 0: full pipeline works end-to-end
5. If errorCode != 0: isolation tests run and results documented

**Failure Impact**: If field order fix doesn't resolve errorCode 9, we need deeper investigation into vData computation or jsdom detection.

**Notes**:
- **Why field order matters**: `vm-slide.enc.js` computes vData from the URL-encoded POST body **string**. The server likely recomputes vData from the received fields in the canonical order (= iframe URL param order). If our field order differs, the server's recomputed vData won't match ours → errorCode 9.
- **How to get the correct field order dynamically**: The show page URL determines positions 1–25. During `_getShowConfig()`, parse and store the URL param names in order. In verify(), iterate those names first, then append verify-specific fields. This makes the bot robust to server-side changes in param order.
- **Simpler alternative**: Hardcode the 25 queryMap field names in the order observed in the HAR. This is fragile but sufficient for now.
- **The sess override**: The iframe URL has the prehandle sess, but `captchaConfig.sess` (show config) overrides it. The field stays at position 14 but value changes. Our code already does this.
- **If still errorCode 9 after field order fix**, run these isolation tests:
  1. **vData format check**: Compare charset (should use `-`, `_`, `*` custom base64)
  2. **Empty collect + valid vData**: Does error change? If yes → collect matters now
  3. **Timing**: Add realistic delays (~3s between show page load and verify)
  4. **caplog beacon**: Try sending the pre-verify caplog GET request

---

### Task 10.5.2: vData Generation via vm-slide.enc.js ✅

**Verdict**: PASS (round-042) — 53/53 tests pass. vData generator produces 152-char tokens matching HAR length. XHR hooking approach works correctly. All 39 fields present in POST body.

### Task 10.5.2 (original plan): vData Generation via vm-slide.enc.js

**Objective**: Run `vm-slide.enc.js` (ChaosVM bytecode) in our jsdom environment alongside jQuery to generate the `vData` token, then add it to the verify POST body along with other missing fields identified in the HAR analysis.

**Input**:
- `vm-slide.e201876f.enc.js` — 44KB ChaosVM script (download from `https://t.captcha.qq.com/vm-slide.e201876f.enc.js`)
- `slide-jy.js` — jQuery library used by CAPTCHA iframe (download from `https://captcha.gtimg.com/1/slide-jy.js`)
- `captcha-har.har` — real browser HAR for reference (verify POST field comparison)
- `docs/HAR_ANALYSIS.md` — analysis showing all missing fields
- `puppeteer/captcha-client.js` — HTTP client to patch
- `puppeteer/solver.js` — orchestrator to patch
- `jsdom/` — existing jsdom infrastructure from Phase 9

**Expected Output**:
1. **`puppeteer/vdata-generator.js`** — new module that:
   - Loads jQuery (`slide-jy.js`) in jsdom
   - Loads `vm-slide.enc.js` in the same jsdom window
   - Hooks `$.ajax` or `$.ajaxPrefilter` to intercept the vData injection
   - Exports `generateVData(postParams)` → returns the vData string
   - Downloads and caches `vm-slide.enc.js` and `slide-jy.js` on first use
2. **`puppeteer/captcha-client.js` patches**:
   - Add `vData` field to verify POST body
   - Add missing fields: `enableAged=0`, `grayscale=1`, `dyeid=0`, `global=0`
   - Remove extra fields: `capclass`, `spt`, `lang`, `entry_url`
   - Use full show page URL as Referer (not just base path)
3. **`puppeteer/solver.js` patches**:
   - Call `generateVData()` before verify
   - Pass complete POST params to vData generator

**Verification Method**:
1. **Unit test**: Load vm-slide.enc.js + jQuery in jsdom, verify it produces a non-empty vData string (>100 chars) without crashing
2. **Field comparison**: Compare our verify POST body against the HAR's real POST body — all 39 fields must match (field names + value types, not exact values since they're session-specific)
3. **Live test**: Run `node jsdom-solver/solver.js --domain example.com` against live server. Check if errorCode changes from 9 to something else (0=success, or at least a different error indicating progress)

**Pass Criteria**:
1. `generateVData(postParams)` returns a non-empty string (>100 chars)
2. vm-slide.enc.js executes without errors in jsdom
3. Verify POST body contains all 39 fields matching the real browser's field set
4. Live test returns errorCode !== 9 (ideally errorCode 0)

**Failure Impact**: If vData cannot be generated, the bot cannot pass server verification. This is the final blocker for Phase 10.

**Notes**:
- **vm-slide.enc.js is a static file** (hash `e201876f` in filename) — can be downloaded once and cached. It's NOT session-specific (unlike tdc.js which has session data baked in).
- **How vm-slide hooks jQuery**: It likely registers via `$.ajaxPrefilter()` which jQuery calls before every `$.ajax()`. The prefilter receives the request options and can modify `data` to add `vData`. The reverser should:
  1. Create a jsdom window with `document` and basic DOM
  2. Load `slide-jy.js` (jQuery) → now `window.$` and `window.jQuery` are available
  3. Load `vm-slide.enc.js` → ChaosVM executes and registers its ajaxPrefilter
  4. Hook `$.ajax` to capture the modified data:
     ```javascript
     const originalAjax = $.ajax;
     $.ajax = function(opts) {
       // opts.data now contains vData (added by vm-slide's prefilter)
       capturedVData = opts.data.vData;
       // Don't actually send the request
       return { then: () => {} };
     };
     ```
  5. Trigger the verify path (or directly call the prefilter chain)
- **Alternative approach**: If hooking is complex, try directly calling `window.getVData(paramString)` after loading vm-slide — the IE path in tcaptcha-slide.js uses this function, and vm-slide may expose it.
- **jQuery version**: slide-jy.js is jQuery (96KB). It must be loaded BEFORE vm-slide.enc.js.
- **The `vlg=0_0_1` field** means "VM version info" — it stays `0_0_1` even when vData is present. Don't change it.
- **Subsid tracking**: Low priority but the real browser increments subsid across requests (9, 10, 11, 12...). Our bot sends 1 everywhere. Fix if easy.
- **caplog beacon**: Low priority. May not be required. Try without first.

**Tool Request**:
- No new packages needed — jsdom and existing infrastructure from Phase 9 should work
- The reverser may need to download `vm-slide.e201876f.enc.js` and `slide-jy.js` to the project (curl/wget)

---

### Task 10.5: Live Integration Test & End-to-End Validation — FAIL (attempt 1)

**Verdict**: FAIL — All stages 1-5 work correctly, but verify always returns errorCode 9. Extensive debugging (11 attempts) proved the server rejects the session before evaluating the answer or collect token. See `reverser-report.md` for full details.

**Root cause (suspected)**: The real browser's CAPTCHA iframe JavaScript (`tcaptcha-slide.js` + `vm-slide.enc.js`) makes hidden API calls or WebSocket connections that "activate" the session server-side. Without these, the verify POST is rejected regardless of answer correctness.

**Evidence**: Attempt 8 showed that valid, empty, and garbage collect tokens all return errorCode 9 — the server isn't checking content, it's rejecting the session itself.

**Previous objective**: Run `solver.js` against the live `t.captcha.qq.com` endpoints to validate the full CAPTCHA-solving pipeline works end-to-end, diagnose and fix any issues, and implement the `cgi.urlsec.qq.com/index.php` submission flow so that solved tickets produce actual safe/unsafe URL security results.

**Input**:
- `puppeteer/solver.js` — orchestrator (Task 10.4, PASS)
- `puppeteer/captcha-client.js` — HTTP client (Task 10.2, PASS)
- `puppeteer/slide-solver.js` — OpenCV slide solver (Task 10.1.1, PASS)
- `puppeteer/collect-generator.js` — token generator (Task 10.3, PASS)
- `bot.py` — reference implementation (lines 24-27: `extract_result` shows response parsing; lines 62-63, 91-94: urlsec response capture)
- `tdc.js` — TDC VM script

**Expected Output**:
1. **Working end-to-end pipeline** — `node jsdom-solver/solver.js --domain example.com` completes without errors, producing a JSON result
2. **Fixes for any issues** found during live testing (wrong parameters, missing headers, incorrect formats, etc.)
3. **urlsec submission** — after obtaining a CAPTCHA ticket, submit it to `cgi.urlsec.qq.com/index.php` to get the actual URL security verdict. Update `solver.js` so that `status` reflects the real server response (`safe`/`unsafe`) instead of the current placeholder.

**Verification Method**:
The reverser runs the solver against live endpoints and captures the full request/response trace for each stage. Success is determined by server responses, NOT by running bot.py (which requires Chrome and is unavailable in this environment).

1. **Stage-by-stage validation** — run solver and log each stage:
   - `prehandle()` → must return valid JSONP with `sess` field (not 403 or HTML error)
   - `getSig()` → must return JSONP with image URLs, nonce, vsig
   - `downloadImages()` → must return non-empty Buffers (check lengths > 1000 bytes)
   - `solveSlider()` → must return offset in reasonable range (100–600 for 680px-wide images)
   - `generateCollect()` → must return non-empty `collect`, `eks`, `tlg` strings
   - `verify()` → must return JSONP with `errorCode` field (0=success, 9=wrong answer, others=error)
2. **Success criterion**: At least one solve attempt returns `errorCode: 0` (correct answer) within the retry budget. If all attempts return `errorCode: 9`, the pipeline is structurally correct but calibration may need tuning — this is a partial pass.
3. **urlsec submission**: If a ticket is obtained, the urlsec submission must return a response containing `results` with URL security data (matching `bot.py`'s `extract_result` format).

**Pass Criteria**:
1. Solver runs against live server without crashing at any stage
2. `prehandle`, `getSig`, `downloadImages` all return valid data (correct shapes, no HTTP errors)
3. `verify` returns a valid JSONP response with `errorCode` (pipeline reaches the server)
4. At least one CAPTCHA solve succeeds (`errorCode: 0`) OR all return `errorCode: 9` (structurally correct, calibration-only issue)
5. If ticket obtained: urlsec submission implemented and returns URL security results
6. Any bugs found during live testing are fixed in the source files

**Failure Impact**: This is the final validation gate for Phase 10. If the pipeline doesn't work against live servers, the entire bot is non-functional.

**Notes**:
- **No Chrome/bot.py available**: We cannot run `bot.py` for comparison. Validation is purely based on server responses.
- **urlsec submission flow**: From `bot.py` lines 91-94, after the slider drag, the browser captures a response from `cgi.urlsec.qq.com/index.php`. This is the URL security check result. The reverser needs to determine:
  1. What HTTP request triggers this (GET or POST, what params — likely includes the domain, ticket, and randstr)
  2. What the response format is (JSONP? plain JSON? — `bot.py` line 25 strips `callback(...)` wrapping)
  3. How to integrate this into `solver.js`
  - **Hint**: The `check.html` page source likely reveals the submission endpoint and parameters. The reverser should fetch and inspect `https://urlsec.qq.com/check.html` to find the JavaScript that submits to `cgi.urlsec.qq.com`.
- **Debugging approach**: If a stage fails, add verbose logging (dump request URLs, headers, response status, first 500 chars of body) to diagnose the issue. Fix and retry iteratively.
- **Rate limiting**: The live server may rate-limit. Use a single domain for testing, not a batch. If rate-limited, wait and retry.
- **Calibration tuning**: If `errorCode: 9` persists across all retries, the calibration offset or ratio may be wrong. Try:
  - Different ratio values (0.45, 0.5, 0.55)
  - Different calibration ranges
  - Log the raw offset and CSS offset for each attempt
- **Network requirements**: This task requires live internet access to `t.captcha.qq.com` and `urlsec.qq.com`.

### Task 10.4: Bot Orchestrator & CLI ✅

**Verdict**: PASS (round-041) — 138/138 tests pass across 20 sections. All 9 acceptance criteria met. Calibration math matches bot.py exactly. Full 6-step flow verified. Retry logic, CLI args, crash resilience all working.

**Objective**: Build the main orchestrator that ties together all Phase 10 modules — reads a domain list, submits each to `urlsec.qq.com`, detects CAPTCHA challenges, solves them (image download → slide solve → token generation → verify), retries on wrong answers, and saves results to JSON. This is the Node.js replacement for `bot.py`.

**Input**:
- `bot.py` — reference implementation (DrissionPage browser automation, we replicate headlessly)
- `puppeteer/captcha-client.js` — `CaptchaClient` class with `prehandle()`, `getSig()`, `getCapBySig()`, `downloadImages()`, `verify()` (Task 10.2, PASS)
- `puppeteer/slide-solver.js` — `solveSlider(bgBuffer, sliceBuffer)` → raw pixel offset (Task 10.1.1, PASS)
- `puppeteer/collect-generator.js` — `generateCollect({tdcFile, appid, nonce, ans, slideValue, ...})` → `{collect, eks, tlg}` (Task 10.3, PASS)
- `tdc.js` — TDC VM script (passed to collect-generator)

**Expected Output**:
- **`puppeteer/solver.js`** — single CommonJS module, both library API and CLI entry point

  ```js
  // Library usage:
  const { solveDomain, solveAll } = require('./jsdom-solver/solver');

  // Solve a single domain:
  const result = await solveDomain('example.com', { aid: '2090803262' });
  // → { domain, status: 'safe'|'unsafe'|'error', ticket?, randstr?, data?, error? }

  // Solve a list of domains:
  const results = await solveAll(['a.com', 'b.com'], {
    aid: '2090803262',
    output: 'results.json',       // optional, auto-saves after each domain
    maxRetries: 3,                 // wrong-answer retries per domain (default 3)
    delayMs: 1000,                 // delay between domains (default 1000ms)
  });

  // CLI usage:
  // node jsdom-solver/solver.js --domains domain.lst --output results.json
  // node jsdom-solver/solver.js --domain example.com
  ```

- The module must:
  1. **`solveDomain(domain, opts)`** — full solve flow for one domain:
     a. Create a `CaptchaClient` with `{ aid, referer: 'https://urlsec.qq.com/check.html' }`
     b. Call `client.prehandle()` → get session
     c. Call `client.getSig(session)` → get image URLs, nonce, vsig, etc.
     d. Call `client.downloadImages(sig)` → get `bgBuffer`, `sliceBuffer`
     e. Call `solveSlider(bgBuffer, sliceBuffer)` → raw pixel offset
     f. Apply calibration: `cssOffset = rawOffset * ratio + calibrationOffset` (ratio = displayed width / natural width; calibration ≈ -25 ± random jitter, matching `bot.py` line 80-81)
     g. Call `generateCollect({tdcFile, appid, nonce, ans: {x: cssOffset, y: 158}, slideValue: cssOffset, trycnt, refreshcnt: 0, ft: sig.ft || ''})` → `{collect, eks, tlg}`
     h. Call `client.verify({session, sig, ans: `${cssOffset},158;`, collect, eks, tlg})` → result
     i. If `errorCode === 0` → success (return ticket/randstr)
     j. If `errorCode === 9` (wrong answer) AND retries remaining → call `client.getCapBySig()` for new images, re-solve, re-verify (increment trycnt)
     k. Other error codes → return error result
  2. **`solveAll(domains, opts)`** — iterate over domain list:
     - Process sequentially (one at a time, to avoid rate limiting)
     - Delay between domains (configurable, default 1000ms)
     - Log progress to stderr (`Processing 3/50: example.com...`)
     - Save intermediate results to output file after each domain (crash-resilient)
     - Return full results array
  3. **CLI entry point** (when run directly):
     - `--domains <file>` — path to text file with one domain per line
     - `--domain <domain>` — single domain (alternative to --domains)
     - `--output <file>` — output JSON file (default: `results.json`)
     - `--aid <appid>` — CAPTCHA app ID (default: `'2090803262'`)
     - `--max-retries <n>` — wrong-answer retries (default: 3)
     - `--delay <ms>` — delay between domains (default: 1000)
     - Parse args with simple `process.argv` parsing (no yargs/commander dependency)
     - Print summary on completion: `Done: 48 safe, 2 unsafe, 0 errors out of 50`
  4. **Calibration logic**: The slide puzzle raw offset (in natural image pixels) must be converted to CSS pixels using the display ratio. From `bot.py` line 79-81:
     - `ratio = displayedWidth / naturalWidth` — but since we're headless (no iframe), we need a fixed ratio. The standard CAPTCHA background is 680px natural, displayed at 340px → ratio ≈ 0.5. Use this as default, allow override.
     - `calibrationOffset = -25 + random(-5, 5)` — jitter matching bot.py
  5. **Error handling**: Network errors, solver failures, and unexpected server responses must be caught per-domain and logged — never crash the whole batch.
  6. **Output format**: Match `bot.py`'s output — an array of result objects. Each result from `cgi.urlsec.qq.com/index.php` contains `{results: [{url, is_safe, ...}]}` or similar. The orchestrator should return the server's actual response data.
  7. **No new npm dependencies** — uses only existing modules and Node.js built-ins.

**Verification Method**:
1. **Unit tests (offline, mocked network)**:
   - Mock `CaptchaClient` methods to return canned responses for each step
   - Mock `solveSlider` to return a fixed offset
   - Mock `generateCollect` to return canned `{collect, eks, tlg}`
   - Verify `solveDomain()`:
     - Calls all 5 steps in correct order (prehandle → getSig → downloadImages → solveSlider → generateCollect → verify)
     - Passes correct parameters at each step (especially `ans` format, `slideValue`, calibration)
     - Returns `{domain, status: 'safe'|'unsafe'|'error', ...}` with correct structure
   - Verify retry logic:
     - On `errorCode: 9`: calls `getCapBySig()`, re-downloads images, re-solves, re-verifies (up to maxRetries)
     - Increments `trycnt` on each retry
     - Stops retrying after maxRetries and returns error
   - Verify `solveAll()`:
     - Processes domains sequentially
     - Writes intermediate results to output file
     - Returns complete results array
     - Handles per-domain errors without crashing
   - Verify CLI argument parsing:
     - `--domains`, `--domain`, `--output`, `--aid`, `--max-retries`, `--delay` all parsed correctly
     - Missing required args → helpful error message
2. **Source code analysis**:
   - Verify calibration math matches bot.py: `rawOffset * ratio + calibrationOffset`
   - Verify `ans` string format: `"x,158;"` (matching captcha-client's expected format)
   - Verify `trycnt` starts at 1 and increments per retry
   - Verify progress logging goes to stderr (not stdout, so output redirection works)
   - Verify no new `require()` calls beyond existing bot modules + Node built-ins

**Pass Criteria**:
1. `solveDomain()` and `solveAll()` exported and callable
2. Full 6-step flow: prehandle → getSig → downloadImages → solveSlider → generateCollect → verify
3. Retry logic: errorCode 9 → getCapBySig → re-solve → re-verify (up to maxRetries, trycnt incremented)
4. Calibration: rawOffset × ratio + jitter offset (ratio default 0.5, jitter -30 to -20)
5. `ans` format: `"${cssOffset},158;"` string passed to verify
6. CLI: `--domains`/`--domain`, `--output`, `--aid`, `--max-retries`, `--delay` flags work
7. Sequential processing with configurable delay between domains
8. Crash-resilient: per-domain errors caught, intermediate saves to output file
9. No new npm dependencies

**Failure Impact**: Without the orchestrator, the individual modules cannot be used end-to-end. Blocks Task 10.5 (live integration testing).

**Notes**:
- **The `urlsec.qq.com` flow**: In `bot.py`, the user navigates to `https://urlsec.qq.com/check.html`, types a domain, and clicks submit. This triggers a Tencent CAPTCHA iframe. In our headless version, we need to figure out what HTTP request `check.html` makes to initiate the security check. This likely involves:
  1. A GET/POST to `cgi.urlsec.qq.com/index.php` with the target domain
  2. The server responding with a CAPTCHA requirement (aid, etc.)
  3. After CAPTCHA is solved (ticket obtained), re-submit to `cgi.urlsec.qq.com` with the ticket
  - The reverser should inspect `bot.py`'s network flow and/or the `check.html` page source to determine the exact initial request format. If the urlsec initiation is complex, it's acceptable to hardcode the known `aid` and skip straight to the CAPTCHA flow, documenting the urlsec submission as a TODO for Task 10.5.
- **Ratio for headless mode**: Since we have no browser iframe, we can't query `bg_element.rect.size[0]`. The standard Tencent CAPTCHA displays a 680px-wide background at 340px CSS width, giving ratio=0.5. This should be the default, but accept an override parameter for other CAPTCHA sizes.
- **`ft` field**: This comes from the getSig response. Check if `sig._raw` contains an `ft` or `feature_tag` field. If not present, pass empty string (Task 10.3 handles the default).
- **`getCapBySig()` for retries**: When the server returns errorCode 9 (wrong answer), it may issue a new challenge. `captcha-client.js` already has `getCapBySig(session, sig)` for this — use it to get new image URLs for the retry.
- **Do NOT implement the urlsec submission flow in this task if it requires significant reverse engineering.** The core deliverable is the CAPTCHA-solving orchestrator. The urlsec wrapper can be a thin shell that the live integration test (10.5) fleshes out. Focus on: domain list → CAPTCHA solve → results JSON.
- **Progress logging**: Use `process.stderr.write()` for all progress messages so that `node solver.js > results.json` works (stdout stays clean for piped output).

### Task 10.3: Token & EKS Generation Wrapper ✅

**Verdict**: PASS (round-040) — 86/86 tests pass across 6 sections. All 9 acceptance criteria met. `generateCollect()` correctly loads tdc.js, calls `setData()` with 8 fields, injects slide-drag events, extracts collect/eks/tlg. Integration test: collect decodes to valid JSON with cd array (60 entries) and sd containing session data. Deterministic with seed=42.

### Task 10.2: CAPTCHA HTTP Client ✅

**Verdict**: PASS (round-039) — 94/94 tests pass across 15 sections. All 4 endpoints, JSONP parsing, cookie jar, POST body params, error handling verified.

**Input** (preserved for reference):
- `bot.py` — reference implementation (uses DrissionPage browser automation, we replicate with raw HTTP)
- `docs/TOKEN_DECRYPTION.md` — POST payload parameter reference (35 params including `collect`, `eks`, `ans`, `sess`, etc.)
- `puppeteer/slide-solver.js` — already working, returns pixel offset from image buffers
- Live `t.captcha.qq.com` and `urlsec.qq.com` endpoints (for manual testing / payload capture)

**Expected Output**:
- **`puppeteer/captcha-client.js`** — single CommonJS module exporting a `CaptchaClient` class

  ```js
  const client = new CaptchaClient({ aid, referer });
  
  // Step 1: Get CAPTCHA session
  const session = await client.prehandle();
  // → { sess, sid, ... }
  
  // Step 2: Get signature + image URLs
  const sig = await client.getSig(session);
  // → { bgUrl, sliceUrl, vsig, websig, nonce, spt, ... }
  
  // Step 3: Download challenge images
  const { bgBuffer, sliceBuffer } = await client.downloadImages(sig);
  // → { bgBuffer: Buffer, sliceBuffer: Buffer }
  
  // Step 4: Submit answer
  const result = await client.verify({ session, sig, ans, collect, eks, tlg });
  // → { errorCode: 0, ticket, randstr } on success
  // → { errorCode: 9, ... } on wrong answer (retry)
  ```

- The module must:
  1. **`prehandle(url)`**: `GET https://t.captcha.qq.com/cap_union_prehandle` with appropriate query params. Parse JSONP response → extract `sess`, `sid`, and other session fields.
  2. **`getSig(session)`**: `GET https://t.captcha.qq.com/cap_union_new_getsig` → extract background/slice image URLs, `vsig`, `websig`, `nonce`, `spt`.
  3. **`downloadImages(sig)`**: `GET https://t.captcha.qq.com/hycdn?index=1` and `index=2` → return raw `Buffer` for each image.
  4. **`verify(params)`**: `POST https://t.captcha.qq.com/cap_union_new_verify` with the full ~35-parameter form body (see TOKEN_DECRYPTION.md). Parse JSONP response → return `{ errorCode, ticket, randstr }`.
  - Handle cookies: maintain a cookie jar across all 4 requests (server sets cookies in step 1)
  - Parse JSONP: all responses are `callback({...})` wrapped — extract JSON
  - Set correct headers: `Referer: https://t.captcha.qq.com/cap_union_new_verify`, `Origin`, `User-Agent`
  - Use Node.js built-in `https` module (no axios/node-fetch dependencies)

**Verification Method**:
1. **Unit tests (offline, no network)**: Mock HTTP responses for all 4 endpoints. Verify:
   - JSONP parsing extracts correct fields from realistic mock responses
   - Cookie jar persists cookies across sequential requests
   - Correct query params / POST body constructed for each endpoint
   - Error handling: network timeout, non-200 status, malformed JSONP, missing fields
   - `verify()` correctly assembles the ~35-parameter POST body per TOKEN_DECRYPTION.md
2. **Integration smoke test (optional, requires network)**: Hit real `prehandle` endpoint with a test `aid` to verify request format is accepted (expect valid JSONP back, not a 403 or HTML error page)

**Pass Criteria**:
1. `CaptchaClient` class exports with all 4 methods (`prehandle`, `getSig`, `downloadImages`, `verify`)
2. All methods return Promises with documented shapes
3. JSONP parsing works for `callback({...})` and `TencentCaptcha({...})` wrapping styles
4. Cookie jar correctly carries cookies from `prehandle` through to `verify`
5. POST body for `verify` includes all required parameters from TOKEN_DECRYPTION.md §Parameter Reference
6. No external HTTP dependencies — uses `https`/`http` built-in modules only
7. Configurable timeout (default 10s) with proper cleanup on timeout
8. Graceful error with descriptive messages for network failures, parse failures, and server errors

**Failure Impact**: Blocks Task 10.3 (token generation wrapper needs session params from this client) and 10.4–10.5.

**Notes**:
- **JSONP format**: Tencent wraps all responses in a callback. The callback name varies — sometimes `callback`, sometimes `TencentCaptcha`, sometimes a random name passed as `?callback=xxx` in the query string. Parse generically: match `/^[a-zA-Z_$][\w$]*\s*\((.+)\)\s*;?\s*$/s` and JSON.parse the inner part.
- **Cookie handling**: Implement a simple cookie jar (Map of name→value). Don't need full RFC 6265 — just capture `Set-Cookie` headers and send them back as `Cookie:` header on subsequent requests.
- **The `collect` field POST encoding**: When building the `verify` POST body, `+` in the base64 `collect` value must be sent as literal `+` (i.e., `encodeURIComponent` would turn it into `%2B`, which is fine, but do NOT let it become a space). This is the same gotcha documented in TOKEN_DECRYPTION.md.
- **`ans` format**: The slide answer is formatted as `"x,y;"` where x is the CSS-pixel offset and y is typically a fixed value (e.g., 158). Study bot.py's iframe interaction to determine the expected y value.
- **Image URLs**: `hycdn?index=1` = background, `hycdn?index=2` = slider piece. These come from the `getSig` response. They may be full URLs or relative paths that need `https://t.captcha.qq.com/` prefix.
- **Retry logic belongs in the orchestrator (Task 10.4), NOT here.** This module is a stateless HTTP client — it makes requests and returns results. Error code 9 (wrong answer) is a valid result, not an error.
- **Rate limiting / anti-bot headers**: Include realistic `User-Agent`, `Accept`, `Accept-Language` headers. The server may reject requests with missing or bot-like headers.
- **Reference `bot.py` lines 62-63**: it also calls `cap_union_new_getcapbysig` — this may be the same as `getSig` or a retry endpoint. The reverser should check and handle both.

### Task 10.1.1: Slide Puzzle Solver — Python OpenCV ✅

**Verdict**: PASS (round-038) — All 50/50 tests pass. Python subprocess ~194ms avg. Offset 485 (in 470–520 range).

### Task 10.1 (original): Slide Puzzle Solver — ABANDONED (pure JS approach)

**Verdict**: FAIL (round-037) — Algorithm correct, performance critical failure (17,478ms vs 500ms limit)
**Decision**: Replaced with Python OpenCV subprocess (Task 10.1.1)

---

## Phase 10: Headless CAPTCHA Solver Bot (in progress)

**Key findings from payload analysis**:
- `eks` = `TDC.getInfo().info` — generated by `tdc.js` itself (312 chars, same XTEA key)
- `vData` — only set for IE browsers (`isLowIE()` guard), optional for Chrome (`vlg=0_0_1` accepted)
- `TDC.setData()` is a pass-through — accepts `{coordinate, slideValue, trycnt, refreshcnt, dragobj, ft, appid, nonce}` directly
- Uniform linear slide trajectories pass server validation (no need for realistic mouse curves)
- `collect` field in POST body uses raw `+` as base64 (not space) — extract with regex, not URLSearchParams

### Task Summary

| Task | Description | Key Output |
|------|-------------|------------|
| 10.1 | Slide Puzzle Solver ✅ (round-038) | `puppeteer/slide-solver.js` + `slide-solver.py` — Python OpenCV subprocess |
| 10.2 | CAPTCHA HTTP Client ✅ (round-039) | `puppeteer/captcha-client.js` — 4-endpoint flow (prehandle→getsig→images→verify) |
| 10.3 | Token & EKS Generation Wrapper ✅ (round-040) | `puppeteer/collect-generator.js` — jsdom TDC with full CAPTCHA session data |
| 10.4 | Bot Orchestrator & CLI ✅ (round-041) | `puppeteer/solver.js` — domain list → solve → save results |
| 10.5 | Live Integration Test & urlsec Completion | End-to-end test against live server, urlsec submission flow |

---

## Completed Phases

### Phase 9: Universal jsdom Token Generator ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 9.1 jsdom Environment Bootstrap | PASS (67/67) | round-031 | `jsdom/bootstrap.js` — all 3 builds, TDC API, tokens ~2500 chars |
| 9.2 Browser API Mock Layer | PASS (92/92) | round-032 | `jsdom/browser-mock.js` — 2 profiles, WebGL fix, tokens ~4000 chars |
| 9.3 Synthetic Event Injection | PASS (62/62) | round-033 | `jsdom/event-injector.js` — Bezier curves, touch gestures, +60-75 chars |
| 9.4 End-to-End Token Validation | PASS (77/77) | round-034 | `jsdom/generate.js` + `token-decoder.js` — full API, structural validation |
| 9.5 Browser Mock Calibration | PASS (18/18) | round-035 | Calibrated `chrome-146-linux` profile, 47/51 fields match, token 4616 chars |
| 9.6 CLI & Documentation | PASS (10/10) | round-036 | `jsdom/cli.js` + `jsdom/index.js` + `docs/JSDOM_GENERATOR.md` |

### Phase 8: End-to-End Token Verification ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 8.1 Deterministic Token Comparison | PASS (36/36) | round-027 | `dynamic/comparison-harness.js` — live vs standalone byte-identical, 4/4 segments match |
| 8.2 Token Format Documentation | PASS (35/35) | round-028 | `docs/TOKEN_FORMAT.md` — 695 lines, 9 sections + 2 appendices, all values verified |

<details>
<summary>Key findings</summary>

- Live tdc.js token and standalone token are byte-identical when given same inputs (two-phase decrypt approach)
- Token lengths: ~4670 chars (varies slightly by collector data, always in 4000-5500 range)
- 4 segments confirmed: hash(48B/64b64), header(144B/192b64), cdBody(3024B/4032b64), sig(88B/120b64)
- Decrypt/encrypt round-trip verified for all segment sizes
- Cross-run live token varies slightly (collector non-determinism) but per-run live==standalone is exact
</details>

### Phase 7: Standalone Token Generator ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 7.1 Outer Token Pipeline | PASS (65/65) | round-020 | `token/outer-pipeline.js` — 5 functions, pluggable encryptFn |
| 7.2 Crypto Core Dynamic Tracing | PASS (198/198) | round-021 | `output/dynamic/crypto-trace.json` — 14-step key schedule, constant state arrays |
| 7.3 Expanded Crypto Tracing (Inner Loop) | PASS (30/30) | round-022 | `output/dynamic/crypto-trace-v2.json` — 802 iterations, 3 code regions, self-mod resolved |
| 7.4 Cipher Round & Crypto Reimplementation | PASS (91/91) | round-023 | `token/crypto-core.js` — Modified XTEA, 802/802 I/O match, 4/4 btoa match |
| 7.5 End-to-End Token Pipeline Integration | PASS (54/55) | round-024 | `token/generate-token.js` — full pipeline, 4674-char token exact match |
| 7.6 Collector Data Schema | PASS (60/61) | round-025 | `token/collector-schema.js` — 59 fields, all types match, builder + validator |
| 7.7 Browser API Mock Layer & CLI | PASS (22/22) | round-026 | `token/cli.js` — CLI tool, 2 profiles, cdString byte-identical to ground truth |

<details>
<summary>Key findings</summary>

- Encryption is Modified XTEA: 32 rounds, Feistel network, delta 0x9E3779B9
- Key modifications: +2368517 for key index 1, +592130 for key index 3
- Constant key: STATE_A = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140]
- Self-modifying bytecode at PC 40178: THROW→CJMP (anti-disassembly, resolved)
- Sum not truncated to 32 bits (JS semantics, reaches 84,941,944,608)
- Assembly order: [1, 0, 2, 3] = header + hash + cdBody + sig
- CLI generates 4,646-char tokens from JSON profiles, cdString byte-identical to collector-map.json ground truth
</details>

### Phase 6: Token Pipeline Tracing ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 6.1 Dynamic Instrumentation Harness | PASS (78/78) | round-017 | `dynamic/harness.js` — token captured, sd structure mapped |
| 6.2 Collector Output Mapping | PASS (94/94) | round-018 | `output/dynamic/collector-map.json` — 59 entries, cd string 3,164 chars |
| 6.3 Token Encoding Pipeline Trace | PASS (83/83) | round-019 | `output/dynamic/encoding-trace.json` — full 10-step pipeline, 4 btoa segments |

<details>
<summary>Key findings</summary>

- Token is 4 encrypted segments: hash(48B) + header+nonce(144B) + encrypted_cd(2928B) + signature(88B)
- Assembly order: btoa[1] + btoa[0] + btoa[2] + btoa[3] → URL-encode → 4,514 chars
- cd built by func_276 as hand-rolled JSON (anti-hooking), not via JSON.stringify
- ChallengeEncrypt called internally through VM bytecode, not window global (anti-hooking)
</details>

### Phase 5: Validation & Polish ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 5.1 Single-Use String Variable Inlining | PASS (53/53) | round-013 | 851 vars inlined, 9,152→8,301 lines |
| 5.2 Numeric & Expression Variable Inlining | PASS (95/95) | round-014 | 1,208 vars inlined, 8,301→7,093 lines |
| 5.3 Program Analysis & Function Annotation | PASS (55/55) | round-015 | `output/decompiled-annotated.js` — 270/270 classified |
| 5.4 Final Summary & Opcode Reference | PASS (46/46) | round-016 | `output/FINAL_REPORT.md`, all 95 opcodes ✅ |

### Phase 4: Decompilation & Output ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 4.1 Per-Function Structured Code Emitter | PASS (62/62) | round-011 | `decompiler/code-emitter.js` → `output/decompiled.js` (9,344 lines, 270/270 parse) |
| 4.2 Closure Resolution & Dead Store Elimination | PASS (60/60) | round-012 | `decompiler/output-polish.js` — 291 closures resolved, 193 dead stores removed |

### Phase 3: Expression Reconstruction ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 3.1 Instruction Semantics Module | PASS (1,318/1,318) | round-008 | `decompiler/opcode-semantics.js` — all 95 opcodes mapped, op 24 RET bug fixed |
| 3.2 Intra-Block Expression Folding | PASS (78/78) | round-009 | `decompiler/expression-folder.js` — 15,753→7,253 stmts (54% fold ratio) |
| 3.3 Call & Method Reconstruction | PASS (310/310) | round-010 | `decompiler/method-reconstructor.js` — 333 method calls, 7,253→6,958 stmts |
| 3.4 String Literal Reconstruction | SKIPPED | — | 99.9% covered by 3.2 (1,736/1,738 matches) |

### Phase 2: Control Flow Analysis ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 2.1 Per-Function CFG Construction | PASS (583/584) | round-005 | `decompiler/cfg-builder.js` — 270 CFGs, 1,066 blocks, 15,753 instructions |
| 2.2 Control Flow Pattern Recognition | PASS (63/63) | round-006 | `decompiler/pattern-recognizer.js` — 688 patterns (29 loops, 374 if/else, 144 try-catch) |

### Phase 1: Bytecode Extraction & Disassembly ✅

| Task | Verdict | Report | Key Output |
|------|---------|--------|------------|
| 1.1 Bytecode Decoder | PASS (23/24) | round-001 | `decompiler/decoder.js` — config 129 ints + main 70,017 ints, byte-identical to tdc.js |
| 1.2 Disassembler | PASS (242/242) | round-002 | `decompiler/disassembler.js` — all 95 opcodes, 15,875 instructions, zero PC gaps |
| 1.3 String Extraction | PASS (31/31) | round-003 | `decompiler/string-extractor.js` — 1,740 strings, 8/8 spot-checks |
| 1.4 Function Boundary Detection | PASS (37/37) | round-004 | `decompiler/function-extractor.js` — 270 valid functions, 22 data-region artifacts |
