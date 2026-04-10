'use strict';

/**
 * chunk-tracer.js — Captures the exact input chunks passed to func_271
 * (the XTEA encryption function) for each btoa segment.
 *
 * Strategy: Hook into the VM at the func_271 entry point (PC 65361) and
 * capture r60 (args[0]) which is the plaintext chunk. Also captures the
 * hash metadata construction.
 *
 * Output: output/dynamic/chunk-trace.json
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TDC_PATH = path.join(PROJECT_ROOT, 'tdc.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'dynamic');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'chunk-trace.json');

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
<head><meta charset="utf-8"><title>Chunk Tracer</title></head>
<body>
<canvas id="c" width="200" height="50"></canvas>
<script>
// ── Environment Freezing ──
window.__CHUNK_TRACE = { chunks: [], cdString: null, sdString: null, hashData: null };

// Freeze Date
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

// Freeze Math.random
Math.random = () => ${FROZEN_RANDOM};

// Freeze performance.now
if (window.performance) performance.now = () => ${FROZEN_PERF_NOW};

// Freeze crypto.getRandomValues
if (window.crypto) {
  const origGetRandom = window.crypto.getRandomValues;
  window.crypto.getRandomValues = function(arr) {
    for (let i = 0; i < arr.length; i++) arr[i] = (i * 37 + 17) & 0xFF;
    return arr;
  };
}

// Hook btoa to capture inputs
const origBtoa = window.btoa;
window.__btoaInputs = [];
window.btoa = function(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i));
  window.__btoaInputs.push({
    length: s.length,
    bytes: bytes.slice(0, 32),
    fullBytes: bytes
  });
  return origBtoa.call(window, s);
};

// Hook JSON.stringify to capture sd data
const origStringify = JSON.stringify;
JSON.stringify = function(obj, ...rest) {
  const result = origStringify.call(JSON, obj, ...rest);
  if (obj && typeof obj === 'object' && 'sd' in obj) {
    window.__CHUNK_TRACE.sdStringifyInput = obj;
    window.__CHUNK_TRACE.sdStringifyOutput = result;
  }
  return result;
};

// Hook String.prototype.substr to capture sd stripping
const origSubstr = String.prototype.substr;
String.prototype.substr = function(start, length) {
  const result = origSubstr.call(this, start, length);
  if (start === 1 && this.indexOf('"sd"') >= 0 && this.startsWith('{')) {
    window.__CHUNK_TRACE.sdString = result;
  }
  return result;
};

// Global date hooks required by tdc.js
window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = () => new FakeDate();
window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = (a, b) => OrigDate[a].apply(OrigDate, b);
</script>
<script>
${tdcSourceRaw}
</script>
</body></html>`;
}

async function main() {
  const html = buildHTML();

  // HTTP server
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

    page.on('console', msg => {
      if (msg.text().startsWith('[CHUNK]')) {
        console.log(msg.text());
      }
    });

    await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => window.TDC && typeof window.TDC.getInfo === 'function',
      { timeout: 15000 }
    );
    // Let collectors finish
    await new Promise(r => setTimeout(r, 2000));

    // Now patch the VM to capture func_271 inputs
    // func_271 entry is at PC 65361. At entry, r60 = args[0] is the input chunk.
    // We hook by patching the bytecode at the start of func_271 to call our logger.
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        // Set up TDC
        TDC.setData({ appid: '2090803262', nonce: '0.12345678', token: 'test_token_123' });

        // We need to intercept the encrypt function calls.
        // Strategy: Hook String.prototype.slice since func_271's inner loop uses it heavily.
        // Better strategy: Hook at the btoa level and reverse-derive.
        // Actually, best strategy: capture the ChallengeEncrypt wrapper.

        // ChallengeEncrypt is set as window.ChallengeEncrypt = func_114
        // But internally func_212 calls func_114 through VM dispatch, not window.
        // However, we can patch the VM interpreter to intercept func_271 calls.

        // Alternative: We know func_271 takes a string input and produces btoa output.
        // The btoa calls are already hooked. But we need the PRE-encryption input.
        // Let's hook the convertBytesToWord equivalent (func_136) calls.

        // Simplest approach: wrap ChallengeEncrypt and trace its call sequence.
        // But ChallengeEncrypt is a thin wrapper around func_271.

        // Actually the SIMPLEST approach: call getData twice and capture btoa inputs.
        // The btoa inputs ARE the encrypted outputs. But we already have those.
        // What we need is the plaintext.

        // Let me try: hook into the vm's Y array (bytecode) to intercept func_271 entry.
        // We need access to the VM internals. The tdc.js creates the VM in a closure.

        // Better: use the String.fromCharCode hook to reconstruct the input.
        // Each 8-byte block goes through fromCharCode to create the slice.
        // Actually, the input r60 is already a string. We need to capture IT.

        // The most reliable way: proxy String.prototype.slice used in the inner loop.
        // func_271's inner loop does r60.slice(r37, r37+4) and r60.slice(r37+4, r37+8).
        // When we see slice(0, 4) on a long string, that's the start of a new chunk.

        const sliceInputs = [];
        let currentChunk = null;
        const chunks = [];
        const origSlice = String.prototype.slice;
        let captureActive = false;

        String.prototype.slice = function(start, end) {
          const result = origSlice.call(this, start, end);
          if (captureActive && typeof start === 'number' && typeof end === 'number'
              && (end - start) === 4 && this.length >= 8) {
            // Check if this is the start of a new chunk
            if (start === 0 && (currentChunk === null || currentChunk.str !== this)) {
              // New chunk detected
              if (currentChunk) {
                chunks.push({
                  length: currentChunk.str.length,
                  bytes: Array.from(currentChunk.str).map(c => c.charCodeAt(0)),
                  ascii: currentChunk.str.substring(0, 60)
                });
              }
              currentChunk = { str: this };
            }
          }
          return result;
        };

        captureActive = true;
        const token1 = TDC.getData();
        captureActive = false;

        // Push last chunk
        if (currentChunk) {
          chunks.push({
            length: currentChunk.str.length,
            bytes: Array.from(currentChunk.str).map(c => c.charCodeAt(0)),
            ascii: currentChunk.str.substring(0, 60)
          });
        }

        // Restore
        String.prototype.slice = origSlice;

        // Get btoa inputs
        const btoaInputs = window.__btoaInputs.map(b => ({
          length: b.length,
          bytes: b.bytes
        }));

        // Also capture the full token and btoa outputs
        const btoaOutputs = [];
        const origBtoa2 = window.btoa;
        // Already hooked, capture outputs from window.__btoaInputs

        resolve({
          token1Length: token1.length,
          token1: token1,
          chunks: chunks.map(c => ({
            length: c.length,
            bytes: c.bytes.slice(0, 48),
            ascii: c.ascii,
            fullHex: c.bytes.map(b => b.toString(16).padStart(2, '0')).join(' ')
          })),
          btoaInputs,
          sdString: window.__CHUNK_TRACE.sdString,
          sdStringifyOutput: window.__CHUNK_TRACE.sdStringifyOutput,
          // Capture the full payload by concatenating header + cd chunks
          headerChunkFull: chunks.length > 1 ? chunks[1].bytes.map(b => b.toString(16).padStart(2, '0')).join(' ') : null,
          cdChunkFull: chunks.length > 2 ? chunks[2].bytes.map(b => b.toString(16).padStart(2, '0')).join(' ') : null,
        });
      });
    });

    console.log('\nToken length:', result.token1Length);
    console.log('Chunks captured:', result.chunks.length);
    for (let i = 0; i < result.chunks.length; i++) {
      const c = result.chunks[i];
      console.log(`\nChunk ${i}: ${c.length} bytes`);
      console.log('  ASCII:', c.ascii);
      console.log('  First 32 hex:', c.bytes.slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' '));
    }

    console.log('\nbtoa calls:', result.btoaInputs.length);
    console.log('sdString:', result.sdString ? result.sdString.substring(0, 80) : null);

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
