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
| 29.1 | Audit and refresh stale template cache entries | pending |
| 29.2 | Tests for refreshed cache entries | pending |
| 29.3 | Verify TLS fingerprinting as cause of 403 on cap_union_new_show | pending |
| 29.4 | Act on 29.3 results | pending |

---

## Current Task

**ID**: 29.1
**Title**: Audit and refresh stale template cache entries
**Phase**: Cache Refresh & TLS Verification
**Status**: pending

### Goal
Identify which template cache entries have bad/missing keyMods, re-run the porting pipeline on fresh tdc.js builds for those templates, and update the cache. After this, all cached templates should have correct XTEA params that can decrypt browser-generated tokens.

### Context

**Cache state** (from `scraper/cache/templates.json`):
- 10 entries total, keyed by TDC_NAME
- Some entries have `keyMods: [0,0,0,0]` (likely wrong — defaulted during extraction)
- Some have no `cdFieldOrder` (needed for correct field reordering)
- `MClHbUcgSaZZVmDPBMgnkbnJHKWAEidn` was just refreshed via pipeline — has correct params now
- `SlVCfKSRjkmVXRnTigehmWSaDkeUUNfk` worked in the isolation test — params are correct

**User insight**: Same TDC_NAME always has the same XTEA key/keyMods/cdFieldOrder. Only `eks` differs per build. So the cache model (TDC_NAME → params) is correct — we just need to fix entries that were initially extracted with wrong keyMods.

**How to refresh**: For each stale entry:
1. Fetch a fresh tdc.js build with that TDC_NAME (use `node scraper/cli.js` or `fetch-latest` skill)
2. Run `node pipeline/run.js <tdc-file>` to extract correct params
3. Update the cache entry

**Alternative** (simpler): The isolation test already captures tdc.js sources. We can also use `scripts/token-isolation-test.js` repeatedly — each run captures a different template's source. Run the pipeline on each captured source.

**Simplest approach**: Write a script that:
1. Reads all cache entries
2. For each entry with suspicious keyMods (all zeros, or missing cdFieldOrder):
   - Try to fetch a fresh tdc.js build (or use already-captured sources)
   - Run the pipeline to extract correct params
   - Update the cache
3. For entries that already have non-zero keyMods AND cdFieldOrder, skip

### Implementation Steps
1. Audit current cache: list each entry with its keyMods and cdFieldOrder status
2. Identify which entries need refreshing
3. For each stale entry, run pipeline on a fresh/captured tdc.js source
4. Update cache with correct params
5. Verify by decrypting a known browser token

### Verification
- [ ] All 10 cache entries have non-trivial keyMods (not all zeros unless genuinely zero)
- [ ] All entries have cdFieldOrder arrays
- [ ] At least one browser token decrypts correctly with refreshed params

### Suggested Agent
general-purpose — to create the audit/refresh script
