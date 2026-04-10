---
description: "Port a new tdc.js build through the full porting pipeline: decode, map opcodes, extract XTEA key, verify token."
argument: "Path to the target tdc.js file (e.g., targets/tdc-v4.js)"
---

# Port New TDC Version

Port the target tdc.js build at `$ARGUMENTS` through the full multi-stage porting pipeline.

Determine the target stem from the filename (e.g., `targets/tdc-v4.js` -> `tdc-v4`). Create the output directory `output/<target-stem>/` if it does not exist.

Report progress at each stage. If any stage fails, halt immediately and report diagnostics (error message, partial output, what to investigate).

---

## Stage 1 — Decode Bytecode

Run the decoder on the target file:

```
node decompiler/decoder.js $ARGUMENTS
```

Or use the decoder module directly in a script. The decoder (`decompiler/decoder.js`) works on ALL tdc.js builds unchanged — it handles the base64 -> varint/zigzag -> integer array transformation, which is invariant across all templates. This stage should always succeed if the file is a valid tdc.js build.

Verify the output: the decoded integer array should contain tens of thousands of integers. Report the array length.

Output: decoded integer array saved to `output/<target-stem>/decoded.json`.

---

## Stage 2 — Auto-Map Opcodes

Dispatch the `opcode-mapper` agent to analyze the VM dispatch loop and produce an opcode table:

```
Dispatch agent: .claude/agents/opcode-mapper.md
Input: $ARGUMENTS (the target tdc.js file)
Output location: output/<target-stem>/
```

The agent will:
1. Locate `__TENCENT_CHAOS_VM` in the target file
2. Identify VM variables by structural role (bytecode, pc, regs, thisCtx, catchStack, closureVars)
3. Normalize each `case N:` handler using canonical variable names
4. Pattern-match every handler against the 95 known operations in `docs/OPCODE_REFERENCE.md`

Expected output files:
- `output/<target-stem>/opcode-table.json` — `{ "0": "MNEMONIC", "1": "MNEMONIC", ... }`
- `output/<target-stem>/opcode-mapping-notes.md` — notes on ambiguous handlers, differences from Template A

**Pause point**: If any handlers are flagged as ambiguous in the notes file, report them to the user and wait for review before proceeding. Show the raw handler code and the candidate matches.

Report: total opcode count, how many mapped cleanly, how many flagged as ambiguous, whether the template matches a known template (A = 95 ops, B = 94 ops, or new).

---

## Stage 3 — Extract XTEA Key

Dispatch the `key-extractor` agent to dynamically trace the cipher and extract crypto parameters:

```
Dispatch agent: .claude/agents/key-extractor.md
Input: $ARGUMENTS (the target tdc.js file) + output/<target-stem>/opcode-table.json
Output location: output/<target-stem>/
```

The agent will:
1. Set up a Puppeteer-based tracing environment
2. Instrument the VM dispatch loop using the opcode table from Stage 2
3. Trigger token generation (`TDC.getData()`) to invoke the cipher
4. Capture register values during cipher round execution
5. Extract: STATE_A (4 x uint32 key), delta, round count, key modification constants

Expected output:
- `output/<target-stem>/xtea-params.json`

Report: extracted key (hex), delta value, round count, key modification constants, and whether they match Template A values or are different.

---

## Stage 4 — Verify Token

Dispatch the `token-verifier` agent to capture a live token and byte-compare against standalone generation:

```
Dispatch agent: .claude/agents/token-verifier.md
Input: $ARGUMENTS + output/<target-stem>/opcode-table.json + output/<target-stem>/xtea-params.json
Output location: output/<target-stem>/
```

The agent will:
1. Capture a live `collect` token from the target tdc.js via Puppeteer
2. Capture the `eks` token from `TDC.getInfo().info`
3. Generate a standalone token using extracted parameters via `token/generate-token.js`
4. Byte-compare each segment (hash, header, cdBody, sig) between live and standalone
5. Diagnose any mismatches (XTEA key, collector schema, assembly order, timestamp drift)

Expected output:
- `output/<target-stem>/verification-report.json`

Report: overall match (yes/no), per-segment match status, and diagnostics for any mismatches.

---

## Stage 5 — Report

Summarize the full porting result:

1. **Target**: filename and path
2. **Opcode count**: number of mapped opcodes (e.g., 95 or 94)
3. **Template match**: A (95 ops, matches tdc.js), B (94 ops, matches tdc-v2.js), or new template
4. **XTEA key**: the 4 x uint32 key values (hex) — note if identical to Template A or different
5. **Verification result**: byte-identical (yes/no), which segments match, which diverge
6. **Action items**: anything that still needs manual attention

Update the version status table in `CLAUDE.md` (the `Version status` table in `Project Memory`) to reflect the new build's status.
