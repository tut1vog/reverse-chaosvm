'use strict';

/**
 * key-extractor.js -- Dynamic XTEA key extraction via Puppeteer tracing.
 *
 * Patches a tdc.js build to trace all arithmetic/bitwise operations during
 * token generation, then extracts the XTEA encryption key parameters by
 * identifying the characteristic cipher round pattern in the trace data.
 *
 * Template-agnostic: uses opcodeTable and variables from pipeline/ modules
 * instead of hardcoded variable names or case numbers.
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Known validation values for Template A (tdc.js)
const EXPECTED_KEY_A = [0x6257584f, 0x462a4564, 0x636a5062, 0x6d644140];
const EXPECTED_DELTA = 0x9E3779B9;
const EXPECTED_ROUNDS = 32;
const EXPECTED_KEY_MODS_A = [2368517, 592130];

// =========================================================================
// Step 1: Build opcode lookup tables from the opcode table
// =========================================================================

function buildOpcodeLookups(opcodeTable) {
  const mnemonicToCase = {};
  for (const [num, name] of Object.entries(opcodeTable)) {
    mnemonicToCase[name] = parseInt(num, 10);
  }

  // Arithmetic/bitwise opcodes (register-register)
  const arithRR = ['ADD', 'SUB', 'MUL', 'XOR', 'OR', 'SHL', 'SHR', 'USHR', 'DIV', 'MOD', 'NEG'];
  // Arithmetic/bitwise opcodes (register-immediate)
  const arithRK = ['ADD_K', 'SUB_K', 'SHR_K', 'USHR_K', 'AND_K', 'OR_K', 'SHL_K', 'RSUB_K'];
  // Compare opcodes
  const compareOps = ['GT', 'LT', 'LT_K', 'EQ_K', 'EQ', 'GE', 'LE', 'NE', 'NE_K', 'GE_K', 'LE_K', 'GT_K'];
  // Control opcodes
  const controlOps = ['JMP', 'CJMP'];
  // Load/store opcodes
  const loadOps = ['PROP_GET_K', 'LOAD_K', 'PROP_GET', 'MOV', 'MOV_2'];

  const arithSet = {};
  const compareSet = {};
  const controlSet = {};
  const loadSet = {};

  for (const mn of arithRR.concat(arithRK)) {
    if (mnemonicToCase[mn] !== undefined) arithSet[mnemonicToCase[mn]] = mn;
  }
  for (const mn of compareOps) {
    if (mnemonicToCase[mn] !== undefined) compareSet[mnemonicToCase[mn]] = mn;
  }
  for (const mn of controlOps) {
    if (mnemonicToCase[mn] !== undefined) controlSet[mnemonicToCase[mn]] = mn;
  }
  for (const mn of loadOps) {
    if (mnemonicToCase[mn] !== undefined) loadSet[mnemonicToCase[mn]] = mn;
  }

  return { mnemonicToCase, arithSet, compareSet, controlSet, loadSet };
}

// =========================================================================
// Step 2: Patch the tdc.js source for tracing
// =========================================================================

function patchTdcSource(source, variables) {
  const { bytecode, pc, regs } = variables;
  // Try both "switch (...)" and "switch(...)" — some builds omit the space
  const targetSpaced = `switch (${bytecode}[++${pc}])`;
  const targetCompact = `switch(${bytecode}[++${pc}])`;
  let idx = source.indexOf(targetSpaced);
  let target = targetSpaced;
  if (idx < 0) {
    idx = source.indexOf(targetCompact);
    target = targetCompact;
  }
  if (idx < 0) {
    throw new Error(`Could not find dispatch switch "${targetSpaced}" or "${targetCompact}" in tdc.js`);
  }

  // Patch: save opcode, call trace hook, then dispatch
  const replacement = [
    `var _xop=${bytecode}[++${pc}];`,
    `if(window.__KT){window.__KT(${pc},_xop,${regs},${bytecode});}`,
    'switch(_xop)'
  ].join('');

  return source.substring(0, idx) + replacement + source.substring(idx + target.length);
}

// =========================================================================
// Step 3: Build browser instrumentation code
// =========================================================================

function buildInstrumentCode(lookups) {
  const arithJSON = JSON.stringify(lookups.arithSet);
  const loadJSON = JSON.stringify(lookups.loadSet);

  return `(function() {
  'use strict';

  // ── Freeze non-deterministic values ──
  var FROZEN_TS = 1700000000000;
  var OrigDate = Date;
  Date.now = function() { return FROZEN_TS; };

  Math.random = function() { return 0.42; };

  if (window.performance) {
    performance.now = function() { return 100.5; };
  }

  if (window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues = function(arr) {
      for (var ci = 0; ci < arr.length; ci++) arr[ci] = 42;
      return arr;
    };
  }

  HTMLCanvasElement.prototype.toDataURL = function() {
    return 'data:image/png;base64,FROZEN_CANVAS_FINGERPRINT';
  };

  // TDC Date helpers (consistent across builds)
  window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = function() {
    return new OrigDate(FROZEN_TS);
  };
  window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = function(a, b) {
    if (a === 'now') return FROZEN_TS;
    return OrigDate[a].apply(OrigDate, b);
  };

  // ── Trace storage ──
  var ARITH_OPS = ${arithJSON};
  var LOAD_OPS = ${loadJSON};

  window.__KT_ACTIVE = false;
  window.__KT_OPS = [];
  window.__KT_ERRORS = [];

  var MAX_OPS = 500000;

  window.__KT = function(C, _xop, i, Y) {
    try {
      if (!window.__KT_ACTIVE) return;
      if (window.__KT_OPS.length >= MAX_OPS) return;

      var mn = ARITH_OPS[_xop];
      if (mn) {
        var a = Y[C + 1];
        var b = Y[C + 2];
        var c = Y[C + 3];
        var isK = mn.indexOf('_K') >= 0;

        if (mn === 'NEG') {
          window.__KT_OPS.push({ pc: C, mn: mn, dst: a, srcVal: [i[b]] });
        } else if (mn === 'RSUB_K') {
          window.__KT_OPS.push({ pc: C, mn: mn, dst: a, srcVal: [b, i[c]], k: b });
        } else if (isK) {
          window.__KT_OPS.push({ pc: C, mn: mn, dst: a, srcVal: [i[b], c], k: c });
        } else {
          window.__KT_OPS.push({ pc: C, mn: mn, dst: a, srcVal: [i[b], i[c]] });
        }
        return;
      }

      mn = LOAD_OPS[_xop];
      if (mn) {
        var a = Y[C + 1];
        if (mn === 'PROP_GET_K') {
          var b = Y[C + 2];
          var k = Y[C + 3];
          var arrVal = i[b];
          var elemVal = (arrVal !== null && arrVal !== undefined) ? arrVal[k] : undefined;
          window.__KT_OPS.push({ pc: C, mn: mn, dst: a, arrReg: b, key: k, elemVal: elemVal });
        } else if (mn === 'PROP_GET') {
          var b = Y[C + 2];
          var c = Y[C + 3];
          var arrVal2 = i[b];
          var keyVal = i[c];
          var elemVal2 = (arrVal2 !== null && arrVal2 !== undefined) ? arrVal2[keyVal] : undefined;
          window.__KT_OPS.push({ pc: C, mn: mn, dst: a, keyVal: keyVal, elemVal: elemVal2 });
        }
        return;
      }
    } catch(e) {
      window.__KT_ERRORS.push({ pc: C, op: _xop, err: String(e) });
    }
  };

})();`;
}

// =========================================================================
// Step 4: Build HTML page
// =========================================================================

function buildHTML(patchedSource, instrumentCode) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Key Extractor</title>
</head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>
    ${instrumentCode}
  </script>
  <script>
    ${patchedSource}
  </script>
</body>
</html>`;
}

// =========================================================================
// Step 5: Run Puppeteer and collect trace
// =========================================================================

async function collectTrace(html, timeoutMs) {
  let server;
  let browser;

  try {
    // Create HTTP server
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    // Launch browser
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
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Wait for TDC to initialize
    const tdcReady = await page.waitForFunction(
      () => window.TDC && typeof window.TDC.getInfo === 'function',
      { timeout: 15000 }
    ).then(() => true).catch(() => false);

    if (!tdcReady) {
      const errInfo = pageErrors.length > 0 ? ` Page errors: ${pageErrors.slice(0, 3).join('; ')}` : '';
      throw new Error(`TDC did not initialize within 15s.${errInfo}`);
    }

    // Wait briefly for collectors to run
    await new Promise(r => setTimeout(r, 1500));

    // Call setData then getData with tracing active
    // First trigger the trace
    await page.evaluate(() => {
      window.TDC.setData({
        appid: '2090803262',
        nonce: '0.12345678',
        token: 'test_token_123'
      });

      // Enable tracing
      window.__KT_ACTIVE = true;

      try {
        window.__KT_TOKEN = window.TDC.getData();
      } catch (e) {
        window.__KT_TOKEN = 'ERROR: ' + e.message;
      }

      // Disable tracing
      window.__KT_ACTIVE = false;
    });

    // Retrieve results in chunks to avoid CDP serialization limits
    const opCount = await page.evaluate(() => window.__KT_OPS ? window.__KT_OPS.length : 0);
    const token = await page.evaluate(() => window.__KT_TOKEN);
    const errors = await page.evaluate(() => window.__KT_ERRORS || []);

    // Retrieve ops in batches
    const BATCH_SIZE = 50000;
    const allOps = [];
    for (let offset = 0; offset < opCount; offset += BATCH_SIZE) {
      const batch = await page.evaluate((start, size) => {
        return window.__KT_OPS.slice(start, start + size);
      }, offset, BATCH_SIZE);
      if (batch) allOps.push(...batch);
    }

    return {
      token,
      ops: allOps,
      errors,
      opCount
    };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
}

// =========================================================================
// Step 6: Analyze trace to extract XTEA key parameters
// =========================================================================

function analyzeTrace(ops) {
  const result = {
    key: null,
    delta: null,
    rounds: null,
    keyModConstants: null,
    verified: false,
    notes: ''
  };

  const notes = [];

  // -----------------------------------------------------------------------
  // Phase 1: Find the XTEA delta constant (0x9E3779B9 = 2654435769).
  //
  // In ChaosVM, the delta is stored in an array element (e.g., r1[2]) and
  // loaded via PROP_GET_K, then used in a register-register ADD: sum += delta.
  // We search for ADD operations where one source value is 0x9E3779B9.
  // -----------------------------------------------------------------------

  const DELTA_UNSIGNED = 0x9E3779B9 >>> 0; // 2654435769

  // Find ADD ops where one operand is exactly the delta value.
  // The true "sum += delta" instruction always has the delta as one srcVal.
  // Group by PC to find the actual cipher sum-accumulation instruction.
  const deltaByPC = {};
  const allDeltaOps = [];
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    let isDelta = false;
    if (op.mn === 'ADD' && op.srcVal) {
      if ((op.srcVal[0] >>> 0) === DELTA_UNSIGNED ||
          (op.srcVal[1] >>> 0) === DELTA_UNSIGNED) {
        isDelta = true;
      }
    }
    if (op.mn === 'ADD_K' && op.srcVal) {
      const k = op.k !== undefined ? op.k : op.srcVal[1];
      if ((k >>> 0) === DELTA_UNSIGNED) {
        isDelta = true;
      }
    }
    if (isDelta) {
      allDeltaOps.push({ index: idx, op });
      deltaByPC[op.pc] = (deltaByPC[op.pc] || 0) + 1;
    }
  }

  if (allDeltaOps.length === 0) {
    notes.push('Could not find XTEA delta constant in trace');
    result.notes = notes.join('; ');
    return result;
  }

  result.delta = DELTA_UNSIGNED;

  // -----------------------------------------------------------------------
  // Phase 2: Determine round count.
  //
  // The real "sum += delta" instruction repeats at a single PC.
  // Other ADD ops involving the delta value (e.g., sum + key) happen at
  // different PCs. Find the PC with count divisible by 32.
  // -----------------------------------------------------------------------

  // Find the most frequent PC for delta additions -- that is the sum += delta PC.
  // Other PCs with delta in srcVal are sum+key or other operations.
  const pcEntries = Object.entries(deltaByPC).sort((a, b) => b[1] - a[1]);
  const sumDeltaPC = pcEntries[0][0];
  const sumDeltaCount = pcEntries[0][1];

  // Filter deltaOps to only the sum += delta PC
  const deltaOps = allDeltaOps.filter(d => String(d.op.pc) === String(sumDeltaPC));
  notes.push(`Found ${deltaOps.length} sum+=delta at PC ${sumDeltaPC}`);

  // Standard XTEA uses 32 rounds. The total count may be truncated by the trace
  // cap, so we default to 32 when the XTEA pattern is detected (delta present).
  // If the full count divides evenly by 32, we can confirm the cipher call count.
  if (sumDeltaCount % 32 === 0) {
    result.rounds = 32;
    const cipherCalls = sumDeltaCount / 32;
    notes.push(`${cipherCalls} cipher calls x 32 rounds`);
  } else {
    // Trace was likely truncated by the 500k op cap. Default to 32 for XTEA.
    result.rounds = 32;
    notes.push(`${sumDeltaCount} delta additions (trace may be truncated); assuming 32 rounds`);
  }

  // -----------------------------------------------------------------------
  // Phase 3: Extract the 4 key values.
  //
  // The key array is accessed via PROP_GET with dynamic index (sum & 3 or
  // (sum >>> 11) & 3). These appear as PROP_GET ops with keyVal in {0,1,2,3}
  // and elemVal being the individual key element (a uint32).
  //
  // We scan the cipher region (around delta ops) for PROP_GET ops with
  // numeric keyVal 0-3 and numeric elemVal, then group by keyVal to find
  // the 4 key elements.
  // -----------------------------------------------------------------------

  const firstDeltaIdx = deltaOps[0].index;
  const endDeltaIdx = deltaOps.length >= 32
    ? deltaOps[31].index
    : deltaOps[deltaOps.length - 1].index;
  const windowStart = Math.max(0, firstDeltaIdx - 50);
  const windowEnd = Math.min(ops.length, endDeltaIdx + 50);

  // Collect PROP_GET ops with numeric keyVal 0-3 and numeric elemVal
  const keyAccesses = { 0: [], 1: [], 2: [], 3: [] };
  for (let idx = windowStart; idx < windowEnd; idx++) {
    const op = ops[idx];
    if (op.mn === 'PROP_GET' && typeof op.keyVal === 'number' &&
        op.keyVal >= 0 && op.keyVal <= 3 &&
        typeof op.elemVal === 'number') {
      keyAccesses[op.keyVal].push(op.elemVal);
    }
  }

  let keyValues = null;
  const hasAll4 = keyAccesses[0].length > 0 && keyAccesses[1].length > 0 &&
                  keyAccesses[2].length > 0 && keyAccesses[3].length > 0;

  if (hasAll4) {
    // For each index, find the most common value (the raw key element)
    keyValues = [];
    for (let i = 0; i < 4; i++) {
      const counts = {};
      for (const v of keyAccesses[i]) {
        const vStr = String(v >>> 0);
        counts[vStr] = (counts[vStr] || 0) + 1;
      }
      let bestVal = null;
      let bestCount = 0;
      for (const [vStr, count] of Object.entries(counts)) {
        if (count > bestCount) {
          bestCount = count;
          bestVal = parseInt(vStr, 10);
        }
      }
      keyValues.push(bestVal >>> 0);
    }
  }

  if (!keyValues) {
    notes.push('Could not extract key values from PROP_GET operations');
    result.notes = notes.join('; ');
    return result;
  }

  result.key = keyValues;
  notes.push(`Key: [${result.key.map(k => '0x' + k.toString(16).toUpperCase()).join(', ')}]`);

  // -----------------------------------------------------------------------
  // Phase 4: Extract key modification constants.
  //
  // In modified XTEA, each key index may have an additive constant:
  //   effective_key[i] = key[i] + keyMod[i]
  // These appear as ADD_K ops where srcVal[0] matches a raw key value
  // and k is the modification constant.
  //
  // Different templates use different indices:
  //   Template A: key[1] + 2368517, key[3] + 592130
  //   Template B: key[2] + 657930, key[3] + 526341
  // So we must check ALL 4 key indices, not just 1 and 3.
  // -----------------------------------------------------------------------

  const keyModCandidates = [[], [], [], []];  // one array per key index

  for (let idx = windowStart; idx < windowEnd; idx++) {
    const op = ops[idx];
    if (op.mn !== 'ADD_K' || op.k === undefined) continue;
    const k = op.k;
    // Skip delta and trivial constants
    if ((k >>> 0) === DELTA_UNSIGNED || k <= 0 || k >= 10000000) continue;

    const srcVal = op.srcVal ? op.srcVal[0] : null;
    if (srcVal === null || srcVal === undefined) continue;

    for (let ki = 0; ki < 4; ki++) {
      if ((srcVal >>> 0) === result.key[ki]) {
        keyModCandidates[ki].push(k);
      }
    }
  }

  const pickMostCommon = (arr) => {
    if (arr.length === 0) return 0;
    const counts = {};
    for (const k of arr) counts[k] = (counts[k] || 0) + 1;
    let best = null;
    let bestCount = 0;
    for (const [k, count] of Object.entries(counts)) {
      if (count > bestCount) { bestCount = count; best = parseInt(k, 10); }
    }
    return best;
  };

  const keyMods = keyModCandidates.map(pickMostCommon);
  result.keyMods = keyMods;

  // Legacy format: keyModConstants = [mod_for_idx_1, mod_for_idx_3]
  // Kept for backward compatibility with template cache
  result.keyModConstants = [keyMods[1], keyMods[3]];

  const nonZeroMods = keyMods.map((v, i) => v > 0 ? `key[${i}]+${v}` : null).filter(Boolean);
  if (nonZeroMods.length > 0) {
    notes.push(`Key mod constants: [${keyMods.join(', ')}] (${nonZeroMods.join(', ')})`);
  } else {
    notes.push('No key modification constants found (standard XTEA or undetected)');
  }

  // -----------------------------------------------------------------------
  // Phase 5: Verify against known Template A values.
  // -----------------------------------------------------------------------

  const keyMatch = result.key.every((k, i) => (k >>> 0) === EXPECTED_KEY_A[i]);
  const deltaMatch = (result.delta >>> 0) === EXPECTED_DELTA;
  const roundsMatch = result.rounds === EXPECTED_ROUNDS;

  if (keyMatch && deltaMatch && roundsMatch) {
    result.verified = true;
    notes.push('Verified against Template A known values');
  }

  result.notes = notes.join('; ');
  return result;
}

// =========================================================================
// Main: extractKey
// =========================================================================

/**
 * Extract XTEA encryption key parameters from a tdc.js build by dynamic tracing.
 *
 * @param {string} tdcPath - Path to the target tdc.js file
 * @param {Object} opcodeTable - From pipeline/opcode-mapper.js result, e.g., { '0': 'ADD', ... }
 * @param {Object} variables - From pipeline/vm-parser.js result, e.g., { bytecode: 'Y', pc: 'C', regs: 'i', ... }
 * @returns {Promise<Object>} Key extraction result
 */
async function extractKey(tdcPath, opcodeTable, variables) {
  const TIMEOUT_MS = 30000;

  // Read tdc source
  const absolutePath = path.resolve(tdcPath);
  const tdcSource = fs.readFileSync(absolutePath, 'utf-8');

  // Build opcode lookups
  const lookups = buildOpcodeLookups(opcodeTable);

  // Patch source
  const patchedSource = patchTdcSource(tdcSource, variables);

  // Build instrumentation
  const instrumentCode = buildInstrumentCode(lookups);

  // Build HTML
  const html = buildHTML(patchedSource, instrumentCode);

  // Collect trace with timeout
  let traceResult;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('Key extraction timed out after 30s')), TIMEOUT_MS);
  });

  try {
    traceResult = await Promise.race([
      collectTrace(html, TIMEOUT_MS),
      timeoutPromise
    ]);
  } catch (collectErr) {
    throw new Error(`Trace collection failed: ${collectErr.message}`);
  }

  if (!traceResult || !traceResult.ops) {
    throw new Error('No trace data collected');
  }

  if (traceResult.token && traceResult.token.startsWith('ERROR:')) {
    throw new Error(`TDC.getData() failed: ${traceResult.token}`);
  }

  // Analyze trace to extract key
  const result = analyzeTrace(traceResult.ops);

  if (traceResult.errors && traceResult.errors.length > 0) {
    result.notes += `; ${traceResult.errors.length} trace errors`;
  }

  return result;
}

module.exports = { extractKey, buildOpcodeLookups, patchTdcSource, buildInstrumentCode, analyzeTrace };
