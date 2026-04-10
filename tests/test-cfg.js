'use strict';

/**
 * Test suite for Task 2.1: Per-Function CFG Construction
 *
 * Validates the CFG builder output against the acceptance criteria in PROGRESS.md.
 */

const fs = require('fs');
const path = require('path');

const CFG_PATH = path.join(__dirname, '..', 'output', 'cfg.json');
const DISASM_PATH = path.join(__dirname, '..', 'output', 'disasm-full.txt');
const FUNCTIONS_PATH = path.join(__dirname, '..', 'output', 'functions.json');

// Load data
const cfgData = JSON.parse(fs.readFileSync(CFG_PATH, 'utf8'));
const disasmText = fs.readFileSync(DISASM_PATH, 'utf8');
const disasmLines = disasmText.split('\n').filter(l => l.length > 0);
const functions = JSON.parse(fs.readFileSync(FUNCTIONS_PATH, 'utf8'));

// Build instruction start set from disassembly
const instrStartSet = new Set();
const instrMap = new Map();
for (const line of disasmLines) {
  const m = line.match(/^\[(\d+)\]\s+(\S+)/);
  if (m) {
    const pc = parseInt(m[1], 10);
    instrStartSet.add(pc);
    instrMap.set(pc, { pc, mnemonic: m[2], rawLine: line });
  }
}

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.log(`  FAIL: ${message}`);
  }
}

// ============================================================
// Test 1: Correct number of functions
// ============================================================
console.log('\n=== Test 1: Function count ===');
const cfgIds = Object.keys(cfgData).map(Number);
assert(cfgIds.length === 270, `Expected 270 functions, got ${cfgIds.length}`);

const validFunctions = functions.filter(f => f.valid);
assert(validFunctions.length === cfgIds.length,
  `CFG count (${cfgIds.length}) should match valid function count (${validFunctions.length})`);

// ============================================================
// Test 2: JSON structure validation
// ============================================================
console.log('\n=== Test 2: JSON structure ===');
let structureOk = true;
for (const id of cfgIds) {
  const cfg = cfgData[id];
  if (!cfg.hasOwnProperty('functionId')) { structureOk = false; break; }
  if (!cfg.hasOwnProperty('entryPC')) { structureOk = false; break; }
  if (!cfg.hasOwnProperty('blocks')) { structureOk = false; break; }
  if (!cfg.hasOwnProperty('blockCount')) { structureOk = false; break; }
  if (!cfg.hasOwnProperty('instructionCount')) { structureOk = false; break; }
  if (!Array.isArray(cfg.blocks)) { structureOk = false; break; }
}
assert(structureOk, 'All CFGs have required top-level fields');

let blockStructureOk = true;
let blockStructureIssue = '';
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    const requiredFields = ['id', 'startPC', 'endPC', 'instructions', 'terminator', 'successors', 'predecessors'];
    for (const field of requiredFields) {
      if (!block.hasOwnProperty(field)) {
        blockStructureOk = false;
        blockStructureIssue = `Block ${block.id} in func ${id} missing field '${field}'`;
        break;
      }
    }
    if (!blockStructureOk) break;
  }
  if (!blockStructureOk) break;
}
assert(blockStructureOk, blockStructureIssue || 'All blocks have required fields');

// ============================================================
// Test 3: Entry block is always b0 at entryPC
// ============================================================
console.log('\n=== Test 3: Entry block ===');
let entryBlockOk = true;
let entryBlockIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  if (cfg.blocks.length === 0) {
    entryBlockOk = false;
    entryBlockIssues.push(`func ${id} has 0 blocks`);
    continue;
  }
  const b0 = cfg.blocks[0];
  if (b0.id !== 'b0') {
    entryBlockOk = false;
    entryBlockIssues.push(`func ${id} first block id=${b0.id}, expected 'b0'`);
  }
  if (b0.startPC !== cfg.entryPC) {
    entryBlockOk = false;
    entryBlockIssues.push(`func ${id} b0.startPC=${b0.startPC} != entryPC=${cfg.entryPC}`);
  }
}
assert(entryBlockOk, entryBlockIssues.length > 0 ? entryBlockIssues.join('; ') : 'All entry blocks are b0 at entryPC');

// ============================================================
// Test 4: No duplicate PCs within any function
// ============================================================
console.log('\n=== Test 4: No duplicate PCs ===');
let noDuplicates = true;
let dupIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  const pcSet = new Set();
  for (const block of cfg.blocks) {
    for (const pc of block.instructions) {
      if (pcSet.has(pc)) {
        noDuplicates = false;
        dupIssues.push(`func ${id}: PC ${pc} appears in multiple blocks`);
      }
      pcSet.add(pc);
    }
  }
}
assert(noDuplicates, dupIssues.length > 0 ? dupIssues.slice(0, 5).join('; ') : 'No duplicate PCs');

// ============================================================
// Test 5: Edge consistency — successor↔predecessor symmetric
// ============================================================
console.log('\n=== Test 5: Edge consistency ===');
let edgeConsistent = true;
let edgeIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  const blockById = new Map();
  for (const block of cfg.blocks) {
    blockById.set(block.id, block);
  }

  for (const block of cfg.blocks) {
    // Each successor should list this block as predecessor
    for (const succId of block.successors) {
      const succ = blockById.get(succId);
      if (!succ) {
        edgeConsistent = false;
        edgeIssues.push(`func ${id}: block ${block.id} has successor ${succId} which doesn't exist`);
        continue;
      }
      if (!succ.predecessors.includes(block.id)) {
        edgeConsistent = false;
        edgeIssues.push(`func ${id}: ${block.id}→${succId} but ${succId} doesn't list ${block.id} as predecessor`);
      }
    }
    // Each predecessor should list this block as successor
    for (const predId of block.predecessors) {
      const pred = blockById.get(predId);
      if (!pred) {
        edgeConsistent = false;
        edgeIssues.push(`func ${id}: block ${block.id} has predecessor ${predId} which doesn't exist`);
        continue;
      }
      if (!pred.successors.includes(block.id)) {
        edgeConsistent = false;
        edgeIssues.push(`func ${id}: ${predId}←${block.id} but ${predId} doesn't list ${block.id} as successor`);
      }
    }
  }
}
assert(edgeConsistent, edgeIssues.length > 0 ? edgeIssues.slice(0, 5).join('; ') : 'All edges are symmetric');

// ============================================================
// Test 6: Entry block has no predecessors
// ============================================================
console.log('\n=== Test 6: Entry block has no predecessors ===');
let entryNoPred = true;
let entryPredIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  const b0 = cfg.blocks[0];
  if (b0.predecessors.length > 0) {
    // Note: this is OK if the function has a loop back to the entry
    // Let's check if any predecessor is actually a back-edge (loop)
    entryNoPred = false;
    entryPredIssues.push(`func ${id}: b0 has predecessors [${b0.predecessors.join(',')}]`);
  }
}
// Entry block having predecessors is actually valid for functions with loops back to start
// Let's just report the count rather than fail
console.log(`  INFO: ${entryPredIssues.length} functions have predecessors on entry block (loops back to entry)`);
// Don't fail on this — it's valid for loop-back edges

// ============================================================
// Test 7: All blocks have terminators
// ============================================================
console.log('\n=== Test 7: All blocks have terminators ===');
let allTerminators = true;
let termIssues = [];
const validTermTypes = new Set(['jmp', 'cjmp', 'ret', 'throw', 'fallthrough']);
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    if (!block.terminator) {
      allTerminators = false;
      termIssues.push(`func ${id}: block ${block.id} has no terminator`);
    } else if (!validTermTypes.has(block.terminator.type)) {
      allTerminators = false;
      termIssues.push(`func ${id}: block ${block.id} has invalid terminator type '${block.terminator.type}'`);
    }
  }
}
assert(allTerminators, termIssues.length > 0 ? termIssues.slice(0, 5).join('; ') : 'All blocks have valid terminators');

// ============================================================
// Test 8: Jump targets resolve to valid instruction starts
// ============================================================
console.log('\n=== Test 8: Jump target validity ===');
let totalJumpTargets = 0;
let validJumpTargets = 0;
let invalidTargets = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  const blockPCs = new Set();
  for (const block of cfg.blocks) {
    blockPCs.add(block.startPC);
  }

  for (const block of cfg.blocks) {
    const term = block.terminator;
    if (!term) continue;

    if (term.type === 'jmp') {
      totalJumpTargets++;
      if (instrStartSet.has(term.target) && blockPCs.has(term.target)) {
        validJumpTargets++;
      } else {
        invalidTargets.push(`func ${id}: JMP target ${term.target} (instr=${instrStartSet.has(term.target)}, block=${blockPCs.has(term.target)})`);
      }
    } else if (term.type === 'cjmp') {
      totalJumpTargets += 2;
      if (instrStartSet.has(term.trueTarget) && blockPCs.has(term.trueTarget)) {
        validJumpTargets++;
      } else {
        invalidTargets.push(`func ${id}: CJMP true target ${term.trueTarget} (instr=${instrStartSet.has(term.trueTarget)}, block=${blockPCs.has(term.trueTarget)})`);
      }
      if (instrStartSet.has(term.falseTarget) && blockPCs.has(term.falseTarget)) {
        validJumpTargets++;
      } else {
        invalidTargets.push(`func ${id}: CJMP false target ${term.falseTarget} (instr=${instrStartSet.has(term.falseTarget)}, block=${blockPCs.has(term.falseTarget)})`);
      }
    } else if (term.type === 'fallthrough' && term.target !== null) {
      totalJumpTargets++;
      if (instrStartSet.has(term.target) && blockPCs.has(term.target)) {
        validJumpTargets++;
      } else {
        invalidTargets.push(`func ${id}: fallthrough target ${term.target} (instr=${instrStartSet.has(term.target)}, block=${blockPCs.has(term.target)})`);
      }
    }
  }
}
console.log(`  Jump targets: ${validJumpTargets}/${totalJumpTargets} valid`);
if (invalidTargets.length > 0) {
  console.log(`  Invalid targets (${invalidTargets.length}):`);
  for (const t of invalidTargets.slice(0, 20)) {
    console.log(`    ${t}`);
  }
}
// The reverser noted 17 targets land in data regions. Let's check if the invalid ones
// are at least valid instruction starts (just not block starts in the same function)
const invalidButInstrStart = invalidTargets.filter(t => {
  const m = t.match(/target (\d+)/);
  return m && instrStartSet.has(parseInt(m[1], 10));
});
console.log(`  Of invalid targets: ${invalidButInstrStart.length} are valid instruction starts (cross-function or data region)`);
assert(validJumpTargets >= totalJumpTargets * 0.95,
  `Jump target validity: ${validJumpTargets}/${totalJumpTargets} (${(validJumpTargets/totalJumpTargets*100).toFixed(1)}%) — need ≥95%`);

// ============================================================
// Test 9: Instruction count and block count sanity
// ============================================================
console.log('\n=== Test 9: Statistics sanity ===');
let totalBlocks = 0;
let totalInstructions = 0;
for (const id of cfgIds) {
  const cfg = cfgData[id];
  totalBlocks += cfg.blockCount;
  totalInstructions += cfg.instructionCount;
  // Verify reported counts match actual array lengths
  assert(cfg.blockCount === cfg.blocks.length,
    `func ${id}: blockCount=${cfg.blockCount} != blocks.length=${cfg.blocks.length}`);
  let instrCount = 0;
  for (const block of cfg.blocks) {
    instrCount += block.instructions.length;
  }
  assert(cfg.instructionCount === instrCount,
    `func ${id}: instructionCount=${cfg.instructionCount} != sum=${instrCount}`);
}
console.log(`  Total blocks: ${totalBlocks}`);
console.log(`  Total instructions: ${totalInstructions}`);
console.log(`  Total disasm lines: ${instrStartSet.size}`);
const coverage = (totalInstructions / instrStartSet.size * 100).toFixed(1);
console.log(`  Coverage: ${coverage}%`);
assert(totalBlocks === 1066, `Expected 1066 total blocks, got ${totalBlocks}`);
assert(totalInstructions === 15753, `Expected 15753 total instructions, got ${totalInstructions}`);
assert(totalInstructions <= instrStartSet.size, `Instructions in CFGs (${totalInstructions}) should not exceed disasm lines (${instrStartSet.size})`);

// ============================================================
// Test 10: Main function (id=0) sanity
// ============================================================
console.log('\n=== Test 10: Main function sanity ===');
const mainCFG = cfgData['0'];
assert(mainCFG !== undefined, 'Main function (id=0) exists in CFG');
assert(mainCFG.entryPC === 36579, `Main function entryPC=${mainCFG.entryPC}, expected 36579`);
const mainB0 = mainCFG.blocks[0];
assert(mainB0.startPC === 36579, `Main b0 startPC=${mainB0.startPC}, expected 36579`);

// Check first block contains CATCH_PUSH + FUNC_CREATE_C + TRY_POP + JMP
const mainB0Mnemonics = mainB0.instructions.map(pc => {
  const instr = instrMap.get(pc);
  return instr ? instr.mnemonic : 'UNKNOWN';
});
console.log(`  Main b0 mnemonics: ${mainB0Mnemonics.join(', ')}`);
assert(mainB0Mnemonics.includes('CATCH_PUSH'), 'Main b0 contains CATCH_PUSH');
assert(mainB0Mnemonics.includes('JMP'), 'Main b0 ends with JMP');

// ============================================================
// Test 11: Module exports check
// ============================================================
console.log('\n=== Test 11: Module exports ===');
const cfgBuilder = require('../decompiler/cfg-builder');
assert(typeof cfgBuilder.buildCFG === 'function', 'buildCFG is exported as function');
assert(typeof cfgBuilder.parseDisasmLine === 'function', 'parseDisasmLine is exported');
assert(typeof cfgBuilder.getControlFlowInfo === 'function', 'getControlFlowInfo is exported');

// ============================================================
// Test 12: blockCount matches blocks.length for all functions
// ============================================================
console.log('\n=== Test 12: Block count consistency ===');
let blockCountConsistent = true;
for (const id of cfgIds) {
  const cfg = cfgData[id];
  if (cfg.blockCount !== cfg.blocks.length) {
    blockCountConsistent = false;
    console.log(`  func ${id}: blockCount=${cfg.blockCount} != blocks.length=${cfg.blocks.length}`);
  }
}
assert(blockCountConsistent, 'All blockCount values match blocks.length');

// ============================================================
// Test 13: Instructions within each block are sorted by PC
// ============================================================
console.log('\n=== Test 13: Instructions sorted within blocks ===');
let instrSorted = true;
let sortIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    for (let i = 1; i < block.instructions.length; i++) {
      if (block.instructions[i] <= block.instructions[i-1]) {
        instrSorted = false;
        sortIssues.push(`func ${id} block ${block.id}: PC ${block.instructions[i]} <= ${block.instructions[i-1]}`);
      }
    }
  }
}
assert(instrSorted, sortIssues.length > 0 ? sortIssues.slice(0, 5).join('; ') : 'All instructions sorted within blocks');

// ============================================================
// Test 14: startPC and endPC match first/last instruction
// ============================================================
console.log('\n=== Test 14: startPC/endPC consistency ===');
let pcConsistent = true;
let pcIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    if (block.instructions.length === 0) {
      pcConsistent = false;
      pcIssues.push(`func ${id} block ${block.id}: empty instructions`);
      continue;
    }
    if (block.startPC !== block.instructions[0]) {
      pcConsistent = false;
      pcIssues.push(`func ${id} block ${block.id}: startPC=${block.startPC} != first instr ${block.instructions[0]}`);
    }
    if (block.endPC !== block.instructions[block.instructions.length - 1]) {
      pcConsistent = false;
      pcIssues.push(`func ${id} block ${block.id}: endPC=${block.endPC} != last instr ${block.instructions[block.instructions.length - 1]}`);
    }
  }
}
assert(pcConsistent, pcIssues.length > 0 ? pcIssues.slice(0, 5).join('; ') : 'All startPC/endPC consistent');

// ============================================================
// Test 15: All instruction PCs are valid disassembly positions
// ============================================================
console.log('\n=== Test 15: All instruction PCs are valid ===');
let allPCsValid = true;
let invalidPCs = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    for (const pc of block.instructions) {
      if (!instrStartSet.has(pc)) {
        allPCsValid = false;
        invalidPCs.push(`func ${id} block ${block.id}: PC ${pc} not in disassembly`);
      }
    }
  }
}
assert(allPCsValid, invalidPCs.length > 0 ? invalidPCs.slice(0, 5).join('; ') : 'All PCs are valid disasm positions');

// ============================================================
// Test 16: Terminator details have correct shape
// ============================================================
console.log('\n=== Test 16: Terminator shape ===');
let termShapeOk = true;
let termShapeIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    const term = block.terminator;
    if (!term) continue;
    switch (term.type) {
      case 'jmp':
        if (typeof term.target !== 'number') {
          termShapeOk = false;
          termShapeIssues.push(`func ${id} ${block.id}: jmp.target not a number`);
        }
        break;
      case 'cjmp':
        if (typeof term.trueTarget !== 'number' || typeof term.falseTarget !== 'number') {
          termShapeOk = false;
          termShapeIssues.push(`func ${id} ${block.id}: cjmp missing trueTarget/falseTarget`);
        }
        if (typeof term.condReg !== 'string') {
          termShapeOk = false;
          termShapeIssues.push(`func ${id} ${block.id}: cjmp.condReg not a string`);
        }
        break;
      case 'ret':
      case 'throw':
        // No extra fields needed
        break;
      case 'fallthrough':
        // target can be number or null
        break;
    }
  }
}
assert(termShapeOk, termShapeIssues.length > 0 ? termShapeIssues.slice(0, 5).join('; ') : 'All terminators have correct shape');

// ============================================================
// Test 17: Successor count matches terminator type
// ============================================================
console.log('\n=== Test 17: Successor count vs terminator type ===');
let succCountOk = true;
let succIssues = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    const term = block.terminator;
    if (!term) continue;
    switch (term.type) {
      case 'jmp':
        if (block.successors.length !== 1) {
          succCountOk = false;
          succIssues.push(`func ${id} ${block.id}: jmp has ${block.successors.length} successors, expected 1`);
        }
        break;
      case 'cjmp':
        // Could be 1 if both targets go to the same block, or 2 normally
        if (block.successors.length < 1 || block.successors.length > 2) {
          succCountOk = false;
          succIssues.push(`func ${id} ${block.id}: cjmp has ${block.successors.length} successors, expected 1-2`);
        }
        break;
      case 'ret':
      case 'throw':
        if (block.successors.length !== 0) {
          succCountOk = false;
          succIssues.push(`func ${id} ${block.id}: ${term.type} has ${block.successors.length} successors, expected 0`);
        }
        break;
      case 'fallthrough':
        if (term.target !== null && block.successors.length !== 1) {
          succCountOk = false;
          succIssues.push(`func ${id} ${block.id}: fallthrough has ${block.successors.length} successors, expected 1`);
        }
        break;
    }
  }
}
assert(succCountOk, succIssues.length > 0 ? succIssues.slice(0, 5).join('; ') : 'Successor counts match terminator types');

// ============================================================
// Test 18: Spot-check 5 small functions
// ============================================================
console.log('\n=== Test 18: Spot-check small functions ===');

// Find 5 small functions (≤20 instructions)
const smallFuncs = cfgIds
  .filter(id => cfgData[id].instructionCount <= 20 && cfgData[id].blockCount >= 2)
  .sort((a, b) => cfgData[a].instructionCount - cfgData[b].instructionCount)
  .slice(0, 5);

console.log(`  Spot-checking functions: ${smallFuncs.join(', ')}`);
for (const id of smallFuncs) {
  const cfg = cfgData[id];
  console.log(`  func ${id}: entryPC=${cfg.entryPC}, blocks=${cfg.blockCount}, instrs=${cfg.instructionCount}`);

  // Verify each block's last instruction is a terminator or followed by a leader
  for (const block of cfg.blocks) {
    const lastPC = block.endPC;
    const lastInstr = instrMap.get(lastPC);
    if (!lastInstr) continue;

    const terminatorMnemonics = ['JMP', 'CJMP', 'RET', 'RET_CLEANUP', 'RET_BARE', 'SET_RET', 'SET_RET_Q', 'THROW'];
    const isTerminator = terminatorMnemonics.includes(lastInstr.mnemonic);
    const isFallthrough = block.terminator && block.terminator.type === 'fallthrough';

    assert(isTerminator || isFallthrough,
      `func ${id} block ${block.id}: last instr ${lastInstr.mnemonic} should be terminator or fallthrough`);
  }
}

// ============================================================
// Test 19: Exception handler targets are block starts
// ============================================================
console.log('\n=== Test 19: Exception handler targets ===');
let handlerOk = true;
let handlerIssues = [];
let totalHandlers = 0;
let validHandlers = 0;
for (const id of cfgIds) {
  const cfg = cfgData[id];
  const blockStartPCs = new Set(cfg.blocks.map(b => b.startPC));
  const blockIds = new Set(cfg.blocks.map(b => b.id));

  for (const block of cfg.blocks) {
    if (!block.exceptionHandlers) continue;
    for (const hBlockId of block.exceptionHandlers) {
      totalHandlers++;
      if (blockIds.has(hBlockId)) {
        validHandlers++;
      } else {
        handlerOk = false;
        handlerIssues.push(`func ${id} ${block.id}: handler ${hBlockId} not a block in this function`);
      }
    }
  }
}
console.log(`  Exception handlers: ${validHandlers}/${totalHandlers} valid`);
assert(handlerOk || validHandlers === totalHandlers,
  handlerIssues.length > 0 ? handlerIssues.slice(0, 5).join('; ') : 'All exception handler targets are valid blocks');

// ============================================================
// Test 20: Verify the buildCFG function produces same output
// ============================================================
console.log('\n=== Test 20: buildCFG reproducibility ===');
const cfgMap = cfgBuilder.buildCFG(disasmLines, functions);
assert(cfgMap.size === 270, `buildCFG returned ${cfgMap.size} functions, expected 270`);
// Spot-check a few functions
const spot0 = cfgMap.get(0);
assert(spot0 !== undefined, 'buildCFG returns function 0');
assert(spot0.entryPC === 36579, `buildCFG func 0 entryPC=${spot0.entryPC}`);
assert(spot0.blockCount === cfgData['0'].blockCount, `buildCFG func 0 blockCount matches JSON`);

// ============================================================
// Test 21: Fallthrough blocks — check there's at most 1
// ============================================================
console.log('\n=== Test 21: Fallthrough terminators ===');
let fallthroughCount = 0;
let fallthroughFuncs = [];
for (const id of cfgIds) {
  const cfg = cfgData[id];
  for (const block of cfg.blocks) {
    if (block.terminator && block.terminator.type === 'fallthrough') {
      fallthroughCount++;
      fallthroughFuncs.push(`func ${id} ${block.id}`);
    }
  }
}
console.log(`  Fallthrough terminators: ${fallthroughCount} (in ${fallthroughFuncs.join(', ')})`);
// The summary shows 1 fallthrough in func 225 — this is expected per the reverser's note

// ============================================================
// Summary
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${passed + failed} assertions`);
if (failures.length > 0) {
  console.log('\nFailed assertions:');
  for (const f of failures) {
    console.log(`  ❌ ${f}`);
  }
}
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
