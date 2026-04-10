'use strict';

/**
 * Test suite for Task 1.3: String Extraction
 *
 * Validates the string extractor output against acceptance criteria
 * from docs/PROGRESS.md.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0;
let fail = 0;
let info = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ FAIL: ${name}`);
    console.log(`          ${e.message}`);
    fail++;
  }
}

function note(name, msg) {
  console.log(`  ℹ️  INFO: ${name}: ${msg}`);
  info++;
}

// --- Load data ---
const stringsPath = path.join(__dirname, '..', 'output', 'strings.json');
const disasmPath = path.join(__dirname, '..', 'output', 'disasm-full.txt');
const bytecodePath = path.join(__dirname, '..', 'output', 'bytecode-main.json');

const strings = JSON.parse(fs.readFileSync(stringsPath, 'utf8'));
const disasmLines = fs.readFileSync(disasmPath, 'utf8').split('\n').filter(l => l.length > 0);
const bytecode = JSON.parse(fs.readFileSync(bytecodePath, 'utf8'));

// Build a lookup: pc → string entry
const byPC = new Map();
for (const s of strings) {
  byPC.set(s.pc, s);
}

// =============================================
// Section 1: Module / Output Validity
// =============================================
console.log('\n=== Section 1: Module & Output Validity ===');

test('strings.json is valid JSON array', () => {
  assert(Array.isArray(strings), 'strings.json should be an array');
});

test('extractStrings is exported as a function', () => {
  const mod = require('../decompiler/string-extractor');
  assert(typeof mod.extractStrings === 'function', 'extractStrings should be a function');
});

test('extractStrings is a pure function (deterministic)', () => {
  const { extractStrings } = require('../decompiler/string-extractor');
  const r1 = extractStrings(disasmLines);
  const r2 = extractStrings(disasmLines);
  assert.strictEqual(r1.length, r2.length, 'Two calls should return same count');
  // Spot-check first 10 and last 10
  for (let i = 0; i < Math.min(10, r1.length); i++) {
    assert.strictEqual(r1[i].value, r2[i].value, `Mismatch at index ${i}`);
    assert.strictEqual(r1[i].pc, r2[i].pc, `PC mismatch at index ${i}`);
  }
  for (let i = Math.max(0, r1.length - 10); i < r1.length; i++) {
    assert.strictEqual(r1[i].value, r2[i].value, `Mismatch at index ${i}`);
  }
});

test('All entries have required fields (pc, register, value, endPC)', () => {
  for (let i = 0; i < strings.length; i++) {
    const s = strings[i];
    assert(typeof s.pc === 'number', `Entry ${i} missing numeric pc`);
    assert(typeof s.register === 'string', `Entry ${i} missing string register`);
    assert(typeof s.value === 'string', `Entry ${i} missing string value`);
    assert(typeof s.endPC === 'number', `Entry ${i} missing numeric endPC`);
    assert(s.endPC >= s.pc, `Entry ${i}: endPC (${s.endPC}) < pc (${s.pc})`);
  }
});

test('output/strings.txt exists and is non-empty', () => {
  const txtPath = path.join(__dirname, '..', 'output', 'strings.txt');
  const stat = fs.statSync(txtPath);
  assert(stat.size > 0, 'strings.txt should not be empty');
});

// =============================================
// Section 2: Known String Spot-Checks
// =============================================
console.log('\n=== Section 2: Known String Spot-Checks ===');

test('PC 36607: r17 = "exports" (endPC 36624)', () => {
  const s = byPC.get(36607);
  assert(s, 'No string entry at PC 36607');
  assert.strictEqual(s.register, 'r17');
  assert.strictEqual(s.value, 'exports');
  assert.strictEqual(s.endPC, 36624);
});

test('PC 36624: r12 = "get" (endPC 36634)', () => {
  const s = byPC.get(36624);
  assert(s, 'No string entry at PC 36624');
  assert.strictEqual(s.register, 'r12');
  assert.strictEqual(s.value, 'get');
  assert.strictEqual(s.endPC, 36634);
});

test('PC 36722: r20 = "radiusY" (endPC 36739)', () => {
  const s = byPC.get(36722);
  assert(s, 'No string entry at PC 36722');
  assert.strictEqual(s.register, 'r20');
  assert.strictEqual(s.value, 'radiusY');
  assert.strictEqual(s.endPC, 36739);
});

test('PC 36754: r15 = "Not supported" (starts with N from STR_INIT)', () => {
  const s = byPC.get(36754);
  assert(s, 'No string entry at PC 36754');
  assert.strictEqual(s.register, 'r15');
  assert.strictEqual(s.value, 'Not supported');
});

test('"sampleRate" found in output', () => {
  const found = strings.find(s => s.value === 'sampleRate');
  assert(found, '"sampleRate" not found');
});

test('"destination" found in output', () => {
  const found = strings.find(s => s.value === 'destination');
  assert(found, '"destination" not found');
});

test('"maxChannelCount" found in output', () => {
  const found = strings.find(s => s.value === 'maxChannelCount');
  assert(found, '"maxChannelCount" not found');
});

test('"fftSize" found in output', () => {
  const found = strings.find(s => s.value === 'fftSize');
  assert(found, '"fftSize" not found');
});

// =============================================
// Section 3: Total Count & Statistics
// =============================================
console.log('\n=== Section 3: Count & Statistics ===');

test('Total string count in range 800–2000', () => {
  assert(strings.length >= 800, `Too few: ${strings.length} < 800`);
  assert(strings.length <= 2000, `Too many: ${strings.length} > 2000`);
});

note('Total strings extracted', `${strings.length}`);

test('Zero empty strings in output', () => {
  const empties = strings.filter(s => s.value === '');
  assert.strictEqual(empties.length, 0, `Found ${empties.length} empty strings`);
});

test('Non-printable strings < 5%', () => {
  let nonPrintable = 0;
  for (const s of strings) {
    for (let i = 0; i < s.value.length; i++) {
      const code = s.value.charCodeAt(i);
      if (code < 9 || code > 126) {
        nonPrintable++;
        break;
      }
    }
  }
  const pct = (100 * nonPrintable / strings.length);
  assert(pct < 5, `Non-printable: ${nonPrintable}/${strings.length} = ${pct.toFixed(1)}% (>= 5%)`);
  note('Non-printable strings', `${nonPrintable} (${pct.toFixed(1)}%)`);
});

// =============================================
// Section 4: Cross-Reference with Bytecode
// =============================================
console.log('\n=== Section 4: Bytecode Cross-Reference ===');

// Parse disassembly to get raw operand data for string opcodes
// For each of 10 sampled strings, trace the char codes in the bytecode array

// Helper: Parse a disasm line to get PC + mnemonic + raw string operands
function parseDisasmLine(line) {
  const m = line.match(/^\[(\d+)\]\s+(\S+)(?:\s+(.*?))?\s*;/);
  if (!m) return null;
  const pc = parseInt(m[1], 10);
  const mnemonic = m[2];
  const opStr = (m[3] || '').trim();
  const operands = opStr ? opStr.split(/,\s*/) : [];
  return { pc, mnemonic, operands };
}

function regName(op) {
  // operand is already "r17" etc.
  return op.trim();
}

function immVal(op) {
  return parseInt(op.trim(), 10);
}

// Build a map: PC → parsed disasm instruction
const instrByPC = new Map();
for (const line of disasmLines) {
  const p = parseDisasmLine(line);
  if (p) instrByPC.set(p.pc, p);
}

// Sample 10 strings deterministically (every ~174th string)
const sampleIndices = [];
const step = Math.floor(strings.length / 10);
for (let i = 0; i < 10; i++) {
  sampleIndices.push(i * step);
}

let crossRefPass = 0;
let crossRefFail = 0;

for (const idx of sampleIndices) {
  const entry = strings[idx];
  const label = `Cross-ref #${idx}: PC ${entry.pc} "${entry.value.slice(0, 30)}"`;

  test(label, () => {
    // Walk the disassembly from entry.pc to entry.endPC
    // Collect all char codes that should have been appended
    const expectedChars = [];
    let found = false;

    for (const line of disasmLines) {
      const p = parseDisasmLine(line);
      if (!p) continue;
      if (p.pc < entry.pc) continue;
      if (p.pc > entry.endPC) break;

      const reg = entry.register;
      const ops = p.operands;

      switch (p.mnemonic) {
        case 'STR_INIT':
          // ops: R(a), R(b), K(char)
          if (regName(ops[1]) === reg) {
            expectedChars.push(String.fromCharCode(immVal(ops[2])));
          }
          break;

        case 'STR_APPEND':
          if (regName(ops[0]) === reg) {
            expectedChars.push(String.fromCharCode(immVal(ops[1])));
          }
          break;

        case 'STR_APPEND_2':
          // ops: R(a), K(c1), R(b), K(c2)
          if (regName(ops[0]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[1])));
          if (regName(ops[2]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[3])));
          break;

        case 'STR_OBJ_STR':
          // ops: R(a), K(char), R(obj), R(newStr)
          if (regName(ops[0]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[1])));
          break;

        case 'STR_PROP':
          // ops: R(a), K(char), R(dest), R(obj), R(key)
          if (regName(ops[0]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[1])));
          break;

        case 'STR_SET_STR':
          // ops: R(a), K(char), R(obj), K(prop), R(val), R(newStr)
          // The append goes to R(a) (old string), then R(newStr) starts empty.
          // If this PC is the entry.pc AND our reg == R(newStr), skip the append
          // because that 'e' belongs to the old string, not the new one.
          if (regName(ops[0]) === reg && !(p.pc === entry.pc && regName(ops[5]) === reg)) {
            expectedChars.push(String.fromCharCode(immVal(ops[1])));
          }
          break;

        case 'STR_SET_K':
          // ops: R(a), K(char), R(obj), K(prop), R(val)
          if (regName(ops[0]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[1])));
          break;

        case 'FUNC_CREATE_A':
          // ops: R(a), K(char), ...
          if (regName(ops[0]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[1])));
          break;

        case 'PROP_STR':
          // ops: R(dest), R(obj), R(prop), R(str), R(str'), K(char)
          if (regName(ops[4]) === reg) expectedChars.push(String.fromCharCode(immVal(ops[5])));
          break;
      }
    }

    const reconstructed = expectedChars.join('');
    assert.strictEqual(
      entry.value, reconstructed,
      `Value mismatch: got "${entry.value}" but cross-ref gives "${reconstructed}"`
    );
  });

  crossRefPass++;
}

// =============================================
// Section 5: Additional Validation
// =============================================
console.log('\n=== Section 5: Additional Validation ===');

test('All registers follow r<number> format', () => {
  for (const s of strings) {
    assert(/^r\d+$/.test(s.register), `Invalid register: "${s.register}" at PC ${s.pc}`);
  }
});

test('PCs are within bytecode bounds', () => {
  for (const s of strings) {
    assert(s.pc >= 0, `Negative PC: ${s.pc}`);
    assert(s.endPC < bytecode.length, `endPC ${s.endPC} >= bytecode length ${bytecode.length}`);
  }
});

test('No duplicate (pc, register) entries', () => {
  const seen = new Set();
  let dupes = 0;
  for (const s of strings) {
    const key = `${s.pc}:${s.register}`;
    if (seen.has(key)) dupes++;
    seen.add(key);
  }
  assert.strictEqual(dupes, 0, `Found ${dupes} duplicate (pc, register) entries`);
});

test('Common JS property names present', () => {
  const expected = ['window', 'document', 'prototype', 'toString', 'length', 'push', 'call'];
  const values = new Set(strings.map(s => s.value));
  const missing = expected.filter(e => !values.has(e));
  assert.strictEqual(missing.length, 0, `Missing common strings: ${missing.join(', ')}`);
});

test('strings.json matches extractStrings() live output', () => {
  const { extractStrings } = require('../decompiler/string-extractor');
  const live = extractStrings(disasmLines);
  assert.strictEqual(live.length, strings.length, `Count mismatch: live=${live.length} vs json=${strings.length}`);
  // Spot check first 20
  for (let i = 0; i < Math.min(20, live.length); i++) {
    assert.strictEqual(live[i].pc, strings[i].pc, `PC mismatch at ${i}`);
    assert.strictEqual(live[i].value, strings[i].value, `Value mismatch at ${i}`);
  }
});

// =============================================
// Summary
// =============================================
console.log('\n' + '='.repeat(50));
console.log(`RESULTS: ${pass} passed, ${fail} failed, ${info} info`);
console.log('='.repeat(50));

if (fail > 0) {
  console.log('\n❌ VERDICT: FAIL');
  process.exit(1);
} else {
  console.log('\n✅ VERDICT: PASS');
  process.exit(0);
}
