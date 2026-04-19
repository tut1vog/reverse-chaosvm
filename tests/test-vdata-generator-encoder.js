'use strict';

// Phase 43 task 43.4 — tests for tools/scraper/vdata-generator/ encoder.
//
// Exercises xtea.js, custom-base64.js, and encode.js as a consumer.
// Asserts byte-identical output against the two committed fixtures
// (jsdom + HAR) and against the standalone reference verifier
// tests/fixtures/verify-vdata-fixtures.js.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  XTEA_DELTA,
  XTEA_ROUNDS,
  xteaEncryptBlock,
  xteaDecryptBlock,
  xteaEncryptLE,
  xteaDecryptLE,
  keyFromHex,
} = require('../tools/scraper/vdata-generator/xtea.js');

const {
  OUTPUT_ALPHABET: B64_ALPHABET,
  PADDING_CHAR_INDEX,
  PADDING_CHAR,
  customBase64Encode,
  customBase64Decode,
} = require('../tools/scraper/vdata-generator/custom-base64.js');

const {
  XTEA_KEY_HEX,
  KEY_WORDS,
  OUTPUT_ALPHABET,
  PLAINTEXT_LENGTH,
  EXPECTED_VDATA_LENGTH,
  encodeVData,
  encryptOnly,
} = require('../tools/scraper/vdata-generator/encode.js');

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const JSDOM_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'vdata-jsdom-capture.json'), 'utf8')
);
const HAR_FIXTURE = JSON.parse(
  fs.readFileSync(path.join(FIXTURES_DIR, 'vdata-har-capture.json'), 'utf8')
);

// -----------------------------------------------------------------
// (a) Fixture round-trip suite
// -----------------------------------------------------------------

describe('encoder fixture round-trip: jsdom', () => {
  const plaintextHex = JSDOM_FIXTURE.plaintext_hex;
  const ciphertextHex = JSDOM_FIXTURE.ciphertext_hex;
  const expectedVdata = JSDOM_FIXTURE.vdata_string;
  const plaintextBuf = Buffer.from(plaintextHex, 'hex');

  it('encodeVData(buffer) === expected vdata string', () => {
    assert.equal(encodeVData(plaintextBuf), expectedVdata);
  });

  it('encodeVData(hex string) === expected vdata string', () => {
    assert.equal(encodeVData(plaintextHex), expectedVdata);
  });

  it('encryptOnly(buffer).hex === stored ciphertext_hex', () => {
    assert.equal(encryptOnly(plaintextBuf).toString('hex'), ciphertextHex);
  });

  it('customBase64Decode(vdata).hex === stored ciphertext_hex', () => {
    assert.equal(customBase64Decode(expectedVdata).toString('hex'), ciphertextHex);
  });

  it('xteaDecryptLE(ciphertext).hex === stored plaintext_hex', () => {
    const cipherBuf = Buffer.from(ciphertextHex, 'hex');
    const key = keyFromHex(XTEA_KEY_HEX);
    assert.equal(xteaDecryptLE(cipherBuf, key).toString('hex'), plaintextHex);
  });

  it('fixture alphabet/padding match encoder constants', () => {
    assert.equal(JSDOM_FIXTURE.output_alphabet, OUTPUT_ALPHABET);
    assert.equal(JSDOM_FIXTURE.padding_char_index, PADDING_CHAR_INDEX);
    assert.equal(JSDOM_FIXTURE.xtea_key_hex, XTEA_KEY_HEX);
  });
});

describe('encoder fixture round-trip: HAR', () => {
  const plaintextHex = HAR_FIXTURE.har_decrypted_plaintext_hex;
  const ciphertextHex = HAR_FIXTURE.har_ciphertext_hex;
  const expectedVdata = HAR_FIXTURE.har_vdata_string;
  const plaintextBuf = Buffer.from(plaintextHex, 'hex');

  it('encodeVData(buffer) === expected vdata string', () => {
    assert.equal(encodeVData(plaintextBuf), expectedVdata);
  });

  it('encodeVData(hex string) === expected vdata string', () => {
    assert.equal(encodeVData(plaintextHex), expectedVdata);
  });

  it('encryptOnly(buffer).hex === stored har_ciphertext_hex', () => {
    assert.equal(encryptOnly(plaintextBuf).toString('hex'), ciphertextHex);
  });

  it('customBase64Decode(har_vdata).hex === stored har_ciphertext_hex', () => {
    assert.equal(customBase64Decode(expectedVdata).toString('hex'), ciphertextHex);
  });

  it('xteaDecryptLE(ciphertext).hex === stored har_decrypted_plaintext_hex', () => {
    const cipherBuf = Buffer.from(ciphertextHex, 'hex');
    const key = keyFromHex(XTEA_KEY_HEX);
    assert.equal(xteaDecryptLE(cipherBuf, key).toString('hex'), plaintextHex);
  });

  it('fixture alphabet/padding match encoder constants', () => {
    assert.equal(HAR_FIXTURE.output_alphabet, OUTPUT_ALPHABET);
    assert.equal(HAR_FIXTURE.padding_char_index, PADDING_CHAR_INDEX);
    assert.equal(HAR_FIXTURE.xtea_key_hex, XTEA_KEY_HEX);
  });
});

// -----------------------------------------------------------------
// (b) xtea.js unit tests
// -----------------------------------------------------------------

describe('xtea: constants', () => {
  it('XTEA_DELTA === 0x9E3779B9', () => {
    assert.equal(XTEA_DELTA, 0x9e3779b9);
  });

  it('XTEA_ROUNDS === 32', () => {
    assert.equal(XTEA_ROUNDS, 32);
  });
});

describe('xtea: block round-trip', () => {
  const key = keyFromHex(XTEA_KEY_HEX);

  it('round-trips [0, 0]', () => {
    const [c0, c1] = xteaEncryptBlock(0, 0, key);
    const [d0, d1] = xteaDecryptBlock(c0, c1, key);
    assert.equal(d0, 0);
    assert.equal(d1, 0);
  });

  it('round-trips [0xffffffff, 0xffffffff]', () => {
    const [c0, c1] = xteaEncryptBlock(0xffffffff, 0xffffffff, key);
    const [d0, d1] = xteaDecryptBlock(c0, c1, key);
    assert.equal(d0, 0xffffffff);
    assert.equal(d1, 0xffffffff);
  });

  it('round-trips [0xdeadbeef, 0xcafebabe]', () => {
    const [c0, c1] = xteaEncryptBlock(0xdeadbeef, 0xcafebabe, key);
    const [d0, d1] = xteaDecryptBlock(c0, c1, key);
    assert.equal(d0, 0xdeadbeef);
    assert.equal(d1, 0xcafebabe);
  });
});

describe('xtea: buffer round-trip', () => {
  it('round-trips a 24-byte multi-block buffer', () => {
    const key = keyFromHex(XTEA_KEY_HEX);
    const plaintext = Buffer.alloc(24);
    for (let i = 0; i < 24; i++) plaintext[i] = (i * 37 + 11) & 0xff;
    const ct = xteaEncryptLE(plaintext, key);
    assert.equal(ct.length, 24);
    const pt = xteaDecryptLE(ct, key);
    assert.ok(pt.equals(plaintext));
  });

  it('round-trips a 112-byte buffer (matches PLAINTEXT_LENGTH)', () => {
    const key = keyFromHex(XTEA_KEY_HEX);
    const plaintext = Buffer.alloc(112);
    for (let i = 0; i < 112; i++) plaintext[i] = (i * 13 + 7) & 0xff;
    const ct = xteaEncryptLE(plaintext, key);
    const pt = xteaDecryptLE(ct, key);
    assert.ok(pt.equals(plaintext));
  });
});

describe('xtea: error handling', () => {
  const key = keyFromHex(XTEA_KEY_HEX);

  it('xteaEncryptLE rejects non-multiple-of-8 input', () => {
    assert.throws(() => xteaEncryptLE(Buffer.alloc(7), key), /multiple of 8/);
  });

  it('xteaDecryptLE rejects non-multiple-of-8 input', () => {
    assert.throws(() => xteaDecryptLE(Buffer.alloc(15), key), /multiple of 8/);
  });

  it('xteaEncryptLE rejects non-Buffer input', () => {
    assert.throws(() => xteaEncryptLE('not a buffer', key), TypeError);
  });

  it('xteaDecryptLE rejects non-Buffer input', () => {
    assert.throws(() => xteaDecryptLE([1, 2, 3], key), TypeError);
  });

  it('keyFromHex rejects 8-byte hex', () => {
    assert.throws(() => keyFromHex('deadbeefcafebabe'), /16 bytes/);
  });

  it('keyFromHex rejects 32-byte hex', () => {
    assert.throws(() => keyFromHex('00'.repeat(32)), /16 bytes/);
  });
});

// -----------------------------------------------------------------
// (c) custom-base64.js unit tests
// -----------------------------------------------------------------

describe('custom-base64: constants', () => {
  it('OUTPUT_ALPHABET length === 65', () => {
    assert.equal(B64_ALPHABET.length, 65);
  });

  it('PADDING_CHAR_INDEX === 64', () => {
    assert.equal(PADDING_CHAR_INDEX, 64);
  });

  it("PADDING_CHAR === 'Y'", () => {
    assert.equal(PADDING_CHAR, 'Y');
  });

  it("OUTPUT_ALPHABET[64] === 'Y'", () => {
    assert.equal(B64_ALPHABET[64], 'Y');
  });
});

describe('custom-base64: short-buffer round-trips', () => {
  for (const len of [1, 2, 3, 4, 5, 6]) {
    it(`round-trips ${len}-byte input and length === 4*ceil(${len}/3)`, () => {
      const buf = Buffer.alloc(len);
      for (let i = 0; i < len; i++) buf[i] = (i * 91 + 23) & 0xff;
      const enc = customBase64Encode(buf);
      assert.equal(enc.length, 4 * Math.ceil(len / 3));
      const dec = customBase64Decode(enc);
      assert.ok(dec.equals(buf));
    });
  }
});

describe('custom-base64: long-buffer round-trips', () => {
  it('round-trips 112-byte all-zero buffer; encoded ends with YY', () => {
    const buf = Buffer.alloc(112);
    const enc = customBase64Encode(buf);
    assert.equal(enc.length, 152);
    assert.equal(enc.slice(-2), 'YY');
    const dec = customBase64Decode(enc);
    assert.ok(dec.equals(buf));
  });

  it('round-trips 1024 bytes of deterministic pseudo-random data', () => {
    const buf = Buffer.alloc(1024);
    for (let i = 0; i < 1024; i++) buf[i] = (i * 37 + 11) & 0xff;
    const enc = customBase64Encode(buf);
    assert.equal(enc.length, 4 * Math.ceil(1024 / 3));
    const dec = customBase64Decode(enc);
    assert.ok(dec.equals(buf));
  });
});

describe('custom-base64: error handling', () => {
  it('customBase64Decode rejects non-alphabet char', () => {
    // Build a valid-length string then poke a tilde into the middle.
    const valid = customBase64Encode(Buffer.alloc(6));
    const bad = valid.slice(0, 4) + '~' + valid.slice(5);
    assert.equal(bad.length, valid.length);
    assert.throws(() => customBase64Decode(bad), /non-alphabet char/);
  });

  it('customBase64Decode rejects length not multiple of 4', () => {
    assert.throws(() => customBase64Decode('GVy'), /multiple of 4/);
  });

  it('customBase64Encode rejects non-Buffer input', () => {
    assert.throws(() => customBase64Encode('not a buffer'), TypeError);
  });

  it('customBase64Decode rejects non-string input', () => {
    assert.throws(() => customBase64Decode(Buffer.alloc(4)), TypeError);
  });
});

// -----------------------------------------------------------------
// (d) encode.js API tests
// -----------------------------------------------------------------

describe('encode: API constants', () => {
  it('PLAINTEXT_LENGTH === 112', () => {
    assert.equal(PLAINTEXT_LENGTH, 112);
  });

  it('EXPECTED_VDATA_LENGTH === 152', () => {
    assert.equal(EXPECTED_VDATA_LENGTH, 152);
  });

  it("XTEA_KEY_HEX === '32653433306638633135623764613936'", () => {
    assert.equal(XTEA_KEY_HEX, '32653433306638633135623764613936');
  });

  it('OUTPUT_ALPHABET length === 65', () => {
    assert.equal(OUTPUT_ALPHABET.length, 65);
  });

  it('KEY_WORDS has 4 uint32 entries', () => {
    assert.equal(KEY_WORDS.length, 4);
    for (const w of KEY_WORDS) {
      assert.equal(typeof w, 'number');
      assert.ok(w >= 0 && w <= 0xffffffff);
    }
  });
});

describe('encode: encodeVData shape', () => {
  it('produces a 152-char string ending in YY for a 112-byte buffer', () => {
    const buf = Buffer.alloc(112);
    for (let i = 0; i < 112; i++) buf[i] = (i * 17 + 5) & 0xff;
    const out = encodeVData(buf);
    assert.equal(typeof out, 'string');
    assert.equal(out.length, 152);
    assert.equal(out.slice(-2), 'YY');
  });

  it('hex-string overload produces same result as buffer overload', () => {
    const buf = Buffer.alloc(112);
    for (let i = 0; i < 112; i++) buf[i] = (i * 17 + 5) & 0xff;
    const fromBuf = encodeVData(buf);
    const fromHex = encodeVData(buf.toString('hex'));
    assert.equal(fromHex, fromBuf);
  });
});

describe('encode: error handling', () => {
  it('throws when plaintext is wrong length; message mentions 112 and Phase 44', () => {
    let caught;
    try {
      encodeVData(Buffer.alloc(100));
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'expected encodeVData to throw');
    assert.match(caught.message, /112/);
    assert.match(caught.message, /Phase 44/);
  });

  it('throws when input is a non-Buffer non-string (number)', () => {
    assert.throws(() => encodeVData(42), TypeError);
  });

  it('throws on too-short hex string', () => {
    assert.throws(() => encodeVData('deadbeef'));
  });

  it('throws on odd-length hex string', () => {
    assert.throws(() => encodeVData('abc'));
  });

  it('throws on non-hex string of correct length', () => {
    // 224 chars but contains non-hex chars
    const bad = 'z'.repeat(224);
    assert.throws(() => encodeVData(bad));
  });

  it('encryptOnly throws when plaintext is wrong length', () => {
    assert.throws(() => encryptOnly(Buffer.alloc(64)), /112/);
  });

  it('encryptOnly returns a 112-byte Buffer for valid input', () => {
    const buf = Buffer.alloc(112);
    const out = encryptOnly(buf);
    assert.ok(Buffer.isBuffer(out));
    assert.equal(out.length, 112);
  });
});

// -----------------------------------------------------------------
// (e) Reference verifier sanity check
// -----------------------------------------------------------------

describe('reference verifier sanity', () => {
  it('verify-vdata-fixtures.js exits 0 standalone', () => {
    const verifierPath = path.join(FIXTURES_DIR, 'verify-vdata-fixtures.js');
    const result = spawnSync(process.execPath, [verifierPath], {
      encoding: 'utf8',
    });
    assert.equal(
      result.status,
      0,
      'verify-vdata-fixtures.js exited non-zero\nstdout:\n' +
        result.stdout +
        '\nstderr:\n' +
        result.stderr
    );
    assert.match(result.stdout, /all vdata fixtures verified/);
  });

  it('reference verifier exports match encoder behavior on jsdom fixture', () => {
    const ref = require('./fixtures/verify-vdata-fixtures.js');
    const key = ref.keyHexToWordsBE(JSDOM_FIXTURE.xtea_key_hex);
    const cipher = ref.customBase64Decode(
      JSDOM_FIXTURE.vdata_string,
      JSDOM_FIXTURE.output_alphabet,
      JSDOM_FIXTURE.padding_char_index
    );
    // Encoder's decode must match the reference decode.
    assert.equal(
      customBase64Decode(JSDOM_FIXTURE.vdata_string).toString('hex'),
      cipher.toString('hex')
    );
    // Encoder's XTEA must match the reference XTEA.
    const refPt = ref.xteaDecryptLE(cipher, key);
    const encPt = xteaDecryptLE(cipher, keyFromHex(XTEA_KEY_HEX));
    assert.equal(encPt.toString('hex'), refPt.toString('hex'));
    assert.equal(refPt.toString('hex'), JSDOM_FIXTURE.plaintext_hex);
  });

  it('reference verifier exports match encoder behavior on HAR fixture', () => {
    const ref = require('./fixtures/verify-vdata-fixtures.js');
    const key = ref.keyHexToWordsBE(HAR_FIXTURE.xtea_key_hex);
    const cipher = ref.customBase64Decode(
      HAR_FIXTURE.har_vdata_string,
      HAR_FIXTURE.output_alphabet,
      HAR_FIXTURE.padding_char_index
    );
    assert.equal(
      customBase64Decode(HAR_FIXTURE.har_vdata_string).toString('hex'),
      cipher.toString('hex')
    );
    const refPt = ref.xteaDecryptLE(cipher, key);
    const encPt = xteaDecryptLE(cipher, keyFromHex(XTEA_KEY_HEX));
    assert.equal(encPt.toString('hex'), refPt.toString('hex'));
    assert.equal(refPt.toString('hex'), HAR_FIXTURE.har_decrypted_plaintext_hex);
  });
});
