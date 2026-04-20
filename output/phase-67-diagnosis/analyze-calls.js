'use strict';

/**
 * Enumerate every CallExpression inside the VM dispatch switch of a given
 * tdc.js source, classify its structural shape (callee form, argument form),
 * and print frequency tables so we can diagnose why the current
 * extractThisCtx rule fails on f53142c5… and 88ebeea6….
 *
 * Pure investigation script — writes results to stdout. Invoke with the path
 * to a tdc.js source; any additional paths are analyzed in sequence.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

// ---------- Minimal fork of helpers from tools/porting-pipeline/vm-parser.js

function walk(node, visitor, parent, skipTypes) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) {
          if (skipTypes && skipTypes.has(child.type)) continue;
          walk(child, visitor, node, skipTypes);
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      if (skipTypes && skipTypes.has(val.type)) continue;
      walk(val, visitor, node, skipTypes);
    }
  }
}

function findVmSwitch(ast) {
  let best = null;
  walk(ast, (node) => {
    if (node.type === 'SwitchStatement' && node.cases) {
      if (!best || node.cases.length > best.cases.length) {
        best = node;
      }
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

// ---------- Shape helpers

function ctx(source, start, end, pad = 0) {
  return source.slice(Math.max(0, start - pad), Math.min(source.length, end + pad));
}

function findEnclosingCaseLabel(switchNode, node) {
  // Return the textual "case N:" for the switch case containing `node`, if any.
  for (const c of switchNode.cases) {
    if (c.start <= node.start && c.end >= node.end) {
      if (c.test && c.test.type === 'Literal') {
        return `case ${c.test.value}:`;
      }
      return c.test ? 'case <expr>:' : 'default:';
    }
  }
  return null;
}

function propName(node) {
  // Return a textual description of a MemberExpression's property access form.
  if (!node) return '<none>';
  if (node.type === 'MemberExpression') {
    if (!node.computed && node.property.type === 'Identifier') {
      return '.' + node.property.name;
    }
    if (node.computed && node.property.type === 'Literal') {
      return '[' + JSON.stringify(node.property.value) + ']';
    }
    if (node.computed && node.property.type === 'Identifier') {
      return '[' + node.property.name + ']';
    }
    if (node.computed && node.property.type === 'MemberExpression') {
      return '[' + describeNode(node.property) + ']';
    }
    return '[<computed>]';
  }
  return '<non-member>';
}

function describeNode(n) {
  if (!n) return '<null>';
  switch (n.type) {
    case 'Identifier': return `Id(${n.name})`;
    case 'Literal': return `Lit(${JSON.stringify(n.value)})`;
    case 'MemberExpression': return describeMember(n);
    case 'CallExpression': return `Call(${describeNode(n.callee)}, n=${n.arguments.length})`;
    case 'ThisExpression': return 'This';
    case 'UpdateExpression': return `Upd(${n.operator}${describeNode(n.argument)})`;
    case 'BinaryExpression': return `Bin(${describeNode(n.left)} ${n.operator} ${describeNode(n.right)})`;
    case 'AssignmentExpression': return `Assign(${describeNode(n.left)} ${n.operator} ${describeNode(n.right)})`;
    case 'LogicalExpression': return `Log(${describeNode(n.left)} ${n.operator} ${describeNode(n.right)})`;
    case 'ArrayExpression': return `Arr[${n.elements.length}]`;
    case 'ObjectExpression': return `Obj{${n.properties.length}}`;
    case 'ConditionalExpression': return 'Cond';
    case 'SequenceExpression': return `Seq[${n.expressions.length}]`;
    case 'FunctionExpression': return 'Fn';
    case 'ArrowFunctionExpression': return 'ArrowFn';
    case 'NewExpression': return `New(${describeNode(n.callee)})`;
    case 'UnaryExpression': return `Un(${n.operator}${describeNode(n.argument)})`;
    case 'SpreadElement': return `Spread(${describeNode(n.argument)})`;
    default: return n.type;
  }
}

function describeMember(m) {
  const objPart = describeNode(m.object);
  let propPart;
  if (!m.computed && m.property.type === 'Identifier') {
    propPart = '.' + m.property.name;
  } else if (m.computed && m.property.type === 'Literal') {
    propPart = '[' + JSON.stringify(m.property.value) + ']';
  } else {
    propPart = '[' + describeNode(m.property) + ']';
  }
  return objPart + propPart;
}

function isRegsBytecodePc(node, regsVar, bytecodeVar, pcVar) {
  // regs[bytecode[++pc]]
  if (!node || node.type !== 'MemberExpression' || !node.computed) return false;
  if (node.object.type !== 'Identifier' || node.object.name !== regsVar) return false;
  const p = node.property;
  if (p.type !== 'MemberExpression' || !p.computed) return false;
  if (p.object.type !== 'Identifier' || p.object.name !== bytecodeVar) return false;
  if (p.property.type !== 'UpdateExpression' || p.property.operator !== '++') return false;
  if (p.property.argument.type !== 'Identifier' || p.property.argument.name !== pcVar) return false;
  return true;
}

// ---------- Main

function analyze(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });
  const sw = findVmSwitch(ast);
  if (!sw) { throw new Error('no switch'); }
  const bcPc = extractBytecodeAndPc(sw);
  const regsVar = extractRegs(sw, bcPc.bytecode, bcPc.pc);

  const fileLabel = path.basename(sourcePath);
  console.log('=== ' + fileLabel + ' ===');
  console.log('bytecode=' + bcPc.bytecode + ' pc=' + bcPc.pc + ' regs=' + regsVar + ' cases=' + sw.cases.length);

  // Enumerate all CallExpression nodes inside the switch.
  const calls = [];
  walk(sw, (n) => { if (n.type === 'CallExpression') calls.push(n); });
  console.log('total CallExpressions in switch: ' + calls.length);

  // Group by a structural signature of the callee.
  const shapeCounts = {};
  const shapeExamples = {};
  for (const c of calls) {
    let sig;
    if (c.callee.type !== 'MemberExpression') {
      sig = 'callee=' + describeNode(c.callee);
    } else {
      const obj = c.callee.object;
      const objDesc = (obj.type === 'MemberExpression' &&
                       obj.object.type === 'Identifier' && obj.object.name === regsVar &&
                       obj.computed && obj.property.type === 'MemberExpression' &&
                       obj.property.object.type === 'Identifier' && obj.property.object.name === bcPc.bytecode &&
                       obj.property.property.type === 'UpdateExpression' &&
                       obj.property.property.argument.type === 'Identifier' && obj.property.property.argument.name === bcPc.pc)
        ? 'regs[bytecode[++pc]]'
        : describeNode(obj);
      sig = objDesc + propName(c.callee) + '(' + c.arguments.map(describeNode).join(',') + ')';
      // Normalise argument shapes to reduce cardinality — keep just the first 2 args
      const argsAbbr = c.arguments.slice(0, 2).map((a) => {
        if (a.type === 'Identifier') return 'Id';
        if (a.type === 'Literal') return 'Lit';
        if (a.type === 'MemberExpression') {
          if (isRegsBytecodePc(a, regsVar, bcPc.bytecode, bcPc.pc)) return 'regs[bc[++pc]]';
          return 'Member(' + describeMember(a) + ')';
        }
        return a.type;
      });
      sig = objDesc + propName(c.callee) + ' args=[' + argsAbbr.join(',') + (c.arguments.length > 2 ? ',...' : '') + ']';
    }
    shapeCounts[sig] = (shapeCounts[sig] || 0) + 1;
    if (!shapeExamples[sig]) shapeExamples[sig] = c;
  }

  const sorted = Object.entries(shapeCounts).sort((a, b) => b[1] - a[1]);
  console.log('\n-- top callee shapes (count, signature) --');
  for (const [sig, count] of sorted.slice(0, 20)) {
    const ex = shapeExamples[sig];
    const snippet = source.slice(ex.start, ex.end);
    const caseLabel = findEnclosingCaseLabel(sw, ex) || '';
    const short = snippet.length > 140 ? snippet.slice(0, 137) + '...' : snippet;
    console.log(`  ${count}  ${sig}`);
    console.log(`        ${caseLabel}  ${short}`);
  }

  // --- Apply current extractThisCtx rule and count matches
  let curMatches = 0;
  const curCands = {};
  walk(sw, (node) => {
    if (node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        ((node.callee.property.type === 'Identifier' && node.callee.property.name === 'call') ||
         (node.callee.property.type === 'Literal' && node.callee.property.value === 'call')) &&
        node.arguments.length >= 1) {
      const calleeObj = node.callee.object;
      if (calleeObj.type === 'MemberExpression' && calleeObj.computed &&
          calleeObj.object.type === 'Identifier' && calleeObj.object.name === regsVar) {
        const firstArg = node.arguments[0];
        if (firstArg.type === 'Identifier' &&
            firstArg.name !== regsVar &&
            firstArg.name !== bcPc.bytecode &&
            firstArg.name !== bcPc.pc) {
          curCands[firstArg.name] = (curCands[firstArg.name] || 0) + 1;
          curMatches++;
        }
      }
    }
  });
  console.log('\ncurrent rule matches: ' + curMatches + ' candidates=' + JSON.stringify(curCands));

  // --- Enumerate CallExpressions whose callee object is regs[...] but property isn't "call"
  console.log('\n-- Calls with callee object=regs[...] — property distribution --');
  const propDist = {};
  const propExamples = {};
  for (const c of calls) {
    if (c.callee.type !== 'MemberExpression') continue;
    const obj = c.callee.object;
    if (obj.type !== 'MemberExpression' || obj.object.type !== 'Identifier' || obj.object.name !== regsVar) continue;
    let propKey;
    const p = c.callee.property;
    if (!c.callee.computed && p.type === 'Identifier') propKey = '.' + p.name;
    else if (c.callee.computed && p.type === 'Literal') propKey = '[' + JSON.stringify(p.value) + ']';
    else if (c.callee.computed && p.type === 'Identifier') propKey = '[Id(' + p.name + ')]';
    else propKey = '[' + describeNode(p) + ']';
    propDist[propKey] = (propDist[propKey] || 0) + 1;
    if (!propExamples[propKey]) propExamples[propKey] = c;
  }
  const propSorted = Object.entries(propDist).sort((a, b) => b[1] - a[1]);
  for (const [key, count] of propSorted.slice(0, 15)) {
    const ex = propExamples[key];
    const snippet = source.slice(ex.start, ex.end);
    const caseLabel = findEnclosingCaseLabel(sw, ex) || '';
    const short = snippet.length > 200 ? snippet.slice(0, 197) + '...' : snippet;
    console.log(`  ${count}  prop=${key}`);
    console.log(`        ${caseLabel}  ${short}`);
  }

  // --- More specifically: regs[bytecode[++pc]].<any>(<Identifier>, ...) — collect arg[0] identifiers for each property
  console.log('\n-- regs[bytecode[++pc]].<prop>(Identifier,...) — arg[0] identifier freq per prop --');
  const perProp = {};
  const perPropEx = {};
  walk(sw, (node) => {
    if (node.type !== 'CallExpression') return;
    if (node.callee.type !== 'MemberExpression') return;
    const calleeObj = node.callee.object;
    // require regs[bytecode[++pc]]
    if (!isRegsBytecodePc(calleeObj, regsVar, bcPc.bytecode, bcPc.pc)) return;
    if (node.arguments.length < 1) return;
    const firstArg = node.arguments[0];
    let propKey;
    const p = node.callee.property;
    if (!node.callee.computed && p.type === 'Identifier') propKey = '.' + p.name;
    else if (node.callee.computed && p.type === 'Literal') propKey = '[' + JSON.stringify(p.value) + ']';
    else if (node.callee.computed && p.type === 'Identifier') propKey = '[Id(' + p.name + ')]';
    else propKey = '[' + describeNode(p) + ']';

    let firstArgKey;
    if (firstArg.type === 'Identifier') firstArgKey = 'Id(' + firstArg.name + ')';
    else if (firstArg.type === 'MemberExpression') {
      if (isRegsBytecodePc(firstArg, regsVar, bcPc.bytecode, bcPc.pc)) firstArgKey = 'regs[bc[++pc]]';
      else firstArgKey = 'Member(' + describeMember(firstArg) + ')';
    }
    else firstArgKey = firstArg.type;

    const key = propKey + ' :: arg0=' + firstArgKey;
    perProp[key] = (perProp[key] || 0) + 1;
    if (!perPropEx[key]) perPropEx[key] = node;
  });
  const perPropSorted = Object.entries(perProp).sort((a, b) => b[1] - a[1]);
  for (const [key, count] of perPropSorted.slice(0, 25)) {
    const ex = perPropEx[key];
    const snippet = source.slice(ex.start, ex.end);
    const caseLabel = findEnclosingCaseLabel(sw, ex) || '';
    const short = snippet.length > 220 ? snippet.slice(0, 217) + '...' : snippet;
    console.log(`  ${count}  ${key}`);
    console.log(`        ${caseLabel}  ${short}`);
  }

  console.log('\n');
}

// CLI
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('usage: node analyze-calls.js <tdc.js> [<tdc.js> ...]');
  process.exit(1);
}
for (const p of args) analyze(p);
