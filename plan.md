# Plan

## Status
Current phase: Phase 5 — Token Verifier & Pipeline Orchestrator
Current task: 5.1 — Implement token verifier module

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
| 5.1 | Implement token verifier module (capture live, generate standalone, byte-compare) | in-progress |
| 5.2 | Implement pipeline orchestrator (decode → map → extract → verify) | pending |
| 5.3 | Tests for verifier and orchestrator | pending |

### Phase 6: Multi-Version Validation
> Run the automated pipeline against all tdc builds, fix issues, document findings.

| ID | Task | Status |
|----|------|--------|
| 6.1 | Port tdc-v3 (Template A — same as tdc.js, sanity check) | pending |
| 6.2 | Port tdc-v2 (Template B — different opcodes and XTEA key) | pending |
| 6.3 | Port tdc-v4 and tdc-v5 (unknown templates) | pending |
| 6.4 | Update documentation with all findings | pending |

---

## Current Task

**ID**: 5.1
**Title**: Implement token verifier module
**Phase**: Token Verifier & Pipeline Orchestrator
**Status**: in-progress

### Goal
Build a module that captures a live token from a tdc.js build via Puppeteer (with deterministic environment), generates a standalone token using the extracted XTEA key, and byte-compares the results. This is the end-to-end validation step.

### Context
The existing `dynamic/comparison-harness.js` does exactly this for Template A, but it's a standalone script hardcoded to tdc.js. The pipeline version must accept any tdc build + its extracted key parameters.

**The proven comparison approach** (from comparison-harness.js):
1. Run the tdc.js in Puppeteer with frozen Date.now/Math.random/performance.now
2. Instrument the VM to capture the `cdString` and `sdObject` (the raw data BEFORE encryption)
3. Capture the live token from `TDC.getData()`
4. Feed the captured cdString+sdObject to `generateTokenFromStrings()` with the same timestamp
5. Compare the two tokens

This is better than generating from a profile because it isolates the encryption pipeline — any mismatch must be in the crypto, not in the data collection.

**Key files**:
- `dynamic/comparison-harness.js` — reference implementation (study lines 60-200 for instrumentation approach)
- `token/generate-token.js` — `generateTokenFromStrings(cdString, sdString, timestamp)` and `generateToken(cdEntries, sdObject, timestamp)`
- `token/crypto-core.js` — `encryptSegments(chunks)` — currently hardcoded to Template A key. The verifier will need to handle this.
- `token/outer-pipeline.js` — `buildCdString()`, `buildSdString()`, `urlEncode()`

**Important constraint**: `token/crypto-core.js` has the XTEA key hardcoded as `STATE_A`. For multi-template support, the verifier needs to either:
- Temporarily modify the key constants (bad — violates no-modify-existing-files)
- Create a parameterized version of the encrypt function
- Override the module at runtime
The best approach: create a local encrypt function in the verifier that accepts key parameters, based on `crypto-core.js` but parameterized.

**Output location**: `pipeline/token-verifier.js`

### Implementation Steps
1. Create `pipeline/token-verifier.js` exporting `verifyToken(tdcPath, keyParams)` (async)
2. Build the Puppeteer harness that:
   - Serves the tdc.js with frozen deterministic environment
   - Instruments the VM to capture cdString and sdObject (same approach as comparison-harness.js)
   - Captures the live token from TDC.getData() and the timestamp
3. Build a parameterized XTEA encrypt function (based on `token/crypto-core.js`) that accepts key parameters
4. Generate a standalone token using the captured cdString+sdObject+timestamp and the provided key
5. Compare the tokens byte-by-byte
6. Return a verification report with per-segment comparison

### Verification
- [ ] `pipeline/token-verifier.js` exists and exports `verifyToken`
- [ ] Running on tdc.js with its known key produces a byte-identical match
- [ ] The report includes per-segment match status
- [ ] No modifications to existing files

### Suggested Agent
general-purpose — Puppeteer + token pipeline, reference implementation available
