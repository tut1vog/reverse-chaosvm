# ChaosVM Variants — Family Overview

## Overview

Tencent's CAPTCHA stack ships a family of JavaScript bytecode virtual machines that we collectively refer to as **ChaosVM** (after their top-level identifiers `__TENCENT_CHAOS_VM` / `__TENCENT_CHAOS_STACK`). Two distinct variants have been observed in the wild and are documented in this repository: a **register-based** VM served directly as `tdc.js`, and a **stack-based** VM embedded inside the slide-CAPTCHA orchestrator as `vm-slide.enc.js`. Both are obfuscated, hand-authored IIFEs with single-letter locals, both ship from the same vendor, and both touch the same XTEA delta constant — but their execution models, opcode sets, bytecode formats, and toolchain maturity differ substantially. This document is the navigational entry point: read it first, then dive into the variant-specific docs it links to.

## The two variants at a glance

| Axis | Register VM (`tdc.js`) | Stack VM (`vm-slide`) |
|---|---|---|
| Execution model | Register file `i[]`, in-register computation | Operand stack `n[]`, push/pop/peek/in-place mutate |
| Dispatch | `switch`-style, 95–100 `case` clauses per template | Dispatch table `Q[m[g++]]()`, 69 slots (53 non-null) |
| Opcode count | 95 (Template A) · 94 (B) · 100 (C) | 53 non-null (16 sparse holes) |
| Bytecode format | Varint+zigzag decoded `Y[]`, ~7K integers | Literal number array `m[]`, 24,273 elements |
| Carrier script | Served directly as `tdc.js` by Tencent's CDN | Embedded inside the `t_captcha_slide.js` orchestrator bundle |
| Top-level identifier | `__TENCENT_CHAOS_VM` (factory inside `tdc.js`) | `__TENCENT_CHAOS_STACK` wrapping `__TENCENT_CHAOS_VM` |
| Known samples | Known templates A / B / C | One decoded vm-slide build the research scripts were run against |
| Toolchain status | Fully decompiled · byte-identical token generator · automated porting pipeline | First-pass decoder+disassembler · ~2% linear coverage |
| Primary output | `collect` token (goes into verify POST body) | Unresolved — suspected `eks` / `vData` involvement |
| Authoritative doc | `docs/VM_ARCHITECTURE.md` | `docs/VM_SLIDE_ARCHITECTURE.md` |

## Detailed comparison

| Dimension | Register VM (`tdc.js` family) | Stack VM (`vm-slide`) |
|---|---|---|
| Execution model | Register file (`i[]` = r0–r20+), in-register computation (`docs/VM_ARCHITECTURE.md` / "Register File") | Operand stack `n = [[this],[{}]]`, stack-based computation (`docs/VM_SLIDE_ARCHITECTURE.md` / "Operand stack semantics") |
| Dispatch | `switch`-style (95–100 cases per template) inside a main loop (`docs/VM_ARCHITECTURE.md` / "Dispatch Loop") | Dispatch table `Q[m[g++]]()` with 69 slots, 53 non-null handlers (`docs/VM_SLIDE_ARCHITECTURE.md` / "Dispatch loop") |
| Opcode count | Template A: 95 · Template B: 94 · Template C: 100 (`docs/OPCODE_REFERENCE.md`, `docs/VERSION_DIFFERENCES.md`) | 53 non-null, plus 16 null holes at indices `[9,14,18,19,22,26,27,29,30,34,43,44,48,53,57,65]` (`docs/VM_SLIDE_OPCODES.md`) |
| Bytecode format | `Y[]` integer array, ~7K elements per template, produced by base64 → varint+zigzag decode (`docs/VM_ARCHITECTURE.md` / "Bytecode Encoding Pipeline") | `m[]` literal number array, 24,273 elements; contains exactly one non-integer element (`0.5`) (`docs/VM_SLIDE_ARCHITECTURE.md` / "Bytecode format") |
| Operand width | Fixed per opcode, inline after opcode (`docs/VM_ARCHITECTURE.md` / "Key Observations") | Fixed for 52 opcodes; **opcode 58 `FUNC_CREATE` is variable-width** (runtime instruction width is `3 + 2·A + C` bytes where A = capture-count and C = argmap-count) (`docs/VM_SLIDE_ARCHITECTURE.md` / "Unresolved findings"; `docs/VM_SLIDE_OPCODES.md`) |
| PC (structural role) | `C` in the reference build (`tdc.js`); identify by role, not name (`CLAUDE.md` / "Key VM Internals") | `g` in the vm-slide build the research scripts were run against; every handler advances pc via `m[g++]` (`docs/VM_SLIDE_ARCHITECTURE.md` / "Register file") |
| Exception handling | `F[]` catch-address stack; `G` holds caught value (`docs/VM_ARCHITECTURE.md` / "Exception Handling") | `C = []` catch stack of 3-tuples `[catchPc, savedStackLen, exceptionSlot]`; `K = null` exception latch; outer `try`/`catch` consumes on throw (`docs/VM_SLIDE_ARCHITECTURE.md` / "Exception handling") |
| Return protocol | Entry-point function returns a single value directly via register `i[...]` (`docs/VM_ARCHITECTURE.md` / "Entry Point") | FIFO drain: `__TENCENT_CHAOS_STACK.g = function(){ return __TENCENT_CHAOS_STACK.shift()[0] }` — top-level invocation returns a stack slice, consumers read one result at a time (`docs/VM_SLIDE_ARCHITECTURE.md` / "Return protocol") |
| Closures / first-class functions | Opcodes 12, 23, 55 build a captured-variable array `h[]` and recurse into `J(...)` at a relative PC (`docs/VM_ARCHITECTURE.md` / "Function Creation") | Opcode 58 `FUNC_CREATE` instantiates nested `__TENCENT_CHAOS_VM(...)` invocations with captured local pairs, an arg-mapping table, and an entry PC (`docs/VM_SLIDE_OPCODES.md`; `docs/VM_SLIDE_ARCHITECTURE.md` / "Unresolved findings") |
| Constant pool | Per-template constant tables reached via opcodes that read `Y[]` immediate slots (`docs/VM_ARCHITECTURE.md` / "Register File") | `U = window` — the outer invocation supplies the browser global object as the constant pool; handlers 13 (`LOAD_GLOBAL`), 32 (`MAKE_GLOBAL_REF`), 66 (`CALL_GLOBAL`) read it by string key (`docs/VM_SLIDE_ARCHITECTURE.md` / "Constant pool") |
| Crypto | Modified XTEA, `delta = 0x9E3779B9`, 32 rounds, per-template STATE_A keys; fully reverse-engineered and reimplemented byte-identically (`docs/CRYPTO_ANALYSIS.md`; `CLAUDE.md` / "Project Memory") | XTEA delta `0x9E3779B9` appears exactly **twice** in the bytecode (`docs/VM_SLIDE_ARCHITECTURE.md` / "Unresolved findings"). Whether this is an XTEA key schedule, a plain embedded constant literal, or something else is unresolved; Phase 40 task 40.6 will investigate |
| Toolchain status | Fully decompiled · byte-identical standalone `collect` token generator · automated porting pipeline (parse → opcode-map → key-extract → verify) for all 5 known targets (`CLAUDE.md` / "Project Memory"; `docs/VERSION_DIFFERENCES.md`) | First-pass decoder + disassembler + opcode classifications from source; ~2% linear disassembly coverage (312 instructions decoded before halting on a dispatch-table hole); full-coverage walker pending Phase 40 task 40.1 (`docs/VM_SLIDE_ARCHITECTURE.md` / "Observed coverage and limitations") |
| Observed in | The register-machine `tdc.js` builds observed to date — across known templates A / B / C (`CLAUDE.md` / "Project Memory") | The vm-slide build the research scripts were run against (`docs/VM_SLIDE_ARCHITECTURE.md` / "File layout") |
| Carrier script | Served directly as `tdc.js` by Tencent's CDN; runs in the browser as the `TDC` global and exposes `TDC.getInfo()` / `TDC.setData()` / `TDC.clearTc()` / `TDC.getData()` (`docs/VM_ARCHITECTURE.md` / "TDC Public API") | Embedded inside the slide-CAPTCHA orchestrator `t_captcha_slide.js`; loaded by that script's control flow — see `docs/CAPTCHA_ORCHESTRATOR.md` |

## What they share

- **XTEA delta constant.** Both variants carry the magic number `0x9E3779B9` (decimal `2654435769`). The register VM uses it canonically in a 32-round modified-XTEA key schedule with per-template `STATE_A` keys — this is a resolved, byte-verified finding (see `docs/CRYPTO_ANALYSIS.md`). The stack VM contains the same constant exactly twice in its 24,273-element bytecode (see `docs/VM_SLIDE_ARCHITECTURE.md` / "Unresolved findings"), but the role of those occurrences is not yet determined.
- **Obfuscation conventions.** Both VMs are minified IIFEs with single-letter locals (`C`, `F`, `i`, `Y`, `Q`, `E` in `tdc.js`; `g`, `m`, `n`, `U`, `C`, `K`, `Q` in `vm_slide.js`), and variable names differ per build. Project convention — documented once in `CLAUDE.md` / "Key VM Internals" and re-stated for the stack VM in `docs/VM_SLIDE_ARCHITECTURE.md` / "Register file" — is to identify each register by its **structural role** (what handlers read from and write to it) rather than by its source-level name.
- **Common vendor and stack.** Both ship from Tencent's CAPTCHA infrastructure and both use the top-level identifier `__TENCENT_CHAOS_VM` in at least one scope: `tdc.js` defines `__TENCENT_CHAOS_VM` as its VM factory, and `vm_slide.js` wraps a function also named `__TENCENT_CHAOS_VM` inside the outer `__TENCENT_CHAOS_STACK` IIFE (`docs/VM_SLIDE_ARCHITECTURE.md` / "File layout"). The shared naming is why we treat them as a single family rather than two unrelated VMs.

## When you'll encounter each variant

- **Register VM (`tdc.js`).** Served directly by Tencent's CDN as the `tdc.js` endpoint. Runs in the browser and exposes the `TDC` global; its primary output is the `collect` token consumed by verify POST bodies (`docs/TOKEN_FORMAT.md`, `docs/VM_ARCHITECTURE.md` / "TDC Public API"). This is the variant the network flow analysis in `docs/HAR_ANALYSIS.md` traces end-to-end.
- **Stack VM (`vm-slide`).** Not served directly — it is loaded by the slide-CAPTCHA orchestrator `t_captcha_slide.js` as `vm-slide.enc.js` and decodes to the vm-slide source that the research scripts were run against. Its role in the verify flow is now resolved: see `docs/CAPTCHA_ORCHESTRATOR.md` for the orchestrator's control flow and how vm-slide installs the XHR proxy that injects `vData` on Chrome.

## Open cross-variant questions

- **XTEA in vm-slide.** The `0x9E3779B9` delta appears twice in the stack-VM bytecode — is it part of an actual XTEA schedule (matching the register VM's key derivation) or just a literal constant the VM happens to reference? → **Phase 40 task 40.6 will investigate.**
- **Shared compiler backend.** The two VMs' execution models differ (register vs stack) but they ship from the same vendor, share the XTEA delta, and use overlapping top-level identifiers. Are they generated from a common source — the same compiler backend with different output modes — or are they independently authored? → **open — no task yet.**
- **Non-integer bytecode operand.** The `0.5` literal in the vm-slide bytecode (`docs/VM_SLIDE_ARCHITECTURE.md` / "Bytecode format") — is this a quirk of one build, an intentional VM feature, or a coincidence from a specific constant baked into the compiled program? → **open — no task yet.**
- **Dispatch holes in vm-slide.** The 16 null slots at indices `[9, 14, 18, 19, 22, 26, 27, 29, 30, 34, 43, 44, 48, 53, 57, 65]` — some or all may be genuinely unreachable, or may become reachable only via control-flow the current linear walker misses. → **Phase 40 task 40.3 will re-verify the opcode table using full coverage**, pending the walker upgrade.
- **Control-flow coverage in vm-slide.** Today's linear disassembly reaches ~2% of the 24,273-element bytecode; behavioral validation of opcode semantics is therefore limited. → **Phase 40 task 40.1 will upgrade to a control-flow-aware walker.**
- **`__TENCENT_CHAOS_VM.v` return-slice constant.** The stack VM's top-level return is `n.slice(3 + __TENCENT_CHAOS_VM.v)`, but `.v` is never assigned in the visible source (`docs/VM_SLIDE_ARCHITECTURE.md` / "Return protocol"). Whether this is deliberate (so `slice(NaN)` yields the full array) or patched by an external loader is unresolved. → **Phase 40 task 40.1 will resolve** once full-coverage disassembly reveals how the VM's output is consumed.
- **Opcode shuffling in vm-slide.** The register VM has well-documented per-template opcode shuffles (`docs/VERSION_DIFFERENCES.md`); the stack VM's dispatch table is a source-level literal, so we have no port-over-builds picture yet — it is unknown whether Tencent rotates the table across vm-slide builds the way they rotate `tdc.js` opcodes. → **open — no task yet.**

## Document map

Jump off to the authoritative doc for whichever slice of the family you need:

- `docs/VM_ARCHITECTURE.md` — register-VM internals: bytecode encoding, dispatch loop, register file, exception handling, TDC public API (the authoritative source for `tdc.js`).
- `docs/OPCODE_REFERENCE.md` — full 95-opcode table for `tdc.js` Template A with operands and stack effects.
- `docs/VM_SLIDE_ARCHITECTURE.md` — stack-VM internals: operand stack, dispatch table, catch stack, return protocol, observed coverage limitations (the authoritative source for `vm-slide`).
- `docs/VM_SLIDE_OPCODES.md` — 53-non-null-handler opcode table for `vm-slide` classified from source, with the 16 dispatch holes documented.
- `docs/CRYPTO_ANALYSIS.md` — modified XTEA schedule, key-index constants, and cipher round for the register VM (authoritative crypto doc for the family today).
- `docs/TOKEN_FORMAT.md` — register-VM `collect` token spec: encoding layers, segment layout, assembly order.
- `docs/VERSION_DIFFERENCES.md` — per-template opcode shuffle analysis and porting strategy across register-VM Templates A/B/C. Stack-VM-specific porting data is not yet in this doc (see the "Opcode shuffling in vm-slide" open question above).
- `docs/EKS_FORMAT.md` — `eks` token structure (current facts + open questions); relevant to the open cross-variant question of whether `vm-slide` touches `eks`.
- `docs/TOKEN_DECRYPTION.md` — how to decrypt a captured register-VM `collect` token end-to-end.
- `docs/HAR_ANALYSIS.md` — network-flow analysis of the CAPTCHA protocol (register VM traced end-to-end; stack VM's placement in the flow is still open).
- `docs/CAPTCHA_ORCHESTRATOR.md` — end-to-end orchestrator reference for the `t_captcha_slide.js` bundle, the script that loads `vm-slide`; start here when investigating where stack-VM results land in the verify flow.
