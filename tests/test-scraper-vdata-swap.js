'use strict';

// Phase 45.5 — tests for the scraper wiring swap shipped in 45.4.
//
// Scope: verify that `tools/scraper/scraper.js`
//   (a) accepts `legacyVdata` and `vdataProfile` constructor options and
//       records them on the instance,
//   (b) loads the bundled 8-field browser profile from
//       `profiles/vdata-browser-default.json` with the HAR-derived values,
//   (c) wires step-(m) of `solveCaptcha` to `buildVDataForPost` on the
//       default path and to `generateVData` on the legacy path, and
//   (d) both code paths produce a 152-char / ALPHABET / `YY`-tail vData
//       string whose decoded 8-field plaintext reflects the profile source
//       (browser default -> `cLod=loadTDC,inf=top,env=0`; legacy jsdom
//       harness -> `cLod=unloadTDC,inf=top,env=1`).
//
// The step-(m) branch is not exposed as its own method, so Groups C and D
// exercise the same library calls the branch makes, and Group E guards
// against accidental regression by asserting on the source text of
// `scraper.js` directly.
//
// Offline-only — Group D runs the jsdom harness in-process with the
// committed `sample/vm_slide.js` + `sample/slide-jy.js`, no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Scraper = require('../tools/scraper/scraper');
const { buildVDataForPost } = require('../tools/vdata-generator/for-post.js');
const { generateVData } = require('../tools/scraper/vdata-harness');
const { customBase64Decode } = require('../tools/vdata-generator/custom-base64.js');
const { xteaDecryptLE } = require('../tools/vdata-generator/xtea.js');
const { KEY_WORDS } = require('../tools/vdata-generator/encode.js');
const { PERM } = require('../tools/vdata-generator/build-plaintext.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRAPER_PATH = path.join(PROJECT_ROOT, 'tools', 'scraper', 'scraper.js');
const PROFILE_PATH = path.join(PROJECT_ROOT, 'profiles', 'vdata-browser-default.json');
const VM_SLIDE_PATH = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
const SLIDE_JQ_PATH = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');

// Phase 43 custom base64 alphabet; index 64 ('Y') is the padding char.
const ALPHABET = 'GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY';
const VDATA_LENGTH = 152;

// fn 13989 padding alphabet — last-byte value maps directly to padLen.
const PAD_ALPHABET = '0abcdefghijklmnop';

// Inverse of the ShiftRows-style 16-byte permutation used by
// `tools/vdata-generator/build-plaintext.js`. invPERM[PERM[k]] = k.
const INV_PERM = new Array(16);
for (let i = 0; i < 16; i += 1) {
  INV_PERM[PERM[i]] = i;
}

/**
 * Decode a 152-char vData back to its 8-field plaintext object by inverting
 * the Phase 43 + 44 pipeline (custom base64 -> XTEA decrypt -> inverse
 * permute -> strip PKCS#7-style pad -> parse kv).
 */
function decodeVData(vdata) {
  const ct = customBase64Decode(vdata);
  const permuted = xteaDecryptLE(ct, KEY_WORDS);
  let joined = '';
  for (let i = 0; i < permuted.length; i += 16) {
    for (let k = 0; k < 16; k += 1) {
      joined += String.fromCharCode(permuted[i + INV_PERM[k]]);
    }
  }
  const lastCh = joined[joined.length - 1];
  const padLen = PAD_ALPHABET.indexOf(lastCh);
  if (padLen > 0 && padLen <= 16) {
    joined = joined.slice(0, joined.length - padLen);
  }
  const obj = {};
  for (const part of joined.split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    obj[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return obj;
}

function assertVDataShape(vdata, label) {
  assert.equal(typeof vdata, 'string', label + ': vData must be a string');
  assert.equal(vdata.length, VDATA_LENGTH, label + ': vData must be 152 chars');
  assert.equal(vdata.slice(-2), 'YY', label + ': vData must end with YY');
  for (const ch of vdata) {
    assert.ok(ALPHABET.indexOf(ch) !== -1, label + ': char "' + ch + '" not in alphabet');
  }
}

function buildSyntheticBody() {
  // Shape mirrors a real verify POST body: aid/sess/collect/tlg/sid plus a
  // handful of flat string fields. tlg must match collect.length — the
  // key-field digest at pc 22730 reads tlg and indexes into the body, so
  // tlg=1200 + collect="x"*1200 produces a stable, body-valid input.
  const collect = 'x'.repeat(1200);
  const fields = {
    aid: '2046626881',
    sess: 'abcdefghijklmnop0123456789',
    collect: collect,
    tlg: String(collect.length),
    sid: 'test_sid',
    ans: '478,30;',
    nonce: 'n123',
  };
  const params = new URLSearchParams();
  for (const name of Object.keys(fields)) {
    params.append(name, fields[name]);
  }
  return { fields, body: params.toString() };
}

test('Group A: Scraper instance wiring — constructor options', async (t) => {
  await t.test('default legacyVdata is false', () => {
    const s = new Scraper();
    assert.equal(s.legacyVdata, false);
  });

  await t.test('default vdataProfilePath points at profiles/vdata-browser-default.json', () => {
    const s = new Scraper();
    assert.equal(typeof s.vdataProfilePath, 'string');
    assert.equal(path.resolve(s.vdataProfilePath), PROFILE_PATH);
  });

  await t.test('_vdataProfile is null before init()', () => {
    const s = new Scraper();
    assert.equal(s._vdataProfile, null);
  });

  await t.test('legacyVdata: true is recorded on the instance', () => {
    const s = new Scraper({ legacyVdata: true });
    assert.equal(s.legacyVdata, true);
  });

  await t.test('legacyVdata: false is recorded on the instance', () => {
    const s = new Scraper({ legacyVdata: false });
    assert.equal(s.legacyVdata, false);
  });

  await t.test('vdataProfile override path is recorded on the instance', () => {
    const customPath = '/tmp/custom-vdata-profile.json';
    const s = new Scraper({ vdataProfile: customPath });
    assert.equal(s.vdataProfilePath, customPath);
  });

  await t.test('Scraper constructor coerces truthy legacyVdata values to boolean', () => {
    const s = new Scraper({ legacyVdata: 1 });
    assert.equal(s.legacyVdata, true);
  });
});

test('Group B: bundled vData browser profile contents', async (t) => {
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));

  await t.test('profile is an object with the 8 expected keys', () => {
    assert.equal(typeof profile, 'object');
    assert.notEqual(profile, null);
    const expected = ['tp', 'key', 'py', 'env', 'version', 'cLod', 'inf', 'ss'];
    const actual = Object.keys(profile).sort();
    assert.deepEqual(actual, expected.slice().sort());
  });

  await t.test('tp is the HAR-derived performance.now() value', () => {
    assert.equal(profile.tp, '7446039806946242560');
  });

  await t.test('cLod is loadTDC (browser branch, vs jsdom unloadTDC)', () => {
    assert.equal(profile.cLod, 'loadTDC');
  });

  await t.test('inf is top (top-level window, not iframe)', () => {
    assert.equal(profile.inf, 'top');
  });

  await t.test('env is "0" (browser branch, vs jsdom "1")', () => {
    assert.equal(profile.env, '0');
  });

  await t.test('version is the literal "2"', () => {
    assert.equal(profile.version, '2');
  });

  await t.test('py is "0"', () => {
    assert.equal(profile.py, '0');
  });

  await t.test('ss is url-encoded 11,tdc,slide,vm', () => {
    assert.equal(profile.ss, '11%2Ctdc%2Cslide%2Cvm');
  });

  await t.test('key is the __COMPUTED__ sentinel', () => {
    assert.equal(profile.key, '__COMPUTED__');
  });
});

test('Group C: default path library output (browser profile)', async (t) => {
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  const { body } = buildSyntheticBody();
  const vdata = buildVDataForPost(body, { profile });

  await t.test('vData shape: 152 chars / ALPHABET / YY tail', () => {
    assertVDataShape(vdata, 'default');
  });

  const decoded = decodeVData(vdata);

  await t.test('decoded plaintext has the 8 schema fields', () => {
    const keys = Object.keys(decoded).sort();
    assert.deepEqual(keys, ['cLod', 'env', 'inf', 'key', 'py', 'ss', 'tp', 'version']);
  });

  await t.test('decoded cLod === "loadTDC" (browser branch signature)', () => {
    assert.equal(decoded.cLod, 'loadTDC');
  });

  await t.test('decoded inf === "top" (top-level window)', () => {
    assert.equal(decoded.inf, 'top');
  });

  await t.test('decoded env === "0" (browser branch signature)', () => {
    assert.equal(decoded.env, '0');
  });

  await t.test('decoded tp === HAR-derived profile value', () => {
    assert.equal(decoded.tp, '7446039806946242560');
  });

  await t.test('decoded version === "2"', () => {
    assert.equal(decoded.version, '2');
  });

  await t.test('decoded key is NOT the __COMPUTED__ sentinel (computed per-body)', () => {
    assert.notEqual(decoded.key, '__COMPUTED__');
    assert.ok(typeof decoded.key === 'string' && decoded.key.length > 0);
  });
});

test('Group D: legacy path library output (jsdom harness)', async (t) => {
  const vmSlideSource = fs.readFileSync(VM_SLIDE_PATH, 'utf8');
  const jquerySource = fs.readFileSync(SLIDE_JQ_PATH, 'utf8');
  const { fields } = buildSyntheticBody();
  const userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

  const result = generateVData(fields, vmSlideSource, jquerySource, { userAgent });

  await t.test('generateVData returns { vData, serializedBody }', () => {
    assert.equal(typeof result, 'object');
    assert.equal(typeof result.vData, 'string');
    assert.equal(typeof result.serializedBody, 'string');
  });

  await t.test('vData shape: 152 chars / ALPHABET / YY tail', () => {
    assertVDataShape(result.vData, 'legacy');
  });

  await t.test('serializedBody is non-empty and contains the sess field', () => {
    assert.ok(result.serializedBody.length > 0);
    assert.ok(result.serializedBody.includes('sess=abcdefghijklmnop'));
  });

  const decoded = decodeVData(result.vData);

  await t.test('decoded plaintext has the 8 schema fields', () => {
    const keys = Object.keys(decoded).sort();
    assert.deepEqual(keys, ['cLod', 'env', 'inf', 'key', 'py', 'ss', 'tp', 'version']);
  });

  await t.test('decoded reflects the jsdom branch (at least one jsdom tell)', () => {
    // The jsdom harness runs in a JSDOM window whose isIE9Below() branch
    // behaves differently from a real browser. Phase 42/44 documented the
    // observable tells: cLod flips to "unloadTDC", inf flips to "top",
    // env flips to "1". Assert that at least one of those is present —
    // this is how we prove the legacy path did NOT accidentally use the
    // browser-default profile.
    const tells = [
      decoded.cLod === 'unloadTDC',
      decoded.inf === 'top',
      decoded.env === '1',
    ];
    assert.ok(
      tells.some(Boolean),
      'expected at least one jsdom tell (cLod=unloadTDC | inf=top | env=1), got ' +
        JSON.stringify(decoded)
    );
  });

  await t.test('decoded key is NOT the __COMPUTED__ sentinel', () => {
    assert.notEqual(decoded.key, '__COMPUTED__');
  });
});

test('Group E: source-level wiring invariants in scraper.js', async (t) => {
  const src = fs.readFileSync(SCRAPER_PATH, 'utf8');

  await t.test('imports buildVDataForPost from tools/vdata-generator/for-post', () => {
    assert.ok(
      /require\(['"][^'"]*vdata-generator\/for-post['"]\)/.test(src),
      'scraper.js should require tools/vdata-generator/for-post'
    );
    assert.ok(src.includes('buildVDataForPost'), 'scraper.js should reference buildVDataForPost');
  });

  await t.test('imports generateVData from vdata-harness', () => {
    assert.ok(
      /require\(['"]\.\/vdata-harness['"]\)/.test(src),
      'scraper.js should require ./vdata-harness'
    );
    assert.ok(src.includes('generateVData'), 'scraper.js should reference generateVData');
  });

  await t.test('declares DEFAULT_VDATA_PROFILE_PATH pointing at profiles/vdata-browser-default.json', () => {
    assert.ok(src.includes('DEFAULT_VDATA_PROFILE_PATH'));
    assert.ok(src.includes('vdata-browser-default.json'));
  });

  await t.test('has a loadProfile helper that reads JSON via fs', () => {
    assert.ok(/function loadProfile\s*\(/.test(src));
  });

  await t.test('constructor records legacyVdata and vdataProfilePath on `this`', () => {
    assert.ok(src.includes('this.legacyVdata'));
    assert.ok(src.includes('this.vdataProfilePath'));
    assert.ok(src.includes('this._vdataProfile'));
  });

  await t.test('init() calls loadProfile on the non-legacy branch', () => {
    assert.ok(
      /if\s*\(\s*!\s*this\.legacyVdata\s*\)/.test(src),
      'init() should gate profile load on !this.legacyVdata'
    );
    assert.ok(src.includes('loadProfile(this.vdataProfilePath)'));
  });

  await t.test('step-(m) has both the default and legacy call sites', () => {
    // Default branch: buildVDataForPost(<body>, { profile: this._vdataProfile })
    assert.ok(
      /buildVDataForPost\([^)]*this\._vdataProfile/.test(src),
      'scraper.js should call buildVDataForPost with profile: this._vdataProfile'
    );
    // Legacy branch: generateVData(postFields, vmSlideSource, this._jquerySource, ...)
    assert.ok(
      /generateVData\s*\(\s*postFields/.test(src),
      'scraper.js should call generateVData(postFields, ...) on the legacy path'
    );
  });

  await t.test('default path serializes the POST body via serializePostFields', () => {
    assert.ok(/function serializePostFields\s*\(/.test(src));
    assert.ok(/serializedBody\s*=\s*serializePostFields\s*\(\s*postFields/.test(src));
  });

  await t.test('step-(m) branches on this.legacyVdata', () => {
    assert.ok(/if\s*\(\s*this\.legacyVdata\s*\)/.test(src));
  });
});
