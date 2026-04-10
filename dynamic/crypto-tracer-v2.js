'use strict';

/**
 * crypto-tracer-v2.js — Expanded Puppeteer-based tracer for func_271 crypto internals.
 *
 * Task 7.3: Extends crypto-tracer.js to cover ALL three code regions of func_271:
 *
 *   Region 1 (PC 65361-65625): 14-step setup sequence (closures + state array init)
 *   Region 2 (PC 40146-40178): Loop condition — self-modifies Y[40178] from THROW→CJMP,
 *     then branches: true→Region 3 (inner loop), false→Exit
 *   Region 3 (PC 68776-68915): Inner loop — processes 8-byte chunks via r62[0], r46[0], r90[0]
 *   Exit    (PC 65627-65635): Finalization — r20[0](r19) accumulator → return
 *
 * The self-modification at PC 40161 writes opcode 87 (CJMP) to Y[40178], replacing the
 * static THROW opcode 37. This happens BEFORE execution reaches 40178, so the THROW never
 * fires. After self-mod, CJMP r35 branches:
 *   - true  (r37 < r60.length): PC 40178+28597+1 = 68776 (Region 3)
 *   - false (r37 >= r60.length): PC 40178+25448+1 = 65627 (Exit)
 *
 * Output: output/dynamic/crypto-trace-v2.json
 *
 * Usage: node src/dynamic/crypto-tracer-v2.js [--timestamp <ms>] [--random <float>]
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TDC_PATH = path.join(PROJECT_ROOT, 'tdc.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'dynamic');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'crypto-trace-v2.json');

// Parse args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const FROZEN_TIMESTAMP = parseInt(getArg('timestamp', '1700000000000'), 10);
const FROZEN_RANDOM = parseFloat(getArg('random', '0.42'));
const FROZEN_PERF_NOW = parseFloat(getArg('perfnow', '100.5'));

// Ensure output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const tdcSourceRaw = fs.readFileSync(TDC_PATH, 'utf-8');

// ═══════════════════════════════════════════════════════════════════════
// Region 1: 14-step call sites (same as v1)
// ═══════════════════════════════════════════════════════════════════════

const CALL_SITES = [
  { callPC: 65421, nextPC: 65426, funcName: 'func_100', opType: 'CALLQ_2', group: 'A', segmentIdx: 2, step: 1,  desc: 'Generate 12-byte random value' },
  { callPC: 65437, nextPC: 65441, funcName: 'func_141', opType: 'CALLQ_1', group: 'none', segmentIdx: null, step: 2,  desc: 'Key setup: r44.e("B0JC", 16)' },
  { callPC: 65453, nextPC: 65458, funcName: 'func_69',  opType: 'CALLQ_2', group: 'B', segmentIdx: 1, step: 3,  desc: 'Transform with param 8' },
  { callPC: 65473, nextPC: 65478, funcName: 'func_210', opType: 'CALLQ_2', group: 'B', segmentIdx: 2, step: 4,  desc: 'Transform with param 16' },
  { callPC: 65496, nextPC: 65501, funcName: 'func_31',  opType: 'CALLQ_2', group: 'B', segmentIdx: 3, step: 5,  desc: 'Transform with param 4' },
  { callPC: 65512, nextPC: 65516, funcName: 'func_90',  opType: 'CALLQ_1', group: 'none', segmentIdx: null, step: 6,  desc: 'Key operation: r44.f("\'0/:", 16)' },
  { callPC: 65522, nextPC: 65527, funcName: 'func_43',  opType: 'CALLQ_2', group: 'A', segmentIdx: 0, step: 7,  desc: 'Transform with param r96' },
  { callPC: 65539, nextPC: 65544, funcName: 'func_199', opType: 'CALLQ_2', group: 'A', segmentIdx: 1, step: 8,  desc: 'Transform with param r89' },
  { callPC: 65555, nextPC: 65559, funcName: 'func_254', opType: 'CALLQ_1', group: 'none', segmentIdx: null, step: 9,  desc: 'Key operation: r44.d("\'0/:", 12)' },
  { callPC: 65564, nextPC: 65568, funcName: 'func_74',  opType: 'CALLQ_1', group: 'none', segmentIdx: null, step: 10, desc: 'Key operation: r44.d("QRu~", 16)' },
  { callPC: 65574, nextPC: 65579, funcName: 'func_284', opType: 'CALLQ_2', group: 'A', segmentIdx: 3, step: 11, desc: 'Transform with param r86' },
  { callPC: 65590, nextPC: 65594, funcName: 'func_273', opType: 'CALLQ_1', group: 'none', segmentIdx: null, step: 12, desc: 'Key operation: r44.b("QRu~", 8)' },
  { callPC: 65600, nextPC: 65605, funcName: 'func_113', opType: 'CALLQ_2', group: 'B', segmentIdx: 0, step: 13, desc: 'Transform with param r96' },
  { callPC: 65616, nextPC: 65620, funcName: 'func_92',  opType: 'CALLQ_1', group: 'none', segmentIdx: null, step: 14, desc: 'Key operation: r44.a("jK0L", 4)' },
];

// ═══════════════════════════════════════════════════════════════════════
// Region 3: Inner loop call sites
// ═══════════════════════════════════════════════════════════════════════

/**
 * The 5 CALLQ instructions in the inner loop (Region 3, PC 68776-68915).
 *
 * From static disassembly — register→function mapping to be confirmed dynamically:
 *   [68811] CALLQ_1 r8, r47, r86     — r62[0](slice1): convert 4-byte slice to 32-bit word
 *   [68846] CALLQ_1 r96, r86, r25    — r62[0](slice2): convert next 4-byte slice
 *   [68860] CALLQ_2 r33, r96, r9, r92 — r46[0](r9, r92): cipher round on 2-word pair
 *   [68876] CALLQ_1 r35, r25, r86    — r90[0](r9[0]): serialize first word to bytes
 *   [68888] CALLQ_1 r8, r86, r25     — r90[0](r9[1]): serialize second word to bytes
 */
const INNER_LOOP_SITES = [
  { callPC: 68811, nextPC: 68815, label: 'converter1', opType: 'CALLQ_1', desc: 'r62[0](slice1) → r9[0]' },
  { callPC: 68846, nextPC: 68850, label: 'converter2', opType: 'CALLQ_1', desc: 'r62[0](slice2) → r9[1]' },
  { callPC: 68860, nextPC: 68865, label: 'cipherRound', opType: 'CALLQ_2', desc: 'r46[0](r9, r92) → cipher transform' },
  { callPC: 68876, nextPC: 68880, label: 'serializer1', opType: 'CALLQ_1', desc: 'r90[0](r9[0]) → byte string' },
  { callPC: 68888, nextPC: 68892, label: 'serializer2', opType: 'CALLQ_1', desc: 'r90[0](r9[1]) → byte string' },
];

// Exit call site
const EXIT_SITE = { callPC: 65631, nextPC: 65635, label: 'finalizer', opType: 'CALLQ_1', desc: 'r20[0](r19) → final result' };

// ═══════════════════════════════════════════════════════════════════════
// VM Source Patching
// ═══════════════════════════════════════════════════════════════════════

/**
 * Patch the tdc.js dispatch loop to cover all three regions plus exit.
 *
 * The expanded PC ranges are:
 *   40140–40182  (Region 2: loop condition + self-mod)
 *   65360–65640  (Region 1: 14-step setup + exit)
 *   68770–68920  (Region 3: inner loop)
 *
 * We also pass F (catch stack) and Q (this context) for exception analysis.
 */
function patchTdcSource(source) {
  const target = 'switch (Y[++C])';
  const idx = source.indexOf(target);
  if (idx < 0) {
    throw new Error('Could not find dispatch switch in tdc.js');
  }

  // Expanded range check: three regions
  const rangeCheck = '(C>=40140&&C<=40182||C>=65360&&C<=65640||C>=68770&&C<=68920)';
  const replacement = 'var _xop=Y[++C];if(' + rangeCheck + '&&window.__CL){window.__CL(C,_xop,i,Y,F,Q);}switch(_xop)';
  return source.substring(0, idx) + replacement + source.substring(idx + target.length);
}

// ═══════════════════════════════════════════════════════════════════════
// Browser Instrumentation Code
// ═══════════════════════════════════════════════════════════════════════

function buildInstrumentCode(frozenTs, frozenRandom, frozenPerfNow) {
  const callSiteJSON = JSON.stringify(CALL_SITES);
  const innerLoopSiteJSON = JSON.stringify(INNER_LOOP_SITES);
  const exitSiteJSON = JSON.stringify(EXIT_SITE);

  return `(function() {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // SECTION 1: Freeze non-deterministic values
  // (identical to crypto-tracer.js v1)
  // ══════════════════════════════════════════════════════════

  var FROZEN_TS = ${frozenTs};
  var FROZEN_RANDOM = ${frozenRandom};
  var FROZEN_PERF = ${frozenPerfNow};

  var origDateNow = Date.now;
  var OrigDate = Date;
  Date.now = function() { return FROZEN_TS; };

  var mathRandomSeed = Math.floor(FROZEN_RANDOM * 2147483647) | 0;
  if (mathRandomSeed === 0) mathRandomSeed = 1;
  Math.random = function() {
    mathRandomSeed |= 0;
    mathRandomSeed = mathRandomSeed + 0x6D2B79F5 | 0;
    var t = Math.imul(mathRandomSeed ^ mathRandomSeed >>> 15, 1 | mathRandomSeed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };

  if (window.performance) {
    performance.now = function() { return FROZEN_PERF; };
  }

  if (window.crypto && window.crypto.getRandomValues) {
    window.__CRYPTO_SEED = 42;
    window.crypto.getRandomValues = function(arr) {
      for (var ci = 0; ci < arr.length; ci++) {
        window.__CRYPTO_SEED = (window.__CRYPTO_SEED * 1103515245 + 12345) & 0x7fffffff;
        arr[ci] = window.__CRYPTO_SEED & 0xff;
      }
      return arr;
    };
  }

  // Freeze canvas fingerprinting
  HTMLCanvasElement.prototype.toDataURL = function() {
    return 'data:image/png;base64,FROZEN_CANVAS_FINGERPRINT';
  };

  var origGetContext = HTMLCanvasElement.prototype.getContext;
  var canvasCtxCache = new WeakMap();
  HTMLCanvasElement.prototype.getContext = function(type) {
    var ctx = origGetContext.apply(this, arguments);
    if (ctx && (type === '2d') && !canvasCtxCache.has(ctx)) {
      canvasCtxCache.set(ctx, true);
      var origGetImageData = ctx.getImageData;
      ctx.getImageData = function() {
        var data = origGetImageData.apply(this, arguments);
        for (var di = 0; di < data.data.length; di++) {
          data.data[di] = (di * 7 + 13) & 0xff;
        }
        return data;
      };
    }
    return ctx;
  };

  // Freeze AudioContext
  if (window.AudioContext || window.webkitAudioContext) {
    var OrigAudioCtx = window.AudioContext || window.webkitAudioContext;
    var FakeAudioCtx = function() {
      var ctx = new OrigAudioCtx();
      try { Object.defineProperty(ctx, 'baseLatency', { get: function() { return 0.005333333333333333; } }); } catch(e) {}
      try { Object.defineProperty(ctx, 'outputLatency', { get: function() { return 0; } }); } catch(e) {}
      try { Object.defineProperty(ctx, 'sampleRate', { get: function() { return 44100; } }); } catch(e) {}
      if (ctx.createAnalyser) {
        var origCreate = ctx.createAnalyser.bind(ctx);
        ctx.createAnalyser = function() {
          var analyser = origCreate();
          analyser.getFloatFrequencyData = function(arr) { for (var ai = 0; ai < arr.length; ai++) arr[ai] = -100 + (ai % 50); };
          analyser.getByteFrequencyData = function(arr) { for (var ai = 0; ai < arr.length; ai++) arr[ai] = (ai * 3) & 0xff; };
          return analyser;
        };
      }
      if (ctx.createDynamicsCompressor) {
        var origDC = ctx.createDynamicsCompressor.bind(ctx);
        ctx.createDynamicsCompressor = function() {
          var comp = origDC();
          try { Object.defineProperty(comp.reduction, 'value', { get: function() { return 0; } }); } catch(e) {}
          return comp;
        };
      }
      return ctx;
    };
    FakeAudioCtx.prototype = OrigAudioCtx.prototype;
    try { window.AudioContext = FakeAudioCtx; } catch(e) {}
    try { window.webkitAudioContext = FakeAudioCtx; } catch(e) {}
  }

  if (window.OfflineAudioContext) {
    var OrigOfflineAudio = window.OfflineAudioContext;
    var FakeOfflineAudio = function(channels, length, sampleRate) {
      var ctx = new OrigOfflineAudio(channels || 1, length || 44100, sampleRate || 44100);
      var origRender = ctx.startRendering.bind(ctx);
      ctx.startRendering = function() {
        return origRender().then(function(buffer) {
          for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
            var data = buffer.getChannelData(ch);
            for (var si = 0; si < data.length; si++) data[si] = Math.sin(si * 0.01) * 0.001;
          }
          return buffer;
        });
      };
      try { Object.defineProperty(ctx, 'sampleRate', { get: function() { return sampleRate || 44100; } }); } catch(e) {}
      return ctx;
    };
    FakeOfflineAudio.prototype = OrigOfflineAudio.prototype;
    try { window.OfflineAudioContext = FakeOfflineAudio; } catch(e) {}
  }

  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices = function() {
      return [{ default: true, lang: 'en-US', localService: true, name: 'FrozenVoice', voiceURI: 'FrozenVoice' }];
    };
  }

  try {
    var testCanvas = document.createElement('canvas');
    var gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (gl) {
      var origGetParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 0x1F01 || param === 0x9246) return 'FrozenRenderer';
        if (param === 0x1F00 || param === 0x9245) return 'FrozenVendor';
        return origGetParameter.call(this, param);
      };
    }
  } catch(e) {}

  if (window.WebGL2RenderingContext) {
    try {
      var origGL2Get = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(param) {
        if (param === 0x1F01 || param === 0x9246) return 'FrozenRenderer';
        if (param === 0x1F00 || param === 0x9245) return 'FrozenVendor';
        return origGL2Get.call(this, param);
      };
    } catch(e) {}
  }

  if (navigator.getBattery) {
    navigator.getBattery = function() {
      return Promise.resolve({
        charging: true, chargingTime: Infinity, dischargingTime: Infinity, level: 1.0,
        addEventListener: function() {}, removeEventListener: function() {}
      });
    };
  }

  try { Object.defineProperty(navigator, 'connection', { get: function() { return { downlink: 10, effectiveType: '4g', rtt: 50, saveData: false }; }, configurable: true }); } catch(e) {}

  if (window.performance) {
    performance.getEntries = function() { return []; };
    performance.getEntriesByType = function() { return []; };
    performance.getEntriesByName = function() { return []; };
  }

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices = function() {
      return Promise.resolve([
        { deviceId: 'frozen', kind: 'audioinput', label: '', groupId: 'frozen' },
        { deviceId: 'frozen', kind: 'videoinput', label: '', groupId: 'frozen' },
        { deviceId: 'frozen', kind: 'audiooutput', label: '', groupId: 'frozen' }
      ]);
    };
  }

  try {
    if (window.RTCPeerConnection) {
      var OrigRTC = window.RTCPeerConnection;
      window.RTCPeerConnection = function() {
        var pc = new OrigRTC(arguments[0]);
        pc.createDataChannel = function() { return {}; };
        pc.createOffer = function() { return Promise.resolve({ type: 'offer', sdp: '' }); };
        pc.setLocalDescription = function() { return Promise.resolve(); };
        return pc;
      };
      window.RTCPeerConnection.prototype = OrigRTC.prototype;
    }
  } catch(e) {}

  try { Object.defineProperty(screen, 'orientation', { get: function() { return { type: 'landscape-primary', angle: 0 }; }, configurable: true }); } catch(e) {}
  try { Object.defineProperty(navigator, 'deviceMemory', { get: function() { return 8; }, configurable: true }); } catch(e) {}
  try { Object.defineProperty(navigator, 'hardwareConcurrency', { get: function() { return 4; }, configurable: true }); } catch(e) {}

  var origRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(cb) {
    return origRAF.call(window, function() { cb(FROZEN_PERF); });
  };

  // ══════════════════════════════════════════════════════════
  // SECTION 2: TDC Date helpers
  // ══════════════════════════════════════════════════════════

  window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = function() {
    return new OrigDate(FROZEN_TS);
  };
  window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = function(a, b) {
    if (a === 'now') return FROZEN_TS;
    return OrigDate[a].apply(OrigDate, b);
  };

  // ══════════════════════════════════════════════════════════
  // SECTION 3: Expanded trace storage
  // ══════════════════════════════════════════════════════════

  var CALL_SITES = ${callSiteJSON};
  var INNER_SITES = ${innerLoopSiteJSON};
  var EXIT_SITE = ${exitSiteJSON};

  // Build PC lookup maps
  var callPCMap = {};   // Region 1 CALLQ PCs
  var nextPCMap = {};   // Region 1 post-CALLQ PCs
  for (var si = 0; si < CALL_SITES.length; si++) {
    callPCMap[CALL_SITES[si].callPC] = CALL_SITES[si];
    nextPCMap[CALL_SITES[si].nextPC] = CALL_SITES[si];
  }

  var innerCallPCMap = {};   // Region 3 CALLQ PCs
  var innerNextPCMap = {};   // Region 3 post-CALLQ PCs
  for (var ii = 0; ii < INNER_SITES.length; ii++) {
    innerCallPCMap[INNER_SITES[ii].callPC] = INNER_SITES[ii];
    innerNextPCMap[INNER_SITES[ii].nextPC] = INNER_SITES[ii];
  }

  window.__CRYPTO_TRACE = {
    frozenTimestamp: FROZEN_TS,
    frozenRandom: FROZEN_RANDOM,
    frozenPerfNow: FROZEN_PERF,

    // ── Region 1: 14-step calls (same as v1) ──
    calls: [],
    _pendingCall: null,

    // ── Region 2: Loop control ──
    loopControl: [],   // {iteration, r37, inputLength, branchTaken, catchStackDepth}
    _region2Count: 0,

    // ── Region 3: Inner loop iterations ──
    innerLoop: [],     // {iteration, r37, converter1, converter2, cipherRound, serializer1, serializer2, r9Before, r9After, r19LengthBefore, r19LengthAfter, fromCharCodeDelta}
    _innerPending: null,
    _innerIterationState: null,

    // ── Exit ──
    exitCall: [],      // {r19Length, r19Preview, returnValue, getDataCallIndex}
    _exitPending: null,

    // ── Per-invocation fCC tracking ──
    // Tracks fromCharCodeTotal at func_271 entry and exit to compute crypto-only fCC
    invocationFcc: [],  // {invocationIndex, fccAtEntry, fccAtExit, cryptoFcc, getDataCallIndex}
    _currentInvocationFccEntry: null,
    _invocationIndex: 0,

    // ── Region hit counters ──
    regionHitCounts: { region1: 0, region2: 0, region3: 0, exit: 0 },

    // ── Self-modification tracking ──
    selfMod: [],       // {pc, beforeOpcode, afterOpcode}

    // ── btoa and fromCharCode (same as v1) ──
    btoaSegments: [],
    fromCharCodeTotal: 0,
    fromCharCodePerPhase: [],

    // ── r92 snapshots ──
    r92Snapshots: [],

    // ── Key operations ──
    keyOps: [],

    // ── Per-getData tracking ──
    getDataCallIndex: 0,

    // ── Errors ──
    errors: [],
    tokens: []
  };

  var trace = window.__CRYPTO_TRACE;

  // ══════════════════════════════════════════════════════════
  // SECTION 4: Snapshot utilities
  // ══════════════════════════════════════════════════════════

  function snapshotValue(val, maxBytes) {
    if (val === undefined) return { type: 'undefined' };
    if (val === null) return { type: 'null' };
    if (typeof val === 'number') return { type: 'number', value: val };
    if (typeof val === 'boolean') return { type: 'boolean', value: val };
    if (typeof val === 'function') return { type: 'function' };
    if (typeof val === 'string') {
      var hex = [];
      var limit = maxBytes || 64;
      for (var i = 0; i < Math.min(val.length, limit); i++) {
        hex.push(val.charCodeAt(i));
      }
      return { type: 'string', length: val.length, bytes: hex, truncated: val.length > limit };
    }
    if (Array.isArray(val)) {
      var items = [];
      for (var j = 0; j < val.length; j++) {
        items.push(snapshotValue(val[j], maxBytes));
      }
      return { type: 'array', length: val.length, items: items };
    }
    if (typeof val === 'object') {
      try {
        var keys = Object.keys(val);
        var methods = [];
        var props = {};
        for (var k = 0; k < keys.length; k++) {
          if (typeof val[keys[k]] === 'function') methods.push(keys[k]);
          else props[keys[k]] = snapshotValue(val[keys[k]], 32);
        }
        return { type: 'object', methods: methods, props: props };
      } catch(e) {
        return { type: 'object', error: String(e) };
      }
    }
    return { type: typeof val, preview: String(val).substring(0, 100) };
  }

  function snapshotSharedState(i) {
    return {
      r87: snapshotValue(i[87], 256),
      r18: snapshotValue(i[18], 256),
      r92: snapshotValue(i[92], 4096)
    };
  }

  function getCallArgs(callSite, i, Y, pc) {
    var destReg = Y[pc + 1];
    var funcReg = Y[pc + 2];
    var arg1Reg = Y[pc + 3];
    var result = {
      destReg: destReg,
      funcReg: funcReg,
      funcValue: typeof i[funcReg],
      arg1Reg: arg1Reg,
      arg1: snapshotValue(i[arg1Reg], 256)
    };
    if (callSite.opType === 'CALLQ_2') {
      var arg2Reg = Y[pc + 4];
      result.arg2Reg = arg2Reg;
      result.arg2 = snapshotValue(i[arg2Reg], 256);
    }
    return result;
  }

  /**
   * Snapshot r9 (the 2-element working pair used in the inner loop).
   * r9 = [word0, word1] where each word is a 32-bit integer after conversion.
   */
  function snapshotR9(i) {
    var r9 = i[9];
    if (!Array.isArray(r9)) return snapshotValue(r9, 64);
    return {
      type: 'array',
      length: r9.length,
      items: [
        snapshotValue(r9[0], 64),
        snapshotValue(r9[1], 64)
      ]
    };
  }

  // ══════════════════════════════════════════════════════════
  // SECTION 5: VM dispatch hook — expanded for all regions
  // ══════════════════════════════════════════════════════════

  /**
   * Called from the patched VM dispatch loop.
   * C = current PC, _xop = opcode, i = registers, Y = bytecode, F = catch stack, Q = this context.
   *
   * The callback fires AFTER Y[++C] is read but BEFORE the switch case executes.
   * So registers reflect the state BEFORE this instruction runs.
   */
  window.__CL = function(C, _xop, i, Y, F, Q) {
    try {

      // ────────────────────────────────────────────────────
      // REGION 1: 14-step setup (PC 65360–65640)
      // ────────────────────────────────────────────────────

      if (C >= 65360 && C <= 65640) {

        // Track region entry (first instruction of Region 1 setup)
        if (C === 65361) {
          trace.regionHitCounts.region1++;
          // Record fCC at func_271 invocation start
          trace._currentInvocationFccEntry = trace.fromCharCodeTotal;
        }

        // Region 1 CALLQ entry
        var callSite = callPCMap[C];
        if (callSite) {
          var callArgs = getCallArgs(callSite, i, Y, C);
          var stateBefore = snapshotSharedState(i);

          trace._pendingCall = {
            funcName: callSite.funcName,
            step: callSite.step,
            desc: callSite.desc,
            group: callSite.group,
            segmentIdx: callSite.segmentIdx,
            args: callArgs,
            sharedStateBefore: stateBefore,
            fromCharCodeBefore: trace.fromCharCodeTotal,
            getDataCallIndex: trace.getDataCallIndex
          };
          return;
        }

        // Region 1 CALLQ return
        var afterSite = nextPCMap[C];
        if (afterSite && trace._pendingCall && trace._pendingCall.funcName === afterSite.funcName) {
          var pending = trace._pendingCall;
          var stateAfter = snapshotSharedState(i);
          var destReg = pending.args.destReg;
          var returnVal = snapshotValue(i[destReg], 4096);

          var callEntry = {
            funcName: pending.funcName,
            step: pending.step,
            desc: pending.desc,
            group: pending.group,
            segmentIdx: pending.segmentIdx,
            args: pending.args,
            returnValue: returnVal,
            sharedStateBefore: pending.sharedStateBefore,
            sharedStateAfter: stateAfter,
            fromCharCodeDelta: trace.fromCharCodeTotal - pending.fromCharCodeBefore,
            getDataCallIndex: pending.getDataCallIndex
          };

          trace.calls.push(callEntry);

          if (pending.segmentIdx !== null) {
            trace.r92Snapshots.push({
              afterStep: pending.step,
              funcName: pending.funcName,
              segmentIdx: pending.segmentIdx,
              r92: snapshotValue(i[92], 4096),
              getDataCallIndex: pending.getDataCallIndex
            });
          }

          if (pending.group === 'none') {
            trace.keyOps.push({
              step: pending.step,
              funcName: pending.funcName,
              desc: pending.desc,
              getDataCallIndex: pending.getDataCallIndex
            });
          }

          trace._pendingCall = null;
          return;
        }

        // ── Exit call at PC 65627-65635 ──
        if (C === 65627) {
          trace.regionHitCounts.exit++;
        }

        if (C === EXIT_SITE.callPC) {
          // Before exit call: r96 = r20[0], r19 = accumulator string
          var r19val = i[19];
          trace._exitPending = {
            r19Length: typeof r19val === 'string' ? r19val.length : -1,
            r19Preview: snapshotValue(r19val, 128),
            funcReg: Y[C + 2],
            funcType: typeof i[Y[C + 2]],
            fromCharCodeBefore: trace.fromCharCodeTotal,
            getDataCallIndex: trace.getDataCallIndex
          };
          return;
        }

        if (C === EXIT_SITE.nextPC && trace._exitPending) {
          var ep = trace._exitPending;
          var exitDestReg = Y[EXIT_SITE.callPC + 1];
          var exitReturnVal = snapshotValue(i[exitDestReg], 4096);

          trace.exitCall.push({
            r19Length: ep.r19Length,
            r19Preview: ep.r19Preview,
            returnValue: exitReturnVal,
            fromCharCodeDelta: trace.fromCharCodeTotal - ep.fromCharCodeBefore,
            getDataCallIndex: ep.getDataCallIndex
          });
          trace._exitPending = null;

          // Record fCC at func_271 invocation end
          if (trace._currentInvocationFccEntry !== null) {
            var fccAtExit = trace.fromCharCodeTotal;
            trace.invocationFcc.push({
              invocationIndex: trace._invocationIndex++,
              fccAtEntry: trace._currentInvocationFccEntry,
              fccAtExit: fccAtExit,
              cryptoFcc: fccAtExit - trace._currentInvocationFccEntry,
              getDataCallIndex: trace.getDataCallIndex
            });
            trace._currentInvocationFccEntry = null;
          }
          return;
        }

        return;
      }

      // ────────────────────────────────────────────────────
      // REGION 2: Loop condition (PC 40140–40182)
      // ────────────────────────────────────────────────────

      if (C >= 40140 && C <= 40182) {

        // Track entry to Region 2 (at the STR_EMPTY that starts building "length")
        if (C === 40146) {
          trace.regionHitCounts.region2++;
          trace._region2Count++;
        }

        // Self-modification detection at PC 40161
        // PROP_SET_K r6, 40178, r47 — writes Y[40178] = r47 (which is 87 = CJMP)
        if (C === 40161) {
          var beforeOpcode = Y[40178];
          var newOpcode = i[Y[C + 3]]; // r47's value
          trace.selfMod.push({
            pc: 40178,
            beforeOpcode: beforeOpcode,
            afterOpcode: newOpcode,
            iteration: trace._region2Count,
            getDataCallIndex: trace.getDataCallIndex
          });
        }

        // CJMP decision at PC 40178 (after self-mod, this is CJMP not THROW)
        // Register r35 = (r37 < r60["length"]) — the branch condition
        if (C === 40178) {
          var branchCond = i[35];  // true → Region 3, false → Exit
          var r37val = i[37];      // current position in input
          var catchDepth = F ? F.length : -1;

          trace.loopControl.push({
            iteration: trace._region2Count,
            opcode: _xop,
            opcodeExpected: 87,
            r37: typeof r37val === 'number' ? r37val : snapshotValue(r37val, 32),
            branchCondition: branchCond,
            branchTaken: branchCond ? 'region3' : 'exit',
            catchStackDepth: catchDepth,
            getDataCallIndex: trace.getDataCallIndex
          });
        }

        return;
      }

      // ────────────────────────────────────────────────────
      // REGION 3: Inner loop (PC 68770–68920)
      // ────────────────────────────────────────────────────

      if (C >= 68770 && C <= 68920) {

        // Track entry to Region 3
        if (C === 68776) {
          trace.regionHitCounts.region3++;

          // Start a new inner loop iteration
          var r19Before = i[19];
          trace._innerIterationState = {
            iteration: trace.regionHitCounts.region3,
            r37: typeof i[37] === 'number' ? i[37] : snapshotValue(i[37], 32),
            r9Before: snapshotR9(i),
            r19LengthBefore: typeof r19Before === 'string' ? r19Before.length : -1,
            fromCharCodeBefore: trace.fromCharCodeTotal,
            calls: {},
            getDataCallIndex: trace.getDataCallIndex
          };
        }

        // Inner loop CALLQ entry points
        var innerSite = innerCallPCMap[C];
        if (innerSite) {
          var innerArgs = getCallArgs(innerSite, i, Y, C);
          trace._innerPending = {
            label: innerSite.label,
            callPC: innerSite.callPC,
            args: innerArgs,
            fromCharCodeBefore: trace.fromCharCodeTotal,

            // Snapshot r9 before cipher round specifically
            r9Snapshot: (innerSite.label === 'cipherRound') ? snapshotR9(i) : null,
            // Snapshot r92 before cipher round
            r92Snapshot: (innerSite.label === 'cipherRound') ? snapshotValue(i[92], 4096) : null
          };
          return;
        }

        // Inner loop CALLQ return points
        var innerAfter = innerNextPCMap[C];
        if (innerAfter && trace._innerPending && trace._innerPending.label === innerAfter.label) {
          var ip = trace._innerPending;
          var innerDestReg = ip.args.destReg;
          var innerRetVal = snapshotValue(i[innerDestReg], 256);
          var innerFccDelta = trace.fromCharCodeTotal - ip.fromCharCodeBefore;

          var callResult = {
            label: ip.label,
            args: ip.args,
            returnValue: innerRetVal,
            fromCharCodeDelta: innerFccDelta
          };

          // For cipher round, also capture r9 after
          if (ip.label === 'cipherRound') {
            callResult.r9Before = ip.r9Snapshot;
            callResult.r9After = snapshotR9(i);
            callResult.r92Before = ip.r92Snapshot;
            callResult.r92After = snapshotValue(i[92], 4096);
          }

          // Store in current iteration state
          if (trace._innerIterationState) {
            trace._innerIterationState.calls[ip.label] = callResult;
          }

          trace._innerPending = null;
          return;
        }

        // Detect second self-modification at PC 68941
        if (C === 68941) {
          var before2 = Y[68960];
          var newOp2 = i[Y[C + 3]]; // r26 value
          trace.selfMod.push({
            pc: 68960,
            beforeOpcode: before2,
            afterOpcode: newOp2,
            iteration: trace.regionHitCounts.region3,
            region: 3,
            getDataCallIndex: trace.getDataCallIndex
          });
        }

        // r37 update at PC 68912 (ADD_K r96, r96, 8 / then MOV r37, r96 at 68912/68912)
        // Actually at PC 68908: ADD_K r96, r96, 8 and PC 68912: MOV r37, r96
        // Capture the JMP at 68915 — this signals end of inner loop iteration
        if (C === 68915 && trace._innerIterationState) {
          var its = trace._innerIterationState;
          var r19After = i[19];
          its.r9After = snapshotR9(i);
          its.r19LengthAfter = typeof r19After === 'string' ? r19After.length : -1;
          its.r19Growth = its.r19LengthAfter - its.r19LengthBefore;
          its.fromCharCodeDelta = trace.fromCharCodeTotal - its.fromCharCodeBefore;
          its.r37After = typeof i[37] === 'number' ? i[37] : snapshotValue(i[37], 32);

          trace.innerLoop.push(its);
          trace._innerIterationState = null;
        }

        return;
      }

    } catch(e) {
      trace.errors.push({ stage: 'vm-dispatch-hook-v2', pc: C, error: String(e), stack: e.stack ? e.stack.substring(0, 200) : '' });
    }
  };

  // ══════════════════════════════════════════════════════════
  // SECTION 6: Hook btoa (same as v1)
  // ══════════════════════════════════════════════════════════

  var origBtoa = window.btoa;
  window.btoa = function(str) {
    var result = origBtoa.call(window, str);
    if (typeof str === 'string' && str.length >= 4) {
      var bytes = [];
      for (var bi = 0; bi < str.length; bi++) {
        bytes.push(str.charCodeAt(bi));
      }
      trace.btoaSegments.push({
        callIndex: trace.btoaSegments.length,
        inputLength: str.length,
        outputLength: result.length,
        output: result,
        bytes: bytes,
        getDataCallIndex: trace.getDataCallIndex
      });
    }
    return result;
  };

  // ══════════════════════════════════════════════════════════
  // SECTION 7: Hook String.fromCharCode (same as v1)
  // ══════════════════════════════════════════════════════════

  var origFromCharCode = String.fromCharCode;
  String.fromCharCode = function() {
    trace.fromCharCodeTotal++;
    return origFromCharCode.apply(String, arguments);
  };

  // ══════════════════════════════════════════════════════════
  // SECTION 8: Reset for second getData() call
  // ══════════════════════════════════════════════════════════

  window.__RESET_FOR_CALL2 = function(frozenRandom) {
    trace.getDataCallIndex = 1;
    trace._pendingCall = null;
    trace._innerPending = null;
    trace._innerIterationState = null;
    trace._exitPending = null;
    trace._currentInvocationFccEntry = null;

    var seed = Math.floor(frozenRandom * 2147483647) | 0;
    if (seed === 0) seed = 1;
    mathRandomSeed = seed;
    Math.random = function() {
      mathRandomSeed |= 0;
      mathRandomSeed = mathRandomSeed + 0x6D2B79F5 | 0;
      var t = Math.imul(mathRandomSeed ^ mathRandomSeed >>> 15, 1 | mathRandomSeed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    window.__CRYPTO_SEED = 42;
  };

})();`;
}

// ═══════════════════════════════════════════════════════════════════════
// HTML Builder
// ═══════════════════════════════════════════════════════════════════════

function buildHTML(frozenTs, frozenRandom, frozenPerfNow) {
  const instrumentCode = buildInstrumentCode(frozenTs, frozenRandom, frozenPerfNow);
  const patchedSource = patchTdcSource(tdcSourceRaw);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TDC Crypto Tracer v2</title>
</head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>
    // Crypto tracer v2 instrumentation
    ${instrumentCode}
  </script>
  <script>
    // TDC VM (patched — dispatch loop includes expanded PC-level logging)
    ${patchedSource}
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════════
// Trace Runner
// ═══════════════════════════════════════════════════════════════════════

async function runTrace() {
  const html = buildHTML(FROZEN_TIMESTAMP, FROZEN_RANDOM, FROZEN_PERF_NOW);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, ts: Date.now() });
  });

  // Serve page
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  console.log('[crypto-tracer-v2] Loading page on port', port);
  await page.goto('http://127.0.0.1:' + port, { waitUntil: 'domcontentloaded' });

  // Wait for TDC
  const tdcReady = await page.waitForFunction(
    () => window.TDC && typeof window.TDC.getInfo === 'function',
    { timeout: 15000 }
  ).then(() => true).catch(() => false);

  if (!tdcReady) {
    await browser.close();
    server.close();
    throw new Error('TDC did not initialize within 15s');
  }

  console.log('[crypto-tracer-v2] TDC ready. Waiting for collectors...');
  await new Promise(r => setTimeout(r, 5000));

  // Call setData
  await page.evaluate(() => {
    window.TDC.setData({
      appid: '2090803262',
      nonce: '0.12345678',
      token: 'test_token_123'
    });
  });

  console.log('[crypto-tracer-v2] setData() called. Running getData() call #1...');

  // First getData() call
  const token1 = await page.evaluate(() => {
    try {
      return window.TDC.getData();
    } catch (e) {
      return 'ERROR: ' + e.message;
    }
  });

  console.log('[crypto-tracer-v2] Token #1 length:', token1 ? token1.length : 0);

  // Get intermediate stats
  const stats1 = await page.evaluate(() => {
    var t = window.__CRYPTO_TRACE;
    return {
      calls: t.calls.length,
      innerLoop: t.innerLoop.length,
      loopControl: t.loopControl.length,
      exitCall: t.exitCall.length,
      regionHitCounts: JSON.parse(JSON.stringify(t.regionHitCounts)),
      selfMod: t.selfMod.length,
      errors: t.errors.length
    };
  });
  console.log('[crypto-tracer-v2] Stats after call #1:', JSON.stringify(stats1));

  // Reset for second call
  console.log('[crypto-tracer-v2] Running getData() call #2...');
  const token2 = await page.evaluate((frozenRandom) => {
    try {
      window.__RESET_FOR_CALL2(frozenRandom);
      return window.TDC.getData();
    } catch (e) {
      return 'ERROR: ' + e.message;
    }
  }, FROZEN_RANDOM);

  console.log('[crypto-tracer-v2] Token #2 length:', token2 ? token2.length : 0);

  // Retrieve full trace
  const traceData = await page.evaluate(() => {
    var t = window.__CRYPTO_TRACE;
    // Clean up internal state
    delete t._pendingCall;
    delete t._innerPending;
    delete t._innerIterationState;
    delete t._exitPending;
    delete t._region2Count;
    delete t._currentInvocationFccEntry;
    delete t._invocationIndex;
    t.tokens = t.tokens || [];
    return JSON.parse(JSON.stringify(t));
  });

  traceData.tokens = [
    { index: 0, value: token1, length: token1 ? token1.length : 0 },
    { index: 1, value: token2, length: token2 ? token2.length : 0 }
  ];
  traceData.pageErrors = pageErrors;

  await browser.close();
  server.close();

  return traceData;
}

// ═══════════════════════════════════════════════════════════════════════
// Analysis & Output
// ═══════════════════════════════════════════════════════════════════════

function analyzeTrace(traceData) {
  const analysis = {
    callCount: traceData.calls.length,
    btoaSegmentCount: traceData.btoaSegments.length,
    fromCharCodeTotal: traceData.fromCharCodeTotal,
    errorCount: traceData.errors.length,
    pageErrorCount: traceData.pageErrors.length,
    regionHitCounts: traceData.regionHitCounts,
    selfModCount: traceData.selfMod.length,
    loopControlCount: traceData.loopControl.length,
    innerLoopCount: traceData.innerLoop.length,
    exitCallCount: traceData.exitCall.length,
  };

  // Split by getData() call
  const call1 = traceData.calls.filter(c => c.getDataCallIndex === 0);
  const call2 = traceData.calls.filter(c => c.getDataCallIndex === 1);
  analysis.call1Count = call1.length;
  analysis.call2Count = call2.length;

  // Inner loop by call
  const inner1 = traceData.innerLoop.filter(il => il.getDataCallIndex === 0);
  const inner2 = traceData.innerLoop.filter(il => il.getDataCallIndex === 1);
  analysis.innerLoop1Count = inner1.length;
  analysis.innerLoop2Count = inner2.length;

  // Loop control by call
  const lc1 = traceData.loopControl.filter(lc => lc.getDataCallIndex === 0);
  const lc2 = traceData.loopControl.filter(lc => lc.getDataCallIndex === 1);
  analysis.loopControl1 = lc1.map(lc => ({ iteration: lc.iteration, r37: lc.r37, branch: lc.branchTaken, opcode: lc.opcode }));
  analysis.loopControl2 = lc2.map(lc => ({ iteration: lc.iteration, r37: lc.r37, branch: lc.branchTaken, opcode: lc.opcode }));

  // fromCharCode attribution
  let fccSetup = 0;    // Region 1: 14-step calls
  let fccInner = 0;    // Region 3: inner loop calls
  let fccExit = 0;     // Exit call

  for (const c of traceData.calls) {
    fccSetup += c.fromCharCodeDelta || 0;
  }
  for (const il of traceData.innerLoop) {
    fccInner += il.fromCharCodeDelta || 0;
  }
  for (const ec of traceData.exitCall) {
    fccExit += ec.fromCharCodeDelta || 0;
  }

  // Compute crypto-only total from invocation boundaries
  let cryptoFccTotal = 0;
  let collectorFccTotal = 0;
  if (traceData.invocationFcc && traceData.invocationFcc.length > 0) {
    for (const inv of traceData.invocationFcc) {
      cryptoFccTotal += inv.cryptoFcc;
    }
    collectorFccTotal = traceData.fromCharCodeTotal - cryptoFccTotal;
  }

  const fccAccountedOfCrypto = fccSetup + fccInner + fccExit;
  const cryptoAttributionPct = cryptoFccTotal > 0
    ? (fccAccountedOfCrypto / cryptoFccTotal * 100).toFixed(1) + '%'
    : 'N/A';

  analysis.fromCharCodeAttribution = {
    setup14Step: fccSetup,
    innerLoop: fccInner,
    exitCall: fccExit,
    totalGlobal: traceData.fromCharCodeTotal,
    totalCryptoOnly: cryptoFccTotal,
    totalCollector: collectorFccTotal,
    accountedFor: fccAccountedOfCrypto,
    accountedOfGlobalPercent: ((fccAccountedOfCrypto) / traceData.fromCharCodeTotal * 100).toFixed(1) + '%',
    accountedOfCryptoPercent: cryptoAttributionPct,
    note: 'Crypto-only fCC is measured from func_271 entry (PC 65361) to exit (PC 65635). Collector fCC is the remainder — from browser fingerprinting code outside func_271.'
  };

  // Per-invocation breakdown
  if (traceData.invocationFcc) {
    analysis.invocationFccBreakdown = traceData.invocationFcc;
  }

  // Per-inner-call fromCharCode breakdown
  if (inner1.length > 0) {
    var innerCallBreakdown = { converter1: 0, converter2: 0, cipherRound: 0, serializer1: 0, serializer2: 0 };
    for (var il of inner1) {
      if (il.calls) {
        for (var label in il.calls) {
          if (il.calls[label] && typeof il.calls[label].fromCharCodeDelta === 'number') {
            innerCallBreakdown[label] = (innerCallBreakdown[label] || 0) + il.calls[label].fromCharCodeDelta;
          }
        }
      }
    }
    analysis.innerCallFccBreakdown = innerCallBreakdown;
  }

  // Determinism analysis (same as v1)
  analysis.determinismReport = [];
  for (let i = 0; i < Math.min(call1.length, call2.length); i++) {
    const rv1 = JSON.stringify(call1[i].returnValue);
    const rv2 = JSON.stringify(call2[i].returnValue);
    analysis.determinismReport.push({
      step: call1[i].step,
      funcName: call1[i].funcName,
      returnValueMatch: rv1 === rv2,
    });
  }
  analysis.varyingFunctions = analysis.determinismReport.filter(d => !d.returnValueMatch).map(d => d.funcName);

  // btoa segment analysis
  const call1Btoa = traceData.btoaSegments.filter(s => s.getDataCallIndex === 0);
  const call2Btoa = traceData.btoaSegments.filter(s => s.getDataCallIndex === 1);
  analysis.btoaCall1Count = call1Btoa.length;
  analysis.btoaCall2Count = call2Btoa.length;

  if (call1Btoa.length >= 4 && call2Btoa.length >= 4) {
    analysis.btoaSegmentComparison = [];
    for (let i = 0; i < 4; i++) {
      analysis.btoaSegmentComparison.push({
        index: i,
        call1Size: call1Btoa[i].inputLength,
        call2Size: call2Btoa[i].inputLength,
        outputMatch: call1Btoa[i].output === call2Btoa[i].output
      });
    }
  }

  // Self-modification summary
  if (traceData.selfMod.length > 0) {
    analysis.selfModSummary = traceData.selfMod.map(sm => ({
      pc: sm.pc,
      before: sm.beforeOpcode,
      after: sm.afterOpcode,
      iteration: sm.iteration
    }));
  }

  return analysis;
}

/**
 * Verify trace against encoding-trace.json ground truth
 */
function verifyAgainstGroundTruth(traceData) {
  const verifications = [];

  // Load encoding trace
  const encodingTracePath = path.join(OUTPUT_DIR, 'encoding-trace.json');
  if (!fs.existsSync(encodingTracePath)) {
    return [{ check: 'ground-truth-file', pass: false, reason: 'encoding-trace.json not found' }];
  }

  const encodingTrace = JSON.parse(fs.readFileSync(encodingTracePath, 'utf-8'));

  // Verification 1: btoa segments match (regression check)
  const call1Btoa = traceData.btoaSegments.filter(s => s.getDataCallIndex === 0);
  if (call1Btoa.length >= 4 && encodingTrace.btoaCalls && encodingTrace.btoaCalls.length >= 4) {
    for (let i = 0; i < 4; i++) {
      const cryptoSeg = call1Btoa[i];
      const encodingSeg = encodingTrace.btoaCalls[i];
      const match = cryptoSeg.outputLength === encodingSeg.outputLength &&
                    cryptoSeg.inputLength === encodingSeg.inputLength;
      verifications.push({
        check: 'btoa_segment_' + i + '_match',
        pass: match,
        cryptoSize: cryptoSeg.inputLength,
        encodingSize: encodingSeg.inputLength,
        outputLengthMatch: cryptoSeg.outputLength === encodingSeg.outputLength
      });
    }
  } else {
    verifications.push({
      check: 'btoa_segments_present',
      pass: false,
      reason: 'Expected >=4 btoa segments, got ' + call1Btoa.length
    });
  }

  // Verification 2: Region hit counts (all 3 regions >0)
  const rhc = traceData.regionHitCounts;
  verifications.push({
    check: 'region_hit_counts_all_positive',
    pass: rhc.region1 > 0 && rhc.region2 > 0 && rhc.region3 > 0,
    region1: rhc.region1,
    region2: rhc.region2,
    region3: rhc.region3,
    exit: rhc.exit
  });

  // Verification 3: Inner loop has entries
  const inner1 = traceData.innerLoop.filter(il => il.getDataCallIndex === 0);
  verifications.push({
    check: 'inner_loop_entries',
    pass: inner1.length >= 1,
    count: inner1.length,
    required: 1
  });

  // Verification 4: Inner loop entries have cipher round data
  const withCipherData = inner1.filter(il => il.calls && il.calls.cipherRound && il.calls.cipherRound.r9Before);
  verifications.push({
    check: 'inner_loop_cipher_data',
    pass: withCipherData.length >= 1,
    entriesWithCipherData: withCipherData.length,
    totalEntries: inner1.length
  });

  // Verification 5: fromCharCode attribution ≥90% of CRYPTO-PHASE calls
  // The total fCC includes collector-phase calls (browser fingerprinting etc.)
  // which are outside func_271. We measure crypto-only fCC from invocation boundaries.
  let fccSetup = 0, fccInner = 0, fccExit = 0;
  for (const c of traceData.calls) fccSetup += c.fromCharCodeDelta || 0;
  for (const il of traceData.innerLoop) fccInner += il.fromCharCodeDelta || 0;
  for (const ec of traceData.exitCall) fccExit += ec.fromCharCodeDelta || 0;

  const fccAccounted = fccSetup + fccInner + fccExit;

  // Compute crypto-only total from invocation boundaries
  let cryptoFccTotal = 0;
  if (traceData.invocationFcc) {
    for (const inv of traceData.invocationFcc) {
      cryptoFccTotal += inv.cryptoFcc;
    }
  }

  // Use crypto-only total for the 90% check (not global total which includes collectors)
  const denominator = cryptoFccTotal > 0 ? cryptoFccTotal : traceData.fromCharCodeTotal;
  const fccPercent = denominator > 0 ? (fccAccounted / denominator * 100) : 0;

  verifications.push({
    check: 'fromCharCode_attribution_90pct',
    pass: fccPercent >= 90,
    accountedFor: fccAccounted,
    cryptoTotal: cryptoFccTotal,
    globalTotal: traceData.fromCharCodeTotal,
    percentOfCrypto: fccPercent.toFixed(1) + '%',
    percentOfGlobal: (fccAccounted / traceData.fromCharCodeTotal * 100).toFixed(1) + '%',
    setup: fccSetup,
    innerLoop: fccInner,
    exitCall: fccExit,
    collectorFcc: traceData.fromCharCodeTotal - cryptoFccTotal,
    note: cryptoFccTotal > 0
      ? 'Attribution measured against crypto-phase fCC only (excluding ' + (traceData.fromCharCodeTotal - cryptoFccTotal) + ' collector-phase calls)'
      : 'Could not measure crypto-only total; using global total'
  });

  // Verification 6: Loop control answers CJMP vs THROW
  const lc1 = traceData.loopControl.filter(lc => lc.getDataCallIndex === 0);
  const allCjmp = lc1.every(lc => lc.opcode === 87);
  verifications.push({
    check: 'loop_mechanism_resolved',
    pass: lc1.length > 0,
    mechanism: allCjmp ? 'CJMP (opcode 87)' : 'mixed/other',
    entries: lc1.length,
    opcodesSeen: [...new Set(lc1.map(lc => lc.opcode))],
    branches: lc1.map(lc => lc.branchTaken)
  });

  // Verification 7: Sub-function coverage (same as v1)
  const call1 = traceData.calls.filter(c => c.getDataCallIndex === 0);
  const withData = call1.filter(c => c.args && c.returnValue);
  verifications.push({
    check: 'sub_function_coverage',
    pass: withData.length >= 12,
    captured: withData.length,
    required: 12,
    total: 14
  });

  return verifications;
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('[crypto-tracer-v2] Starting expanded crypto tracing (all 3 regions)');
  console.log('[crypto-tracer-v2] Frozen timestamp:', FROZEN_TIMESTAMP);
  console.log('[crypto-tracer-v2] Frozen random:', FROZEN_RANDOM);
  console.log('[crypto-tracer-v2] Frozen perf.now:', FROZEN_PERF_NOW);

  const traceData = await runTrace();

  console.log('\n[crypto-tracer-v2] ═══ Trace Results ═══');
  console.log('  Region 1 (14-step) calls:', traceData.calls.length);
  console.log('  Region 2 (loop ctrl) entries:', traceData.loopControl.length);
  console.log('  Region 3 (inner loop) iterations:', traceData.innerLoop.length);
  console.log('  Exit calls:', traceData.exitCall.length);
  console.log('  Self-modifications:', traceData.selfMod.length);
  console.log('  btoa segments:', traceData.btoaSegments.length);
  console.log('  fromCharCode total:', traceData.fromCharCodeTotal);
  console.log('  Region hit counts:', JSON.stringify(traceData.regionHitCounts));
  console.log('  Errors:', traceData.errors.length);
  console.log('  Page errors:', traceData.pageErrors.length);

  // Show Region 1 calls for call #1
  const call1 = traceData.calls.filter(c => c.getDataCallIndex === 0);
  console.log('\n[crypto-tracer-v2] ═══ Call #1: 14-Step Sequence ═══');
  for (const c of call1) {
    const retType = c.returnValue ? c.returnValue.type : 'N/A';
    const retLen = c.returnValue && c.returnValue.length ? '(' + c.returnValue.length + ')' : '';
    console.log('  Step ' + c.step + ': ' + c.funcName + ' (' + c.group + ') → ' + retType + retLen + ' [fCC: ' + c.fromCharCodeDelta + ']');
  }

  // Show loop control decisions
  const lc1 = traceData.loopControl.filter(lc => lc.getDataCallIndex === 0);
  console.log('\n[crypto-tracer-v2] ═══ Call #1: Loop Control ═══');
  for (const lc of lc1) {
    console.log('  Iter ' + lc.iteration + ': opcode=' + lc.opcode + ' r37=' + lc.r37 + ' → ' + lc.branchTaken + ' (cond=' + lc.branchCondition + ', F.len=' + lc.catchStackDepth + ')');
  }

  // Show inner loop summary
  const inner1 = traceData.innerLoop.filter(il => il.getDataCallIndex === 0);
  console.log('\n[crypto-tracer-v2] ═══ Call #1: Inner Loop ═══');
  for (const il of inner1) {
    const callLabels = il.calls ? Object.keys(il.calls).join(',') : 'none';
    console.log('  Iter ' + il.iteration + ': r37=' + il.r37 + ' r19 growth=' + il.r19Growth + ' fCC=' + il.fromCharCodeDelta + ' calls=[' + callLabels + ']');
  }

  // Show exit calls
  console.log('\n[crypto-tracer-v2] ═══ Exit Calls ═══');
  for (const ec of traceData.exitCall) {
    console.log('  getData#' + ec.getDataCallIndex + ': r19.length=' + ec.r19Length + ' return=' + (ec.returnValue ? ec.returnValue.type + '(' + (ec.returnValue.length || '') + ')' : 'N/A') + ' fCC=' + ec.fromCharCodeDelta);
  }

  // Show self-modifications
  if (traceData.selfMod.length > 0) {
    console.log('\n[crypto-tracer-v2] ═══ Self-Modifications ═══');
    for (const sm of traceData.selfMod) {
      console.log('  Y[' + sm.pc + ']: ' + sm.beforeOpcode + ' → ' + sm.afterOpcode + ' (iter ' + sm.iteration + ')');
    }
  }

  // Analysis
  const analysis = analyzeTrace(traceData);
  traceData.analysis = analysis;

  // fromCharCode attribution summary
  console.log('\n[crypto-tracer-v2] ═══ fromCharCode Attribution ═══');
  const attr = analysis.fromCharCodeAttribution;
  console.log('  14-step setup:', attr.setup14Step);
  console.log('  Inner loop:', attr.innerLoop);
  console.log('  Exit call:', attr.exitCall);
  console.log('  Accounted (of global):', attr.accountedFor, '/', attr.totalGlobal, '(' + attr.accountedOfGlobalPercent + ')');
  console.log('  Accounted (of crypto):', attr.accountedFor, '/', attr.totalCryptoOnly, '(' + attr.accountedOfCryptoPercent + ')');
  console.log('  Collector-phase fCC:', attr.totalCollector, '(outside func_271, from browser fingerprinting)');

  if (analysis.invocationFccBreakdown) {
    console.log('\n[crypto-tracer-v2] ═══ Per-Invocation fCC ═══');
    for (const inv of analysis.invocationFccBreakdown) {
      console.log('  Invocation ' + inv.invocationIndex + ' (getData#' + inv.getDataCallIndex + '): ' +
        'entry=' + inv.fccAtEntry + ' exit=' + inv.fccAtExit + ' crypto=' + inv.cryptoFcc);
    }
  }

  if (analysis.innerCallFccBreakdown) {
    console.log('\n[crypto-tracer-v2] ═══ Inner Loop fCC Breakdown (call #1) ═══');
    for (const label in analysis.innerCallFccBreakdown) {
      console.log('  ' + label + ':', analysis.innerCallFccBreakdown[label]);
    }
  }

  // Verification
  const verifications = verifyAgainstGroundTruth(traceData);
  traceData.verifications = verifications;

  console.log('\n[crypto-tracer-v2] ═══ Verification ═══');
  let allPass = true;
  for (const v of verifications) {
    const status = v.pass ? 'PASS' : 'FAIL';
    if (!v.pass) allPass = false;
    console.log('  ' + status + ': ' + v.check);
    if (!v.pass) {
      console.log('    Details:', JSON.stringify(v));
    }
  }

  // Write output
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(traceData, null, 2));
  console.log('\n[crypto-tracer-v2] Output written to:', OUTPUT_PATH);

  // Print final summary
  console.log('\n[crypto-tracer-v2] ═══ Summary ═══');
  console.log('  14-step calls (call 1):', analysis.call1Count);
  console.log('  14-step calls (call 2):', analysis.call2Count);
  console.log('  Inner loop iterations (call 1):', analysis.innerLoop1Count);
  console.log('  Inner loop iterations (call 2):', analysis.innerLoop2Count);
  console.log('  Loop control entries:', analysis.loopControlCount);
  console.log('  btoa segments (call 1):', analysis.btoaCall1Count);
  console.log('  btoa segments (call 2):', analysis.btoaCall2Count);
  console.log('  Varying functions:', analysis.varyingFunctions.length === 0 ? 'none (fully deterministic)' : analysis.varyingFunctions.join(', '));
  console.log('  fromCharCode accounted (crypto):', attr.accountedOfCryptoPercent);
  console.log('  Errors:', analysis.errorCount);
  console.log('  Page errors:', analysis.pageErrorCount);
  console.log('  All verifications pass:', allPass);

  if (traceData.errors.length > 0) {
    console.log('\n[crypto-tracer-v2] ═══ Errors ═══');
    for (const e of traceData.errors.slice(0, 20)) {
      console.log('  PC=' + e.pc + ': ' + e.error);
    }
    if (traceData.errors.length > 20) {
      console.log('  ... and ' + (traceData.errors.length - 20) + ' more');
    }
  }

  if (analysis.errorCount > 0 || analysis.pageErrorCount > 0) {
    console.log('\n[crypto-tracer-v2] WARNING: Errors detected. Check trace for details.');
  }
}

main().catch(err => {
  console.error('[crypto-tracer-v2] Fatal error:', err);
  process.exit(1);
});
