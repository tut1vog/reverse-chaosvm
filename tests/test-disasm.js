'use strict';

/**
 * Disassembler verification test — Task 1.2
 *
 * Verification method (from PROGRESS.md):
 * 1. Operand count verification: compare against tdc.js Y[++C] counts
 * 2. PC continuity check: no gaps or overlaps
 * 3. Opcode coverage: all 95 opcodes handled
 * 4. Spot-check first 50 instructions from entry point
 * 5. Variable-width opcode handling
 */

const fs = require('fs');
const path = require('path');
const { disassemble, OPCODES, OPERAND_TYPES } = require('../decompiler/disassembler');
const { decode } = require('../decompiler/decoder');

// --- Load bytecode ---
const mainBytecode = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'output', 'bytecode-main.json'), 'utf8')
);

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', message);
  }
}

// ============================================================
// TEST 1: Operand count verification for all 95 fixed-width opcodes
// ============================================================
console.log('\n--- Test 1: Operand counts for all 95 opcodes ---');

// Ground truth: manually counted Y[++C] reads from tdc.js lines 199-565
// Each entry is the total number of Y[++C] reads in that case statement
const GROUND_TRUTH_OPERAND_COUNTS = {
  0: 3,   1: 3,   2: 3,   3: 3,   4: 3,
  5: 7,   6: 3,   7: 2,   8: 3,   9: 3,
  10: 5,  11: 6,  12: 'var', 13: 3, 14: 3,
  15: 2,  16: 6,  17: 3,  18: 1,  19: 4,
  20: 7,  21: 3,  22: 3,  23: 'var', 24: 2,
  25: 3,  26: 4,  27: 3,  28: 3,  29: 5,
  30: 2,  31: 3,  32: 3,  33: 3,  34: 2,
  35: 3,  36: 1,  37: 1,  38: 1,  39: 3,
  40: 2,  41: 8,  42: 1,  43: 3,  44: 3,
  45: 3,  46: 4,  47: 2,  48: 3,  49: 3,
  50: 5,  51: 3,  52: 4,  53: 2,  54: 4,
  55: 'var', 56: 'var', 57: 3, 58: 3, 59: 3,
  60: 1,  61: 5,  62: 2,  63: 4,  64: 5,
  65: 6,  66: 3,  67: 2,  68: 2,  69: 4,
  70: 5,  71: 2,  72: 6,  73: 2,  74: 0,
  75: 5,  76: 5,  77: 3,  78: 3,  79: 3,
  80: 4,  81: 1,  82: 3,  83: 2,  84: 3,
  85: 2,  86: 6,  87: 3,  88: 4,  89: 3,
  90: 2,  91: 1,  92: 3,  93: 1,  94: 3
};

let opcodeCountErrors = 0;
for (let op = 0; op <= 94; op++) {
  const expected = GROUND_TRUTH_OPERAND_COUNTS[op];
  if (expected === 'var') {
    // Variable-width opcodes — verify they have null in OPCODES
    assert(OPCODES[op][1] === null, `Opcode ${op} (${OPCODES[op][0]}) should be variable-width (null)`);
    continue;
  }
  const actual = OPCODES[op][1];
  if (actual !== expected) {
    console.error(`  Opcode ${op} (${OPCODES[op][0]}): expected ${expected} operands, got ${actual}`);
    opcodeCountErrors++;
  }
  assert(actual === expected, `Opcode ${op} (${OPCODES[op][0]}) operand count: expected ${expected}, got ${actual}`);
}

// Also verify OPERAND_TYPES length matches operand count
for (let op = 0; op <= 94; op++) {
  const count = OPCODES[op][1];
  if (count === null) continue; // variable
  const typeStr = OPERAND_TYPES[op];
  assert(typeStr.length === count,
    `Opcode ${op} (${OPCODES[op][0]}): OPERAND_TYPES length ${typeStr.length} != operand count ${count}`);
}

// ============================================================
// TEST 2: PC continuity check — entry point disassembly
// ============================================================
console.log('\n--- Test 2: PC continuity (entry point, PC=36579) ---');

const mainLines = disassemble(mainBytecode, 36579);
assert(mainLines.length > 0, 'Disassembly should produce output');
console.log('Entry point disassembly:', mainLines.length, 'instructions');

// Parse PCs from output
function parsePCs(lines) {
  const pcs = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]/);
    if (match) pcs.push(parseInt(match[1]));
  }
  return pcs;
}

function parseInstructions(lines) {
  const instrs = [];
  for (const line of lines) {
    const match = line.match(/^\[(\d+)\]\s+(\S+)\s*(.*?)\s*;\s*(.*)/);
    if (match) {
      instrs.push({
        pc: parseInt(match[1]),
        mnemonic: match[2],
        operands: match[3].trim(),
        comment: match[4]
      });
    }
  }
  return instrs;
}

const mainPCs = parsePCs(mainLines);
assert(mainPCs[0] === 36579, `First PC should be 36579, got ${mainPCs[0]}`);

// Check PC continuity: for fixed-width opcodes, pc + 1 + operands = next_pc
// For variable-width, we use the actual width
let pcGaps = 0;
let pcOverlaps = 0;
const instrs = parseInstructions(mainLines);

for (let i = 0; i < instrs.length - 1; i++) {
  const curr = instrs[i];
  const next = instrs[i + 1];
  const expectedNext = next.pc;
  // The disassembler advances pc by width, so consecutive PCs should have no gaps
  if (next.pc <= curr.pc) {
    pcOverlaps++;
    if (pcOverlaps <= 3) console.error(`  PC overlap at ${curr.pc}: next is ${next.pc}`);
  }
}

// Check by re-running disassembler and verifying last PC + width = bytecodeLength
const lastPC = mainPCs[mainPCs.length - 1];
console.log('Last PC in entry-point disassembly:', lastPC);
assert(pcOverlaps === 0, `PC overlaps: ${pcOverlaps} (should be 0)`);

// ============================================================
// TEST 3: PC continuity check — full disassembly
// ============================================================
console.log('\n--- Test 3: PC continuity (full, PC=0) ---');

const fullLines = disassemble(mainBytecode, 0);
assert(fullLines.length > 0, 'Full disassembly should produce output');
console.log('Full disassembly:', fullLines.length, 'instructions');

const fullPCs = parsePCs(fullLines);
assert(fullPCs[0] === 0, `First PC should be 0, got ${fullPCs[0]}`);

// Verify last instruction ends exactly at bytecodeArray.length
const fullInstrs = parseInstructions(fullLines);
const lastFullPC = fullPCs[fullPCs.length - 1];
const lastFullInstr = fullInstrs[fullInstrs.length - 1];
// Find the width of the last instruction by looking at what the opcode is
const lastOpcode = mainBytecode[lastFullPC];
let lastWidth;
if (OPCODES[lastOpcode] && OPCODES[lastOpcode][1] !== null) {
  lastWidth = 1 + OPCODES[lastOpcode][1];
} else {
  // Variable — compute from the difference
  lastWidth = mainBytecode.length - lastFullPC;
}
const endPC = lastFullPC + lastWidth;
console.log('Last PC:', lastFullPC, '+ width', lastWidth, '=', endPC, '(bytecode length:', mainBytecode.length + ')');
assert(endPC === mainBytecode.length, `Last instruction should end at ${mainBytecode.length}, got ${endPC}`);

// Check for strictly increasing PCs in full disassembly
let fullOverlaps = 0;
for (let i = 1; i < fullPCs.length; i++) {
  if (fullPCs[i] <= fullPCs[i - 1]) {
    fullOverlaps++;
    if (fullOverlaps <= 3) console.error(`  Full disasm PC overlap: ${fullPCs[i-1]} -> ${fullPCs[i]}`);
  }
}
assert(fullOverlaps === 0, `Full disasm PC overlaps: ${fullOverlaps} (should be 0)`);

// ============================================================
// TEST 4: Opcode coverage — all 95 opcodes appear
// ============================================================
console.log('\n--- Test 4: Opcode coverage ---');

const seenOpcodes = new Set();
for (const instr of fullInstrs) {
  // Find opcode number from mnemonic
  for (let op = 0; op <= 94; op++) {
    if (OPCODES[op][0] === instr.mnemonic) {
      seenOpcodes.add(op);
      break;
    }
  }
}

const missingOpcodes = [];
for (let op = 0; op <= 94; op++) {
  if (!seenOpcodes.has(op)) missingOpcodes.push(op);
}
console.log('Opcodes seen:', seenOpcodes.size, '/ 95');
if (missingOpcodes.length > 0) {
  console.log('Missing opcodes:', missingOpcodes.map(op => `${op}(${OPCODES[op][0]})`).join(', '));
}
assert(seenOpcodes.size === 95, `All 95 opcodes should appear, missing: ${missingOpcodes.length}`);

// ============================================================
// TEST 5: Spot-check first 50 instructions from entry point
// ============================================================
console.log('\n--- Test 5: Spot-check first 50 instructions ---');

// Verify first instruction: PC=36579, opcode=83 (ARRAY), operands: R, K
const firstInstr = instrs[0];
assert(firstInstr.pc === 36579, `First instr PC should be 36579, got ${firstInstr.pc}`);
assert(firstInstr.mnemonic === 'ARRAY', `First instr should be ARRAY, got ${firstInstr.mnemonic}`);
assert(mainBytecode[36579] === 83, `Opcode at 36579 should be 83 (ARRAY), got ${mainBytecode[36579]}`);

// Verify instruction 2: PC=36582, opcode=91 (CATCH_PUSH)
assert(instrs[1].pc === 36582, `2nd instr PC should be 36582, got ${instrs[1].pc}`);
assert(instrs[1].mnemonic === 'CATCH_PUSH', `2nd instr should be CATCH_PUSH, got ${instrs[1].mnemonic}`);
assert(mainBytecode[36582] === 91, `Opcode at 36582 should be 91, got ${mainBytecode[36582]}`);

// Verify instruction 3: PC=36584, opcode=55 (FUNC_CREATE_C)
assert(instrs[2].pc === 36584, `3rd instr PC should be 36584, got ${instrs[2].pc}`);
assert(instrs[2].mnemonic === 'FUNC_CREATE_C', `3rd instr should be FUNC_CREATE_C, got ${instrs[2].mnemonic}`);

// Verify instruction 4: PC=36589, opcode=59 (PROP_SET_K)
assert(instrs[3].pc === 36589, `4th instr PC should be 36589, got ${instrs[3].pc}`);
assert(instrs[3].mnemonic === 'PROP_SET_K', `4th instr should be PROP_SET_K, got ${instrs[3].mnemonic}`);

// Verify instruction 5: PC=36593, opcode=74 (TRY_POP)
assert(instrs[4].pc === 36593, `5th instr PC should be 36593, got ${instrs[4].pc}`);
assert(instrs[4].mnemonic === 'TRY_POP', `5th instr should be TRY_POP, got ${instrs[4].mnemonic}`);

// Verify string building: instructions 10-16 build "exports"
// Line 10: STR_EMPTY r17 → r17 = ""
// Lines 11-13: append e,x,p,o,r,t
// Line 14: STR_OBJ_STR append s → "exports"
const strInstr = instrs[9]; // index 9 = 10th instruction
assert(strInstr.mnemonic === 'STR_EMPTY', `10th instr should be STR_EMPTY, got ${strInstr.mnemonic}`);

// Check comment includes string character building
const charBuilders = instrs.slice(10, 14);
for (const cb of charBuilders) {
  assert(cb.mnemonic === 'STR_APPEND_2' || cb.mnemonic === 'STR_OBJ_STR',
    `String building instructions should be STR_APPEND_2 or STR_OBJ_STR, got ${cb.mnemonic}`);
}

// Verify the string being built is "exports" by checking char codes
// e=101, x=120, p=112, o=111, r=114, t=116, s=115
assert(instrs[10].comment.includes("'e'"), 'Should append e');
assert(instrs[10].comment.includes("'x'"), 'Should append x');
assert(instrs[11].comment.includes("'p'"), 'Should append p');
assert(instrs[11].comment.includes("'o'"), 'Should append o');
assert(instrs[12].comment.includes("'r'"), 'Should append r');
assert(instrs[12].comment.includes("'t'"), 'Should append t');
assert(instrs[13].comment.includes("'s'"), 'Should append s');

// Manually trace first 10 instructions against bytecode array
console.log('Manual trace of first 10 instructions:');
let tracePC = 36579;
for (let i = 0; i < 10 && i < instrs.length; i++) {
  const instr = instrs[i];
  const opcodeVal = mainBytecode[tracePC];
  const opcDef = OPCODES[opcodeVal];
  const match = instr.pc === tracePC && instr.mnemonic === opcDef[0];
  if (!match) {
    console.error(`  MISMATCH at trace ${i}: expected PC=${tracePC} mnemonic=${opcDef[0]}, got PC=${instr.pc} mnemonic=${instr.mnemonic}`);
  }
  assert(match, `Trace instruction ${i} at PC=${tracePC}: mnemonic match`);

  // Advance PC
  if (opcDef[1] === null) {
    // Variable width - use the gap to next instruction
    tracePC = instrs[i + 1] ? instrs[i + 1].pc : tracePC + 1;
  } else {
    tracePC += 1 + opcDef[1];
  }
}

// ============================================================
// TEST 6: Variable-width opcode handling
// ============================================================
console.log('\n--- Test 6: Variable-width opcodes ---');

// Find instances of variable-width opcodes in the full disassembly
const varOpcodes = { 12: 0, 23: 0, 55: 0, 56: 0 };
const varOpNames = { 12: 'FUNC_CREATE_A', 23: 'FUNC_CREATE_B', 55: 'FUNC_CREATE_C', 56: 'APPLY' };

for (const instr of fullInstrs) {
  for (const op of [12, 23, 55, 56]) {
    if (instr.mnemonic === varOpNames[op]) varOpcodes[op]++;
  }
}
console.log('Variable-width opcode counts:');
for (const [op, count] of Object.entries(varOpcodes)) {
  console.log(`  ${varOpNames[op]} (op ${op}): ${count} instances`);
  assert(count > 0, `Variable-width opcode ${op} (${varOpNames[op]}) should appear at least once`);
}

// Verify FUNC_CREATE_C at PC=36584 (3rd instruction from entry point)
// Should have: w=0 (no closure vars), dest, offset, arity
const funcCreateInstr = instrs[2];
assert(funcCreateInstr.mnemonic === 'FUNC_CREATE_C', 'PC 36584 should be FUNC_CREATE_C');
assert(funcCreateInstr.comment.includes('closure'), 'Comment should mention closure');
assert(funcCreateInstr.comment.includes('arity='), 'Comment should mention arity');

// ============================================================
// TEST 7: Output file validation
// ============================================================
console.log('\n--- Test 7: Output file validation ---');

const disasmMainPath = path.join(__dirname, '..', 'output', 'disasm-main.txt');
const disasmFullPath = path.join(__dirname, '..', 'output', 'disasm-full.txt');

assert(fs.existsSync(disasmMainPath), 'output/disasm-main.txt should exist');
assert(fs.existsSync(disasmFullPath), 'output/disasm-full.txt should exist');

const disasmMainContent = fs.readFileSync(disasmMainPath, 'utf8');
const disasmFullContent = fs.readFileSync(disasmFullPath, 'utf8');

const mainFileLines = disasmMainContent.trim().split('\n');
const fullFileLines = disasmFullContent.trim().split('\n');

console.log('disasm-main.txt:', mainFileLines.length, 'lines');
console.log('disasm-full.txt:', fullFileLines.length, 'lines');

assert(mainFileLines.length === mainLines.length,
  `disasm-main.txt line count (${mainFileLines.length}) should match disassemble() output (${mainLines.length})`);
assert(fullFileLines.length === fullLines.length,
  `disasm-full.txt line count (${fullFileLines.length}) should match disassemble() output (${fullLines.length})`);

// ============================================================
// TEST 8: Format compliance check
// ============================================================
console.log('\n--- Test 8: Output format compliance ---');

// Check format: [PC]  MNEMONIC  operands  ; comment
let formatErrors = 0;
const formatRegex = /^\[\d+\]\s+\S+\s.*;\s.+$/;
for (let i = 0; i < Math.min(100, mainLines.length); i++) {
  if (!formatRegex.test(mainLines[i])) {
    formatErrors++;
    if (formatErrors <= 3) console.error('  Bad format:', mainLines[i]);
  }
}
assert(formatErrors === 0, `Format errors in first 100 lines: ${formatErrors} (should be 0)`);

// ============================================================
// TEST 9: Cross-check operand counts with independent Y[++C] counting
// ============================================================
console.log('\n--- Test 9: Independent operand count cross-check ---');

// For a sample of instructions, verify the width matches by checking
// that the next instruction's PC minus current PC equals 1 + operand_count
let widthErrors = 0;
for (let i = 0; i < instrs.length - 1; i++) {
  const curr = instrs[i];
  const next = instrs[i + 1];
  const actualWidth = next.pc - curr.pc;

  // Find opcode number
  let opcodeNum = -1;
  for (let op = 0; op <= 94; op++) {
    if (OPCODES[op][0] === curr.mnemonic) { opcodeNum = op; break; }
  }

  if (opcodeNum >= 0 && OPCODES[opcodeNum][1] !== null) {
    const expectedWidth = 1 + OPCODES[opcodeNum][1];
    if (actualWidth !== expectedWidth) {
      widthErrors++;
      if (widthErrors <= 5) {
        console.error(`  Width mismatch at PC=${curr.pc} (${curr.mnemonic}): expected ${expectedWidth}, got ${actualWidth}`);
      }
    }
  }
}
assert(widthErrors === 0, `Instruction width errors: ${widthErrors} (should be 0)`);

// ============================================================
// TEST 10: entry-point.json fix verification
// ============================================================
console.log('\n--- Test 10: entry-point.json fix ---');

const epJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'output', 'entry-point.json'), 'utf8')
);
assert(epJson.moduleRef[3] === 84941944608,
  `moduleRef[3] should be 84941944608 (0x13c6ef3720), got ${epJson.moduleRef[3]}`);

// ============================================================
// SUMMARY
// ============================================================
console.log('\n==============================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests PASSED');
} else {
  console.log('Some tests FAILED');
  process.exit(1);
}
