'use strict';

// Phase 45.2 — port of vm-slide webpack module 18 (`tlg`/`sess` body-field
// parser) and the fn 22730 + caller-loop composite that computes `obj.key`
// for the vData plaintext.
//
// Ported verbatim from the 45.1a reference implementation, which reproduces
// the HAR oracle `obj.key = "21L2"` byte-identically. The pc-level evidence
// for the two module-18 call sites:
//
//   - `require(18)(body, "tlg")`  — pcs 22814..22820 inside fn 22730
//     (literal `"tlg"` assembled by `OP_10 116 / 108 / 103` then `OP_66 2`).
//   - `require(18)(body, "sess")` — pcs 23014..23022 inside fn 22317
//     (literal `"sess"` assembled by `OP_10 115 / 101 / 115 / 115` then
//     `OP_66 2`), followed by `OP_60 23056` short-circuiting the
//     `|| "abcdefghijklmn"` fallback.
//
// Semantics:
//   - Raw substring lookup between `&<tag>=` (or leading `<tag>=`) and the
//     next `&` / EOF. NO URL-decoding — the downstream charAt walk is
//     byte-indexed, and decoding would corrupt it.
//   - Returns `''` on missing tag or falsy input.
//   - fn 22730 maps `tlg`'s digits to charset indices via
//     `split('').map(c => parseInt(c, 10))`, falling back to
//     `[4, 2, 3, 10]` when `require(0)()` is falsy (the IE9-fallback path).
//   - The `sess` value (or the literal `"abcdefghijklmn"` fallback) is the
//     charset. The final key is `digits.map(d => charset.charAt(d)).join('')`.
//
// Preserving the URL-decoding invariant is load-bearing: the HAR oracle only
// reproduces `"21L2"` if `sess` is walked as raw bytes.

/**
 * Extract a top-level form-field value from a URL-encoded body, WITHOUT
 * URL-decoding the value. Matches vm-slide's `require(18)(body, tag)`
 * behaviour verbatim.
 *
 * @param {string} body - verify POST body (pre-vData-injection is ideal, but
 *   tail-appended `&vData=...` is tolerated since `tlg` / `sess` never sit at
 *   the tail).
 * @param {string} tag - field name to extract, e.g. `'tlg'` or `'sess'`.
 * @returns {string} raw value bytes, or `''` if the tag is absent / inputs
 *   are falsy. Never `undefined` / `null`.
 */
function lookupFormField(body, tag) {
  if (typeof body !== 'string' || body.length === 0) return '';
  if (typeof tag !== 'string' || tag.length === 0) return '';

  let valueStart;
  const headKey = tag + '=';
  if (body.length >= headKey.length && body.slice(0, headKey.length) === headKey) {
    valueStart = headKey.length;
  } else {
    const needle = '&' + headKey;
    const idx = body.indexOf(needle);
    if (idx === -1) return '';
    valueStart = idx + needle.length;
  }

  let valueEnd = body.indexOf('&', valueStart);
  if (valueEnd === -1) valueEnd = body.length;

  return body.slice(valueStart, valueEnd);
}

/**
 * Port of fn 22730 + the pcs 23240..23328 caller-side accumulator loop. Builds
 * `obj.key` from a POST body by walking `tlg`'s decimal digits as indices into
 * the `sess` charset (or the `"abcdefghijklmn"` fallback when `sess` is empty).
 *
 * @param {string} body - verify POST body the scraper is about to send.
 * @param {object} [options]
 * @param {boolean} [options.ie9Fallback=false] - when true, take the
 *   `require(0)()` falsy branch and substitute the hardcoded digit array
 *   `[4, 2, 3, 10]` instead of parsing `tlg`. In HAR the truthy branch is the
 *   real one (env = `'0'`); callers should leave this false unless
 *   specifically simulating the IE9 path.
 * @returns {string} the computed `obj.key`. Length matches the digit array
 *   length (usually the length of the `tlg` value). Empty if `tlg` is
 *   missing on the happy path.
 */
function computeKeyField(body, options) {
  const opts = options || {};
  const ie9Fallback = !!opts.ie9Fallback;

  const sessRaw = lookupFormField(body, 'sess');
  const charset = sessRaw === '' ? 'abcdefghijklmn' : sessRaw;

  let digits;
  if (ie9Fallback) {
    digits = [4, 2, 3, 10];
  } else {
    const tlg = lookupFormField(body, 'tlg');
    digits = tlg === ''
      ? []
      : tlg.split('').map(function (c) { return parseInt(c, 10); });
  }

  let out = '';
  for (let i = 0; i < digits.length; i++) {
    out += charset.charAt(digits[i]);
  }
  return out;
}

module.exports = {
  lookupFormField,
  computeKeyField,
};
