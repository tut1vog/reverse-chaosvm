'use strict';

/**
 * Decoder verification test
 *
 * Extracts the original decoder from tdc.js, runs it on both bytecode payloads,
 * then compares against our decoder's output.
 */

const fs = require('fs');
const path = require('path');
const { decode, base64Decode } = require('../decompiler/decoder');

// --- Extract bytecode strings from tdc.js ---

const tdcSource = fs.readFileSync(path.join(__dirname, '..', 'targets', 'tdc.js'), 'utf8');

// Payload 1: config blob on line 123
const configMatch = tdcSource.match(/window\.FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk\s*=\s*'([^']+)'/);
if (!configMatch) throw new Error('Could not extract config payload from tdc.js');
const configPayload = configMatch[1];

// Payload 2: main bytecode on line 586
// Structure: ;__TENCENT_CHAOS_VM("<base64>", false)(36578, [], window, [...], void 0)();
// The base64 string is very long (125K+ chars), so we extract by finding the quote boundaries.
const vmCallIdx = tdcSource.indexOf('__TENCENT_CHAOS_VM("');
if (vmCallIdx === -1) throw new Error('Could not find __TENCENT_CHAOS_VM call in tdc.js');
const payloadStart = vmCallIdx + 20; // after the opening quote
const payloadEnd = tdcSource.indexOf('"', payloadStart);
if (payloadEnd === -1) throw new Error('Could not find end of main payload in tdc.js');
const mainPayload = tdcSource.substring(payloadStart, payloadEnd);

// Also extract the invocation params for reference
const afterQuote = tdcSource.substring(payloadEnd, payloadEnd + 100);
console.log('Invocation tail:', afterQuote);

console.log('Config payload length:', configPayload.length, 'chars');
console.log('Main payload length:', mainPayload.length, 'chars');

// --- Build ground-truth decoder from tdc.js source ---

function buildOriginalDecoder() {
  // Replicate exactly from tdc.js lines 127-184
  function g(A, B, g) {
    var E = [], Y = 0;
    while (Y++ < B) { E.push(A += g); }
    return E;
  }

  var E = g(0, 43, 0).concat([62, 0, 62, 0, 63]).concat(g(51, 10, 1)).concat(g(0, 8, 0)).concat(g(0, 25, 1)).concat([0, 0, 0, 0, 63, 0]).concat(g(25, 26, 1));

  function Y(A) {
    var B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=".split("");
    var g = String(A).replace(/[=]+$/, ""), Y = g.length, S, J, m = 0, I = 0, o = [];
    for (; I < Y; I++) {
      J = E[g.charCodeAt(I)];
      ~J && (S = m % 4 ? 64 * S + J : J, m++ % 4) ? o.push(255 & S >> (-2 * m & 6)) : 0;
    }
    return o;
  }

  function S(A) {
    return A >> 1 ^ -(1 & A);
  }

  function J(A) {
    var B = [];
    var g = "undefined" != typeof Int8Array ? new Int8Array(Y(A)) : Y(A);
    var E = g.length;
    var J = 0;
    while (E > J) {
      var m = g[J++];
      var I = 127 & m;
      if (m >= 0) { B.push(S(I)); continue; }
      m = g[J++];
      I |= (127 & m) << 7;
      if (m >= 0) { B.push(S(I)); continue; }
      m = g[J++];
      I |= (127 & m) << 14;
      if (m >= 0) { B.push(S(I)); continue; }
      m = g[J++];
      I |= (127 & m) << 21;
      if (m >= 0) { B.push(S(I)); continue; }
      m = g[J++];
      I |= m << 28;
      B.push(S(I));
    }
    return B;
  }

  return { decode: J, base64Decode: Y };
}

const original = buildOriginalDecoder();

// --- Test helper ---

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', message);
  }
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// --- Test 1: Base64 decode ---

console.log('\n--- Test 1: Base64 decode (config payload) ---');
const origB64Config = original.base64Decode(configPayload);
const ourB64Config = base64Decode(configPayload);
assert(arraysEqual(origB64Config, ourB64Config),
  `Base64 decode mismatch on config payload (orig=${origB64Config.length}, ours=${ourB64Config.length})`);
console.log('Base64 decoded config:', ourB64Config.length, 'bytes');

console.log('\n--- Test 2: Base64 decode (main payload) ---');
const origB64Main = original.base64Decode(mainPayload);
const ourB64Main = base64Decode(mainPayload);
assert(arraysEqual(origB64Main, ourB64Main),
  `Base64 decode mismatch on main payload (orig=${origB64Main.length}, ours=${ourB64Main.length})`);
console.log('Base64 decoded main:', ourB64Main.length, 'bytes');

// --- Test 3: Full decode (config payload) ---

console.log('\n--- Test 3: Full decode (config payload) ---');
const origConfig = original.decode(configPayload);
const ourConfig = decode(configPayload);
console.log('Config decoded:', ourConfig.length, 'integers');
console.log('First 20 values:', ourConfig.slice(0, 20).join(', '));
assert(arraysEqual(origConfig, ourConfig),
  `Full decode mismatch on config payload (orig=${origConfig.length}, ours=${ourConfig.length})`);

// --- Test 4: Full decode (main payload) ---

console.log('\n--- Test 4: Full decode (main payload) ---');
const origMain = original.decode(mainPayload);
const ourMain = decode(mainPayload);
console.log('Main decoded:', ourMain.length, 'integers');
console.log('First 20 values:', ourMain.slice(0, 20).join(', '));
assert(arraysEqual(origMain, ourMain),
  `Full decode mismatch on main payload (orig=${origMain.length}, ours=${ourMain.length})`);

if (failed > 0) {
  // Find first mismatch for debugging
  for (const [name, orig, ours] of [['config', origConfig, ourConfig], ['main', origMain, ourMain]]) {
    for (let i = 0; i < Math.max(orig.length, ours.length); i++) {
      if (orig[i] !== ours[i]) {
        console.error(`First mismatch in ${name} at index ${i}: orig=${orig[i]}, ours=${ours[i]}`);
        break;
      }
    }
  }
}

// --- Test 5: ZigZag edge cases ---

console.log('\n--- Test 5: ZigZag edge cases ---');
const { zigzagDecode } = require('../decompiler/decoder');
assert(zigzagDecode(0) === 0, 'zigzag(0) should be 0');
assert(zigzagDecode(1) === -1, 'zigzag(1) should be -1');
assert(zigzagDecode(2) === 1, 'zigzag(2) should be 1');
assert(zigzagDecode(3) === -2, 'zigzag(3) should be -2');
assert(zigzagDecode(4) === 2, 'zigzag(4) should be 2');
// 32-bit boundary values (JS bitwise ops are 32-bit signed)
assert(zigzagDecode(4294967294) === -1, 'zigzag(0xFFFFFFFE) should be -1');
assert(zigzagDecode(4294967295) === 0, 'zigzag(0xFFFFFFFF) should be 0');

// --- Test 6: Bytecode sanity check ---

console.log('\n--- Test 6: Bytecode sanity check ---');
console.log('Main bytecode Y[0]:', ourMain[0], 'Y[1]:', ourMain[1]);
// startPC = 36578 means first opcode is at Y[36578 + 1] = Y[36579] via ++C
// Verify that value is a valid opcode (0-94)
const firstOpcode = ourMain[36579];
console.log('First opcode at Y[36579]:', firstOpcode);
assert(firstOpcode >= 0 && firstOpcode <= 94,
  `First opcode at entry point should be 0-94, got ${firstOpcode}`);

// --- Test 7: Output files are valid ---

console.log('\n--- Test 7: Output file validation ---');
const configJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', 'bytecode-config.json'), 'utf8'));
const mainJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', 'bytecode-main.json'), 'utf8'));
assert(Array.isArray(configJson), 'bytecode-config.json should be an array');
assert(Array.isArray(mainJson), 'bytecode-main.json should be an array');
assert(configJson.length === ourConfig.length, `config JSON length should match decode output (${configJson.length} vs ${ourConfig.length})`);
assert(mainJson.length === ourMain.length, `main JSON length should match decode output (${mainJson.length} vs ${ourMain.length})`);
assert(configJson.every(v => typeof v === 'number'), 'config JSON should contain only numbers');
assert(mainJson.every(v => typeof v === 'number'), 'main JSON should contain only numbers');

// --- Test 8: Empty input handling ---

console.log('\n--- Test 8: Edge cases ---');
const emptyResult = decode('');
assert(Array.isArray(emptyResult) && emptyResult.length === 0, 'decode("") should return empty array');

// --- Test 9: entry-point.json validation ---

console.log('\n--- Test 9: Entry point validation ---');
const epJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'output', 'entry-point.json'), 'utf8'));
assert(epJson.startPC === 36578, `startPC should be 36578, got ${epJson.startPC}`);
assert(epJson.startPC < ourMain.length, `startPC (${epJson.startPC}) should be within bytecode range (${ourMain.length})`);
// Verify constants match tdc.js source
assert(epJson.moduleRef[2] === 0x9e3779b9, `moduleRef[2] should be 0x9e3779b9 (${0x9e3779b9}), got ${epJson.moduleRef[2]}`);
assert(epJson.moduleRef[3] === 0x13c6ef3720, `moduleRef[3] should be 0x13c6ef3720 (${0x13c6ef3720}), got ${epJson.moduleRef[3]}`);
// void 0 is undefined, not null
assert(epJson.moduleRef[0] === null || epJson.moduleRef[0] === undefined,
  'moduleRef[0] represents void 0 (undefined) from tdc.js - stored as ' + epJson.moduleRef[0]);

// --- Summary ---

console.log('\n==============================');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log('All tests PASSED');
} else {
  console.log('Some tests FAILED');
  process.exit(1);
}

// --- Write decoded bytecodes to output for downstream use ---

const outputDir = path.join(__dirname, '..', 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(path.join(outputDir, 'bytecode-config.json'), JSON.stringify(ourConfig));
fs.writeFileSync(path.join(outputDir, 'bytecode-main.json'), JSON.stringify(ourMain));
console.log('\nWrote decoded bytecodes to output/bytecode-config.json and output/bytecode-main.json');
console.log('Main bytecode:', ourMain.length, 'integers');
console.log('Config bytecode:', ourConfig.length, 'integers');
