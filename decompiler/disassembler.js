'use strict';

/**
 * ChaosVM Disassembler
 *
 * Walks the decoded Y[] integer array and produces human-readable disassembly.
 * Operand counts are derived by counting Y[++C] reads in tdc.js lines 199–565.
 *
 * Variable-width opcodes (12, 23, 55, 56) read a count value then consume
 * that many additional register operands for closure vars or apply args.
 *
 * Opcodes 11 and 40 use a Y[C+1] peek (no increment) for BigInt detection,
 * so their operand width is fixed despite the conditional logic.
 *
 * Opcode 84 (ITER_SHIFT) always consumes 3 operand slots — in the else branch,
 * ++C skips the 3rd slot instead of reading it.
 *
 * Opcode 87 (CJMP) always consumes 3 operand slots — in the truthy branch,
 * only 2 are read, but the falsy branch uses Y[++C, ++C] (comma operator)
 * which skips the true-offset slot. Both paths advance C by the same total.
 */

// --- Opcode definitions ---
// Each entry: [mnemonic, fixedOperandCount]
// For variable-width opcodes, fixedOperandCount is null; handled specially.

const OPCODES = {
  0:  ['ADD',            3],  // i[a] = i[b] + i[c]
  1:  ['IN',             3],  // i[a] = i[b] in i[c]
  2:  ['DIV',            3],  // i[a] = i[b] / i[c]
  3:  ['XOR',            3],  // i[a] = i[b] ^ i[c]
  4:  ['MUL',            3],  // i[a] = i[b] * i[c]
  5:  ['CALL_COMPLEX',   7],  // i[a] = K; i[b] = i[c].call(Q, i[d]); i[e] = i[f]
  6:  ['SHR_K',          3],  // i[a] = i[b] >> K
  7:  ['RET_CLEANUP',    2],  // F.pop(); i[a] = Q; return i[b]
  8:  ['AND_K',          3],  // i[a] = i[b] & K
  9:  ['DELETE',         3],  // i[a] = delete i[b][i[c]]
  10: ['COPY_SET',       5],  // i[a] = i[b]; i[c][i[d]] = i[e]
  11: ['INC_BIGINT',     6],  // i[a] = toNumber(i[peek]); i[b] = ++i[c]; i[d] = i[e]
  12: ['FUNC_CREATE_A',  null], // variable: str_append + closure + prop_set
  13: ['GT',             3],  // i[a] = i[b] > i[c]
  14: ['PROP_SET',       3],  // i[a][i[b]] = i[c]
  15: ['DEC',            2],  // i[a] = --i[b]
  16: ['CALL_3',         6],  // i[a] = i[b].call(i[c], i[d], i[e], i[f])
  17: ['PROP_GET',       3],  // i[a] = i[b][i[c]]
  18: ['OBJ_NEW',        1],  // i[a] = {}
  19: ['STR_APPEND_2',   4],  // i[a] += char(K); i[b] += char(K)
  20: ['PROP_CALL_1',    7],  // i[a] = i[b][i[c]]; i[d] = i[e].call(i[f], i[g])
  21: ['LE_K',           3],  // i[a] = i[b] <= K
  22: ['SEQ',            3],  // i[a] = i[b] === i[c]
  23: ['FUNC_CREATE_B',  null], // variable: prop_set + closure + prop_set
  24: ['RET',            2],  // i[a] = Q; return i[b]
  25: ['CALL_0',         3],  // i[a] = i[b].call(i[c])
  26: ['NEW_2',          4],  // i[a] = new i[b](i[c], i[d])
  27: ['USHR_K',         3],  // i[a] = i[b] >>> K
  28: ['LT',             3],  // i[a] = i[b] < i[c]
  29: ['PROP_GET_CONST', 5],  // i[a] = i[b][i[c]]; i[d] = K
  30: ['INC',            2],  // i[a] = ++i[b]
  31: ['STR_INIT',       3],  // i[a] = ""; i[a'] += char(K)
  32: ['SUB',            3],  // i[a] = i[b] - i[c]
  33: ['TRY_PUSH',       3],  // i[a] = i[b]; F.push(C + K)
  34: ['TYPEOF',         2],  // i[a] = typeof i[b]
  35: ['OR_K',           3],  // i[a] = i[b] | K
  36: ['LOAD_NULL',      1],  // i[a] = null
  37: ['THROW',          1],  // throw i[a]
  38: ['JMP',            1],  // C += K
  39: ['MOD',            3],  // i[a] = i[b] % i[c]
  40: ['TO_NUMBER',      2],  // i[a] = toNumber(i[peek]) — BigInt-aware, fixed width
  41: ['SET_GET_CONST',  8],  // i[a][i[b]] = i[c]; i[d] = i[e][i[f]]; i[g] = K
  42: ['LOAD_EXCEPTION', 1],  // i[a] = G
  43: ['GE_K',           3],  // i[a] = i[b] >= K
  44: ['SUB_K',          3],  // i[a] = i[b] - K
  45: ['PROP_GET_K',     3],  // i[a] = i[b][K]
  46: ['SET_RET',        4],  // i[a][K] = i[b]; return i[c]
  47: ['LOAD_K',         2],  // i[a] = K
  48: ['SHL_K',          3],  // i[a] = i[b] << K
  49: ['LT_K',           3],  // i[a] = i[b] < K
  50: ['CALLQ_3',        5],  // i[a] = i[b].call(Q, i[c], i[d], i[e])
  51: ['SHR',            3],  // i[a] = i[b] >> i[c]
  52: ['CALL_1',         4],  // i[a] = i[b].call(i[c], i[d])
  53: ['NEG',            2],  // i[a] = -i[b]
  54: ['STR_OBJ_STR',    4],  // i[a] += char(K); i[b] = {}; i[c] = ""
  55: ['FUNC_CREATE_C',  null], // variable: closure creation (standalone)
  56: ['APPLY',          null], // variable: i[a] = i[b].apply(i[c], h[])
  57: ['SEQ_K',          3],  // i[a] = i[b] === K
  58: ['OR',             3],  // i[a] = i[b] | i[c]
  59: ['PROP_SET_K',     3],  // i[a][K] = i[c]
  60: ['RET_BARE',       1],  // return i[a]
  61: ['CALL_2',         5],  // i[a] = i[b].call(i[c], i[d], i[e])
  62: ['ENUMERATE',      2],  // h = keys(i[a]); i[b] = h
  63: ['CALLQ_2',        4],  // i[a] = i[b].call(Q, i[c], i[d])
  64: ['STR_PROP',       5],  // i[a] += char(K); i[b] = i[c][i[d]]
  65: ['STR_SET_STR',    6],  // i[a] += char(K); i[b][K] = i[c]; i[d] = ""
  66: ['GT_K',           3],  // i[a] = i[b] > K
  67: ['STR_APPEND',     2],  // i[a] += char(K)
  68: ['NOT',            2],  // i[a] = !i[b]
  69: ['ARRAY_2',        4],  // i[a] = Array(K); i[b] = Array(K)
  70: ['CALLQ_1_COPY',   5],  // i[a] = i[b].call(Q, i[c]); i[d] = i[e]
  71: ['UPLUS',          2],  // i[a] = +i[b]
  72: ['PROP_STR',       6],  // i[a] = i[b][i[c]]; i[d] = ""; i[d'] += char(K)
  73: ['MOV',            2],  // i[a] = i[b]
  74: ['TRY_POP',        0],  // F.pop()
  75: ['SET_RET_Q',      5],  // i[a][i[b]] = i[c]; i[d] = Q; return i[e]
  76: ['STR_SET_K',      5],  // i[a] += char(K); i[b][K] = i[c]
  77: ['CALLQ_1',        3],  // i[a] = i[b].call(Q, i[c])
  78: ['EQ_K',           3],  // i[a] = i[b] == K
  79: ['RSUB_K',         3],  // i[a] = K - i[c]
  80: ['MOV_2',          4],  // i[a] = i[b]; i[c] = i[d]
  81: ['LOAD_THIS',      1],  // i[a] = Q
  82: ['SHL',            3],  // i[a] = i[b] << i[c]
  83: ['ARRAY',          2],  // i[a] = Array(K)
  84: ['ITER_SHIFT',     3],  // h = i[a]; if (i[b] = !!h.length) i[c] = h.shift(); else ++C
  85: ['NEW_0',          2],  // i[a] = new i[b]
  86: ['PROP_GET_K_2',   6],  // i[a] = i[b][K]; i[c] = i[d][K]
  87: ['CJMP',           3],  // C += i[a] ? K(true) : K(false)
  88: ['EXC_TRY',        4],  // i[a] = G; i[b] = i[c]; F.push(C + K)
  89: ['EQ',             3],  // i[a] = i[b] == i[c]
  90: ['CALLQ_0',        2],  // i[a] = i[b].call(Q)
  91: ['CATCH_PUSH',     1],  // F.push(C + K)
  92: ['ADD_K',          3],  // i[a] = i[b] + K
  93: ['STR_EMPTY',      1],  // i[a] = ""
  94: ['NEW_1',          3],  // i[a] = new i[b](i[c])
};

// --- Operand type descriptors ---
// 'R' = register operand (i[Y[++C]]), 'K' = immediate/constant (Y[++C])
// This determines how we format each operand in the disassembly output.

const OPERAND_TYPES = {
  0:  'RRR',       // ADD: R(a) = R(b) + R(c)
  1:  'RRR',       // IN
  2:  'RRR',       // DIV
  3:  'RRR',       // XOR
  4:  'RRR',       // MUL
  5:  'RKRRRRR',   // CALL_COMPLEX: R(a)=K; R(b)=R(c).call(Q,R(d)); R(e)=R(f)
  6:  'RRK',       // SHR_K
  7:  'RR',        // RET_CLEANUP
  8:  'RRK',       // AND_K
  9:  'RRR',       // DELETE
  10: 'RRRRR',     // COPY_SET
  11: 'RRRRRR',    // INC_BIGINT: 6 fixed operands (peek doesn't count as extra)
  12: null,        // FUNC_CREATE_A: variable
  13: 'RRR',       // GT
  14: 'RRR',       // PROP_SET
  15: 'RR',        // DEC
  16: 'RRRRRR',    // CALL_3
  17: 'RRR',       // PROP_GET
  18: 'R',         // OBJ_NEW
  19: 'RKRK',      // STR_APPEND_2
  20: 'RRRRRRR',   // PROP_CALL_1: 7 operands total
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
  31: 'RRK',       // STR_INIT: R(a)=""; R(a') += char(K)
  32: 'RRR',       // SUB
  33: 'RRK',       // TRY_PUSH
  34: 'RR',        // TYPEOF
  35: 'RRK',       // OR_K
  36: 'R',         // LOAD_NULL
  37: 'R',         // THROW
  38: 'K',         // JMP
  39: 'RRR',       // MOD
  40: 'RR',        // TO_NUMBER: 2 fixed (peek doesn't count)
  41: 'RRRRRRRK',  // SET_GET_CONST: 8 operands
  42: 'R',         // LOAD_EXCEPTION
  43: 'RRK',       // GE_K
  44: 'RRK',       // SUB_K
  45: 'RRK',       // PROP_GET_K
  46: 'RKRR',      // SET_RET: R(a)[K]=R(b); return R(c)
  47: 'RK',        // LOAD_K
  48: 'RRK',       // SHL_K
  49: 'RRK',       // LT_K
  50: 'RRRRR',     // CALLQ_3
  51: 'RRR',       // SHR
  52: 'RRRR',      // CALL_1
  53: 'RR',        // NEG
  54: 'RKRR',      // STR_OBJ_STR: R(a)+=char(K); R(b)={}; R(c)=""
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
  65: 'RKKRRR',    // STR_SET_STR: R(a)+=char(K); R(b)[K]=R(c); R(d)=""
                   // Wait, let me re-examine. case 65:
                   //   i[Y[++C]] += String.fromCharCode(Y[++C]);  → R, K
                   //   i[Y[++C]][Y[++C]] = i[Y[++C]];            → R, K, R
                   //   i[Y[++C]] = "";                            → R
                   // So: R K R K R R = RKRKRR
  66: 'RRK',       // GT_K
  67: 'RK',        // STR_APPEND
  68: 'RR',        // NOT
  69: 'RKRK',      // ARRAY_2
  70: 'RRRRR',     // CALLQ_1_COPY
  71: 'RR',        // UPLUS
  72: 'RRRRRK',    // PROP_STR: R(a)=R(b)[R(c)]; R(d)=""; R(d')+=char(K)
  73: 'RR',        // MOV
  74: '',          // TRY_POP: 0 operands
  75: 'RRRRR',     // SET_RET_Q
  76: 'RKRKR',     // STR_SET_K: R(a)+=char(K); R(b)[K]=R(c)
  77: 'RRR',       // CALLQ_1
  78: 'RRK',       // EQ_K
  79: 'RKR',       // RSUB_K
  80: 'RRRR',      // MOV_2
  81: 'R',         // LOAD_THIS
  82: 'RRR',       // SHL
  83: 'RK',        // ARRAY
  84: 'RRR',       // ITER_SHIFT: 3 slots always consumed
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

// Fix operand type for 65: recount from tdc.js
// case 65: i[Y[++C]] += String.fromCharCode(Y[++C]); i[Y[++C]][Y[++C]] = i[Y[++C]]; i[Y[++C]] = "";
// Operands: R(str) K(char) R(obj) K(prop) R(val) R(dest) = RKRKRR
OPERAND_TYPES[65] = 'RKRKRR';

/**
 * Format a single operand value for display.
 * @param {string} type - 'R' for register, 'K' for immediate
 * @param {number} value - The operand value from bytecode
 * @returns {string}
 */
function formatOperand(type, value) {
  if (type === 'R') {
    return 'r' + value;
  }
  return String(value);
}

/**
 * Disassemble a variable-width opcode 12 (FUNC_CREATE_A).
 *
 * tdc.js case 12:
 *   i[Y[++C]] += String.fromCharCode(Y[++C]);     // 2: R(str), K(char)
 *   h = []; for (w = Y[++C]; w > 0; w--) h.push(i[Y[++C]]);  // 1 + w: K(count), R... closures
 *   i[Y[++C]] = J(C + Y[++C], h, S, m, I);        // 2: R(dest), K(offset)
 *   Object.defineProperty(i[Y[C-1]], "length", { value: Y[++C] }); // 1: K(arity)
 *   i[Y[++C]][i[Y[++C]]] = i[Y[++C]];             // 3: R(obj), R(prop), R(val)
 *
 * Total: 2 + 1 + w + 2 + 1 + 3 = 9 + w
 */
function disasmOp12(Y, pc) {
  const operands = [];
  const types = [];
  // str_append: R(str), K(char)
  operands.push(Y[pc + 1], Y[pc + 2]);
  types.push('R', 'K');
  // closure count — guard against negative/invalid values (data region)
  const w = Y[pc + 3];
  if (w < 0 || w > 1000 || pc + 9 + w > Y.length) {
    return { operands: [Y[pc + 1], Y[pc + 2], w], types: ['R', 'K', 'K'], width: 4, invalid: true };
  }
  operands.push(w);
  types.push('K');
  // closure vars
  for (let j = 0; j < w; j++) {
    operands.push(Y[pc + 4 + j]);
    types.push('R');
  }
  const base = pc + 4 + w;
  // func dest, offset
  operands.push(Y[base], Y[base + 1]);
  types.push('R', 'K');
  // arity
  operands.push(Y[base + 2]);
  types.push('K');
  // prop_set: R(obj), R(prop), R(val)
  operands.push(Y[base + 3], Y[base + 4], Y[base + 5]);
  types.push('R', 'R', 'R');
  return { operands, types, width: 1 + 9 + w }; // opcode + 9+w operands
}

/**
 * Disassemble a variable-width opcode 23 (FUNC_CREATE_B).
 *
 * tdc.js case 23:
 *   i[Y[++C]][Y[++C]] = i[Y[++C]];                // 3: R(obj), K(prop), R(val)
 *   h = []; for (w = Y[++C]; w > 0; w--) h.push(i[Y[++C]]);  // 1 + w
 *   i[Y[++C]] = J(C + Y[++C], h, S, m, I);        // 2: R(dest), K(offset)
 *   Object.defineProperty(i[Y[C-1]], "length", { value: Y[++C] }); // 1: K(arity)
 *   i[Y[++C]][Y[++C]] = i[Y[++C]];                // 3: R(obj2), K(prop2), R(val2)
 *
 * Total: 3 + 1 + w + 2 + 1 + 3 = 10 + w
 */
function disasmOp23(Y, pc) {
  const operands = [];
  const types = [];
  // prop_set: R(obj), K(prop), R(val)
  operands.push(Y[pc + 1], Y[pc + 2], Y[pc + 3]);
  types.push('R', 'K', 'R');
  // closure count — guard against negative/invalid values (data region)
  const w = Y[pc + 4];
  if (w < 0 || w > 1000 || pc + 10 + w > Y.length) {
    return { operands: [Y[pc + 1], Y[pc + 2], Y[pc + 3], w], types: ['R', 'K', 'R', 'K'], width: 5, invalid: true };
  }
  operands.push(w);
  types.push('K');
  // closure vars
  for (let j = 0; j < w; j++) {
    operands.push(Y[pc + 5 + j]);
    types.push('R');
  }
  const base = pc + 5 + w;
  // func dest, offset
  operands.push(Y[base], Y[base + 1]);
  types.push('R', 'K');
  // arity
  operands.push(Y[base + 2]);
  types.push('K');
  // prop_set2: R(obj2), K(prop2), R(val2)
  operands.push(Y[base + 3], Y[base + 4], Y[base + 5]);
  types.push('R', 'K', 'R');
  return { operands, types, width: 1 + 10 + w };
}

/**
 * Disassemble a variable-width opcode 55 (FUNC_CREATE_C).
 *
 * tdc.js case 55:
 *   h = []; for (w = Y[++C]; w > 0; w--) h.push(i[Y[++C]]);  // 1 + w
 *   i[Y[++C]] = J(C + Y[++C], h, S, m, I);        // 2: R(dest), K(offset)
 *   Object.defineProperty(i[Y[C-1]], "length", { value: Y[++C] }); // 1: K(arity)
 *
 * Total: 1 + w + 2 + 1 = 4 + w
 */
function disasmOp55(Y, pc) {
  const operands = [];
  const types = [];
  // closure count — guard against negative/invalid values (data region)
  const w = Y[pc + 1];
  if (w < 0 || w > 1000 || pc + 4 + w > Y.length) {
    return { operands: [w], types: ['K'], width: 2, invalid: true };
  }
  operands.push(w);
  types.push('K');
  // closure vars
  for (let j = 0; j < w; j++) {
    operands.push(Y[pc + 2 + j]);
    types.push('R');
  }
  const base = pc + 2 + w;
  // func dest, offset
  operands.push(Y[base], Y[base + 1]);
  types.push('R', 'K');
  // arity
  operands.push(Y[base + 2]);
  types.push('K');
  return { operands, types, width: 1 + 4 + w };
}

/**
 * Disassemble a variable-width opcode 56 (APPLY).
 *
 * tdc.js case 56:
 *   h = []; for (w = Y[++C]; w > 0; w--) h.push(i[Y[++C]]);  // 1 + w
 *   i[Y[++C]] = i[Y[++C]].apply(i[Y[++C]], h);    // 3: R(dest), R(fn), R(ctx)
 *
 * Total: 1 + w + 3 = 4 + w
 */
function disasmOp56(Y, pc) {
  const operands = [];
  const types = [];
  // arg count — guard against negative/invalid values (data region)
  const w = Y[pc + 1];
  if (w < 0 || w > 1000 || pc + 4 + w > Y.length) {
    return { operands: [w], types: ['K'], width: 2, invalid: true };
  }
  operands.push(w);
  types.push('K');
  // arg registers
  for (let j = 0; j < w; j++) {
    operands.push(Y[pc + 2 + j]);
    types.push('R');
  }
  const base = pc + 2 + w;
  // dest, fn, ctx
  operands.push(Y[base], Y[base + 1], Y[base + 2]);
  types.push('R', 'R', 'R');
  return { operands, types, width: 1 + 4 + w };
}

// Map variable opcodes to their handler functions
const VARIABLE_HANDLERS = {
  12: disasmOp12,
  23: disasmOp23,
  55: disasmOp55,
  56: disasmOp56,
};

/**
 * Pseudocode comment generators for each opcode.
 * Returns a human-readable comment string given the operands.
 */
function makeComment(opcode, operands, types) {
  const r = (idx) => 'r' + operands[idx];
  const k = (idx) => String(operands[idx]);
  const chr = (idx) => {
    const code = operands[idx];
    if (code >= 32 && code <= 126) return "'" + String.fromCharCode(code) + "'";
    return '0x' + code.toString(16);
  };

  switch (opcode) {
    case 0:  return `${r(0)} = ${r(1)} + ${r(2)}`;
    case 1:  return `${r(0)} = ${r(1)} in ${r(2)}`;
    case 2:  return `${r(0)} = ${r(1)} / ${r(2)}`;
    case 3:  return `${r(0)} = ${r(1)} ^ ${r(2)}`;
    case 4:  return `${r(0)} = ${r(1)} * ${r(2)}`;
    case 5:  return `${r(0)} = ${k(1)}; ${r(2)} = ${r(3)}.call(Q, ${r(4)}); ${r(5)} = ${r(6)}`;
    case 6:  return `${r(0)} = ${r(1)} >> ${k(2)}`;
    case 7:  return `F.pop(); ${r(0)} = Q; return ${r(1)}`;
    case 8:  return `${r(0)} = ${r(1)} & ${k(2)}`;
    case 9:  return `${r(0)} = delete ${r(1)}[${r(2)}]`;
    case 10: return `${r(0)} = ${r(1)}; ${r(2)}[${r(3)}] = ${r(4)}`;
    case 11: return `${r(0)} = toNumber(${r(1)}); ${r(2)} = ++${r(3)}; ${r(4)} = ${r(5)}`;
    case 12: {
      const w = operands[2];
      const closures = [];
      for (let j = 0; j < w; j++) closures.push('r' + operands[3 + j]);
      const base = 3 + w;
      return `${r(0)} += ${chr(1)}; ${r(base)} = closure(offset=${k(base + 1)}, [${closures.join(', ')}], arity=${k(base + 2)}); ${r(base + 3)}[${r(base + 4)}] = ${r(base + 5)}`;
    }
    case 13: return `${r(0)} = ${r(1)} > ${r(2)}`;
    case 14: return `${r(0)}[${r(1)}] = ${r(2)}`;
    case 15: return `${r(0)} = --${r(1)}`;
    case 16: return `${r(0)} = ${r(1)}.call(${r(2)}, ${r(3)}, ${r(4)}, ${r(5)})`;
    case 17: return `${r(0)} = ${r(1)}[${r(2)}]`;
    case 18: return `${r(0)} = {}`;
    case 19: return `${r(0)} += ${chr(1)}; ${r(2)} += ${chr(3)}`;
    case 20: return `${r(0)} = ${r(1)}[${r(2)}]; ${r(3)} = ${r(4)}.call(${r(5)}, ${r(6)})`;
    case 21: return `${r(0)} = ${r(1)} <= ${k(2)}`;
    case 22: return `${r(0)} = ${r(1)} === ${r(2)}`;
    case 23: {
      const w = operands[3];
      const closures = [];
      for (let j = 0; j < w; j++) closures.push('r' + operands[4 + j]);
      const base = 4 + w;
      return `${r(0)}[${k(1)}] = ${r(2)}; ${r(base)} = closure(offset=${k(base + 1)}, [${closures.join(', ')}], arity=${k(base + 2)}); ${r(base + 3)}[${k(base + 4)}] = ${r(base + 5)}`;
    }
    case 24: return `${r(0)} = Q; return ${r(1)}`;
    case 25: return `${r(0)} = ${r(1)}.call(${r(2)})`;
    case 26: return `${r(0)} = new ${r(1)}(${r(2)}, ${r(3)})`;
    case 27: return `${r(0)} = ${r(1)} >>> ${k(2)}`;
    case 28: return `${r(0)} = ${r(1)} < ${r(2)}`;
    case 29: return `${r(0)} = ${r(1)}[${r(2)}]; ${r(3)} = ${k(4)}`;
    case 30: return `${r(0)} = ++${r(1)}`;
    case 31: return `${r(0)} = ""; ${r(1)} += ${chr(2)}`;
    case 32: return `${r(0)} = ${r(1)} - ${r(2)}`;
    case 33: return `${r(0)} = ${r(1)}; F.push(C+${k(2)})`;
    case 34: return `${r(0)} = typeof ${r(1)}`;
    case 35: return `${r(0)} = ${r(1)} | ${k(2)}`;
    case 36: return `${r(0)} = null`;
    case 37: return `throw ${r(0)}`;
    case 38: return `C += ${k(0)}`;
    case 39: return `${r(0)} = ${r(1)} % ${r(2)}`;
    case 40: return `${r(0)} = toNumber(${r(1)})`;
    case 41: return `${r(0)}[${r(1)}] = ${r(2)}; ${r(3)} = ${r(4)}[${r(5)}]; ${r(6)} = ${k(7)}`;
    case 42: return `${r(0)} = G`;
    case 43: return `${r(0)} = ${r(1)} >= ${k(2)}`;
    case 44: return `${r(0)} = ${r(1)} - ${k(2)}`;
    case 45: return `${r(0)} = ${r(1)}[${k(2)}]`;
    case 46: return `${r(0)}[${k(1)}] = ${r(2)}; return ${r(3)}`;
    case 47: return `${r(0)} = ${k(1)}`;
    case 48: return `${r(0)} = ${r(1)} << ${k(2)}`;
    case 49: return `${r(0)} = ${r(1)} < ${k(2)}`;
    case 50: return `${r(0)} = ${r(1)}.call(Q, ${r(2)}, ${r(3)}, ${r(4)})`;
    case 51: return `${r(0)} = ${r(1)} >> ${r(2)}`;
    case 52: return `${r(0)} = ${r(1)}.call(${r(2)}, ${r(3)})`;
    case 53: return `${r(0)} = -${r(1)}`;
    case 54: return `${r(0)} += ${chr(1)}; ${r(2)} = {}; ${r(3)} = ""`;
    case 55: {
      const w = operands[0];
      const closures = [];
      for (let j = 0; j < w; j++) closures.push('r' + operands[1 + j]);
      const base = 1 + w;
      return `${r(base)} = closure(offset=${k(base + 1)}, [${closures.join(', ')}], arity=${k(base + 2)})`;
    }
    case 56: {
      const w = operands[0];
      const args = [];
      for (let j = 0; j < w; j++) args.push('r' + operands[1 + j]);
      const base = 1 + w;
      return `${r(base)} = ${r(base + 1)}.apply(${r(base + 2)}, [${args.join(', ')}])`;
    }
    case 57: return `${r(0)} = ${r(1)} === ${k(2)}`;
    case 58: return `${r(0)} = ${r(1)} | ${r(2)}`;
    case 59: return `${r(0)}[${k(1)}] = ${r(2)}`;
    case 60: return `return ${r(0)}`;
    case 61: return `${r(0)} = ${r(1)}.call(${r(2)}, ${r(3)}, ${r(4)})`;
    case 62: return `${r(1)} = keys(${r(0)})`;
    case 63: return `${r(0)} = ${r(1)}.call(Q, ${r(2)}, ${r(3)})`;
    case 64: return `${r(0)} += ${chr(1)}; ${r(2)} = ${r(3)}[${r(4)}]`;
    case 65: return `${r(0)} += ${chr(1)}; ${r(2)}[${k(3)}] = ${r(4)}; ${r(5)} = ""`;
    case 66: return `${r(0)} = ${r(1)} > ${k(2)}`;
    case 67: return `${r(0)} += ${chr(1)}`;
    case 68: return `${r(0)} = !${r(1)}`;
    case 69: return `${r(0)} = Array(${k(1)}); ${r(2)} = Array(${k(3)})`;
    case 70: return `${r(0)} = ${r(1)}.call(Q, ${r(2)}); ${r(3)} = ${r(4)}`;
    case 71: return `${r(0)} = +${r(1)}`;
    case 72: return `${r(0)} = ${r(1)}[${r(2)}]; ${r(3)} = ""; ${r(4)} += ${chr(5)}`;
    case 73: return `${r(0)} = ${r(1)}`;
    case 74: return 'F.pop()';
    case 75: return `${r(0)}[${r(1)}] = ${r(2)}; ${r(3)} = Q; return ${r(4)}`;
    case 76: return `${r(0)} += ${chr(1)}; ${r(2)}[${k(3)}] = ${r(4)}`;
    case 77: return `${r(0)} = ${r(1)}.call(Q, ${r(2)})`;
    case 78: return `${r(0)} = ${r(1)} == ${k(2)}`;
    case 79: return `${r(0)} = ${k(1)} - ${r(2)}`;
    case 80: return `${r(0)} = ${r(1)}; ${r(2)} = ${r(3)}`;
    case 81: return `${r(0)} = Q`;
    case 82: return `${r(0)} = ${r(1)} << ${r(2)}`;
    case 83: return `${r(0)} = Array(${k(1)})`;
    case 84: return `h = ${r(0)}; if (${r(1)} = !!h.length) ${r(2)} = h.shift(); else skip`;
    case 85: return `${r(0)} = new ${r(1)}`;
    case 86: return `${r(0)} = ${r(1)}[${k(2)}]; ${r(3)} = ${r(4)}[${k(5)}]`;
    case 87: return `C += ${r(0)} ? ${k(1)} : ${k(2)}`;
    case 88: return `${r(0)} = G; ${r(1)} = ${r(2)}; F.push(C+${k(3)})`;
    case 89: return `${r(0)} = ${r(1)} == ${r(2)}`;
    case 90: return `${r(0)} = ${r(1)}.call(Q)`;
    case 91: return `F.push(C+${k(0)})`;
    case 92: return `${r(0)} = ${r(1)} + ${k(2)}`;
    case 93: return `${r(0)} = ""`;
    case 94: return `${r(0)} = new ${r(1)}(${r(2)})`;
    default: return '';
  }
}

/**
 * Disassemble a bytecode array starting from a given PC.
 *
 * @param {number[]} bytecodeArray - The decoded Y[] integer array
 * @param {number} [startPC=0] - The program counter to start disassembling from
 * @returns {string[]} - Array of disassembly lines
 */
function disassemble(bytecodeArray, startPC) {
  if (startPC === undefined) startPC = 0;
  const Y = bytecodeArray;
  const len = Y.length;
  const lines = [];
  let pc = startPC;

  while (pc < len) {
    const opcode = Y[pc];

    // Validate opcode
    if (opcode < 0 || opcode > 94) {
      lines.push(`[${pc}]  UNKNOWN_${opcode}  ; invalid opcode ${opcode}`);
      pc++;
      continue;
    }

    const [mnemonic, fixedCount] = OPCODES[opcode];

    let operands, typeStr, width;

    if (fixedCount === null) {
      // Variable-width opcode
      const handler = VARIABLE_HANDLERS[opcode];
      if (!handler) {
        lines.push(`[${pc}]  ${mnemonic}  ; ERROR: no handler for variable opcode`);
        pc++;
        continue;
      }
      // Bounds check: make sure we can at least read the count byte
      if (pc + 1 >= len) {
        lines.push(`[${pc}]  ${mnemonic}  ; ERROR: truncated at end of bytecode`);
        break;
      }
      const result = handler(Y, pc);
      operands = result.operands;
      typeStr = result.types.join('');
      width = result.width;
      // Safety: if handler flagged invalid (data region), annotate the line
      if (result.invalid) {
        const formattedOps = operands.map((v, j) => formatOperand(result.types[j] || 'K', v));
        lines.push(`[${pc}]  ${mnemonic}  ${formattedOps.join(', ')}  ; INVALID: bad closure count (likely data region)`);
        pc += width;
        continue;
      }
      // Safety: ensure width is at least 1 to prevent infinite loops
      if (width < 1) {
        lines.push(`[${pc}]  ${mnemonic}  ; ERROR: computed width ${width}, skipping`);
        pc++;
        continue;
      }
    } else {
      // Fixed-width opcode
      width = 1 + fixedCount; // opcode + operands
      typeStr = OPERAND_TYPES[opcode];
      operands = [];
      for (let j = 0; j < fixedCount; j++) {
        if (pc + 1 + j < len) {
          operands.push(Y[pc + 1 + j]);
        } else {
          operands.push(0); // truncated
        }
      }
    }

    // Format operands
    const formattedOps = [];
    for (let j = 0; j < operands.length; j++) {
      const type = typeStr[j] || 'K';
      formattedOps.push(formatOperand(type, operands[j]));
    }

    // Generate comment
    const comment = makeComment(opcode, operands, typeStr);

    // Format output line: [PC]  MNEMONIC  operands  ; comment
    const pcStr = '[' + pc + ']';
    const opsStr = formattedOps.join(', ');
    const line = `${pcStr}  ${mnemonic}  ${opsStr}  ; ${comment}`;
    lines.push(line);

    pc += width;
  }

  return lines;
}

module.exports = { disassemble, OPCODES, OPERAND_TYPES, VARIABLE_HANDLERS };
