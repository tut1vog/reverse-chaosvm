# vm-slide-stack-vm

## Open question

How does the stack-based ChaosVM variant (`__TENCENT_CHAOS_STACK`, ~36 opcodes) used in `vm-slide.enc.js` work? What are its opcodes, dispatch loop, and relationship to the register-machine `tdc.js` VM?

## Status

partial

## Inputs

- `sample/vm_slide.js` — 43 KB, already decoded locally
- Optional: fresh `vm-slide.*.enc.js` fetched via `curl` from `t.captcha.qq.com`

## How to reproduce

```
# Decode sample/vm_slide.js into structured artifacts under output/vm-slide/
node research/vm-slide-stack-vm/decoder.js

# Emit a text disassembly from the decoded artifacts
node research/vm-slide-stack-vm/disassembler.js

# Run regression tests pinning decoder/disassembler output
node --test tests/test-vm-slide-decoder.js
```

Authoritative reference: `docs/VM_SLIDE_ARCHITECTURE.md`, `docs/VM_SLIDE_OPCODES.md`, `docs/CHAOSVM_VARIANTS.md`.

## Notes

- 53 non-null handlers across 69 dispatch slots classified in `docs/VM_SLIDE_OPCODES.md`
- 24,273-element bytecode containing the XTEA delta `0x9E3779B9` exactly twice (cross-track finding → Phase 40 task 40.6, see `docs/VM_SLIDE_ARCHITECTURE.md` "Unresolved findings")
- Opcode 58 `FUNC_CREATE` is variable-width at runtime (`3 + 2·A + C` bytes, not the static count of 6) and instantiates nested `__TENCENT_CHAOS_VM(...)` invocations for closures (see `docs/VM_SLIDE_OPCODES.md`)
- Linear disassembly currently covers 312 instructions (~2% of the bytecode) before halting at pc=512; full coverage pending Phase 40 task 40.1 (see `docs/VM_SLIDE_ARCHITECTURE.md` "Observed coverage and limitations")
