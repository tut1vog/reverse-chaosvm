'use strict';

/**
 * Test suite for the vm-slide control-flow-aware walker (task 40.1).
 *
 * Pins:
 *   - output/vm-slide/disassembly-full.txt (walker output)
 *   - walker CLI stdout/stderr contract
 *   - re-run idempotence
 *   - that 40.1 was purely additive: disassembly.txt and dispatch-table.json
 *     are unchanged from 39.1.
 *
 * research/vm-slide-stack-vm/walker.js calls main() at top level, so we
 * invoke it as a subprocess via execFileSync / spawnSync rather than via
 * require().
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'output', 'vm-slide');
const FULL_PATH = path.join(OUT_DIR, 'disassembly-full.txt');
const LINEAR_PATH = path.join(OUT_DIR, 'disassembly.txt');
const DISPATCH_PATH = path.join(OUT_DIR, 'dispatch-table.json');

const WALKER_CLI = path.join(ROOT, 'research', 'vm-slide-stack-vm', 'walker.js');

const EXPECTED_TOTAL_LINES = 14486;
const EXPECTED_INSTR_LINES = 14134;
const EXPECTED_FUNC_ENTRIES = 101;
const EXPECTED_VISITED_RANGE_END = 24273;
const EXPECTED_LINEAR_LINES = 313;

const EXPECTED_FIRST_10_LINES = [
  '00000  OP_40 3',
  '00002  OP_42 2',
  '00004  OP_06 1568',
  '',
  '00007  OP_40 6',
  '00009  OP_42 2',
  '00011  OP_42 3',
  '00013  OP_42 4',
  '00015  OP_42 5',
  '00017  OP_06 289'
];

const LINE_FORMAT_RE = /^\d{5}  OP_\d{2}(?:\s+-?\d+(?:\.\d+)?)*$/;

function loadFullLines() {
  // Match the 39.2 split convention: drop the trailing empty element from
  // the final newline so the line count matches `wc -l`.
  const text = fs.readFileSync(FULL_PATH, 'utf8');
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function loadLinearLines() {
  const text = fs.readFileSync(LINEAR_PATH, 'utf8');
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

describe('walker output shape', () => {
  it(`disassembly-full.txt has exactly ${EXPECTED_TOTAL_LINES} lines`, () => {
    const lines = loadFullLines();
    assert.equal(lines.length, EXPECTED_TOTAL_LINES);
  });

  it('first 10 lines match the golden block (with the blank separator at index 3)', () => {
    const lines = loadFullLines();
    assert.deepEqual(lines.slice(0, 10), EXPECTED_FIRST_10_LINES);
  });

  it('contains the JUMP at pc=4 (OP_06 1568)', () => {
    const text = fs.readFileSync(FULL_PATH, 'utf8');
    assert.ok(text.includes('OP_06 1568'), 'expected JUMP at pc=4 to be present');
  });

  it('contains a line starting with 00300 (FUNC_CREATE pc=291 → nextPc=300 anchor)', () => {
    const lines = loadFullLines();
    const found = lines.find((l) => l.startsWith('00300  '));
    assert.ok(found, 'expected line starting with "00300  "');
  });

  it('contains a line starting with 01573 (FUNC_CREATE pc=1568 → nextPc=1573 anchor)', () => {
    const lines = loadFullLines();
    const found = lines.find((l) => l.startsWith('01573  '));
    assert.ok(found, 'expected line starting with "01573  "');
  });

  it('contains no HALT marker and no OP_?? mnemonic', () => {
    const text = fs.readFileSync(FULL_PATH, 'utf8');
    assert.ok(!text.includes('HALT'), 'walker output should not contain HALT');
    assert.ok(!text.includes('OP_??'), 'walker output should not contain OP_??');
  });

  it('every non-blank line matches the line-format regex', () => {
    const lines = loadFullLines();
    for (const line of lines) {
      if (line === '') continue;
      assert.match(line, LINE_FORMAT_RE);
    }
  });
});

describe('walker coverage facts', () => {
  it(`non-blank line count is exactly ${EXPECTED_INSTR_LINES}`, () => {
    const lines = loadFullLines();
    const nonBlank = lines.filter((l) => l.length > 0);
    assert.equal(nonBlank.length, EXPECTED_INSTR_LINES);
  });

  it('lowest PC is 0', () => {
    const lines = loadFullLines();
    const pcs = lines.filter((l) => l.length > 0).map((l) => parseInt(l.slice(0, 5), 10));
    assert.equal(Math.min(...pcs), 0);
  });

  it(`highest PC is < ${EXPECTED_VISITED_RANGE_END}`, () => {
    const lines = loadFullLines();
    const pcs = lines.filter((l) => l.length > 0).map((l) => parseInt(l.slice(0, 5), 10));
    assert.ok(Math.max(...pcs) < EXPECTED_VISITED_RANGE_END);
  });

  it('walker visits at least 45x as many instructions as the linear walker (312)', () => {
    const lines = loadFullLines();
    const nonBlank = lines.filter((l) => l.length > 0).length;
    assert.ok(nonBlank >= 45 * 312, `expected >= ${45 * 312}, got ${nonBlank}`);
  });
});

describe('walker CLI contract', () => {
  it('exits with code 0 and emits the exact stdout summary', () => {
    const stdout = execFileSync(process.execPath, [WALKER_CLI], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    assert.equal(
      stdout,
      `walked ${EXPECTED_INSTR_LINES} instructions across ${EXPECTED_FUNC_ENTRIES} function entries, visited range [0, ${EXPECTED_VISITED_RANGE_END})\n`
    );
  });

  it('emits empty stderr (no dispatch-hole diagnostics)', () => {
    const res = spawnSync(process.execPath, [WALKER_CLI], {
      cwd: ROOT,
      encoding: 'utf8'
    });
    assert.equal(res.status, 0, `walker exited non-zero: ${res.stderr}`);
    assert.equal(res.stderr, '');
  });

  it('re-running the walker reproduces disassembly-full.txt byte-for-byte', () => {
    const before = fs.readFileSync(FULL_PATH, 'utf8');
    execFileSync(process.execPath, [WALKER_CLI], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const after = fs.readFileSync(FULL_PATH, 'utf8');
    assert.equal(after, before, 'disassembly-full.txt drifted after rerun');
  });
});

describe('linear walker pinned file is untouched', () => {
  it(`disassembly.txt still has exactly ${EXPECTED_LINEAR_LINES} lines`, () => {
    const lines = loadLinearLines();
    assert.equal(lines.length, EXPECTED_LINEAR_LINES);
  });

  it('disassembly.txt first line is "00000  OP_40 3"', () => {
    const lines = loadLinearLines();
    assert.equal(lines[0], '00000  OP_40 3');
  });
});

describe('dispatch-table is unchanged from 39.1', () => {
  it('has exactly 69 slots', () => {
    const d = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));
    assert.equal(d.length, 69);
  });

  it('has 53 non-null and 16 null entries', () => {
    const d = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));
    const nonNull = d.filter((x) => x !== null).length;
    const nullCount = d.filter((x) => x === null).length;
    assert.equal(nonNull, 53);
    assert.equal(nullCount, 16);
  });

  it('no entry has a variableWidth key (40.1 kept its own constant)', () => {
    const d = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));
    for (let i = 0; i < d.length; i++) {
      const e = d[i];
      if (e === null) continue;
      assert.ok(!('variableWidth' in e), `slot ${i} unexpectedly has a variableWidth key`);
    }
  });
});

describe('FUNC_CREATE hand-traces', () => {
  it('pc=291 (K=20,A=2,C=1, width=8) yields nextPc=300 → "00300  OP_36"', () => {
    const lines = loadFullLines();
    const found = lines.find((l) => l.startsWith('00300  '));
    assert.ok(found, 'no line at pc=300');
    assert.ok(found.startsWith('00300  OP_36'), `expected OP_36 at pc=300, got: ${found}`);
  });

  it('pc=1568 (K=7,A=0,C=1, width=4) yields nextPc=1573 → "01573  OP_04"', () => {
    const lines = loadFullLines();
    const found = lines.find((l) => l.startsWith('01573  '));
    assert.ok(found, 'no line at pc=1573');
    assert.ok(found.startsWith('01573  OP_04'), `expected OP_04 at pc=1573, got: ${found}`);
  });
});
