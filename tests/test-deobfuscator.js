'use strict';

/**
 * Test suite for pipeline/deobfuscator.js
 *
 * Validates source deobfuscation: detection, decoder resolution,
 * helper inlining, and downstream pipeline compatibility.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { deobfuscate } = require('../tools/porting-pipeline/deobfuscator');
const { parseVmFunction } = require('../tools/porting-pipeline/vm-parser');
const { mapOpcodes } = require('../tools/porting-pipeline/opcode-mapper');

const TARGETS = path.join(__dirname, '..', 'targets');
const SURVEY_DIR = path.join(__dirname, '..', 'output', 'tdc-survey');

// Pre-load tdc.js (non-obfuscated reference build)
const tdcSource = fs.readFileSync(path.join(TARGETS, 'tdc.js'), 'utf8');

// Obfuscated survey build hashes
const OBFUSCATED_HASHES = [
  '3429444f324c6110',
  'e2170903e201e018',
  '27dda893f81dbc4f',
];

// Pre-check which survey files exist
const surveyAvailable = {};
for (const hash of OBFUSCATED_HASHES) {
  const filePath = path.join(SURVEY_DIR, `${hash}.js`);
  surveyAvailable[hash] = fs.existsSync(filePath);
}

// Cache deobfuscation results (expensive to compute)
const deobfuscationCache = {};
function getDeobfuscated(hash) {
  if (!deobfuscationCache[hash]) {
    const src = fs.readFileSync(path.join(SURVEY_DIR, `${hash}.js`), 'utf8');
    deobfuscationCache[hash] = deobfuscate(src);
  }
  return deobfuscationCache[hash];
}

// Cache for tdc.js result
let tdcDeobfuscateResult;
function getTdcResult() {
  if (!tdcDeobfuscateResult) {
    tdcDeobfuscateResult = deobfuscate(tdcSource);
  }
  return tdcDeobfuscateResult;
}

// ============================================================================
// 1. Non-obfuscated source passes through unchanged
// ============================================================================
describe('deobfuscator: non-obfuscated source', () => {
  it('passes through unchanged', () => {
    const result = getTdcResult();
    assert.strictEqual(result.isObfuscated, false);
    assert.strictEqual(result.deobfuscated, tdcSource);
  });
});

// ============================================================================
// 2. Detects obfuscated source
// ============================================================================
describe('deobfuscator: obfuscated detection', () => {
  const hash = '3429444f324c6110';
  const testFn = surveyAvailable[hash] ? it : it.skip;

  testFn('detects obfuscated source', () => {
    const result = getDeobfuscated(hash);
    assert.strictEqual(result.isObfuscated, true);
  });
});

// ============================================================================
// 3. Deobfuscated source parses with acorn
// ============================================================================
describe('deobfuscator: parse validity', () => {
  const hash = '3429444f324c6110';
  const testFn = surveyAvailable[hash] ? it : it.skip;

  testFn('deobfuscated source parses with acorn', () => {
    const result = getDeobfuscated(hash);
    assert.doesNotThrow(() => {
      acorn.parse(result.deobfuscated, { ecmaVersion: 2020, sourceType: 'script' });
    });
  });
});

// ============================================================================
// 4. Decoder resolves method names
// ============================================================================
describe('deobfuscator: decoder resolution', () => {
  const hash = '3429444f324c6110';
  const testFn = surveyAvailable[hash] ? it : it.skip;

  testFn('resolves method names', () => {
    const result = getDeobfuscated(hash);
    const src = result.deobfuscated;
    // After deobfuscation, common method names should appear as dot notation
    const hasKnownMethod =
      src.includes('.push') ||
      src.includes('.call') ||
      src.includes('.fromCharCode') ||
      src.includes('.apply') ||
      src.includes('.slice') ||
      src.includes('.charAt');
    assert.ok(
      hasKnownMethod,
      'deobfuscated source should contain resolved method names like .push, .call, .fromCharCode'
    );
  });
});

// ============================================================================
// 5. Stats report decoder and helper replacements
// ============================================================================
describe('deobfuscator: stats', () => {
  const hash = '3429444f324c6110';
  const testFn = surveyAvailable[hash] ? it : it.skip;

  testFn('reports decoder replacements > 0', () => {
    const result = getDeobfuscated(hash);
    assert.ok(
      result.stats.decoderReplacements > 0,
      `expected decoderReplacements > 0, got ${result.stats.decoderReplacements}`
    );
  });

  testFn('reports helper replacements > 0', () => {
    const result = getDeobfuscated(hash);
    assert.ok(
      result.stats.helperReplacements > 0,
      `expected helperReplacements > 0, got ${result.stats.helperReplacements}`
    );
  });
});

// ============================================================================
// 6. Improves opcode mapping rate
// ============================================================================
describe('deobfuscator: opcode mapping improvement', () => {
  const hash = '3429444f324c6110';
  const testFn = surveyAvailable[hash] ? it : it.skip;

  testFn('deobfuscated version maps significantly more opcodes', () => {
    const rawSource = fs.readFileSync(path.join(SURVEY_DIR, `${hash}.js`), 'utf8');
    const result = getDeobfuscated(hash);

    // Parse and map raw (obfuscated) source
    const rawParsed = parseVmFunction(rawSource);
    const rawMapping = mapOpcodes(rawParsed, rawSource);
    const rawTotal = rawParsed.caseCount;
    const rawMapped = Object.keys(rawMapping.opcodeTable).length;
    const rawRate = rawMapped / rawTotal;

    // Parse and map deobfuscated source
    const deobParsed = parseVmFunction(result.deobfuscated);
    const deobMapping = mapOpcodes(deobParsed, result.deobfuscated);
    const deobTotal = deobParsed.caseCount;
    const deobMapped = Object.keys(deobMapping.opcodeTable).length;
    const deobRate = deobMapped / deobTotal;

    assert.ok(
      rawRate < 0.50,
      `expected raw mapping rate < 50%, got ${(rawRate * 100).toFixed(1)}% (${rawMapped}/${rawTotal})`
    );
    assert.ok(
      deobRate > 0.60,
      `expected deobfuscated mapping rate > 60%, got ${(deobRate * 100).toFixed(1)}% (${deobMapped}/${deobTotal})`
    );
  });
});

// ============================================================================
// 7. Handles all 3 obfuscated builds
// ============================================================================
describe('deobfuscator: all obfuscated builds', () => {
  for (const hash of OBFUSCATED_HASHES) {
    const testFn = surveyAvailable[hash] ? it : it.skip;

    testFn(`${hash} is detected as obfuscated`, () => {
      const result = getDeobfuscated(hash);
      assert.strictEqual(result.isObfuscated, true);
    });

    testFn(`${hash} deobfuscated source parses cleanly`, () => {
      const result = getDeobfuscated(hash);
      assert.doesNotThrow(() => {
        acorn.parse(result.deobfuscated, { ecmaVersion: 2020, sourceType: 'script' });
      });
    });
  }
});
