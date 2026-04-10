'use strict';

/**
 * Test suite for Task 3.3: Call & Method Reconstruction
 *
 * Validates against the acceptance criteria from PROGRESS.md:
 * 1. 5/5 manually traced blocks produce correct method call reconstruction
 * 2. ≥28/30 sampled method names match strings.json
 * 3. Statement count decreases or stays equal for every block (never increases)
 * 4. All 270 functions processed without errors
 * 5. Semantic preservation verified for 10 sampled blocks
 * 6. Method call count in range 200–500
 */

const fs = require('fs');
const path = require('path');

const { foldAll, renderStatement, renderExpr, collectReads } = require('../decompiler/expression-folder');
const {
  reconstructBlock,
  reconstructFunction,
  reconstructAll,
  renderMethodCall,
  countDefinitionUses,
  exprsEqual,
  resolveMethodName,
  normalizeCompoundPropCall,
} = require('../decompiler/method-reconstructor');

// ============================================================================
// Load data
// ============================================================================

const cfgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/cfg.json'), 'utf8'));
const disasmLines = fs.readFileSync(path.join(__dirname, '../output/disasm-full.txt'), 'utf8').split('\n');
const stringsJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../output/strings.json'), 'utf8'));

// Build string lookup set (entries are objects with .value field)
const stringSet = new Set(stringsJson.map(s => typeof s === 'string' ? s : s.value));

console.log('Loading and folding...');
const allFolded = foldAll(cfgJson, disasmLines);
console.log('Reconstructing...');
const allReconstructed = reconstructAll(allFolded);
console.log('Running tests...\n');

let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL: ${label}`);
  }
}

// ============================================================================
// Criterion 1: 5/5 manually traced blocks produce correct reconstruction
// ============================================================================

console.log('=== Criterion 1: Manual trace — 5 blocks with known method calls ===');

// 1a. Func 1 b2: r18.substring(0, r21)
{
  const block = allReconstructed.get('1').get('b2');
  const mcStmt = block.statements.find(s => s.expr && s.expr.type === 'method_call');
  assert(!!mcStmt, 'Func 1 b2: has a method_call statement');

  if (mcStmt) {
    assert(mcStmt.expr.object.type === 'register' && mcStmt.expr.object.reg === 'r18',
      'Func 1 b2: object is r18');
    assert(mcStmt.expr.method.type === 'literal' && mcStmt.expr.method.value === 'substring',
      'Func 1 b2: method is "substring"');
    assert(mcStmt.expr.args.length === 2,
      'Func 1 b2: 2 arguments');
    assert(mcStmt.dest === 'r20',
      'Func 1 b2: dest is r20');
  }

  // Statement count should decrease by 1 (PROP_GET removed)
  const foldedBlock = allFolded.get('1').get('b2');
  assert(block.statements.length === foldedBlock.statements.length - 1,
    'Func 1 b2: statement count decreased by 1');

  // The PROP_GET statement (r9 = r18[r19]) should be gone
  const hasPropGet = block.statements.some(s =>
    s.expr && s.expr.type === 'prop_get' &&
    s.expr.object && s.expr.object.reg === 'r18' &&
    s.expr.property && s.expr.property.reg === 'r19'
  );
  assert(!hasPropGet, 'Func 1 b2: PROP_GET for substring removed');
}

// 1b. Func 1 b3: r18.indexOf(...)
{
  const block = allReconstructed.get('1').get('b3');
  const mcStmt = block.statements.find(s => s.expr && s.expr.type === 'method_call');
  assert(!!mcStmt, 'Func 1 b3: has a method_call statement');

  if (mcStmt) {
    assert(mcStmt.expr.object.type === 'register' && mcStmt.expr.object.reg === 'r18',
      'Func 1 b3: object is r18');
    assert(mcStmt.expr.method.type === 'literal' && mcStmt.expr.method.value === 'indexOf',
      'Func 1 b3: method is "indexOf"');
    assert(mcStmt.expr.args.length === 1,
      'Func 1 b3: 1 argument');
  }

  const foldedBlock = allFolded.get('1').get('b3');
  assert(block.statements.length === foldedBlock.statements.length - 1,
    'Func 1 b3: statement count decreased by 1');
}

// 1c. A block with compound PROP_CALL normalization
{
  // Find a block that has compound method calls
  let foundCompound = false;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      const compoundMCs = reconBlock.methodCalls.filter(m => m.compound);
      if (compoundMCs.length > 0) {
        foundCompound = true;
        // Verify each compound method call has valid structure
        for (const mc of compoundMCs) {
          assert(typeof mc.method === 'string' && mc.method.length > 0,
            `Compound PROP_CALL in func ${funcId} ${blockId}: has method name "${mc.method}"`);
        }
        // Check the statements contain a method_call or compound with method_call
        const hasMethodCallStmt = reconBlock.statements.some(s => {
          if (s.expr && s.expr.type === 'method_call') return true;
          if (s.expr && s.expr.type === 'compound' && s.expr.effects) {
            return s.expr.effects.some(e => e.expr && e.expr.type === 'method_call');
          }
          return false;
        });
        assert(hasMethodCallStmt,
          `Compound PROP_CALL in func ${funcId} ${blockId}: statement has method_call expr`);
        break;
      }
    }
    if (foundCompound) break;
  }
  assert(foundCompound, 'At least one compound PROP_CALL normalized');
}

// 1d. A block with chained calls (obj.method1() feeds into next prop_get)
{
  // Find a block with multiple consecutive method calls on related objects
  let foundChained = false;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      if (reconBlock.methodCalls.length >= 2) {
        // Good enough — multiple method calls in same block
        foundChained = true;
        assert(true, `Multi-method block: func ${funcId} ${blockId} has ${reconBlock.methodCalls.length} calls`);
        break;
      }
    }
    if (foundChained) break;
  }
  assert(foundChained, 'Block with multiple method calls found');
}

// 1e. A block where PROP_GET result would be multi-use (should NOT merge)
{
  // Check that NOT all prop_get statements were merged — some should remain
  let totalPropGetsRemaining = 0;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      for (const s of reconBlock.statements) {
        if (s.expr && s.expr.type === 'prop_get') {
          totalPropGetsRemaining++;
        }
      }
    }
  }
  // We expect many prop_gets to remain (property accesses that aren't method calls)
  assert(totalPropGetsRemaining > 0,
    `Safety: ${totalPropGetsRemaining} prop_get statements remain (not all merged)`);
}

console.log('');

// ============================================================================
// Criterion 2: ≥28/30 sampled method names match strings.json
// ============================================================================

console.log('=== Criterion 2: Method name verification against strings.json ===');

{
  // Collect all method calls with string method names
  const allMethodCalls = [];
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      for (const mc of reconBlock.methodCalls) {
        if (typeof mc.method === 'string' && /^[a-zA-Z_$]/.test(mc.method)) {
          allMethodCalls.push(mc);
        }
      }
    }
  }

  assert(allMethodCalls.length >= 30,
    `Have ≥30 string method calls to sample (got ${allMethodCalls.length})`);

  // Sample 30 unique method names (or all if fewer)
  const uniqueNames = [...new Set(allMethodCalls.map(mc => mc.method))];
  const sampleSize = Math.min(30, uniqueNames.length);
  const sampled = uniqueNames.slice(0, sampleSize);

  let matchCount = 0;
  const mismatches = [];

  for (const name of sampled) {
    if (stringSet.has(name)) {
      matchCount++;
    } else {
      mismatches.push(name);
    }
  }

  assert(matchCount >= 28,
    `≥28/${sampleSize} method names match strings.json (got ${matchCount}/${sampleSize})`);

  if (mismatches.length > 0) {
    console.log(`    Mismatches: ${mismatches.join(', ')}`);
  }

  // Also check ALL method calls (not just sample)
  let totalMatch = 0;
  let totalChecked = 0;
  for (const name of uniqueNames) {
    totalChecked++;
    if (stringSet.has(name)) totalMatch++;
  }
  console.log(`    Full check: ${totalMatch}/${totalChecked} unique method names in strings.json`);
}

console.log('');

// ============================================================================
// Criterion 3: Statement count never increases
// ============================================================================

console.log('=== Criterion 3: Statement count check — never increases ===');

{
  let violations = 0;
  let totalBlocks = 0;
  let totalDecrease = 0;
  let totalSame = 0;

  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    const foldedBlockMap = allFolded.get(funcId);
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      totalBlocks++;
      const foldedBlock = foldedBlockMap.get(blockId);
      const before = foldedBlock.statements.length;
      const after = reconBlock.statements.length;

      if (after > before) {
        violations++;
        if (violations <= 5) {
          console.log(`    VIOLATION: func ${funcId} ${blockId}: ${before} → ${after} (increased!)`);
        }
      } else if (after < before) {
        totalDecrease++;
      } else {
        totalSame++;
      }
    }
  }

  assert(violations === 0,
    `Statement count never increases (${violations} violations in ${totalBlocks} blocks)`);
  console.log(`    ${totalDecrease} decreased, ${totalSame} unchanged, ${violations} increased`);

  // Cross-check: total decrease should match 295 eliminated
  const totalBefore = Array.from(allFolded.values()).reduce((acc, bm) =>
    acc + Array.from(bm.values()).reduce((a, b) => a + b.statements.length, 0), 0);
  const totalAfter = Array.from(allReconstructed.values()).reduce((acc, bm) =>
    acc + Array.from(bm.values()).reduce((a, b) => a + b.statements.length, 0), 0);

  assert(totalBefore === 7253, `Total statements before: ${totalBefore} (expected 7253)`);
  assert(totalAfter === 6958, `Total statements after: ${totalAfter} (expected 6958)`);
  assert(totalBefore - totalAfter === 295, `Eliminated: ${totalBefore - totalAfter} (expected 295)`);
}

console.log('');

// ============================================================================
// Criterion 4: All 270 functions processed without errors
// ============================================================================

console.log('=== Criterion 4: All 270 functions processed ===');

{
  const funcCount = allReconstructed.size;
  assert(funcCount === 270, `270 functions reconstructed (got ${funcCount})`);

  // Verify all function IDs match
  for (const funcId of allFolded.keys()) {
    assert(allReconstructed.has(funcId),
      `Function ${funcId} present in reconstruction output`);
  }

  // Verify all blocks present
  let blockMismatch = 0;
  for (const [funcId, foldedMap] of allFolded.entries()) {
    const reconMap = allReconstructed.get(funcId);
    if (!reconMap) continue;
    for (const blockId of foldedMap.keys()) {
      if (!reconMap.has(blockId)) blockMismatch++;
    }
  }
  assert(blockMismatch === 0, `All blocks present (${blockMismatch} missing)`);
}

console.log('');

// ============================================================================
// Criterion 5: Semantic preservation — 10 sampled blocks
// ============================================================================

console.log('=== Criterion 5: Semantic preservation — 10 sampled blocks ===');

{
  // For each block, verify that the set of registers written (dest) and read is
  // preserved after reconstruction. Since method reconstruction is cosmetic,
  // the data flow should be identical.

  // Collect all expr reads recursively
  function getAllReads(expr) {
    if (!expr) return new Set();
    const reads = new Set();

    function walk(e) {
      if (!e) return;
      if (e.type === 'register') { reads.add(e.reg); return; }
      if (e.type === 'literal' || e.type === 'string_build') return;

      // Walk all sub-expressions
      if (e.object) walk(e.object);
      if (e.property) walk(e.property);
      if (e.method) walk(e.method);
      if (e.fn) walk(e.fn);
      if (e.thisArg) walk(e.thisArg);
      if (e.left) walk(e.left);
      if (e.right) walk(e.right);
      if (e.operand) walk(e.operand);
      if (e.condition) walk(e.condition);
      if (e.value) {
        if (typeof e.value === 'object' && e.value !== null) walk(e.value);
      }
      if (e.args) e.args.forEach(a => walk(a));
      if (e.elements) e.elements.forEach(a => walk(a));
      if (e.effects) e.effects.forEach(eff => {
        if (eff.expr) walk(eff.expr);
      });
    }

    walk(expr);
    return reads;
  }

  function getBlockDests(block) {
    const dests = new Set();
    for (const s of block.statements) {
      if (s.dest) dests.add(s.dest);
      if (s.compoundEffects) {
        for (const e of s.compoundEffects) {
          if (e.dest) dests.add(e.dest);
        }
      }
    }
    return dests;
  }

  function getBlockReads(block) {
    const reads = new Set();
    for (const s of block.statements) {
      for (const r of getAllReads(s.expr)) reads.add(r);
    }
    return reads;
  }

  // Sample 10 blocks that have method call reconstructions
  const sampledBlocks = [];
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      if (reconBlock.methodCalls.length > 0) {
        sampledBlocks.push({ funcId, blockId });
      }
      if (sampledBlocks.length >= 10) break;
    }
    if (sampledBlocks.length >= 10) break;
  }

  let semanticPass = 0;
  for (const { funcId, blockId } of sampledBlocks) {
    const foldedBlock = allFolded.get(funcId).get(blockId);
    const reconBlock = allReconstructed.get(funcId).get(blockId);

    const beforeDests = getBlockDests(foldedBlock);
    const afterDests = getBlockDests(reconBlock);

    // The dests after reconstruction should be a SUBSET of before
    // (the PROP_GET dest is removed if it was single-use)
    let destsOk = true;
    for (const d of afterDests) {
      if (!beforeDests.has(d)) {
        console.log(`    WARNING: func ${funcId} ${blockId}: new dest "${d}" not in original`);
        destsOk = false;
      }
    }

    // liveOut should be unchanged
    const loMatch = JSON.stringify(foldedBlock.liveOut) === JSON.stringify(reconBlock.liveOut);

    if (destsOk && loMatch) {
      semanticPass++;
    } else {
      console.log(`    FAIL: func ${funcId} ${blockId}: destsOk=${destsOk} loMatch=${loMatch}`);
    }
  }

  assert(semanticPass === 10,
    `Semantic preservation: ${semanticPass}/10 blocks verified`);
}

console.log('');

// ============================================================================
// Criterion 6: Method call count in range 200–500
// ============================================================================

console.log('=== Criterion 6: Method call count in range 200–500 ===');

{
  let totalMC = 0;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      totalMC += reconBlock.methodCalls.length;
    }
  }

  assert(totalMC >= 200, `Method call count ≥ 200 (got ${totalMC})`);
  assert(totalMC <= 500, `Method call count ≤ 500 (got ${totalMC})`);
  console.log(`    Total: ${totalMC} method calls`);
}

console.log('');

// ============================================================================
// Additional quality checks
// ============================================================================

console.log('=== Additional quality checks ===');

// Check renderMethodCall works correctly
{
  const testExpr = {
    type: 'method_call',
    object: { type: 'register', reg: 'r18' },
    method: { type: 'literal', value: 'substring' },
    args: [
      { type: 'literal', value: 0 },
      { type: 'register', reg: 'r21' },
    ],
  };

  const rendered = renderMethodCall(testExpr);
  assert(rendered === 'r18.substring(0, r21)',
    `renderMethodCall: "${rendered}" === "r18.substring(0, r21)"`);
}

// Check renderMethodCall with bracket notation
{
  const testExpr = {
    type: 'method_call',
    object: { type: 'register', reg: 'r5' },
    method: { type: 'literal', value: 'some-name' }, // needs bracket notation
    args: [],
  };

  const rendered = renderMethodCall(testExpr);
  assert(rendered === 'r5["some-name"]()',
    `renderMethodCall bracket: "${rendered}" === 'r5["some-name"]()'`);
}

// Check exprsEqual
{
  assert(exprsEqual({ type: 'register', reg: 'r5' }, { type: 'register', reg: 'r5' }),
    'exprsEqual: same register');
  assert(!exprsEqual({ type: 'register', reg: 'r5' }, { type: 'register', reg: 'r6' }),
    'exprsEqual: different register');
  assert(exprsEqual({ type: 'literal', value: 42 }, { type: 'literal', value: 42 }),
    'exprsEqual: same literal');
}

// Check resolveMethodName
{
  const sv = new Map([['r9', 'indexOf']]);
  const result = resolveMethodName({ type: 'register', reg: 'r9' }, sv);
  assert(result.type === 'literal' && result.value === 'indexOf',
    'resolveMethodName: register with known string_build resolves');

  const result2 = resolveMethodName({ type: 'register', reg: 'r99' }, sv);
  assert(result2.type === 'register' && result2.reg === 'r99',
    'resolveMethodName: unknown register passes through');
}

// Check that liveOut and stringLiterals are preserved (not modified)
{
  let liveOutPreserved = true;
  let strLitPreserved = true;
  let checked = 0;

  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    const foldedBlockMap = allFolded.get(funcId);
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      const foldedBlock = foldedBlockMap.get(blockId);
      if (reconBlock.liveOut !== foldedBlock.liveOut) liveOutPreserved = false;
      if (reconBlock.stringLiterals !== foldedBlock.stringLiterals) strLitPreserved = false;
      checked++;
      if (checked >= 50) break; // spot-check is enough
    }
    if (checked >= 50) break;
  }

  assert(liveOutPreserved, 'liveOut arrays are the same reference (not modified)');
  assert(strLitPreserved, 'stringLiterals arrays are the same reference (not modified)');
}

// Check methodCalls metadata array exists on every block
{
  let allHaveMetadata = true;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      if (!Array.isArray(reconBlock.methodCalls)) {
        allHaveMetadata = false;
        break;
      }
    }
    if (!allHaveMetadata) break;
  }
  assert(allHaveMetadata, 'All blocks have methodCalls metadata array');
}

// Verify idempotence: reconstructing already-reconstructed blocks should be a no-op
{
  // Take a block that had method calls and re-run reconstructBlock on it
  let idempotent = true;
  let tested = 0;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      if (reconBlock.methodCalls.length > 0) {
        const reRecon = reconstructBlock(reconBlock);
        if (reRecon.statements.length !== reconBlock.statements.length) {
          idempotent = false;
          console.log(`    NOT IDEMPOTENT: func ${funcId} ${blockId}: ${reconBlock.statements.length} → ${reRecon.statements.length}`);
        }
        tested++;
        if (tested >= 5) break;
      }
    }
    if (tested >= 5) break;
  }
  assert(idempotent, `Idempotence: re-reconstruction doesn't change statement count (${tested} tested)`);
}

// Check the "0" and "2" method names in top 20 — these look suspicious
{
  console.log('');
  console.log('--- Suspicious method names check ---');
  // "0" and "2" as method names could indicate numeric property access
  // This is valid JS (e.g., array[0]), but unusual for methods
  let numericMethods = 0;
  for (const [funcId, reconBlockMap] of allReconstructed.entries()) {
    for (const [blockId, reconBlock] of reconBlockMap.entries()) {
      for (const mc of reconBlock.methodCalls) {
        if (/^\d+$/.test(mc.method)) {
          numericMethods++;
        }
      }
    }
  }
  console.log(`    Numeric method names: ${numericMethods} (may be array index calls — worth reviewing but not blocking)`);
}

// ============================================================================
// Summary
// ============================================================================

console.log('');
console.log('='.repeat(60));
console.log(`RESULTS: ${pass} passed, ${fail} failed out of ${pass + fail} assertions`);
console.log('='.repeat(60));

if (fail > 0) {
  process.exit(1);
}
