'use strict';

/**
 * diag-keymods.js -- Diagnostic script for keyMods extraction failures.
 *
 * Runs the pipeline (parse → map → key-extract) on multiple tdc.js targets
 * and dumps detailed trace analysis to identify why analyzeTrace() produces
 * keyMods [0,0] for some templates.
 *
 * Usage:
 *   node scripts/diag-keymods.js [target1.js] [target2.js] ...
 *
 * If no targets given, defaults to targets/tdc.js and targets/tdc-live-test.js.
 *
 * Also attempts to fetch a fresh live tdc.js from Tencent (saved as
 * targets/tdc-diag.js) and includes it in the analysis.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const puppeteer = require('puppeteer');

const { parseVmFunction } = require('../pipeline/vm-parser');
const { mapOpcodes } = require('../pipeline/opcode-mapper');
const {
  buildOpcodeLookups,
  patchTdcSource,
  buildInstrumentCode,
  analyzeTrace
} = require('../pipeline/key-extractor');

const ROOT = path.resolve(__dirname, '..');
const DELTA_UNSIGNED = 0x9E3779B9 >>> 0;

// ---------------------------------------------------------------------------
// Fetch live tdc.js
// ---------------------------------------------------------------------------

function fetchLiveTdc() {
  return new Promise((resolve, reject) => {
    const url = 'https://ssl.captcha.qq.com/tdc.js?app_id=2090803262&fv=0038';
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate',
        'Referer': 'https://captcha.qq.com/'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching tdc.js`));
        res.resume();
        return;
      }
      let stream = res;
      const encoding = res.headers['content-encoding'];
      if (encoding === 'gzip') {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        stream = res.pipe(zlib.createInflate());
      }
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout fetching tdc.js')); });
  });
}

// ---------------------------------------------------------------------------
// Build HTML and collect trace (adapted from key-extractor.js)
// ---------------------------------------------------------------------------

function buildHTML(patchedSource, instrumentCode) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Diag</title></head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>${instrumentCode}</script>
  <script>${patchedSource}</script>
</body>
</html>`;
}

async function collectTrace(html, timeoutMs) {
  let server;
  let browser;

  try {
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security',
             '--disable-features=IsolateOrigins,site-per-process', '--window-size=1920,1080']
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    const tdcReady = await page.waitForFunction(
      () => window.TDC && typeof window.TDC.getInfo === 'function',
      { timeout: 15000 }
    ).then(() => true).catch(() => false);

    if (!tdcReady) {
      const errInfo = pageErrors.length > 0 ? ` Page errors: ${pageErrors.slice(0, 3).join('; ')}` : '';
      throw new Error(`TDC did not initialize within 15s.${errInfo}`);
    }

    await new Promise(r => setTimeout(r, 1500));

    await page.evaluate(() => {
      window.TDC.setData({
        appid: '2090803262',
        nonce: '0.12345678',
        token: 'test_token_123'
      });
      window.__KT_ACTIVE = true;
      try {
        window.__KT_TOKEN = window.TDC.getData();
      } catch (e) {
        window.__KT_TOKEN = 'ERROR: ' + e.message;
      }
      window.__KT_ACTIVE = false;
    });

    const opCount = await page.evaluate(() => window.__KT_OPS ? window.__KT_OPS.length : 0);
    const token = await page.evaluate(() => window.__KT_TOKEN);
    const errors = await page.evaluate(() => window.__KT_ERRORS || []);

    const BATCH_SIZE = 50000;
    const allOps = [];
    for (let offset = 0; offset < opCount; offset += BATCH_SIZE) {
      const batch = await page.evaluate((start, size) => {
        return window.__KT_OPS.slice(start, start + size);
      }, offset, BATCH_SIZE);
      if (batch) allOps.push(...batch);
    }

    return { token, ops: allOps, errors, opCount, pageErrors };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.close();
  }
}

// ---------------------------------------------------------------------------
// Deep trace analysis (the diagnostic core)
// ---------------------------------------------------------------------------

function deepAnalyzeTrace(ops, label) {
  const diag = {
    label,
    totalOps: ops.length,
    phases: {}
  };

  // ── Phase 1: Delta detection ──
  const deltaByPC = {};
  const allDeltaOps = [];
  for (let idx = 0; idx < ops.length; idx++) {
    const op = ops[idx];
    let isDelta = false;
    if (op.mn === 'ADD' && op.srcVal) {
      if ((op.srcVal[0] >>> 0) === DELTA_UNSIGNED || (op.srcVal[1] >>> 0) === DELTA_UNSIGNED) {
        isDelta = true;
      }
    }
    if (op.mn === 'ADD_K' && op.srcVal) {
      const k = op.k !== undefined ? op.k : op.srcVal[1];
      if ((k >>> 0) === DELTA_UNSIGNED) isDelta = true;
    }
    if (isDelta) {
      allDeltaOps.push({ index: idx, op });
      deltaByPC[op.pc] = (deltaByPC[op.pc] || 0) + 1;
    }
  }

  diag.phases.phase1_delta = {
    totalDeltaOps: allDeltaOps.length,
    deltaByPC,
    firstFewDeltaOps: allDeltaOps.slice(0, 5).map(d => ({
      index: d.index,
      pc: d.op.pc,
      mn: d.op.mn,
      srcVal: d.op.srcVal,
      k: d.op.k
    }))
  };

  if (allDeltaOps.length === 0) {
    diag.phases.phase1_delta.error = 'No delta ops found';
    return diag;
  }

  // Pick sum += delta PC
  const pcEntries = Object.entries(deltaByPC).sort((a, b) => b[1] - a[1]);
  const sumDeltaPC = pcEntries[0][0];
  const sumDeltaCount = pcEntries[0][1];
  const deltaOps = allDeltaOps.filter(d => String(d.op.pc) === String(sumDeltaPC));

  diag.phases.phase2_rounds = {
    sumDeltaPC,
    sumDeltaCount,
    pcDistribution: pcEntries.slice(0, 10),
    assumedRounds: 32
  };

  // ── Phase 3: Key extraction via PROP_GET ──
  const firstDeltaIdx = deltaOps[0].index;
  const endDeltaIdx = deltaOps.length >= 32
    ? deltaOps[31].index
    : deltaOps[deltaOps.length - 1].index;
  const windowStart = Math.max(0, firstDeltaIdx - 50);
  const windowEnd = Math.min(ops.length, endDeltaIdx + 50);

  const keyAccesses = { 0: [], 1: [], 2: [], 3: [] };
  const allPropGetsInWindow = [];
  for (let idx = windowStart; idx < windowEnd; idx++) {
    const op = ops[idx];
    if (op.mn === 'PROP_GET') {
      allPropGetsInWindow.push({
        index: idx,
        pc: op.pc,
        keyVal: op.keyVal,
        elemVal: op.elemVal,
        elemValHex: typeof op.elemVal === 'number' ? '0x' + (op.elemVal >>> 0).toString(16).toUpperCase() : null,
        dst: op.dst
      });
      if (typeof op.keyVal === 'number' && op.keyVal >= 0 && op.keyVal <= 3 &&
          typeof op.elemVal === 'number') {
        keyAccesses[op.keyVal].push(op.elemVal);
      }
    }
  }

  let keyValues = null;
  const hasAll4 = keyAccesses[0].length > 0 && keyAccesses[1].length > 0 &&
                  keyAccesses[2].length > 0 && keyAccesses[3].length > 0;

  if (hasAll4) {
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
        if (count > bestCount) { bestCount = count; bestVal = parseInt(vStr, 10); }
      }
      keyValues.push(bestVal >>> 0);
    }
  }

  diag.phases.phase3_key = {
    windowRange: { start: windowStart, end: windowEnd, size: windowEnd - windowStart },
    firstDeltaIdx,
    endDeltaIdx,
    propGetCount: allPropGetsInWindow.length,
    propGetsFirst20: allPropGetsInWindow.slice(0, 20),
    keyAccessCounts: {
      0: keyAccesses[0].length,
      1: keyAccesses[1].length,
      2: keyAccesses[2].length,
      3: keyAccesses[3].length,
    },
    keyValues: keyValues ? keyValues.map(k => ({
      decimal: k,
      hex: '0x' + k.toString(16).toUpperCase(),
      signed: (k | 0)
    })) : null,
    hasAll4
  };

  if (!keyValues) {
    diag.phases.phase3_key.error = 'Could not extract all 4 key values';
    return diag;
  }

  // ── Phase 4: KeyMod extraction -- THE DIAGNOSTIC FOCUS ──
  // Collect ALL ADD_K ops in the window, without filtering
  const allAddKInWindow = [];
  const allSubKInWindow = [];
  const allArithInWindow = [];

  for (let idx = windowStart; idx < windowEnd; idx++) {
    const op = ops[idx];
    if (op.mn === 'ADD_K') {
      const entry = {
        index: idx,
        pc: op.pc,
        mn: op.mn,
        dst: op.dst,
        k: op.k,
        kUnsigned: op.k !== undefined ? (op.k >>> 0) : null,
        kHex: op.k !== undefined ? '0x' + (op.k >>> 0).toString(16).toUpperCase() : null,
        srcVal0: op.srcVal ? op.srcVal[0] : null,
        srcVal0Unsigned: op.srcVal && op.srcVal[0] !== null ? (op.srcVal[0] >>> 0) : null,
        srcVal0Hex: op.srcVal && typeof op.srcVal[0] === 'number'
          ? '0x' + (op.srcVal[0] >>> 0).toString(16).toUpperCase() : null,
        srcVal1: op.srcVal ? op.srcVal[1] : null,
      };

      // Check which key value srcVal[0] matches
      entry.matchesKey = [];
      for (let ki = 0; ki < 4; ki++) {
        if (op.srcVal && (op.srcVal[0] >>> 0) === keyValues[ki]) {
          entry.matchesKey.push(ki);
        }
        // Also check signed comparison
        if (op.srcVal && (op.srcVal[0] | 0) === (keyValues[ki] | 0)) {
          if (!entry.matchesKey.includes(ki)) {
            entry.matchesKey.push(`${ki}(signed)`);
          }
        }
      }

      // Check if srcVal[0] matches key[i] + something (partial match)
      entry.keyDiffs = {};
      if (op.srcVal && typeof op.srcVal[0] === 'number') {
        for (let ki = 0; ki < 4; ki++) {
          const diff = (op.srcVal[0] >>> 0) - keyValues[ki];
          if (diff !== 0 && Math.abs(diff) < 100000000) {
            entry.keyDiffs[`key${ki}`] = diff;
          }
        }
      }

      // Why would the current filter exclude this?
      entry.filterReasons = [];
      if (op.k === undefined) entry.filterReasons.push('k_undefined');
      if ((op.k >>> 0) === DELTA_UNSIGNED) entry.filterReasons.push('k_is_delta');
      if (op.k <= 0) entry.filterReasons.push('k_le_0');
      if (op.k >= 10000000) entry.filterReasons.push('k_ge_10M');
      if (!op.srcVal || op.srcVal[0] === null || op.srcVal[0] === undefined) {
        entry.filterReasons.push('srcVal_null');
      }

      allAddKInWindow.push(entry);
    }

    if (op.mn === 'SUB_K') {
      allSubKInWindow.push({
        index: idx,
        pc: op.pc,
        mn: op.mn,
        dst: op.dst,
        k: op.k,
        kUnsigned: op.k !== undefined ? (op.k >>> 0) : null,
        srcVal0: op.srcVal ? op.srcVal[0] : null,
        srcVal0Unsigned: op.srcVal && op.srcVal[0] !== null ? (op.srcVal[0] >>> 0) : null,
        matchesKey: [],
        keyDiffs: {}
      });
      const entry = allSubKInWindow[allSubKInWindow.length - 1];
      if (op.srcVal) {
        for (let ki = 0; ki < 4; ki++) {
          if ((op.srcVal[0] >>> 0) === keyValues[ki]) {
            entry.matchesKey.push(ki);
          }
        }
        if (typeof op.srcVal[0] === 'number') {
          for (let ki = 0; ki < 4; ki++) {
            const diff = (op.srcVal[0] >>> 0) - keyValues[ki];
            if (diff !== 0 && Math.abs(diff) < 100000000) {
              entry.keyDiffs[`key${ki}`] = diff;
            }
          }
        }
      }
    }

    // Also collect ADD (register-register) ops that might carry keyMods
    if (op.mn === 'ADD' && op.srcVal) {
      const entry = {
        index: idx,
        pc: op.pc,
        mn: 'ADD',
        dst: op.dst,
        srcVal0: op.srcVal[0],
        srcVal0Unsigned: (op.srcVal[0] >>> 0),
        srcVal1: op.srcVal[1],
        srcVal1Unsigned: (op.srcVal[1] >>> 0),
        matchesKey0: [],
        matchesKey1: [],
      };
      for (let ki = 0; ki < 4; ki++) {
        if ((op.srcVal[0] >>> 0) === keyValues[ki]) entry.matchesKey0.push(ki);
        if ((op.srcVal[1] >>> 0) === keyValues[ki]) entry.matchesKey1.push(ki);
      }
      // Only include if one side matches a key value
      if (entry.matchesKey0.length > 0 || entry.matchesKey1.length > 0) {
        allArithInWindow.push(entry);
      }
    }
  }

  // Now run the ACTUAL filter logic to see what passes
  const keyModCandidates = [[], [], [], []];
  for (const entry of allAddKInWindow) {
    if (entry.k === undefined) continue;
    const k = entry.k;
    if ((k >>> 0) === DELTA_UNSIGNED || k <= 0 || k >= 10000000) continue;
    if (entry.srcVal0 === null || entry.srcVal0 === undefined) continue;
    for (let ki = 0; ki < 4; ki++) {
      if ((entry.srcVal0 >>> 0) === keyValues[ki]) {
        keyModCandidates[ki].push(k);
      }
    }
  }

  // Relaxed filter: remove the k <= 0 and k >= 10000000 constraints
  const keyModCandidatesRelaxed = [[], [], [], []];
  for (const entry of allAddKInWindow) {
    if (entry.k === undefined) continue;
    const k = entry.k;
    if ((k >>> 0) === DELTA_UNSIGNED) continue;
    if (entry.srcVal0 === null || entry.srcVal0 === undefined) continue;
    for (let ki = 0; ki < 4; ki++) {
      if ((entry.srcVal0 >>> 0) === keyValues[ki]) {
        keyModCandidatesRelaxed[ki].push(k);
      }
    }
  }

  // Wider window: extend to firstDeltaIdx - 200 and endDeltaIdx + 200
  const wideWindowStart = Math.max(0, firstDeltaIdx - 200);
  const wideWindowEnd = Math.min(ops.length, endDeltaIdx + 200);
  const wideAddKOps = [];
  for (let idx = wideWindowStart; idx < wideWindowEnd; idx++) {
    const op = ops[idx];
    if (op.mn !== 'ADD_K' || op.k === undefined) continue;
    const srcVal = op.srcVal ? op.srcVal[0] : null;
    if (srcVal === null || srcVal === undefined) continue;
    for (let ki = 0; ki < 4; ki++) {
      if ((srcVal >>> 0) === keyValues[ki]) {
        const k = op.k;
        if ((k >>> 0) !== DELTA_UNSIGNED && k !== 0) {
          wideAddKOps.push({
            index: idx,
            pc: op.pc,
            k: k,
            kUnsigned: k >>> 0,
            matchedKeyIdx: ki,
            inOrigWindow: idx >= windowStart && idx < windowEnd,
          });
        }
      }
    }
  }

  // Check if srcVal[0] ever matches key AFTER modification (key + mod)
  // i.e., the trace captured the value after the key was already modified
  const srcValMatchesModifiedKey = [];
  for (const entry of allAddKInWindow) {
    if (entry.srcVal0 === null) continue;
    const sv = entry.srcVal0 >>> 0;
    for (let ki = 0; ki < 4; ki++) {
      for (const otherEntry of allAddKInWindow) {
        if (otherEntry.matchesKey.includes(ki) && otherEntry.k > 0 && otherEntry.k < 10000000) {
          const modifiedKey = (keyValues[ki] + otherEntry.k) >>> 0;
          if (sv === modifiedKey && entry !== otherEntry) {
            srcValMatchesModifiedKey.push({
              addKIndex: entry.index,
              addKpc: entry.pc,
              addK_k: entry.k,
              matchedKeyIdx: ki,
              modValue: otherEntry.k,
              modifiedKeyValue: modifiedKey
            });
          }
        }
      }
    }
  }

  diag.phases.phase4_keymods = {
    addKOpsInWindow: allAddKInWindow.length,
    subKOpsInWindow: allSubKInWindow.length,
    addRROpsMatchingKey: allArithInWindow.length,

    // All ADD_K ops (unfiltered)
    allAddKOps: allAddKInWindow,
    allSubKOps: allSubKInWindow.length > 0 ? allSubKInWindow : 'none',
    addRROpsMatchingKey_detail: allArithInWindow.length > 0 ? allArithInWindow : 'none',

    // Filter results
    currentFilterResult: keyModCandidates.map((arr, i) => ({
      keyIdx: i,
      candidates: arr,
      count: arr.length
    })),
    relaxedFilterResult: keyModCandidatesRelaxed.map((arr, i) => ({
      keyIdx: i,
      candidates: arr,
      count: arr.length
    })),

    // Wider window results
    wideWindowRange: { start: wideWindowStart, end: wideWindowEnd },
    wideWindowAddKMatchingKey: wideAddKOps,

    // Did srcVal already have the modification applied?
    srcValMatchesModifiedKey: srcValMatchesModifiedKey.length > 0 ? srcValMatchesModifiedKey : 'none',
  };

  // ── Summary ──
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

  diag.extractedKeyMods = keyModCandidates.map(pickMostCommon);
  diag.extractedKeyModsRelaxed = keyModCandidatesRelaxed.map(pickMostCommon);

  return diag;
}

// ---------------------------------------------------------------------------
// Run pipeline on a single target
// ---------------------------------------------------------------------------

async function analyzeSingleTarget(targetPath, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Analyzing: ${label} (${targetPath})`);
  console.log('='.repeat(70));

  const source = fs.readFileSync(targetPath, 'utf-8');

  // Stage 1: Parse
  console.log('  Stage 1: Parsing VM...');
  const parsed = parseVmFunction(source);
  console.log(`    Variables: bytecode=${parsed.variables.bytecode}, pc=${parsed.variables.pc}, regs=${parsed.variables.regs}`);
  console.log(`    Case count: ${parsed.caseCount}`);

  // Stage 2: Map opcodes
  console.log('  Stage 2: Mapping opcodes...');
  const mapped = mapOpcodes(parsed, source);
  const mappedCount = Object.keys(mapped.opcodeTable).length;
  console.log(`    Mapped: ${mappedCount}/${parsed.caseCount}`);

  // Check which arith ops are available
  const lookups = buildOpcodeLookups(mapped.opcodeTable);
  const arithOps = Object.values(lookups.arithSet);
  console.log(`    Arith ops available: ${arithOps.join(', ')}`);

  // Stage 3: Collect trace
  console.log('  Stage 3: Collecting trace via Puppeteer...');
  const patchedSource = patchTdcSource(source, parsed.variables);
  const instrumentCode = buildInstrumentCode(lookups);
  const html = buildHTML(patchedSource, instrumentCode);

  let traceResult;
  try {
    traceResult = await collectTrace(html, 30000);
  } catch (err) {
    console.log(`    FAILED: ${err.message}`);
    return { label, error: err.message };
  }

  console.log(`    Ops collected: ${traceResult.opCount}`);
  console.log(`    Token: ${traceResult.token ? traceResult.token.substring(0, 40) + '...' : 'null'}`);
  if (traceResult.errors.length > 0) {
    console.log(`    Trace errors: ${traceResult.errors.length}`);
  }

  // Stage 4: Deep trace analysis
  console.log('  Stage 4: Deep trace analysis...');
  const diagResult = deepAnalyzeTrace(traceResult.ops, label);

  // Also run the standard analyzeTrace for comparison
  const standardResult = analyzeTrace(traceResult.ops);

  diagResult.standardResult = {
    key: standardResult.key,
    keyHex: standardResult.key ? standardResult.key.map(k => '0x' + (k >>> 0).toString(16).toUpperCase()) : null,
    delta: standardResult.delta,
    rounds: standardResult.rounds,
    keyMods: standardResult.keyMods,
    keyModConstants: standardResult.keyModConstants,
    notes: standardResult.notes
  };

  // Print summary
  console.log(`\n  ── Summary for ${label} ──`);
  console.log(`  Total ops: ${diagResult.totalOps}`);
  console.log(`  Delta ops: ${diagResult.phases.phase1_delta.totalDeltaOps}`);
  if (diagResult.phases.phase3_key) {
    console.log(`  Window: [${diagResult.phases.phase3_key.windowRange.start}, ${diagResult.phases.phase3_key.windowRange.end}] (${diagResult.phases.phase3_key.windowRange.size} ops)`);
    if (diagResult.phases.phase3_key.keyValues) {
      console.log(`  Key: [${diagResult.phases.phase3_key.keyValues.map(k => k.hex).join(', ')}]`);
    }
  }
  if (diagResult.phases.phase4_keymods) {
    const p4 = diagResult.phases.phase4_keymods;
    console.log(`  ADD_K in window: ${p4.addKOpsInWindow}`);
    console.log(`  SUB_K in window: ${p4.subKOpsInWindow}`);
    console.log(`  ADD(RR) matching key: ${p4.addRROpsMatchingKey}`);
    console.log(`  Current filter keyMods: [${diagResult.extractedKeyMods.join(', ')}]`);
    console.log(`  Relaxed filter keyMods: [${diagResult.extractedKeyModsRelaxed.join(', ')}]`);
    if (p4.wideWindowAddKMatchingKey.length > 0) {
      console.log(`  Wide window ADD_K matching key: ${p4.wideWindowAddKMatchingKey.length} ops`);
      for (const op of p4.wideWindowAddKMatchingKey) {
        console.log(`    idx=${op.index} pc=${op.pc} k=${op.k} keyIdx=${op.matchedKeyIdx} inOrigWindow=${op.inOrigWindow}`);
      }
    }
  }
  console.log(`  Standard analyzeTrace keyMods: [${standardResult.keyMods || 'null'}]`);
  console.log(`  Standard analyzeTrace notes: ${standardResult.notes}`);

  return diagResult;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const targets = [];

  if (args.length > 0) {
    for (const arg of args) {
      if (!arg.startsWith('--')) {
        targets.push({ path: path.resolve(arg), label: path.basename(arg) });
      }
    }
  }

  // Default targets if none specified
  if (targets.length === 0) {
    targets.push({
      path: path.join(ROOT, 'targets', 'tdc.js'),
      label: 'tdc.js (Template A, reference)'
    });
    targets.push({
      path: path.join(ROOT, 'targets', 'tdc-live-test.js'),
      label: 'tdc-live-test.js (Template B, known-good)'
    });
    targets.push({
      path: path.join(ROOT, 'targets', 'tdc-v2.js'),
      label: 'tdc-v2.js (Template B, original)'
    });
    targets.push({
      path: path.join(ROOT, 'targets', 'tdc-v5.js'),
      label: 'tdc-v5.js (Template C)'
    });
  }

  // Try to fetch a live tdc.js
  const diagPath = path.join(ROOT, 'targets', 'tdc-diag.js');
  console.log('Attempting to fetch live tdc.js from Tencent...');
  try {
    const liveSrc = await fetchLiveTdc();
    if (liveSrc && liveSrc.length > 10000) {
      fs.writeFileSync(diagPath, liveSrc);
      console.log(`  Saved live tdc.js to ${diagPath} (${liveSrc.length} bytes)`);
      // Extract TDC_NAME
      const nameMatch = liveSrc.match(/window\.TDC_NAME\s*=\s*"([^"]+)"/);
      if (nameMatch) console.log(`  TDC_NAME: ${nameMatch[1]}`);
      targets.push({ path: diagPath, label: 'tdc-diag.js (LIVE FETCH)' });
    } else {
      console.log('  Fetched content too small, skipping');
    }
  } catch (err) {
    console.log(`  Failed to fetch live tdc.js: ${err.message}`);
    console.log('  (This is expected due to TLS fingerprinting; continuing with saved targets)');
  }

  const results = {};
  for (const target of targets) {
    if (!fs.existsSync(target.path)) {
      console.log(`\nSkipping ${target.label}: file not found at ${target.path}`);
      continue;
    }
    try {
      results[target.label] = await analyzeSingleTarget(target.path, target.label);
    } catch (err) {
      console.log(`\nFATAL ERROR analyzing ${target.label}: ${err.message}`);
      results[target.label] = { label: target.label, error: err.message, stack: err.stack };
    }
  }

  // ── Cross-target comparison ──
  console.log('\n' + '='.repeat(70));
  console.log('CROSS-TARGET COMPARISON');
  console.log('='.repeat(70));

  for (const [label, diag] of Object.entries(results)) {
    if (diag.error) {
      console.log(`\n${label}: ERROR - ${diag.error}`);
      continue;
    }
    const p4 = diag.phases.phase4_keymods;
    if (!p4) {
      console.log(`\n${label}: No phase4 data (earlier phase failed)`);
      continue;
    }
    console.log(`\n${label}:`);
    console.log(`  Key: [${diag.phases.phase3_key.keyValues.map(k => k.hex).join(', ')}]`);
    console.log(`  Window size: ${diag.phases.phase3_key.windowRange.size}`);
    console.log(`  ADD_K total in window: ${p4.addKOpsInWindow}`);
    console.log(`  ADD_K with key match: ${p4.allAddKOps.filter(e => e.matchesKey.length > 0).length}`);
    console.log(`  Current keyMods: [${diag.extractedKeyMods.join(', ')}]`);
    console.log(`  Relaxed keyMods: [${diag.extractedKeyModsRelaxed.join(', ')}]`);

    // Show ADD_K ops that match key values
    const matchingOps = p4.allAddKOps.filter(e => e.matchesKey.length > 0);
    if (matchingOps.length > 0) {
      console.log('  ADD_K ops matching key:');
      for (const op of matchingOps.slice(0, 20)) {
        console.log(`    idx=${op.index} pc=${op.pc} k=${op.k} (0x${(op.k>>>0).toString(16)}) srcVal0=${op.srcVal0Hex} matches=[${op.matchesKey}] filter=[${op.filterReasons.join(',')}]`);
      }
    } else {
      console.log('  NO ADD_K ops match any key value!');
      // Show what srcVal[0] values ARE present to understand the gap
      const uniqueSrcVals = new Set();
      for (const op of p4.allAddKOps) {
        if (op.srcVal0 !== null) uniqueSrcVals.add(op.srcVal0Unsigned);
      }
      console.log(`  Unique srcVal[0] values in ADD_K (unsigned): ${[...uniqueSrcVals].slice(0, 20).map(v => '0x' + v.toString(16).toUpperCase()).join(', ')}`);
      console.log(`  Key values we are looking for: ${diag.phases.phase3_key.keyValues.map(k => k.hex).join(', ')}`);
    }

    // Show wider window results
    if (p4.wideWindowAddKMatchingKey.length > 0) {
      const outsideOrig = p4.wideWindowAddKMatchingKey.filter(o => !o.inOrigWindow);
      if (outsideOrig.length > 0) {
        console.log(`  ADD_K matching key OUTSIDE original window: ${outsideOrig.length} ops`);
        for (const op of outsideOrig.slice(0, 10)) {
          console.log(`    idx=${op.index} pc=${op.pc} k=${op.k} keyIdx=${op.matchedKeyIdx}`);
        }
      }
    }
  }

  // Save results
  const outputPath = path.join(ROOT, 'output', 'keymods-diagnostic.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2) + '\n');
  console.log(`\nFull diagnostic data saved to ${outputPath}`);
}

main().catch(err => {
  console.error(`Fatal: ${err.message}`);
  console.error(err.stack);
  process.exit(1);
});
