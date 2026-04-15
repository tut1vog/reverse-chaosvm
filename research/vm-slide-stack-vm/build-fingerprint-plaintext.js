'use strict';

// Phase 44.4 — reference reimplementation of vm-slide's plaintext pipeline
// for the cipher half of `vData`. NOT a production tool — a verification
// artifact. 44.5b owns productization into `tools/vdata-generator/`.
//
// Pipeline (static analysis of bytecode, fn 22317 + webpack module 40):
//
//   1. fn 22317 (exports.getCaptchaData) builds an 8-field object
//      `{cLod, env, inf, key, py, ss, tp, version}`. Field names are
//      hardcoded in fn 22317 at pcs 23755..23880 (see FINGERPRINT-SCHEMA.md).
//   2. fn 22317 joins `key + "=" + obj[key]` for each field with "&"
//      (pcs 23995..24161). The field ORDER at the join boundary is NOT
//      pure alphabetical even though a .sort() call is present at pc 23949
//      — HAR fixture observably ships `[inf,env,tp,cLod,version,key,ss,py]`,
//      jsdom ships `[inf,env,tp,key,py,ss,cLod,version]`. The join order is
//      therefore a caller-supplied input to this reference implementation,
//      not a fixed schema. Both are tracked as `FIELD_ORDER_JSDOM` /
//      `FIELD_ORDER_HAR` below for the cross-check fixtures.
//   3. fn 22317 calls `module40.encryptData(joined)` at pc 24163. Module
//      40's encryptData (entry pc 13860) chains:
//        step1 = padder(joined)        // fn 13989, entry pc 13989
//        step2 = permuter(step1)       // fn 14153, entry pc 14153
//        ciphertext = module41.encrypt(step2, KEY_HEX)
//      Module 41 is classical XTEA (factory entry pc 15220, inner block
//      cipher at pc 15241) — Phase 43's cipher.
//   4. fn 22317 then base64-encodes the ciphertext via module 42's
//      `.default.encode` (slot 21) at pc 24165 — Phase 43's custom
//      65-char alphabet with index 64 as padding.
//
// This file implements steps 1–2 (kv build + padder + permuter) and
// returns the 112-byte plaintext that is the input to Phase 43's
// `encodeVData`. Feeding the output to `encodeVData` reproduces the
// fixture vData byte-for-byte for both committed fixtures.
//
// See research/vm-slide-stack-vm/FINGERPRINT-SCHEMA.md for the
// per-field source-rule table and the bytecode pcs that back each claim.

// fn 13989's padding character lookup table, built at pcs 14032..14064 as
// the chars "0abcdefghijklmnop" (17 chars). padLen is used as the index.
const PAD_ALPHABET = '0abcdefghijklmnop';

// fn 14153's ShiftRows-style 16-byte permutation, built at pcs 14240..14377
// as `arr[k] = K` for K = [0,4,8,12, 5,9,13,1, 10,14,2,6, 15,3,7,11].
// Laid out on a 4x4 column-major matrix this is AES's ShiftRows step:
//   row 0: 0, 4, 8,12    (shift 0 — no rotation)
//   row 1: 5, 9,13, 1    (shift 1)
//   row 2:10,14, 2, 6    (shift 2)
//   row 3:15, 3, 7,11    (shift 3)
// The transform's output[i+k] = input[i + PERM[k]] for each 16-byte block.
const PERM = [0, 4, 8, 12, 5, 9, 13, 1, 10, 14, 2, 6, 15, 3, 7, 11];

// Hardcoded 8 fingerprint field names, built inline at pcs 23755..23880
// of fn 22317 (exports.getCaptchaData). Alphabetical sorted order is what
// fn 22317's .sort() call at pc 23949 requests; observed fixtures show the
// actual shipped order differs (see FIELD_ORDER_* below).
const FIELD_NAMES_ALPHABETICAL = ['cLod', 'env', 'inf', 'key', 'py', 'ss', 'tp', 'version'];

// Observed field orders for the two committed fixtures. These are empirical
// outputs from inverting the permuter on the stored plaintext — they are
// the ground truth of what each fixture's vm-slide run joined, even though
// they don't match the .sort() comparator's expected alphabetical output.
// See FINGERPRINT-SCHEMA.md §"Field-order discrepancy" for notes.
const FIELD_ORDER_JSDOM = ['inf', 'env', 'tp', 'key', 'py', 'ss', 'cLod', 'version'];
const FIELD_ORDER_HAR = ['inf', 'env', 'tp', 'cLod', 'version', 'key', 'ss', 'py'];

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
// unchanged when misaligned — we replicate that behavior, though it is
// unreachable in practice because the padder always produces aligned
// input.
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

// Top-level API. Given an {obj, order} pair, returns the 112-byte Buffer
// that fn 22317 hands to XTEA via module 40's encryptData.
//
//   obj   — object containing all 8 fingerprint fields
//   order — array of field names in the order fn 22317's sort step
//           produced for this run (observed, not assumed)
function buildFingerprintPlaintext(input) {
  const { obj, order } = input;
  const joined = buildJoined(obj, order);
  const padded = padToBlock(joined);
  const permuted = permuteBlocks(padded);
  return Buffer.from(permuted, 'latin1');
}

module.exports = {
  PAD_ALPHABET,
  PERM,
  FIELD_NAMES_ALPHABETICAL,
  FIELD_ORDER_JSDOM,
  FIELD_ORDER_HAR,
  padToBlock,
  permuteBlocks,
  buildJoined,
  buildFingerprintPlaintext,
};
