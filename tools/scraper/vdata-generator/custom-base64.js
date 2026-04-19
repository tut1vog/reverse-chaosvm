'use strict';

// Phase 43 task 43.3 — custom base64 alphabet used by vm-slide's
// vData encoder.
//
// This is standard base64 (3 bytes -> 4 sextets) using a 65-char
// alphabet recovered directly from vm-slide bytecode at pc 16932.
// Index 64 ('Y') is the padding character — the analog of '=' in
// RFC 4648. The encoder substitutes the padding char when input bytes
// run out at the end, matching the isNaN(b1)/isNaN(b2) guards observed
// in the bytecode at pcs 17084..17418.
//
// Because 112 % 3 === 1, encoding a 112-byte ciphertext always ends
// with one data byte plus two padding chars — the canonical 'YY'
// trailer of every vData string. There is no separate "10 40" trailer
// (43.1 mistake corrected by 43.2).

const OUTPUT_ALPHABET =
  'GV5yc1_twaSpHPOE7R3jv9fqC2L-0TxMi4FuolBAbQeIgJU*XzZKWkDNh6n8dsrmY';
const PADDING_CHAR_INDEX = 64;
const PADDING_CHAR = 'Y';

function customBase64Encode(buf) {
  if (!Buffer.isBuffer(buf)) {
    throw new TypeError('customBase64Encode: input must be a Buffer');
  }
  let out = '';
  for (let i = 0; i < buf.length; i += 3) {
    const b0 = buf[i];
    const b1 = i + 1 < buf.length ? buf[i + 1] : NaN;
    const b2 = i + 2 < buf.length ? buf[i + 2] : NaN;
    const c0 = b0 >>> 2;
    const c1 = ((b0 & 3) << 4) | (Number.isNaN(b1) ? 0 : (b1 >>> 4));
    const c2 = Number.isNaN(b1)
      ? PADDING_CHAR_INDEX
      : (((b1 & 0xf) << 2) | (Number.isNaN(b2) ? 0 : (b2 >>> 6)));
    const c3 = Number.isNaN(b2) ? PADDING_CHAR_INDEX : (b2 & 0x3f);
    out += OUTPUT_ALPHABET[c0] + OUTPUT_ALPHABET[c1] + OUTPUT_ALPHABET[c2] + OUTPUT_ALPHABET[c3];
  }
  return out;
}

function customBase64Decode(s) {
  if (typeof s !== 'string') {
    throw new TypeError('customBase64Decode: input must be a string');
  }
  if (s.length % 4 !== 0) {
    throw new Error('customBase64Decode: length not multiple of 4: ' + s.length);
  }
  const lookup = new Map();
  for (let i = 0; i < OUTPUT_ALPHABET.length; i++) {
    lookup.set(OUTPUT_ALPHABET[i], i);
  }
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const a = lookup.get(s[i]);
    const b = lookup.get(s[i + 1]);
    const c = lookup.get(s[i + 2]);
    const d = lookup.get(s[i + 3]);
    if (a === undefined || b === undefined || c === undefined || d === undefined) {
      throw new Error('customBase64Decode: non-alphabet char at index ' + i + ': ' + s.slice(i, i + 4));
    }
    out.push((a << 2) | (b >>> 4));
    if (c !== PADDING_CHAR_INDEX) out.push(((b & 0xf) << 4) | (c >>> 2));
    if (d !== PADDING_CHAR_INDEX) out.push(((c & 3) << 6) | d);
  }
  return Buffer.from(out);
}

module.exports = {
  OUTPUT_ALPHABET,
  PADDING_CHAR_INDEX,
  PADDING_CHAR,
  customBase64Encode,
  customBase64Decode,
};
