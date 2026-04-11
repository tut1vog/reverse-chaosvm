# Plan

## Status
Current phase: Phase 28
Current task: 28.10 — Deep token diff: compare original vs standalone structure

---

## Phases

### Phases 1-24: Foundation through End-to-End Live Verification (all done)

### Phase 25: Chrome cd Injection — Validate Token Structure (done)

### Phase 26: Realistic Fingerprint Profile (deprioritized)

### Phase 27: VM Parser Extension for New Templates (pending)

### Phase 28: End-to-End CAPTCHA Solve (No Puppeteer Drag)
> **ROOT CAUSE FOUND**: Live templates encrypt the token as a **single continuous
> XTEA blob** — NOT as 4 separately-encrypted segments concatenated together.
> Our `assembleToken()` encrypts 4 chunks independently then concatenates base64.
> The server expects one continuous ciphertext → can't decrypt ours → errorCode 12.
> Template A (reference build) uses 4 segments; live templates (95/96/98 opcodes) use 1.

| ID | Task | Status |
|----|------|--------|
| 28.1 | Fix ans coordinate space and calibration in chrome-passthrough | done |
| 28.2 | Live re-test with chrome-passthrough (manual POST still fails) | done |
| 28.2.1 | Run captcha-solver.js with real drag | done (errorCode 0 — success!) |
| 28.3 | Fix ans computation in scraper pipeline (X=rawOffset, Y=spt) | done |
| 28.4 | Tests for ans computation | done |
| 28.5 | Investigate errorCode -1 and 12 | done (12 is universal, not template-specific) |
| 28.6 | Isolation test: standalone token via Puppeteer request interception | done |
| 28.7 | Tests for standalone token interception | done |
| 28.8 | Act on 28.6 results | done |
| 28.9 | Fix collect encoding: raw base64 in POST body swap | done |
| 28.10 | Deep token diff: compare original vs standalone structure | done |
| 28.11 | Add single-blob encryption mode to collect-generator | pending |
| 28.12 | Tests for single-blob encryption mode | pending |
| 28.13 | Re-run isolation test with single-blob mode | pending |

---

## Current Task

**ID**: 28.11
**Title**: Add single-blob encryption mode to collect-generator
**Phase**: End-to-End CAPTCHA Solve (No Puppeteer Drag)
**Status**: pending

### Goal
Add a `singleBlob: true` option to `generateCollect()` that encrypts the entire payload as one continuous XTEA stream (then base64-encodes the whole thing) instead of encrypting 4 separate segments. This matches how live templates actually work.

### Context

**Root cause from 28.10**: Live templates encrypt the collect token as a **single continuous XTEA-ECB blob**:
1. Build the full plaintext: `hashString + headerString + cdBodyString + sigString` (or equivalent concatenation)
2. XTEA-ECB encrypt the entire concatenated binary string as one pass
3. Base64 the result → single base64 string

Our current pipeline (in `token/outer-pipeline.js` and `scraper/collect-generator.js`):
1. Build 4 plaintext chunks: hash, header, cdBody, sig
2. XTEA-ECB encrypt each chunk SEPARATELY → 4 binary segments
3. Base64 each → 4 base64 strings
4. Concatenate: `btoa[1] + btoa[0] + btoa[2] + btoa[3]`

Since XTEA-ECB encrypts each 8-byte block independently, the two approaches produce different ciphertext when the segment boundaries don't align with 8-byte block boundaries. The padding at the end of each segment introduces extra zero bytes, and the base64 encoding of separate segments vs one blob produces different output.

**Evidence**: Decrypting the browser's original token as one continuous blob produces valid JSON from byte 0 (`{"cd":[1,"Arial,...`). The "hash" position (bytes 144-192) contains cd array continuation, NOT `[[4,-1,-1,ts,...]]` metadata.

**Key question**: How does the live TDC build the plaintext before encryption? Two possibilities:
1. The payload is `cdString + sdString` (no hash, no header split) — one continuous JSON string encrypted as one blob
2. The payload still has 4 conceptual parts but they're concatenated BEFORE encryption, not after

Based on the decryption evidence, it looks like option 1: the token is just `{"cd":[...],` + `"sd":{...}}` encrypted as one XTEA-ECB pass, then base64'd.

### Implementation Steps
1. In `scraper/collect-generator.js`, add a `singleBlob` option to `generateCollect()`
2. When `singleBlob: true`:
   a. Build cdString and sdString as normal
   b. Build the full plaintext: `cdString.slice(0, -1) + ',' + '"sd":' + sdString + '}'` (same JSON assembly)
   c. Prepend the hash string (48 bytes, space-padded `[[4,-1,-1,timestamp,0,0,0,0]]`)
   d. XTEA-encrypt the entire concatenated string as one pass
   e. Base64-encode the result
   f. URL-encode
3. When `singleBlob: false` (default): current behavior unchanged

Actually — wait. From the evidence, the browser token starts at byte 0 with `{"cd":[` — there's no hash prefix. The hash content appears nowhere in the plaintext. So the single-blob mode might just be: encrypt `cdPayload + sdPayload` as one blob, no hash segment at all.

Need to verify: does the browser token include the hash metadata at all? From the full decryption, position 0 starts with `{"cd":[` and the entire 5040 bytes decrypt to one JSON string (minus ~90 bytes of garbage at the end from sig position). So the hash `[[4,-1,-1,...]]` is NOT in this token at all.

### Verification
- [ ] `node -c scraper/collect-generator.js` passes
- [ ] Existing tests still pass (163/165)
- [ ] `generateCollect(profile, xteaParams, { singleBlob: true })` produces a single base64 blob
- [ ] The blob, when decrypted as one stream, yields valid JSON starting with `{"cd":[`

### Suggested Agent
general-purpose
