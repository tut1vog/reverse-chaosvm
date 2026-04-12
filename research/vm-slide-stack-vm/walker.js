'use strict';

// Control-flow-aware disassembly walker for the stack-based ChaosVM variant
// (sample/vm_slide.js). Upgrades the 39.1 linear disassembler by:
//
//   1. Correctly handling opcode 58 (FUNC_CREATE), whose runtime width is
//      `3 + 2*A + C` — the 39.1 decoder records a static lexical operand
//      count of 6 because the handler lexically contains six `m[g++]` reads,
//      but at runtime the first three reads produce K/A/C and the remaining
//      `2*A + C` reads depend on those values. A linear walker using the
//      static count desynchronizes at the very first FUNC_CREATE site.
//
//   2. Following control flow instead of walking linearly. vm-slide
//      interleaves code with data reached only via jumps, and starts with an
//      unconditional jump at pc=4 (`OP_06 1568`), so a linear walker halts
//      in data almost immediately. This walker maintains an instruction
//      worklist seeded from the entry PC (0) and every function-entry PC
//      discovered as FUNC_CREATE sites are walked.
//
// Control-flow classification audit (every entry backed by handler source):
//
//   OP 6  JUMP          `function(){g=m[g++]}`
//                       Unconditional PC := operand. Terminator, one target.
//   OP 60 JUMP_IF_TRUE  `function(){var A=m[g++];n[n.length-1]&&(g=A)}`
//                       Reads operand unconditionally, then jumps if TOS
//                       truthy. Branch: target = operand, fall-through = next.
//   OP 16 HALT_TRUE     `function(){return!0}`
//                       Returns truthy to the outer dispatch loop
//                         `for(var B=!1;!B;) B = Q[m[g++]]();`
//                       which then exits via `return A?...:n.pop()`. VM exit
//                       terminator, no successor.
//   OP 58 FUNC_CREATE   `function(){for(var K=m[g++], p=[], A=m[g++],
//                                      C=m[g++], Q=[], B=0; B<A; B++)
//                         p[m[g++]] = n[m[g++]];
//                         for(B=0; B<C; B++) Q[B] = m[g++]; n.push(...)}`
//                       Reads K, A, C then 2*A + C more bytes. Runtime width
//                       = 3 + 2*A + C. Current block falls through; K is a
//                       new function entry PC to enqueue.
//   OP 35 TRY_PUSH      `function(){C.push([m[g++], n.length, m[g++]])}`
//                       Pushes a [handlerPC, stackLen, regIdx] frame onto the
//                       catch stack C. The dispatch loop's `catch(I){...
//                         g=o[0]}` restores g from that handler PC when an
//                       exception fires. So operand 0 is a reachable handler
//                       entry; the instruction itself falls through.
//
// Non-terminators considered and rejected:
//
//   OP 61 `function(){return!!K}` — returns truthy only when the exception
//         register K is non-null (catch-path re-throw). Dispatch continues
//         normally when K is null, and if it is non-null the outer loop
//         re-enters its catch. Treating this as a static terminator would
//         truncate reachable code on the common fall-through path. Not
//         classified as a terminator.
//
// No other handler in the dispatch table assigns to, increments, or
// decrements `g` outside of the `m[g++]` operand-read pattern (verified by
// stripping every `m[g++]` occurrence from every handler source and
// confirming no remaining `\bg\b` appears — see task 40.1 audit step).

const fs = require('fs');
const path = require('path');

const OP_JUMP = 6;          // g = m[g++]
const OP_HALT = 16;         // return !0 — VM exit
const OP_TRY_PUSH = 35;     // C.push([m[g++], n.length, m[g++]])
const OP_FUNC_CREATE = 58;  // variable-width, K/A/C plus 2*A+C operands
const OP_JUMP_IF_TRUE = 60; // var A=m[g++]; n[n.length-1] && (g=A)

const TERMINATORS = new Set([OP_JUMP, OP_HALT]);
const BRANCHES = new Set([OP_JUMP_IF_TRUE]);
const VARIABLE_WIDTH = new Set([OP_FUNC_CREATE]);

function parseArgs(argv) {
  const outDir = path.resolve(__dirname, '..', '..', 'output', 'vm-slide');
  const args = {
    dispatch: path.join(outDir, 'dispatch-table.json'),
    bytecode: path.join(outDir, 'bytecode.json'),
    listing: path.join(outDir, 'disassembly-full.txt'),
    outDir
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dispatch' && i + 1 < argv.length) {
      args.dispatch = path.resolve(argv[++i]);
    } else if (argv[i] === '--bytecode' && i + 1 < argv.length) {
      args.bytecode = path.resolve(argv[++i]);
    }
  }
  return args;
}

function pad(value, width) {
  const s = String(value);
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

// Read one instruction starting at pc. Returns
//   { opcode, operands, nextPc, kind }
// where kind is 'ok' for a valid decode, 'hole' when the opcode is a
// dispatch-table hole, 'oor' when the opcode byte is out of range, and
// 'truncated' when the instruction runs off the end of the bytecode. The
// caller is responsible for adding valid successors to the worklist.
function readInstruction(bytecode, pc, dispatchTable) {
  if (pc < 0 || pc >= bytecode.length) {
    return { opcode: null, operands: [], nextPc: pc, kind: 'oor' };
  }
  const op = bytecode[pc];
  if (typeof op !== 'number' || op < 0 || op >= dispatchTable.length || !Number.isInteger(op)) {
    return { opcode: op, operands: [], nextPc: pc + 1, kind: 'oor' };
  }
  const entry = dispatchTable[op];
  if (entry === null) {
    return { opcode: op, operands: [], nextPc: pc + 1, kind: 'hole' };
  }

  let cursor = pc + 1;
  const operands = [];

  if (VARIABLE_WIDTH.has(op)) {
    // FUNC_CREATE: K, A, C, then 2*A + C more bytes.
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
    for (let i = 0; i < tailLen; i++) {
      operands.push(bytecode[cursor++]);
    }
    return { opcode: op, operands, nextPc: cursor, kind: 'ok' };
  }

  const opCount = entry.operandCount;
  if (cursor + opCount > bytecode.length) {
    return { opcode: op, operands, nextPc: cursor, kind: 'truncated' };
  }
  for (let i = 0; i < opCount; i++) {
    operands.push(bytecode[cursor++]);
  }
  return { opcode: op, operands, nextPc: cursor, kind: 'ok' };
}

function formatLine(pc, decoded) {
  const opText = 'OP_' + pad(decoded.opcode, 2);
  const operandText = decoded.operands.length
    ? ' ' + decoded.operands.join(' ')
    : '';
  return `${pad(pc, 5)}  ${opText}${operandText}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dispatch = JSON.parse(fs.readFileSync(args.dispatch, 'utf8'));
  const bytecode = JSON.parse(fs.readFileSync(args.bytecode, 'utf8'));

  // visited: pc -> formatted line string
  const visited = new Map();
  const functionEntries = new Set([0]);
  const worklist = [0];

  // Diagnostics
  let holeHits = 0;
  let oorHits = 0;
  let truncHits = 0;
  const holePcs = [];
  const oorPcs = [];
  let maxPc = 0;
  let instrCount = 0;

  while (worklist.length > 0) {
    let pc = worklist.pop();
    // Walk a straight-line sequence until we hit a terminator, an already
    // visited PC, or a decode failure.
    while (pc >= 0 && pc < bytecode.length) {
      if (visited.has(pc)) break;

      const decoded = readInstruction(bytecode, pc, dispatch);
      if (decoded.kind === 'hole') {
        holeHits++;
        holePcs.push(pc);
        visited.set(pc, `${pad(pc, 5)}  ; HALT hole op=${decoded.opcode}`);
        break;
      }
      if (decoded.kind === 'oor') {
        oorHits++;
        oorPcs.push(pc);
        visited.set(pc, `${pad(pc, 5)}  ; HALT out-of-range op=${decoded.opcode}`);
        break;
      }
      if (decoded.kind === 'truncated') {
        truncHits++;
        visited.set(pc, `${pad(pc, 5)}  ; HALT truncated op=${decoded.opcode}`);
        break;
      }

      visited.set(pc, formatLine(pc, decoded));
      instrCount++;
      if (decoded.nextPc > maxPc) maxPc = decoded.nextPc;

      const op = decoded.opcode;

      // OP 35 TRY_PUSH: operand 0 is a handler PC reached via the outer
      // dispatch loop's catch block. Enqueue it, then fall through.
      if (op === OP_TRY_PUSH && decoded.operands.length >= 1) {
        const handlerPc = decoded.operands[0];
        if (Number.isInteger(handlerPc) && handlerPc >= 0 && handlerPc < bytecode.length) {
          if (!visited.has(handlerPc)) worklist.push(handlerPc);
        }
      }

      // OP 58 FUNC_CREATE: K is a new function entry PC. Fall through to
      // the instruction after the variable-width operand block.
      if (op === OP_FUNC_CREATE && decoded.operands.length >= 1) {
        const entryK = decoded.operands[0];
        if (Number.isInteger(entryK) && entryK >= 0 && entryK < bytecode.length) {
          if (!functionEntries.has(entryK)) {
            functionEntries.add(entryK);
            if (!visited.has(entryK)) worklist.push(entryK);
          }
        }
      }

      if (TERMINATORS.has(op)) {
        if (op === OP_JUMP) {
          const target = decoded.operands[0];
          if (Number.isInteger(target) && target >= 0 && target < bytecode.length) {
            if (!visited.has(target)) worklist.push(target);
          }
        }
        break; // no fall-through
      }

      if (BRANCHES.has(op)) {
        // OP 60: branch target is operand, fall-through is next pc.
        const target = decoded.operands[0];
        if (Number.isInteger(target) && target >= 0 && target < bytecode.length) {
          if (!visited.has(target)) worklist.push(target);
        }
        // fall through to decoded.nextPc
      }

      pc = decoded.nextPc;
    }
  }

  // Sort visited PCs ascending; emit a blank line between discontinuous
  // regions so the listing is easier to eyeball.
  const sortedPcs = Array.from(visited.keys()).sort((a, b) => a - b);
  const lines = [];
  let prevEnd = -1;
  for (const pc of sortedPcs) {
    if (prevEnd !== -1 && pc !== prevEnd) {
      lines.push('');
    }
    lines.push(visited.get(pc));
    // Recompute the instruction end: we don't store it per line, so
    // re-decode. This is O(N) total and keeps the data model simple.
    const decoded = readInstruction(bytecode, pc, dispatch);
    prevEnd = decoded.kind === 'ok' ? decoded.nextPc : pc + 1;
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  fs.writeFileSync(args.listing, lines.join('\n') + '\n');

  process.stdout.write(
    `walked ${instrCount} instructions across ${functionEntries.size} function entries, visited range [0, ${maxPc})\n`
  );

  if (holeHits || oorHits || truncHits) {
    process.stderr.write(
      `diagnostics: hole=${holeHits} oor=${oorHits} truncated=${truncHits}\n`
    );
    if (holePcs.length) {
      process.stderr.write(
        `  hole pcs: ${holePcs.slice(0, 10).join(',')}${holePcs.length > 10 ? ' ...' : ''}\n`
      );
    }
    if (oorPcs.length) {
      process.stderr.write(
        `  oor pcs: ${oorPcs.slice(0, 10).join(',')}${oorPcs.length > 10 ? ' ...' : ''}\n`
      );
    }
  }
}

main();
