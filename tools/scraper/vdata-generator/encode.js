'use strict';

// Phase 43 task 43.3 — top-level vData cipher encoder.
//
// Public API:
//   encodeVData(plaintext)  — Buffer or hex string -> 152-char vData string
//   encryptOnly(plaintext)  — Buffer or hex string -> 112-byte ciphertext Buffer
//
// This implements the cipher half of vm-slide's vData pipeline:
//
//   1. 112 bytes plaintext (14 XTEA blocks, no padding).
//   2. Classical XTEA encrypt with the 16-byte key recovered from
//      vm-slide bytecode (see docs/VDATA_FORMAT.md §3). Delta
//      0x9E3779B9, 32 rounds, LE uint32 packing.
//   3. Standard base64 with the custom 65-char alphabet from
//      vm-slide pc 16932 (see custom-base64.js). 112 bytes -> 152 chars,
//      always ending in 'YY' (the padding-char pair).
//
// The 112-byte plaintext is the JS-environment fingerprint that
// vm-slide's proxyXHR builds at runtime. Reversing the plaintext
// builder is Phase 44, NOT this task — encodeVData REQUIRES the
// caller to supply a 112-byte plaintext.

const { xteaEncryptLE, keyFromHex } = require('./xtea.js');
const { customBase64Encode, OUTPUT_ALPHABET } = require('./custom-base64.js');

// 16-byte XTEA key recovered from vm-slide bytecode. ASCII form is
// '2e430f8c15b7da96'. See docs/VDATA_FORMAT.md §3.
const XTEA_KEY_HEX = '32653433306638633135623764613936';
const KEY_WORDS = keyFromHex(XTEA_KEY_HEX);

const PLAINTEXT_LENGTH = 112;
const EXPECTED_VDATA_LENGTH = 152;

function coerceToBuffer(input, label) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string') {
    if (input.length % 2 !== 0 || /[^0-9a-fA-F]/.test(input)) {
      throw new Error(label + ': string input must be an even-length hex string');
    }
    return Buffer.from(input, 'hex');
  }
  throw new TypeError(label + ': input must be a Buffer or hex string');
}

function encryptOnly(plaintext) {
  const buf = coerceToBuffer(plaintext, 'encryptOnly');
  if (buf.length !== PLAINTEXT_LENGTH) {
    throw new Error(
      'encryptOnly: plaintext must be exactly ' +
        PLAINTEXT_LENGTH +
        ' bytes (got ' +
        buf.length +
        '). The 112-byte plaintext is the JS-environment fingerprint built by ' +
        "vm-slide's proxyXHR at runtime — Phase 44 owns reversing the plaintext builder."
    );
  }
  return xteaEncryptLE(buf, KEY_WORDS);
}

function encodeVData(plaintext) {
  const ciphertext = encryptOnly(plaintext);
  const vdata = customBase64Encode(ciphertext);
  if (vdata.length !== EXPECTED_VDATA_LENGTH) {
    throw new Error(
      'encodeVData: produced vdata of length ' +
        vdata.length +
        ', expected ' +
        EXPECTED_VDATA_LENGTH
    );
  }
  return vdata;
}

module.exports = {
  XTEA_KEY_HEX,
  KEY_WORDS,
  OUTPUT_ALPHABET,
  PLAINTEXT_LENGTH,
  EXPECTED_VDATA_LENGTH,
  encodeVData,
  encryptOnly,
};
