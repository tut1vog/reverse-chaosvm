'use strict';

/**
 * Dump the first N CallExpressions in the VM switch whose callee object is
 * regs[bytecode[++pc]] and whose first argument is a plain Identifier (that
 * isn't regs/bytecode/pc). This is the set of candidates under the proposed
 * extractThisCtx extension. Snippets are printed with their enclosing
 * case label. Used verbatim as evidence in the written report.
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
      for (const child of val) if (child && typeof child === 'object' && child.type) walk(child, visitor);
    } else if (val && typeof val === 'object' && val.type) walk(val, visitor);
  }
}

function findVmSwitch(ast) {
  let best = null;
  walk(ast, (n) => {
    if (n.type === 'SwitchStatement' && n.cases && (!best || n.cases.length > best.cases.length)) best = n;
  });
  return best;
}

function extractBytecodeAndPc(switchNode) {
  const disc = switchNode.discriminant;
  const prop = disc.property;
  return { bytecode: disc.object.name, pc: prop.argument.name };
}

function extractRegs(switchNode, bytecodeVar, pcVar) {
  const c = {};
  walk(switchNode, (n) => {
    if (n.type === 'MemberExpression' && n.computed &&
        n.object.type === 'Identifier' && n.object.name !== bytecodeVar) {
      const p = n.property;
      if (p.type === 'MemberExpression' && p.computed &&
          p.object.type === 'Identifier' && p.object.name === bytecodeVar &&
          p.property.type === 'UpdateExpression' && p.property.operator === '++' &&
          p.property.argument.type === 'Identifier' && p.property.argument.name === pcVar) {
        c[n.object.name] = (c[n.object.name] || 0) + 1;
      }
    }
  });
  let best = null, bc = 0;
  for (const [k, v] of Object.entries(c)) if (v > bc) { bc = v; best = k; }
  return best;
}

function isRegsBytecodePc(n, regs, bc, pc) {
  if (!n || n.type !== 'MemberExpression' || !n.computed) return false;
  if (n.object.type !== 'Identifier' || n.object.name !== regs) return false;
  const p = n.property;
  if (p.type !== 'MemberExpression' || !p.computed) return false;
  if (p.object.type !== 'Identifier' || p.object.name !== bc) return false;
  if (p.property.type !== 'UpdateExpression' || p.property.operator !== '++') return false;
  if (p.property.argument.type !== 'Identifier' || p.property.argument.name !== pc) return false;
  return true;
}

function caseLabel(switchNode, node) {
  for (const c of switchNode.cases) {
    if (c.start <= node.start && c.end >= node.end) {
      if (c.test && c.test.type === 'Literal') return 'case ' + c.test.value + ':';
      return c.test ? 'case <expr>:' : 'default:';
    }
  }
  return '';
}

function propDesc(callee) {
  const p = callee.property;
  if (!callee.computed && p.type === 'Identifier') return '.' + p.name;
  if (callee.computed && p.type === 'Literal') return '[' + JSON.stringify(p.value) + ']';
  if (callee.computed && p.type === 'Identifier') return '[Id(' + p.name + ')]';
  if (callee.computed && p.type === 'CallExpression' &&
      p.callee.type === 'Identifier' && p.arguments.length === 1) {
    const a = p.arguments[0];
    const av = a.type === 'Literal' ? JSON.stringify(a.value) : a.type;
    return '[' + p.callee.name + '(' + av + ')]';
  }
  return '[<other>]';
}

function run(sourcePath) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });
  const sw = findVmSwitch(ast);
  const bcPc = extractBytecodeAndPc(sw);
  const regs = extractRegs(sw, bcPc.bytecode, bcPc.pc);

  console.log('### ' + path.basename(sourcePath) + '  cases=' + sw.cases.length + '  regs=' + regs + '  bytecode=' + bcPc.bytecode + '  pc=' + bcPc.pc);

  const matches = [];
  walk(sw, (node) => {
    if (node.type !== 'CallExpression') return;
    if (node.callee.type !== 'MemberExpression') return;
    if (node.arguments.length < 1) return;
    const co = node.callee.object;
    if (!isRegsBytecodePc(co, regs, bcPc.bytecode, bcPc.pc)) return;
    const a0 = node.arguments[0];
    if (a0.type !== 'Identifier') return;
    if (a0.name === regs || a0.name === bcPc.bytecode || a0.name === bcPc.pc) return;
    matches.push({ node, firstArg: a0.name, prop: propDesc(node.callee), label: caseLabel(sw, node) });
  });

  console.log('  total extension matches: ' + matches.length);
  // Print all matches, showing the raw source slice.
  for (const m of matches) {
    const text = source.slice(m.node.start, m.node.end);
    const short = text.length > 260 ? text.slice(0, 257) + '...' : text;
    console.log('    ' + m.label + '  prop=' + m.prop + '  arg0=' + m.firstArg);
    console.log('      ' + short);
  }
  console.log('');
}

for (const p of process.argv.slice(2)) run(p);
