'use strict';

/**
 * program-analyzer.js — Analyze decompiled ChaosVM output to classify functions
 * by purpose and produce annotated source with descriptive comments.
 *
 * This is a heuristic classifier that examines function bodies for telltale
 * strings, API patterns, and structural patterns to determine what each
 * function does in Tencent's TDC (Tencent Defense Captcha) fingerprinting library.
 *
 * Classification strategy (priority order):
 *   1. String-based: known fingerprinting/API strings in function body
 *   2. API-pattern: __global["X"] accesses revealing purpose
 *   3. Structural: delegation patterns, exports pattern, collector modules
 *   4. Parent-child: inherit category from parent if applicable
 */

// ── Category definitions ────────────────────────────────────────────

const CATEGORIES = [
  'fingerprint',
  'crypto',
  'dom',
  'network',
  'utility',
  'data-collection',
  'string-ops',
  'math',
  'control-flow',
  'module-system',
  'unknown',
];

// ── String-based classification rules ───────────────────────────────
// Each rule: { strings: [...], category, subcategory, description }
// Matched if ANY of the strings appear in the function body.

const STRING_RULES = [
  // Fingerprint: Canvas
  {
    strings: ['toDataURL', 'fillRect', 'fillText', '2d', 'ClientJS,org <canvas>'],
    category: 'fingerprint',
    subcategory: 'canvas',
    description: 'Canvas fingerprinting',
  },
  // Fingerprint: WebGL
  {
    strings: ['WEBGL_debug_renderer_info', 'UNMASKED_VENDOR_WEBGL', 'UNMASKED_RENDERER_WEBGL', 'webgl2', 'experimental-webgl'],
    category: 'fingerprint',
    subcategory: 'webgl',
    description: 'WebGL fingerprinting',
  },
  // Fingerprint: Audio
  {
    strings: ['AudioContext', 'webkitAudioContext', 'OscillatorNode', 'AnalyserNode', 'frequencyBinCount', 'createOscillator', 'createAnalyser', 'createDynamicsCompressor', 'OfflineAudioContext'],
    category: 'fingerprint',
    subcategory: 'audio',
    description: 'Audio fingerprinting',
  },
  // Fingerprint: Browser/Navigator
  {
    strings: ['userAgent', 'appVersion', 'appName', 'appCodeName', 'platform', 'plugins', 'mimeTypes'],
    category: 'fingerprint',
    subcategory: 'browser',
    description: 'Browser/navigator fingerprinting',
  },
  // Fingerprint: Screen
  {
    strings: ['devicePixelRatio', 'colorDepth', 'screenX', 'screenY', 'availWidth', 'availHeight'],
    category: 'fingerprint',
    subcategory: 'screen',
    description: 'Screen property fingerprinting',
  },
  // Fingerprint: Font
  {
    strings: ['fontFamily', 'getComputedStyle'],
    category: 'fingerprint',
    subcategory: 'font',
    description: 'Font fingerprinting',
  },
  // Fingerprint: Touch
  {
    strings: ['touchstart', 'touchmove', 'touchend', 'radiusX', 'radiusY', 'changedTouches', 'TouchEvent'],
    category: 'fingerprint',
    subcategory: 'touch',
    description: 'Touch capability fingerprinting',
  },
  // Fingerprint: Media/Stream
  {
    strings: ['captureStream', 'webkitCaptureStream', 'mozCaptureStream', 'msCaptureStream', 'MediaStream'],
    category: 'fingerprint',
    subcategory: 'media',
    description: 'Media stream fingerprinting',
  },
  // Fingerprint: Battery
  {
    strings: ['getBattery', 'charging', 'chargingTime', 'dischargingTime', 'battery'],
    category: 'fingerprint',
    subcategory: 'battery',
    description: 'Battery status fingerprinting',
  },
  // Fingerprint: WebRTC
  {
    strings: ['RTCPeerConnection', 'webkitRTCPeerConnection', 'mozRTCPeerConnection', 'createDataChannel', 'createOffer'],
    category: 'fingerprint',
    subcategory: 'webrtc',
    description: 'WebRTC fingerprinting',
  },
  // Fingerprint: Connection/Network info
  {
    strings: ['connection', 'mozConnection', 'webkitConnection', 'effectiveType', 'downlink'],
    category: 'fingerprint',
    subcategory: 'connection',
    description: 'Network connection fingerprinting',
  },
  // Fingerprint: Timezone
  {
    strings: ['getTimezoneOffset', 'DateTimeFormat', 'timeZone', 'Intl'],
    category: 'fingerprint',
    subcategory: 'timezone',
    description: 'Timezone fingerprinting',
  },
  // Fingerprint: Language
  {
    strings: ['language', 'languages', 'systemLanguage', 'userLanguage', 'browserLanguage'],
    category: 'fingerprint',
    subcategory: 'language',
    description: 'Language fingerprinting',
  },
  // Fingerprint: Do Not Track
  {
    strings: ['doNotTrack', 'msDoNotTrack'],
    category: 'fingerprint',
    subcategory: 'privacy',
    description: 'Do Not Track detection',
  },
  // Fingerprint: Hardware concurrency
  {
    strings: ['hardwareConcurrency', 'deviceMemory'],
    category: 'fingerprint',
    subcategory: 'hardware',
    description: 'Hardware capability fingerprinting',
  },
  // Fingerprint: Storage
  {
    strings: ['indexedDB', 'openDatabase', 'webkitRequestFileSystem'],
    category: 'fingerprint',
    subcategory: 'storage',
    description: 'Storage capability fingerprinting',
  },
  // Fingerprint: CSS/media queries
  {
    strings: ['matchMedia', 'orientation'],
    category: 'fingerprint',
    subcategory: 'css',
    description: 'CSS media query fingerprinting',
  },
  // Fingerprint: Adblock
  {
    strings: ['adblock', 'AdBlock', 'blockadblock', 'pagead2', 'adsbox'],
    category: 'fingerprint',
    subcategory: 'adblock',
    description: 'Ad blocker detection',
  },
  // Fingerprint: WebRTC SDP/candidate (these appear in WebRTC fingerprinting)
  {
    strings: ['candidate', 'sdp', 'a=candidate:'],
    category: 'fingerprint',
    subcategory: 'webrtc',
    description: 'WebRTC SDP/candidate fingerprinting',
  },
  // Fingerprint: GPU/WebGPU
  {
    strings: ['requestAdapter', 'gpu'],
    category: 'fingerprint',
    subcategory: 'gpu',
    description: 'WebGPU fingerprinting',
  },
  // Utility: ES6 features / polyfills
  {
    strings: ['Symbol', 'iterator', '__esModule'],
    category: 'utility',
    subcategory: 'polyfill',
    description: 'ES6 polyfill/utility',
  },
  // Utility: type checking
  {
    strings: ['toString', '[object '],
    category: 'utility',
    subcategory: 'type-check',
    description: 'Type checking utility',
  },
  // Data collection: cookies/storage
  {
    strings: ['localStorage', 'sessionStorage', 'cookie', 'setItem', 'getItem'],
    category: 'data-collection',
    subcategory: 'storage',
    description: 'Cookie/storage data collection',
  },
  // Network
  {
    strings: ['XMLHttpRequest', 'fetch', 'send', 'POST', 'GET', 'onreadystatechange', 'readyState', 'responseText'],
    category: 'network',
    subcategory: 'xhr',
    description: 'Network request',
  },
  // DOM manipulation
  {
    strings: ['createElement', 'appendChild', 'removeChild', 'innerHTML', 'getElementById', 'getElementsByTagName', 'querySelector'],
    category: 'dom',
    subcategory: 'manipulation',
    description: 'DOM manipulation',
  },
  // Crypto
  {
    strings: ['CryptoKey', 'subtle', 'digest', 'encrypt', 'decrypt'],
    category: 'crypto',
    subcategory: 'webcrypto',
    description: 'Web Crypto API',
  },
  // Module system — only match when 'exports' appears with defineProperty or as sole purpose
  {
    strings: ['defineProperty', '__esModule'],
    category: 'module-system',
    subcategory: 'exports',
    description: 'Module exports setup',
  },
  // String operations — only distinctive string-op patterns
  {
    strings: ['charCodeAt', 'fromCharCode', 'substring'],
    category: 'string-ops',
    subcategory: 'manipulation',
    description: 'String manipulation',
  },
  // Math — only match Math object access, not generic 'floor'/'round'
  {
    strings: ['Math'],
    category: 'math',
    subcategory: 'computation',
    description: 'Mathematical computation',
  },
  // Utility — encoding functions
  {
    strings: ['encodeURIComponent', 'decodeURIComponent', 'btoa', 'atob'],
    category: 'utility',
    subcategory: 'encoding',
    description: 'Encoding/utility function',
  },
  // Utility — JSON
  {
    strings: ['JSON'],
    category: 'utility',
    subcategory: 'json',
    description: 'JSON serialization/parsing',
  },
  // Utility — RegExp
  {
    strings: ['RegExp'],
    category: 'utility',
    subcategory: 'regex',
    description: 'Regular expression utility',
  },
];

// Categories ranked by specificity (higher = more specific, wins ties)
const CATEGORY_PRIORITY = {
  'fingerprint': 10,
  'crypto': 9,
  'network': 8,
  'data-collection': 7,
  'dom': 6,
  'math': 5,
  'string-ops': 4,
  'utility': 3,
  'module-system': 2,
  'control-flow': 1,
  'unknown': 0,
};

// ── TDC-specific known identifiers ──────────────────────────────────

const TDC_STRINGS = [
  'TDC', 'tdc', 'TDC_itoken', 'TCaptchaSid', 'TCaptchaIframeClientPos',
  'ChallengeEncrypt', 'captcha.gtimg.com', 'FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk',
  '_ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF',
];

// ── Helper: extract function bodies from code ───────────────────────

/**
 * Count brace depth change for a line, skipping braces inside string literals.
 * Handles double-quoted strings with escaped characters.
 */
function countBraces(line) {
  let delta = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (ch === "'" && !inString) {
      // Skip single-quoted strings too
      let j = i + 1;
      while (j < line.length && line[j] !== "'") {
        if (line[j] === '\\') j++;
        j++;
      }
      i = j; // skip past closing quote
      continue;
    }
    if (!inString) {
      if (ch === '{') delta++;
      else if (ch === '}') delta--;
    }
  }
  return delta;
}

/**
 * Split decompiled code into individual function bodies.
 * Returns Map<number, {name: string, body: string, startLine: number, endLine: number}>
 */
function extractFunctionBodies(code) {
  const lines = code.split('\n');
  const functions = new Map();
  const funcStartRegex = /^function (func_(\d+))\s*\(/;

  let currentFunc = null;
  let braceDepth = 0;
  let funcLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(funcStartRegex);

    if (match && braceDepth === 0) {
      // Save previous function if exists
      if (currentFunc) {
        functions.set(currentFunc.id, {
          name: currentFunc.name,
          body: funcLines.join('\n'),
          startLine: currentFunc.startLine,
          endLine: i,
        });
      }

      currentFunc = {
        name: match[1],
        id: parseInt(match[2], 10),
        startLine: i + 1, // 1-indexed
      };
      funcLines = [line];
      braceDepth = 0;

      // Count braces on this line (skip string interiors)
      braceDepth += countBraces(line);
    } else if (currentFunc) {
      funcLines.push(line);
      braceDepth += countBraces(line);

      if (braceDepth === 0) {
        functions.set(currentFunc.id, {
          name: currentFunc.name,
          body: funcLines.join('\n'),
          startLine: currentFunc.startLine,
          endLine: i + 1,
        });
        currentFunc = null;
        funcLines = [];
      }
    }
  }

  // Handle last function if file doesn't end cleanly
  if (currentFunc) {
    functions.set(currentFunc.id, {
      name: currentFunc.name,
      body: funcLines.join('\n'),
      startLine: currentFunc.startLine,
      endLine: lines.length,
    });
  }

  return functions;
}

// ── Helper: extract collector functions from func_0 ─────────────────

/**
 * Parse func_0 to find the r8[0..79] collector function array.
 * Returns Set<number> of function IDs that are collector modules.
 */
function extractCollectorFunctions(func0Body) {
  const collectors = new Set();
  if (!func0Body) return collectors;

  const regex = /r8\[\d+\]\s*=\s*func_(\d+)/g;
  let m;
  while ((m = regex.exec(func0Body)) !== null) {
    collectors.add(parseInt(m[1], 10));
  }
  return collectors;
}

// ── Helper: find function references inside a body ──────────────────

/**
 * Find all func_N references inside a function body (excluding the declaration).
 */
function findFuncRefs(body) {
  const refs = new Set();
  // Skip the function declaration line itself
  const bodyWithoutDecl = body.replace(/^function func_\d+[^{]*\{/, '');
  const regex = /func_(\d+)/g;
  let m;
  while ((m = regex.exec(bodyWithoutDecl)) !== null) {
    refs.add(parseInt(m[1], 10));
  }
  return refs;
}

// ── Helper: find __global["X"] accesses ─────────────────────────────

function findGlobalAccesses(body) {
  const accesses = new Set();
  // __global["X"] or __global[varName] where varName was set to "X"
  const regex1 = /__global\["([^"]+)"\]/g;
  const regex2 = /__global\[(\w+)\]/g;
  const regex3 = /__global\.(\w+)/g;
  let m;
  while ((m = regex1.exec(body)) !== null) accesses.add(m[1]);
  while ((m = regex3.exec(body)) !== null) accesses.add(m[1]);
  return accesses;
}

// ── Helper: find string literals in body ────────────────────────────

function findStringLiterals(body) {
  const strings = new Set();
  const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let m;
  while ((m = regex.exec(body)) !== null) {
    strings.add(m[1]);
  }
  return strings;
}

// ── Helper: find method calls in body ───────────────────────────────

function findMethodCalls(body) {
  const methods = new Set();
  // .methodName( patterns
  const regex = /\.(\w+)\s*\(/g;
  let m;
  while ((m = regex.exec(body)) !== null) {
    methods.add(m[1]);
  }
  // ["methodName"] patterns
  const regex2 = /\["(\w+)"\]/g;
  while ((m = regex2.exec(body)) !== null) {
    methods.add(m[1]);
  }
  return methods;
}

// ── Main classification engine ──────────────────────────────────────

/**
 * Classify a single function based on its body content.
 *
 * @param {string} body - The function's source code
 * @param {number} id - The function ID
 * @param {Object} options - Additional context
 * @returns {Object} Classification result
 */
function classifyFunction(body, id, options) {
  const { collectorFuncs, funcTable } = options;

  const stringLiterals = findStringLiterals(body);
  const methodCalls = findMethodCalls(body);
  const globalAccesses = findGlobalAccesses(body);
  const funcRefs = findFuncRefs(body);
  const allTokens = new Set([...stringLiterals, ...methodCalls, ...globalAccesses]);

  // Collect all matching rules
  const matches = [];

  for (const rule of STRING_RULES) {
    const matched = rule.strings.filter(s => {
      // Check exact match in string literals, method calls, and global accesses
      if (allTokens.has(s)) return true;
      // Check if the string appears as a substring in the raw body
      // but only for distinctive strings (length >= 6) to avoid false positives
      if (s.length >= 6 && body.includes(s)) return true;
      // Check if any token exactly matches or contains the rule string
      // (for cases like __global["navigator"] matching "navigator")
      if (s.length >= 4) {
        for (const token of allTokens) {
          if (token === s) return true;
        }
      }
      return false;
    });
    if (matched.length > 0) {
      matches.push({
        ...rule,
        matchCount: matched.length,
        matchedStrings: matched,
      });
    }
  }

  // Sort matches by priority (more specific categories win) and match count
  matches.sort((a, b) => {
    const priDiff = (CATEGORY_PRIORITY[b.category] || 0) - (CATEGORY_PRIORITY[a.category] || 0);
    if (priDiff !== 0) return priDiff;
    return b.matchCount - a.matchCount;
  });

  // Check for TDC-specific strings
  const hasTDCStrings = TDC_STRINGS.some(s => body.includes(s));

  // Determine category
  let category = 'unknown';
  let subcategory = null;
  let description = '';
  let confidence = 0;

  if (matches.length > 0) {
    const best = matches[0];

    // If we have fingerprint + module-system, fingerprint wins
    // If we only have module-system or string-ops with very generic matches, be cautious
    if (best.category === 'module-system' && matches.length > 1) {
      // Check if there's a more specific category
      const nonModule = matches.find(m => m.category !== 'module-system');
      if (nonModule && CATEGORY_PRIORITY[nonModule.category] > CATEGORY_PRIORITY['module-system']) {
        category = nonModule.category;
        subcategory = nonModule.subcategory;
        description = nonModule.description;
        confidence = Math.min(0.9, 0.5 + nonModule.matchCount * 0.1);
      } else {
        category = best.category;
        subcategory = best.subcategory;
        description = best.description;
        confidence = Math.min(0.9, 0.4 + best.matchCount * 0.1);
      }
    } else {
      category = best.category;
      subcategory = best.subcategory;
      description = best.description;
      confidence = Math.min(0.95, 0.5 + best.matchCount * 0.15);
    }
  }

  // Structural checks
  const bodyLines = body.split('\n').filter(l => l.trim() && !l.trim().startsWith('//'));

  // Module exports pattern: function that sets up exports with a getter
  // Pattern: `r[exports] = { get: func_N }` or `r["exports"] = ...`
  const hasExportsAssign = /\["exports"\]\s*=/.test(body) || /\[r\w+\]\s*=.*\bfunc_\d+/.test(body);
  const hasGetProperty = body.includes('"get"') || body.includes('.get');
  if (hasExportsAssign && hasGetProperty && (category === 'unknown' || category === 'string-ops' || category === 'math')) {
    // Check if this is primarily a module wrapper (short body with exports setup)
    if (bodyLines.length <= 15) {
      category = 'module-system';
      description = 'Module exports wrapper';
      confidence = 0.8;
    } else if (category === 'unknown') {
      // Larger function that also sets up exports — classify by content, not exports
      category = 'data-collection';
      description = 'Collector module with exports';
      confidence = 0.6;
    }
  }

  // Collector module: function is in the r8[0..79] array in func_0
  if (collectorFuncs && collectorFuncs.has(id)) {
    if (category === 'module-system') {
      // Collector that exports — it's a data-collection module
      category = 'data-collection';
      description = 'Collector module (exports data)';
      confidence = 0.8;
    } else if (category === 'unknown') {
      category = 'data-collection';
      description = 'Collector module';
      confidence = 0.6;
    }
    // If already classified as fingerprint, keep that (more specific)
  }

  // Pure delegation: very short function that calls or references another func_N
  if (bodyLines.length <= 8 && category === 'unknown') {
    const delegateMatch = body.match(/func_(\d+)/);
    if (delegateMatch) {
      category = 'control-flow';
      description = 'Wrapper/dispatcher';
      confidence = 0.6;
    }
  }

  // Very short function: return constant
  if (bodyLines.length <= 4 && category === 'unknown') {
    if (body.includes('return !0') || body.includes('return !1')) {
      category = 'utility';
      description = 'Boolean constant function';
      confidence = 0.8;
    } else if (body.match(/return\s+\d+/) || body.match(/return\s+"/)) {
      category = 'utility';
      description = 'Constant return function';
      confidence = 0.7;
    } else if (body.includes('return __this_ctx')) {
      category = 'control-flow';
      description = 'No-op / identity function';
      confidence = 0.5;
    }
  }

  // Try/catch wrapper pattern: try { single_call; } catch { ... }
  if (category === 'unknown' && body.includes('try {') && bodyLines.length <= 15) {
    const singleCall = body.match(/func_(\d+)/g);
    if (singleCall && singleCall.length <= 2) {
      category = 'control-flow';
      description = 'Safe wrapper (try/catch)';
      confidence = 0.5;
    }
  }

  // Getter pattern: captures + returns value
  if (category === 'unknown' && body.includes('__captures') && bodyLines.length <= 8) {
    category = 'utility';
    description = 'Closure getter';
    confidence = 0.5;
  }

  // TDC-specific: main init
  if (hasTDCStrings) {
    if (id === 53 || body.includes('"TDC"') || body.includes('"getInfo"') || body.includes('"setData"') || body.includes('"clearTc"')) {
      category = 'data-collection';
      subcategory = 'tdc-init';
      description = 'TDC captcha API initialization';
      confidence = 0.95;
    } else if (category === 'unknown') {
      category = 'data-collection';
      description = 'TDC-related function';
      confidence = 0.6;
    }
  }

  // func_0: entry point
  if (id === 0) {
    category = 'control-flow';
    subcategory = 'entry-point';
    description = 'Main entry point — creates collector array and invokes orchestrator';
    confidence = 1.0;
  }

  // func_164: module orchestrator (webpack-like)
  if (id === 164) {
    category = 'module-system';
    subcategory = 'orchestrator';
    description = 'Module orchestrator — sets up webpack-like module system';
    confidence = 0.95;
  }

  // func_198: module require function (webpack __webpack_require__)
  if (id === 198) {
    category = 'module-system';
    subcategory = 'require';
    description = 'Module require function (webpack-like __webpack_require__)';
    confidence = 0.95;
  }

  // Refine descriptions based on matched strings
  if (category === 'fingerprint' && subcategory) {
    const subcatDescriptions = {
      'canvas': 'Canvas fingerprinting — draws text on canvas, extracts toDataURL hash',
      'webgl': 'WebGL fingerprinting — queries GPU renderer info',
      'audio': 'Audio fingerprinting — uses AudioContext/OscillatorNode',
      'browser': 'Browser fingerprinting — reads navigator properties',
      'screen': 'Screen fingerprinting — reads screen dimensions/pixel ratio',
      'font': 'Font fingerprinting — detects installed fonts via element measurement',
      'touch': 'Touch capability fingerprinting',
      'media': 'Media stream capability detection',
      'battery': 'Battery status fingerprinting',
      'webrtc': 'WebRTC fingerprinting — local IP detection',
      'connection': 'Network connection fingerprinting',
      'timezone': 'Timezone fingerprinting',
      'language': 'Language preference fingerprinting',
      'privacy': 'Do Not Track privacy setting detection',
      'hardware': 'Hardware capability fingerprinting (CPU/memory)',
      'storage': 'Storage capability fingerprinting (IndexedDB/WebSQL)',
      'css': 'CSS media query fingerprinting',
      'adblock': 'Ad blocker detection',
    };
    description = subcatDescriptions[subcategory] || description;
  }

  return {
    id,
    category,
    subcategory,
    description,
    confidence,
    apiCalls: [...globalAccesses],
    stringRefs: [...stringLiterals].slice(0, 20), // limit to avoid bloat
    methodCalls: [...methodCalls].slice(0, 20),
    funcRefs: [...funcRefs],
    matchedRules: matches.map(m => m.subcategory || m.category).slice(0, 5),
  };
}

// ── Parent-child propagation ────────────────────────────────────────

/**
 * For functions still classified as 'unknown', try to inherit category
 * from their parent (the function that creates them via FUNC_CREATE).
 * Also propagate from collector functions to their children.
 */
function propagateParentCategories(results, funcBodies, funcTable) {
  // Build parent → children map from funcTable
  // A function's "parent" is determined by where its FUNC_CREATE occurs
  // We can infer this from which function body references func_N

  // Build child lookup: which function IDs does each function body reference?
  const parentMap = new Map(); // child_id → parent_id
  for (const [parentId, fb] of funcBodies) {
    const refs = findFuncRefs(fb.body);
    for (const childId of refs) {
      // Only set parent if the child isn't already mapped, or if this is a more specific parent
      if (!parentMap.has(childId)) {
        parentMap.set(childId, parentId);
      }
    }
  }

  // Propagate categories
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 5) {
    changed = false;
    iterations++;

    for (const result of results) {
      if (result.category !== 'unknown') continue;

      const parentId = parentMap.get(result.id);
      if (parentId === undefined) continue;

      const parentResult = results.find(r => r.id === parentId);
      if (!parentResult || parentResult.category === 'unknown' || parentResult.category === 'control-flow') continue;

      // Inherit parent category
      result.category = parentResult.category;
      result.subcategory = parentResult.subcategory;
      result.description = 'Child of ' + parentResult.description;
      result.confidence = Math.max(0.3, parentResult.confidence - 0.2);
      changed = true;
    }
  }
}

// ── Main analysis function ──────────────────────────────────────────

/**
 * Analyze all functions in the decompiled output.
 *
 * @param {string} code - The full decompiled-polished.js content
 * @param {Array} stringsJson - Parsed strings.json (not heavily used — strings are in the code)
 * @param {Array} functionsJson - Parsed functions.json
 * @returns {Object} Analysis result
 */
function analyzeFunctions(code, stringsJson, functionsJson) {
  const funcBodies = extractFunctionBodies(code);

  // Get collector functions from func_0
  const func0 = funcBodies.get(0);
  const collectorFuncs = func0 ? extractCollectorFunctions(func0.body) : new Set();

  // Build valid function ID set from functionsJson
  const validFuncIds = new Set(functionsJson.filter(f => f.valid).map(f => f.id));

  // Classify each function
  const results = [];
  for (const [id, fb] of funcBodies) {
    const funcInfo = functionsJson.find(f => f.id === id);
    const classification = classifyFunction(fb.body, id, {
      collectorFuncs,
      funcTable: functionsJson,
    });

    classification.name = fb.name;
    classification.startLine = fb.startLine;
    classification.endLine = fb.endLine;
    classification.lineCount = fb.endLine - fb.startLine + 1;
    classification.arity = funcInfo ? funcInfo.arity : null;
    classification.capturedVars = funcInfo ? funcInfo.capturedVars : [];
    classification.capturedBy = [];

    results.push(classification);
  }

  // Propagate parent categories to unknown children
  propagateParentCategories(results, funcBodies, functionsJson);

  // Build capturedBy references
  for (const r of results) {
    for (const childId of r.funcRefs) {
      const child = results.find(c => c.id === childId);
      if (child && !child.capturedBy.includes(r.id)) {
        child.capturedBy.push(r.id);
      }
    }
  }

  // Compute statistics
  const categoryCounts = {};
  for (const cat of CATEGORIES) categoryCounts[cat] = 0;
  for (const r of results) categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;

  const nonUnknown = results.filter(r => r.category !== 'unknown').length;

  return {
    totalFunctions: results.length,
    categoryCounts,
    nonUnknownCount: nonUnknown,
    collectorCount: collectorFuncs.size,
    functions: results,
  };
}

// ── Annotation generator ────────────────────────────────────────────

/**
 * Produce annotated JS source with comment headers above each function.
 *
 * @param {string} code - The polished decompiled JS
 * @param {Array} analysisResults - Array of per-function classification objects
 * @returns {string} Annotated code
 */
function annotateCode(code, analysisResults) {
  // Build lookup by function name
  const lookup = new Map();
  for (const r of analysisResults) {
    lookup.set(r.name, r);
  }

  const lines = code.split('\n');
  const output = [];
  const funcDeclRegex = /^function (func_\d+)\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(funcDeclRegex);

    if (match) {
      const funcName = match[1];
      const info = lookup.get(funcName);
      if (info) {
        const comment = buildCommentHeader(info);
        output.push(comment);
      }
    }

    output.push(line);
  }

  return output.join('\n');
}

/**
 * Build a single-line or multi-line comment header for a function.
 */
function buildCommentHeader(info) {
  const parts = [info.name + ':'];

  // Category tag
  parts.push('[' + info.category + ']');

  // Description
  if (info.description) {
    parts.push(info.description);
  }

  // Key API calls (compact)
  if (info.apiCalls.length > 0) {
    const apis = info.apiCalls.slice(0, 5).join(', ');
    parts.push('| APIs: ' + apis);
  }

  return '// ' + parts.join(' ');
}

// ── Program summary generator ───────────────────────────────────────

/**
 * Generate a high-level summary of what the entire program does.
 */
function generateSummary(analysisResult) {
  const { totalFunctions, categoryCounts, nonUnknownCount, collectorCount, functions } = analysisResult;

  const lines = [
    '=== TDC (Tencent Defense Captcha) — Program Analysis Summary ===',
    '',
    'This program is Tencent\'s TDC (Tencent Defense Captcha), a browser fingerprinting',
    'library used by Tencent\'s captcha system. It collects extensive device and browser',
    'information to generate a unique fingerprint for bot detection and fraud prevention.',
    '',
    '--- Architecture ---',
    '',
    'The program uses a webpack-like module system:',
    '  - func_0 (entry point) creates an array of 80 collector modules',
    '  - func_164 (orchestrator) sets up the module loader (m, c, d, r, t, n, o, p, s properties)',
    '  - func_198 (__webpack_require__) handles module loading with caching',
    '  - func_53 (TDC init) exposes the public API: TDC.getInfo(), TDC.setData(), TDC.clearTc(), TDC.getData()',
    '',
    '--- Fingerprinting Capabilities ---',
    '',
  ];

  // List fingerprint subcategories found
  const fpFuncs = functions.filter(f => f.category === 'fingerprint');
  const subcats = new Map();
  for (const f of fpFuncs) {
    const sc = f.subcategory || 'general';
    if (!subcats.has(sc)) subcats.set(sc, []);
    subcats.get(sc).push(f.name);
  }

  for (const [sc, funcs] of subcats) {
    lines.push('  - ' + sc + ': ' + funcs.join(', '));
  }

  lines.push('');
  lines.push('--- Data Collection ---');
  lines.push('');

  const dcFuncs = functions.filter(f => f.category === 'data-collection');
  lines.push('  ' + dcFuncs.length + ' data collection functions (including ' + collectorCount + ' collector modules)');

  lines.push('');
  lines.push('--- Function Category Distribution ---');
  lines.push('');

  for (const cat of CATEGORIES) {
    const count = categoryCounts[cat] || 0;
    if (count > 0) {
      const pct = ((count / totalFunctions) * 100).toFixed(1);
      lines.push('  ' + cat.padEnd(20) + count.toString().padStart(4) + '  (' + pct + '%)');
    }
  }

  lines.push('');
  lines.push('--- Coverage ---');
  lines.push('');
  lines.push('  Total functions:     ' + totalFunctions);
  lines.push('  Classified:          ' + nonUnknownCount + '/' + totalFunctions + ' (' + ((nonUnknownCount / totalFunctions) * 100).toFixed(1) + '%)');
  lines.push('  Unknown:             ' + (categoryCounts.unknown || 0));
  lines.push('');
  lines.push('--- Key Identifiers ---');
  lines.push('');
  lines.push('  - "TDC" — The public API namespace (window.TDC)');
  lines.push('  - "FgTaXfOKnXnnZNVNAFlgbmQWHJNVaSBk" — Obfuscated configuration key');
  lines.push('  - "_ZHSgZVHWDjhEmdXclMRcbPbBEVhgAmaF" — Internal namespace identifier');
  lines.push('  - "ClientJS,org <canvas> 1.0" — Borrowed from ClientJS library for canvas fingerprinting');
  lines.push('  - "captcha.gtimg.com" — Tencent captcha service endpoint');
  lines.push('');

  return lines.join('\n');
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  analyzeFunctions,
  annotateCode,
  generateSummary,
  extractFunctionBodies,
  extractCollectorFunctions,
  classifyFunction,
  findStringLiterals,
  findMethodCalls,
  findGlobalAccesses,
  findFuncRefs,
  CATEGORIES,
  STRING_RULES,
  CATEGORY_PRIORITY,
};
