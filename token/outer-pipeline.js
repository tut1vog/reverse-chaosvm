'use strict';

/**
 * outer-pipeline.js — Token Outer Pipeline
 *
 * Reimplements the non-crypto parts of the TDC token generation pipeline.
 * Based on dynamic trace analysis of func_212, func_276, and func_177.
 *
 * Pipeline:
 *   1. buildCdString(entries)  → hand-rolled JSON  (func_276)
 *   2. buildSdString(sdObj)    → JSON.stringify + substr to strip leading '{'  (func_212)
 *   3. encryptFn(payload)      → 4 binary segments  (func_271, pluggable black box)
 *   4. btoa each segment       → 4 base64 strings
 *   5. assembleToken(segments) → concatenate in order [1,0,2,3]
 *   6. urlEncode(base64str)    → replace +/=/  with %XX  (func_177)
 */

// ---------------------------------------------------------------------------
// buildSdString — serialize session data via JSON.stringify + strip leading '{'
// ---------------------------------------------------------------------------
/**
 * Replicates func_212's sd serialization:
 *   JSON.stringify({sd: sdObject}) → substr(1, len-1)
 *
 * The substr(1, len-1) strips the leading '{', producing a string like:
 *   "sd":{"od":"C","appid":"2090803262",...}}
 *
 * @param {Object} sdObject - Session data object, e.g. {od, appid, nonce, token}
 * @returns {string} The sd JSON string with leading '{' removed
 */
function buildSdString(sdObject) {
  // func_212 wraps sd in an outer object: {sd: {...}}
  const jsonStr = JSON.stringify({ sd: sdObject });
  // substr(1, len-1) removes the leading '{'
  // In JS, substr(start, length): start=1, length=jsonStr.length-1
  return jsonStr.substr(1, jsonStr.length - 1);
}

// ---------------------------------------------------------------------------
// buildCdString — hand-rolled JSON serialization of collector data (func_276)
// ---------------------------------------------------------------------------
/**
 * Replicates func_276's hand-rolled JSON serialization.
 * func_276 does NOT use JSON.stringify — it manually concatenates values
 * into a JSON string: {"cd":[...59 entries...]}
 *
 * Serialization rules (observed from trace):
 *   - Strings: JSON-quoted (with proper escaping)
 *   - Numbers: raw numeric representation
 *   - null: literal "null"
 *   - Arrays: JSON.stringify (standard notation)
 *   - Objects: JSON.stringify (standard notation)
 *   - Entries are comma-separated
 *
 * @param {Array} collectorEntries - Array of 59 collector values (mixed types)
 * @returns {string} The cd JSON string, e.g. '{"cd":[1,"linux",2,...]}'
 */
function buildCdString(collectorEntries) {
  // func_276 starts with '{"cd":[' and ends with ']}'
  let result = '{"cd":[';

  for (let i = 0; i < collectorEntries.length; i++) {
    if (i > 0) {
      result += ',';
    }

    const entry = collectorEntries[i];

    if (entry === null) {
      // null → literal "null"
      result += 'null';
    } else if (typeof entry === 'string') {
      // Strings → JSON-quoted with escaping
      result += JSON.stringify(entry);
    } else if (typeof entry === 'number') {
      // Numbers → raw numeric representation
      // JSON.stringify handles Infinity/NaN edge cases, but these shouldn't appear
      // in collector data. Use plain toString for standard numbers.
      result += JSON.stringify(entry);
    } else if (Array.isArray(entry)) {
      // Arrays → standard JSON notation
      result += JSON.stringify(entry);
    } else if (typeof entry === 'object') {
      // Objects → standard JSON notation
      result += JSON.stringify(entry);
    } else {
      // Fallback for unexpected types (boolean, undefined, etc.)
      /* UNCERTAIN: func_276 may handle these differently, but no such types
         appear in the 59 known collector entries */
      result += JSON.stringify(entry);
    }
  }

  result += ']}';
  return result;
}

// ---------------------------------------------------------------------------
// assembleToken — concatenate 4 base64 segments in order [1,0,2,3]
// ---------------------------------------------------------------------------
/**
 * Replicates func_212's segment concatenation.
 * The 4 btoa segments are concatenated in a specific order:
 *   btoa[1] (header, 192 chars) +
 *   btoa[0] (hash, 64 chars) +
 *   btoa[2] (encrypted cd, ~3904-4032 chars) +
 *   btoa[3] (signature, 120 chars)
 *
 * This produces the header → hash → ciphertext → signature ordering.
 *
 * @param {string[]} btoaSegments - Array of 4 base64 strings [btoa[0], btoa[1], btoa[2], btoa[3]]
 * @returns {string} Concatenated base64 string (~4280+ chars)
 */
function assembleToken(btoaSegments) {
  // Concatenation order: [1, 0, 2, 3]
  return btoaSegments[1] + btoaSegments[0] + btoaSegments[2] + btoaSegments[3];
}

// ---------------------------------------------------------------------------
// urlEncode — URL-safe base64 encoding (func_177)
// ---------------------------------------------------------------------------
/**
 * Replicates func_177's URL-safe encoding via String.prototype.replace().
 * Replaces base64 characters that are not URL-safe:
 *   + → %2B
 *   / → %2F
 *   = → %3D
 *
 * This is NOT the same as encodeURIComponent (which would encode many more chars).
 * Only these 3 characters are replaced.
 *
 * Idempotent: applying twice does NOT double-encode because the replacement
 * characters (%, 2, B, F, D) are not in the replacement set {+, /, =}.
 *
 * @param {string} rawBase64 - Raw base64 string (may contain +, /, =)
 * @returns {string} URL-safe string with +/=/  replaced
 */
function urlEncode(rawBase64) {
  // func_177 applies three sequential replacements
  // Order doesn't matter since replacement chars don't overlap with source chars
  return rawBase64
    .replace(/\+/g, '%2B')
    .replace(/\//g, '%2F')
    .replace(/=/g, '%3D');
}

// ---------------------------------------------------------------------------
// buildToken — full pipeline orchestrator
// ---------------------------------------------------------------------------
/**
 * Orchestrates the complete token generation pipeline.
 *
 * Pipeline steps:
 *   1. Build cd string from collector entries (func_276 format)
 *   2. Build sd string from session data (JSON.stringify + strip '{')
 *   3. Call encryptFn with the combined payload → get 4 binary segments
 *   4. btoa() each binary segment → 4 base64 strings
 *   5. Concatenate in order [1,0,2,3]
 *   6. URL-encode the result
 *
 * @param {Object} sdObject - Session data, e.g. {od, appid, nonce, token}
 * @param {Array} collectorEntries - Array of 59 collector values
 * @param {Function} encryptFn - Encryption function: (cdString, sdString) → {segments: [Buffer, Buffer, Buffer, Buffer]}
 * @returns {string} The final URL-encoded token string
 */
function buildToken(sdObject, collectorEntries, encryptFn) {
  // Step 1: Build the cd string (hand-rolled JSON)
  const cdString = buildCdString(collectorEntries);

  // Step 2: Build the sd string (JSON.stringify + strip leading '{')
  const sdString = buildSdString(sdObject);

  // Step 3: Encrypt — the black box produces 4 binary segments
  // encryptFn receives the cd and sd strings; returns {segments: [buf0, buf1, buf2, buf3]}
  const encrypted = encryptFn(cdString, sdString);

  // Step 4: Base64-encode each binary segment
  // In a browser this is btoa(), in Node.js we use Buffer
  const btoaSegments = encrypted.segments.map(buf => {
    // Handle both Buffer and Uint8Array inputs
    const buffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    return buffer.toString('base64');
  });

  // Step 5: Concatenate in order [1,0,2,3]
  const assembled = assembleToken(btoaSegments);

  // Step 6: URL-safe encoding
  const token = urlEncode(assembled);

  return token;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  buildSdString,
  buildCdString,
  assembleToken,
  urlEncode,
  buildToken,
};
