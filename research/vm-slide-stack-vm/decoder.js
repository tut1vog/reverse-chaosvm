'use strict';

// Static decoder for the stack-based ChaosVM variant (sample/vm_slide.js).
// Extracts the dispatch table (Q) and the inline bytecode literal via acorn,
// writing both to output/vm-slide/ as JSON. No semantic classification — this
// is a raw structural dump feeding task 39.2 / 39.3.
//
// The bytecode-cursor identifier (`g`) and bytecode-array identifier (`m`) are
// hard-coded to match sample/vm_slide.js. Other stack-VM builds may rename them
// and will need this lookup generalized.

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const PC_VAR = 'g';
const BC_VAR = 'm';

function parseArgs(argv) {
  const args = { input: path.resolve(__dirname, '..', '..', 'sample', 'vm_slide.js') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input' && i + 1 < argv.length) {
      args.input = path.resolve(argv[++i]);
    }
  }
  return args;
}

function findFirst(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) {
          const r = findFirst(child, predicate);
          if (r) return r;
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      const r = findFirst(val, predicate);
      if (r) return r;
    }
  }
  return null;
}

// Count expressions of shape `m[g++]` inside an arbitrary AST subtree. Static
// pattern-match only — we do not evaluate anything. Matches the concrete shape
// used by the first few handlers in sample/vm_slide.js (e.g. `n[m[g++]][0]`).
function countOperandReads(node) {
  let count = 0;
  function visit(n) {
    if (!n || typeof n !== 'object') return;
    if (n.type === 'MemberExpression' && n.computed &&
        n.object && n.object.type === 'Identifier' && n.object.name === BC_VAR &&
        n.property && n.property.type === 'UpdateExpression' &&
        n.property.operator === '++' && n.property.prefix === false &&
        n.property.argument && n.property.argument.type === 'Identifier' &&
        n.property.argument.name === PC_VAR) {
      count++;
    }
    for (const key of Object.keys(n)) {
      if (key === 'type' || key === 'start' || key === 'end') continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const c of val) {
          if (c && typeof c === 'object' && c.type) visit(c);
        }
      } else if (val && typeof val === 'object' && val.type) {
        visit(val);
      }
    }
  }
  visit(node);
  return count;
}

// Evaluate a numeric-literal AST node, supporting `-N` via UnaryExpression.
// Returns { ok: true, value } or { ok: false } for anything else.
function evalNumericLiteral(node) {
  if (!node) return { ok: false };
  if (node.type === 'Literal' && typeof node.value === 'number') {
    return { ok: true, value: node.value };
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument) {
    const inner = evalNumericLiteral(node.argument);
    if (inner.ok) return { ok: true, value: -inner.value };
  }
  if (node.type === 'UnaryExpression' && node.operator === '+' && node.argument) {
    const inner = evalNumericLiteral(node.argument);
    if (inner.ok) return { ok: true, value: +inner.value };
  }
  return { ok: false };
}

function extractDispatchTable(vmFnNode, source) {
  // Find `var Q = [...]` inside the function body. There may be multiple
  // VariableDeclarations; we want the one whose init is an ArrayExpression
  // whose elements are function expressions or holes.
  let arrayExpr = null;
  const body = vmFnNode.body && vmFnNode.body.body;
  if (!body) throw new Error('VM function has no body');
  for (const stmt of body) {
    if (stmt.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations) {
      if (decl.init && decl.init.type === 'ArrayExpression') {
        const elems = decl.init.elements;
        // Heuristic: the dispatch table has >=20 elements and most non-null
        // elements are FunctionExpressions.
        if (elems.length < 20) continue;
        let fnCount = 0;
        for (const e of elems) {
          if (e && e.type === 'FunctionExpression') fnCount++;
        }
        if (fnCount >= 20) {
          arrayExpr = decl.init;
          break;
        }
      }
    }
    if (arrayExpr) break;
  }
  if (!arrayExpr) throw new Error('Could not find dispatch table ArrayExpression');

  const slots = [];
  arrayExpr.elements.forEach((el, idx) => {
    if (el === null) {
      slots.push(null);
      return;
    }
    if (el.type !== 'FunctionExpression') {
      process.stderr.write(`WARN: dispatch slot ${idx} is ${el.type}, expected FunctionExpression\n`);
      slots.push(null);
      return;
    }
    const operandCount = countOperandReads(el.body);
    slots.push({
      opcode: idx,
      operandCount,
      source: source.slice(el.start, el.end)
    });
  });
  return slots;
}

// The outer IIFE invokes __TENCENT_CHAOS_VM(0, <decoder>(...), window) where
// <decoder> is a FunctionExpression that base64-decodes a string (via a helper
// named `E` declared in the outer IIFE) and splices numeric operands from a
// patch array. We cannot read the bytecode as a plain ArrayExpression — we
// must execute the decoder. This is safe: the decoder is pure (no DOM, no
// network), it just builds an array.
function extractBytecode(ast, source) {
  // Locate the outer __TENCENT_CHAOS_VM(0, <decoder IIFE>, window) call.
  const callNode = findFirst(ast, (n) =>
    n.type === 'CallExpression' &&
    n.callee && n.callee.type === 'Identifier' &&
    n.callee.name === '__TENCENT_CHAOS_VM' &&
    n.arguments && n.arguments.length === 3 &&
    n.arguments[0].type === 'Literal' && n.arguments[0].value === 0
  );
  if (!callNode) throw new Error('Could not find outer __TENCENT_CHAOS_VM(0, ..., window) call');
  const decoderExpr = callNode.arguments[1];
  const decoderSrc = source.slice(decoderExpr.start, decoderExpr.end);

  // Locate `function E(A) { ... }` — the base64 helper used by the decoder.
  const eFnNode = findFirst(ast, (n) =>
    n.type === 'FunctionDeclaration' && n.id && n.id.name === 'E'
  );
  if (!eFnNode) throw new Error('Could not find base64 helper function E');
  const eFnSrc = source.slice(eFnNode.start, eFnNode.end);

  // Run both in an isolated scope via new Function. The decoder IIFE references
  // `E` by name; declaring it in the same function scope satisfies that. Output
  // is the fully-decoded bytecode array.
  // eslint-disable-next-line no-new-func
  const runner = new Function(
    `${eFnSrc}\nreturn (${decoderSrc});`
  );
  const bc = runner();
  if (!Array.isArray(bc)) {
    throw new Error('Decoder did not return an array');
  }
  // Normalize sparse holes to null so JSON serialization preserves them.
  const out = [];
  for (let i = 0; i < bc.length; i++) {
    out.push(i in bc ? bc[i] : null);
  }
  return out;
}

function findVmFunction(ast) {
  return findFirst(ast, (n) =>
    n.type === 'FunctionDeclaration' &&
    n.id && n.id.name === '__TENCENT_CHAOS_VM'
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = fs.readFileSync(args.input, 'utf8');
  const ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });

  const vmFn = findVmFunction(ast);
  if (!vmFn) throw new Error('Could not locate __TENCENT_CHAOS_VM function');

  const dispatchTable = extractDispatchTable(vmFn, source);
  const bytecode = extractBytecode(ast, source);

  const outDir = path.resolve(__dirname, '..', '..', 'output', 'vm-slide');
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, 'dispatch-table.json'),
    JSON.stringify(dispatchTable, null, 2) + '\n'
  );
  fs.writeFileSync(
    path.join(outDir, 'bytecode.json'),
    JSON.stringify(bytecode) + '\n'
  );

  const nonNull = dispatchTable.filter((s) => s !== null).length;
  process.stdout.write(
    `decoded ${dispatchTable.length} dispatch slots (${nonNull} non-null), bytecode length ${bytecode.length}\n`
  );
}

main();
