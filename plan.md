# Plan

## Status
Current phase: Phase 29
Current task: 29.1 — Audit and refresh stale template cache entries

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve — Token Isolation (done)
> Standalone token accepted by server (errorCode 0) via Puppeteer request interception.
> Root causes: (1) live templates use single-blob XTEA encryption, not 4-segment;
> (2) some cache entries had wrong keyMods from bad initial extraction.
> Key insight: same TDC_NAME always has same XTEA key/keyMods/cdFieldOrder — only eks differs per build.

### Phase 29: Cache Refresh & TLS Verification
> Fix stale template cache entries (wrong keyMods), then verify whether TLS
> fingerprinting is the real reason `cap_union_new_show` returns 403 for Node.js.

| ID | Task | Status |
|----|------|--------|
| 29.1 | Audit and refresh stale template cache entries | done |
| 29.2 | Tests for refreshed cache entries | pending |
| 29.3 | Verify TLS fingerprinting as cause of 403 on cap_union_new_show | pending |
| 29.4 | Act on 29.3 results | pending |

---

## Current Task

**ID**: 29.3
**Title**: Verify TLS fingerprinting as cause of 403 on cap_union_new_show
**Phase**: Cache Refresh & TLS Verification
**Status**: pending

### Goal
Determine whether TLS fingerprinting (JA3/JA4) is the real reason `cap_union_new_show` returns HTTP 403 for Node.js HTTP clients. If so, identify what TLS characteristics are being checked and potential workarounds.

### Context
- `cap_union_new_show` serves the CAPTCHA page HTML (the iframe src)
- Node.js `https` / `fetch` / `got` all get 403
- Puppeteer with Chrome works fine (Chrome TLS fingerprint)
- CLAUDE.md notes: "cap_union_new_show returns HTTP 403 for non-browser TLS clients (JA3/JA4 fingerprinting)"
- This is the main blocker for the headless scraper — it can't fetch the show page to get tdc.js, images, etc.

### Approach
1. Make a direct Node.js HTTPS request to `cap_union_new_show` and capture the 403
2. Compare the TLS fingerprint (JA3/JA4) of Node.js vs Chrome
3. Test with `curl` and different TLS options (--ciphers, --tls13-ciphers, etc.)
4. Test with `undici` or `node-fetch` with custom TLS options
5. Test if a TLS proxy or `tls-client` library can bypass the check

### Verification
- [ ] Confirmed: Node.js HTTPS gets 403 on cap_union_new_show
- [ ] Identified: what TLS characteristic triggers the 403
- [ ] Evaluated: potential workarounds (proxy, custom TLS, etc.)

### Suggested Agent
general-purpose
