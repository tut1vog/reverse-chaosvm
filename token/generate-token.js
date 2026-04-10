'use strict';

/**
 * generate-token.js — Integrated standalone token generator.
 *
 * Wires crypto-core.js and outer-pipeline.js together to produce the exact
 * same URL-encoded token string as tdc.js.
 *
 * Pipeline:
 *   1. Build cdString from collector entries (func_276 format)
 *   2. Build sdString from session data (JSON.stringify + strip '{')
 *   3. Construct 4 input chunks: hash, header, cd-body, signature
 *   4. Encrypt each chunk (Modified XTEA, ECB mode)
 *   5. Base64-encode each encrypted chunk
 *   6. Assemble in order [1, 0, 2, 3] = header + hash + cd + sig
 *   7. URL-encode (+, /, = → %XX)
 *
 * Exports: generateToken, buildInputChunks
 */

const { encryptSegments } = require('./crypto-core.js');
const {
  buildCdString,
  buildSdString,
  urlEncode,
} = require('./outer-pipeline.js');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

/**
 * Header chunk size — always 144 bytes (18 XTEA blocks of 8 bytes).
 * The cdString payload is split at this boundary.
 */
const HEADER_SIZE = 144;

/**
 * Hash chunk size — always 48 bytes (6 XTEA blocks).
 * Contains session metadata padded with spaces.
 */
const HASH_SIZE = 48;

// ═══════════════════════════════════════════════════════════════════════
// Chunk Construction
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build the hash metadata chunk.
 *
 * The hash contains a nested array with session metadata:
 *   [[4, -1, -1, <timestamp>, 0, 0, 0, 0]]
 *
 * Observed fields:
 *   - 4: constant (likely protocol version or segment count)
 *   - -1, -1: constants (status/error placeholders)
 *   - timestamp: Date.now() value (frozen in our traces)
 *   - 0, 0, 0, 0: counters/flags (always 0 in observed traces)
 *
 * Padded with spaces to HASH_SIZE (48 bytes).
 *
 * @param {number} timestamp - Date.now() value
 * @returns {string} 48-byte binary string
 */
function buildHashChunk(timestamp) {
  const content = `[[4,-1,-1,${timestamp},0,0,0,0]]`;
  return content.padEnd(HASH_SIZE, ' ');
}

/**
 * Build the 4 input chunks for the XTEA encryption.
 *
 * The payload is constructed as:
 *   cdString (without closing '}') + ',' → "payload body"
 *
 * This forms the first part of a JSON object: {"cd":[...],
 * The sig chunk (sdString) completes it: "sd":{...}}
 * Together they form: {"cd":[...],"sd":{...}}
 *
 * Chunk layout:
 *   [0] hash    (48 bytes)  — session metadata, space-padded
 *   [1] header  (144 bytes) — first 144 bytes of payload body, space-padded
 *   [2] cd-body (variable)  — remaining payload body, space-padded to 8-byte alignment
 *   [3] sig     (variable)  — sdString, unpadded (encrypt handles block alignment)
 *
 * @param {string} cdString - The cd JSON string from buildCdString, e.g. '{"cd":[...]}'
 * @param {string} sdString - The sd string from buildSdString, e.g. '"sd":{...}}'
 * @param {number} [timestamp=Date.now()] - Timestamp for the hash chunk
 * @returns {string[]} Array of 4 binary strings [hash, header, cdBody, sig]
 */
function buildInputChunks(cdString, sdString, timestamp) {
  if (typeof timestamp === 'undefined') {
    timestamp = Date.now();
  }

  // 1. Hash chunk: session metadata, padded to 48 bytes
  const hash = buildHashChunk(timestamp);

  // 2. Build payload body: cdString with closing '}' replaced by ','
  //    This creates the prefix of the full JSON: {"cd":[...],
  //    The sdString ("sd":{...}}) will be sent separately as the sig chunk.
  //    On the server side, concatenating all chunks produces:
  //      {"cd":[...],"sd":{...}}
  const payloadBody = cdString.slice(0, -1) + ',';

  // 3. Header chunk: first 144 bytes of payload body, space-padded
  const headerContent = payloadBody.substring(0, HEADER_SIZE);
  const header = headerContent.padEnd(HEADER_SIZE, ' ');

  // 4. CD body chunk: remaining payload body, space-padded to 8-byte alignment
  const cdContent = payloadBody.substring(HEADER_SIZE);
  let cdBody = '';
  if (cdContent.length > 0) {
    const paddedLen = Math.ceil(cdContent.length / 8) * 8;
    cdBody = cdContent.padEnd(paddedLen, ' ');
  }

  // 5. Sig chunk: sdString, unpadded
  //    The encrypt() function handles padding to the next 8-byte boundary internally.
  const sig = sdString;

  return [hash, header, cdBody, sig];
}

// ═══════════════════════════════════════════════════════════════════════
// Token Generation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a complete URL-encoded token string.
 *
 * This is the main entry point for token generation. It takes collector
 * data entries and a session data object, and produces the exact same
 * token string that tdc.js would generate.
 *
 * Full pipeline:
 *   1. buildCdString(cdEntries) → hand-rolled JSON: {"cd":[...]}
 *   2. buildSdString(sdObject) → JSON.stringify + strip '{': "sd":{...}}
 *   3. buildInputChunks(cdString, sdString, timestamp) → 4 binary chunks
 *   4. encryptSegments(chunks) → 4 base64 strings
 *   5. Assemble in order [1, 0, 2, 3] → concatenated base64
 *   6. urlEncode → replace +/=/  with %XX
 *
 * Assembly order: header(btoa[1]) + hash(btoa[0]) + cd(btoa[2]) + sig(btoa[3])
 * This places: header → hash → ciphertext → signature
 *
 * @param {Array} cdEntries - Array of collector values (typically 59 entries)
 * @param {Object} sdObject - Session data, e.g. {od, appid, nonce, token}
 * @param {number} [timestamp=Date.now()] - Timestamp for the hash chunk
 * @returns {string} The final URL-encoded token string (~4500-5000 chars)
 */
function generateToken(cdEntries, sdObject, timestamp) {
  // Step 1: Build the cd string (hand-rolled JSON)
  const cdString = buildCdString(cdEntries);

  // Step 2: Build the sd string
  const sdString = buildSdString(sdObject);

  // Step 3: Construct the 4 input chunks
  const chunks = buildInputChunks(cdString, sdString, timestamp);

  // Step 4: Encrypt each chunk → base64
  const btoaSegments = encryptSegments(chunks);

  // Step 5: Assemble in order [1, 0, 2, 3]
  // btoaSegments[0] = hash, [1] = header, [2] = cd, [3] = sig
  const assembled = btoaSegments[1] + btoaSegments[0] + btoaSegments[2] + btoaSegments[3];

  // Step 6: URL-encode
  const token = urlEncode(assembled);

  return token;
}

/**
 * Generate a token from pre-built cdString and sdString.
 *
 * Use this when you already have the cdString (e.g., extracted from a trace)
 * and don't need to build it from collector entries.
 *
 * @param {string} cdString - Pre-built cd JSON string, e.g. '{"cd":[...]}'
 * @param {string} sdString - Pre-built sd string, e.g. '"sd":{...}}'
 * @param {number} [timestamp=Date.now()] - Timestamp for the hash chunk
 * @returns {string} The final URL-encoded token string
 */
function generateTokenFromStrings(cdString, sdString, timestamp) {
  const chunks = buildInputChunks(cdString, sdString, timestamp);
  const btoaSegments = encryptSegments(chunks);
  const assembled = btoaSegments[1] + btoaSegments[0] + btoaSegments[2] + btoaSegments[3];
  return urlEncode(assembled);
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Primary API
  generateToken,
  generateTokenFromStrings,

  // For testability
  buildInputChunks,
  buildHashChunk,

  // Re-exports for convenience
  buildCdString,
  buildSdString,

  // Constants
  HEADER_SIZE,
  HASH_SIZE,
};
