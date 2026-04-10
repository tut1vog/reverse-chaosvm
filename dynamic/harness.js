'use strict';

/**
 * harness.js — Puppeteer harness for dynamic TDC token capture.
 *
 * Loads tdc.js in a headless Chromium browser, calls the TDC API,
 * and captures the complete token generation data flow.
 *
 * Task 6.2: Extended to capture the cd (collector data) JSON string
 * via Function.prototype.call/apply hooks, String.prototype.substr/replace
 * hooks, and token decoding attempts. Produces session-002.json and
 * collector-map.json.
 *
 * Usage: node src/dynamic/harness.js [--session NAME]
 *
 * Output: output/dynamic/session-002.json (default), output/dynamic/collector-map.json
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TDC_PATH = path.join(PROJECT_ROOT, 'tdc.js');
const INSTRUMENT_PATH = path.join(PROJECT_ROOT, 'src', 'dynamic', 'instrument.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'dynamic');

// Parse args
const sessionArg = process.argv.indexOf('--session');
const sessionName = sessionArg >= 0 ? process.argv[sessionArg + 1] : 'session-002';
const outputPath = path.join(OUTPUT_DIR, sessionName + '.json');
const collectorMapPath = path.join(OUTPUT_DIR, 'collector-map.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Read source files
const tdcSource = fs.readFileSync(TDC_PATH, 'utf-8');
const instrumentSource = fs.readFileSync(INSTRUMENT_PATH, 'utf-8');

/**
 * Build a minimal HTML page that hosts tdc.js with instrumentation.
 */
function buildHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TDC Harness</title>
</head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>
    // Instrumentation (runs first)
    ${instrumentSource}
  </script>
  <script>
    // TDC VM (runs second — will find the global Date hooks already defined)
    ${tdcSource}
  </script>
</body>
</html>`;
}

/**
 * Try to extract cd data from the captured token by URL-decoding and
 * base64-decoding. If the payload is encrypted, this won't yield JSON,
 * but we try anyway as a secondary approach.
 */
function tryDecodeToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    // Step 1: URL-decode (%2B → +, %2F → /, %3D → =)
    const urlDecoded = decodeURIComponent(token);
    // Step 2: Try base64 decode
    const b64Decoded = Buffer.from(urlDecoded, 'base64').toString('utf-8');
    // Step 3: Check if it looks like JSON with cd
    if (b64Decoded.indexOf('"cd"') >= 0) {
      return { method: 'base64', value: b64Decoded, isJson: true };
    }
    // Check if binary (non-printable chars)
    let nonPrintable = 0;
    for (let i = 0; i < Math.min(b64Decoded.length, 100); i++) {
      const c = b64Decoded.charCodeAt(i);
      if (c < 32 && c !== 10 && c !== 13 && c !== 9) nonPrintable++;
    }
    return {
      method: 'base64',
      value: null,
      isJson: false,
      isBinary: nonPrintable > 10,
      nonPrintableRatio: nonPrintable / Math.min(b64Decoded.length, 100),
      decodedLength: b64Decoded.length
    };
  } catch (e) {
    return { method: 'base64', error: String(e) };
  }
}

/**
 * Parse the cd JSON string and build a collector map.
 */
/**
 * Reconstruct the complete cd JSON from captured fragments.
 *
 * The VM builds the cd string incrementally via concatenation in func_276.
 * Our .call() hook captures it in two parts:
 *   1. PREFIX (cdCaptures): '{"cd":[1,"linux",2,...,1,' (the first ~11 entries)
 *   2. TAIL (longStringArgs): ',0,[{"codec":"H.264",...,""],' (remaining entries)
 *
 * The prefix ends with a comma, and the tail starts with a comma, creating
 * a double-comma when naively joined. We strip the overlap and close the JSON.
 */
function reconstructCdString(capturedData) {
  // First try: direct cdString (if complete and parseable)
  if (capturedData.cdString) {
    try {
      JSON.parse(capturedData.cdString);
      return capturedData.cdString; // Already valid
    } catch (e) {
      // Fall through to reconstruction
    }
  }

  // Get the prefix from cdCaptures (first capture without trailing spaces)
  let prefix = null;
  if (Array.isArray(capturedData.cdCaptures)) {
    for (const cap of capturedData.cdCaptures) {
      if (cap.value && cap.value.indexOf('"cd":[') >= 0) {
        // Prefer the shortest (cleanest) capture without trailing spaces
        const trimmed = cap.value.replace(/\s+$/, '');
        if (!prefix || trimmed.length < prefix.length) {
          prefix = trimmed;
        }
      }
    }
  }

  if (!prefix) return null;

  // Get the tail from longStringArgs — look for a long string starting with ','
  // that contains collector data (codecs, plugins, etc.)
  let tail = null;
  if (Array.isArray(capturedData.longStringArgs)) {
    for (const entry of capturedData.longStringArgs) {
      if (entry.value && entry.value.length > 1000 &&
          entry.value.charAt(0) === ',' &&
          entry.value.indexOf('"codec"') >= 0) {
        // This is the cd array continuation fragment
        const trimmed = entry.value.replace(/\s+$/, '');
        if (!tail || trimmed.length > tail.length) {
          tail = trimmed;
        }
      }
    }
  }

  if (!tail) {
    // No tail found — try to close the prefix as-is
    let attempt = prefix.replace(/,\s*$/, '') + ']}';
    try {
      JSON.parse(attempt);
      return attempt;
    } catch (e) {
      return null;
    }
  }

  // Join prefix and tail:
  // prefix ends with '...,1,' and tail starts with ',0,...'
  // Remove the overlapping comma: strip trailing comma from prefix
  let joined = prefix.replace(/,\s*$/, '') + tail;

  // The tail ends with '...,""],' — strip trailing comma and close with '}'
  joined = joined.replace(/,\s*$/, '') + '}';

  // Validate
  try {
    JSON.parse(joined);
    return joined;
  } catch (e) {
    // Try alternative: if tail ends with '"],' the array is already closed with ']'
    // Just need to close the outer object with '}'
    const alt = prefix.replace(/,\s*$/, '') + tail.replace(/,\s*$/, '') + '}';
    try {
      JSON.parse(alt);
      return alt;
    } catch (e2) {
      // Log the error for debugging
      console.error('[buildCollectorMap] Reconstruction failed:', e.message);
      console.error('  prefix (' + prefix.length + '): ...' +
        prefix.substring(prefix.length - 30));
      console.error('  tail (' + tail.length + '): ' +
        tail.substring(0, 30) + '...' + tail.substring(tail.length - 30));
      console.error('  joined length:', joined.length);
      return null;
    }
  }
}

function buildCollectorMap(capturedData, sdObject) {
  const map = {
    totalCollectors: 0,
    cdString: null,
    cdArray: [],
    collectorTypes: {},
    sdObject: sdObject || null,
    reconstructionMethod: null
  };

  // Attempt reconstruction from fragments
  const reconstructed = reconstructCdString(capturedData);
  if (reconstructed) {
    map.cdString = reconstructed;
    map.reconstructionMethod = 'fragment-join';
  } else if (capturedData.cdString) {
    map.cdString = capturedData.cdString;
    map.reconstructionMethod = 'direct-capture';
  }

  if (!map.cdString) return map;

  // Parse the cd JSON
  try {
    let parsed;
    if (map.cdString.charAt(0) === '{') {
      parsed = JSON.parse(map.cdString);
      if (parsed.cd && Array.isArray(parsed.cd)) {
        map.cdArray = parsed.cd;
      }
    } else if (map.cdString.charAt(0) === '[') {
      map.cdArray = JSON.parse(map.cdString);
    }
  } catch (e) {
    // Try extracting cd array via bracket matching
    try {
      const cdStart = map.cdString.indexOf('"cd":[');
      if (cdStart >= 0) {
        let depth = 0;
        let arrayStart = map.cdString.indexOf('[', cdStart);
        let arrayEnd = -1;
        for (let i = arrayStart; i < map.cdString.length; i++) {
          if (map.cdString[i] === '[') depth++;
          else if (map.cdString[i] === ']') {
            depth--;
            if (depth === 0) { arrayEnd = i; break; }
          }
        }
        if (arrayEnd > arrayStart) {
          const arrayStr = map.cdString.substring(arrayStart, arrayEnd + 1);
          map.cdArray = JSON.parse(arrayStr);
          map.reconstructionMethod += '+bracket-extract';
        }
      }
    } catch (e2) {
      map.parseError = String(e) + ' | ' + String(e2);
    }
  }

  map.totalCollectors = map.cdArray.length;

  // Build collector type map with sample values
  for (let i = 0; i < map.cdArray.length; i++) {
    const val = map.cdArray[i];
    let type;
    if (val === null) type = 'null';
    else if (val === undefined) type = 'undefined';
    else if (typeof val === 'number') type = 'number';
    else if (typeof val === 'string') type = 'string';
    else if (typeof val === 'boolean') type = 'boolean';
    else if (Array.isArray(val)) type = 'array';
    else if (typeof val === 'object') type = 'object';
    else type = typeof val;

    map.collectorTypes[String(i)] = {
      type: type,
      sampleValue: type === 'string'
        ? (val.length > 100 ? val.substring(0, 100) + '...' : val)
        : (type === 'object' || type === 'array')
          ? JSON.stringify(val).substring(0, 100)
          : String(val)
    };
  }

  return map;
}

/**
 * Run a single capture session.
 */
async function runSession() {
  console.log('[harness] Starting capture session:', sessionName);
  console.log('[harness] TDC source:', TDC_PATH);
  console.log('[harness] Output:', outputPath);

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

  // Capture page console messages
  const pageLogs = [];
  page.on('console', (msg) => {
    pageLogs.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
  });

  // Capture page errors
  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack, ts: Date.now() });
  });

  // Capture network requests
  const networkLog = [];
  page.on('request', (req) => {
    if (req.url().startsWith('data:')) return;
    networkLog.push({ url: req.url(), method: req.method(), ts: Date.now() });
  });

  console.log('[harness] Starting local HTTP server...');
  const html = buildHTML();

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log('[harness] Server listening on port', port);

  console.log('[harness] Loading page with instrumentation + tdc.js...');
  await page.goto('http://127.0.0.1:' + port, { waitUntil: 'domcontentloaded' });

  // Wait for TDC to appear on window
  console.log('[harness] Waiting for TDC to initialize...');
  const tdcReady = await page.waitForFunction(
    () => window.TDC && typeof window.TDC.getInfo === 'function',
    { timeout: 15000 }
  ).then(() => true).catch(() => false);

  if (!tdcReady) {
    console.error('[harness] ERROR: TDC did not initialize within 15s');
  } else {
    console.log('[harness] TDC detected, starting API calls...');
  }

  // Small delay to let collectors finish (they may be async)
  await new Promise(r => setTimeout(r, 2000));

  // ── Call TDC.setData() with sample config ──
  console.log('[harness] Calling TDC.setData()...');
  const setDataResult = await page.evaluate(() => {
    try {
      const config = {
        appid: '2090803262',
        nonce: '0.12345678',
        token: 'test_token_123'
      };
      window.__TDC_CAPTURE.timestamps.setDataStart = Date.now();
      const r = window.TDC.setData(config);
      window.__TDC_CAPTURE.timestamps.setDataEnd = Date.now();
      return { success: true, result: r, config: config };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  console.log('[harness] setData result:', JSON.stringify(setDataResult));

  // ── Call TDC.getInfo() ──
  console.log('[harness] Calling TDC.getInfo()...');
  const getInfoResult = await page.evaluate(() => {
    try {
      window.__TDC_CAPTURE.timestamps.getInfoStart = Date.now();
      const r = window.TDC.getInfo();
      window.__TDC_CAPTURE.timestamps.getInfoEnd = Date.now();
      return { success: true, result: r, type: typeof r };
    } catch (e) {
      return { success: false, error: e.message, stack: e.stack };
    }
  });
  console.log('[harness] getInfo result type:', getInfoResult.type,
    'success:', getInfoResult.success);

  // ── Activate cd capture hooks before calling getData() ──
  console.log('[harness] Activating cd capture hooks...');
  await page.evaluate(() => {
    window.__CD_CAPTURE_ACTIVE = true;

    // Install Object.prototype setter trap for 'cd' property.
    // When func_276 assigns the complete cd JSON string to r89["cd"],
    // this setter fires and captures the value.
    var cap = window.__TDC_CAPTURE;
    try {
      Object.defineProperty(Object.prototype, 'cd', {
        set: function (val) {
          // Capture strings that look like the cd JSON payload
          if (typeof val === 'string' && val.length > 100 &&
              val.indexOf('"cd":[') >= 0) {
            if (!cap.cdString || val.length > cap.cdString.length) {
              cap.cdString = val;
            }
            cap.cdCaptures.push({
              source: 'obj-proto-setter',
              ts: Date.now(),
              value: val,
              length: val.length,
              preview: val.substring(0, 200)
            });
          }
          // Set as own data property so the object works normally
          Object.defineProperty(this, 'cd', {
            value: val,
            writable: true,
            configurable: true,
            enumerable: true
          });
        },
        configurable: true,
        enumerable: false
      });
    } catch (e) {
      cap.errors.push({
        stage: 'cd-proto-setter',
        error: String(e),
        ts: Date.now()
      });
    }
  });

  // ── Call TDC.getData() — this triggers token generation ──
  console.log('[harness] Calling TDC.getData()...');
  const getDataResult = await page.evaluate(() => {
    try {
      window.__TDC_CAPTURE.timestamps.getDataStart = Date.now();
      const r = window.TDC.getData();
      window.__TDC_CAPTURE.timestamps.getDataEnd = Date.now();
      // Deactivate heavy hooks after capture
      window.__CD_CAPTURE_ACTIVE = false;
      return {
        success: true,
        result: r,
        type: typeof r,
        length: typeof r === 'string' ? r.length : null
      };
    } catch (e) {
      window.__CD_CAPTURE_ACTIVE = false;
      return { success: false, error: e.message, stack: e.stack };
    }
  });
  console.log('[harness] getData result: type=' + getDataResult.type,
    'length=' + getDataResult.length,
    'success=' + getDataResult.success);

  // ── Retrieve all instrumentation captures ──
  console.log('[harness] Retrieving captured data...');
  const capturedData = await page.evaluate(() => {
    // Serialize the capture data — cdString can be very large,
    // so we handle it carefully
    const cap = window.__TDC_CAPTURE;
    const result = {};
    // Copy all keys, handling circular refs / large strings
    for (const key of Object.keys(cap)) {
      try {
        if (key === 'cdString' && cap.cdString && cap.cdString.length > 100000) {
          // Truncate extremely large strings
          result[key] = cap.cdString.substring(0, 100000) + '...[TRUNCATED]';
        } else {
          result[key] = JSON.parse(JSON.stringify(cap[key]));
        }
      } catch (e) {
        result[key] = '[SERIALIZATION ERROR: ' + String(e) + ']';
      }
    }
    return result;
  });

  // ── Token decoding attempt ──
  const token = getDataResult.success ? getDataResult.result : null;
  const tokenDecode = tryDecodeToken(token);
  console.log('[harness] Token decode attempt:', tokenDecode ? tokenDecode.method : 'N/A',
    'isJson:', tokenDecode ? tokenDecode.isJson : false);

  // ── Build session JSON ──
  const session = {
    sessionName: sessionName,
    capturedAt: new Date().toISOString(),
    capturedAtMs: Date.now(),

    // Direct API call results
    apiCalls: {
      setData: setDataResult,
      getInfo: getInfoResult,
      getData: getDataResult
    },

    // Instrumentation captures (from window.__TDC_CAPTURE)
    instrumentation: capturedData,

    // Token decoding attempt
    tokenDecode: tokenDecode,

    // Page-level logs
    pageLogs: pageLogs,
    pageErrors: pageErrors,
    networkRequests: networkLog,

    // Metadata
    meta: {
      puppeteerVersion: require('puppeteer/package.json').version,
      nodeVersion: process.version,
      tdcFileSize: tdcSource.length,
      htmlSize: html.length
    }
  };

  // Write session JSON
  fs.writeFileSync(outputPath, JSON.stringify(session, null, 2));
  console.log('[harness] Session written to:', outputPath);

  // ── Build collector map (from all captured fragments) ──
  const sdObject = capturedData.interceptedSD || null;
  const collectorMap = buildCollectorMap(capturedData, sdObject);

  // Write collector map
  fs.writeFileSync(collectorMapPath, JSON.stringify(collectorMap, null, 2));
  console.log('[harness] Collector map written to:', collectorMapPath);

  // ── Print summary ──
  console.log('\n=== CAPTURE SUMMARY ===');
  console.log('TDC initialized:', tdcReady);
  console.log('TDC methods found:', JSON.stringify(capturedData.tdcMethods || 'N/A'));
  console.log('setData calls captured:', capturedData.setDataCalls ? capturedData.setDataCalls.length : 0);
  console.log('getInfo results captured:', capturedData.getInfoResults ? capturedData.getInfoResults.length : 0);
  console.log('getData results captured:', capturedData.getDataResults ? capturedData.getDataResults.length : 0);
  console.log('Pre-encoding data captured:', capturedData.preEncodingData ? 'YES' : 'NO');

  // cd capture details
  const cdString = collectorMap.cdString || capturedData.cdString || null;
  console.log('\n--- CD Capture Results ---');
  console.log('cdString captured:', cdString ? 'YES (length=' + cdString.length + ')' : 'NO');
  console.log('Reconstruction method:', collectorMap.reconstructionMethod || 'none');
  console.log('cdCaptures count:', (capturedData.cdCaptures || []).length);
  if (Array.isArray(capturedData.cdCaptures) && capturedData.cdCaptures.length > 0) {
    capturedData.cdCaptures.forEach((c, i) => {
      console.log('  cdCapture[' + i + ']: source=' + c.source +
        ' length=' + c.length +
        ' hasSd=' + c.hasSd +
        ' preview=' + (c.preview || (c.value || '').substring(0, 80)) + '...');
    });
  }
  console.log('sdSubstrCaptures count:', (capturedData.sdSubstrCaptures || []).length);
  console.log('replaceCaptures count:', (capturedData.replaceCaptures || []).length);
  console.log('sanitizedValues count:', (capturedData.sanitizedValues || []).length);
  console.log('btoaCaptures count:', (capturedData.btoaCaptures || []).length);
  console.log('stringifyOutputs count:', (capturedData.stringifyOutputs || []).length);
  console.log('challengeEncryptInputs count:', (capturedData.challengeEncryptInputs || []).length);

  // cd data validation
  if (cdString) {
    console.log('\n--- CD Validation ---');
    const startsCorrectly = cdString.indexOf('"cd":[') >= 0;
    console.log('Contains "cd":[:', startsCorrectly);
    try {
      let parsed;
      if (cdString.charAt(0) === '{') {
        parsed = JSON.parse(cdString);
        console.log('Valid JSON: YES');
        if (parsed.cd) {
          console.log('cd array entries:', parsed.cd.length);
        }
        if (parsed.sd) {
          console.log('sd keys:', Object.keys(parsed.sd).join(', '));
        }
      }
    } catch (e) {
      console.log('Valid JSON: NO (' + e.message + ')');
      // Try extracting cd array
      const cdIdx = cdString.indexOf('"cd":[');
      if (cdIdx >= 0) {
        console.log('cd array found at offset:', cdIdx);
      }
    }
  }

  // Collector map summary
  console.log('\n--- Collector Map ---');
  console.log('Total collectors:', collectorMap.totalCollectors);
  if (collectorMap.totalCollectors > 0) {
    const types = {};
    Object.values(collectorMap.collectorTypes).forEach(c => {
      types[c.type] = (types[c.type] || 0) + 1;
    });
    console.log('Type distribution:', JSON.stringify(types));
  }

  // sd validation
  console.log('\nIntercepted SD:', capturedData.interceptedSD ? 'YES' : 'NO');
  if (capturedData.interceptedSD) {
    console.log('SD keys:', Object.keys(capturedData.interceptedSD).join(', '));
  }

  // Token info
  if (token && typeof token === 'string' && token.length > 50) {
    console.log('\nTOKEN CAPTURED: YES (length=' + token.length + ')');
    console.log('Token preview:', token.substring(0, 80) + '...');
  } else {
    console.log('\nTOKEN CAPTURED: NO');
  }

  console.log('\nConsole errors:', (capturedData.consoleErrors || []).length);
  console.log('Runtime errors:', (capturedData.errors || []).length);
  if (capturedData.errors && capturedData.errors.length > 0) {
    capturedData.errors.forEach((e, i) => {
      console.log('  error[' + i + ']:', e.stage, e.error);
    });
  }
  console.log('========================\n');

  await browser.close();
  server.close();
  console.log('[harness] Done.');
}

// Run
runSession().catch((err) => {
  console.error('[harness] Fatal error:', err);
  process.exit(1);
});
