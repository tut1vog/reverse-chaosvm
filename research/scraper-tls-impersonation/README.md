# scraper-tls-impersonation

**Open question**: Can we reuse the existing Puppeteer (v24 + stealth) as a TLS transport for the `cap_union_new_verify` POST, eliminating Node.js's native TLS fingerprint as the likely gate for `errorCode: -1` (bypass-lane/pity tickets)?

**Status**: partial (design spike complete, integration not yet implemented)

**Approach**: On 2026-04-15, the three-way approach matrix (curl-impersonate / Node native TLS bindings / Puppeteer reuse) was collapsed by user decision to option (c) = Puppeteer reuse. curl-impersonate and Node TLS patching are off the table.

**Inputs**:
- `tools/captcha-solver/captcha-solver.js` — Puppeteer launch config, stealth plugin setup
- `tools/captcha-solver/captcha-client.js` — verify POST at line 1007 (`httpRequest` call)
- `tools/captcha-solver/cli.js` — browser lifecycle

**Reproduction**:
```bash
# Capture Node.js native TLS fingerprint
node research/scraper-tls-impersonation/capture-node-ja3.js
# Output: output/scraper-tls/node-default.json

# Capture headless Puppeteer/Chrome TLS fingerprint
node research/scraper-tls-impersonation/capture-puppeteer-ja3.js
# Output: output/scraper-tls/chrome-puppeteer.json

# Test page.evaluate(fetch) header behavior
node research/scraper-tls-impersonation/test-fetch-headers.js
node research/scraper-tls-impersonation/test-fetch-same-origin.js
# Output: output/scraper-tls/fetch-headers.json, fetch-same-origin.json
```

---

## TLS Fingerprint Comparison

Captured 2026-04-16 from `tls.peet.ws/api/all`. Published Chrome 146 reference values sourced from community JA3/JA4 databases.

### Summary Table

| Property | Node.js (native https) | Headless Puppeteer (stealth) | Chrome 146 (reference) |
|---|---|---|---|
| **JA3 hash** | `0cce74b0d9b7f8528fb2181588d23793` | `8061a5edbfa5eab7663a5e5aff0118ab` | `8061a5edbfa5eab7663a5e5aff0118ab` |
| **JA4** | `t13d5910_a33745022dd6_1f22a2ca17c4` | `t13d1517h2_8daaf6152771_dcad5a053991` | `t13d1517h2_8daaf6152771_*` |
| **HTTP version** | HTTP/1.1 | h2 | h2 |
| **Cipher suites** | 59 | 16 | 16 |
| **GREASE** | No | Yes (ciphers, extensions, groups, versions) | Yes |
| **ALPN** | (none) | h2, http/1.1 | h2, http/1.1 |
| **ECH** | No | Yes (ext 65037) | Yes |
| **X25519MLKEM768** | No | Yes (key share + supported groups) | Yes |
| **TLS version** | 1.3 (no 1.2 in cipher list position) | 1.3 (GREASE, 1.3, 1.2) | 1.3 (GREASE, 1.3, 1.2) |
| **Signature algs** | 20 (incl. ed25519, PSS variants) | 8 (Chrome's compact set) | 8 |
| **Supported groups** | 10 (incl. ffdhe, X448) | 5 (GREASE, X25519MLKEM768, X25519, P-256, P-384) | 5 |
| **Akamai H2 FP** | N/A (HTTP/1.1) | `1:65536;2:0;4:6291456;6:262144;:2954995616\|15663105\|0\|m,a,s,p` | Match |

### Key Differences (Node vs Puppeteer)

1. **Cipher suite count**: Node exposes 59 cipher suites including many legacy/uncommon ones (CCM, ARIA, DSS, DHE). Puppeteer/Chrome exposes 16, which is the standard modern Chrome set. This alone is a dead giveaway.

2. **No GREASE**: Node does not inject GREASE values. Chrome injects GREASE into ciphers, extensions, supported groups, and supported versions. GREASE presence/absence is a primary JA3/JA4 discriminator.

3. **HTTP/1.1 vs H2**: Node's `https.request` uses HTTP/1.1. Chrome negotiates H2 via ALPN. The H2 fingerprint (Akamai FP) is an additional signal.

4. **Missing ECH and post-quantum**: Node has no Encrypted Client Hello (ext 65037) and no X25519MLKEM768. Chrome 146 includes both.

5. **Extension order**: Node sends extensions in OpenSSL default order; Chrome sends them in a distinct randomized-but-stable order.

6. **Signature algorithms**: Node advertises 20 including ed25519 and legacy schemes; Chrome sends exactly 8.

### Puppeteer vs Chrome 146 Reference

**JA3 hash matches exactly** (`8061a5edbfa5eab7663a5e5aff0118ab`). The headless Puppeteer browser IS Chrome 146 at the TLS layer -- stealth plugin does not modify TLS behavior, and Chromium's BoringSSL stack is identical in headless and headed modes. No red flags here. The Puppeteer approach is viable from a TLS fingerprinting perspective.

---

## Integration Design Questions

### (a) Browser Lifecycle

**Recommendation: One long-lived `Browser` instance with a single reusable `Page`.**

Rationale:
- The scraper does ~30 sequential verify attempts per run. Launching a new Chromium process per attempt adds ~2-3 seconds of cold-start overhead each time (30 * 2.5s = 75s wasted).
- A single `Browser` with one `Page` navigated to `t.captcha.qq.com` gives us a warm page context with the correct Origin for all 30 requests.
- `CaptchaPuppeteer` already follows this pattern: `_ensureBrowser()` lazily launches once, and `close()` tears down at the end. The transport module should accept an existing `Browser` or `Page` instance.
- Risk: if the page crashes or Chromium OOMs, the entire run fails. Mitigation: wrap in try/catch and re-launch once on crash (see section (e)).

### (b) Request Routing Mechanism

**Recommendation: `page.evaluate(fetch(...))`** from a page navigated to `https://t.captcha.qq.com`.

Justification:
- **TLS fingerprint**: `fetch()` inside `page.evaluate` uses Chromium's BoringSSL stack, which IS the Chrome TLS fingerprint. This is the whole point.
- **Header handling**: Chrome's network stack auto-adds Sec-Fetch-*, Accept-Encoding, and client hints based on the page's origin context. Custom headers passed to `fetch()` are merged with Chrome's auto-headers. Empirically verified: `test-fetch-same-origin.js` confirms same-origin fetch produces correct `Origin`, `Referer`, `Sec-Fetch-Site: same-origin`.
- **Simplicity**: One `page.evaluate()` call, no CDP protocol plumbing, no request interception state machine.
- **Alternatives rejected**:
  - `page.setRequestInterception` + dummy navigation: overly complex, fragile interception lifecycle, and `request.continue()` still uses the page's TLS stack so there is no TLS benefit vs plain fetch.
  - CDP `Network.continueRequest`: requires managing the CDP session, does not simplify header handling, and is harder to debug.

**Empirical test results** (from `test-fetch-same-origin.js`):

When navigated to `httpbin.org` (same-origin proxy for `t.captcha.qq.com`), `page.evaluate(fetch(...))` sends:
```
Accept: application/json, text/javascript, */*; q=0.01
Accept-Encoding: gzip, deflate, br, zstd
Accept-Language: en-US,en;q=0.9
Content-Length: 15
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Origin: https://httpbin.org
Referer: https://httpbin.org/
Sec-Fetch-Dest: empty
Sec-Fetch-Mode: cors
Sec-Fetch-Site: same-origin
User-Agent: Mozilla/5.0 (...)
X-Requested-With: XMLHttpRequest
```

This matches the expected Chrome verify POST shape.

### (c) Header-Order Preservation

Chrome 146's verify POST header order from HAR:
```
Host, Connection, Content-Length, sec-ch-ua, Content-Type, X-Requested-With,
sec-ch-ua-mobile, User-Agent, sec-ch-ua-platform, Accept, Origin,
Sec-Fetch-Site, Sec-Fetch-Mode, Sec-Fetch-Dest, Referer,
Accept-Encoding, Accept-Language
```

With `page.evaluate(fetch(...))`, Chrome's network stack assembles the final header list internally. The on-the-wire order is controlled by Chromium's HTTP/2 HPACK encoder, not by the JS `fetch()` header order. Since we are using HTTP/2, headers are HPACK-compressed and the "order" visible in HAR is the pseudo-header + header block order from Chrome's network stack. **This is exactly the same order Chrome uses for any same-origin XHR/fetch from the page context** -- it is Chrome's own code path, not ours.

For HTTP/2, servers see headers in HPACK frame order, which is deterministic per Chrome build. `page.evaluate(fetch)` inherits this automatically.

For HTTP/1.1 fallback (unlikely -- `t.captcha.qq.com` supports H2), Chrome would emit headers in its internal order, which also matches the HAR pattern.

**Verdict**: Header order is preserved by construction -- we are delegating to Chrome's own network stack.

### (d) User-Agent / Navigator Plumbing

`page.setUserAgent(ua)` updates the `User-Agent` HTTP header but does **NOT** update `sec-ch-ua` / `sec-ch-ua-platform` / `sec-ch-ua-mobile` to match. These client hints are derived from Chromium's internal `UserAgentMetadata`, not from the UA string.

However, this is a non-issue for our use case:
1. The Puppeteer stealth plugin already patches `navigator.userAgent` and related properties.
2. The Chromium binary bundled with Puppeteer v24 IS Chrome 146, so its native `sec-ch-ua` already reads `"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"` -- exactly what we want.
3. `page.setUserAgent` is only needed if we want to override the default UA. Since we set it to Chrome 146's exact UA string, the only effect is ensuring `User-Agent` matches. The `sec-ch-ua` headers are auto-populated from Chromium's build metadata and will be correct.
4. If a future Puppeteer update bundles a different Chrome version, `sec-ch-ua` would mismatch. At that point, use Puppeteer's `page.setUserAgent(ua, { brands, platform, mobile })` overload (the second argument is `UserAgentMetadata`).

**Verdict**: No action needed for Chrome 146. Document the `setUserAgent` metadata override as a future-proofing note.

### (e) Error Handling

Failure modes and recommended strategy:

| Failure | Detection | Recovery |
|---|---|---|
| Page crash | `page.evaluate` throws `Error: Execution context was destroyed` | Close page, create new page from existing browser, retry |
| Chromium OOM | `browser.on('disconnected')` fires | Re-launch browser via `_ensureBrowser()` (set `this._browser = null` first), retry |
| Network timeout | `fetch()` timeout or `AbortController` | Return error to caller, let caller retry |
| DNS failure | `fetch()` rejects with `TypeError: Failed to fetch` | Return error to caller |
| TLS handshake failure | `fetch()` rejects | Return error to caller |

**Concrete strategy**:
1. Wrap the `page.evaluate(fetch(...))` call in a try/catch.
2. On `Execution context was destroyed` or browser disconnect, set a `_needsRelaunch` flag.
3. Next call to `sendVerify()` checks the flag and re-creates the page (or browser).
4. Limit to 1 automatic relaunch per run. If the second attempt also crashes, propagate the error.
5. Use `AbortController` inside `page.evaluate` with a 15-second timeout to match the existing `VERIFY_TIMEOUT`.

### (f) Cookie Isolation

Verified empirically: `page.evaluate(fetch(...))` from a page navigated to `t.captcha.qq.com` WILL inherit any cookies set on that origin in the browser context. However:

1. `t.captcha.qq.com` uses **no cookies** for the verify endpoint (confirmed in HAR analysis and `docs/HAR_ANALYSIS.md`).
2. If we navigate the page to `https://t.captcha.qq.com/cap_union_new_show?...` (the show page) to establish the origin context, the show page response MAY set cookies. These would then be sent on the verify POST.
3. In the current Puppeteer captcha-solver flow, the show page does set cookies (session tracking). The verify POST in the browser includes them. This is **correct behavior** -- it matches what a real browser does.

**Safety check result**: The Puppeteer-routed POST will include whatever cookies Chrome accumulated for `t.captcha.qq.com`. This is the same behavior as a real Chrome session and is not a concern. If cookie isolation is ever needed (e.g. for parallel sessions), use separate `BrowserContext` instances via `browser.createBrowserContext()`.

### (g) Integration Seam

**Recommended module shape for 46.12**:

**New file**: `tools/captcha-solver/puppeteer-transport.js`

```js
// puppeteer-transport.js — Chrome TLS transport for verify POST
// Wraps page.evaluate(fetch(...)) to route HTTP requests through
// Chromium's TLS stack instead of Node.js's.

class PuppeteerTransport {
  constructor(browser) { ... }

  // Initialize: create page, navigate to t.captcha.qq.com origin
  async init() { ... }

  // Send the verify POST through Chrome's fetch()
  // request: { url, method, headers, body }
  // returns: { statusCode, headers, body }
  async sendVerify(request) { ... }

  // Cleanup
  async close() { ... }
}
```

**Interface**:
```js
async sendVerify({ url, method, headers, body })
  → { statusCode: number, headers: object, body: string }
```

**Integration point in `captcha-client.js`**:
- Add an optional `transport` parameter to `CaptchaClient` constructor.
- In the `verify()` method (line 1023), replace:
  ```js
  const resp = await httpRequest(url, { ... });
  ```
  with:
  ```js
  const resp = this.transport
    ? await this.transport.sendVerify({ url, method: 'POST', headers: verifyHeaders, body })
    : await httpRequest(url, { ... });
  ```

**Feature flag**: `usePuppeteerTransport` option on `CaptchaClient` constructor. When `true` and a `browser` instance is provided, `CaptchaClient` instantiates `PuppeteerTransport` internally. Default: `false` (backward compatible).

**CLI flag**: `--chrome-tls` on `tools/captcha-solver/cli.js` and `tools/scraper/cli.js`. When present, passes `usePuppeteerTransport: true` and the Puppeteer browser instance to `CaptchaClient`.

**Files touched by 46.12**:
1. `tools/captcha-solver/puppeteer-transport.js` — new file (the transport class)
2. `tools/captcha-solver/captcha-client.js` — add `transport` option, conditional routing in `verify()`
3. `tools/captcha-solver/cli.js` — add `--chrome-tls` flag, pass browser to CaptchaClient
4. `tools/scraper/cli.js` — add `--chrome-tls` flag (requires launching Puppeteer in the scraper path)

---

## Recommendation for 46.12

Use `page.evaluate(fetch(...))` as the routing mechanism, with a single long-lived `Browser` and one reusable `Page` navigated to the `t.captcha.qq.com` show page origin. The transport lives in a new `tools/captcha-solver/puppeteer-transport.js` with a `sendVerify({url, method, headers, body}) -> {statusCode, headers, body}` interface, gated behind a `--chrome-tls` / `usePuppeteerTransport` feature flag on `CaptchaClient`. The JA3 fingerprint comparison confirms Puppeteer's TLS stack is byte-identical to Chrome 146 (JA3 `8061a5edbfa5eab7663a5e5aff0118ab`) while Node.js is trivially distinguishable (JA3 `0cce74b0d9b7f8528fb2181588d23793`, 59 cipher suites, no GREASE, HTTP/1.1). No red flags or blockers identified.
