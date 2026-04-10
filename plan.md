# Plan

## Status
Current phase: Phase 2 — Claude Code Tooling
Current task: 2.2 — Create commands (port-version, fetch-latest) and skill (port-opcodes)

---

## Phases

### Phase 1: Project Foundation
> Set up fresh git repo, rewrite CLAUDE.md, create rules/settings — clean slate for all future work.

| ID | Task | Status |
|----|------|--------|
| 1.1 | Fresh git init and initial commit | done |
| 1.2 | Rewrite CLAUDE.md, create rules, create settings.json | done |

### Phase 2: Claude Code Tooling
> Create the agent, command, and skill markdown files that define specialized behaviors for the pipeline.

| ID | Task | Status |
|----|------|--------|
| 2.1 | Create agent files (opcode-mapper, key-extractor, token-verifier) | done |
| 2.2 | Create commands (port-version, fetch-latest) and skill (port-opcodes) | in-progress |

### Phase 3: VM Parser & Opcode Auto-Mapper
> Build modules to parse any tdc build's VM function, identify variables by structural role, and auto-map opcodes to known semantic operations.

| ID | Task | Status |
|----|------|--------|
| 3.1 | Implement VM variable identifier module | pending |
| 3.2 | Implement opcode auto-mapper module | pending |
| 3.3 | Tests for VM parser and opcode mapper (validate against tdc.js reference table) | pending |

### Phase 4: XTEA Key Extractor
> Build Puppeteer-based dynamic tracing to extract XTEA key schedule from any tdc build.

| ID | Task | Status |
|----|------|--------|
| 4.1 | Implement dynamic key extraction module | pending |
| 4.2 | Tests for key extractor (validate against tdc.js known key) | pending |

### Phase 5: Token Verifier & Pipeline Orchestrator
> Build the token comparison module and the single-command orchestrator that chains all stages.

| ID | Task | Status |
|----|------|--------|
| 5.1 | Implement token verifier module (capture live, generate standalone, byte-compare) | pending |
| 5.2 | Implement pipeline orchestrator (decode → map → extract → verify) | pending |
| 5.3 | Tests for verifier and orchestrator | pending |

### Phase 6: Multi-Version Validation
> Run the automated pipeline against all tdc builds, fix issues, document findings.

| ID | Task | Status |
|----|------|--------|
| 6.1 | Port tdc-v3 (Template A — same as tdc.js, sanity check) | pending |
| 6.2 | Port tdc-v2 (Template B — different opcodes and XTEA key) | pending |
| 6.3 | Port tdc-v4 and tdc-v5 (unknown templates) | pending |
| 6.4 | Update documentation with all findings | pending |

---

## Current Task

**ID**: 2.2
**Title**: Create commands (port-version, fetch-latest) and skill (port-opcodes)
**Phase**: Claude Code Tooling
**Status**: in-progress

### Goal
Create the 2 command files and 1 skill file specified in the project brief. These provide user-facing entry points for the automated pipeline and manual opcode porting workflow.

### Context
- Commands go in `.claude/commands/` (currently empty directory)
- Skills go in `.claude/skills/` (currently empty directory)
- Commands are invoked as slash commands (e.g., `/port-version targets/tdc-v4.js`)
- The skill provides detailed step-by-step instructions for manual opcode mapping
- Key references:
  - `project-brief.md` sections on Commands and Skills — specifies what each should do
  - `.claude/agents/opcode-mapper.md` — the agent that port-version will dispatch for opcode mapping
  - `.claude/agents/key-extractor.md` — the agent port-version dispatches for key extraction
  - `.claude/agents/token-verifier.md` — the agent port-version dispatches for verification
  - `docs/OPCODE_REFERENCE.md` — the pattern-matching reference table that port-opcodes skill needs
  - `decompiler/disassembler.js` lines 27-123 — reference opcode table format

### Implementation Steps
1. Create `.claude/commands/port-version.md` — primary command that takes a tdc file path as argument, runs full automated pipeline: decode → opcode auto-map → XTEA key extract → token verify. Reports progress at each stage, halts with diagnostics on failure.
2. Create `.claude/commands/fetch-latest.md` — fetches fresh tdc.js builds from Tencent's CAPTCHA endpoint, saves to `targets/` with appropriate naming, reports which template each build matches.
3. Create `.claude/skills/port-opcodes.md` — detailed step-by-step instructions for manual opcode mapping process, including the pattern-matching reference table and handling for ambiguous/compound opcodes.

### Verification
- [ ] `.claude/commands/port-version.md` exists and describes the full pipeline stages (decode, opcode map, key extract, verify)
- [ ] `.claude/commands/fetch-latest.md` exists and describes fetching from Tencent endpoint
- [ ] `.claude/skills/port-opcodes.md` exists and contains pattern-matching reference table for opcode identification
- [ ] All files are valid markdown
- [ ] No existing files modified

### Suggested Agent
general-purpose — writing command and skill definition markdown files
