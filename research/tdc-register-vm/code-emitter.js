'use strict';

/**
 * ChaosVM Per-Function Structured Code Emitter (Task 4.1)
 *
 * Takes each function's reconstructed blocks + control flow patterns + CFG
 * and emits structured, readable JavaScript.
 *
 * Algorithm:
 *   1. Walk CFG from entry block using recursive descent
 *   2. At each block, determine structure from pattern data:
 *      - Loop header → while (cond) { ... }
 *      - Try-catch head → try { ... } catch (e) { ... }
 *      - CJMP block → if (cond) { ... } else { ... }
 *      - Otherwise → emit statements + follow successors
 *   3. Each block is emitted exactly once (tracked via emitted set)
 *   4. Unreached blocks are appended at end with comments
 *
 * Rendering:
 *   - Control statements (jmp, cjmp, try_push, try_pop, catch_push) are
 *     represented structurally, not as statements
 *   - Compound statements with mixed control/non-control effects are
 *     filtered to emit only non-control parts
 *   - Assignments use `var` prefix (JS hoists var declarations)
 *   - 2-space indentation
 */

const { renderExpr } = require('./expression-folder');
const { renderMethodCall } = require('./method-reconstructor');

// ============================================================================
// Statement rendering helpers
// ============================================================================

/** Expression types that are control flow (not emitted as statements) */
const CONTROL_EXPR_TYPES = new Set([
  'jmp', 'cjmp', 'try_push', 'try_pop', 'catch_push',
]);

/**
 * Render a single expression as a JS string, handling method_call specially.
 */
function renderExprJS(expr) {
  if (!expr) return '/* ??? */';

  let rendered;

  // Use renderMethodCall only for new-format method_calls (object/method).
  // Legacy format (fn/thisArg from CALLQ opcodes) goes through renderExpr.
  if (expr.type === 'method_call' && expr.object && expr.method) {
    rendered = renderMethodCall(expr);
  } else if (expr.type === 'string_append') {
    // string_append outside of a string_build — render as just the char literal
    return JSON.stringify(expr.char || '');
  } else if (expr.type === 'string_init') {
    return '""';
  } else {
    rendered = renderExpr(expr);
  }

  // Always sanitize: fix invalid register names and string_append remnants
  return sanitizeRegNames(rendered);
}

/**
 * Sanitize register names that contain invalid JS identifier characters.
 * E.g., r-13743 → r_neg_13743, r47285 (very large) → stays as-is (valid).
 */
function sanitizeRegNames(str) {
  // Replace r-NNNN with r_neg_NNNN to produce valid identifiers
  // Also replace leftover += "..." patterns from string_append
  str = str.replace(/\br(-\d+)\b/g, (_, num) => `r_neg_${num.slice(1)}`);
  // Fix string_append remnants: `+= "x"` → `"x"` (in expression context)
  str = str.replace(/\+= ("[^"]*")/g, '$1');
  return str;
}

/**
 * Sanitize a single register/dest name.
 */
function sanitizeDest(dest) {
  if (!dest) return dest;
  if (dest.startsWith('r-')) return `r_neg_${dest.slice(2)}`;
  return dest;
}

/**
 * Render a statement as a line of JS code (without semicolon/indent).
 * Returns null for control statements that should be skipped.
 */
function renderStatementJS(stmt) {
  if (stmt.type === 'control') return null;
  if (stmt.type === 'nop') return null;

  // Compound statements need special handling
  if (stmt.compoundEffects) {
    return renderCompoundJS(stmt);
  }

  // Method call expressions (use renderExprJS which handles both formats)
  if (stmt.expr && stmt.expr.type === 'method_call') {
    if (stmt.type === 'assign' && stmt.dest) {
      return `var ${sanitizeDest(stmt.dest)} = ${renderExprJS(stmt.expr)}`;
    }
    return renderExprJS(stmt.expr);
  }

  switch (stmt.type) {
    case 'assign':
    case 'string_build':
      // Guard: dest could be null for some edge cases (e.g. func_create with no dest)
      if (!stmt.dest) return renderExprJS(stmt.expr);
      return `var ${sanitizeDest(stmt.dest)} = ${renderExprJS(stmt.expr)}`;
    case 'return':
      if (stmt.expr.type === 'return') {
        return renderExprJS(stmt.expr);
      }
      return `return ${renderExprJS(stmt.expr)}`;
    case 'throw':
      if (stmt.expr.type === 'throw') {
        return renderExprJS(stmt.expr);
      }
      return `throw ${renderExprJS(stmt.expr)}`;
    case 'prop_set':
      return renderExprJS(stmt.expr);
    case 'call':
      return renderExprJS(stmt.expr);
    default:
      if (stmt.dest) return `var ${sanitizeDest(stmt.dest)} = ${renderExprJS(stmt.expr)}`;
      return renderExprJS(stmt.expr);
  }
}

/**
 * Render a compound statement, filtering out control-flow effects.
 * Returns null if all effects are control-flow.
 */
function renderCompoundJS(stmt) {
  const effects = stmt.compoundEffects || [];
  const parts = [];
  let hasReturn = false;

  for (const eff of effects) {
    // Skip control-flow effects
    if (CONTROL_EXPR_TYPES.has(eff.expr.type)) continue;

    if (eff.expr.type === 'return') {
      hasReturn = true;
      parts.push(renderExprJS(eff.expr));
    } else if (eff.expr.type === 'throw') {
      parts.push(renderExprJS(eff.expr));
    } else if (eff.expr.type === 'method_call') {
      // Use renderExprJS which handles both legacy (fn/thisArg) and
      // new (object/method) method_call formats
      if (eff.dest) {
        parts.push(`var ${sanitizeDest(eff.dest)} = ${renderExprJS(eff.expr)}`);
      } else {
        parts.push(renderExprJS(eff.expr));
      }
    } else if (eff.expr.type === 'prop_set') {
      parts.push(renderExprJS(eff.expr));
    } else if (eff.dest) {
      parts.push(`var ${sanitizeDest(eff.dest)} = ${renderExprJS(eff.expr)}`);
    } else {
      const r = renderExprJS(eff.expr);
      if (r && r !== '/* ??? */') parts.push(r);
    }
  }

  if (parts.length === 0) return null;

  // If there's a return, it must be the last statement; separate others with semicolons
  if (hasReturn && parts.length > 1) {
    // Non-return parts become separate statements; return is last
    // We'll join with '; ' and the caller adds the final ';'
    return parts.join('; ');
  }

  return parts.join('; ');
}

// ============================================================================
// Core emitter
// ============================================================================

/**
 * Emit a single function as structured JavaScript.
 *
 * @param {string|number} funcId - Function ID
 * @param {Map<string, object>} reconstructedBlocks - blockId → ReconstructedBlock
 * @param {object} patternData - Pattern recognizer output for this function
 * @param {object} cfgData - CFG data for this function (from cfg.json)
 * @param {object} funcMeta - Function metadata (from functions.json)
 * @returns {string} JavaScript source code for the function
 */
function emitFunction(funcId, reconstructedBlocks, patternData, cfgData, funcMeta) {
  const blocks = cfgData.blocks || [];
  if (blocks.length === 0) {
    const arity = (funcMeta && funcMeta.arity != null) ? funcMeta.arity : 0;
    const args = Array.from({ length: arity }, (_, i) => `arg${i}`);
    return `function func_${funcId}(${args.join(', ')}) {\n  /* empty */\n}`;
  }

  const blockById = new Map(blocks.map(b => [b.id, b]));
  const patterns = patternData ? patternData.patterns || [] : [];

  // Build headToPatterns: blockId → [patterns with that headBlock]
  const headToPatterns = new Map();
  for (const p of patterns) {
    if (!headToPatterns.has(p.headBlock)) headToPatterns.set(p.headBlock, []);
    headToPatterns.get(p.headBlock).push(p);
  }

  // Identify loop headers
  const loopHeaderSet = new Set();
  for (const p of patterns) {
    if (p.type === 'while' || p.type === 'for-in') {
      loopHeaderSet.add(p.headBlock);
    }
  }

  // Track emitted blocks
  const emitted = new Set();
  const lines = [];

  // Function header
  const arity = (funcMeta && funcMeta.arity != null) ? funcMeta.arity : 0;
  const args = Array.from({ length: arity }, (_, i) => `arg${i}`);

  // Walk from entry block
  const entryId = blocks[0].id;
  emitBlockChain(entryId, 1);

  // Emit any blocks that were not reached
  for (const block of blocks) {
    if (!emitted.has(block.id)) {
      lines.push(`  /* unreached block ${block.id} */`);
      emitBlockStatements(block.id, 1);
      emitted.add(block.id);
    }
  }

  const body = lines.join('\n');
  return `function func_${funcId}(${args.join(', ')}) {\n${body}\n}`;

  // ================================================================
  // Inner helper: indent string
  // ================================================================
  function ind(n) {
    return '  '.repeat(n);
  }

  // ================================================================
  // Inner: emit a chain of blocks starting from blockId
  // ================================================================
  function emitBlockChain(blockId, depth) {
    if (!blockId || emitted.has(blockId)) return;

    const block = blockById.get(blockId);
    if (!block) return;

    emitted.add(blockId);

    // Priority 1: Try-catch patterns (wraps everything else)
    const tryCatchPats = (headToPatterns.get(blockId) || [])
      .filter(p => p.type === 'try-catch' || p.type === 'try-catch-finally');

    if (tryCatchPats.length > 0) {
      emitTryCatch(blockId, block, tryCatchPats, depth);
      return;
    }

    // Priority 2: Loop patterns
    const loopPat = (headToPatterns.get(blockId) || [])
      .find(p => p.type === 'while' || p.type === 'for-in');

    if (loopPat) {
      emitLoop(blockId, block, loopPat, depth);
      return;
    }

    // Priority 3: CJMP → if/else
    if (block.terminator && block.terminator.type === 'cjmp') {
      if (block.successors.length >= 2) {
        emitIfElse(blockId, block, depth);
        return;
      }
      // Degenerate CJMP with 1 successor (data-region target on other branch)
      // Emit as if(cond) with single branch
      emitBlockStatements(blockId, depth);
      const condition = extractCondition(blockId);
      if (block.successors.length === 1) {
        lines.push(`${ind(depth)}if (${condition}) {`);
        emitBlockChain(block.successors[0], depth + 1);
        lines.push(`${ind(depth)}}`);
      }
      return;
    }

    // Default: sequence — emit statements and follow successors
    emitBlockStatements(blockId, depth);

    for (const succ of block.successors) {
      emitBlockChain(succ, depth);
    }
  }

  // ================================================================
  // Inner: emit a block's non-control statements
  // ================================================================
  function emitBlockStatements(blockId, depth) {
    const rBlock = reconstructedBlocks.get(blockId);
    if (!rBlock || !rBlock.statements) return;

    for (const stmt of rBlock.statements) {
      const rendered = renderStatementJS(stmt);
      if (rendered !== null) {
        // Split on '; ' for compound statements that produce multiple lines
        // Actually, compound returns like "var x = expr; return y" need
        // to be separate statements
        const subParts = splitCompoundRendered(rendered, stmt);
        for (const part of subParts) {
          lines.push(`${ind(depth)}${part};`);
        }
      }
    }
  }

  // ================================================================
  // Inner: extract CJMP condition expression
  // ================================================================
  function extractCondition(blockId) {
    const rBlock = reconstructedBlocks.get(blockId);
    if (!rBlock) return 'true';

    // Find the CJMP control statement
    for (const stmt of rBlock.statements) {
      if (stmt.type === 'control' && stmt.expr && stmt.expr.type === 'cjmp') {
        return renderExprJS(stmt.expr.condition);
      }
    }

    // Fallback: use condReg from terminator
    const block = blockById.get(blockId);
    if (block && block.terminator && block.terminator.condReg) {
      return block.terminator.condReg;
    }

    return 'true';
  }

  // ================================================================
  // Inner: emit if/else structure
  // ================================================================
  function emitIfElse(blockId, block, depth) {
    // Emit pre-condition statements
    emitBlockStatements(blockId, depth);

    const condition = extractCondition(blockId);
    const trueSucc = block.successors[0];
    const falseSucc = block.successors[1];

    // Find merge point from pattern data
    const ifPat = (headToPatterns.get(blockId) || [])
      .find(p => p.type === 'if' || p.type === 'if-else' ||
                 p.type === 'if-chain' || p.type === 'short-circuit');
    const mergeBlock = ifPat ? ifPat.mergeBlock : null;

    // Same successor on both sides — just follow
    if (trueSucc === falseSucc) {
      emitBlockChain(trueSucc, depth);
      return;
    }

    // Determine branch structure
    const trueGoesToMerge = mergeBlock && trueSucc === mergeBlock;
    const falseGoesToMerge = mergeBlock && falseSucc === mergeBlock;

    if (trueGoesToMerge && falseGoesToMerge) {
      // Both go to merge — no if needed, just follow
      emitBlockChain(mergeBlock, depth);
      return;
    }

    if (trueGoesToMerge) {
      // Inverted: only false branch has code
      lines.push(`${ind(depth)}if (!(${condition})) {`);
      emitBlockChain(falseSucc, depth + 1);
      lines.push(`${ind(depth)}}`);
    } else if (falseGoesToMerge) {
      // Normal: only true branch has code
      lines.push(`${ind(depth)}if (${condition}) {`);
      emitBlockChain(trueSucc, depth + 1);
      lines.push(`${ind(depth)}}`);
    } else {
      // Both branches have code → if/else
      lines.push(`${ind(depth)}if (${condition}) {`);
      emitBlockChain(trueSucc, depth + 1);
      lines.push(`${ind(depth)}} else {`);
      emitBlockChain(falseSucc, depth + 1);
      lines.push(`${ind(depth)}}`);
    }

    // Continue after merge
    if (mergeBlock) {
      emitBlockChain(mergeBlock, depth);
    }
  }

  // ================================================================
  // Inner: emit loop structure
  // ================================================================
  function emitLoop(blockId, block, loopPat, depth) {
    const hasExit = loopPat.exitBlock != null;

    if (hasExit && block.terminator && block.terminator.type === 'cjmp') {
      // Condition-based while loop
      // Emit header statements (before the condition)
      emitBlockStatements(blockId, depth);
      const condition = extractCondition(blockId);
      lines.push(`${ind(depth)}while (${condition}) {`);
    } else {
      // while(true) loop — no exit condition
      emitBlockStatements(blockId, depth);
      lines.push(`${ind(depth)}while (true) {`);
    }

    // Emit body blocks
    for (const bodyBlockId of loopPat.bodyBlocks) {
      emitBlockChain(bodyBlockId, depth + 1);
    }

    lines.push(`${ind(depth)}}`);

    // Follow exit block
    if (loopPat.exitBlock) {
      emitBlockChain(loopPat.exitBlock, depth);
    }
  }

  // ================================================================
  // Inner: emit try-catch structure
  // ================================================================
  function emitTryCatch(blockId, block, tryCatchPats, depth) {
    // If multiple try-catch patterns share this head, they represent
    // nested try-catches. Sort: first pattern = outermost handler.
    // We nest from outer to inner.

    // Collect all catch block IDs for exclusion from successor following
    const allCatchBlocks = new Set();
    for (const pat of tryCatchPats) {
      allCatchBlocks.add(pat.catchBlock);
    }

    emitNestedTryCatch(blockId, block, tryCatchPats, 0, allCatchBlocks, depth);
  }

  function emitNestedTryCatch(blockId, block, pats, patIdx, allCatchBlocks, depth) {
    const pat = pats[patIdx];

    lines.push(`${ind(depth)}try {`);

    if (patIdx < pats.length - 1) {
      // More nesting levels — recurse
      emitNestedTryCatch(blockId, block, pats, patIdx + 1, allCatchBlocks, depth + 1);
    } else {
      // Innermost try: emit block statements and follow successors
      emitBlockStatements(blockId, depth + 1);

      // Follow successors that are NOT catch blocks
      for (const succ of block.successors) {
        if (!allCatchBlocks.has(succ)) {
          emitBlockChain(succ, depth + 1);
        }
      }
    }

    lines.push(`${ind(depth)}} catch (e) {`);

    // Emit the catch block for this level
    emitBlockChain(pat.catchBlock, depth + 1);

    lines.push(`${ind(depth)}}`);

    // If this is the outermost try-catch, follow the merge block
    if (patIdx === 0 && pat.mergeBlock) {
      emitBlockChain(pat.mergeBlock, depth);
    }
  }
}

// ============================================================================
// Split compound rendered strings that contain multiple statements
// ============================================================================

/**
 * Split a compound rendered string into separate statement lines.
 * Handles cases like "var x = expr; return y" which need to be
 * separate statements.
 */
function splitCompoundRendered(rendered, stmt) {
  if (!rendered) return [];

  // Check if this is a compound with multiple effects
  if (stmt && stmt.compoundEffects && stmt.compoundEffects.length > 1) {
    // Split on '; ' but be careful not to split inside strings/parens
    const parts = smartSplit(rendered);
    if (parts.length > 1) return parts;
  }

  return [rendered];
}

/**
 * Split a string on '; ' boundaries, respecting nesting of parens,
 * brackets, and string literals.
 */
function smartSplit(str) {
  const parts = [];
  let current = '';
  let depth = 0; // paren/bracket depth
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (inString) {
      current += ch;
      if (ch === '\\') {
        // Skip next char (escape)
        i++;
        if (i < str.length) current += str[i];
      } else if (ch === stringChar) {
        inString = false;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }

    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      current += ch;
      continue;
    }

    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      current += ch;
      continue;
    }

    // Check for '; ' separator at top level
    if (depth === 0 && ch === ';' && i + 1 < str.length && str[i + 1] === ' ') {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      i++; // skip space
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed) parts.push(trimmed);

  return parts;
}

// ============================================================================
// Batch API
// ============================================================================

/**
 * Emit all functions as JavaScript.
 *
 * @param {Map<string, Map<string, object>>} allReconstructed - funcId → blockId → ReconstructedBlock
 * @param {object} allPatterns - funcId → pattern data (from patterns.json)
 * @param {object} allCFGs - funcId → CFG data (from cfg.json)
 * @param {Array} funcTable - Function metadata table (from functions.json)
 * @returns {Map<string, string>} funcId → emitted JS source
 */
function emitAll(allReconstructed, allPatterns, allCFGs, funcTable) {
  const funcMetaById = new Map();
  if (funcTable) {
    for (const fm of funcTable) {
      funcMetaById.set(String(fm.id), fm);
    }
  }

  const result = new Map();

  for (const [funcId, blocks] of allReconstructed.entries()) {
    const patternData = allPatterns[funcId] || { patterns: [] };
    const cfgData = allCFGs[funcId] || { blocks: [] };
    const funcMeta = funcMetaById.get(funcId) || {};

    try {
      const code = emitFunction(funcId, blocks, patternData, cfgData, funcMeta);
      result.set(funcId, code);
    } catch (err) {
      // Emit a stub function on error to keep going
      const arity = (funcMeta && funcMeta.arity != null) ? funcMeta.arity : 0;
      const args = Array.from({ length: arity }, (_, i) => `arg${i}`);
      result.set(funcId, `function func_${funcId}(${args.join(', ')}) {\n  /* EMIT ERROR: ${err.message} */\n}`);
    }
  }

  return result;
}

/**
 * Assemble all emitted functions into a complete program.
 *
 * @param {Map<string, string>} allEmitted - funcId → JS source
 * @param {Array} funcTable - Function metadata table
 * @returns {string} Complete JS program
 */
function emitProgram(allEmitted, funcTable) {
  const lines = [];
  lines.push('// ChaosVM Decompiled Output');
  lines.push('// Generated by ChaosVM decompiler');
  lines.push('');

  // Sort function IDs numerically
  const funcIds = Array.from(allEmitted.keys())
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  // Emit all non-main functions first
  for (const funcId of funcIds) {
    if (funcId === '0') continue; // main is emitted last
    const code = allEmitted.get(funcId);
    lines.push(code);
    lines.push('');
  }

  // Emit main function (func_0) and its invocation
  if (allEmitted.has('0')) {
    lines.push('// Main entry point');
    lines.push(allEmitted.get('0'));
    lines.push('');
    lines.push('// Entry point invocation');
    lines.push('func_0();');
  }

  return lines.join('\n');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  emitFunction,
  emitAll,
  emitProgram,
  // Exposed for testing
  renderStatementJS,
  renderCompoundJS,
  splitCompoundRendered,
  smartSplit,
};
