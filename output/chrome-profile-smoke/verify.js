'use strict';

/**
 * verify.js — Smoke test for Chrome fingerprint profile collect generation.
 *
 * Loads the Chrome profile, generates a collect token using the Chrome profile
 * path (cdCanonical → reorderCdArray → cdArrayOverride → generateCollect),
 * and prints token length + a summary of the decrypted cd array.
 *
 * Usage:
 *   node output/chrome-profile-smoke/verify.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// Load Chrome profile
const chromeProfile = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'profiles', 'chrome-fingerprint.json'), 'utf8')
);

if (!chromeProfile.cdCanonical) {
  console.error('ERROR: chrome-fingerprint.json missing cdCanonical');
  process.exit(1);
}

console.log('Chrome profile loaded:');
console.log('  cdCanonical fields:', chromeProfile.cdCanonical.length);
console.log('  cd fields (Template C order):', chromeProfile.cd.length);
console.log('  perSessionCanonical:', JSON.stringify(chromeProfile.perSessionCanonical));

// Load a template from the cache for XTEA params and cdFieldOrder
const templateCache = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'tools', 'scraper', 'cache', 'templates.json'), 'utf8')
);

// Pick the first available template
const firstHash = Object.keys(templateCache)[0];
const cached = templateCache[firstHash];
console.log('\nUsing cached template:', firstHash, '(template:', cached.template + ')');

const xteaParams = {
  key: cached.key,
  delta: cached.delta,
  rounds: cached.rounds,
  keyMods: cached.keyMods || cached.keyModConstants,
};

// Generate collect token using the Chrome profile path
const {
  generateCollect,
  generateBehavioralEvents,
  buildSlideSd,
  reorderCdArray,
  encrypt,
  normalizeKeyMods,
  convertBytesToWord,
  convertWordToBytes,
} = require(path.join(PROJECT_ROOT, 'tools', 'scraper', 'collect-generator'));

const now = Date.now();
const nowSec = Math.round(now / 1000);

// Clone and substitute per-session fields
const cdCanonical = JSON.parse(JSON.stringify(chromeProfile.cdCanonical));
cdCanonical[16] = nowSec;       // timestampInit
cdCanonical[22] = 'https://t.captcha.qq.com/cap_union_new_show?rand=' + Math.floor(Math.random() * 1e10);
cdCanonical[52] = nowSec + 2;   // timestampCollectionEnd
cdCanonical[53] = nowSec;       // timestampCollectionStart

// Generate behavioral events
const xAnswer = 120;
const yAnswer = 0;
const behavioralEvents = generateBehavioralEvents(xAnswer, yAnswer, now);

// Build slide sd
const slideValue = [[120, 800, 50], [60, 0, 20], [30, -1, 20], [10, 0, 30], [0, 0, 0]];
const slideSd = buildSlideSd({ x: xAnswer, y: yAnswer }, slideValue);

// Reorder for the template — smart -1 slot handling (only hashPosition gets events)
const cdFieldOrder = cached.cdFieldOrder || null;
const hashPos = cached.hashPosition;
let cdArray;
if (cdFieldOrder) {
  cdArray = [];
  for (let i = 0; i < cdFieldOrder.length; i++) {
    const idx = cdFieldOrder[i];
    if (idx === -1) {
      cdArray.push(i === hashPos ? behavioralEvents : '');
    } else {
      cdArray.push(cdCanonical[idx]);
    }
  }
} else {
  cdArray = cdCanonical;
}

console.log('\nReordered cd array:', cdArray.length, 'fields');

// Generate the collect token
const collectEncoded = generateCollect(null, xteaParams, {
  cdArrayOverride: cdArray,
  sdOverride: slideSd,
  singleBlob: true,
});

// Decode URL encoding
let collectVal = collectEncoded;
if (collectVal.includes('%')) {
  try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
}

console.log('\n=== RESULTS ===');
console.log('Collect token length:', collectVal.length, 'chars');
console.log('Expected range: ~4500-5500 chars (real Chrome ~4856)');

if (collectVal.length > 3000 && collectVal.length < 7000) {
  console.log('STATUS: PASS — token length in expected range');
} else if (collectVal.length > 7000) {
  console.log('STATUS: WARN — token is larger than expected (' + collectVal.length + ')');
} else {
  console.log('STATUS: FAIL — token unexpectedly small (' + collectVal.length + ')');
}

// Decrypt the token to verify cd field count
const { key, delta, rounds } = xteaParams;
const keyMods = normalizeKeyMods(xteaParams);
const ciphertext = Buffer.from(collectVal, 'base64').toString('binary');

// Decrypt (XTEA-ECB decrypt = run cipher in reverse)
let plaintext = '';
const paddedLen = Math.ceil(ciphertext.length / 8) * 8;
for (let pos = 0; pos < paddedLen; pos += 8) {
  const slice1 = ciphertext.slice(pos, pos + 4);
  const slice2 = ciphertext.slice(pos + 4, pos + 8);
  let v0 = convertBytesToWord(slice1);
  let v1 = convertBytesToWord(slice2);

  // XTEA decrypt
  let sum = rounds * delta;
  for (let i = 0; i < rounds; i++) {
    const idx1 = (sum >>> 11) & 3;
    const k1 = key[idx1] + keyMods[idx1];
    v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);
    sum -= delta;
    const idx0 = sum & 3;
    const k0 = key[idx0] + keyMods[idx0];
    v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);
  }

  plaintext += convertWordToBytes(v0) + convertWordToBytes(v1);
}

// Trim NUL padding
plaintext = plaintext.replace(/\x00+$/, '');

console.log('\nDecrypted plaintext length:', plaintext.length, 'bytes');
console.log('First 100 chars:', JSON.stringify(plaintext.slice(0, 100)));

// Try to parse the JSON
try {
  const parsed = JSON.parse(plaintext);
  if (parsed.cd) {
    console.log('cd field count:', parsed.cd.length);
    console.log('cd[0] type:', typeof parsed.cd[0] === 'object' ? 'object' : typeof parsed.cd[0]);
  }
  if (parsed.sd) {
    console.log('sd keys:', Object.keys(parsed.sd).join(', '));
  }
  console.log('\nFull decrypt + parse: OK');
} catch (err) {
  console.log('JSON parse failed:', err.message);
  console.log('Last 100 chars:', JSON.stringify(plaintext.slice(-100)));
}

// Now compare with old synthetic path
const oldProfile = JSON.parse(
  fs.readFileSync(path.join(PROJECT_ROOT, 'profiles', 'default.json'), 'utf8')
);
const oldCollect = generateCollect(oldProfile, xteaParams, {
  cdFieldOrder: cached.cdFieldOrder || null,
  behavioralEvents: behavioralEvents,
  sdOverride: slideSd,
  singleBlob: true,
});
let oldVal = oldCollect;
if (oldVal.includes('%')) {
  try { oldVal = decodeURIComponent(oldVal); } catch (_) { /* leave as-is */ }
}
console.log('\n=== COMPARISON ===');
console.log('Chrome profile token:', collectVal.length, 'chars');
console.log('Synthetic profile token:', oldVal.length, 'chars');
console.log('Reduction:', Math.round((1 - collectVal.length / oldVal.length) * 100) + '%');
