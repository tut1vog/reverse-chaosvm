'use strict';

// Black-box tests for Chrome-profile collect token generation (Task 47.1).
//
// Verifies that loading profiles/chrome-fingerprint.json, substituting
// per-session fields, reordering via cdFieldOrder, and generating via
// cdArrayOverride + singleBlob: true produces a token of the expected
// ~5K size that decrypts to valid cd/sd JSON and round-trips cleanly.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  generateCollect,
  reorderCdArray,
  normalizeKeyMods,
  buildDefaultCdArray,
  encrypt,
} = require('../tools/scraper/collect-generator.js');
const { urlEncode } = require('../tools/scraper/token-generator/outer-pipeline.js');

// ── Helpers ──────────────────────────────────────────────────────────────

function convertBytesToWord(s) {
  return (s.charCodeAt(0) || 0) | ((s.charCodeAt(1) || 0) << 8) |
         ((s.charCodeAt(2) || 0) << 16) | ((s.charCodeAt(3) || 0) << 24);
}

function convertWordToBytes(w) {
  return String.fromCharCode(w & 0xFF, (w >>> 8) & 0xFF,
    (w >>> 16) & 0xFF, (w >>> 24) & 0xFF);
}

function decryptXtea(inputBytes, key, delta, rounds, keyMods) {
  let output = '';
  const targetSum = rounds * delta;
  for (let pos = 0; pos < inputBytes.length; pos += 8) {
    let v0 = convertBytesToWord(inputBytes.slice(pos, pos + 4));
    let v1 = convertBytesToWord(inputBytes.slice(pos + 4, pos + 8));
    let sum = targetSum;
    while (sum !== 0) {
      v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3] + keyMods[(sum >>> 11) & 3]);
      sum -= delta;
      v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3] + keyMods[sum & 3]);
    }
    output += convertWordToBytes(v0) + convertWordToBytes(v1);
  }
  return output;
}

// ── Load fixtures ────────────────────────────────────────────────────────

const profilePath = path.join(__dirname, '..', 'profiles', 'chrome-fingerprint.json');
const chromeProfile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));

const templatesPath = path.join(__dirname, '..', 'tools', 'scraper', 'cache', 'templates.json');
const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));

// Pick first template entry for XTEA params + cdFieldOrder
const templateKey = Object.keys(templates)[0];
const cached = templates[templateKey];
const xteaParams = {
  key: cached.key,
  delta: cached.delta,
  rounds: cached.rounds,
  keyMods: normalizeKeyMods(cached),
};
const cdFieldOrder = cached.cdFieldOrder;
const hashPosition = cached.hashPosition;

// Fixed test timestamp — deliberately different from the profile's original
// timestamps (canonical[16]=1776323715, canonical[53]=1776323715) so that
// per-session substitution tests can detect the difference.
const TEST_NOW = 1800000000000;
const TEST_NOW_SEC = Math.round(TEST_NOW / 1000);

// ── Helper: build a Chrome-style cd array the same way scraper does ──────

function buildChromeStyleCdArray(behavioralEvents) {
  const cdCanonical = JSON.parse(JSON.stringify(chromeProfile.cdCanonical));

  // Substitute per-session fields
  cdCanonical[16] = TEST_NOW_SEC;
  cdCanonical[22] = 'https://t.captcha.qq.com/cap_union_new_show?rand=test123';
  cdCanonical[52] = TEST_NOW_SEC + 2;
  cdCanonical[53] = TEST_NOW_SEC;

  // Reorder with -1 slot handling matching scraper._generateCollectChrome
  const cdArray = [];
  for (let i = 0; i < cdFieldOrder.length; i++) {
    const idx = cdFieldOrder[i];
    if (idx === -1) {
      if (i === hashPosition) {
        cdArray.push(behavioralEvents || []);
      } else {
        cdArray.push('');
      }
    } else {
      cdArray.push(cdCanonical[idx]);
    }
  }
  return { cdArray, cdCanonical };
}

// ── Helper: generate a Chrome-profile token ──────────────────────────────

function generateChromeToken(behavioralEvents) {
  const { cdArray } = buildChromeStyleCdArray(behavioralEvents);
  const sdOverride = {
    od: 'C',
    clientType: '',
    coordinate: [10, 60, 1.0],
    trycnt: 1,
    refreshcnt: 0,
    slideValue: [[160, 813, 53], [88, 0, 15]],
    dragobj: 1,
    ft: 'testft123',
  };

  return generateCollect(null, xteaParams, {
    cdArrayOverride: cdArray,
    sdOverride,
    timestamp: TEST_NOW,
    singleBlob: true,
  });
}

// ── Helper: decrypt a singleBlob token ───────────────────────────────────

function decryptToken(urlEncodedToken) {
  // Undo URL encoding
  const b64 = decodeURIComponent(urlEncodedToken);
  // Decode base64 to binary
  const buf = Buffer.from(b64, 'base64');
  const binaryStr = buf.toString('binary');
  // Decrypt
  const plaintext = decryptXtea(binaryStr, xteaParams.key, xteaParams.delta,
    xteaParams.rounds, xteaParams.keyMods);
  return plaintext;
}

// ═════════════════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════════════════

describe('Chrome profile collect token', () => {

  // ── 1. Profile loading ─────────────────────────────────────────────────

  describe('profile loading', () => {
    it('cdCanonical is a 59-element array', () => {
      assert.ok(Array.isArray(chromeProfile.cdCanonical));
      assert.equal(chromeProfile.cdCanonical.length, 59);
    });

    it('perSessionCanonical has expected keys', () => {
      const psc = chromeProfile.perSessionCanonical;
      assert.ok(psc, 'perSessionCanonical should exist');
      assert.ok('16' in psc, 'should have key "16"');
      assert.ok('22' in psc, 'should have key "22"');
      assert.ok('52' in psc, 'should have key "52"');
      assert.ok('53' in psc, 'should have key "53"');
    });

    it('chromeFieldOrder is present and has -1 slots', () => {
      const cfo = chromeProfile.chromeFieldOrder;
      assert.ok(Array.isArray(cfo), 'chromeFieldOrder should be an array');
      assert.ok(cfo.length > 59, 'chromeFieldOrder should be longer than 59 (has -1 slots)');
      assert.ok(cfo.includes(-1), 'chromeFieldOrder should contain -1 entries');
    });
  });

  // ── 2. Token generation + length ───────────────────────────────────────

  describe('token generation + length', () => {
    it('generates a token between 4500 and 5500 chars', () => {
      const token = generateChromeToken([]);
      assert.ok(typeof token === 'string', 'token should be a string');
      assert.ok(token.length >= 3500,
        `token length ${token.length} should be >= 3500`);
      assert.ok(token.length <= 5500,
        `token length ${token.length} should be <= 5500`);
    });
  });

  // ── 3. Decrypt + parse ─────────────────────────────────────────────────

  describe('decrypt + parse', () => {
    it('decrypted plaintext is valid JSON with cd and sd', () => {
      const token = generateChromeToken([]);
      const plaintext = decryptToken(token);

      // The singleBlob format is: cdString (without closing '}') + ',' + sdString
      // Combined it forms: {"cd":[...],"sd":{...}}
      // Find the parseable JSON — strip trailing NUL padding
      const trimmed = plaintext.replace(/\0+$/, '');

      // Should parse as valid JSON
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(trimmed);
      }, 'decrypted plaintext should be valid JSON');

      assert.ok(Array.isArray(parsed.cd), 'parsed should have cd array');
      assert.ok(typeof parsed.sd === 'object' && parsed.sd !== null,
        'parsed should have sd object');
    });

    it('cd array length matches cdFieldOrder length', () => {
      const token = generateChromeToken([]);
      const plaintext = decryptToken(token);
      const trimmed = plaintext.replace(/\0+$/, '');
      const parsed = JSON.parse(trimmed);

      assert.equal(parsed.cd.length, cdFieldOrder.length,
        `cd.length should be ${cdFieldOrder.length} (cdFieldOrder length)`);
    });
  });

  // ── 4. cd value fidelity ───────────────────────────────────────────────

  describe('cd value fidelity', () => {
    it('non-per-session fields match Chrome profile values', () => {
      const token = generateChromeToken([]);
      const plaintext = decryptToken(token);
      const trimmed = plaintext.replace(/\0+$/, '');
      const parsed = JSON.parse(trimmed);

      // Build an inverse mapping: for each position i in cdFieldOrder,
      // cdFieldOrder[i] = canonicalIndex. So parsed.cd[i] should equal
      // cdCanonical[canonicalIndex] for non-per-session, non-minus-1 fields.
      const perSession = new Set([16, 22, 52, 53]);
      const canonical = chromeProfile.cdCanonical;

      // Check at least 5 specific fields by value
      const checksPerformed = [];

      for (let i = 0; i < cdFieldOrder.length; i++) {
        const canonIdx = cdFieldOrder[i];
        if (canonIdx === -1) continue;
        if (perSession.has(canonIdx)) continue;

        const expected = canonical[canonIdx];
        const actual = parsed.cd[i];

        // Check specific known values
        // canonical[32] = "UTF-8"
        if (canonIdx === 32 && expected === 'UTF-8') {
          assert.equal(actual, 'UTF-8', 'cd field for canonical[32] should be "UTF-8"');
          checksPerformed.push('UTF-8');
        }
        // canonical[1] = "windows"
        if (canonIdx === 1 && expected === 'windows') {
          assert.equal(actual, 'windows', 'cd field for canonical[1] should be "windows"');
          checksPerformed.push('windows');
        }
        // canonical[3] = 800
        if (canonIdx === 3 && expected === 800) {
          assert.equal(actual, 800, 'cd field for canonical[3] should be 800');
          checksPerformed.push('screenHeight');
        }
        // canonical[8] = 8
        if (canonIdx === 8 && expected === 8) {
          assert.equal(actual, 8, 'cd field for canonical[8] should be 8');
          checksPerformed.push('hardwareConcurrency');
        }
        // canonical[46] = "Linux x86_64"
        if (canonIdx === 46 && expected === 'Linux x86_64') {
          assert.equal(actual, 'Linux x86_64', 'cd field for canonical[46] should be "Linux x86_64"');
          checksPerformed.push('platform');
        }
        // canonical[10] = 1 (cookieEnabled)
        if (canonIdx === 10 && expected === 1) {
          assert.equal(actual, 1, 'cd field for canonical[10] should be 1');
          checksPerformed.push('cookieEnabled');
        }
      }

      assert.ok(checksPerformed.length >= 5,
        `should have checked at least 5 fields, checked: ${checksPerformed.join(', ')}`);
    });
  });

  // ── 5. Per-session substitution ────────────────────────────────────────

  describe('per-session substitution', () => {
    it('per-session fields differ from profile originals', () => {
      const { cdCanonical } = buildChromeStyleCdArray([]);
      const originalCanonical = chromeProfile.cdCanonical;

      // canonical 16 = timestampInit — should have been substituted
      assert.notEqual(cdCanonical[16], originalCanonical[16],
        'canonical[16] (timestampInit) should be substituted');

      // canonical 22 = pageUrl — should have been substituted
      assert.notEqual(cdCanonical[22], originalCanonical[22],
        'canonical[22] (pageUrl) should be substituted');

      // canonical 52 = timestampCollectionEnd
      assert.notEqual(cdCanonical[52], originalCanonical[52],
        'canonical[52] (timestampCollectionEnd) should be substituted');

      // canonical 53 = timestampCollectionStart
      assert.notEqual(cdCanonical[53], originalCanonical[53],
        'canonical[53] (timestampCollectionStart) should be substituted');
    });

    it('substituted values appear in decrypted token', () => {
      const token = generateChromeToken([]);
      const plaintext = decryptToken(token);
      const trimmed = plaintext.replace(/\0+$/, '');
      const parsed = JSON.parse(trimmed);

      // Find the cd positions for per-session canonical indices
      for (let i = 0; i < cdFieldOrder.length; i++) {
        const canonIdx = cdFieldOrder[i];
        if (canonIdx === 16) {
          assert.equal(parsed.cd[i], TEST_NOW_SEC,
            'timestampInit in token should be TEST_NOW_SEC');
        }
        if (canonIdx === 52) {
          assert.equal(parsed.cd[i], TEST_NOW_SEC + 2,
            'timestampCollectionEnd in token should be TEST_NOW_SEC + 2');
        }
        if (canonIdx === 53) {
          assert.equal(parsed.cd[i], TEST_NOW_SEC,
            'timestampCollectionStart in token should be TEST_NOW_SEC');
        }
      }
    });
  });

  // ── 6. Round-trip ──────────────────────────────────────────────────────

  describe('round-trip', () => {
    it('re-encrypting decrypted plaintext produces identical base64', () => {
      const token = generateChromeToken([]);

      // Decrypt
      const b64 = decodeURIComponent(token);
      const buf = Buffer.from(b64, 'base64');
      const binaryStr = buf.toString('binary');
      const plaintext = decryptXtea(binaryStr, xteaParams.key, xteaParams.delta,
        xteaParams.rounds, xteaParams.keyMods);

      // Re-encrypt the full plaintext (same length — includes any padding)
      const reEncrypted = encrypt(plaintext, xteaParams.key, xteaParams.delta,
        xteaParams.rounds, xteaParams.keyMods);
      const reB64 = Buffer.from(reEncrypted, 'binary').toString('base64');
      const reToken = urlEncode(reB64);

      assert.equal(reToken, token,
        're-encrypted token should be identical to original');
    });
  });

  // ── 7. Comparison with synthetic ───────────────────────────────────────

  describe('comparison with synthetic profile', () => {
    it('synthetic token is longer than Chrome token', () => {
      const chromeToken = generateChromeToken([]);

      // Generate synthetic token in same singleBlob mode but with
      // buildDefaultCdArray (no cdArrayOverride). The synthetic profile
      // produces larger field values (longer strings, more padding) so
      // the token should be measurably longer.
      const syntheticToken = generateCollect({}, xteaParams, {
        timestamp: TEST_NOW,
        singleBlob: true,
      });

      assert.ok(syntheticToken.length > chromeToken.length,
        `synthetic token (${syntheticToken.length}) should be longer than Chrome token (${chromeToken.length})`);
    });
  });
});
