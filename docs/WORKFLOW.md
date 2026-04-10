# Decompilation Workflow

## Phase Overview

```
Phase 1: Bytecode Extraction & Disassembly       ✅
Phase 2: Control Flow Analysis                    ✅
Phase 3: Expression Reconstruction                ✅
Phase 4: Decompilation & Output                   ✅
Phase 5: Validation & Polish                      ✅
Phase 6: Token Pipeline Tracing                   ✅
Phase 7: Standalone Token Generator               ✅
Phase 8: End-to-End Token Verification            ✅
Phase 9: Universal jsdom Token Generator          ✅
Phase 10: Headless CAPTCHA Solver Bot              ✅ (conditional)
```

---

## Phase 1: Bytecode Extraction & Disassembly

**Goal**: Extract the raw bytecode and produce a readable disassembly listing.

### Task 1.1: Bytecode Decoder
- Reimplement the base64 → varint/zigzag decode pipeline in a standalone Node.js module
- Input: the base64 string from line 123 and the main bytecode from line 586
- Output: flat integer array `Y[]`
- Verify by running original decoder from `tdc.js` as ground truth

### Task 1.2: Disassembler
- Build a disassembler that walks `Y[]` and prints one instruction per line
- Each line: `[PC] MNEMONIC operands ; comment`
- Must handle all 95 opcodes with correct operand counts (see OPCODE_REFERENCE.md)
- Output to `output/disasm.txt`

### Task 1.3: String Extraction
- Identify all string-building sequences (opcodes 31, 67, 19, 54, 64, 65, 72, 76, 93)
- Track string register state across consecutive opcodes
- Extract reconstructed string literals with their PC locations
- Output to `output/strings.txt`

### Task 1.4: Function Boundary Detection
- Identify closure creation opcodes (12, 23, 55) and their target offsets
- Build a function table: `{id, start_pc, parent_pc, captured_vars, arity}`
- Output to `output/functions.json`

---

## Phase 2: Control Flow Analysis

**Goal**: Recover the control flow graph (CFG) from the flat bytecode.

### Task 2.1: Basic Block Construction
- Split bytecode into basic blocks at:
  - Jump targets (opcode 38 destinations, opcode 87 branches)
  - Exception handler entries (opcode 91/33 push targets)
  - Function entry points
- Output: basic blocks with entry/exit edges

### Task 2.2: Control Flow Pattern Recognition
- Identify structured patterns:
  - **if/else**: opcode 87 (CJMP) → two branches → merge point
  - **while/for**: back-edge to earlier block
  - **try/catch**: opcode 91/33 (push handler) → 74 (pop) → 42 (load exception)
  - **for-in**: opcode 62 (ENUMERATE) → 84 (ITER_SHIFT) loop
- Tag each pattern in the CFG

### Task 2.3: Exception Handler Mapping
- Map try/catch/finally regions from `F[]` stack operations
- Pair CATCH_PUSH/TRY_PUSH with TRY_POP and LOAD_EXCEPTION
- Build a try-catch nesting tree

---

## Phase 3: Expression Reconstruction

**Goal**: Convert register-based operations into expression trees.

### Task 3.1: Data Flow Analysis
- For each basic block, build def-use chains for registers
- Track which registers hold:
  - Constants (LOAD_K)
  - Strings (STR_INIT + STR_APPEND sequences)
  - Object references (PROP_GET, PROP_GET_K)
  - Function results (call opcodes)

### Task 3.2: Expression Tree Building
- Fold register operations into nested expressions
- Example: `r8 = r9 + r10` where `r9 = this.length` → `this.length + r10`
- Handle `Q` (this context) tracking through property accesses

### Task 3.3: Call Reconstruction
- Reconstruct method calls from multi-step patterns:
  1. PROP_GET: `r(a) = r(b)[r(c)]` (get method reference)
  2. CALL_x: `r(d) = r(a).call(r(b), ...)` (invoke with receiver)
- Merge into: `r(b).method(args...)`

### Task 3.4: String Literal Reconstruction
- Merge character-by-character string building into string literals
- Handle cross-opcode string sequences spanning many instructions

---

## Phase 4: Decompilation & Output

**Goal**: Emit readable JavaScript from the recovered structures.

### Task 4.1: AST Construction
- Build a JavaScript AST from expression trees + control flow patterns
- Use structured patterns from Phase 2 to recover if/else/while/for/try

### Task 4.2: Code Generation
- Walk the AST and emit formatted JavaScript
- Apply proper indentation, semicolons, and bracing
- Output to `output/decompiled.js`

### Task 4.3: Variable Naming
- Rename registers to meaningful names where possible
- Use context clues: property names accessed, method calls, string literals
- Follow conventions in CONVENTIONS.md

---

## Phase 5: Validation & Polish

**Goal**: Verify the decompiled output is functionally equivalent.

### Task 5.1: Behavioral Equivalence Tests
- Run both original `tdc.js` and decompiled output in Node.js
- Compare outputs for identical inputs
- Mock `Date` and other environment APIs for deterministic testing

### Task 5.2: Manual Review
- Director reviews decompiled output for readability
- Identify remaining obfuscation artifacts
- Document any unresolvable sections

### Task 5.3: Documentation
- Update all docs with final findings
- Complete OPCODE_REFERENCE.md with confirmed semantics (all ✅)
- Write a summary of the decompiled program's actual purpose

---

## Phase 6: Token Pipeline Tracing

**Goal**: Understand exactly how TDC assembles, encodes, and outputs the fingerprint token — trace the complete data flow from collector results to the final string returned by `getInfo()`/`getData()`.

### Task 6.1: Dynamic Instrumentation Harness
- Build a Puppeteer-based harness that loads `tdc.js` in a real browser
- Hook `window.TDC` methods: log every call to `setData()`, `getInfo()`, `getData()`, `clearTc()`
- Capture return values, arguments, and timing
- Output: `output/dynamic/capture-session.json` with raw captured data

### Task 6.2: Collector Output Mapping
- Instrument the webpack `__webpack_require__` to log each collector module's return value
- Map module index → collector name → output value for a single session
- Identify which collector outputs end up in the `cd` array vs `sd` object
- Output: `output/dynamic/collector-map.json`

### Task 6.3: Token Encoding Pipeline Trace
- Trace func_212 (getData/token encoder) step-by-step in the browser
- Identify: JSON serialization format, string encoding, URL-encoding, any encryption/hashing
- Capture intermediate values at each transformation step
- Output: `output/dynamic/encoding-trace.json`, `docs/TOKEN_PIPELINE.md`

---

## Phase 7: Standalone Token Generator

**Goal**: Reimplement the token generation logic as clean, readable Node.js — no VM, no bytecode.

### Task 7.1: Outer Token Pipeline Reimplementation ✅
- Reimplement all non-crypto parts of the token pipeline: sd serialization, cd JSON assembly, btoa, segment concatenation (order 1,0,2,3), URL-safe encoding
- Output: `token/outer-pipeline.js` — 5 exported functions, pluggable `encryptFn` for crypto core
- Verified against encoding-trace.json ground truth (65/65 assertions)

### Task 7.2: Crypto Core Dynamic Tracing ✅
- Dynamically traced func_271's 14-step key schedule at the VM interpreter level
- Captured inputs/outputs of each sub-function, shared state arrays, btoa segments
- Found: constant key state (r87[0], r18[0]), 6 no-op key functions, 4 invocations per getData()
- Output: `dynamic/crypto-tracer.js`, `output/dynamic/crypto-trace.json`, `docs/CRYPTO_ANALYSIS.md`

### Task 7.3: Expanded Crypto Tracing — Inner Loop & Segment Construction ✅
- Extended tracer to cover all 3 code regions of func_271 (setup, loop condition, inner loop)
- Resolved self-modifying bytecode: THROW→CJMP at PC 40178, loop uses CJMP not exceptions
- Traced inner loop: 8-byte blocks processed by converter→cipher→serializer pipeline
- Closed fromCharCode attribution gap: 97.8% → 4.5%
- Output: `dynamic/crypto-tracer-v2.js`, `output/dynamic/crypto-trace-v2.json`

### Task 7.4: Cipher Round Deep Trace & Crypto Core Reimplementation ✅
- Modified XTEA algorithm identified and reimplemented in `token/crypto-core.js`
- All 802 cipher round I/O pairs verified, all 4 btoa segments match ground truth

### Task 7.5: End-to-End Token Pipeline Integration ← Active
- Wire crypto-core.js into outer-pipeline.js via `token/generate-token.js`
- Reverse-engineer segment construction (how cd/sd strings become 4 input chunks)
- Verify full token output matches encoding-trace.json byte-for-byte

### Task 7.6: Collector Data Schema
- Define the exact schema of all 59 collector outputs (types, field names, ordering)
- Build `token/collector-schema.js` documenting what each collector module returns
- Validate schema against `output/dynamic/collector-map.json`

### Task 7.7: Browser API Mock Layer
- Build `token/browser-mock.js` — a configurable mock for all browser APIs TDC reads
- Must support: navigator, screen, canvas, WebGL, audio, touch, CSS, WebRTC, fonts, etc.
- Default profile: Chrome 120 on Windows 10 (most common)
- Output: mock object that can be injected as `__global`

---

## Phase 8: End-to-End Token Verification

**Goal**: Generate tokens with the standalone generator and verify they match what `tdc.js` would produce.

### Task 8.1: Deterministic Token Comparison
- Run `tdc.js` in Puppeteer with a frozen browser environment (fixed Date, fixed Math.random, etc.)
- Run standalone generator with the same mock data
- Compare token output byte-by-byte
- Document any non-deterministic components (timestamps, random values)

### Task 8.2: Token Format Documentation
- Document the complete token format: structure, encoding layers, field order
- Document how `setData()` input affects token output
- Document timestamp handling and any anti-replay mechanisms
- Output: `docs/TOKEN_FORMAT.md`

### Task 8.3: Configurable Token Generator
- Finalize `token/generate-token.js` — the user-facing entry point
- Accept: browser profile config, setData input, optional timestamp override
- Return: token string identical to what `tdc.js` would produce
- Include CLI interface: `node token-generator.js --profile chrome120-win10`

---

## Phase 9: Universal jsdom Token Generator

**Goal**: Build a version-agnostic token generator that executes any tdc.js template inside a jsdom environment with hooked browser APIs — no decompilation, no opcode mapping, works with any template version.

**Background**: Empirical analysis of 3 live tdc.js builds revealed Tencent randomly serves from a pool of VM templates with fully reshuffled opcodes. Decompiling per-template is impractical. Instead, we run the VM as a black box in jsdom.

### Task 9.1: jsdom Environment Bootstrap
- Create minimal jsdom environment that loads and executes any tdc.js build
- Expose `window.TDC` API: `getInfo()`, `setData()`, `getData()`, `clearTc()`
- Validate against all 3 test builds (tdc.js, tdc-v2.js, tdc-v3.js)

### Task 9.2: Browser API Mock Layer
- Build comprehensive mock for all ~40 fingerprint APIs TDC probes
- Support configurable "device profiles" (Chrome/Windows, Safari/macOS, etc.)
- Cover: navigator, screen, canvas, WebGL, audio, fonts, storage, touch, bot detection

### Task 9.3: Synthetic Event Injection
- Generate realistic mouse/touch event sequences for behavioral fingerprinting
- Dispatch events with human-like timing and movement patterns
- TDC records: mousemove, mousedown, mouseup, touchstart, touchmove, touchend

### Task 9.4: End-to-End Token Validation
- Compare jsdom-generated tokens against Puppeteer ground truth
- Verify 4-segment structure, sizes, and encoding
- Optionally test server acceptance

### Task 9.5: Browser Mock Calibration
- Align Chrome profile mock values with collector-map.json ground truth (59 fields)
- Fix WebGL vendor/renderer, audio pxi_output, codec arrays, and other discrepancies
- Close the ~500 char token gap between jsdom and Puppeteer

### Task 9.6: CLI, Packaging & Limitations Documentation
- CLI tool: `node jsdom/cli.js --file <path> --appid <id> --nonce <nonce>`
- Library API: `const { generateToken } = require('./jsdom')`
- Documentation: `docs/JSDOM_GENERATOR.md` — includes known limitations (4 unfixable mismatches, 8 session-dependent fields, Safari uncalibrated, decrypt key scope)

---

## Phase 10: Headless CAPTCHA Solver Bot

**Goal**: Build a fully headless Node.js bot that replicates `bot.py`'s functionality — query `urlsec.qq.com` with a list of domains, solve Tencent slide CAPTCHAs, and save results — without requiring a real or headless browser.

**Background**: Phase 9 proved that jsdom can generate valid TDC tokens. Investigation of the CAPTCHA POST payload revealed that:
- `eks` = `TDC.getInfo().info` (generated by tdc.js itself, not a separate script)
- `vData` is only set for IE browsers (`isLowIE()` guard) and is optional — real payloads with `vlg=0_0_1` (vm not loaded) are accepted
- `TDC.setData()` is a pass-through: accepts all CAPTCHA session fields (coordinate, slideValue, trycnt, dragobj, etc.) directly
- The slide trajectory doesn't need to be realistic — uniform linear drags pass server validation
- The `node-canvas` package (already installed) provides image processing for the slide solver

### Task 10.1: Slide Puzzle Solver (Node.js)
- Reimplement `bot.py`'s `solve_slider()` in Node.js using `canvas` (node-canvas)
- Input: background image buffer + slider piece image buffer (JPEG)
- Processing: grayscale → Canny edge detection → normalized cross-correlation template matching
- Output: raw pixel offset (integer)
- Verify against Python opencv solver on the same test images (±3px tolerance)

### Task 10.2: CAPTCHA HTTP Client
- Implement the 4-endpoint network flow using Node.js built-in `https`:
  1. `GET /cap_union_prehandle` → parse JSONP → extract `{sess, sid}`
  2. `GET /cap_union_new_getsig` → extract `{bg_url, slice_url, vsig, websig, nonce, spt}`
  3. `GET /hycdn?index=1,2` → download background + slider images
  4. `POST /cap_union_new_verify` → submit solution → extract `{errorCode, ticket, randstr}`
- Handle: cookies, JSONP parsing, proper `Referer`/`Origin` headers, retry on error code 9 (wrong answer)
- Must also handle the initial `urlsec.qq.com/check.html` submission flow

### Task 10.3: Token & EKS Generation Wrapper
- Wrap the jsdom TDC runner to produce both `collect` and `eks` in one call
- Accept full CAPTCHA session fields: `{appid, nonce, coordinate, slideValue, trycnt, refreshcnt, dragobj, ft}`
- Build a Windows/Chrome 146 browser profile matching a real browser fingerprint
- Return: `{collect, eks, tlg}` ready for the verify POST body

### Task 10.4: Bot Orchestrator & CLI
- Main entry point: `node jsdom-solver/solver.js --domains domain.lst --output results.json`
- For each domain:
  1. Submit URL to `urlsec.qq.com`
  2. If CAPTCHA triggered: request session → download images → solve → generate token → submit
  3. Retry on wrong answer (up to 3 attempts, re-solving with calibration adjustment)
  4. Collect results
- Save results to JSON file (same format as `bot.py`)
- Handle: rate limiting, error recovery, progress logging to stderr

### Task 10.5: Live Integration Test & End-to-End Validation
- Run `solver.js` against live `t.captcha.qq.com` endpoints — validate every stage
- Implement `cgi.urlsec.qq.com/index.php` submission flow (fetch check.html to reverse the API)
- Diagnose and fix any issues found during live testing
- Tune calibration if needed (ratio, offset range)
- Validate based on server responses (no Chrome/bot.py available for comparison)

---

## Current Status

Phases 1–8: ✅ Complete | 28 tasks total | 28 test rounds | All passing
Phase 9: ✅ Complete (9.1–9.6 all passing)
Phase 10: ✅ Complete (conditional) — Puppeteer solver works, jsdom solver gets errorCode 9

**Summary**: 51 test rounds across 10 phases. The Puppeteer-based CAPTCHA solver is the production path. The jsdom path generates valid-looking tokens but the server rejects them due to fingerprint quality differences.
