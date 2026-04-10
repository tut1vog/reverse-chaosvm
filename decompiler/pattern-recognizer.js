'use strict';

/**
 * ChaosVM Control Flow Pattern Recognizer
 *
 * Recognizes structured control flow patterns from CFGs:
 * - if / if-else / if-chain
 * - while / for / for-in loops
 * - try-catch / try-catch-finally
 * - sequence (fallthrough blocks)
 *
 * Implementation approach:
 *   Step 1: Compute dominance and post-dominance trees
 *   Step 2: Detect natural loops via back-edges
 *   Step 3: Detect if/else patterns via CJMP + post-dominator merge
 *   Step 4: Detect try/catch regions via exception handler info
 *   Step 5: Build hierarchical pattern tree
 *
 * The core function `recognizePatterns` is pure — no file I/O.
 */

const { parseDisasmLine, getControlFlowInfo } = require('./cfg-builder');

// ============================================================================
// Step 1: Dominator Tree Computation
// ============================================================================

/**
 * Compute the immediate dominator tree using the iterative algorithm
 * (Cooper, Harvey, Kennedy 2001).
 *
 * @param {object[]} blocks - Array of block objects from CFG
 * @param {string} entryId - ID of the entry block (usually "b0")
 * @returns {Map<string, string|null>} Map<blockId, immediateDominatorId>
 */
function computeDominators(blocks, entryId) {
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);

  // Build predecessor map
  const preds = new Map();
  for (const b of blocks) preds.set(b.id, []);
  for (const b of blocks) {
    for (const s of b.successors) {
      if (preds.has(s)) preds.get(s).push(b.id);
    }
  }

  // Reverse post-order numbering via DFS from entry
  const rpo = [];
  const rpoNumber = new Map();
  {
    const visited = new Set();
    function dfs(id) {
      if (visited.has(id)) return;
      visited.add(id);
      const block = blockById.get(id);
      if (!block) return;
      for (const s of block.successors) {
        if (blockById.has(s)) dfs(s);
      }
      rpo.push(id);
    }
    dfs(entryId);
    rpo.reverse();
    for (let i = 0; i < rpo.length; i++) rpoNumber.set(rpo[i], i);
  }

  // Initialize idom: entry dominates itself
  const idom = new Map();
  idom.set(entryId, entryId);

  function intersect(b1, b2) {
    let finger1 = b1;
    let finger2 = b2;
    while (finger1 !== finger2) {
      while (rpoNumber.get(finger1) > rpoNumber.get(finger2)) {
        finger1 = idom.get(finger1);
      }
      while (rpoNumber.get(finger2) > rpoNumber.get(finger1)) {
        finger2 = idom.get(finger2);
      }
    }
    return finger1;
  }

  // Iterate until convergence
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of rpo) {
      if (b === entryId) continue;
      if (!rpoNumber.has(b)) continue;

      // Find the first processed predecessor
      const ps = (preds.get(b) || []).filter(p => idom.has(p) && rpoNumber.has(p));
      if (ps.length === 0) continue;

      let newIdom = ps[0];
      for (let i = 1; i < ps.length; i++) {
        newIdom = intersect(ps[i], newIdom);
      }

      if (idom.get(b) !== newIdom) {
        idom.set(b, newIdom);
        changed = true;
      }
    }
  }

  // Convert entry's self-dominance to null
  const result = new Map();
  for (const [id, dom] of idom) {
    result.set(id, id === entryId ? null : dom);
  }
  return result;
}

/**
 * Compute post-dominators by computing dominators on the reversed CFG.
 * The "entry" for the reverse CFG is a virtual exit node connected to all
 * blocks that have no successors (ret/throw blocks).
 *
 * @param {object[]} blocks - Array of block objects
 * @returns {Map<string, string|null>} Map<blockId, immediatePostDominatorId>
 */
function computePostDominators(blocks) {
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);

  // Find exit blocks (no successors, or only successors outside the function)
  const exitBlocks = blocks.filter(b =>
    b.successors.length === 0 ||
    b.successors.every(s => !blockById.has(s))
  );

  if (exitBlocks.length === 0) {
    // All blocks have successors — infinite loop with no exit.
    // Return empty post-dominator map.
    return new Map();
  }

  // Create virtual exit node and reversed edges
  const VIRTUAL_EXIT = '__exit__';
  const allIds = blocks.map(b => b.id).concat([VIRTUAL_EXIT]);

  // Build reverse successor lists
  const revSuccs = new Map();
  for (const id of allIds) revSuccs.set(id, []);

  // Reverse edges: for each A→B in forward, add B→A in reverse
  for (const b of blocks) {
    for (const s of b.successors) {
      if (blockById.has(s)) {
        revSuccs.get(s).push(b.id);
      }
    }
  }

  // Virtual exit → all exit blocks (in reverse, exit blocks → virtual exit becomes virtual exit → exit blocks)
  for (const eb of exitBlocks) {
    revSuccs.get(VIRTUAL_EXIT).push(eb.id);
  }

  // Build reverse predecessor lists (= forward successor lists + virtual exit edges)
  const revPreds = new Map();
  for (const id of allIds) revPreds.set(id, []);
  for (const [id, succs] of revSuccs) {
    for (const s of succs) {
      if (revPreds.has(s)) revPreds.get(s).push(id);
    }
  }

  // Reverse post-order on the reversed graph (from virtual exit)
  const rpo = [];
  const rpoNumber = new Map();
  {
    const visited = new Set();
    function dfs(id) {
      if (visited.has(id)) return;
      visited.add(id);
      for (const s of (revSuccs.get(id) || [])) {
        dfs(s);
      }
      rpo.push(id);
    }
    dfs(VIRTUAL_EXIT);
    rpo.reverse();
    for (let i = 0; i < rpo.length; i++) rpoNumber.set(rpo[i], i);
  }

  // Standard dominator algorithm on the reversed graph
  const idom = new Map();
  idom.set(VIRTUAL_EXIT, VIRTUAL_EXIT);

  function intersect(b1, b2) {
    let finger1 = b1;
    let finger2 = b2;
    while (finger1 !== finger2) {
      while ((rpoNumber.get(finger1) || 0) > (rpoNumber.get(finger2) || 0)) {
        finger1 = idom.get(finger1);
        if (!finger1) return b2; // safety
      }
      while ((rpoNumber.get(finger2) || 0) > (rpoNumber.get(finger1) || 0)) {
        finger2 = idom.get(finger2);
        if (!finger2) return b1; // safety
      }
    }
    return finger1;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const b of rpo) {
      if (b === VIRTUAL_EXIT) continue;
      if (!rpoNumber.has(b)) continue;

      const ps = (revPreds.get(b) || []).filter(p => idom.has(p) && rpoNumber.has(p));
      if (ps.length === 0) continue;

      let newIdom = ps[0];
      for (let i = 1; i < ps.length; i++) {
        newIdom = intersect(ps[i], newIdom);
      }

      if (idom.get(b) !== newIdom) {
        idom.set(b, newIdom);
        changed = true;
      }
    }
  }

  // Convert to result map, removing virtual exit
  const result = new Map();
  for (const b of blocks) {
    const pd = idom.get(b.id);
    if (pd === VIRTUAL_EXIT || pd === undefined) {
      result.set(b.id, null);
    } else {
      result.set(b.id, pd);
    }
  }
  return result;
}

/**
 * Check if block A dominates block B using the dominator tree.
 */
function dominates(dom, a, b) {
  if (a === b) return true;
  let current = b;
  const visited = new Set();
  while (current !== null && current !== undefined) {
    if (visited.has(current)) return false; // cycle protection
    visited.add(current);
    current = dom.get(current);
    if (current === a) return true;
  }
  return false;
}

// ============================================================================
// Step 2: Loop Detection (Natural Loops)
// ============================================================================

/**
 * Find all back-edges in the CFG: edge A→B where B dominates A.
 */
function findBackEdges(blocks, dom) {
  const backEdges = [];
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);

  for (const block of blocks) {
    for (const succId of block.successors) {
      if (dominates(dom, succId, block.id)) {
        backEdges.push({ from: block.id, to: succId });
      }
    }
  }
  return backEdges;
}

/**
 * Compute the natural loop body for a back-edge from→to.
 * The loop body is all blocks that can reach `from` without going through `to`,
 * plus `to` itself (the header).
 */
function computeNaturalLoop(blocks, backEdge) {
  const { from, to: header } = backEdge;
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);

  // Build predecessor map
  const preds = new Map();
  for (const b of blocks) preds.set(b.id, []);
  for (const b of blocks) {
    for (const s of b.successors) {
      if (preds.has(s)) preds.get(s).push(b.id);
    }
  }

  const loopBody = new Set([header]);
  if (from === header) return loopBody; // single-block loop

  // Work backwards from the back-edge source
  loopBody.add(from);
  const worklist = [from];

  while (worklist.length > 0) {
    const n = worklist.pop();
    for (const p of (preds.get(n) || [])) {
      if (!loopBody.has(p)) {
        loopBody.add(p);
        worklist.push(p);
      }
    }
  }

  return loopBody;
}

/**
 * Detect all loops in a function's CFG.
 * Returns array of loop objects.
 */
function detectLoops(blocks, dom) {
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);

  const backEdges = findBackEdges(blocks, dom);
  const loops = [];
  const loopHeaders = new Set();

  // Group back-edges by header to merge multiple back-edges to same header
  const edgesByHeader = new Map();
  for (const edge of backEdges) {
    if (!edgesByHeader.has(edge.to)) edgesByHeader.set(edge.to, []);
    edgesByHeader.get(edge.to).push(edge);
  }

  for (const [header, edges] of edgesByHeader) {
    // Merge all natural loop bodies for back-edges to same header
    const mergedBody = new Set();
    for (const edge of edges) {
      const body = computeNaturalLoop(blocks, edge);
      for (const b of body) mergedBody.add(b);
    }

    const headerBlock = blockById.get(header);
    if (!headerBlock) continue;

    loopHeaders.add(header);

    // Determine loop type
    let loopType = 'while';
    let exitBlock = null;

    // Check for for-in: look for ITER_SHIFT in the header
    // (we check the mnemonic in instructions if available via disasm)
    // For now, classify based on terminator type

    if (headerBlock.terminator && headerBlock.terminator.type === 'cjmp') {
      // Find exit edge (successor not in loop body)
      for (const s of headerBlock.successors) {
        if (!mergedBody.has(s)) {
          exitBlock = s;
          break;
        }
      }
    }

    // Body blocks are all loop blocks except the header
    const bodyBlocks = Array.from(mergedBody).filter(b => b !== header);

    loops.push({
      type: loopType,
      headBlock: header,
      condBlock: header,
      bodyBlocks: bodyBlocks,
      exitBlock: exitBlock,
      mergeBlock: exitBlock,
      allBlocks: mergedBody,
      backEdges: edges,
    });
  }

  return { loops, loopHeaders };
}

// ============================================================================
// Step 3: If/Else Pattern Detection
// ============================================================================

/**
 * Collect blocks reachable from `start` up to (but not including) `boundary`
 * blocks, avoiding loops via `loopBlocks` set.
 */
function collectBranch(blockById, start, boundaries, loopBlocks) {
  const result = [];
  const visited = new Set();
  const worklist = [start];

  while (worklist.length > 0) {
    const id = worklist.pop();
    if (visited.has(id)) continue;
    if (boundaries.has(id)) continue;
    if (loopBlocks && loopBlocks.has(id)) continue;

    const block = blockById.get(id);
    if (!block) continue;

    visited.add(id);
    result.push(id);

    for (const s of block.successors) {
      if (!visited.has(s) && !boundaries.has(s)) {
        worklist.push(s);
      }
    }
  }

  return result;
}

/**
 * Detect if/else, if-chain, and short-circuit patterns.
 */
function detectIfElsePatterns(blocks, dom, postDom, loopHeaders) {
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);
  const patterns = [];

  for (const block of blocks) {
    // Only process CJMP blocks that are NOT loop headers
    if (!block.terminator || block.terminator.type !== 'cjmp') continue;
    if (loopHeaders.has(block.id)) continue;

    // The merge point is the immediate post-dominator
    const mergeBlock = postDom.get(block.id) || null;

    if (block.successors.length === 1) {
      // CJMP with only 1 valid successor (other target is a data-region address).
      // Treat as a degenerate if with one reachable branch.
      /* UNCERTAIN: data-region CJMP — one branch target is invalid */
      patterns.push({
        type: 'if',
        headBlock: block.id,
        condBlock: block.id,
        thenBlocks: [block.successors[0]],
        elseBlocks: [],
        mergeBlock: null,
      });
      continue;
    }
    if (block.successors.length !== 2) continue;

    const trueSucc = block.successors[0]; // true branch
    const falseSucc = block.successors[1]; // false branch

    // Boundaries: the merge block and the CJMP block itself
    const boundaries = new Set();
    if (mergeBlock) boundaries.add(mergeBlock);
    boundaries.add(block.id);

    // Collect then/else blocks
    const thenBlocks = mergeBlock && trueSucc === mergeBlock
      ? []
      : collectBranch(blockById, trueSucc, boundaries, null);
    const elseBlocks = mergeBlock && falseSucc === mergeBlock
      ? []
      : collectBranch(blockById, falseSucc, boundaries, null);

    // Check for if-chain: false branch leads to another CJMP that
    // shares the same merge point
    let isIfChain = false;
    if (elseBlocks.length === 0 && falseSucc !== mergeBlock) {
      const falseBlock = blockById.get(falseSucc);
      if (falseBlock && falseBlock.terminator && falseBlock.terminator.type === 'cjmp') {
        const falsePostDom = postDom.get(falseSucc);
        if (falsePostDom === mergeBlock) {
          isIfChain = true;
        }
      }
    }

    // Check for short-circuit: both branches are empty or trivial
    // and merge at the same point
    const isShortCircuit = thenBlocks.length === 0 && elseBlocks.length === 0 && mergeBlock;

    let patternType;
    if (isShortCircuit) {
      patternType = 'short-circuit';
    } else if (isIfChain) {
      patternType = 'if-chain';
    } else if (elseBlocks.length === 0) {
      patternType = 'if';
    } else if (thenBlocks.length === 0) {
      // Reversed if — the "then" branch goes directly to merge
      patternType = 'if';
    } else {
      patternType = 'if-else';
    }

    const pattern = {
      type: patternType,
      headBlock: block.id,
      condBlock: block.id,
      thenBlocks: thenBlocks,
      elseBlocks: elseBlocks,
      mergeBlock: mergeBlock,
    };

    if (isIfChain) {
      // Build the chain of conditions
      const conditions = [{ condBlock: block.id, bodyBlocks: thenBlocks }];
      let current = falseSucc;
      const chainVisited = new Set([block.id]);

      while (current && !chainVisited.has(current)) {
        chainVisited.add(current);
        const cb = blockById.get(current);
        if (!cb || !cb.terminator || cb.terminator.type !== 'cjmp') break;
        if (loopHeaders.has(current)) break;

        const cbMerge = postDom.get(current);
        if (cbMerge !== mergeBlock) break;

        const cbTrue = cb.successors[0];
        const cbFalse = cb.successors[1];
        const cbThenBlocks = mergeBlock && cbTrue === mergeBlock
          ? []
          : collectBranch(blockById, cbTrue, boundaries, null);

        conditions.push({ condBlock: current, bodyBlocks: cbThenBlocks });

        // Check if false branch continues the chain
        const fbBlock = blockById.get(cbFalse);
        if (fbBlock && fbBlock.terminator && fbBlock.terminator.type === 'cjmp'
            && postDom.get(cbFalse) === mergeBlock) {
          current = cbFalse;
        } else {
          // Last else clause
          const finalElse = mergeBlock && cbFalse === mergeBlock
            ? []
            : collectBranch(blockById, cbFalse, boundaries, null);
          pattern.conditions = conditions;
          pattern.elseBlocks = finalElse;
          break;
        }
      }

      if (!pattern.conditions) {
        pattern.conditions = conditions;
      }
    }

    patterns.push(pattern);
  }

  return patterns;
}

// ============================================================================
// Step 4: Try/Catch Region Detection
// ============================================================================

/**
 * Detect try/catch and try/catch/finally patterns from exception handler info.
 *
 * Strategy:
 *   - Walk blocks looking for exceptionHandlers entries
 *   - The block with the handler push is the start of the try region
 *   - The handler target block starts the catch region
 *   - Walk forward from the try start until we hit a TRY_POP or reach
 *     the handler block — that defines the try body
 *   - Nested handlers (handler block also has exceptionHandlers) suggest finally
 */
function detectTryCatchPatterns(blocks, dom, postDom) {
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);
  const patterns = [];
  const handlerBlockIds = new Set();

  // Collect all blocks that serve as exception handlers
  for (const block of blocks) {
    for (const h of block.exceptionHandlers) {
      handlerBlockIds.add(h);
    }
  }

  // For each block that pushes an exception handler
  for (const block of blocks) {
    if (block.exceptionHandlers.length === 0) continue;

    for (const handlerBlockId of block.exceptionHandlers) {
      const handlerBlock = blockById.get(handlerBlockId);
      if (!handlerBlock) continue;

      // The try region starts at the block that pushes the handler.
      // Walk successors to find the try body — blocks reachable before
      // the handler or a merge point.

      // Determine merge point: post-dominator of the pushing block
      const mergeBlock = postDom.get(block.id) || null;

      // Try body = reachable from the pushing block's successor,
      // not going through the handler block
      const tryBlocks = [block.id];

      // Walk forward to collect try body blocks
      const tryVisited = new Set([block.id]);
      const tryWorklist = [...block.successors];

      while (tryWorklist.length > 0) {
        const id = tryWorklist.pop();
        if (tryVisited.has(id)) continue;
        if (id === handlerBlockId) continue;
        if (id === mergeBlock) continue;
        if (handlerBlockIds.has(id) && id !== block.id) continue;

        const b = blockById.get(id);
        if (!b) continue;

        tryVisited.add(id);
        tryBlocks.push(id);

        for (const s of b.successors) {
          if (!tryVisited.has(s)) {
            tryWorklist.push(s);
          }
        }
      }

      // Catch body = reachable from handler block, stopping at merge
      const catchBlocks = [];
      const catchVisited = new Set();
      const catchWorklist = [handlerBlockId];

      while (catchWorklist.length > 0) {
        const id = catchWorklist.pop();
        if (catchVisited.has(id)) continue;
        if (id === mergeBlock && id !== handlerBlockId) continue;
        if (tryVisited.has(id) && id !== handlerBlockId) continue;

        const b = blockById.get(id);
        if (!b) continue;

        catchVisited.add(id);
        catchBlocks.push(id);

        for (const s of b.successors) {
          if (!catchVisited.has(s)) {
            catchWorklist.push(s);
          }
        }
      }

      // Check for finally: does the handler block also push a handler?
      let finallyBlocks = [];
      let patternType = 'try-catch';
      if (handlerBlock.exceptionHandlers.length > 0) {
        // The handler block has its own handler — this is likely a try-catch-finally
        // where the catch block re-pushes for finally
        patternType = 'try-catch-finally';
        // The inner handler's blocks form the finally
        for (const innerH of handlerBlock.exceptionHandlers) {
          const innerBlock = blockById.get(innerH);
          if (innerBlock) {
            finallyBlocks.push(innerH);
          }
        }
      }

      patterns.push({
        type: patternType,
        headBlock: block.id,
        tryBlocks: tryBlocks,
        catchBlock: handlerBlockId,
        catchBlocks: catchBlocks,
        finallyBlocks: finallyBlocks,
        mergeBlock: mergeBlock,
      });
    }
  }

  return patterns;
}

// ============================================================================
// Step 5: Build Hierarchical Structure & Assign Sequences
// ============================================================================

/**
 * Assign each block to at least one pattern. Blocks not claimed by any
 * specific pattern get a "sequence" pattern.
 */
function assignSequences(blocks, allPatterns) {
  const claimedBlocks = new Set();

  // Collect all blocks claimed by detected patterns
  for (const p of allPatterns) {
    if (p.headBlock) claimedBlocks.add(p.headBlock);
    if (p.condBlock) claimedBlocks.add(p.condBlock);
    if (p.mergeBlock) claimedBlocks.add(p.mergeBlock);

    if (p.thenBlocks) p.thenBlocks.forEach(b => claimedBlocks.add(b));
    if (p.elseBlocks) p.elseBlocks.forEach(b => claimedBlocks.add(b));
    if (p.bodyBlocks) p.bodyBlocks.forEach(b => claimedBlocks.add(b));
    if (p.tryBlocks) p.tryBlocks.forEach(b => claimedBlocks.add(b));
    if (p.catchBlocks) p.catchBlocks.forEach(b => claimedBlocks.add(b));
    if (p.finallyBlocks) p.finallyBlocks.forEach(b => claimedBlocks.add(b));
    if (p.exitBlock) claimedBlocks.add(p.exitBlock);

    // Loop allBlocks
    if (p.allBlocks) {
      for (const b of p.allBlocks) claimedBlocks.add(b);
    }

    // If-chain conditions
    if (p.conditions) {
      for (const c of p.conditions) {
        if (c.condBlock) claimedBlocks.add(c.condBlock);
        if (c.bodyBlocks) c.bodyBlocks.forEach(b => claimedBlocks.add(b));
      }
    }
  }

  // Create sequence patterns for unclaimed blocks
  const sequencePatterns = [];
  for (const block of blocks) {
    if (!claimedBlocks.has(block.id)) {
      sequencePatterns.push({
        type: 'sequence',
        headBlock: block.id,
        blocks: [block.id],
        mergeBlock: null,
      });
      claimedBlocks.add(block.id);
    }
  }

  return sequencePatterns;
}

/**
 * Check for for-in patterns: ENUMERATE → ITER_SHIFT block loop.
 * Upgrades matching while loops to for-in.
 */
function detectForInLoops(loops, blocks, instrMap) {
  const blockById = new Map();
  for (const b of blocks) blockById.set(b.id, b);

  for (const loop of loops) {
    const headerBlock = blockById.get(loop.condBlock);
    if (!headerBlock) continue;

    // Check if any instruction in the header is ITER_SHIFT (op 84)
    let hasIterShift = false;
    for (const pc of headerBlock.instructions) {
      const instr = instrMap ? instrMap.get(pc) : null;
      if (instr && instr.mnemonic === 'ITER_SHIFT') {
        hasIterShift = true;
        break;
      }
    }

    if (hasIterShift) {
      loop.type = 'for-in';
      // Find the ENUMERATE block (predecessor of header that contains ENUMERATE)
      for (const predId of headerBlock.predecessors) {
        if (loop.allBlocks && loop.allBlocks.has(predId)) continue; // skip loop body blocks
        const predBlock = blockById.get(predId);
        if (!predBlock) continue;
        for (const pc of predBlock.instructions) {
          const instr = instrMap ? instrMap.get(pc) : null;
          if (instr && instr.mnemonic === 'ENUMERATE') {
            loop.enumBlock = predId;
            loop.iterBlock = loop.condBlock;
            break;
          }
        }
        if (loop.enumBlock) break;
      }
    }
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Recognize control flow patterns for a single function's CFG.
 *
 * @param {object} cfg - A single function's CFG from cfg.json
 *   { functionId, entryPC, blocks, blockCount, instructionCount }
 * @param {string[]} disasmLines - Full disassembly lines (for instruction lookup)
 * @returns {object} AnnotatedCFG with pattern annotations
 */
function recognizePatterns(cfg, disasmLines) {
  const { blocks, functionId } = cfg;

  if (!blocks || blocks.length === 0) {
    return {
      functionId: cfg.functionId,
      entryPC: cfg.entryPC,
      blockCount: 0,
      patterns: [],
      dominators: {},
      postDominators: {},
      stats: { loops: 0, ifElse: 0, tryCatch: 0, sequences: 0, shortCircuits: 0, total: 0 },
    };
  }

  // Build instruction map from disasm lines (for for-in detection)
  const instrMap = new Map();
  if (disasmLines) {
    // Only parse instructions in this function's PC range for efficiency
    const pcSet = new Set();
    for (const b of blocks) {
      for (const pc of b.instructions) pcSet.add(pc);
    }
    for (const line of disasmLines) {
      const instr = parseDisasmLine(line);
      if (instr && pcSet.has(instr.pc)) {
        instrMap.set(instr.pc, instr);
      }
    }
  }

  const entryId = blocks[0].id; // b0 is always entry

  // Step 1: Compute dominators and post-dominators
  const dom = computeDominators(blocks, entryId);
  const postDom = computePostDominators(blocks);

  // Step 2: Detect loops
  const { loops, loopHeaders } = detectLoops(blocks, dom);

  // Upgrade for-in loops
  detectForInLoops(loops, blocks, instrMap);

  // Step 3: Detect if/else patterns
  const ifPatterns = detectIfElsePatterns(blocks, dom, postDom, loopHeaders);

  // Step 4: Detect try/catch patterns
  const tryCatchPatterns = detectTryCatchPatterns(blocks, dom, postDom);

  // Step 5: Combine all patterns and fill gaps with sequences
  const allPatterns = [...loops, ...ifPatterns, ...tryCatchPatterns];
  const sequencePatterns = assignSequences(blocks, allPatterns);
  allPatterns.push(...sequencePatterns);

  // Clean up internal-only fields from loop patterns before output
  for (const p of allPatterns) {
    if (p.allBlocks) {
      // Convert Set to Array for JSON serialization
      p.allBlocks = Array.from(p.allBlocks);
    }
    // Remove backEdges from output (internal detail)
    delete p.backEdges;
  }

  // Compute stats
  const stats = {
    loops: loops.length,
    ifElse: ifPatterns.filter(p => p.type === 'if' || p.type === 'if-else').length,
    ifChains: ifPatterns.filter(p => p.type === 'if-chain').length,
    shortCircuits: ifPatterns.filter(p => p.type === 'short-circuit').length,
    tryCatch: tryCatchPatterns.length,
    sequences: sequencePatterns.length,
    total: allPatterns.length,
  };

  // Convert dominator maps to objects for JSON
  const domObj = {};
  for (const [k, v] of dom) domObj[k] = v;
  const postDomObj = {};
  for (const [k, v] of postDom) postDomObj[k] = v;

  return {
    functionId: cfg.functionId,
    entryPC: cfg.entryPC,
    blockCount: blocks.length,
    patterns: allPatterns,
    dominators: domObj,
    postDominators: postDomObj,
    stats: stats,
  };
}

/**
 * Recognize patterns for all functions.
 *
 * @param {object} cfgMap - Map/Object of functionId → CFG
 * @param {string[]} disasmLines - Full disassembly lines
 * @returns {object} Map of functionId → AnnotatedCFG
 */
function recognizeAllPatterns(cfgMap, disasmLines) {
  const results = {};

  // Handle both Map and plain object
  const entries = cfgMap instanceof Map
    ? Array.from(cfgMap.entries())
    : Object.entries(cfgMap);

  for (const [funcId, cfg] of entries) {
    results[funcId] = recognizePatterns(cfg, disasmLines);
  }

  return results;
}

module.exports = {
  recognizePatterns,
  recognizeAllPatterns,
  computeDominators,
  computePostDominators,
  detectLoops,
  detectIfElsePatterns,
  detectTryCatchPatterns,
  dominates,
  findBackEdges,
};
