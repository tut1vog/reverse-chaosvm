# Crypto Analysis — func_271 Core Encryption

## Algorithm Identification (RESOLVED — Task 7.4)

**Classification**: Modified XTEA (eXtended Tiny Encryption Algorithm) with obfuscated key schedule

**Algorithm**: Standard XTEA structure (Feistel network, 32 rounds) with two modifications:
1. Key-index-dependent constant additions: when key index is 1, add 2368517 (0x242405); when key index is 3, add 592130 (0x090902)
2. Non-truncating sum accumulator: the `sum` variable is NOT masked to 32 bits (reaches 84,941,944,608 after 32 rounds), but `<<`, `>>>`, `^`, `&` operators still truncate their operands to 32-bit per JS semantics

**Cipher round (func_204) pseudocode**:
```javascript
v0 = r9[0]; v1 = r9[1]; sum = 0;
delta = 0x9E3779B9; key = STATE_A;
for (32 rounds):
  idx0 = sum & 3
  k0 = key[idx0] + (idx0==1 ? 2368517 : idx0==3 ? 592130 : 0)
  v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0)
  sum += delta
  idx1 = (sum >>> 11) & 3
  k1 = key[idx1] + (idx1==1 ? 2368517 : idx1==3 ? 592130 : 0)
  v1 += (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1)
r9[0] = v0; r9[1] = v1;
```

**Verification**: All 802 cipher round I/O pairs match. All 4 btoa segments match byte-for-byte.

**Previous (incorrect) assessment**: Not TEA/XTEA. This was wrong because:
- The 14-step key schedule LOOKS complex but just fills a constant 4-word array
- Only ONE key array (stateA / r87[0]) is used by the cipher round; stateB / r18[0] is unused noise
- The key modifications (+2368517, +592130) made it look like a custom algorithm in decompiled output
- The non-standard sum handling (no 32-bit truncation) was a JS-specific red herring

**Function mapping confirmed dynamically (Task 7.4)**:
| Variable | Function | Role | Entry PC |
|----------|----------|------|----------|
| r62[0] | func_136 | byte→word converter (LE) | 34415 |
| r46[0] | func_204 | modified XTEA cipher round | 50162 |
| r90[0] | func_140 | word→byte serializer (LE) | 35472 |
| r20[0] | (btoa) | base64 encoder | N/A |

**Reimplementation**: `token/crypto-core.js` — standalone Node.js module, verified against all 802 iterations

## Architecture (Corrected — Task 7.3)

### Complete Execution Model

func_271 is called **4 times** per getData() — once for each btoa output segment. Each invocation has 3 phases executed across 3 scattered code regions:

```
func_271(r60=inputChunk, r44=undefined)    ← called 4 times by func_114
  │
  ├── PHASE 1: Key Schedule Setup (Region 1, PC 65361–65625)
  │   ├── Unpack args: r60=args[0], r44=args[1]=undefined
  │   ├── Unpack captures: r87, r18, r62, r46, r90, r20
  │   ├── Init: r9=[], r92=[], r19="", r37=0
  │   ├── Create 14 closures and call them sequentially
  │   │   (8 transforms fill r87[0]/r18[0] constant state, 6 key-ops silently fail)
  │   └── JMP → 40146 (Region 2)
  │
  ├── PHASE 2: Loop Condition (Region 2, PC 40146–40178)
  │   ├── Self-modify: Y[40178] = 87 (THROW opcode 37 → CJMP opcode 87)
  │   │   (first iteration transforms the bytecode; subsequent iterations are no-ops)
  │   ├── Compare: r35 = (r37 < r60["length"])
  │   └── CJMP r35 → true: Region 3 (PC 68776), false: Exit (PC 65627)
  │
  ├── PHASE 3: Inner Loop — Cipher (Region 3, PC 68776–68915)
  │   ├── slice1 = r60.slice(r37, r37+4)     ← 4 bytes of input
  │   ├── r9[0] = r62[0](slice1)              ← byte→word converter (40 fCC)
  │   ├── slice2 = r60.slice(r37+4, r37+8)    ← next 4 bytes
  │   ├── r9[1] = r62[0](slice2)              ← byte→word converter (40 fCC)
  │   ├── r46[0](r9, r92)                     ← CIPHER ROUND (0 fCC — pure arithmetic)
  │   ├── str1 = r90[0](r9[0])                ← word→byte serializer (19 fCC)
  │   ├── str2 = r90[0](r9[1])                ← word→byte serializer (19 fCC)
  │   ├── r19 = r19 + str1 + str2             ← accumulate 8 output bytes
  │   ├── r37 += 8
  │   └── JMP → 40146 (back to Region 2)
  │
  └── EXIT (PC 65627–65635)
      ├── r96 = r20[0]                         ← btoa function
      ├── r25 = r96.call(Q, r19)               ← btoa(accumulated binary string)
      └── return r25                            ← base64 segment string
```

### Call Flow

```
func_212 (getData)
  └── func_114 (ChallengeEncrypt wrapper)
        ├── FUNC_CREATE_C → func_271(chunk0)  → btoa[0] (48B → 64 chars)   hash/checksum
        ├── FUNC_CREATE_C → func_271(chunk1)  → btoa[1] (144B → 192 chars)  header+nonce
        ├── FUNC_CREATE_C → func_271(chunk2)  → btoa[2] (2928B → 3904 chars) encrypted data
        └── FUNC_CREATE_C → func_271(chunk3)  → btoa[3] (88B → 120 chars)   signature/MAC
```

### Key Insight: func_271 Is Called 4 Times, NOT Looped 4 Times

The Task 7.2 observation of "14 steps × 4 = 56 calls" was correctly attributed to 4 iterations. But the mechanism is NOT an internal loop re-entering Region 1. Instead, func_114 (the caller) calls func_271 four separate times, each with a different input chunk. Each invocation runs the full 3-phase pipeline independently.

Evidence from trace:
- `regionHitCounts.region1 = 4` per getData() (4 separate entries at PC 65361)
- `regionHitCounts.exit = 4` per getData() (4 separate exits at PC 65627)
- r37 resets to 0 at each invocation (confirmed by loop control: r37=0,8,16,...,40,48 → exit, then r37=0,8,... again)

## Self-Modifying Bytecode (Resolved)

**Static view**: Y[40178] = opcode 37 (THROW)
**Runtime**: At PC 40161, `Y[40178] = 87` overwrites THROW with CJMP

The self-modification happens at PC 40161, which executes BEFORE PC 40178 in the same sequential flow. So by the time execution reaches 40178, it is already CJMP. **The THROW never fires.**

After self-modification, CJMP at PC 40178 with operands:
- Register: r35 (boolean: r37 < r60.length)
- True offset: 28597 → PC 40178 + 28597 + 1 = **68776** (Region 3, inner loop)
- False offset: 25448 → PC 40178 + 25448 + 1 = **65627** (Exit)

The static disassembler sees 40180 and 40181 as "UNKNOWN" opcodes — they're actually the CJMP offset operands, not standalone instructions. This is a deliberate anti-disassembly technique.

**First invocation**: Y[40178] changes from 37→87 (actual transformation)
**Subsequent invocations**: Y[40178] = 87→87 (idempotent, already CJMP)

**F (catch stack) is empty** at the CJMP: `F.length = 0` in all observed iterations. No exception handling is involved in the loop mechanism.

## Inner Loop Data Flow (NEW — Task 7.3)

### Per-Iteration Pipeline

Each inner loop iteration processes 8 bytes of input and produces 8 bytes of output:

```
Input:  r60.slice(r37, r37+8)  ← 8 bytes from input chunk
                │
        ┌───────┴───────┐
        ▼               ▼
  r60.slice(r37,r37+4) r60.slice(r37+4,r37+8)
        │               │
        ▼               ▼
  r62[0](slice1)       r62[0](slice2)        ← byte→word converter
  = r9[0]              = r9[1]                  (40 fromCharCode each)
        │               │
        └───────┬───────┘
                ▼
         r46[0](r9, r92)                     ← CIPHER ROUND
         (modifies r9 in-place)                (0 fromCharCode — pure math)
         (may modify r92 as side-effect)
                │
        ┌───────┴───────┐
        ▼               ▼
  r90[0](r9[0])       r90[0](r9[1])         ← word→byte serializer
  = str1               = str2                   (19 fromCharCode each)
        │               │
        └───────┬───────┘
                ▼
  r19 = r19 + str1 + str2                   ← accumulate output
```

### Captured Functions (r62, r46, r90, r20) — CONFIRMED Task 7.4

| Variable | Source | Function | Role | fCC/call | Algorithm |
|----------|--------|----------|------|----------|-----------|
| r62[0] | capture[2] | func_136 (byte→word) | Converts 4-byte string slice to 32-bit word | 40 | `b[0] \| (b[1]<<8) \| (b[2]<<16) \| (b[3]<<24)` (LE) |
| r46[0] | capture[3] | func_204 (cipher) | Modified XTEA (32 rounds) on r9[0],r9[1] | 0 | See algorithm above |
| r90[0] | capture[4] | func_140 (serializer) | Converts 32-bit word back to 4-byte string | 19 | `fromCharCode(v&0xFF, (v>>8)&0xFF, (v>>16)&0xFF, (v>>24)&0xFF)` (LE) |
| r20[0] | capture[5] | btoa finalizer | Base64-encodes accumulated r19 string | 0 | Standard `btoa()` |

### Per-Iteration Metrics (Constant)

| Metric | Value |
|--------|-------|
| Input bytes consumed | 8 |
| Output bytes produced (r19 growth) | 8 |
| fromCharCode calls | 123 total |
| — converter1 (r62[0]) | 40 |
| — converter2 (r62[0]) | 40 |
| — cipherRound (r46[0]) | 0 |
| — serializer1 (r90[0]) | 19 |
| — serializer2 (r90[0]) | 19 |
| — bytecode string ops | ~5 |

### Per-Invocation Metrics

| Invocation | Input (r60) | Inner Iters | Crypto fCC | Output (btoa) |
|------------|-------------|-------------|------------|---------------|
| 0 (hash) | 48 bytes | 6 | 1,234 | 64 chars |
| 1 (header) | 144 bytes | 18 | 2,782 | 192 chars |
| 2 (ciphertext) | 2,928 bytes | 366 | 47,674 | 3,904 chars |
| 3 (signature) | 88 bytes | 11 | 1,879 | 120 chars |
| **Total** | **3,208 bytes** | **401** | **53,569** | **4,280 chars** |

## Sub-Function Groups (Region 1 — Key Schedule)

### Group A — Close over r87 (state array A)

| Step | Function | Args | Action | fromCharCode calls |
|------|----------|------|--------|-------------------|
| 1 | func_100 | (0, 12) | PRNG → fills r87[0][2] | 56 |
| 7 | func_43 | (0, 4) | Transform → fills r87[0][0] | 56 |
| 8 | func_199 | (0, 8) | Transform → fills r87[0][1] | 56 |
| 11 | func_284 | (0, 16) | Transform → fills r87[0][3] | 56 |

### Group B — Close over r18 (state array B)

| Step | Function | Args | Action | fromCharCode calls |
|------|----------|------|--------|-------------------|
| 3 | func_69 | (0, 8) | Transform → fills r18[0][2] | 56 |
| 4 | func_210 | (0, 16) | Transform → fills r18[0][3] | 56 |
| 5 | func_31 | (0, 4) | Transform → fills r18[0][0] | 56 |
| 13 | func_113 | (0, 4) | Transform → fills r18[0][1] | 56 |

### Group "none" — Key-setup functions (all silently fail)

| Step | Function | Intended call | Actual behavior |
|------|----------|--------------|-----------------|
| 2 | func_141 | r44.e("B0JC", 16) | TypeError caught → no-op |
| 6 | func_90 | r44.f("'0/:", 16) | TypeError caught → no-op |
| 9 | func_254 | r44.d("'0/:", 12) | TypeError caught → no-op |
| 10 | func_74 | r44.d("QRu~", 16) | TypeError caught → no-op |
| 12 | func_273 | r44.b("QRu~", 8) | TypeError caught → no-op |
| 14 | func_92 | r44.a("jK0L", 4) | TypeError caught → no-op |

## Shared State Arrays

### r87[0] — State Array A (128-bit / 4 × 32-bit words)

| Index | Value (hex) | Written by | Arg2 (bytes) |
|-------|-------------|-----------|--------------|
| 0 | 0x6257584f | func_43 (step 7) | 4 |
| 1 | 0x462a4564 | func_199 (step 8) | 8 |
| 2 | 0x636a5062 | func_100 (step 1) | 12 |
| 3 | 0x6d644140 | func_284 (step 11) | 16 |

### r18[0] — State Array B (128-bit / 4 × 32-bit words)

| Index | Value (hex) | Written by | Arg2 (bytes) |
|-------|-------------|-----------|--------------|
| 0 | 0x34292a21 | func_31 (step 5) | 4 |
| 1 | 0x3b1f3a59 | func_113 (step 13) | 4 |
| 2 | 0x636a5062 | func_69 (step 3) | 8 |
| 3 | 0xa69d7a79 | func_210 (step 4) | 16 |

**Notable**: r87[0][2] == r18[0][2] == 0x636a5062. Both are written by the first transform in each group (func_100/func_69). This suggests a common seed value.

**State is stable**: The values are identical across all 4 invocations and both getData() calls. The key schedule is a constant function.

## fromCharCode Attribution (Resolved — Task 7.3)

The total 163,548 fromCharCode calls per pair of getData() calls break down as:

| Phase | fCC Count | % of Total | Source |
|-------|-----------|------------|--------|
| Collector (fingerprinting) | 56,410 | 34.5% | Outside func_271 — browser API probing |
| Key schedule (14-step × 4) | 3,632 | 2.2% | Region 1 — 8 transforms × 56 fCC each × 4 invocations × 2 calls |
| Inner loop (cipher) | 98,646 | 60.3% | Region 3 — 401 iterations × 123 fCC × 2 calls |
| Unattributed (within crypto) | 4,860 | 3.0% | Between CALLQ sites in Region 3 (string building opcodes) |
| **Total** | **163,548** | **100%** | |

**Crypto-only attribution**: 102,278 / 107,138 = **95.5%** of crypto-phase fCC is accounted for.

The Task 7.2 "97.8% gap" was a misattribution: 34.5% of all fCC calls come from the collector phase (browser fingerprinting outside func_271), not from untraced crypto code. The inner loop (Region 3) accounts for the bulk of crypto fCC at 60.3% of total.

## Output Production (Resolved)

### btoa Segments

| Segment | Input (r60) | Inner Iters | r19 Length | btoa Output | Content |
|---------|-------------|-------------|------------|-------------|---------|
| btoa[0] | 48 bytes | 6 | 48 | 64 chars | Hash/checksum |
| btoa[1] | 144 bytes | 18 | 144 | 192 chars | Header (8-byte nonce + 136 bytes) |
| btoa[2] | 2,928 bytes | 366 | 2,928 | 3,904 chars | Encrypted collector data |
| btoa[3] | 88 bytes | 11 | 88 | 120 chars | Signature/MAC |

### How Segments Are Built

Each func_271 invocation:
1. Runs the 14-step key schedule (Region 1) — sets up constant state arrays
2. Enters the inner loop (Region 2→3 cycle) — processes r60 in 8-byte chunks
3. Each chunk: convert bytes→words (r62[0]), cipher round (r46[0]), convert words→bytes (r90[0])
4. Accumulates output bytes in r19 (string concatenation)
5. When r37 ≥ r60.length, CJMP takes false branch to Exit
6. Exit calls r20[0](r19) which is `btoa()` — returns base64 string

The output is a **1:1 byte transformation**: input size equals output size (before base64). This means the cipher is a stream cipher or ECB-mode block cipher — no padding, no expansion.

## Determinism Analysis

### Between two getData() calls with same frozen environment:

| Component | Deterministic? | Reason |
|-----------|---------------|--------|
| All btoa segments | ✅ Yes | Same frozen PRNG seed → same nonce → identical output |
| r87[0] / r18[0] state | ✅ Yes | Constant key schedule |
| Inner loop output | ✅ Yes | Same input + same state → same cipher output |

With the frozen environment (Date.now, Math.random, crypto.getRandomValues all deterministic), the entire pipeline is **fully deterministic**. The "nonce variation" observed in Task 7.2 was due to unfrozen VM PRNG state between separate test runs — not relevant when the environment is properly frozen.

## Reimplementation (COMPLETED — Task 7.4)

**File**: `token/crypto-core.js`

All four functions have been reimplemented and verified:

| Function | VM equivalent | Reimplementation | Status |
|----------|--------------|------------------|--------|
| `convertBytesToWord()` | r62[0] / func_136 | LE word packing | ✅ 1604/1604 |
| `cipherRound()` | r46[0] / func_204 | Modified XTEA (32 rounds) | ✅ 802/802 |
| `convertWordToBytes()` | r90[0] / func_140 | LE byte extraction | ✅ 1604/1604 |
| `encrypt()` | func_271 inner loop | 8-byte block processing | ✅ 4/4 segments |
| `encryptSegments()` | 4× func_271 calls | ECB-mode multi-chunk encryption | ✅ 4/4 btoa match |
| `encryptFn()` | Pluggable interface | Compatible with outer-pipeline.js | ✅ |

Key design decisions:
1. **Key schedule hardcoded**: The 14-step key schedule always produces the same constant `STATE_A = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140]`. No need to reimplement the key generation functions.
2. **r92 ignored**: Dead parameter, never read by cipher round.
3. **stateB unused**: Only stateA (r87[0]) is used as the XTEA key. stateB (r18[0]) is filled by the key schedule but never consumed by the cipher round.
4. **JS number semantics preserved**: Sum not truncated to 32 bits, matching the VM's behavior exactly.

## Open Questions (RESOLVED — Task 7.4)

1. **What does the cipher round (r46[0]) actually compute?** → **Modified XTEA**. 32 rounds of standard XTEA Feistel network with key-index-dependent constant additions (+2368517 for index 1, +592130 for index 3). Pure arithmetic — 224 ADD, 128 XOR, 64 SHL_K, 151 USHR_K, 175 AND_K, 32 ADD_K per call (1491 total ops). Verified against all 802 iterations.

2. **What is r92's role in the cipher round?** → **Dead parameter**. r92 is passed to func_204 but never read or modified by the cipher round code. It's a vestigial parameter from the 14-step key schedule setup (which writes `undefined` values to r92 slots). The cipher only uses its closure capture (stateA = r75[0]) for the key.

3. **Are the 4 invocations independent?** → **Yes, fully independent (ECB mode)**. Each invocation creates fresh r9=[], r92=[], r19="" and runs the same 14-step key schedule (which always produces the same constant stateA). The key arrays (r87[0], r18[0]) are NOT modified by the cipher round — they're only read. Each chunk is encrypted independently.

4. **What is the "second self-modification" at PC 68941?** → **Dead code (not reached)**. The tracer confirmed this PC is outside the inner loop's main flow (68776-68915). It's likely an unused anti-analysis trap that never executes.

---

## Trace Data Reference

- **Tracer v2**: `dynamic/crypto-tracer-v2.js` → `output/dynamic/crypto-trace-v2.json`
  - Region hit counts: region1=8, region2=810, region3=802, exit=8 (across 2 getData() calls)
  - Inner loop: 401 iterations per getData(), processing 3,208 bytes total
  - Self-mod: Y[40178]: 37→87 (first pass), then 87→87 (idempotent)
  - Loop mechanism: CJMP (opcode 87), F.length=0 (no exception handling involved)

- **Tracer v3 (Task 7.4)**: `dynamic/crypto-tracer-v3.js` → `output/dynamic/crypto-trace-v3.json`
  - Deep arithmetic traces for 3 cipher round calls (1491 ops each)
  - Func identification: func_204 (cipher), func_136 (converter), func_140 (serializer)
  - Key finding: cipher is modified XTEA with key-index modifications
  - Loop termination: sum == 32 * DELTA (84,941,944,608) — compared without 32-bit truncation

- **Reimplementation**: `token/crypto-core.js`
  - Verified against all 802 cipher round I/O pairs (100% match)
  - Verified against all 1,604 converter calls (100% match)
  - Verified against all 1,604 serializer calls (100% match)
  - All 4 btoa segments match crypto-trace-v2.json ground truth byte-for-byte
