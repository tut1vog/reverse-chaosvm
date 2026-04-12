# vm-slide-stack-vm

## Open question

How does the stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, ~36 opcodes) used in `vm-slide.enc.js` work? What are its opcodes, dispatch loop, and relationship to the register-machine `tdc.js` VM?

## Status

closed

## Inputs

- `sample/vm_slide.js` — 43 KB, already decoded locally
- Optional: fresh `vm-slide.*.enc.js` fetched via `curl` from `t.captcha.qq.com`

## How to reproduce

```
# Decode sample/vm_slide.js into dispatch-table.json + bytecode.json
node research/vm-slide-stack-vm/decoder.js

# Emit linear text disassembly (39.1 baseline, pinned by tests)
node research/vm-slide-stack-vm/disassembler.js

# Emit full-coverage control-flow-aware disassembly (40.1)
node research/vm-slide-stack-vm/walker.js

# Reproduce the XTEA finding with annotated disassembly windows (40.6)
node research/vm-slide-stack-vm/xtea-hunt.js

# Phase 42.1 vData anchor trace (OP_04 OP_10* OP_13 runs for "getVData", "vData=", "&vData=")
#   -> output/vm-slide/vdata-anchors.json
node research/vm-slide-stack-vm/vdata-trace.js

# Phase 42.2 window-install enumeration ([window, <key>] + FUNC_CREATE + OP_24 patterns)
#   -> output/vm-slide/window-installs.json
node research/vm-slide-stack-vm/vdata-provenance.js

# Run regression tests (39.2 + 40.2, 37 total)
node --test tests/test-vm-slide-decoder.js tests/test-vm-slide-walker.js
```

Authoritative reference: `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/CHAOSVM_VARIANTS.md`, `docs/CAPTCHA_ORCHESTRATOR.md` §6 (`vData`).

Phase 42 research artifacts under this track:

- `VDATA-TRACE.md` — task 42.1 static trace of the `getVData` property-write anchor, with a 42.2 correction post-script.
- `VDATA-RESOLUTION.md` — task 42.2 cross-reference against FLOW.md §6 + HAR + crypto provenance scan. Identifies the Chrome-vs-IE9 branch at bytecode pc 19636 and the `proxyXHR` XHR-interceptor path.
- `vdata-trace.js` + `output/vm-slide/vdata-anchors.json` — reproducible anchor extractor.
- `vdata-provenance.js` + `output/vm-slide/window-installs.json` — reproducible `[window, <key>]` property-write enumerator. Finds exactly 1 install (`getVData`, on the IE9 branch).

## Notes

**Phase 39 findings:**
- 53 non-null handlers across 69 dispatch slots classified from source in `docs/VM_SLIDE_OPCODES.md`
- 24,273-element bytecode extracted (committed as `output/vm-slide/bytecode.json`); contains the XTEA delta `0x9E3779B9` exactly twice
- Phase 39.1 linear disassembler covered 312 instructions (~2% of the bytecode) before halting at pc=512 — later understood to be a `FUNC_CREATE` variable-width mis-parse, not a legitimate dispatch-hole hit

**Phase 40 findings:**
- Phase 40.1 control-flow-aware walker decodes 14,134 instructions across 101 distinct function entries (entry PC 0 plus 100 unique `K` values from 128 `FUNC_CREATE` sites); visited range `[0, 24273)` is fully covered, and zero dispatch-table holes are hit by any reachable code path (see `output/vm-slide/disassembly-full.txt`)
- Phase 40.6 confirmed **classical XTEA** (not the register-VM's modified variant) is present in the bytecode: encrypt closure at entry PC `15241`, decrypt closure at entry PC `15416`, both round-bounded by `sum == 32·delta = 84941944608`; encrypt uses `ADD`, decrypt uses `SUB`
- Both closures are instantiated by a single outer factory at entry PC `15220`, spawned via `FUNC_CREATE 15220 0 3 3 4 5` near PC 16835 from inside a CommonJS-style `__esModule` bootstrap routine; the factory takes 3 arguments including key material in local slot 4
- Module-export indirection blocks static identification of the real-world callers — the encrypt/decrypt closures are stored into Tencent's module-export table and invoked indirectly

**Phase 42 findings (vData runtime binding):**
- Task 42.1: statically identified the `window.getVData` property-write at bytecode pc 20066 via `OP_04 OP_10* OP_13` anchor walk. Function body brackets `[19702, 20058]` (216 instructions, one string arg, two `OP_16` exits). Anchors `vData=` at pc 19969 and `&vData=` at pc 24210 confirmed as unrelated (RegExp recursion guard inside the function body, and `window.DEBUGMODE` dead code respectively).
- Task 42.2: traced one block up from 42.1's anchor and found the enclosing IE-gate at pc 19636 (`OP_60 19666` — `if (<state>.isIE9Below()) install getVData else <state>.proxyXHR(p[3])`). Mutually exclusive branches joined at pc 20070. Resolves 42.1's incorrect "installs unconditionally" framing: on Chrome 146 `window.getVData` is **never installed**; the Chrome path goes through the `proxyXHR` XMLHttpRequest monkey-patch (strings `"XMLHttpRequest"` ×5, `"send"`, `"open"`, `"proxyXHR"` at pcs 19641/20119), which intercepts the orchestrator's verify POST and injects `vData=<ciphertext>` into the body.
- Task 42.2 crypto provenance scan: the `getVData` function body itself contains NO crypto. The pipeline ingredients live elsewhere in the bytecode — XTEA delta `0x9E3779B9` as `OP_08` immediate at bytecode indices 15352 (encrypt) and 15530 (decrypt), a custom 64-char base64 alphabet at pc 16932, and a char-set validation regex at pc 17677. Each character in the full 152-char HAR `vData` value is a member of the custom alphabet (zero outliers), confirming the linkage.
- Window-install enumeration: vm-slide installs exactly **1** `window.*` property (`getVData`). No secondary crypto helper exists anywhere in the bytecode. `output/vm-slide/window-installs.json` has one entry.

**Remaining open (narrower follow-up — not Phase 40/42 scope):**
- Pinning the real-world XTEA caller arguments on the Chrome path: who supplies the key used by `proxyXHR`? What plaintext blocks are being encrypted and in what layout? Phase 42 resolved the mechanism but not byte-identical reproducibility. The productive follow-up would decompile the XHR proxy body (bytecode pcs roughly 15000..20700) and use the Phase 40 decoder to extract the key schedule, then build a standalone `vData` generator under `tools/`.
- The register-VM caller handoff flagged in Phase 40 (real-world XTEA caller arguments via module-export indirection) also remains, and is a sibling follow-up.
