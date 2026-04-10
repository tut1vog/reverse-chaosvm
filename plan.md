# Plan

## Status
Current phase: Phase 2 — Claude Code Tooling
Current task: 2.1 — Create agent files (opcode-mapper, key-extractor, token-verifier)

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
| 2.1 | Create agent files (opcode-mapper, key-extractor, token-verifier) | in-progress |
| 2.2 | Create commands (port-version, fetch-latest) and skill (port-opcodes) | pending |

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

**ID**: 2.1
**Title**: Create agent files (opcode-mapper, key-extractor, token-verifier)
**Phase**: Claude Code Tooling
**Status**: in-progress

### Goal
Create 3 specialized agent markdown files that define the behavior of the pipeline's core agents. These agents will be dispatched by the director to perform specific pipeline stages.

### Context
- Agent files go in `.claude/agents/` alongside the existing cc-project-* agents
- Format: YAML frontmatter (`name`, `description`) + system prompt body
- The system prompts must be project-agnostic enough to be reusable but specific enough to be effective
- Key reference files for writing these agents:
  - `docs/OPCODE_REFERENCE.md` — 95 known semantic operations (opcode-mapper needs this)
  - `docs/CRYPTO_ANALYSIS.md` — XTEA analysis (key-extractor needs this)
  - `docs/TOKEN_FORMAT.md` — token structure (token-verifier needs this)
  - `dynamic/crypto-tracer-v3.js` — reference tracer implementation (key-extractor adapts this pattern)
  - `decompiler/disassembler.js` — reference opcode table format (opcode-mapper outputs this format)
  - `token/generate-token.js` — token generation entry point (token-verifier uses this)

### Implementation Steps
1. Create `.claude/agents/opcode-mapper.md` — agent that parses `__TENCENT_CHAOS_VM` switch/case handlers, identifies VM variables by structural role, normalizes handlers, and pattern-matches to known semantic operations. Outputs opcode table as JSON.
2. Create `.claude/agents/key-extractor.md` — agent that uses Puppeteer to dynamically trace the XTEA key schedule. Extracts STATE_A (4×uint32), delta, round count, and key modification constants.
3. Create `.claude/agents/token-verifier.md` — agent that captures a live token via Puppeteer, generates a standalone token using extracted config, and performs byte-by-byte comparison with detailed diagnostics.

### Verification
- [ ] `.claude/agents/opcode-mapper.md` exists with valid YAML frontmatter and mentions structural role identification, pattern matching, JSON output
- [ ] `.claude/agents/key-extractor.md` exists with valid YAML frontmatter and mentions Puppeteer, XTEA, STATE_A, dynamic tracing
- [ ] `.claude/agents/token-verifier.md` exists with valid YAML frontmatter and mentions byte comparison, live capture, diagnostics
- [ ] All 3 files have `name` and `description` in frontmatter
- [ ] No agent overwrites the existing cc-project-* files

### Suggested Agent
general-purpose — writing agent definition markdown files
