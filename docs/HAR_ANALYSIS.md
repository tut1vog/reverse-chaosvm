# HAR Analysis — CAPTCHA Protocol Flow

This document is a network-level reference for Tencent's slide-CAPTCHA protocol, transcribed from a real Chrome 146 HAR captured solving a slider CAPTCHA on `urlsec.qq.com/check.html`. It covers the 12-request endpoint sequence, the `vm-slide.enc.js` vData-injection mechanism, and two durable protocol observations (per-request `subsid` increment, full show-page URL as Referer on verify). For byte-level specs and orchestration mechanics, follow the cross-references.

See also:

- `docs/CAPTCHA_ORCHESTRATOR.md` — end-to-end orchestration of `t_captcha_slide.js`, verify POST assembly, and `postMessage` ticket return.
- `docs/TOKEN_FORMAT.md` — `collect` token spec (header + hash + cdBody + sig, modified XTEA, 59 collector fields).
- `docs/VDATA_FORMAT.md` — `vData` cipher pipeline (pad + ShiftRows + classical XTEA + custom base64) and the 8-field tdc-runtime-state probe.

## Source

A Chrome 146 HAR captured solving a slider CAPTCHA on `urlsec.qq.com/check.html`. The captured flow has 12 HTTP requests and no WebSocket connections.

## Request Inventory

| # | Method | Host | Path | Size |
|---|--------|------|------|------|
| 0 | GET | t.captcha.qq.com | /cap_union_prehandle | 779 B |
| 1 | GET | t.captcha.qq.com | /cap_union_new_show | 55 KB |
| 2 | GET | t.captcha.qq.com | /hycdn?index=1 (background image) | 12 KB |
| 3 | GET | t.captcha.qq.com | /hycdn?index=2 (slice image) | 3.7 KB |
| 4 | GET | t.captcha.qq.com | /tdc.js?app_data=... | 133 KB |
| 5 | GET | captcha.gtimg.com | /1/tcaptcha-slide.29a33140.js | 213 KB |
| 6 | GET | t.captcha.qq.com | /vm-slide.e201876f.enc.js | 44 KB |
| 7 | GET | captcha.gtimg.com | /1/slide-jy.js (jQuery 1.11.3) | 96 KB |
| 8 | GET | t.captcha.qq.com | /caplog?appid=20128&... | 11 B |
| 9 | POST | t.captcha.qq.com | /cap_union_new_verify | 202 B |
| 10 | GET | t.captcha.qq.com | /caplog?appid=20128&... | 11 B |
| 11 | GET | cgi.urlsec.qq.com | /index.php?m=check&a=gw_check | 228 B |

## vData Injection Mechanism

The verify POST body (request #9) contains a 152-character `vData` field computed by `vm-slide.enc.js` (request #6) — a ChaosVM bytecode script loaded alongside the slide orchestrator. Three scripts participate in the verify path:

1. `tcaptcha-slide.29a33140.js` — the orchestrator bundle that assembles the verify POST (see `docs/CAPTCHA_ORCHESTRATOR.md`).
2. `vm-slide.e201876f.enc.js` — the stack-based ChaosVM (`__TENCENT_CHAOS_STACK`) that produces `vData`.
3. `slide-jy.js` — jQuery 1.11.3, used by the orchestrator to perform the POST.

On modern browsers, vm-slide installs an `XMLHttpRequest.prototype.send` / `open` monkey-patch (via its `proxyXHR` routine) that intercepts any outgoing request to `/cap_union_new_verify` and appends `&vData=<152 chars>` to the body before the real `send()` completes. On IE9 and below, vm-slide instead installs `window.getVData`, and the orchestrator's `if (a.isLowIE())` branch calls it directly. Both paths run the same cipher pipeline; only the plaintext source differs.

In `tcaptcha-slide.js`, the IE9 fallback is visible verbatim:

```javascript
// The vData block in tcaptcha-slide.js only handles IE:
if (a.isLowIE()) {
  var o = window.getVData && window.getVData(n.join("&"));
  o && (e.vData = o);
}
// For modern browsers, vData is appended by vm-slide's XHR proxy
$.ajax({ type: "POST", url: "/cap_union_new_verify", data: e, ... });
```

See `docs/VDATA_FORMAT.md` for the byte-level cipher spec (XTEA key, 65-char alphabet with `Y` as padding, 14 × 8-byte blocks, 8-field tdc-runtime-state plaintext) and `docs/CAPTCHA_ORCHESTRATOR.md` §6 for the bytecode-level trace of the XHR proxy install and the fn 22317 plaintext builder.

## Verify POST Body

The verify POST (request #9) carries 39 fields in `application/x-www-form-urlencoded`: 24 upstream passthroughs copied verbatim from the show-page iframe URL query by `queryMap()` (module 30), 14 orchestrator-written fields (including `collect`, `eks`, `nonce`, `sess`, `vsig`, `websig`, `ans`, `cdata`, `vlg`, etc.), and `vData` appended by vm-slide's XHR proxy. The full per-field origination table — each row recording sample value, source module, and assembly method — lives in `docs/CAPTCHA_ORCHESTRATOR.md` §5. The `collect` field itself is the URL-decoded register-VM token whose format is specified in `docs/TOKEN_FORMAT.md`.

The successful response shape is `200 { errorCode: "0", randstr, ticket, errMessage, sess }`; the ticket is delivered to the parent page via `postMessage`, not as an HTTP payload — see `docs/CAPTCHA_ORCHESTRATOR.md` §7.

## Per-Request subsid Increment

`subsid` increments across every request in the flow rather than staying constant:

```
prehandle: 9, show: 10, hycdn: 11/12, caplog: 13, ..., caplog: 14
```

This is a protocol-level telemetry counter seeded by the parent page and propagated through the show-page URL; each child request bumps it by one.

## Referer on Verify

The verify POST (request #9) carries the **full show-page URL as its Referer** — 800+ characters including every query parameter from request #1. This is not the bare `/cap_union_new_show` origin; the browser's natural Referer for a request originated from an iframe is the iframe's `location.href`, which for this protocol is the fully-parameterized show-page URL.

## caplog Beacon (Request #8)

A GET to `/caplog` sent before the verify POST, carrying timing data as query params:

```
appid=20128
1-16: resource-load timestamps
20=344, 21=247: dimensions
31=199094670: session counter
34=7446039806946242560: sid
35=7, 36=7: resource counts
platform=pc
flag1=21408, flag2=3, flag3=14
subsid=13
```

A second caplog beacon (request #10) fires after verify with the post-verify `subsid`.
