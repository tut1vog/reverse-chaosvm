# Research artifact discipline

**When to read this**: read before creating files under `research/` or writing new docs under `docs/` tied to a research track.

## Rules

- **One directory per question.** Each research track lives under `research/<track>/` with a single purpose. Do not mix unrelated investigations in one directory. Current tracks: `tdc-register-vm/`, `vm-slide-stack-vm/`, `captcha-orchestrator/`, `eks-payload/`, `template-pool/`, `key-mod/`. Create a new track directory for a new open question — do not piggyback it inside an existing track.
- **Every track has a `README.md`.** At minimum: the open question this track exists to answer, current status (open / partial / closed), inputs (which `targets/` or `sample/` files it reads), and how to reproduce the latest run from the command line.
- **Every finding is either a doc update or a reproducible script.** A claim that is neither is not a finding. If an analysis is worth recording, produce one of:
  - a file under `docs/` (new file or edit to an existing one), with the track's `README.md` linking to it, or
  - a committed script under `research/<track>/` whose output reproduces the claim when re-run.
- **No claims without a dynamic trace, test, or verifiable artifact.** This is the project-wide `verify-dont-assume` rule applied to research output: before you write "vm-slide uses 36 opcodes" in a doc, point to the trace, script, or test that produced that number. See `.claude/rules/verify-dont-assume.md`.
- **Artifacts go under `output/<track>/` or `output/<target-stem>/`.** Never commit large raw output files under `research/<track>/` — keep research directories source-only. See `.claude/rules/output-versioning.md`.
- **Dead ends are archived, not deleted.** When a script or approach is abandoned, move it to `research/<track>/dead-ends/` with a one-paragraph note in the track `README.md` explaining why. This preserves context for future attempts and keeps the top of each track directory focused on what currently works.
- **Stable tools stay in `tools/`.** If a research script matures into something the scraper or decompiler path depends on, promote it out of `research/` into the appropriate `tools/<tool>/` subdirectory as a separate commit. Do not leave production dependencies inside a research track.
- **Protected paths still apply.** `targets/`, `sample/`, and the directories listed in `project-brief.md` under "Protected paths" are read-only during research too. Import from them freely; never modify them.

## Examples

**Good track layout** — `research/vm-slide-stack-vm/`:
```
research/vm-slide-stack-vm/
├── README.md               # open question, status, how to reproduce
├── decoder.js              # stack-VM bytecode decoder
├── disassembler.js         # stack-VM text disassembly
├── opcode-notes.md         # working notes, feeds docs/VM_SLIDE_OPCODES.md
├── traces/                 # small committed traces; large traces go under output/
└── dead-ends/
    └── register-machine-port.js  # failed first attempt, one-line note in README
```

**Good finding** — "vm-slide has 36 opcodes":
- `research/vm-slide-stack-vm/decoder.js` produces a histogram of opcode bytes.
- `tests/test-vm-slide-decoder.js` asserts the count on a committed input.
- `docs/VM_SLIDE_OPCODES.md` cites the test and the input file.

**Bad finding** — "vm-slide has 36 opcodes":
- A sentence in `docs/VM_SLIDE_OPCODES.md` with no referenced script, test, or trace. Reject; this is an assumption, not a finding.

**Good dead-end archive**:
```
research/eks-payload/dead-ends/xor-key-sweep.js
# + one paragraph in research/eks-payload/README.md:
#   "xor-key-sweep.js brute-forced single-byte XOR keys against 10 eks payloads
#    and found no repeating structure. Abandoned 2026-04-13 — eks is not a
#    plain XOR stream."
```
