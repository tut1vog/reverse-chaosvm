'use strict';

// vdata-provenance.js — task 42.2
//
// Enumerates every `window.<key> = <function>` install in the vm-slide
// stack-VM bytecode. The install idiom is:
//
//   OP_04 (OP_10 c)*                  ; build "window"
//   OP_32                             ; push [U, "window"]
//   OP_04 (OP_10 c)*                  ; build <key>
//   OP_41                             ; push [U["window"], <key>] == [window, <key>]
//   [OP_06 <target>]                  ; optional unconditional hop
//   OP_58 K A C (2A+C tail bytes)     ; FUNC_CREATE, pushes <closure>
//   OP_24                             ; window[<key>] = <closure>
//
// For every such install the enumerator records: key, the pc where the key
// string starts being built, the OP_58 pc that creates the function value,
// the OP_24 pc that performs the write, the function body entry (K), and
// a conservative body_end_pc computed by a local CFG walk from K that stops
// at any OP_16 and does not recurse into nested OP_58 bodies.
//
// Writes output/vm-slide/window-installs.json. Idempotent.
//
// Reuses the walker/decoder inline (kept self-contained so that the script
// does not depend on exporting helpers from walker.js / vdata-trace.js).

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.resolve(__dirname, '..', '..', 'output', 'vm-slide');
const BYTECODE_PATH = path.join(OUT_DIR, 'bytecode.json');
const DISPATCH_PATH = path.join(OUT_DIR, 'dispatch-table.json');
const OUT_PATH = path.join(OUT_DIR, 'window-installs.json');

const OP_STR_INIT = 4;
const OP_STR_APPEND = 10;
const OP_RESOLVE = 13;
const OP_HALT = 16;
const OP_JUMP = 6;
const OP_JUMP_IF_TRUE = 60;
const OP_TRY_PUSH = 35;
const OP_PUSH_GLOBAL_PAIR = 32;
const OP_MAKE_PAIR = 41;
const OP_PROPSET = 24;
const OP_FUNC_CREATE = 58;

const TERMINATORS = new Set([OP_JUMP, OP_HALT]);
const BRANCHES = new Set([OP_JUMP_IF_TRUE]);

function readInstruction(bytecode, pc, dispatch) {
  if (pc < 0 || pc >= bytecode.length) {
    return { opcode: null, operands: [], nextPc: pc, kind: 'oor' };
  }
  const op = bytecode[pc];
  if (typeof op !== 'number' || !Number.isInteger(op) || op < 0 || op >= dispatch.length) {
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

// Walk the bytecode following control flow (CFG reachability from pc=0 and
// from every discovered OP_58 K entry). Returns a Map pc -> decoded.
function walk(bytecode, dispatch) {
  const byPc = new Map();
  const entries = new Set([0]);
  const worklist = [0];
  while (worklist.length) {
    let pc = worklist.pop();
    while (pc >= 0 && pc < bytecode.length) {
      if (byPc.has(pc)) break;
      const d = readInstruction(bytecode, pc, dispatch);
      if (d.kind !== 'ok') { byPc.set(pc, d); break; }
      byPc.set(pc, d);
      const op = d.opcode;
      if (op === OP_TRY_PUSH) {
        const h = d.operands[0];
        if (Number.isInteger(h) && h >= 0 && h < bytecode.length && !byPc.has(h)) worklist.push(h);
      }
      if (op === OP_FUNC_CREATE) {
        const K = d.operands[0];
        if (Number.isInteger(K) && K >= 0 && K < bytecode.length && !entries.has(K)) {
          entries.add(K);
          if (!byPc.has(K)) worklist.push(K);
        }
      }
      if (TERMINATORS.has(op)) {
        if (op === OP_JUMP) {
          const t = d.operands[0];
          if (Number.isInteger(t) && t >= 0 && t < bytecode.length && !byPc.has(t)) worklist.push(t);
        }
        break;
      }
      if (BRANCHES.has(op)) {
        const t = d.operands[0];
        if (Number.isInteger(t) && t >= 0 && t < bytecode.length && !byPc.has(t)) worklist.push(t);
      }
      pc = d.nextPc;
    }
  }
  const pcList = Array.from(byPc.keys()).sort((a, b) => a - b);
  return { pcList, byPc, entries };
}

// Reconstruct a string run starting at an OP_04. Returns { chars, afterPc,
// hadResolve } or null if the run is empty.
function readStringRun(startPc, byPc) {
  const head = byPc.get(startPc);
  if (!head || head.kind !== 'ok' || head.opcode !== OP_STR_INIT) return null;
  let chars = '';
  let cur = head.nextPc;
  while (true) {
    const it = byPc.get(cur);
    if (!it || it.kind !== 'ok' || it.opcode !== OP_STR_APPEND) break;
    chars += String.fromCharCode(it.operands[0]);
    cur = it.nextPc;
  }
  if (chars.length === 0) return null;
  let hadResolve = false;
  const tail = byPc.get(cur);
  if (tail && tail.kind === 'ok' && tail.opcode === OP_RESOLVE) {
    hadResolve = true;
    cur = tail.nextPc;
  }
  return { chars, afterPc: cur, hadResolve };
}

// Conservative body end: walk forward from K following fall-through + OP_06
// + OP_60, stopping at any OP_16. Do NOT recurse into nested OP_58 bodies
// (their K entries are handled separately). Returns { size, endPc } where
// endPc is the pc of the last instruction visited in this function body
// (the pc of an OP_16 on normal exit, or the highest visited pc otherwise).
function walkBody(entryPc, byPc) {
  const visited = new Set();
  const worklist = [entryPc];
  let maxPc = entryPc;
  while (worklist.length) {
    let pc = worklist.pop();
    while (pc !== undefined && pc !== null) {
      if (visited.has(pc)) break;
      const it = byPc.get(pc);
      if (!it || it.kind !== 'ok') break;
      visited.add(pc);
      if (pc > maxPc) maxPc = pc;
      const op = it.opcode;
      if (op === OP_HALT) break;
      if (op === OP_JUMP) {
        const t = it.operands[0];
        if (Number.isInteger(t) && !visited.has(t)) worklist.push(t);
        break;
      }
      if (op === OP_JUMP_IF_TRUE) {
        const t = it.operands[0];
        if (Number.isInteger(t) && !visited.has(t)) worklist.push(t);
      }
      if (op === OP_TRY_PUSH) {
        const t = it.operands[0];
        if (Number.isInteger(t) && !visited.has(t)) worklist.push(t);
      }
      // Do NOT follow OP_58 K — nested bodies are separate.
      pc = it.nextPc;
    }
  }
  return { size: visited.size, endPc: maxPc };
}

// Scan the walked pcList for the install pattern and emit one entry per
// hit. The pattern requires: an OP_04 that decodes to the literal "window"
// followed immediately by OP_32, then another OP_04 that decodes to some
// non-empty string followed immediately by OP_41, then (optionally crossing
// one OP_06 hop) an OP_58 followed by OP_24. This is the canonical install
// idiom that the 42.1 trace already pinned at pc=19667..20066.
function enumerateInstalls(pcList, byPc) {
  const pcSet = new Set(pcList);
  const installs = [];

  function followHop(pc) {
    // If the next instruction at pc is OP_06, return its target pc; else pc.
    const it = byPc.get(pc);
    if (it && it.kind === 'ok' && it.opcode === OP_JUMP) {
      const t = it.operands[0];
      if (pcSet.has(t)) return t;
    }
    return pc;
  }

  for (const pc of pcList) {
    const w = readStringRun(pc, byPc);
    if (!w || w.chars !== 'window' || w.hadResolve) continue;
    // Expect OP_32 at w.afterPc.
    const after32 = byPc.get(w.afterPc);
    if (!after32 || after32.kind !== 'ok' || after32.opcode !== OP_PUSH_GLOBAL_PAIR) continue;
    const keyBuildPc = after32.nextPc;
    const keyRun = readStringRun(keyBuildPc, byPc);
    if (!keyRun || keyRun.hadResolve) continue;
    const after41 = byPc.get(keyRun.afterPc);
    if (!after41 || after41.kind !== 'ok' || after41.opcode !== OP_MAKE_PAIR) continue;
    // Optional OP_06 hop to the value-construction site.
    let cur = after41.nextPc;
    cur = followHop(cur);
    const funcInstr = byPc.get(cur);
    if (!funcInstr || funcInstr.kind !== 'ok' || funcInstr.opcode !== OP_FUNC_CREATE) continue;
    const funcCreatePc = cur;
    const K = funcInstr.operands[0];
    const A = funcInstr.operands[1];
    const C = funcInstr.operands[2];
    const installPc = funcInstr.nextPc;
    const installInstr = byPc.get(installPc);
    if (!installInstr || installInstr.kind !== 'ok' || installInstr.opcode !== OP_PROPSET) continue;
    const body = walkBody(K, byPc);
    installs.push({
      key: keyRun.chars,
      key_build_pc: keyBuildPc,
      window_build_pc: pc,
      func_create_pc: funcCreatePc,
      func_K: K,
      func_A: A,
      func_C: C,
      install_pc: installPc,
      body_start_pc: K,
      body_end_pc: body.endPc,
      body_instr_count: body.size
    });
  }
  // Deterministic order: sorted by install_pc.
  installs.sort((a, b) => a.install_pc - b.install_pc);
  return installs;
}

function main() {
  const bytecode = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
  const dispatch = JSON.parse(fs.readFileSync(DISPATCH_PATH, 'utf8'));
  const { pcList, byPc } = walk(bytecode, dispatch);
  const installs = enumerateInstalls(pcList, byPc);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(installs, null, 2) + '\n');
  process.stdout.write('window-installs: ' + installs.length + ' entries written to ' + path.relative(process.cwd(), OUT_PATH) + '\n');
  for (const i of installs) {
    process.stdout.write('  window.' + i.key + ' install_pc=' + i.install_pc + ' body=[' + i.body_start_pc + ',' + i.body_end_pc + '] size=' + i.body_instr_count + '\n');
  }
}

main();
