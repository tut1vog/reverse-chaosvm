'use strict';

// Phase 45.2 — `buildVDataForPost` entry point. Fourth public mode of
// tools/vdata-generator/ alongside encodeVData (cipher-only), buildVData
// (replay-with-substitution), and buildVDataFromObj (full synthesis).
//
// This is the scraper-facing API: feed it the pre-vData verify POST body
// and a browser-like profile object, and it returns the 152-char vData
// string with `obj.key` computed per-body via computeKeyField (the 45.1a
// port of vm-slide module 18 + fn 22730). The profile supplies the other
// 7 fields; see `research/vm-slide-stack-vm/PHASE-45-FIELD-SOURCES.md` §3
// for the canonical browser-default shape and per-field justifications.
//
// See `tools/vdata-generator/README.md` for the full mode overview.

const { computeKeyField } = require('./build-key-field.js');
const { buildVDataFromObj } = require('./build-from-obj.js');

const COMPUTED_KEY_SENTINEL = '__COMPUTED__';
const REQUIRED_PROFILE_FIELDS = [
  'tp', 'py', 'env', 'version', 'cLod', 'inf', 'ss',
];

/**
 * Build a vData string for a specific POST body using a browser-like profile.
 *
 * The `key` field is always computed from the body via `computeKeyField`
 * (the 45.1a port of vm-slide module 18 + fn 22730). The other 7 fields come
 * from `profile` and may be selectively overridden via `overrides`. Any
 * attempt to override `key` throws — callers must not supply a key, because a
 * body-independent key would be a trivial server-side detector (see
 * `PHASE-45-FIELD-SOURCES.md` §1, `key` row).
 *
 * @param {string} postBody - pre-vData verify POST body. Must contain
 *   `tlg=<digits>` and `sess=<string>` substrings; see "Caller preconditions"
 *   in `tools/vdata-generator/README.md`.
 * @param {object} options
 * @param {object} options.profile - 8-field fingerprint profile (7 required
 *   fields plus an optional `key` slot that must be absent or equal to
 *   `'__COMPUTED__'`).
 * @param {object} [options.overrides] - optional per-field overrides merged
 *   on top of `profile`. Must NOT contain `key`.
 * @param {string[]} [options.order] - optional explicit join-order passed
 *   through to `buildVDataFromObj`. When omitted, the from-obj builder uses
 *   its default nondeterministic shuffle.
 * @param {boolean} [options.ie9Fallback=false] - simulate the `require(0)()`
 *   falsy branch of fn 22730 (hardcoded `[4, 2, 3, 10]` digits). Leave false
 *   for normal scraper use.
 * @returns {string} the 152-char vData string.
 */
function buildVDataForPost(postBody, options) {
  if (typeof postBody !== 'string' || postBody.length === 0) {
    throw new TypeError('buildVDataForPost: postBody must be a non-empty string');
  }
  if (!options || typeof options !== 'object') {
    throw new TypeError('buildVDataForPost: options must be an object');
  }

  const { profile, overrides, order, ie9Fallback } = options;

  if (!profile || typeof profile !== 'object') {
    throw new TypeError('buildVDataForPost: options.profile must be an object');
  }

  for (let i = 0; i < REQUIRED_PROFILE_FIELDS.length; i++) {
    const name = REQUIRED_PROFILE_FIELDS[i];
    if (!Object.prototype.hasOwnProperty.call(profile, name)) {
      throw new TypeError(
        'buildVDataForPost: profile is missing required field "' + name + '"'
      );
    }
  }

  if (Object.prototype.hasOwnProperty.call(profile, 'key')) {
    if (profile.key !== COMPUTED_KEY_SENTINEL) {
      throw new TypeError(
        'buildVDataForPost: profile.key must be absent or equal to the ' +
        '"__COMPUTED__" sentinel; computed key is always derived from the ' +
        'POST body. Got: ' + JSON.stringify(profile.key)
      );
    }
  }

  if (overrides != null) {
    if (typeof overrides !== 'object') {
      throw new TypeError('buildVDataForPost: options.overrides must be an object');
    }
    if (Object.prototype.hasOwnProperty.call(overrides, 'key')) {
      throw new TypeError(
        'buildVDataForPost: overrides.key is not allowed — the key field is ' +
        'always computed from the POST body'
      );
    }
  }

  const key = computeKeyField(postBody, { ie9Fallback: !!ie9Fallback });

  const merged = overrides
    ? Object.assign({}, profile, overrides)
    : Object.assign({}, profile);
  merged.key = key;

  const input = { obj: merged };
  if (order !== undefined) input.order = order;

  return buildVDataFromObj(input);
}

module.exports = {
  buildVDataForPost,
  COMPUTED_KEY_SENTINEL,
};
