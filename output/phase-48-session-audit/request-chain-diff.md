# Phase 48.1 — Request-Chain Diff: Scraper vs HAR

Side-by-side comparison of every HTTP request in `sample/captcha-har.har` (Chrome 146 real browser, 12 entries) against the scraper's request chain (`tools/scraper/scraper.js` + `tools/captcha-solver/captcha-client.js`).

## Per-Request Comparison Table

| # | HAR URL | Scraper Equivalent | Match? | Header Diffs | Timing Note |
|---|---------|-------------------|--------|-------------|-------------|
| 1 | `GET t.captcha.qq.com/cap_union_prehandle` | `client.prehandle()` in `captcha-client.js:282` | YES | Scraper adds `sec-ch-ua*` headers (HAR also has them). Scraper sets `Sec-Fetch-Site: same-site` matching HAR. No significant header diff. | HAR: 158ms. Scraper: sequential, no timing concern. |
| 2 | `GET t.captcha.qq.com/cap_union_new_show` | `client._getShowConfig()` in `captcha-client.js:497` (fallback after legacy getsig 404) | PARTIAL | **HAR**: `Accept: text/html,...,application/signed-exchange;v=b3;q=0.7`. **Scraper**: `Accept: text/html,...,*/*;q=0.8` — missing `application/signed-exchange;v=b3;q=0.7` suffix. Scraper adds `Sec-Fetch-User: ?1` and `Upgrade-Insecure-Requests: 1` which HAR does NOT show. | HAR: 97ms. Scraper may hit legacy getsig first (404), adding ~100ms latency before falling back to show. |
| 3 | `GET t.captcha.qq.com/hycdn?index=1` (bg image) | `client.downloadImages()` in `captcha-client.js:767` | YES | Headers match well. Scraper sets `Referer` to show page URL (matching HAR). `Accept: image/avif,...` matches HAR. `Sec-Fetch-Dest: image`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin` all match. | HAR: 53ms. Scraper downloads bg + slice in parallel via `Promise.all`. HAR shows sequential (entry 3 then 4). Server could observe parallel vs sequential timing. |
| 4 | `GET t.captcha.qq.com/hycdn?index=2` (slice image) | `client.downloadImages()` in `captcha-client.js:767` (parallel with bg) | YES | Same as entry 3 — headers match. | HAR: 135ms. See note on entry 3 — parallel download is a timing tell. |
| 5 | `GET t.captcha.qq.com/tdc.js` (session-specific via `dcFileName`) | `client.downloadTdc()` in `captcha-client.js:840` | YES | `Accept: */*`, `Sec-Fetch-Dest: script`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin` all match HAR. `Referer` is the show page URL, matching HAR. | HAR: 146ms. Scraper fetches after images (correct order). |
| 6 | `GET captcha.gtimg.com/1/tcaptcha-slide.29a33140.js` | **MISSING** — scraper never fetches this | NO | HAR shows no `Sec-Fetch-*` or `Referer` headers (loaded as `<script>` tag evaluation, not via fetch API). | HAR: 62ms. The orchestrator bundle is loaded from local `sample/t_captcha_slide.js` by the scraper — no network request is made. |
| 7 | `GET t.captcha.qq.com/vm-slide.e201876f.enc.js` | `scraper._getVmSlideSource()` in `scraper.js:366` | PARTIAL | **HAR**: `Referer: <show-page-url>`, `Sec-Fetch-Dest: script`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin`, `Accept: */*`. **Scraper**: `_getVmSlideSource()` calls `httpRequest(url, { timeout: 10000 })` with NO custom headers — missing all `Sec-Fetch-*`, `Referer`, `User-Agent`, `Accept`, and `sec-ch-ua*` headers. | HAR: 169ms. Scraper attempts live fetch but falls back to `sample/vm_slide.js` if it fails. |
| 8 | `GET captcha.gtimg.com/1/slide-jy.js` | **MISSING** — scraper never fetches this | NO | HAR shows no `Sec-Fetch-*` or `Referer` headers (same as entry 6 — `<script>` tag). | HAR: 40ms. jQuery is loaded from local `sample/slide-jy.js` — no network request. |
| 9 | `GET t.captcha.qq.com/caplog` (pre-verify beacon) | `fireBeacon(preUrl, ...)` in `scraper.js:703-704` | PARTIAL | **HAR**: `Referer: <show-page-url>`, `Sec-Fetch-Dest: image`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin`, `Accept: image/avif,...`. **Scraper**: `fireBeacon` sends `Accept: */*`, `Referer: https://t.captcha.qq.com/` (hardcoded base, not the show page URL). Missing `Sec-Fetch-*` headers entirely. Missing `sec-ch-ua*` headers. | HAR: 46ms. |
| 10 | `POST t.captcha.qq.com/cap_union_new_verify` | `client.verify()` in `captcha-client.js:896` | YES | Headers are carefully matched: `Content-Type: application/x-www-form-urlencoded; charset=UTF-8`, `Origin: https://t.captcha.qq.com`, `X-Requested-With: XMLHttpRequest`, `Accept: application/json, text/javascript, */*; q=0.01`, `Sec-Fetch-Dest: empty`, `Sec-Fetch-Mode: cors`, `Sec-Fetch-Site: same-origin`. `Referer` is the full show page URL. All match HAR. | HAR: 202ms. |
| 11 | `GET t.captcha.qq.com/caplog` (post-verify beacon) | `fireBeacon(postUrl, ...)` in `scraper.js:750-751` | PARTIAL | Same issues as entry 9: wrong `Referer` (hardcoded base URL vs show page URL), wrong `Accept` (`*/*` vs `image/avif,...`), missing `Sec-Fetch-*` headers. | HAR: 44ms. |
| 12 | `GET cgi.urlsec.qq.com/index.php` | `scraper.queryUrlSec()` in `scraper.js:785` | YES | `Accept: */*`, `Referer: https://urlsec.qq.com/`, `Sec-Fetch-Dest: script`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-site`. **Scraper**: sends `Accept: */*` and `Referer: https://urlsec.qq.com/` but omits `Sec-Fetch-*`, `sec-ch-ua*`, `Accept-Encoding`, `Accept-Language`, `Cache-Control`, `Pragma` headers. | HAR: 2959ms. |

## Findings

### 1. Missing Requests (2 entries)

| HAR # | URL | Why it matters |
|-------|-----|---------------|
| 6 | `GET captcha.gtimg.com/1/tcaptcha-slide.29a33140.js` | The orchestrator bundle. In a real browser, the show page HTML contains a `<script>` tag that loads this from `captcha.gtimg.com`. The server (or its CDN analytics) can observe that sessions that never fetch this script are non-browser. The scraper loads it from `sample/t_captcha_slide.js` instead. |
| 8 | `GET captcha.gtimg.com/1/slide-jy.js` | jQuery library. Same mechanism — loaded via `<script>` tag in the show page HTML. The CDN can correlate: a session that fetched `tdc.js` and `vm-slide.enc.js` but never fetched `tcaptcha-slide.js` or `slide-jy.js` is anomalous. |

Both missing requests go to `captcha.gtimg.com` (a different host from `t.captcha.qq.com`). If Tencent correlates cross-host request logs by session ID or IP, the absence of these two fetches is a strong bot signal.

### 2. Header Mismatches

#### 2a. `fireBeacon` (caplog) — entries 9 and 11

The `fireBeacon` function in `caplog-beacon.js:162` uses a minimal header set:
- `Accept: */*` instead of `Accept: image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8`
- `Referer: https://t.captcha.qq.com/` instead of the full show page URL (800+ chars)
- Missing `Sec-Fetch-Dest: image`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-origin`
- Missing `sec-ch-ua`, `sec-ch-ua-mobile`, `sec-ch-ua-platform`
- Missing `Accept-Encoding`, `Accept-Language`, `Cache-Control`, `Pragma`

**Detectability**: HIGH. The server sees a caplog request from an IP that has the correct query params but with `Accept: */*` and a bare Referer. Real Chrome always sends `Accept: image/...` for image-destination fetches and uses the full show page URL as Referer.

#### 2b. `_getVmSlideSource` (vm-slide fetch) — entry 7

The scraper's `_getVmSlideSource()` calls `httpRequest(url, { timeout: 10000 })` with no headers argument at all. This means:
- No `User-Agent`
- No `Referer`
- No `Accept`
- No `Sec-Fetch-*`
- No `sec-ch-ua*`

Node.js `https.request` sends a bare request with only `Host`. This is trivially detectable.

**Detectability**: VERY HIGH. A request for `vm-slide.enc.js` with no `User-Agent` is an obvious bot marker.

#### 2c. `queryUrlSec` — entry 12

The scraper sends only `User-Agent`, `Accept: */*`, and `Referer`. Missing:
- `Sec-Fetch-Dest: script`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: same-site`
- `sec-ch-ua*` client hint headers
- `Accept-Encoding`, `Accept-Language`, `Cache-Control`, `Pragma`

**Detectability**: MEDIUM. `cgi.urlsec.qq.com` is a different service from the CAPTCHA server, but the missing `Sec-Fetch-*` headers are detectable if the service checks them.

#### 2d. `_getShowConfig` — entry 2

The scraper sends two extra headers not in the HAR:
- `Sec-Fetch-User: ?1`
- `Upgrade-Insecure-Requests: 1`

These are valid for a navigation request and would normally be present in Chrome. Their presence in the HAR depends on whether Chrome DevTools recorded them (it sometimes omits them). This is likely a non-issue.

The `Accept` header differs slightly:
- HAR: `...application/signed-exchange;v=b3;q=0.7`
- Scraper: `...*/*;q=0.8`

**Detectability**: LOW. The `Accept` diff is minor and servers rarely check the full Accept string for navigation requests.

### 3. Ordering and Timing Anomalies

#### 3a. Legacy getsig 404 round-trip

The scraper's `getSig()` method (line 369) first tries the legacy `_getSigLegacy()` endpoint (`/cap_union_new_getsig`), which returns 404. Only then does it fall back to `_getShowConfig()`. This means:
- The scraper makes an extra HTTP request (`GET /cap_union_new_getsig`) that real Chrome never makes.
- The server sees a 404 request to a deprecated endpoint, followed by the show page fetch. This is anomalous.

**Detectability**: HIGH. A session that hits the removed getsig endpoint before show is a strong bot signal.

#### 3b. Parallel image downloads

The scraper downloads both images in parallel via `Promise.all` (line 796). The HAR shows them as sequential (entry 3 at 53ms, entry 4 at 135ms — overlapping but with entry 3 completing before entry 4 starts based on the waterfall). In a real browser, `<img>` tags trigger sequential requests from the HTML parser.

**Detectability**: LOW-MEDIUM. The timing overlap/parallelism is hard to detect server-side unless the server tracks precise request arrival times. However, if both image requests arrive within the same TCP RTT, it could indicate programmatic parallel fetching.

#### 3c. Show page URL re-fetch in _getVmSlideSource

If the show page config doesn't contain the vm-slide URL directly, `_getVmSlideSource` (strategy 3, line 410) re-fetches the show page URL. This creates a duplicate `GET /cap_union_new_show` request, which never happens in a real browser session.

**Detectability**: HIGH. A session that fetches the show page twice is anomalous.

### 4. Referer Chain Consistency

| Request | Expected Referer | Scraper Referer | Match? |
|---------|-----------------|----------------|--------|
| prehandle (1) | `https://urlsec.qq.com/` | `https://urlsec.qq.com/` (via `this.referer`) | YES |
| show (2) | `https://urlsec.qq.com/` | `https://urlsec.qq.com/` (via `this.referer`) | YES |
| hycdn bg (3) | show page URL | show page URL (via `sig.showUrl`) | YES |
| hycdn slice (4) | show page URL | show page URL (via `sig.showUrl`) | YES |
| tdc.js (5) | show page URL | show page URL (via `this._lastShowUrl`) | YES |
| tcaptcha-slide (6) | (none in HAR) | **MISSING REQUEST** | N/A |
| vm-slide (7) | show page URL | **NONE** (no headers passed) | NO |
| slide-jy (8) | (none in HAR) | **MISSING REQUEST** | N/A |
| caplog pre (9) | show page URL | `https://t.captcha.qq.com/` (hardcoded) | NO |
| verify (10) | show page URL | show page URL (via `sig.showUrl`) | YES |
| caplog post (11) | show page URL | `https://t.captcha.qq.com/` (hardcoded) | NO |
| urlsec (12) | `https://urlsec.qq.com/` | `https://urlsec.qq.com/` | YES |

The Referer chain is correct for the core requests (prehandle, show, images, tdc, verify) but broken for the caplog beacons and vm-slide fetch.

### 5. Cookie Handling

The scraper maintains a `CookieJar` across requests within a `CaptchaClient` instance. The HAR shows no `Cookie` headers on any request, which is consistent with the CAPTCHA flow not requiring cookies (they may be set but not captured by the HAR export). The scraper's cookie handling is adequate.

### 6. Summary of Gaps by Severity

| Severity | Gap | Entries Affected |
|----------|-----|-----------------|
| HIGH | Missing `tcaptcha-slide.js` fetch from `captcha.gtimg.com` | 6 |
| HIGH | Missing `slide-jy.js` fetch from `captcha.gtimg.com` | 8 |
| HIGH | Extra `GET /cap_union_new_getsig` (404) before show page | between 1 and 2 |
| HIGH | `vm-slide.enc.js` fetch has no headers at all (no UA, no Referer, no Sec-Fetch) | 7 |
| HIGH | Caplog beacons use wrong Referer and wrong Accept, missing Sec-Fetch-* | 9, 11 |
| MEDIUM | `queryUrlSec` missing Sec-Fetch-*, sec-ch-ua*, Accept-Encoding, Accept-Language | 12 |
| MEDIUM | Potential show-page re-fetch in `_getVmSlideSource` strategy 3 | 7 (conditional) |
| LOW | Image downloads are parallel instead of sequential | 3, 4 |
| LOW | Minor Accept header diff on show page request | 2 |

### 7. Recommendations (informational — no code changes in this task)

1. **Add `tcaptcha-slide.js` and `slide-jy.js` fetches**: Even if the scraper doesn't use the fetched code, it should make the HTTP requests to `captcha.gtimg.com` to match the real browser's request chain. Both should use `Sec-Fetch-Dest: script` or no Sec-Fetch headers (HAR shows neither for CDN script tags).

2. **Remove the legacy getsig 404 path**: Since `cap_union_new_getsig` returns 404, the scraper should go directly to `_getShowConfig()` instead of trying the legacy endpoint first.

3. **Fix `_getVmSlideSource` headers**: Pass the full `_headers()` set with appropriate `Sec-Fetch-*` values when fetching `vm-slide.enc.js`.

4. **Fix `fireBeacon` headers**: Pass `Accept: image/avif,...`, the full show page URL as `Referer`, and `Sec-Fetch-Dest: image` / `Sec-Fetch-Mode: no-cors` / `Sec-Fetch-Site: same-origin`.

5. **Fix `queryUrlSec` headers**: Add `Sec-Fetch-*`, `sec-ch-ua*`, and standard browser headers.

6. **Consider sequential image downloads**: To match real browser timing, download bg first, then slice, instead of using `Promise.all`.
