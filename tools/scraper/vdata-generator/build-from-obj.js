'use strict';

// Phase 44.5b — full-synthesis from-scratch vData builder. Replicates fn
// 22317's runtime behavior end-to-end: construct the 8-field schema array
// in literal source order, shuffle it via `arr.sort(() => rng() > 0.5 ? -1
// : 1)` (matching fn 23898's comparator body exactly), then hand the
// ordered list to 44.5a's buildPlaintext and the Phase 43 encoder.
//
// Runtime evidence (original fn-20539 entry trace): §4d-4f for the schema
// array and §5 for the per-run randomised comparator (category iii).
//
// Unlike 44.5a's replay wrapper, this entry point does NOT require a
// caller-supplied `order` — by default the join order is chosen at call
// time by a live RNG. That matches vm-slide's actual behavior at runtime,
// but makes it nondeterministic: different invocations produce different
// (equally valid) vData strings.
//
// Two escape hatches for deterministic use:
//
//   seed   — optional integer. When supplied, swaps `Math.random` for an
//            inline mulberry32 PRNG seeded with this value. Pure-JS, no
//            dependencies. Deterministic for a given seed but the exact
//            comparator-call sequence Node's TimSort makes means the
//            mapping from seed -> final order is NOT obvious; see the
//            seeded-PRNG fixture-reproduction note below.
//
//   order  — optional explicit array of field names. When supplied, the
//            shuffle is skipped entirely and `order` is used verbatim.
//            This is the reliable deterministic path and is how
//            --self-check reproduces the committed fixtures byte-for-byte.
//
// Seeded-PRNG fixture reproduction (44.5b step 4):
//   A seed sweep of 0..200000 found working seeds for both committed
//   fixtures under Node 20 / V8 TimSort with the exact comparator shape
//   below:
//
//     HAR fixture   order [inf,env,tp,cLod,version,key,ss,py] -> seed 53818
//     jsdom fixture order [inf,env,tp,key,py,ss,cLod,version] -> seed 84121
//
//   These seeds are stable for a given Node major version's sort
//   implementation but are NOT portable across engines (a different sort
//   algorithm would make different comparator calls and produce different
//   orders for the same seed). See output/vdata-generator-smoke/seed-sweep.js
//   for the sweep harness. --self-check uses the jsdom seed as one of the
//   two cases; the other case uses the deterministic --order escape hatch
//   to prove both paths reach the same vData.

const { buildPlaintext } = require('./build-plaintext.js');
const { encodeVData } = require('./encode.js');

// fn 22317's 8-field schema array in literal source order, built inline at
// pcs 23755..23880 of fn 22317 (exports.getCaptchaData). Same constant as
// build-plaintext.js's FIELD_NAMES_LITERAL, duplicated here to keep this
// module self-contained for the top-level `SCHEMA` name used in FN-20539
// docs.
const SCHEMA = ['tp', 'key', 'py', 'env', 'version', 'cLod', 'inf', 'ss'];

// mulberry32 — 32-bit seeded PRNG. ~8 lines, no dependencies. Produces a
// function that returns a double in [0, 1) on each call, matching
// Math.random's contract well enough for the comparator here (the
// comparator only compares against 0.5, so we only care about the high
// bit of the mantissa in practice).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shuffle a copy of SCHEMA using the exact comparator shape from fn 23898:
//   cmp = function () { return Math.random() > 0.5 ? -1 : 1; }
// The comparator ignores its (a, b) arguments. `rng` is `Math.random` by
// default; supply a seeded PRNG for deterministic runs.
function shuffleSchema(rng) {
  const arr = SCHEMA.slice();
  arr.sort(function () {
    return rng() > 0.5 ? -1 : 1;
  });
  return arr;
}

// Top-level from-scratch entry point.
//
//   obj   — object containing all 8 fingerprint fields
//           ({tp, key, py, env, version, cLod, inf, ss}). Required.
//   seed  — optional integer. When set, uses mulberry32(seed) instead of
//           Math.random. Ignored if `order` is also set.
//   order — optional explicit join-order array. When set, shuffle is
//           skipped entirely and this array is used verbatim. This is the
//           deterministic escape hatch used by --self-check.
//
// Returns the 152-char vData string.
function buildVDataFromObj(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildVDataFromObj: input must be {obj, seed?, order?}');
  }
  const { obj, seed, order } = input;
  if (!obj || typeof obj !== 'object') {
    throw new TypeError('buildVDataFromObj: obj must be an object');
  }

  let effectiveOrder;
  if (order != null) {
    if (!Array.isArray(order)) {
      throw new TypeError('buildVDataFromObj: order must be an array');
    }
    effectiveOrder = order;
  } else {
    const rng = seed != null ? mulberry32(seed | 0) : Math.random;
    effectiveOrder = shuffleSchema(rng);
  }

  const plaintext = buildPlaintext({ obj, order: effectiveOrder });
  return encodeVData(plaintext);
}

module.exports = {
  SCHEMA,
  mulberry32,
  shuffleSchema,
  buildVDataFromObj,
};
