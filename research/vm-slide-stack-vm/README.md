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

# Run regression tests (39.2 + 40.2, 37 total)
node --test tests/test-vm-slide-decoder.js tests/test-vm-slide-walker.js
```

Authoritative reference: `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/CHAOSVM_VARIANTS.md`.

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

**Remaining open:**
- Pinning the real-world XTEA caller arguments (who supplies the key? what plaintext blocks are encrypted and on which request path?) is blocked by module-export indirection and is the natural handoff to the `captcha-orchestrator` and `eks-payload` research tracks.
