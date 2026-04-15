'use strict';

// Phase 45.3 — black-box tests for `computeKeyField`, `lookupFormField`, and
// `buildVDataForPost` (the 45.2 entry points in tools/vdata-generator/).
//
// These tests are the byte-identity regression guard for the
// body-parser + key-digest + POST-body-driven vData pipeline. They are written
// against only the documented public API — no reach-through into internal
// helpers. Idiom matches tests/test-vdata-builder.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  lookupFormField,
  computeKeyField,
} = require('../tools/vdata-generator/build-key-field.js');
const {
  buildVDataForPost,
} = require('../tools/vdata-generator/for-post.js');
const {
  buildVDataFromObj,
} = require('../tools/vdata-generator/build-from-obj.js');

// Phase 43 constants — the 65-char custom base64 alphabet; index 64 ('Y') is
// the padding char. See docs/VDATA_FORMAT.md §3 and tests/test-vdata-builder.js.
const ALPHABET = 'GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY';
const VDATA_LENGTH = 152;

// §3 browser profile template from research/vm-slide-stack-vm/PHASE-45-FIELD-SOURCES.md
// — inlined (not stored as a fixture, per 45.3 spec). `key` slot is absent so
// `buildVDataForPost` computes it per-body.
const BROWSER_PROFILE = {
  tp: '7446039806946242560',
  py: '0',
  env: '0',
  version: '2',
  cLod: 'loadTDC',
  inf: 'iframe',
  ss: '11%2Ctdc%2Cslide%2Cvm',
};

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const HAR_FIXTURE_PATH = path.join(FIXTURES_DIR, 'vdata-har-capture.json');
const HAR_SAMPLE_PATH = path.join(__dirname, '..', 'sample', 'captcha-har.har');

// HAR fixture ground truth (8-field obj + explicit order) copied verbatim from
// tests/test-vdata-builder.js — the committed HAR fixture json stores the
// vData string but not the (obj, order) pair itself, so the README's "Replay
// mode" worked example is the documented oracle.
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

// ---- Helpers --------------------------------------------------------------

function loadHarVerifyBody() {
  const har = JSON.parse(fs.readFileSync(HAR_SAMPLE_PATH, 'utf8'));
  for (const entry of har.log.entries) {
    if (entry.request.url.indexOf('cap_union_new_verify') !== -1) {
      const text = (entry.request.postData && entry.request.postData.text) || '';
      // The `&vData=...` tail is appended by the XHR monkey-patch AFTER `key`
      // is computed, so strip it to reproduce what module 18 saw live.
      return text.replace(/&vData=[^&]*$/, '');
    }
  }
  throw new Error('cap_union_new_verify entry not found in HAR');
}

function assertValidVDataShape(s, label) {
  const tag = label ? ` (${label})` : '';
  assert.equal(typeof s, 'string', `vData should be a string${tag}`);
  assert.equal(s.length, VDATA_LENGTH, `vData length should be 152${tag}`);
  assert.equal(s.slice(-2), 'YY', `vData should end in 'YY'${tag}`);
  for (let i = 0; i < s.length; i += 1) {
    assert.ok(
      ALPHABET.includes(s[i]),
      `vData char at ${i} ('${s[i]}') not in Phase 43 alphabet${tag}`
    );
  }
}

// ---- Group A — lookupFormField unit ---------------------------------------

test('Group A — lookupFormField unit', async (t) => {
  await t.test('A1: empty body returns empty string', () => {
    assert.equal(lookupFormField('', 'foo'), '');
  });

  await t.test('A2: empty tag returns empty string', () => {
    assert.equal(lookupFormField('foo=bar', ''), '');
  });

  await t.test('A3: single field head match', () => {
    assert.equal(lookupFormField('foo=bar', 'foo'), 'bar');
  });

  await t.test('A4: middle field between two others', () => {
    assert.equal(lookupFormField('a=1&foo=bar&b=2', 'foo'), 'bar');
  });

  await t.test('A5: missing tag returns empty string', () => {
    assert.equal(lookupFormField('a=1&b=2', 'foo'), '');
  });

  await t.test('A6: prefix-substring collision — `foo` does not match `foobar`', () => {
    assert.equal(lookupFormField('foobar=x&foo=y', 'foo'), 'y');
  });

  await t.test('A7: value containing `=` is preserved verbatim', () => {
    assert.equal(lookupFormField('a=b=c&d=e', 'a'), 'b=c');
  });

  await t.test('A8: tag at body tail without trailing ampersand', () => {
    assert.equal(lookupFormField('a=1&b=hello', 'b'), 'hello');
  });

  await t.test('A9: URL-encoded value preserved (no decoding)', () => {
    assert.equal(lookupFormField('tag=a%26b', 'tag'), 'a%26b');
  });
});

// ---- Group B — computeKeyField HAR oracle ---------------------------------

test('Group B — computeKeyField HAR oracle (load-bearing)', async (t) => {
  await t.test('B1: HAR verify POST body → key === "21L2"', () => {
    const body = loadHarVerifyBody();
    assert.equal(computeKeyField(body), '21L2');
  });
});

// ---- Group C — computeKeyField synthetic minimum --------------------------

test('Group C — computeKeyField synthetic minimum', async (t) => {
  await t.test('C1: minimal body with just tlg + sess → "21L2"', () => {
    const body = 'tlg=8128&sess=s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79s';
    assert.equal(computeKeyField(body), '21L2');
  });
});

// ---- Group D — computeKeyField edge cases ---------------------------------

test('Group D — computeKeyField edge cases', async (t) => {
  await t.test('D1: empty body → empty string', () => {
    assert.equal(computeKeyField(''), '');
  });

  await t.test('D2: only `tlg=` (empty value) → empty string', () => {
    assert.equal(computeKeyField('tlg='), '');
  });

  await t.test('D3: only sess, no tlg → empty string', () => {
    assert.equal(computeKeyField('sess=abcdefghijklmn'), '');
  });

  await t.test('D4: ie9Fallback=true on synthetic sess body → "ecdk"', () => {
    // digits = [4,2,3,10]; charset = 'abcdefghijklmn'
    // → 'e','c','d','k' → 'ecdk'
    assert.equal(
      computeKeyField('sess=abcdefghijklmn', { ie9Fallback: true }),
      'ecdk'
    );
  });

  await t.test('D5: ie9Fallback=true on empty body → "ecdk"', () => {
    // sess missing → charset defaults to 'abcdefghijklmn'; digits are
    // the hardcoded fallback [4,2,3,10].
    assert.equal(computeKeyField('', { ie9Fallback: true }), 'ecdk');
  });
});

// ---- Group E — buildVDataForPost shape ------------------------------------

test('Group E — buildVDataForPost shape (nondeterministic)', async (t) => {
  const body = 'tlg=8128&sess=s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79s';

  await t.test('E1: first call returns a valid 152-char vData', () => {
    const out = buildVDataForPost(body, { profile: BROWSER_PROFILE });
    assertValidVDataShape(out, 'shape call 1');
  });

  await t.test('E2: second call returns a valid 152-char vData', () => {
    const out = buildVDataForPost(body, { profile: BROWSER_PROFILE });
    assertValidVDataShape(out, 'shape call 2');
  });
});

// ---- Group F — buildVDataForPost HAR byte-identity ------------------------

test('Group F — buildVDataForPost HAR byte-identity (end-to-end)', async (t) => {
  await t.test('F1: HAR body + HAR profile + HAR order → fixture vdata', () => {
    const fixture = JSON.parse(fs.readFileSync(HAR_FIXTURE_PATH, 'utf8'));
    const harVdata = fixture.har_vdata_string;
    assert.equal(typeof harVdata, 'string');
    assert.equal(harVdata.length, VDATA_LENGTH);

    const body = loadHarVerifyBody();

    // Build a profile from the HAR_OBJ oracle, stripping `key` so
    // buildVDataForPost computes it per-body from `body` itself.
    const profile = Object.assign({}, HAR_OBJ);
    delete profile.key;

    const out = buildVDataForPost(body, { profile, order: HAR_ORDER });

    // Debug harness: if this ever fails, check in order:
    //   (a) computeKeyField(body) vs HAR_OBJ.key   — Group B covers this
    //   (b) buildVDataFromObj({obj:HAR_OBJ, order:HAR_ORDER}) vs harVdata
    //   (c) Phase 43 cipher drift (test-vdata-builder.js covers this)
    if (out !== harVdata) {
      const computedKey = computeKeyField(body);
      const builderDirect = buildVDataFromObj({ obj: HAR_OBJ, order: HAR_ORDER });
      // eslint-disable-next-line no-console
      console.error('F1 divergence:', {
        computedKey,
        expectedKey: HAR_OBJ.key,
        builderDirectMatches: builderDirect === harVdata,
        outFirst20: out.slice(0, 20),
        expectFirst20: harVdata.slice(0, 20),
      });
    }

    assert.equal(out, harVdata);
  });
});

// ---- Group G — buildVDataForPost input validation -------------------------

test('Group G — buildVDataForPost input validation', async (t) => {
  const goodBody = 'tlg=8128&sess=s1LCqg-Z2OZiIDOktcwDJ4mtzyDd91soncHQX79s';

  await t.test('G1a: null body throws', () => {
    assert.throws(() => buildVDataForPost(null, { profile: BROWSER_PROFILE }));
  });

  await t.test('G1b: undefined body throws', () => {
    assert.throws(() => buildVDataForPost(undefined, { profile: BROWSER_PROFILE }));
  });

  await t.test('G1c: numeric body throws', () => {
    assert.throws(() => buildVDataForPost(42, { profile: BROWSER_PROFILE }));
  });

  await t.test('G1d: object body throws', () => {
    assert.throws(() => buildVDataForPost({}, { profile: BROWSER_PROFILE }));
  });

  await t.test('G1e: array body throws', () => {
    assert.throws(() => buildVDataForPost([], { profile: BROWSER_PROFILE }));
  });

  await t.test('G2: empty-string body throws', () => {
    assert.throws(() => buildVDataForPost('', { profile: BROWSER_PROFILE }));
  });

  await t.test('G3: profile.key set to non-sentinel throws', () => {
    const profile = Object.assign({}, BROWSER_PROFILE, { key: '21L2' });
    assert.throws(() => buildVDataForPost(goodBody, { profile }));
  });

  await t.test('G4: profile.key === "__COMPUTED__" is allowed', () => {
    const profile = Object.assign({}, BROWSER_PROFILE, { key: '__COMPUTED__' });
    const out = buildVDataForPost(goodBody, { profile });
    assertValidVDataShape(out, 'sentinel key');
  });

  await t.test('G5: profile.key absent is allowed', () => {
    const out = buildVDataForPost(goodBody, { profile: BROWSER_PROFILE });
    assertValidVDataShape(out, 'absent key');
  });

  await t.test('G6a: overrides.key throws when profile.key absent', () => {
    assert.throws(() =>
      buildVDataForPost(goodBody, {
        profile: BROWSER_PROFILE,
        overrides: { key: 'x' },
      })
    );
  });

  await t.test('G6b: overrides.key throws when profile.key is sentinel', () => {
    const profile = Object.assign({}, BROWSER_PROFILE, { key: '__COMPUTED__' });
    assert.throws(() =>
      buildVDataForPost(goodBody, { profile, overrides: { key: 'x' } })
    );
  });
});
