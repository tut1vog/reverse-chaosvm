# reverse-chaosvm

Minimal toolkit for working with Tencent's ChaosVM (JSVMP) CAPTCHA stack: a no-browser Node scraper and a Puppeteer-driven scraper that take a domain end-to-end against `urlsec.qq.com`, plus a porting pipeline that resolves the per-build parameters of any new register-machine `tdc.js`.

## Stack
- Language / runtime: Node.js ≥18, CommonJS (`'use strict';`, `require()`, `module.exports`).
- Framework: none — Node built-ins (`http`, `https`, `crypto`, `zlib`, `fs`, `child_process`) plus Puppeteer for the browser-driven paths.
- Python: 3.x — only for `tools/puppeteer/slide-solver.py` (OpenCV).
- Key dependencies: `acorn` ^8 (AST parsing — porting pipeline), `puppeteer` ^24 + `puppeteer-extra` ^3 + `puppeteer-extra-plugin-stealth` ^2 (puppeteer scraper, porting-pipeline tracers, dynamic tracers), `jsdom` ^29 + `canvas` ^3 (legacy support — not used by the kept Node scraper path).

## Directory Layout

```
reverse-chaosvm/
├── tools/
│   ├── scraper/                     # pure-Node end-to-end scraper (no DOM, no browser)
│   │   ├── cli.js                   # entry point
│   │   ├── scraper.js               # main flow
│   │   ├── audit-logger.js          # request/token audit log writer
│   │   ├── caplog-beacon.js
│   │   ├── collect-generator.js
│   │   ├── tdc-utils.js
│   │   ├── template-cache.js
│   │   ├── token-generator/         # collect-token primitives (inlined from former tools/token-generator/)
│   │   └── vdata-generator/         # vData primitives (inlined from former tools/vdata-generator/)
│   ├── puppeteer/                   # Puppeteer CAPTCHA solver — logs requests + tokens
│   └── porting-pipeline/            # parse → opcode-map → key-extract → verify
├── research/
│   └── template-pool/
│       └── live-comparison.js       # end-to-end integration example (porting pipeline + puppeteer solver)
├── docs/                            # 15 reference docs — see Documentation Index
├── profiles/                        # browser fingerprint profiles consumed by scraper + token-generator
├── tests/                           # node --test suite
└── README.md
```

Neither the scraper nor the porting pipeline keeps local copies of `tdc.js` — fresh sources are fetched at runtime from `urlsec.qq.com` (or supplied by the caller as an argument). Run artifacts always go to `output/<stem>/` per `.claude/rules/output-versioning.md`.

## Canonical Commands

```bash
# Install
npm install
python3 -m venv .venv && .venv/bin/pip install opencv-python-headless numpy

# Test suite
npm test

# Pure-Node end-to-end scraper (fetches live tdc.js, solves CAPTCHA without Puppeteer)
node tools/scraper/cli.js --captcha-only --verbose
node tools/scraper/cli.js --verbose https://example.com

# Puppeteer scraper — drives a real browser and logs requests + tokens
node tools/puppeteer/cli.js --domain example.com
node tools/puppeteer/cli.js --domain example.com --headful

# Porting pipeline — resolves opcode table + XTEA key for a new tdc.js build
node tools/porting-pipeline/run.js <path-to-tdc.js>
node tools/porting-pipeline/run.js <path-to-tdc.js> --skip-verify

# Standalone collect token generator (library inside scraper)
node tools/scraper/token-generator/cli.js --profile profiles/default.json
node tools/scraper/token-generator/cli.js --profile profiles/default.json --verbose

# Standalone vData generator (library inside scraper)
node tools/scraper/vdata-generator/cli.js --help
```

## Rules (load on demand)

Each rule file is a focused behavioral contract. Read a rule file when its trigger matches your task — do not auto-load.

- `.claude/rules/coding-style.md` — read before writing or editing any JavaScript or Python file.
- `.claude/rules/verify-dont-assume.md` — read before documenting or modifying XTEA parameters, opcode semantics, token segment structure, fingerprint field behavior, or any fact cited from `docs/`.
- `.claude/rules/output-versioning.md` — read before running any pipeline, tracer, or one-off script that writes artifacts to disk.

## Planning Context

For the current work pass — intent, scope, and any active unknowns — see `project-brief.md` when it exists. The repo has no long-running planning artifact; each short-lived project pass writes a brief at the start and deletes it when the pass is done.

---

## Key VM Internals (register-machine reference)

Symbol names differ per build. Identify VM variables by **structural role**, not by name. The porting pipeline (`tools/porting-pipeline/opcode-mapper.js`) relies on this convention.

| Role | Description |
|---|---|
| `bytecode` | Decoded integer array (e.g. `Y[]` in the reference build) |
| `pc` | Program counter |
| `regs` | Register file (r0–r20+) |
| `thisCtx` | Current `this` for method calls |
| `catchStack` | Exception handler address stack |
| `closureVars` | Captured closure variables |

The stack-based `vm-slide` variant — which is the runtime that consumes vData produced by `tools/scraper/vdata-generator/` — has different internals; do not assume these names apply there. See `docs/VM_SLIDE_ARCHITECTURE.md` and `docs/CHAOSVM_VARIANTS.md`.

## Documentation Index

| Doc | Owns |
|---|---|
| `docs/TOKEN_FORMAT.md` | `collect` token spec — encoding layers, XTEA, segment layout |
| `docs/TOKEN_DECRYPTION.md` | How to decrypt a captured token |
| `docs/COLLECTOR_SCHEMA.md` | 59-field browser fingerprint schema |
| `docs/COLLECT_FINGERPRINT_ANALYSIS.md` | `cd` fingerprint field analysis |
| `docs/CRYPTO_ANALYSIS.md` | Modified XTEA key derivation and round constants |
| `docs/VDATA_FORMAT.md` | `vData` byte-level spec — tdc runtime-state probe, pad + ShiftRows + XTEA + custom base64 |
| `docs/EKS_FORMAT.md` | `eks` token — current facts and open questions |
| `docs/CAPTCHA_ORCHESTRATOR.md` | `t_captcha_slide.js` end-to-end flow + verify-body origination |
| `docs/VM_ARCHITECTURE.md` | Register-machine internals, opcode dispatch |
| `docs/OPCODE_REFERENCE.md` | 95 opcodes for the Template A reference, operands and stack effects |
| `docs/VM_SLIDE_ARCHITECTURE.md` | Stack-based ChaosVM internals (vData consumer) |
| `docs/VM_SLIDE_OPCODES.md` | Opcode table for `__TENCENT_CHAOS_STACK` |
| `docs/CHAOSVM_VARIANTS.md` | Register-based vs stack-based ChaosVM comparison |
| `docs/VERSION_DIFFERENCES.md` | Opcode shuffle analysis and porting strategy across templates |
| `docs/HAR_ANALYSIS.md` | Network flow analysis of the CAPTCHA protocol |

All documentation is reference material — verify against live behavior before trusting. See `.claude/rules/verify-dont-assume.md`.

## Durable Facts

**Porting pipeline**
- Automated `parse → opcode-map → key-extract → verify` produces byte-identical `collect` tokens for every register-machine `tdc.js` build observed to date. The 30-build port survey (`output/port-survey/results.md`) auto-ported all 30 captures — 9 unique source hashes — to byte-identical tokens; aggregate per-hash XTEA keys at `output/port-survey/xtea-keys.md`.
- Driven either by `node tools/porting-pipeline/run.js <path>` or by the `/port-version` slash command, which dispatches the `opcode-mapper`, `key-extractor`, and `token-verifier` agents under `.claude/agents/`.

**Templates** (register-machine `tdc.js`) — historical A/B/C classifier

| Template | Example `TDC_NAME` | Opcodes | XTEA key |
|---|---|---|---|
| A | `FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk` | 95 | `6257584F 462A4564 636A5062 6D644140` |
| B | `SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD` | 94 | `6B516842 4D554B69 69655456 452C233E` |
| C | `WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE` | 100 | `5949415A 454D6265 6D686358 6C66525F` |

The A/B/C labels are bookmarks from early reversing; the live distribution is wider. The 30-build port survey observed 9 unique hashes (caseCounts 91, 92, 94, 96, 98, 99, 100, 103); a subsequent 30-run live scraper stress test surfaced a 10th (caseCount 93 — sourceHash `e2170903…`, TDC_NAME `DkPDkCn…`). Only two of the observed hashes fit the classifier buckets (B=94, C=100). The porting pipeline does not branch on the label; see `output/port-survey/xtea-keys.md` for the per-hash key set from the survey and `output/scraper-stress/results.md` for the live stress run.

XTEA delta (`0x9E3779B9`) and round count (32) are constant across every observed build. `STATE_A` key and key-modification constants vary per build and are extracted dynamically by `tools/porting-pipeline/key-extractor.js`. `eks` is server-baked into every `tdc.js` response (line 123) — extract via regex or `TDC.getInfo().info`; see `docs/EKS_FORMAT.md`.

**Scrapers**
- `tools/scraper/` — pure-Node, no Puppeteer, no DOM. Fetches live `tdc.js`, solves the slide CAPTCHA via the Python OpenCV solver, synthesizes `vData` via the inlined `vdata-generator`, and submits to `urlsec.qq.com`.
- `tools/puppeteer/` — drives Chrome via Puppeteer (`puppeteer-extra` + stealth plugin). Used to log real request flows + token contents for verification or to drive the porting-pipeline agents that need a live browser.

**vData pipeline** (consumer is the stack-based `vm-slide` ChaosVM)
- 8-field tdc runtime-state probe → PKCS#7 pad to 112 bytes → ShiftRows permute → XTEA encrypt (32 rounds, classical delta `0x9E3779B9`) → custom 65-char base64 (padding character `Y`, index 64).
- Round-trip fixtures at `tests/fixtures/vdata-{har,jsdom}-capture.json`.
- Three public APIs in `tools/scraper/vdata-generator/`: `encodeVData` (cipher-only), `buildVData` (replay-with-substitution), `buildVDataFromObj` (from-obj synthesis with seeded PRNG).
