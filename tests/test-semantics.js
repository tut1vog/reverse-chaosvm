'use strict';

/**
 * Test suite for Task 3.1: Instruction Semantics Module
 *
 * Validates opcode-semantics.js against tdc.js ground truth per the
 * verification method in docs/PROGRESS.md.
 */

const fs = require('fs');
const path = require('path');
const { OPCODE_TABLE, OPERAND_TYPES, MNEMONIC_TO_OPCODE, getSemantics, parseDisasmToIR, parseOperand } = require('../decompiler/opcode-semantics');

// Load disassembly for real instruction testing
const disasmPath = path.join(__dirname, '..', 'output', 'disasm-full.txt');
const disasmLines = fs.readFileSync(disasmPath, 'utf-8').split('\n').filter(l => l.trim());

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
const failures = [];

function assert(condition, msg) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
  } else {
    failedAssertions++;
    failures.push(msg);
    console.log(`  FAIL: ${msg}`);
  }
}

function assertEq(actual, expected, msg) {
  totalAssertions++;
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passedAssertions++;
  } else {
    failedAssertions++;
    const detail = `${msg}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`;
    failures.push(detail);
    console.log(`  FAIL: ${detail}`);
  }
}

// Helper: find first disasm line with given mnemonic
function findLine(mnemonic) {
  return disasmLines.find(l => {
    const m = l.match(/^\[\d+\]\s+(\S+)/);
    return m && m[1] === mnemonic;
  });
}

// Helper: parse disasm line into operands for testing
function getIR(mnemonic) {
  const line = findLine(mnemonic);
  if (!line) throw new Error(`No disasm line found for ${mnemonic}`);
  return parseDisasmToIR(line);
}

// ============================================================================
// Section 1: OPCODE_TABLE completeness
// ============================================================================

console.log('\n=== 1. OPCODE_TABLE completeness ===');

assert(Object.keys(OPCODE_TABLE).length === 95, 'OPCODE_TABLE should have 95 entries');

for (let op = 0; op <= 94; op++) {
  assert(OPCODE_TABLE[op] !== undefined, `OPCODE_TABLE[${op}] should exist`);
  assert(typeof OPCODE_TABLE[op].name === 'string', `OPCODE_TABLE[${op}].name should be a string`);
  assert(typeof OPCODE_TABLE[op].category === 'string', `OPCODE_TABLE[${op}].category should be a string`);
  assert(typeof OPCODE_TABLE[op].isTerminator === 'boolean', `OPCODE_TABLE[${op}].isTerminator should be boolean`);
  assert(typeof OPCODE_TABLE[op].isCompound === 'boolean', `OPCODE_TABLE[${op}].isCompound should be boolean`);
}

// MNEMONIC_TO_OPCODE reverse lookup
assert(Object.keys(MNEMONIC_TO_OPCODE).length === 95, 'MNEMONIC_TO_OPCODE should have 95 entries');
assert(MNEMONIC_TO_OPCODE['ADD'] === 0, 'ADD should map to 0');
assert(MNEMONIC_TO_OPCODE['NEW_1'] === 94, 'NEW_1 should map to 94');

// ============================================================================
// Section 2: Coverage — all 95 opcodes handled without error
// ============================================================================

console.log('\n=== 2. Coverage: getSemantics on all 95 opcodes ===');

let coverageErrors = 0;
for (let op = 0; op <= 94; op++) {
  const info = OPCODE_TABLE[op];
  let testOperands;
  if (info.operandCount === null) {
    // Variable-width: provide minimal operands based on opcode
    if (op === 12) testOperands = ['r10', '116', '0', 'r11', '100', '0', 'r12', 'r10', 'r11'];
    else if (op === 23) testOperands = ['r10', '5', 'r11', '0', 'r12', '100', '0', 'r13', '5', 'r11'];
    else if (op === 55) testOperands = ['0', 'r10', '100', '0'];
    else if (op === 56) testOperands = ['0', 'r10', 'r11', 'r12'];
  } else {
    const types = OPERAND_TYPES[op] || '';
    testOperands = [];
    for (let j = 0; j < types.length; j++) {
      testOperands.push(types[j] === 'R' ? `r${8 + j}` : '42');
    }
  }

  try {
    const result = getSemantics(op, testOperands);
    assert(result !== null && result !== undefined, `getSemantics(${op}) should return non-null`);
    assert(Array.isArray(result.effects), `getSemantics(${op}).effects should be an array`);
    assert(result.effects.length > 0, `getSemantics(${op}).effects should have at least 1 effect`);
  } catch (e) {
    coverageErrors++;
    assert(false, `getSemantics(${op}, ${JSON.stringify(testOperands)}) threw: ${e.message}`);
  }
}
assert(coverageErrors === 0, `All 95 opcodes should handle without error (got ${coverageErrors} errors)`);

// ============================================================================
// Section 3: Def/use correctness for 20 simple opcodes
// ============================================================================

console.log('\n=== 3. Def/use correctness: 20 simple opcodes ===');

// Test each simple opcode for correct dest, reads, expr.type, expr.op
const simpleOpcodeTests = [
  // [opcode, mnemonic, expected type, expected op]
  [0, 'ADD', 'binop', '+'],
  [32, 'SUB', 'binop', '-'],
  [4, 'MUL', 'binop', '*'],
  [2, 'DIV', 'binop', '/'],
  [39, 'MOD', 'binop', '%'],
  [8, 'AND_K', 'binop', '&'],
  [35, 'OR_K', 'binop', '|'],
  [3, 'XOR', 'binop', '^'],
  [51, 'SHR', 'binop', '>>'],
  [82, 'SHL', 'binop', '<<'],
  [27, 'USHR_K', 'binop', '>>>'],
  [28, 'LT', 'binop', '<'],
  [13, 'GT', 'binop', '>'],
  [21, 'LE_K', 'binop', '<='],
  [43, 'GE_K', 'binop', '>='],
  [89, 'EQ', 'binop', '=='],
  [22, 'SEQ', 'binop', '==='],
  [68, 'NOT', 'unop', '!'],
  [53, 'NEG', 'unop', '-'],
  [34, 'TYPEOF', 'unop', 'typeof'],
];

for (const [opcode, mnemonic, expectedType, expectedOp] of simpleOpcodeTests) {
  const ir = getIR(mnemonic);
  const sem = ir.semantics;
  const eff = sem.effects[0];

  // Dest register should be the first operand (register)
  assert(eff.dest !== null && eff.dest !== undefined, `${mnemonic}: dest should not be null`);
  assert(eff.dest === ir.operands[0], `${mnemonic}: dest (${eff.dest}) should match first operand (${ir.operands[0]})`);

  // expr.type
  assertEq(eff.expr.type, expectedType, `${mnemonic}: expr.type`);

  // expr.op
  assertEq(eff.expr.op, expectedOp, `${mnemonic}: expr.op`);

  // reads should contain the source register operands (not the dest)
  assert(Array.isArray(eff.reads), `${mnemonic}: reads should be an array`);
  assert(eff.reads.length > 0, `${mnemonic}: reads should not be empty`);

  // For binop: reads should contain 2 sources for reg-reg, or 1 for reg-imm
  if (expectedType === 'binop') {
    const types = OPERAND_TYPES[opcode];
    if (types && types[2] === 'R') {
      // reg-reg: reads should have 2 entries matching operands[1] and operands[2]
      assert(eff.reads.includes(ir.operands[1]), `${mnemonic}: reads should include source1 ${ir.operands[1]}`);
      assert(eff.reads.includes(ir.operands[2]), `${mnemonic}: reads should include source2 ${ir.operands[2]}`);
    } else {
      // reg-imm: reads should have 1 entry matching operands[1]
      assert(eff.reads.includes(ir.operands[1]), `${mnemonic}: reads should include source ${ir.operands[1]}`);
    }
  }
  // For unop: reads should include operands[1]
  if (expectedType === 'unop') {
    assert(eff.reads.includes(ir.operands[1]), `${mnemonic}: reads should include source ${ir.operands[1]}`);
  }
}

// ============================================================================
// Section 4: Compound opcode decomposition (10 compound opcodes)
// ============================================================================

console.log('\n=== 4. Compound opcode decomposition ===');

// Expected effect counts per compound opcode, verified from tdc.js
const compoundTests = [
  // [opcode, mnemonic, expected effect count, description]
  [5,  'CALL_COMPLEX', 3, 'R=K + method_call + R=R'],
  [10, 'COPY_SET', 2, 'R=R + prop_set'],
  [11, 'INC_BIGINT', 3, 'toNumber + ++ + R=R'],
  [19, 'STR_APPEND_2', 2, 'str_append + str_append'],
  [29, 'PROP_GET_CONST', 2, 'prop_get + R=K'],
  [41, 'SET_GET_CONST', 3, 'prop_set + prop_get + R=K'],
  [54, 'STR_OBJ_STR', 3, 'str_append + obj_new + str_init'],
  [64, 'STR_PROP', 2, 'str_append + prop_get'],
  [65, 'STR_SET_STR', 3, 'str_append + prop_set + str_init'],
  [72, 'PROP_STR', 3, 'prop_get + str_init + str_append'],
];

for (const [opcode, mnemonic, expectedEffects, desc] of compoundTests) {
  const line = findLine(mnemonic);
  if (!line) {
    assert(false, `${mnemonic}: not found in disassembly`);
    continue;
  }
  const ir = parseDisasmToIR(line);
  assert(ir !== null, `${mnemonic}: parseDisasmToIR should not return null`);
  assertEq(ir.semantics.effects.length, expectedEffects,
    `${mnemonic} (op ${opcode}): effect count — ${desc}`);

  // Verify each effect has required fields
  for (let i = 0; i < ir.semantics.effects.length; i++) {
    const eff = ir.semantics.effects[i];
    assert(eff.hasOwnProperty('dest'), `${mnemonic} effect[${i}]: should have dest`);
    assert(eff.hasOwnProperty('expr'), `${mnemonic} effect[${i}]: should have expr`);
    assert(eff.hasOwnProperty('reads'), `${mnemonic} effect[${i}]: should have reads`);
    assert(Array.isArray(eff.reads), `${mnemonic} effect[${i}]: reads should be an array`);
  }
}

// Deeper checks on specific compound opcodes

// Op 5: CALL_COMPLEX — first effect is literal, second is method_call, third is register copy
{
  const ir = getIR('CALL_COMPLEX');
  const effs = ir.semantics.effects;
  assertEq(effs[0].expr.type, 'literal', 'CALL_COMPLEX effect[0]: type should be literal');
  assertEq(effs[1].expr.type, 'method_call', 'CALL_COMPLEX effect[1]: type should be method_call');
  assertEq(effs[2].expr.type, 'register', 'CALL_COMPLEX effect[2]: type should be register');
}

// Op 10: COPY_SET — first is register copy, second is prop_set
{
  const ir = getIR('COPY_SET');
  const effs = ir.semantics.effects;
  assertEq(effs[0].expr.type, 'register', 'COPY_SET effect[0]: type should be register');
  assertEq(effs[1].expr.type, 'prop_set', 'COPY_SET effect[1]: type should be prop_set');
}

// Op 41: SET_GET_CONST — prop_set + prop_get + literal
{
  const ir = getIR('SET_GET_CONST');
  const effs = ir.semantics.effects;
  assertEq(effs[0].expr.type, 'prop_set', 'SET_GET_CONST effect[0]: type should be prop_set');
  assertEq(effs[1].expr.type, 'prop_get', 'SET_GET_CONST effect[1]: type should be prop_get');
  assertEq(effs[2].expr.type, 'literal', 'SET_GET_CONST effect[2]: type should be literal');
}

// ============================================================================
// Section 5: String opcodes
// ============================================================================

console.log('\n=== 5. String opcodes ===');

// Op 93: STR_EMPTY → string_init
{
  const ir = getIR('STR_EMPTY');
  assertEq(ir.semantics.effects[0].expr.type, 'string_init', 'STR_EMPTY: expr.type');
  assertEq(ir.semantics.effects[0].expr.value, '', 'STR_EMPTY: value should be ""');
}

// Op 31: STR_INIT → string_init + string_append
{
  const ir = getIR('STR_INIT');
  assertEq(ir.semantics.effects.length, 2, 'STR_INIT: should have 2 effects');
  assertEq(ir.semantics.effects[0].expr.type, 'string_init', 'STR_INIT effect[0]: string_init');
  assertEq(ir.semantics.effects[1].expr.type, 'string_append', 'STR_INIT effect[1]: string_append');
  assert(typeof ir.semantics.effects[1].expr.char === 'string', 'STR_INIT effect[1]: char should be a string');
  assert(typeof ir.semantics.effects[1].expr.charCode === 'number', 'STR_INIT effect[1]: charCode should be a number');
}

// Op 67: STR_APPEND → string_append
{
  const ir = getIR('STR_APPEND');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'STR_APPEND: expr.type');
  assert(typeof ir.semantics.effects[0].expr.char === 'string', 'STR_APPEND: char should be a string');
}

// Op 19: STR_APPEND_2 → two string_appends
{
  const ir = getIR('STR_APPEND_2');
  assertEq(ir.semantics.effects.length, 2, 'STR_APPEND_2: should have 2 effects');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'STR_APPEND_2 effect[0]: string_append');
  assertEq(ir.semantics.effects[1].expr.type, 'string_append', 'STR_APPEND_2 effect[1]: string_append');
}

// Op 54: STR_OBJ_STR → string_append + object + string_init
{
  const ir = getIR('STR_OBJ_STR');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'STR_OBJ_STR effect[0]: string_append');
  assertEq(ir.semantics.effects[1].expr.type, 'object', 'STR_OBJ_STR effect[1]: object');
  assertEq(ir.semantics.effects[2].expr.type, 'string_init', 'STR_OBJ_STR effect[2]: string_init');
}

// Op 64: STR_PROP → string_append + prop_get
{
  const ir = getIR('STR_PROP');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'STR_PROP effect[0]: string_append');
  assertEq(ir.semantics.effects[1].expr.type, 'prop_get', 'STR_PROP effect[1]: prop_get');
}

// Op 65: STR_SET_STR → string_append + prop_set + string_init
{
  const ir = getIR('STR_SET_STR');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'STR_SET_STR effect[0]: string_append');
  assertEq(ir.semantics.effects[1].expr.type, 'prop_set', 'STR_SET_STR effect[1]: prop_set');
  assertEq(ir.semantics.effects[2].expr.type, 'string_init', 'STR_SET_STR effect[2]: string_init');
}

// Op 72: PROP_STR → prop_get + string_init + string_append
{
  const ir = getIR('PROP_STR');
  assertEq(ir.semantics.effects[0].expr.type, 'prop_get', 'PROP_STR effect[0]: prop_get');
  assertEq(ir.semantics.effects[1].expr.type, 'string_init', 'PROP_STR effect[1]: string_init');
  assertEq(ir.semantics.effects[2].expr.type, 'string_append', 'PROP_STR effect[2]: string_append');
}

// Op 76: STR_SET_K → string_append + prop_set
{
  const ir = getIR('STR_SET_K');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'STR_SET_K effect[0]: string_append');
  assertEq(ir.semantics.effects[1].expr.type, 'prop_set', 'STR_SET_K effect[1]: prop_set');
}

// ============================================================================
// Section 6: Control flow opcodes
// ============================================================================

console.log('\n=== 6. Control flow opcodes ===');

// JMP (38): expr.type = "jmp", reads = []
{
  const ir = getIR('JMP');
  assertEq(ir.semantics.effects[0].expr.type, 'jmp', 'JMP: expr.type');
  assertEq(ir.semantics.effects[0].reads, [], 'JMP: reads should be empty');
  assert(ir.semantics.effects[0].dest === null, 'JMP: dest should be null');
  assert(typeof ir.semantics.effects[0].expr.offset === 'number', 'JMP: offset should be a number');
}

// CJMP (87): expr.type = "cjmp", reads = [condition register]
{
  const ir = getIR('CJMP');
  assertEq(ir.semantics.effects[0].expr.type, 'cjmp', 'CJMP: expr.type');
  assert(ir.semantics.effects[0].reads.length === 1, 'CJMP: reads should have 1 entry');
  assert(ir.semantics.effects[0].reads[0] === ir.operands[0], 'CJMP: reads should be condition register');
  assert(typeof ir.semantics.effects[0].expr.trueOffset === 'number', 'CJMP: trueOffset should be a number');
  assert(typeof ir.semantics.effects[0].expr.falseOffset === 'number', 'CJMP: falseOffset should be a number');
}

// RET (24): compound — R(a) = Q; return R(b)
// Ground truth (tdc.js line 308): i[Y[++C]] = Q; return i[Y[++C]];
{
  const ir = getIR('RET');
  assertEq(ir.semantics.effects.length, 2, 'RET: should have 2 effects');
  // tdc.js: i[Y[++C]] = Q → R(a) = Q (register gets Q, not Q gets register)
  assert(ir.semantics.effects[0].dest !== 'Q', 'RET effect[0]: dest should NOT be Q (R(a) = Q per tdc.js)');
  assert(ir.semantics.effects[0].dest === ir.operands[0], 'RET effect[0]: dest should be first operand register');
  assertEq(ir.semantics.effects[0].expr.reg, 'Q', 'RET effect[0]: expr should load Q');
  assert(ir.semantics.effects[0].reads.includes('Q'), 'RET effect[0]: reads should include Q');
  assertEq(ir.semantics.effects[1].expr.type, 'return', 'RET effect[1]: type should be return');
  assert(ir.semantics.effects[1].reads.length > 0, 'RET: return should read the return value register');
}

// RET_BARE (60): return R(a)
{
  const ir = getIR('RET_BARE');
  assertEq(ir.semantics.effects[0].expr.type, 'return', 'RET_BARE: expr.type');
  assert(ir.semantics.effects[0].reads.length === 1, 'RET_BARE: reads should have 1 entry');
}

// THROW (37): throw R(a)
{
  const ir = getIR('THROW');
  assertEq(ir.semantics.effects[0].expr.type, 'throw', 'THROW: expr.type');
  assert(ir.semantics.effects[0].reads.length === 1, 'THROW: reads should have 1 entry');
}

// TRY_PUSH (33): R(a) = R(b); F.push(C + K)
{
  const ir = getIR('TRY_PUSH');
  assertEq(ir.semantics.effects.length, 2, 'TRY_PUSH: should have 2 effects');
  assertEq(ir.semantics.effects[1].expr.type, 'try_push', 'TRY_PUSH effect[1]: type should be try_push');
}

// TRY_POP (74): F.pop()
{
  const ir = getIR('TRY_POP');
  assertEq(ir.semantics.effects[0].expr.type, 'try_pop', 'TRY_POP: expr.type');
  assertEq(ir.semantics.effects[0].reads, [], 'TRY_POP: reads should be empty');
}

// CATCH_PUSH (91): F.push(C + K)
{
  const ir = getIR('CATCH_PUSH');
  assertEq(ir.semantics.effects[0].expr.type, 'catch_push', 'CATCH_PUSH: expr.type');
  assertEq(ir.semantics.effects[0].reads, [], 'CATCH_PUSH: reads should be empty');
}

// RET_CLEANUP (7): F.pop(); R(a) = Q; return R(b)
{
  const ir = getIR('RET_CLEANUP');
  assertEq(ir.semantics.effects.length, 3, 'RET_CLEANUP: should have 3 effects');
  assertEq(ir.semantics.effects[0].expr.type, 'try_pop', 'RET_CLEANUP effect[0]: try_pop');
  assertEq(ir.semantics.effects[2].expr.type, 'return', 'RET_CLEANUP effect[2]: return');
}

// ============================================================================
// Section 7: Function creation opcodes
// ============================================================================

console.log('\n=== 7. Function creation opcodes ===');

// Find and test FUNC_CREATE_A (12), FUNC_CREATE_B (23), FUNC_CREATE_C (55)
for (const mnemonic of ['FUNC_CREATE_A', 'FUNC_CREATE_B', 'FUNC_CREATE_C']) {
  const line = findLine(mnemonic);
  if (!line) {
    assert(false, `${mnemonic}: not found in disassembly`);
    continue;
  }
  const ir = parseDisasmToIR(line);
  assert(ir !== null, `${mnemonic}: parseDisasmToIR should not return null`);

  // Find the func_create effect
  const funcEffect = ir.semantics.effects.find(e => e.expr.type === 'func_create');
  assert(funcEffect !== null && funcEffect !== undefined, `${mnemonic}: should have a func_create effect`);

  if (funcEffect) {
    assert(typeof funcEffect.expr.offset === 'number', `${mnemonic}: func_create.offset should be a number`);
    assert(typeof funcEffect.expr.arity === 'number', `${mnemonic}: func_create.arity should be a number`);
    assert(Array.isArray(funcEffect.expr.closureVars), `${mnemonic}: func_create.closureVars should be an array`);
    assert(funcEffect.dest !== null, `${mnemonic}: func_create dest should not be null`);
  }
}

// Op 12: FUNC_CREATE_A should have 3 effects: string_append + func_create + prop_set
{
  const ir = getIR('FUNC_CREATE_A');
  assert(ir.semantics.effects.length === 3, 'FUNC_CREATE_A: should have 3 effects');
  assertEq(ir.semantics.effects[0].expr.type, 'string_append', 'FUNC_CREATE_A effect[0]: string_append');
  assertEq(ir.semantics.effects[1].expr.type, 'func_create', 'FUNC_CREATE_A effect[1]: func_create');
  assertEq(ir.semantics.effects[2].expr.type, 'prop_set', 'FUNC_CREATE_A effect[2]: prop_set');
}

// Op 23: FUNC_CREATE_B should have 3 effects: prop_set + func_create + prop_set
{
  const ir = getIR('FUNC_CREATE_B');
  assert(ir.semantics.effects.length === 3, 'FUNC_CREATE_B: should have 3 effects');
  assertEq(ir.semantics.effects[0].expr.type, 'prop_set', 'FUNC_CREATE_B effect[0]: prop_set');
  assertEq(ir.semantics.effects[1].expr.type, 'func_create', 'FUNC_CREATE_B effect[1]: func_create');
  assertEq(ir.semantics.effects[2].expr.type, 'prop_set', 'FUNC_CREATE_B effect[2]: prop_set');
}

// Op 55: FUNC_CREATE_C should have 1 effect: func_create
{
  const ir = getIR('FUNC_CREATE_C');
  assert(ir.semantics.effects.length === 1, 'FUNC_CREATE_C: should have 1 effect');
  assertEq(ir.semantics.effects[0].expr.type, 'func_create', 'FUNC_CREATE_C effect[0]: func_create');
}

// ============================================================================
// Section 8: Round-trip consistency (50 random disasm lines)
// ============================================================================

console.log('\n=== 8. Round-trip consistency (50 random lines) ===');

// For each disasm line: parse → get semantics → verify that reads match register operands
// Use deterministic seed by picking every N-th line
const step = Math.floor(disasmLines.length / 50);
let roundTripPass = 0;
let roundTripFail = 0;
const roundTripTotal = 50;

for (let idx = 0; idx < roundTripTotal; idx++) {
  const lineIdx = idx * step;
  if (lineIdx >= disasmLines.length) break;
  const line = disasmLines[lineIdx];

  try {
    const ir = parseDisasmToIR(line);
    if (!ir) {
      // Skip lines that don't parse (comments, empty)
      roundTripPass++;
      continue;
    }

    const sem = ir.semantics;

    // Collect all reads across all effects
    const allReads = new Set();
    for (const eff of sem.effects) {
      for (const r of eff.reads) {
        if (r && r !== 'Q') allReads.add(r);
      }
    }

    // Collect all register operands (excluding dest positions and K operands)
    const opTypes = OPERAND_TYPES[ir.opcode];
    const registerOperands = new Set();

    if (opTypes) {
      for (let j = 0; j < ir.operands.length && j < opTypes.length; j++) {
        if (opTypes[j] === 'R' && ir.operands[j].startsWith('r')) {
          registerOperands.add(ir.operands[j]);
        }
      }
    }

    // For simple opcodes: all reads should be a subset of register operands
    // (dest registers may or may not be in reads, e.g., NOT r10 r10 reads from r10 which is also dest)
    // Check: reads should only contain register operands from the instruction
    let valid = true;
    for (const r of allReads) {
      if (!registerOperands.has(r)) {
        valid = false;
        break;
      }
    }

    if (valid) {
      roundTripPass++;
    } else {
      roundTripFail++;
      // Not a hard failure for compound/special opcodes
    }
  } catch (e) {
    roundTripFail++;
  }
}

const roundTripPct = Math.round(100 * roundTripPass / roundTripTotal);
assert(roundTripPct >= 90, `Round-trip consistency: ${roundTripPct}% (${roundTripPass}/${roundTripTotal}) should be >= 90%`);
console.log(`  Round-trip: ${roundTripPass}/${roundTripTotal} (${roundTripPct}%)`);

// ============================================================================
// Section 9: Module purity check
// ============================================================================

console.log('\n=== 9. Module purity check ===');

const semanticsSource = fs.readFileSync(path.join(__dirname, '..', 'decompiler', 'opcode-semantics.js'), 'utf-8');
assert(!semanticsSource.match(/\bfs\b.*require/), 'opcode-semantics.js should not require fs');
assert(!semanticsSource.match(/readFileSync|writeFileSync|readFile|writeFile/),
  'opcode-semantics.js should not use file I/O functions');

// ============================================================================
// Section 10: spot-check output exists and is readable
// ============================================================================

console.log('\n=== 10. Spot-check output file ===');

const spotCheckPath = path.join(__dirname, '..', 'output', 'semantics-spot-check.txt');
assert(fs.existsSync(spotCheckPath), 'semantics-spot-check.txt should exist');
const spotCheck = fs.readFileSync(spotCheckPath, 'utf-8');
assert(spotCheck.length > 500, 'semantics-spot-check.txt should have substantial content');
assert(spotCheck.includes('ADD'), 'spot-check should include ADD');
assert(spotCheck.includes('CJMP'), 'spot-check should include CJMP');
assert(spotCheck.includes('string_init'), 'spot-check should mention string_init');
assert(spotCheck.includes('func_create') || spotCheck.includes('FUNC_CREATE'), 'spot-check should mention func_create or FUNC_CREATE');

// ============================================================================
// Section 11: Verify specific tdc.js ground truth details
// ============================================================================

console.log('\n=== 11. tdc.js ground truth spot-checks ===');

// Op 7 (RET_CLEANUP): tdc.js says F.pop(); i[Y[++C]] = Q; return i[Y[++C]];
// So: try_pop (no dest) + load Q into register + return
{
  const sem = getSemantics(7, ['r5', 'r8']);
  assertEq(sem.effects.length, 3, 'Op 7 RET_CLEANUP: 3 effects');
  assertEq(sem.effects[0].expr.type, 'try_pop', 'Op 7: effect[0] is try_pop');
  assertEq(sem.effects[1].dest, 'r5', 'Op 7: effect[1] dest is r5 (Q load)');
  assertEq(sem.effects[1].expr.reg, 'Q', 'Op 7: effect[1] loads Q');
  assertEq(sem.effects[2].expr.type, 'return', 'Op 7: effect[2] is return');
  assertEq(sem.effects[2].expr.value.reg, 'r8', 'Op 7: return value is r8');
}

// Op 24 (RET): tdc.js case 24: `i[Y[++C]] = Q; return i[Y[++C]];`
// Ground truth: R(a) = Q (register gets Q), then return R(b)
// Consistent with ops 7 and 75 which also do `i[Y[++C]] = Q`
{
  const sem = getSemantics(24, ['r5', 'r8']);
  assertEq(sem.effects[0].dest, 'r5', 'Op 24 (RET): effect[0] dest should be r5 (R(a) = Q per tdc.js)');
  assertEq(sem.effects[0].expr.type, 'register', 'Op 24 (RET): effect[0] expr type should be register');
  assertEq(sem.effects[0].expr.reg, 'Q', 'Op 24 (RET): effect[0] loads Q');
  assert(sem.effects[0].reads.includes('Q'), 'Op 24 (RET): effect[0] reads should include Q');
  assertEq(sem.effects[1].expr.type, 'return', 'Op 24 (RET): effect[1] is return');
  assertEq(sem.effects[1].expr.value.reg, 'r8', 'Op 24 (RET): return value is r8');
}

// Op 46 (SET_RET): tdc.js: i[Y[++C]][Y[++C]] = i[Y[++C]]; return i[Y[++C]];
// Operands: R(a), K(prop), R(val), R(retval) — RKRR
// But OPERAND_TYPES says 'RKRR'
{
  const sem = getSemantics(46, ['r5', '42', 'r8', 'r9']);
  assertEq(sem.effects.length, 2, 'Op 46 SET_RET: 2 effects');
  assertEq(sem.effects[0].expr.type, 'prop_set', 'Op 46 effect[0]: prop_set');
  assertEq(sem.effects[1].expr.type, 'return', 'Op 46 effect[1]: return');
  assertEq(sem.effects[1].expr.value.reg, 'r9', 'Op 46: return value is r9');
}

// Op 75 (SET_RET_Q): tdc.js: i[Y[++C]][i[Y[++C]]] = i[Y[++C]]; i[Y[++C]] = Q; return i[Y[++C]];
{
  const sem = getSemantics(75, ['r1', 'r2', 'r3', 'r4', 'r5']);
  assertEq(sem.effects.length, 3, 'Op 75 SET_RET_Q: 3 effects');
  assertEq(sem.effects[0].expr.type, 'prop_set', 'Op 75 effect[0]: prop_set');
  // tdc.js: i[Y[++C]] = Q → r4 = Q (register gets Q)
  // Implementation has dest=r4, expr={type:'register', reg:'Q'}
  assertEq(sem.effects[1].dest, 'r4', 'Op 75 effect[1]: dest is r4');
  assertEq(sem.effects[1].expr.reg, 'Q', 'Op 75 effect[1]: loads Q');
  assertEq(sem.effects[2].expr.type, 'return', 'Op 75 effect[2]: return');
}

// Op 84 (ITER_SHIFT): tdc.js: h=R(a); if (R(b) = !!h.length) R(c) = h.shift(); else ++C
{
  const sem = getSemantics(84, ['r10', 'r11', 'r12']);
  assertEq(sem.effects.length, 2, 'Op 84 ITER_SHIFT: 2 effects');
  assertEq(sem.effects[0].expr.type, 'iter_shift', 'Op 84 effect[0]: iter_shift');
  assertEq(sem.effects[1].expr.type, 'iter_shift', 'Op 84 effect[1]: iter_shift');
  assertEq(sem.effects[0].dest, 'r11', 'Op 84 effect[0]: dest is r11 (hasMore)');
  assertEq(sem.effects[1].dest, 'r12', 'Op 84 effect[1]: dest is r12 (shiftValue)');
}

// Op 56 (APPLY): tdc.js: h=[]; for(w=Y[++C]; w>0; w--) h.push(i[Y[++C]]); i[Y[++C]] = i[Y[++C]].apply(i[Y[++C]], h);
{
  const sem = getSemantics(56, ['2', 'r10', 'r11', 'r12', 'r13', 'r14']);
  assertEq(sem.effects.length, 1, 'Op 56 APPLY: 1 effect');
  assertEq(sem.effects[0].expr.type, 'call', 'Op 56: call type');
  assert(sem.effects[0].expr.isApply === true, 'Op 56: isApply flag');
  assertEq(sem.effects[0].expr.args.length, 2, 'Op 56: 2 args for argCount=2');
  assertEq(sem.effects[0].dest, 'r12', 'Op 56: dest is r12');
  assertEq(sem.effects[0].expr.fn.reg, 'r13', 'Op 56: fn is r13');
  assertEq(sem.effects[0].expr.thisArg.reg, 'r14', 'Op 56: thisArg is r14');
}

// Op 62 (ENUMERATE): tdc.js: h = []; for(w in i[Y[++C]]) h.push(w); i[Y[++C]] = h;
{
  const sem = getSemantics(62, ['r10', 'r11']);
  assertEq(sem.effects.length, 1, 'Op 62 ENUMERATE: 1 effect');
  assertEq(sem.effects[0].expr.type, 'enumerate', 'Op 62: enumerate type');
  assertEq(sem.effects[0].dest, 'r11', 'Op 62: dest is r11');
  assert(sem.effects[0].reads.includes('r10'), 'Op 62: reads r10 (source object)');
}

// Op 86 (PROP_GET_K_2): tdc.js: i[Y[++C]] = i[Y[++C]][Y[++C]]; i[Y[++C]] = i[Y[++C]][Y[++C]];
{
  const sem = getSemantics(86, ['r1', 'r2', '42', 'r4', 'r5', '99']);
  assertEq(sem.effects.length, 2, 'Op 86 PROP_GET_K_2: 2 effects');
  assertEq(sem.effects[0].expr.type, 'prop_get', 'Op 86 effect[0]: prop_get');
  assertEq(sem.effects[1].expr.type, 'prop_get', 'Op 86 effect[1]: prop_get');
  assertEq(sem.effects[0].dest, 'r1', 'Op 86: effect[0] dest is r1');
  assertEq(sem.effects[1].dest, 'r4', 'Op 86: effect[1] dest is r4');
}

// Op 88 (EXC_TRY): tdc.js: i[Y[++C]] = G; i[Y[++C]] = i[Y[++C]]; F.push(C + Y[++C]);
{
  const sem = getSemantics(88, ['r1', 'r2', 'r3', '100']);
  assertEq(sem.effects.length, 3, 'Op 88 EXC_TRY: 3 effects');
  assertEq(sem.effects[0].expr.type, 'load_exception', 'Op 88 effect[0]: load_exception');
  assertEq(sem.effects[0].dest, 'r1', 'Op 88 effect[0]: dest is r1');
  assertEq(sem.effects[1].expr.type, 'register', 'Op 88 effect[1]: register copy');
  assertEq(sem.effects[2].expr.type, 'try_push', 'Op 88 effect[2]: try_push');
}

// ============================================================================
// Section 12: parseDisasmToIR integration
// ============================================================================

console.log('\n=== 12. parseDisasmToIR integration ===');

{
  const line = findLine('ADD');
  const ir = parseDisasmToIR(line);
  assert(ir !== null, 'parseDisasmToIR returns non-null for ADD');
  assert(typeof ir.pc === 'number', 'ir.pc should be a number');
  assert(typeof ir.opcode === 'number', 'ir.opcode should be a number');
  assertEq(ir.opName, 'ADD', 'ir.opName should be ADD');
  assert(Array.isArray(ir.operands), 'ir.operands should be an array');
  assert(ir.semantics !== null, 'ir.semantics should not be null');
  assert(Array.isArray(ir.semantics.effects), 'ir.semantics.effects should be an array');
}

// Test that parseDisasmToIR works on real disassembly lines from every category
for (const mnemonic of ['SUB', 'XOR', 'SEQ', 'NOT', 'TYPEOF', 'PROP_GET', 'PROP_SET', 'OBJ_NEW',
  'CALL_0', 'CALL_1', 'CALLQ_1', 'STR_EMPTY', 'STR_APPEND', 'JMP', 'CJMP', 'THROW',
  'TRY_POP', 'CATCH_PUSH', 'MOV', 'LOAD_K', 'LOAD_NULL', 'LOAD_THIS', 'LOAD_EXCEPTION',
  'ENUMERATE', 'NEW_0', 'NEW_1', 'ARRAY', 'DELETE', 'IN']) {
  const line = findLine(mnemonic);
  if (!line) continue;
  try {
    const ir = parseDisasmToIR(line);
    assert(ir !== null, `parseDisasmToIR(${mnemonic}): non-null`);
  } catch (e) {
    assert(false, `parseDisasmToIR(${mnemonic}): threw ${e.message}`);
  }
}

// ============================================================================
// Section 13: Terminator classification in OPCODE_TABLE
// ============================================================================

console.log('\n=== 13. Terminator classification ===');

const expectedTerminators = [7, 24, 37, 38, 46, 60, 75, 87];
for (let op = 0; op <= 94; op++) {
  const expected = expectedTerminators.includes(op);
  assertEq(OPCODE_TABLE[op].isTerminator, expected,
    `op ${op} (${OPCODE_TABLE[op].name}): isTerminator should be ${expected}`);
}

// ============================================================================
// SUMMARY
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`TOTAL: ${passedAssertions}/${totalAssertions} passed, ${failedAssertions} failed`);
console.log('='.repeat(60));

if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}

process.exit(failedAssertions > 0 ? 1 : 0);
