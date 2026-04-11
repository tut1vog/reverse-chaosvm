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
| 29.3 | Verify TLS fingerprinting as cause of 403 on cap_union_new_show | done |
| 29.4 | Act on 29.3 results | pending |

---

## Current Task

**ID**: 29.4
**Title**: Act on TLS investigation results
**Phase**: Cache Refresh & TLS Verification
**Status**: pending

### Findings from 29.3
- **Confirmed**: TLS fingerprinting (JA3/JA4) blocks all non-browser clients on `cap_union_new_show`
- Tested: Node.js, curl, curl-impersonate-chrome, custom TLS variants — ALL get 403
- **Only `cap_union_new_show` is blocked** — prehandle, tdc.js, verify all work from Node.js
- Server: `Trpc httpd`, TLS 1.2 only, uses full Client Hello structure fingerprinting

### Options
1. **Hybrid Puppeteer+headless**: Puppeteer for show page only, headless for everything else
2. **Full Puppeteer with token swap**: Proven working (28.15), use `singleBlob` mode
3. **Go utls for JA3 spoofing**: Complex, different language
4. **Accept the limitation**: Document it, use Puppeteer-based solver

### Suggested next step
User decision on direction
