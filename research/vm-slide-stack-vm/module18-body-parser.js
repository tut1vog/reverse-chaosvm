'use strict';

// Phase 45.1a — vm-slide webpack module 18 (`tlg` / `sess` body field parser).
//
// Module 18 is the two-argument helper that fn 22317 calls to pull named
// fields out of the verify POST body. It appears twice inside fn 22317's
// `obj.key` accumulator (see research/vm-slide-stack-vm/PHASE-45-FIELD-SOURCES.md
// §2.1 and FINGERPRINT-SCHEMA.md):
//
//     slot8       = require(18)(body, "sess") || "abcdefghijklmn";
//     digitArray  = require(0)()
//                     ? require(18)(body, "tlg").split("").map(function (c) {
//                         return parseInt(c, 10);
//                       })
//                     : [4, 2, 3, 10];
//     obj.key = "";
//     for (var i = 0; i < digitArray.length; i++) {
//       obj.key += slot8.charAt(digitArray[i]);
//     }
//
// The disassembly evidence for the two call sites is in
// output/vm-slide/disassembly-full.txt — the literal `"tlg"` is built at pcs
// 22814..22818 (OP_10 116, OP_10 108, OP_10 103) immediately followed by
// `OP_66 2` (a 2-arg call) at pc 22820, and the literal `"sess"` is built at
// pcs 23014..23020 (OP_10 115, OP_10 101, OP_10 115, OP_10 115) followed by
// `OP_66 2` at pc 23022 and a short-circuit `OP_60 23056` that jumps past
// the `|| "abcdefghijklmn"` fallback.
//
// What module 18 actually does, derived from the HAR oracle:
//
//     lookup(body, tag) ===
//       the substring of `body` between the delimiter `&<tag>=` (or the leading
//       `<tag>=`) and the next `&` or end-of-string, or the empty string if
//       `<tag>=` does not appear as a top-level key in `body`.
//
// In other words: module 18 is a classical query-string field extractor. It
// does NOT URL-decode the value (that would break the `sess` base64-ish blob
// which contains `-` and `_` but happens to decode cleanly here; and more
// importantly the char-lookup downstream is byte-indexed, not code-point
// indexed). It does NOT JSON-parse. It does NOT walk the body more than once.
//
// HAR oracle — tests/fixtures/vdata-har-capture.json records
// `obj.key === "21L2"`, and the verify POST body in sample/captcha-har.har
// ships `tlg=8128` and a 322-byte `sess` that begins with `s1LCq...`. Walking
// the digit array `[8,1,2,8]` over `sess` yields `sess[8]=2`, `sess[1]=1`,
// `sess[2]=L`, `sess[8]=2` → `"21L2"`. Exact match.
//
// See MODULE-18-BODY-PARSER.md for the full decompile, tag table, edge cases,
// and reproduction proof. Running this file directly re-verifies the HAR oracle
// end-to-end.

const fs = require('fs');
const path = require('path');

/**
 * Extract a top-level form-field value from a URL-encoded body, WITHOUT
 * URL-decoding the value. Matches vm-slide's require(18)(body, tag) behaviour.
 *
 * @param {string} body - verify POST body, the original string the scraper
 *   hands to XMLHttpRequest.send. The `key` accumulator runs inside
 *   fn 22317 BEFORE the XHR monkey-patch at vm-slide fn 20539 pc 20749
 *   appends `&vData=...`, so callers should pass the pre-injection body —
 *   but for `tlg` and `sess` specifically the injection happens at the tail
 *   so either form yields the same lookup result.
 * @param {string} tag - the field name to extract (e.g. "tlg" or "sess").
 * @returns {string} - the raw value bytes, or the empty string if the tag is
 *   absent. Never returns undefined/null — the `|| fallback` idiom at the
 *   call sites tolerates falsy by using the empty string as the falsy value.
 */
function lookup(body, tag) {
  if (typeof body !== 'string' || body.length === 0) return '';
  if (typeof tag !== 'string' || tag.length === 0) return '';

  // Find `<tag>=` as either the very first field (body starts with it) or
  // as a `&<tag>=` delimited field further in. This matches what a real
  // form-urlencoded parser does at the token level — no URL-decoding, no
  // value normalisation, no multi-value merging.
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
 * The fn 22730 + caller-loop composite — builds `obj.key` from a POST body.
 * This is the 45.2 port target; it is exported here so the harness can
 * demonstrate round-trip to the HAR oracle against the live body.
 *
 * Takes the HAR-truthy branch of `require(0)()` (env = '0' in HAR).
 *
 * @param {string} body - the verify POST body.
 * @returns {string} - obj.key (arbitrary length; 4 chars in both committed
 *   fixtures because `tlg` happens to be 4 digits long).
 */
function computeKeyField(body) {
  // fn 22730 happy path: require(18)(body, "tlg").split("").map(parseInt10).
  const tlg = lookup(body, 'tlg');
  const digitArray = tlg === ''
    ? [] // pc 22972..23004 `|| new Array()` fallback — produces empty key.
    : tlg.split('').map(function (c) { return parseInt(c, 10); });

  // Caller-side pcs 23007..23056: `require(18)(body, "sess") || "abcdefghijklmn"`.
  const sessRaw = lookup(body, 'sess');
  const charset = sessRaw === '' ? 'abcdefghijklmn' : sessRaw;

  // Caller-side pcs 23240..23328: string-concat loop over digit indices.
  let out = '';
  for (let i = 0; i < digitArray.length; i++) {
    out += charset.charAt(digitArray[i]);
  }
  return out;
}

module.exports = {
  lookup,
  computeKeyField,
};

// ---------------------------------------------------------------------------
// Self-check harness — runs when the file is executed directly.
// ---------------------------------------------------------------------------
if (require.main === module) {
  const ROOT = path.resolve(__dirname, '..', '..');
  const HAR_PATH = path.join(ROOT, 'sample', 'captcha-har.har');
  const FIXTURE_PATH = path.join(ROOT, 'tests', 'fixtures', 'vdata-har-capture.json');

  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));
  let verifyBody = null;
  for (const entry of har.log.entries) {
    if (entry.request.url.indexOf('cap_union_new_verify') !== -1) {
      verifyBody = (entry.request.postData && entry.request.postData.text) || '';
      break;
    }
  }
  if (verifyBody === null) {
    console.error('FAIL: could not find cap_union_new_verify POST in HAR');
    process.exit(1);
  }

  // The `key` accumulator runs inside fn 22317 via the XHR monkey-patch at
  // vm-slide fn 20539, BEFORE pc 20751 appends `&vData=...`. Strip any
  // vData we see so we exactly match the bytes module 18 saw live. For the
  // `tlg`/`sess` lookup specifically, `vData` is appended at the tail of the
  // body so stripping is a no-op for these two tags, but we do it anyway so
  // the harness is robust for other tags.
  const preInjectionBody = verifyBody.replace(/&vData=[^&]*$/, '');

  const sessValue = lookup(preInjectionBody, 'sess');
  const tlgValue = lookup(preInjectionBody, 'tlg');
  const digitArray = tlgValue.split('').map(function (c) { return parseInt(c, 10); });
  const computedKey = computeKeyField(preInjectionBody);

  // The HAR oracle — the committed fixture
  // tests/fixtures/vdata-har-capture.json records the decrypted 112-byte
  // vData plaintext as (after inverting fn 14153's ShiftRows permutation,
  // see FINGERPRINT-SCHEMA.md):
  //   "inf=iframe&env=0&tp=...&cLod=loadTDC&version=2&key=21L2&ss=...&py=0..."
  // The `key=21L2` segment is the ground truth this harness must reproduce
  // from the HAR body via module 18's lookup helper. It is also reachable
  // indirectly as fixture.har_decrypted_plaintext_ascii after inverting the
  // permutation, but we assert against the literal here because the literal
  // IS the reconciliation contract.
  const expectedKey = '21L2';

  // Cross-check the fixture is internally consistent — the (permuted)
  // plaintext must contain the four characters of expectedKey somewhere,
  // even though not contiguously. This catches fixture corruption.
  const permPlaintext = require(FIXTURE_PATH).har_decrypted_plaintext_ascii || '';
  for (const ch of expectedKey) {
    if (permPlaintext.indexOf(ch) === -1) {
      console.error('FAIL: fixture plaintext does not contain char of expectedKey:', ch);
      process.exit(1);
    }
  }

  console.log('verify POST body length:      ', verifyBody.length);
  console.log('pre-injection body length:    ', preInjectionBody.length);
  console.log('first 80 bytes:               ', preInjectionBody.slice(0, 80));
  console.log('lookup(body, "tlg"):          ', JSON.stringify(tlgValue));
  console.log('lookup(body, "sess") length:  ', sessValue.length);
  console.log('lookup(body, "sess") first 40:', JSON.stringify(sessValue.slice(0, 40)));
  console.log('digit array from tlg:         ', digitArray);
  console.log('charAt walk:                  ',
    digitArray.map(function (d) {
      return d + '->' + JSON.stringify(sessValue.charAt(d));
    }).join(', '));
  console.log('computed obj.key:             ', JSON.stringify(computedKey));
  console.log('expected obj.key (HAR oracle):', JSON.stringify(expectedKey));

  if (computedKey !== expectedKey) {
    console.error('FAIL: computed obj.key does not match HAR oracle "21L2"');
    process.exit(1);
  }

  console.log('');
  console.log('PASS: obj.key = "21L2" reproduced from HAR verify POST body.');
  process.exit(0);
}
