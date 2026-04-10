'use strict';

/**
 * collect-generator.js — Parameterized Collect Token Generator
 *
 * Generates the `collect` field for the verify POST body, parameterized by
 * XTEA key so it works with any template (A, B, C, or unknown).
 *
 * Reuses key-independent modules from token/:
 *   - collector-schema.js  (buildDefaultCdArray)
 *   - outer-pipeline.js    (buildCdString, buildSdString, urlEncode)
 *   - generate-token.js    (buildInputChunks, assembleToken logic)
 *
 * Re-implements the XTEA cipher with dynamic parameters, supports per-index
 * key modifications (4-element keyMods array), cd field reordering, and
 * behavioral event generation for slide CAPTCHAs.
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
 * @param {number[]} keyMods - 4-element array of constants added to key[0..3]
 */
function cipherRound(r9, key, delta, rounds, keyMods) {
  let v0 = r9[0];
  let v1 = r9[1];
  let sum = 0;
  const targetSum = rounds * delta;

  while (sum !== targetSum) {
    // v0 update: key indexed by (sum & 3)
    const idx0 = sum & 3;
    const k0 = key[idx0] + keyMods[idx0];

    v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);

    // Sum update (no truncation)
    sum += delta;

    // v1 update: key indexed by ((sum >>> 11) & 3)
    const idx1 = (sum >>> 11) & 3;
    const k1 = key[idx1] + keyMods[idx1];

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
 * @param {number[]} keyMods - 4-element array of constants added to key[0..3]
 * @returns {string} Encrypted binary string
 */
function encrypt(inputBytes, key, delta, rounds, keyMods) {
  let output = '';
  const paddedLen = Math.ceil(inputBytes.length / 8) * 8;

  for (let pos = 0; pos < paddedLen; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    const r9 = [convertBytesToWord(slice1), convertBytesToWord(slice2)];
    cipherRound(r9, key, delta, rounds, keyMods);

    output += convertWordToBytes(r9[0]) + convertWordToBytes(r9[1]);
  }

  return output;
}

/**
 * Normalize XTEA parameters to a 4-element keyMods array.
 *
 * Accepts either:
 *   - keyMods: [v0, v1, v2, v3] (new 4-element format, preferred)
 *   - keyModConstants: [v1, v3] (legacy 2-element format → [0, v1, 0, v3])
 *
 * @param {Object} params - XTEA parameters
 * @returns {number[]} 4-element keyMods array
 */
function normalizeKeyMods(params) {
  if (params.keyMods && Array.isArray(params.keyMods) && params.keyMods.length === 4) {
    return params.keyMods;
  }
  if (params.keyModConstants && Array.isArray(params.keyModConstants)) {
    return [0, params.keyModConstants[0], 0, params.keyModConstants[1]];
  }
  return [0, 0, 0, 0];
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
 * @param {number[]} [params.keyMods] - 4-element key modification array (preferred)
 * @param {number[]} [params.keyModConstants] - [keyMod1, keyMod3] (legacy, auto-converted)
 * @returns {Function} encryptFn(chunks) → base64segments[]
 */
function createEncryptFn(params) {
  const { key, delta, rounds } = params;
  const keyMods = normalizeKeyMods(params);

  return function encryptFn(chunks) {
    return chunks.map(chunk => {
      const encrypted = encrypt(chunk, key, delta, rounds, keyMods);
      return Buffer.from(encrypted, 'binary').toString('base64');
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Behavioral Events Generator
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate behavioral mouse events simulating a slide drag.
 *
 * Event tuple format: [type, dx, dy, timestamp, 0, 0, 0, 0]
 *   type 4 = init, type 1 = mousemove, type 2 = mousedown, type 3 = mouseup
 *
 * @param {number} xAnswer - Slide distance in pixels
 * @param {number} slideY - Y coordinate of the slide track
 * @param {number} timestamp - Base timestamp (ms)
 * @returns {Array<number[]>} Array of 8-element event tuples
 */
function generateBehavioralEvents(xAnswer, slideY, timestamp) {
  const events = [];
  let t = timestamp;

  // Init event
  events.push([4, -1, -1, t, 0, 0, 0, 0]);
  t += Math.floor(Math.random() * 50 + 30);

  // Generate ~20-30 mousemove events simulating deceleration
  const moveCount = Math.floor(Math.random() * 11 + 20); // 20-30
  let remaining = xAnswer;
  const totalTime = Math.floor(Math.random() * 1000 + 1000); // 1-2 seconds total
  const avgDt = totalTime / moveCount;

  for (let i = 0; i < moveCount; i++) {
    // Deceleration: larger steps early, smaller steps late
    const progress = i / moveCount;
    const factor = 1 - progress * 0.8; // decelerating
    const baseDx = (remaining / (moveCount - i)) * factor * 1.5;
    const dx = Math.max(0, Math.round(baseDx + (Math.random() - 0.5) * 2));
    remaining -= dx;
    const dy = Math.round((Math.random() - 0.5) * 2);
    const dt = Math.floor(avgDt + (Math.random() - 0.5) * 30);
    t += Math.max(20, dt);

    events.push([1, dx, dy, t, 0, 0, 0, 0]);
  }

  // If there's remaining distance, add it to the last move
  if (remaining > 0 && events.length > 1) {
    const last = events[events.length - 1];
    last[1] += remaining;
  }

  // Mousedown event
  t += Math.floor(Math.random() * 30 + 20);
  events.push([2, 0, 0, t, 0, 0, 0, 0]);

  // A few small jitter moves after mousedown
  const jitterCount = Math.floor(Math.random() * 3 + 1);
  for (let i = 0; i < jitterCount; i++) {
    t += Math.floor(Math.random() * 40 + 20);
    events.push([1, 0, Math.round((Math.random() - 0.5) * 2), t, 0, 0, 0, 0]);
  }

  // Mouseup event
  t += Math.floor(Math.random() * 50 + 30);
  events.push([3, 0, 0, t, 0, 0, 0, 0]);

  return events;
}

// ═══════════════════════════════════════════════════════════════════════
// Slide SD Builder
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate a random fingerprint token (ft) string.
 * Format: 9-char string using alphanumeric + underscore.
 *
 * @returns {string} 9-char fingerprint token
 */
function generateFt() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_';
  let ft = '';
  for (let i = 0; i < 9; i++) {
    ft += chars[Math.floor(Math.random() * chars.length)];
  }
  return ft;
}

/**
 * Build the sd (session data) object for a slide CAPTCHA verify.
 *
 * @param {Object} slideAnswer - {x: number, y: number} slide answer coordinates
 * @param {Array<number[]>} slideValue - Array of [dx, dy, dt] tuples for sd.slideValue
 * @param {Object} [options] - Optional overrides
 * @param {number} [options.trycnt=1] - Attempt count
 * @param {number} [options.refreshcnt=0] - Refresh count
 * @param {string} [options.ft] - Fingerprint token (generated if not provided)
 * @param {number} [options.elapsed] - Total drag elapsed time in ms
 * @param {Array<number>} [options.coordinate] - [leftOffset, topOffset, ratio] CSS layout geometry
 * @returns {Object} sd object for verify POST
 */
function buildSlideSd(slideAnswer, slideValue, options) {
  const opts = options || {};
  return {
    od: 'C',
    clientType: '',
    coordinate: opts.coordinate || [10, 60, 1.0],
    trycnt: opts.trycnt || 1,
    refreshcnt: opts.refreshcnt || 0,
    slideValue: slideValue,
    dragobj: 1,
    ft: opts.ft || generateFt(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Token Generation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Reorder a cd array according to a field order mapping.
 *
 * @param {Array} cdArray - Base 59-field cd array (Template A order)
 * @param {number[]} cdFieldOrder - Array of schema indices defining output order.
 *   Each entry >= 0 maps to cdArray[entry]. Entry -1 inserts behavioralEvents.
 * @param {*} [behavioralEvents] - Value to insert at the -1 position
 * @returns {Array} Reordered cd array
 */
function reorderCdArray(cdArray, cdFieldOrder, behavioralEvents) {
  const result = [];
  for (let i = 0; i < cdFieldOrder.length; i++) {
    const idx = cdFieldOrder[i];
    if (idx === -1) {
      result.push(behavioralEvents !== undefined ? behavioralEvents : []);
    } else {
      result.push(cdArray[idx]);
    }
  }
  return result;
}

/**
 * Generate a complete URL-encoded collect token string.
 *
 * @param {Object} profile - Browser fingerprint profile (from profiles/*.json)
 * @param {Object} xteaParams - XTEA parameters for the target template
 * @param {number[]} xteaParams.key - 4-element int32 key array
 * @param {number} xteaParams.delta - XTEA delta constant
 * @param {number} xteaParams.rounds - Number of XTEA rounds
 * @param {number[]} [xteaParams.keyMods] - 4-element key modification array (preferred)
 * @param {number[]} [xteaParams.keyModConstants] - [keyMod1, keyMod3] (legacy, auto-converted)
 * @param {Object} [options] - Optional overrides
 * @param {string} [options.appid] - App ID (default: from profile or '2090803262')
 * @param {string} [options.nonce] - Nonce value (default: from profile or random)
 * @param {string} [options.token] - Token value (default: from profile or 'test_token_123')
 * @param {number} [options.timestamp] - Timestamp in ms (default: Date.now())
 * @param {Object} [options.sdOverride] - Complete sd object to use instead of default
 * @param {number[]} [options.cdFieldOrder] - Field reordering array (schema indices, -1 = behavioralEvents)
 * @param {*} [options.behavioralEvents] - Behavioral events value to insert at -1 position in cdFieldOrder
 * @param {Array} [options.cdArrayOverride] - Pre-built cd array to use instead of building from profile
 * @returns {string} URL-encoded collect token string
 */
function generateCollect(profile, xteaParams, options) {
  const opts = options || {};
  const p = profile || {};

  // Step 1: Build cdArray from profile (or use override)
  let cdArray;
  if (opts.cdArrayOverride && Array.isArray(opts.cdArrayOverride)) {
    cdArray = opts.cdArrayOverride;
  } else {
    cdArray = buildDefaultCdArray(p);

    // Step 1b: Reorder cd fields if cdFieldOrder is provided
    if (opts.cdFieldOrder && Array.isArray(opts.cdFieldOrder)) {
      cdArray = reorderCdArray(cdArray, opts.cdFieldOrder, opts.behavioralEvents);
    }
  }

  // Step 2: Build cdString (hand-rolled JSON)
  const cdString = buildCdString(cdArray);

  // Step 3: Build sdObject and sdString
  let sdObject;
  if (opts.sdOverride) {
    sdObject = opts.sdOverride;
  } else {
    sdObject = {
      od: 'C',
      appid: opts.appid || p.appid || '2090803262',
      nonce: opts.nonce || p.nonce || '0.' + Math.random().toString().slice(2, 10),
      token: opts.token || p.token || 'test_token_123',
    };
  }
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
  generateBehavioralEvents,
  buildSlideSd,

  // Factory for pluggable encryption
  createEncryptFn,

  // Utilities
  normalizeKeyMods,
  reorderCdArray,
  generateFt,

  // Internals (for testing/injection)
  buildDefaultCdArray,
  convertBytesToWord,
  convertWordToBytes,
  cipherRound,
  encrypt,
};
