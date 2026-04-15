'use strict';

// Black-box tests for the vdata-generator builders:
//   - tools/vdata-generator/replay.js       (Phase 44.5a: buildVData)
//   - tools/vdata-generator/build-from-obj.js (Phase 44.5b: buildVDataFromObj)
//
// These tests lock down the builders' observable behavior using only the
// documented public API (see tools/vdata-generator/README.md). They intentionally
// do not reach into build-plaintext.js, encode.js, xtea.js, or custom-base64.js.
//
// Note: the committed fixtures (tests/fixtures/vdata-*-capture.json) record the
// pinned vdata_string / plaintext_hex / ciphertext for each capture but do NOT
// store the pre-cipher {obj, order} pair. The obj/order values below are
// copied verbatim from the README's "Replay mode" worked examples, which are
// the documented oracle for those fixtures.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildVData } = require('../tools/vdata-generator/replay.js');
const { buildVDataFromObj } = require('../tools/vdata-generator/build-from-obj.js');

// ---- Constants from docs/VDATA_FORMAT.md / README.md ----------------------

const PHASE_43_ALPHABET = 'GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY';
const VDATA_LENGTH = 152;

// ---- Fixture loading ------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const jsdomFixturePath = path.join(FIXTURES_DIR, 'vdata-jsdom-capture.json');
const harFixturePath = path.join(FIXTURES_DIR, 'vdata-har-capture.json');

const jsdomFixture = JSON.parse(fs.readFileSync(jsdomFixturePath, 'utf8'));
const harFixture = JSON.parse(fs.readFileSync(harFixturePath, 'utf8'));

// The jsdom fixture stores its vData under `vdata_string`; the HAR fixture
// stores it under `har_vdata_string`. Names intentionally verbatim from disk.
const JSDOM_VDATA = jsdomFixture.vdata_string;
const HAR_VDATA = harFixture.har_vdata_string;

// Per-fixture (obj, order) pairs — copied verbatim from README.md "Replay mode".
const JSDOM_OBJ = {
  inf: 'top',
  env: '1',
  tp: "Cannot read properties of null (reading 'src')",
  key: 'qLCZ',
  py: '0',
  ss: '0%2C',
  cLod: 'unloadTDC',
  version: '2',
};
const JSDOM_ORDER = ['inf', 'env', 'tp', 'key', 'py', 'ss', 'cLod', 'version'];

const HAR_OBJ = {
  inf: 'iframe',
  env: '0',
  tp: '7446039806946242560',
  cLod: 'loadTDC',
  version: '2',
  key: '21L2',
  ss: '11%2Ctdc%2Cslide%2Cvm',
  py: '0',
};
const HAR_ORDER = ['inf', 'env', 'tp', 'cLod', 'version', 'key', 'ss', 'py'];

// Seeded-PRNG working seeds (Node 20 / V8 TimSort only — see README §Seeded).
const HAR_SEED = 53818;
const JSDOM_SEED = 84121;

// ---- Shape helper ---------------------------------------------------------

function assertValidVData(s, label) {
  const tag = label ? ` (${label})` : '';
  assert.equal(typeof s, 'string', `vData should be a string${tag}`);
  assert.equal(s.length, VDATA_LENGTH, `vData length should be 152${tag}`);
  assert.ok(s.endsWith('YY'), `vData should end in 'YY'${tag}`);
  for (let i = 0; i < s.length; i += 1) {
    assert.ok(
      PHASE_43_ALPHABET.includes(s[i]),
      `vData char at ${i} ('${s[i]}') not in Phase 43 alphabet${tag}`
    );
  }
}

// ---- A. 44.5a replay — byte-identical fixture round-trip ------------------

describe('buildVData (replay) — fixture round-trip', () => {
  it('jsdom fixture: {obj, order} reproduces vdata_string byte-identically', () => {
    const out = buildVData({ obj: JSDOM_OBJ, order: JSDOM_ORDER });
    assert.equal(out, JSDOM_VDATA);
    assertValidVData(out, 'jsdom');
  });

  it('HAR fixture: {obj, order} reproduces har_vdata_string byte-identically', () => {
    const out = buildVData({ obj: HAR_OBJ, order: HAR_ORDER });
    assert.equal(out, HAR_VDATA);
    assertValidVData(out, 'HAR');
  });

  it('empty overrides is a no-op (jsdom)', () => {
    const baseline = buildVData({ obj: JSDOM_OBJ, order: JSDOM_ORDER });
    const withEmpty = buildVData({ obj: JSDOM_OBJ, order: JSDOM_ORDER, overrides: {} });
    assert.equal(withEmpty, baseline);
  });

  it('empty overrides is a no-op (HAR)', () => {
    const baseline = buildVData({ obj: HAR_OBJ, order: HAR_ORDER });
    const withEmpty = buildVData({ obj: HAR_OBJ, order: HAR_ORDER, overrides: {} });
    assert.equal(withEmpty, baseline);
  });

  // Substitution values are length-matched to the originals so the joined
  // plaintext stays within the 112-byte budget that the Phase 43 cipher requires.
  // (Captured `key` is 4 chars in both fixtures.)
  it('non-empty overrides produces a different valid 152-char vData (jsdom)', () => {
    const baseline = buildVData({ obj: JSDOM_OBJ, order: JSDOM_ORDER });
    const substituted = buildVData({
      obj: JSDOM_OBJ,
      order: JSDOM_ORDER,
      overrides: { key: 'ZZZZ' },
    });
    assertValidVData(substituted, 'jsdom + override');
    assert.notEqual(substituted, baseline, 'override should change the output');
    assert.notEqual(substituted, JSDOM_VDATA);
  });

  it('non-empty overrides produces a different valid 152-char vData (HAR)', () => {
    const baseline = buildVData({ obj: HAR_OBJ, order: HAR_ORDER });
    const substituted = buildVData({
      obj: HAR_OBJ,
      order: HAR_ORDER,
      overrides: { key: 'ZZZZ' },
    });
    assertValidVData(substituted, 'HAR + override');
    assert.notEqual(substituted, baseline);
    assert.notEqual(substituted, HAR_VDATA);
  });
});

// ---- B. 44.5b from-obj — `order` override path (deterministic) ------------

describe('buildVDataFromObj — explicit order override', () => {
  it('jsdom fixture: {obj, order} reproduces vdata_string byte-identically', () => {
    const out = buildVDataFromObj({ obj: JSDOM_OBJ, order: JSDOM_ORDER });
    assert.equal(out, JSDOM_VDATA);
    assertValidVData(out, 'jsdom order-override');
  });

  it('HAR fixture: {obj, order} reproduces har_vdata_string byte-identically', () => {
    const out = buildVDataFromObj({ obj: HAR_OBJ, order: HAR_ORDER });
    assert.equal(out, HAR_VDATA);
    assertValidVData(out, 'HAR order-override');
  });
});

describe('buildVDataFromObj — default (Math.random) path shape', () => {
  it('jsdom obj with no order/seed: 5 calls all return valid 152-char vData', () => {
    for (let i = 0; i < 5; i += 1) {
      const out = buildVDataFromObj({ obj: JSDOM_OBJ });
      assertValidVData(out, `jsdom default call ${i}`);
    }
  });

  it('HAR obj with no order/seed: 5 calls all return valid 152-char vData', () => {
    for (let i = 0; i < 5; i += 1) {
      const out = buildVDataFromObj({ obj: HAR_OBJ });
      assertValidVData(out, `HAR default call ${i}`);
    }
  });
});

// ---- C. 44.5b from-obj — seeded-PRNG path (Node 20 only) -----------------

describe('buildVDataFromObj — seeded-PRNG path (Node 20 TimSort)', () => {
  const isNode20 = process.versions.node.startsWith('20.');

  it('jsdom fixture: seed=84121 reproduces vdata_string', (t) => {
    if (!isNode20) {
      t.skip('seeded-PRNG paths are Node 20 TimSort specific');
      return;
    }
    const out = buildVDataFromObj({ obj: JSDOM_OBJ, seed: JSDOM_SEED });
    assert.equal(out, JSDOM_VDATA);
    assertValidVData(out, 'jsdom seeded');
  });

  it('HAR fixture: seed=53818 reproduces har_vdata_string', (t) => {
    if (!isNode20) {
      t.skip('seeded-PRNG paths are Node 20 TimSort specific');
      return;
    }
    const out = buildVDataFromObj({ obj: HAR_OBJ, seed: HAR_SEED });
    assert.equal(out, HAR_VDATA);
    assertValidVData(out, 'HAR seeded');
  });
});

// ---- E. Fixture integrity canary ------------------------------------------

describe('vdata fixtures — integrity canary', () => {
  it('jsdom fixture file exists and has expected top-level fields', () => {
    assert.ok(fs.existsSync(jsdomFixturePath), 'jsdom fixture file missing');
    assert.equal(typeof jsdomFixture.vdata_string, 'string');
    assert.equal(jsdomFixture.vdata_length, VDATA_LENGTH);
    assert.equal(jsdomFixture.vdata_string.length, VDATA_LENGTH);
    assert.equal(typeof jsdomFixture.xtea_key_hex, 'string');
    assert.equal(typeof jsdomFixture.output_alphabet, 'string');
    assert.equal(jsdomFixture.output_alphabet, PHASE_43_ALPHABET);
    assert.equal(jsdomFixture.padding_char_index, 64);
  });

  it('HAR fixture file exists and has expected top-level fields', () => {
    assert.ok(fs.existsSync(harFixturePath), 'HAR fixture file missing');
    assert.equal(typeof harFixture.har_vdata_string, 'string');
    assert.equal(harFixture.har_vdata_length, VDATA_LENGTH);
    assert.equal(harFixture.har_vdata_string.length, VDATA_LENGTH);
    assert.equal(typeof harFixture.xtea_key_hex, 'string');
    assert.equal(harFixture.output_alphabet, PHASE_43_ALPHABET);
    assert.equal(harFixture.padding_char_index, 64);
  });
});
