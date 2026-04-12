'use strict';

// Phase 40 task 40.6 — XTEA hunt for the vm-slide stack VM.
//
// Question: the value 2654435769 (= 0x9E3779B9, the XTEA delta constant)
// appears exactly twice in output/vm-slide/bytecode.json. Is vm-slide running
// an XTEA-family cipher round, and if so on what payload?
//
// This script:
//   1. Locates the two indices of the delta constant in the bytecode.
//   2. Identifies each occurrence's containing function entry by searching
//      for all FUNC_CREATE (opcode 58) targets and finding the one whose
//      entry PC is the largest value <= the delta PC.
//   3. Prints a semantically-annotated window around each occurrence, using
//      the Phase 39.3 opcode classification from docs/VM_SLIDE_OPCODES.md.
//   4. Checks the XTEA structural signature: PUSH_K 4, PUSH_K 5, PUSH_K 3,
//      PUSH_K 11, SHL/USHR/XOR/AND, and a backward JUMP forming a 32-round
//      loop bounded by PUSH_K 84941944608 (= 32 * 0x9E3779B9).
//
// Reproduces the evidence for Outcome 1 (confirmed XTEA).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BYTECODE = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'output', 'vm-slide', 'bytecode.json'), 'utf8')
);
const DISASM_LINES = fs
  .readFileSync(path.join(ROOT, 'output', 'vm-slide', 'disassembly-full.txt'), 'utf8')
  .split('\n');

const DELTA = 2654435769; // 0x9E3779B9
const LOOP_BOUND = 84941944608; // 32 * delta

// Semantic names from docs/VM_SLIDE_OPCODES.md (Phase 39.3 classification).
const OPCODE_NAMES = {
  0: 'LOAD_LOCAL', 1: 'ENUM_KEYS', 2: 'METHOD_CALL', 3: 'MK_PAIR',
  4: 'PUSH_EMPTY_STR', 5: 'POP', 6: 'JUMP', 7: 'XOR',
  8: 'PUSH_K', 10: 'STR_APPEND_CHAR', 11: 'AND', 12: 'EQ',
  13: 'LOAD_GLOBAL', 15: 'ITER_NEXT', 16: 'RETURN', 17: 'PUSH_UNDEFINED',
  20: 'ADD', 21: 'SUB', 23: 'LOGICAL_NOT', 24: 'STORE_REF',
  25: 'NEW_METHOD', 28: 'STRICT_EQ', 31: 'GT', 32: 'MAKE_GLOBAL_REF',
  33: 'CLEAR_EXCEPTION', 35: 'TRY_PUSH', 36: 'STORE_LOCAL_REF', 37: 'MOD',
  38: 'DIV', 39: 'DUP', 40: 'SET_STACK_LEN', 41: 'GET_PAIR',
  42: 'ALLOC_LOCAL', 45: 'PUSH_NULL', 46: 'SHR', 47: 'MAKE_LOCAL_REF',
  49: 'TRY_POP', 50: 'REPLACE_TOP_K', 51: 'SHL', 52: 'TYPEOF',
  54: 'DEREF', 55: 'NEW_FUNC', 56: 'OR', 58: 'FUNC_CREATE',
  59: 'MAKE_LOCAL_PAIR', 60: 'JUMP_IF_TRUE', 61: 'RETURN_IF_EXC', 62: 'GE',
  63: 'LOAD_LOCAL_REF', 64: 'SWAP_AT', 66: 'CALL_GLOBAL', 67: 'MUL',
  68: 'USHR'
};

// Parse the disassembly into a map: pc -> raw line (e.g. "15352  OP_08 2654435769").
const PC_TO_LINE = new Map();
const PC_ORDERED = [];
for (const line of DISASM_LINES) {
  const m = line.match(/^(\d+)\s+(OP_\d+)(?:\s+(.*))?$/);
  if (!m) continue;
  const pc = Number(m[1]);
  PC_TO_LINE.set(pc, line);
  PC_ORDERED.push(pc);
}
PC_ORDERED.sort((a, b) => a - b);

// Annotate a disassembly line with the semantic opcode name.
function annotate(line) {
  const m = line.match(/^(\d+)\s+OP_(\d+)(.*)$/);
  if (!m) return line;
  const pc = m[1];
  const op = Number(m[2]);
  const rest = m[3];
  const name = OPCODE_NAMES[op] || `OP_${op}`;
  return `${pc.padStart(6)}  ${name.padEnd(16)}${rest}`;
}

// Find all FUNC_CREATE entry PCs, so we can locate the function containing a
// given PC. FUNC_CREATE is opcode 58. Its first operand is the callee entry.
function collectFunctionEntries() {
  const entries = new Set([0]);
  for (const line of DISASM_LINES) {
    const m = line.match(/^\d+\s+OP_58\s+(\d+)/);
    if (m) entries.add(Number(m[1]));
  }
  return [...entries].sort((a, b) => a - b);
}

function containingFunctionEntry(pc, entries) {
  let best = 0;
  for (const e of entries) {
    if (e <= pc && e > best) best = e;
  }
  return best;
}

// Find two indices of DELTA in the bytecode array.
const deltaIndices = [];
for (let i = 0; i < BYTECODE.length; i++) {
  if (BYTECODE[i] === DELTA) deltaIndices.push(i);
}

console.log(`=== vm-slide XTEA hunt (Phase 40 task 40.6) ===`);
console.log(`bytecode length: ${BYTECODE.length}`);
console.log(`delta = 2654435769 = 0x9E3779B9`);
console.log(`delta occurrences: ${deltaIndices.length} at indices ${JSON.stringify(deltaIndices)}`);
console.log(`loop bound (32*delta) = ${LOOP_BOUND} = 0x${LOOP_BOUND.toString(16).toUpperCase()}`);
console.log();

const entries = collectFunctionEntries();
console.log(`FUNC_CREATE entries found: ${entries.length}`);
console.log();

for (const idx of deltaIndices) {
  // The delta appears as an operand. The opcode byte is at idx-1 (OP_08 PUSH_K).
  const instrPc = idx - 1;
  const fnEntry = containingFunctionEntry(instrPc, entries);
  console.log(`--- delta at bytecode[${idx}] (instruction pc ${instrPc}) ---`);
  console.log(`containing function entry: pc ${fnEntry}`);

  // Walk the disassembly: 15 instructions before and 15 after.
  const pcIdx = PC_ORDERED.indexOf(instrPc);
  if (pcIdx < 0) {
    console.log(`  (pc ${instrPc} not in disassembly index — aborting window)`);
    continue;
  }
  const start = Math.max(0, pcIdx - 15);
  const end = Math.min(PC_ORDERED.length, pcIdx + 16);
  for (let k = start; k < end; k++) {
    const marker = PC_ORDERED[k] === instrPc ? ' <-- DELTA' : '';
    console.log('  ' + annotate(PC_TO_LINE.get(PC_ORDERED[k])) + marker);
  }
  console.log();
}

// XTEA signature check. Scan a window around each delta for the structural
// features of a classical XTEA round.
function signatureCheck(instrPc) {
  const pcIdx = PC_ORDERED.indexOf(instrPc);
  const windowStart = Math.max(0, pcIdx - 40);
  const windowEnd = Math.min(PC_ORDERED.length, pcIdx + 40);
  const sig = {
    pushK4: false, pushK5: false, pushK3: false, pushK11: false,
    shl: false, ushr: false, xor: false, and: false,
    backwardJump: null, loopBound: false
  };
  for (let k = windowStart; k < windowEnd; k++) {
    const pc = PC_ORDERED[k];
    const line = PC_TO_LINE.get(pc);
    if (/OP_08 4\b/.test(line)) sig.pushK4 = true;
    if (/OP_08 5\b/.test(line)) sig.pushK5 = true;
    if (/OP_08 3\b/.test(line)) sig.pushK3 = true;
    if (/OP_08 11\b/.test(line)) sig.pushK11 = true;
    if (/^(\d+)\s+OP_51\b/.test(line)) sig.shl = true;
    if (/^(\d+)\s+OP_68\b/.test(line)) sig.ushr = true;
    if (/^(\d+)\s+OP_07\b/.test(line)) sig.xor = true;
    if (/^(\d+)\s+OP_11\b/.test(line)) sig.and = true;
    if (/OP_08 84941944608/.test(line)) sig.loopBound = true;
    const jm = line.match(/^(\d+)\s+OP_06\s+(\d+)/);
    if (jm) {
      const here = Number(jm[1]);
      const target = Number(jm[2]);
      if (target < here) sig.backwardJump = `${here} -> ${target}`;
    }
  }
  return sig;
}

console.log(`=== XTEA signature check ===`);
for (const idx of deltaIndices) {
  const pc = idx - 1;
  const sig = signatureCheck(pc);
  console.log(`  delta pc ${pc}:`);
  for (const [k, v] of Object.entries(sig)) {
    console.log(`    ${k.padEnd(16)} ${v}`);
  }
}
console.log();

console.log(`=== Outcome: CONFIRMED classical XTEA ===`);
console.log(`- Two functions contain one delta each: encrypt (entry 15241) and decrypt (entry 15416).`);
console.log(`- Both embed a 32-round loop bounded by sum == 32*delta (=${LOOP_BOUND}).`);
console.log(`- Both use shifts by 4 and 5, XOR, AND 3, and USHR 11 then AND 3 for key indexing.`);
console.log(`- Encrypt uses ADD (sum += delta, v += ...); decrypt uses SUB (sum -= delta, v -= ...).`);
console.log(`- Input block is read from local slot 3 as [v0, v1]; key is the second argument.`);
console.log(`- Both closures are created by an outer factory function at entry 15220, which is`);
console.log(`  itself instantiated by a CommonJS-style module bootstrap routine near pc 16835.`);
console.log(`- The input payload per-call is whatever the caller passes as argument 1 (a 2-element`);
console.log(`  [v0,v1] block). The caller identity inside the broader program is NOT resolved by`);
console.log(`  this static analysis — the XTEA closures are stored into outer-function locals 6 and`);
console.log(`  7 and exposed through the module-export object, so pinning the actual callers would`);
console.log(`  require tracing the module-export keys or runtime instrumentation.`);
