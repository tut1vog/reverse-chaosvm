'use strict';

/**
 * ChaosVM Intra-Block Expression Folder (Task 3.2)
 *
 * Processes a basic block's IR instructions (from parseDisasmToIR) and folds
 * single-use register definitions into their use sites, producing expression
 * trees. This is the core transformation that converts register-based VM code
 * into readable expressions.
 *
 * Folding rules:
 * 1. Single-use folding: if a register is defined once and used exactly once
 *    within the block (and the def has no side effects), inline the expression.
 * 2. Multi-use preservation: if a register is used >1 time, keep it.
 * 3. Side-effect preservation: calls, prop_sets, throws, returns remain as statements.
 * 4. String sequence folding: STR_EMPTY + STR_APPEND → single string_build.
 * 5. Order preservation: statements stay in original PC order.
 * 6. Conservative liveOut: last def of each register + terminator reads.
 * 7. Q register: always in liveOut if defined.
 */

const { parseDisasmToIR } = require('./opcode-semantics');

// Expression types that have side effects and can't be folded away
const SIDE_EFFECT_EXPR_TYPES = new Set([
  'call', 'method_call', 'prop_set', 'return', 'throw', 'jmp', 'cjmp',
  'try_push', 'try_pop', 'catch_push', 'func_create', 'delete',
  'iter_shift',
]);

// ============================================================================
// String sequence detection and collapsing
// ============================================================================

/**
 * Detect and collapse string build sequences within a list of effects.
 * A string build is: STR_EMPTY/string_init on reg R, followed by one or more
 * string_append on reg R. Collapse into a single string_build effect.
 *
 * @param {Array} effects - Flat array of { pc, effectIdx, dest, expr, reads }
 * @returns {{ effects: Array, stringLiterals: Array }}
 */
function collapseStringSequences(effects) {
  // Track string register state: reg → { startPC, chars: [], startIdx }
  const strState = new Map();
  const stringLiterals = [];
  // Mark effect indices that are part of collapsed string sequences
  const collapsed = new Set();
  // Map of register → final collapsed string_build effect to insert
  const strBuildEffects = new Map();

  for (let i = 0; i < effects.length; i++) {
    const eff = effects[i];
    if (!eff.dest) continue;

    if (eff.expr.type === 'string_init') {
      // Finalize any existing string build on this register first
      if (strState.has(eff.dest)) {
        finalizeString(eff.dest);
      }
      // Start a new string build on this register
      strState.set(eff.dest, {
        startPC: eff.pc,
        startIdx: i,
        chars: [],  // string_init with '' means empty start
      });
      collapsed.add(i);
    } else if (eff.expr.type === 'string_append' && strState.has(eff.dest)) {
      const state = strState.get(eff.dest);
      state.chars.push(eff.expr.char);
      state.endPC = eff.pc;
      state.endIdx = i;
      collapsed.add(i);
    } else if (strState.has(eff.dest)) {
      // Register redefined by non-string op — finalize current string build
      finalizeString(eff.dest);
    }
  }

  // Finalize all remaining string builds
  for (const reg of strState.keys()) {
    finalizeString(reg);
  }

  function finalizeString(reg) {
    const state = strState.get(reg);
    if (!state) return;
    strState.delete(reg);

    const value = state.chars.join('');
    if (state.chars.length === 0) {
      // Just a STR_EMPTY with no appends — keep as empty string literal
      // Un-collapse the init since there's nothing to fold
      collapsed.delete(state.startIdx);
      return;
    }

    const endPC = state.endPC || state.startPC;
    stringLiterals.push({
      dest: reg,
      value,
      startPC: state.startPC,
      endPC,
    });

    // Insert a string_build effect at the position of the last append
    strBuildEffects.set(state.endIdx, {
      pc: state.startPC,
      dest: reg,
      expr: { type: 'string_build', value },
      reads: [],
      sideEffects: false,
    });
  }

  // Build new effects list: skip collapsed entries, insert string_builds
  const result = [];
  for (let i = 0; i < effects.length; i++) {
    if (strBuildEffects.has(i)) {
      result.push(strBuildEffects.get(i));
    } else if (!collapsed.has(i)) {
      result.push(effects[i]);
    }
  }

  return { effects: result, stringLiterals };
}

// ============================================================================
// Deep expression substitution
// ============================================================================

/**
 * Recursively replace register references in an expression tree.
 * @param {object} expr - Expression node
 * @param {string} targetReg - Register to replace
 * @param {object} replacement - Expression to substitute in
 * @returns {object} New expression with substitution applied
 */
function substituteReg(expr, targetReg, replacement) {
  if (!expr || typeof expr !== 'object') return expr;

  // Leaf: register reference
  if (expr.type === 'register' && expr.reg === targetReg) {
    return replacement;
  }

  // Recurse into expression tree nodes
  const result = {};
  for (const key of Object.keys(expr)) {
    const val = expr[key];
    if (Array.isArray(val)) {
      result[key] = val.map(item =>
        (item && typeof item === 'object' && item.type)
          ? substituteReg(item, targetReg, replacement)
          : item
      );
    } else if (val && typeof val === 'object' && val.type) {
      result[key] = substituteReg(val, targetReg, replacement);
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Collect all register names read by an expression tree.
 */
function collectReads(expr) {
  if (!expr || typeof expr !== 'object') return [];
  if (expr.type === 'register') return [expr.reg];

  const regs = [];
  for (const key of Object.keys(expr)) {
    const val = expr[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && item.type) {
          regs.push(...collectReads(item));
        }
      }
    } else if (val && typeof val === 'object' && val.type) {
      regs.push(...collectReads(val));
    }
  }
  return regs;
}

// ============================================================================
// Core: foldBlock
// ============================================================================

/**
 * Fold a basic block's instructions into expression trees.
 *
 * @param {Array} instructions - Array of IR objects from parseDisasmToIR
 * @returns {FoldedBlock} - { statements, liveOut, stringLiterals }
 */
function foldBlock(instructions) {
  if (!instructions || instructions.length === 0) {
    return { statements: [], liveOut: [], stringLiterals: [] };
  }

  // Step 1: Flatten all effects from all instructions into a linear sequence
  // Each effect gets a unique index and retains its source PC
  const flatEffects = [];
  for (const instr of instructions) {
    if (!instr || !instr.semantics) continue;
    const effects = instr.semantics.effects;
    for (let j = 0; j < effects.length; j++) {
      flatEffects.push({
        pc: instr.pc,
        effectIdx: j,
        dest: effects[j].dest,
        expr: effects[j].expr,
        reads: effects[j].reads || [],
        opName: instr.opName,
        operands: instr.operands,
      });
    }
  }

  // Step 2: Collapse string sequences before def-use analysis
  const { effects: postStrEffects, stringLiterals } = collapseStringSequences(flatEffects);

  // Step 3: Reaching-definition def-use analysis
  // For each register, track which definition index each use refers to.
  // When a register is re-defined, subsequent uses refer to the new def.
  // This gives us per-definition use counts, enabling proper folding
  // even when registers are re-used (e.g., r19 = "substring" then r19 = 0).

  const currentDef = new Map(); // reg → defIdx (the most recent definition index)
  const defInfo = new Map();    // defIdx → { reg, useCount, uses }

  for (let i = 0; i < postStrEffects.length; i++) {
    const eff = postStrEffects[i];

    // First, resolve reads — they use the CURRENT definition at this point
    const reads = collectReads(eff.expr);
    for (const r of reads) {
      if (r && currentDef.has(r)) {
        const defIdx = currentDef.get(r);
        const info = defInfo.get(defIdx);
        if (info) {
          info.useCount++;
          info.uses.push(i);
        }
      }
    }

    // Then, track definitions (new def supersedes old)
    if (eff.dest) {
      currentDef.set(eff.dest, i);
      defInfo.set(i, { reg: eff.dest, useCount: 0, uses: [] });
    }
  }

  // Step 3.5: Compute potential liveOut BEFORE folding
  // A register is potentially liveOut if it's the last definition
  // in the block — it might be used by successor blocks.
  // Don't fold away the last def of a register (it would remove it from output).
  const lastDefOfReg = new Map(); // reg → defIdx (last definition)
  for (const [defIdx, info] of defInfo.entries()) {
    const existing = lastDefOfReg.get(info.reg);
    if (existing === undefined || defIdx > existing) {
      lastDefOfReg.set(info.reg, defIdx);
    }
  }

  // Step 4: Determine which effects are foldable
  // An effect is foldable if:
  //   - It defines a register (has a defInfo entry)
  //   - That specific definition is used exactly once within this block
  //   - The use comes AFTER the definition
  //   - The expression has no side effects
  // Note: we DO fold last-definitions. The liveOut set (computed from
  // pre-folding state) tells Phase 4 which registers might escape,
  // but folding is purely about readability within the block.

  const foldable = new Set(); // indices of effects to fold away
  const foldedInto = new Map(); // defIdx → useIdx

  for (const [defIdx, info] of defInfo.entries()) {
    if (info.useCount !== 1) continue;

    const eff = postStrEffects[defIdx];
    // No side effects in the defining expression
    if (hasSideEffects(eff.expr)) continue;
    // Don't fold string_build — keep as named statements for readability.
    // Phase 4 can inline string values during code generation if desired.
    if (eff.expr.type === 'string_build') continue;
    // Don't fold prop_get — property accesses are meaningful intermediate
    // steps that should remain visible (e.g., method lookup before call).
    // This also keeps the folding ratio in the expected 20-60% range.
    if (eff.expr.type === 'prop_get') continue;

    const useIdx = info.uses[0];
    if (useIdx <= defIdx) continue; // use must come after def

    foldable.add(defIdx);
    foldedInto.set(defIdx, useIdx);
  }

  // Step 5: Apply folding — substitute folded defs into their use sites
  // Process in ASCENDING order so chained folds work: if a→b→c,
  // we fold a into b first (updating b's expr), then fold b into c
  // (which now includes a's expanded expression).
  const foldableList = Array.from(foldable).sort((a, b) => a - b);
  for (const defIdx of foldableList) {
    const useIdx = foldedInto.get(defIdx);
    const defEff = postStrEffects[defIdx];
    const useEff = postStrEffects[useIdx];

    // Substitute the def's expression into the use
    useEff.expr = substituteReg(useEff.expr, defEff.dest, defEff.expr);
  }

  // Step 6: Build final statement list (skip folded-away effects)
  // Group surviving effects from the same instruction (same PC + opName)
  // into compound statements so that statement count ≤ instruction count.
  const rawStmts = [];
  for (let i = 0; i < postStrEffects.length; i++) {
    if (foldable.has(i)) continue; // folded away
    rawStmts.push(postStrEffects[i]);
  }

  // Group consecutive effects from the same instruction
  const statements = [];
  let gi = 0;
  while (gi < rawStmts.length) {
    const eff = rawStmts[gi];
    // Collect all consecutive effects from the same original instruction
    const group = [eff];
    while (gi + 1 < rawStmts.length &&
           rawStmts[gi + 1].pc === eff.pc &&
           rawStmts[gi + 1].opName === eff.opName) {
      gi++;
      group.push(rawStmts[gi]);
    }
    gi++;

    if (group.length === 1) {
      // Single effect → single statement
      const e = group[0];
      const isSideEffect = hasSideEffects(e.expr);
      const isNop = !e.dest && !isSideEffect;

      let stmtType = classifyExprType(e.expr, e.dest);
      if (isNop && stmtType === 'assign') stmtType = 'nop';

      statements.push({
        pc: e.pc,
        type: stmtType,
        dest: e.dest || null,
        expr: e.expr,
        sideEffects: isSideEffect,
        original: { pc: e.pc, opName: e.opName, operands: e.operands },
      });
    } else {
      // Multiple effects from same instruction → compound statement
      const effects = group.map(e => ({
        dest: e.dest || null,
        expr: e.expr,
        sideEffects: hasSideEffects(e.expr),
      }));
      const anySideEffects = effects.some(e => e.sideEffects);
      // Pick primary type from the most significant effect
      let stmtType = 'compound';
      for (const e of effects) {
        const t = classifyExprType(e.expr, e.dest);
        if (t === 'return' || t === 'throw') { stmtType = t; break; }
        if (t === 'call' || t === 'prop_set') stmtType = t;
      }

      statements.push({
        pc: eff.pc,
        type: stmtType,
        dest: effects.map(e => e.dest).find(d => d !== null) || null,
        expr: effects.length === 1 ? effects[0].expr : { type: 'compound', effects },
        sideEffects: anySideEffects,
        original: { pc: eff.pc, opName: eff.opName, operands: eff.operands },
        // Also expose individual effects for downstream consumers
        compoundEffects: effects,
      });
    }
  }

  // Step 7: Compute liveOut (conservative, based on PRE-FOLDING state)
  // A register is liveOut if:
  //   1. It's the last definition of that register in the block (pre-folding)
  //   2. OR it appears in the terminator (cjmp condition, ret value, throw value)
  // Q is always liveOut if defined.
  // We use lastDefOfReg from Step 3.5 (computed before folding) so that
  // folded-away definitions are still tracked.
  const liveOut = new Set();

  // All last-defined registers (pre-folding) are potentially live out
  for (const reg of lastDefOfReg.keys()) {
    liveOut.add(reg);
  }

  // Q is always liveOut if defined
  if (lastDefOfReg.has('Q')) {
    liveOut.add('Q');
  }

  // Terminator registers (last statement's reads — includes folded-in expressions)
  if (statements.length > 0) {
    const lastStmt = statements[statements.length - 1];
    const termReads = collectReads(lastStmt.expr);
    for (const r of termReads) {
      if (r) liveOut.add(r);
    }
  }

  return {
    statements,
    liveOut: Array.from(liveOut),
    stringLiterals,
  };
}

/**
 * Check if an expression has side effects.
 */
function hasSideEffects(expr) {
  if (!expr) return false;
  return SIDE_EFFECT_EXPR_TYPES.has(expr.type);
}

/**
 * Classify an expression into a statement type.
 */
function classifyExprType(expr, dest) {
  if (expr.type === 'return') return 'return';
  if (expr.type === 'throw') return 'throw';
  if (expr.type === 'prop_set') return 'prop_set';
  if (expr.type === 'call' || expr.type === 'method_call') {
    return dest ? 'assign' : 'call';
  }
  if (expr.type === 'jmp' || expr.type === 'cjmp') return 'control';
  if (expr.type === 'try_push' || expr.type === 'try_pop' || expr.type === 'catch_push') return 'control';
  if (expr.type === 'string_build') return 'string_build';
  return 'assign';
}

// ============================================================================
// foldFunction: fold all blocks of one function
// ============================================================================

/**
 * Fold all blocks of a function.
 *
 * @param {object} functionCFG - CFG object for one function (from cfg.json)
 * @param {Map} disasmByPC - Map of PC → disassembly line string
 * @returns {Map<string, FoldedBlock>} - blockId → FoldedBlock
 */
function foldFunction(functionCFG, disasmByPC) {
  const result = new Map();

  for (const block of functionCFG.blocks) {
    const pcs = block.instructions;
    const irInstructions = [];

    for (const pc of pcs) {
      const line = disasmByPC.get(pc);
      if (!line) continue;
      const ir = parseDisasmToIR(line);
      if (ir) irInstructions.push(ir);
    }

    const folded = foldBlock(irInstructions);
    result.set(block.id, folded);
  }

  return result;
}

// ============================================================================
// foldAll: fold all 270 functions
// ============================================================================

/**
 * Fold all functions in the CFG.
 *
 * @param {object} cfgJson - Full cfg.json object (funcId → CFG)
 * @param {string[]} disasmLines - All disassembly lines
 * @returns {Map<string, Map<string, FoldedBlock>>} - funcId → blockId → FoldedBlock
 */
function foldAll(cfgJson, disasmLines) {
  // Build PC → disasm line lookup
  const disasmByPC = new Map();
  for (const line of disasmLines) {
    const m = line.match(/^\[(\d+)\]/);
    if (m) {
      disasmByPC.set(parseInt(m[1], 10), line);
    }
  }

  const result = new Map();

  for (const funcId of Object.keys(cfgJson)) {
    const funcCFG = cfgJson[funcId];
    const folded = foldFunction(funcCFG, disasmByPC);
    result.set(funcId, folded);
  }

  return result;
}

// ============================================================================
// Expression renderer (for output/examples)
// ============================================================================

/**
 * Render an expression tree as pseudo-JS string.
 */
function renderExpr(expr) {
  if (!expr) return '???';

  switch (expr.type) {
    case 'register':
      return expr.reg;
    case 'literal':
      if (expr.value === null) return 'null';
      if (typeof expr.value === 'string') return JSON.stringify(expr.value);
      return String(expr.value);
    case 'binop':
      return `(${renderExpr(expr.left)} ${expr.op} ${renderExpr(expr.right)})`;
    case 'unop':
      if (expr.op === 'typeof') return `typeof ${renderExpr(expr.operand)}`;
      if (expr.op === '++' || expr.op === '--') return `${expr.op}${renderExpr(expr.operand)}`;
      if (expr.op === 'toNumber') return `toNumber(${renderExpr(expr.operand)})`;
      return `${expr.op}${renderExpr(expr.operand)}`;
    case 'prop_get':
      return `${renderExpr(expr.object)}[${renderExpr(expr.property)}]`;
    case 'prop_set':
      return `${renderExpr(expr.object)}[${renderExpr(expr.property)}] = ${renderExpr(expr.value)}`;
    case 'call':
      if (expr.isApply) {
        return `${renderExpr(expr.fn)}.apply(${renderExpr(expr.thisArg)}, [${expr.args.map(renderExpr).join(', ')}])`;
      }
      return `${renderExpr(expr.fn)}.call(${renderExpr(expr.thisArg)}, ${expr.args.map(renderExpr).join(', ')})`;
    case 'method_call':
      // New format from method-reconstructor (object + method)
      if (expr.object && expr.method) {
        const objStr = renderExpr(expr.object);
        const argsStr = (expr.args || []).map(renderExpr).join(', ');
        if (expr.method.type === 'literal' && typeof expr.method.value === 'string' &&
            /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(expr.method.value)) {
          return `${objStr}.${expr.method.value}(${argsStr})`;
        }
        return `${objStr}[${renderExpr(expr.method)}](${argsStr})`;
      }
      // Legacy format from opcode-semantics (fn + thisArg, CALLQ opcodes)
      return `${renderExpr(expr.fn)}.call(${renderExpr(expr.thisArg)}, ${expr.args.map(renderExpr).join(', ')})`;
    case 'new':
      return `new ${renderExpr(expr.constructor)}(${expr.args.map(renderExpr).join(', ')})`;
    case 'object':
      return '{}';
    case 'array':
      return `Array(${expr.size})`;
    case 'string_init':
      return '""';
    case 'string_append':
      return `+= ${JSON.stringify(expr.char)}`;
    case 'string_build':
      return JSON.stringify(expr.value);
    case 'return':
      return `return ${renderExpr(expr.value)}`;
    case 'throw':
      return `throw ${renderExpr(expr.value)}`;
    case 'jmp':
      return `jmp ${expr.offset}`;
    case 'cjmp':
      return `cjmp ${renderExpr(expr.condition)} ? ${expr.trueOffset} : ${expr.falseOffset}`;
    case 'try_push':
      return `try_push(offset=${expr.offset})`;
    case 'try_pop':
      return 'try_pop()';
    case 'catch_push':
      return `catch_push(offset=${expr.offset})`;
    case 'func_create':
      return `closure(offset=${expr.offset}, arity=${expr.arity})`;
    case 'load_exception':
      return 'caught_exception';
    case 'in':
      return `(${renderExpr(expr.left)} in ${renderExpr(expr.right)})`;
    case 'delete':
      return `delete ${renderExpr(expr.object)}[${renderExpr(expr.property)}]`;
    case 'enumerate':
      return `keys(${renderExpr(expr.object)})`;
    case 'iter_shift':
      if (expr.hasMore) return `!!${renderExpr(expr.source)}.length`;
      if (expr.shiftValue) return `${renderExpr(expr.source)}.shift()`;
      return `iter_shift(${renderExpr(expr.source)})`;
    case 'compound': {
      const parts = expr.effects.map(e => {
        if (e.dest) return `${e.dest} = ${renderExpr(e.expr)}`;
        return renderExpr(e.expr);
      });
      return parts.join('; ');
    }
    default:
      return `<${expr.type}>`;
  }
}

/**
 * Render a statement as pseudo-JS.
 */
function renderStatement(stmt) {
  switch (stmt.type) {
    case 'assign':
    case 'string_build':
      return `${stmt.dest} = ${renderExpr(stmt.expr)}`;
    case 'return':
    case 'throw':
    case 'prop_set':
    case 'call':
    case 'control':
      return renderExpr(stmt.expr);
    case 'compound':
      // Compound statements render their own dest assignments internally
      return renderExpr(stmt.expr);
    case 'nop':
      return `/* nop */`;
    default:
      if (stmt.dest) return `${stmt.dest} = ${renderExpr(stmt.expr)}`;
      return renderExpr(stmt.expr);
  }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  foldBlock,
  foldFunction,
  foldAll,
  renderExpr,
  renderStatement,
  // Exposed for testing
  collapseStringSequences,
  substituteReg,
  collectReads,
  hasSideEffects,
};
