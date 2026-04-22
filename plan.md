# Plan

## Status
Current phase: Phase 71 — X-Forwarded-For rate-limit bypass research
Current task: 71.2 — Unit test for `--extra-header` propagation

---

## Phases

### Phase 71: X-Forwarded-For rate-limit bypass research
> Empirically determine whether injecting a client-IP forwarding header on the `/cap_union_new_verify` POST bypasses the per-IP rate window that triggers `errorCode 12`.

| ID | Task | Status |
|----|------|--------|
| 71.1 | Add `--extra-header` capability to `tools/scraper/` (HTTP layer + CLI), wired through to the `/cap_union_new_verify` POST | done |
| 71.2 | Add a unit test that asserts the extra header propagates through `httpRequest` to the verify POST | in-progress |
| 71.3 | Build experiment driver under `research/xff-spoof/` that runs N scraper invocations per condition with the candidate header set | pending |
| 71.4 | Execute the experiment and write `output/xff-spoof/results.md` with raw rows, errorCode histogram per condition, and interpretation | pending |
| 71.5 | If results are conclusive in either direction, update `docs/CAPTCHA_ORCHESTRATOR.md` §7/§9 with the finding | pending |

---

## Current Task

**ID**: 71.2
**Title**: Unit test for `--extra-header` propagation
**Phase**: Phase 71 — X-Forwarded-For rate-limit bypass research
**Status**: in-progress

### Goal
Pin the new `--extra-header` capability with a regression test so future refactors cannot silently break the propagation path. The test must catch both halves of the contract: (a) user-supplied headers DO land on the verify POST with their exact values, and (b) user-supplied headers DO NOT land on any other outbound request.

### Context
- Implementation just landed in 71.1 — see commit (about to be made) modifying `tools/scraper/cli.js`, `tools/scraper/scraper.js`, `tools/puppeteer/captcha-client.js`.
- The verify POST is fired from `tools/scraper/scraper.js` (around line 689, search `cap_union_new_verify`). The verify URL hits `t.captcha.qq.com` (NOT `urlsec.qq.com` — the latter is the consumer page; the CAPTCHA endpoint is at `t.captcha.qq.com`).
- The HTTP transport is `httpRequest()` in `tools/puppeteer/captcha-client.js`; the merge happens inline in `scraper.js` before the call (the scraper builds a `verifyHeaders` object and overlays each user-supplied header onto it).
- Existing test suite: `tests/` directory. Run with `npm test`. There are 43 suites currently (216 tests). Look at how existing tests intercept HTTP — they likely stub `https.request` or use a similar pattern. Pick the pattern already used in the suite; do not introduce new test infrastructure.
- A full end-to-end Scraper run is too heavy to test in unit form (requires solving a slide CAPTCHA against a live server). The right granularity is to test the **merge logic** in isolation — either by mocking `httpRequest` and asserting the call arguments, or by extracting the merge into a tiny pure helper that can be unit-tested directly. Pick whichever is cleaner given the existing test conventions in this repo.
- Coding style: CommonJS, 2-space, single quotes, semicolons (`.claude/rules/coding-style.md`).

### Implementation Steps
1. Read `tools/scraper/cli.js`, `tools/scraper/scraper.js` (specifically the `solveCaptcha` method and the verify-POST call site around line 689), and `tools/puppeteer/captcha-client.js` (the `httpRequest` function with the `DUMP_VERIFY` block) so you have the contract clearly in mind.
2. List `tests/` and skim 2–3 existing test files to identify the test framework (`node:test` per the `npm test` runner output) and the dominant pattern for intercepting HTTP or for stubbing transport-layer calls. Match that pattern.
3. Add a new test file under `tests/` (use the naming convention you observe — likely `tests/test-scraper-extra-headers.js` or similar). The file must contain at minimum these two test cases:
   - **`extra headers land on verify POST with exact values`** — drive the scraper (or its merge logic) so it would issue a verify POST with two extra headers; assert that the headers reaching the transport include both names with their exact values.
   - **`extra headers do not contaminate non-verify requests`** — drive a non-verify outbound (any of: prehandle, show-page, tdc.js fetch, getsig) and assert the `extraHeaders` list set on the Scraper does NOT appear on that request's outgoing header map.
4. If the cleanest way to test (b) is to verify the merge code lives only at the verify call site (i.e. there is structurally no path for extra headers to reach other requests), a static assertion via `grep`-like reading of the source is acceptable — but a runtime assertion that drives a non-verify request and checks its headers is stronger and preferred.
5. The test must run cleanly under `npm test` with no network access — fully stubbed/mocked transport.

### Verification
- [ ] `npm test` passes including the new test file. Run it and quote the new tests' names + the final summary line (`# tests N # pass N # fail 0`).
- [ ] Temporarily break the `--extra-header` propagation (e.g. comment out the `for (const h of this.extraHeaders) { verifyHeaders[h.name] = h.value; }` loop in `scraper.js`) and rerun — the new test must FAIL. Quote the failure output. Then restore the line and confirm the test goes green again.
- [ ] Test runs without any network I/O. Confirm by inspecting the test source — no `https.request`, no real fetch — and by the test runtime being fast (under ~500ms for the new file).

### Suggested Agent
`general-purpose` — straightforward unit-test addition. **Must be a different agent from the one that wrote 71.1** so the test author approaches the contract from a fresh perspective rather than mirroring the implementation's exact shape.
