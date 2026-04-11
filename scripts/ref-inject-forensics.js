'use strict';

/**
 * ref-inject-forensics.js — Inject Reference tdc.js into Chrome for Forensic Comparison
 *
 * Injects our known reference tdc.js (Template A) into Chrome's CAPTCHA page,
 * bypassing the key extraction problem. Uses hardcoded XTEA params that are
 * verified byte-identical for Template A.
 *
 * Performs three precise comparisons:
 *
 * Comparison A: Plaintext Serialization
 *   - Decrypt Chrome's collect token, extract cd/sd
 *   - Build our plaintext from the same values using buildCdString/buildSdString
 *   - Character-by-character comparison
 *
 * Comparison B: Encryption Round-Trip
 *   - Split Chrome's encrypted token into 4 base64 segments
 *   - Decrypt each segment independently
 *   - Re-encrypt each decrypted segment with same XTEA params
 *   - Compare reassembled token with original
 *
 * Comparison C: Full Reconstruction
 *   - Take Chrome's cd, sd, and timestamp
 *   - Run through full generateCollect() with overrides
 *   - Compare output with Chrome's original token
 *
 * Usage:
 *   node scripts/ref-inject-forensics.js
 *   node scripts/ref-inject-forensics.js --headful
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const {
  buildCdString,
  buildSdString,
  assembleToken,
  urlEncode,
} = require('../token/outer-pipeline');
const { buildInputChunks } = require('../token/generate-token');
const {
  generateCollect,
  createEncryptFn,
  encrypt,
  normalizeKeyMods,
  buildDefaultCdArray,
} = require('../scraper/collect-generator');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const PROJECT_ROOT = path.resolve(__dirname, '..');
const REF_TDC_PATH = path.join(PROJECT_ROOT, 'targets', 'tdc.js');

// Template A XTEA params — known, verified byte-identical
const TEMPLATE_A_XTEA = {
  key: [0x6257584F, 0x462A4564, 0x636A5062, 0x6D644140],
  delta: 0x9E3779B9,
  rounds: 32,
  keyMods: [0, 2368517, 0, 592130],
  keyModConstants: [2368517, 592130],
};

const DEFAULT_AID = '2046626881';
const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const NAV_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[ref-inject] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
  }
  return opts;
}

/**
 * Compare two strings character-by-character. Returns first diff info or null if identical.
 */
function compareStrings(a, b, label) {
  const minLen = Math.min(a.length, b.length);
  let firstDiff = -1;
  for (let i = 0; i < minLen; i++) {
    if (a[i] !== b[i]) {
      firstDiff = i;
      break;
    }
  }
  if (firstDiff === -1 && a.length !== b.length) {
    firstDiff = minLen;
  }
  if (firstDiff === -1) {
    return { match: true, label };
  }
  const ctx = 40;
  return {
    match: false,
    label,
    position: firstDiff,
    lengthA: a.length,
    lengthB: b.length,
    contextA: a.substring(Math.max(0, firstDiff - ctx), firstDiff + ctx),
    contextB: b.substring(Math.max(0, firstDiff - ctx), firstDiff + ctx),
    charA: a.charCodeAt(firstDiff),
    charB: b.charCodeAt(firstDiff),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption
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
  const { key, delta, rounds } = params;
  const keyMods = normalizeKeyMods(params);
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

/**
 * URL-decode a collect token to raw base64.
 */
function urlDecodeCollect(collectStr) {
  return collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');
}

// ═══════════════════════════════════════════════════════════════════════
// Comparison A: Plaintext Serialization
// ═══════════════════════════════════════════════════════════════════════

function comparisonA(plaintext, parsed, xteaParams) {
  log('=== COMPARISON A: Plaintext Serialization ===');

  const result = {
    cdStringsMatch: null,
    cdFirstDiffPosition: null,
    cdContext: null,
    sdStringsMatch: null,
    sdFirstDiffPosition: null,
    sdContext: null,
    chromePlaintextLength: plaintext.length,
    chromeHasValidJson: !!parsed,
  };

  if (!parsed || !parsed.cd || !parsed.sd) {
    log('  Cannot compare: Chrome plaintext did not parse to valid {cd, sd} JSON');
    result.error = 'Chrome plaintext did not parse to valid {cd, sd} JSON';
    return result;
  }

  const chromeCd = parsed.cd;
  const chromeSd = parsed.sd;

  // Build our cd string from Chrome's values
  const ourCdString = buildCdString(chromeCd);

  // Build our sd string from Chrome's values
  const ourSdString = buildSdString(chromeSd);

  log(`  Chrome cd array length: ${chromeCd.length} fields`);
  log(`  Our cdString length: ${ourCdString.length} chars`);
  log(`  Our sdString length: ${ourSdString.length} chars`);

  // Extract Chrome's cd string from the decrypted plaintext.
  const cdJsonStart = plaintext.indexOf('{"cd":[');
  if (cdJsonStart < 0) {
    log('  WARNING: Could not find {"cd":[ in Chrome plaintext');
    result.error = 'Could not find cd JSON in plaintext';
    return result;
  }

  const sdJsonStart = plaintext.indexOf('"sd":', cdJsonStart);
  if (sdJsonStart < 0) {
    log('  WARNING: Could not find "sd": in Chrome plaintext');
    result.error = 'Could not find sd JSON in plaintext';
    return result;
  }

  // Extract Chrome's cd portion
  let chromeCdPortion = plaintext.substring(cdJsonStart, sdJsonStart);
  chromeCdPortion = chromeCdPortion.replace(/[\s,]+$/, '');
  if (!chromeCdPortion.endsWith(']}')) {
    chromeCdPortion += ']}';
  }

  log(`  Chrome cd portion length: ${chromeCdPortion.length} chars`);
  log(`  Chrome cd first 80: ${JSON.stringify(chromeCdPortion.substring(0, 80))}`);
  log(`  Our cd first 80:    ${JSON.stringify(ourCdString.substring(0, 80))}`);

  // Compare cd strings
  const cdCmp = compareStrings(chromeCdPortion, ourCdString, 'cdString');
  if (cdCmp.match) {
    log('  cd strings: IDENTICAL');
    result.cdStringsMatch = true;
  } else {
    log(`  cd strings: DIFFER at position ${cdCmp.position}`);
    log(`    Chrome: ...${JSON.stringify(cdCmp.contextA)}...`);
    log(`    Ours:   ...${JSON.stringify(cdCmp.contextB)}...`);
    log(`    Chrome char: ${cdCmp.charA} (${String.fromCharCode(cdCmp.charA || 32)})`);
    log(`    Our char:    ${cdCmp.charB} (${String.fromCharCode(cdCmp.charB || 32)})`);
    result.cdStringsMatch = false;
    result.cdFirstDiffPosition = cdCmp.position;
    result.cdContext = { chrome: cdCmp.contextA, ours: cdCmp.contextB };
  }

  // Extract Chrome's sd portion
  let chromeSdPortion = plaintext.substring(sdJsonStart);
  chromeSdPortion = chromeSdPortion.replace(/[\0\s]+$/, '');
  if (!chromeSdPortion.endsWith('}}')) {
    const lastBrace = chromeSdPortion.lastIndexOf('}}');
    if (lastBrace >= 0) {
      chromeSdPortion = chromeSdPortion.substring(0, lastBrace + 2);
    }
  }

  log(`  Chrome sd portion length: ${chromeSdPortion.length} chars`);
  log(`  Chrome sd first 80: ${JSON.stringify(chromeSdPortion.substring(0, 80))}`);
  log(`  Our sd first 80:    ${JSON.stringify(ourSdString.substring(0, 80))}`);

  // Compare sd strings
  const sdCmp = compareStrings(chromeSdPortion, ourSdString, 'sdString');
  if (sdCmp.match) {
    log('  sd strings: IDENTICAL');
    result.sdStringsMatch = true;
  } else {
    log(`  sd strings: DIFFER at position ${sdCmp.position}`);
    log(`    Chrome: ...${JSON.stringify(sdCmp.contextA)}...`);
    log(`    Ours:   ...${JSON.stringify(sdCmp.contextB)}...`);
    result.sdStringsMatch = false;
    result.sdFirstDiffPosition = sdCmp.position;
    result.sdContext = { chrome: sdCmp.contextA, ours: sdCmp.contextB };
  }

  // Compare the full plaintext reconstruction
  const ourFullBody = ourCdString.slice(0, -1) + ',' + ourSdString;
  const chromeFullBody = plaintext.substring(cdJsonStart).replace(/[\0]+/g, '').replace(/\s+$/g, '');

  log(`  Chrome full body length (trimmed): ${chromeFullBody.length}`);
  log(`  Our full body length: ${ourFullBody.length}`);

  const fullCmp = compareStrings(chromeFullBody, ourFullBody, 'fullBody');
  result.fullBodyMatch = fullCmp.match;
  if (!fullCmp.match) {
    log(`  Full body: DIFFER at position ${fullCmp.position}`);
    log(`    Chrome: ...${JSON.stringify(fullCmp.contextA)}...`);
    log(`    Ours:   ...${JSON.stringify(fullCmp.contextB)}...`);
    result.fullBodyFirstDiff = fullCmp.position;
    result.fullBodyContext = { chrome: fullCmp.contextA, ours: fullCmp.contextB };
  } else {
    log('  Full body: IDENTICAL');
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Comparison B: Encryption Round-Trip
// ═══════════════════════════════════════════════════════════════════════

function comparisonB(chromeCollect, xteaParams, sdStringLength) {
  log('=== COMPARISON B: Encryption Round-Trip ===');

  const result = {
    roundTripMatch: null,
    segmentSizes: {},
    firstDiffSegment: null,
    firstDiffByte: null,
  };

  // URL-decode Chrome's token to raw base64
  const chromeB64 = urlDecodeCollect(chromeCollect);
  log(`  Chrome token base64 length: ${chromeB64.length} chars`);

  // Split into segments. Assembly order is [1, 0, 2, 3] = [header, hash, cdBody, sig]
  const headerB64 = chromeB64.substring(0, 192);
  const hashB64 = chromeB64.substring(192, 256);

  // Sig size: encrypt pads sdString to 8-byte boundary
  const sigEncryptedLen = Math.ceil(sdStringLength / 8) * 8;
  const sigB64Len = Math.ceil(sigEncryptedLen / 3) * 4;
  const sigB64 = chromeB64.substring(chromeB64.length - sigB64Len);

  // cdBody is the middle
  const cdBodyB64 = chromeB64.substring(256, chromeB64.length - sigB64Len);

  result.segmentSizes = {
    header: headerB64.length,
    hash: hashB64.length,
    cdBody: cdBodyB64.length,
    sig: sigB64.length,
    total: headerB64.length + hashB64.length + cdBodyB64.length + sigB64.length,
    original: chromeB64.length,
  };

  log(`  Segment sizes (base64): header=${headerB64.length}, hash=${hashB64.length}, cdBody=${cdBodyB64.length}, sig=${sigB64.length}`);
  log(`  Total reassembled: ${result.segmentSizes.total}, original: ${result.segmentSizes.original}`);

  if (result.segmentSizes.total !== result.segmentSizes.original) {
    log(`  WARNING: Segment size mismatch! total=${result.segmentSizes.total} vs original=${result.segmentSizes.original}`);
    result.segmentSizeMismatch = true;
  }

  // Decrypt each segment independently
  const keyMods = normalizeKeyMods(xteaParams);
  const { key, delta, rounds } = xteaParams;

  const segments = [
    { name: 'header', b64: headerB64 },
    { name: 'hash', b64: hashB64 },
    { name: 'cdBody', b64: cdBodyB64 },
    { name: 'sig', b64: sigB64 },
  ];

  const decrypted = {};
  const reencrypted = {};

  for (const seg of segments) {
    const encryptedBin = Buffer.from(seg.b64, 'base64').toString('binary');
    const decryptedBin = decryptXtea(encryptedBin, xteaParams);
    decrypted[seg.name] = decryptedBin;

    // Show decrypted content (trimmed)
    const trimmed = decryptedBin.replace(/[\0\s]+$/, '');
    log(`  ${seg.name} decrypted (${decryptedBin.length}b, trimmed ${trimmed.length}b): ${JSON.stringify(trimmed.substring(0, 80))}${trimmed.length > 80 ? '...' : ''}`);

    // Re-encrypt using the encrypt function from collect-generator
    const reencryptedBin = encrypt(decryptedBin, key, delta, rounds, keyMods);
    const reencryptedB64 = Buffer.from(reencryptedBin, 'binary').toString('base64');
    reencrypted[seg.name] = reencryptedB64;

    // Compare with original segment
    if (reencryptedB64 === seg.b64) {
      log(`  ${seg.name} round-trip: IDENTICAL`);
    } else {
      log(`  ${seg.name} round-trip: DIFFER`);
      log(`    Original b64 (first 60): ${seg.b64.substring(0, 60)}`);
      log(`    Re-enc  b64 (first 60): ${reencryptedB64.substring(0, 60)}`);

      // Find first differing byte in the binary
      const origBin = Buffer.from(seg.b64, 'base64').toString('binary');
      const reencBin = Buffer.from(reencryptedB64, 'base64').toString('binary');
      let diffByte = -1;
      const minBinLen = Math.min(origBin.length, reencBin.length);
      for (let i = 0; i < minBinLen; i++) {
        if (origBin.charCodeAt(i) !== reencBin.charCodeAt(i)) {
          diffByte = i;
          break;
        }
      }
      if (diffByte === -1 && origBin.length !== reencBin.length) {
        diffByte = minBinLen;
      }
      log(`    First diff byte: ${diffByte} (orig len=${origBin.length}, reenc len=${reencBin.length})`);

      if (!result.firstDiffSegment) {
        result.firstDiffSegment = seg.name;
        result.firstDiffByte = diffByte;
      }
    }
  }

  // Reassemble in [header, hash, cdBody, sig] order
  const reassembled = reencrypted.header + reencrypted.hash + reencrypted.cdBody + reencrypted.sig;

  if (reassembled === chromeB64) {
    log('  Full round-trip: IDENTICAL -- our encrypt is the exact inverse of decrypt');
    result.roundTripMatch = true;
  } else {
    log('  Full round-trip: DIFFER');
    const cmp = compareStrings(reassembled, chromeB64, 'roundTrip');
    log(`    First diff at base64 position ${cmp.position}`);
    result.roundTripMatch = false;
    result.roundTripFirstDiffB64 = cmp.position;
  }

  // Store the decrypted hash content for Comparison C
  result.hashContent = decrypted.hash.replace(/[\0\s]+$/, '');

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Comparison C: Full Reconstruction
// ═══════════════════════════════════════════════════════════════════════

function comparisonC(chromeCollect, parsed, xteaParams, hashContent) {
  log('=== COMPARISON C: Full Reconstruction ===');

  const result = {
    fullReconstructionMatch: null,
    firstDiffPosition: null,
  };

  if (!parsed || !parsed.cd || !parsed.sd) {
    log('  Cannot reconstruct: no parsed cd/sd from Chrome');
    result.error = 'No parsed cd/sd from Chrome';
    return result;
  }

  // Extract timestamp from hash chunk
  const tsMatch = hashContent.match(/\[\[4,-1,-1,(\d+),/);
  const chromeTimestamp = tsMatch ? parseInt(tsMatch[1], 10) : Date.now();
  log(`  Chrome timestamp from hash: ${chromeTimestamp}`);
  log(`  Hash content: ${JSON.stringify(hashContent)}`);

  // Run through full generateCollect with Chrome's cd and sd
  const fullToken = generateCollect({}, xteaParams, {
    cdArrayOverride: parsed.cd,
    sdOverride: parsed.sd,
    timestamp: chromeTimestamp,
  });

  // URL-decode both for comparison
  const chromeB64 = urlDecodeCollect(chromeCollect);
  const ourB64 = urlDecodeCollect(fullToken);

  log(`  Chrome token b64 length: ${chromeB64.length}`);
  log(`  Our token b64 length: ${ourB64.length}`);

  if (ourB64 === chromeB64) {
    log('  Full reconstruction: IDENTICAL');
    result.fullReconstructionMatch = true;
  } else {
    log('  Full reconstruction: DIFFER');
    const cmp = compareStrings(ourB64, chromeB64, 'fullReconstruction');
    result.fullReconstructionMatch = false;
    result.firstDiffPosition = cmp.position;
    log(`    First diff at base64 position ${cmp.position}`);
    log(`    Our (around diff): ${JSON.stringify(cmp.contextB)}`);
    log(`    Chrome (around diff): ${JSON.stringify(cmp.contextA)}`);

    // Determine which segment the diff falls in
    const sdString = buildSdString(parsed.sd);
    const sigEncLen = Math.ceil(sdString.length / 8) * 8;
    const sigB64Len = Math.ceil(sigEncLen / 3) * 4;
    const cdBodyEnd = chromeB64.length - sigB64Len;

    let diffSegment;
    if (cmp.position < 192) {
      diffSegment = 'header (b64 0-191)';
    } else if (cmp.position < 256) {
      diffSegment = 'hash (b64 192-255)';
    } else if (cmp.position < cdBodyEnd) {
      diffSegment = `cdBody (b64 256-${cdBodyEnd - 1})`;
    } else {
      diffSegment = `sig (b64 ${cdBodyEnd}-${chromeB64.length - 1})`;
    }
    log(`    Diff is in segment: ${diffSegment}`);
    result.diffSegment = diffSegment;

    // Chunk-level comparison
    const ourCdString = buildCdString(parsed.cd);
    const ourSdString = buildSdString(parsed.sd);
    const ourChunks = buildInputChunks(ourCdString, ourSdString, chromeTimestamp);
    const encryptFn = createEncryptFn(xteaParams);
    const ourBtoaSegments = encryptFn(ourChunks);

    // Chrome's segments
    const chromeHeaderB64 = chromeB64.substring(0, 192);
    const chromeHashB64 = chromeB64.substring(192, 256);
    const chromeSigB64 = chromeB64.substring(chromeB64.length - sigB64Len);
    const chromeCdBodyB64 = chromeB64.substring(256, chromeB64.length - sigB64Len);

    // Compare each btoa segment
    // ourBtoaSegments[0]=hash, [1]=header, [2]=cdBody, [3]=sig
    const segPairs = [
      { name: 'header', ours: ourBtoaSegments[1], chrome: chromeHeaderB64 },
      { name: 'hash', ours: ourBtoaSegments[0], chrome: chromeHashB64 },
      { name: 'cdBody', ours: ourBtoaSegments[2], chrome: chromeCdBodyB64 },
      { name: 'sig', ours: ourBtoaSegments[3], chrome: chromeSigB64 },
    ];

    result.segmentComparison = {};
    for (const sp of segPairs) {
      const match = sp.ours === sp.chrome;
      result.segmentComparison[sp.name] = { match, oursLen: sp.ours.length, chromeLen: sp.chrome.length };
      if (match) {
        log(`    ${sp.name}: IDENTICAL (${sp.ours.length} chars)`);
      } else {
        const sc = compareStrings(sp.ours, sp.chrome, sp.name);
        log(`    ${sp.name}: DIFFER at pos ${sc.position} (ours ${sp.ours.length} vs chrome ${sp.chrome.length})`);
        result.segmentComparison[sp.name].firstDiff = sc.position;
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function run(opts) {
  const { headless } = opts;
  const userAgent = DEFAULT_USER_AGENT;
  const xteaParams = TEMPLATE_A_XTEA;

  // ── Step 1: Read reference tdc.js ──
  log('Step 1: Reading reference tdc.js...');
  if (!fs.existsSync(REF_TDC_PATH)) {
    throw new Error(`Reference tdc.js not found at ${REF_TDC_PATH}`);
  }
  const refTdcSource = fs.readFileSync(REF_TDC_PATH, 'utf8');
  log(`  Reference tdc.js: ${refTdcSource.length} chars`);

  // ── Step 2: Launch Chrome ──
  log('Step 2: Launching Chrome...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);

  const results = {
    timestamp: new Date().toISOString(),
    template: 'A-reference-injected',
    xteaSource: 'hardcoded',
    comparisonA: null,
    comparisonB: null,
    comparisonC: null,
  };

  try {
    // ── Step 3: Prehandle ──
    log('Step 3: Prehandle...');
    const client = new CaptchaClient({
      aid: DEFAULT_AID,
      referer: 'https://urlsec.qq.com/',
    });
    const session = await client.prehandle();
    log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

    // ── Step 4: Set up CDP interception and navigate ──
    log('Step 4: Navigate to show page + inject reference tdc.js...');

    const showParams = new URLSearchParams({
      aid: DEFAULT_AID,
      protocol: 'https',
      accver: '1',
      showtype: 'popup',
      ua: Buffer.from(userAgent).toString('base64'),
      noheader: '1',
      fb: '1',
      aged: '0',
      enableAged: '0',
      enableDarkMode: '0',
      grayscale: '1',
      dyeid: '0',
      clientype: '2',
      sess: session.sess,
      fwidth: '0',
      sid: session.sid,
      wxLang: '',
      tcScale: '1',
      uid: '',
      cap_cd: '',
      rnd: String(Math.floor(Math.random() * 1000000)),
      prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
      createIframeStart: String(Date.now()),
      global: '0',
      subsid: '1',
    });
    const showUrl = `${BASE_URL}/cap_union_new_show?${showParams.toString()}`;

    let injected = false;

    // Use CDP Fetch at Request stage ONLY for tdc.js — all other requests pass through
    const cdp = await page.target().createCDPSession();
    await cdp.send('Fetch.enable', {
      patterns: [{ urlPattern: '*tdc.js*', requestStage: 'Request' }],
    });

    cdp.on('Fetch.requestPaused', async (event) => {
      const { requestId } = event;
      try {
        const body = Buffer.from(refTdcSource).toString('base64');
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
            { name: 'Access-Control-Allow-Origin', value: '*' },
          ],
          body,
        });
        injected = true;
        log('  Injected reference tdc.js');
      } catch (err) {
        log(`  CDP fulfillRequest error: ${err.message}`);
        try {
          await cdp.send('Fetch.continueRequest', { requestId });
        } catch (_) { /* ignore */ }
      }
    });

    const showResponse = await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
    log(`  Show page loaded — HTTP ${showResponse ? showResponse.status() : 'unknown'}`);
    const pageContent = await page.content();
    log(`  Page content length: ${pageContent.length}`);
    log(`  Page URL: ${page.url()}`);
    if (pageContent.length < 500) {
      log(`  Page content: ${pageContent.substring(0, 400)}`);
    } else {
      log(`  Page title: ${pageContent.match(/<title>(.*?)<\/title>/)?.[1] || 'none'}`);
      log(`  Has tdc.js ref: ${pageContent.includes('tdc.js')}`);
    }

    // Wait for injection
    const waitStart = Date.now();
    while (!injected && Date.now() - waitStart < 10000) {
      await sleep(200);
    }
    if (!injected) {
      throw new Error('tdc.js request was never intercepted — injection failed');
    }

    // ── Step 5: Capture Chrome's collect token ──
    log('Step 5: Wait for TDC.getData()...');

    let tdcAvailable = false;
    const tdcWaitStart = Date.now();
    while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
      tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
      if (!tdcAvailable) await sleep(200);
    }

    if (!tdcAvailable) {
      throw new Error('TDC object not available in Chrome after 15s');
    }

    // Wait briefly for collectors to run
    await sleep(1500);

    const chromeGetData = await page.evaluate((appid) => {
      try {
        if (window.TDC && typeof window.TDC.setData === 'function') {
          window.TDC.setData({ appid });
        }
        if (window.TDC && typeof window.TDC.getData === 'function') {
          return { collect: window.TDC.getData(true), ok: true };
        }
        return { ok: false, reason: 'TDC.getData not available' };
      } catch (err) {
        return { ok: false, reason: err.message };
      }
    }, DEFAULT_AID);

    if (!chromeGetData.ok || !chromeGetData.collect) {
      throw new Error(`Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty result'}`);
    }

    const chromeCollect = chromeGetData.collect;
    log(`  Chrome collect token captured: ${chromeCollect.length} chars`);

    // ── Step 6: Decrypt Chrome's collect token ──
    log('Step 6: Decrypt Chrome collect token (hardcoded Template A params)...');

    const b64 = urlDecodeCollect(chromeCollect);
    const encryptedBin = Buffer.from(b64, 'base64').toString('binary');
    const decryptedBin = decryptXtea(encryptedBin, xteaParams);
    const plaintext = decryptedBin.replace(/[\0\s]+$/, '');

    log(`  Decrypted plaintext length: ${plaintext.length}`);
    log(`  Plaintext first 120: ${JSON.stringify(plaintext.substring(0, 120))}`);

    // Try to parse the JSON
    const jsonStart = plaintext.indexOf('{"cd":[');
    let parsed = null;
    if (jsonStart >= 0) {
      let jsonCandidate = plaintext.substring(jsonStart).replace(/\0/g, '').replace(/\s+$/, '');
      try {
        parsed = JSON.parse(jsonCandidate);
      } catch (_) {
        // Space-padding between chunks breaks JSON — reconstruct manually
        const sdIdx = jsonCandidate.indexOf('"sd":');
        if (sdIdx >= 0) {
          let cdPart = jsonCandidate.substring(0, sdIdx);
          cdPart = cdPart.replace(/\s+,\s*$/, ',').replace(/,\s+$/, ',');
          const sdPart = jsonCandidate.substring(sdIdx);
          const cleanJson = cdPart + sdPart;
          try {
            parsed = JSON.parse(cleanJson);
            log(`  Parsed after removing padding: cd=${parsed.cd ? parsed.cd.length : 'null'} fields`);
          } catch (e2) {
            log(`  Still can't parse: ${e2.message}`);
            log(`  Cleaned JSON first 200: ${JSON.stringify(cleanJson.substring(0, 200))}`);
          }
        }
      }
    }

    if (parsed && parsed.cd) {
      log(`  Parsed cd: ${parsed.cd.length} fields, sd keys: ${parsed.sd ? Object.keys(parsed.sd).join(',') : 'null'}`);
    } else {
      log('  WARNING: Could not parse cd/sd from decrypted plaintext');
      log('  This likely means decryption failed — wrong key or the reference tdc.js did not execute properly');
    }

    // ── Run Comparisons ──
    results.comparisonA = comparisonA(plaintext, parsed, xteaParams);

    // sd string length for segment splitting
    let sdStringLen;
    if (parsed && parsed.sd) {
      sdStringLen = buildSdString(parsed.sd).length;
    } else {
      const sdStart = plaintext.indexOf('"sd":');
      if (sdStart >= 0) {
        sdStringLen = plaintext.substring(sdStart).replace(/[\0\s]+$/, '').length;
      } else {
        sdStringLen = 80;
      }
    }
    results.comparisonB = comparisonB(chromeCollect, xteaParams, sdStringLen);

    const hashContent = results.comparisonB.hashContent || '';
    results.comparisonC = comparisonC(chromeCollect, parsed, xteaParams, hashContent);

  } catch (err) {
    log(`Error: ${err.message}`);
    results.error = err.message;
    results.stack = err.stack;
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  // ── Write results ──
  const outputPath = path.join(PROJECT_ROOT, 'output', 'ref-inject-forensics.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2) + '\n', 'utf8');
  log(`\nResults written to ${outputPath}`);

  // ── Summary ──
  log('\n=== SUMMARY ===');
  log(`  Template: ${results.template}`);
  log(`  XTEA source: ${results.xteaSource}`);
  if (results.comparisonA) {
    const a = results.comparisonA;
    log(`  A (Plaintext): cd=${a.cdStringsMatch ? 'MATCH' : 'DIFFER'}, sd=${a.sdStringsMatch ? 'MATCH' : 'DIFFER'}, fullBody=${a.fullBodyMatch ? 'MATCH' : 'DIFFER'}`);
  }
  if (results.comparisonB) {
    const b = results.comparisonB;
    log(`  B (Round-Trip): ${b.roundTripMatch ? 'MATCH -- encrypt is exact inverse of decrypt' : 'DIFFER -- encrypt/decrypt mismatch!'}`);
    if (b.firstDiffSegment) {
      log(`    First diff in segment: ${b.firstDiffSegment} at byte ${b.firstDiffByte}`);
    }
  }
  if (results.comparisonC) {
    const c = results.comparisonC;
    log(`  C (Full Reconstruction): ${c.fullReconstructionMatch ? 'MATCH' : 'DIFFER'}`);
    if (c.diffSegment) {
      log(`    Diff in: ${c.diffSegment}`);
    }
    if (c.segmentComparison) {
      for (const [name, info] of Object.entries(c.segmentComparison)) {
        if (!info.match) {
          log(`    ${name}: DIFFER at pos ${info.firstDiff}`);
        }
      }
    }
  }

  // Diagnostic conclusion
  log('\n=== DIAGNOSTIC ===');
  if (results.comparisonA && results.comparisonB && results.comparisonC) {
    const a = results.comparisonA;
    const b = results.comparisonB;
    const c = results.comparisonC;

    if (b.roundTripMatch && c.fullReconstructionMatch) {
      log('  All comparisons pass. Our serialization + encryption is byte-identical to Chrome.');
      log('  errorCode 9 is caused by something OUTSIDE the collect token (vData, timing, TLS, etc.).');
    } else if (!a.cdStringsMatch || !a.sdStringsMatch) {
      log('  Plaintext serialization differs. Our buildCdString/buildSdString produces different output.');
      log('  This is the root cause: fix the serialization before investigating encryption.');
    } else if (!b.roundTripMatch) {
      log('  Encryption round-trip fails. Our encrypt() is NOT the exact inverse of decrypt().');
      log('  This means the XTEA implementation has a bug (likely in overflow/truncation behavior).');
    } else if (!c.fullReconstructionMatch) {
      log('  Serialization and round-trip pass, but full reconstruction differs.');
      log('  Issue is in chunk assembly (buildInputChunks) or token assembly order.');
    }
  } else if (results.error) {
    log(`  Script failed: ${results.error}`);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

const opts = parseArgs();

log('Reference Inject Forensics — Three-Way Comparison with Known Key');
log(`  headless: ${opts.headless}`);
log(`  reference: ${REF_TDC_PATH}`);
log('');

run(opts)
  .then((results) => {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(2);
  });
