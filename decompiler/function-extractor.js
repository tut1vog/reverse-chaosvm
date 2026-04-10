'use strict';

/**
 * ChaosVM Function Boundary Extractor
 *
 * Parses the verified disassembly output, identifies FUNC_CREATE_A/B/C
 * instructions, computes absolute entry PCs for each closure, and produces
 * a function table mapping every closure in the bytecode.
 *
 * Entry PC formulas (derived from tdc.js evaluation order):
 *
 *   For all FUNC_CREATE variants, the key expression is:
 *     i[Y[++C]] = J(C + Y[++C], h, S, m, I)
 *   JS evaluates left-to-right: dest read (C becomes C_dest), then
 *   C_dest + offset (reading offset increments C again).
 *   J receives startPC = C_dest + offset.
 *   First instruction executes at startPC + 1 (due to Y[++C] in the VM loop).
 *
 *   | Opcode | C_dest formula       | entryPC                           |
 *   |--------|----------------------|-----------------------------------|
 *   | 12 (A) | pc + 4 + w           | (pc + 4 + w) + offset + 1        |
 *   | 23 (B) | pc + 5 + w           | (pc + 5 + w) + offset + 1        |
 *   | 55 (C) | pc + 2 + w           | (pc + 2 + w) + offset + 1        |
 *
 *   Where w = closure count (number of captured variables).
 *
 * Validity heuristics (data region artifacts):
 *   - INVALID marker in disassembly comment
 *   - Negative register indices (e.g., r-13743)
 *   - Entry PC outside bytecode bounds [0, 70016]
 *   - Arity > 20 (ChaosVM functions are simple)
 *   - Captured var count > 50
 */

const BYTECODE_MAX = 70016;

/**
 * Parse the closure info from a disassembly line's comment section.
 *
 * Expects a pattern like: rN = closure(offset=X, [vars], arity=Y)
 *
 * @param {string} comment - The comment portion after ';'
 * @returns {{destRegister: string, offset: number, capturedVars: string[], arity: number}|null}
 */
function parseClosureComment(comment) {
  const match = comment.match(
    /(r-?\d+)\s*=\s*closure\(offset=(-?\d+),\s*\[([^\]]*)\],\s*arity=(\d+)\)/
  );
  if (!match) return null;

  const destRegister = match[1];
  const offset = parseInt(match[2], 10);
  const varsStr = match[3].trim();
  const capturedVars = varsStr.length > 0
    ? varsStr.split(/,\s*/)
    : [];
  const arity = parseInt(match[4], 10);

  return { destRegister, offset, capturedVars, arity };
}

/**
 * Parse a disassembly line to extract PC, mnemonic, operands, and comment.
 *
 * @param {string} line
 * @returns {{pc: number, mnemonic: string, operands: string[], comment: string}|null}
 */
function parseLine(line) {
  // Format: [PC]  MNEMONIC  op1, op2, ...  ; comment
  const match = line.match(/^\[(\d+)\]\s+(\S+)\s+(.*?)\s*;\s*(.*)$/);
  if (!match) return null;

  const pc = parseInt(match[1], 10);
  const mnemonic = match[2];
  const operandStr = (match[3] || '').trim();
  const operands = operandStr ? operandStr.split(/,\s*/) : [];
  const comment = match[4] || '';

  return { pc, mnemonic, operands, comment };
}

/**
 * Compute the absolute entry PC for a FUNC_CREATE instruction.
 *
 * @param {number} pc - PC of the FUNC_CREATE instruction (opcode position)
 * @param {string} opcode - "FUNC_CREATE_A", "FUNC_CREATE_B", or "FUNC_CREATE_C"
 * @param {number} w - Closure count (number of captured variables)
 * @param {number} offset - Raw offset operand from bytecode
 * @returns {number} The PC of the first instruction in the created function
 */
function computeEntryPC(pc, opcode, w, offset) {
  // C_dest = pc + fixed_reads_before_dest + w
  // entryPC = C_dest + offset + 1
  let cDest;
  switch (opcode) {
    case 'FUNC_CREATE_A':
      // Reads before dest: str(1) + char(1) + count(1) + w vars + dest(1) = 4 + w
      // But C_dest is the value of C AFTER reading dest, so:
      // C starts at pc, then 4 + w increments to read through dest
      cDest = pc + 4 + w;
      break;
    case 'FUNC_CREATE_B':
      // Reads before dest: obj(1) + prop(1) + val(1) + count(1) + w vars + dest(1) = 5 + w
      cDest = pc + 5 + w;
      break;
    case 'FUNC_CREATE_C':
      // Reads before dest: count(1) + w vars + dest(1) = 2 + w
      cDest = pc + 2 + w;
      break;
    default:
      return NaN;
  }
  return cDest + offset + 1;
}

/**
 * Determine if a FUNC_CREATE entry is likely valid (real code, not data region).
 *
 * @param {object} entry - Partial FuncEntry with entryPC, arity, capturedVars, destRegister, comment
 * @returns {boolean}
 */
function isValid(entry) {
  // INVALID marker from disassembler
  if (entry.comment && entry.comment.includes('INVALID')) return false;

  // Negative register index in dest
  if (entry.destRegister && entry.destRegister.startsWith('r-')) return false;

  // Negative register in captured vars
  if (entry.capturedVars.some(v => v.startsWith('r-'))) return false;

  // Entry PC out of bounds
  if (entry.entryPC < 0 || entry.entryPC > BYTECODE_MAX) return false;

  // Unreasonable arity
  if (entry.arity > 20) return false;

  // Unreasonable captured var count
  if (entry.capturedVars.length > 50) return false;

  return true;
}

/**
 * Extract all function entries from the disassembly.
 *
 * @param {string[]} disasmLines - Array of disassembly text lines
 * @returns {Array<{id: number, entryPC: number, creatorPC: number|null,
 *   creatorOpcode: string|null, capturedVars: string[], arity: number|null,
 *   destRegister: string|null, rawOffset: number|null, valid: boolean}>}
 */
function extractFunctions(disasmLines) {
  // First pass: build set of all instruction start PCs for validation
  const instrStartPCs = new Set();
  for (const line of disasmLines) {
    const m = line.match(/^\[(\d+)\]/);
    if (m) instrStartPCs.add(parseInt(m[1], 10));
  }

  const closures = [];

  for (const line of disasmLines) {
    const parsed = parseLine(line);
    if (!parsed) continue;

    const { pc, mnemonic, comment } = parsed;

    if (mnemonic !== 'FUNC_CREATE_A' &&
        mnemonic !== 'FUNC_CREATE_B' &&
        mnemonic !== 'FUNC_CREATE_C') {
      continue;
    }

    // Check for INVALID marker (bad closure count from data region)
    if (comment.includes('INVALID')) {
      closures.push({
        creatorPC: pc,
        creatorOpcode: mnemonic,
        capturedVars: [],
        arity: null,
        destRegister: null,
        rawOffset: null,
        entryPC: NaN,
        valid: false,
        comment: comment
      });
      continue;
    }

    // Parse the closure info from the comment
    const closureInfo = parseClosureComment(comment);
    if (!closureInfo) {
      // Could not parse — mark as invalid
      closures.push({
        creatorPC: pc,
        creatorOpcode: mnemonic,
        capturedVars: [],
        arity: null,
        destRegister: null,
        rawOffset: null,
        entryPC: NaN,
        valid: false,
        comment: comment
      });
      continue;
    }

    const { destRegister, offset, capturedVars, arity } = closureInfo;
    const w = capturedVars.length;
    const entryPC = computeEntryPC(pc, mnemonic, w, offset);

    const entry = {
      creatorPC: pc,
      creatorOpcode: mnemonic,
      capturedVars: capturedVars,
      arity: arity,
      destRegister: destRegister,
      rawOffset: offset,
      entryPC: entryPC,
      valid: true,
      comment: comment
    };

    // Apply validity heuristics
    entry.valid = isValid(entry);

    // Additional check: entryPC must be an actual instruction start
    // (catches data-region artifacts that pass basic heuristics)
    if (entry.valid && !instrStartPCs.has(entry.entryPC)) {
      entry.valid = false;
    }

    closures.push(entry);
  }

  // Sort closures by entryPC for consistent ordering
  // Invalid entries with NaN entryPC go to the end
  closures.sort((a, b) => {
    if (isNaN(a.entryPC) && isNaN(b.entryPC)) return a.creatorPC - b.creatorPC;
    if (isNaN(a.entryPC)) return 1;
    if (isNaN(b.entryPC)) return -1;
    return a.entryPC - b.entryPC;
  });

  // Build final result with main entry as id=0
  const results = [];

  // Main entry point: startPC=36578, first instruction at 36579
  results.push({
    id: 0,
    entryPC: 36579,
    creatorPC: null,
    creatorOpcode: null,
    capturedVars: [],
    arity: null,
    destRegister: null,
    rawOffset: null,
    valid: true
  });

  // Add closures with sequential ids
  for (let i = 0; i < closures.length; i++) {
    const c = closures[i];
    results.push({
      id: i + 1,
      entryPC: c.entryPC,
      creatorPC: c.creatorPC,
      creatorOpcode: c.creatorOpcode,
      capturedVars: c.capturedVars,
      arity: c.arity,
      destRegister: c.destRegister,
      rawOffset: c.rawOffset,
      valid: c.valid
    });
  }

  return results;
}

module.exports = { extractFunctions, computeEntryPC, parseClosureComment };
