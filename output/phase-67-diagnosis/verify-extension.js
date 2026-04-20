'use strict';

/**
 * Verify a proposed extension to extractThisCtx across the 5 reference sources:
 *   original rule  - callee=regs[bc[++pc]], property Identifier 'call' OR Literal 'call',
 *                    first arg is plain Identifier that isn't regs/bytecode/pc.
 *   extension rule - callee=regs[bc[++pc]], property is ANY (Identifier, Literal, or
 *                    computed with a CallExpression), first arg is plain Identifier
 *                    that isn't regs/bytecode/pc.
 *
 * We tabulate per source:
 *   - orig matches + candidate tallies
 *   - ext matches + candidate tallies
 *   - best name under each rule
 * to confirm that the extension recovers a winning candidate for the two failing
 * builds without changing the winner in any passing build.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function walk(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) walk(child, visitor);
      }
    } else if (val && typeof val === 'object' && val.type) {
      walk(val, visitor);
    }
  }
}

function findVmSwitch(ast) {
  let best = null;
  walk(ast, (node) => {
    if (node.type === 'SwitchStatement' && node.cases) {
      if (!best || node.cases.length > best.cases.length) best = node;
    }
  });
  return best;
}

function extractBytecodeAndPc(switchNode) {
  const disc = switchNode.discriminant;
  if (disc.type !== 'MemberExpression' || !disc.computed) return null;
  const obj = disc.object;
  const prop = disc.property;
  if (obj.type !== 'Identifier') return null;
  if (prop.type !== 'UpdateExpression' || prop.operator !== '++' || !prop.prefix) return null;
  if (prop.argument.type !== 'Identifier') return null;
  return { bytecode: obj.name, pc: prop.argument.name };
}

function extractRegs(switchNode, bytecodeVar, pcVar) {
  const candidates = {};
  walk(switchNode, (node) => {
    if (node.type === 'MemberExpression' && node.computed &&
        node.object.type === 'Identifier' &&
        node.object.name !== bytecodeVar) {
      const prop = node.property;
      if (prop.type === 'MemberExpression' && prop.computed &&
          prop.object.type === 'Identifier' && prop.object.name === bytecodeVar &&
          prop.property.type === 'UpdateExpression' && prop.property.operator === '++' &&
          prop.property.argument.type === 'Identifier' && prop.property.argument.name === pcVar) {
        const name = node.object.name;
        candidates[name] = (candidates[name] || 0) + 1;
      }
    }
  });
  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(candidates)) {
    if (count > bestCount) { bestCount = count; bestName = name; }
  }
  return bestName;
}

function isRegsBytecodePc(n, regsVar, bytecodeVar, pcVar) {
  if (!n || n.type !== 'MemberExpression' || !n.computed) return false;
  if (n.object.type !== 'Identifier' || n.object.name !== regsVar) return false;
  const p = n.property;
  if (p.type !== 'MemberExpression' || !p.computed) return false;
  if (p.object.type !== 'Identifier' || p.object.name !== bytecodeVar) return false;
  if (p.property.type !== 'UpdateExpression' || p.property.operator !== '++') return false;
  if (p.property.argument.type !== 'Identifier' || p.property.argument.name !== pcVar) return false;
  return true;
}

// Winner: highest count; ties broken by first-seen.
function pickBest(cands) {
  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(cands)) {
    if (count > bestCount) { bestCount = count; bestName = name; }
  }
  return { name: bestName, count: bestCount };
}

function analyze(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });
  const sw = findVmSwitch(ast);
  const bcPc = extractBytecodeAndPc(sw);
  const regsVar = extractRegs(sw, bcPc.bytecode, bcPc.pc);

  const origCands = {};
  const extCands = {};

  walk(sw, (node) => {
    if (node.type !== 'CallExpression') return;
    if (node.callee.type !== 'MemberExpression') return;
    if (node.arguments.length < 1) return;
    const calleeObj = node.callee.object;
    // Extension: require callee object to be strictly regs[bytecode[++pc]]
    if (!isRegsBytecodePc(calleeObj, regsVar, bcPc.bytecode, bcPc.pc)) return;

    const firstArg = node.arguments[0];
    if (firstArg.type !== 'Identifier') return;
    if (firstArg.name === regsVar || firstArg.name === bcPc.bytecode || firstArg.name === bcPc.pc) return;

    // Identify whether the property access spells 'call'
    const p = node.callee.property;
    const isCall =
      (p.type === 'Identifier' && !node.callee.computed && p.name === 'call') ||
      (p.type === 'Literal' && node.callee.computed && p.value === 'call');

    if (isCall) origCands[firstArg.name] = (origCands[firstArg.name] || 0) + 1;
    extCands[firstArg.name] = (extCands[firstArg.name] || 0) + 1;
  });

  const origBest = pickBest(origCands);
  const extBest = pickBest(extCands);

  return {
    file: path.basename(sourcePath),
    caseCount: sw.cases.length,
    bytecode: bcPc.bytecode,
    pc: bcPc.pc,
    regs: regsVar,
    origCands,
    origBest,
    extCands,
    extBest
  };
}

const files = process.argv.slice(2);
for (const f of files) {
  const r = analyze(f);
  console.log('== ' + r.file + ' ==');
  console.log('  cases=' + r.caseCount + ' bytecode=' + r.bytecode + ' pc=' + r.pc + ' regs=' + r.regs);
  console.log('  ORIG cands=' + JSON.stringify(r.origCands) + '  best=' + JSON.stringify(r.origBest));
  console.log('  EXT  cands=' + JSON.stringify(r.extCands) + '  best=' + JSON.stringify(r.extBest));
  const agreement = r.origBest.name && r.extBest.name && r.origBest.name === r.extBest.name;
  const origFound = !!r.origBest.name;
  const extFound = !!r.extBest.name;
  console.log('  status: origFound=' + origFound + '  extFound=' + extFound + '  winnersAgree=' + agreement);
  console.log('');
}
