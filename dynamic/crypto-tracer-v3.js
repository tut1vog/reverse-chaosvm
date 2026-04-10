'use strict';

/**
 * crypto-tracer-v3.js — Deep tracer for cipher round arithmetic operations.
 *
 * Task 7.4 Phase A: Identifies which func_XXX correspond to r62[0], r46[0], r90[0],
 * and captures every arithmetic/bitwise operation inside the cipher round (r46[0] = func_204).
 *
 * Strategy:
 *   1. Patch VM dispatch to call __CL3 for ALL opcodes (no PC range filter)
 *   2. When cipher round CALLQ at PC 68860 fires, enter "deep trace" mode
 *   3. In deep trace mode, log every arithmetic/bitwise opcode with register values
 *   4. When execution returns to PC 68865 (post-CALLQ), exit deep trace mode
 *   5. Only trace first MAX_CIPHER_TRACES cipher round calls to keep output small
 *
 * Also captures:
 *   - Entry PCs of the called functions (to identify func_XXX)
 *   - Converter and serializer I/O pairs for verification
 *
 * Output: output/dynamic/crypto-trace-v3.json
 *
 * Usage: node src/dynamic/crypto-tracer-v3.js [--traces <n>]
 */

const puppeteer = require('puppeteer');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const TDC_PATH = path.join(PROJECT_ROOT, 'tdc.js');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output', 'dynamic');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'crypto-trace-v3.json');

// Parse args
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf('--' + name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const FROZEN_TIMESTAMP = parseInt(getArg('timestamp', '1700000000000'), 10);
const FROZEN_RANDOM = parseFloat(getArg('random', '0.42'));
const FROZEN_PERF_NOW = parseFloat(getArg('perfnow', '100.5'));
const MAX_CIPHER_TRACES = parseInt(getArg('traces', '3'), 10);

// Ensure output directory
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const tdcSourceRaw = fs.readFileSync(TDC_PATH, 'utf-8');

// ═══════════════════════════════════════════════════════════════════════
// Arithmetic/bitwise opcode IDs (from OPCODE_REFERENCE.md)
// ═══════════════════════════════════════════════════════════════════════

const ARITH_OPS = {
  0: 'ADD',      // R(a) = R(b) + R(c)
  2: 'DIV',      // R(a) = R(b) / R(c)
  3: 'XOR',      // R(a) = R(b) ^ R(c)
  4: 'MUL',      // R(a) = R(b) * R(c)
  6: 'SHR_K',    // R(a) = R(b) >> K(c)
  8: 'AND_K',    // R(a) = R(b) & K(c)
  27: 'USHR_K',  // R(a) = R(b) >>> K(c)
  32: 'SUB',     // R(a) = R(b) - R(c)
  35: 'OR_K',    // R(a) = R(b) | K(c)
  39: 'MOD',     // R(a) = R(b) % R(c)
  44: 'SUB_K',   // R(a) = R(b) - K(c)
  48: 'SHL_K',   // R(a) = R(b) << K(c)
  51: 'SHR',     // R(a) = R(b) >> R(c)
  53: 'NEG',     // R(a) = -R(b)
  58: 'OR',      // R(a) = R(b) | R(c)
  79: 'RSUB_K',  // R(a) = K(b) - R(c)
  82: 'SHL',     // R(a) = R(b) << R(c)
  92: 'ADD_K',   // R(a) = R(b) + K(c)
};

// Also track compare/control flow for understanding loop structure
const COMPARE_OPS = {
  13: 'GT',      // R(a) = R(b) > R(c)
  28: 'LT',      // R(a) = R(b) < R(c)
  49: 'LT_K',    // R(a) = R(b) < K(c)
  78: 'EQ_K',    // R(a) = R(b) == K(c)
  89: 'EQ',      // R(a) = R(b) == R(c)
};

const CONTROL_OPS = {
  38: 'JMP',     // C += K(a)
  87: 'CJMP',    // C += R(a) ? K(b) : K(c)
};

const LOAD_OPS = {
  45: 'PROP_GET_K',  // R(a) = R(b)[K(c)]
  47: 'LOAD_K',      // R(a) = K(b)
  17: 'PROP_GET',    // R(a) = R(b)[R(c)]
  73: 'MOV',         // R(a) = R(b)
  80: 'MOV_2',       // R(a) = R(b); R(c) = R(d)
};

// ═══════════════════════════════════════════════════════════════════════
// VM Source Patching
// ═══════════════════════════════════════════════════════════════════════

/**
 * Patch the dispatch loop to call __CL3 for ALL opcodes when tracing is active,
 * and for specific PCs when not (to detect cipher round entry/exit).
 */
function patchTdcSource(source) {
  const target = 'switch (Y[++C])';
  const idx = source.indexOf(target);
  if (idx < 0) {
    throw new Error('Could not find dispatch switch in tdc.js');
  }

  // Call __CL3 for:
  // 1. Inner loop region (68855-68870) — always, to detect cipher CALLQ entry/exit
  // 2. ALL opcodes when __CIPHER_TRACE is true — to capture cipher round internals
  // 3. Func entry PCs — to identify which func_XXX is being called
  const replacement = [
    'var _xop=Y[++C];',
    'if(window.__CL3&&(window.__CIPHER_TRACE||',
    '(C>=68805&&C<=68895)||',  // Inner loop region (converter/cipher/serializer calls)
    'C===50162||C===34415||C===35472)){',  // func_204, func_136, func_140 entry PCs
    'window.__CL3(C,_xop,i,Y);}',
    'switch(_xop)'
  ].join('');

  return source.substring(0, idx) + replacement + source.substring(idx + target.length);
}

// ═══════════════════════════════════════════════════════════════════════
// Browser Instrumentation Code
// ═══════════════════════════════════════════════════════════════════════

function buildInstrumentCode(frozenTs, frozenRandom, frozenPerfNow, maxTraces) {
  const arithOpsJSON = JSON.stringify(ARITH_OPS);
  const compareOpsJSON = JSON.stringify(COMPARE_OPS);
  const controlOpsJSON = JSON.stringify(CONTROL_OPS);
  const loadOpsJSON = JSON.stringify(LOAD_OPS);

  return `(function() {
  'use strict';

  // ══════════════════════════════════════════════════════════
  // SECTION 1: Freeze non-deterministic values (same as v2)
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

  // TDC Date helpers
  window._ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF = function() {
    return new OrigDate(FROZEN_TS);
  };
  window._fUEknVNjDgPBHgEDnYfdUdiiEgRkdemO = function(a, b) {
    if (a === 'now') return FROZEN_TS;
    return OrigDate[a].apply(OrigDate, b);
  };

  // ══════════════════════════════════════════════════════════
  // SECTION 2: Deep trace storage
  // ══════════════════════════════════════════════════════════

  var ARITH_OPS = ${arithOpsJSON};
  var COMPARE_OPS = ${compareOpsJSON};
  var CONTROL_OPS = ${controlOpsJSON};
  var LOAD_OPS = ${loadOpsJSON};

  var MAX_CIPHER_TRACES = ${maxTraces};

  window.__CIPHER_TRACE = false;

  window.__DEEP_TRACE = {
    frozenTimestamp: FROZEN_TS,

    // Function identification
    funcEntryPCs: {},        // maps entry PC → count (to identify which functions are called)
    cipherRoundFuncId: null, // which func_XXX
    converterFuncId: null,
    serializerFuncId: null,

    // Cipher round deep traces
    cipherRoundOps: [],      // array of per-call traces
    _currentCipherOps: null, // current cipher round operation log
    _cipherTraceCount: 0,

    // Converter and serializer I/O (for verification)
    converterIO: [],
    serializerIO: [],

    // Converter and serializer op traces (first call each)
    converterOps: null,
    serializerOps: null,
    _tracingConverter: false,
    _tracingSerializer: false,

    // Inner loop iteration tracking
    innerLoopCount: 0,

    errors: []
  };

  var trace = window.__DEEP_TRACE;

  // ══════════════════════════════════════════════════════════
  // SECTION 3: Opcode logging helpers
  // ══════════════════════════════════════════════════════════

  /**
   * Log an arithmetic/bitwise operation.
   * Format: { pc, op, mnemonic, regs: [dest, src1, src2], vals: [result, a, b] }
   * For K-suffix ops, b is the constant from bytecode.
   */
  function logArithOp(ops, C, opcode, mnemonic, i, Y) {
    var a = Y[C + 1]; // dest register
    var b = Y[C + 2]; // source 1
    var c = Y[C + 3]; // source 2 (register or constant)

    var entry = { pc: C, op: opcode, mn: mnemonic };

    // Distinguish K-suffix (constant) vs register for source 2
    var isKOp = mnemonic.indexOf('_K') >= 0;

    if (mnemonic === 'NEG') {
      // R(a) = -R(b)
      entry.dst = a;
      entry.src = [b];
      entry.srcVal = [i[b]];
    } else if (isKOp) {
      // R(a) = R(b) OP K(c) — c is a constant from bytecode
      entry.dst = a;
      entry.src = [b, 'K' + c];
      entry.srcVal = [i[b], c];
    } else if (mnemonic === 'RSUB_K') {
      // R(a) = K(b) - R(c) — b is constant, c is register
      entry.dst = a;
      entry.src = ['K' + b, c];
      entry.srcVal = [b, i[c]];
    } else {
      // R(a) = R(b) OP R(c) — both registers
      entry.dst = a;
      entry.src = [b, c];
      entry.srcVal = [i[b], i[c]];
    }

    ops.push(entry);
  }

  function logCompareOp(ops, C, opcode, mnemonic, i, Y) {
    var a = Y[C + 1];
    var b = Y[C + 2];
    var c = Y[C + 3];
    var isKOp = mnemonic.indexOf('_K') >= 0;
    var entry = { pc: C, op: opcode, mn: mnemonic, dst: a };
    if (isKOp) {
      entry.src = [b, 'K' + c];
      entry.srcVal = [i[b], c];
    } else {
      entry.src = [b, c];
      entry.srcVal = [i[b], i[c]];
    }
    ops.push(entry);
  }

  function logControlOp(ops, C, opcode, mnemonic, i, Y) {
    if (mnemonic === 'JMP') {
      var offset = Y[C + 1];
      // Decode signed offset (zigzag decoded by VM)
      ops.push({ pc: C, op: opcode, mn: 'JMP', offset: offset, target: C + offset + 1 });
    } else if (mnemonic === 'CJMP') {
      var reg = Y[C + 1];
      var trueOff = Y[C + 2];
      var falseOff = Y[C + 3];
      ops.push({
        pc: C, op: opcode, mn: 'CJMP',
        condReg: reg, condVal: i[reg],
        trueTarget: C + trueOff + 1,
        falseTarget: C + falseOff + 1
      });
    }
  }

  function logLoadOp(ops, C, opcode, mnemonic, i, Y) {
    var a = Y[C + 1];
    if (mnemonic === 'LOAD_K') {
      ops.push({ pc: C, op: opcode, mn: mnemonic, dst: a, val: Y[C + 2] });
    } else if (mnemonic === 'MOV') {
      var b = Y[C + 2];
      ops.push({ pc: C, op: opcode, mn: mnemonic, dst: a, src: b, srcVal: i[b] });
    } else if (mnemonic === 'MOV_2') {
      var b = Y[C + 2];
      var c = Y[C + 3];
      var d = Y[C + 4];
      ops.push({ pc: C, op: opcode, mn: mnemonic, dst1: a, src1: b, srcVal1: i[b], dst2: c, src2: d, srcVal2: i[d] });
    } else if (mnemonic === 'PROP_GET_K') {
      var b = Y[C + 2];
      var k = Y[C + 3];
      var arrVal = i[b];
      var elemVal = (arrVal !== null && arrVal !== undefined) ? arrVal[k] : undefined;
      ops.push({ pc: C, op: opcode, mn: mnemonic, dst: a, arrReg: b, key: k, elemVal: elemVal });
    } else if (mnemonic === 'PROP_GET') {
      var b = Y[C + 2];
      var c = Y[C + 3];
      var arrVal2 = i[b];
      var keyVal = i[c];
      var elemVal2 = (arrVal2 !== null && arrVal2 !== undefined) ? arrVal2[keyVal] : undefined;
      ops.push({ pc: C, op: opcode, mn: mnemonic, dst: a, arrReg: b, keyReg: c, keyVal: keyVal, elemVal: elemVal2 });
    }
  }

  // ══════════════════════════════════════════════════════════
  // SECTION 4: VM dispatch hook
  // ══════════════════════════════════════════════════════════

  /**
   * Called from patched VM dispatch loop.
   * When __CIPHER_TRACE is true, logs ALL opcodes.
   * When false, only fires for specific PCs (inner loop CALLQ sites, func entry PCs).
   */
  window.__CL3 = function(C, _xop, i, Y) {
    try {

      // ── Func entry PC identification ──
      // When we enter a function, the first opcode is at its entry PC.
      // We track these to identify which func_XXX corresponds to r62[0], r46[0], r90[0].
      if (C === 50162 && !trace.cipherRoundFuncId) {
        trace.cipherRoundFuncId = 'func_204';
        trace.funcEntryPCs[50162] = (trace.funcEntryPCs[50162] || 0) + 1;
      }
      if (C === 34415 && !trace.converterFuncId) {
        trace.converterFuncId = 'func_136';
        trace.funcEntryPCs[34415] = (trace.funcEntryPCs[34415] || 0) + 1;
      }
      if (C === 35472 && !trace.serializerFuncId) {
        trace.serializerFuncId = 'func_140';
        trace.funcEntryPCs[35472] = (trace.funcEntryPCs[35472] || 0) + 1;
      }

      // ── Converter tracing (first call only) ──
      if (C === 34415 && trace.converterOps === null) {
        trace._tracingConverter = true;
        trace.converterOps = [];
      }
      if (trace._tracingConverter && C !== 34415) {
        var cMn = ARITH_OPS[_xop] || COMPARE_OPS[_xop] || CONTROL_OPS[_xop] || LOAD_OPS[_xop];
        if (cMn) {
          if (ARITH_OPS[_xop]) logArithOp(trace.converterOps, C, _xop, cMn, i, Y);
          else if (COMPARE_OPS[_xop]) logCompareOp(trace.converterOps, C, _xop, cMn, i, Y);
          else if (CONTROL_OPS[_xop]) logControlOp(trace.converterOps, C, _xop, cMn, i, Y);
          else if (LOAD_OPS[_xop]) logLoadOp(trace.converterOps, C, _xop, cMn, i, Y);
        }
      }

      // ── Serializer tracing (first call only) ──
      if (C === 35472 && trace.serializerOps === null) {
        trace._tracingSerializer = true;
        trace.serializerOps = [];
      }
      if (trace._tracingSerializer && C !== 35472) {
        var sMn = ARITH_OPS[_xop] || COMPARE_OPS[_xop] || CONTROL_OPS[_xop] || LOAD_OPS[_xop];
        if (sMn) {
          if (ARITH_OPS[_xop]) logArithOp(trace.serializerOps, C, _xop, sMn, i, Y);
          else if (COMPARE_OPS[_xop]) logCompareOp(trace.serializerOps, C, _xop, sMn, i, Y);
          else if (CONTROL_OPS[_xop]) logControlOp(trace.serializerOps, C, _xop, sMn, i, Y);
          else if (LOAD_OPS[_xop]) logLoadOp(trace.serializerOps, C, _xop, sMn, i, Y);
        }
      }

      // ── Inner loop region (PC 68805-68895) — converter/cipher/serializer CALLQ sites ──
      if (C >= 68805 && C <= 68895) {

        // Converter 1 CALLQ at PC 68811
        if (C === 68815) {
          // Post-converter1: capture return value for I/O log
          var conv1Dest = Y[68812]; // dest register of CALLQ
          var conv1Arg = Y[68814]; // arg register
          trace.converterIO.push({
            call: 'converter1',
            iter: trace.innerLoopCount,
            returnVal: i[conv1Dest]
          });
          // Stop converter tracing after first return
          if (trace._tracingConverter) trace._tracingConverter = false;
        }

        // Converter 2 CALLQ at PC 68846
        if (C === 68850) {
          var conv2Dest = Y[68847];
          trace.converterIO.push({
            call: 'converter2',
            iter: trace.innerLoopCount,
            returnVal: i[conv2Dest]
          });
        }

        // Cipher round CALLQ at PC 68860 — ENTER deep trace mode
        if (C === 68860 && _xop === 63) { // 63 = CALLQ_2
          if (trace._cipherTraceCount < MAX_CIPHER_TRACES) {
            // Capture input state: r9 = [word0, word1]
            var r9 = i[9];
            var r92 = i[92];
            trace._currentCipherOps = {
              iteration: trace.innerLoopCount,
              r9Before: Array.isArray(r9) ? [r9[0], r9[1]] : null,
              r92Before: Array.isArray(r92) ? r92.slice(0, 4) : null,
              ops: []
            };
            window.__CIPHER_TRACE = true;
          }
        }

        // Post-cipher round at PC 68865 — EXIT deep trace mode
        if (C === 68865) {
          if (window.__CIPHER_TRACE && trace._currentCipherOps) {
            var r9After = i[9];
            trace._currentCipherOps.r9After = Array.isArray(r9After) ? [r9After[0], r9After[1]] : null;
            trace._currentCipherOps.opCount = trace._currentCipherOps.ops.length;
            trace.cipherRoundOps.push(trace._currentCipherOps);
            trace._currentCipherOps = null;
            trace._cipherTraceCount++;
          }
          window.__CIPHER_TRACE = false;
        }

        // Serializer 1 at PC 68876
        if (C === 68880) {
          var ser1Dest = Y[68877];
          trace.serializerIO.push({
            call: 'serializer1',
            iter: trace.innerLoopCount,
            returnVal: typeof i[ser1Dest] === 'string' ?
              Array.from({length: Math.min(i[ser1Dest].length, 8)}, function(_, j) { return i[ser1Dest].charCodeAt(j); }) : i[ser1Dest]
          });
          if (trace._tracingSerializer) trace._tracingSerializer = false;
        }

        // Serializer 2 at PC 68888
        if (C === 68892) {
          var ser2Dest = Y[68889];
          trace.serializerIO.push({
            call: 'serializer2',
            iter: trace.innerLoopCount,
            returnVal: typeof i[ser2Dest] === 'string' ?
              Array.from({length: Math.min(i[ser2Dest].length, 8)}, function(_, j) { return i[ser2Dest].charCodeAt(j); }) : i[ser2Dest]
          });
          trace.innerLoopCount++;
        }
      }

      // ── Deep cipher trace mode — log all arithmetic/bitwise/compare/control ops ──
      if (window.__CIPHER_TRACE && trace._currentCipherOps && C !== 68860) {
        var ops = trace._currentCipherOps.ops;
        var mn;

        mn = ARITH_OPS[_xop];
        if (mn) { logArithOp(ops, C, _xop, mn, i, Y); return; }

        mn = COMPARE_OPS[_xop];
        if (mn) { logCompareOp(ops, C, _xop, mn, i, Y); return; }

        mn = CONTROL_OPS[_xop];
        if (mn) { logControlOp(ops, C, _xop, mn, i, Y); return; }

        mn = LOAD_OPS[_xop];
        if (mn) { logLoadOp(ops, C, _xop, mn, i, Y); return; }

        // Also log PROP_SET_K (59) for r62[0]=... and r62[1]=... to see final writes
        if (_xop === 59) {
          var psA = Y[C + 1];
          var psK = Y[C + 2];
          var psV = Y[C + 3];
          ops.push({ pc: C, op: 59, mn: 'PROP_SET_K', arrReg: psA, key: psK, valReg: psV, val: i[psV] });
          return;
        }

        // Log RET opcodes to see function exits
        if (_xop === 60) { // RET_BARE
          ops.push({ pc: C, op: 60, mn: 'RET_BARE', reg: Y[C + 1], val: i[Y[C + 1]] });
          return;
        }
        if (_xop === 7) { // RET_CLEANUP
          ops.push({ pc: C, op: 7, mn: 'RET_CLEANUP' });
          return;
        }
        if (_xop === 24) { // RET
          ops.push({ pc: C, op: 24, mn: 'RET' });
          return;
        }

        // Log NOT (68) for condition checks
        if (_xop === 68) {
          var nA = Y[C + 1];
          var nB = Y[C + 2];
          ops.push({ pc: C, op: 68, mn: 'NOT', dst: nA, src: nB, srcVal: i[nB] });
          return;
        }

        // Log PROP_GET_K_2 (86)
        if (_xop === 86) {
          ops.push({ pc: C, op: 86, mn: 'PROP_GET_K_2', note: 'unpack' });
          return;
        }
      }

    } catch(e) {
      trace.errors.push({ pc: C, op: _xop, error: String(e), stack: e.stack ? e.stack.substring(0, 200) : '' });
    }
  };

})();`;
}

// ═══════════════════════════════════════════════════════════════════════
// HTML Builder
// ═══════════════════════════════════════════════════════════════════════

function buildHTML(frozenTs, frozenRandom, frozenPerfNow) {
  const instrumentCode = buildInstrumentCode(frozenTs, frozenRandom, frozenPerfNow, MAX_CIPHER_TRACES);
  const patchedSource = patchTdcSource(tdcSourceRaw);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>TDC Crypto Tracer v3</title>
</head>
<body>
  <canvas id="c" width="200" height="50"></canvas>
  <script>
    // Crypto tracer v3 instrumentation
    ${instrumentCode}
  </script>
  <script>
    // TDC VM (patched — all-opcode tracing when cipher trace mode active)
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

  console.log('[crypto-tracer-v3] Loading page on port', port);
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

  console.log('[crypto-tracer-v3] TDC ready. Waiting for collectors...');
  await new Promise(r => setTimeout(r, 5000));

  // Call setData
  await page.evaluate(() => {
    window.TDC.setData({
      appid: '2090803262',
      nonce: '0.12345678',
      token: 'test_token_123'
    });
  });

  console.log('[crypto-tracer-v3] setData() called. Running getData()...');

  // Single getData() call
  const token = await page.evaluate(() => {
    try {
      return window.TDC.getData();
    } catch (e) {
      return 'ERROR: ' + e.message;
    }
  });

  console.log('[crypto-tracer-v3] Token length:', token ? token.length : 0);

  // Retrieve trace
  const traceData = await page.evaluate(() => {
    var t = window.__DEEP_TRACE;
    delete t._currentCipherOps;
    delete t._cipherTraceCount;
    delete t._tracingConverter;
    delete t._tracingSerializer;
    return JSON.parse(JSON.stringify(t));
  });

  traceData.token = token;
  traceData.pageErrors = pageErrors;

  await browser.close();
  server.close();

  return traceData;
}

// ═══════════════════════════════════════════════════════════════════════
// Analysis
// ═══════════════════════════════════════════════════════════════════════

function analyzeTrace(traceData) {
  console.log('\n[crypto-tracer-v3] ═══ Function Identification ═══');
  console.log('  Cipher round: ', traceData.cipherRoundFuncId || 'NOT FOUND');
  console.log('  Converter:    ', traceData.converterFuncId || 'NOT FOUND');
  console.log('  Serializer:   ', traceData.serializerFuncId || 'NOT FOUND');

  console.log('\n[crypto-tracer-v3] ═══ Cipher Round Deep Traces ═══');
  console.log('  Traced calls:', traceData.cipherRoundOps.length);

  for (let idx = 0; idx < traceData.cipherRoundOps.length; idx++) {
    const cr = traceData.cipherRoundOps[idx];
    console.log('\n  ── Cipher round #' + idx + ' (iteration ' + cr.iteration + ') ──');
    console.log('    r9 before:', JSON.stringify(cr.r9Before));
    console.log('    r9 after: ', JSON.stringify(cr.r9After));
    console.log('    Total ops:', cr.opCount);

    // Count ops by type
    const opCounts = {};
    for (const op of cr.ops) {
      opCounts[op.mn] = (opCounts[op.mn] || 0) + 1;
    }
    console.log('    Op breakdown:', JSON.stringify(opCounts));

    // Show first 20 arithmetic ops
    const arithOps = cr.ops.filter(op =>
      ARITH_OPS[op.op] || COMPARE_OPS[op.op] || CONTROL_OPS[op.op]
    );
    console.log('    Arith/compare/ctrl ops:', arithOps.length);
    if (idx === 0) {
      console.log('    Full op sequence (first call):');
      for (const op of cr.ops) {
        if (op.mn === 'PROP_GET_K' || op.mn === 'PROP_GET') {
          console.log('      [' + op.pc + '] ' + op.mn + ' r' + op.dst + ' = ' +
            (op.arrReg !== undefined ? 'r' + op.arrReg : '') + '[' + (op.key !== undefined ? op.key : 'r' + op.keyReg + '=' + op.keyVal) + '] = ' + op.elemVal);
        } else if (op.srcVal !== undefined && op.src && Array.isArray(op.src)) {
          console.log('      [' + op.pc + '] ' + op.mn + ' r' + op.dst + ' = ' +
            op.src.map(function(s, i) { return (typeof s === 'string' ? s : 'r' + s) + '(' + op.srcVal[i] + ')'; }).join(' op '));
        } else if (op.srcVal !== undefined) {
          console.log('      [' + op.pc + '] ' + op.mn + ' r' + op.dst + ' srcVal=' + JSON.stringify(op.srcVal));
        } else if (op.mn === 'LOAD_K') {
          console.log('      [' + op.pc + '] LOAD_K r' + op.dst + ' = ' + op.val);
        } else if (op.mn === 'MOV') {
          console.log('      [' + op.pc + '] MOV r' + op.dst + ' = r' + op.src + '(' + op.srcVal + ')');
        } else if (op.mn === 'MOV_2') {
          console.log('      [' + op.pc + '] MOV_2 r' + op.dst1 + '=r' + op.src1 + '(' + op.srcVal1 + ') r' + op.dst2 + '=r' + op.src2 + '(' + op.srcVal2 + ')');
        } else if (op.mn === 'JMP') {
          console.log('      [' + op.pc + '] JMP → ' + op.target);
        } else if (op.mn === 'CJMP') {
          console.log('      [' + op.pc + '] CJMP r' + op.condReg + '(' + op.condVal + ') → T:' + op.trueTarget + ' F:' + op.falseTarget);
        } else if (op.mn === 'PROP_SET_K') {
          console.log('      [' + op.pc + '] PROP_SET_K r' + op.arrReg + '[' + op.key + '] = r' + op.valReg + '(' + op.val + ')');
        } else if (op.mn === 'NOT') {
          console.log('      [' + op.pc + '] NOT r' + op.dst + ' = !r' + op.src + '(' + op.srcVal + ')');
        } else {
          console.log('      [' + op.pc + ']', JSON.stringify(op));
        }
      }
    }
  }

  // Show converter ops
  if (traceData.converterOps) {
    console.log('\n[crypto-tracer-v3] ═══ Converter (func_136) Ops (first call) ═══');
    console.log('  Total ops:', traceData.converterOps.length);
    for (const op of traceData.converterOps) {
      console.log('    [' + op.pc + ']', op.mn, JSON.stringify(op.srcVal || op.val || ''));
    }
  }

  // Show serializer ops
  if (traceData.serializerOps) {
    console.log('\n[crypto-tracer-v3] ═══ Serializer (func_140) Ops (first call) ═══');
    console.log('  Total ops:', traceData.serializerOps.length);
    for (const op of traceData.serializerOps) {
      console.log('    [' + op.pc + ']', op.mn, JSON.stringify(op.srcVal || op.val || ''));
    }
  }

  // Show converter/serializer I/O
  console.log('\n[crypto-tracer-v3] ═══ Converter I/O (first 6) ═══');
  for (let i = 0; i < Math.min(6, traceData.converterIO.length); i++) {
    const io = traceData.converterIO[i];
    console.log('  ' + io.call + ' iter=' + io.iter + ': → ' + io.returnVal);
  }

  console.log('\n[crypto-tracer-v3] ═══ Serializer I/O (first 6) ═══');
  for (let i = 0; i < Math.min(6, traceData.serializerIO.length); i++) {
    const io = traceData.serializerIO[i];
    console.log('  ' + io.call + ' iter=' + io.iter + ': → ' + JSON.stringify(io.returnVal));
  }

  console.log('\n[crypto-tracer-v3] ═══ Errors ═══');
  console.log('  Trace errors:', traceData.errors.length);
  console.log('  Page errors:', traceData.pageErrors.length);
  if (traceData.errors.length > 0) {
    for (const e of traceData.errors.slice(0, 10)) {
      console.log('  ', e.pc, e.error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('[crypto-tracer-v3] Deep cipher round tracing');
  console.log('[crypto-tracer-v3] Max cipher traces:', MAX_CIPHER_TRACES);
  console.log('[crypto-tracer-v3] Frozen timestamp:', FROZEN_TIMESTAMP);

  const traceData = await runTrace();

  // Write output FIRST (before analysis which might crash)
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(traceData, null, 2));
  console.log('\n[crypto-tracer-v3] Output written to:', OUTPUT_PATH);

  analyzeTrace(traceData);

  // Summary
  console.log('\n[crypto-tracer-v3] ═══ Summary ═══');
  console.log('  Token length:', traceData.token ? traceData.token.length : 0);
  console.log('  Cipher round func: ', traceData.cipherRoundFuncId);
  console.log('  Converter func:    ', traceData.converterFuncId);
  console.log('  Serializer func:   ', traceData.serializerFuncId);
  console.log('  Cipher traces:     ', traceData.cipherRoundOps.length);
  console.log('  Converter I/O:     ', traceData.converterIO.length);
  console.log('  Serializer I/O:    ', traceData.serializerIO.length);
  console.log('  Inner loop iters:  ', traceData.innerLoopCount);
}

main().catch(err => {
  console.error('[crypto-tracer-v3] Fatal error:', err);
  process.exit(1);
});
