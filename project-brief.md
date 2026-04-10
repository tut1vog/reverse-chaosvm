# Project Brief

## Project Overview

**reverse-chaosvm** reverse-engineers Tencent's ChaosVM (JSVMP) — a bytecode virtual machine used for browser fingerprinting and bot detection. The project's primary goal is **automated token generation for any version of tdc.js** that Tencent serves. A solo developer project with no team coordination needs.

The existing codebase has a working decompiler pipeline and byte-identical token generator for one reference build (`targets/tdc.js`). The rewrite transforms this into a fully automated pipeline where a single command takes any new `tdc-vN.js` and produces a working token generator — no human in the loop.

**Critical operating principle**: The agent must be skeptical of existing scripts and documentation. Although the token generator currently produces correct output for tdc.js, there may be bugs in the code and inaccuracies in the docs. The agent must **verify against live behavior** rather than trust documentation at face value. For example, `docs/VERSION_DIFFERENCES.md` stated the XTEA key was "LIKELY IDENTICAL" across templates, but dynamic tracing proved the key **differs** between Template A and Template B.

## Current State

### Stack
- **Runtime**: Node.js (CommonJS — `'use strict'`, `require()`/`module.exports`)
- **Dependencies**: acorn (AST parsing), canvas, puppeteer + stealth plugin
- **Python**: Only for `puppeteer/slide-solver.py` (OpenCV Canny + NCC)
- **No linter, no CI, no settings.json currently configured**

### Project Structure
```
targets/              Read-only tdc builds (5 files: tdc.js, tdc-v2 through v5)
decompiler/           12-step decompile pipeline (14 files including run.js)
token/                Standalone token generator (6 files)
puppeteer/            CAPTCHA solver (6 files)
dynamic/              Runtime tracers (10 files)
output/               Decompiler artifacts for reference build + partial tdc-v2
profiles/             Browser fingerprint profiles
tests/                Test suite (14 files, 11/13 passing)
docs/                 Technical reference (12 files)
sample/               Reference files (HAR capture, bot.py)
```

### Existing Claude Code Setup
Completely gutted. All prior agents, commands, rules, and skills have been deleted from the working tree. Empty directories remain at `.claude/agents/`, `.claude/commands/`, `.claude/rules/`, `.claude/skills/`. There is a stale nested `.claude/agents/agents/` directory that should be removed. The `CLAUDE.md` exists but references deleted commands and contains outdated version status. No `.claude/settings.json` exists.

### Git State
A `.git/` directory exists with history from the old project, but the user wants it **wiped and replaced with a fresh `git init`**. A stale `plan.md` exists at project root — remove it and replace with the director's own plan.

### What Works Today
- `decompiler/decoder.js` — universal bytecode decoder (base64 -> varint/zigzag -> integer array), works on all tdc versions
- Full decompiler pipeline for `targets/tdc.js` (reference build only)
- `token/` pipeline — byte-identical token generation for tdc.js (Template A)
- CAPTCHA solver via Puppeteer + OpenCV
- Dynamic crypto tracers in `dynamic/` (Puppeteer-based instrumentation)

### What Doesn't Work
- No automated opcode mapping for new templates
- No automated XTEA key extraction for new templates
- No pipeline to go from "new tdc file" to "working token generator" without extensive manual work
- tdc-v2 through tdc-v5 have no opcode tables mapped and no working token generation
- The previous attempt at tdc-v2 stalled at opcode mapping (Phase 3 of old plan.md)

## Constraints

- **Language**: Node.js CommonJS exclusively (Python only for slide-solver.py)
- **Dependencies**: Minimize — prefer Node.js built-ins. New npm packages require user confirmation.
- **Solo project**: No team workflow, no CI, no deployment infrastructure
- **targets/*.js are READ-ONLY**: These are Tencent's property. Never modify them.
- **Puppeteer availability**: Puppeteer is installed. If headless Chrome fails to launch, ask the user to install required system dependencies.
- **No budget/compliance constraints**

## Scope

**Stable** (keep, may refactor):
- `decompiler/decoder.js` — universal decoder, works on all builds
- `token/` pipeline structure — crypto-core, outer-pipeline, collector-schema, generate-token
- `puppeteer/` CAPTCHA solver
- `dynamic/` tracers (especially crypto-tracer variants)
- `docs/` — valuable reference but must be treated as potentially inaccurate
- `tests/` — existing test suite

**Primary goal — build the automated porting pipeline**:
- Single command takes any `tdc-vN.js` and produces a working token generator config
- Pipeline stages: decode -> opcode auto-map -> XTEA key extract (via Puppeteer) -> token verify
- Each stage should be independently runnable and testable
- Output: per-version config (opcode table + crypto parameters) that the token pipeline can consume

**Secondary goal — fetch fresh builds**:
- Command to fetch new tdc.js versions from Tencent's endpoint and save to `targets/`

**Out of scope**:
- Full decompilation of every version (nice-to-have, not required)
- Deployment as a service
- Team collaboration features
- License

## Technical Direction

### Automated Porting Pipeline Architecture

The pipeline must handle these steps for any new `tdc-vN.js`:

1. **Decode bytecode** — `decoder.js` works universally, no changes needed
2. **Identify VM variables by structural role** — parse the `__TENCENT_CHAOS_VM` function, find registers/PC/bytecode/exception-stack by pattern (not by variable name, since names are minified differently per build)
3. **Auto-map opcodes** — extract each `case N:` handler, normalize variable names to canonical roles, pattern-match against known semantic operations from `docs/OPCODE_REFERENCE.md`. The case handler code is structurally identical across builds (same JS expression pattern), just with different variable names and case numbers.
4. **Extract XTEA key** — dynamic tracing via Puppeteer. The key (`STATE_A`, 4 x uint32) differs between templates. Also extract: delta (expect `0x9E3779B9`), round count (expect 32), key modification constants (may differ from +2368517/+592130).
5. **Verify token** — capture a live token from the tdc build via Puppeteer, generate a standalone token using extracted parameters, byte-compare.

### Key Technical References (treat as guidance, verify against live behavior)
- `docs/OPCODE_REFERENCE.md` — 95 known semantic operations with handler patterns
- `docs/VERSION_DIFFERENCES.md` — what changes vs what stays the same between builds (porting strategy section is valuable)
- `docs/CRYPTO_ANALYSIS.md` — Modified XTEA analysis
- `docs/TOKEN_FORMAT.md` — token structure (4 segments)
- `docs/COLLECTOR_SCHEMA.md` — 59-field fingerprint schema
- `decompiler/disassembler.js` — reference opcode table for Template A (lines 27-80+)

### Version Status (from prior investigation)
| Target | Template | Decoded | Opcode table | XTEA key | Token verified |
|--------|----------|---------|--------------|----------|----------------|
| tdc.js | A | yes | yes (95 opcodes) | yes | yes (byte-identical) |
| tdc-v2.js | B (different) | yes | NOT mapped | DIFFERS from A | no |
| tdc-v3.js | A (same as tdc.js) | yes | reuse tdc.js table | reuse tdc.js key | untested |
| tdc-v4.js | unknown | yes | NOT mapped | unknown | no |
| tdc-v5.js | unknown | yes | NOT mapped | unknown | no |

### Testing Strategy
- Node.js built-in test runner (`node --test`)
- Each pipeline stage should have its own test file
- Verification against live Tencent tokens is the ultimate acceptance test

## Collaboration

Solo developer. No branching strategy, no code review, no CI. The director manages the plan and dispatches work to subagents.

## Standards

### Linting & Formatting (TO BE SET UP)
- ESLint + Prettier for all JavaScript
- 2-space indentation, single quotes, semicolons required
- `const`/`let` over `var`
- CommonJS (`require`/`module.exports`)

### Code Conventions
- Minimize external dependencies — prefer Node.js built-ins
- Disassembly format: `[PC]  MNEMONIC  r<dst>, r<src1>, r<src2>    ; comment`
- Decompiled variable names: camelCase; `v0`, `v1`... when context unclear
- Output directories: versioned — `output/<target-stem>/`

### Commit Style
- Short descriptive messages
- No enforced conventional commit format

## Claude Code Setup

### CLAUDE.md
Full rewrite. Must reflect the new project direction:
- Primary workflow is the automated porting pipeline
- Remove all references to deleted commands/agents
- Update version status and project memory
- Document the new command/agent/skill structure
- Keep the valuable architecture sections (VM internals, key mapping table) but mark docs as "reference, verify before trusting"

### Rules (`.claude/rules/`)
1. **`targets-readonly.md`** — Never modify any file in `targets/`. These are Tencent's property and read-only analysis targets.
2. **`verify-dont-assume.md`** — When working with crypto parameters, token structure, opcode semantics, or any behavior documented in `docs/`: verify against live behavior via dynamic tracing or testing. Do not assume documentation is correct. Document any discrepancies found.
3. **`coding-style.md`** — 2-space indent, single quotes, semicolons, `const`/`let`, CommonJS modules. Follow ESLint/Prettier config. Minimize external dependencies.

### Commands (`.claude/commands/`)
1. **`port-version.md`** — Primary command. Takes a tdc file path as argument. Runs the full automated pipeline: decode bytecode -> auto-map opcodes -> extract XTEA key via Puppeteer -> generate token -> verify against live capture. Outputs a per-version config file with opcode table and crypto parameters. Should report progress at each stage and halt with diagnostics if any stage fails.
2. **`fetch-latest.md`** — Fetch fresh tdc.js builds from Tencent's CAPTCHA endpoint. Save to `targets/` with appropriate naming. Report which template each build matches (if recognizable) or flag as new template.

### Agents (`.claude/agents/`)
1. **`opcode-mapper.md`** — Specialized agent for parsing `__TENCENT_CHAOS_VM` switch/case handlers. Identifies VM variables by structural role (not by name). Normalizes each case handler and pattern-matches against known semantic operations. Outputs opcode table as JSON. Must handle variable opcode counts (94-100 observed) and compound/fused opcodes.
2. **`key-extractor.md`** — Dynamic tracing agent using Puppeteer. Instruments the tdc.js VM to capture XTEA key schedule: STATE_A (4 x uint32), delta, round count, key modification constants. Uses the crypto tracer approach from `dynamic/crypto-tracer*.js` as reference but must adapt to each template's variable names and opcode numbering.
3. **`token-verifier.md`** — Captures a live token from a tdc build via Puppeteer, generates a standalone token using the extracted config (opcode table + crypto parameters), and performs byte-by-byte comparison. Reports match/mismatch with detailed diagnostics showing which segment diverges.

### Skills (`.claude/skills/`)
1. **`port-opcodes.md`** — Detailed step-by-step instructions for the opcode mapping process. Can be invoked by the opcode-mapper agent or run manually. Includes the pattern-matching reference table and handling for ambiguous/compound opcodes.

### Hooks
- Auto-lint: Run ESLint `--fix` on staged `.js` files before commits

### Settings (`.claude/settings.json`)
- Tool permissions aligned with the director permissions table below
- ESLint hook configuration

## Director Permissions

The following permissions govern what the director and its subagents may do autonomously versus what requires user confirmation.

| Category | Policy | Details |
|---|---|---|
| Bash — allowed | Freely | `node`, `npm install`, `npm test`, `npm run *`, `npx eslint`, `npx prettier`, `python3`, `pip install`, `ls`, `mkdir`, `cat`, `head`, `tail`, `wc`, `diff`, `git` (all git commands after fresh init) |
| Bash — denied | Never | `rm -rf` (except initial `.git/` wipe for fresh repo setup), `sudo`, `docker`, `curl` to arbitrary endpoints |
| File creation | Freely | Create/modify files anywhere in the project except protected paths |
| Protected paths | Never modify | `targets/*.js` (read-only analysis targets), `node_modules/` (npm-managed) |
| Git commits | Auto | Wipe existing `.git/` and `git init` fresh repo as first task. Auto-commit plan files: yes. Create branches: yes. Push: no (user does manually). |
| Network access | Allowed | WebSearch/WebFetch for dependency docs and version checks. Puppeteer to Tencent endpoints for token capture and verification. |
| Package management | Confirm first | Any `npm install <new-package>`, `npm update`, `npm remove` requires user confirmation before execution. |
| Always confirm | Must ask | Deleting source files (output artifacts can be regenerated freely). Any `git push`. Adding new npm dependencies. Modifying `package.json` scripts section. |

Any operation not explicitly listed here requires user confirmation before execution.

## Known Unknowns

1. **How many distinct VM templates does Tencent serve?** Observed 2 (Template A and B) across 5 builds, but pool size is unknown (estimated 2-10).
2. **Does the collector field count (currently 59) vary between templates?** Unverified — must check dynamically.
3. **Does the token assembly order vary?** One report suggested `btoa[1]+btoa[2]+btoa[0]+btoa[3]` vs the confirmed `btoa[1]+btoa[0]+btoa[2]+btoa[3]`. May be a documentation error or a real difference.
4. **Are compound/fused opcodes stable across templates?** Template A has 95 opcodes, Template B has 94. Some may be split or merged differently.
5. **Existing code quality** — the user explicitly warns that current scripts may have bugs and docs may have inaccuracies despite producing correct output for tdc.js. The agent pipeline must verify everything against live behavior.
6. **Puppeteer system dependencies** — headless Chrome may need system packages installed. If Puppeteer fails to launch, ask the user to install dependencies.
7. **What key modification constants does each template use?** Only verified for Template A (+2368517, +592130). Template B's constants are unknown.
