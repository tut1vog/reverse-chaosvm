'use strict';

/**
 * ChaosVM String Extractor
 *
 * Parses the verified disassembly output and reconstructs string literals
 * by simulating string-building register effects across opcodes.
 *
 * String-related opcodes tracked:
 *   93 STR_EMPTY     — R(a) = ""
 *   31 STR_INIT      — R(a) = ""; R(b) += char(K)
 *   67 STR_APPEND    — R(a) += char(K)
 *   19 STR_APPEND_2  — R(a) += char(K); R(b) += char(K)
 *   54 STR_OBJ_STR   — R(a) += char(K); R(b) = {}; R(c) = ""
 *   64 STR_PROP      — R(a) += char(K); R(b) = R(c)[R(d)]
 *   65 STR_SET_STR   — R(a) += char(K); R(b)[K] = R(c); R(d) = ""
 *   76 STR_SET_K     — R(a) += char(K); R(b)[K] = R(c)
 *   72 PROP_STR      — R(a) = R(b)[R(c)]; R(d) = ""; R(e) += char(K)
 *   12 FUNC_CREATE_A — R(a) += char(K); closure + prop_set
 *
 * A string build is finalized when the register is overwritten by a
 * non-string operation, when a new string-start targets the same register,
 * or at end-of-input.
 */

// --- Destination register positions for non-string opcodes ---
// Maps mnemonic → array of operand indices that are register destinations.
// null = variable-width opcode needing special handling.
// [] = no register destinations (jumps, throws, prop sets, returns).
const DEST_POSITIONS = {
  'ADD':            [0],
  'IN':             [0],
  'DIV':            [0],
  'XOR':            [0],
  'MUL':            [0],
  'CALL_COMPLEX':   [0, 2, 5],   // i[a]=K, i[b]=call, i[e]=copy
  'SHR_K':          [0],
  'RET_CLEANUP':    [0],          // i[a] = Q
  'AND_K':          [0],
  'DELETE':         [0],
  'COPY_SET':       [0],          // i[a]=i[b]; i[c][i[d]]=i[e]
  'INC_BIGINT':     [0, 1, 3],   // i[a]=toNum, i[b]=++i[c], i[d]=i[e]
  'GT':             [0],
  'PROP_SET':       [],           // i[a][i[b]]=i[c] — no register overwrite
  'DEC':            [0],
  'CALL_3':         [0],
  'PROP_GET':       [0],
  'OBJ_NEW':        [0],
  'PROP_CALL_1':    [0, 3],       // i[a]=prop, i[d]=call
  'LE_K':           [0],
  'SEQ':            [0],
  'RET':            [0],          // i[a] = Q
  'CALL_0':         [0],
  'NEW_2':          [0],
  'USHR_K':         [0],
  'LT':             [0],
  'PROP_GET_CONST': [0, 3],       // i[a]=prop, i[d]=K
  'INC':            [0],
  'SUB':            [0],
  'TRY_PUSH':      [0],          // i[a]=i[b]
  'TYPEOF':         [0],
  'OR_K':           [0],
  'LOAD_NULL':      [0],
  'THROW':          [],
  'JMP':            [],
  'MOD':            [0],
  'TO_NUMBER':      [0],
  'SET_GET_CONST':  [3, 6],       // prop set; i[d]=prop, i[g]=K
  'LOAD_EXCEPTION': [0],
  'GE_K':           [0],
  'SUB_K':          [0],
  'PROP_GET_K':     [0],
  'SET_RET':        [],           // prop set + return
  'LOAD_K':         [0],
  'SHL_K':          [0],
  'LT_K':           [0],
  'CALLQ_3':        [0],
  'SHR':            [0],
  'CALL_1':         [0],
  'NEG':            [0],
  'SEQ_K':          [0],
  'OR':             [0],
  'PROP_SET_K':     [],           // i[a][K]=i[c] — no register overwrite
  'RET_BARE':       [],
  'CALL_2':         [0],
  'ENUMERATE':      [1],          // h=keys(i[a]); i[b]=h
  'CALLQ_2':        [0],
  'GT_K':           [0],
  'NOT':            [0],
  'ARRAY_2':        [0, 2],       // i[a]=Array(K); i[b]=Array(K)
  'CALLQ_1_COPY':   [0, 3],       // i[a]=call, i[d]=copy
  'UPLUS':          [0],
  'MOV':            [0],
  'TRY_POP':        [],
  'SET_RET_Q':      [3],          // prop set; i[d]=Q; return
  'CALLQ_1':        [0],
  'EQ_K':           [0],
  'RSUB_K':         [0],
  'MOV_2':          [0, 2],       // i[a]=i[b]; i[c]=i[d]
  'LOAD_THIS':      [0],
  'SHL':            [0],
  'ARRAY':          [0],
  'ITER_SHIFT':     [1, 2],       // i[b]=!!len, i[c]=shift
  'NEW_0':          [0],
  'PROP_GET_K_2':   [0, 3],       // i[a]=prop, i[c]=prop
  'CJMP':           [],           // conditional jump, no register write
  'EXC_TRY':        [0, 1],       // i[a]=G, i[b]=i[c]
  'EQ':             [0],
  'CALLQ_0':        [0],
  'CATCH_PUSH':     [],
  'ADD_K':          [0],
  'NEW_1':          [0],
  // Variable-width non-string opcodes — handled specially
  'FUNC_CREATE_B':  null,
  'FUNC_CREATE_C':  null,
  'APPLY':          null,
};

/**
 * Parse a single disassembly line into structured data.
 *
 * Expected format: [PC]  MNEMONIC  op1, op2, ...  ; comment
 *
 * @param {string} line - A single line from the disassembly output
 * @returns {{pc: number, mnemonic: string, operands: string[]}|null}
 */
function parseLine(line) {
  const match = line.match(/^\[(\d+)\]\s+(\S+)(?:\s+(.*?))?\s*;/);
  if (!match) return null;

  const pc = parseInt(match[1], 10);
  const mnemonic = match[2];
  const operandStr = (match[3] || '').trim();
  const operands = operandStr ? operandStr.split(/,\s*/) : [];

  return { pc, mnemonic, operands };
}

/**
 * Check if an operand string represents a register (e.g., "r17").
 * @param {string} op
 * @returns {boolean}
 */
function isReg(op) {
  return typeof op === 'string' && op.length > 1 && op[0] === 'r' && !isNaN(op.slice(1));
}

/**
 * Parse an immediate (constant) operand value.
 * @param {string} op
 * @returns {number}
 */
function parseImm(op) {
  return parseInt(op, 10);
}

/**
 * Extract all reconstructed string literals from the disassembly.
 *
 * Walks the disassembly linearly, tracking which registers have active
 * string builds. When a build is finalized (register overwritten or
 * end-of-input), the accumulated characters are joined into a string.
 *
 * @param {string[]} disasmLines - Array of disassembly text lines
 * @returns {Array<{pc: number, register: string, value: string, endPC: number}>}
 */
function extractStrings(disasmLines) {
  // Active string builds: register name → { startPC, chars[], lastPC }
  const active = new Map();
  const results = [];

  /**
   * Finalize the active string build for a register.
   * If the build has accumulated characters, add it to results.
   */
  function finalize(reg) {
    const build = active.get(reg);
    if (build && build.chars.length > 0) {
      results.push({
        pc: build.startPC,
        register: reg,
        value: build.chars.join(''),
        endPC: build.lastPC
      });
    }
    active.delete(reg);
  }

  /**
   * Start a new string build in a register.
   * Finalizes any existing build in that register first.
   */
  function startBuild(reg, pc) {
    finalize(reg);
    active.set(reg, { startPC: pc, chars: [], lastPC: pc });
  }

  /**
   * Append a character to the active string build in a register.
   * If no active build exists, the append is silently ignored
   * (e.g., data region garbage or register reused without STR_EMPTY).
   */
  function appendChar(reg, charCode, pc) {
    const build = active.get(reg);
    if (build) {
      build.chars.push(String.fromCharCode(charCode));
      build.lastPC = pc;
    }
  }

  /**
   * Kill (finalize) a register's active build because it's being
   * overwritten by a non-string value.
   */
  function killReg(reg) {
    if (active.has(reg)) {
      finalize(reg);
    }
  }

  /**
   * Handle variable-width non-string opcodes.
   * Identifies destination registers in FUNC_CREATE_B, FUNC_CREATE_C, APPLY.
   */
  function handleVariableNonString(mnemonic, ops) {
    if (mnemonic === 'FUNC_CREATE_B') {
      // ops: R(obj), K(prop), R(val), K(count=w), [R closure vars...],
      //       R(func_dest), K(offset), K(arity), R(obj2), R(prop2), R(val2)
      if (ops.length >= 4) {
        const w = parseImm(ops[3]);
        if (!isNaN(w) && w >= 0) {
          const funcDestIdx = 4 + w;
          if (funcDestIdx < ops.length && isReg(ops[funcDestIdx])) {
            killReg(ops[funcDestIdx]);
          }
        }
      }
    } else if (mnemonic === 'FUNC_CREATE_C') {
      // ops: K(count=w), [R closure vars...], R(func_dest), K(offset), K(arity)
      if (ops.length >= 1) {
        const w = parseImm(ops[0]);
        if (!isNaN(w) && w >= 0) {
          const funcDestIdx = 1 + w;
          if (funcDestIdx < ops.length && isReg(ops[funcDestIdx])) {
            killReg(ops[funcDestIdx]);
          }
        }
      }
    } else if (mnemonic === 'APPLY') {
      // ops: R(dest), R(func), R(thisArg), K(count), [R args...]
      if (ops.length >= 1 && isReg(ops[0])) {
        killReg(ops[0]);
      }
    }
  }

  // --- Main processing loop ---
  for (const line of disasmLines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    const { pc, mnemonic, operands: ops } = parsed;

    switch (mnemonic) {
      // === String-starting opcodes ===

      case 'STR_EMPTY': {
        // 93: R(a) = ""
        // ops[0] = R(a)
        startBuild(ops[0], pc);
        break;
      }

      case 'STR_INIT': {
        // 31: R(a) = ""; R(b) += char(K)
        // ops[0]=R(a), ops[1]=R(b), ops[2]=K(char)
        // Usually ops[0] === ops[1] (same register)
        startBuild(ops[0], pc);
        appendChar(ops[1], parseImm(ops[2]), pc);
        break;
      }

      // === Pure string-append opcodes ===

      case 'STR_APPEND': {
        // 67: R(a) += char(K)
        // ops[0]=R(a), ops[1]=K(char)
        appendChar(ops[0], parseImm(ops[1]), pc);
        break;
      }

      case 'STR_APPEND_2': {
        // 19: R(a) += char(K); R(b) += char(K)
        // ops[0]=R(a), ops[1]=K(char1), ops[2]=R(b), ops[3]=K(char2)
        appendChar(ops[0], parseImm(ops[1]), pc);
        appendChar(ops[2], parseImm(ops[3]), pc);
        break;
      }

      // === Compound string opcodes ===

      case 'STR_OBJ_STR': {
        // 54: R(a) += char(K); R(b) = {}; R(c) = ""
        // OPERAND_TYPES: RKRR → ops[0]=R(str), ops[1]=K(char), ops[2]=R(obj), ops[3]=R(newStr)
        appendChar(ops[0], parseImm(ops[1]), pc);
        killReg(ops[2]);  // R(obj) gets {} — non-string write
        startBuild(ops[3], pc);  // R(newStr) gets "" — new string build
        break;
      }

      case 'STR_PROP': {
        // 64: R(a) += char(K); R(b) = R(c)[R(d)]
        // OPERAND_TYPES: RKRRR → ops[0]=R(str), ops[1]=K(char),
        //   ops[2]=R(dest), ops[3]=R(obj), ops[4]=R(key)
        appendChar(ops[0], parseImm(ops[1]), pc);
        killReg(ops[2]);  // R(dest) gets prop-get result
        break;
      }

      case 'STR_SET_STR': {
        // 65: R(a) += char(K); R(b)[K] = R(c); R(d) = ""
        // OPERAND_TYPES: RKRKRR → ops[0]=R(str), ops[1]=K(char),
        //   ops[2]=R(obj), ops[3]=K(prop), ops[4]=R(val), ops[5]=R(newStr)
        appendChar(ops[0], parseImm(ops[1]), pc);
        startBuild(ops[5], pc);  // R(newStr) gets "" — new string build
        break;
      }

      case 'STR_SET_K': {
        // 76: R(a) += char(K); R(b)[K] = R(c)
        // OPERAND_TYPES: RKRKR → ops[0]=R(str), ops[1]=K(char),
        //   ops[2]=R(obj), ops[3]=K(prop), ops[4]=R(val)
        // Only appends a char; the prop set is a side effect — building continues
        appendChar(ops[0], parseImm(ops[1]), pc);
        break;
      }

      case 'PROP_STR': {
        // 72: R(a) = R(b)[R(c)]; R(d) = ""; R(e) += char(K)
        // OPERAND_TYPES: RRRRRK → ops[0]=R(dest), ops[1]=R(obj), ops[2]=R(prop),
        //   ops[3]=R(str), ops[4]=R(str'), ops[5]=K(char)
        killReg(ops[0]);  // R(dest) gets prop-get result — non-string write
        startBuild(ops[3], pc);  // R(str) gets "" — new string build
        appendChar(ops[4], parseImm(ops[5]), pc);  // R(str') += char
        break;
      }

      case 'FUNC_CREATE_A': {
        // 12: R(a) += char(K); closure creation; prop set
        // ops[0]=R(str), ops[1]=K(char), ops[2]=K(count=w),
        //   ops[3..3+w-1]=R(closure_vars),
        //   ops[3+w]=R(func_dest), ops[4+w]=K(offset), ops[5+w]=K(arity),
        //   ops[6+w]=R(obj), ops[7+w]=R(prop), ops[8+w]=R(val)
        appendChar(ops[0], parseImm(ops[1]), pc);

        // The func_dest register gets a closure — non-string write
        const w = parseImm(ops[2]);
        if (!isNaN(w) && w >= 0) {
          const funcDestIdx = 3 + w;
          if (funcDestIdx < ops.length && isReg(ops[funcDestIdx])) {
            killReg(ops[funcDestIdx]);
          }
        }
        break;
      }

      // === Non-string opcodes ===

      default: {
        const destPositions = DEST_POSITIONS[mnemonic];
        if (destPositions === null) {
          // Variable-width non-string opcode
          handleVariableNonString(mnemonic, ops);
        } else if (destPositions && destPositions.length > 0) {
          for (const idx of destPositions) {
            if (idx < ops.length && isReg(ops[idx])) {
              killReg(ops[idx]);
            }
          }
        }
        // If destPositions is [] or undefined, no registers are overwritten
        break;
      }
    }
  }

  // Finalize any remaining active builds
  for (const reg of [...active.keys()]) {
    finalize(reg);
  }

  return results;
}

module.exports = { extractStrings };
