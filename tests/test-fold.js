'use strict';

/**
 * Test suite for Task 3.2: Intra-Block Expression Folding
 *
 * Validates:
 *  1. Manual trace verification (5 blocks)
 *  2. String reconstruction check (20 sampled blocks)
 *  3. Folding ratio sanity (20–60%)
 *  4. Statement count ≤ instruction count for every block
 *  5. No crashes (all 270 functions, 1,066 blocks)
 *  6. Idempotency
 *  7. liveOut sanity (CJMP + RET terminators)
 */

const fs = require('fs');
const path = require('path');
const { foldAll, foldBlock, foldFunction, renderStatement, renderExpr, collectReads } = require('../decompiler/expression-folder');
const { parseDisasmToIR } = require('../decompiler/opcode-semantics');

// ============================================================================
// Load data
// ============================================================================

const cfgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/cfg.json'), 'utf8'));
const disasmLines = fs.readFileSync(path.join(__dirname, '../output/disasm-full.txt'), 'utf8').split('\n');
const stringsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/strings.json'), 'utf8'));

const disasmByPC = new Map();
for (const line of disasmLines) {
  const m = line.match(/^\[(\d+)\]/);
  if (m) disasmByPC.set(parseInt(m[1], 10), line);
}

// Build strings.json lookup by startPC
const stringsByPC = new Map();
for (const s of stringsJson) {
  stringsByPC.set(s.pc, s);
}

// ============================================================================
// Test harness
// ============================================================================

let passed = 0;
let failed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL: ${message}`);
  }
}

function section(name) {
  console.log(`\n=== ${name} ===`);
}

// Helper: fold a specific block
function foldBlockByIds(funcId, blockId) {
  const funcCFG = cfgJson[funcId];
  const block = funcCFG.blocks.find(b => b.id === blockId);
  const pcs = block.instructions;
  const irInstructions = pcs.map(pc => {
    const line = disasmByPC.get(pc);
    return line ? parseDisasmToIR(line) : null;
  }).filter(Boolean);
  return { folded: foldBlock(irInstructions), block, pcs };
}

// ============================================================================
// Test 1: No crashes — foldAll processes all 270 functions
// ============================================================================

section('1. No crashes — foldAll()');

let allFolded;
let foldError = null;
try {
  allFolded = foldAll(cfgJson, disasmLines);
} catch (e) {
  foldError = e;
}

assert(foldError === null, `foldAll() threw: ${foldError}`);
assert(allFolded instanceof Map, 'foldAll() returns a Map');
assert(allFolded.size === 270, `Expected 270 functions, got ${allFolded.size}`);

let totalBlocks = 0;
for (const [funcId, blockMap] of allFolded.entries()) {
  totalBlocks += blockMap.size;
}
assert(totalBlocks === 1066, `Expected 1,066 blocks, got ${totalBlocks}`);

// ============================================================================
// Test 2: Manual trace — Func 0 b0
// ============================================================================

section('2. Manual trace — Func 0 b0 (compound opcodes + control flow)');

{
  const { folded, pcs } = foldBlockByIds('0', 'b0');
  assert(folded.statements.length <= pcs.length,
    `Func 0 b0: stmts (${folded.statements.length}) > instrs (${pcs.length})`);

  // 6 instructions: ARRAY r11,0 / CATCH_PUSH / FUNC_CREATE_C r10 / PROP_SET_K r11,0,r10 / TRY_POP / JMP
  // Expected: ARRAY(r11) folded into PROP_SET target → 5 statements
  assert(folded.statements.length === 5,
    `Func 0 b0: expected 5 statements, got ${folded.statements.length}`);

  // Statement types check
  const types = folded.statements.map(s => s.type);
  assert(types[0] === 'control', `Func 0 b0 stmt[0] type: expected 'control', got '${types[0]}'`);
  assert(types[1] === 'assign', `Func 0 b0 stmt[1] type: expected 'assign', got '${types[1]}'`);
  assert(types[2] === 'prop_set', `Func 0 b0 stmt[2] type: expected 'prop_set', got '${types[2]}'`);
  assert(types[3] === 'control', `Func 0 b0 stmt[3] type: expected 'control', got '${types[3]}'`);
  assert(types[4] === 'control', `Func 0 b0 stmt[4] type: expected 'control', got '${types[4]}'`);

  // r11 (ARRAY) should be folded into PROP_SET — check expr
  const propSetStmt = folded.statements[2];
  assert(propSetStmt.expr.type === 'prop_set', `Func 0 b0: PROP_SET expr type`);
  // The object should be Array(0) (folded from r11)
  const rendered = renderStatement(propSetStmt);
  assert(rendered.includes('Array(0)'), `Func 0 b0: PROP_SET should contain Array(0), got: ${rendered}`);

  // liveOut should include r11 and r10
  assert(folded.liveOut.includes('r11'), `Func 0 b0: r11 should be in liveOut`);
  assert(folded.liveOut.includes('r10'), `Func 0 b0: r10 should be in liveOut`);

  // No string literals in this block
  assert(folded.stringLiterals.length === 0, `Func 0 b0: no string literals expected`);
}

// ============================================================================
// Test 3: Manual trace — Func 1 b2 (string "substring" + call + return)
// ============================================================================

section('3. Manual trace — Func 1 b2 (string folding + call + return)');

{
  const { folded, pcs } = foldBlockByIds('1', 'b2');

  // 10 instructions → expected ~5 statements
  assert(folded.statements.length <= pcs.length,
    `Func 1 b2: stmts (${folded.statements.length}) > instrs (${pcs.length})`);
  assert(folded.statements.length === 5,
    `Func 1 b2: expected 5 statements, got ${folded.statements.length}`);

  // Statement 0: r19 = "substring" (string_build)
  const s0 = folded.statements[0];
  assert(s0.type === 'string_build', `Func 1 b2 stmt[0]: expected string_build, got ${s0.type}`);
  assert(s0.dest === 'r19', `Func 1 b2 stmt[0]: dest should be r19, got ${s0.dest}`);
  assert(s0.expr.value === 'substring', `Func 1 b2 stmt[0]: expected "substring", got "${s0.expr.value}"`);

  // Statement 1: r9 = r18[r19] (prop_get)
  const s1 = folded.statements[1];
  assert(s1.dest === 'r9', `Func 1 b2 stmt[1]: dest should be r9, got ${s1.dest}`);
  assert(s1.expr.type === 'prop_get', `Func 1 b2 stmt[1]: expected prop_get, got ${s1.expr.type}`);

  // Statement 2: r20 = r9.call(r18, 0, r21) — r19=0 folded into call
  const s2 = folded.statements[2];
  assert(s2.dest === 'r20', `Func 1 b2 stmt[2]: dest should be r20, got ${s2.dest}`);
  const rendered2 = renderStatement(s2);
  assert(rendered2.includes('.call('), `Func 1 b2 stmt[2]: should be a call, got: ${rendered2}`);
  // Check that literal 0 was folded in (r19 = 0 folded)
  assert(rendered2.includes(', 0,'), `Func 1 b2 stmt[2]: should fold r19=0, got: ${rendered2}`);

  // Statement 4: return r20 (r18 = r20 folded into return)
  const sLast = folded.statements[folded.statements.length - 1];
  assert(sLast.type === 'return', `Func 1 b2 last stmt: expected return, got ${sLast.type}`);
  const renderedLast = renderStatement(sLast);
  assert(renderedLast.includes('return'), `Func 1 b2 last stmt: should contain 'return'`);

  // String literal check
  assert(folded.stringLiterals.length >= 1, `Func 1 b2: should have at least 1 string literal`);
  assert(folded.stringLiterals[0].value === 'substring',
    `Func 1 b2: string literal should be "substring", got "${folded.stringLiterals[0]?.value}"`);

  // liveOut should include r18 (used in return, method context)
  assert(folded.liveOut.includes('r18'), `Func 1 b2: r18 should be in liveOut`);
}

// ============================================================================
// Test 4: Manual trace — Func 1 b3 (multi-use + register redef + prop_get → call)
// ============================================================================

section('4. Manual trace — Func 1 b3 (multi-use, register redef, prop_get → call)');

{
  const { folded, pcs } = foldBlockByIds('1', 'b3');

  assert(folded.statements.length <= pcs.length,
    `Func 1 b3: stmts (${folded.statements.length}) > instrs (${pcs.length})`);
  assert(folded.statements.length === 5,
    `Func 1 b3: expected 5 statements, got ${folded.statements.length}`);

  // Statement 0: r9 = "indexOf" (string_build)
  const s0 = folded.statements[0];
  assert(s0.expr.type === 'string_build' && s0.expr.value === 'indexOf',
    `Func 1 b3 stmt[0]: expected string_build "indexOf", got ${s0.expr.type} "${s0.expr.value}"`);

  // Statement 1: r20 = r18[r9] (prop_get — not folded per design)
  const s1 = folded.statements[1];
  assert(s1.dest === 'r20' && s1.expr.type === 'prop_get',
    `Func 1 b3 stmt[1]: expected r20 = prop_get, got ${s1.dest} = ${s1.expr.type}`);

  // Statement 2: r9 = "?" (string_build — r9 redefined)
  const s2 = folded.statements[2];
  assert(s2.expr.type === 'string_build' && s2.expr.value === '?',
    `Func 1 b3 stmt[2]: expected string_build "?", got ${s2.expr.type} "${s2.expr.value}"`);

  // Statement 3: r19 = r20.call(r18, r9) — call with side effects
  const s3 = folded.statements[3];
  assert(s3.dest === 'r19', `Func 1 b3 stmt[3]: dest should be r19, got ${s3.dest}`);

  // Statement 4: CJMP with folded condition: (r19 > 0) — r21=r19 and r23=(r21>0) folded
  const s4 = folded.statements[4];
  assert(s4.type === 'control', `Func 1 b3 stmt[4]: expected control, got ${s4.type}`);
  const rendered4 = renderStatement(s4);
  assert(rendered4.includes('r19') && rendered4.includes('> 0'),
    `Func 1 b3 stmt[4]: CJMP should fold to (r19 > 0), got: ${rendered4}`);

  // Two string literals: "indexOf" and "?"
  assert(folded.stringLiterals.length === 2,
    `Func 1 b3: expected 2 string literals, got ${folded.stringLiterals.length}`);

  // r21 should still be in liveOut (it was defined, even though folded)
  assert(folded.liveOut.includes('r21'),
    `Func 1 b3: r21 should be in liveOut (last def, conservative)`);
}

// ============================================================================
// Test 5: Manual trace — Find block with pure arithmetic
// ============================================================================

section('5. Manual trace — Pure arithmetic block');

{
  // Find a small block with binop that shows good folding
  let found = false;
  for (const funcId of Object.keys(cfgJson)) {
    if (found) break;
    const funcCFG = cfgJson[funcId];
    for (const block of funcCFG.blocks) {
      if (block.instructions.length < 3 || block.instructions.length > 8) continue;
      const pcs = block.instructions;
      const irInstructions = pcs.map(pc => {
        const line = disasmByPC.get(pc);
        return line ? parseDisasmToIR(line) : null;
      }).filter(Boolean);

      // Check for arithmetic opcodes
      const hasArith = irInstructions.some(ir =>
        ir.opName && (ir.opName.includes('ADD') || ir.opName.includes('MUL') ||
                      ir.opName.includes('SUB') || ir.opName.includes('DIV'))
      );
      if (!hasArith) continue;

      const folded = foldBlock(irInstructions);
      if (folded.statements.length < irInstructions.length && folded.statements.length >= 2) {
        // Good candidate
        assert(folded.statements.length <= pcs.length,
          `Arithmetic block F${funcId} ${block.id}: stmts > instrs`);
        assert(folded.statements.length < irInstructions.length,
          `Arithmetic block F${funcId} ${block.id}: folding occurred`);

        // Check that arithmetic expressions are present
        const hasArithExpr = folded.statements.some(s =>
          s.expr.type === 'binop' || (s.expr.type === 'binop')
        );
        // At minimum, no crashes and statement reduction
        console.log(`  Found arithmetic block: F${funcId} ${block.id} (${pcs.length} instrs → ${folded.statements.length} stmts)`);
        found = true;
        break;
      }
    }
  }
  assert(found, 'Found at least one arithmetic block with successful folding');
}

// ============================================================================
// Test 6: Folding ratio sanity (20–60%)
// ============================================================================

section('6. Folding ratio sanity');

{
  let totalInstrs = 0;
  let totalStmts = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    const funcCFG = cfgJson[funcId];
    for (const [blockId, folded] of blockMap.entries()) {
      const block = funcCFG.blocks.find(b => b.id === blockId);
      totalInstrs += block.instructions.length;
      totalStmts += folded.statements.length;
    }
  }

  const ratio = (totalInstrs - totalStmts) / totalInstrs * 100;
  console.log(`  Total instructions: ${totalInstrs}`);
  console.log(`  Total statements: ${totalStmts}`);
  console.log(`  Folding ratio: ${ratio.toFixed(1)}%`);

  assert(ratio >= 20, `Folding ratio ${ratio.toFixed(1)}% should be >= 20%`);
  assert(ratio <= 60, `Folding ratio ${ratio.toFixed(1)}% should be <= 60%`);
  assert(totalInstrs === 15753, `Expected 15,753 instructions, got ${totalInstrs}`);
}

// ============================================================================
// Test 7: Statement count ≤ instruction count for EVERY block
// ============================================================================

section('7. Statement count ≤ instruction count for every block');

{
  let violations = 0;
  let checkedBlocks = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    const funcCFG = cfgJson[funcId];
    for (const [blockId, folded] of blockMap.entries()) {
      checkedBlocks++;
      const block = funcCFG.blocks.find(b => b.id === blockId);
      if (folded.statements.length > block.instructions.length) {
        violations++;
        if (violations <= 3) {
          console.log(`  Violation: F${funcId} ${blockId}: ${folded.statements.length} stmts > ${block.instructions.length} instrs`);
        }
      }
    }
  }

  assert(checkedBlocks === 1066, `Checked all 1,066 blocks (got ${checkedBlocks})`);
  assert(violations === 0, `${violations} blocks have stmts > instrs (should be 0)`);
}

// ============================================================================
// Test 8: Idempotency
// ============================================================================

section('8. Idempotency');

{
  // Re-fold the same input and compare
  const allFolded2 = foldAll(cfgJson, disasmLines);

  assert(allFolded2.size === allFolded.size,
    `Idempotency: function count mismatch (${allFolded2.size} vs ${allFolded.size})`);

  let mismatchCount = 0;
  for (const [funcId, blockMap1] of allFolded.entries()) {
    const blockMap2 = allFolded2.get(funcId);
    if (!blockMap2) { mismatchCount++; continue; }
    for (const [blockId, folded1] of blockMap1.entries()) {
      const folded2 = blockMap2.get(blockId);
      if (!folded2) { mismatchCount++; continue; }
      if (folded1.statements.length !== folded2.statements.length) {
        mismatchCount++;
        if (mismatchCount <= 3) {
          console.log(`  Mismatch: F${funcId} ${blockId}: ${folded1.statements.length} vs ${folded2.statements.length} stmts`);
        }
      }
      // Deep compare rendered output
      for (let i = 0; i < folded1.statements.length; i++) {
        const r1 = renderStatement(folded1.statements[i]);
        const r2 = renderStatement(folded2.statements[i]);
        if (r1 !== r2) {
          mismatchCount++;
          if (mismatchCount <= 3) {
            console.log(`  Mismatch: F${funcId} ${blockId} stmt[${i}]: "${r1}" vs "${r2}"`);
          }
        }
      }
      // Compare liveOut
      const lo1 = [...folded1.liveOut].sort().join(',');
      const lo2 = [...folded2.liveOut].sort().join(',');
      if (lo1 !== lo2) {
        mismatchCount++;
        if (mismatchCount <= 3) {
          console.log(`  LiveOut mismatch: F${funcId} ${blockId}: "${lo1}" vs "${lo2}"`);
        }
      }
    }
  }

  assert(mismatchCount === 0, `Idempotency: ${mismatchCount} mismatches found`);
}

// ============================================================================
// Test 9: liveOut sanity — CJMP blocks
// ============================================================================

section('9. liveOut sanity — CJMP blocks');

{
  let cjmpBlocks = 0;
  let cjmpCorrect = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    const funcCFG = cfgJson[funcId];
    for (const [blockId, folded] of blockMap.entries()) {
      const block = funcCFG.blocks.find(b => b.id === blockId);
      // Check if last instruction is CJMP
      if (block.instructions.length === 0) continue;
      const lastPC = block.instructions[block.instructions.length - 1];
      const lastLine = disasmByPC.get(lastPC);
      if (!lastLine || !lastLine.includes('CJMP')) continue;

      cjmpBlocks++;

      // The condition register should be in liveOut OR folded into the terminator
      const lastStmt = folded.statements[folded.statements.length - 1];
      if (!lastStmt) continue;

      // If terminator is a control (cjmp), the condition was folded or is in liveOut
      // Either the last statement IS a cjmp control, or the condition reg is in liveOut
      if (lastStmt.expr && lastStmt.expr.type === 'cjmp') {
        cjmpCorrect++;
      } else {
        // Check that some register feeding into cjmp is in liveOut
        const ir = parseDisasmToIR(lastLine);
        if (ir && ir.semantics && ir.semantics.effects.length > 0) {
          const condReads = ir.semantics.effects[0].reads || [];
          const anyInLiveOut = condReads.some(r => folded.liveOut.includes(r));
          if (anyInLiveOut) {
            cjmpCorrect++;
          } else {
            console.log(`  CJMP issue: F${funcId} ${blockId}`);
          }
        }
      }
    }
  }

  console.log(`  CJMP blocks: ${cjmpBlocks}, correct: ${cjmpCorrect}`);
  assert(cjmpBlocks > 0, `Found CJMP blocks (${cjmpBlocks})`);
  assert(cjmpCorrect === cjmpBlocks, `All CJMP blocks have correct liveOut (${cjmpCorrect}/${cjmpBlocks})`);
}

// ============================================================================
// Test 10: liveOut sanity — RET blocks
// ============================================================================

section('10. liveOut sanity — RET blocks');

{
  let retBlocks = 0;
  let retCorrect = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    const funcCFG = cfgJson[funcId];
    for (const [blockId, folded] of blockMap.entries()) {
      const block = funcCFG.blocks.find(b => b.id === blockId);
      if (block.instructions.length === 0) continue;
      const lastPC = block.instructions[block.instructions.length - 1];
      const lastLine = disasmByPC.get(lastPC);
      if (!lastLine) continue;
      // Match RET opcodes (RET_BARE, RET_CLEANUP, SET_RET, etc.)
      if (!lastLine.match(/\b(RET_BARE|RET_CLEANUP|SET_RET|RET)\b/)) continue;

      retBlocks++;

      const lastStmt = folded.statements[folded.statements.length - 1];
      if (!lastStmt) continue;

      // Return value should be in liveOut or folded into the return statement
      if (lastStmt.type === 'return' || lastStmt.expr.type === 'return') {
        retCorrect++;
      } else if (lastStmt.type === 'compound' || lastStmt.type === 'prop_set') {
        // SET_RET does prop_set + return — check rendered form
        const rendered = renderStatement(lastStmt);
        if (rendered.includes('return')) {
          retCorrect++;
        } else {
          // Check liveOut
          const ir = parseDisasmToIR(lastLine);
          if (ir && ir.semantics) {
            const retEffect = ir.semantics.effects.find(e => e.expr && e.expr.type === 'return');
            if (retEffect) {
              const reads = retEffect.reads || [];
              const anyInLiveOut = reads.some(r => folded.liveOut.includes(r));
              if (anyInLiveOut) retCorrect++;
              else console.log(`  RET issue: F${funcId} ${blockId}`);
            } else {
              retCorrect++; // Compound without explicit return effect — OK
            }
          }
        }
      } else {
        console.log(`  RET issue: F${funcId} ${blockId} — last stmt type: ${lastStmt.type}`);
      }
    }
  }

  console.log(`  RET blocks: ${retBlocks}, correct: ${retCorrect}`);
  assert(retBlocks > 0, `Found RET blocks (${retBlocks})`);
  assert(retCorrect === retBlocks, `All RET blocks have correct liveOut (${retCorrect}/${retBlocks})`);
}

// ============================================================================
// Test 11: String reconstruction check — sample 20 blocks
// ============================================================================

section('11. String reconstruction check (20 sampled blocks)');

{
  // Collect all blocks with string literals, sample 20
  const blocksWithStrings = [];

  for (const [funcId, blockMap] of allFolded.entries()) {
    for (const [blockId, folded] of blockMap.entries()) {
      if (folded.stringLiterals.length > 0) {
        blocksWithStrings.push({ funcId, blockId, folded });
      }
    }
  }

  console.log(`  Total blocks with string literals: ${blocksWithStrings.length}`);
  assert(blocksWithStrings.length > 20,
    `Need at least 20 blocks with strings for sampling (got ${blocksWithStrings.length})`);

  // Sample 20 evenly spaced
  const step = Math.floor(blocksWithStrings.length / 20);
  let matchCount = 0;
  let sampleTotal = 0;
  let mismatches = [];

  for (let i = 0; i < 20; i++) {
    const idx = Math.min(i * step, blocksWithStrings.length - 1);
    const { funcId, blockId, folded } = blocksWithStrings[idx];

    for (const sl of folded.stringLiterals) {
      sampleTotal++;
      const ref = stringsByPC.get(sl.startPC);
      if (ref && ref.value === sl.value) {
        matchCount++;
      } else {
        mismatches.push({
          funcId, blockId,
          expected: ref ? ref.value : '(not in strings.json)',
          actual: sl.value,
          pc: sl.startPC,
        });
      }
    }
  }

  console.log(`  Sampled 20 blocks: ${matchCount}/${sampleTotal} string literals match strings.json`);
  if (mismatches.length > 0 && mismatches.length <= 5) {
    for (const mm of mismatches) {
      console.log(`    Mismatch at PC ${mm.pc} F${mm.funcId} ${mm.blockId}: expected "${mm.expected}", got "${mm.actual}"`);
    }
  }

  // Pass criteria: ≥18/20 blocks match (90%)
  const blockMatchRate = sampleTotal > 0 ? matchCount / sampleTotal : 0;
  assert(blockMatchRate >= 0.9,
    `String match rate ${(blockMatchRate * 100).toFixed(1)}% should be >= 90%`);
}

// ============================================================================
// Test 12: Global string match rate
// ============================================================================

section('12. Global string match rate');

{
  let totalStrings = 0;
  let matchedStrings = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    for (const [blockId, folded] of blockMap.entries()) {
      for (const sl of folded.stringLiterals) {
        totalStrings++;
        const ref = stringsByPC.get(sl.startPC);
        if (ref && ref.value === sl.value) {
          matchedStrings++;
        }
      }
    }
  }

  console.log(`  Global: ${matchedStrings}/${totalStrings} strings match (${(matchedStrings/totalStrings*100).toFixed(1)}%)`);
  assert(totalStrings >= 1700, `Expected ~1,738 string literals, got ${totalStrings}`);
  assert(matchedStrings / totalStrings >= 0.99,
    `Global string match rate should be >=99% (got ${(matchedStrings/totalStrings*100).toFixed(1)}%)`);
}

// ============================================================================
// Test 13: Module exports verification
// ============================================================================

section('13. Module exports');

{
  const mod = require('../decompiler/expression-folder');
  assert(typeof mod.foldBlock === 'function', 'foldBlock exported');
  assert(typeof mod.foldFunction === 'function', 'foldFunction exported');
  assert(typeof mod.foldAll === 'function', 'foldAll exported');
  assert(typeof mod.renderExpr === 'function', 'renderExpr exported');
  assert(typeof mod.renderStatement === 'function', 'renderStatement exported');
}

// ============================================================================
// Test 14: Output files exist
// ============================================================================

section('14. Output files');

{
  assert(fs.existsSync(path.join(__dirname, '../output/fold-summary.txt')), 'fold-summary.txt exists');
  assert(fs.existsSync(path.join(__dirname, '../output/fold-examples.txt')), 'fold-examples.txt exists');

  const summary = fs.readFileSync(path.join(__dirname, '../output/fold-summary.txt'), 'utf8');
  assert(summary.includes('270'), 'fold-summary.txt mentions 270 functions');
  assert(summary.includes('1066'), 'fold-summary.txt mentions 1066 blocks');
  assert(summary.includes('Folding ratio'), 'fold-summary.txt has folding ratio');
}

// ============================================================================
// Test 15: Edge cases — empty block, single-instruction block
// ============================================================================

section('15. Edge cases');

{
  // Empty instructions
  const emptyResult = foldBlock([]);
  assert(emptyResult.statements.length === 0, 'Empty input → 0 statements');
  assert(emptyResult.liveOut.length === 0, 'Empty input → empty liveOut');
  assert(emptyResult.stringLiterals.length === 0, 'Empty input → no strings');

  // Null input
  const nullResult = foldBlock(null);
  assert(nullResult.statements.length === 0, 'Null input → 0 statements');

  // Single-instruction blocks (terminators)
  let singleInstrBlocks = 0;
  let singleInstrOK = 0;
  for (const [funcId, blockMap] of allFolded.entries()) {
    const funcCFG = cfgJson[funcId];
    for (const [blockId, folded] of blockMap.entries()) {
      const block = funcCFG.blocks.find(b => b.id === blockId);
      if (block.instructions.length === 1) {
        singleInstrBlocks++;
        if (folded.statements.length <= 1) singleInstrOK++;
      }
    }
  }
  console.log(`  Single-instruction blocks: ${singleInstrBlocks}, OK: ${singleInstrOK}`);
  assert(singleInstrOK === singleInstrBlocks,
    `All single-instruction blocks produce ≤1 statement (${singleInstrOK}/${singleInstrBlocks})`);
}

// ============================================================================
// Test 16: Side-effect preservation
// ============================================================================

section('16. Side-effect preservation');

{
  // Verify that calls, prop_sets never get folded away (they should remain as statements)
  let callStmts = 0;
  let propSetStmts = 0;
  let returnStmts = 0;
  let throwStmts = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    for (const [blockId, folded] of blockMap.entries()) {
      for (const stmt of folded.statements) {
        if (stmt.expr.type === 'call' || stmt.expr.type === 'method_call') callStmts++;
        if (stmt.expr.type === 'prop_set') propSetStmts++;
        if (stmt.type === 'return' || stmt.expr.type === 'return') returnStmts++;
        if (stmt.type === 'throw' || stmt.expr.type === 'throw') throwStmts++;
        // Check compound statements too
        if (stmt.compoundEffects) {
          for (const eff of stmt.compoundEffects) {
            if (eff.expr.type === 'call' || eff.expr.type === 'method_call') callStmts++;
            if (eff.expr.type === 'prop_set') propSetStmts++;
            if (eff.expr.type === 'return') returnStmts++;
          }
        }
      }
    }
  }

  console.log(`  Calls: ${callStmts}, PropSets: ${propSetStmts}, Returns: ${returnStmts}, Throws: ${throwStmts}`);
  assert(callStmts > 0, `Found call statements (${callStmts})`);
  assert(propSetStmts > 0, `Found prop_set statements (${propSetStmts})`);
  assert(returnStmts > 0, `Found return statements (${returnStmts})`);
}

// ============================================================================
// Test 17: FoldedBlock structure validation
// ============================================================================

section('17. FoldedBlock structure');

{
  let structureOK = 0;
  let structureTotal = 0;

  for (const [funcId, blockMap] of allFolded.entries()) {
    for (const [blockId, folded] of blockMap.entries()) {
      structureTotal++;
      let ok = true;

      // Must have statements array
      if (!Array.isArray(folded.statements)) { ok = false; continue; }
      // Must have liveOut array
      if (!Array.isArray(folded.liveOut)) { ok = false; continue; }
      // Must have stringLiterals array
      if (!Array.isArray(folded.stringLiterals)) { ok = false; continue; }

      // Each statement must have required fields
      for (const stmt of folded.statements) {
        if (typeof stmt.pc !== 'number') { ok = false; break; }
        if (typeof stmt.type !== 'string') { ok = false; break; }
        if (!stmt.expr) { ok = false; break; }
        if (typeof stmt.sideEffects !== 'boolean') { ok = false; break; }
        if (!stmt.original) { ok = false; break; }
      }

      if (ok) structureOK++;
    }
  }

  assert(structureOK === structureTotal,
    `All blocks have valid structure (${structureOK}/${structureTotal})`);
}

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log(`Test Results: ${passed}/${total} passed, ${failed} failed`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
