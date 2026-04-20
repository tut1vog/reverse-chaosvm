'use strict';

/**
 * Exercise the patched vm-parser.js directly: require the module,
 * parse one passing (tdc-01.js) and one previously-failing (tdc-08.js, tdc-09.js)
 * source, and print the thisCtx identifier resolved by parseVmFunction.
 *
 * This complements verify-extension.js — that script inlines its own rule;
 * this one loads the real tools/porting-pipeline/vm-parser.js implementation.
 */

const fs = require('fs');
const path = require('path');
const { parseVmFunction } = require('../../tools/porting-pipeline/vm-parser');

const files = [
  'output/port-survey/sources/tdc-01.js',
  'output/port-survey/sources/tdc-10.js',
  'output/port-survey/sources/tdc-20.js',
  'output/port-survey/sources/tdc-08.js',
  'output/port-survey/sources/tdc-09.js'
];

for (const rel of files) {
  const abs = path.resolve(__dirname, '..', '..', rel);
  const source = fs.readFileSync(abs, 'utf8');
  try {
    const result = parseVmFunction(source);
    console.log(path.basename(abs) +
      '  thisCtx=' + result.variables.thisCtx +
      '  cases=' + result.caseCount +
      '  regs=' + result.variables.regs);
  } catch (err) {
    console.log(path.basename(abs) + '  ERROR: ' + err.message);
  }
}
