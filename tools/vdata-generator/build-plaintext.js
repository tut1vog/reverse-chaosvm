'use strict';

// Phase 44.5a — productized port of vm-slide's pre-cipher plaintext builder
// (kv-build → PKCS#7-style pad → ShiftRows-style permute). Input to Phase
// 43's encodeVData. The reference implementation lives at
// research/vm-slide-stack-vm/build-fingerprint-plaintext.js; per
// .claude/rules/research-artifacts.md we copy the logic into tools/ rather
// than importing across the research/tools boundary.
//
// Pipeline (static analysis of bytecode, fn 22317 + webpack module 40):
//
//   1. fn 22317 (exports.getCaptchaData) builds an 8-field object
//      `{tp, key, py, env, version, cLod, inf, ss}` and joins
//      `key + "=" + obj[key]` for each field with "&". Before the join, the
//      schema array is shuffled in place by `arr.sort(cmp)` at pc 23949,
//      where `cmp` is fn 23898 — a closure whose body literally returns
//      `Math.random() > 0.5 ? 1 : -1`. The join order is therefore
//      non-deterministic at vm-slide runtime; the caller supplies the order
//      explicitly here (or relies on `Object.keys(obj)` insertion order).
//   2. fn 22317 calls `module40.encryptData(joined)`, whose chain is
//      step1 = padder(joined)  (fn 13989, padding alphabet "0abcdefghijklmnop")
//      step2 = permuter(step1) (fn 14153, ShiftRows-style 16-byte permute)
//      ciphertext = module41.encrypt(step2, KEY_HEX)  (Phase 43 XTEA).
//
// This file owns steps 1 (kv build) and 2 (pad + permute), returning the
// 112-byte Buffer that is the input to Phase 43's encodeVData.

// fn 13989's padding-character lookup table, built at pcs 14032..14064 as
// the chars "0abcdefghijklmnop" (17 chars). padLen is used as the index.
const PAD_ALPHABET = '0abcdefghijklmnop';

// fn 14153's ShiftRows-style 16-byte permutation, built at pcs 14240..14377
// as `arr[k] = K` for K = [0,4,8,12, 5,9,13,1, 10,14,2,6, 15,3,7,11].
// Laid out on a 4x4 column-major matrix this is AES's ShiftRows step.
const PERM = [0, 4, 8, 12, 5, 9, 13, 1, 10, 14, 2, 6, 15, 3, 7, 11];

// Hardcoded 8 fingerprint field names, built inline at pcs 23755..23880 of
// fn 22317 (exports.getCaptchaData) in literal source order.
const FIELD_NAMES_LITERAL = ['tp', 'key', 'py', 'env', 'version', 'cLod', 'inf', 'ss'];

// fn 13989 — PKCS#7-style padder with lookup-table pad char.
//   padLen = 16 - (input.length % 16)     // always in [1, 16], never 0
//   output = input + PAD_ALPHABET[padLen].repeat(padLen)
// Verified at bytecode pcs 14022..14139.
function padToBlock(input) {
  const rem = input.length % 16;
  const padLen = 16 - rem; // always [1,16]; when aligned, padLen=16 (full block)
  const ch = PAD_ALPHABET[padLen];
  let out = input;
  for (let i = 0; i < padLen; i++) out += ch;
  return out;
}

// fn 14153 — ShiftRows-style 16-byte block permutation.
//   for each 16-byte block at offset i:
//     for k in 0..15:
//       output[i+k] = input[i + PERM[k]]
// The `(length % 16) !== 0` guard at pcs 14195..14213 returns the input
// unchanged when misaligned — replicated here, though it is unreachable in
// practice because the padder always produces aligned input.
function permuteBlocks(input) {
  if (input.length % 16 !== 0) return input;
  let out = '';
  for (let i = 0; i < input.length; i += 16) {
    let block = '';
    for (let k = 0; k < 16; k++) block += input[i + PERM[k]];
    out += block;
  }
  return out;
}

// Build the joined kv string from an {obj, order} pair. Matches fn 22317's
// 8-iteration loop at pcs 23995..24161 (`kvArr[i] = key + "=" + obj[key]`,
// then `kvArr.join("&")`).
function buildJoined(obj, order) {
  const parts = [];
  for (const k of order) parts.push(k + '=' + String(obj[k]));
  return parts.join('&');
}

// Top-level. Given an `obj` (and optionally an explicit `order`), returns
// the 112-byte Buffer that fn 22317 hands to XTEA via module 40's
// encryptData.
//
//   obj   — object containing all 8 fingerprint fields. When `order` is
//           omitted the join order defaults to `Object.keys(obj)`.
//   order — optional explicit override. When supplied, used verbatim.
function buildPlaintext(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildPlaintext: input must be {obj, order?}');
  }
  const { obj, order } = input;
  if (!obj || typeof obj !== 'object') {
    throw new TypeError('buildPlaintext: obj must be an object');
  }
  const effectiveOrder = order || Object.keys(obj);
  if (!Array.isArray(effectiveOrder)) {
    throw new TypeError('buildPlaintext: order must be an array');
  }
  const joined = buildJoined(obj, effectiveOrder);
  const padded = padToBlock(joined);
  const permuted = permuteBlocks(padded);
  return Buffer.from(permuted, 'latin1');
}

module.exports = {
  PAD_ALPHABET,
  PERM,
  FIELD_NAMES_LITERAL,
  padToBlock,
  permuteBlocks,
  buildJoined,
  buildPlaintext,
};
