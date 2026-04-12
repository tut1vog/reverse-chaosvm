'use strict';

/**
 * ChaosVM Opcode Auto-Mapper
 *
 * Takes the output of vm-parser.parseVmFunction() and maps each switch/case
 * handler to a known semantic mnemonic by analyzing the AST structure.
 *
 * Works across all ChaosVM templates — variable names differ per build,
 * but structural patterns are invariant.
 */

// ---------------------------------------------------------------------------
// AST walking helpers
// ---------------------------------------------------------------------------

function walk(node, visitor, parent) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const child of val) {
        if (child && typeof child === 'object' && child.type) {
          walk(child, visitor, node);
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      walk(val, visitor, node);
    }
  }
}

function sourceOf(node, src) {
  if (!node || node.start == null || node.end == null) return '';
  return src.slice(node.start, node.end);
}

// ---------------------------------------------------------------------------
// Pattern analysis helpers
// ---------------------------------------------------------------------------

/**
 * Count bytecode reads (bc[++pc]) in an AST subtree.
 * Returns { total, asRegIndex, asImmediate }
 *   asRegIndex: regs[bc[++pc]] — the read is used as a register index
 *   asImmediate: bc[++pc] used directly (not inside regs[])
 */
function countBytecodeReads(node, vars) {
  let asRegIndex = 0;
  let asImmediate = 0;

  walk(node, (n, parent) => {
    if (isBcRead(n, vars)) {
      // Check if parent is regs[THIS_NODE]
      if (parent &&
          parent.type === 'MemberExpression' &&
          parent.computed &&
          parent.property === n &&
          isIdent(parent.object, vars.regs)) {
        asRegIndex++;
      } else {
        asImmediate++;
      }
    }
  });

  return { total: asRegIndex + asImmediate, asRegIndex, asImmediate };
}

/** Is this node bytecodeVar[++pcVar]? */
function isBcRead(node, vars) {
  return node.type === 'MemberExpression' &&
    node.computed &&
    isIdent(node.object, vars.bytecode) &&
    node.property.type === 'UpdateExpression' &&
    node.property.operator === '++' &&
    node.property.prefix &&
    isIdent(node.property.argument, vars.pc);
}

/** Is this node bytecodeVar[pcVar + 1] (peek)? */
function isBcPeek(node, vars) {
  if (node.type !== 'MemberExpression' || !node.computed) return false;
  if (!isIdent(node.object, vars.bytecode)) return false;
  const prop = node.property;
  if (prop.type !== 'BinaryExpression' || prop.operator !== '+') return false;
  return (isIdent(prop.left, vars.pc) && prop.right.type === 'Literal' && prop.right.value === 1);
}

/** Is this node regs[bc[++pc]]? */
function isRegRead(node, vars) {
  return node.type === 'MemberExpression' &&
    node.computed &&
    isIdent(node.object, vars.regs) &&
    isBcRead(node.property, vars);
}

function isIdent(node, name) {
  return node && node.type === 'Identifier' && node.name === name;
}

/**
 * Get the "effective" statements of a case body, excluding break statements.
 */
function getEffectiveStatements(consequent) {
  return consequent.filter(s => s.type !== 'BreakStatement');
}

/**
 * Unwrap an ExpressionStatement to its expression.
 */
function unwrapExpr(stmt) {
  if (stmt.type === 'ExpressionStatement') return stmt.expression;
  return null;
}

/**
 * Check if an expression is an assignment (=) and return { left, right }.
 */
function asAssign(expr) {
  if (expr && expr.type === 'AssignmentExpression' && expr.operator === '=') {
    return { left: expr.left, right: expr.right };
  }
  return null;
}

/**
 * Check if an expression is a compound assignment (+=) and return { left, right }.
 */
function asCompoundAssign(expr, op) {
  if (expr && expr.type === 'AssignmentExpression' && expr.operator === op) {
    return { left: expr.left, right: expr.right };
  }
  return null;
}

/**
 * Check if node is a .call() CallExpression.
 * Returns { callee, thisArg, args } or null.
 */
function asCallExpr(node) {
  if (node && node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'call') {
    return {
      callee: node.callee.object,
      thisArg: node.arguments[0],
      args: node.arguments.slice(1)
    };
  }
  return null;
}

/**
 * Check if node is a .apply() CallExpression.
 */
function isApplyCall(node) {
  return node && node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'apply';
}

/**
 * Check if node is a `new X(...)` expression and return arg count.
 */
function asNewExpr(node) {
  if (node && node.type === 'NewExpression') {
    return { callee: node.callee, argCount: node.arguments.length };
  }
  return null;
}

/**
 * Check if a statement is a for-loop over the bytecode (variable-width opcode).
 */
function isForLoop(stmt) {
  return stmt && stmt.type === 'ForStatement';
}

/**
 * Check if a statement is a for-in loop.
 */
function isForInLoop(stmt) {
  return stmt && stmt.type === 'ForInStatement';
}

/**
 * Check if an expression is `catchStack.push(...)`.
 */
function isCatchPush(expr, vars) {
  if (!expr || expr.type !== 'CallExpression') return false;
  const callee = expr.callee;
  return callee.type === 'MemberExpression' &&
    isIdent(callee.object, vars.catchStack) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'push';
}

/**
 * Check if an expression is `catchStack.pop()`.
 */
function isCatchPop(expr, vars) {
  if (!expr || expr.type !== 'CallExpression') return false;
  const callee = expr.callee;
  return callee.type === 'MemberExpression' &&
    isIdent(callee.object, vars.catchStack) &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'pop';
}

/**
 * Check if a statement is a try-catch (wrapping Object.defineProperty).
 */
function isTryCatch(stmt) {
  return stmt && stmt.type === 'TryStatement';
}

/**
 * Check if a right-hand side is a binary operation between two register reads.
 */
function isBinaryRR(expr, vars) {
  if (expr.type !== 'BinaryExpression') return false;
  return isRegRead(expr.left, vars) && isRegRead(expr.right, vars);
}

/**
 * Check if a right-hand side is a binary operation with one register and one immediate.
 * Returns 'RK' if left is reg and right is immediate, 'KR' if reversed, or null.
 */
function isBinaryRK(expr, vars) {
  if (expr.type !== 'BinaryExpression') return null;
  const leftReg = isRegRead(expr.left, vars);
  const rightReg = isRegRead(expr.right, vars);
  const leftBc = isBcRead(expr.left, vars);
  const rightBc = isBcRead(expr.right, vars);

  if (leftReg && rightBc) return 'RK';
  if (leftBc && rightReg) return 'KR';
  return null;
}

/**
 * Check if expr is `String.fromCharCode(bc[++pc])`.
 */
function isFromCharCode(expr, vars) {
  if (expr.type !== 'CallExpression') return false;
  const callee = expr.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (!callee.property || callee.property.name !== 'fromCharCode') return false;
  if (expr.arguments.length !== 1) return false;
  return isBcRead(expr.arguments[0], vars);
}

/**
 * Check if a statement is `i[Y[++C]] += String.fromCharCode(Y[++C])`.
 */
function isStrAppend(stmt, vars) {
  const expr = unwrapExpr(stmt);
  const assign = asCompoundAssign(expr, '+=');
  if (!assign) return false;
  return isRegRead(assign.left, vars) && isFromCharCode(assign.right, vars);
}

/**
 * Check if expression is `typeof R`.
 */
function isTypeofReg(expr, vars) {
  return expr.type === 'UnaryExpression' && expr.operator === 'typeof' && isRegRead(expr.argument, vars);
}

// ---------------------------------------------------------------------------
// Main mapper
// ---------------------------------------------------------------------------

/**
 * Map all switch cases to known mnemonics.
 *
 * @param {Object} parseResult - Output of vm-parser.parseVmFunction()
 * @returns {{ opcodeTable: Object, unmapped: Array, notes: Array }}
 */
function mapOpcodes(parseResult, sourceCode) {
  const { variables: vars, switchNode } = parseResult;
  const opcodeTable = {};
  const unmapped = [];
  const notes = [];
  const src = sourceCode || '';

  const cases = switchNode.cases;

  for (const caseNode of cases) {
    if (!caseNode.test) continue; // skip default
    const caseNum = caseNode.test.value;
    const stmts = getEffectiveStatements(caseNode.consequent);

    const mnemonic = identifyCase(stmts, vars);

    if (mnemonic) {
      opcodeTable[String(caseNum)] = mnemonic;
    } else {
      const bodySource = src
        ? stmts.map(s => sourceOf(s, src)).join('\n').trim()
        : '';
      unmapped.push({
        caseNumber: caseNum,
        reason: 'No pattern matched',
        bodySource
      });
    }
  }

  const mapped = Object.keys(opcodeTable).length;
  notes.push(`Mapped ${mapped}/${cases.length} cases`);
  if (unmapped.length > 0) {
    notes.push(`${unmapped.length} unmapped cases`);
  }

  return { opcodeTable, unmapped, notes };
}

/**
 * Identify the mnemonic for a case body (array of effective statements).
 */
function identifyCase(stmts, vars) {
  if (stmts.length === 0) {
    return null;
  }

  // --- 0 effective statements ---
  // TRY_POP: just F.pop();
  if (stmts.length === 1) {
    const expr = unwrapExpr(stmts[0]);
    if (expr && isCatchPop(expr, vars)) {
      return 'TRY_POP';
    }
  }

  // Check for variable-width (for-loop) patterns first
  const hasForLoop = stmts.some(s => isForLoop(s));
  const hasForInLoop = stmts.some(s => isForInLoop(s));
  const hasTryCatch = stmts.some(s => isTryCatch(s));

  if (hasForInLoop) {
    return identifyEnumerate(stmts, vars);
  }

  if (hasForLoop && hasTryCatch) {
    return identifyFuncCreate(stmts, vars);
  }

  if (hasForLoop) {
    return identifyApply(stmts, vars);
  }

  // Check for bigint conditional (TO_NUMBER / INC_BIGINT): ternary with "bigint" ==
  const bigintResult = identifyBigintPattern(stmts, vars);
  if (bigintResult) return bigintResult;

  // Check for control flow patterns
  const hasReturn = stmts.some(s => s.type === 'ReturnStatement');
  const hasThrow = stmts.some(s => s.type === 'ThrowStatement');
  const hasIf = stmts.some(s => s.type === 'IfStatement');

  if (hasThrow) {
    return 'THROW';
  }

  if (hasIf) {
    return identifyConditional(stmts, vars);
  }

  if (hasReturn) {
    return identifyReturn(stmts, vars);
  }

  // All remaining are expression statements
  return identifyExpressionCase(stmts, vars);
}

// ---------------------------------------------------------------------------
// Pattern identifiers
// ---------------------------------------------------------------------------

/**
 * Identify bigint-conditional patterns (TO_NUMBER, INC_BIGINT).
 * These have a ternary expression with "bigint" == typeof check.
 */
function identifyBigintPattern(stmts, vars) {
  const firstExpr = unwrapExpr(stmts[0]);
  if (!firstExpr) return null;
  const assign = asAssign(firstExpr);
  if (!assign || assign.right.type !== 'ConditionalExpression') return null;
  if (!hasBigintCheck(assign.right.test)) return null;

  // TO_NUMBER: single statement with bigint conditional
  if (stmts.length === 1) return 'TO_NUMBER';
  // INC_BIGINT: 3 statements — conditional + inc + mov
  if (stmts.length === 3) return 'INC_BIGINT';
  return null;
}

/**
 * Identify ENUMERATE: for-in loop.
 * Pattern: h = []; for (w in R(a)) h.push(w); R(b) = h;
 */
function identifyEnumerate(stmts, vars) {
  return 'ENUMERATE';
}

/**
 * Identify FUNC_CREATE variants: for-loop + try-catch (Object.defineProperty).
 * FUNC_CREATE_A: starts with str_append, ends with prop_set (regs indexed)
 * FUNC_CREATE_B: starts with prop_set_k, ends with prop_set_k
 * FUNC_CREATE_C: starts directly with for-loop (no prefix)
 */
function identifyFuncCreate(stmts, vars) {
  // Check what the first statement is
  const first = stmts[0];

  // FUNC_CREATE_C: first statement is for-loop or assignment to h
  if (isForLoop(first)) {
    return 'FUNC_CREATE_C';
  }

  const firstExpr = unwrapExpr(first);
  if (!firstExpr) {
    // If first statement is an assignment to h (h = [])
    // This is also FUNC_CREATE_C pattern
    return 'FUNC_CREATE_C';
  }

  // FUNC_CREATE_A: starts with str_append (i[R] += String.fromCharCode(K))
  if (isStrAppend(first, vars)) {
    return 'FUNC_CREATE_A';
  }

  // FUNC_CREATE_B: starts with prop_set_k (i[R][K] = i[R])
  const assign = asAssign(firstExpr);
  if (assign && assign.left.type === 'MemberExpression') {
    return 'FUNC_CREATE_B';
  }

  // Fallback: check if first stmt is h = [] (ExpressionStatement with assignment to h)
  if (assign && assign.left.type === 'Identifier') {
    return 'FUNC_CREATE_C';
  }

  return null;
}

/**
 * Identify APPLY: for-loop without try-catch.
 * Pattern: h = []; for (w = K; w > 0; w--) h.push(R); R(a) = R(b).apply(R(c), h)
 */
function identifyApply(stmts, vars) {
  // Check for .apply() call
  for (const stmt of stmts) {
    const expr = unwrapExpr(stmt);
    const assign = asAssign(expr);
    if (assign && isApplyCall(assign.right)) {
      return 'APPLY';
    }
  }
  return null;
}

/**
 * Identify conditional patterns (if statements).
 * - CJMP: C += R(a) ? K : K
 * - ITER_SHIFT: h = R; if (R = !!h.length) R = h.shift(); else ++C
 * - INC_BIGINT / TO_NUMBER: bigint == typeof ...
 */
function identifyConditional(stmts, vars) {
  // Check for CJMP: C += R ? K : K (single statement with conditional expression)
  if (stmts.length === 1) {
    const expr = unwrapExpr(stmts[0]);
    if (expr) {
      const assign = asCompoundAssign(expr, '+=');
      if (assign && isIdent(assign.left, vars.pc)) {
        return 'CJMP';
      }
    }
  }

  // Check for ITER_SHIFT: h = R; if (R = !!h.length) R = h.shift(); else ++C
  // Has an if statement + assignment before it
  if (stmts.length === 2) {
    if (stmts[1].type === 'IfStatement') {
      // Check if the if condition involves .length
      return 'ITER_SHIFT';
    }
  }

  // Check for INC_BIGINT and TO_NUMBER: "bigint" == typeof ...
  // These have a conditional expression with typeof check
  const firstExpr = unwrapExpr(stmts[0]);
  if (firstExpr) {
    const assign = asAssign(firstExpr);
    if (assign && assign.right.type === 'ConditionalExpression') {
      // Check for "bigint" == typeof pattern in the test
      const test = assign.right.test;
      if (hasBigintCheck(test)) {
        // INC_BIGINT has 3 statements, TO_NUMBER has 1
        if (stmts.length >= 3) return 'INC_BIGINT';
        return 'TO_NUMBER';
      }
    }
  }

  return null;
}

/**
 * Check if an expression contains a "bigint" == typeof comparison.
 */
function hasBigintCheck(expr) {
  if (expr.type === 'BinaryExpression' && expr.operator === '==') {
    if (expr.left.type === 'Literal' && expr.left.value === 'bigint') return true;
    if (expr.right.type === 'Literal' && expr.right.value === 'bigint') return true;
  }
  return false;
}

/**
 * Identify return patterns.
 */
function identifyReturn(stmts, vars) {
  const returnIdx = stmts.findIndex(s => s.type === 'ReturnStatement');

  // RET_BARE: single return statement
  if (stmts.length === 1 && returnIdx === 0) {
    return 'RET_BARE';
  }

  // Check for catchStack operations before the return
  const hasCatchPop = stmts.some(s => {
    const expr = unwrapExpr(s);
    return expr && isCatchPop(expr, vars);
  });

  // Check for prop_set before return (exclude register writes like i[Y[++C]])
  const hasPropSet = stmts.some(s => {
    const expr = unwrapExpr(s);
    if (!expr) return false;
    const assign = asAssign(expr);
    if (!assign) return false;
    if (assign.left.type !== 'MemberExpression') return false;
    // Exclude register writes: regs[bc[++pc]] is not a prop_set
    if (isRegRead(assign.left, vars)) return false;
    return true;
  });

  // Check for thisCtx assignment before return
  const hasThisAssign = stmts.some(s => {
    const expr = unwrapExpr(s);
    if (!expr) return false;
    const assign = asAssign(expr);
    if (!assign) return false;
    return isIdent(assign.right, vars.thisCtx) && isRegRead(assign.left, vars);
  });

  if (hasCatchPop) {
    return 'RET_CLEANUP';
  }

  // SET_RET_Q: prop_set + thisCtx assign + return (5 operands)
  // Pattern: R(a)[R(b)] = R(c); R(d) = Q; return R(e)
  if (stmts.length === 3 && hasPropSet && hasThisAssign) {
    // Check if the prop_set uses register-indexed access (not K-indexed)
    const propSetExpr = unwrapExpr(stmts[0]);
    const propSetAssign = asAssign(propSetExpr);
    if (propSetAssign && propSetAssign.left.type === 'MemberExpression' &&
        propSetAssign.left.computed && isRegRead(propSetAssign.left.property, vars)) {
      return 'SET_RET_Q';
    }
  }

  // SET_RET: R(a)[K] = R(b); return R(c) — 2 stmts, prop_set with K index
  if (stmts.length === 2 && hasPropSet) {
    const propSetExpr = unwrapExpr(stmts[0]);
    const propSetAssign = asAssign(propSetExpr);
    if (propSetAssign && propSetAssign.left.type === 'MemberExpression') {
      return 'SET_RET';
    }
  }

  // RET: R(a) = Q; return R(b) — 2 stmts, thisCtx assign
  if (stmts.length === 2 && hasThisAssign) {
    return 'RET';
  }

  return null;
}

/**
 * Identify cases that are all expression statements (the majority).
 */
function identifyExpressionCase(stmts, vars) {
  // Gather sub-operation signatures for each statement
  const ops = stmts.map(s => classifyStatement(s, vars));

  if (ops.includes(null)) return null;

  // Single statement cases
  if (ops.length === 1) {
    return identifySingleOp(ops[0], stmts[0], vars);
  }

  // Multi-statement cases — match compound patterns
  return identifyCompound(ops, stmts, vars);
}

/**
 * Classify a single statement into a sub-operation descriptor.
 * Returns a string tag like 'binary_RR_+', 'call_Q_1', 'prop_get', etc.
 */
function classifyStatement(stmt, vars) {
  // Expression statement
  const expr = unwrapExpr(stmt);
  if (expr) return classifyExpression(expr, vars);

  // Return statement
  if (stmt.type === 'ReturnStatement') return 'return';

  // Throw statement
  if (stmt.type === 'ThrowStatement') return 'throw';

  return null;
}

/**
 * Classify an expression into a sub-operation descriptor.
 */
function classifyExpression(expr, vars) {
  // Assignment: most common
  const assign = asAssign(expr);
  if (assign) return classifyAssignment(assign, vars);

  // Compound assignment (+=)
  const plusAssign = asCompoundAssign(expr, '+=');
  if (plusAssign) {
    // C += ... => jump or conditional jump
    if (isIdent(plusAssign.left, vars.pc)) {
      // C += R ? K : K => CJMP (ternary/conditional on RHS)
      if (plusAssign.right.type === 'ConditionalExpression') return 'cjmp';
      return 'jmp';
    }

    // R += String.fromCharCode(K) => str_append
    if (isRegRead(plusAssign.left, vars) && isFromCharCode(plusAssign.right, vars)) {
      return 'str_append';
    }
    return 'compound_assign';
  }

  // catchStack.push(...)
  if (isCatchPush(expr, vars)) return 'catch_push';

  // catchStack.pop()
  if (isCatchPop(expr, vars)) return 'catch_pop';

  // Update expression (++C)
  if (expr.type === 'UpdateExpression') return 'update';

  return null;
}

/**
 * Classify an assignment expression (lhs = rhs).
 */
function classifyAssignment(assign, vars) {
  const { left, right } = assign;

  // LHS is regs[bc[++pc]] (register write)
  if (isRegRead(left, vars)) {
    return 'reg_write:' + classifyRhs(right, vars);
  }

  // LHS is regs[bc[++pc]][...] (property set)
  if (left.type === 'MemberExpression' && isRegRead(left.object, vars)) {
    if (left.computed) {
      if (isRegRead(left.property, vars)) {
        return 'prop_set_RR'; // regs[a][regs[b]] = ...
      }
      if (isBcRead(left.property, vars)) {
        return 'prop_set_RK'; // regs[a][K] = ...
      }
    }
    return 'prop_set_other';
  }

  // LHS is Identifier (e.g., h = ...)
  if (left.type === 'Identifier') {
    return 'local_assign:' + left.name;
  }

  return 'assign_other';
}

/**
 * Classify a right-hand side value.
 */
function classifyRhs(rhs, vars) {
  // Register read: i[Y[++C]]
  if (isRegRead(rhs, vars)) return 'reg';

  // Immediate: Y[++C]
  if (isBcRead(rhs, vars)) return 'imm';

  // null literal
  if (rhs.type === 'Literal' && rhs.value === null) return 'null';

  // Empty string literal
  if (rhs.type === 'Literal' && rhs.value === '') return 'empty_str';

  // thisCtx
  if (isIdent(rhs, vars.thisCtx)) return 'this';

  // excVal
  if (isIdent(rhs, vars.excVal)) return 'exc';

  // Object literal {}
  if (rhs.type === 'ObjectExpression' && rhs.properties.length === 0) return 'obj';

  // Array(K)
  if (rhs.type === 'CallExpression' && isIdent(rhs.callee, 'Array')) return 'array';

  // new expression
  const newExpr = asNewExpr(rhs);
  if (newExpr) return 'new_' + newExpr.argCount;

  // .call() expression
  const callExpr = asCallExpr(rhs);
  if (callExpr) {
    const thisArgType = classifyCallThisArg(callExpr.thisArg, vars);
    return 'call_' + thisArgType + '_' + callExpr.args.length;
  }

  // .apply() expression
  if (isApplyCall(rhs)) return 'apply';

  // Binary expression
  if (rhs.type === 'BinaryExpression') {
    const op = rhs.operator;
    if (isBinaryRR(rhs, vars)) return 'binary_RR_' + op;
    const rk = isBinaryRK(rhs, vars);
    if (rk === 'RK') return 'binary_RK_' + op;
    if (rk === 'KR') return 'binary_KR_' + op;

    // Special: i[R] in i[R]
    if (op === 'in') return 'binary_RR_in';

    return 'binary_other_' + op;
  }

  // Unary expressions
  if (rhs.type === 'UnaryExpression') {
    if (rhs.operator === '!' && isRegRead(rhs.argument, vars)) return 'not';
    if (rhs.operator === '-' && isRegRead(rhs.argument, vars)) return 'neg';
    if (rhs.operator === '+' && isRegRead(rhs.argument, vars)) return 'uplus';
    if (rhs.operator === 'typeof' && isRegRead(rhs.argument, vars)) return 'typeof';
    if (rhs.operator === 'delete') return 'delete';
    return 'unary_' + rhs.operator;
  }

  // Update: ++i[R] or --i[R]
  if (rhs.type === 'UpdateExpression' && rhs.prefix) {
    if (rhs.operator === '++') return 'inc';
    if (rhs.operator === '--') return 'dec';
  }

  // typeof
  if (rhs.type === 'UnaryExpression' && rhs.operator === 'typeof') return 'typeof';

  // Property access: R[R] or R[K]
  if (rhs.type === 'MemberExpression' && rhs.computed) {
    if (isRegRead(rhs.object, vars)) {
      if (isRegRead(rhs.property, vars)) return 'prop_get_RR';
      if (isBcRead(rhs.property, vars)) return 'prop_get_RK';
    }
  }

  // Conditional expression (ternary) — bigint check
  if (rhs.type === 'ConditionalExpression') return 'conditional';

  // String.fromCharCode — shouldn't appear as RHS in assignment but just in case
  if (isFromCharCode(rhs, vars)) return 'fromCharCode';

  return 'unknown';
}

/**
 * Classify the this argument of a .call() expression.
 */
function classifyCallThisArg(thisArg, vars) {
  if (isRegRead(thisArg, vars)) return 'R';
  if (isIdent(thisArg, vars.thisCtx)) return 'Q';
  return 'other';
}

// ---------------------------------------------------------------------------
// Single-statement identification
// ---------------------------------------------------------------------------

function identifySingleOp(op, stmt, vars) {
  // Direct pc manipulation
  if (op === 'jmp') return 'JMP';
  if (op === 'cjmp') return 'CJMP';
  if (op === 'catch_pop') return 'TRY_POP';
  if (op === 'catch_push') return 'CATCH_PUSH';
  if (op === 'throw') return 'THROW';
  if (op === 'return') return 'RET_BARE';
  if (op === 'str_append') return 'STR_APPEND';

  // Register writes
  if (op.startsWith('reg_write:')) {
    const rhsType = op.slice('reg_write:'.length);

    // Data movement
    if (rhsType === 'reg') return 'MOV';
    if (rhsType === 'imm') return 'LOAD_K';
    if (rhsType === 'null') return 'LOAD_NULL';
    if (rhsType === 'this') return 'LOAD_THIS';
    if (rhsType === 'exc') return 'LOAD_EXCEPTION';
    if (rhsType === 'empty_str') return 'STR_EMPTY';
    if (rhsType === 'obj') return 'OBJ_NEW';
    if (rhsType === 'array') return 'ARRAY';

    // Unary ops
    if (rhsType === 'not') return 'NOT';
    if (rhsType === 'neg') return 'NEG';
    if (rhsType === 'uplus') return 'UPLUS';
    if (rhsType === 'typeof') return 'TYPEOF';
    if (rhsType === 'inc') return 'INC';
    if (rhsType === 'dec') return 'DEC';

    // new expressions
    if (rhsType === 'new_0') return 'NEW_0';
    if (rhsType === 'new_1') return 'NEW_1';
    if (rhsType === 'new_2') return 'NEW_2';

    // Property access
    if (rhsType === 'prop_get_RR') return 'PROP_GET';
    if (rhsType === 'prop_get_RK') return 'PROP_GET_K';

    // Delete
    if (rhsType === 'delete') return 'DELETE';

    // Binary R op R
    if (rhsType.startsWith('binary_RR_')) {
      const op = rhsType.slice('binary_RR_'.length);
      return binaryRRMnemonic(op);
    }

    // Binary R op K
    if (rhsType.startsWith('binary_RK_')) {
      const op = rhsType.slice('binary_RK_'.length);
      return binaryRKMnemonic(op);
    }

    // Binary K op R (reversed: K - R = RSUB_K)
    if (rhsType.startsWith('binary_KR_')) {
      const op = rhsType.slice('binary_KR_'.length);
      if (op === '-') return 'RSUB_K';
      return null;
    }

    // Call with register this
    if (rhsType.startsWith('call_R_')) {
      const argCount = parseInt(rhsType.split('_')[2], 10);
      return callRMnemonic(argCount);
    }

    // Call with Q this
    if (rhsType.startsWith('call_Q_')) {
      const argCount = parseInt(rhsType.split('_')[2], 10);
      return callQMnemonic(argCount);
    }

    return null;
  }

  // Property set
  if (op === 'prop_set_RR') return 'PROP_SET';
  if (op === 'prop_set_RK') return 'PROP_SET_K';

  return null;
}

function binaryRRMnemonic(op) {
  const map = {
    '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
    '^': 'XOR', '|': 'OR', '<<': 'SHL', '>>': 'SHR',
    '>': 'GT', '<': 'LT', '==': 'EQ', '===': 'SEQ', 'in': 'IN',
  };
  return map[op] || null;
}

function binaryRKMnemonic(op) {
  const map = {
    '>>': 'SHR_K', '>>>': 'USHR_K', '&': 'AND_K', '|': 'OR_K', '<<': 'SHL_K',
    '+': 'ADD_K', '-': 'SUB_K',
    '>': 'GT_K', '<': 'LT_K', '>=': 'GE_K', '<=': 'LE_K', '==': 'EQ_K', '===': 'SEQ_K',
  };
  return map[op] || null;
}

function callRMnemonic(argCount) {
  const map = { 0: 'CALL_0', 1: 'CALL_1', 2: 'CALL_2', 3: 'CALL_3' };
  return map[argCount] || null;
}

function callQMnemonic(argCount) {
  const map = { 0: 'CALLQ_0', 1: 'CALLQ_1', 2: 'CALLQ_2', 3: 'CALLQ_3' };
  return map[argCount] || null;
}

// ---------------------------------------------------------------------------
// Multi-statement (compound) identification
// ---------------------------------------------------------------------------

function identifyCompound(ops, stmts, vars) {
  const key = ops.join(' | ');

  // 2-statement patterns
  if (ops.length === 2) {
    // MOV_2: reg = reg; reg = reg
    if (ops[0] === 'reg_write:reg' && ops[1] === 'reg_write:reg') return 'MOV_2';

    // STR_INIT: reg = ""; reg += String.fromCharCode(K)
    if (ops[0] === 'reg_write:empty_str' && ops[1] === 'str_append') return 'STR_INIT';

    // STR_APPEND_2: str_append; str_append
    if (ops[0] === 'str_append' && ops[1] === 'str_append') return 'STR_APPEND_2';

    // ARRAY_2: reg = Array(K); reg = Array(K)
    if (ops[0] === 'reg_write:array' && ops[1] === 'reg_write:array') return 'ARRAY_2';

    // PROP_GET_CONST: prop_get + load_k
    if (ops[0] === 'reg_write:prop_get_RR' && ops[1] === 'reg_write:imm') return 'PROP_GET_CONST';

    // TRY_PUSH: reg = reg; catch_push
    if (ops[0] === 'reg_write:reg' && ops[1] === 'catch_push') return 'TRY_PUSH';

    // COPY_SET could be 2 stmts: reg=reg; prop_set
    // Actually COPY_SET is: reg=reg; prop_set_RR (5 operands)
    if (ops[0] === 'reg_write:reg' && ops[1] === 'prop_set_RR') return 'COPY_SET';

    // PROP_GET_K_2: prop_get_k; prop_get_k
    if (ops[0] === 'reg_write:prop_get_RK' && ops[1] === 'reg_write:prop_get_RK') return 'PROP_GET_K_2';

    // STR_PROP: str_append; prop_get
    if (ops[0] === 'str_append' && ops[1] === 'reg_write:prop_get_RR') return 'STR_PROP';

    // STR_SET_K: str_append; prop_set_k
    if (ops[0] === 'str_append' && ops[1] === 'prop_set_RK') return 'STR_SET_K';

    // CALLQ_1_COPY: callq_1 + mov
    if (ops[0] === 'reg_write:call_Q_1' && ops[1] === 'reg_write:reg') return 'CALLQ_1_COPY';
  }

  // 3-statement patterns
  if (ops.length === 3) {
    // CALL_COMPLEX: reg = K; reg = call_Q_1; reg = reg
    if (ops[0] === 'reg_write:imm' && ops[1] === 'reg_write:call_Q_1' && ops[2] === 'reg_write:reg') return 'CALL_COMPLEX';

    // STR_OBJ_STR: str_append; reg = {}; reg = ""
    if (ops[0] === 'str_append' && ops[1] === 'reg_write:obj' && ops[2] === 'reg_write:empty_str') return 'STR_OBJ_STR';

    // PROP_STR: prop_get; reg = ""; str_append
    if (ops[0] === 'reg_write:prop_get_RR' && ops[1] === 'reg_write:empty_str' && ops[2] === 'str_append') return 'PROP_STR';

    // STR_SET_STR: str_append; prop_set_k; reg = ""
    if (ops[0] === 'str_append' && ops[1] === 'prop_set_RK' && ops[2] === 'reg_write:empty_str') return 'STR_SET_STR';

    // SET_GET_CONST: prop_set_RR; prop_get; load_k
    if (ops[0] === 'prop_set_RR' && ops[1] === 'reg_write:prop_get_RR' && ops[2] === 'reg_write:imm') return 'SET_GET_CONST';

    // EXC_TRY: reg = exc; reg = reg; catch_push
    if (ops[0] === 'reg_write:exc' && ops[1] === 'reg_write:reg' && ops[2] === 'catch_push') return 'EXC_TRY';

    // INC_BIGINT: conditional; reg = inc; reg = reg
    if (ops[0] === 'reg_write:conditional' && ops[1] === 'reg_write:inc' && ops[2] === 'reg_write:reg') return 'INC_BIGINT';
  }

  // 2-statement: PROP_CALL_1: prop_get + call_R_1
  if (ops.length === 2) {
    if (ops[0] === 'reg_write:prop_get_RR' && ops[1] === 'reg_write:call_R_1') return 'PROP_CALL_1';
  }

  return null;
}

module.exports = { mapOpcodes };
