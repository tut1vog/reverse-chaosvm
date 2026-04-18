# Verify, don't assume

**When to read this**: read before documenting or modifying anything involving XTEA parameters, opcode semantics, token segment structure, fingerprint field behavior, or any fact cited from `docs/`.

## Rules

- **Verify against live behavior** via dynamic tracing, test execution, or byte-diff comparison before you write the claim down. The project has a history of documentation that was wrong (e.g. "XTEA key LIKELY IDENTICAL across templates" — proven false by dynamic extraction).
- **Existing documentation has known inaccuracies**. Treat every doc as reference material, not ground truth. When a doc disagrees with live behavior, update the doc and note the correction inline.
- **Byte-identical is the only acceptance bar** for token generation. The `collect` token generator and the `vData` builder both have committed round-trip fixtures. Any change to their behavior must keep those fixtures green.
- **New claims need evidence**. A claim in a doc or a comment is not a finding unless it is backed by a committed test, a reproducible script, or a byte-level fixture. "I think" and "this should" do not belong in the repo.
- **Cross-template parameters are unverified until extracted**. The porting pipeline produces one opcode table and one XTEA key per template — do not reuse Template A's numbers on a new build without re-running `tools/porting-pipeline/run.js` and the verifier.

## Examples

Good: updating a doc after a trace

> `docs/CRYPTO_ANALYSIS.md` previously said "STATE_A is identical across templates". Dynamic trace via `tools/porting-pipeline/key-extractor.js` on three templates shows distinct keys (A, B, C — see table in `CLAUDE.md`). Doc updated 2026-04-18; the old claim was assumption-based.

Good: adding a finding backed by a fixture

> `tests/fixtures/vdata-har-capture.json` round-trips byte-identically through `tools/vdata-generator/encode.js`. Documented in `docs/VDATA_FORMAT.md` with a pointer to the fixture and the verifier at `tests/fixtures/verify-vdata-fixtures.js`.

Bad: assertion without evidence

> "The vData pipeline likely uses PKCS#7 padding." — No. Either pad behavior is verified against a live capture (fixture + byte diff), or the claim does not go in the doc.
