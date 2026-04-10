'use strict';

/**
 * Test suite for pipeline/opcode-mapper.js
 *
 * Validates opcode mapping across multiple tdc.js builds:
 * full reference match for tdc.js, cross-template consistency,
 * structural integrity of the output format.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseVmFunction } = require('../pipeline/vm-parser');
const { mapOpcodes } = require('../pipeline/opcode-mapper');

const TARGETS = path.join(__dirname, '..', 'targets');

// Reference opcode table for tdc.js (all 95 entries)
const REF_OPCODES = {
  0:'ADD',1:'IN',2:'DIV',3:'XOR',4:'MUL',5:'CALL_COMPLEX',6:'SHR_K',7:'RET_CLEANUP',
  8:'AND_K',9:'DELETE',10:'COPY_SET',11:'INC_BIGINT',12:'FUNC_CREATE_A',13:'GT',14:'PROP_SET',
  15:'DEC',16:'CALL_3',17:'PROP_GET',18:'OBJ_NEW',19:'STR_APPEND_2',20:'PROP_CALL_1',
  21:'LE_K',22:'SEQ',23:'FUNC_CREATE_B',24:'RET',25:'CALL_0',26:'NEW_2',27:'USHR_K',
  28:'LT',29:'PROP_GET_CONST',30:'INC',31:'STR_INIT',32:'SUB',33:'TRY_PUSH',34:'TYPEOF',
  35:'OR_K',36:'LOAD_NULL',37:'THROW',38:'JMP',39:'MOD',40:'TO_NUMBER',41:'SET_GET_CONST',
  42:'LOAD_EXCEPTION',43:'GE_K',44:'SUB_K',45:'PROP_GET_K',46:'SET_RET',47:'LOAD_K',
  48:'SHL_K',49:'LT_K',50:'CALLQ_3',51:'SHR',52:'CALL_1',53:'NEG',54:'STR_OBJ_STR',
  55:'FUNC_CREATE_C',56:'APPLY',57:'SEQ_K',58:'OR',59:'PROP_SET_K',60:'RET_BARE',
  61:'CALL_2',62:'ENUMERATE',63:'CALLQ_2',64:'STR_PROP',65:'STR_SET_STR',66:'GT_K',
  67:'STR_APPEND',68:'NOT',69:'ARRAY_2',70:'CALLQ_1_COPY',71:'UPLUS',72:'PROP_STR',
  73:'MOV',74:'TRY_POP',75:'SET_RET_Q',76:'STR_SET_K',77:'CALLQ_1',78:'EQ_K',79:'RSUB_K',
  80:'MOV_2',81:'LOAD_THIS',82:'SHL',83:'ARRAY',84:'ITER_SHIFT',85:'NEW_0',86:'PROP_GET_K_2',
  87:'CJMP',88:'EXC_TRY',89:'EQ',90:'CALLQ_0',91:'CATCH_PUSH',92:'ADD_K',93:'STR_EMPTY',
  94:'NEW_1'
};

// Pre-load sources
const tdcSource = fs.readFileSync(path.join(TARGETS, 'tdc.js'), 'utf8');
const tdcV2Source = fs.readFileSync(path.join(TARGETS, 'tdc-v2.js'), 'utf8');
const tdcV5Source = fs.readFileSync(path.join(TARGETS, 'tdc-v5.js'), 'utf8');

// Cache parsed + mapped results
let tdcMap, tdcV2Map, tdcV5Map;

function getTdcMap() {
  if (!tdcMap) {
    const parsed = parseVmFunction(tdcSource);
    tdcMap = mapOpcodes(parsed, tdcSource);
  }
  return tdcMap;
}

function getTdcV2Map() {
  if (!tdcV2Map) {
    const parsed = parseVmFunction(tdcV2Source);
    tdcV2Map = mapOpcodes(parsed, tdcV2Source);
  }
  return tdcV2Map;
}

function getTdcV5Map() {
  if (!tdcV5Map) {
    const parsed = parseVmFunction(tdcV5Source);
    tdcV5Map = mapOpcodes(parsed, tdcV5Source);
  }
  return tdcV5Map;
}

// ============================================================================
// 1. tdc.js full reference match
// ============================================================================
describe('opcode-mapper: tdc.js full reference match', () => {
  it('maps all 95 opcodes correctly', () => {
    const table = getTdcMap().opcodeTable;
    const refKeys = Object.keys(REF_OPCODES);
    assert.strictEqual(Object.keys(table).length, refKeys.length,
      `Expected ${refKeys.length} mapped opcodes, got ${Object.keys(table).length}`);

    for (const key of refKeys) {
      assert.strictEqual(table[key], REF_OPCODES[key],
        `Case ${key}: expected ${REF_OPCODES[key]}, got ${table[key]}`);
    }
  });
});

// ============================================================================
// 2. tdc.js zero unmapped
// ============================================================================
describe('opcode-mapper: tdc.js zero unmapped', () => {
  it('has no unmapped cases', () => {
    assert.strictEqual(getTdcMap().unmapped.length, 0,
      `Expected 0 unmapped, got ${getTdcMap().unmapped.length}: ` +
      getTdcMap().unmapped.map(u => `case ${u.caseNumber}`).join(', '));
  });
});

// ============================================================================
// 3. tdc-v2.js maps at least 90
// ============================================================================
describe('opcode-mapper: tdc-v2.js mapping coverage', () => {
  it('maps at least 90 opcodes', () => {
    const mapped = Object.keys(getTdcV2Map().opcodeTable).length;
    assert.ok(mapped >= 90,
      `Expected >= 90 mapped opcodes for tdc-v2.js, got ${mapped}`);
  });
});

// ============================================================================
// 4. tdc-v2.js unmapped has entries
// ============================================================================
describe('opcode-mapper: tdc-v2.js has unmapped entries', () => {
  it('has at least one unmapped case (novel compounds)', () => {
    assert.ok(getTdcV2Map().unmapped.length > 0,
      'Expected tdc-v2.js to have unmapped cases');
  });
});

// ============================================================================
// 5. tdc-v5.js maps at least 85
// ============================================================================
describe('opcode-mapper: tdc-v5.js mapping coverage', () => {
  it('maps at least 85 opcodes', () => {
    const mapped = Object.keys(getTdcV5Map().opcodeTable).length;
    assert.ok(mapped >= 85,
      `Expected >= 85 mapped opcodes for tdc-v5.js, got ${mapped}`);
  });
});

// ============================================================================
// 6. Cross-template consistency
// ============================================================================
describe('opcode-mapper: cross-template consistency', () => {
  const coreOps = ['ADD', 'SUB', 'MUL', 'DIV', 'MOV', 'JMP', 'CJMP', 'RET', 'CALL_0', 'CALL_1'];

  for (const op of coreOps) {
    it(`${op} appears in tdc.js opcode table`, () => {
      const values = Object.values(getTdcMap().opcodeTable);
      assert.ok(values.includes(op), `${op} not found in tdc.js table`);
    });

    it(`${op} appears in tdc-v2.js opcode table`, () => {
      const values = Object.values(getTdcV2Map().opcodeTable);
      assert.ok(values.includes(op), `${op} not found in tdc-v2.js table`);
    });

    it(`${op} appears in tdc-v5.js opcode table`, () => {
      const values = Object.values(getTdcV5Map().opcodeTable);
      assert.ok(values.includes(op), `${op} not found in tdc-v5.js table`);
    });
  }
});

// ============================================================================
// 7. No duplicate mnemonics (within a single template)
// ============================================================================
describe('opcode-mapper: no duplicate mnemonics', () => {
  it('tdc.js has no duplicate mnemonics', () => {
    const table = getTdcMap().opcodeTable;
    const values = Object.values(table);
    const unique = new Set(values);
    assert.strictEqual(values.length, unique.size,
      `Found duplicate mnemonics in tdc.js: ${findDuplicates(table)}`);
  });

  it('tdc-v2.js has at most 1 duplicate (known FUNC_CREATE_C)', () => {
    const table = getTdcV2Map().opcodeTable;
    const dupes = findDuplicates(table);
    // v2 has a known duplicate: FUNC_CREATE_C appears at two case numbers
    assert.ok(dupes.split(';').filter(s => s.trim()).length <= 1,
      `Too many duplicate mnemonics in tdc-v2.js: ${dupes}`);
  });

  it('tdc-v5.js has at most 1 duplicate (known FUNC_CREATE_C)', () => {
    const table = getTdcV5Map().opcodeTable;
    const dupes = findDuplicates(table);
    // v5 has a known duplicate: FUNC_CREATE_C appears at two case numbers
    assert.ok(dupes.split(';').filter(s => s.trim()).length <= 1,
      `Too many duplicate mnemonics in tdc-v5.js: ${dupes}`);
  });
});

function findDuplicates(table) {
  const seen = {};
  const dupes = [];
  for (const [key, val] of Object.entries(table)) {
    if (seen[val] !== undefined) {
      dupes.push(`${val} at cases ${seen[val]} and ${key}`);
    }
    seen[val] = key;
  }
  return dupes.join('; ');
}

// ============================================================================
// 8. opcodeTable keys are strings
// ============================================================================
describe('opcode-mapper: opcodeTable keys are strings', () => {
  it('all keys in tdc.js table are strings', () => {
    const keys = Object.keys(getTdcMap().opcodeTable);
    for (const key of keys) {
      assert.strictEqual(typeof key, 'string', `Key ${key} is not a string`);
    }
  });

  it('all keys parse as non-negative integers', () => {
    const keys = Object.keys(getTdcMap().opcodeTable);
    for (const key of keys) {
      const num = Number(key);
      assert.ok(Number.isInteger(num) && num >= 0,
        `Key "${key}" does not parse as a non-negative integer`);
    }
  });
});

// ============================================================================
// 9. unmapped entries have required fields
// ============================================================================
describe('opcode-mapper: unmapped entry structure', () => {
  it('tdc-v2.js unmapped entries have caseNumber and reason', () => {
    for (const entry of getTdcV2Map().unmapped) {
      assert.ok(typeof entry.caseNumber === 'number',
        `unmapped entry missing numeric caseNumber: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0,
        `unmapped entry missing reason string: ${JSON.stringify(entry)}`);
    }
  });

  it('tdc-v5.js unmapped entries have caseNumber and reason', () => {
    for (const entry of getTdcV5Map().unmapped) {
      assert.ok(typeof entry.caseNumber === 'number',
        `unmapped entry missing numeric caseNumber: ${JSON.stringify(entry)}`);
      assert.ok(typeof entry.reason === 'string' && entry.reason.length > 0,
        `unmapped entry missing reason string: ${JSON.stringify(entry)}`);
    }
  });

  it('notes array is non-empty', () => {
    assert.ok(getTdcMap().notes.length > 0, 'notes should be non-empty');
    assert.ok(getTdcV2Map().notes.length > 0, 'notes should be non-empty');
  });
});
