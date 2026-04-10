# Plan

## Status
Current phase: Phase 8: Scraper Foundation Modules
Current task: 8.2 — Parameterized collect token generator

---

## Phases

### Phase 1: Project Foundation
> Set up fresh git repo, rewrite CLAUDE.md, create rules/settings — clean slate for all future work.

| ID | Task | Status |
|----|------|--------|
| 1.1 | Fresh git init and initial commit | done |
| 1.2 | Rewrite CLAUDE.md, create rules, create settings.json | done |

### Phase 2: Claude Code Tooling
> Create the agent, command, and skill markdown files that define specialized behaviors for the pipeline.

| ID | Task | Status |
|----|------|--------|
| 2.1 | Create agent files (opcode-mapper, key-extractor, token-verifier) | done |
| 2.2 | Create commands (port-version, fetch-latest) and skill (port-opcodes) | done |

### Phase 3: VM Parser & Opcode Auto-Mapper
> Build modules to parse any tdc build's VM function, identify variables by structural role, and auto-map opcodes to known semantic operations.

| ID | Task | Status |
|----|------|--------|
| 3.1 | Implement VM variable identifier module | done |
| 3.2 | Implement opcode auto-mapper module | done |
| 3.3 | Tests for VM parser and opcode mapper (validate against tdc.js reference table) | done |

### Phase 4: XTEA Key Extractor
> Build Puppeteer-based dynamic tracing to extract XTEA key schedule from any tdc build.

| ID | Task | Status |
|----|------|--------|
| 4.1 | Implement dynamic key extraction module | done |
| 4.2 | Tests for key extractor (validate against tdc.js known key) | done |

### Phase 5: Token Verifier & Pipeline Orchestrator
> Build the token comparison module and the single-command orchestrator that chains all stages.

| ID | Task | Status |
|----|------|--------|
| 5.1 | Implement token verifier module (capture live, generate standalone, byte-compare) | done |
| 5.2 | Implement pipeline orchestrator (decode → map → extract → verify) | done |
| 5.3 | Tests for verifier and orchestrator | pending |

### Phase 6: Multi-Version Validation
> Run the automated pipeline against all tdc builds, fix issues, document findings.

| ID | Task | Status |
|----|------|--------|
| 6.1 | Port tdc-v3 (Template A — same as tdc.js, sanity check) | done |
| 6.2 | Port tdc-v2 (Template B — different opcodes and XTEA key) | done |
| 6.3 | Port tdc-v4 and tdc-v5 (unknown templates) | done |
| 6.4 | Update documentation with all findings | done |

### Phase 7: Documentation
> Update README.md and other external-facing docs to reflect the automated pipeline.

| ID | Task | Status |
|----|------|--------|
| 7.1 | Update README.md for automated pipeline | done |

### Phase 8: Scraper Foundation Modules
> Build the low-level utility modules that all higher-level scraper code depends on.

| ID | Task | Status |
|----|------|--------|
| 8.1 | Template cache and TDC utilities (tdc-utils.js, template-cache.js) | done |
| 8.2 | Parameterized collect token generator (collect-generator.js) | in-progress |
| 8.3 | Tests for foundation modules | pending |

### Phase 9: vData Generation
> Execute vm-slide.enc.js in jsdom to produce vData without a browser.

| ID | Task | Status |
|----|------|--------|
| 9.1 | vData generator (vdata-generator.js) — jsdom + vm-slide.enc.js + jQuery interception | pending |
| 9.2 | Tests for vData generator | pending |

### Phase 10: Scraper Orchestrator
> Wire all modules into a single scraper class and CLI that executes the full CAPTCHA flow.

| ID | Task | Status |
|----|------|--------|
| 10.1 | Scraper orchestrator class (scraper.js) | pending |
| 10.2 | CLI entry point (cli.js) | pending |
| 10.3 | Tests for scraper orchestrator | pending |

### Phase 11: End-to-End Integration
> Live integration testing against urlsec.qq.com and final documentation updates.

| ID | Task | Status |
|----|------|--------|
| 11.1 | End-to-end live test and debugging | pending |
| 11.2 | Update CLAUDE.md, create scrape command | pending |

---

## Current Task

**ID**: 8.2
**Title**: Parameterized collect token generator
**Phase**: Scraper Foundation Modules
**Status**: in-progress

### Goal
Create `scraper/collect-generator.js` — a parameterized XTEA encryption module that generates collect tokens using any template's key (not just Template A's hardcoded key). Reuses `token/outer-pipeline.js` and `token/collector-schema.js` for the key-independent parts; only re-implements the XTEA cipher with dynamic key/delta/keyModConstants parameters.

### Context
- **`token/crypto-core.js`** has hardcoded `STATE_A = [0x6257584F, ...]`, `DELTA`, `KEY_MOD_1`, `KEY_MOD_3`. These are Template A only. We need a version that accepts these as parameters.
- **`token/outer-pipeline.js`** exports `buildCdString`, `buildSdString`, `assembleToken`, `urlEncode`, `buildToken` — all key-independent, safe to `require()`.
- **`token/collector-schema.js`** exports `buildDefaultCdArray` — also key-independent, safe to `require()`.
- **`token/generate-token.js`** exports `generateToken(profile, options)` and `buildInputChunks(cdString, sdString)` — these call the hardcoded `encryptSegments`. Our module should replicate the chunk-building + encryption pipeline with a parameterized encrypt function.
- **Template XTEA params** come from `scraper/template-cache.js` (task 8.1) as `{key: [4 ints], delta: int, rounds: int, keyModConstants: [2 ints]}`.
- The `buildToken` function in `outer-pipeline.js` takes an `encryptFn(chunks) → base64segments[]` — this is the pluggable interface. We create our own `encryptFn` parameterized by key/delta/keyModConstants.
- **XTEA cipher algorithm** (from `token/crypto-core.js` lines 94-122):
  - `cipherRound(r9, r92)` — Feistel with sum accumulation, key mod on indices 1 and 3
  - `encrypt(inputBytes)` — 8-byte block ECB
  - `encryptSegments(chunks)` — encrypt + btoa each chunk
- **Protected paths**: Do NOT modify `token/`, `pipeline/`, `puppeteer/`, `targets/`.

### Implementation Steps
1. Create `scraper/collect-generator.js` with:
   - `createEncryptFn({key, delta, rounds, keyModConstants})` → returns an `encryptFn(chunks)` compatible with `outer-pipeline.buildToken()`.
   - Internal helpers: `convertBytesToWord`, `convertWordToBytes`, `cipherRound`, `encrypt` — copied from `token/crypto-core.js` but parameterized (key/delta/keyModConstants as closure variables instead of module constants).
   - `generateCollect(profile, xteaParams, options)` — main entry point. Builds cdArray from profile via `collector-schema.buildDefaultCdArray`, builds cdString/sdString via `outer-pipeline`, builds input chunks (same logic as `generate-token.buildInputChunks`), encrypts with parameterized XTEA, assembles + URL-encodes.
2. The function signature of `generateCollect` should match what the scraper orchestrator needs:
   - `profile`: fingerprint profile object (from `profiles/*.json`)
   - `xteaParams`: `{key, delta, rounds, keyModConstants}` from template cache
   - `options`: `{appid, nonce}` for sdString

### Verification
- [ ] Generate a collect token with Template A params and compare output length to `token/generate-token.js` output (both should produce ~4460 char URL-encoded strings from the same profile).
- [ ] Verify the parameterized encrypt produces byte-identical output to `token/crypto-core.encryptFn` for Template A params: `node -e` test that encrypts the same input with both and compares.
- [ ] Generate a collect token with Template B params (different key) — should succeed and produce a different token than Template A.

### Suggested Agent
general-purpose — reimplementation of known algorithm with parameterization
