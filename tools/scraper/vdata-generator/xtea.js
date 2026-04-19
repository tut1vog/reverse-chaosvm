'use strict';

// Phase 43 task 43.3 — classical XTEA, Node built-ins only.
//
// 32 rounds, delta = 0x9E3779B9, little-endian uint32 packing of
// 8-byte blocks. The 16-byte key is interpreted as 4 big-endian
// uint32 words (matches vm-slide's bytecode key schedule; see
// docs/VDATA_FORMAT.md §3).
//
// Logic copied verbatim from tests/fixtures/verify-vdata-fixtures.js
// (the 43.2 reference verifier), then wrapped in a public module
// surface.

const XTEA_DELTA = 0x9e3779b9;
const XTEA_ROUNDS = 32;

function xteaEncryptBlock(v0, v1, key) {
  let sum = 0;
  v0 = v0 >>> 0;
  v1 = v1 >>> 0;
  for (let i = 0; i < XTEA_ROUNDS; i++) {
    v0 = (v0 + ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
    sum = (sum + XTEA_DELTA) >>> 0;
    v1 = (v1 + ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
  }
  return [v0, v1];
}

function xteaDecryptBlock(v0, v1, key) {
  let sum = (XTEA_DELTA * XTEA_ROUNDS) >>> 0;
  v0 = v0 >>> 0;
  v1 = v1 >>> 0;
  for (let i = 0; i < XTEA_ROUNDS; i++) {
    v1 = (v1 - ((((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[(sum >>> 11) & 3]))) >>> 0;
    sum = (sum - XTEA_DELTA) >>> 0;
    v0 = (v0 - ((((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[sum & 3]))) >>> 0;
  }
  return [v0, v1];
}

function xteaEncryptLE(plaintext, key) {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError('xteaEncryptLE: plaintext must be a Buffer');
  }
  if (plaintext.length % 8 !== 0) {
    throw new Error('xteaEncryptLE: plaintext length must be a multiple of 8, got ' + plaintext.length);
  }
  const out = Buffer.alloc(plaintext.length);
  for (let i = 0; i < plaintext.length; i += 8) {
    const v0 = plaintext.readUInt32LE(i);
    const v1 = plaintext.readUInt32LE(i + 4);
    const [c0, c1] = xteaEncryptBlock(v0, v1, key);
    out.writeUInt32LE(c0, i);
    out.writeUInt32LE(c1, i + 4);
  }
  return out;
}

function xteaDecryptLE(ciphertext, key) {
  if (!Buffer.isBuffer(ciphertext)) {
    throw new TypeError('xteaDecryptLE: ciphertext must be a Buffer');
  }
  if (ciphertext.length % 8 !== 0) {
    throw new Error('xteaDecryptLE: ciphertext length must be a multiple of 8, got ' + ciphertext.length);
  }
  const out = Buffer.alloc(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i += 8) {
    const v0 = ciphertext.readUInt32LE(i);
    const v1 = ciphertext.readUInt32LE(i + 4);
    const [d0, d1] = xteaDecryptBlock(v0, v1, key);
    out.writeUInt32LE(d0, i);
    out.writeUInt32LE(d1, i + 4);
  }
  return out;
}

function keyFromHex(hex) {
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 16) {
    throw new Error('keyFromHex: XTEA key must be 16 bytes, got ' + buf.length);
  }
  return [
    buf.readUInt32BE(0),
    buf.readUInt32BE(4),
    buf.readUInt32BE(8),
    buf.readUInt32BE(12),
  ];
}

module.exports = {
  XTEA_DELTA,
  XTEA_ROUNDS,
  xteaEncryptBlock,
  xteaDecryptBlock,
  xteaEncryptLE,
  xteaDecryptLE,
  keyFromHex,
};
