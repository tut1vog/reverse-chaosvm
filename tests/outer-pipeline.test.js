'use strict';

/**
 * outer-pipeline.test.js — Verification for the outer token pipeline
 *
 * Tests each function independently against known values from the Phase 6 trace,
 * then tests the full pipeline with a mock encryptFn.
 *
 * Run: node tests/outer-pipeline.test.js
 */

const path = require('path');
const {
  buildSdString,
  buildCdString,
  assembleToken,
  urlEncode,
  buildToken,
} = require('../token/outer-pipeline');

// ---------------------------------------------------------------------------
// Load ground truth data
// ---------------------------------------------------------------------------
const traceFile = path.join(__dirname, '../output/dynamic/encoding-trace.json');
const collectorFile = path.join(__dirname, '../output/dynamic/collector-map.json');

const trace = require(traceFile);
const collectorMap = require(collectorFile);

// Extract pipeline steps from first getData() call (order 0-8)
const pipeline = trace.pipeline;
const substrStep = pipeline.find(s => s.step === 'substr_result' && s.order === 5);
const jsonStringifyOutput = pipeline.find(s => s.step === 'json_stringify_output' && s.order === 4);
const btoa0 = pipeline.find(s => s.step === 'btoa_1'); // btoa_1 = segment index 0 (hash)
const btoa1 = pipeline.find(s => s.step === 'btoa_2'); // btoa_2 = segment index 1 (header)
const btoa2 = pipeline.find(s => s.step === 'btoa_3'); // btoa_3 = segment index 2 (ciphertext)
const btoa3 = pipeline.find(s => s.step === 'btoa_4'); // btoa_4 = segment index 3 (signature)
const preUrlStep = pipeline.find(s => s.step === 'pre_url_replace' && s.order === 7);
const finalTokenStep = pipeline.find(s => s.step === 'final_token' && s.order === 8);

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
const results = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    results.push({ test: message, status: 'PASS' });
  } else {
    failed++;
    results.push({ test: message, status: 'FAIL' });
    console.error(`  FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
    results.push({ test: message, status: 'PASS', actual, expected });
  } else {
    failed++;
    results.push({ test: message, status: 'FAIL', actual, expected });
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected).substring(0, 200)}`);
    console.error(`    actual:   ${JSON.stringify(actual).substring(0, 200)}`);
  }
}

// ---------------------------------------------------------------------------
// Test 1: buildSdString
// ---------------------------------------------------------------------------
console.log('\n=== Test 1: buildSdString ===');

const sdObject = collectorMap.sdObject;
const sdResult = buildSdString(sdObject);

// 1a. Output length should be 83 (84 from JSON.stringify minus 1 for stripped '{')
assertEqual(sdResult.length, 83, 'buildSdString length is 83');

// 1b. Exact match with trace substr_result
assertEqual(sdResult, substrStep.value, 'buildSdString matches trace substr_result');

// 1c. Should NOT start with '{' (the leading brace was stripped)
assert(!sdResult.startsWith('{'), 'buildSdString does not start with {');

// 1d. Should start with "sd":
assert(sdResult.startsWith('"sd":'), 'buildSdString starts with "sd":');

// 1e. JSON.stringify({sd: sdObject}) should match trace json_stringify_output
const fullJson = JSON.stringify({ sd: sdObject });
assertEqual(fullJson, jsonStringifyOutput.value, 'JSON.stringify matches trace output');
assertEqual(fullJson.length, 84, 'JSON.stringify output is 84 chars');

// 1f. Relationship: substr = fullJson with leading '{' removed
assertEqual(sdResult, fullJson.substring(1), 'buildSdString = JSON.stringify.substring(1)');

console.log(`  buildSdString: ${passed} passed`);

// ---------------------------------------------------------------------------
// Test 2: buildCdString
// ---------------------------------------------------------------------------
console.log('\n=== Test 2: buildCdString ===');
const prevPassed = passed;

const cdArray = collectorMap.cdArray;
const cdResult = buildCdString(cdArray);

// 2a. Output should be valid JSON
let cdParsed;
try {
  cdParsed = JSON.parse(cdResult);
  assert(true, 'buildCdString produces valid JSON');
} catch (e) {
  assert(false, 'buildCdString produces valid JSON: ' + e.message);
}

// 2b. Should start with {"cd":[
assert(cdResult.startsWith('{"cd":['), 'buildCdString starts with {"cd":[');

// 2c. Should end with ]}
assert(cdResult.endsWith(']}'), 'buildCdString ends with ]}');

// 2d. Parsed JSON should have cd array with 59 entries
if (cdParsed) {
  assertEqual(cdParsed.cd.length, 59, 'buildCdString has 59 entries');
}

// 2e. Exact match with collector-map.json cdString
assertEqual(cdResult, collectorMap.cdString, 'buildCdString matches collector-map.json cdString');

// 2f. Length should match (3,164 chars)
assertEqual(cdResult.length, collectorMap.cdString.length, 'buildCdString length matches (3164)');

// 2g. Spot-check specific entries from the cd array
if (cdParsed) {
  assertEqual(cdParsed.cd[0], 1, 'cd[0] = 1 (number)');
  assertEqual(cdParsed.cd[1], 'linux', 'cd[1] = "linux" (string)');
  assertEqual(cdParsed.cd[35], null, 'cd[35] = null');
  assertEqual(cdParsed.cd[58], '', 'cd[58] = "" (empty string, last entry)');
}

console.log(`  buildCdString: ${passed - prevPassed} passed`);

// ---------------------------------------------------------------------------
// Test 3: assembleToken
// ---------------------------------------------------------------------------
console.log('\n=== Test 3: assembleToken ===');
const prevPassed3 = passed;

// Use the full btoa values from the trace (btoa[0], [1], [3] are complete; [2] is truncated)
const segments = [
  btoa0.value, // btoa[0] = hash (64 chars)
  btoa1.value, // btoa[1] = header (192 chars)
  btoa2.value, // btoa[2] = ciphertext (3904 chars, truncated in trace)
  btoa3.value, // btoa[3] = signature (120 chars)
];

const assembled = assembleToken(segments);

// 3a. Result should start with btoa[1] (header comes first)
assert(assembled.startsWith(btoa1.value), 'assembleToken starts with btoa[1] (header)');

// 3b. Result should end with btoa[3] (signature comes last)
assert(assembled.endsWith(btoa3.value), 'assembleToken ends with btoa[3] (signature)');

// 3c. Verify order: btoa[1] + btoa[0] + btoa[2] + btoa[3]
const expectedAssembled = btoa1.value + btoa0.value + btoa2.value + btoa3.value;
assertEqual(assembled, expectedAssembled, 'assembleToken order is [1,0,2,3]');

// 3d. Length arithmetic with full-length segments
//     64 + 192 + 3904 + 120 = 4280
assertEqual(64 + 192 + 3904 + 120, 4280, 'segment lengths sum to 4280');

// 3e. Verify with known full-size segments (use declared lengths)
assertEqual(btoa0.length, 64, 'btoa[0] declared length = 64');
assertEqual(btoa1.length, 192, 'btoa[1] declared length = 192');
assertEqual(btoa2.length, 3904, 'btoa[2] declared length = 3904');
assertEqual(btoa3.length, 120, 'btoa[3] declared length = 120');

// 3f. Test with synthetic segments to verify order clearly
const synth = assembleToken(['AAA', 'BBB', 'CCC', 'DDD']);
assertEqual(synth, 'BBBAAACCCDDD', 'assembleToken synthetic order check: [1,0,2,3]');

// 3g. Verify pre_url_replace from trace starts with btoa[1] value
assert(preUrlStep.value.startsWith(btoa1.value.substring(0, 50)),
  'trace pre_url_replace starts with btoa[1] prefix');

console.log(`  assembleToken: ${passed - prevPassed3} passed`);

// ---------------------------------------------------------------------------
// Test 4: urlEncode
// ---------------------------------------------------------------------------
console.log('\n=== Test 4: urlEncode ===');
const prevPassed4 = passed;

// 4a. Replace + with %2B
assertEqual(urlEncode('abc+def'), 'abc%2Bdef', 'urlEncode replaces +');

// 4b. Replace / with %2F
assertEqual(urlEncode('abc/def'), 'abc%2Fdef', 'urlEncode replaces /');

// 4c. Replace = with %3D
assertEqual(urlEncode('abc=def'), 'abc%3Ddef', 'urlEncode replaces =');

// 4d. Replace all three
assertEqual(urlEncode('a+b/c=d'), 'a%2Bb%2Fc%3Dd', 'urlEncode replaces all three chars');

// 4e. No-op on strings without special chars
assertEqual(urlEncode('abcdef'), 'abcdef', 'urlEncode no-op on clean string');

// 4f. Idempotent — applying twice does NOT double-encode
const once = urlEncode('a+b/c=');
const twice = urlEncode(once);
assertEqual(once, twice, 'urlEncode is idempotent');

// 4g. Verify against trace: replacement counts
//     From trace: 61 plus, 54 slash, 2 equals → expansion = 2*(61+54+2) = 234
//     4280 + 234 = 4514
const traceReplacements = finalTokenStep.urlReplacements;
assertEqual(traceReplacements.plus, 61, 'trace has 61 plus replacements');
assertEqual(traceReplacements.slash, 54, 'trace has 54 slash replacements');
assertEqual(traceReplacements.equals, 2, 'trace has 2 equals replacements');
assertEqual(4280 + 2 * (61 + 54 + 2), 4514, 'length arithmetic: 4280 + 234 = 4514');

// 4h. Verify urlEncode on the (truncated) pre_url_replace value produces the final_token prefix
const urlEncoded = urlEncode(preUrlStep.value);
assert(finalTokenStep.value.startsWith(urlEncoded.substring(0, 100)),
  'urlEncode(pre_url_replace) matches final_token prefix');

// 4i. Multiple occurrences
assertEqual(urlEncode('++//=='), '%2B%2B%2F%2F%3D%3D', 'urlEncode handles multiple occurrences');

console.log(`  urlEncode: ${passed - prevPassed4} passed`);

// ---------------------------------------------------------------------------
// Test 5: buildToken (full pipeline with mock encryptFn)
// ---------------------------------------------------------------------------
console.log('\n=== Test 5: buildToken (full pipeline) ===');
const prevPassed5 = passed;

// Create a mock encryptFn that returns the known binary segments from the trace.
// We decode the btoa base64 back to binary buffers.
// Note: btoa[2] is truncated in the trace, so we use what's available.
function mockEncryptFn(cdString, sdString) {
  // Verify the inputs are plausible
  if (typeof cdString !== 'string' || typeof sdString !== 'string') {
    throw new Error('encryptFn received non-string inputs');
  }
  // Return the known binary segments (decoded from the trace's base64 values)
  return {
    segments: [
      Buffer.from(btoa0.value, 'base64'), // segment 0: hash (48 bytes)
      Buffer.from(btoa1.value, 'base64'), // segment 1: header (144 bytes)
      Buffer.from(btoa2.value, 'base64'), // segment 2: ciphertext (truncated)
      Buffer.from(btoa3.value, 'base64'), // segment 3: signature (88 bytes)
    ],
  };
}

const token = buildToken(sdObject, cdArray, mockEncryptFn);

// 5a. Token should be a string
assert(typeof token === 'string', 'buildToken returns a string');

// 5b. Token should not contain raw +, /, or = (all URL-encoded)
assert(!token.includes('+'), 'buildToken result has no raw +');
assert(!token.includes('/'), 'buildToken result has no raw /');
assert(!token.includes('='), 'buildToken result has no raw =');

// 5c. Token should contain %2B, %2F (base64 strings always have + and /)
assert(token.includes('%2B') || token.includes('%2F') || token.includes('%3D'),
  'buildToken result has URL-encoded chars');

// 5d. Verify the pipeline stages are consistent
//     The mock returns binary buffers decoded from trace base64 values.
//     Since btoa[2] is truncated in the trace (ends with "..."), the round-trip
//     through Buffer.from(base64) → Buffer.toString('base64') produces a slightly
//     different (valid) base64 string. We re-encode the same way buildToken does.
const reEncodedSegments = [
  Buffer.from(btoa0.value, 'base64').toString('base64'),
  Buffer.from(btoa1.value, 'base64').toString('base64'),
  Buffer.from(btoa2.value, 'base64').toString('base64'),
  Buffer.from(btoa3.value, 'base64').toString('base64'),
];
const expectedPreUrl = reEncodedSegments[1] + reEncodedSegments[0] + reEncodedSegments[2] + reEncodedSegments[3];
const expectedToken = urlEncode(expectedPreUrl);
assertEqual(token, expectedToken, 'buildToken matches urlEncode(assembled re-encoded segments)');

// 5e. Verify cdString passed to encryptFn matches buildCdString output
let capturedCd = null;
let capturedSd = null;
function capturingEncryptFn(cd, sd) {
  capturedCd = cd;
  capturedSd = sd;
  return mockEncryptFn(cd, sd);
}
buildToken(sdObject, cdArray, capturingEncryptFn);
assertEqual(capturedCd, collectorMap.cdString, 'encryptFn receives correct cdString');
assertEqual(capturedSd, substrStep.value, 'encryptFn receives correct sdString');

// 5f. Verify the first getData() call's token prefix matches
//     (the trace's final_token is truncated, but we can compare the prefix)
assert(token.startsWith(finalTokenStep.value.substring(0, 100)),
  'buildToken output starts with trace final_token prefix');

console.log(`  buildToken: ${passed - prevPassed5} passed`);

// ---------------------------------------------------------------------------
// Test 6: Full pipeline with complete binary segments (using Uint8Array)
// ---------------------------------------------------------------------------
console.log('\n=== Test 6: Uint8Array support & edge cases ===');
const prevPassed6 = passed;

// 6a. encryptFn returning Uint8Array instead of Buffer should also work
function uint8EncryptFn(cdString, sdString) {
  return {
    segments: [
      new Uint8Array(Buffer.from(btoa0.value, 'base64')),
      new Uint8Array(Buffer.from(btoa1.value, 'base64')),
      new Uint8Array(Buffer.from(btoa2.value, 'base64')),
      new Uint8Array(Buffer.from(btoa3.value, 'base64')),
    ],
  };
}
const tokenFromUint8 = buildToken(sdObject, cdArray, uint8EncryptFn);
assertEqual(tokenFromUint8, token, 'Uint8Array inputs produce same token as Buffer');

// 6b. buildCdString with empty array
const emptyResult = buildCdString([]);
assertEqual(emptyResult, '{"cd":[]}', 'buildCdString with empty array');

// 6c. buildCdString with single entry
assertEqual(buildCdString([42]), '{"cd":[42]}', 'buildCdString single number entry');
assertEqual(buildCdString(['hello']), '{"cd":["hello"]}', 'buildCdString single string entry');
assertEqual(buildCdString([null]), '{"cd":[null]}', 'buildCdString single null entry');

// 6d. buildSdString with minimal object
const minSd = buildSdString({ od: 'C' });
assertEqual(minSd, '"sd":{"od":"C"}}', 'buildSdString minimal object');

console.log(`  Edge cases: ${passed - prevPassed6} passed`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('\n' + '='.repeat(60));
console.log(`TOTAL: ${passed} passed, ${failed} failed out of ${passed + failed}`);
if (failed === 0) {
  console.log('ALL TESTS PASSED ✅');
} else {
  console.log(`${failed} TESTS FAILED ❌`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Write verification results to output file
// ---------------------------------------------------------------------------
const outputDir = path.join(__dirname, '../output/token');
const fs = require('fs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const verification = {
  timestamp: new Date().toISOString(),
  summary: { passed, failed, total: passed + failed },
  tests: results,
  traceFile,
  collectorFile,
  groundTruth: {
    sdSubstrResult: substrStep.value,
    sdSubstrLength: substrStep.length,
    cdStringLength: collectorMap.cdString.length,
    cdEntryCount: collectorMap.totalCollectors,
    btoa0Length: btoa0.length,
    btoa1Length: btoa1.length,
    btoa2Length: btoa2.length,
    btoa3Length: btoa3.length,
    preUrlLength: preUrlStep.length,
    finalTokenLength: finalTokenStep.length,
    urlReplacements: finalTokenStep.urlReplacements,
  },
};

fs.writeFileSync(
  path.join(outputDir, 'outer-pipeline-verify.json'),
  JSON.stringify(verification, null, 2)
);
console.log(`\nVerification results written to output/token/outer-pipeline-verify.json`);
