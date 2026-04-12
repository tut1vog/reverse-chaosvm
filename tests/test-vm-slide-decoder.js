'use strict';

/**
 * Test suite for the vm-slide stack-VM decoder and disassembler (task 39.1).
 *
 * Pins the fixture shapes of:
 *   - output/vm-slide/dispatch-table.json
 *   - output/vm-slide/bytecode.json
 *   - output/vm-slide/disassembly.txt
 *
 * and exercises both CLIs end-to-end via execFileSync to lock in stdout/stderr
 * contracts and ensure re-running the tools reproduces the committed artifacts
 * byte-for-byte.
 *
 * Both research/vm-slide-stack-vm/{decoder,disassembler}.js call main() at
 * top-level, so we intentionally invoke them as subprocesses rather than via
 * require().
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output', 'vm-slide');
const DISPATCH_PATH = path.join(OUT_DIR, 'dispatch-table.json');
const BYTECODE_PATH = path.join(OUT_DIR, 'bytecode.json');
const DISASM_PATH = path.join(OUT_DIR, 'disassembly.txt');

const DECODER_CLI = path.join(ROOT, 'research', 'vm-slide-stack-vm', 'decoder.js');
const DISASM_CLI = path.join(ROOT, 'research', 'vm-slide-stack-vm', 'disassembler.js');
const VM_SLIDE_INPUT = path.join(ROOT, 'sample', 'vm_slide.js');

const XTEA_DELTA = 0x9E3779B9; // 2654435769
const EXPECTED_BYTECODE_LEN = 24273;
const EXPECTED_DISPATCH_LEN = 69;
const EXPECTED_NON_NULL = 53;
const EXPECTED_NULL = 16;
const EXPECTED_OPERAND_COUNTS = [0, 1, 2, 6];
const EXPECTED_INSTR_COUNT = 312;
const EXPECTED_HALT_PC = 512;
const EXPECTED_FIRST_10_LINES = [
  '00000  OP_40 3',
  '00002  OP_42 2',
  '00004  OP_06 1568',
  '00006  OP_00 40',
  '00008  OP_06 42',
  '00010  OP_02 42',
  '00012  OP_03',
  '00013  OP_42 4',
  '00015  OP_42 5',
  '00017  OP_06 289'
];

function loadDispatch() {
  return JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));
}

function loadBytecode() {
  return JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
}

function loadDisasmLines() {
  const text = fs.readFileSync(DISASM_PATH, 'utf8');
  // Split and drop the trailing empty element from the final newline.
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

describe('vm-slide dispatch-table shape', () => {
  it('has exactly 69 slots', () => {
    const d = loadDispatch();
    assert.equal(d.length, EXPECTED_DISPATCH_LEN);
  });

  it('has 53 non-null entries and 16 null holes', () => {
    const d = loadDispatch();
    const nonNull = d.filter((x) => x !== null).length;
    const nullCount = d.filter((x) => x === null).length;
    assert.equal(nonNull, EXPECTED_NON_NULL);
    assert.equal(nullCount, EXPECTED_NULL);
  });

  it('observes only operand counts [0, 1, 2, 6]', () => {
    const d = loadDispatch();
    const uniq = [...new Set(d.filter((x) => x !== null).map((e) => e.operandCount))].sort((a, b) => a - b);
    assert.deepEqual(uniq, EXPECTED_OPERAND_COUNTS);
  });

  it('slot 65 is a dispatch hole and slot 64 has operandCount 1', () => {
    const d = loadDispatch();
    assert.equal(d[65], null);
    assert.ok(d[64], 'slot 64 should not be null');
    assert.equal(d[64].operandCount, 1);
  });

  it('opcode 0 has operandCount 1', () => {
    const d = loadDispatch();
    assert.ok(d[0], 'slot 0 should not be null');
    assert.equal(d[0].operandCount, 1);
  });

  it('every non-null entry has opcode/operandCount/source and source starts with "function"', () => {
    const d = loadDispatch();
    for (let i = 0; i < d.length; i++) {
      const e = d[i];
      if (e === null) continue;
      assert.ok('opcode' in e, `slot ${i} missing opcode`);
      assert.ok('operandCount' in e, `slot ${i} missing operandCount`);
      assert.ok('source' in e, `slot ${i} missing source`);
      assert.equal(e.opcode, i, `slot ${i} opcode mismatch`);
      assert.equal(typeof e.source, 'string');
      assert.ok(e.source.length > 0, `slot ${i} source empty`);
      assert.ok(e.source.startsWith('function'), `slot ${i} source does not start with "function"`);
    }
  });
});

describe('vm-slide bytecode shape', () => {
  it(`length is ${EXPECTED_BYTECODE_LEN}`, () => {
    const b = loadBytecode();
    assert.equal(b.length, EXPECTED_BYTECODE_LEN);
  });

  it('contains XTEA delta 0x9E3779B9 exactly twice', () => {
    const b = loadBytecode();
    const hits = b.filter((x) => x === XTEA_DELTA).length;
    assert.equal(hits, 2);
  });

  it('contains at least one 0.5 literal', () => {
    const b = loadBytecode();
    assert.ok(b.includes(0.5), 'expected 0.5 to appear in bytecode');
  });

  it('contains no string elements', () => {
    const b = loadBytecode();
    for (let i = 0; i < b.length; i++) {
      assert.notEqual(typeof b[i], 'string', `index ${i} is a string: ${b[i]}`);
    }
  });
});

describe('vm-slide disassembly pins', () => {
  it('first 10 lines match the golden listing', () => {
    const lines = loadDisasmLines();
    assert.deepEqual(lines.slice(0, 10), EXPECTED_FIRST_10_LINES);
  });

  it('contains exactly 313 lines (312 instructions + halt marker at pc=512)', () => {
    const lines = loadDisasmLines();
    // instrCount says 312, plus one OP_?? marker for the dispatch hole at pc=512.
    assert.equal(lines.length, EXPECTED_INSTR_COUNT + 1);
  });

  it('final line is the halt marker for opcode 65 at pc=512', () => {
    const lines = loadDisasmLines();
    assert.equal(lines[lines.length - 1], '00512  OP_?? 65');
  });
});

describe('vm-slide decoder end-to-end', () => {
  it('re-running the decoder reproduces the committed JSON artifacts byte-for-byte', () => {
    const dispatchBefore = fs.readFileSync(DISPATCH_PATH, 'utf8');
    const bytecodeBefore = fs.readFileSync(BYTECODE_PATH, 'utf8');

    const stdout = execFileSync(process.execPath, [DECODER_CLI, '--input', VM_SLIDE_INPUT], {
      cwd: ROOT,
      encoding: 'utf8'
    });

    assert.equal(
      stdout,
      `decoded ${EXPECTED_DISPATCH_LEN} dispatch slots (${EXPECTED_NON_NULL} non-null), bytecode length ${EXPECTED_BYTECODE_LEN}\n`
    );

    const dispatchAfter = fs.readFileSync(DISPATCH_PATH, 'utf8');
    const bytecodeAfter = fs.readFileSync(BYTECODE_PATH, 'utf8');

    assert.equal(dispatchAfter, dispatchBefore, 'dispatch-table.json drifted after rerun');
    assert.equal(bytecodeAfter, bytecodeBefore, 'bytecode.json drifted after rerun');
  });
});

describe('vm-slide disassembler end-to-end', () => {
  it('re-running the disassembler reproduces disassembly.txt byte-for-byte', () => {
    const before = fs.readFileSync(DISASM_PATH, 'utf8');

    const result = execFileSync(process.execPath, [DISASM_CLI], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    assert.equal(
      result,
      `disassembled ${EXPECTED_INSTR_COUNT} instructions, PC range [0, ${EXPECTED_HALT_PC + 1})\n`
    );

    const after = fs.readFileSync(DISASM_PATH, 'utf8');
    assert.equal(after, before, 'disassembly.txt drifted after rerun');
  });

  it('emits a WARN on stderr mentioning pc=512 for the dispatch hole', () => {
    // Use spawnSync-style capture so we can read stderr even on success.
    const { spawnSync } = require('child_process');
    const res = spawnSync(process.execPath, [DISASM_CLI], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    assert.equal(res.status, 0, `disassembler exited non-zero: ${res.stderr}`);
    assert.match(res.stderr, /WARN/);
    assert.match(res.stderr, /pc=512/);
  });
});
