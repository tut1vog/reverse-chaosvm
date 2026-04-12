'use strict';

/**
 * ChaosVM Call & Method Reconstruction (Task 3.3)
 *
 * Post-processing pass over folded block output that recognizes
 * PROP_GET + CALL statement pairs and merges them into natural
 * obj.method(args...) expressions.
 *
 * Reconstruction rules:
 * 1. Consecutive PROP_GET + CALL: rA = rB[rC]; rD = rA.call(rB, ...) → rD = rB.rC(...)
 * 2. String method names: use literal directly when available from string_build
 * 3. Compound PROP_CALL opcodes: normalize to method_call format
 * 4. Safety: only merge if method ref register (specific definition) is single-use
 * 5. thisArg must match object for valid method call
 *
 * Key insight for use-count: ChaosVM reuses registers heavily. A prop_get like
 * `r9 = r18[r9]` both reads and redefines r9. The use-count check must be
 * definition-aware: we count uses of the prop_get's DEFINITION of rA (uses
 * after position i until rA is redefined), not all uses of the register name.
 */

const { collectReads, renderExpr } = require('./expression-folder');

// ============================================================================
// Core: reconstructBlock
// ============================================================================

/**
 * Given a FoldedBlock (from expression-folder), returns a new block
 * with method call patterns merged.
 *
 * @param {object} foldedBlock - { statements, liveOut, stringLiterals }
 * @returns {object} ReconstructedBlock
 */
function reconstructBlock(foldedBlock) {
  if (!foldedBlock || !foldedBlock.statements || foldedBlock.statements.length === 0) {
    return {
      statements: [],
      liveOut: foldedBlock ? foldedBlock.liveOut : [],
      stringLiterals: foldedBlock ? foldedBlock.stringLiterals : [],
      methodCalls: [],
    };
  }

  const stmts = foldedBlock.statements;
  const methodCalls = [];

  // Step 1: Build register → string value map from string_build statements.
  // This is a forward scan: track the last string_build for each register,
  // reset when the register is redefined by something else.
  // We build per-position snapshots so we know the string value AT each statement.
  const stringValuesAt = []; // stringValuesAt[i] = Map of reg → string value visible at stmt i
  const currentStrings = new Map();

  for (let i = 0; i < stmts.length; i++) {
    // Snapshot current string values BEFORE processing this statement
    stringValuesAt.push(new Map(currentStrings));

    const stmt = stmts[i];
    if (stmt.expr.type === 'string_build' && stmt.dest) {
      currentStrings.set(stmt.dest, stmt.expr.value);
    } else if (stmt.dest) {
      // Non-string-build redefinition clears the known string value
      currentStrings.delete(stmt.dest);
    }
  }

  // Step 2: Compute definition-aware use counts for prop_get destinations.
  // For each prop_get at index i with dest=rA, count how many times rA
  // is read in statements AFTER i until rA is redefined. This correctly
  // handles register reuse like `r9 = r18[r9]`.
  //
  // We compute this lazily only for prop_get + call candidate pairs.

  // Step 3: Scan for PROP_GET + CALL patterns and build merge set.
  // Allow non-side-effectful statements between the prop_get and call
  // (e.g., string_build for the call's argument). ChaosVM often inserts
  // argument setup between the method lookup and the call.
  const skip = new Set(); // indices of PROP_GET statements to remove

  for (let i = 0; i < stmts.length - 1; i++) {
    const pg = stmts[i];
    if (!pg.dest || pg.expr.type !== 'prop_get') continue;

    // Look forward for a matching call, allowing non-side-effectful gaps
    const match = findMatchingCall(stmts, i, pg);
    if (!match) continue;

    const { callIdx, call } = match;
    const obj = pg.expr.object;

    // Determine method name expression
    const methodExpr = resolveMethodName(pg.expr.property, stringValuesAt[i]);

    // Build the merged method_call
    const merged = {
      pc: call.pc,
      type: call.dest ? 'assign' : 'call',
      dest: call.dest,
      expr: {
        type: 'method_call',
        object: obj,
        method: methodExpr,
        args: call.expr.args || [],
      },
      sideEffects: true,
      original: call.original,
    };

    // Record metadata
    const methodName = methodExpr.type === 'literal' ? String(methodExpr.value) : renderExpr(methodExpr);
    const objName = obj.type === 'register' ? obj.reg : renderExpr(obj);
    methodCalls.push({
      pc: call.pc,
      object: objName,
      method: methodName,
      argCount: (call.expr.args || []).length,
    });

    skip.add(i); // skip the PROP_GET
    stmts[callIdx] = merged; // replace the CALL
  }

  // Step 4: Handle compound PROP_CALL statements (opcodes 20, etc.)
  // Also build final statement list.
  // Use stringValuesAt[i] (position-aware) for correct method name resolution.
  const result = [];
  for (let i = 0; i < stmts.length; i++) {
    if (skip.has(i)) continue;

    const stmt = stmts[i];
    if (stmt.compoundEffects) {
      const normalized = normalizeCompoundPropCall(stmt, stringValuesAt[i]);
      if (normalized) {
        result.push(normalized.statement);
        methodCalls.push(normalized.metadata);
        continue;
      }
    }

    result.push(stmt);
  }

  return {
    statements: result,
    liveOut: foldedBlock.liveOut, // unchanged
    stringLiterals: foldedBlock.stringLiterals, // unchanged
    methodCalls,
  };
}

// ============================================================================
// Gap-aware call matching
// ============================================================================

// Expression types that have side effects
const SIDE_EFFECT_TYPES = new Set([
  'call', 'method_call', 'prop_set', 'return', 'throw', 'jmp', 'cjmp',
  'try_push', 'try_pop', 'catch_push', 'func_create', 'delete', 'iter_shift',
]);

/**
 * Given a PROP_GET at index i, find the matching CALL/method_call statement.
 * Allows non-side-effectful statements between them (e.g., string_build for args).
 *
 * Safety constraints:
 * - No side-effectful statements between prop_get and call
 * - No redefinition of the method ref register between prop_get and call
 * - No redefinition of the object register between prop_get and call
 * - Method ref register (prop_get dest) is used exactly once (by the call)
 * - thisArg matches object (or is Q for CALLQ opcodes)
 *
 * @returns {{ callIdx: number, call: object }|null}
 */
function findMatchingCall(stmts, pgIdx, pg) {
  const methodReg = pg.dest;
  const obj = pg.expr.object;

  for (let j = pgIdx + 1; j < stmts.length; j++) {
    const s = stmts[j];

    // Check if this is the matching call
    if (s.expr.type === 'call' || s.expr.type === 'method_call') {
      const fn = s.expr.fn;
      if (fn && fn.type === 'register' && fn.reg === methodReg) {
        // Found the call using our method ref — check thisArg match
        const thisArg = s.expr.thisArg;
        if (!thisArg || !obj) return null;

        const isCallQ = (thisArg.type === 'register' && thisArg.reg === 'Q');
        if (!isCallQ && !exprsEqual(thisArg, obj)) return null;

        // Definition-aware use count: must be exactly 1 (this call)
        const defUseCount = countDefinitionUses(stmts, pgIdx, methodReg);
        if (defUseCount > 1) return null;

        return { callIdx: j, call: s };
      }
    }

    // Stop conditions: any of these break the safe path
    if (s.sideEffects || SIDE_EFFECT_TYPES.has(s.expr.type)) break;
    if (s.dest === methodReg) break; // method ref redefined
    if (obj.type === 'register' && s.dest === obj.reg) break; // object redefined
  }

  return null;
}

// ============================================================================
// Definition-aware use counting
// ============================================================================

/**
 * Count how many times the definition of `reg` at position `defIdx` is
 * read by subsequent statements. Stops at the first redefinition of `reg`.
 *
 * @param {Array} stmts - Statement array
 * @param {number} defIdx - Index of the defining statement (prop_get)
 * @param {string} reg - Register name defined by the prop_get
 * @returns {number} Number of uses of this definition
 */
function countDefinitionUses(stmts, defIdx, reg) {
  let count = 0;
  for (let j = defIdx + 1; j < stmts.length; j++) {
    const s = stmts[j];
    // Count reads of reg in this statement's expression
    const reads = collectReads(s.expr);
    for (const r of reads) {
      if (r === reg) count++;
    }
    // If this statement redefines reg, stop counting —
    // subsequent reads refer to the new definition
    if (s.dest === reg) break;
    // Also check compound effects for redefinition
    if (s.compoundEffects) {
      if (s.compoundEffects.some(e => e.dest === reg)) break;
    }
  }
  return count;
}

// ============================================================================
// Pattern matching helpers
// ============================================================================

/**
 * Shallow expression equality check (for register/literal comparison).
 */
function exprsEqual(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === 'register') return a.reg === b.reg;
  if (a.type === 'literal') return a.value === b.value;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Resolve a property expression to a method name.
 * If the property is a register with a known string_build value,
 * return a literal node with the string. Otherwise return the expression as-is.
 */
function resolveMethodName(propertyExpr, stringValues) {
  if (propertyExpr.type === 'register' && stringValues && stringValues.has(propertyExpr.reg)) {
    return { type: 'literal', value: stringValues.get(propertyExpr.reg) };
  }
  if (propertyExpr.type === 'string_build') {
    return { type: 'literal', value: propertyExpr.value };
  }
  if (propertyExpr.type === 'literal') {
    return propertyExpr;
  }
  return propertyExpr;
}

// ============================================================================
// Compound PROP_CALL normalization
// ============================================================================

/**
 * Normalize a compound statement with prop_get + call effects into a
 * single method_call statement (for opcodes like PROP_CALL_1, op 20).
 *
 * @param {object} stmt - A compound statement with compoundEffects
 * @param {Map} stringValues - register → string value map
 * @returns {object|null} { statement, metadata } or null if not a PROP_CALL
 */
function normalizeCompoundPropCall(stmt, stringValues) {
  if (!stmt.compoundEffects || stmt.compoundEffects.length < 2) return null;

  const pgEff = stmt.compoundEffects.find(e => e.expr.type === 'prop_get');
  const callEff = stmt.compoundEffects.find(e =>
    e.expr.type === 'call' || e.expr.type === 'method_call'
  );

  if (!pgEff || !callEff) return null;

  // Verify the pattern: call.fn === prop_get.dest, call.thisArg === prop_get.object
  const fn = callEff.expr.fn;
  if (!fn || fn.type !== 'register' || fn.reg !== pgEff.dest) return null;

  const thisArg = callEff.expr.thisArg;
  const obj = pgEff.expr.object;
  if (!thisArg || !obj) return null;

  // For compound opcodes, thisArg should match object OR be Q
  const isCallQ = (thisArg.type === 'register' && thisArg.reg === 'Q');
  if (!isCallQ && !exprsEqual(thisArg, obj)) return null;

  // Resolve method name
  const methodExpr = resolveMethodName(pgEff.expr.property, stringValues);

  // Build other (non prop_get, non call) effects that should be preserved
  const otherEffects = stmt.compoundEffects.filter(e =>
    e !== pgEff && e !== callEff
  );

  // Build the method_call statement
  const mcStmt = {
    pc: stmt.pc,
    type: callEff.dest ? 'assign' : 'call',
    dest: callEff.dest,
    expr: {
      type: 'method_call',
      object: obj,
      method: methodExpr,
      args: callEff.expr.args || [],
    },
    sideEffects: true,
    original: stmt.original,
  };

  // If there are other effects, wrap in a compound
  if (otherEffects.length > 0) {
    const allEffects = [
      ...otherEffects.map(e => ({
        dest: e.dest,
        expr: e.expr,
        sideEffects: e.sideEffects || false,
      })),
      {
        dest: callEff.dest,
        expr: mcStmt.expr,
        sideEffects: true,
      },
    ];
    mcStmt.type = 'compound';
    mcStmt.expr = { type: 'compound', effects: allEffects };
    mcStmt.compoundEffects = allEffects;
  }

  const methodName = methodExpr.type === 'literal' ? String(methodExpr.value) : renderExpr(methodExpr);
  const objName = obj.type === 'register' ? obj.reg : renderExpr(obj);

  return {
    statement: mcStmt,
    metadata: {
      pc: stmt.pc,
      object: objName,
      method: methodName,
      argCount: (callEff.expr.args || []).length,
      compound: true,
    },
  };
}

// ============================================================================
// reconstructFunction & reconstructAll
// ============================================================================

/**
 * Reconstruct all blocks of one function.
 *
 * @param {string} funcId - Function ID
 * @param {Map<string, FoldedBlock>} foldedBlocks - blockId → FoldedBlock
 * @returns {Map<string, ReconstructedBlock>}
 */
function reconstructFunction(funcId, foldedBlocks) {
  const result = new Map();
  for (const [blockId, foldedBlock] of foldedBlocks.entries()) {
    result.set(blockId, reconstructBlock(foldedBlock));
  }
  return result;
}

/**
 * Reconstruct all functions.
 *
 * @param {Map<string, Map<string, FoldedBlock>>} allFolded - funcId → blockId → FoldedBlock
 * @returns {Map<string, Map<string, ReconstructedBlock>>}
 */
function reconstructAll(allFolded) {
  const result = new Map();
  for (const [funcId, blockMap] of allFolded.entries()) {
    result.set(funcId, reconstructFunction(funcId, blockMap));
  }
  return result;
}

// ============================================================================
// Renderer
// ============================================================================

/**
 * Render a method_call expression as idiomatic JS.
 * obj.method(args...) or obj[expr](args...)
 *
 * @param {object} expr - method_call expression node
 * @returns {string}
 */
function renderMethodCall(expr) {
  if (!expr || expr.type !== 'method_call') return renderExpr(expr);

  const objStr = renderExpr(expr.object);
  const argsStr = (expr.args || []).map(renderExpr).join(', ');

  if (expr.method.type === 'literal' && typeof expr.method.value === 'string') {
    const name = expr.method.value;
    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      return `${objStr}.${name}(${argsStr})`;
    }
    return `${objStr}[${JSON.stringify(name)}](${argsStr})`;
  }

  return `${objStr}[${renderExpr(expr.method)}](${argsStr})`;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  reconstructBlock,
  reconstructFunction,
  reconstructAll,
  renderMethodCall,
  // Exposed for testing
  countDefinitionUses,
  exprsEqual,
  resolveMethodName,
  normalizeCompoundPropCall,
};
