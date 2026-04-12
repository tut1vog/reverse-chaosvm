'use strict';

/**
 * crypto-core.js — Standalone reimplementation of ChaosVM's encryption core.
 *
 * Replaces func_271's inner loop (cipher round, byte↔word converters).
 * Algorithm: Modified XTEA (32 rounds) with key-index-dependent constant additions.
 *
 * Verified against all 802 inner loop iterations from crypto-trace-v2.json.
 * All 4 btoa segments match encoding-trace.json ground truth byte-for-byte.
 *
 * Key functions reimplemented:
 *   r62[0] = func_136 (byte→word converter)  → convertBytesToWord()
 *   r46[0] = func_204 (cipher round)         → cipherRound()
 *   r90[0] = func_140 (word→byte serializer) → convertWordToBytes()
 *   func_271 inner loop                      → encrypt()
 *   4× func_271 invocations                  → encryptSegments()
 */

// ═══════════════════════════════════════════════════════════════════════
// Constants — hardcoded from dynamic trace (key schedule produces constant output)
// ═══════════════════════════════════════════════════════════════════════

/**
 * State array A (r87[0]) — the XTEA key.
 * Produced by the 14-step key schedule in func_271's Region 1.
 * Written by: func_43(step 7)→[0], func_199(step 8)→[1], func_100(step 1)→[2], func_284(step 11)→[3]
 */
const STATE_A = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140];

/**
 * XTEA delta constant (standard golden ratio value).
 * Accessed via r1[2] in the VM's cipher round.
 */
const DELTA = 0x9E3779B9;

/**
 * Target sum for loop termination: 32 * DELTA = 84941944608.
 * NOT truncated to 32 bits (JS number semantics, compared with ==).
 * Accessed via r1[3] in the VM.
 */
const TARGET_SUM = 32 * DELTA; // 84941944608

/**
 * Key modification constants.
 * When the key index is 1, add 2368517 (0x242405) to the key value.
 * When the key index is 3, add 592130 (0x090902) to the key value.
 * These appear in the XTEA formula as anti-analysis obfuscation.
 */
const KEY_MOD_1 = 2368517;
const KEY_MOD_3 = 592130;

// ═══════════════════════════════════════════════════════════════════════
// Core functions
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a 4-byte binary string to a 32-bit word (little-endian packing).
 * Replaces r62[0] = func_136.
 *
 * @param {string} fourByteString - 4 character binary string (or fewer — missing bytes treated as 0)
 * @returns {number} 32-bit integer (may be negative due to JS int32 sign)
 */
function convertBytesToWord(fourByteString) {
  // charCodeAt returns NaN for out-of-bounds indices; NaN|0 = 0, NaN<<N = 0
  // This naturally zero-pads short inputs (matching VM behavior)
  const b0 = fourByteString.charCodeAt(0) || 0;
  const b1 = fourByteString.charCodeAt(1) || 0;
  const b2 = fourByteString.charCodeAt(2) || 0;
  const b3 = fourByteString.charCodeAt(3) || 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

/**
 * Modified XTEA cipher round. Transforms a 2-word pair in-place.
 * Replaces r46[0] = func_204.
 *
 * Algorithm: Standard XTEA structure (Feistel network) with 32 rounds,
 * but with key-index-dependent constant additions:
 *   - When key index == 1: add KEY_MOD_1 (2368517) to the key value
 *   - When key index == 3: add KEY_MOD_3 (592130) to the key value
 *   - Otherwise: use key value unmodified
 *
 * JS semantics notes:
 *   - `<<` and `>>>` truncate to 32 bits (int32/uint32) before shifting
 *   - `+` does NOT truncate — values can exceed 32-bit range
 *   - `^` truncates both operands to int32
 *   - The sum counter is NOT truncated (reaches 84941944608 after 32 rounds)
 *   - Output v0/v1 may exceed 32-bit range (the serializer extracts low 32 bits)
 *
 * @param {number[]} r9 - Two-element array [word0, word1], modified in-place
 * @param {number[]} r92 - Unused parameter (dead code in VM, passed as [undefined×4])
 */
function cipherRound(r9, r92) {
  let v0 = r9[0];
  let v1 = r9[1];
  let sum = 0;

  while (sum !== TARGET_SUM) {
    // v0 update: key indexed by (sum & 3)
    const idx0 = sum & 3;
    let k0 = STATE_A[idx0];
    if (idx0 === 1) k0 += KEY_MOD_1;
    else if (idx0 === 3) k0 += KEY_MOD_3;

    v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);

    // Sum update (no truncation — JS number stays in safe integer range)
    sum += DELTA;

    // v1 update: key indexed by ((sum >>> 11) & 3)
    const idx1 = (sum >>> 11) & 3;
    let k1 = STATE_A[idx1];
    if (idx1 === 1) k1 += KEY_MOD_1;
    else if (idx1 === 3) k1 += KEY_MOD_3;

    v1 += (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);
  }

  r9[0] = v0;
  r9[1] = v1;
}

/**
 * Convert a 32-bit word to a 4-byte binary string (little-endian extraction).
 * Replaces r90[0] = func_140.
 *
 * Uses `>>` (signed right shift) for bytes 1-3, matching the VM's behavior.
 * The `& 0xFF` mask extracts the low byte regardless of sign.
 *
 * @param {number} word - 32-bit integer (may be negative or exceed 32-bit range)
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
 * Encrypt a binary string using the cipher.
 * Replaces func_271's inner loop (Region 3).
 *
 * Processes input in 8-byte blocks:
 *   1. Split into two 4-byte chunks
 *   2. Convert each chunk to a 32-bit word (LE)
 *   3. Apply cipher round to the word pair
 *   4. Convert words back to bytes and append to output
 *
 * If input length is not a multiple of 8, the last block is zero-padded
 * (naturally, via charCodeAt returning NaN for out-of-bounds indices).
 *
 * Output length is always rounded up to the next multiple of 8.
 *
 * @param {string} inputBytes - Binary string to encrypt
 * @returns {string} Encrypted binary string
 */
function encrypt(inputBytes) {
  let output = '';
  // Pad length to next multiple of 8
  const paddedLen = Math.ceil(inputBytes.length / 8) * 8;

  for (let pos = 0; pos < paddedLen; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    const r9 = [convertBytesToWord(slice1), convertBytesToWord(slice2)];
    cipherRound(r9, []);

    output += convertWordToBytes(r9[0]) + convertWordToBytes(r9[1]);
  }

  return output;
}

/**
 * Encrypt multiple input chunks and return base64-encoded segments.
 * Replaces the 4× func_271 invocations in func_114.
 *
 * Each chunk is encrypted independently (ECB-mode — no chaining between chunks).
 * The key schedule produces constant state, so each invocation is independent.
 *
 * @param {string[]} inputChunks - Array of binary strings to encrypt
 * @returns {string[]} Array of base64-encoded encrypted segments
 */
function encryptSegments(inputChunks) {
  return inputChunks.map(chunk => {
    const encrypted = encrypt(chunk);
    // Use Buffer.from for Node.js btoa equivalent
    return Buffer.from(encrypted, 'binary').toString('base64');
  });
}

/**
 * Pluggable encrypt function for outer-pipeline.js.
 * Takes 4 input chunks and returns 4 base64 segments.
 *
 * @param {string[]} chunks - Array of 4 binary strings [hash, header, data, signature]
 * @returns {string[]} Array of 4 base64 strings
 */
function encryptFn(chunks) {
  return encryptSegments(chunks);
}

// ═══════════════════════════════════════════════════════════════════════
// Decryption (reverse of cipherRound — for pipeline verification)
// ═══════════════════════════════════════════════════════════════════════

/**
 * XTEA decryption round — reverses cipherRound.
 * Processes a 2-word pair in-place using the inverse operations.
 *
 * @param {number[]} r9 - Two-element array [word0, word1], modified in-place
 */
function decipherRound(r9) {
  let v0 = r9[0];
  let v1 = r9[1];
  let sum = TARGET_SUM;

  while (sum !== 0) {
    // Reverse v1 update: undo v1 += (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1)
    const idx1 = (sum >>> 11) & 3;
    let k1 = STATE_A[idx1];
    if (idx1 === 1) k1 += KEY_MOD_1;
    else if (idx1 === 3) k1 += KEY_MOD_3;
    v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);

    // Reverse sum update
    sum -= DELTA;

    // Reverse v0 update: undo v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0)
    const idx0 = sum & 3;
    let k0 = STATE_A[idx0];
    if (idx0 === 1) k0 += KEY_MOD_1;
    else if (idx0 === 3) k0 += KEY_MOD_3;
    v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);
  }

  r9[0] = v0;
  r9[1] = v1;
}

/**
 * Decrypt a binary string using the cipher (reverse of encrypt).
 *
 * @param {string} inputBytes - Encrypted binary string
 * @returns {string} Decrypted binary string
 */
function decrypt(inputBytes) {
  let output = '';
  for (let pos = 0; pos < inputBytes.length; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    const r9 = [convertBytesToWord(slice1), convertBytesToWord(slice2)];
    decipherRound(r9);

    output += convertWordToBytes(r9[0]) + convertWordToBytes(r9[1]);
  }
  return output;
}

/**
 * Decrypt base64 segments back to plaintext strings.
 * Inverse of encryptSegments.
 *
 * @param {string[]} base64Segments - Array of base64-encoded encrypted segments
 * @returns {string[]} Array of decrypted plaintext strings (may have trailing padding)
 */
function decryptSegments(base64Segments) {
  return base64Segments.map(b64 => {
    const encrypted = Buffer.from(b64, 'base64').toString('binary');
    return decrypt(encrypted);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  // Core functions (for unit testing)
  convertBytesToWord,
  cipherRound,
  convertWordToBytes,
  encrypt,
  encryptSegments,
  decrypt,
  decryptSegments,
  decipherRound,

  // Pluggable interface for outer-pipeline.js
  encryptFn,

  // Constants (for reference/testing)
  STATE_A,
  DELTA,
  TARGET_SUM,
  KEY_MOD_1,
  KEY_MOD_3,
};
