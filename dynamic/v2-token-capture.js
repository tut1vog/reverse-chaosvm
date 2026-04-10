'use strict';

/**
 * v2-token-capture.js — Capture and decrypt tokens from tdc-v2.js
 *
 * Phase 1: Load tdc-v2.js in headless Chrome with frozen environment,
 *          call getData() and getInfo(), save results.
 * Phase 2: Decrypt the captured collect token with the known XTEA key,
 *          report whether the plaintext is valid JSON.
 *
 * Uses Puppeteer with frozen Date.now/Math.random/performance.now
 * (same frozen values as other tracers: timestamp=1700000000000, random=0.42, perfNow=100.5).
 *
 * Usage:
 *   node dynamic/v2-token-capture.js
 *
 * Output:
 *   output/tdc-v2/dynamic/live-capture.json
 *   output/tdc-v2/dynamic/decrypt-test.json
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TDC_V2_PATH = path.join(PROJECT_ROOT, 'targets', 'tdc-v2.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'tdc-v2', 'dynamic');
const CAPTURE_PATH = path.join(OUTPUT_DIR, 'live-capture.json');
const DECRYPT_PATH = path.join(OUTPUT_DIR, 'decrypt-test.json');

// Frozen deterministic values — same as other tracers
const FROZEN_TIMESTAMP = 1700000000000;
const FROZEN_RANDOM = 0.42;
const FROZEN_PERF_NOW = 100.5;

// Import crypto for Phase 2
const { decryptSegments } = require('../token/crypto-core.js');

// ═══════════════════════════════════════════════════════════════════════
// Auto-detect TDC_NAME and Date helper names from source
// ═══════════════════════════════════════════════════════════════════════

function parseTdcSource(source) {
  const nameMatch = source.match(/window\.TDC_NAME\s*=\s*"([^"]+)"/);
  if (!nameMatch) throw new Error('Could not find TDC_NAME in source');

  const dateNewMatch = source.match(/window\.(_[A-Za-z]+)\s*=\s*function\(\)\s*\{\s*return new Date\(\)/);
  const dateApplyMatch = source.match(/window\.(_[A-Za-z]+)\s*=\s*function\(a,\s*b\)\s*\{\s*return Date\[a\]\.apply\(Date,\s*b\)/);

  return {
    tdcName: nameMatch[1],
    dateNewHelper: dateNewMatch ? dateNewMatch[1] : null,
    dateApplyHelper: dateApplyMatch ? dateApplyMatch[1] : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Instrumentation script (injected before tdc source)
// ═══════════════════════════════════════════════════════════════════════

function buildInstrumentScript(dateNewHelper, dateApplyHelper) {
  return `
(function() {
  var FROZEN_TS = ${FROZEN_TIMESTAMP};
  var FROZEN_RANDOM = ${FROZEN_RANDOM};
  var FROZEN_PERF = ${FROZEN_PERF_NOW};

  window.__V2_CAPTURE = {
    errors: [],
    btoaCaptures: [],
    dateNowCalls: 0,
    mathRandomCalls: 0,
    perfNowCalls: 0,
  };
  var cap = window.__V2_CAPTURE;

  // ── 1. Freeze Date.now() + new Date() ──
  var OrigDate = Date;
  var FrozenDate = function() {
    if (arguments.length === 0) {
      return new OrigDate(FROZEN_TS);
    }
    var args = [null];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    return new (Function.prototype.bind.apply(OrigDate, args))();
  };
  FrozenDate.now = function() {
    cap.dateNowCalls++;
    return FROZEN_TS;
  };
  FrozenDate.parse = OrigDate.parse;
  FrozenDate.UTC = OrigDate.UTC;
  FrozenDate.prototype = OrigDate.prototype;
  window.Date = FrozenDate;

  // ── 2. Freeze Math.random() ──
  Math.random = function() {
    cap.mathRandomCalls++;
    return FROZEN_RANDOM;
  };

  // ── 3. Freeze performance.now() ──
  var origPerfNow = performance.now.bind(performance);
  performance.now = function() {
    cap.perfNowCalls++;
    return FROZEN_PERF;
  };

  // ── 4. Date helpers specific to this tdc build ──
  ${dateNewHelper ? `window.${dateNewHelper} = function() { return new OrigDate(FROZEN_TS); };` : ''}
  ${dateApplyHelper ? `window.${dateApplyHelper} = function(a, b) { return OrigDate[a].apply(OrigDate, b); };` : ''}

  // ── 5. Hook btoa to capture encrypted segments ──
  var origBtoa = window.btoa;
  if (origBtoa) {
    window.btoa = function(str) {
      var result = Reflect.apply(origBtoa, window, [str]);
      if (typeof str === 'string' && str.length > 20) {
        cap.btoaCaptures.push({
          inputLength: str.length,
          outputLength: result.length,
          output: result
        });
      }
      return result;
    };
  }

  // ── 6. Error capture ──
  window.addEventListener('error', function(e) {
    cap.errors.push({ stage: 'runtime', error: e.message });
  });
  window.addEventListener('unhandledrejection', function(e) {
    cap.errors.push({ stage: 'promise', error: String(e.reason) });
  });
})();
`;
}

// ═══════════════════════════════════════════════════════════════════════
// Token segment splitter (URL-decode + split on base64 boundaries)
// ═══════════════════════════════════════════════════════════════════════

function urlDecode(token) {
  return token
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');
}

function splitBase64Segments(decoded) {
  const segments = [];
  let current = '';
  for (let i = 0; i < decoded.length; i++) {
    current += decoded[i];
    if (decoded[i] === '=' && i + 1 < decoded.length && decoded[i + 1] !== '=') {
      segments.push(current);
      current = '';
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 1: Capture tokens from tdc-v2.js
// ═══════════════════════════════════════════════════════════════════════

async function phase1Capture() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Phase 1: Capture tokens from tdc-v2.js');
  console.log('═══════════════════════════════════════════════════════════\n');

  const tdcSource = fs.readFileSync(TDC_V2_PATH, 'utf-8');
  const parsed = parseTdcSource(tdcSource);
  console.log('[phase1] TDC_NAME:', parsed.tdcName);
  console.log('[phase1] Date new helper:', parsed.dateNewHelper);
  console.log('[phase1] Date apply helper:', parsed.dateApplyHelper);

  const instrumentScript = buildInstrumentScript(parsed.dateNewHelper, parsed.dateApplyHelper);

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>TDC-v2 Capture</title></head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>${instrumentScript}</script>
  <script>${tdcSource}</script>
</body></html>`;

  // Start local HTTP server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log('[phase1] Server on port', port);

  // Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('[phase1] Loading page...');
  await page.goto('http://127.0.0.1:' + port, { waitUntil: 'domcontentloaded' });

  // Wait for TDC object — the VM registers it as window.TDC (not window[TDC_NAME])
  // window[TDC_NAME] keeps the baked eks string; window.TDC gets the API object.
  const tdcName = parsed.tdcName;
  console.log('[phase1] Waiting for window.TDC...');

  const tdcReady = await page.waitForFunction(
    () => window.TDC && typeof window.TDC === 'object' && typeof window.TDC.getInfo === 'function',
    { timeout: 15000 }
  ).then(() => true).catch(() => false);

  if (!tdcReady) {
    const currentVal = await page.evaluate(() => ({
      tdcType: typeof window.TDC,
      namedType: typeof window[window.TDC_NAME],
    }));
    console.log('[phase1] TDC not ready. Current:', JSON.stringify(currentVal));
    await browser.close();
    server.close();
    throw new Error('TDC did not initialize within 15s');
  }
  console.log('[phase1] TDC ready.');

  // Wait for async collectors
  await new Promise(r => setTimeout(r, 2000));

  // Call setData
  console.log('[phase1] Calling TDC.setData()...');
  await page.evaluate(() => {
    window.TDC.setData({
      appid: '2090803262',
      nonce: '0.12345678',
      token: 'test_token_123'
    });
  });

  // Call getData
  console.log('[phase1] Calling TDC.getData()...');
  const getDataResult = await page.evaluate(() => {
    try {
      const token = window.TDC.getData();
      return { success: true, token: token };
    } catch (e) {
      return { success: false, error: e.message, stack: e.stack };
    }
  });

  // Call getInfo
  console.log('[phase1] Calling TDC.getInfo()...');
  const getInfoResult = await page.evaluate(() => {
    try {
      const info = window.TDC.getInfo();
      return { success: true, info: info };
    } catch (e) {
      return { success: false, error: e.message, stack: e.stack };
    }
  });

  // Retrieve capture data
  const captureData = await page.evaluate(() => {
    var cap = window.__V2_CAPTURE;
    return {
      btoaCaptures: cap.btoaCaptures,
      dateNowCalls: cap.dateNowCalls,
      mathRandomCalls: cap.mathRandomCalls,
      perfNowCalls: cap.perfNowCalls,
      errors: cap.errors,
    };
  });

  await browser.close();
  server.close();

  console.log('[phase1] getData success:', getDataResult.success,
    '| token length:', getDataResult.token ? getDataResult.token.length : 0);
  console.log('[phase1] getInfo success:', getInfoResult.success);
  if (getInfoResult.success) {
    console.log('[phase1] getInfo result:', JSON.stringify(getInfoResult.info).substring(0, 200));
  }
  console.log('[phase1] btoa captures:', captureData.btoaCaptures.length);
  console.log('[phase1] Date.now calls:', captureData.dateNowCalls);
  console.log('[phase1] Math.random calls:', captureData.mathRandomCalls);
  console.log('[phase1] performance.now calls:', captureData.perfNowCalls);
  if (pageErrors.length > 0) {
    console.log('[phase1] Page errors:', pageErrors.join('; '));
  }
  if (captureData.errors.length > 0) {
    console.log('[phase1] Capture errors:', JSON.stringify(captureData.errors));
  }

  const result = {
    timestamp: new Date().toISOString(),
    target: 'targets/tdc-v2.js',
    tdcName: tdcName,
    frozenValues: {
      timestamp: FROZEN_TIMESTAMP,
      random: FROZEN_RANDOM,
      perfNow: FROZEN_PERF_NOW,
    },
    getData: getDataResult,
    getInfo: getInfoResult,
    btoaCaptures: captureData.btoaCaptures,
    environmentCalls: {
      dateNow: captureData.dateNowCalls,
      mathRandom: captureData.mathRandomCalls,
      perfNow: captureData.perfNowCalls,
    },
    pageErrors,
    captureErrors: captureData.errors,
  };

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(CAPTURE_PATH, JSON.stringify(result, null, 2));
  console.log('\n[phase1] Saved to:', CAPTURE_PATH);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Phase 2: Decrypt the captured collect token
// ═══════════════════════════════════════════════════════════════════════

function phase2Decrypt(captureResult) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Phase 2: Decrypt captured collect token with known XTEA key');
  console.log('═══════════════════════════════════════════════════════════\n');

  const collectToken = captureResult.getData && captureResult.getData.token;
  if (!collectToken) {
    const result = {
      success: false,
      error: 'No collect token captured in Phase 1',
      getDataError: captureResult.getData ? captureResult.getData.error : 'no getData result',
    };
    fs.writeFileSync(DECRYPT_PATH, JSON.stringify(result, null, 2));
    console.log('[phase2] FAILED: No collect token to decrypt.');
    return result;
  }

  console.log('[phase2] Collect token length:', collectToken.length);

  // Use btoa captures directly — they give us the 4 segments in canonical order
  // (hash, header, cdBody, sig) without needing to split the URL-encoded token.
  // Segments may lack '=' padding so splitting on '=' boundaries is unreliable.
  const btoaCaptures = captureResult.btoaCaptures || [];
  if (btoaCaptures.length < 4) {
    const result = {
      success: false,
      error: 'Expected 4 btoa captures, got ' + btoaCaptures.length,
      tokenLength: collectToken.length,
    };
    fs.writeFileSync(DECRYPT_PATH, JSON.stringify(result, null, 2));
    console.log('[phase2] FAILED: Not enough btoa captures.');
    return result;
  }

  // btoa captures are in canonical order: [hash, header, cdBody, sig]
  const reordered = btoaCaptures.slice(0, 4).map(c => c.output);
  console.log('[phase2] Using 4 btoa captures:');
  const segNames = ['hash', 'header', 'cdBody', 'sig'];
  reordered.forEach((seg, i) => {
    console.log(`[phase2]   ${segNames[i]}: ${seg.length} chars`);
  });

  let plaintexts;
  try {
    plaintexts = decryptSegments(reordered);
    console.log('[phase2] Decryption succeeded (no error thrown).');
  } catch (e) {
    const result = {
      success: false,
      error: 'Decryption threw: ' + e.message,
    };
    fs.writeFileSync(DECRYPT_PATH, JSON.stringify(result, null, 2));
    console.log('[phase2] FAILED: Decryption error:', e.message);
    return result;
  }

  const decryptedInfo = plaintexts.map((pt, i) => {
    const stripped = pt.replace(/[\x00\s]+$/, '');
    return {
      name: segNames[i],
      rawLength: pt.length,
      strippedLength: stripped.length,
      preview: stripped.substring(0, 200),
      hasNulls: pt.includes('\x00'),
    };
  });

  decryptedInfo.forEach(info => {
    console.log(`[phase2]   ${info.name}: ${info.rawLength} raw bytes, ${info.strippedLength} stripped`);
    console.log(`[phase2]     preview: ${info.preview.substring(0, 120)}`);
  });

  // Reconstruct payload from header + cdBody
  const rawPayload = (plaintexts[1] + plaintexts[2])
    .replace(/[\x00]+$/, '')
    .replace(/\s+,$/, ',')
    .replace(/[\x00\s]+$/, '');

  let cdString;
  if (rawPayload.endsWith(',')) {
    cdString = rawPayload.slice(0, -1) + '}';
  } else {
    cdString = rawPayload + ']}';
  }

  // Try to parse as JSON
  let payloadJson = null;
  let payloadValid = false;
  try {
    payloadJson = JSON.parse(cdString);
    payloadValid = true;
    console.log('[phase2] Payload JSON: VALID ✅');
    console.log('[phase2]   keys:', Object.keys(payloadJson));
    if (payloadJson.cd) {
      console.log('[phase2]   cd array length:', Array.isArray(payloadJson.cd) ? payloadJson.cd.length : 'not array');
    }
  } catch (e) {
    console.log('[phase2] Payload JSON: INVALID ❌ (' + e.message + ')');
    // Header block is space-padded to 144 bytes; collapse internal spaces
    const trimmed = cdString.replace(/\s{2,}/g, '');
    try {
      payloadJson = JSON.parse(trimmed);
      payloadValid = true;
      console.log('[phase2] Payload JSON (after space collapse): VALID ✅');
      console.log('[phase2]   keys:', Object.keys(payloadJson));
      if (payloadJson.cd) {
        console.log('[phase2]   cd array length:', Array.isArray(payloadJson.cd) ? payloadJson.cd.length : 'not array');
      }
    } catch (e2) {
      console.log('[phase2] Still invalid after trimming: ' + e2.message);
    }
  }

  // Parse sdString from sig segment
  const sdString = plaintexts[3].replace(/[\x00\s]+$/, '');
  let sdJson = null;
  let sdValid = false;
  try {
    sdJson = JSON.parse('{' + sdString);
    sdValid = true;
    console.log('[phase2] SD JSON: VALID ✅');
    console.log('[phase2]   sd keys:', sdJson.sd ? Object.keys(sdJson.sd) : 'no sd key');
  } catch (e) {
    console.log('[phase2] SD JSON: INVALID ❌ (' + e.message + ')');
    console.log('[phase2]   raw sdString: ' + sdString.substring(0, 200));
  }

  const result = {
    success: true,
    tokenLength: collectToken.length,
    segmentCount: reordered.length,
    segmentLengths: reordered.map(s => s.length),
    decrypted: decryptedInfo,
    payloadValid,
    payloadKeys: payloadJson ? Object.keys(payloadJson) : null,
    cdFieldCount: payloadJson && Array.isArray(payloadJson.cd) ? payloadJson.cd.length : null,
    sdValid,
    sdKeys: sdJson && sdJson.sd ? Object.keys(sdJson.sd) : null,
    sdObject: sdJson ? sdJson.sd : null,
    compatibility: payloadValid && sdValid
      ? 'COMPATIBLE — Same XTEA key, same 4-segment format, valid JSON payload'
      : payloadValid
        ? 'PARTIAL — Payload decrypts but SD segment invalid'
        : 'INCOMPATIBLE — Decryption does not produce valid JSON',
  };

  fs.writeFileSync(DECRYPT_PATH, JSON.stringify(result, null, 2));
  console.log('\n[phase2] Saved to:', DECRYPT_PATH);
  console.log('[phase2] Verdict:', result.compatibility);

  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  tdc-v2.js Token Capture & Decrypt');
  console.log('  Frozen: ts=' + FROZEN_TIMESTAMP + ' rand=' + FROZEN_RANDOM + ' perf=' + FROZEN_PERF_NOW);
  console.log('═══════════════════════════════════════════════════════════\n');

  const captureResult = await phase1Capture();
  const decryptResult = phase2Decrypt(captureResult);

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Summary');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  getData:', captureResult.getData.success
    ? '✅ token=' + captureResult.getData.token.length + ' chars'
    : '❌ ' + (captureResult.getData.error || 'failed'));
  console.log('  getInfo:', captureResult.getInfo.success ? '✅' : '❌ ' + (captureResult.getInfo.error || 'failed'));
  if (captureResult.getInfo.success && captureResult.getInfo.info) {
    const info = captureResult.getInfo.info;
    console.log('    info field:', info.info ? info.info.substring(0, 60) + '...' : 'missing');
  }
  console.log('  Decrypt:', decryptResult.compatibility);
  console.log('═══════════════════════════════════════════════════════════\n');

  process.exit(decryptResult.success && decryptResult.payloadValid ? 0 : 1);
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(2);
});
