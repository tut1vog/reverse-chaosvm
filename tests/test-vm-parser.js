'use strict';

/**
 * Test suite for pipeline/vm-parser.js
 *
 * Validates VM dispatch function parsing across multiple tdc.js builds:
 * variable identification, case counts, AST node types, and error handling.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { parseVmFunction } = require('../tools/porting-pipeline/vm-parser');

const TARGETS = path.join(__dirname, '..', 'targets');

// Pre-load source files used by multiple tests
const tdcSource = fs.readFileSync(path.join(TARGETS, 'tdc.js'), 'utf8');
const tdcV2Source = fs.readFileSync(path.join(TARGETS, 'tdc-v2.js'), 'utf8');
const tdcV3Source = fs.readFileSync(path.join(TARGETS, 'tdc-v3.js'), 'utf8');
const tdcV5Source = fs.readFileSync(path.join(TARGETS, 'tdc-v5.js'), 'utf8');

// Cache parsed results to avoid re-parsing in each test
let tdcResult, tdcV2Result, tdcV3Result, tdcV5Result;

function getTdcResult() {
  if (!tdcResult) tdcResult = parseVmFunction(tdcSource);
  return tdcResult;
}
function getTdcV2Result() {
  if (!tdcV2Result) tdcV2Result = parseVmFunction(tdcV2Source);
  return tdcV2Result;
}
function getTdcV3Result() {
  if (!tdcV3Result) tdcV3Result = parseVmFunction(tdcV3Source);
  return tdcV3Result;
}
function getTdcV5Result() {
  if (!tdcV5Result) tdcV5Result = parseVmFunction(tdcV5Source);
  return tdcV5Result;
}

// ============================================================================
// 1. tdc.js variable identification
// ============================================================================
describe('vm-parser: tdc.js variable identification', () => {
  it('identifies bytecode variable as Y', () => {
    assert.strictEqual(getTdcResult().variables.bytecode, 'Y');
  });

  it('identifies pc variable as C', () => {
    assert.strictEqual(getTdcResult().variables.pc, 'C');
  });

  it('identifies regs variable as i', () => {
    assert.strictEqual(getTdcResult().variables.regs, 'i');
  });

  it('identifies thisCtx variable as Q', () => {
    assert.strictEqual(getTdcResult().variables.thisCtx, 'Q');
  });

  it('identifies catchStack variable as F', () => {
    assert.strictEqual(getTdcResult().variables.catchStack, 'F');
  });

  it('identifies excVal variable as G', () => {
    assert.strictEqual(getTdcResult().variables.excVal, 'G');
  });
});

// ============================================================================
// 2. tdc.js case count
// ============================================================================
describe('vm-parser: tdc.js case count', () => {
  it('has exactly 95 cases', () => {
    assert.strictEqual(getTdcResult().caseCount, 95);
  });
});

// ============================================================================
// 3. tdc-v2.js variable identification
// ============================================================================
describe('vm-parser: tdc-v2.js variable identification', () => {
  it('identifies bytecode variable as w', () => {
    assert.strictEqual(getTdcV2Result().variables.bytecode, 'w');
  });

  it('identifies pc variable as R', () => {
    assert.strictEqual(getTdcV2Result().variables.pc, 'R');
  });

  it('identifies regs variable as S', () => {
    assert.strictEqual(getTdcV2Result().variables.regs, 'S');
  });

  it('identifies thisCtx variable as C', () => {
    assert.strictEqual(getTdcV2Result().variables.thisCtx, 'C');
  });

  it('identifies catchStack variable as G', () => {
    assert.strictEqual(getTdcV2Result().variables.catchStack, 'G');
  });

  it('identifies excVal variable as Y', () => {
    assert.strictEqual(getTdcV2Result().variables.excVal, 'Y');
  });
});

// ============================================================================
// 4. tdc-v2.js case count
// ============================================================================
describe('vm-parser: tdc-v2.js case count', () => {
  it('has exactly 94 cases', () => {
    assert.strictEqual(getTdcV2Result().caseCount, 94);
  });
});

// ============================================================================
// 5. tdc-v5.js variable identification
// ============================================================================
describe('vm-parser: tdc-v5.js variable identification', () => {
  it('identifies bytecode variable as G', () => {
    assert.strictEqual(getTdcV5Result().variables.bytecode, 'G');
  });

  it('identifies pc variable as F', () => {
    assert.strictEqual(getTdcV5Result().variables.pc, 'F');
  });

  it('identifies regs variable as Q', () => {
    assert.strictEqual(getTdcV5Result().variables.regs, 'Q');
  });

  it('identifies thisCtx variable as e', () => {
    assert.strictEqual(getTdcV5Result().variables.thisCtx, 'e');
  });

  it('identifies catchStack variable as C', () => {
    assert.strictEqual(getTdcV5Result().variables.catchStack, 'C');
  });

  it('identifies excVal variable as w', () => {
    assert.strictEqual(getTdcV5Result().variables.excVal, 'w');
  });
});

// ============================================================================
// 6. tdc-v5.js case count
// ============================================================================
describe('vm-parser: tdc-v5.js case count', () => {
  it('has exactly 100 cases', () => {
    assert.strictEqual(getTdcV5Result().caseCount, 100);
  });
});

// ============================================================================
// 7. tdc-v3.js matches tdc.js (same template)
// ============================================================================
describe('vm-parser: tdc-v3.js matches tdc.js template', () => {
  it('has the same variable names as tdc.js', () => {
    const v3Vars = getTdcV3Result().variables;
    const tdcVars = getTdcResult().variables;
    assert.deepStrictEqual(v3Vars, tdcVars);
  });

  it('has the same case count as tdc.js', () => {
    assert.strictEqual(getTdcV3Result().caseCount, getTdcResult().caseCount);
  });
});

// ============================================================================
// 8. switchNode is valid
// ============================================================================
describe('vm-parser: switchNode validity', () => {
  it('is a SwitchStatement', () => {
    assert.strictEqual(getTdcResult().switchNode.type, 'SwitchStatement');
  });

  it('has a cases array', () => {
    assert.ok(Array.isArray(getTdcResult().switchNode.cases));
  });

  it('cases array length matches caseCount', () => {
    assert.strictEqual(getTdcResult().switchNode.cases.length, getTdcResult().caseCount);
  });
});

// ============================================================================
// 9. dispatchFunction is valid
// ============================================================================
describe('vm-parser: dispatchFunction validity', () => {
  it('is a FunctionExpression', () => {
    assert.strictEqual(getTdcResult().dispatchFunction.type, 'FunctionExpression');
  });

  it('has a body block', () => {
    assert.ok(getTdcResult().dispatchFunction.body);
    assert.strictEqual(getTdcResult().dispatchFunction.body.type, 'BlockStatement');
  });
});

// ============================================================================
// 10. Error on invalid input
// ============================================================================
describe('vm-parser: error on invalid input', () => {
  it('throws on empty string', () => {
    assert.throws(() => parseVmFunction(''), /Could not find VM dispatch switch/);
  });

  it('throws on non-tdc JavaScript', () => {
    assert.throws(
      () => parseVmFunction('var x = 1; function foo() { return x + 1; }'),
      /Could not find VM dispatch switch/
    );
  });

  it('throws on a small switch statement (< 50 cases)', () => {
    const smallSwitch = 'function f() { switch(x) { case 0: break; case 1: break; } }';
    assert.throws(() => parseVmFunction(smallSwitch), /Could not find VM dispatch switch/);
  });
});

// ============================================================================
// 11. Obfuscated survey builds
// ============================================================================

const SURVEY_DIR = path.join(__dirname, '..', 'output', 'tdc-survey');
const SURVEY_BUILDS = [
  { hash: '27dda893f81dbc4f', expectedCases: 103 },
  { hash: '3429444f324c6110', expectedCases: 91 },
  { hash: 'e2170903e201e018', expectedCases: 93 },
];

// Pre-check which survey files exist
const surveyAvailable = {};
for (const build of SURVEY_BUILDS) {
  const filePath = path.join(SURVEY_DIR, `${build.hash}.js`);
  surveyAvailable[build.hash] = fs.existsSync(filePath);
}

// Cache parsed results for survey builds
const surveyResults = {};
function getSurveyResult(hash) {
  if (!surveyResults[hash]) {
    const src = fs.readFileSync(path.join(SURVEY_DIR, `${hash}.js`), 'utf8');
    surveyResults[hash] = parseVmFunction(src);
  }
  return surveyResults[hash];
}

describe('vm-parser: obfuscated builds', () => {
  for (const build of SURVEY_BUILDS) {
    const testFn = surveyAvailable[build.hash] ? it : it.skip;

    testFn(`parses ${build.hash.slice(0, 8)} (${build.expectedCases} cases)`, () => {
      const result = getSurveyResult(build.hash);

      // Correct case count
      assert.strictEqual(result.caseCount, build.expectedCases);

      // All 6 variable keys exist and are non-null strings
      const keys = ['bytecode', 'pc', 'regs', 'thisCtx', 'catchStack', 'excVal'];
      for (const key of keys) {
        assert.ok(
          typeof result.variables[key] === 'string' && result.variables[key].length > 0,
          `variables.${key} should be a non-empty string, got: ${result.variables[key]}`
        );
      }
    });
  }

  const obfBuild = SURVEY_BUILDS[0];
  const obfTestFn = surveyAvailable[obfBuild.hash] ? it : it.skip;

  obfTestFn('variables are _0x-prefixed identifiers', () => {
    const result = getSurveyResult(obfBuild.hash);
    const keys = ['bytecode', 'pc', 'regs', 'thisCtx', 'catchStack', 'excVal'];
    for (const key of keys) {
      assert.match(
        result.variables[key],
        /^_0x[0-9a-f]+$/i,
        `variables.${key} should be _0x-prefixed, got: ${result.variables[key]}`
      );
    }
  });
});
