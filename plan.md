# Plan

## Status
Current phase: Phase 37
Current task: 37.10 — Documentation corrections (CLAUDE.md, VERSION_DIFFERENCES.md, Phase 36 findings)

---

## Phases

### Phases 1-36: All prior work (done)
> See `history/` for detailed records.

### Phase 37: Project Cleanup
> Audit and clean up scripts, documentation, and tests.

| ID | Task | Status |
|----|------|--------|
| 37.1 | Remove obsolete scripts | done |
| 37.2 | Remove obsolete dynamic tracers and targets | done |
| 37.3 | Fix test-scraper-foundation.js template-cache lookup | done (resolved by 37.2) |
| 37.4 | Tests for template-cache fix | done (unnecessary) |
| 37.5 | Fix test-cfg.js func 272 edge case | done |
| 37.6 | Fix test-emit.js quality thresholds | done |
| 37.7 | Archive project-brief.md and docs/PROGRESS.md | done |
| 37.8 | Update docs/WORKFLOW.md + README.md | done |
| 37.9 | (merged into 37.8) | done |
| 37.10 | Documentation corrections (CLAUDE.md + VERSION_DIFFERENCES.md + Phase 36 findings) | in-progress |
| 37.11 | (merged into 37.10) | done |
| 37.12 | (merged into 37.10) | done |

---

## Current Task

**ID**: 37.10
**Title**: Documentation corrections
**Phase**: Project Cleanup
**Status**: in-progress

### Goal
Three related documentation updates, all touching current-state descriptions:
1. Fix stale "Known Issues" in CLAUDE.md (test failures are now resolved)
2. Close "Open Questions" in docs/VERSION_DIFFERENCES.md (Phase 33 answered them)
3. Add a short Phase 36 findings section somewhere in docs/ describing errorCode 12 diagnostic

### Context

**CLAUDE.md Known Issues (lines 181-188)** currently says:
- `test-cfg.js`: 583/584 assertions pass (1 edge case in func 272)
- `test-emit.js`: Code quality threshold assertions fail (cosmetic, not functional)

Both are now resolved (37.5 and 37.6). Entire test suite is 296/296.

CLAUDE.md also has no mention of errorCode 12 findings from Phase 36, and doesn't mention the Phase 37 cleanup.

**docs/VERSION_DIFFERENCES.md Open Questions (lines 356-381)** has 7 questions. Several are now answered:
1. "Does the key change between builds?" — **ANSWERED: YES**, each build has unique STATE_A key. Pipeline auto-extracts.
2. "Are compound opcodes stable?" — unknown, leave as-is
3. "Does the collector count change?" — still unknown, leave as-is
4. "Is the assembly order fixed?" — now verified across 10+ live builds, leave as-is
5. "Could the VM architecture change fundamentally?" — no change observed, leave as-is
6. "How many templates exist in the pool?" — **ANSWERED**: at least 10 unique builds observed in live rotation across multiple template architectures (95, 94, 96, 98, 100+ opcode variants)
7. "How long are templates valid?" — still unknown, leave as-is

Also the opening "3-Build Live Comparison" section is fine as historical context — don't modify.

**Phase 36 findings** — errorCode 12 is NOT pure IP rate limiting (browser solves still work from same IP). Likely fingerprint/behavioral detection. Temporal pattern: ~87% success in first 8-10 attempts, 0% after. Nonce is static per appid. Best location: new short section at end of docs/VERSION_DIFFERENCES.md or as a separate small file `docs/ERRORCODE_12_INVESTIGATION.md`. Use separate file — it's a distinct topic.

### Implementation Steps

#### Part A: CLAUDE.md Known Issues section (lines 181-188)

Replace:
```
- `test-cfg.js`: 583/584 assertions pass (1 edge case in func 272).
- `test-emit.js`: Code quality threshold assertions fail (cosmetic, not functional).
```

With:
```
- errorCode 12 on token verify: NOT pure IP rate limiting — browser solves work from the same IP. Likely fingerprint/behavioral scoring at the verify endpoint. See `docs/ERRORCODE_12_INVESTIGATION.md`.
```

Also, in the "Project Memory → Current State" block near the bottom, update the date to 2026-04-12 and add a bullet noting Phase 37 completion: "Project cleanup (Phase 37): removed 20 obsolete files, all 296 tests passing, legacy docs archived."

#### Part B: docs/VERSION_DIFFERENCES.md — close answered open questions

Find the "Open Questions" section (starts with `## Open Questions`). Replace its contents. Keep the questions that are still open (2, 3, 4, 5, 7) and mark the answered ones (1, 6) with resolution:

Replace the section content to clearly show which are answered vs still open. Example format:

```markdown
## Open Questions

### Answered

**1. Does the XTEA key change between builds?** — **YES, confirmed.** Each build has a unique `STATE_A` key. The automated pipeline (`pipeline/key-extractor.js`) dynamically extracts the key from the VM source for every new build. Delta (0x9E3779B9) and round count (32) are constant across all observed builds.

**6. How many templates exist in the pool?** — **At least 10 distinct builds** observed in live rotation (2026-04). Template architectures range from 94 to 100+ opcodes. Some builds are obfuscated (string-decoder + helper-wrapper layers). See `scripts/tdc-survey.js` for the survey methodology.

### Still Open

**2. Are compound opcodes stable?** [keep original text...]

**3. Does the collector count change?** [keep original text...]

**4. Is the assembly order fixed?** — Confirmed across 10+ builds for current architecture.

**5. Could the VM architecture change fundamentally?** [keep original text...]

**7. How long are templates valid?** [keep original text...]
```

Use the existing text for the still-open questions verbatim where possible.

#### Part C: Create `docs/ERRORCODE_12_INVESTIGATION.md`

New file documenting Phase 36 findings:

```markdown
# errorCode 12 Investigation

**Phase 36 diagnostic survey — 2026-04-12**

## Symptom

The `cap_union_new_verify` endpoint returns `errorCode: 12` (token rejected) for most scraper-generated tokens, even when the token is byte-identical to what the live VM would produce.

## What errorCode 12 is NOT

- **Not a token generation bug.** All 10 observed builds produce byte-identical tokens compared to the live VM (verified by `pipeline/token-verifier.js`).
- **Not pure IP-based rate limiting.** A normal browser session on the same IP continues to solve CAPTCHAs successfully after the scraper starts getting rejected. If this were pure IP throttling, the browser would also be blocked.
- **Not timing-dependent in the simple sense.** Attempts with varied delay (100ms–60s) show no correlation with outcome.
- **Not correlated with token size, nonce, or build/template.** All tokens are roughly equal size, nonce is static per appid (`eda1152f11f1daf0`), and the same build sees both success and failure responses.

## Observed Pattern (30-attempt survey)

| Attempts | Success rate |
|----------|--------------|
| 1        | 0% (cold-start penalty) |
| 2–9      | ~87.5% (7/8) |
| 10–30    | 0% (0/21)    |

Attempts are independent CAPTCHA sessions with fresh sig/session IDs each time. The server begins rejecting all tokens from the scraper after roughly 8–10 solves, while a real browser from the same IP continues to work.

## Hypothesis

The `cap_union_new_verify` endpoint performs some form of **fingerprint or behavioral scoring** beyond just validating the token. Candidates:

- **TLS/JA3 fingerprint detection** — probably not, since `cap_union_new_show` (which precedes verify) works fine from Node.js as long as `sess` is passed (verified 2026-04-11).
- **Behavioral event entropy analysis** — the scraper emits synthesized slideSd events; these may lack the entropy of real mouse movement and get flagged after a threshold of attempts.
- **Account/session reputation** — once the server has seen enough suspicious sessions from an IP, it downgrades the trust score and starts rejecting regardless of token correctness.
- **Cookie/referer chain** — the scraper submits without the upstream referer/cookie chain a browser would carry.

## Next Investigation Steps

If errorCode 12 is worth fixing:
1. Capture a real browser's behavioral event stream (slideSd payload) and replay it through the scraper.
2. Compare the scraper's and the browser's request headers byte-by-byte at the verify stage.
3. Test from a fresh IP — does the 8–10 attempt window reset?
4. Test with a warm-up phase (a few "real" solves via Puppeteer before the scraper attempts start).

## Status

Open. Token generation is verified correct; the remaining issue is on the request-presentation / behavioral side.
```

### Verification
- [ ] CLAUDE.md no longer references test-cfg.js and test-emit.js as failing
- [ ] CLAUDE.md mentions errorCode 12 in Known Issues
- [ ] CLAUDE.md Project Memory section has updated date and Phase 37 note
- [ ] docs/VERSION_DIFFERENCES.md Open Questions splits into Answered / Still Open
- [ ] docs/ERRORCODE_12_INVESTIGATION.md exists with the content above
- [ ] `npm test` still 296/296

### Suggested Agent
general-purpose — multi-file documentation edits
