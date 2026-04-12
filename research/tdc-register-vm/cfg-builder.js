'use strict';

/**
 * ChaosVM Control Flow Graph Builder
 *
 * Builds a CFG (control flow graph) for each of the 270 valid functions
 * found in the disassembly. Each function's CFG consists of basic blocks
 * connected by edges (jumps, branches, fall-throughs, exception handlers).
 *
 * Uses a reachability walk from the function's entry PC, following all
 * control flow paths. ChaosVM deliberately scatters code across the
 * bytecode, so a function's blocks may span the entire address space.
 *
 * Jump target formulas (verified in Task 2.1 planning):
 *   JMP (38):        target = PC + offset + 1
 *   CJMP (87) true:  target = PC + trueOffset + 1
 *   CJMP (87) false: target = PC + falseOffset + 1
 *   CATCH_PUSH (91): handler = PC + K + 1
 *   TRY_PUSH (33):   handler = PC + K + 3
 *   EXC_TRY (88):    handler = PC + K + 4
 */

// Opcode numbers for control flow instructions
const OP_JMP = 38;
const OP_CJMP = 87;
const OP_RET = 24;
const OP_RET_CLEANUP = 7;
const OP_RET_BARE = 60;
const OP_SET_RET = 46;
const OP_SET_RET_Q = 75;
const OP_THROW = 37;
const OP_CATCH_PUSH = 91;
const OP_TRY_PUSH = 33;
const OP_TRY_POP = 74;
const OP_EXC_TRY = 88;

// Sets for quick lookup
const TERMINATOR_OPS = new Set([
  OP_JMP, OP_CJMP,
  OP_RET, OP_RET_CLEANUP, OP_RET_BARE, OP_SET_RET, OP_SET_RET_Q,
  OP_THROW
]);

const RET_OPS = new Set([
  OP_RET, OP_RET_CLEANUP, OP_RET_BARE, OP_SET_RET, OP_SET_RET_Q
]);

// Mnemonic-to-opcode mapping (for parsing disassembly lines)
const MNEMONIC_TO_OP = {
  'JMP': OP_JMP,
  'CJMP': OP_CJMP,
  'RET': OP_RET,
  'RET_CLEANUP': OP_RET_CLEANUP,
  'RET_BARE': OP_RET_BARE,
  'SET_RET': OP_SET_RET,
  'SET_RET_Q': OP_SET_RET_Q,
  'THROW': OP_THROW,
  'CATCH_PUSH': OP_CATCH_PUSH,
  'TRY_PUSH': OP_TRY_PUSH,
  'TRY_POP': OP_TRY_POP,
  'EXC_TRY': OP_EXC_TRY,
};

/**
 * Parse a single disassembly line into an instruction object.
 *
 * Format: [PC]  MNEMONIC  operands...  ; comment
 * Returns { pc, opcode, mnemonic, operands, rawLine } or null if unparseable.
 */
function parseDisasmLine(line) {
  // Match: [PC]  MNEMONIC  rest
  const m = line.match(/^\[(\d+)\]\s+(\S+)\s*(.*)/);
  if (!m) return null;

  const pc = parseInt(m[1], 10);
  const mnemonic = m[2];

  // Split operands from comment
  const rest = m[3];
  let operandStr = rest;
  const commentIdx = rest.indexOf(';');
  if (commentIdx !== -1) {
    operandStr = rest.slice(0, commentIdx).trim();
  }

  // Parse operands (comma-separated, may be registers, numbers, etc.)
  const operands = operandStr
    ? operandStr.split(/,\s*/).map(s => s.trim()).filter(s => s.length > 0)
    : [];

  // Resolve opcode number from mnemonic
  const opcodeNum = MNEMONIC_TO_OP[mnemonic] !== undefined
    ? MNEMONIC_TO_OP[mnemonic]
    : null; // Only control flow opcodes get numbers; others are null

  return {
    pc,
    opcode: opcodeNum,
    mnemonic,
    operands,
    rawLine: line,
  };
}

/**
 * Parse all disassembly lines into a Map<PC, Instruction>.
 */
function parseDisassembly(disasmLines) {
  const instrMap = new Map();
  const pcList = []; // sorted order of PCs

  for (const line of disasmLines) {
    const instr = parseDisasmLine(line);
    if (instr) {
      instrMap.set(instr.pc, instr);
      pcList.push(instr.pc);
    }
  }

  // pcList should already be sorted since disasm is sequential,
  // but sort just in case
  pcList.sort((a, b) => a - b);

  return { instrMap, pcList };
}

/**
 * Compute the jump/branch targets for a given instruction.
 *
 * Returns { targets: PC[], handlerTargets: PC[], termType: string|null }
 */
function getControlFlowInfo(instr) {
  const { pc, mnemonic, operands } = instr;

  switch (mnemonic) {
    case 'JMP': {
      // Operand is the offset value
      const offset = parseInt(operands[0], 10);
      const target = pc + offset + 1;
      return {
        targets: [target],
        handlerTargets: [],
        termType: 'jmp',
        termDetails: { type: 'jmp', target },
      };
    }

    case 'CJMP': {
      // Operands: condReg, trueOffset, falseOffset
      const condReg = operands[0];
      const trueOffset = parseInt(operands[1], 10);
      const falseOffset = parseInt(operands[2], 10);
      const trueTarget = pc + trueOffset + 1;
      const falseTarget = pc + falseOffset + 1;
      return {
        targets: [trueTarget, falseTarget],
        handlerTargets: [],
        termType: 'cjmp',
        termDetails: {
          type: 'cjmp',
          trueTarget,
          falseTarget,
          condReg,
        },
      };
    }

    case 'RET':
    case 'RET_CLEANUP':
    case 'RET_BARE':
    case 'SET_RET':
    case 'SET_RET_Q':
      return {
        targets: [],
        handlerTargets: [],
        termType: 'ret',
        termDetails: { type: 'ret' },
      };

    case 'THROW':
      return {
        targets: [],
        handlerTargets: [],
        termType: 'throw',
        termDetails: { type: 'throw' },
      };

    case 'CATCH_PUSH': {
      // Operand: K (offset)
      // handler = PC + K + 1
      const k = parseInt(operands[0], 10);
      const handler = pc + k + 1;
      return {
        targets: [],
        handlerTargets: [handler],
        termType: null, // not a terminator — falls through
        termDetails: null,
      };
    }

    case 'TRY_PUSH': {
      // Operands: regA, regB, K
      // handler = PC + K + 3
      const k = parseInt(operands[2], 10);
      const handler = pc + k + 3;
      return {
        targets: [],
        handlerTargets: [handler],
        termType: null,
        termDetails: null,
      };
    }

    case 'EXC_TRY': {
      // Operands: regA, regB, regC, K
      // handler = PC + K + 4
      const k = parseInt(operands[3], 10);
      const handler = pc + k + 4;
      return {
        targets: [],
        handlerTargets: [handler],
        termType: null,
        termDetails: null,
      };
    }

    default:
      return {
        targets: [],
        handlerTargets: [],
        termType: null,
        termDetails: null,
      };
  }
}

/**
 * Given a sorted list of all instruction PCs, find the next instruction PC
 * after the given one. Returns null if there is no next instruction.
 */
function nextInstructionPC(pc, pcList, pcIndex) {
  const idx = pcIndex.get(pc);
  if (idx === undefined || idx + 1 >= pcList.length) return null;
  return pcList[idx + 1];
}

/**
 * Build the CFG for a single function.
 *
 * @param {number} entryPC - The function's entry point
 * @param {Map} instrMap - Map<PC, Instruction> of all instructions
 * @param {number[]} pcList - Sorted list of all instruction PCs
 * @param {Map} pcIndex - Map<PC, index in pcList>
 * @returns {object} CFG object { blocks, blockCount, instructionCount }
 */
function buildSingleCFG(entryPC, instrMap, pcList, pcIndex) {
  // Phase 1: Identify all leaders (block start PCs) via reachability walk
  const leaders = new Set([entryPC]);
  const reachable = new Set();
  const handlerPCs = new Set(); // exception handler targets
  const worklist = [entryPC];
  const visited = new Set();

  // First pass: walk all reachable instructions to find leaders
  while (worklist.length > 0) {
    const startPC = worklist.pop();
    if (visited.has(startPC)) continue;
    visited.add(startPC);

    if (!instrMap.has(startPC)) continue; // invalid target, skip

    let currentPC = startPC;
    while (currentPC !== null && instrMap.has(currentPC)) {
      const instr = instrMap.get(currentPC);
      reachable.add(currentPC);

      const cfInfo = getControlFlowInfo(instr);

      // Exception handler targets become leaders and are added to worklist
      for (const hTarget of cfInfo.handlerTargets) {
        if (instrMap.has(hTarget)) {
          leaders.add(hTarget);
          handlerPCs.add(hTarget);
          if (!visited.has(hTarget)) {
            worklist.push(hTarget);
          }
        }
      }

      if (cfInfo.termType) {
        // This instruction is a terminator
        for (const target of cfInfo.targets) {
          leaders.add(target);
          if (!visited.has(target)) {
            worklist.push(target);
          }
        }
        // Don't continue sequential walk after terminator
        break;
      }

      // Not a terminator — check if the next instruction is already a leader
      // (meaning we need to split here)
      const npc = nextInstructionPC(currentPC, pcList, pcIndex);
      if (npc === null) break;

      // If next PC is a leader (jump target from elsewhere), we should end
      // this walk segment and ensure it's in the worklist
      if (leaders.has(npc) && npc !== startPC) {
        // The current block will fall through to the leader at npc
        reachable.add(currentPC); // already added above
        if (!visited.has(npc)) {
          worklist.push(npc);
        }
        break;
      }

      currentPC = npc;
    }
  }

  // Phase 2: Now we have all reachable PCs and leader PCs.
  // But we may have discovered new leaders during Phase 1 that weren't known
  // when we walked earlier segments. We need to do a clean block construction
  // pass over the reachable instructions, splitting at all known leaders.

  // Also: targets of JMP/CJMP within the function may land in the middle
  // of a previously walked sequence, creating new leaders. We need to find
  // all such splits.

  // Re-walk from entry and all handler PCs, now splitting at all leaders.
  // Sort reachable PCs for sequential traversal
  const sortedReachable = Array.from(reachable).sort((a, b) => a - b);

  // Build blocks by walking reachable PCs and splitting at leaders
  const blocks = [];
  const blockByStartPC = new Map();

  let currentBlock = null;

  for (const pc of sortedReachable) {
    if (leaders.has(pc) || currentBlock === null) {
      // Start a new block
      if (currentBlock) {
        blocks.push(currentBlock);
        blockByStartPC.set(currentBlock.startPC, currentBlock);
      }
      currentBlock = {
        id: `b${blocks.length}`,
        startPC: pc,
        endPC: pc,
        instructions: [pc],
        terminator: null,
        successors: [],
        predecessors: [],
        exceptionHandlers: [],
      };
    } else {
      currentBlock.instructions.push(pc);
      currentBlock.endPC = pc;
    }
  }

  // Push the last block
  if (currentBlock) {
    blocks.push(currentBlock);
    blockByStartPC.set(currentBlock.startPC, currentBlock);
  }

  // Reorder blocks: entry block first, then the rest sorted by startPC.
  // This ensures b0 is always the entry block.
  const entryBlockIdx = blocks.findIndex(b => b.startPC === entryPC);
  if (entryBlockIdx > 0) {
    const [entryBlock] = blocks.splice(entryBlockIdx, 1);
    blocks.unshift(entryBlock);
  }
  // Re-assign block IDs after reordering
  for (let i = 0; i < blocks.length; i++) {
    blocks[i].id = `b${i}`;
  }

  // Phase 3: Determine terminators and wire up edges
  const blockByPC = new Map(); // Map<PC, blockId> for any PC to its containing block
  for (const block of blocks) {
    for (const pc of block.instructions) {
      blockByPC.set(pc, block.id);
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const lastPC = block.endPC;
    const lastInstr = instrMap.get(lastPC);

    if (!lastInstr) continue;

    const cfInfo = getControlFlowInfo(lastInstr);

    if (cfInfo.termType) {
      block.terminator = cfInfo.termDetails;

      // Add successor edges
      for (const target of cfInfo.targets) {
        const targetBlockId = blockByPC.get(target);
        if (targetBlockId !== undefined) {
          block.successors.push(targetBlockId);
        }
      }
    } else {
      // Non-terminator at end of block — must be a fallthrough
      // (block was split because the next instruction is a leader)
      const npc = nextInstructionPC(lastPC, pcList, pcIndex);
      if (npc !== null && blockByPC.has(npc)) {
        const targetBlockId = blockByPC.get(npc);
        block.terminator = { type: 'fallthrough', target: npc };
        block.successors.push(targetBlockId);
      } else {
        // Block ends without a terminator and no fallthrough target
        // This shouldn't normally happen for well-formed functions
        block.terminator = { type: 'fallthrough', target: null };
      }
    }

    // Collect exception handler info for this block
    // Walk through all instructions in the block, look for handler-push ops
    for (const pc of block.instructions) {
      const instr = instrMap.get(pc);
      if (!instr) continue;
      const info = getControlFlowInfo(instr);
      for (const hTarget of info.handlerTargets) {
        const hBlockId = blockByPC.get(hTarget);
        if (hBlockId !== undefined) {
          block.exceptionHandlers.push(hBlockId);
        }
      }
    }
  }

  // Phase 4: Wire up predecessors (inverse of successors)
  const blockById = new Map();
  for (const block of blocks) {
    blockById.set(block.id, block);
  }

  for (const block of blocks) {
    for (const succId of block.successors) {
      const succBlock = blockById.get(succId);
      if (succBlock) {
        succBlock.predecessors.push(block.id);
      }
    }
  }

  // Count total instructions
  let instructionCount = 0;
  for (const block of blocks) {
    instructionCount += block.instructions.length;
  }

  return {
    blocks,
    blockCount: blocks.length,
    instructionCount,
  };
}

/**
 * Build CFGs for all valid functions.
 *
 * @param {string[]} disasmLines - Array of disassembly text lines
 * @param {object[]} functions - Array of function entries from functions.json
 * @returns {Map<number, object>} Map<functionId, CFG>
 */
function buildCFG(disasmLines, functions) {
  // Step 1: Parse disassembly into instruction map
  const { instrMap, pcList } = parseDisassembly(disasmLines);

  // Build a PC → index map for fast next-PC lookup
  const pcIndex = new Map();
  for (let i = 0; i < pcList.length; i++) {
    pcIndex.set(pcList[i], i);
  }

  console.log(`Parsed ${instrMap.size} instructions, ${pcList.length} PCs`);

  // Step 2: Filter to valid functions only
  const validFunctions = functions.filter(f => f.valid);
  console.log(`Building CFGs for ${validFunctions.length} valid functions`);

  // Step 3: Build CFG for each function
  const cfgMap = new Map();

  for (const func of validFunctions) {
    if (func.entryPC === null || func.entryPC === undefined) continue;
    if (!instrMap.has(func.entryPC)) {
      console.warn(`Warning: function ${func.id} entryPC=${func.entryPC} not found in disassembly`);
      continue;
    }

    const cfg = buildSingleCFG(func.entryPC, instrMap, pcList, pcIndex);
    cfgMap.set(func.id, {
      functionId: func.id,
      entryPC: func.entryPC,
      blocks: cfg.blocks,
      blockCount: cfg.blockCount,
      instructionCount: cfg.instructionCount,
    });
  }

  return cfgMap;
}

module.exports = { buildCFG, parseDisassembly, parseDisasmLine, getControlFlowInfo };
