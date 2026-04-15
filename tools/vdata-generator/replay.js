'use strict';

// Phase 44.5a — replay-with-substitution vData builder. Composes the
// pre-cipher plaintext builder (build-plaintext.js, ported from
// research/vm-slide-stack-vm/build-fingerprint-plaintext.js) with the Phase
// 43 cipher encoder (encode.js) into one entry point.
//
// This is NOT from-scratch synthesis. It takes a captured 8-field
// fingerprint object, optionally merges in an override map, joins fields in
// the supplied order, pads + permutes, then runs XTEA + custom base64 to
// emit a 152-char vData string. Both committed fixtures round-trip
// byte-identically through this path (see cli.js --self-check).
//
// A future from-scratch builder (no captured obj required) is planned as
// task 44.5b.

const { buildPlaintext } = require('./build-plaintext.js');
const { encodeVData } = require('./encode.js');

// Top-level replay entry point.
//
//   obj       — captured 8-field fingerprint object
//               ({tp, key, py, env, version, cLod, inf, ss}). Required.
//   order     — optional explicit join-order array. When omitted the order
//               defaults to `Object.keys(merged)` (insertion order of the
//               post-override object).
//   overrides — optional object of field -> replacement value. Merged
//               on top of `obj` via `{...obj, ...overrides}` before the
//               plaintext build. Useful for substituting individual fields
//               (e.g. swapping the user-agent-derived `tp` value).
//
// Returns the 152-char vData string.
function buildVData(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('buildVData: input must be {obj, order?, overrides?}');
  }
  const { obj, order, overrides } = input;
  if (!obj || typeof obj !== 'object') {
    throw new TypeError('buildVData: obj must be an object');
  }
  const merged = overrides && typeof overrides === 'object'
    ? Object.assign({}, obj, overrides)
    : obj;
  const plaintext = buildPlaintext({ obj: merged, order });
  return encodeVData(plaintext);
}

module.exports = {
  buildVData,
};
