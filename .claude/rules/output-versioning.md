# Output versioning

**When to read this**: read before running any pipeline, tracer, or survey script that writes artifacts to disk.

## Rules

- **Every pipeline or tracer run writes to `output/<target-stem>/`.** The target stem is the basename of the input file with the extension dropped: `targets/tdc-v2.js` → `output/tdc-v2/`. Never write artifacts to the project root, a bare `output/` directory, or a `tmp/` directory.
- **Research-track artifacts go under `output/<track>/` or `output/<track>-<target-stem>/`.** A research survey that runs against many inputs may use a subdirectory per input: `output/tdc-survey/<hash>.js` + `output/tdc-survey-<hash>/...` for per-input pipeline output. Whatever scheme you pick, keep it consistent across the track.
- **Artifact filenames are stable across runs.** The same pipeline run against the same input must overwrite the same filenames, not produce a timestamped new set. This is what lets `git diff output/` show what changed between runs.
- **Never commit large binary blobs.** The full decompiled JS, disassembly listings, and JSON artifacts are fine (they diff well). Raw HAR captures, screenshots, video, and multi-megabyte traces go under `output/` but should stay untracked unless they are needed as test fixtures.
- **Never write inside `research/<track>/` during a run.** Research directories are source-only (see `.claude/rules/research-artifacts.md`). If a script under `research/` produces output, that output goes under `output/`, not next to the script.
- **Respect `targets/` and `sample/`.** These are read-only. A pipeline that writes back to its input directory is a bug.

## Examples

**Good**:
```bash
node tools/porting-pipeline/run.js targets/tdc-v2.js
# writes to output/tdc-v2/{opcode-table.json, xtea-params.json, ...}

node research/vm-slide-stack-vm/decode.js sample/vm_slide.js
# writes to output/vm-slide/{bytecode.json, disasm.txt, ...}

node research/template-pool/survey.js
# writes to output/tdc-survey/<hash>.js and output/tdc-survey-<hash>/...
```

**Bad**:
```bash
node tools/porting-pipeline/run.js targets/tdc-v2.js > opcode-table.json
# writes to project root — wrong

node research/vm-slide-stack-vm/decode.js > research/vm-slide-stack-vm/bytecode.json
# writes inside a research directory — wrong, pollutes source tree

node tools/porting-pipeline/run.js targets/tdc-v2.js --output output/run-2026-04-12-1453/
# timestamped directory — wrong, breaks git-based diffing of runs
```
