'use strict';

const acorn = require('acorn');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Quick heuristic: obfuscated builds have many _0x-prefixed identifiers
 * and a decoder function at the top level.
 */
function isObfuscated(source) {
  const count = (source.match(/_0x/g) || []).length;
  return count > 100;
}

// ---------------------------------------------------------------------------
// Decoder bootstrap extraction and evaluation
// ---------------------------------------------------------------------------

/**
 * Find all top-level FunctionDeclarations and the decoder-related statements.
 *
 * Obfuscated builds have this top-level structure (order varies):
 *   1. window.TDC_NAME = "...";
 *   2. ;(function(){ polyfills })()
 *   3. window.TDC_NAME = 'eks...' (eks assignment)
 *   4. function _0xNNNN(...) { ... }  (string array function)
 *   5. function _0xNNNN(...) { ... }  (decoder function)
 *   6. var _0xNNNN = _0xNNNN;         (alias)
 *   7. (function(...){ ... rotation ... })()  (rotation IIFE)
 *   8. var NAME = (function(){ ... return function ... })()  (main factory)
 *   9. NAME(...)(...)(args)  (invocation)
 */
function extractDecoderBootstrap(source, ast) {
  const fnDecls = [];
  const varAliases = [];
  const iifes = [];

  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration' && node.id && /^_0x/.test(node.id.name)) {
      fnDecls.push(node);
    }
    if (node.type === 'VariableDeclaration') {
      // var _0xNNNN = _0xMMMM; (simple alias)
      for (const decl of node.declarations) {
        if (decl.id && /^_0x/.test(decl.id.name) &&
            decl.init && decl.init.type === 'Identifier' && /^_0x/.test(decl.init.name)) {
          varAliases.push(node);
          break;
        }
      }
    }
    if (node.type === 'ExpressionStatement') {
      const expr = node.expression;
      let isRotationCandidate = false;

      if (expr.type === 'CallExpression') {
        // IIFE: (function(...){})(...)
        const callee = expr.callee;
        if (callee.type === 'FunctionExpression') {
          isRotationCandidate = true;
        }
      } else if (expr.type === 'SequenceExpression') {
        // Rotation IIFE wrapped in a sequence expression alongside window assignments
        // e.g., (function(a,b){...rotation...})(arrayFn, target), window[...] = ..., ...
        for (const e of expr.expressions) {
          if (e.type === 'CallExpression' && e.callee &&
              e.callee.type === 'FunctionExpression') {
            isRotationCandidate = true;
            break;
          }
        }
      }

      if (isRotationCandidate) {
        // Check if it references _0x names (rotation IIFE)
        const text = source.slice(node.start, Math.min(node.start + 200, node.end));
        if (/_0x/.test(text)) {
          iifes.push(node);
        }
      }
    }
  }

  // Identify the decoder function: it's the one with 2 params that calls
  // the string array function and subtracts a base offset
  let decoderFnNode = null;
  let arrayFnNode = null;

  for (const fn of fnDecls) {
    if (fn.params.length === 2) {
      decoderFnNode = fn;
    } else if (fn.params.length === 0) {
      arrayFnNode = fn;
    }
  }

  // If we didn't find them by param count, use body-size heuristic
  if (!decoderFnNode || !arrayFnNode) {
    // The decoder function references the array function; the array function
    // contains a large array of strings
    for (const fn of fnDecls) {
      const text = source.slice(fn.start, fn.end);
      if (text.includes('return ') && fn.params.length <= 2 && !decoderFnNode) {
        if (/\[_0x[0-9a-f]+\]/.test(text) || /\-\s*0x[0-9a-f]+/.test(text)) {
          decoderFnNode = fn;
        }
      }
    }
    for (const fn of fnDecls) {
      if (fn !== decoderFnNode && !arrayFnNode) {
        arrayFnNode = fn;
      }
    }
  }

  if (!decoderFnNode || !arrayFnNode) {
    return null;
  }

  const globalDecoderName = decoderFnNode.id.name;
  const arrayFnName = arrayFnNode.id.name;

  // Find alias name (var _0xNNNN = globalDecoderName)
  let aliasName = null;
  for (const node of ast.body) {
    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations) {
        if (decl.init && decl.init.type === 'Identifier' &&
            decl.init.name === globalDecoderName) {
          aliasName = decl.id.name;
        }
      }
    }
  }

  // Collect all bootstrap parts in source order
  const parts = [];
  parts.push(...fnDecls);
  parts.push(...varAliases);
  parts.push(...iifes);
  parts.sort((a, b) => a.start - b.start);

  const bootstrapSource = parts.map(p => source.slice(p.start, p.end)).join(';\n');

  return {
    bootstrapSource,
    globalDecoderName,
    arrayFnName,
    aliasName: aliasName || globalDecoderName,
    parts
  };
}

/**
 * Evaluate the decoder bootstrap in a sandbox and return a resolver function.
 */
function evalDecoder(bootstrapSource, globalDecoderName) {
  const sandbox = {
    window: {},
    Date: Date,
    parseInt: parseInt,
    decodeURIComponent: decodeURIComponent,
    String: String,
    Math: Math,
    Number: Number,
    Array: Array,
    Object: Object,
    TypeError: TypeError
  };
  vm.createContext(sandbox);
  vm.runInContext(bootstrapSource, sandbox, { timeout: 5000 });

  // Return a function that resolves a hex index to its decoded string
  return function resolve(hexIdx) {
    return vm.runInContext(globalDecoderName + '(' + hexIdx + ')', sandbox);
  };
}

// ---------------------------------------------------------------------------
// Decoder alias chain resolution
// ---------------------------------------------------------------------------

/**
 * Find all decoder aliases used inside the main code (after the bootstrap).
 * The alias chain is: globalDecoder → alias1 → alias2 → ...
 * Each level just assigns one identifier to another.
 *
 * We trace all aliases by looking at VariableDeclarator nodes where
 * init is an Identifier pointing to a known decoder name.
 */
function findAllDecoderAliases(source, ast, globalDecoderName, topLevelAlias) {
  const knownNames = new Set([globalDecoderName]);
  if (topLevelAlias) knownNames.add(topLevelAlias);

  // Walk the entire AST looking for var X = knownDecoder patterns
  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' &&
        node.id && node.id.type === 'Identifier' &&
        node.init && node.init.type === 'Identifier' &&
        knownNames.has(node.init.name)) {
      knownNames.add(node.id.name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object' && child.type) collect(child);
        }
      } else if (val && typeof val === 'object' && val.type) {
        collect(val);
      }
    }
  }

  // Run multiple passes until we reach a fixpoint (aliases can chain)
  let prevSize = 0;
  while (knownNames.size !== prevSize) {
    prevSize = knownNames.size;
    collect(ast);
  }

  return knownNames;
}

// ---------------------------------------------------------------------------
// Build decoder map
// ---------------------------------------------------------------------------

/**
 * Scan the source for all decoder calls like alias(0xNN) and resolve each one.
 * Returns a Map<string, string> where key is the literal call text and value
 * is the resolved string.
 */
function buildDecoderMap(source, decoderNames, resolverFn) {
  const map = new Map();

  // Build a regex that matches any decoder alias called with a hex literal
  const namesPattern = Array.from(decoderNames)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const re = new RegExp('(?:' + namesPattern + ')\\((0x[0-9a-f]+)\\)', 'g');

  let match;
  while ((match = re.exec(source)) !== null) {
    const fullMatch = match[0];
    const hexArg = match[1];
    if (!map.has(fullMatch)) {
      try {
        const resolved = resolverFn(parseInt(hexArg, 16));
        map.set(fullMatch, resolved);
      } catch (e) {
        // Skip unresolvable entries
      }
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Source-level decoder call replacement
// ---------------------------------------------------------------------------

/**
 * Check if a string is a valid JS identifier (for dot-notation replacement).
 */
function isValidIdentifier(str) {
  if (!str || str.length === 0) return false;
  // Must start with letter, $, or _ and contain only alphanumeric, $, _
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}

/**
 * Replace all decoder calls in the source text.
 *
 * Strategy:
 * - When decoder call appears as a computed property: obj[decoder(0xNN)]
 *   Replace with obj.resolvedString (dot notation) if valid identifier,
 *   or obj['resolvedString'] otherwise.
 * - When decoder call appears standalone: decoder(0xNN)
 *   Replace with 'resolvedString' (string literal).
 */
function replaceDecoderCalls(source, decoderNames, decoderMap) {
  let replaced = 0;

  // Build regex for all decoder names
  const namesPattern = Array.from(decoderNames)
    .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  // Pattern: [decoderAlias(0xNN)] → .resolvedString or ['resolvedString']
  // This handles computed member access
  const bracketRe = new RegExp(
    '\\[(?:' + namesPattern + ')\\((0x[0-9a-f]+)\\)\\]',
    'g'
  );

  let result = source.replace(bracketRe, (match, hexArg) => {
    // Reconstruct the call text to look up in the map
    // We need to find which decoder name was used
    for (const name of decoderNames) {
      const callText = name + '(' + hexArg + ')';
      if (match.includes(callText) && decoderMap.has(callText)) {
        const resolved = decoderMap.get(callText);
        replaced++;
        if (isValidIdentifier(resolved)) {
          return '.' + resolved;
        }
        return '[\'' + resolved.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\']';
      }
    }
    return match;
  });

  // Pattern: standalone decoderAlias(0xNN) → 'resolvedString'
  // (not preceded by [ which was handled above)
  const standaloneRe = new RegExp(
    '(?:' + namesPattern + ')\\((0x[0-9a-f]+)\\)',
    'g'
  );

  result = result.replace(standaloneRe, (match, hexArg) => {
    if (decoderMap.has(match)) {
      const resolved = decoderMap.get(match);
      replaced++;
      return '\'' + resolved.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\'';
    }
    return match;
  });

  return { result, replaced };
}

// ---------------------------------------------------------------------------
// Helper object resolution
// ---------------------------------------------------------------------------

/**
 * Resolve helper wrapper objects. These are ObjectExpression nodes with
 * properties that are either:
 *   - Binary operator wrappers: function(a, b) { return a OP b; }
 *   - Call passthroughs: function(a, b, c, ...) { return a(b, c, ...); }
 *   - `in` operator: function(a, b) { return a in b; }
 *   - String constants: 'someString'
 *   - Indirect delegates: function(a, b) { return otherObj.prop(a, b); }
 */
function resolveHelperObject(source, ast) {
  const helpers = [];

  // Find all large ObjectExpression nodes with function properties
  // that are assigned in VariableDeclarator
  function findHelpers(node, parent) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' &&
        node.init && node.init.type === 'ObjectExpression' &&
        node.init.properties.length >= 5) {
      const obj = node.init;
      // Check that most properties are functions
      let fnCount = 0;
      for (const prop of obj.properties) {
        if (prop.value && (prop.value.type === 'FunctionExpression' ||
            prop.value.type === 'Literal' || prop.value.type === 'CallExpression')) {
          fnCount++;
        }
      }
      if (fnCount >= obj.properties.length * 0.5) {
        helpers.push({
          name: node.id.name,
          node: obj,
          properties: resolveHelperProperties(obj, source)
        });
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (child && typeof child === 'object' && child.type) {
            findHelpers(child, node);
          }
        }
      } else if (val && typeof val === 'object' && val.type) {
        findHelpers(val, node);
      }
    }
  }

  findHelpers(ast, null);
  return helpers;
}

/**
 * Analyze each property of a helper object to determine its operation.
 */
function resolveHelperProperties(objNode, source) {
  const props = {};

  for (const prop of objNode.properties) {
    const key = prop.key.value || prop.key.name;
    const val = prop.value;

    if (!val) continue;

    if (val.type === 'Literal') {
      props[key] = { type: 'constant', value: val.value };
      continue;
    }

    if (val.type === 'CallExpression') {
      // A decoder call used as a property value (resolves to a string constant)
      props[key] = { type: 'decoder_call' };
      continue;
    }

    if (val.type !== 'FunctionExpression') continue;

    const params = val.params.map(p => p.name);
    const body = val.body;
    if (!body || body.type !== 'BlockStatement') continue;

    // Filter out non-return statements (local var declarations for decoder alias)
    const bodyStmts = body.body.filter(s => s.type !== 'VariableDeclaration');
    if (bodyStmts.length !== 1) {
      props[key] = { type: 'unknown', paramCount: params.length };
      continue;
    }

    const stmt = bodyStmts[0];
    if (stmt.type !== 'ReturnStatement' || !stmt.argument) {
      props[key] = { type: 'unknown', paramCount: params.length };
      continue;
    }

    const ret = stmt.argument;

    // Binary operator: return a OP b
    if (ret.type === 'BinaryExpression' && params.length === 2) {
      const leftParam = ret.left.type === 'Identifier' && ret.left.name === params[0];
      const rightParam = ret.right.type === 'Identifier' && ret.right.name === params[1];
      if (leftParam && rightParam) {
        props[key] = { type: 'binary', operator: ret.operator };
        continue;
      }
    }

    // Unary: return !a, return typeof a, etc.
    if (ret.type === 'UnaryExpression' && params.length === 1) {
      if (ret.argument.type === 'Identifier' && ret.argument.name === params[0]) {
        props[key] = { type: 'unary', operator: ret.operator };
        continue;
      }
    }

    // Call passthrough: return a(b, c, ...)
    if (ret.type === 'CallExpression' && params.length >= 2) {
      if (ret.callee.type === 'Identifier' && ret.callee.name === params[0]) {
        // Verify remaining args match remaining params
        const argsMatch = ret.arguments.length === params.length - 1 &&
          ret.arguments.every((arg, i) =>
            arg.type === 'Identifier' && arg.name === params[i + 1]);
        if (argsMatch) {
          props[key] = { type: 'call_passthrough', paramCount: params.length };
          continue;
        }
      }
    }

    // Indirect delegate: return otherObj.prop(a, b) or otherObj[decoded](a, b)
    if (ret.type === 'CallExpression' && ret.callee.type === 'MemberExpression') {
      const callee = ret.callee;
      if (callee.object.type === 'Identifier') {
        const delegateTo = callee.object.name;
        let delegateProp = null;
        if (callee.property.type === 'Identifier') {
          delegateProp = callee.property.name;
        } else if (callee.property.type === 'Literal') {
          delegateProp = callee.property.value;
        }
        // After decoder resolution, callee.property might be resolved
        if (delegateProp) {
          props[key] = {
            type: 'delegate',
            targetObj: delegateTo,
            targetProp: delegateProp,
            paramCount: params.length
          };
          continue;
        }
      }
    }

    props[key] = { type: 'unknown', paramCount: params.length };
  }

  return props;
}

// ---------------------------------------------------------------------------
// Helper call replacement
// ---------------------------------------------------------------------------

/**
 * Replace helper wrapper calls in the source.
 * Uses AST-guided replacement to correctly handle nested expressions.
 */
function replaceHelperCalls(source, helpers) {
  // Build a map of all helper names and their resolved properties
  const helperMap = new Map();
  for (const h of helpers) {
    helperMap.set(h.name, h.properties);
  }

  // First, resolve indirect delegates by following the chain
  for (const h of helpers) {
    for (const [key, info] of Object.entries(h.properties)) {
      if (info.type === 'delegate' && helperMap.has(info.targetObj)) {
        const targetProps = helperMap.get(info.targetObj);
        if (targetProps[info.targetProp]) {
          const resolved = targetProps[info.targetProp];
          if (resolved.type === 'binary' || resolved.type === 'unary' ||
              resolved.type === 'call_passthrough') {
            h.properties[key] = resolved;
          } else if (resolved.type === 'delegate' && helperMap.has(resolved.targetObj)) {
            // Second level delegation
            const target2 = helperMap.get(resolved.targetObj);
            if (target2[resolved.targetProp]) {
              const resolved2 = target2[resolved.targetProp];
              if (resolved2.type === 'binary' || resolved2.type === 'unary' ||
                  resolved2.type === 'call_passthrough') {
                h.properties[key] = resolved2;
              }
            }
          }
        }
      }
    }
  }

  // Iterative replacement: each pass replaces only non-nested helper calls.
  // Re-parse after each pass to get correct positions for the next pass.
  // This handles nested helper calls like helper.a(helper.b(x, y), z).
  let result = source;
  let totalReplaced = 0;
  const MAX_PASSES = 5;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let ast;
    try {
      ast = acorn.parse(result, { ecmaVersion: 2020, sourceType: 'script' });
    } catch (e) {
      break;
    }

    const replacements = [];

    function walkForCalls(node) {
      if (!node || typeof node !== 'object') return;

      // Walk children FIRST so we process innermost calls before outer ones
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const child of val) {
            if (child && typeof child === 'object' && child.type) {
              walkForCalls(child);
            }
          }
        } else if (val && typeof val === 'object' && val.type) {
          walkForCalls(val);
        }
      }

      if (node.type === 'CallExpression' && node.callee &&
          node.callee.type === 'MemberExpression') {
        const callee = node.callee;
        const objName = callee.object.type === 'Identifier' ? callee.object.name : null;
        let propName = null;
        if (callee.property.type === 'Identifier') {
          propName = callee.property.name;
        } else if (callee.property.type === 'Literal') {
          propName = callee.property.value;
        }

        if (objName && propName && helperMap.has(objName)) {
          const props = helperMap.get(objName);
          if (props[propName]) {
            const info = props[propName];
            const args = node.arguments;

            // Skip if any argument contains a nested helper call (to avoid
            // overlapping replacements in a single pass)
            let hasNestedHelper = false;
            for (const arg of args) {
              if (containsHelperCall(arg, helperMap)) {
                hasNestedHelper = true;
                break;
              }
            }
            if (hasNestedHelper) return;

            if (info.type === 'binary' && args.length === 2) {
              const leftSrc = result.slice(args[0].start, args[0].end);
              const rightSrc = result.slice(args[1].start, args[1].end);
              // Keyword operators (in, instanceof) need spaces to avoid merging
              // with adjacent identifiers
              const op = /^[a-z]+$/i.test(info.operator)
                ? ' ' + info.operator + ' '
                : info.operator;
              const replacement = '(' + leftSrc + op + rightSrc + ')';
              replacements.push({ start: node.start, end: node.end, replacement });
            } else if (info.type === 'unary' && args.length === 1) {
              const argSrc = result.slice(args[0].start, args[0].end);
              const replacement = '(' + info.operator + argSrc + ')';
              replacements.push({ start: node.start, end: node.end, replacement });
            } else if (info.type === 'call_passthrough' && args.length >= 2) {
              const fnSrc = result.slice(args[0].start, args[0].end);
              const callArgs = args.slice(1).map(a => result.slice(a.start, a.end));
              const replacement = fnSrc + '(' + callArgs.join(',') + ')';
              replacements.push({ start: node.start, end: node.end, replacement });
            }
          }
        }
      }
    }

    walkForCalls(ast);

    if (replacements.length === 0) break;

    // Sort by start position descending and apply
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
      result = result.slice(0, r.start) + r.replacement + result.slice(r.end);
    }
    totalReplaced += replacements.length;
  }

  return { result, replaced: totalReplaced };
}

/**
 * Check if an AST node contains a helper call (for nesting detection).
 */
function containsHelperCall(node, helperMap) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'CallExpression' && node.callee &&
      node.callee.type === 'MemberExpression') {
    const objName = node.callee.object.type === 'Identifier' ?
      node.callee.object.name : null;
    let propName = null;
    if (node.callee.property.type === 'Identifier') {
      propName = node.callee.property.name;
    } else if (node.callee.property.type === 'Literal') {
      propName = node.callee.property.value;
    }
    if (objName && propName && helperMap.has(objName)) {
      const props = helperMap.get(objName);
      if (props[propName] && (props[propName].type === 'binary' ||
          props[propName].type === 'unary' ||
          props[propName].type === 'call_passthrough')) {
        return true;
      }
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) {
          if (containsHelperCall(child, helperMap)) return true;
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      if (containsHelperCall(val, helperMap)) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Deobfuscate a tdc.js source file.
 *
 * @param {string} source - The full source code
 * @returns {{ deobfuscated: string, isObfuscated: boolean, stats: Object|null }}
 */
function deobfuscate(source) {
  if (!isObfuscated(source)) {
    return { deobfuscated: source, isObfuscated: false, stats: null };
  }

  let ast;
  try {
    ast = acorn.parse(source, { ecmaVersion: 2020, sourceType: 'script' });
  } catch (e) {
    throw new Error('Failed to parse obfuscated source: ' + e.message);
  }

  // Step 1: Extract and eval decoder bootstrap
  const bootstrap = extractDecoderBootstrap(source, ast);
  if (!bootstrap) {
    throw new Error('Could not find decoder bootstrap in obfuscated source');
  }

  const resolverFn = evalDecoder(bootstrap.bootstrapSource, bootstrap.globalDecoderName);

  // Step 2: Find all decoder aliases throughout the code
  const decoderNames = findAllDecoderAliases(
    source, ast, bootstrap.globalDecoderName, bootstrap.aliasName
  );

  // Step 3: Build decoder lookup table
  const decoderMap = buildDecoderMap(source, decoderNames, resolverFn);

  // Step 4: Replace decoder calls in source
  const { result: decodedSource, replaced: decoderReplaced } =
    replaceDecoderCalls(source, decoderNames, decoderMap);

  // Step 5: Resolve helper wrapper objects (after decoder resolution)
  let helperAst;
  try {
    helperAst = acorn.parse(decodedSource, { ecmaVersion: 2020, sourceType: 'script' });
  } catch (e) {
    // If re-parse fails, return decoder-only result
    return {
      deobfuscated: decodedSource,
      isObfuscated: true,
      stats: {
        decoderEntries: decoderMap.size,
        decoderReplacements: decoderReplaced,
        helperReplacements: 0,
        helperObjects: 0,
        helpersDirect: 0,
        helpersDelegate: 0,
        helpersUnresolved: 0
      }
    };
  }

  const helpers = resolveHelperObject(decodedSource, helperAst);

  // Collect stats about helper resolution
  let helpersDirect = 0;
  let helpersDelegate = 0;
  let helpersUnresolved = 0;

  for (const h of helpers) {
    for (const [, info] of Object.entries(h.properties)) {
      if (info.type === 'binary' || info.type === 'unary' ||
          info.type === 'call_passthrough') {
        helpersDirect++;
      } else if (info.type === 'delegate') {
        helpersDelegate++;
      } else if (info.type === 'unknown') {
        helpersUnresolved++;
      }
    }
  }

  // Step 6: Replace helper wrapper calls
  let helperReplaced = 0;
  let finalSource = decodedSource;
  if (helpers.length > 0) {
    const helperResult = replaceHelperCalls(decodedSource, helpers);
    finalSource = helperResult.result;
    helperReplaced = helperResult.replaced;
  }

  // Verify the result parses correctly
  try {
    acorn.parse(finalSource, { ecmaVersion: 2020, sourceType: 'script' });
  } catch (e) {
    // If final parse fails, fall back to decoder-only result
    return {
      deobfuscated: decodedSource,
      isObfuscated: true,
      stats: {
        decoderEntries: decoderMap.size,
        decoderReplacements: decoderReplaced,
        helperReplacements: 0,
        helperObjects: helpers.length,
        helpersDirect,
        helpersDelegate,
        helpersUnresolved,
        parseError: e.message
      }
    };
  }

  return {
    deobfuscated: finalSource,
    isObfuscated: true,
    stats: {
      decoderEntries: decoderMap.size,
      decoderReplacements: decoderReplaced,
      helperReplacements: helperReplaced,
      helperObjects: helpers.length,
      helpersDirect,
      helpersDelegate,
      helpersUnresolved
    }
  };
}

module.exports = { deobfuscate };
