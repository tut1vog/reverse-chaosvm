'use strict';

/**
 * collect-diff.js — Same-session Chrome vs standalone collect token diff.
 *
 * 1. Runs the Puppeteer CAPTCHA solver to get a successful solve (errorCode 0)
 * 2. Captures the verify POST body (Chrome's collect token) and tdc.js source
 * 3. Extracts XTEA params from the captured tdc.js via template cache
 * 4. Decrypts the Chrome collect token
 * 5. Generates a standalone collect token using the same session params
 * 6. Decrypts the standalone collect token
 * 7. Produces a field-by-field diff of cd arrays and sd structures
 * 8. Outputs to output/chrome-vs-standalone-diff.json
 *
 * Usage: node scripts/collect-diff.js [--headful] [--retries N]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { CaptchaPuppeteer } = require('../puppeteer/captcha-solver');
const { extractTdcName } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');
const {
  generateCollect,
  generateBehavioralEvents,
  buildSlideSd,
  normalizeKeyMods,
} = require('../scraper/collect-generator');

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (copied from scripts/decrypt-collect.js)
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
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const encrypted = Buffer.from(b64, 'base64').toString('binary');
  const decrypted = decryptXtea(encrypted, params);
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
// Field Name Mapping
// ═══════════════════════════════════════════════════════════════════════

/**
 * Load field mapping from puppeteer-capture if available.
 * Maps browserIndex → fieldName for readable diffs.
 */
function loadFieldMapping() {
  const mappingPath = path.join(__dirname, '..', 'output', 'puppeteer-capture', 'field-mapping.json');
  try {
    if (fs.existsSync(mappingPath)) {
      const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8'));
      const byIndex = {};
      for (const entry of mapping) {
        byIndex[entry.browserIndex] = entry.fieldName;
      }
      return byIndex;
    }
  } catch (e) {
    // Ignore
  }
  return {};
}

// ═══════════════════════════════════════════════════════════════════════
// Severity Classification
// ═══════════════════════════════════════════════════════════════════════

/** Fields that are expected to differ between Chrome and standalone */
const DYNAMIC_FIELDS = new Set([
  'timestamp', 'timestampInit', 'timestampCollectionStart', 'timestampCollectionEnd',
  'canvasHash', 'mathFingerprint', 'performanceHash',
  'behavioralEvents', 'pageUrl',
]);

/** Fields that are critical for token acceptance */
const CRITICAL_FIELDS = new Set([
  'callCounter', 'osPlatform', 'platform', 'userAgent', 'featureBitmask',
  'webdriverFlag', 'headlessFlag', 'internalToken',
]);

/** Fields that are high-importance for fingerprinting */
const HIGH_FIELDS = new Set([
  'screenResolution', 'vendor', 'webglRenderer', 'webglImage',
  'userAgentData', 'highEntropyValues', 'detectedFonts', 'languages',
  'audioFingerprint', 'maxTouchPoints', 'maxTouchPointsDup',
]);

function classifySeverity(fieldName) {
  if (DYNAMIC_FIELDS.has(fieldName)) return 'dynamic';
  if (CRITICAL_FIELDS.has(fieldName)) return 'critical';
  if (HIGH_FIELDS.has(fieldName)) return 'high';
  return 'low';
}

// ═══════════════════════════════════════════════════════════════════════
// CLI Argument Parsing
// ═══════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headful: false, maxRetries: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') {
      opts.headful = true;
    } else if (args[i] === '--retries' && args[i + 1]) {
      opts.maxRetries = parseInt(args[i + 1], 10) || 3;
      i++;
    }
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const opts = parseArgs();
  const projectRoot = path.resolve(__dirname, '..');

  console.log('=== Chrome vs Standalone Collect Token Diff ===\n');

  // ── Step 1: Run Puppeteer solver ──
  console.log('Step 1: Running Puppeteer CAPTCHA solver...');
  const solver = new CaptchaPuppeteer({
    headless: !opts.headful,
  });

  let result = null;
  let attempts = 0;

  try {
    while (attempts < opts.maxRetries) {
      attempts++;
      console.log(`  Attempt ${attempts}/${opts.maxRetries}...`);

      try {
        result = await solver.solve();
        if (result.errorCode === 0) {
          console.log(`  Success on attempt ${attempts}: errorCode=0`);
          break;
        }
        console.log(`  Attempt ${attempts} failed: errorCode=${result.errorCode}`);
        result = null;
      } catch (err) {
        console.log(`  Attempt ${attempts} error: ${err.message}`);
        result = null;
      }
    }
  } finally {
    await solver.close();
  }

  if (!result || result.errorCode !== 0) {
    console.error('\nERROR: Failed to get a successful CAPTCHA solve after', opts.maxRetries, 'attempts');
    process.exit(1);
  }

  // ── Step 2: Extract captures ──
  console.log('\nStep 2: Extracting captured data...');
  const capture = result._capture;
  if (!capture) {
    console.error('ERROR: result._capture is missing');
    process.exit(1);
  }

  const tdcSource = capture.tdcSource;
  const verifyPost = capture.verifyPostBody;

  if (!tdcSource) {
    console.error('ERROR: No tdc.js source captured');
    process.exit(1);
  }
  if (!verifyPost) {
    console.error('ERROR: No verify POST body captured');
    process.exit(1);
  }

  const browserCollect = verifyPost.collect;
  if (!browserCollect) {
    console.error('ERROR: No collect field in verify POST body');
    console.error('  Available fields:', Object.keys(verifyPost).join(', '));
    process.exit(1);
  }

  console.log(`  tdc.js source: ${tdcSource.length} chars`);
  console.log(`  Verify POST fields: ${Object.keys(verifyPost).join(', ')}`);
  console.log(`  Browser collect: ${browserCollect.length} chars`);

  // ── Step 3: Extract XTEA params via pipeline dynamic tracing ──
  console.log('\nStep 3: Extracting XTEA params via pipeline...');
  const tdcName = extractTdcName(tdcSource);
  console.log(`  TDC_NAME: ${tdcName || '(not found)'}`);

  // Save captured tdc.js to temp file and run the porting pipeline
  const tmpTdcPath = path.join(projectRoot, 'output', 'live-capture-tdc.js');
  fs.writeFileSync(tmpTdcPath, tdcSource, 'utf8');
  console.log(`  Saved captured tdc.js to ${tmpTdcPath} (${tdcSource.length} chars)`);

  console.log('  Running pipeline: parse → map → extract key...');
  try {
    const pipelineOutput = execSync(
      `node pipeline/run.js "${tmpTdcPath}" --skip-verify`,
      { cwd: projectRoot, timeout: 120000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log('  Pipeline completed');
  } catch (pipeErr) {
    // Pipeline may exit non-zero but still produce output
    const stderr = pipeErr.stderr || '';
    const stdout = pipeErr.stdout || '';
    if (stderr) console.log('  Pipeline stderr:', stderr.substring(0, 200));
    if (stdout) console.log('  Pipeline stdout:', stdout.substring(0, 200));
  }

  // Read the pipeline output
  const pipeOutputDir = path.join(projectRoot, 'output', 'live-capture-tdc');
  const xteaParamsPath = path.join(pipeOutputDir, 'xtea-params.json');
  const pipeConfigPath = path.join(pipeOutputDir, 'pipeline-config.json');

  if (!fs.existsSync(xteaParamsPath)) {
    console.error('ERROR: Pipeline did not produce xtea-params.json');
    console.error('  Expected at:', xteaParamsPath);
    process.exit(1);
  }

  const keyResult = JSON.parse(fs.readFileSync(xteaParamsPath, 'utf8'));
  console.log(`  Key extraction notes: ${keyResult.notes || 'none'}`);

  // Also read pipeline-config for cdFieldOrder and caseCount
  let pipeConfig = {};
  if (fs.existsSync(pipeConfigPath)) {
    pipeConfig = JSON.parse(fs.readFileSync(pipeConfigPath, 'utf8'));
  }

  // Build XTEA params from pipeline output
  // The pipeline extracts keyModConstants as [mod1, mod3] (2 elements)
  // But the actual template may use mods on different indices (e.g. [0,0,mod2,mod3] for 98-opcode)
  // Use the full 4-element keyMods if available in the cache, otherwise derive from pipeline
  const cache = new TemplateCache();
  cache.load();
  const cached = tdcName ? cache.lookup(tdcName) : null;

  let keyMods;
  if (cached && cached.keyMods && cached.keyMods.length === 4) {
    keyMods = cached.keyMods;
    console.log(`  Using keyMods from cache: [${keyMods.join(', ')}]`);
  } else if (keyResult.keyModConstants) {
    // Default mapping: keyModConstants[0] → idx 1, keyModConstants[1] → idx 3
    keyMods = [0, keyResult.keyModConstants[0] || 0, 0, keyResult.keyModConstants[1] || 0];
    console.log(`  Derived keyMods from pipeline: [${keyMods.join(', ')}]`);
  } else {
    keyMods = [0, 0, 0, 0];
    console.log('  WARNING: No keyMods found, using [0,0,0,0]');
  }

  const xteaParams = {
    key: keyResult.key,
    delta: keyResult.delta,
    rounds: keyResult.rounds,
    keyMods: keyMods,
  };

  const caseCount = pipeConfig.caseCount || (cached && cached.caseCount) || '?';
  const cdFieldOrder = (pipeConfig.cdFieldOrder) || (cached && cached.cdFieldOrder) || null;

  const keyHex = keyResult.key.map(k => (k >>> 0).toString(16).padStart(8, '0')).join(' ');
  console.log(`  Template: ${caseCount} cases`);
  console.log(`  XTEA key: ${keyHex}`);
  console.log(`  keyMods: [${keyMods.join(', ')}]`);

  // ── Step 4: Decrypt Chrome collect ──
  console.log('\nStep 4: Decrypting Chrome collect token...');
  const chromeResult = decryptCollect(browserCollect, xteaParams);

  if (!chromeResult.parsed) {
    console.error('ERROR: Chrome token decryption failed (not valid JSON)');
    console.error('  First 100 chars:', chromeResult.plaintext.substring(0, 100));
    process.exit(1);
  }

  const chromeCd = chromeResult.parsed.cd || [];
  const chromeSd = chromeResult.parsed.sd || {};
  console.log(`  Decrypted OK: ${chromeCd.length} cd fields, sd keys: [${Object.keys(chromeSd).join(', ')}]`);

  // ── Step 5: Generate standalone collect ──
  console.log('\nStep 5: Generating standalone collect token...');

  const profile = JSON.parse(
    fs.readFileSync(path.join(projectRoot, 'profiles', 'default.json'), 'utf8')
  );

  // Use current time for timestamps
  const nowSec = Math.round(Date.now() / 1000);
  const profileOverrides = Object.assign({}, profile, {
    pageUrl: `https://t.captcha.qq.com/cap_union_new_show?rand=${Math.floor(Math.random() * 1e10)}`,
    timestamp: nowSec,
    timestampCollectionStart: nowSec,
    timestampCollectionEnd: nowSec + 3,
    canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
    mathFingerprint: Math.random(),
    performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
  });

  // Parse ans from browser POST
  const browserAns = verifyPost.ans || '';
  const ansMatch = browserAns.match(/(\d+),(\d+)/);
  let xAnswer = 100;
  let slideY = 45;
  if (ansMatch) {
    xAnswer = parseInt(ansMatch[1], 10);
    slideY = parseInt(ansMatch[2], 10);
  }
  console.log(`  Browser ans: "${browserAns}" → xAnswer=${xAnswer}, slideY=${slideY}`);

  const timestamp = Date.now();
  const behavioralEvents = generateBehavioralEvents(xAnswer, slideY, timestamp);

  // Build slideValue array from behavioral events (dx, dy, dt tuples)
  const slideValue = behavioralEvents
    .filter(e => e[0] === 1)
    .map(e => [e[1], e[2], e[3]]);

  const slideSd = buildSlideSd(
    { x: xAnswer, y: slideY },
    slideValue,
    { trycnt: 1 }
  );

  const standaloneCollect = generateCollect(profileOverrides, xteaParams, {
    sdOverride: slideSd,
    cdFieldOrder: cdFieldOrder,
    behavioralEvents: behavioralEvents,
    timestamp: timestamp,
  });

  console.log(`  Standalone collect: ${standaloneCollect.length} chars`);

  // ── Step 6: Decrypt standalone collect ──
  console.log('\nStep 6: Decrypting standalone collect token...');
  const standaloneResult = decryptCollect(standaloneCollect, xteaParams);

  if (!standaloneResult.parsed) {
    console.error('ERROR: Standalone token decryption failed (not valid JSON)');
    console.error('  First 100 chars:', standaloneResult.plaintext.substring(0, 100));
    process.exit(1);
  }

  const standaloneCd = standaloneResult.parsed.cd || [];
  const standaloneSd = standaloneResult.parsed.sd || {};
  console.log(`  Decrypted OK: ${standaloneCd.length} cd fields, sd keys: [${Object.keys(standaloneSd).join(', ')}]`);

  // ── Step 7: Diff ──
  console.log('\nStep 7: Building field-by-field diff...');

  const fieldMapping = loadFieldMapping();
  const maxCdLen = Math.max(chromeCd.length, standaloneCd.length);

  const cdDiff = [];
  let cdMatch = 0;
  let cdMismatch = 0;
  let cdDynamic = 0;
  const criticalDiffs = [];
  const highDiffs = [];

  for (let i = 0; i < maxCdLen; i++) {
    const chromeVal = i < chromeCd.length ? chromeCd[i] : undefined;
    const standaloneVal = i < standaloneCd.length ? standaloneCd[i] : undefined;
    const fieldName = fieldMapping[i] || `field_${i}`;
    const severity = classifySeverity(fieldName);

    const chromeStr = JSON.stringify(chromeVal);
    const standaloneStr = JSON.stringify(standaloneVal);
    const match = chromeStr === standaloneStr;

    if (match) {
      cdMatch++;
    } else if (severity === 'dynamic') {
      cdDynamic++;
    } else {
      cdMismatch++;
    }

    const entry = {
      index: i,
      fieldName: fieldName,
      chrome: chromeVal,
      standalone: standaloneVal,
      match: match,
      severity: severity,
    };
    cdDiff.push(entry);

    if (!match && severity === 'critical') {
      criticalDiffs.push({ index: i, fieldName, chrome: chromeVal, standalone: standaloneVal });
    }
    if (!match && severity === 'high') {
      highDiffs.push({ index: i, fieldName, chrome: chromeVal, standalone: standaloneVal });
    }
  }

  // SD diff
  const allSdKeys = new Set([
    ...Object.keys(chromeSd),
    ...Object.keys(standaloneSd),
  ]);
  const sdDiff = [];
  for (const key of allSdKeys) {
    const chromeVal = chromeSd[key];
    const standaloneVal = standaloneSd[key];
    const match = JSON.stringify(chromeVal) === JSON.stringify(standaloneVal);
    sdDiff.push({
      key: key,
      chrome: chromeVal,
      standalone: standaloneVal,
      match: match,
    });
  }

  // ── Step 8: Output ──
  console.log('\nStep 8: Writing output...');

  const output = {
    timestamp: new Date().toISOString(),
    description: 'Same-session comparison: Chrome tdc.js collect vs standalone collect',
    session: {
      tdcName: tdcName,
      templateCaseCount: caseCount,
      xteaKey: keyHex,
      nonce: verifyPost.nonce || null,
      ans: browserAns,
    },
    chromeCollect: {
      length: browserCollect.length,
      decryptedLength: chromeResult.plaintext.length,
      cdFieldCount: chromeCd.length,
      sdFields: Object.keys(chromeSd),
    },
    standaloneCollect: {
      length: standaloneCollect.length,
      decryptedLength: standaloneResult.plaintext.length,
      cdFieldCount: standaloneCd.length,
      sdFields: Object.keys(standaloneSd),
    },
    cdDiff: cdDiff,
    sdDiff: sdDiff,
    summary: {
      cdTotal: maxCdLen,
      cdMatch: cdMatch,
      cdMismatch: cdMismatch,
      cdDynamic: cdDynamic,
      criticalDiffs: criticalDiffs,
      highDiffs: highDiffs,
    },
  };

  const outputDir = path.join(projectRoot, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = path.join(outputDir, 'chrome-vs-standalone-diff.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8');
  console.log(`  Saved to ${outputPath}`);

  // ── Print readable summary ──
  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(60));

  console.log(`\nTemplate: ${tdcName} (${cached.caseCount || '?'} cases)`);
  console.log(`XTEA key: ${keyHex}`);
  console.log(`Browser ans: "${browserAns}"`);

  console.log(`\nToken lengths:     chrome=${browserCollect.length}  standalone=${standaloneCollect.length}`);
  console.log(`Plaintext lengths: chrome=${chromeResult.plaintext.length}  standalone=${standaloneResult.plaintext.length}`);
  console.log(`CD field count:    chrome=${chromeCd.length}  standalone=${standaloneCd.length}`);

  console.log(`\nCD field comparison:`);
  console.log(`  Matching:    ${cdMatch}/${maxCdLen}`);
  console.log(`  Mismatched:  ${cdMismatch}/${maxCdLen}`);
  console.log(`  Dynamic:     ${cdDynamic}/${maxCdLen} (expected to differ)`);

  if (criticalDiffs.length > 0) {
    console.log(`\n  CRITICAL diffs (${criticalDiffs.length}):`);
    for (const d of criticalDiffs) {
      const cStr = truncate(JSON.stringify(d.chrome), 60);
      const sStr = truncate(JSON.stringify(d.standalone), 60);
      console.log(`    [${d.index}] ${d.fieldName}: chrome=${cStr}  standalone=${sStr}`);
    }
  }

  if (highDiffs.length > 0) {
    console.log(`\n  HIGH diffs (${highDiffs.length}):`);
    for (const d of highDiffs) {
      const cStr = truncate(JSON.stringify(d.chrome), 60);
      const sStr = truncate(JSON.stringify(d.standalone), 60);
      console.log(`    [${d.index}] ${d.fieldName}: chrome=${cStr}  standalone=${sStr}`);
    }
  }

  // Show all non-matching, non-dynamic fields
  const otherDiffs = cdDiff.filter(d => !d.match && d.severity === 'low');
  if (otherDiffs.length > 0) {
    console.log(`\n  LOW diffs (${otherDiffs.length}):`);
    for (const d of otherDiffs) {
      const cStr = truncate(JSON.stringify(d.chrome), 60);
      const sStr = truncate(JSON.stringify(d.standalone), 60);
      console.log(`    [${d.index}] ${d.fieldName}: chrome=${cStr}  standalone=${sStr}`);
    }
  }

  // SD comparison
  const sdMismatches = sdDiff.filter(d => !d.match);
  console.log(`\nSD comparison: ${sdDiff.length - sdMismatches.length}/${sdDiff.length} fields match`);
  if (sdMismatches.length > 0) {
    for (const d of sdMismatches) {
      const cStr = truncate(JSON.stringify(d.chrome), 60);
      const sStr = truncate(JSON.stringify(d.standalone), 60);
      console.log(`  ${d.key}: chrome=${cStr}  standalone=${sStr}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Output saved to: ${outputPath}`);
  console.log('='.repeat(60));
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  console.error(err.stack);
  process.exit(1);
});
