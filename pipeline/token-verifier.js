'use strict';

/**
 * token-verifier.js — Deterministic token verification for any tdc.js template.
 *
 * Captures a live token from a tdc.js build via Puppeteer with frozen environment,
 * then generates a standalone token using extracted XTEA key parameters and
 * compares them byte-for-byte.
 *
 * Adapted from dynamic/comparison-harness.js but parameterized for any template.
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { buildInputChunks } = require('../token/generate-token.js');
const { urlEncode } = require('../token/outer-pipeline.js');

// Frozen deterministic values — must match comparison-harness.js
const FROZEN_TIMESTAMP = 1700000000000;
const FROZEN_RANDOM = 0.42;
const FROZEN_PERF_NOW = 100.5;

// ═══════════════════════════════════════════════════════════════════════
// Parameterized XTEA encryption (not tied to any hardcoded key)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Convert a 4-byte binary string to a 32-bit word (little-endian).
 * Copied from token/crypto-core.js.
 */
function convertBytesToWord(fourByteString) {
  const b0 = fourByteString.charCodeAt(0) || 0;
  const b1 = fourByteString.charCodeAt(1) || 0;
  const b2 = fourByteString.charCodeAt(2) || 0;
  const b3 = fourByteString.charCodeAt(3) || 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

/**
 * Convert a 32-bit word to a 4-byte binary string (little-endian).
 * Copied from token/crypto-core.js.
 */
function convertWordToBytes(word) {
  return String.fromCharCode(
    word & 0xFF,
    (word >> 8) & 0xFF,
    (word >> 16) & 0xFF,
    (word >> 24) & 0xFF
  );
}

/**
 * Parameterized Modified XTEA cipher round.
 *
 * @param {number[]} r9 - Two-element array [word0, word1], modified in-place
 * @param {number[]} key - 4-element XTEA key array
 * @param {number} delta - XTEA delta constant
 * @param {number} rounds - Number of rounds (typically 32)
 * @param {number[]} keyModConstants - [mod1, mod3] added to key[1]/key[3]
 */
function cipherRoundParam(r9, key, delta, rounds, keyModConstants) {
  let v0 = r9[0];
  let v1 = r9[1];
  let sum = 0;
  const targetSum = rounds * delta;
  const keyMod1 = keyModConstants[0];
  const keyMod3 = keyModConstants[1];

  while (sum !== targetSum) {
    const idx0 = sum & 3;
    let k0 = key[idx0];
    if (idx0 === 1) k0 += keyMod1;
    else if (idx0 === 3) k0 += keyMod3;

    v0 += (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);

    sum += delta;

    const idx1 = (sum >>> 11) & 3;
    let k1 = key[idx1];
    if (idx1 === 1) k1 += keyMod1;
    else if (idx1 === 3) k1 += keyMod3;

    v1 += (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);
  }

  r9[0] = v0;
  r9[1] = v1;
}

/**
 * Encrypt a binary string using parameterized XTEA.
 *
 * @param {string} inputBytes - Binary string to encrypt
 * @param {Object} keyParams - { key, delta, rounds, keyModConstants }
 * @returns {string} Encrypted binary string
 */
function encryptParam(inputBytes, keyParams) {
  let output = '';
  const paddedLen = Math.ceil(inputBytes.length / 8) * 8;

  for (let pos = 0; pos < paddedLen; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    const r9 = [convertBytesToWord(slice1), convertBytesToWord(slice2)];
    cipherRoundParam(r9, keyParams.key, keyParams.delta, keyParams.rounds, keyParams.keyModConstants);

    output += convertWordToBytes(r9[0]) + convertWordToBytes(r9[1]);
  }

  return output;
}

/**
 * Decrypt a binary string using parameterized XTEA (reverse of encryptParam).
 *
 * @param {string} inputBytes - Encrypted binary string
 * @param {Object} keyParams - { key, delta, rounds, keyModConstants }
 * @returns {string} Decrypted binary string
 */
function decryptParam(inputBytes, keyParams) {
  let output = '';
  const targetSum = keyParams.rounds * keyParams.delta;
  const keyMod1 = keyParams.keyModConstants[0];
  const keyMod3 = keyParams.keyModConstants[1];

  for (let pos = 0; pos < inputBytes.length; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    let v0 = convertBytesToWord(slice1);
    let v1 = convertBytesToWord(slice2);
    let sum = targetSum;

    while (sum !== 0) {
      const idx1 = (sum >>> 11) & 3;
      let k1 = keyParams.key[idx1];
      if (idx1 === 1) k1 += keyMod1;
      else if (idx1 === 3) k1 += keyMod3;
      v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + k1);

      sum -= keyParams.delta;

      const idx0 = sum & 3;
      let k0 = keyParams.key[idx0];
      if (idx0 === 1) k0 += keyMod1;
      else if (idx0 === 3) k0 += keyMod3;
      v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + k0);
    }

    output += convertWordToBytes(v0) + convertWordToBytes(v1);
  }

  return output;
}

/**
 * Encrypt multiple chunks and return base64-encoded segments.
 *
 * @param {string[]} inputChunks - Array of binary strings
 * @param {Object} keyParams - { key, delta, rounds, keyModConstants }
 * @returns {string[]} Array of base64-encoded encrypted segments
 */
function encryptSegmentsParam(inputChunks, keyParams) {
  return inputChunks.map(chunk => {
    const encrypted = encryptParam(chunk, keyParams);
    return Buffer.from(encrypted, 'binary').toString('base64');
  });
}

/**
 * Decrypt base64 segments back to plaintext strings.
 *
 * @param {string[]} base64Segments - Array of base64-encoded encrypted segments
 * @param {Object} keyParams - { key, delta, rounds, keyModConstants }
 * @returns {string[]} Array of decrypted plaintext strings
 */
function decryptSegmentsParam(base64Segments, keyParams) {
  return base64Segments.map(b64 => {
    const encrypted = Buffer.from(b64, 'base64').toString('binary');
    return decryptParam(encrypted, keyParams);
  });
}

// ═══════════════════════════════════════════════════════════════════════
// Browser instrumentation
// ═══════════════════════════════════════════════════════════════════════

function buildInstrumentScript() {
  return `
(function() {
  var FROZEN_TS = ${FROZEN_TIMESTAMP};
  var FROZEN_RANDOM = ${FROZEN_RANDOM};
  var FROZEN_PERF = ${FROZEN_PERF_NOW};

  window.__COMPARISON_CAPTURE = {
    cdString: null,
    cdCaptures: [],
    longStringArgs: [],
    _seenFingerprints: {},
    sdObject: null,
    token: null,
    eksToken: null,
    frozenTimestampUsed: false,
    frozenRandomUsed: false,
    frozenPerfUsed: false,
    dateNowCalls: 0,
    mathRandomCalls: 0,
    perfNowCalls: 0,
    errors: [],
    btoaCaptures: []
  };
  var cap = window.__COMPARISON_CAPTURE;

  // ── 1. Freeze Date.now() ──
  var origDateNow = Date.now;
  Date.now = function() {
    cap.dateNowCalls++;
    cap.frozenTimestampUsed = true;
    return FROZEN_TS;
  };

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
    cap.frozenTimestampUsed = true;
    return FROZEN_TS;
  };
  FrozenDate.parse = OrigDate.parse;
  FrozenDate.UTC = OrigDate.UTC;
  FrozenDate.prototype = OrigDate.prototype;
  window.Date = FrozenDate;

  // ── 2. Freeze Math.random() ──
  Math.random = function() {
    cap.mathRandomCalls++;
    cap.frozenRandomUsed = true;
    return FROZEN_RANDOM;
  };

  // ── 3. Freeze performance.now() ──
  var origPerfNow = performance.now.bind(performance);
  performance.now = function() {
    cap.perfNowCalls++;
    cap.frozenPerfUsed = true;
    return FROZEN_PERF;
  };

  // ── 4. Freeze crypto.getRandomValues ──
  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues = function(arr) {
      for (var ci = 0; ci < arr.length; ci++) arr[ci] = 42;
      return arr;
    };
  }

  // ── 5. Freeze canvas fingerprint ──
  HTMLCanvasElement.prototype.toDataURL = function() {
    return 'data:image/png;base64,FROZEN_CANVAS_FINGERPRINT';
  };

  // ── 6. Required global Date helpers for tdc.js ──
  window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = function() {
    return new OrigDate(FROZEN_TS);
  };
  window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = function(a, b) {
    if (a === 'now') return FROZEN_TS;
    return OrigDate[a].apply(OrigDate, b);
  };

  // ── 7. Hook JSON.stringify to capture sd/cd payloads ──
  var origStringify = JSON.stringify;
  var stringifyCount = 0;
  JSON.stringify = function(value) {
    stringifyCount++;
    if (value && typeof value === 'object' && !Array.isArray(value) && stringifyCount <= 200) {
      try {
        var result = origStringify.apply(JSON, arguments);
        var keys = Object.keys(value);
        if (keys.indexOf('cd') >= 0 || keys.indexOf('sd') >= 0) {
          if (typeof value.cd === 'string' && value.cd.length > 5) {
            cap.cdString = value.cd;
            cap.cdCaptures.push({
              source: 'stringify-cd-property',
              length: value.cd.length
            });
          }
          if (value.sd && typeof value.sd === 'object') {
            cap.sdObject = JSON.parse(origStringify.call(JSON, value.sd));
          }
        }
        return result;
      } catch(e) {
        cap.errors.push({ stage: 'stringify', error: String(e) });
      }
    }
    return origStringify.apply(JSON, arguments);
  };

  // ── 8. Gated Function.prototype.call hook for cd capture ──
  window.__CD_CAPTURE_ACTIVE = false;
  var origFnCall = Function.prototype.call;
  var fnCallGuard = false;

  Function.prototype.call = function() {
    var args = [];
    for (var j = 0; j < arguments.length; j++) args[j] = arguments[j];
    var result = Reflect.apply(origFnCall, this, args);

    if (window.__CD_CAPTURE_ACTIVE && !fnCallGuard) {
      fnCallGuard = true;
      try {
        for (var i = 0; i < args.length; i++) {
          var arg = args[i];
          if (typeof arg === 'string') {
            var cdIdx = arg.indexOf('"cd":[');
            if (cdIdx >= 0 && arg.length > 50) {
              cap.cdCaptures.push({
                source: 'fn-call-arg',
                length: arg.length,
                argIndex: i
              });
              if (!cap.cdString || arg.length > cap.cdString.length) {
                cap.cdString = arg;
              }
            }
            if (arg.length > 200 && cap.longStringArgs.length < 100) {
              var fingerprint = arg.length + ':' + arg.substring(0, 50);
              if (!cap._seenFingerprints[fingerprint]) {
                cap._seenFingerprints[fingerprint] = true;
                cap.longStringArgs.push({
                  length: arg.length,
                  argIndex: i,
                  value: arg.length < 20000 ? arg : arg.substring(0, 20000),
                  hasCd: cdIdx >= 0,
                  hasSd: arg.indexOf('"sd"') >= 0
                });
              }
            }
          }
        }
        if (result && typeof result === 'object') {
          var cdVal;
          try { cdVal = result.cd; } catch(e2) {}
          if (typeof cdVal === 'string' && cdVal.length > 20 && cdVal.indexOf('"cd":[') >= 0) {
            cap.cdCaptures.push({
              source: 'fn-call-return-cd',
              length: cdVal.length
            });
            if (!cap.cdString || cdVal.length > cap.cdString.length) {
              cap.cdString = cdVal;
            }
          }
        }
      } catch(e) { /* silent */ }
      fnCallGuard = false;
    }
    return result;
  };

  // ── 9. Hook Object.prototype 'cd' setter ──
  try {
    Object.defineProperty(Object.prototype, 'cd', {
      set: function(val) {
        if (window.__CD_CAPTURE_ACTIVE &&
            typeof val === 'string' && val.length > 100 &&
            val.indexOf('"cd":[') >= 0) {
          cap.cdCaptures.push({
            source: 'obj-proto-setter',
            length: val.length
          });
          if (!cap.cdString || val.length > cap.cdString.length) {
            cap.cdString = val;
          }
        }
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
  } catch(e) {
    cap.errors.push({ stage: 'cd-proto-setter', error: String(e) });
  }

  // ── 10. Hook window.btoa — capture the 4 encrypted segments ──
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

  // ── 11. Error capture ──
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
// HTML Page Builder
// ═══════════════════════════════════════════════════════════════════════

function buildHTML(tdcSource, instrumentScript) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Token Verifier</title>
</head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>
    ${instrumentScript}
  </script>
  <script>
    ${tdcSource}
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Main: verifyToken
// ═══════════════════════════════════════════════════════════════════════

/**
 * Capture a live token from a tdc.js build and compare it byte-for-byte
 * against a standalone-generated token using provided XTEA key parameters.
 *
 * @param {string} tdcPath - Path to the target tdc.js file
 * @param {Object} keyParams - { key: [uint32 x4], delta, rounds, keyModConstants: [n1, n2] }
 * @returns {Promise<Object>} Verification result
 */
async function verifyToken(tdcPath, keyParams) {
  const TIMEOUT_MS = 30000;
  const absolutePath = path.resolve(tdcPath);
  const tdcSource = fs.readFileSync(absolutePath, 'utf-8');
  const instrumentScript = buildInstrumentScript();
  const html = buildHTML(tdcSource, instrumentScript);

  let server;
  let browser;

  try {
    // Start local HTTP server
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    // Launch Puppeteer
    browser = await puppeteer.launch({
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
    page.on('pageerror', err => {
      pageErrors.push(err.message);
    });

    // Load page
    await page.goto('http://127.0.0.1:' + port, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUT_MS
    });

    // Wait for TDC
    const tdcReady = await page.waitForFunction(
      () => window.TDC && typeof window.TDC.getInfo === 'function',
      { timeout: 15000 }
    ).then(() => true).catch(() => false);

    if (!tdcReady) {
      const errInfo = pageErrors.length > 0 ? ` Page errors: ${pageErrors.slice(0, 3).join('; ')}` : '';
      throw new Error(`TDC did not initialize within 15s.${errInfo}`);
    }

    // Wait for async collectors
    await new Promise(r => setTimeout(r, 2000));

    // Call TDC.setData
    await page.evaluate(() => {
      window.TDC.setData({
        appid: '2090803262',
        nonce: '0.12345678',
        token: 'test_token_123'
      });
    });

    // Activate cd capture hooks before getData
    await page.evaluate(() => {
      window.__CD_CAPTURE_ACTIVE = true;
    });

    // Call TDC.getData
    const liveResult = await page.evaluate(() => {
      try {
        const token = window.TDC.getData();
        window.__CD_CAPTURE_ACTIVE = false;
        return { success: true, token: token };
      } catch (e) {
        window.__CD_CAPTURE_ACTIVE = false;
        return { success: false, error: e.message, stack: e.stack };
      }
    });

    // Capture eks token
    const eksToken = await page.evaluate(() => {
      try {
        const info = window.TDC.getInfo();
        return info && info.info ? info.info : null;
      } catch (e) {
        return null;
      }
    });

    // Retrieve captured data
    const captureData = await page.evaluate(() => {
      var cap = window.__COMPARISON_CAPTURE;
      return {
        cdString: cap.cdString,
        sdObject: cap.sdObject,
        cdCaptureCount: cap.cdCaptures.length,
        cdCaptureSources: cap.cdCaptures.map(function(c) { return c.source + ':' + c.length; }),
        longStringArgs: cap.longStringArgs,
        btoaCaptures: cap.btoaCaptures,
        frozenTimestampUsed: cap.frozenTimestampUsed,
        frozenRandomUsed: cap.frozenRandomUsed,
        frozenPerfUsed: cap.frozenPerfUsed,
        dateNowCalls: cap.dateNowCalls,
        mathRandomCalls: cap.mathRandomCalls,
        perfNowCalls: cap.perfNowCalls,
        errors: cap.errors
      };
    });

    // Done with browser
    await browser.close().catch(() => {});
    browser = null;
    server.close();
    server = null;

    // ── Phase 1 complete: we have the live token and btoa captures ──

    const liveToken = liveResult.success ? liveResult.token : null;

    if (!liveToken) {
      return {
        match: false,
        liveTokenLength: 0,
        standaloneTokenLength: 0,
        segments: [],
        capturedData: { cdString: null, sdString: null, timestamp: FROZEN_TIMESTAMP },
        eksToken: eksToken,
        notes: 'Live token not captured: ' + (liveResult.error || 'unknown') +
          (pageErrors.length > 0 ? '; Page errors: ' + pageErrors.join('; ') : '')
      };
    }

    const liveBtoaCaptures = captureData.btoaCaptures || [];
    if (liveBtoaCaptures.length < 4) {
      return {
        match: false,
        liveTokenLength: liveToken.length,
        standaloneTokenLength: 0,
        segments: [],
        capturedData: { cdString: null, sdString: null, timestamp: FROZEN_TIMESTAMP },
        eksToken: eksToken,
        notes: 'Expected 4 btoa captures, got ' + liveBtoaCaptures.length
      };
    }

    // ── Phase 2: Decrypt live btoa segments to extract cdString/sdString ──
    //
    // Strategy: decrypt the 4 live segments to get exact plaintexts, then
    // re-encrypt those same plaintexts with our parameterized XTEA.
    // This avoids cdString reconstruction errors from header padding.
    //
    // Additionally, reconstruct cdString/sdString for the report (best-effort).

    const liveBtoaOutputs = liveBtoaCaptures.map(c => c.output);
    const livePlaintexts = decryptSegmentsParam(liveBtoaOutputs, keyParams);

    // Re-encrypt the exact decrypted plaintexts with our parameterized cipher
    const standaloneBtoa = encryptSegmentsParam(livePlaintexts, keyParams);

    // Assemble in order [1, 0, 2, 3]
    const standaloneAssembled = standaloneBtoa[1] + standaloneBtoa[0] + standaloneBtoa[2] + standaloneBtoa[3];
    const standaloneToken = urlEncode(standaloneAssembled);

    // Best-effort cdString/sdString reconstruction for the report
    const liveHeader = livePlaintexts[1];  // 144 bytes
    const liveCdBody = livePlaintexts[2];  // variable
    const rawPayload = (liveHeader + liveCdBody)
      .replace(/[\x00]+$/, '')
      .replace(/\s+,$/, ',')
      .replace(/[\x00\s]+$/, '');

    let cdString;
    if (rawPayload.endsWith(',')) {
      cdString = rawPayload.slice(0, -1) + '}';
    } else {
      cdString = rawPayload + ']}';
    }

    const sdString = livePlaintexts[3].replace(/[\x00\s]+$/, '');

    // ── Phase 3: Compare ──

    const segNames = ['hash', 'header', 'cdBody', 'sig'];
    const segments = [];
    let allMatch = true;

    for (let i = 0; i < 4; i++) {
      const liveB = liveBtoaCaptures[i].output;
      const stanB = standaloneBtoa[i];
      const match = liveB === stanB;
      if (!match) allMatch = false;

      let firstDivergenceOffset = null;
      if (!match) {
        const minLen = Math.min(liveB.length, stanB.length);
        for (let j = 0; j < minLen; j++) {
          if (liveB[j] !== stanB[j]) {
            firstDivergenceOffset = j;
            break;
          }
        }
        if (firstDivergenceOffset === null && liveB.length !== stanB.length) {
          firstDivergenceOffset = minLen;
        }
      }

      segments.push({
        name: segNames[i],
        liveLength: liveB.length,
        standaloneLength: stanB.length,
        match: match,
        firstDivergenceOffset: firstDivergenceOffset
      });
    }

    // Full token comparison
    const tokenMatch = liveToken === standaloneToken;

    const notes = [];
    if (tokenMatch) {
      notes.push('Tokens are byte-identical');
    } else {
      const failedSegments = segments.filter(s => !s.match).map(s => s.name);
      if (failedSegments.length > 0) {
        notes.push('Segment mismatches: ' + failedSegments.join(', '));
      } else {
        notes.push('All segments match but full token differs (assembly order issue?)');
      }
    }

    if (captureData.frozenTimestampUsed) {
      notes.push('Frozen timestamp confirmed (' + captureData.dateNowCalls + ' Date.now calls)');
    }
    if (captureData.errors.length > 0) {
      notes.push(captureData.errors.length + ' capture errors');
    }
    if (pageErrors.length > 0) {
      notes.push(pageErrors.length + ' page errors');
    }

    return {
      match: tokenMatch,
      liveTokenLength: liveToken.length,
      standaloneTokenLength: standaloneToken.length,
      segments: segments,
      capturedData: {
        cdString: cdString,
        sdString: sdString,
        timestamp: FROZEN_TIMESTAMP
      },
      eksToken: eksToken,
      notes: notes.join('; ')
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
}

module.exports = { verifyToken };
