'use strict';

/**
 * ChaosVM Opcode Semantics Module
 *
 * Maps every ChaosVM opcode (0–94) to a structured semantic description:
 * what registers it reads, what it defines, and what JS expression it represents.
 *
 * This module is STATELESS — getSemantics(opcode, operands) is a pure function.
 * No register tracking, no cross-instruction state. That comes in Task 3.2.
 *
 * Operand arrays come from parsing disassembly lines. Each operand is either:
 *   - A register string like "r5" (type 'R' in OPERAND_TYPES)
 *   - A numeric string like "119" or "-5411" (type 'K' in OPERAND_TYPES)
 *
 * The OPERAND_TYPES map from the disassembler tells us which positions are R vs K.
 */

// Import parseDisasmLine from cfg-builder to avoid duplicating parsing logic
const { parseDisasmLine } = require('./cfg-builder');

// ============================================================================
// OPCODE_TABLE: metadata for all 95 opcodes
// ============================================================================

/**
 * Opcode metadata table.
 * Each entry: { name, category, operandCount, isTerminator, isCompound }
 *
 * operandCount: fixed count, or null for variable-width opcodes (12, 23, 55, 56)
 * isTerminator: true if this opcode ends a basic block
 * isCompound: true if this opcode produces multiple effects
 */
const OPCODE_TABLE = {
  0:  { name: 'ADD',            category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  1:  { name: 'IN',             category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
  2:  { name: 'DIV',            category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  3:  { name: 'XOR',            category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  4:  { name: 'MUL',            category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  5:  { name: 'CALL_COMPLEX',   category: 'call',       operandCount: 7, isTerminator: false, isCompound: true },
  6:  { name: 'SHR_K',          category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  7:  { name: 'RET_CLEANUP',    category: 'control',    operandCount: 2, isTerminator: true,  isCompound: true },
  8:  { name: 'AND_K',          category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  9:  { name: 'DELETE',         category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
  10: { name: 'COPY_SET',       category: 'object',     operandCount: 5, isTerminator: false, isCompound: true },
  11: { name: 'INC_BIGINT',     category: 'arithmetic', operandCount: 6, isTerminator: false, isCompound: true },
  12: { name: 'FUNC_CREATE_A',  category: 'function',   operandCount: null, isTerminator: false, isCompound: true },
  13: { name: 'GT',             category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  14: { name: 'PROP_SET',       category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
  15: { name: 'DEC',            category: 'arithmetic', operandCount: 2, isTerminator: false, isCompound: false },
  16: { name: 'CALL_3',         category: 'call',       operandCount: 6, isTerminator: false, isCompound: false },
  17: { name: 'PROP_GET',       category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
  18: { name: 'OBJ_NEW',        category: 'object',     operandCount: 1, isTerminator: false, isCompound: false },
  19: { name: 'STR_APPEND_2',   category: 'string',     operandCount: 4, isTerminator: false, isCompound: true },
  20: { name: 'PROP_CALL_1',    category: 'call',       operandCount: 7, isTerminator: false, isCompound: true },
  21: { name: 'LE_K',           category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  22: { name: 'SEQ',            category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  23: { name: 'FUNC_CREATE_B',  category: 'function',   operandCount: null, isTerminator: false, isCompound: true },
  24: { name: 'RET',            category: 'control',    operandCount: 2, isTerminator: true,  isCompound: true },
  25: { name: 'CALL_0',         category: 'call',       operandCount: 3, isTerminator: false, isCompound: false },
  26: { name: 'NEW_2',          category: 'object',     operandCount: 4, isTerminator: false, isCompound: false },
  27: { name: 'USHR_K',         category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  28: { name: 'LT',             category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  29: { name: 'PROP_GET_CONST', category: 'object',     operandCount: 5, isTerminator: false, isCompound: true },
  30: { name: 'INC',            category: 'arithmetic', operandCount: 2, isTerminator: false, isCompound: false },
  31: { name: 'STR_INIT',       category: 'string',     operandCount: 3, isTerminator: false, isCompound: true },
  32: { name: 'SUB',            category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  33: { name: 'TRY_PUSH',       category: 'control',    operandCount: 3, isTerminator: false, isCompound: true },
  34: { name: 'TYPEOF',         category: 'type',       operandCount: 2, isTerminator: false, isCompound: false },
  35: { name: 'OR_K',           category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  36: { name: 'LOAD_NULL',      category: 'load',       operandCount: 1, isTerminator: false, isCompound: false },
  37: { name: 'THROW',          category: 'control',    operandCount: 1, isTerminator: true,  isCompound: false },
  38: { name: 'JMP',            category: 'control',    operandCount: 1, isTerminator: true,  isCompound: false },
  39: { name: 'MOD',            category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  40: { name: 'TO_NUMBER',      category: 'arithmetic', operandCount: 2, isTerminator: false, isCompound: false },
  41: { name: 'SET_GET_CONST',  category: 'object',     operandCount: 8, isTerminator: false, isCompound: true },
  42: { name: 'LOAD_EXCEPTION', category: 'exception',  operandCount: 1, isTerminator: false, isCompound: false },
  43: { name: 'GE_K',           category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  44: { name: 'SUB_K',          category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  45: { name: 'PROP_GET_K',     category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
  46: { name: 'SET_RET',        category: 'control',    operandCount: 4, isTerminator: true,  isCompound: true },
  47: { name: 'LOAD_K',         category: 'load',       operandCount: 2, isTerminator: false, isCompound: false },
  48: { name: 'SHL_K',          category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  49: { name: 'LT_K',           category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  50: { name: 'CALLQ_3',        category: 'call',       operandCount: 5, isTerminator: false, isCompound: false },
  51: { name: 'SHR',            category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  52: { name: 'CALL_1',         category: 'call',       operandCount: 4, isTerminator: false, isCompound: false },
  53: { name: 'NEG',            category: 'arithmetic', operandCount: 2, isTerminator: false, isCompound: false },
  54: { name: 'STR_OBJ_STR',    category: 'string',     operandCount: 4, isTerminator: false, isCompound: true },
  55: { name: 'FUNC_CREATE_C',  category: 'function',   operandCount: null, isTerminator: false, isCompound: true },
  56: { name: 'APPLY',          category: 'call',       operandCount: null, isTerminator: false, isCompound: false },
  57: { name: 'SEQ_K',          category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  58: { name: 'OR',             category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  59: { name: 'PROP_SET_K',     category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
  60: { name: 'RET_BARE',       category: 'control',    operandCount: 1, isTerminator: true,  isCompound: false },
  61: { name: 'CALL_2',         category: 'call',       operandCount: 5, isTerminator: false, isCompound: false },
  62: { name: 'ENUMERATE',      category: 'object',     operandCount: 2, isTerminator: false, isCompound: false },
  63: { name: 'CALLQ_2',        category: 'call',       operandCount: 4, isTerminator: false, isCompound: false },
  64: { name: 'STR_PROP',       category: 'string',     operandCount: 5, isTerminator: false, isCompound: true },
  65: { name: 'STR_SET_STR',    category: 'string',     operandCount: 6, isTerminator: false, isCompound: true },
  66: { name: 'GT_K',           category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  67: { name: 'STR_APPEND',     category: 'string',     operandCount: 2, isTerminator: false, isCompound: false },
  68: { name: 'NOT',            category: 'logic',      operandCount: 2, isTerminator: false, isCompound: false },
  69: { name: 'ARRAY_2',        category: 'object',     operandCount: 4, isTerminator: false, isCompound: true },
  70: { name: 'CALLQ_1_COPY',   category: 'call',       operandCount: 5, isTerminator: false, isCompound: true },
  71: { name: 'UPLUS',          category: 'arithmetic', operandCount: 2, isTerminator: false, isCompound: false },
  72: { name: 'PROP_STR',       category: 'string',     operandCount: 6, isTerminator: false, isCompound: true },
  73: { name: 'MOV',            category: 'move',       operandCount: 2, isTerminator: false, isCompound: false },
  74: { name: 'TRY_POP',        category: 'control',    operandCount: 0, isTerminator: false, isCompound: false },
  75: { name: 'SET_RET_Q',      category: 'control',    operandCount: 5, isTerminator: true,  isCompound: true },
  76: { name: 'STR_SET_K',      category: 'string',     operandCount: 5, isTerminator: false, isCompound: true },
  77: { name: 'CALLQ_1',        category: 'call',       operandCount: 3, isTerminator: false, isCompound: false },
  78: { name: 'EQ_K',           category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  79: { name: 'RSUB_K',         category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  80: { name: 'MOV_2',          category: 'move',       operandCount: 4, isTerminator: false, isCompound: true },
  81: { name: 'LOAD_THIS',      category: 'load',       operandCount: 1, isTerminator: false, isCompound: false },
  82: { name: 'SHL',            category: 'bitwise',    operandCount: 3, isTerminator: false, isCompound: false },
  83: { name: 'ARRAY',          category: 'object',     operandCount: 2, isTerminator: false, isCompound: false },
  84: { name: 'ITER_SHIFT',     category: 'iterator',   operandCount: 3, isTerminator: false, isCompound: true },
  85: { name: 'NEW_0',          category: 'object',     operandCount: 2, isTerminator: false, isCompound: false },
  86: { name: 'PROP_GET_K_2',   category: 'object',     operandCount: 6, isTerminator: false, isCompound: true },
  87: { name: 'CJMP',           category: 'control',    operandCount: 3, isTerminator: true,  isCompound: false },
  88: { name: 'EXC_TRY',        category: 'exception',  operandCount: 4, isTerminator: false, isCompound: true },
  89: { name: 'EQ',             category: 'compare',    operandCount: 3, isTerminator: false, isCompound: false },
  90: { name: 'CALLQ_0',        category: 'call',       operandCount: 2, isTerminator: false, isCompound: false },
  91: { name: 'CATCH_PUSH',     category: 'control',    operandCount: 1, isTerminator: false, isCompound: false },
  92: { name: 'ADD_K',          category: 'arithmetic', operandCount: 3, isTerminator: false, isCompound: false },
  93: { name: 'STR_EMPTY',      category: 'string',     operandCount: 1, isTerminator: false, isCompound: false },
  94: { name: 'NEW_1',          category: 'object',     operandCount: 3, isTerminator: false, isCompound: false },
};

// ============================================================================
// Operand type strings (R=register, K=immediate) - from disassembler.js
// ============================================================================

const OPERAND_TYPES = {
  0:  'RRR',       // ADD
  1:  'RRR',       // IN
  2:  'RRR',       // DIV
  3:  'RRR',       // XOR
  4:  'RRR',       // MUL
  5:  'RKRRRRR',   // CALL_COMPLEX
  6:  'RRK',       // SHR_K
  7:  'RR',        // RET_CLEANUP
  8:  'RRK',       // AND_K
  9:  'RRR',       // DELETE
  10: 'RRRRR',     // COPY_SET
  11: 'RRRRRR',    // INC_BIGINT
  12: null,        // FUNC_CREATE_A: variable
  13: 'RRR',       // GT
  14: 'RRR',       // PROP_SET
  15: 'RR',        // DEC
  16: 'RRRRRR',    // CALL_3
  17: 'RRR',       // PROP_GET
  18: 'R',         // OBJ_NEW
  19: 'RKRK',      // STR_APPEND_2
  20: 'RRRRRRR',   // PROP_CALL_1
  21: 'RRK',       // LE_K
  22: 'RRR',       // SEQ
  23: null,        // FUNC_CREATE_B: variable
  24: 'RR',        // RET
  25: 'RRR',       // CALL_0
  26: 'RRRR',      // NEW_2
  27: 'RRK',       // USHR_K
  28: 'RRR',       // LT
  29: 'RRRRK',     // PROP_GET_CONST
  30: 'RR',        // INC
  31: 'RRK',       // STR_INIT: note: operands[0]=dest, operands[1]=same_dest_again, operands[2]=char
  32: 'RRR',       // SUB
  33: 'RRK',       // TRY_PUSH
  34: 'RR',        // TYPEOF
  35: 'RRK',       // OR_K
  36: 'R',         // LOAD_NULL
  37: 'R',         // THROW
  38: 'K',         // JMP
  39: 'RRR',       // MOD
  40: 'RR',        // TO_NUMBER
  41: 'RRRRRRRK',  // SET_GET_CONST
  42: 'R',         // LOAD_EXCEPTION
  43: 'RRK',       // GE_K
  44: 'RRK',       // SUB_K
  45: 'RRK',       // PROP_GET_K
  46: 'RKRR',      // SET_RET
  47: 'RK',        // LOAD_K
  48: 'RRK',       // SHL_K
  49: 'RRK',       // LT_K
  50: 'RRRRR',     // CALLQ_3
  51: 'RRR',       // SHR
  52: 'RRRR',      // CALL_1
  53: 'RR',        // NEG
  54: 'RKRR',      // STR_OBJ_STR
  55: null,        // FUNC_CREATE_C: variable
  56: null,        // APPLY: variable
  57: 'RRK',       // SEQ_K
  58: 'RRR',       // OR
  59: 'RKR',       // PROP_SET_K
  60: 'R',         // RET_BARE
  61: 'RRRRR',     // CALL_2
  62: 'RR',        // ENUMERATE
  63: 'RRRR',      // CALLQ_2
  64: 'RKRRR',     // STR_PROP
  65: 'RKRKRR',    // STR_SET_STR
  66: 'RRK',       // GT_K
  67: 'RK',        // STR_APPEND
  68: 'RR',        // NOT
  69: 'RKRK',      // ARRAY_2
  70: 'RRRRR',     // CALLQ_1_COPY
  71: 'RR',        // UPLUS
  72: 'RRRRRK',    // PROP_STR
  73: 'RR',        // MOV
  74: '',          // TRY_POP: 0 operands
  75: 'RRRRR',     // SET_RET_Q
  76: 'RKRKR',     // STR_SET_K
  77: 'RRR',       // CALLQ_1
  78: 'RRK',       // EQ_K
  79: 'RKR',       // RSUB_K
  80: 'RRRR',      // MOV_2
  81: 'R',         // LOAD_THIS
  82: 'RRR',       // SHL
  83: 'RK',        // ARRAY
  84: 'RRR',       // ITER_SHIFT
  85: 'RR',        // NEW_0
  86: 'RRKRRK',    // PROP_GET_K_2
  87: 'RKK',       // CJMP
  88: 'RRRK',      // EXC_TRY
  89: 'RRR',       // EQ
  90: 'RR',        // CALLQ_0
  91: 'K',         // CATCH_PUSH
  92: 'RRK',       // ADD_K
  93: 'R',         // STR_EMPTY
  94: 'RRR',       // NEW_1
};

// Reverse mnemonic lookup: name → opcode number
const MNEMONIC_TO_OPCODE = {};
for (const [op, info] of Object.entries(OPCODE_TABLE)) {
  MNEMONIC_TO_OPCODE[info.name] = parseInt(op, 10);
}

// ============================================================================
// Helper: parse operand string into { type, value }
// ============================================================================

/**
 * Parse an operand string from disassembly into a typed representation.
 * "r5" → { isReg: true, reg: "r5", num: 5 }
 * "119" → { isReg: false, value: 119 }
 */
function parseOperand(str) {
  str = str.trim();
  if (str.startsWith('r')) {
    const num = parseInt(str.slice(1), 10);
    return { isReg: true, reg: str, num };
  }
  return { isReg: false, value: parseInt(str, 10) };
}

/**
 * Build a register expression node.
 */
function regNode(regStr) {
  return { type: 'register', reg: regStr };
}

/**
 * Build a literal expression node.
 */
function litNode(value) {
  return { type: 'literal', value };
}

/**
 * Build a char literal node for string operations.
 */
function charNode(charCode) {
  return { type: 'literal', value: String.fromCharCode(charCode), charCode };
}

// ============================================================================
// getSemantics(opcode, operands) → SemanticsResult
// ============================================================================

/**
 * Given an opcode number (0–94) and its operand array (strings from disassembly),
 * return a structured semantic description.
 *
 * @param {number} opcode - The opcode number (0–94)
 * @param {string[]} operands - Operand strings, e.g. ["r8", "r9", "r10"] or ["r11", "119"]
 * @returns {{ effects: Array<{ dest: string|null, expr: object, reads: string[] }> }}
 */
function getSemantics(opcode, operands) {
  // Parse all operands into typed representations
  const ops = operands.map(parseOperand);

  // Helper: get register name at position, or null
  const reg = (i) => ops[i] && ops[i].isReg ? ops[i].reg : null;
  // Helper: get value at position (for K operands)
  const val = (i) => ops[i] && !ops[i].isReg ? ops[i].value : (ops[i] ? ops[i].num : undefined);
  // Helper: get raw parsed operand
  const op = (i) => ops[i];

  switch (opcode) {
    // ======================================================================
    // ARITHMETIC (binary, register operands)
    // ======================================================================

    // 0: ADD  R(a) = R(b) + R(c)
    case 0: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '+', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 2: DIV  R(a) = R(b) / R(c)
    case 2: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '/', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 3: XOR  R(a) = R(b) ^ R(c)
    case 3: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '^', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 4: MUL  R(a) = R(b) * R(c)
    case 4: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '*', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 32: SUB  R(a) = R(b) - R(c)
    case 32: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '-', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 39: MOD  R(a) = R(b) % R(c)
    case 39: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '%', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // ======================================================================
    // ARITHMETIC (with immediate K operand)
    // ======================================================================

    // 92: ADD_K  R(a) = R(b) + K(c)
    case 92: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '+', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 44: SUB_K  R(a) = R(b) - K(c)
    case 44: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '-', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 79: RSUB_K  R(a) = K(b) - R(c)
    case 79: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '-', left: litNode(val(1)), right: regNode(reg(2)) }, reads: [reg(2)] }] };

    // ======================================================================
    // BITWISE (register operands)
    // ======================================================================

    // 51: SHR  R(a) = R(b) >> R(c)
    case 51: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '>>', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 82: SHL  R(a) = R(b) << R(c)
    case 82: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '<<', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 58: OR  R(a) = R(b) | R(c)
    case 58: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '|', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // ======================================================================
    // BITWISE (with immediate K operand)
    // ======================================================================

    // 6: SHR_K  R(a) = R(b) >> K(c)
    case 6: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '>>', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 8: AND_K  R(a) = R(b) & K(c)
    case 8: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '&', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 27: USHR_K  R(a) = R(b) >>> K(c)
    case 27: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '>>>', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 35: OR_K  R(a) = R(b) | K(c)
    case 35: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '|', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 48: SHL_K  R(a) = R(b) << K(c)
    case 48: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '<<', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // ======================================================================
    // COMPARE (register operands)
    // ======================================================================

    // 13: GT  R(a) = R(b) > R(c)
    case 13: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '>', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 28: LT  R(a) = R(b) < R(c)
    case 28: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '<', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 22: SEQ  R(a) = R(b) === R(c)
    case 22: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '===', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 89: EQ  R(a) = R(b) == R(c)
    case 89: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '==', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // ======================================================================
    // COMPARE (with immediate K operand)
    // ======================================================================

    // 21: LE_K  R(a) = R(b) <= K(c)
    case 21: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '<=', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 43: GE_K  R(a) = R(b) >= K(c)
    case 43: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '>=', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 49: LT_K  R(a) = R(b) < K(c)
    case 49: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '<', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 57: SEQ_K  R(a) = R(b) === K(c)
    case 57: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '===', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 66: GT_K  R(a) = R(b) > K(c)
    case 66: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '>', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // 78: EQ_K  R(a) = R(b) == K(c)
    case 78: return { effects: [{ dest: reg(0), expr: { type: 'binop', op: '==', left: regNode(reg(1)), right: litNode(val(2)) }, reads: [reg(1)] }] };

    // ======================================================================
    // UNARY
    // ======================================================================

    // 53: NEG  R(a) = -R(b)
    case 53: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: '-', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // 68: NOT  R(a) = !R(b)
    case 68: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: '!', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // 34: TYPEOF  R(a) = typeof R(b)
    case 34: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: 'typeof', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // 71: UPLUS  R(a) = +R(b)
    case 71: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: '+', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // 15: DEC  R(a) = --R(b)
    case 15: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: '--', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // 30: INC  R(a) = ++R(b)
    case 30: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: '++', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // 40: TO_NUMBER  R(a) = toNumber(R(b)) — BigInt-aware
    case 40: return { effects: [{ dest: reg(0), expr: { type: 'unop', op: 'toNumber', operand: regNode(reg(1)) }, reads: [reg(1)] }] };

    // ======================================================================
    // OBJECT / PROPERTY
    // ======================================================================

    // 1: IN  R(a) = R(b) in R(c)
    case 1: return { effects: [{ dest: reg(0), expr: { type: 'in', left: regNode(reg(1)), right: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 9: DELETE  R(a) = delete R(b)[R(c)]
    case 9: return { effects: [{ dest: reg(0), expr: { type: 'delete', object: regNode(reg(1)), property: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 17: PROP_GET  R(a) = R(b)[R(c)]
    case 17: return { effects: [{ dest: reg(0), expr: { type: 'prop_get', object: regNode(reg(1)), property: regNode(reg(2)) }, reads: [reg(1), reg(2)] }] };

    // 45: PROP_GET_K  R(a) = R(b)[K(c)]
    case 45: return { effects: [{ dest: reg(0), expr: { type: 'prop_get', object: regNode(reg(1)), property: litNode(val(2)) }, reads: [reg(1)] }] };

    // 14: PROP_SET  R(a)[R(b)] = R(c)
    case 14: return { effects: [{ dest: null, expr: { type: 'prop_set', object: regNode(reg(0)), property: regNode(reg(1)), value: regNode(reg(2)) }, reads: [reg(0), reg(1), reg(2)] }] };

    // 59: PROP_SET_K  R(a)[K(b)] = R(c)
    case 59: return { effects: [{ dest: null, expr: { type: 'prop_set', object: regNode(reg(0)), property: litNode(val(1)), value: regNode(reg(2)) }, reads: [reg(0), reg(2)] }] };

    // 18: OBJ_NEW  R(a) = {}
    case 18: return { effects: [{ dest: reg(0), expr: { type: 'object' }, reads: [] }] };

    // 83: ARRAY  R(a) = Array(K)
    case 83: return { effects: [{ dest: reg(0), expr: { type: 'array', size: val(1) }, reads: [] }] };

    // 62: ENUMERATE  h = keys(R(a)); R(b) = h
    case 62: return { effects: [{ dest: reg(1), expr: { type: 'enumerate', object: regNode(reg(0)) }, reads: [reg(0)] }] };

    // ======================================================================
    // LOAD / MOVE
    // ======================================================================

    // 36: LOAD_NULL  R(a) = null
    case 36: return { effects: [{ dest: reg(0), expr: { type: 'literal', value: null }, reads: [] }] };

    // 47: LOAD_K  R(a) = K(b)
    case 47: return { effects: [{ dest: reg(0), expr: { type: 'literal', value: val(1) }, reads: [] }] };

    // 81: LOAD_THIS  R(a) = Q
    case 81: return { effects: [{ dest: reg(0), expr: { type: 'register', reg: 'Q' }, reads: ['Q'] }] };

    // 42: LOAD_EXCEPTION  R(a) = G
    case 42: return { effects: [{ dest: reg(0), expr: { type: 'load_exception' }, reads: [] }] };

    // 73: MOV  R(a) = R(b)
    case 73: return { effects: [{ dest: reg(0), expr: { type: 'register', reg: reg(1) }, reads: [reg(1)] }] };

    // ======================================================================
    // CALL OPCODES
    // ======================================================================

    // 25: CALL_0  R(a) = R(b).call(R(c))  — no args
    case 25: return { effects: [{ dest: reg(0), expr: { type: 'call', fn: regNode(reg(1)), thisArg: regNode(reg(2)), args: [] }, reads: [reg(1), reg(2)] }] };

    // 52: CALL_1  R(a) = R(b).call(R(c), R(d))  — 1 arg
    case 52: return { effects: [{ dest: reg(0), expr: { type: 'call', fn: regNode(reg(1)), thisArg: regNode(reg(2)), args: [regNode(reg(3))] }, reads: [reg(1), reg(2), reg(3)] }] };

    // 61: CALL_2  R(a) = R(b).call(R(c), R(d), R(e))  — 2 args
    case 61: return { effects: [{ dest: reg(0), expr: { type: 'call', fn: regNode(reg(1)), thisArg: regNode(reg(2)), args: [regNode(reg(3)), regNode(reg(4))] }, reads: [reg(1), reg(2), reg(3), reg(4)] }] };

    // 16: CALL_3  R(a) = R(b).call(R(c), R(d), R(e), R(f))  — 3 args
    case 16: return { effects: [{ dest: reg(0), expr: { type: 'call', fn: regNode(reg(1)), thisArg: regNode(reg(2)), args: [regNode(reg(3)), regNode(reg(4)), regNode(reg(5))] }, reads: [reg(1), reg(2), reg(3), reg(4), reg(5)] }] };

    // 90: CALLQ_0  R(a) = R(b).call(Q)  — no args, Q as this
    case 90: return { effects: [{ dest: reg(0), expr: { type: 'method_call', fn: regNode(reg(1)), thisArg: { type: 'register', reg: 'Q' }, args: [] }, reads: [reg(1), 'Q'] }] };

    // 77: CALLQ_1  R(a) = R(b).call(Q, R(c))  — 1 arg, Q as this
    case 77: return { effects: [{ dest: reg(0), expr: { type: 'method_call', fn: regNode(reg(1)), thisArg: { type: 'register', reg: 'Q' }, args: [regNode(reg(2))] }, reads: [reg(1), 'Q', reg(2)] }] };

    // 63: CALLQ_2  R(a) = R(b).call(Q, R(c), R(d))  — 2 args, Q as this
    case 63: return { effects: [{ dest: reg(0), expr: { type: 'method_call', fn: regNode(reg(1)), thisArg: { type: 'register', reg: 'Q' }, args: [regNode(reg(2)), regNode(reg(3))] }, reads: [reg(1), 'Q', reg(2), reg(3)] }] };

    // 50: CALLQ_3  R(a) = R(b).call(Q, R(c), R(d), R(e))  — 3 args, Q as this
    case 50: return { effects: [{ dest: reg(0), expr: { type: 'method_call', fn: regNode(reg(1)), thisArg: { type: 'register', reg: 'Q' }, args: [regNode(reg(2)), regNode(reg(3)), regNode(reg(4))] }, reads: [reg(1), 'Q', reg(2), reg(3), reg(4)] }] };

    // 85: NEW_0  R(a) = new R(b)
    case 85: return { effects: [{ dest: reg(0), expr: { type: 'new', constructor: regNode(reg(1)), args: [] }, reads: [reg(1)] }] };

    // 94: NEW_1  R(a) = new R(b)(R(c))
    case 94: return { effects: [{ dest: reg(0), expr: { type: 'new', constructor: regNode(reg(1)), args: [regNode(reg(2))] }, reads: [reg(1), reg(2)] }] };

    // 26: NEW_2  R(a) = new R(b)(R(c), R(d))
    case 26: return { effects: [{ dest: reg(0), expr: { type: 'new', constructor: regNode(reg(1)), args: [regNode(reg(2)), regNode(reg(3))] }, reads: [reg(1), reg(2), reg(3)] }] };

    // ======================================================================
    // STRING OPCODES
    // ======================================================================

    // 93: STR_EMPTY  R(a) = ""
    case 93: return { effects: [{ dest: reg(0), expr: { type: 'string_init', value: '' }, reads: [] }] };

    // 31: STR_INIT  R(a) = ""; R(a') += char(K)
    // Operands: R(a), R(a'), K(char) — note a and a' are typically the same register
    case 31: {
      const charCode = val(2);
      const ch = String.fromCharCode(charCode);
      return { effects: [
        { dest: reg(0), expr: { type: 'string_init', value: '' }, reads: [] },
        { dest: reg(1), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(1)] },
      ]};
    }

    // 67: STR_APPEND  R(a) += char(K)
    case 67: {
      const charCode = val(1);
      const ch = String.fromCharCode(charCode);
      return { effects: [{ dest: reg(0), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(0)] }] };
    }

    // 19: STR_APPEND_2  R(a) += char(K); R(b) += char(K)
    // Operands: R(a), K(char1), R(b), K(char2)
    case 19: {
      const char1 = val(1);
      const char2 = val(3);
      return { effects: [
        { dest: reg(0), expr: { type: 'string_append', char: String.fromCharCode(char1), charCode: char1 }, reads: [reg(0)] },
        { dest: reg(2), expr: { type: 'string_append', char: String.fromCharCode(char2), charCode: char2 }, reads: [reg(2)] },
      ]};
    }

    // 54: STR_OBJ_STR  R(a) += char(K); R(b) = {}; R(c) = ""
    // Operands: R(a), K(char), R(b), R(c)
    case 54: {
      const charCode = val(1);
      const ch = String.fromCharCode(charCode);
      return { effects: [
        { dest: reg(0), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(0)] },
        { dest: reg(2), expr: { type: 'object' }, reads: [] },
        { dest: reg(3), expr: { type: 'string_init', value: '' }, reads: [] },
      ]};
    }

    // 64: STR_PROP  R(a) += char(K); R(b) = R(c)[R(d)]
    // Operands: R(a), K(char), R(b), R(c), R(d)
    case 64: {
      const charCode = val(1);
      const ch = String.fromCharCode(charCode);
      return { effects: [
        { dest: reg(0), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(0)] },
        { dest: reg(2), expr: { type: 'prop_get', object: regNode(reg(3)), property: regNode(reg(4)) }, reads: [reg(3), reg(4)] },
      ]};
    }

    // 65: STR_SET_STR  R(a) += char(K); R(b)[K] = R(c); R(d) = ""
    // Operands: R(a), K(char), R(b), K(prop), R(c), R(d)
    case 65: {
      const charCode = val(1);
      const ch = String.fromCharCode(charCode);
      return { effects: [
        { dest: reg(0), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(0)] },
        { dest: null, expr: { type: 'prop_set', object: regNode(reg(2)), property: litNode(val(3)), value: regNode(reg(4)) }, reads: [reg(2), reg(4)] },
        { dest: reg(5), expr: { type: 'string_init', value: '' }, reads: [] },
      ]};
    }

    // 72: PROP_STR  R(a) = R(b)[R(c)]; R(d) = ""; R(d') += char(K)
    // Operands: R(a), R(b), R(c), R(d), R(d'), K(char)
    case 72: {
      const charCode = val(5);
      const ch = String.fromCharCode(charCode);
      return { effects: [
        { dest: reg(0), expr: { type: 'prop_get', object: regNode(reg(1)), property: regNode(reg(2)) }, reads: [reg(1), reg(2)] },
        { dest: reg(3), expr: { type: 'string_init', value: '' }, reads: [] },
        { dest: reg(4), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(4)] },
      ]};
    }

    // 76: STR_SET_K  R(a) += char(K); R(b)[K] = R(c)
    // Operands: R(a), K(char), R(b), K(prop), R(c)
    case 76: {
      const charCode = val(1);
      const ch = String.fromCharCode(charCode);
      return { effects: [
        { dest: reg(0), expr: { type: 'string_append', char: ch, charCode }, reads: [reg(0)] },
        { dest: null, expr: { type: 'prop_set', object: regNode(reg(2)), property: litNode(val(3)), value: regNode(reg(4)) }, reads: [reg(2), reg(4)] },
      ]};
    }

    // ======================================================================
    // COMPOUND OPCODES
    // ======================================================================

    // 5: CALL_COMPLEX  R(a) = K(b); R(c) = R(d).call(Q, R(e)); R(f) = R(g)
    // Operands: R(a), K(b), R(c), R(d), R(e), R(f), R(g)
    case 5: return { effects: [
      { dest: reg(0), expr: { type: 'literal', value: val(1) }, reads: [] },
      { dest: reg(2), expr: { type: 'method_call', fn: regNode(reg(3)), thisArg: { type: 'register', reg: 'Q' }, args: [regNode(reg(4))] }, reads: [reg(3), 'Q', reg(4)] },
      { dest: reg(5), expr: { type: 'register', reg: reg(6) }, reads: [reg(6)] },
    ]};

    // 7: RET_CLEANUP  F.pop(); R(a) = Q; return R(b)
    // Operands: R(a), R(b)
    case 7: return { effects: [
      { dest: null, expr: { type: 'try_pop' }, reads: [] },
      { dest: reg(0), expr: { type: 'register', reg: 'Q' }, reads: ['Q'] },
      { dest: null, expr: { type: 'return', value: regNode(reg(1)) }, reads: [reg(1)] },
    ]};

    // 10: COPY_SET  R(a) = R(b); R(c)[R(d)] = R(e)
    // Operands: R(a), R(b), R(c), R(d), R(e)
    case 10: return { effects: [
      { dest: reg(0), expr: { type: 'register', reg: reg(1) }, reads: [reg(1)] },
      { dest: null, expr: { type: 'prop_set', object: regNode(reg(2)), property: regNode(reg(3)), value: regNode(reg(4)) }, reads: [reg(2), reg(3), reg(4)] },
    ]};

    // 11: INC_BIGINT  R(a) = toNumber(R(b)); R(c) = ++R(d); R(e) = R(f)
    // Operands: R(a), R(b), R(c), R(d), R(e), R(f)
    case 11: return { effects: [
      { dest: reg(0), expr: { type: 'unop', op: 'toNumber', operand: regNode(reg(1)) }, reads: [reg(1)] },
      { dest: reg(2), expr: { type: 'unop', op: '++', operand: regNode(reg(3)) }, reads: [reg(3)] },
      { dest: reg(4), expr: { type: 'register', reg: reg(5) }, reads: [reg(5)] },
    ]};

    // 20: PROP_CALL_1  R(a) = R(b)[R(c)]; R(d) = R(e).call(R(f), R(g))
    // Operands: R(a), R(b), R(c), R(d), R(e), R(f), R(g)
    case 20: return { effects: [
      { dest: reg(0), expr: { type: 'prop_get', object: regNode(reg(1)), property: regNode(reg(2)) }, reads: [reg(1), reg(2)] },
      { dest: reg(3), expr: { type: 'call', fn: regNode(reg(4)), thisArg: regNode(reg(5)), args: [regNode(reg(6))] }, reads: [reg(4), reg(5), reg(6)] },
    ]};

    // 24: RET  R(a) = Q; return R(b)
    // Operands: R(a), R(b)
    // Ground truth (tdc.js line 308): i[Y[++C]] = Q; return i[Y[++C]];
    case 24: return { effects: [
      { dest: reg(0), expr: { type: 'register', reg: 'Q' }, reads: ['Q'] },
      { dest: null, expr: { type: 'return', value: regNode(reg(1)) }, reads: [reg(1)] },
    ]};

    // 29: PROP_GET_CONST  R(a) = R(b)[R(c)]; R(d) = K(e)
    // Operands: R(a), R(b), R(c), R(d), K(e)
    case 29: return { effects: [
      { dest: reg(0), expr: { type: 'prop_get', object: regNode(reg(1)), property: regNode(reg(2)) }, reads: [reg(1), reg(2)] },
      { dest: reg(3), expr: { type: 'literal', value: val(4) }, reads: [] },
    ]};

    // 33: TRY_PUSH  R(a) = R(b); F.push(C + K)
    // Operands: R(a), R(b), K(offset)
    case 33: return { effects: [
      { dest: reg(0), expr: { type: 'register', reg: reg(1) }, reads: [reg(1)] },
      { dest: null, expr: { type: 'try_push', offset: val(2) }, reads: [] },
    ]};

    // 41: SET_GET_CONST  R(a)[R(b)] = R(c); R(d) = R(e)[R(f)]; R(g) = K(h)
    // Operands: R(a), R(b), R(c), R(d), R(e), R(f), R(g), K(h)
    case 41: return { effects: [
      { dest: null, expr: { type: 'prop_set', object: regNode(reg(0)), property: regNode(reg(1)), value: regNode(reg(2)) }, reads: [reg(0), reg(1), reg(2)] },
      { dest: reg(3), expr: { type: 'prop_get', object: regNode(reg(4)), property: regNode(reg(5)) }, reads: [reg(4), reg(5)] },
      { dest: reg(6), expr: { type: 'literal', value: val(7) }, reads: [] },
    ]};

    // 46: SET_RET  R(a)[K] = R(b); return R(c)
    // Operands: R(a), K(prop), R(b), R(c)
    case 46: return { effects: [
      { dest: null, expr: { type: 'prop_set', object: regNode(reg(0)), property: litNode(val(1)), value: regNode(reg(2)) }, reads: [reg(0), reg(2)] },
      { dest: null, expr: { type: 'return', value: regNode(reg(3)) }, reads: [reg(3)] },
    ]};

    // 69: ARRAY_2  R(a) = Array(K); R(b) = Array(K)
    // Operands: R(a), K(size1), R(b), K(size2)
    case 69: return { effects: [
      { dest: reg(0), expr: { type: 'array', size: val(1) }, reads: [] },
      { dest: reg(2), expr: { type: 'array', size: val(3) }, reads: [] },
    ]};

    // 70: CALLQ_1_COPY  R(a) = R(b).call(Q, R(c)); R(d) = R(e)
    // Operands: R(a), R(b), R(c), R(d), R(e)
    case 70: return { effects: [
      { dest: reg(0), expr: { type: 'method_call', fn: regNode(reg(1)), thisArg: { type: 'register', reg: 'Q' }, args: [regNode(reg(2))] }, reads: [reg(1), 'Q', reg(2)] },
      { dest: reg(3), expr: { type: 'register', reg: reg(4) }, reads: [reg(4)] },
    ]};

    // 75: SET_RET_Q  R(a)[R(b)] = R(c); R(d) = Q; return R(e)
    // Operands: R(a), R(b), R(c), R(d), R(e)
    case 75: return { effects: [
      { dest: null, expr: { type: 'prop_set', object: regNode(reg(0)), property: regNode(reg(1)), value: regNode(reg(2)) }, reads: [reg(0), reg(1), reg(2)] },
      { dest: reg(3), expr: { type: 'register', reg: 'Q' }, reads: ['Q'] },
      { dest: null, expr: { type: 'return', value: regNode(reg(4)) }, reads: [reg(4)] },
    ]};

    // 80: MOV_2  R(a) = R(b); R(c) = R(d)
    // Operands: R(a), R(b), R(c), R(d)
    case 80: return { effects: [
      { dest: reg(0), expr: { type: 'register', reg: reg(1) }, reads: [reg(1)] },
      { dest: reg(2), expr: { type: 'register', reg: reg(3) }, reads: [reg(3)] },
    ]};

    // 84: ITER_SHIFT  h = R(a); if (R(b) = !!h.length) R(c) = h.shift(); else ++C
    // Operands: R(a), R(b), R(c)
    case 84: return { effects: [
      { dest: reg(1), expr: { type: 'iter_shift', source: regNode(reg(0)), hasMore: true }, reads: [reg(0)] },
      { dest: reg(2), expr: { type: 'iter_shift', source: regNode(reg(0)), shiftValue: true }, reads: [reg(0)] },
    ]};

    // 86: PROP_GET_K_2  R(a) = R(b)[K]; R(c) = R(d)[K]
    // Operands: R(a), R(b), K(prop1), R(c), R(d), K(prop2)
    case 86: return { effects: [
      { dest: reg(0), expr: { type: 'prop_get', object: regNode(reg(1)), property: litNode(val(2)) }, reads: [reg(1)] },
      { dest: reg(3), expr: { type: 'prop_get', object: regNode(reg(4)), property: litNode(val(5)) }, reads: [reg(4)] },
    ]};

    // 88: EXC_TRY  R(a) = G; R(b) = R(c); F.push(C + K)
    // Operands: R(a), R(b), R(c), K(offset)
    case 88: return { effects: [
      { dest: reg(0), expr: { type: 'load_exception' }, reads: [] },
      { dest: reg(1), expr: { type: 'register', reg: reg(2) }, reads: [reg(2)] },
      { dest: null, expr: { type: 'try_push', offset: val(3) }, reads: [] },
    ]};

    // ======================================================================
    // CONTROL FLOW
    // ======================================================================

    // 37: THROW  throw R(a)
    case 37: return { effects: [{ dest: null, expr: { type: 'throw', value: regNode(reg(0)) }, reads: [reg(0)] }] };

    // 38: JMP  C += K(a)
    case 38: return { effects: [{ dest: null, expr: { type: 'jmp', offset: val(0) }, reads: [] }] };

    // 60: RET_BARE  return R(a)
    case 60: return { effects: [{ dest: null, expr: { type: 'return', value: regNode(reg(0)) }, reads: [reg(0)] }] };

    // 74: TRY_POP  F.pop()
    case 74: return { effects: [{ dest: null, expr: { type: 'try_pop' }, reads: [] }] };

    // 87: CJMP  C += R(a) ? K(b) : K(c)
    case 87: return { effects: [{ dest: null, expr: { type: 'cjmp', condition: regNode(reg(0)), trueOffset: val(1), falseOffset: val(2) }, reads: [reg(0)] }] };

    // 91: CATCH_PUSH  F.push(C + K)
    case 91: return { effects: [{ dest: null, expr: { type: 'catch_push', offset: val(0) }, reads: [] }] };

    // ======================================================================
    // FUNCTION CREATION (variable-width)
    // ======================================================================

    // 12: FUNC_CREATE_A
    // Disasm format: FUNC_CREATE_A  R(str), K(char), K(count), [R(cap)...], R(dest), K(offset), K(arity), R(obj), R(prop), R(val)
    // Effects: str_append + func_create + prop_set
    case 12: {
      const strReg = reg(0);
      const charCode = val(1);
      const ch = String.fromCharCode(charCode);
      const closureCount = val(2);
      // Closure vars: operands[3..3+closureCount-1]
      const closureVars = [];
      for (let j = 0; j < closureCount; j++) {
        closureVars.push(reg(3 + j));
      }
      const base = 3 + closureCount;
      const destReg = reg(base);
      const offset = val(base + 1);
      const arity = val(base + 2);
      const objReg = reg(base + 3);
      const propReg = reg(base + 4);
      const valReg = reg(base + 5);
      return { effects: [
        { dest: strReg, expr: { type: 'string_append', char: ch, charCode }, reads: [strReg] },
        { dest: destReg, expr: { type: 'func_create', offset, arity, closureVars: closureVars.map(r => regNode(r)) }, reads: closureVars.filter(r => r !== null) },
        { dest: null, expr: { type: 'prop_set', object: regNode(objReg), property: regNode(propReg), value: regNode(valReg) }, reads: [objReg, propReg, valReg].filter(r => r !== null) },
      ]};
    }

    // 23: FUNC_CREATE_B
    // Disasm format: FUNC_CREATE_B  R(obj), K(prop), R(val), K(count), [R(cap)...], R(dest), K(offset), K(arity), R(obj2), K(prop2), R(val2)
    // Effects: prop_set(K) + func_create + prop_set(K)
    case 23: {
      const objReg1 = reg(0);
      const prop1 = val(1);
      const valReg1 = reg(2);
      const closureCount = val(3);
      const closureVars = [];
      for (let j = 0; j < closureCount; j++) {
        closureVars.push(reg(4 + j));
      }
      const base = 4 + closureCount;
      const destReg = reg(base);
      const offset = val(base + 1);
      const arity = val(base + 2);
      const objReg2 = reg(base + 3);
      const prop2 = val(base + 4);
      const valReg2 = reg(base + 5);
      return { effects: [
        { dest: null, expr: { type: 'prop_set', object: regNode(objReg1), property: litNode(prop1), value: regNode(valReg1) }, reads: [objReg1, valReg1].filter(r => r !== null) },
        { dest: destReg, expr: { type: 'func_create', offset, arity, closureVars: closureVars.map(r => regNode(r)) }, reads: closureVars.filter(r => r !== null) },
        { dest: null, expr: { type: 'prop_set', object: regNode(objReg2), property: litNode(prop2), value: regNode(valReg2) }, reads: [objReg2, valReg2].filter(r => r !== null) },
      ]};
    }

    // 55: FUNC_CREATE_C
    // Disasm format: FUNC_CREATE_C  K(count), [R(cap)...], R(dest), K(offset), K(arity)
    // Effects: func_create (standalone)
    case 55: {
      const closureCount = val(0);
      const closureVars = [];
      for (let j = 0; j < closureCount; j++) {
        closureVars.push(reg(1 + j));
      }
      const base = 1 + closureCount;
      const destReg = reg(base);
      const offset = val(base + 1);
      const arity = val(base + 2);
      return { effects: [
        { dest: destReg, expr: { type: 'func_create', offset, arity, closureVars: closureVars.map(r => regNode(r)) }, reads: closureVars.filter(r => r !== null) },
      ]};
    }

    // 56: APPLY  R(dest) = R(fn).apply(R(thisArg), [R(args)...])
    // Disasm format: APPLY  K(count), [R(arg)...], R(dest), R(fn), R(thisArg)
    // Wait — let me re-check tdc.js case 56:
    //   h = []; for (w = Y[++C]; w > 0; w--) h.push(i[Y[++C]]);
    //   i[Y[++C]] = i[Y[++C]].apply(i[Y[++C]], h);
    // So: K(count), R(args)..., R(dest), R(fn), R(this)
    case 56: {
      const argCount = val(0);
      const argRegs = [];
      for (let j = 0; j < argCount; j++) {
        argRegs.push(reg(1 + j));
      }
      const base = 1 + argCount;
      const destReg = reg(base);
      const fnReg = reg(base + 1);
      const thisReg = reg(base + 2);
      const reads = [fnReg, thisReg, ...argRegs].filter(r => r !== null);
      return { effects: [
        { dest: destReg, expr: { type: 'call', fn: regNode(fnReg), thisArg: regNode(thisReg), args: argRegs.map(r => regNode(r)), isApply: true }, reads },
      ]};
    }

    default:
      throw new Error(`Unknown opcode: ${opcode}`);
  }
}

// ============================================================================
// parseDisasmToIR(disasmLine) → IR object
// ============================================================================

/**
 * Parse a disassembly line and attach semantics.
 *
 * Reuses parseDisasmLine from cfg-builder.js for the initial parse,
 * then resolves the opcode number from the mnemonic and calls getSemantics.
 *
 * @param {string} disasmLine - A disassembly line, e.g. "[0042]  ADD  r8, r9, r10  ; r8 = r9 + r10"
 * @returns {{ pc: number, opcode: number, opName: string, operands: string[], semantics: object }|null}
 */
function parseDisasmToIR(disasmLine) {
  const parsed = parseDisasmLine(disasmLine);
  if (!parsed) return null;

  const { pc, mnemonic, operands } = parsed;

  // Resolve opcode number from mnemonic
  const opcode = MNEMONIC_TO_OPCODE[mnemonic];
  if (opcode === undefined) {
    // Unknown mnemonic — should not happen for well-formed disassembly
    return null;
  }

  const semantics = getSemantics(opcode, operands);

  return {
    pc,
    opcode,
    opName: mnemonic,
    operands,
    semantics,
  };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  OPCODE_TABLE,
  OPERAND_TYPES,
  MNEMONIC_TO_OPCODE,
  getSemantics,
  parseDisasmToIR,
  parseOperand,
};
