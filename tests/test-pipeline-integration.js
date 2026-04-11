'use strict';

/**
 * Integration tests for pipeline → scraper structure param flow:
 *   - scraper/template-cache.js store/lookup with structure params
 *   - scraper/template-cache.js seed() reading structureParams from pipeline-config.json
 *   - Pipeline-config.json schema validation
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TemplateCache = require('../scraper/template-cache');

// ============================================================================
// Shared fixtures
// ============================================================================

const OUTPUT_DIR = path.join(__dirname, '..', 'output');

const MOCK_XTEA = {
  key: [1, 2, 3, 4],
  delta: 2654435769,
  rounds: 32,
  keyModConstants: [0, 0],
};

const MOCK_STRUCTURE_PARAMS = {
  hashPosition: 11,
  fieldOrder: [31, 6, -1, 9],
  headerSplit: {
    strategy: 'field-boundary',
    contentLength: 133,
    paddingLength: 11,
  },
  serializationDiffs: [],
};

// ============================================================================
// 1. TemplateCache store/lookup with structure params
// ============================================================================

describe('TemplateCache structure params via store/lookup', () => {
  let cache;
  let tmpCachePath;

  before(() => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-struct-'));
    tmpCachePath = path.join(tmpDir, 'templates.json');
    cache = new TemplateCache(tmpCachePath);
    cache.load();
  });

  after(() => {
    // Clean up temp files
    if (tmpCachePath && fs.existsSync(tmpCachePath)) {
      fs.unlinkSync(tmpCachePath);
      fs.rmdirSync(path.dirname(tmpCachePath));
    }
  });

  it('stores and retrieves all structure fields', () => {
    cache.store('TEST_STRUCT_FULL', {
      template: 'test',
      key: MOCK_XTEA.key,
      delta: MOCK_XTEA.delta,
      rounds: MOCK_XTEA.rounds,
      keyModConstants: MOCK_XTEA.keyModConstants,
      caseCount: 95,
      hashPosition: MOCK_STRUCTURE_PARAMS.hashPosition,
      fieldOrder: MOCK_STRUCTURE_PARAMS.fieldOrder,
      headerSplit: MOCK_STRUCTURE_PARAMS.headerSplit,
      serializationDiffs: MOCK_STRUCTURE_PARAMS.serializationDiffs,
    });

    const entry = cache.lookup('TEST_STRUCT_FULL');
    assert.notEqual(entry, null, 'entry should exist');
    assert.equal(entry.hashPosition, 11);
    assert.deepEqual(entry.fieldOrder, [31, 6, -1, 9]);
    assert.equal(entry.headerSplit.strategy, 'field-boundary');
    assert.equal(entry.headerSplit.contentLength, 133);
    assert.equal(entry.headerSplit.paddingLength, 11);
    assert.deepEqual(entry.serializationDiffs, []);
  });

  it('preserves structure fields alongside XTEA params', () => {
    const entry = cache.lookup('TEST_STRUCT_FULL');
    assert.notEqual(entry, null);
    // XTEA fields still present
    assert.deepEqual(entry.key, [1, 2, 3, 4]);
    assert.equal(entry.delta, 2654435769);
    assert.equal(entry.rounds, 32);
    assert.deepEqual(entry.keyModConstants, [0, 0]);
    assert.equal(entry.caseCount, 95);
    assert.equal(entry.template, 'test');
    // Structure fields also present
    assert.equal(entry.hashPosition, 11);
    assert.deepEqual(entry.fieldOrder, [31, 6, -1, 9]);
  });

  it('stores entry without structure fields (backward compat)', () => {
    cache.store('TEST_NO_STRUCT', {
      template: 'legacy',
      key: [5, 6, 7, 8],
      delta: 2654435769,
      rounds: 32,
      keyModConstants: [100, 200],
      caseCount: 94,
    });

    const entry = cache.lookup('TEST_NO_STRUCT');
    assert.notEqual(entry, null);
    assert.equal(entry.template, 'legacy');
    assert.deepEqual(entry.key, [5, 6, 7, 8]);
    // Structure fields should be absent
    assert.equal(entry.hashPosition, undefined);
    assert.equal(entry.fieldOrder, undefined);
    assert.equal(entry.headerSplit, undefined);
    assert.equal(entry.serializationDiffs, undefined);
  });

  it('lookup returns null for nonexistent name', () => {
    const entry = cache.lookup('NONEXISTENT_TDC_NAME');
    assert.equal(entry, null);
  });

  it('persists structure fields to disk and reloads', () => {
    // Create a fresh cache pointing at the same file
    const cache2 = new TemplateCache(tmpCachePath);
    cache2.load();

    const entry = cache2.lookup('TEST_STRUCT_FULL');
    assert.notEqual(entry, null, 'entry should survive disk round-trip');
    assert.equal(entry.hashPosition, 11);
    assert.deepEqual(entry.fieldOrder, [31, 6, -1, 9]);
    assert.equal(entry.headerSplit.strategy, 'field-boundary');
    assert.deepEqual(entry.serializationDiffs, []);
  });
});

// ============================================================================
// 2. TemplateCache seed() reads structureParams from pipeline-config.json
// ============================================================================

describe('TemplateCache seed() with structureParams', () => {
  let cache;
  let tmpCachePath;
  let tmpConfigDir;

  before(() => {
    // Create temp cache file
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-seed-'));
    tmpCachePath = path.join(tmpDir, 'templates.json');

    // Create temp pipeline-config.json in output/_test_struct/
    tmpConfigDir = path.join(OUTPUT_DIR, '_test_struct');
    fs.mkdirSync(tmpConfigDir, { recursive: true });

    const mockConfig = {
      target: 'tdc.js',
      template: 'A',
      caseCount: 95,
      xteaParams: MOCK_XTEA,
      structureParams: MOCK_STRUCTURE_PARAMS,
    };
    fs.writeFileSync(
      path.join(tmpConfigDir, 'pipeline-config.json'),
      JSON.stringify(mockConfig, null, 2),
      'utf8'
    );

    cache = new TemplateCache(tmpCachePath);
    cache.load();
  });

  after(() => {
    // Clean up temp config dir
    if (tmpConfigDir && fs.existsSync(tmpConfigDir)) {
      const configFile = path.join(tmpConfigDir, 'pipeline-config.json');
      if (fs.existsSync(configFile)) fs.unlinkSync(configFile);
      fs.rmdirSync(tmpConfigDir);
    }
    // Clean up temp cache
    if (tmpCachePath && fs.existsSync(tmpCachePath)) {
      fs.unlinkSync(tmpCachePath);
      fs.rmdirSync(path.dirname(tmpCachePath));
    }
  });

  it('seed() picks up structureParams from pipeline-config.json', () => {
    // The source hash for targets/tdc.js is already in the real cache,
    // but our fresh temp cache is empty so seed() should populate it.
    cache.seed();

    // Compute the source hash from targets/tdc.js so we know what key to look up
    const { computeSourceHash } = require('../scraper/tdc-utils');
    const tdcSource = fs.readFileSync(
      path.join(__dirname, '..', 'targets', 'tdc.js'),
      'utf8'
    );
    const sourceHash = computeSourceHash(tdcSource);
    assert.ok(sourceHash, 'should compute source hash from targets/tdc.js');

    const entry = cache.lookup(sourceHash);
    assert.notEqual(entry, null, 'seed() should create cache entry');
    assert.equal(entry.hashPosition, 11, 'hashPosition from structureParams');
    assert.ok(Array.isArray(entry.fieldOrder), 'fieldOrder is an array');
    assert.ok(entry.fieldOrder.length > 0, 'fieldOrder has entries');
    assert.ok(entry.headerSplit && typeof entry.headerSplit === 'object', 'headerSplit from structureParams');
    assert.ok(typeof entry.headerSplit.strategy === 'string', 'headerSplit has strategy');
    assert.ok(Array.isArray(entry.serializationDiffs), 'serializationDiffs is an array');
  });

  it('seed() sets cdFieldOrder from fieldOrder for backward compat', () => {
    const { computeSourceHash } = require('../scraper/tdc-utils');
    const tdcSource = fs.readFileSync(
      path.join(__dirname, '..', 'targets', 'tdc.js'),
      'utf8'
    );
    const sourceHash = computeSourceHash(tdcSource);
    const entry = cache.lookup(sourceHash);
    assert.notEqual(entry, null);
    assert.deepEqual(
      entry.cdFieldOrder,
      [31, 6, -1, 9],
      'cdFieldOrder should be set from fieldOrder for backward compat'
    );
  });
});

// ============================================================================
// 3. Pipeline-config.json schema smoke test
// ============================================================================

describe('pipeline-config.json schema validation', () => {
  const configPath = path.join(OUTPUT_DIR, 'tdc', 'pipeline-config.json');

  it('output/tdc/pipeline-config.json has required fields', () => {
    assert.ok(
      fs.existsSync(configPath),
      'output/tdc/pipeline-config.json should exist'
    );
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    // Required top-level fields
    assert.equal(typeof config.target, 'string');
    assert.equal(typeof config.template, 'string');
    assert.equal(typeof config.caseCount, 'number');
    assert.ok(config.xteaParams, 'xteaParams should exist');

    // xteaParams schema
    assert.ok(Array.isArray(config.xteaParams.key), 'key should be array');
    assert.equal(config.xteaParams.key.length, 4, 'key should have 4 elements');
    assert.equal(typeof config.xteaParams.delta, 'number');
    assert.equal(typeof config.xteaParams.rounds, 'number');
    assert.ok(
      Array.isArray(config.xteaParams.keyModConstants),
      'keyModConstants should be array'
    );
  });

  it('structureParams is null or an object with expected fields when present', () => {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    if (config.structureParams === null || config.structureParams === undefined) {
      // Acceptable: older pipeline-config may not have structureParams
      assert.ok(true, 'structureParams absent or null is valid');
    } else {
      // If present, check expected shape
      const sp = config.structureParams;
      if (sp.hashPosition !== undefined) {
        assert.equal(typeof sp.hashPosition, 'number');
      }
      if (sp.fieldOrder !== undefined) {
        assert.ok(Array.isArray(sp.fieldOrder), 'fieldOrder should be array');
      }
      if (sp.headerSplit !== undefined) {
        assert.equal(typeof sp.headerSplit, 'object');
      }
      if (sp.serializationDiffs !== undefined) {
        assert.ok(Array.isArray(sp.serializationDiffs), 'serializationDiffs should be array');
      }
    }
  });
});
