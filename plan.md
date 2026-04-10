# Plan

## Status
Current phase: Phase 1 — Project Foundation
Current task: 1.1 — Fresh git init and initial commit

---

## Phases

### Phase 1: Project Foundation
> Set up fresh git repo, rewrite CLAUDE.md, create rules/settings — clean slate for all future work.

| ID | Task | Status |
|----|------|--------|
| 1.1 | Fresh git init and initial commit | in-progress |
| 1.2 | Rewrite CLAUDE.md, create rules, create settings.json | pending |

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

**ID**: 1.1
**Title**: Fresh git init and initial commit
**Phase**: Project Foundation
**Status**: in-progress

### Goal
Replace the broken `.git/` directory with a fresh git repository and commit the entire existing codebase as the baseline. This is the foundation for all future work.

### Context
- `.git/` exists as an empty directory (no valid repo) — just `rmdir` and `git init`
- `.gitignore` already exists with sensible entries: `node_modules/`, `.venv/`, `output/dynamic/session-*.json`, `*.pyc`, `__pycache__/`
- Need to add `history/` and plan files to `.gitignore` exclusions — actually no, plan.md and history/ should be tracked in git
- The stale `plan.md` will be overwritten by this plan before the commit
- `project-brief.md` should be committed
- `output/` directory has decompiler artifacts — these should probably be committed as reference
- `node_modules/` and `.venv/` are already gitignored

### Implementation Steps
1. Remove the empty `.git/` directory: `rmdir .git`
2. Run `git init` and `git checkout -b main`
3. Review `.gitignore` — add any missing entries (e.g., `.claude/settings.local.json` if needed)
4. `git add -A` then review what's staged with `git status`
5. Create initial commit: `chore: initial commit — existing codebase baseline`

### Verification
- [ ] `git log --oneline -1` shows the initial commit
- [ ] `git status` is clean (no untracked files that should be tracked)
- [ ] `git branch` shows `main` as the only branch
- [ ] No `node_modules/`, `.venv/`, or `*.pyc` files in the commit: `git ls-files | grep -E 'node_modules|\.venv|\.pyc'` returns empty

### Suggested Agent
general-purpose — straightforward git setup, no specialized knowledge needed
