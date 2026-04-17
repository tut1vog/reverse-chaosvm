'use strict';

/**
 * test-xtea-fidelity.js — Verify XTEA round-trip fidelity for the live template.
 *
 * Test A: Self round-trip — encrypt a known plaintext, decrypt, compare.
 * Test B: Cross-validation — decrypt the Puppeteer-captured collect token
 *         using the auto-ported XTEA params and verify valid JSON output.
 *
 * Usage: node scripts/test-xtea-fidelity.js
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Import XTEA primitives from existing modules
// ═══════════════════════════════════════════════════════════════════════

// --- From tools/scraper/collect-generator.js (encrypt side) ---

function convertBytesToWord(fourByteString) {
  const b0 = fourByteString.charCodeAt(0) || 0;
  const b1 = fourByteString.charCodeAt(1) || 0;
  const b2 = fourByteString.charCodeAt(2) || 0;
  const b3 = fourByteString.charCodeAt(3) || 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

function convertWordToBytes(word) {
  return String.fromCharCode(
    word & 0xFF,
    (word >> 8) & 0xFF,
    (word >> 16) & 0xFF,
    (word >> 24) & 0xFF
  );
}

function cipherRound(r9, key, delta, rounds, keyMods) {
  let v0 = r9[0];
  let v1 = r9[1];
  let sum = 0;
  const targetSum = rounds * delta;

  while (sum !== targetSum) {
    const idx0 = sum & 3;
    const k0 = key[idx0] + keyMods[idx0];
    v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);

    sum += delta;

    const idx1 = (sum >>> 11) & 3;
    const k1 = key[idx1] + keyMods[idx1];
    v1 += (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);
  }

  r9[0] = v0;
  r9[1] = v1;
}

function encrypt(inputBytes, key, delta, rounds, keyMods) {
  let output = '';
  const paddedLen = Math.ceil(inputBytes.length / 8) * 8;

  for (let pos = 0; pos < paddedLen; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    const r9 = [convertBytesToWord(slice1), convertBytesToWord(slice2)];
    cipherRound(r9, key, delta, rounds, keyMods);

    output += convertWordToBytes(r9[0]) + convertWordToBytes(r9[1]);
  }

  return output;
}

// --- From tools/token-generator/decrypt.js (decrypt side) ---

function decryptXtea(inputBytes, params) {
  const { key, delta, rounds, keyMods } = params;
  let output = '';
  const targetSum = rounds * delta;

  for (let pos = 0; pos < inputBytes.length; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    let v0 = convertBytesToWord(slice1);
    let v1 = convertBytesToWord(slice2);
    let sum = targetSum;

    while (sum !== 0) {
      const idx1 = (sum >>> 11) & 3;
      v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[idx1] + keyMods[idx1]);
      sum -= delta;
      const idx0 = sum & 3;
      v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[idx0] + keyMods[idx0]);
    }

    output += convertWordToBytes(v0) + convertWordToBytes(v1);
  }

  return output;
}

// ═══════════════════════════════════════════════════════════════════════
// Load live XTEA params + Puppeteer capture
// ═══════════════════════════════════════════════════════════════════════

const xteaParamsPath = path.join(projectRoot, 'output', 'tdc-source', 'xtea-params.json');
const verifyPostPath = path.join(projectRoot, 'output', 'puppeteer-capture', 'verify-post.json');

if (!fs.existsSync(xteaParamsPath)) {
  console.error('ERROR: xtea-params.json not found at', xteaParamsPath);
  process.exit(1);
}
if (!fs.existsSync(verifyPostPath)) {
  console.error('ERROR: verify-post.json not found at', verifyPostPath);
  process.exit(1);
}

const xteaParams = JSON.parse(fs.readFileSync(xteaParamsPath, 'utf8'));
const verifyPost = JSON.parse(fs.readFileSync(verifyPostPath, 'utf8'));

// Normalize keyMods — the file has both keyModConstants and keyMods
const keyMods = (xteaParams.keyMods && xteaParams.keyMods.length === 4)
  ? xteaParams.keyMods
  : [0, 0, 0, 0];

const liveParams = {
  key: xteaParams.key,
  delta: xteaParams.delta,
  rounds: xteaParams.rounds,
  keyMods: keyMods,
};

console.log('Live XTEA params loaded:');
console.log('  key:', liveParams.key.map(k => '0x' + (k >>> 0).toString(16).toUpperCase()));
console.log('  delta:', '0x' + (liveParams.delta >>> 0).toString(16).toUpperCase());
console.log('  rounds:', liveParams.rounds);
console.log('  keyMods:', liveParams.keyMods);
console.log();

// ═══════════════════════════════════════════════════════════════════════
// Test A — Self round-trip
// ═══════════════════════════════════════════════════════════════════════

console.log('=== Test A: Self round-trip ===');

const testPlaintext = '{"cd":[1,2,3],"sd":{"od":"C"}}';
const paddedLen = Math.ceil(testPlaintext.length / 8) * 8;
const padded = testPlaintext + '\0'.repeat(paddedLen - testPlaintext.length);

console.log('  Plaintext:', JSON.stringify(testPlaintext));
console.log('  Plaintext length:', testPlaintext.length, '-> padded to', paddedLen);

// Encrypt
const encrypted = encrypt(padded, liveParams.key, liveParams.delta, liveParams.rounds, liveParams.keyMods);
console.log('  Encrypted length:', encrypted.length, 'bytes');
console.log('  Encrypted (hex):', Buffer.from(encrypted, 'binary').toString('hex').substring(0, 64) + '...');

// Decrypt
const decrypted = decryptXtea(encrypted, liveParams);
const decryptedStripped = decrypted.replace(/[\0]+$/, '');

console.log('  Decrypted (stripped):', JSON.stringify(decryptedStripped));

const testAPass = decryptedStripped === testPlaintext;
console.log('  Result:', testAPass ? 'PASS' : 'FAIL');
if (!testAPass) {
  console.log('  Expected:', JSON.stringify(testPlaintext));
  console.log('  Got:     ', JSON.stringify(decryptedStripped));
  // Show byte-level diff
  for (let i = 0; i < Math.max(testPlaintext.length, decryptedStripped.length); i++) {
    const expected = testPlaintext.charCodeAt(i) || 0;
    const actual = decryptedStripped.charCodeAt(i) || 0;
    if (expected !== actual) {
      console.log(`  Byte ${i}: expected 0x${expected.toString(16)} got 0x${actual.toString(16)}`);
    }
  }
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// Test B — Cross-validation (decrypt Puppeteer-captured collect token)
// ═══════════════════════════════════════════════════════════════════════

console.log('=== Test B: Cross-validation (Puppeteer-captured collect) ===');

const collectStr = verifyPost.collect;
if (!collectStr) {
  console.log('  SKIP: No collect field in verify-post.json');
} else {
  console.log('  Collect token length:', collectStr.length, 'chars');

  // Undo URL encoding if present
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const encryptedBuf = Buffer.from(b64, 'base64');
  const encryptedBinary = encryptedBuf.toString('binary');
  console.log('  Decoded ciphertext:', encryptedBuf.length, 'bytes');

  // Decrypt with live params
  const decryptedBinary = decryptXtea(encryptedBinary, liveParams);
  const plaintext = decryptedBinary.replace(/[\0\s]+$/, '');

  console.log('  Decrypted plaintext length:', plaintext.length, 'chars');
  console.log('  First 200 chars:', plaintext.substring(0, 200));

  let parsed = null;
  let testBPass = false;
  try {
    parsed = JSON.parse(plaintext);
    const hasCd = Array.isArray(parsed.cd);
    const hasSd = parsed.sd !== null && typeof parsed.sd === 'object' && !Array.isArray(parsed.sd);
    testBPass = hasCd && hasSd;

    if (testBPass) {
      console.log('  Parsed JSON: cd has', parsed.cd.length, 'entries, sd has', Object.keys(parsed.sd).length, 'keys');
      console.log('  sd keys:', Object.keys(parsed.sd).join(', '));
    } else {
      console.log('  Parsed JSON but missing expected keys: cd=' + hasCd + ' sd=' + hasSd);
    }
  } catch (e) {
    console.log('  JSON parse failed:', e.message);
    // Show raw bytes for diagnosis
    const hexHead = Buffer.from(plaintext.substring(0, 32), 'binary').toString('hex');
    console.log('  First 32 bytes (hex):', hexHead);
  }

  console.log('  Result:', testBPass ? 'PASS' : 'FAIL');
}

// ═══════════════════════════════════════════════════════════════════════
// Save summary
// ═══════════════════════════════════════════════════════════════════════

const summary = {
  timestamp: new Date().toISOString(),
  xteaParams: {
    key: liveParams.key.map(k => '0x' + (k >>> 0).toString(16).toUpperCase()),
    delta: '0x' + (liveParams.delta >>> 0).toString(16).toUpperCase(),
    rounds: liveParams.rounds,
    keyMods: liveParams.keyMods,
  },
  testA: {
    name: 'Self round-trip',
    plaintext: testPlaintext,
    pass: testAPass,
  },
  testB: {
    name: 'Cross-validation (Puppeteer-captured collect)',
    collectLength: verifyPost.collect ? verifyPost.collect.length : null,
    pass: verifyPost.collect ? (function () {
      try {
        const b64 = verifyPost.collect.replace(/%2B/g, '+').replace(/%2F/g, '/').replace(/%3D/g, '=');
        const enc = Buffer.from(b64, 'base64').toString('binary');
        const dec = decryptXtea(enc, liveParams).replace(/[\0\s]+$/, '');
        const p = JSON.parse(dec);
        return Array.isArray(p.cd) && typeof p.sd === 'object' && p.sd !== null;
      } catch (e) {
        return false;
      }
    })() : null,
    decryptedPreview: verifyPost.collect ? (function () {
      try {
        const b64 = verifyPost.collect.replace(/%2B/g, '+').replace(/%2F/g, '/').replace(/%3D/g, '=');
        const enc = Buffer.from(b64, 'base64').toString('binary');
        return decryptXtea(enc, liveParams).replace(/[\0\s]+$/, '').substring(0, 200);
      } catch (e) {
        return 'ERROR: ' + e.message;
      }
    })() : null,
  },
};

const outPath = path.join(projectRoot, 'output', 'phase-51-xtea-fidelity', 'round-trip-result.json');
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2), 'utf8');
console.log('\nSummary saved to', outPath);

// Exit code
const allPass = summary.testA.pass && (summary.testB.pass === true || summary.testB.pass === null);
process.exit(allPass ? 0 : 1);
