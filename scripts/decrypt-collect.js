'use strict';

/**
 * decrypt-collect.js — Decrypt and compare browser vs scraper collect tokens.
 *
 * Reads the captured Puppeteer verify POST body, decrypts the collect token
 * using the 98-opcode template XTEA params (extracted from tdc-source.js),
 * then generates a scraper collect token and decrypts it for comparison.
 *
 * The browser token is a single base64-encoded XTEA-encrypted blob that
 * decrypts to JSON: {"cd":[...],"sd":{...}}
 *
 * Usage: node scripts/decrypt-collect.js
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// Parameterized XTEA with per-index key modifications
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
 * Supports per-index key modification constants.
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
// XTEA Parameters — extracted from tdc-source.js via dynamic tracing
//
// This 98-opcode template uses per-index key modifications for indices
// 2 and 3 (not 1 and 3 as in Template A). The base key was extracted
// by the pipeline; per-index mods were found via cipher round tracing.
// ═══════════════════════════════════════════════════════════════════════

const browserKeyParams = {
  key: [0x4F4D6852, 0x61426747, 0x45535C40, 0x6C3B4158],
  delta: 0x9E3779B9,
  rounds: 32,
  keyMods: [0, 0, 986887, 1513228],
};

/**
 * Decrypt a collect token string.
 * The token is a single base64-encoded XTEA-encrypted blob.
 *
 * @param {string} collectStr - The collect token (base64 or URL-encoded base64)
 * @param {Object} params - XTEA parameters with keyMods
 * @returns {Object} { plaintext, parsed }
 */
function decryptCollect(collectStr, params) {
  // Undo URL encoding if present
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const encrypted = Buffer.from(b64, 'base64').toString('binary');
  const decrypted = decryptXtea(encrypted, params);

  // Strip trailing null/space padding
  const plaintext = decrypted.replace(/[\0\s]+$/, '');

  let parsed = null;
  try {
    parsed = JSON.parse(plaintext);
  } catch (e) {
    // Fall through
  }

  return { plaintext, parsed };
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const captureDir = path.join(projectRoot, 'output', 'puppeteer-capture');
  const postPath = path.join(captureDir, 'verify-post.json');

  // 1. Read captured POST body
  if (!fs.existsSync(postPath)) {
    console.error('ERROR: verify-post.json not found at', postPath);
    process.exit(1);
  }
  const postBody = JSON.parse(fs.readFileSync(postPath, 'utf8'));
  const browserCollect = postBody.collect;
  console.log(`Browser collect token: ${browserCollect.length} chars`);

  // 2. Decrypt browser token
  console.log('\n--- Decrypting browser collect token ---');
  const browserResult = decryptCollect(browserCollect, browserKeyParams);

  if (browserResult.parsed) {
    const cd = browserResult.parsed.cd || [];
    const sd = browserResult.parsed.sd || {};
    console.log('Successfully decrypted and parsed as JSON');
    console.log(`  cd entries: ${cd.length}`);
    console.log(`  sd keys: ${Object.keys(sd).join(', ')}`);
    console.log(`  Plaintext length: ${browserResult.plaintext.length}`);
  } else {
    console.log('Decrypted but could not parse as JSON');
    console.log(`  First 200 chars: ${browserResult.plaintext.substring(0, 200)}`);
  }

  // 3. Generate scraper token
  console.log('\n--- Generating scraper collect token ---');
  const { generateCollect } = require('../scraper/collect-generator.js');
  const profile = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'profiles', 'default.json'), 'utf8')
  );

  // The scraper's generateCollect uses keyModConstants[0] for idx=1 and [1] for idx=3.
  // This template has mods on idx=2 and idx=3, so the scraper encryption differs
  // on idx=2 blocks. For comparison purposes, we decrypt the scraper token with
  // matching params (keyMods on idx=1 and idx=3 as the scraper encrypts).
  const scraperXteaParams = {
    key: browserKeyParams.key,
    delta: browserKeyParams.delta,
    rounds: browserKeyParams.rounds,
    keyModConstants: [0, browserKeyParams.keyMods[3]],
  };

  const scraperCollectEncoded = generateCollect(profile, scraperXteaParams, {
    appid: postBody.aid || '2046626881',
    nonce: postBody.nonce || 'eda1152f11f1daf0',
    token: 'test_token_123',
  });
  console.log(`Scraper collect token (URL-encoded): ${scraperCollectEncoded.length} chars`);

  // 4. Decrypt scraper token
  // The scraper encrypts with keyModConstants applied to idx=1 and idx=3.
  // For decryption, use matching keyMods.
  console.log('\n--- Decrypting scraper collect token ---');
  const scraperDecryptParams = {
    key: browserKeyParams.key,
    delta: browserKeyParams.delta,
    rounds: browserKeyParams.rounds,
    keyMods: [0, 0, 0, browserKeyParams.keyMods[3]],
  };
  const scraperResult = decryptCollect(scraperCollectEncoded, scraperDecryptParams);

  if (scraperResult.parsed) {
    const cd = scraperResult.parsed.cd || [];
    const sd = scraperResult.parsed.sd || {};
    console.log('Successfully decrypted and parsed as JSON');
    console.log(`  cd entries: ${cd.length}`);
    console.log(`  sd keys: ${Object.keys(sd).join(', ')}`);
    console.log(`  Plaintext length: ${scraperResult.plaintext.length}`);
  } else {
    console.log('Decrypted but could not parse as JSON');
    console.log(`  First 200 chars: ${scraperResult.plaintext.substring(0, 200)}`);
  }

  // 5. Build comparison output
  const output = {
    browser: {
      tokenLength: browserCollect.length,
      decryptedLength: browserResult.plaintext.length,
      raw: browserResult.plaintext,
      cd: browserResult.parsed ? browserResult.parsed.cd : null,
      sd: browserResult.parsed ? browserResult.parsed.sd : null,
    },
    scraper: {
      tokenLength: scraperCollectEncoded.length,
      decryptedLength: scraperResult.plaintext.length,
      raw: scraperResult.plaintext,
      cd: scraperResult.parsed ? scraperResult.parsed.cd : null,
      sd: scraperResult.parsed ? scraperResult.parsed.sd : null,
    },
  };

  // 6. Save output
  const outPath = path.join(captureDir, 'collect-decrypted.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nSaved to ${outPath}`);

  // 7. Comparison summary
  console.log('\n===================================================');
  console.log('COMPARISON SUMMARY');
  console.log('===================================================');

  const bCd = output.browser.cd || [];
  const sCd = output.scraper.cd || [];

  console.log(`\nToken lengths:     browser=${output.browser.tokenLength}  scraper=${output.scraper.tokenLength}`);
  console.log(`Plaintext lengths: browser=${output.browser.decryptedLength}  scraper=${output.scraper.decryptedLength}`);
  console.log(`CD entry count:    browser=${bCd.length}  scraper=${sCd.length}`);

  if (bCd.length === 0 && sCd.length === 0) {
    console.log('\nNo cd entries to compare (decryption may have failed).');
    return;
  }

  // Field-by-field comparison
  const maxLen = Math.max(bCd.length, sCd.length);
  const matching = [];
  const differing = [];
  const browserOnly = [];
  const scraperOnly = [];

  for (let i = 0; i < maxLen; i++) {
    const inBrowser = i < bCd.length;
    const inScraper = i < sCd.length;

    if (inBrowser && !inScraper) {
      browserOnly.push(i);
    } else if (!inBrowser && inScraper) {
      scraperOnly.push(i);
    } else {
      const bVal = JSON.stringify(bCd[i]);
      const sVal = JSON.stringify(sCd[i]);
      if (bVal === sVal) {
        matching.push(i);
      } else {
        differing.push(i);
      }
    }
  }

  console.log(`\nMatching fields:  ${matching.length}/${maxLen}`);
  console.log(`Differing fields: ${differing.length}`);
  if (browserOnly.length > 0) {
    console.log(`Browser-only indices: ${browserOnly.join(', ')}`);
  }
  if (scraperOnly.length > 0) {
    console.log(`Scraper-only indices: ${scraperOnly.join(', ')}`);
  }

  if (differing.length > 0) {
    console.log('\nField differences:');
    for (const i of differing) {
      const bVal = JSON.stringify(bCd[i]);
      const sVal = JSON.stringify(sCd[i]);
      const bShow = bVal.length > 80 ? bVal.substring(0, 77) + '...' : bVal;
      const sShow = sVal.length > 80 ? sVal.substring(0, 77) + '...' : sVal;
      console.log(`  [${i}] browser: ${bShow}`);
      console.log(`  [${i}] scraper: ${sShow}`);
    }
  }

  // SD comparison
  if (output.browser.sd && output.scraper.sd) {
    console.log('\nSD comparison:');
    const allKeys = new Set([
      ...Object.keys(output.browser.sd),
      ...Object.keys(output.scraper.sd),
    ]);
    for (const k of allKeys) {
      const bv = JSON.stringify(output.browser.sd[k]);
      const sv = JSON.stringify(output.scraper.sd[k]);
      const status = bv === sv ? 'MATCH' : 'DIFF';
      if (status === 'DIFF') {
        console.log(`  ${k}: ${status}  browser=${bv}  scraper=${sv}`);
      } else {
        console.log(`  ${k}: ${status}`);
      }
    }
  }
}

main();
