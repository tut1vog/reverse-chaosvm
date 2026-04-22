# Plan

## Status
Current phase: Phase 71 — X-Forwarded-For rate-limit bypass research
Current task: 71.1 — Add `--extra-header` capability to scraper HTTP layer

---

## Phases

### Phase 71: X-Forwarded-For rate-limit bypass research
> Empirically determine whether injecting a client-IP forwarding header on the `/cap_union_new_verify` POST bypasses the per-IP rate window that triggers `errorCode 12`.

| ID | Task | Status |
|----|------|--------|
| 71.1 | Add `--extra-header` capability to `tools/scraper/` (HTTP layer + CLI), wired through to the `/cap_union_new_verify` POST | in-progress |
| 71.2 | Add a unit test that asserts the extra header propagates through `httpRequest` to the verify POST | pending |
| 71.3 | Build experiment driver under `research/xff-spoof/` that runs N scraper invocations per condition with the candidate header set | pending |
| 71.4 | Execute the experiment and write `output/xff-spoof/results.md` with raw rows, errorCode histogram per condition, and interpretation | pending |
| 71.5 | If results are conclusive in either direction, update `docs/CAPTCHA_ORCHESTRATOR.md` §7/§9 with the finding | pending |

---

## Current Task

**ID**: 71.1
**Title**: Add `--extra-header` capability to scraper HTTP layer
**Phase**: Phase 71 — X-Forwarded-For rate-limit bypass research
**Status**: in-progress

### Goal
Give the pure-Node scraper a way to inject arbitrary extra HTTP headers onto the `/cap_union_new_verify` POST so the Phase 71 experiment can probe whether client-IP forwarding headers (XFF, X-Real-IP, etc.) bypass the per-IP rate window. Capability only — no experiment driver yet.

### Context
- Scraper entry point: `tools/scraper/cli.js` — argv-style parser, hands off to `tools/scraper/scraper.js`.
- Scraper main flow: `tools/scraper/scraper.js` — orchestrates fetch tdc.js → solve slide → POST verify.
- HTTP transport: every outbound request goes through a `httpRequest()` helper (search `tools/scraper/scraper.js` for it). Phase 62.1 (commit `de37e5c`) already added a `DUMP_VERIFY` env-var hook that dumps the verify POST to disk — read it as the model for how to thread a new option down through the call stack.
- The verify POST is the single critical path: only the `/cap_union_new_verify` call needs the extra headers. Sub-resource fetches (tdc.js, getsig, etc.) must NOT have them, because they originate from a different code path and contaminating them would muddy the experiment.
- The CLI flag should be repeatable so multiple headers can be set in one run, e.g. `--extra-header "X-Forwarded-For: 1.2.3.4" --extra-header "X-Real-IP: 1.2.3.4"`.
- Coding style: CommonJS, 2-space, single quotes, semicolons (`.claude/rules/coding-style.md`).
- Output rule: any artefact emitted during dry-run verification goes under `output/` per `.claude/rules/output-versioning.md` — do NOT scatter dump files into the project root or into `tools/scraper/`.

### Implementation Steps
1. Read `tools/scraper/cli.js` and `tools/scraper/scraper.js` end-to-end so you understand the existing argv parser, the `httpRequest()` signature, the verify-POST call site, and how `DUMP_VERIFY` was wired through in 62.1.
2. Extend `tools/scraper/cli.js` to accept a repeatable `--extra-header "Name: Value"` flag. Parse each occurrence into a `{name, value}` pair; reject malformed inputs (no colon, empty name) with a clear error and non-zero exit. Pass the collected list down into the scraper as an option (e.g. on the existing options object — match the existing convention, do not invent a new transport).
3. Plumb the option through `tools/scraper/scraper.js` until it reaches the verify POST call site. Apply the headers ONLY on the `/cap_union_new_verify` request; every other outbound request (prehandle, tdc.js fetch, slide image fetches, getsig, etc.) must be unchanged.
4. Update `httpRequest()` (or its caller, depending on which is cleaner) so the supplied headers are merged into the outgoing request headers map. Existing scraper headers win over user-supplied headers ONLY if the user-supplied name collides with one the scraper sets internally for the verify POST — and in that case, the user-supplied value should take precedence (the whole point is to override what the scraper would otherwise send). Document the precedence in a short code comment at the merge site.
5. If the existing `DUMP_VERIFY` mechanism logs request headers, you are done. If it only logs the body, extend it to also log the outgoing header map so the verification step below is observable.

### Verification
- [ ] `node tools/scraper/cli.js --help` (or equivalent) shows the new `--extra-header` flag with a one-line description.
- [ ] Malformed input (`--extra-header "no-colon-here"`) exits non-zero with a clear error.
- [ ] Run a captcha-only dry-run with `DUMP_VERIFY=output/xff-spoof-smoke ./tools/scraper/cli.js --captcha-only --extra-header "X-Forwarded-For: 203.0.113.42" --extra-header "X-Real-IP: 203.0.113.42"`. Inspect the dumped artefact under `output/xff-spoof-smoke/` and confirm BOTH headers are present in the verify POST's outgoing header set, with the exact values supplied.
- [ ] In the same dump, confirm at least one earlier sub-resource request (e.g. tdc.js fetch) does NOT carry the spoofed headers.
- [ ] `npm test` is still green (no regressions in the existing test suite).

### Suggested Agent
`general-purpose` — straightforward Node CLI + transport change in a familiar file set; no specialised agent needed.
