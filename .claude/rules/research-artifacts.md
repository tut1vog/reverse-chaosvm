# Research artifact discipline

**When to read this**: read before creating files under `research/` or writing new docs under `docs/` tied to a research track.

## Rules

- **One directory per open question.** Each research track lives under `research/<track>/` with a single purpose. Do not mix unrelated investigations in one directory. Current tracks: `tdc-register-vm/`, `vm-slide-stack-vm/`, `captcha-orchestrator/`, `template-pool/`. Create a new track directory for a new open question — do not piggyback inside an existing track.
- **Every track has a `README.md`.** At minimum: the open question the track exists to answer, current status (open / partial / closed), what inputs the scripts expect (and from where — scraped at runtime, passed as an argument, etc.), and how to reproduce the latest finding from the command line.
- **Every finding is either a doc update or a reproducible script.** A claim that is neither is not a finding. If an analysis is worth recording, produce one of:
  - a file under `docs/` (new or edit), with the track's `README.md` linking to it, or
  - a committed script under `research/<track>/` whose output reproduces the claim when re-run against a supplied input.
- **No claims without a dynamic trace, test, or verifiable artifact.** This is the project-wide `verify-dont-assume` rule applied to research output: before you write "vm-slide uses N opcodes" in a doc, point to the trace, script, or fixture that produced N. See `.claude/rules/verify-dont-assume.md`.
- **Artifacts go under `output/<track>/`.** Never commit large raw output files under `research/<track>/` — keep research directories source-only. See `.claude/rules/output-versioning.md`.
- **Dead ends are archived, not deleted.** When a script or approach is abandoned, move it to `research/<track>/dead-ends/` with a one-paragraph note in the track `README.md` explaining why. This preserves context for future attempts and keeps the top of each track focused on what currently works.
- **Stable tools are promoted to `tools/`.** If a research script matures into something the scraper, porting pipeline, or token generator depends on, promote it out of `research/` into the appropriate `tools/<tool>/` subdirectory as a separate commit. Production dependencies never live inside a research track.

## Examples

Good track layout — `research/vm-slide-stack-vm/`:

```
research/vm-slide-stack-vm/
├── README.md                    # open question, status, how to reproduce
├── decoder.js                   # stack-VM bytecode decoder
├── disassembler.js              # text disassembly
├── plaintext-callgraph.md       # working notes, feeds docs/VDATA_FORMAT.md
└── dead-ends/
    └── register-machine-port.js  # failed first attempt, explained in README
```

Good finding — "vm-slide has 53 non-null opcode handlers":

- `research/vm-slide-stack-vm/decoder.js` produces a histogram of opcode bytes when run against a supplied `vm-slide` source.
- `tests/test-vm-slide-decoder.js` asserts the count on a committed fixture.
- `docs/VM_SLIDE_OPCODES.md` cites the test and the fixture path.

Bad finding — "vm-slide has 53 non-null opcode handlers" as a sentence in `docs/VM_SLIDE_OPCODES.md` with no script, test, or fixture cited. Reject — that is an assertion, not a finding.
