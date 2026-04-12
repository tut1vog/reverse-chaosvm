'use strict';

// vdata-trace.js — task 42.1
//
// Static trace that identifies where `window.getVData` is installed in the
// vm-slide stack-VM bytecode. Reconstructs every string built via the
// canonical `OP_04 (OP_10 <chr>)* OP_13` pattern, filters to the vData
// anchors, determines the enclosing basic block via control-flow walking,
// and classifies each anchor as a read or a property write based on the
// opcodes that immediately follow the OP_13 resolve.
//
// Writes output/vm-slide/vdata-anchors.json. Idempotent.
//
// See research/vm-slide-stack-vm/VDATA-TRACE.md for the analysis note.

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'vm-slide');
const BYTECODE_PATH = path.join(OUT_DIR, 'bytecode.json');
const DISPATCH_PATH = path.join(OUT_DIR, 'dispatch-table.json');
const LISTING_PATH = path.join(OUT_DIR, 'disassembly-full.txt');
const OUT_PATH = path.join(OUT_DIR, 'vdata-anchors.json');

const TARGET_STRINGS = new Set(['getVData', 'vData=', '&vData=']);
// Additional anchors to flag if found (case variants / related substrings).
const EXTRA_SUBSTRINGS = ['vdata', 'VData', 'VDATA'];

// Opcode constants used by the classifier.
const OP_ADD = 20;          // string concat / numeric add
const OP_PROPSET = 24;      // A[0][A[1]] = TOS
const OP_METHOD_CALL = 2;   // method invoke
const OP_METHOD_NEW = 25;   // construct via method
const OP_CALL_1 = 55;       // invoke callable at TOS
const OP_CALL_U = 66;       // invoke TOS with U as receiver
const OP_PROPGET = 54;      // A[0][A[1]] (read)
const OP_MAKE_PAIR = 41;    // var A=pop, C=pop; push [C[0][C[1]], A]
const OP_MAKE_PAIR_2 = 59;  // [n[pop][0], A]
const OP_PUSH_GLOBAL_PAIR = 32; // push [U, pop]

const OP_STR_INIT = 4;    // n.push("")
const OP_STR_APPEND = 10; // n[top] += String.fromCharCode(operand)
const OP_RESOLVE = 13;    // n[top] = U[n[top]]  (global-scope lookup)
const OP_JUMP = 6;
const OP_HALT = 16;
const OP_TRY_PUSH = 35;
const OP_FUNC_CREATE = 58;
const OP_JUMP_IF_TRUE = 60;

const TERMINATORS = new Set([OP_JUMP, OP_HALT]);
const BRANCHES = new Set([OP_JUMP_IF_TRUE]);

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

// Decode one instruction (matches walker.js, including variable-width OP_58).
function readInstruction(bytecode, pc, dispatch) {
  if (pc < 0 || pc >= bytecode.length) {
    return { opcode: null, operands: [], nextPc: pc, kind: 'oor' };
  }
  const op = bytecode[pc];
  if (typeof op !== 'number' || op < 0 || op >= dispatch.length || !Number.isInteger(op)) {
    return { opcode: op, operands: [], nextPc: pc + 1, kind: 'oor' };
  }
  const entry = dispatch[op];
  if (entry === null) {
    return { opcode: op, operands: [], nextPc: pc + 1, kind: 'hole' };
  }
  let cursor = pc + 1;
  const operands = [];
  if (op === OP_FUNC_CREATE) {
    if (cursor + 3 > bytecode.length) {
      return { opcode: op, operands, nextPc: cursor, kind: 'truncated' };
    }
    const K = bytecode[cursor++];
    const A = bytecode[cursor++];
    const C = bytecode[cursor++];
    operands.push(K, A, C);
    const tailLen = 2 * A + C;
    if (cursor + tailLen > bytecode.length) {
      return { opcode: op, operands, nextPc: cursor, kind: 'truncated' };
    }
    for (let i = 0; i < tailLen; i++) operands.push(bytecode[cursor++]);
    return { opcode: op, operands, nextPc: cursor, kind: 'ok' };
  }
  const n = entry.operandCount;
  if (cursor + n > bytecode.length) {
    return { opcode: op, operands, nextPc: cursor, kind: 'truncated' };
  }
  for (let i = 0; i < n; i++) operands.push(bytecode[cursor++]);
  return { opcode: op, operands, nextPc: cursor, kind: 'ok' };
}

// Walk the bytecode following control flow, producing a Map pc -> decoded
// instruction object. Mirrors walker.js, but keeps the decoded instructions
// in memory instead of writing a listing. Returns { pcList, byPc } where
// pcList is a sorted array of visited PCs and byPc maps pc -> decoded.
function walk(bytecode, dispatch) {
  const byPc = new Map();
  const functionEntries = new Set([0]);
  const worklist = [0];

  while (worklist.length > 0) {
    let pc = worklist.pop();
    while (pc >= 0 && pc < bytecode.length) {
      if (byPc.has(pc)) break;
      const decoded = readInstruction(bytecode, pc, dispatch);
      if (decoded.kind !== 'ok') {
        byPc.set(pc, decoded);
        break;
      }
      byPc.set(pc, decoded);
      const op = decoded.opcode;

      if (op === OP_TRY_PUSH && decoded.operands.length >= 1) {
        const h = decoded.operands[0];
        if (Number.isInteger(h) && h >= 0 && h < bytecode.length && !byPc.has(h)) {
          worklist.push(h);
        }
      }
      if (op === OP_FUNC_CREATE && decoded.operands.length >= 1) {
        const K = decoded.operands[0];
        if (Number.isInteger(K) && K >= 0 && K < bytecode.length && !functionEntries.has(K)) {
          functionEntries.add(K);
          if (!byPc.has(K)) worklist.push(K);
        }
      }
      if (TERMINATORS.has(op)) {
        if (op === OP_JUMP) {
          const t = decoded.operands[0];
          if (Number.isInteger(t) && t >= 0 && t < bytecode.length && !byPc.has(t)) {
            worklist.push(t);
          }
        }
        break;
      }
      if (BRANCHES.has(op)) {
        const t = decoded.operands[0];
        if (Number.isInteger(t) && t >= 0 && t < bytecode.length && !byPc.has(t)) {
          worklist.push(t);
        }
      }
      pc = decoded.nextPc;
    }
  }

  const pcList = Array.from(byPc.keys()).sort((a, b) => a - b);
  return { pcList, byPc, functionEntries };
}

// Find all string-build runs in the walked code. A run starts at OP_04,
// consumes zero or more contiguous OP_10 append instructions, and is
// terminated by either:
//   (a) OP_13 resolve — run produces a resolved global binding, or
//   (b) any other opcode — run produces a bare string literal on the stack.
// For case (b), `resolvePc` is null and `lastAppendEndPc` marks the
// instruction after the final OP_10 (which is the first non-append pc).
function findStringRuns(pcList, byPc) {
  const runs = [];
  for (let i = 0; i < pcList.length; i++) {
    const pc = pcList[i];
    const instr = byPc.get(pc);
    if (!instr || instr.kind !== 'ok' || instr.opcode !== OP_STR_INIT) continue;

    let chars = '';
    let cur = instr.nextPc;
    // Consume contiguous appends.
    while (true) {
      const it = byPc.get(cur);
      if (!it || it.kind !== 'ok' || it.opcode !== OP_STR_APPEND) break;
      chars += String.fromCharCode(it.operands[0]);
      cur = it.nextPc;
    }
    if (chars.length === 0) continue;

    // Check for an OP_13 immediately after the last append.
    let resolvePc = null;
    let afterPc = cur;
    const tail = byPc.get(cur);
    if (tail && tail.kind === 'ok' && tail.opcode === OP_RESOLVE) {
      resolvePc = cur;
      afterPc = tail.nextPc;
    }
    runs.push({
      string: chars,
      buildPc: pc,
      resolvePc,
      lastAppendEndPc: cur, // pc of first instruction after the OP_10 run
      afterPc,
      byteLength: afterPc - pc
    });
  }
  return runs;
}

// Determine the enclosing basic block of a pc by scanning backward and
// forward through the walked pc list. A block starts at the instruction
// after the nearest preceding terminator/branch (or at the nearest function
// entry, whichever is higher) and ends at the nearest following terminator
// or branch.
function enclosingBlock(pc, pcList, byPc, functionEntries) {
  const idx = pcList.indexOf(pc);
  if (idx < 0) return [pc, pc];
  // Walk backward.
  let start = pc;
  for (let i = idx - 1; i >= 0; i--) {
    const p = pcList[i];
    const it = byPc.get(p);
    if (!it || it.kind !== 'ok') break;
    // Non-contiguous: previous instr's nextPc != pcList[i+1] -> region gap.
    if (it.nextPc !== pcList[i + 1]) break;
    if (TERMINATORS.has(it.opcode) || BRANCHES.has(it.opcode)) {
      // The instruction AFTER this terminator/branch is the block start.
      start = pcList[i + 1];
      break;
    }
    start = p;
    if (functionEntries.has(p)) break;
  }
  // Walk forward.
  let end = pc;
  for (let i = idx; i < pcList.length; i++) {
    const p = pcList[i];
    const it = byPc.get(p);
    if (!it || it.kind !== 'ok') { end = p; break; }
    end = it.nextPc - 1;
    if (TERMINATORS.has(it.opcode) || BRANCHES.has(it.opcode)) break;
    if (i + 1 < pcList.length && it.nextPc !== pcList[i + 1]) break;
  }
  return [start, end];
}

function formatInstr(pc, instr) {
  if (!instr || instr.kind !== 'ok') {
    return pad(pc, 5) + '  ; ' + (instr ? instr.kind : 'missing');
  }
  const name = 'OP_' + pad(instr.opcode, 2);
  const ops = instr.operands.length ? ' ' + instr.operands.join(' ') : '';
  return pad(pc, 5) + '  ' + name + ops;
}

// Produce a 10..50 line excerpt centered on the anchor. Shows a short
// prologue before the OP_04 build_pc, the build run, and enough following
// instructions to make the classification verdict legible (including one
// OP_06 hop if present).
function disasmExcerpt(anchor, pcList, byPc) {
  const buildIdx = pcList.indexOf(anchor.build_pc);
  if (buildIdx < 0) return '';
  // 8 instructions of prologue, 24 past the build start — adjusted to be at
  // least 12 instructions past the run's last OP_10 so the classifier-
  // relevant opcodes are visible.
  const preCount = 8;
  let startIdx = Math.max(0, buildIdx - preCount);
  // Block start constrains the lower bound upward.
  const blockStart = anchor.enclosing_block[0];
  const blockStartIdx = pcList.indexOf(blockStart);
  if (blockStartIdx >= 0 && blockStartIdx > startIdx) startIdx = blockStartIdx;

  // Length of the string run in instruction count = 1 (OP_04) + N (OP_10s)
  // + optional 1 (OP_13). Move past the run then add 18 tail instructions.
  const runInstrCount = 1 + anchor.string.length + (anchor.has_resolve ? 1 : 0);
  const tailCount = 18;
  let endIdx = Math.min(pcList.length - 1, buildIdx + runInstrCount - 1 + tailCount);

  // Clamp total to <= 50 lines.
  if (endIdx - startIdx + 1 > 50) endIdx = startIdx + 49;

  const lines = [];
  for (let i = startIdx; i <= endIdx; i++) {
    lines.push(formatInstr(pcList[i], byPc.get(pcList[i])));
  }

  // If the classifier's followForward path crosses a single OP_06 hop, the
  // linear pcList slice above will not include the jump target. Append the
  // instructions at the jump target so the reader can see the property-write
  // that pins the classification.
  const hopTarget = firstHopTarget(anchor, pcList, byPc);
  if (hopTarget !== null) {
    const hopIdx = pcList.indexOf(hopTarget);
    if (hopIdx >= 0) {
      // Skip the appendix if the hop target is already inside the main slice.
      const hopAlreadyShown = hopIdx >= startIdx && hopIdx <= endIdx;
      if (!hopAlreadyShown) {
        lines.push('  ; ... OP_06 hop to ' + hopTarget + ' ...');
        const tailEnd = Math.min(pcList.length - 1, hopIdx + 10);
        for (let i = hopIdx; i <= tailEnd && lines.length < 50; i++) {
          lines.push(formatInstr(pcList[i], byPc.get(pcList[i])));
        }
      }
    }
  }

  return lines.join('\n');
}

// Return the target pc of the first OP_06 encountered within ~6 instructions
// after the string run, or null if none.
function firstHopTarget(anchor, pcList, byPc) {
  const buildIdx = pcList.indexOf(anchor.build_pc);
  if (buildIdx < 0) return null;
  const runEndIdx = buildIdx + anchor.string.length + (anchor.has_resolve ? 1 : 0);
  for (let i = runEndIdx; i < Math.min(pcList.length, runEndIdx + 6); i++) {
    const it = byPc.get(pcList[i]);
    if (!it || it.kind !== 'ok') break;
    if (it.opcode === OP_JUMP) return it.operands[0];
    if (TERMINATORS.has(it.opcode) || BRANCHES.has(it.opcode)) return null;
  }
  return null;
}

// Classify an anchor as read / write / unknown.
//
// Stack-pattern analysis: the only way the stack VM writes into a property
// slot is OP_24 (`A[0][A[1]] = TOS`), and the [receiver, key] pair on TOS is
// built either by OP_41 (from a [U, objKeyStr] pair + a keyStr), by OP_59,
// by OP_32 + OP_41, or directly via OP_32 for global-scope slots. Reads
// produce a value via OP_54 (property get), OP_55 / OP_02 / OP_25 / OP_66
// (call), or the resolved value flows into arithmetic / concat / args.
//
// For each anchor we:
//   1. Walk forward from afterPc, crossing at most one OP_06 unconditional
//      jump (commonly used in vm-slide to separate the key-build site from
//      the value-build + OP_24 site), looking for OP_24 (write) vs the
//      value-consumer opcodes (read).
//   2. Also inspect the instructions immediately preceding the OP_04 build
//      — presence of OP_32 / OP_41 / OP_54 context helps distinguish
//      "key for property set" from "literal in a larger expression".
function followForward(startPc, pcList, byPc, maxSteps) {
  // Return a list of {pc, opcode} observed in order from startPc, following
  // fall-through, crossing up to one OP_06 unconditional jump, and stopping
  // at any terminator / branch that isn't the single OP_06 hop we allow.
  const steps = [];
  let pc = startPc;
  let jumpsUsed = 0;
  while (steps.length < maxSteps) {
    if (!pcList.includes(pc)) break;
    const it = byPc.get(pc);
    if (!it || it.kind !== 'ok') break;
    steps.push({ pc, opcode: it.opcode, operands: it.operands });
    if (it.opcode === OP_JUMP) {
      if (jumpsUsed >= 1) break;
      jumpsUsed++;
      pc = it.operands[0];
      continue;
    }
    if (it.opcode === OP_HALT) break;
    if (BRANCHES.has(it.opcode)) break; // conditional — ambiguous
    pc = it.nextPc;
  }
  return steps;
}

function classifyAnchor(anchor, run, pcList, byPc) {
  const startPc = run.afterPc; // first instruction after the build run (inclusive of OP_13 if present: afterPc is past it)
  const steps = followForward(startPc, pcList, byPc, 32);

  // Context preceding the OP_04 (helps identify pair-building patterns).
  const buildIdx = pcList.indexOf(anchor.build_pc);
  let prevOp = null;
  if (buildIdx > 0) {
    const prev = byPc.get(pcList[buildIdx - 1]);
    if (prev && prev.kind === 'ok' && prev.nextPc === anchor.build_pc) prevOp = prev.opcode;
  }

  let sawMakePair = false;      // OP_41 or OP_59 — turns string into [recv, key]
  let sawWrite = false;         // OP_24
  let sawPropGet = false;       // OP_54
  let sawCall = false;          // OP_02/25/55/66
  let sawConcat = false;        // OP_20
  let sawFuncCreate = false;    // OP_58 — common value-builder before OP_24

  for (const s of steps) {
    if (s.opcode === OP_MAKE_PAIR || s.opcode === OP_MAKE_PAIR_2) sawMakePair = true;
    else if (s.opcode === OP_PROPSET) { sawWrite = true; break; }
    else if (s.opcode === OP_PROPGET) { sawPropGet = true; break; }
    else if (s.opcode === OP_METHOD_CALL || s.opcode === OP_METHOD_NEW
          || s.opcode === OP_CALL_1 || s.opcode === OP_CALL_U) { sawCall = true; break; }
    else if (s.opcode === OP_ADD) sawConcat = true;
    else if (s.opcode === 58) sawFuncCreate = true;
  }

  if (sawWrite) {
    const parts = ['OP_24 (property set) reached from the anchor within ' + steps.length + ' steps (one OP_06 hop allowed)'];
    if (prevOp === OP_PUSH_GLOBAL_PAIR) parts.push('preceding OP_32 builds [U, objKey]');
    if (sawMakePair) parts.push('OP_41/OP_59 combines the resolved key with the receiver');
    if (sawFuncCreate) parts.push('OP_58 creates the function value being assigned');
    return { classification: 'write', evidence: parts.join('; ') };
  }
  if (sawPropGet) {
    return { classification: 'read', evidence: 'OP_54 (property get) reached from the anchor — value is read, not written' };
  }
  if (sawCall) {
    return { classification: 'read', evidence: 'anchor string flows into a call site (OP_02/25/55/66) as an argument literal' };
  }
  if (sawConcat) {
    return { classification: 'read', evidence: 'anchor string flows into OP_20 (concat) — used as a literal fragment in a larger expression' };
  }
  return { classification: 'unknown', evidence: 'no definitive consumer opcode found within ' + steps.length + ' forward steps from afterPc=' + startPc };
}

function main() {
  const bytecode = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
  const dispatch = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));

  const { pcList, byPc, functionEntries } = walk(bytecode, dispatch);

  const runs = findStringRuns(pcList, byPc);

  // Collect anchors: exact matches plus any extras containing vdata variants.
  const anchorRuns = [];
  for (const r of runs) {
    if (TARGET_STRINGS.has(r.string)) {
      anchorRuns.push(r);
      continue;
    }
    const low = r.string.toLowerCase();
    if (EXTRA_SUBSTRINGS.some((s) => r.string.includes(s)) && !low.includes('invaliddata')) {
      // Only add if it looks genuinely related and wasn't already targeted.
      if (!TARGET_STRINGS.has(r.string)) anchorRuns.push(r);
    }
  }

  // Sort anchors by buildPc for determinism.
  anchorRuns.sort((a, b) => a.buildPc - b.buildPc);

  const out = [];
  for (const r of anchorRuns) {
    const block = enclosingBlock(r.buildPc, pcList, byPc, functionEntries);
    // resolve_pc: pc of OP_13 if present, else pc of the last OP_10 in the
    // run (the instruction that finalizes the string on the stack). Runs
    // without OP_13 are bare literals and have no "resolve" in the strict
    // sense — we use this fallback to keep the schema stable.
    const resolvePc = r.resolvePc !== null
      ? r.resolvePc
      : (r.lastAppendEndPc - (r.string.length === 0 ? 0 : 2)); // last OP_10 start
    const anchor = {
      string: r.string,
      build_pc: r.buildPc,
      resolve_pc: resolvePc,
      has_resolve: r.resolvePc !== null,
      byte_length: r.byteLength,
      enclosing_block: block,
      disasm_excerpt: '',
      classification: 'unknown',
      classification_evidence: ''
    };
    anchor.disasm_excerpt = disasmExcerpt(anchor, pcList, byPc);
    const cls = classifyAnchor(anchor, r, pcList, byPc);
    anchor.classification = cls.classification;
    anchor.classification_evidence = cls.evidence;
    out.push(anchor);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');

  process.stdout.write(
    'vdata-trace: ' + runs.length + ' string runs walked, ' + out.length + ' vData anchors written to ' + path.relative(process.cwd(), OUT_PATH) + '\n'
  );
  for (const a of out) {
    process.stdout.write('  ' + JSON.stringify(a.string) + ' ' + a.classification + ' build_pc=' + a.build_pc + ' block=' + JSON.stringify(a.enclosing_block) + '\n');
  }
}

main();
