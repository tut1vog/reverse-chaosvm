'use strict';

/**
 * Source-only structural survey of sample/t_captcha_slide.js.
 *
 * The bundle is a standard webpack 4 UMD-ish IIFE:
 *
 *   !function(e){
 *     var t = {};
 *     function n(r){ if(t[r]) return t[r].exports; ... e[r].call(i.exports, i, i.exports, n), ... }
 *     n.m = e; n.c = t; n.d = ...; n.r = ...; n.t = ...; n.n = ...; n.o = ...; n.p = "";
 *     n(n.s = 64);
 *   }([
 *     function(e,t,n){ /_ module 0 _/ },
 *     function(e,t,n){ /_ module 1 _/ },
 *     ...
 *   ]);
 *
 * Each module wrapper is `function(e, t, n)` where:
 *   e = module, t = exports, n = require (webpack's __webpack_require__).
 *
 * This script:
 *   1. Parses the bundle with acorn.
 *   2. Locates the module-array ArrayExpression passed to the IIFE.
 *   3. For each element, records byte range + source lines.
 *   4. Identifies the `require` parameter per wrapper (third positional parameter).
 *   5. Extracts static `require(<numeric literal>)` edges.
 *   6. Best-effort exports extraction from `<exports>.<name> = ...` and
 *      `Object.defineProperty(<exports>, 'name', ...)`.
 *   7. Conservative per-module hint tagging based on easily-verifiable structural
 *      signals (XMLHttpRequest usage, very large string-literal tables, XTEA delta).
 *   8. Emits modules.json + module-graph.json under output/captcha-orchestrator/.
 *
 * Idempotent: running twice produces byte-identical output. Stable filenames.
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const BUNDLE_PATH = path.resolve(__dirname, '..', '..', 'sample', 't_captcha_slide.js');
const OUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'captcha-orchestrator');

function readBundle() {
  return fs.readFileSync(BUNDLE_PATH, 'utf8');
}

/**
 * Walk AST nodes (hand-rolled; mirrors tools/porting-pipeline/vm-parser.js style).
 */
function walk(node, visitor, skipTypes) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' ||
        key === 'loc' || key === 'range') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) {
          if (skipTypes && skipTypes.has(child.type)) continue;
          walk(child, visitor, skipTypes);
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      if (skipTypes && skipTypes.has(val.type)) continue;
      walk(val, visitor, skipTypes);
    }
  }
}

/**
 * Locate the module-array ArrayExpression that is passed as the argument to
 * the top-level IIFE. The bundle pattern is:
 *
 *   !function(e){ ... }([...])       // UnaryExpression -> CallExpression
 *
 * We look at the top-level ExpressionStatement and follow the call.
 */
function findModuleArray(ast) {
  if (!ast.body || ast.body.length === 0) return null;
  // The first top-level statement is the whole bundle in this shape.
  for (const stmt of ast.body) {
    if (stmt.type !== 'ExpressionStatement') continue;
    let expr = stmt.expression;
    // `!function(){}([...])` => UnaryExpression(operator='!', argument=CallExpression)
    if (expr.type === 'UnaryExpression') expr = expr.argument;
    if (expr.type !== 'CallExpression') continue;
    if (expr.arguments.length !== 1) continue;
    const arg = expr.arguments[0];
    if (arg.type !== 'ArrayExpression') continue;
    // Sanity: callee is FunctionExpression with one parameter.
    if (expr.callee.type !== 'FunctionExpression') continue;
    if (expr.callee.params.length !== 1) continue;
    return arg;
  }
  return null;
}

/**
 * Returns an array of module entries, one per element of the webpack module
 * array. Sparse / empty slots are recorded with `isEmpty: true`.
 */
function enumerateModules(arrayExpr, src) {
  const modules = [];
  const elements = arrayExpr.elements;
  for (let id = 0; id < elements.length; id++) {
    const el = elements[id];
    if (el === null) {
      modules.push({
        id,
        isEmpty: true,
        sourceRange: null,
        sourceLines: null,
        byteLength: 0,
        requires: [],
        exports: [],
        hint: 'empty-slot'
      });
      continue;
    }
    if (el.type !== 'FunctionExpression') {
      // Unexpected shape — record as unknown but do not crash.
      modules.push({
        id,
        isEmpty: false,
        sourceRange: [el.start, el.end],
        sourceLines: null,
        byteLength: el.end - el.start,
        requires: [],
        exports: [],
        hint: 'non-function'
      });
      continue;
    }
    const info = analyzeModule(id, el, src);
    modules.push(info);
  }
  return modules;
}

/**
 * Compute 1-based {start,end} line numbers for a byte range by scanning newlines.
 * The bundle is effectively one line, but we keep this correct for safety.
 */
function byteRangeToLines(src, start, end) {
  // Fast path: count newlines via slicing. For a single-line bundle both are 1.
  let startLine = 1;
  for (let i = 0; i < start; i++) {
    if (src.charCodeAt(i) === 10) startLine++;
  }
  let endLine = startLine;
  for (let i = start; i < end; i++) {
    if (src.charCodeAt(i) === 10) endLine++;
  }
  return { start: startLine, end: endLine };
}

/**
 * Analyze a single webpack module (FunctionExpression). Extracts:
 *   - require parameter name (3rd param)
 *   - exports parameter name (2nd param)
 *   - module parameter name (1st param)
 *   - static numeric requires
 *   - exported property names (best effort)
 *   - a conservative hint
 */
function analyzeModule(id, fnNode, src) {
  const [mParam, tParam, nParam] = fnNode.params.map((p) =>
    p && p.type === 'Identifier' ? p.name : null
  );

  const body = fnNode.body; // BlockStatement
  const requireSet = new Set();
  const exportsSet = new Set();
  let sawXhr = false;
  let sawFetch = false;
  let sawXteaDelta = false;
  let sawJQueryMarker = false;
  let sawScriptTagCreate = false;
  let largestStringLiteral = 0;
  let stringLiteralCount = 0;

  walk(body, (node) => {
    // require(<number>)
    if (node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' && nParam && node.callee.name === nParam) {
      const arg = node.arguments[0];
      if (arg && arg.type === 'Literal' && typeof arg.value === 'number') {
        requireSet.add(arg.value);
      }
    }
    // exports.<name> = ... or exports['name'] = ...
    if (node.type === 'AssignmentExpression' && node.operator === '=' &&
        node.left.type === 'MemberExpression' &&
        node.left.object.type === 'Identifier' && tParam && node.left.object.name === tParam) {
      const prop = node.left.property;
      if (!node.left.computed && prop.type === 'Identifier') {
        exportsSet.add(prop.name);
      } else if (node.left.computed && prop.type === 'Literal' && typeof prop.value === 'string') {
        exportsSet.add(prop.value);
      }
    }
    // Object.defineProperty(exports, 'name', ...)
    if (node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' && node.callee.object.name === 'Object' &&
        node.callee.property.type === 'Identifier' && node.callee.property.name === 'defineProperty' &&
        node.arguments.length >= 2 &&
        node.arguments[0].type === 'Identifier' && tParam && node.arguments[0].name === tParam) {
      const key = node.arguments[1];
      if (key && key.type === 'Literal' && typeof key.value === 'string') {
        exportsSet.add(key.value);
      }
    }
    // Hint signals — all conservative, purely structural.
    if (node.type === 'Identifier') {
      if (node.name === 'XMLHttpRequest') sawXhr = true;
      if (node.name === 'fetch') sawFetch = true;
    }
    if (node.type === 'Literal') {
      if (typeof node.value === 'string') {
        stringLiteralCount++;
        if (node.value.length > largestStringLiteral) largestStringLiteral = node.value.length;
        if (node.value === 'jquery' || node.value === 'jQuery' ||
            node.value === 'Zepto' || node.value === 'zepto') {
          sawJQueryMarker = true;
        }
      }
      if (typeof node.value === 'number' && node.value === 0x9E3779B9) {
        sawXteaDelta = true;
      }
    }
    // document.createElement('script')
    if (node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'createElement' &&
        node.arguments.length >= 1 &&
        node.arguments[0].type === 'Literal' &&
        node.arguments[0].value === 'script') {
      sawScriptTagCreate = true;
    }
  });

  let hint = 'unknown';
  if (sawXteaDelta) hint = 'xtea-delta';
  else if (sawJQueryMarker && stringLiteralCount > 50) hint = 'jquery-like';
  else if (sawXhr || sawFetch) hint = 'network';
  else if (sawScriptTagCreate) hint = 'script-loader';
  else if (stringLiteralCount > 200 && largestStringLiteral < 120) hint = 'string-table-candidate';

  const sourceLines = byteRangeToLines(src, fnNode.start, fnNode.end);

  return {
    id,
    isEmpty: false,
    sourceRange: [fnNode.start, fnNode.end],
    sourceLines,
    byteLength: fnNode.end - fnNode.start,
    params: { module: mParam, exports: tParam, require: nParam },
    requires: Array.from(requireSet).sort((a, b) => a - b),
    exports: Array.from(exportsSet).sort(),
    hint,
    signals: {
      sawXhr,
      sawFetch,
      sawXteaDelta,
      sawJQueryMarker,
      sawScriptTagCreate,
      stringLiteralCount,
      largestStringLiteral
    }
  };
}

/**
 * Build a static module graph from the inventory.
 */
function buildGraph(modules) {
  const nodes = modules.map((m) => ({ id: m.id, byteLength: m.byteLength, hint: m.hint }));
  const edges = [];
  const referenced = new Set();
  for (const m of modules) {
    for (const tgt of m.requires) {
      edges.push({ from: m.id, to: tgt });
      referenced.add(tgt);
    }
  }
  // Roots: modules that are never the target of any require edge AND are not empty.
  // (The webpack entry n.s = 64 is separately tracked below.)
  const roots = modules
    .filter((m) => !m.isEmpty && !referenced.has(m.id))
    .map((m) => m.id);
  // Leaves: non-empty modules with zero outgoing edges.
  const leaves = modules
    .filter((m) => !m.isEmpty && m.requires.length === 0)
    .map((m) => m.id);
  // Fan-out stats over non-empty modules.
  const fanOuts = modules.filter((m) => !m.isEmpty).map((m) => m.requires.length);
  const maxFanOut = fanOuts.reduce((a, b) => Math.max(a, b), 0);
  const avgFanOut = fanOuts.length ? (fanOuts.reduce((a, b) => a + b, 0) / fanOuts.length) : 0;
  return {
    nodes,
    edges,
    roots,
    leaves,
    stats: {
      totalModules: modules.length,
      nonEmptyModules: modules.filter((m) => !m.isEmpty).length,
      emptySlots: modules.filter((m) => m.isEmpty).length,
      totalEdges: edges.length,
      maxFanOut,
      avgFanOut: Number(avgFanOut.toFixed(3))
    }
  };
}

/**
 * Find the webpack entry module id by inspecting the IIFE body for `n(n.s = <id>)`.
 */
function findEntryId(ast) {
  let entryId = null;
  walk(ast, (node) => {
    if (entryId !== null) return;
    if (node.type === 'AssignmentExpression' && node.operator === '=' &&
        node.left.type === 'MemberExpression' &&
        node.left.property.type === 'Identifier' && node.left.property.name === 's' &&
        node.right.type === 'Literal' && typeof node.right.value === 'number') {
      entryId = node.right.value;
    }
  });
  return entryId;
}

function writeJson(file, obj) {
  const text = JSON.stringify(obj, null, 2) + '\n';
  fs.writeFileSync(file, text);
}

function main() {
  const src = readBundle();
  const ast = acorn.parse(src, {
    ecmaVersion: 'latest',
    ranges: true,
    locations: true,
    sourceType: 'script'
  });

  const moduleArray = findModuleArray(ast);
  if (!moduleArray) {
    throw new Error('Could not locate webpack module array in bundle.');
  }

  const modules = enumerateModules(moduleArray, src);
  const entryId = findEntryId(ast);
  const graph = buildGraph(modules);
  graph.entryId = entryId;

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  writeJson(path.join(OUT_DIR, 'modules.json'), modules);
  writeJson(path.join(OUT_DIR, 'module-graph.json'), graph);

  // Console summary — useful when running by hand.
  const nonEmpty = modules.filter((m) => !m.isEmpty);
  const totalBytes = nonEmpty.reduce((a, m) => a + m.byteLength, 0);
  process.stdout.write(
    `parse-bundle: ${modules.length} slots, ${nonEmpty.length} non-empty, ` +
    `${graph.stats.emptySlots} empty, ${graph.stats.totalEdges} edges, ` +
    `${totalBytes} module bytes, entryId=${entryId}\n`
  );
}

if (require.main === module) {
  main();
}

module.exports = { main };
