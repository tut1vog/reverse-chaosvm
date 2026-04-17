'use strict';

/**
 * collect-diff.js — Decrypt two audit-captured collect tokens and diff their
 * cd field arrays field-by-field.
 *
 * Usage:
 *   node scripts/collect-diff.js [puppeteer-audit.json] [scraper-audit.json]
 *
 * Defaults to the Phase 52 audit files if no arguments are given.
 */

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// XTEA decryption — copied from tools/token-generator/decrypt.js
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
// CD field labels (from docs/COLLECTOR_SCHEMA.md)
// ═══════════════════════════════════════════════════════════════════════

const FIELD_LABELS = {
  0: 'unknown_0',
  1: 'osPlatform',
  2: 'touchSupport',
  3: 'viewportWidth',
  4: 'detectedFonts',
  5: 'flashFonts',
  6: 'languages',
  7: 'colorGamutLegacy',
  8: 'hardwareConcurrency',
  9: 'screenResolution',
  10: 'devicePixelRatio',
  11: 'sessionStorageAvail',
  12: 'videoCodecs',
  13: 'localStorageAvail',
  14: 'maxTouchPoints',
  15: 'canvasHash',
  16: 'timestampInit',
  17: 'mathFingerprint',
  18: 'audioFingerprint',
  19: 'mimeTypes',
  20: 'webglImage',
  21: 'storageEstimate',
  22: 'pageUrl',
  23: 'plugins',
  24: 'indexedDbAvail',
  25: 'maxTouchPointsDup',
  26: 'timezoneOffset',
  27: 'adBlockDetected',
  28: 'colorGamut',
  29: 'audioCodecs',
  30: 'webdriverFlag',
  31: 'userAgent',
  32: 'characterSet',
  33: 'screenPosition',
  34: 'intlOptions',
  35: 'unknown_35',
  36: 'vendor',
  37: 'highEntropyValues',
  38: 'unknown_38',
  39: 'unknown_39',
  40: 'webglRenderer',
  41: 'frameStatus',
  42: 'permissionStatus',
  43: 'unknown_43',
  44: 'availHeight',
  45: 'headlessFlag',
  46: 'userAgentData',
  47: 'screenComposite',
  48: 'platform',
  49: 'colorDepth',
  50: 'doNotTrack',
  51: 'cookiesEnabled',
  52: 'timestampCollectionEnd',
  53: 'timestampCollectionStart',
  54: 'performanceHash',
  55: 'cssOverflowResult',
  56: 'canvasBlocked',
  57: 'featureBitmask',
  58: 'unknown_58',
};

// ═══════════════════════════════════════════════════════════════════════
// Try decrypting a collect token against a list of XTEA param sets
// ═══════════════════════════════════════════════════════════════════════

function tryDecrypt(collectStr, paramsList) {
  for (const entry of paramsList) {
    const result = decryptCollect(collectStr, entry.params);
    if (result.parsed && result.parsed.cd) {
      return { result, label: entry.label };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Comparison helpers
// ═══════════════════════════════════════════════════════════════════════

function classify(bVal, sVal) {
  const bStr = JSON.stringify(bVal);
  const sStr = JSON.stringify(sVal);
  if (bStr === sStr) return 'MATCH';

  // Both present but different
  const bType = typeof bVal;
  const sType = typeof sVal;
  if (bType !== sType) return 'TYPE_DIFF';

  // Same type, different value
  if (bType === 'number') return 'VALUE_DIFF';
  if (bType === 'string') {
    if (bVal.length !== sVal.length) return 'LENGTH_DIFF';
    return 'VALUE_DIFF';
  }
  if (Array.isArray(bVal) && Array.isArray(sVal)) {
    if (bVal.length !== sVal.length) return 'ARRAY_LENGTH_DIFF';
    return 'ARRAY_DIFF';
  }
  if (bType === 'object' && bVal !== null && sVal !== null) {
    return 'OBJECT_DIFF';
  }
  return 'VALUE_DIFF';
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

function main() {
  const projectRoot = path.resolve(__dirname, '..');

  // Parse CLI args
  const puppeteerPath = process.argv[2] ||
    path.join(projectRoot, 'output', 'phase-52-audit', 'puppeteer-audit.json');
  const scraperPath = process.argv[3] ||
    path.join(projectRoot, 'output', 'phase-52-audit', 'scraper-audit.json');

  // 1. Load audit files
  if (!fs.existsSync(puppeteerPath)) {
    console.error('ERROR: Puppeteer audit not found:', puppeteerPath);
    process.exit(1);
  }
  if (!fs.existsSync(scraperPath)) {
    console.error('ERROR: Scraper audit not found:', scraperPath);
    process.exit(1);
  }

  const puppeteerAudit = JSON.parse(fs.readFileSync(puppeteerPath, 'utf8'));
  const scraperAudit = JSON.parse(fs.readFileSync(scraperPath, 'utf8'));

  const puppeteerCollect = puppeteerAudit.tokens.collectEncoded;
  const scraperCollect = scraperAudit.tokens.collectEncoded;

  console.log('=== Collect Token Diff ===');
  console.log(`Puppeteer collect: ${puppeteerCollect.length} chars`);
  console.log(`Scraper collect:   ${scraperCollect.length} chars`);
  console.log(`Size difference:   ${scraperCollect.length - puppeteerCollect.length} chars (${((scraperCollect.length / puppeteerCollect.length - 1) * 100).toFixed(1)}% larger)`);
  console.log();

  // 2. Build param list from all known keys
  const paramsList = [];

  // From xtea-params.json (Puppeteer's tdc.js build)
  const xteaParamsPath = path.join(projectRoot, 'output', 'tdc-source', 'xtea-params.json');
  if (fs.existsSync(xteaParamsPath)) {
    const xp = JSON.parse(fs.readFileSync(xteaParamsPath, 'utf8'));
    paramsList.push({
      label: 'tdc-source (xtea-params.json)',
      params: {
        key: xp.key,
        delta: xp.delta,
        rounds: xp.rounds,
        keyMods: xp.keyMods || xp.keyModConstants,
      },
    });
  }

  // From scraper templates cache
  const templatesPath = path.join(projectRoot, 'tools', 'scraper', 'cache', 'templates.json');
  if (fs.existsSync(templatesPath)) {
    const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
    for (const [hash, t] of Object.entries(templates)) {
      paramsList.push({
        label: `template ${hash}`,
        params: {
          key: t.key,
          delta: t.delta,
          rounds: t.rounds,
          keyMods: t.keyMods || t.keyModConstants,
        },
      });
    }
  }

  // From known templates (Templates A, B, C from the project memory)
  const knownTemplates = [
    {
      label: 'Template A (tdc.js)',
      params: {
        key: [0x4F584732, 0x462A4564, 0x636A5062, 0x6D644140],
        delta: 0x9E3779B9,
        rounds: 32,
        keyMods: [0, 0, 0, 0],
      },
    },
    {
      label: 'decrypt.js browserKeyParams (98-opcode)',
      params: {
        key: [0x4F4D6852, 0x61426747, 0x45535C40, 0x6C3B4158],
        delta: 0x9E3779B9,
        rounds: 32,
        keyMods: [0, 0, 986887, 1513228],
      },
    },
  ];
  for (const kt of knownTemplates) {
    paramsList.push(kt);
  }

  console.log(`Trying ${paramsList.length} key sets...\n`);

  // 3. Decrypt Puppeteer collect
  console.log('--- Decrypting Puppeteer collect ---');
  const puppeteerResult = tryDecrypt(puppeteerCollect, paramsList);
  if (!puppeteerResult) {
    console.error('FAILED: Could not decrypt Puppeteer collect with any known key.');
    console.log('Trying first 100 bytes of plaintext with each key:');
    for (const entry of paramsList) {
      const r = decryptCollect(puppeteerCollect, entry.params);
      const preview = r.plaintext.substring(0, 60).replace(/[^\x20-\x7e]/g, '.');
      console.log(`  ${entry.label}: ${preview}`);
    }
    process.exit(1);
  }
  console.log(`  Decrypted with: ${puppeteerResult.label}`);
  console.log(`  Plaintext length: ${puppeteerResult.result.plaintext.length}`);
  console.log(`  cd entries: ${puppeteerResult.result.parsed.cd.length}`);

  // 4. Decrypt Scraper collect
  console.log('\n--- Decrypting Scraper collect ---');
  const scraperResult = tryDecrypt(scraperCollect, paramsList);
  if (!scraperResult) {
    console.error('FAILED: Could not decrypt Scraper collect with any known key.');
    console.log('Trying first 100 bytes of plaintext with each key:');
    for (const entry of paramsList) {
      const r = decryptCollect(scraperCollect, entry.params);
      const preview = r.plaintext.substring(0, 60).replace(/[^\x20-\x7e]/g, '.');
      console.log(`  ${entry.label}: ${preview}`);
    }
    process.exit(1);
  }
  console.log(`  Decrypted with: ${scraperResult.label}`);
  console.log(`  Plaintext length: ${scraperResult.result.plaintext.length}`);
  console.log(`  cd entries: ${scraperResult.result.parsed.cd.length}`);

  // 5. Semantic cross-comparison
  //
  // IMPORTANT: Different tdc.js templates assemble cd fields in different
  // order. The Puppeteer and scraper used different templates, so cd[i] in
  // one does NOT correspond to cd[i] in the other. We must identify fields
  // by their value patterns, not by index.

  const bCd = puppeteerResult.result.parsed.cd;
  const sCd = scraperResult.result.parsed.cd;
  const bSd = puppeteerResult.result.parsed.sd || {};
  const sSd = scraperResult.result.parsed.sd || {};

  console.log('\n===================================================');
  console.log('CRITICAL: DIFFERENT TEMPLATE FIELD ORDERING');
  console.log('===================================================');
  console.log(`Puppeteer used template: ${puppeteerResult.label}`);
  console.log(`Scraper used template:   ${scraperResult.label}`);
  console.log('The cd arrays use DIFFERENT field orderings.');
  console.log('Index-by-index comparison is INVALID.');
  console.log('Using semantic value-pattern matching instead.\n');

  console.log(`Puppeteer cd length: ${bCd.length}`);
  console.log(`Scraper cd length:   ${sCd.length}`);
  console.log(`Length difference:    ${sCd.length - bCd.length}`);

  // Semantic field identification by value pattern
  function identifyField(val) {
    if (val === null || val === undefined) return null;
    if (val === 'windows' || val === 'macos' || val === 'linux') return 'osPlatform';
    if (typeof val === 'string' && val.startsWith('Mozilla/5.0')) return 'userAgent';
    if (val === 'UTF-8' || val === 'utf-8') return 'characterSet';
    if (typeof val === 'string' && /^[+-]\d{2}$/.test(val)) return 'timezoneOffset';
    if (typeof val === 'string' && /^(Linux|Win|Mac)/.test(val)) return 'platform';
    if (typeof val === 'string' && /^\d+-\d+-\d+-\d+-/.test(val)) return 'screenComposite';
    if (Array.isArray(val) && val.length === 2 && typeof val[0] === 'number' && val[0] > 100) return 'screenResolution';
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(val[0])) return 'languages';
    if (Array.isArray(val) && val.length > 0 && val[0] && val[0].name && val[0].filename) return 'plugins';
    if (Array.isArray(val) && val.length > 0 && val[0] && val[0].type && val[0].suffixes !== undefined) return 'mimeTypes';
    if (Array.isArray(val) && val.length > 0 && val[0] && val[0].codec === 'AAC') return 'audioCodecs';
    if (Array.isArray(val) && val.length > 0 && val[0] && val[0].codec === 'H.264') return 'videoCodecs';
    if (typeof val === 'object' && !Array.isArray(val) && val !== null && val.nt_vc_output) return 'audioFingerprint';
    if (typeof val === 'object' && !Array.isArray(val) && val !== null && val._state !== undefined && val.quota) return 'storageEstimate';
    if (typeof val === 'object' && !Array.isArray(val) && val !== null && val._state !== undefined && val.architecture !== undefined) return 'highEntropyValues';
    if (typeof val === 'object' && !Array.isArray(val) && val !== null && val.timeZone) return 'intlOptions';
    if (typeof val === 'object' && !Array.isArray(val) && val !== null && val._state !== undefined && Object.keys(val).length === 1) return 'permissionStatus';
    if (val === 'srgb' || val === 'p3') return 'colorGamut';
    if (typeof val === 'string' && val.includes('Arial') && val.includes(',')) return 'detectedFonts';
    if (val === 'top' || val === 'frame') return 'frameStatus';
    if (typeof val === 'string' && /^[A-Za-z0-9+/=]{40,}$/.test(val) && val.length > 80) return 'webglImage';
    if (typeof val === 'string' && val.startsWith('http')) return 'pageUrl';
    if (typeof val === 'string' && /^\d+;\d+$/.test(val)) return 'screenPosition';
    if (Array.isArray(val) && val.length > 0 && Array.isArray(val[0]) && val[0].length >= 4) return 'behavioralEvents';
    if (typeof val === 'string' && (val.includes('ANGLE') || val.includes('OpenGL'))) return 'webglRenderer';
    if (typeof val === 'string' && val.includes('Google Inc')) return 'vendorWebGL';
    if (typeof val === 'string' && /^\d{19,}$/.test(val)) return 'sid';
    if (typeof val === 'object' && !Array.isArray(val) && val !== null && val.brands !== undefined && val.mobile !== undefined) return 'userAgentData';
    return null;
  }

  // Build semantic maps
  const bFields = {};
  const sFields = {};
  const bUnidentified = [];
  const sUnidentified = [];

  for (let i = 0; i < bCd.length; i++) {
    const id = identifyField(bCd[i]);
    if (id && !bFields[id]) {
      bFields[id] = { index: i, val: bCd[i] };
    } else if (!id) {
      bUnidentified.push({ index: i, val: bCd[i] });
    }
  }
  for (let i = 0; i < sCd.length; i++) {
    const id = identifyField(sCd[i]);
    if (id && !sFields[id]) {
      sFields[id] = { index: i, val: sCd[i] };
    } else if (!id) {
      sUnidentified.push({ index: i, val: sCd[i] });
    }
  }

  // 6. Semantic comparison output
  const allFieldNames = new Set([...Object.keys(bFields), ...Object.keys(sFields)]);
  const semanticMatches = [];
  const semanticDiffs = [];
  const puppeteerOnlyFields = [];
  const scraperOnlyFields = [];

  for (const f of [...allFieldNames].sort()) {
    const b = bFields[f];
    const s = sFields[f];
    if (b && s) {
      if (JSON.stringify(b.val) === JSON.stringify(s.val)) {
        semanticMatches.push(f);
      } else {
        semanticDiffs.push(f);
      }
    } else if (b && !s) {
      puppeteerOnlyFields.push(f);
    } else {
      scraperOnlyFields.push(f);
    }
  }

  console.log('\n===================================================');
  console.log('SEMANTIC FIELD COMPARISON');
  console.log('===================================================');
  console.log(`Identified fields:     ${allFieldNames.size}`);
  console.log(`Matching values:       ${semanticMatches.length}`);
  console.log(`Different values:      ${semanticDiffs.length}`);
  console.log(`Puppeteer-only fields: ${puppeteerOnlyFields.length}`);
  console.log(`Scraper-only fields:   ${scraperOnlyFields.length}`);
  console.log(`Unidentified (pup):    ${bUnidentified.length}`);
  console.log(`Unidentified (scr):    ${sUnidentified.length}`);

  if (semanticMatches.length > 0) {
    console.log(`\n--- Matching semantic fields (${semanticMatches.length}) ---`);
    for (const f of semanticMatches) {
      const b = bFields[f];
      const s = sFields[f];
      console.log(`  ${f.padEnd(25)} puppeteer[${String(b.index).padStart(2)}] = scraper[${String(s.index).padStart(2)}]`);
    }
  }

  if (semanticDiffs.length > 0) {
    console.log(`\n--- Differing semantic fields (${semanticDiffs.length}) ---`);
    for (const f of semanticDiffs) {
      const b = bFields[f];
      const s = sFields[f];
      const bShow = truncate(JSON.stringify(b.val), 90);
      const sShow = truncate(JSON.stringify(s.val), 90);
      console.log(`  ${f} puppeteer[${b.index}] vs scraper[${s.index}]:`);
      console.log(`    P: ${bShow}`);
      console.log(`    S: ${sShow}`);
    }
  }

  if (puppeteerOnlyFields.length > 0) {
    console.log(`\n--- Fields only in Puppeteer (${puppeteerOnlyFields.length}) ---`);
    for (const f of puppeteerOnlyFields) {
      const b = bFields[f];
      const bShow = truncate(JSON.stringify(b.val), 90);
      console.log(`  ${f} [${b.index}]: ${bShow}`);
    }
  }

  if (scraperOnlyFields.length > 0) {
    console.log(`\n--- Fields only in Scraper (${scraperOnlyFields.length}) ---`);
    for (const f of scraperOnlyFields) {
      const s = sFields[f];
      const sShow = truncate(JSON.stringify(s.val), 90);
      console.log(`  ${f} [${s.index}]: ${sShow}`);
    }
  }

  if (bUnidentified.length > 0 || sUnidentified.length > 0) {
    console.log(`\n--- Unidentified fields ---`);
    console.log('  Puppeteer:');
    for (const u of bUnidentified) {
      console.log(`    [${String(u.index).padStart(2)}] ${truncate(JSON.stringify(u.val), 80)}`);
    }
    console.log('  Scraper:');
    for (const u of sUnidentified) {
      console.log(`    [${String(u.index).padStart(2)}] ${truncate(JSON.stringify(u.val), 80)}`);
    }
  }

  // 8. SD comparison
  console.log('\n===================================================');
  console.log('SD OBJECT COMPARISON');
  console.log('===================================================');

  const allSdKeys = new Set([...Object.keys(bSd), ...Object.keys(sSd)]);
  const sdMatching = [];
  const sdDiffering = [];

  for (const k of allSdKeys) {
    const bv = JSON.stringify(bSd[k]);
    const sv = JSON.stringify(sSd[k]);
    if (bv === sv) {
      sdMatching.push(k);
    } else {
      sdDiffering.push(k);
    }
  }

  console.log(`SD keys total:   ${allSdKeys.size}`);
  console.log(`Matching:        ${sdMatching.length}`);
  console.log(`Differing:       ${sdDiffering.length}`);

  if (sdDiffering.length > 0) {
    console.log('\nSD differences:');
    for (const k of sdDiffering) {
      const bShow = truncate(JSON.stringify(bSd[k]), 100);
      const sShow = truncate(JSON.stringify(sSd[k]), 100);
      console.log(`  ${k}:`);
      console.log(`    puppeteer: ${bShow}`);
      console.log(`    scraper:   ${sShow}`);
    }
  }

  // 9. Size breakdown
  console.log('\n===================================================');
  console.log('SIZE BREAKDOWN');
  console.log('===================================================');

  let bCdSize = 0;
  let sCdSize = 0;
  const fieldSizeDiffs = [];
  const maxLen = Math.max(bCd.length, sCd.length);

  for (let i = 0; i < maxLen; i++) {
    const bs = i < bCd.length ? JSON.stringify(bCd[i]).length : 0;
    const ss = i < sCd.length ? JSON.stringify(sCd[i]).length : 0;
    bCdSize += bs;
    sCdSize += ss;
    const diff = ss - bs;
    if (Math.abs(diff) > 10) {
      fieldSizeDiffs.push({ index: i, label: FIELD_LABELS[i] || `field_${i}`, bSize: bs, sSize: ss, diff });
    }
  }

  console.log(`Puppeteer cd JSON size: ${bCdSize}`);
  console.log(`Scraper cd JSON size:   ${sCdSize}`);
  console.log(`Delta:                  ${sCdSize - bCdSize}`);
  console.log(`Puppeteer sd JSON size: ${JSON.stringify(bSd).length}`);
  console.log(`Scraper sd JSON size:   ${JSON.stringify(sSd).length}`);

  if (fieldSizeDiffs.length > 0) {
    fieldSizeDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    console.log('\nLargest per-index size differences (>10 chars):');
    console.log('NOTE: Indices are RAW (not semantic) — different templates use different orderings.');
    for (const f of fieldSizeDiffs.slice(0, 20)) {
      const sign = f.diff > 0 ? '+' : '';
      console.log(`  [${f.index}]: puppeteer=${f.bSize} scraper=${f.sSize} (${sign}${f.diff})`);
    }
  }

  // 10. Write output
  const outDir = path.join(projectRoot, 'output', 'phase-53-collect-diff');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outputData = {
    timestamp: new Date().toISOString(),
    puppeteerAuditPath: puppeteerPath,
    scraperAuditPath: scraperPath,
    puppeteerKey: puppeteerResult.label,
    scraperKey: scraperResult.label,
    puppeteer: {
      tokenLength: puppeteerCollect.length,
      plaintextLength: puppeteerResult.result.plaintext.length,
      cdLength: bCd.length,
      cd: bCd,
      sd: bSd,
    },
    scraper: {
      tokenLength: scraperCollect.length,
      plaintextLength: scraperResult.result.plaintext.length,
      cdLength: sCd.length,
      cd: sCd,
      sd: sSd,
    },
    diff: {
      note: 'Different templates = different field ordering. Index comparison is invalid.',
      cdLengthDiff: sCd.length - bCd.length,
      semanticMatches: semanticMatches,
      semanticDiffs: semanticDiffs,
      puppeteerOnlyFields: puppeteerOnlyFields,
      scraperOnlyFields: scraperOnlyFields,
      fieldMapping: Object.fromEntries(
        [...allFieldNames].map(f => [f, {
          puppeteerIndex: bFields[f] ? bFields[f].index : null,
          scraperIndex: sFields[f] ? sFields[f].index : null,
          match: bFields[f] && sFields[f] ?
            JSON.stringify(bFields[f].val) === JSON.stringify(sFields[f].val) : null,
        }])
      ),
    },
  };

  const outPath = path.join(outDir, 'collect-diff.json');
  fs.writeFileSync(outPath, JSON.stringify(outputData, null, 2), 'utf8');
  console.log(`\nFull diff data written to ${outPath}`);
}

main();
