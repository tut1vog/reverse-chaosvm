'use strict';

const acorn = require('acorn');

/**
 * Recursively walk an AST node, skipping nodes of given types.
 * Calls visitor(node, parent) for every node.
 */
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

/**
 * Find the first node matching a predicate via depth-first search.
 */
function findFirst(node, predicate, skipTypes) {
  let result = null;
  function search(n, parent) {
    if (result) return;
    if (!n || typeof n !== 'object') return;
    if (predicate(n, parent)) { result = n; return; }
    for (const key of Object.keys(n)) {
      if (result) return;
      if (key === 'type') continue;
      const val = n[key];
      if (Array.isArray(val)) {
        for (const child of val) {
          if (result) return;
          if (child && typeof child === 'object' && child.type) {
            if (skipTypes && skipTypes.has(child.type)) continue;
            search(child, n);
          }
        }
      } else if (val && typeof val === 'object' && val.type) {
        if (skipTypes && skipTypes.has(val.type)) continue;
        search(val, n);
      }
    }
  }
  search(node, null);
  return result;
}

/**
 * Find all nodes matching a predicate.
 */
function findAll(node, predicate, skipTypes) {
  const results = [];
  walk(node, (n) => { if (predicate(n)) results.push(n); }, null, skipTypes);
  return results;
}

/**
 * Find the SwitchStatement with the most cases (the VM dispatch switch).
 */
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

/**
 * Find the innermost function that directly contains the VM switch
 * (i.e., the switch is inside this function but not inside a nested function).
 */
function findDispatchFunction(ast, switchNode) {
  const switchStart = switchNode.start;
  const switchEnd = switchNode.end;

  // Collect all function nodes that contain the switch range
  const candidates = [];
  walk(ast, (node) => {
    if ((node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') &&
        node.body && node.start <= switchStart && node.end >= switchEnd) {
      candidates.push(node);
    }
  });

  // The innermost function is the one with the smallest range
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (a.end - a.start) - (b.end - b.start));
  return candidates[0];
}

/**
 * Extract bytecode and pc variable names from the switch discriminant.
 * The discriminant is bytecodeArray[++pcVar].
 */
function extractBytecodeAndPc(switchNode) {
  const disc = switchNode.discriminant;
  if (disc.type !== 'MemberExpression' || !disc.computed) return null;

  const obj = disc.object;
  const prop = disc.property;

  if (obj.type !== 'Identifier') return null;
  if (prop.type !== 'UpdateExpression' || prop.operator !== '++' || !prop.prefix) return null;
  if (prop.argument.type !== 'Identifier') return null;

  return {
    bytecode: obj.name,
    pc: prop.argument.name
  };
}

/**
 * Extract the register file variable name.
 * In catch blocks and case handlers, the regs array appears as the array
 * that is indexed by bytecodeArray[++pc] (e.g., regs[bytecodeArray[++pc]]).
 * We look for patterns like: someArray[bytecodeVar[++pcVar]] in assignments.
 */
function extractRegs(switchNode, bytecodeVar, pcVar) {
  const candidates = {};

  walk(switchNode, (node) => {
    // Look for MemberExpression where:
    //   object is Identifier (candidate regs)
    //   property is MemberExpression: bytecodeVar[++pcVar]
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

  // The register file will appear many times across case handlers
  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(candidates)) {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }
  return bestName;
}

/**
 * Extract the thisCtx variable from .call() expressions in case handlers.
 * CALLQ-type handlers use: regs[a].call(thisCtx, ...) where thisCtx is a plain Identifier
 * (not a regs[bytecode[++pc]] access).
 */
function extractThisCtx(switchNode, bytecodeVar, pcVar, regsVar) {
  const candidates = {};

  walk(switchNode, (node) => {
    if (node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'call' &&
        node.arguments.length >= 1) {
      // The callee object should be regs[bytecode[++pc]]
      const calleeObj = node.callee.object;
      if (calleeObj.type === 'MemberExpression' && calleeObj.computed &&
          calleeObj.object.type === 'Identifier' && calleeObj.object.name === regsVar) {
        // First argument is the thisCtx candidate if it's a plain Identifier
        const firstArg = node.arguments[0];
        if (firstArg.type === 'Identifier' &&
            firstArg.name !== regsVar &&
            firstArg.name !== bytecodeVar &&
            firstArg.name !== pcVar) {
          candidates[firstArg.name] = (candidates[firstArg.name] || 0) + 1;
        }
      }
    }
  });

  let bestName = null;
  let bestCount = 0;
  for (const [name, count] of Object.entries(candidates)) {
    if (count > bestCount) {
      bestCount = count;
      bestName = name;
    }
  }
  return bestName;
}

/**
 * Extract catchStack and excVal from the TryStatement that wraps the switch.
 *
 * The catch block has this structure:
 *   catch(param) {
 *     if (catchStack.length > 0) { ... }
 *     excVal = param;
 *     ...
 *     pc = catchStack.pop();
 *   }
 *
 * We find the TryStatement containing the switch, then look in the catch handler for:
 * - An identifier that has .length and .pop() => catchStack
 * - An assignment catchParam => excVal (excVal = catchParam)
 */
function extractCatchVars(dispatchFn, switchNode) {
  // Find the TryStatement in the dispatch function that contains the switch
  const tryNode = findFirst(dispatchFn.body, (node) => {
    if (node.type !== 'TryStatement') return false;
    return node.block.start <= switchNode.start && node.block.end >= switchNode.end;
  }, new Set(['FunctionExpression', 'FunctionDeclaration']));

  if (!tryNode || !tryNode.handler) return { catchStack: null, excVal: null };

  const handler = tryNode.handler;
  const catchParam = handler.param ? handler.param.name : null;
  const catchBody = handler.body;

  let catchStack = null;
  let excVal = null;

  // Find catchStack: the variable whose .pop() result is assigned to the pc variable.
  // Pattern: pc = catchStack.pop()
  // We need the pcVar name, extract it from the switch discriminant passed via dispatchFn context.
  // Instead, look for assignment: identifier = someArray.pop() where the array also has .length checks.
  walk(catchBody, (node) => {
    if (node.type === 'AssignmentExpression' &&
        node.operator === '=' &&
        node.left.type === 'Identifier' &&
        node.right.type === 'CallExpression' &&
        node.right.callee.type === 'MemberExpression' &&
        node.right.callee.property.type === 'Identifier' &&
        node.right.callee.property.name === 'pop' &&
        node.right.callee.object.type === 'Identifier') {
      // This is: someVar = someArray.pop()
      // The catchStack is the array whose pop result goes to pc
      catchStack = node.right.callee.object.name;
    }
  });

  // Find excVal: assignment of catch param to a variable
  // Pattern: excVal = catchParam
  if (catchParam) {
    walk(catchBody, (node) => {
      if (node.type === 'AssignmentExpression' &&
          node.operator === '=' &&
          node.left.type === 'Identifier' &&
          node.right.type === 'Identifier' &&
          node.right.name === catchParam) {
        excVal = node.left.name;
      }
    });
  }

  return { catchStack, excVal };
}

/**
 * Parse a tdc.js source file and identify all VM variables by structural role.
 *
 * @param {string} sourceCode - The full source code of a tdc.js build
 * @returns {Object} result
 * @returns {Object} result.variables - Map of role names to variable names
 * @returns {Object} result.switchNode - The AST SwitchStatement node
 * @returns {number} result.caseCount - Number of cases in the switch
 * @returns {Object} result.dispatchFunction - The AST FunctionExpression/Declaration node
 */
function parseVmFunction(sourceCode) {
  const ast = acorn.parse(sourceCode, { ecmaVersion: 2020, sourceType: 'script' });

  // Step 1: Find the VM dispatch switch (the one with 90+ cases)
  const switchNode = findVmSwitch(ast);
  if (!switchNode || switchNode.cases.length < 50) {
    throw new Error('Could not find VM dispatch switch statement');
  }

  // Step 2: Find the dispatch function
  const dispatchFunction = findDispatchFunction(ast, switchNode);
  if (!dispatchFunction) {
    throw new Error('Could not find dispatch function containing the switch');
  }

  // Step 3: Extract bytecode and pc from switch discriminant
  const bcPc = extractBytecodeAndPc(switchNode);
  if (!bcPc) {
    throw new Error('Could not extract bytecode/pc from switch discriminant');
  }

  // Step 4: Extract regs from case handler patterns
  const regs = extractRegs(switchNode, bcPc.bytecode, bcPc.pc);
  if (!regs) {
    throw new Error('Could not identify register file variable');
  }

  // Step 5: Extract thisCtx from .call() patterns
  const thisCtx = extractThisCtx(switchNode, bcPc.bytecode, bcPc.pc, regs);
  if (!thisCtx) {
    throw new Error('Could not identify thisCtx variable');
  }

  // Step 6: Extract catchStack and excVal from the try-catch wrapper
  const { catchStack, excVal } = extractCatchVars(dispatchFunction, switchNode);
  if (!catchStack) {
    throw new Error('Could not identify catchStack variable');
  }
  if (!excVal) {
    throw new Error('Could not identify excVal variable');
  }

  return {
    variables: {
      bytecode: bcPc.bytecode,
      pc: bcPc.pc,
      regs,
      thisCtx,
      catchStack,
      excVal
    },
    switchNode,
    caseCount: switchNode.cases.length,
    dispatchFunction
  };
}

module.exports = { parseVmFunction };
