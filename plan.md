# Plan

## Status
Current phase: Phase 37
Current task: pending — awaiting user review

---

## Phases

### Phases 1-36: All prior work (done)
> See `history/` for detailed records. Key milestones: decompiler pipeline,
> byte-identical token generator, automated porting pipeline (all 10 templates),
> headless scraper, errorCode 12 diagnosed as fingerprint/rate-limit issue.

### Phase 37: Project Cleanup
> Audit and clean up scripts, documentation, and tests. Remove obsolete files,
> fix inaccurate docs, update stale references, fix the 3 permanently-failing tests.

| ID | Task | Status |
|----|------|--------|
| 37.1 | Remove obsolete scripts | pending |
| 37.2 | Remove obsolete dynamic tracers and targets | pending |
| 37.3 | Fix test-scraper-foundation.js template-cache lookup | pending |
| 37.4 | Tests for template-cache fix | pending |
| 37.5 | Fix test-cfg.js func 272 edge case | pending |
| 37.6 | Fix test-emit.js quality thresholds | pending |
| 37.7 | Archive project-brief.md and docs/PROGRESS.md | pending |
| 37.8 | Update docs/WORKFLOW.md with Phase 11-36 epilogue | pending |
| 37.9 | Update README.md (template count, test count, phase references) | pending |
| 37.10 | Update CLAUDE.md — correct Phase 36 conclusion and add cleanup notes | pending |
| 37.11 | Update docs/VERSION_DIFFERENCES.md — close open questions | pending |
| 37.12 | Add Phase 36 diagnostic findings to docs | pending |

---

## Phase 37 Detail

### 37.1 — Remove obsolete scripts

**Scripts to remove** (one-off investigation tools whose findings are now recorded in history/docs — no ongoing value):

| Script | Reason for removal |
|--------|-------------------|
| `scripts/tls-403-investigation.js` | Superseded by `tls-403-deep-dive.js`; finding recorded: 403 was missing `sess`, not TLS |
| `scripts/tls-403-deep-dive.js` | Investigation complete (Phase 29). Finding in CLAUDE.md |
| `scripts/chrome-passthrough.js` | One-off proof that errorCode 9 = slider miss. Finding recorded |
| `scripts/ref-inject-forensics.js` | One-off forensic analysis during Phase 25. Findings absorbed |
| `scripts/ref-inject-solver.js` | Experimental approach, superseded by scraper pipeline |
| `scripts/post-body-compare.js` | Debugging tool, finding absorbed into vdata-generator |
| `scripts/vdata-compare.js` | Debugging tool, finding absorbed into vdata-generator |
| `scripts/collect-diff.js` | One-off debugging, findings absorbed into collect-generator |
| `scripts/diag-keymods.js` | Key mod serialization bug found and fixed. Finding recorded |
| `scripts/token-diff.js` | One-off token comparison. Superseded by pipeline token-verifier |
| `scripts/token-forensics.js` | One-off deep trace. Findings in docs/TOKEN_FORMAT.md |
| `scripts/hybrid-solver.js` | Experimental approach, superseded by scraper pipeline |

**Scripts to KEEP**:

| Script | Reason |
|--------|--------|
| `scripts/tdc-survey.js` | Active survey tool, has tests |
| `scripts/tdc-diagnose.js` | Active diagnostic tool, has tests |
| `scripts/live-captcha-submit.js` | Active end-to-end verification tool |
| `scripts/live-comparison.js` | Active live comparison tool |
| `scripts/chrome-cd-inject.js` | Active Chrome injection tool (4 references) |
| `scripts/token-isolation-test.js` | Active test tool (3 references, has test file) |
| `scripts/decrypt-collect.js` | Reusable utility for token analysis (3 references) |
| `scripts/discover-field-order.js` | Reusable discovery tool for new templates |

### 37.2 — Remove obsolete dynamic tracers and targets

**Dynamic tracers to remove**:

| File | Reason |
|------|--------|
| `dynamic/v2-token-capture.js` | 0 references, superseded by pipeline |
| `dynamic/chunk-tracer.js` | 0 references, one-off tracer |
| `dynamic/crypto-tracer.js` | Superseded by crypto-tracer-v3.js |
| `dynamic/crypto-tracer-v2.js` | Superseded by crypto-tracer-v3.js |

**Dynamic tracers to KEEP**: `harness.js`, `instrument.js`, `comparison-harness.js`, `crypto-tracer-v3.js`, `encoding-tracer.js`, `payload-tracer.js`

**Target files to remove**:

| File | Reason |
|------|--------|
| `targets/tdc-capture.js` | Ad-hoc capture, only referenced from output/. Not a canonical version |
| `targets/tdc-captured.js` | Duplicate of tdc-capture.js concept |
| `targets/tdc-diag.js` | Untracked diagnostic copy |
| `targets/tdc-live-test.js` | Untracked test copy |

**Target files to KEEP**: `tdc.js` (reference), `tdc-v2.js` through `tdc-v5.js` (canonical versions), `tdc-live.js` (live capture used by scripts)

### 37.3 — Fix test-scraper-foundation.js template-cache lookup

**Problem**: Template cache `seed()` populates with `key: [1, 2, 3, 4]` instead of correct XTEA key values. Test ordering issue — some earlier test corrupts `output/tdc/pipeline-config.json` or the cache file.

**Fix approach**: Make the test self-contained — use a temp directory and inject known config data instead of depending on `output/tdc/pipeline-config.json` state.

### 37.4 — Tests for template-cache fix

Verify the fix doesn't regress other scraper tests.

### 37.5 — Fix test-cfg.js func 272 edge case

**Problem**: Function 272 block b3 has a JMP with 0 successors (expected 1). Target address 41580 isn't resolved as a valid block boundary.

**Fix approach**: Investigate CFG builder's handling of JMP targets at function boundaries. Either fix the CFG builder to handle this edge case, or if it's genuinely unreachable code, adjust the test assertion to document the known limitation.

### 37.6 — Fix test-emit.js quality thresholds

**Problem**: Two failures:
1. Return count: 434 `return` keywords emitted vs 665 actual return stmts (need ≥90% = 599)
2. Brace imbalance: func 276 has 32 `{` but 31 `}`

**Fix approach**: These are code quality thresholds. Options:
- (a) Fix the emitter to handle more return cases and fix the brace imbalance — real improvement
- (b) Lower the threshold to match current reality — pragmatic but loses the quality signal

Prefer (a) for the brace bug (real bug), and assess (a) vs (b) for the return count based on investigation.

### 37.7 — Archive project-brief.md and docs/PROGRESS.md

- `project-brief.md`: Add "ARCHIVED" header — superseded by CLAUDE.md
- `docs/PROGRESS.md`: Add "ARCHIVED — Phases 1-10" header. It's 1,262 lines of detailed task history that's valuable as reference but misleading as "current state"

### 37.8 — Update docs/WORKFLOW.md

Add epilogue section noting Phases 11-36 exist, with one-line summary per phase and pointer to `history/` for details.

### 37.9 — Update README.md

- Fix template count: "3 distinct templates" → "10+ observed builds across multiple templates"
- Fix test count to match current suite (296 tests, 293 pass)
- Remove "Phase 10" reference from intro
- Update version status table

### 37.10 — Update CLAUDE.md

- Correct Phase 36 conclusion: "IP-based rate limiting" → "likely fingerprint detection / anti-bot scoring (not pure IP rate limiting — browser solves still work from same IP)"
- Update test count in Known Issues
- Add note about Phase 37 cleanup

### 37.11 — Update docs/VERSION_DIFFERENCES.md

Close the open questions at the end:
- "Does the key change between builds?" → YES, confirmed. Each template has unique STATE_A key
- "How many templates exist?" → At least 10 observed in live rotation (3+ distinct template architectures)

### 37.12 — Add Phase 36 diagnostic findings to docs

Create a short section in docs/ (or extend an existing doc) documenting:
- errorCode 12 is not pure IP rate limiting (browser solves work from same IP)
- Temporal pattern: ~87% success rate for first 8-10 attempts, 0% after
- Server likely does fingerprint/behavioral scoring that flags our profile
- Nonce is static per appid (`eda1152f11f1daf0`)
- No correlation with timing, token size, or build/template
