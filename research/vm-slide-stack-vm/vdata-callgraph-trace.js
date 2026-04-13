'use strict';

// Phase 44 task 44.1 — Encrypt-callsite back-walk + plaintext-build call
// graph.
//
// Goal: capture the dispatch-loop PC inside vm-slide's *outer* VM frame that
// immediately precedes every entry into the XTEA encrypt closure at bytecode
// pc 15241. Each vData run produces exactly 14 encrypt calls (14 * 8 = 112
// plaintext bytes), so this tracer must capture exactly 14 caller PCs in
// temporal order.
//
// Strategy (duplicated and extended from vdata-dynamic-trace.js):
//
//   1. Read sample/vm_slide.js as a string (identical to 43.1).
//   2. Patch the dispatch loop tap to call __VMTAP_DISPATCH unconditionally
//      (43.1 also does this, but gates recording on a pc range). The
//      recording gate in THIS tracer is wider (the full bytecode range) so
//      that we can see outer-frame dispatch ticks from any caller, not just
//      from the encrypt closure body.
//   3. Patch the closure-entry tap (unchanged from 43.1) to fire at every
//      nested __TENCENT_CHAOS_VM call.
//   4. Maintain a single unified timeline of events:
//          { type: 'disp', pc, op }
//          { type: 'enter', K }
//      Budget per event type so the timeline stays bounded.
//   5. After the harness run, walk the timeline: for every ENTER(K=15241),
//      scan backward skipping dispatch hits whose pc is inside the encrypt
//      closure body [15241, 15415] (the closure's own instructions) and
//      inside the decrypt closure body [15416, ~15600] — the first
//      dispatch hit outside those ranges is the caller pc.
//   6. Emit the 14 caller PCs plus a static-vs-runtime cross-check table
//      (showing which FUNC_CREATE'd function each caller pc falls inside,
//      using the committed disassembly-full.txt and the walker's function
//      entry table).
//   7. Write output/vm-slide/vdata-callgraph.json.
//
// This file is a new sibling of vdata-dynamic-trace.js — the original is
// referenced in documentation and is a reproducible 43.1 artifact, so it is
// NOT modified. See task 44.1 constraints.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const VM_SLIDE_PATH = path.join(ROOT, 'sample', 'vm_slide.js');
const JQUERY_PATH = path.join(ROOT, 'sample', 'slide-jy.js');
const HAR_PATH = path.join(ROOT, 'sample', 'captcha-har.har');
const BYTECODE_PATH = path.join(ROOT, 'output', 'vm-slide', 'bytecode.json');
const DISASM_PATH = path.join(ROOT, 'output', 'vm-slide', 'disassembly-full.txt');
const DISPATCH_TABLE_PATH = path.join(ROOT, 'output', 'vm-slide', 'dispatch-table.json');
const OUT_DIR = path.join(ROOT, 'output', 'vm-slide');
const OUT_CALLGRAPH = path.join(OUT_DIR, 'vdata-callgraph.json');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// XTEA closure entry pcs (Phase 40.6 / 43.1). Encrypt body spans
// [ENC_ENTRY, DEC_ENTRY); decrypt body spans [DEC_ENTRY, ~15600]. Callers to
// the encrypt closure live OUTSIDE both of these ranges.
const ENC_ENTRY = 15241;
const DEC_ENTRY = 15416;
const CIPHER_REGION_END = 15600; // generous upper bound on both closures

// ---------------------------------------------------------------------------
// HAR loader (identical to vdata-dynamic-trace.js).
// ---------------------------------------------------------------------------
function loadHarVerify() {
  const har = JSON.parse(fs.readFileSync(HAR_PATH, 'utf8'));
  for (const entry of har.log.entries) {
    if (entry.request.url.indexOf('cap_union_new_verify') !== -1) {
      const body = (entry.request.postData && entry.request.postData.text) || '';
      const params = new URLSearchParams(body);
      const fields = {};
      for (const [k, v] of params.entries()) {
        if (k === 'vData') continue;
        fields[k] = v;
      }
      return { fields };
    }
  }
  throw new Error('cap_union_new_verify not found in HAR');
}

// ---------------------------------------------------------------------------
// Patch sample/vm_slide.js with dispatch + entry taps. Identical strategy to
// 43.1 but both taps are installed unconditionally — the gating happens on
// the Node side so that we can widen the recording range without re-patching
// the source.
// ---------------------------------------------------------------------------
function patchVmSlide(src) {
  const DISPATCH_ORIGINAL = 'for(var B=!1;!B;)B=Q[m[g++]]()';
  const DISPATCH_PATCHED =
    'for(var B=!1;!B;){' +
    'if(typeof __VMTAP_DISPATCH==="function")__VMTAP_DISPATCH(g,m,n);' +
    'B=Q[m[g++]]();' +
    '}';
  if (src.indexOf(DISPATCH_ORIGINAL) === -1) {
    throw new Error('dispatch loop pattern not found in vm_slide.js — cannot patch');
  }
  let out = src.replace(DISPATCH_ORIGINAL, DISPATCH_PATCHED);

  const PRE_ENTRY = ';return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  const PRE_ENTRY_PATCHED =
    ';if(typeof __VMTAP_ENTER==="function")__VMTAP_ENTER(K,A,arguments);' +
    'return __TENCENT_CHAOS_VM(K,m,U,A,E,F,Y,c)';
  if (out.indexOf(PRE_ENTRY) === -1) {
    throw new Error('PRE_ENTRY pattern not found — vm_slide.js layout changed');
  }
  out = out.replace(PRE_ENTRY, PRE_ENTRY_PATCHED);

  return out;
}

// ---------------------------------------------------------------------------
// Run the instrumented harness. Returns a unified timeline of dispatch and
// enter events plus counters for sanity checking.
// ---------------------------------------------------------------------------
function runInstrumentedHarness(fields) {
  const vmSrc = fs.readFileSync(VM_SLIDE_PATH, 'utf8');
  const jq = fs.readFileSync(JQUERY_PATH, 'utf8');
  const patchedVm = patchVmSlide(vmSrc);

  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'https://t.captcha.qq.com/cap_union_new_show',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    userAgent: USER_AGENT,
  });
  const w = dom.window;

  // Unified timeline. Each entry is a 2- or 3- element tuple:
  //   [t='d', pc, op]   dispatch tick
  //   [t='e', K]        enter event
  // Kept as flat arrays instead of objects to reduce per-event overhead.
  const timeline = [];
  const TIMELINE_BUDGET = 5_000_000;

  // We only record dispatch ticks for pc values in the pcs we care about:
  // either inside the cipher region [ENC_ENTRY, CIPHER_REGION_END] (so we
  // can distinguish inner-frame ticks from outer-frame ticks) OR inside the
  // plausible proxyXHR region [15000, 21000]. Everywhere else is outer
  // *booting* noise that can't possibly call encrypt. This keeps the
  // timeline size reasonable while still capturing all outer-frame callers.
  function inRange(g) {
    return g >= 15000 && g <= 21000;
  }

  let dispatchCount = 0;
  let enterCount = 0;
  // Last dispatch pc seen IN RANGE — used to tag each enter with its true
  // caller pc at the moment the call happened (the outer frame's opcode
  // that triggered the call). This is independent of the backward-walk
  // reconstruction and gives a second check.
  let lastDispPc = -1;
  let lastDispOp = -1;

  w.__VMTAP_DISPATCH = function (g, m /*, n */) {
    if (!inRange(g)) return;
    lastDispPc = g;
    lastDispOp = m[g];
    if (timeline.length >= TIMELINE_BUDGET) return;
    timeline.push(['d', g, m[g]]);
    dispatchCount++;
  };

  w.__VMTAP_ENTER = function (K /*, A, args */) {
    if (K < 0 || K > 24273) return;
    if (timeline.length >= TIMELINE_BUDGET) return;
    // Tag the enter with the most recent in-range dispatch pc — this is
    // the outer frame's opcode that was mid-execution when it triggered
    // the call. At this point the outer frame's dispatch loop is inside
    // its handler body (the CALL opcode handler) and has not yet advanced
    // past the call opcode.
    timeline.push(['e', K, lastDispPc, lastDispOp]);
    enterCount++;
  };

  // Pre-install XHR send hook so we capture the final body containing vData.
  let capturedBody = null;
  w.XMLHttpRequest.prototype.send = function (body) {
    capturedBody = body;
  };

  w.eval(jq);
  if (typeof w.jQuery !== 'function') {
    throw new Error('jQuery did not load in jsdom');
  }
  w.eval(patchedVm);

  w.jQuery.ajax({
    type: 'POST',
    url: '/cap_union_new_verify',
    data: fields,
    timeout: 15000,
  });

  if (capturedBody === null) {
    throw new Error('XHR.send was never called — patched vm-slide did not run proxyXHR');
  }

  const params = new URLSearchParams(capturedBody);
  const vData = params.get('vData');
  if (!vData) {
    throw new Error('vData missing from captured body — patch may have broken proxy');
  }

  dom.window.close();

  return { vData, timeline, dispatchCount, enterCount };
}

// ---------------------------------------------------------------------------
// Extract the caller PC for every ENTER(K=15241) event. The caller is the
// most recent dispatch tick in the timeline whose pc falls OUTSIDE the
// cipher region [ENC_ENTRY, CIPHER_REGION_END] — because while the encrypt
// closure is executing, its own dispatch ticks land inside that range.
// ---------------------------------------------------------------------------
function extractCallerPcs(timeline) {
  // Enter events carry their own lastDispPc in fields [2] and [3] (pc, op).
  // This is the direct caller pc captured at the moment the call was made.
  const callers = [];
  for (let i = 0; i < timeline.length; i++) {
    const ev = timeline[i];
    if (ev[0] !== 'e' || ev[1] !== ENC_ENTRY) continue;
    const pc = ev[2];
    const op = ev[3];
    if (pc === -1) {
      callers.push(null);
    } else {
      callers.push({ pc, op });
    }
  }
  return callers;
}

// Reconstruct the call chain from XHR-send frame down to an ENC_ENTRY
// enter using the enter events themselves. Each enter event records its
// own callerPc at the moment of invocation. So starting from the target
// ENC_ENTRY enter (whose callerPc is inside function F1), we search
// backward through enter events for the most recent enter whose *callee*
// contains that callerPc — that's the enter that brought us into F1.
// Repeat recursively until we hit a top-level frame.
function extractCallerChain(timeline, enterIdx, funcInfo) {
  const chain = [];
  // The current enter event we are trying to find the caller of.
  let curIdx = enterIdx;
  let guard = 0;
  while (curIdx >= 0 && guard < 12) {
    guard++;
    const cur = timeline[curIdx];
    if (cur[0] !== 'e') break;
    const callerPc = cur[2];
    const callerOp = cur[3];
    if (callerPc === -1) break;
    // containing function of the caller pc = the function that made this call
    const fn = funcInfo.entryOf(callerPc);
    chain.push({
      enter_k: cur[1],
      caller_pc: callerPc,
      caller_op: callerOp,
      caller_fn: fn,
    });
    if (fn === null) break;
    // Find the most recent enter event BEFORE curIdx whose callee K equals fn.
    // That is the enter that put us inside fn.
    let parentIdx = -1;
    for (let j = curIdx - 1; j >= 0; j--) {
      const ev = timeline[j];
      if (ev[0] !== 'e') continue;
      if (ev[1] === fn) {
        parentIdx = j;
        break;
      }
    }
    if (parentIdx === -1) break; // fn is a top-level frame (e.g. boot code)
    curIdx = parentIdx;
  }
  return chain;
}

// ---------------------------------------------------------------------------
// Build the function-entry table by replaying the walker's FUNC_CREATE
// discovery. Each entry K from OP_58 becomes a function start pc. We then
// bucket every reachable instruction (from disassembly-full.txt) into the
// *smallest* containing function by scanning the sorted function-entry list
// and taking the greatest entry <= the target pc.
// ---------------------------------------------------------------------------
function loadFunctionEntries() {
  const bytecode = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
  const dispatch = JSON.parse(fs.readFileSync(DISPATCH_TABLE_PATH, 'utf8'));
  const entries = new Set([0]);
  const visited = new Set();
  const worklist = [0];

  const OP_JUMP = 6;
  const OP_HALT = 16;
  const OP_TRY_PUSH = 35;
  const OP_FUNC_CREATE = 58;
  const OP_JUMP_IF_TRUE = 60;

  function readInstr(pc) {
    const op = bytecode[pc];
    if (typeof op !== 'number' || op < 0 || op >= dispatch.length) return null;
    const entry = dispatch[op];
    if (entry === null) return null;
    let cursor = pc + 1;
    const operands = [];
    if (op === OP_FUNC_CREATE) {
      if (cursor + 3 > bytecode.length) return null;
      const K = bytecode[cursor++];
      const A = bytecode[cursor++];
      const C = bytecode[cursor++];
      operands.push(K, A, C);
      const tailLen = 2 * A + C;
      if (cursor + tailLen > bytecode.length) return null;
      for (let i = 0; i < tailLen; i++) operands.push(bytecode[cursor++]);
      return { op, operands, nextPc: cursor };
    }
    const opCount = entry.operandCount;
    if (cursor + opCount > bytecode.length) return null;
    for (let i = 0; i < opCount; i++) operands.push(bytecode[cursor++]);
    return { op, operands, nextPc: cursor };
  }

  while (worklist.length > 0) {
    let pc = worklist.pop();
    while (pc >= 0 && pc < bytecode.length) {
      if (visited.has(pc)) break;
      const d = readInstr(pc);
      if (!d) break;
      visited.add(pc);
      if (d.op === OP_TRY_PUSH && d.operands.length >= 1) {
        const h = d.operands[0];
        if (Number.isInteger(h) && !visited.has(h)) worklist.push(h);
      }
      if (d.op === OP_FUNC_CREATE && d.operands.length >= 1) {
        const K = d.operands[0];
        if (Number.isInteger(K) && !entries.has(K)) {
          entries.add(K);
          if (!visited.has(K)) worklist.push(K);
        }
      }
      if (d.op === OP_JUMP) {
        const t = d.operands[0];
        if (Number.isInteger(t) && !visited.has(t)) worklist.push(t);
        break;
      }
      if (d.op === OP_HALT) break;
      if (d.op === OP_JUMP_IF_TRUE) {
        const t = d.operands[0];
        if (Number.isInteger(t) && !visited.has(t)) worklist.push(t);
      }
      pc = d.nextPc;
    }
  }

  const sortedEntries = Array.from(entries).sort((a, b) => a - b);

  // Per-entry body reconstruction: walk each function entry independently,
  // terminating at OP_HALT (VM_EXIT) and OP_JUMP (since unconditional jumps
  // can escape the current function — we follow them and let the same walk
  // decide; this mirrors __TENCENT_CHAOS_VM's own dispatch loop semantics,
  // which has no notion of "current function", just a pc register). Each
  // entry's body is the set of PCs reached by a DFS from that entry that
  // does NOT cross into a *different* FUNC_CREATE's entry pc (we treat
  // those as hard boundaries — reaching another entry pc means we've left
  // the current function). This is an approximation: vm-slide's dispatch
  // loop has no stack frame for "function", but FUNC_CREATE bodies in
  // practice are contiguous regions terminated by OP_HALT.
  const entrySet = new Set(sortedEntries);
  const membership = new Map(); // entry -> Set<pc>
  for (const K of sortedEntries) {
    const body = new Set();
    const wl = [K];
    while (wl.length) {
      const pc = wl.pop();
      if (body.has(pc)) continue;
      if (pc !== K && entrySet.has(pc)) continue; // hard boundary
      const d = readInstr(pc);
      if (!d) continue;
      body.add(pc);
      if (d.op === OP_TRY_PUSH && d.operands.length >= 1) {
        const h = d.operands[0];
        if (Number.isInteger(h)) wl.push(h);
      }
      if (d.op === OP_FUNC_CREATE) {
        // Fall through past the FUNC_CREATE but do NOT recurse into the
        // spawned closure's body K'.
        wl.push(d.nextPc);
        continue;
      }
      if (d.op === OP_JUMP) {
        const t = d.operands[0];
        if (Number.isInteger(t)) wl.push(t);
        continue;
      }
      if (d.op === OP_HALT) continue; // VM_EXIT: end of function
      if (d.op === OP_JUMP_IF_TRUE) {
        const t = d.operands[0];
        if (Number.isInteger(t)) wl.push(t);
      }
      wl.push(d.nextPc);
    }
    membership.set(K, body);
  }

  // Reverse map: pc -> set of entries whose body contains it.
  const pcToEntries = new Map();
  for (const [K, body] of membership.entries()) {
    for (const pc of body) {
      if (!pcToEntries.has(pc)) pcToEntries.set(pc, new Set());
      pcToEntries.get(pc).add(K);
    }
  }

  // entryOf(pc) = smallest entry K such that body(K) contains pc (smallest
  // = innermost function in nesting). With the hard-boundary DFS above,
  // for a pc reachable from multiple ancestors we prefer the greatest K
  // that is still ≤ pc AND contains pc — that's the innermost.
  const entryOf = (pc) => {
    const set = pcToEntries.get(pc);
    if (!set || set.size === 0) return null;
    let best = null;
    for (const K of set) {
      if (K > pc) continue;
      if (best === null || K > best) best = K;
    }
    // fallback: if no entry ≤ pc claims it (shouldn't happen), return the
    // numerically greatest entry in the set.
    if (best === null) {
      for (const K of set) {
        if (best === null || K > best) best = K;
      }
    }
    return best;
  };

  // Body ranges: min/max pc per entry.
  const bodies = new Map();
  for (const [K, body] of membership.entries()) {
    let mn = K;
    let mx = K;
    for (const pc of body) {
      if (pc < mn) mn = pc;
      if (pc > mx) mx = pc;
    }
    bodies.set(K, { min: mn, max: mx, size: body.size });
  }

  return { sortedEntries, entryOf, bodies, visited, membership, pcToEntries };
}

// ---------------------------------------------------------------------------
// Static back-walk: for every reachable FUNC_CREATE site with K == ENC_ENTRY
// (i.e. every OP_58 that spawns the encrypt closure), find the function
// that contains that FUNC_CREATE. That's the closure-factory region. Also
// enumerate every reachable call-type opcode (2, 25, 55, 66) and bucket by
// their containing function — the set of functions that could plausibly
// invoke the encrypt closure is a superset of (function holding the
// FUNC_CREATE ∪ any function that receives the closure and calls it).
// ---------------------------------------------------------------------------
function staticBackWalk(funcInfo) {
  const bytecode = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
  const dispatch = JSON.parse(fs.readFileSync(DISPATCH_TABLE_PATH, 'utf8'));
  const CALL_OPS = new Set([2, 25, 55, 66]);
  const OP_FUNC_CREATE = 58;

  function readInstr(pc) {
    const op = bytecode[pc];
    if (typeof op !== 'number' || op < 0 || op >= dispatch.length) return null;
    const entry = dispatch[op];
    if (entry === null) return null;
    let cursor = pc + 1;
    const operands = [];
    if (op === OP_FUNC_CREATE) {
      if (cursor + 3 > bytecode.length) return null;
      const K = bytecode[cursor++];
      const A = bytecode[cursor++];
      const C = bytecode[cursor++];
      operands.push(K, A, C);
      const tailLen = 2 * A + C;
      if (cursor + tailLen > bytecode.length) return null;
      for (let i = 0; i < tailLen; i++) operands.push(bytecode[cursor++]);
      return { op, operands, nextPc: cursor };
    }
    const opCount = entry.operandCount;
    if (cursor + opCount > bytecode.length) return null;
    for (let i = 0; i < opCount; i++) operands.push(bytecode[cursor++]);
    return { op, operands, nextPc: cursor };
  }

  const encFuncCreateSites = [];
  const callSitesByFunction = new Map();

  for (const pc of Array.from(funcInfo.visited).sort((a, b) => a - b)) {
    const d = readInstr(pc);
    if (!d) continue;
    const containing = funcInfo.entryOf(pc);
    if (d.op === OP_FUNC_CREATE && d.operands[0] === ENC_ENTRY) {
      encFuncCreateSites.push({ pc, containingEntry: containing });
    }
    if (CALL_OPS.has(d.op)) {
      if (!callSitesByFunction.has(containing)) callSitesByFunction.set(containing, []);
      callSitesByFunction.get(containing).push({ pc, op: d.op });
    }
  }

  return { encFuncCreateSites, callSitesByFunction };
}

// ---------------------------------------------------------------------------
// Main.
// ---------------------------------------------------------------------------
function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('=== vData call-graph trace (44.1) ===');

  const har = loadHarVerify();
  console.log('HAR field count:', Object.keys(har.fields).length);

  console.log('Booting jsdom + patched vm-slide...');
  const trace = runInstrumentedHarness(har.fields);
  console.log('vData captured:', trace.vData.slice(0, 32) + '... (len=' + trace.vData.length + ')');
  console.log('Timeline length:', trace.timeline.length,
              '(dispatch hits in [15000,21000]=' + trace.dispatchCount,
              ', enters recorded=' + trace.enterCount + ')');

  // Summary of enter frequencies.
  const enterCounts = new Map();
  for (const ev of trace.timeline) {
    if (ev[0] !== 'e') continue;
    enterCounts.set(ev[1], (enterCounts.get(ev[1]) || 0) + 1);
  }
  const topEnters = Array.from(enterCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  console.log('Top enter destinations:', topEnters);
  console.log('15918 enter count:', enterCounts.get(15918) || 0);

  // Locate enter-event indices for ENC_ENTRY so we can extract ancestor
  // chains later.
  const encEnterIdxs = [];
  for (let i = 0; i < trace.timeline.length; i++) {
    const ev = trace.timeline[i];
    if (ev[0] === 'e' && ev[1] === ENC_ENTRY) encEnterIdxs.push(i);
  }

  const callers = extractCallerPcs(trace.timeline);
  console.log('Callers to ENC_ENTRY (' + ENC_ENTRY + '):', callers.length);
  for (let i = 0; i < callers.length; i++) {
    console.log('  #' + (i + 1), callers[i]);
  }

  if (callers.length !== 14) {
    console.error('WARNING: expected exactly 14 caller PCs, got ' + callers.length);
  }
  for (const c of callers) {
    if (c === null) {
      console.error('WARNING: at least one enter has no resolvable caller pc');
      break;
    }
  }

  // Static analysis.
  console.log('Loading function-entry table from bytecode...');
  const funcInfo = loadFunctionEntries();
  console.log('Discovered', funcInfo.sortedEntries.length, 'FUNC_CREATE-reachable function entries');

  const staticInfo = staticBackWalk(funcInfo);
  console.log('Static ENC_ENTRY FUNC_CREATE sites:', staticInfo.encFuncCreateSites);

  // Where are the key closures spawned? Helpful context for the doc.
  const spawnSites = {};
  const spawnKs = new Set([15241, 15416, 15591, 15735, 15918, 20539, 20843, 19604, 20353]);
  for (const K of spawnKs) spawnSites[K] = null;
  const bytecodeForSpawn = JSON.parse(fs.readFileSync(BYTECODE_PATH, 'utf8'));
  for (const pc of funcInfo.visited) {
    if (bytecodeForSpawn[pc] !== 58) continue;
    const K = bytecodeForSpawn[pc + 1];
    if (spawnKs.has(K) && spawnSites[K] === null) {
      spawnSites[K] = { spawn_pc: pc, spawned_in_fn: funcInfo.entryOf(pc) };
    }
  }
  console.log('Key closure spawn sites:', spawnSites);

  // For each runtime caller pc, find containing function.
  const callerDetails = callers.map((c) => {
    if (c === null) return null;
    const containing = funcInfo.entryOf(c.pc);
    const body = funcInfo.bodies.get(containing);
    return {
      caller_pc: c.pc,
      caller_op: c.op,
      containing_entry: containing,
      containing_range: body ? [body.min, body.max] : null,
    };
  });

  // Smallest set of function entries covering all 14 runtime caller pcs.
  const coveringEntries = new Set();
  for (const d of callerDetails) {
    if (d) coveringEntries.add(d.containing_entry);
  }
  const coveringEntriesSorted = Array.from(coveringEntries).sort((a, b) => a - b);
  console.log('Smallest covering function-entry set:', coveringEntriesSorted);
  for (const e of coveringEntriesSorted) {
    const b = funcInfo.bodies.get(e);
    console.log('  entry=' + e, 'body=[' + b.min + ',' + b.max + ']');
  }

  // Extract ancestor chains (per enter) so we can see the full call chain
  // from XHR-send-frame down to ENC_ENTRY.
  const chains = encEnterIdxs.map((idx) => extractCallerChain(trace.timeline, idx, funcInfo));
  console.log('Ancestor chains per encrypt call (first 3):');
  for (let i = 0; i < Math.min(3, chains.length); i++) {
    console.log('  enc#' + (i + 1), chains[i]);
  }

  // Aggregate: collect the UNION of functions seen across all chains — that
  // is the full set of frames between XHR-send and encrypt.
  const chainFunctions = new Set();
  for (const c of chains) {
    for (const step of c) chainFunctions.add(step.fn);
  }
  const chainFunctionsSorted = Array.from(chainFunctions).sort((a, b) => a - b);
  console.log('Ancestor function union (excluding ENC):', chainFunctionsSorted);
  for (const e of chainFunctionsSorted) {
    const b = funcInfo.bodies.get(e);
    if (b) console.log('  entry=' + e, 'body=[' + b.min + ',' + b.max + '] size=' + b.size);
  }

  // Cross-check: does each covering entry appear in the static call-site
  // table (i.e. does it actually contain a call-type opcode)?
  const staticCrossCheck = [];
  for (const e of coveringEntriesSorted) {
    const siteList = staticInfo.callSitesByFunction.get(e) || [];
    staticCrossCheck.push({
      entry: e,
      static_call_site_count: siteList.length,
      static_call_site_sample: siteList.slice(0, 10),
    });
  }
  console.log('Static cross-check of runtime-identified callers:');
  for (const x of staticCrossCheck) {
    console.log('  entry=' + x.entry, 'call_sites=' + x.static_call_site_count);
  }

  const spec = {
    schema_version: 1,
    task: '44.1',
    encrypt_entry_pc: ENC_ENTRY,
    decrypt_entry_pc: DEC_ENTRY,
    cipher_region_end: CIPHER_REGION_END,
    vdata_captured_prefix: trace.vData.slice(0, 32),
    vdata_length: trace.vData.length,
    timeline_stats: {
      total_events: trace.timeline.length,
      dispatch_hits_in_range: trace.dispatchCount,
      enter_events: trace.enterCount,
      enter_to_ENC_ENTRY: callers.length,
    },
    runtime_caller_pcs_raw: callers,
    runtime_caller_details: callerDetails,
    covering_function_entries: coveringEntriesSorted.map((e) => ({
      entry: e,
      body_range: funcInfo.bodies.get(e)
        ? [funcInfo.bodies.get(e).min, funcInfo.bodies.get(e).max]
        : null,
    })),
    static_enc_func_create_sites: staticInfo.encFuncCreateSites,
    static_cross_check: staticCrossCheck,
    key_closure_spawn_sites: spawnSites,
    ancestor_chains: chains,
    ancestor_function_union: chainFunctionsSorted.map((e) => ({
      entry: e,
      body_range: funcInfo.bodies.get(e)
        ? [funcInfo.bodies.get(e).min, funcInfo.bodies.get(e).max]
        : null,
      size: funcInfo.bodies.get(e) ? funcInfo.bodies.get(e).size : null,
    })),
    notes: [
      'Phase 44 task 44.1: back-walk from encrypt closure entry (pc 15241) to',
      'the function(s) in vm-slide that build the plaintext blocks.',
      'runtime_caller_pcs_raw should contain exactly 14 entries (14 encrypt',
      'calls = 112 plaintext bytes).',
      'Each caller pc is the outer-frame dispatch tick immediately preceding',
      'a __VMTAP_ENTER(K=15241) event, skipping any dispatch tick inside the',
      'cipher body [ENC_ENTRY, CIPHER_REGION_END] (those are inner-frame',
      'ticks of the closure itself).',
    ],
  };

  fs.writeFileSync(OUT_CALLGRAPH, JSON.stringify(spec, null, 2));
  console.log('wrote', OUT_CALLGRAPH);
  console.log('=== done ===');
}

main();
