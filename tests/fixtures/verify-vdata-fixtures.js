'use strict';

// Phase 43 task 43.2 — fixture self-check.
//
// Standalone Node script that loads the two committed vData fixtures
//   tests/fixtures/vdata-jsdom-capture.json
//   tests/fixtures/vdata-har-capture.json
// and verifies, for each fixture, that:
//   1. Custom-base64 decoding the vdata string under the alphabet
//      (with index 64 = padding) reproduces the stored ciphertext_hex
//      byte-for-byte.
//   2. Re-encoding the ciphertext bytes reproduces the vdata string
//      byte-for-byte.
//   3. Classical XTEA decryption of the ciphertext (32 rounds, delta
//      0x9E3779B9, LE uint32 packing, key from xtea_key_hex) reproduces
//      the stored plaintext_hex byte-for-byte.
//   4. Classical XTEA encryption of the plaintext reproduces the
//      ciphertext byte-for-byte.
//
// Pure JS, no external deps, no jsdom. Exits 0 on success, non-zero
// with a diagnostic on failure. Used by 43.4 and runnable standalone:
//   node tests/fixtures/verify-vdata-fixtures.js

const fs = require('fs');
const path = require('path');

const FIXTURE_JSDOM = path.join(__dirname, 'vdata-jsdom-capture.json');
const FIXTURE_HAR = path.join(__dirname, 'vdata-har-capture.json');

function customBase64Decode(s, alphabet, padIdx) {
  if (s.length % 4 !== 0) {
    throw new Error('custom base64 length not multiple of 4: ' + s.length);
  }
  const lookup = new Map();
  for (let i = 0; i < alphabet.length; i++) lookup.set(alphabet[i], i);
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = lookup.get(s[i]);
    const b = lookup.get(s[i + 1]);
    const c = lookup.get(s[i + 2]);
    const d = lookup.get(s[i + 3]);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      throw new Error('non-alphabet char at index ' + i + ': ' + s.slice(i, i + 4));
    }
    out.push((a << 2) | (b >>> 4));
    if (c !== padIdx) out.push(((b & 0xf) << 4) | (c >>> 2));
    if (d !== padIdx) out.push(((c & 3) << 6) | d);
  }
  return Buffer.from(out);
}

function customBase64Encode(buf, alphabet, padIdx) {
  let out = '';
  for (let i = 0; i < buf.length; i += 3) {
    const b0 = buf[i];
    const b1 = i + 1 < buf.length ? buf[i + 1] : NaN;
    const b2 = i + 2 < buf.length ? buf[i + 2] : NaN;
    const c0 = b0 >>> 2;
    const c1 = ((b0 & 3) << 4) | (Number.isNaN(b1) ? 0 : (b1 >>> 4));
    const c2 = Number.isNaN(b1)
      ? padIdx
      : (((b1 & 0xf) << 2) | (Number.isNaN(b2) ? 0 : (b2 >>> 6)));
    const c3 = Number.isNaN(b2) ? padIdx : (b2 & 0x3f);
    out += alphabet[c0] + alphabet[c1] + alphabet[c2] + alphabet[c3];
  }
  return out;
}

function xteaEncryptBlock(v0, v1, key) {
  const delta = 0x9e3779b9;
  let sum = 0;
  v0 = v0 >>> 0;
  v1 = v1 >>> 0;
  for (let i = 0; i < 32; i++) {
    v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
    sum = (sum + delta) >>> 0;
    v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
  }
  return [v0, v1];
}

function xteaDecryptBlock(v0, v1, key) {
  const delta = 0x9e3779b9;
  let sum = (delta * 32) >>> 0;
  v0 = v0 >>> 0;
  v1 = v1 >>> 0;
  for (let i = 0; i < 32; i++) {
    v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
    sum = (sum - delta) >>> 0;
    v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
  }
  return [v0, v1];
}

function keyHexToWordsBE(hex) {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 16) {
    throw new Error('xtea key must be 16 bytes, got ' + buf.length);
  }
  return [
    buf.readUInt32BE(0),
    buf.readUInt32BE(4),
    buf.readUInt32BE(8),
    buf.readUInt32BE(12),
  ];
}

function xteaEncryptLE(plaintext, key) {
  if (plaintext.length % 8 !== 0) {
    throw new Error('plaintext length must be multiple of 8: ' + plaintext.length);
  }
  const out = Buffer.alloc(plaintext.length);
  for (let i = 0; i < plaintext.length; i += 8) {
    const v0 = plaintext.readUInt32LE(i);
    const v1 = plaintext.readUInt32LE(i + 4);
    const [c0, c1] = xteaEncryptBlock(v0, v1, key);
    out.writeUInt32LE(c0, i);
    out.writeUInt32LE(c1, i + 4);
  }
  return out;
}

function xteaDecryptLE(ciphertext, key) {
  if (ciphertext.length % 8 !== 0) {
    throw new Error('ciphertext length must be multiple of 8: ' + ciphertext.length);
  }
  const out = Buffer.alloc(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i += 8) {
    const v0 = ciphertext.readUInt32LE(i);
    const v1 = ciphertext.readUInt32LE(i + 4);
    const [d0, d1] = xteaDecryptBlock(v0, v1, key);
    out.writeUInt32LE(d0, i);
    out.writeUInt32LE(d1, i + 4);
  }
  return out;
}

function checkRoundTrip(label, vdata, cipherHex, ptHex, alphabet, padIdx, key) {
  const failures = [];
  const cipher = customBase64Decode(vdata, alphabet, padIdx);
  if (cipher.toString('hex') !== cipherHex) {
    failures.push(
      'decode != stored ciphertext_hex\n  got: ' +
        cipher.toString('hex') +
        '\n  exp: ' +
        cipherHex
    );
  }
  const reEncoded = customBase64Encode(cipher, alphabet, padIdx);
  if (reEncoded !== vdata) {
    failures.push(
      'encode(decode(vdata)) != vdata\n  got: ' + reEncoded + '\n  exp: ' + vdata
    );
  }
  const pt = xteaDecryptLE(cipher, key);
  if (pt.toString('hex') !== ptHex) {
    failures.push(
      'xtea decrypt != stored plaintext_hex\n  got: ' +
        pt.toString('hex') +
        '\n  exp: ' +
        ptHex
    );
  }
  const reCt = xteaEncryptLE(pt, key);
  if (reCt.toString('hex') !== cipherHex) {
    failures.push(
      'xtea encrypt(decrypt(ct)) != ct\n  got: ' +
        reCt.toString('hex') +
        '\n  exp: ' +
        cipherHex
    );
  }
  if (failures.length > 0) {
    console.error('[FAIL] ' + label);
    for (const f of failures) console.error('  ' + f);
    return false;
  }
  console.log('[PASS] ' + label);
  return true;
}

function verifyJsdom(fixture) {
  const key = keyHexToWordsBE(fixture.xtea_key_hex);
  return checkRoundTrip(
    'jsdom fixture',
    fixture.vdata_string,
    fixture.ciphertext_hex,
    fixture.plaintext_hex,
    fixture.output_alphabet,
    fixture.padding_char_index,
    key
  );
}

function verifyHar(fixture) {
  const key = keyHexToWordsBE(fixture.xtea_key_hex);
  return checkRoundTrip(
    'har fixture',
    fixture.har_vdata_string,
    fixture.har_ciphertext_hex,
    fixture.har_decrypted_plaintext_hex,
    fixture.output_alphabet,
    fixture.padding_char_index,
    key
  );
}

function main() {
  const jsdom = JSON.parse(fs.readFileSync(FIXTURE_JSDOM, 'utf8'));
  const har = JSON.parse(fs.readFileSync(FIXTURE_HAR, 'utf8'));

  const okJsdom = verifyJsdom(jsdom);
  const okHar = verifyHar(har);

  if (!okJsdom || !okHar) {
    process.exit(1);
  }
  console.log('all vdata fixtures verified');
}

if (require.main === module) {
  main();
}

module.exports = {
  customBase64Decode,
  customBase64Encode,
  xteaEncryptBlock,
  xteaDecryptBlock,
  xteaEncryptLE,
  xteaDecryptLE,
  keyHexToWordsBE,
};
