'use strict';

/**
 * Test suite for scraper foundation modules:
 *   - scraper/tdc-utils.js       (extractTdcName, extractEks)
 *   - scraper/template-cache.js  (TemplateCache)
 *   - scraper/collect-generator.js (generateCollect, createEncryptFn)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');
const {
  generateCollect,
  createEncryptFn,
  convertBytesToWord,
  convertWordToBytes,
  cipherRound,
  encrypt,
} = require('../scraper/collect-generator');

// Reference modules for byte-identical comparison
const { encryptFn: refEncryptFn } = require('../token/crypto-core');
const { generateToken, buildInputChunks } = require('../token/generate-token');
const { buildDefaultCdArray } = require('../token/collector-schema');

// ============================================================================
// Shared fixtures
// ============================================================================

const TARGETS = path.join(__dirname, '..', 'targets');
const tdcSource = fs.readFileSync(path.join(TARGETS, 'tdc.js'), 'utf8');
const tdcV2Source = fs.readFileSync(path.join(TARGETS, 'tdc-v2.js'), 'utf8');
const tdcV5Source = fs.readFileSync(path.join(TARGETS, 'tdc-v5.js'), 'utf8');

const profile = require('../profiles/default.json');

const XTEA_A = {
  key: [0x6257584F, 0x462A4564, 0x636A5062, 0x6D644140],
  delta: 0x9E3779B9,
  rounds: 32,
  keyModConstants: [2368517, 592130],
};

const XTEA_B = {
  key: [0x6B516842, 0x4D554B69, 0x69655456, 0x452C233E],
  delta: 0x9E3779B9,
  rounds: 32,
  keyModConstants: [0, 2236974],
};

const XTEA_C = {
  key: [0x5949415A, 0x454D6265, 0x6D686358, 0x6C66525F],
  delta: 0x9E3779B9,
  rounds: 32,
  keyModConstants: [0, 263180],
};

const TDC_NAMES = {
  A: 'FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk',
  B: 'SUOPMSFGeTelWAhfVaTKnRSJkFAfGHcD',
  C: 'WAgdYOUnKVUhEBmBAOQASgTEAVSQkikE',
};

const FIXED_OPTS = {
  timestamp: 1700000000000,
  nonce: '0.12345678',
  appid: '2090803262',
  token: 'test_token_123',
};

/** Create a temp file path for cache tests. */
function tmpCachePath() {
  return path.join(os.tmpdir(), 'test-cache-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json');
}

// ============================================================================
// 1. tdc-utils: extractTdcName
// ============================================================================

describe('tdc-utils: extractTdcName', () => {
  it('extracts correct name from tdc.js (Template A)', () => {
    assert.strictEqual(extractTdcName(tdcSource), TDC_NAMES.A);
  });

  it('extracts correct name from tdc-v2.js (Template B)', () => {
    assert.strictEqual(extractTdcName(tdcV2Source), TDC_NAMES.B);
  });

  it('extracts correct name from tdc-v5.js (Template C)', () => {
    assert.strictEqual(extractTdcName(tdcV5Source), TDC_NAMES.C);
  });

  it('returns null for empty string', () => {
    assert.strictEqual(extractTdcName(''), null);
  });

  it('returns null for string without TDC_NAME', () => {
    assert.strictEqual(extractTdcName('var x = 1; function foo() {}'), null);
  });
});

// ============================================================================
// 2. tdc-utils: extractEks
// ============================================================================

describe('tdc-utils: extractEks', () => {
  it('returns 312-char string from tdc.js', () => {
    const eks = extractEks(tdcSource);
    assert.ok(eks !== null, 'eks should not be null');
    assert.strictEqual(eks.length, 312);
  });

  it('returns 312-char string from tdc-v2.js', () => {
    const eks = extractEks(tdcV2Source);
    assert.ok(eks !== null, 'eks should not be null');
    assert.strictEqual(eks.length, 312);
  });

  it('returns 312-char string from tdc-v5.js', () => {
    const eks = extractEks(tdcV5Source);
    assert.ok(eks !== null, 'eks should not be null');
    assert.strictEqual(eks.length, 312);
  });

  it('returned value is valid base64 (no invalid chars)', () => {
    const eks = extractEks(tdcSource);
    assert.ok(eks !== null);
    assert.ok(/^[A-Za-z0-9+/]+=*$/.test(eks), 'eks should be valid base64');
  });

  it('returns null for invalid input', () => {
    assert.strictEqual(extractEks(''), null);
    assert.strictEqual(extractEks('var x = 1;'), null);
  });
});

// ============================================================================
// 3. template-cache: lookup
// ============================================================================

describe('template-cache: lookup', () => {
  let cache;
  let tmpPath;

  // Seed a cache from pipeline-config files once
  it('loads pre-seeded cache and looks up Template A with correct key', () => {
    tmpPath = tmpCachePath();
    cache = new TemplateCache(tmpPath);
    cache.seed();

    const entry = cache.lookup(TDC_NAMES.A);
    assert.ok(entry !== null, 'Template A entry should exist');
    assert.deepStrictEqual(entry.key, XTEA_A.key);
  });

  it('looks up Template B with correct key', () => {
    const entry = cache.lookup(TDC_NAMES.B);
    assert.ok(entry !== null, 'Template B entry should exist');
    assert.deepStrictEqual(entry.key, XTEA_B.key);
  });

  it('looks up Template C with correct key', () => {
    const entry = cache.lookup(TDC_NAMES.C);
    assert.ok(entry !== null, 'Template C entry should exist');
    assert.deepStrictEqual(entry.key, XTEA_C.key);
  });

  it('returns null for unknown name', () => {
    const entry = cache.lookup('NON_EXISTENT_TEMPLATE_NAME_12345');
    assert.strictEqual(entry, null);
  });

  it('each entry has delta, rounds, keyModConstants fields', () => {
    const entry = cache.lookup(TDC_NAMES.A);
    assert.ok(entry !== null);
    assert.strictEqual(entry.delta, XTEA_A.delta);
    assert.strictEqual(entry.rounds, XTEA_A.rounds);
    assert.ok(Array.isArray(entry.keyModConstants), 'keyModConstants should be an array');
    assert.strictEqual(entry.keyModConstants.length, 2);

    // Clean up
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });
});

// ============================================================================
// 4. template-cache: store and persistence
// ============================================================================

describe('template-cache: store and persistence', () => {
  it('stores a new entry and lookup returns it', () => {
    const tmpPath = tmpCachePath();
    const cache = new TemplateCache(tmpPath);
    cache.load();

    const params = {
      template: 'X',
      key: [1, 2, 3, 4],
      delta: 0x9E3779B9,
      rounds: 32,
      keyModConstants: [100, 200],
      caseCount: 50,
    };
    cache.store('TestTemplateName_1234567890ab', params);

    const entry = cache.lookup('TestTemplateName_1234567890ab');
    assert.ok(entry !== null, 'stored entry should be retrievable');
    assert.deepStrictEqual(entry.key, [1, 2, 3, 4]);
    assert.strictEqual(entry.template, 'X');

    // Clean up
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });

  it('stored entry has lastSeen timestamp', () => {
    const tmpPath = tmpCachePath();
    const cache = new TemplateCache(tmpPath);
    cache.load();

    const before = new Date().toISOString();
    cache.store('TestEntry_ABCDEF', { template: 'Z', key: [0, 0, 0, 0] });
    const after = new Date().toISOString();

    const entry = cache.lookup('TestEntry_ABCDEF');
    assert.ok(entry !== null);
    assert.ok(typeof entry.lastSeen === 'string', 'lastSeen should be a string');
    assert.ok(entry.lastSeen >= before, 'lastSeen should be >= before');
    assert.ok(entry.lastSeen <= after, 'lastSeen should be <= after');

    // Clean up
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });

  it('persists to disk and survives reload', () => {
    const tmpPath = tmpCachePath();
    const cache1 = new TemplateCache(tmpPath);
    cache1.load();
    cache1.store('PersistTest_XYZ', { template: 'P', key: [9, 8, 7, 6] });

    // Create a new cache instance pointing to the same file
    const cache2 = new TemplateCache(tmpPath);
    cache2.load();
    const entry = cache2.lookup('PersistTest_XYZ');
    assert.ok(entry !== null, 'entry should persist across instances');
    assert.deepStrictEqual(entry.key, [9, 8, 7, 6]);

    // Clean up
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });
});

// ============================================================================
// 5. template-cache: seed
// ============================================================================

describe('template-cache: seed', () => {
  it('populates 3 entries from pipeline-config files', () => {
    const tmpPath = tmpCachePath();
    const cache = new TemplateCache(tmpPath);
    cache.seed();

    // Should have entries for all 3 distinct TDC_NAMEs
    const a = cache.lookup(TDC_NAMES.A);
    const b = cache.lookup(TDC_NAMES.B);
    const c = cache.lookup(TDC_NAMES.C);
    assert.ok(a !== null, 'Template A should be seeded');
    assert.ok(b !== null, 'Template B should be seeded');
    assert.ok(c !== null, 'Template C should be seeded');

    // Clean up
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });

  it('seeded entries have correct keys matching pipeline-config.json', () => {
    const tmpPath = tmpCachePath();
    const cache = new TemplateCache(tmpPath);
    cache.seed();

    const a = cache.lookup(TDC_NAMES.A);
    const b = cache.lookup(TDC_NAMES.B);
    const c = cache.lookup(TDC_NAMES.C);

    assert.deepStrictEqual(a.key, XTEA_A.key);
    assert.deepStrictEqual(b.key, XTEA_B.key);
    assert.deepStrictEqual(c.key, XTEA_C.key);

    // Verify template labels
    assert.strictEqual(a.template, 'A');
    assert.strictEqual(b.template, 'B');
    assert.strictEqual(c.template, 'C');

    // Clean up
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  });
});

// ============================================================================
// 6. collect-generator: createEncryptFn
// ============================================================================

describe('collect-generator: createEncryptFn', () => {
  it('Template A encryptFn matches token/crypto-core.encryptFn for single chunk', () => {
    const myEncrypt = createEncryptFn(XTEA_A);
    const chunk = 'Hello World!1234';
    const ref = refEncryptFn([chunk]);
    const mine = myEncrypt([chunk]);
    assert.deepStrictEqual(mine, ref);
  });

  it('Template A encryptFn matches for multiple chunks', () => {
    const myEncrypt = createEncryptFn(XTEA_A);
    const chunks = ['AAAA1234', 'BBBB5678CCCC9012', 'Short'];
    const ref = refEncryptFn(chunks);
    const mine = myEncrypt(chunks);
    assert.deepStrictEqual(mine, ref);
  });

  it('returns array of base64 strings', () => {
    const myEncrypt = createEncryptFn(XTEA_A);
    const result = myEncrypt(['test1234']);
    assert.ok(Array.isArray(result), 'result should be an array');
    assert.strictEqual(result.length, 1);
    assert.ok(typeof result[0] === 'string', 'element should be a string');
    assert.ok(/^[A-Za-z0-9+/]+=*$/.test(result[0]), 'element should be valid base64');
  });
});

// ============================================================================
// 7. collect-generator: generateCollect
// ============================================================================

describe('collect-generator: generateCollect', () => {
  it('Template A with fixed inputs matches generateToken byte-for-byte', () => {
    const collect = generateCollect(profile, XTEA_A, FIXED_OPTS);

    const cdArray = buildDefaultCdArray(profile);
    const sdObject = {
      od: 'C',
      appid: FIXED_OPTS.appid,
      nonce: FIXED_OPTS.nonce,
      token: FIXED_OPTS.token,
    };
    const ref = generateToken(cdArray, sdObject, FIXED_OPTS.timestamp);

    assert.strictEqual(collect, ref);
  });

  it('output is a non-empty string', () => {
    const collect = generateCollect(profile, XTEA_A, FIXED_OPTS);
    assert.ok(typeof collect === 'string', 'should be a string');
    assert.ok(collect.length > 0, 'should be non-empty');
  });

  it('output contains URL-encoded characters', () => {
    const collect = generateCollect(profile, XTEA_A, FIXED_OPTS);
    assert.ok(collect.includes('%2B'), 'should contain %2B');
    assert.ok(collect.includes('%2F'), 'should contain %2F');
    assert.ok(collect.includes('%3D'), 'should contain %3D');
  });
});

// ============================================================================
// 8. collect-generator: different templates produce different tokens
// ============================================================================

describe('collect-generator: different templates produce different tokens', () => {
  it('Template A and B with same inputs produce different tokens', () => {
    const tokenA = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const tokenB = generateCollect(profile, XTEA_B, FIXED_OPTS);
    assert.notStrictEqual(tokenA, tokenB);
  });

  it('both produce non-empty strings of similar length', () => {
    const tokenA = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const tokenB = generateCollect(profile, XTEA_B, FIXED_OPTS);
    assert.ok(tokenA.length >= 4000, 'Template A token should be >= 4000 chars');
    assert.ok(tokenB.length >= 4000, 'Template B token should be >= 4000 chars');
    assert.ok(
      Math.abs(tokenA.length - tokenB.length) < 200,
      'tokens should be of similar length'
    );
  });
});

// ============================================================================
// 9. collect-generator: cdArrayOverride
// ============================================================================

describe('collect-generator: cdArrayOverride produces different output', () => {
  it('custom cdArrayOverride yields a different token than default', () => {
    const defaultToken = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const customCd = Array.from({ length: 59 }, (_, i) => 'override_' + i);
    const overrideToken = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: customCd,
    });
    assert.notStrictEqual(overrideToken, defaultToken,
      'override token should differ from default');
  });

  it('override token is a non-empty URL-encoded string', () => {
    const customCd = Array.from({ length: 59 }, (_, i) => 'val_' + i);
    const token = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: customCd,
    });
    assert.ok(typeof token === 'string', 'should be a string');
    assert.ok(token.length > 0, 'should be non-empty');
  });
});

describe('collect-generator: cdArrayOverride uses the provided array', () => {
  it('two different override arrays produce different tokens', () => {
    const cdA = Array.from({ length: 59 }, (_, i) => 'a_' + i);
    const cdB = Array.from({ length: 59 }, (_, i) => 'b_' + i);
    const tokenA = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: cdA,
    });
    const tokenB = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: cdB,
    });
    assert.notStrictEqual(tokenA, tokenB,
      'different override arrays should produce different tokens');
  });

  it('same override array produces identical token (deterministic)', () => {
    const customCd = Array.from({ length: 59 }, (_, i) => 'fixed_' + i);
    const opts = { ...FIXED_OPTS, cdArrayOverride: customCd };
    const token1 = generateCollect(profile, XTEA_A, opts);
    const token2 = generateCollect(profile, XTEA_A, opts);
    assert.strictEqual(token1, token2,
      'same override should produce identical tokens');
  });
});

describe('collect-generator: non-array cdArrayOverride is ignored', () => {
  it('cdArrayOverride: "not an array" falls back to default', () => {
    const defaultToken = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const token = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: 'not an array',
    });
    assert.strictEqual(token, defaultToken,
      'string cdArrayOverride should be ignored');
  });

  it('cdArrayOverride: null falls back to default', () => {
    const defaultToken = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const token = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: null,
    });
    assert.strictEqual(token, defaultToken,
      'null cdArrayOverride should be ignored');
  });

  it('cdArrayOverride: {} falls back to default', () => {
    const defaultToken = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const token = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: {},
    });
    assert.strictEqual(token, defaultToken,
      'object cdArrayOverride should be ignored');
  });

  it('cdArrayOverride: 42 falls back to default', () => {
    const defaultToken = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const token = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: 42,
    });
    assert.strictEqual(token, defaultToken,
      'number cdArrayOverride should be ignored');
  });
});

describe('collect-generator: cdArrayOverride skips reorderCdArray', () => {
  it('cdFieldOrder is ignored when cdArrayOverride is provided', () => {
    const customCd = Array.from({ length: 59 }, (_, i) => 'skip_reorder_' + i);
    const withoutFieldOrder = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: customCd,
    });
    const withFieldOrder = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdArrayOverride: customCd,
      cdFieldOrder: [58, 57, 56, 55, 54, 53, 52, 51, 50, 49],
    });
    assert.strictEqual(withFieldOrder, withoutFieldOrder,
      'cdFieldOrder should be ignored when cdArrayOverride is set');
  });

  it('cdFieldOrder without cdArrayOverride produces different token', () => {
    const defaultToken = generateCollect(profile, XTEA_A, FIXED_OPTS);
    const reorderedToken = generateCollect(profile, XTEA_A, {
      ...FIXED_OPTS,
      cdFieldOrder: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9,
        10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
        30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
        40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
        50, 51, 52, 53, 54, 55, 56, 57, 58],
    });
    assert.notStrictEqual(reorderedToken, defaultToken,
      'cdFieldOrder should change the token when cdArrayOverride is not set');
  });
});
