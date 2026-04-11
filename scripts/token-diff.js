'use strict';

/**
 * token-diff.js — Decrypt and structurally compare browser vs standalone collect tokens.
 *
 * Reads the token dumps produced by token-isolation-test.js:
 *   - output/token-isolation/original.json  (browser-generated collect)
 *   - output/token-isolation/standalone.json (our standalone collect)
 *
 * Decrypts both using the cached XTEA params, then shows a detailed structural
 * comparison of the plaintext payloads.
 *
 * The token format (see docs/TOKEN_FORMAT.md):
 *   - 4 segments assembled in order [btoa[1], btoa[0], btoa[2], btoa[3]]
 *   - Segment sizes: header=192 b64 chars, hash=64, cdBody=variable, sig=variable
 *   - Each segment is individually XTEA-encrypted then base64-encoded
 *   - Decrypted segments concatenate to: {"cd":[...59 fields...],"sd":{...}}
 *
 * Usage: node scripts/token-diff.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// XTEA decrypt — reused from scripts/decrypt-collect.js
// ═══════════════════════════════════════════════════════════════════════

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

/**
 * Decrypt a binary string using parameterized XTEA (ECB mode, 8-byte blocks).
 *
 * @param {string} inputBytes - Encrypted binary string
 * @param {Object} params - { key, delta, rounds, keyMods }
 * @returns {string} Decrypted binary string
 */
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
// Token disassembly — reverse the segment assembly
// ═══════════════════════════════════════════════════════════════════════

/**
 * Known fixed segment sizes (base64 characters):
 *   header (btoa[1]) = 192 chars  (144 bytes)
 *   hash   (btoa[0]) = 64 chars   (48 bytes)
 *
 * The assembled token is: btoa[1] + btoa[0] + btoa[2] + btoa[3]
 *                        = header(192) + hash(64) + cdBody(var) + sig(var)
 *
 * sig is typically ~120 chars (~88 bytes). We can compute cdBody+sig length
 * from the total, then estimate sig size. But since sig is the last segment,
 * we can try different sig sizes to find one that decrypts to valid JSON tail.
 */

/**
 * Split a raw base64 token string into its 4 segments.
 * Returns the segments in chunk order [hash, header, cdBody, sig] (chunk indices 0-3).
 *
 * @param {string} b64 - Raw base64 string (after URL-decoding)
 * @returns {{ segments: string[], segmentBytes: string[] }}
 */
function splitToken(b64) {
  // Assembly order: btoa[1](header=192) + btoa[0](hash=64) + btoa[2](cdBody) + btoa[3](sig)
  const HEADER_B64_LEN = 192;
  const HASH_B64_LEN = 64;

  const headerB64 = b64.slice(0, HEADER_B64_LEN);
  const hashB64 = b64.slice(HEADER_B64_LEN, HEADER_B64_LEN + HASH_B64_LEN);
  const remainder = b64.slice(HEADER_B64_LEN + HASH_B64_LEN);

  // sig is the last segment. Its base64 length = ceil(sigBytes/3)*4.
  // Typical sig is ~88 bytes = 120 b64 chars. Try common sizes.
  // We try to find the split by testing sig sizes that produce valid
  // base64 (length divisible by 4).
  const sigCandidates = [];
  // Try from 100 to 160 b64 chars (step 4 for valid base64)
  for (let sigLen = 100; sigLen <= 160; sigLen += 4) {
    if (sigLen <= remainder.length) {
      sigCandidates.push(sigLen);
    }
  }

  // Default: assume 120 b64 chars for sig
  let bestSigLen = 120;
  if (remainder.length > bestSigLen) {
    // Verify the split produces valid base64 for both parts
    const cdLen = remainder.length - bestSigLen;
    if (cdLen % 4 !== 0) {
      // Try to find a sig length that gives both parts as valid base64
      for (const sigLen of sigCandidates) {
        const tryLen = remainder.length - sigLen;
        if (tryLen > 0 && tryLen % 4 === 0) {
          bestSigLen = sigLen;
          break;
        }
      }
    }
  }

  const cdBodyB64 = remainder.slice(0, remainder.length - bestSigLen);
  const sigB64 = remainder.slice(remainder.length - bestSigLen);

  // Return in chunk order: [hash(0), header(1), cdBody(2), sig(3)]
  return {
    b64Segments: [hashB64, headerB64, cdBodyB64, sigB64],
    segmentNames: ['hash', 'header', 'cdBody', 'sig'],
  };
}

/**
 * Decrypt a full collect token by splitting into segments and decrypting each.
 *
 * @param {string} collectRaw - Raw base64 string (may contain URL encoding)
 * @param {Object} xteaParams - { key, delta, rounds, keyMods }
 * @returns {Object} { plaintext, parsed, segments }
 */
function decryptFullToken(collectRaw, xteaParams) {
  // Undo URL encoding if present
  const b64 = collectRaw
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const { b64Segments, segmentNames } = splitToken(b64);

  const segments = [];
  let fullPlaintext = '';

  for (let i = 0; i < b64Segments.length; i++) {
    const segB64 = b64Segments[i];
    const encrypted = Buffer.from(segB64, 'base64').toString('binary');
    const decrypted = decryptXtea(encrypted, xteaParams);
    const cleaned = decrypted.replace(/\0+$/, '');

    segments.push({
      name: segmentNames[i],
      b64Length: segB64.length,
      binaryLength: encrypted.length,
      plaintextLength: cleaned.length,
      plaintext: cleaned,
    });
  }

  // The full payload is assembled from: header(chunk[1]) + cdBody(chunk[2]) + sig(chunk[3])
  // hash(chunk[0]) is metadata, not part of the JSON payload.
  const payloadPlaintext = segments[1].plaintext + segments[2].plaintext + segments[3].plaintext;
  fullPlaintext = payloadPlaintext.replace(/[\0\s]+$/, '');

  let parsed = null;
  try {
    parsed = JSON.parse(fullPlaintext);
  } catch (_) {
    // Try trimming trailing whitespace/nulls more aggressively
    const trimmed = fullPlaintext.replace(/\s+$/, '');
    try {
      parsed = JSON.parse(trimmed);
    } catch (_2) {
      // Fall through
    }
  }

  return {
    plaintext: fullPlaintext,
    parsed,
    segments,
    hashSegment: segments[0],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Comparison logic
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(msg + '\n');
}

/**
 * Find the first byte position where two strings diverge.
 */
function findFirstDivergence(a, b) {
  const minLen = Math.min(a.length, b.length);
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) return i;
  }
  if (a.length !== b.length) return minLen;
  return -1; // identical
}

/**
 * Show context around a divergence point.
 */
function showDivergenceContext(label1, s1, label2, s2, pos, contextSize) {
  if (pos < 0) return;
  const start = Math.max(0, pos - contextSize);
  const end = Math.min(Math.max(s1.length, s2.length), pos + contextSize);

  log(`  Divergence at position ${pos}:`);
  log(`    ${label1}: ...${JSON.stringify(s1.slice(start, end))}...`);
  log(`    ${label2}: ...${JSON.stringify(s2.slice(start, end))}...`);
  log(`    ${' '.repeat(label1.length + 6 + JSON.stringify(s1.slice(start, pos)).length)}^`);
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

function main() {
  const isoDir = path.join(PROJECT_ROOT, 'output', 'token-isolation');

  // 1. Read token dumps
  const origPath = path.join(isoDir, 'original.json');
  const standPath = path.join(isoDir, 'standalone.json');

  if (!fs.existsSync(origPath)) {
    log(`ERROR: ${origPath} not found.`);
    log('Run token-isolation-test.js first (in swap mode) to generate token dumps.');
    process.exit(1);
  }
  if (!fs.existsSync(standPath)) {
    log(`ERROR: ${standPath} not found.`);
    log('Run token-isolation-test.js first (in swap mode) to generate token dumps.');
    process.exit(1);
  }

  const original = JSON.parse(fs.readFileSync(origPath, 'utf8'));
  const standalone = JSON.parse(fs.readFileSync(standPath, 'utf8'));

  log('=== Token Diff ===');
  log(`TDC_NAME (original):   ${original.tdcName}`);
  log(`TDC_NAME (standalone): ${standalone.tdcName}`);
  log(`Original collect length:   ${original.collectLength}`);
  log(`Standalone collect length: ${standalone.collectLength}`);
  log(`Length delta: ${original.collectLength - standalone.collectLength}`);
  log('');

  // 2. Resolve XTEA params
  let xteaParams = standalone.xteaParams;

  if (!xteaParams || !xteaParams.key) {
    // Fall back to template cache
    log('No XTEA params in standalone.json, looking up from template cache...');
    const cachePath = path.join(PROJECT_ROOT, 'scraper', 'cache', 'templates.json');
    if (!fs.existsSync(cachePath)) {
      log('ERROR: Template cache not found and no XTEA params available.');
      process.exit(1);
    }
    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const tdcName = standalone.tdcName || original.tdcName;
    const entry = cache[tdcName];
    if (!entry) {
      log(`ERROR: TDC_NAME "${tdcName}" not found in template cache.`);
      process.exit(1);
    }
    xteaParams = {
      key: entry.key,
      delta: entry.delta,
      rounds: entry.rounds,
      keyMods: entry.keyMods || entry.keyModConstants,
    };
  }

  // Ensure keyMods is an array of 4 numbers
  if (!xteaParams.keyMods || !Array.isArray(xteaParams.keyMods)) {
    xteaParams.keyMods = [0, 0, 0, 0];
  }

  log(`XTEA key: [${xteaParams.key.map(k => '0x' + (k >>> 0).toString(16).toUpperCase()).join(', ')}]`);
  log(`XTEA keyMods: [${xteaParams.keyMods.join(', ')}]`);
  log(`XTEA delta: 0x${(xteaParams.delta >>> 0).toString(16).toUpperCase()}, rounds: ${xteaParams.rounds}`);
  log('');

  // 3. Decrypt both tokens
  log('--- Decrypting original (browser) token ---');
  const origResult = decryptFullToken(original.collectRaw, xteaParams);

  log('--- Decrypting standalone (ours) token ---');
  const standResult = decryptFullToken(standalone.collectRaw, xteaParams);

  // 4. Segment-level comparison
  log('');
  log('=== Segment Comparison ===');
  const segNames = ['hash', 'header', 'cdBody', 'sig'];
  for (let i = 0; i < 4; i++) {
    const oSeg = origResult.segments[i];
    const sSeg = standResult.segments[i];
    const match = oSeg.plaintext === sSeg.plaintext ? 'MATCH' : 'DIFF';
    log(`  ${segNames[i].padEnd(8)} | orig b64=${oSeg.b64Length} plain=${oSeg.plaintextLength} | ` +
        `stand b64=${sSeg.b64Length} plain=${sSeg.plaintextLength} | ${match}`);
  }

  // 5. Hash segment comparison
  log('');
  log('=== Hash Segment (metadata) ===');
  log(`  Original:   ${JSON.stringify(origResult.hashSegment.plaintext)}`);
  log(`  Standalone: ${JSON.stringify(standResult.hashSegment.plaintext)}`);

  // 6. Full plaintext comparison
  log('');
  log('=== Full Plaintext Comparison ===');
  log(`  Original plaintext length:   ${origResult.plaintext.length}`);
  log(`  Standalone plaintext length: ${standResult.plaintext.length}`);

  const origParsed = origResult.parsed;
  const standParsed = standResult.parsed;

  log(`  Original parsed as JSON:   ${origParsed ? 'yes' : 'no'}`);
  log(`  Standalone parsed as JSON: ${standParsed ? 'yes' : 'no'}`);

  if (!origParsed) {
    log('');
    log('  WARNING: Original token did not decrypt to valid JSON.');
    log('  This may indicate wrong XTEA params for the browser token.');
    log(`  First 200 chars: ${JSON.stringify(origResult.plaintext.slice(0, 200))}`);
  }

  if (!standParsed) {
    log('');
    log('  WARNING: Standalone token did not decrypt to valid JSON.');
    log(`  First 200 chars: ${JSON.stringify(standResult.plaintext.slice(0, 200))}`);
  }

  // 7. Raw plaintext divergence
  log('');
  log('=== Raw Plaintext Divergence ===');
  const divPos = findFirstDivergence(origResult.plaintext, standResult.plaintext);
  if (divPos === -1) {
    log('  Plaintexts are IDENTICAL.');
  } else {
    log(`  First divergence at position ${divPos}`);
    showDivergenceContext('orig ', origResult.plaintext, 'stand', standResult.plaintext, divPos, 40);
  }

  // 8. Structural JSON comparison (if both parsed)
  if (origParsed && standParsed) {
    log('');
    log('=== Structural JSON Comparison ===');

    const oCd = origParsed.cd || [];
    const sCd = standParsed.cd || [];
    const oSd = origParsed.sd || {};
    const sSd = standParsed.sd || {};

    log(`  cd array length: original=${oCd.length}  standalone=${sCd.length}`);
    log(`  sd keys: original=[${Object.keys(oSd).join(',')}]  standalone=[${Object.keys(sSd).join(',')}]`);

    // cd field-by-field comparison
    const maxCd = Math.max(oCd.length, sCd.length);
    const matching = [];
    const differing = [];
    const origOnly = [];
    const standOnly = [];

    for (let i = 0; i < maxCd; i++) {
      const inO = i < oCd.length;
      const inS = i < sCd.length;

      if (inO && !inS) {
        origOnly.push(i);
      } else if (!inO && inS) {
        standOnly.push(i);
      } else {
        const oVal = JSON.stringify(oCd[i]);
        const sVal = JSON.stringify(sCd[i]);
        if (oVal === sVal) {
          matching.push(i);
        } else {
          differing.push(i);
        }
      }
    }

    log('');
    log(`  cd matching fields:  ${matching.length}/${maxCd}`);
    log(`  cd differing fields: ${differing.length}`);
    if (origOnly.length > 0) log(`  cd original-only indices: ${origOnly.join(', ')}`);
    if (standOnly.length > 0) log(`  cd standalone-only indices: ${standOnly.join(', ')}`);

    if (differing.length > 0) {
      log('');
      log('  cd field differences:');
      for (const i of differing) {
        const oVal = JSON.stringify(oCd[i]);
        const sVal = JSON.stringify(sCd[i]);
        const oShow = oVal.length > 80 ? oVal.slice(0, 77) + '...' : oVal;
        const sShow = sVal.length > 80 ? sVal.slice(0, 77) + '...' : sVal;
        log(`    [${i}] orig:  ${oShow}`);
        log(`    [${i}] stand: ${sShow}`);
      }
    }

    // sd comparison
    log('');
    log('  sd comparison:');
    const allSdKeys = new Set([...Object.keys(oSd), ...Object.keys(sSd)]);
    for (const k of allSdKeys) {
      const ov = JSON.stringify(oSd[k]);
      const sv = JSON.stringify(sSd[k]);
      const status = ov === sv ? 'MATCH' : 'DIFF';
      if (status === 'DIFF') {
        log(`    ${k}: ${status}  orig=${ov}  stand=${sv}`);
      } else {
        log(`    ${k}: ${status}`);
      }
    }
  }

  // 9. Output structured result to stdout
  const output = {
    tdcName: original.tdcName,
    xteaParams: {
      key: xteaParams.key.map(k => '0x' + (k >>> 0).toString(16).toUpperCase()),
      keyMods: xteaParams.keyMods,
    },
    original: {
      collectLength: original.collectLength,
      plaintextLength: origResult.plaintext.length,
      parsedAsJson: !!origParsed,
      cdLength: origParsed ? (origParsed.cd || []).length : null,
      segments: origResult.segments.map(s => ({
        name: s.name,
        b64Length: s.b64Length,
        plaintextLength: s.plaintextLength,
      })),
    },
    standalone: {
      collectLength: standalone.collectLength,
      plaintextLength: standResult.plaintext.length,
      parsedAsJson: !!standParsed,
      cdLength: standParsed ? (standParsed.cd || []).length : null,
      segments: standResult.segments.map(s => ({
        name: s.name,
        b64Length: s.b64Length,
        plaintextLength: s.plaintextLength,
      })),
    },
    firstDivergence: divPos,
    identical: divPos === -1,
  };

  process.stdout.write(JSON.stringify(output, null, 2) + '\n');

  log('');
  log('Done.');
}

main();
