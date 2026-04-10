'use strict';

/**
 * ChaosVM Bytecode Decoder
 *
 * Replicates the base64 → varint/zigzag decode pipeline from tdc.js (lines 126–184).
 * Decodes a base64-encoded bytecode string into a flat integer array.
 */

// --- Base64 lookup table (mirrors tdc.js lines 127–135) ---

function makeSequence(start, count, step) {
  const result = [];
  let val = start;
  let i = 0;
  while (i++ < count) {
    result.push(val += step);
  }
  return result;
}

const BASE64_LOOKUP = makeSequence(0, 43, 0)
  .concat([62, 0, 62, 0, 63])
  .concat(makeSequence(51, 10, 1))
  .concat(makeSequence(0, 8, 0))
  .concat(makeSequence(0, 25, 1))
  .concat([0, 0, 0, 0, 63, 0])
  .concat(makeSequence(25, 26, 1));

// --- Base64 decode (mirrors tdc.js function Y, lines 136–145) ---

function base64Decode(input) {
  const str = String(input).replace(/[=]+$/, '');
  const len = str.length;
  let s, j, m = 0, idx = 0;
  const out = [];
  for (; idx < len; idx++) {
    j = BASE64_LOOKUP[str.charCodeAt(idx)];
    if (~j) {
      s = m % 4 ? 64 * s + j : j;
      if (m++ % 4) {
        out.push(255 & (s >> (-2 * m & 6)));
      }
    }
  }
  return out;
}

// --- ZigZag decode (mirrors tdc.js function S, line 146–148) ---

function zigzagDecode(n) {
  return n >> 1 ^ -(1 & n);
}

// --- Varint + ZigZag decode (mirrors tdc.js function J, lines 149–184) ---

function varintZigzagDecode(base64Str) {
  const result = [];
  const bytes = new Int8Array(base64Decode(base64Str));
  const len = bytes.length;
  let pos = 0;

  while (len > pos) {
    let m = bytes[pos++];
    let val = 127 & m;
    if (m >= 0) {
      result.push(zigzagDecode(val));
      continue;
    }
    m = bytes[pos++];
    val |= (127 & m) << 7;
    if (m >= 0) {
      result.push(zigzagDecode(val));
      continue;
    }
    m = bytes[pos++];
    val |= (127 & m) << 14;
    if (m >= 0) {
      result.push(zigzagDecode(val));
      continue;
    }
    m = bytes[pos++];
    val |= (127 & m) << 21;
    if (m >= 0) {
      result.push(zigzagDecode(val));
      continue;
    }
    m = bytes[pos++];
    val |= m << 28;
    result.push(zigzagDecode(val));
  }

  return result;
}

// --- Public API ---

/**
 * Decode a ChaosVM base64 bytecode string into an integer array.
 * @param {string} base64Str - The base64-encoded bytecode
 * @returns {number[]} - The decoded bytecode integer array
 */
function decode(base64Str) {
  return varintZigzagDecode(base64Str);
}

module.exports = { decode, base64Decode, zigzagDecode };
