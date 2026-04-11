# Plan

## Status
Current phase: Phase 32
Current task: 32.1 — Switch cache key from TDC_NAME to source hash

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve — Token Isolation (done)
> Standalone token accepted by server (errorCode 0) via Puppeteer request interception.

### Phase 29: Cache Refresh & TLS Verification (done)
> All 10 templates refreshed. cap_union_new_show 403 was missing sess, not TLS.
> Full headless flow confirmed possible.

### Phase 30: Puppeteer-Free Domain Query (done)
> `node scraper/cli.js --verbose https://example.com` works end-to-end.
> CAPTCHA solve + urlsec query with zero Puppeteer dependency. Confirmed 2026-04-11.

### Phase 31: Auto-Port Unknown Templates in Scraper (done)
> When the scraper encounters an unknown template, automatically run the porting
> pipeline as a subprocess, cache the result, and retry — instead of failing.
> Confirmed working 2026-04-11.

### Phase 32: Switch Template Cache Key to Source Hash
> TDC_NAME is not a reliable cache key — same TDC_NAME can map to different XTEA
> params across builds (confirmed in 28.13/28.14). Replace with SHA-256 hash of
> tdc.js source after stripping the eks token (which varies per-session).

| ID | Task | Status |
|----|------|--------|
| 32.1 | Switch cache key from TDC_NAME to source hash | in-progress |
| 32.2 | Tests for source hash cache key | pending |
| 32.3 | Clear cache and live test | pending |

---

## Current Task

**ID**: 32.1
**Title**: Switch cache key from TDC_NAME to source hash
**Phase**: Switch Template Cache Key to Source Hash
**Status**: in-progress

### Goal
Replace TDC_NAME as the template cache key with a SHA-256 hash of the tdc.js source after stripping the eks value. This ensures builds with the same code but different eks tokens share a cache entry, while builds with different XTEA params get separate entries.

### Context

**Why TDC_NAME fails**: History 28.13 showed that `CSMHFmMCDWYSdnHeTJAbbedQBMaAnGdl` had stale keyMods `[0,0,0,0]` in cache but the actual live build had `[1579040,0,2829060,0]`. Same TDC_NAME, different XTEA keys. The TDC_NAME identifies the template rotation slot, not the specific build.

**What varies per-session**: Only the eks token changes per tdc.js response. The eks is a base64 string (~312 chars) assigned via `window.<TDC_NAME> = '<base64>'` or `window[TDC_NAME] = '<base64>'`. Everything else (VM bytecode, XTEA key derivation, opcodes) is identical for builds that should share cache entries.

**Stripping eks**: Use the same regex patterns from `extractEks()` in `scraper/tdc-utils.js` to find and remove the eks assignment line before hashing. This way, two tdc.js responses that differ only in eks will produce the same hash.

**Key files to modify**:
- `scraper/tdc-utils.js` — add `computeSourceHash(source)` function
- `scraper/scraper.js` — replace `tdcName` with `sourceHash` as cache key in solveCaptcha() and _autoPort()
- `scraper/template-cache.js` — update `seed()` to use source hash (read target file, strip eks, hash)
- `scraper/cache/templates.json` — will be cleared after implementation

**Hash approach**:
1. Strip eks: replace the `window.<TDC_NAME> = '<eks-value>'` line with empty string (or just the eks value with a placeholder)
2. Compute SHA-256 of the stripped source
3. Use first 16 hex chars as the cache key (64 bits — sufficient for uniqueness, readable in logs)

**What to preserve**:
- `extractTdcName()` is still useful for logging — keep it
- `extractEks()` is used to get the eks value for verify POST — keep it
- `lookupByStructure()` fallback still useful for cross-template matching — keep it
- `_autoPort()` uses the cache key for store/lookup — update to use hash

### Implementation Steps
1. In `scraper/tdc-utils.js`:
   - Add `const crypto = require('crypto');`
   - Add `computeSourceHash(source)` that strips eks and returns first 16 chars of SHA-256 hex
   - Export it alongside existing functions

2. In `scraper/scraper.js` solveCaptcha():
   - After extracting tdcSource (line 397), compute `const sourceHash = computeSourceHash(tdcSource);`
   - Log both TDC_NAME (for human readability) and sourceHash (for cache key)
   - Replace `this._templateCache.lookup(tdcName)` with `this._templateCache.lookup(sourceHash)`
   - Replace `this._templateCache.store(tdcName, cached)` with `this._templateCache.store(sourceHash, cached)`
   - Replace `this._autoPort(tdcName, tdcSource)` with `this._autoPort(sourceHash, tdcSource)`

3. In `scraper/scraper.js` _autoPort():
   - Parameter is now `sourceHash` instead of `tdcName` (it's just a string key — the method doesn't care about the format)

4. In `scraper/template-cache.js` seed():
   - After reading target file, call `computeSourceHash(targetSource)` to get hash
   - Use hash as cache key instead of TDC_NAME extracted from first line

5. After all code changes: delete `scraper/cache/templates.json` (will be recreated by seed() on next init)

### Verification
- [ ] `node -c scraper/scraper.js` passes
- [ ] `node -c scraper/tdc-utils.js` passes
- [ ] `node -c scraper/template-cache.js` passes
- [ ] `npm test` — no regressions
- [ ] Code review: computeSourceHash strips eks before hashing
- [ ] Code review: all cache lookup/store calls use sourceHash, not tdcName
- [ ] Code review: TDC_NAME still extracted and logged for readability

### Suggested Agent
general-purpose
