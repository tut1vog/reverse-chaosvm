'use strict';

/**
 * collect-generator.js — Parameterized Collect Token Generator
 *
 * Generates the `collect` field for the verify POST body, parameterized by
 * XTEA key so it works with any template (A, B, or C).
 *
 * Reuses key-independent modules from token/:
 *   - collector-schema.js  (buildDefaultCdArray)
 *   - outer-pipeline.js    (buildCdString, buildSdString, urlEncode)
 *   - generate-token.js    (buildInputChunks, assembleToken logic)
 *
 * Only re-implements the XTEA cipher with dynamic parameters.
 */

const { buildDefaultCdArray } = require('../token/collector-schema.js');
const {
  buildCdString,
  buildSdString,
  assembleToken,
  urlEncode,
} = require('../token/outer-pipeline.js');
const { buildInputChunks } = require('../token/generate-token.js');

// ═══════════════════════════════════════════════════════════════════════
// Parameterized XTEA Cipher
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a 4-byte binary string to a 32-bit word (little-endian packing).
 * Copied from token/crypto-core.js — func_136.
 *
 * @param {string} fourByteString - 4 character binary string
 * @returns {number} 32-bit integer
 */
function convertBytesToWord(fourByteString) {
  const b0 = fourByteString.charCodeAt(0) || 0;
  const b1 = fourByteString.charCodeAt(1) || 0;
  const b2 = fourByteString.charCodeAt(2) || 0;
  const b3 = fourByteString.charCodeAt(3) || 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

/**
 * Convert a 32-bit word to a 4-byte binary string (little-endian extraction).
 * Copied from token/crypto-core.js — func_140.
 *
 * @param {number} word - 32-bit integer (may exceed 32-bit range)
 * @returns {string} 4 character binary string
 */
function convertWordToBytes(word) {
  return String.fromCharCode(
    word & 0xFF,
    (word >> 8) & 0xFF,
    (word >> 16) & 0xFF,
    (word >> 24) & 0xFF
  );
}

/**
 * Parameterized Modified XTEA cipher round.
 *
 * JS semantics (critical for correctness):
 *   - `sum` is NOT truncated to 32 bits (reaches 84941944608 after 32 rounds)
 *   - `<<` and `>>>` truncate to 32 bits before shifting
 *   - `+` does NOT truncate — values can exceed 32-bit range
 *   - `^` truncates both operands to int32
 *   - v0/v1 may exceed 32-bit range — the serializer extracts low 32 bits via & 0xFF
 *
 * @param {number[]} r9 - Two-element array [word0, word1], modified in-place
 * @param {number[]} key - 4-element XTEA key array
 * @param {number} delta - XTEA delta constant
 * @param {number} rounds - Number of rounds
 * @param {number} keyMod1 - Constant added to key[1]
 * @param {number} keyMod3 - Constant added to key[3]
 */
function cipherRound(r9, key, delta, rounds, keyMod1, keyMod3) {
  let v0 = r9[0];
  let v1 = r9[1];
  let sum = 0;
  const targetSum = rounds * delta;

  while (sum !== targetSum) {
    // v0 update: key indexed by (sum & 3)
    const idx0 = sum & 3;
    let k0 = key[idx0];
    if (idx0 === 1) k0 += keyMod1;
    else if (idx0 === 3) k0 += keyMod3;

    v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);

    // Sum update (no truncation)
    sum += delta;

    // v1 update: key indexed by ((sum >>> 11) & 3)
    const idx1 = (sum >>> 11) & 3;
    let k1 = key[idx1];
    if (idx1 === 1) k1 += keyMod1;
    else if (idx1 === 3) k1 += keyMod3;

    v1 += (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);
  }

  r9[0] = v0;
  r9[1] = v1;
}

/**
 * Encrypt a binary string using parameterized XTEA.
 * Processes input in 8-byte blocks (ECB mode).
 *
 * @param {string} inputBytes - Binary string to encrypt
 * @param {number[]} key - 4-element XTEA key
 * @param {number} delta - XTEA delta
 * @param {number} rounds - Number of rounds
 * @param {number} keyMod1 - Constant added to key[1]
 * @param {number} keyMod3 - Constant added to key[3]
 * @returns {string} Encrypted binary string
 */
function encrypt(inputBytes, key, delta, rounds, keyMod1, keyMod3) {
  let output = '';
  const paddedLen = Math.ceil(inputBytes.length / 8) * 8;

  for (let pos = 0; pos < paddedLen; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    const r9 = [convertBytesToWord(slice1), convertBytesToWord(slice2)];
    cipherRound(r9, key, delta, rounds, keyMod1, keyMod3);

    output += convertWordToBytes(r9[0]) + convertWordToBytes(r9[1]);
  }

  return output;
}

/**
 * Create a pluggable encryptFn from XTEA parameters.
 *
 * The returned function takes an array of binary string chunks and returns
 * an array of base64-encoded encrypted strings — compatible with the
 * token/crypto-core.js encryptFn interface.
 *
 * @param {Object} params - XTEA parameters
 * @param {number[]} params.key - 4-element int32 key array
 * @param {number} params.delta - XTEA delta (0x9E3779B9)
 * @param {number} params.rounds - Number of rounds (32)
 * @param {number[]} params.keyModConstants - [keyMod1, keyMod3]
 * @returns {Function} encryptFn(chunks) → base64segments[]
 */
function createEncryptFn({ key, delta, rounds, keyModConstants }) {
  const keyMod1 = keyModConstants[0];
  const keyMod3 = keyModConstants[1];

  return function encryptFn(chunks) {
    return chunks.map(chunk => {
      const encrypted = encrypt(chunk, key, delta, rounds, keyMod1, keyMod3);
      return Buffer.from(encrypted, 'binary').toString('base64');
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Token Generation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a complete URL-encoded collect token string.
 *
 * @param {Object} profile - Browser fingerprint profile (from profiles/*.json)
 * @param {Object} xteaParams - XTEA parameters for the target template
 * @param {number[]} xteaParams.key - 4-element int32 key array
 * @param {number} xteaParams.delta - XTEA delta constant
 * @param {number} xteaParams.rounds - Number of XTEA rounds
 * @param {number[]} xteaParams.keyModConstants - [keyMod1, keyMod3]
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.appid] - App ID (default: from profile or '2090803262')
 * @param {string} [options.nonce] - Nonce value (default: from profile or random)
 * @param {string} [options.token] - Token value (default: from profile or 'test_token_123')
 * @param {number} [options.timestamp] - Timestamp in ms (default: Date.now())
 * @returns {string} URL-encoded collect token string
 */
function generateCollect(profile, xteaParams, options) {
  const opts = options || {};
  const p = profile || {};

  // Step 1: Build cdArray from profile
  const cdArray = buildDefaultCdArray(p);

  // Step 2: Build cdString (hand-rolled JSON)
  const cdString = buildCdString(cdArray);

  // Step 3: Build sdObject and sdString
  const sdObject = {
    od: 'C',
    appid: opts.appid || p.appid || '2090803262',
    nonce: opts.nonce || p.nonce || '0.' + Math.random().toString().slice(2, 10),
    token: opts.token || p.token || 'test_token_123',
  };
  const sdString = buildSdString(sdObject);

  // Step 4: Build input chunks
  const timestamp = opts.timestamp || Date.now();
  const chunks = buildInputChunks(cdString, sdString, timestamp);

  // Step 5: Encrypt with parameterized XTEA
  const encryptFn = createEncryptFn(xteaParams);
  const btoaSegments = encryptFn(chunks);

  // Step 6: Assemble in order [1, 0, 2, 3]
  const assembled = assembleToken(btoaSegments);

  // Step 7: URL-encode
  return urlEncode(assembled);
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary API
  generateCollect,

  // Factory for pluggable encryption
  createEncryptFn,

  // Internals (for testing)
  convertBytesToWord,
  convertWordToBytes,
  cipherRound,
  encrypt,
};
