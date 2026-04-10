'use strict';

/**
 * Test suite for pipeline/key-extractor.js
 *
 * Validates dynamic XTEA key extraction via Puppeteer tracing against
 * known-good values for tdc.js (Template A). Since each test requires
 * a Puppeteer launch (~4-5s), we run extractKey once and validate all
 * properties from the cached result.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseVmFunction } = require('../pipeline/vm-parser');
const { mapOpcodes } = require('../pipeline/opcode-mapper');
const { extractKey } = require('../pipeline/key-extractor');

const TARGETS = path.join(__dirname, '..', 'targets');
const TDC_PATH = path.join(TARGETS, 'tdc.js');

// Known-good values for tdc.js (Template A)
const EXPECTED_KEY = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140];
const EXPECTED_DELTA = 0x9E3779B9;
const EXPECTED_ROUNDS = 32;
const EXPECTED_KEY_MODS = [2368517, 592130];

// Cache the result across all tests (single Puppeteer launch)
let cachedResult = null;

async function getResult() {
  if (cachedResult) return cachedResult;
  const src = fs.readFileSync(TDC_PATH, 'utf8');
  const parsed = parseVmFunction(src);
  const mapped = mapOpcodes(parsed, src);
  cachedResult = await extractKey(TDC_PATH, mapped.opcodeTable, parsed.variables);
  return cachedResult;
}

// ============================================================================
// Key extractor tests for tdc.js (Template A)
// ============================================================================
describe('key-extractor: tdc.js Template A', { timeout: 60000 }, () => {

  // 1. Return type structure
  it('result has all required properties', async () => {
    const result = await getResult();
    assert.ok('key' in result, 'missing key property');
    assert.ok('delta' in result, 'missing delta property');
    assert.ok('rounds' in result, 'missing rounds property');
    assert.ok('keyModConstants' in result, 'missing keyModConstants property');
    assert.ok('verified' in result, 'missing verified property');
    assert.ok('notes' in result, 'missing notes property');
  });

  // 2. Key is array of 4 numbers
  it('key is an array of 4 numbers', async () => {
    const result = await getResult();
    assert.ok(Array.isArray(result.key), 'key should be an array');
    assert.strictEqual(result.key.length, 4, 'key should have 4 elements');
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(typeof result.key[i], 'number',
        `key[${i}] should be a number, got ${typeof result.key[i]}`);
    }
  });

  // 3. Key values match expected
  it('key values match expected Template A values', async () => {
    const result = await getResult();
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(result.key[i] >>> 0, EXPECTED_KEY[i] >>> 0,
        `key[${i}]: expected 0x${(EXPECTED_KEY[i] >>> 0).toString(16)}, ` +
        `got 0x${(result.key[i] >>> 0).toString(16)}`);
    }
  });

  // 4. Delta matches
  it('delta matches 0x9E3779B9', async () => {
    const result = await getResult();
    assert.strictEqual(result.delta >>> 0, EXPECTED_DELTA >>> 0,
      `delta: expected 0x${(EXPECTED_DELTA >>> 0).toString(16)}, ` +
      `got 0x${(result.delta >>> 0).toString(16)}`);
  });

  // 5. Rounds is 32
  it('rounds is 32', async () => {
    const result = await getResult();
    assert.strictEqual(result.rounds, EXPECTED_ROUNDS,
      `rounds: expected ${EXPECTED_ROUNDS}, got ${result.rounds}`);
  });

  // 6. Key mod constants match
  it('keyModConstants match expected values', async () => {
    const result = await getResult();
    assert.deepStrictEqual(result.keyModConstants, EXPECTED_KEY_MODS,
      `keyModConstants: expected [${EXPECTED_KEY_MODS}], got [${result.keyModConstants}]`);
  });

  // 7. Verified is true
  it('verified is true', async () => {
    const result = await getResult();
    assert.strictEqual(result.verified, true,
      'verified should be true for Template A known values');
  });
});
