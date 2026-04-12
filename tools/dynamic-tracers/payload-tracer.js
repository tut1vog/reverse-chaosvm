'use strict';

/**
 * payload-tracer.js — Captures the full payload structure BEFORE chunk splitting.
 *
 * Hooks into String.prototype methods and the VM to capture:
 * 1. The exact cdString built by func_276
 * 2. The exact sdString
 * 3. The full payload before encryption
 * 4. The 4 input chunks to func_271
 * 5. The hash metadata
 *
 * Output: output/dynamic/payload-trace.json
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TDC_PATH = path.join(PROJECT_ROOT, 'tdc.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'dynamic');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'payload-trace.json');

const FROZEN_TIMESTAMP = 1700000000000;
const FROZEN_RANDOM = 0.42;
const FROZEN_PERF_NOW = 100.5;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const tdcSourceRaw = fs.readFileSync(TDC_PATH, 'utf-8');

function buildHTML() {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Payload Tracer</title></head>
<body>
<canvas id="c" width="200" height="50"></canvas>
<script>
// ── Environment Freezing ──
const FROZEN_TS = ${FROZEN_TIMESTAMP};
const OrigDate = Date;
function FakeDate(...args) {
  if (args.length === 0) return new OrigDate(FROZEN_TS);
  return new OrigDate(...args);
}
FakeDate.now = () => FROZEN_TS;
FakeDate.parse = OrigDate.parse;
FakeDate.UTC = OrigDate.UTC;
FakeDate.prototype = OrigDate.prototype;
window.Date = FakeDate;
Math.random = () => ${FROZEN_RANDOM};
if (window.performance) performance.now = () => ${FROZEN_PERF_NOW};
if (window.crypto) {
  window.crypto.getRandomValues = function(arr) {
    for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 17) & 0xFF;
    return arr;
  };
}

window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = () => new FakeDate();
window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = (a, b) => OrigDate[a].apply(OrigDate, b);

// ── Tracing state ──
window.__PT = {
  cdStrings: [],      // cdStrings built by func_276
  sdStrings: [],      // sdStrings from substr
  encryptInputs: [],  // inputs to func_271
  btoaInputs: [],     // inputs to btoa
  btoaOutputs: [],    // outputs from btoa
  jsonStringifyCalls: [],
  substrCalls: [],
  sliceLongStrings: [] // slice calls on strings > 100 chars
};

// Hook btoa
const origBtoa = window.btoa;
window.btoa = function(s) {
  const bytes = [];
  for (let i = 0; i < Math.min(s.length, 48); i++) bytes.push(s.charCodeAt(i));
  const result = origBtoa.call(window, s);
  window.__PT.btoaInputs.push({ length: s.length, bytes });
  window.__PT.btoaOutputs.push({ length: result.length, value: result.substring(0, 80) });
  return result;
};

// Hook JSON.stringify
const origStringify = JSON.stringify;
JSON.stringify = function(obj, ...rest) {
  const result = origStringify.call(JSON, obj, ...rest);
  if (obj && typeof obj === 'object' && 'sd' in obj && !('cd' in obj)) {
    window.__PT.jsonStringifyCalls.push({
      hasSd: true,
      result: result,
      length: result.length
    });
  }
  return result;
};

// Hook String.prototype.substr to catch sdString construction
const origSubstr = String.prototype.substr;
String.prototype.substr = function(start, length) {
  const result = origSubstr.call(this, start, length);
  if (start === 1 && this.startsWith('{') && this.indexOf('"sd"') >= 0 && this.length < 200) {
    window.__PT.sdStrings.push({
      input: this,
      output: result,
      inputLength: this.length,
      outputLength: result.length
    });
  }
  return result;
};

// Hook String.prototype.slice to capture func_271 inputs
// func_271's inner loop does r60.slice(pos, pos+4). We can identify func_271 inputs
// by tracking slice calls on the same string object.
const origSlice = String.prototype.slice;
let captureSlice = false;
let currentSliceStr = null;
let sliceStrings = new Set();

String.prototype.slice = function(start, end) {
  const result = origSlice.call(this, start, end);
  if (captureSlice && typeof start === 'number' && start === 0 &&
      typeof end === 'number' && end === 4 && this.length >= 8 &&
      !sliceStrings.has(this)) {
    sliceStrings.add(this);
    const bytes = [];
    for (let i = 0; i < this.length; i++) bytes.push(this.charCodeAt(i));
    window.__PT.encryptInputs.push({
      length: this.length,
      bytes: bytes,
      ascii: this.substring(0, 80),
      hexFirst32: bytes.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' ')
    });
  }
  return result;
};

// Hook string concatenation patterns for cdString detection
// func_276 builds cdString with '{"cd":[' prefix
// We can detect it by hooking the replace calls that happen on the final token
</script>
<script>
${tdcSourceRaw}
</script>
</body></html>`;
}

async function main() {
  const html = buildHTML();

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`Server on http://127.0.0.1:${port}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.TDC && typeof window.TDC.getInfo === 'function',
      { timeout: 15000 }
    );
    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        TDC.setData({ appid: '2090803262', nonce: '0.12345678', token: 'test_token_123' });

        // Enable slice capture
        captureSlice = true;
        sliceStrings = new Set();

        const token1 = TDC.getData();
        captureSlice = false;

        // Sort encrypt inputs by length to identify the 4 chunks
        const inputs = window.__PT.encryptInputs.sort((a, b) => a.length - b.length);

        resolve({
          token: token1,
          tokenLength: token1.length,
          encryptInputs: inputs.map(inp => ({
            length: inp.length,
            ascii: inp.ascii,
            hexFirst32: inp.hexFirst32,
            // Include full bytes as hex string
            fullHex: inp.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
          })),
          btoaInputs: window.__PT.btoaInputs,
          btoaOutputs: window.__PT.btoaOutputs,
          sdStrings: window.__PT.sdStrings,
          jsonStringifyCalls: window.__PT.jsonStringifyCalls,
        });
      });
    });

    console.log('Token length:', result.tokenLength);
    console.log('\nEncrypt inputs:', result.encryptInputs.length);
    for (const inp of result.encryptInputs) {
      console.log(`  ${inp.length} bytes: ${inp.ascii.substring(0, 70)}`);
    }

    console.log('\nbtoa calls:', result.btoaInputs.length);
    for (const b of result.btoaInputs) {
      console.log(`  input=${b.length} bytes`);
    }

    console.log('\nSD strings:');
    for (const s of result.sdStrings) {
      console.log(`  input (${s.inputLength}): ${s.input}`);
      console.log(`  output (${s.outputLength}): ${s.output}`);
    }

    console.log('\nJSON.stringify calls with sd:');
    for (const c of result.jsonStringifyCalls) {
      console.log(`  result (${c.length}): ${c.result}`);
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2));
    console.log('\nOutput:', OUTPUT_PATH);

  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
