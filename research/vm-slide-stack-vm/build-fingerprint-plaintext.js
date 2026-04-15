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
//      (pcs 23995..24161). Before the join, the schema array is shuffled
//      in place by `arr.sort(cmp)` at pc 23949, where `cmp` is fn 23898 —
//      a closure whose body literally returns `Math.random() > 0.5 ? 1 : -1`
//      (the well-known JS Fisher-Yates anti-pattern). Verified by walking
//      fn 23898's body [23898..23944]: OP_41/OP_02 calls Math.random,
//      OP_08 0.5 + OP_31 compares to 0.5, OP_60 23941 branches, the taken
//      arm pushes `1` and the not-taken arm pushes `-1`. See
//      SORT-ORDER-RESOLUTION.md for the full pseudocode and pc citations.
//
//      The join order is therefore non-deterministic at vm-slide runtime
//      (a uniformly-random-ish shuffle of the 8 schema entries). For the
//      reference impl we accept either an explicit `order` array OR an
//      `obj` whose own enumeration order already matches the desired join
//      order — the default uses `Object.keys(obj)`, which JS preserves
//      in insertion order for string keys. Both committed fixtures are
//      reproduced byte-identically with the obj built in observed order.
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
// of fn 22317 (exports.getCaptchaData) in literal source order. The .sort()
// call at pc 23949 uses a randomised comparator (fn 23898), so the live
// runtime emits a uniformly-shuffled permutation of these 8 keys per call.
// The "alphabetical" name retained below is historical and slightly
// misleading — the array IS alphabetical, but only by coincidence of the
// schema; the comparator does not enforce ordering.
const FIELD_NAMES_LITERAL = ['tp', 'key', 'py', 'env', 'version', 'cLod', 'inf', 'ss'];
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

// Top-level API. Given an `obj` (and optionally an explicit `order`),
// returns the 112-byte Buffer that fn 22317 hands to XTEA via module 40's
// encryptData.
//
//   obj   — object containing all 8 fingerprint fields. When `order` is
//           omitted the join order defaults to `Object.keys(obj)`, i.e.
//           the obj's own insertion order. JS preserves insertion order
//           for string keys, so the caller can express any desired join
//           order simply by building the obj with keys in that order.
//   order — optional explicit override. When supplied, it is used verbatim
//           and the obj's insertion order is ignored. Useful for replaying
//           a captured fixture whose obj was reconstructed key-by-key.
//
// Note on the missing "default sort": fn 22317's runtime uses
// `arr.sort(Math.random()>0.5?1:-1)` (see SORT-ORDER-RESOLUTION.md and the
// header comment above), so the join order is not statically derivable.
// The reference impl therefore delegates the choice of order to the caller
// — either via an explicitly-ordered `obj` or via the `order` override.
function buildFingerprintPlaintext(input) {
  const { obj, order } = input;
  const effectiveOrder = order || Object.keys(obj);
  const joined = buildJoined(obj, effectiveOrder);
  const padded = padToBlock(joined);
  const permuted = permuteBlocks(padded);
  return Buffer.from(permuted, 'latin1');
}

module.exports = {
  PAD_ALPHABET,
  PERM,
  FIELD_NAMES_LITERAL,
  FIELD_NAMES_ALPHABETICAL,
  FIELD_ORDER_JSDOM,
  FIELD_ORDER_HAR,
  padToBlock,
  permuteBlocks,
  buildJoined,
  buildFingerprintPlaintext,
};
