'use strict';

/**
 * integration-verify.js — End-to-end verification of the token generation pipeline.
 *
 * Verifies:
 *   1. buildInputChunks produces chunks matching the trace data (byte-for-byte)
 *   2. encryptSegments produces btoa strings matching the trace (4/4 segments)
 *   3. Full pipeline produces the exact token from the trace (char-for-char)
 *   4. Each intermediate stage matches the corresponding trace data
 *
 * Uses payload-trace.json as ground truth (captured from tdc.js via payload-tracer.js).
 *
 * Output: output/token/integration-verify.json
 */

const fs = require('fs');
const path = require('path');

const { buildInputChunks, generateTokenFromStrings, HEADER_SIZE, HASH_SIZE } = require('./generate-token.js');
const { encryptSegments } = require('./crypto-core.js');
const { urlEncode } = require('./outer-pipeline.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TRACE_PATH = path.join(PROJECT_ROOT, 'output', 'dynamic', 'payload-trace.json');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'token');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'integration-verify.json');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ═══════════════════════════════════════════════════════════════════════
// Load trace data
// ═══════════════════════════════════════════════════════════════════════

const trace = JSON.parse(fs.readFileSync(TRACE_PATH, 'utf-8'));

function hexToStr(hexStr) {
  return Buffer.from(hexStr.split(' ').map(h => parseInt(h, 16))).toString('binary');
}

function strToHex(str, maxBytes) {
  const limit = maxBytes || str.length;
  const bytes = [];
  for (let i = 0; i < Math.min(str.length, limit); i++) {
    bytes.push(str.charCodeAt(i).toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

// Extract trace chunks
const traceInputs = trace.encryptInputs;
const traceHash = hexToStr(traceInputs.find(i => i.length === 48).fullHex);
const traceHeader = hexToStr(traceInputs.find(i => i.length === 144).fullHex);
const traceCd = hexToStr(traceInputs.find(i => i.length === 3024).fullHex);
const traceSig = hexToStr(traceInputs.find(i => i.length === 83).fullHex);

const FROZEN_TIMESTAMP = 1700000000000;

// ═══════════════════════════════════════════════════════════════════════
// Reconstruct cdString and sdString from trace data
// ═══════════════════════════════════════════════════════════════════════

// The payload body is cdString.slice(0, -1) + ','
// Reconstructed from: header (all 144 bytes) + cd content (without trailing spaces)
const cdTrimmed = traceCd.replace(/ +$/, '');
const payloadBody = traceHeader + cdTrimmed;
const cdString = payloadBody.slice(0, -1) + '}';
const sdString = traceSig;

console.log('=== Reconstructed input data ===');
console.log('cdString length:', cdString.length);
console.log('sdString length:', sdString.length);
console.log('cdString starts with:', JSON.stringify(cdString.substring(0, 40)));
console.log('cdString ends with:', JSON.stringify(cdString.slice(-20)));
console.log('sdString:', JSON.stringify(sdString.substring(0, 60)));

// ═══════════════════════════════════════════════════════════════════════
// Test 1: buildInputChunks produces correct chunks
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 1: buildInputChunks ===');

const chunks = buildInputChunks(cdString, sdString, FROZEN_TIMESTAMP);
const results = { tests: [], intermediates: {} };

// Compare each chunk
const chunkNames = ['hash', 'header', 'cdBody', 'sig'];
const traceChunks = [traceHash, traceHeader, traceCd, traceSig];
let allChunksMatch = true;

for (let i = 0; i < 4; i++) {
  const generated = chunks[i];
  const expected = traceChunks[i];
  const match = generated === expected;

  if (!match) {
    allChunksMatch = false;
    // Find first difference
    let firstDiff = -1;
    for (let j = 0; j < Math.max(generated.length, expected.length); j++) {
      if (generated.charCodeAt(j) !== expected.charCodeAt(j)) {
        firstDiff = j;
        break;
      }
    }
    console.log(`  ${chunkNames[i]} (${expected.length}B): MISMATCH at byte ${firstDiff}`);
    console.log(`    Generated length: ${generated.length}, Expected: ${expected.length}`);
    if (firstDiff >= 0) {
      console.log(`    At diff: gen=0x${(generated.charCodeAt(firstDiff)||0).toString(16)} exp=0x${(expected.charCodeAt(firstDiff)||0).toString(16)}`);
    }
  } else {
    console.log(`  ${chunkNames[i]} (${expected.length}B): ✓ MATCH`);
  }

  results.tests.push({
    name: `chunk_${chunkNames[i]}`,
    pass: match,
    generatedLength: generated.length,
    expectedLength: expected.length,
    hexFirst16: strToHex(generated, 16),
  });
}

results.intermediates.buildInputChunks = {
  pass: allChunksMatch,
  chunkSizes: chunks.map(c => c.length),
};

// ═══════════════════════════════════════════════════════════════════════
// Test 2: encryptSegments produces correct btoa strings
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 2: encryptSegments ===');

const btoaSegments = encryptSegments(chunks);
const traceBtoa = trace.btoaOutputs;
let allBtoaMatch = true;

for (let i = 0; i < 4; i++) {
  const generated = btoaSegments[i];
  const expected = traceBtoa[i];
  // Compare with trace (trace only has first 80 chars of value)
  const genPrefix = generated.substring(0, expected.value.length);
  const match = genPrefix === expected.value && generated.length === expected.length;

  if (!match) {
    allBtoaMatch = false;
    console.log(`  btoa[${i}]: MISMATCH (gen=${generated.length} exp=${expected.length})`);
    console.log(`    Generated: ${generated.substring(0, 60)}`);
    console.log(`    Expected:  ${expected.value.substring(0, 60)}`);
  } else {
    console.log(`  btoa[${i}] (${expected.length} chars): ✓ MATCH`);
  }

  results.tests.push({
    name: `btoa_segment_${i}`,
    pass: match,
    generatedLength: generated.length,
    expectedLength: expected.length,
  });
}

results.intermediates.encryptSegments = {
  pass: allBtoaMatch,
  segmentLengths: btoaSegments.map(s => s.length),
};

// ═══════════════════════════════════════════════════════════════════════
// Test 3: Full pipeline produces correct token
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 3: Full pipeline ===');

const generatedToken = generateTokenFromStrings(cdString, sdString, FROZEN_TIMESTAMP);
const traceToken = trace.token;
const tokenMatch = generatedToken === traceToken;

if (!tokenMatch) {
  let firstDiff = -1;
  for (let i = 0; i < Math.max(generatedToken.length, traceToken.length); i++) {
    if (generatedToken[i] !== traceToken[i]) {
      firstDiff = i;
      break;
    }
  }
  console.log(`  Token: MISMATCH at char ${firstDiff}`);
  console.log(`  Generated length: ${generatedToken.length}, Expected: ${traceToken.length}`);
  if (firstDiff >= 0) {
    console.log(`  At diff: gen='${generatedToken.substring(firstDiff, firstDiff+20)}' exp='${traceToken.substring(firstDiff, firstDiff+20)}'`);
  }
} else {
  console.log(`  Token (${traceToken.length} chars): ✓ EXACT MATCH`);
}

results.tests.push({
  name: 'full_pipeline_token',
  pass: tokenMatch,
  generatedLength: generatedToken.length,
  expectedLength: traceToken.length,
});

results.intermediates.fullPipeline = {
  pass: tokenMatch,
  tokenLength: generatedToken.length,
};

// ═══════════════════════════════════════════════════════════════════════
// Test 4: Assembly order verification
// ═══════════════════════════════════════════════════════════════════════

console.log('\n=== Test 4: Assembly order ===');

// Verify the assembled string structure
const assembled = btoaSegments[1] + btoaSegments[0] + btoaSegments[2] + btoaSegments[3];
const urlEncoded = urlEncode(assembled);

const assemblyMatch = urlEncoded === traceToken;
console.log(`  Assembly [1,0,2,3]: ${assemblyMatch ? '✓ CORRECT' : '✗ WRONG'}`);
console.log(`  Order: header(${btoaSegments[1].length}) + hash(${btoaSegments[0].length}) + cd(${btoaSegments[2].length}) + sig(${btoaSegments[3].length})`);

results.tests.push({
  name: 'assembly_order',
  pass: assemblyMatch,
  order: [1, 0, 2, 3],
  segmentSizes: btoaSegments.map(s => s.length),
});

// ═══════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════

const totalTests = results.tests.length;
const passedTests = results.tests.filter(t => t.pass).length;
const allPass = passedTests === totalTests;

console.log('\n=== Summary ===');
console.log(`Tests: ${passedTests}/${totalTests} passed`);
console.log(`Overall: ${allPass ? '✓ ALL PASS' : '✗ SOME FAILURES'}`);

results.summary = {
  totalTests,
  passedTests,
  allPass,
  tokenLength: generatedToken.length,
  chunkSizes: chunks.map(c => c.length),
  btoaSegmentLengths: btoaSegments.map(s => s.length),
};

// Store generated token for reference
results.generatedToken = generatedToken;
results.intermediates.cdString = {
  length: cdString.length,
  first40: cdString.substring(0, 40),
  last20: cdString.slice(-20),
};
results.intermediates.sdString = {
  length: sdString.length,
  value: sdString,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
console.log(`\nOutput: ${OUTPUT_PATH}`);
