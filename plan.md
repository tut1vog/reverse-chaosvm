# Plan

## Status
Current phase: Phase 1 — Project Foundation
Current task: 1.2 — Rewrite CLAUDE.md, create rules, create settings.json

---

## Phases

### Phase 1: Project Foundation
> Set up fresh git repo, rewrite CLAUDE.md, create rules/settings — clean slate for all future work.

| ID | Task | Status |
|----|------|--------|
| 1.1 | Fresh git init and initial commit | done |
| 1.2 | Rewrite CLAUDE.md, create rules, create settings.json | in-progress |

### Phase 2: Claude Code Tooling
> Create the agent, command, and skill markdown files that define specialized behaviors for the pipeline.

| ID | Task | Status |
|----|------|--------|
| 2.1 | Create agent files (opcode-mapper, key-extractor, token-verifier) | pending |
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

**ID**: 1.2
**Title**: Rewrite CLAUDE.md, create rules, create settings.json
**Phase**: Project Foundation
**Status**: in-progress

### Goal
Replace the outdated CLAUDE.md with a clean version reflecting the new automated porting pipeline direction. Create the three rule files and settings.json specified in the project brief.

### Context
- Current `CLAUDE.md` references deleted slash commands (`/port-new-version`, `/trace-token`) and agents that don't exist. The good parts to keep: architecture sections (VM internals mapping table, pipeline descriptions, project structure), code conventions, known issues, documentation table.
- Project brief specifies exactly 3 rules: `targets-readonly.md`, `verify-dont-assume.md`, `coding-style.md`
- Project brief specifies settings.json with tool permissions and ESLint hook config
- ESLint is NOT yet installed — the hook config should be written but it will only activate after ESLint is added (a future concern; don't block on it)
- The cc-project-* agents in `.claude/agents/` should be preserved (they're the meta-project management agents)
- Files to create/modify:
  - `CLAUDE.md` — full rewrite
  - `.claude/rules/targets-readonly.md`
  - `.claude/rules/verify-dont-assume.md`
  - `.claude/rules/coding-style.md`
  - `.claude/settings.json`

### Implementation Steps
1. Read current `CLAUDE.md` to identify sections to preserve vs rewrite
2. Write new `CLAUDE.md`: remove references to deleted commands/agents, update version status, add automated pipeline as primary workflow, keep VM internals table and architecture sections, mark docs as "reference — verify before trusting"
3. Create `.claude/rules/targets-readonly.md` — never modify `targets/*.js`
4. Create `.claude/rules/verify-dont-assume.md` — verify crypto/token/opcode behavior against live tracing, don't trust docs
5. Create `.claude/rules/coding-style.md` — 2-space indent, single quotes, semicolons, const/let, CommonJS
6. Create `.claude/settings.json` — tool permissions per the Director Permissions table in project-brief.md

### Verification
- [ ] `CLAUDE.md` does not reference `/port-new-version`, `/trace-token`, or any non-existent commands/agents
- [ ] `CLAUDE.md` contains the VM internals mapping table, code conventions, and documentation table
- [ ] `CLAUDE.md` version status table is accurate (matches project-brief.md)
- [ ] `.claude/rules/targets-readonly.md` exists and mentions `targets/*.js`
- [ ] `.claude/rules/verify-dont-assume.md` exists and mentions live verification
- [ ] `.claude/rules/coding-style.md` exists and mentions 2-space indent, single quotes, semicolons
- [ ] `.claude/settings.json` is valid JSON and contains permission entries
- [ ] No references to deleted agents/commands anywhere in the new files

### Suggested Agent
general-purpose — documentation and config writing, no specialized knowledge needed
