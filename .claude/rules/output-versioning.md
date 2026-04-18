# Output versioning

**When to read this**: read before running any pipeline, tracer, or survey script that writes artifacts to disk.

## Rules

- **Every run writes to `output/<stem>/`.** The stem is the logical name of the input (for a `tdc.js` build, the source hash or a caller-supplied label). Never write artifacts to the project root, to a bare `output/` directory, or to a `tmp/` directory.
- **Research-track scripts write to `output/<track>/`** or `output/<track>-<label>/` for per-input subdirs. Pick one scheme per track and stick to it so `git diff output/` between runs is meaningful.
- **Artifact filenames are stable across runs.** The same script against the same input must overwrite the same filenames — not emit a new timestamped set. Stability is what lets `git diff` show what changed between runs. If you need per-run history, commit between runs instead of versioning the filenames.
- **Never commit large binary blobs.** JSON artifacts, disassembly, decompiled source, and structured traces diff well and may be committed as needed. Raw HAR captures, screenshots, video, multi-megabyte traces, and browser profile data stay under `output/` and remain untracked unless one is specifically promoted to `tests/fixtures/` as a regression input.
- **Never write inside `research/<track>/` during a run.** Research directories are source-only (see `.claude/rules/research-artifacts.md`). If a script under `research/` produces output, that output goes to `output/<track>/`, never next to the script.

## Examples

Good:

```bash
node tools/porting-pipeline/run.js /path/to/fresh-tdc.js
# writes to output/<sourcehash>/{opcode-table.json, xtea-params.json, pipeline-config.json, ...}

node research/vm-slide-stack-vm/decoder.js /path/to/vm-slide.js
# writes to output/vm-slide/{bytecode.json, disassembly.txt, ...}
```

Bad:

```bash
# writes to project root
node tools/porting-pipeline/run.js /path/to/tdc.js > opcode-table.json

# writes inside a research directory — pollutes the source tree
node research/vm-slide-stack-vm/decoder.js > research/vm-slide-stack-vm/bytecode.json

# timestamped directory breaks git-based diffing of consecutive runs
node tools/porting-pipeline/run.js /path/to/tdc.js --output output/run-2026-04-18-1453/
```
