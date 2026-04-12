'use strict';

/**
 * collector-schema.js — Collector Data Schema for TDC fingerprinting
 *
 * Documents and validates the 59 collector fields (cdArray indices 0-58)
 * that form the fingerprint payload in the TDC token.
 *
 * Each entry maps to a webpack module loaded by func_99 (the collector
 * orchestrator). The modules are loaded in a specific order and their
 * results populate the cdArray sequentially.
 *
 * Module loading order in func_99:
 *   modules 8,9,10,11,12,13,14,15,16,17,18,19,21,22,23,24,1,31,33,34,
 *           35,36,37,39,40,41,42,43,44,45,30,46,47,48,49,50,51,54,55,
 *           56,57,58,59,60,61,62,63,64,65,66,67,68,70,71,72,73,74,75,76
 *
 * Exports: COLLECTOR_SCHEMA, validateCollectorData, buildDefaultCdArray
 */

// ═══════════════════════════════════════════════════════════════════════
// Collector Schema — 59 entries (indices 0-58)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Each schema entry:
 *   index       — cdArray position (0-58)
 *   name        — descriptive camelCase identifier
 *   type        — JS type: 'number', 'string', 'array', 'object', 'null'
 *   apiSource   — browser API used to collect this value
 *   description — what the field represents
 *   sampleValue — example value from ground truth trace
 *   required    — whether the field must be present (all 59 are required)
 *   category    — grouping: hardware, browser, screen, fingerprint, timing, etc.
 *   webpackModule — module index in func_0's r8[] array
 *   collectorFunc — decompiled function name
 */
const COLLECTOR_SCHEMA = [
  {
    index: 0,
    name: 'callCounter',
    type: 'number',
    apiSource: 'internal',
    description: 'Incremented call counter — tracks how many times getInfo/getData has been called. First call = 1.',
    sampleValue: 1,
    required: true,
    category: 'internal',
    webpackModule: 8,
    collectorFunc: 'func_235 → func_48'
  },
  {
    index: 1,
    name: 'osPlatform',
    type: 'string',
    apiSource: 'navigator.userAgent',
    description: 'Detected OS platform name derived from UA string. Values: "windows", "macos", "linux", "android", "ios", "unknown".',
    sampleValue: 'linux',
    required: true,
    category: 'browser',
    webpackModule: 9,
    collectorFunc: 'func_125 → func_145'
  },
  {
    index: 2,
    name: 'touchSupport',
    type: 'number',
    apiSource: 'document.createElement("div") → "ontouchstart" in div',
    description: 'Touch capability flag. 1 = ontouchstart exists (touch device), 2 = not present (desktop).',
    sampleValue: 2,
    required: true,
    category: 'hardware',
    webpackModule: 10,
    collectorFunc: 'func_6 → func_179'
  },
  {
    index: 3,
    name: 'viewportWidth',
    type: 'number',
    apiSource: 'window.innerWidth || document.documentElement.clientWidth',
    description: 'Browser viewport width in pixels. Default 800 in headless Chrome.',
    sampleValue: 800,
    required: true,
    category: 'screen',
    webpackModule: 11,
    collectorFunc: 'func_220 → func_214'
  },
  {
    index: 4,
    name: 'detectedFonts',
    type: 'string',
    apiSource: 'DOM font detection (canvas/element measurement)',
    description: 'Comma-separated list of detected fonts from a predefined set of 54 candidates, measured against monospace/sans-serif/serif baselines.',
    sampleValue: 'Arial,Courier New,Times New Roman,Helvetica,Ubuntu,WenQuanYi Zen Hei',
    required: true,
    category: 'fingerprint',
    webpackModule: 12,
    collectorFunc: 'func_264'
  },
  {
    index: 5,
    name: 'flashFonts',
    type: 'string',
    apiSource: 'Flash plugin (deprecated)',
    description: 'Font list from Flash plugin. Empty string in modern browsers where Flash is unavailable.',
    sampleValue: '',
    required: true,
    category: 'fingerprint',
    webpackModule: 13,
    collectorFunc: 'func_190'
  },
  {
    index: 6,
    name: 'languages',
    type: 'array',
    apiSource: 'navigator.languages',
    description: 'Array of preferred languages from navigator.languages. Falls back to [navigator.language].',
    sampleValue: ['en-US'],
    required: true,
    category: 'browser',
    webpackModule: 14,
    collectorFunc: 'func_28'
  },
  {
    index: 7,
    name: 'colorGamutLegacy',
    type: 'string',
    apiSource: 'window.matchMedia("(any-hover: hover)")',
    description: 'Legacy CSS media query result or empty fallback. Possibly deprecated hover detection.',
    sampleValue: '',
    required: true,
    category: 'browser',
    webpackModule: 15,
    collectorFunc: 'func_26'
  },
  {
    index: 8,
    name: 'hardwareConcurrency',
    type: 'number',
    apiSource: 'navigator.hardwareConcurrency',
    description: 'Number of logical CPU cores available to the browser.',
    sampleValue: 8,
    required: true,
    category: 'hardware',
    webpackModule: 16,
    collectorFunc: 'func_122'
  },
  {
    index: 9,
    name: 'screenResolution',
    type: 'array',
    apiSource: 'screen.width, screen.height',
    description: 'Screen resolution as [width, height] array.',
    sampleValue: [1920, 1080],
    required: true,
    category: 'screen',
    webpackModule: 17,
    collectorFunc: 'func_34'
  },
  {
    index: 10,
    name: 'devicePixelRatio',
    type: 'number',
    apiSource: 'window.devicePixelRatio',
    description: 'Device pixel ratio. Typically 1 for standard displays, 2 for retina/HiDPI.',
    sampleValue: 1,
    required: true,
    category: 'screen',
    webpackModule: 18,
    collectorFunc: 'func_46 → func_101'
  },
  {
    index: 11,
    name: 'sessionStorageAvail',
    type: 'number',
    apiSource: 'window.sessionStorage',
    description: 'Session storage availability flag. 0 = available, 1 = unavailable/blocked.',
    sampleValue: 0,
    required: true,
    category: 'browser',
    webpackModule: 19,
    collectorFunc: 'func_94'
  },
  {
    index: 12,
    name: 'videoCodecs',
    type: 'array',
    apiSource: 'HTMLVideoElement.canPlayType()',
    description: 'Array of video codec support objects. Each has {codec, support} where support is "probably", "maybe", or "".',
    sampleValue: [
      { codec: 'H.264', support: 'probably' },
      { codec: 'H.264 High', support: 'probably' },
      { codec: 'H.265/HEVC', support: '' },
      { codec: 'VP8', support: 'probably' },
      { codec: 'VP9', support: 'probably' },
      { codec: 'AV1', support: 'probably' },
      { codec: 'Theora', support: '' },
      { codec: 'MPEG-4', support: '' }
    ],
    required: true,
    category: 'fingerprint',
    webpackModule: 21,
    collectorFunc: 'func_57'
  },
  {
    index: 13,
    name: 'localStorageAvail',
    type: 'number',
    apiSource: 'window.localStorage',
    description: 'Local storage availability flag. 1 = available, 0 = unavailable/blocked.',
    sampleValue: 1,
    required: true,
    category: 'browser',
    webpackModule: 22,
    collectorFunc: 'func_149'
  },
  {
    index: 14,
    name: 'maxTouchPoints',
    type: 'number',
    apiSource: 'navigator.maxTouchPoints',
    description: 'Maximum number of simultaneous touch contact points. 0 on non-touch devices, typically 1-10 on touch devices. 20 is headless Chrome default.',
    sampleValue: 20,
    required: true,
    category: 'hardware',
    webpackModule: 23,
    collectorFunc: 'func_116'
  },
  {
    index: 15,
    name: 'canvasHash',
    type: 'number',
    apiSource: 'HTMLCanvasElement.toDataURL() → custom hash',
    description: 'Canvas fingerprint hash — a 32-bit integer computed from canvas drawing output. Uses ClientJS-style rendering with text, shapes, and gradients.',
    sampleValue: 991783254,
    required: true,
    category: 'fingerprint',
    webpackModule: 24,
    collectorFunc: 'func_22 → func_4'
  },
  {
    index: 16,
    name: 'timestampInit',
    type: 'number',
    apiSource: 'Math.round(Date.now() / 1000)',
    description: 'Unix timestamp (seconds) at initialization time. Used for freshness validation.',
    sampleValue: 1775062183,
    required: true,
    category: 'timing',
    webpackModule: 1,
    collectorFunc: 'func_163'
  },
  {
    index: 17,
    name: 'mathFingerprint',
    type: 'number',
    apiSource: 'Math.random() or performance.now() derived',
    description: 'Floating-point fingerprint value. Likely derived from Math.random() seeded computation or performance timing. Used as an entropy source.',
    sampleValue: 0.8410000801086426,
    required: true,
    category: 'fingerprint',
    webpackModule: 31,
    collectorFunc: 'func_270'
  },
  {
    index: 18,
    name: 'audioFingerprint',
    type: 'object',
    apiSource: 'AudioContext, AnalyserNode, OscillatorNode',
    description: 'AudioContext fingerprint containing two sub-objects: nt_vc_output (AudioContext/AnalyserNode properties) and pxi_output (oscillator-based audio hash).',
    sampleValue: {
      nt_vc_output: {
        'ac-baseLatency': 0.011609977324263039,
        'ac-sampleRate': 44100,
        'ac-maxChannelCount': 2
      },
      pxi_output: 11888.616780045351
    },
    required: true,
    category: 'fingerprint',
    webpackModule: 33,
    collectorFunc: 'func_144 → func_186'
  },
  {
    index: 19,
    name: 'mimeTypes',
    type: 'array',
    apiSource: 'navigator.mimeTypes',
    description: 'Array of registered MIME types. Each entry has {type, suffixes}.',
    sampleValue: [
      { type: 'application/pdf', suffixes: 'pdf' },
      { type: 'text/pdf', suffixes: 'pdf' }
    ],
    required: true,
    category: 'browser',
    webpackModule: 34,
    collectorFunc: 'func_230'
  },
  {
    index: 20,
    name: 'webglImage',
    type: 'string',
    apiSource: 'WebGLRenderingContext → canvas.toDataURL()',
    description: 'Base64-encoded WebGL rendered image. Used as a visual fingerprint of GPU rendering capabilities.',
    sampleValue: 'GgoAAAANSUhEUgAAASwAAACWCAYAAA5NaTBbpWkt+U1bjlI58vrFvnpybnJoAJv/ilf7GhGwAAAABJRU5ErkJggg==',
    required: true,
    category: 'fingerprint',
    webpackModule: 35,
    collectorFunc: 'func_167 → func_115'
  },
  {
    index: 21,
    name: 'storageEstimate',
    type: 'object',
    apiSource: 'navigator.storage.estimate()',
    description: 'Storage quota information (async). Contains _state (0=resolved, -1=pending, -2=rejected), quota, usage, usageDetails.',
    sampleValue: { _state: 0, quota: 10737418240, usage: null, usageDetails: {} },
    required: true,
    category: 'browser',
    webpackModule: 36,
    collectorFunc: 'func_266'
  },
  {
    index: 22,
    name: 'pageUrl',
    type: 'string',
    apiSource: 'location.href',
    description: 'Current page URL. Identifies the page context where TDC was loaded.',
    sampleValue: 'http://127.0.0.1:46577/?rand=1519713624347',
    required: true,
    category: 'browser',
    webpackModule: 37,
    collectorFunc: 'func_124'
  },
  {
    index: 23,
    name: 'plugins',
    type: 'array',
    apiSource: 'navigator.plugins',
    description: 'Array of browser plugins. Each entry has {name, description, filename}.',
    sampleValue: [
      { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' }
    ],
    required: true,
    category: 'browser',
    webpackModule: 39,
    collectorFunc: 'func_40 → func_261'
  },
  {
    index: 24,
    name: 'indexedDbAvail',
    type: 'number',
    apiSource: 'window.indexedDB',
    description: 'IndexedDB availability flag. 0 = available.',
    sampleValue: 0,
    required: true,
    category: 'browser',
    webpackModule: 40,
    collectorFunc: 'func_10'
  },
  {
    index: 25,
    name: 'maxTouchPointsDup',
    type: 'number',
    apiSource: 'navigator.maxTouchPoints',
    description: 'Duplicate maxTouchPoints check (cross-validation). Same API as index 14.',
    sampleValue: 20,
    required: true,
    category: 'hardware',
    /* UNCERTAIN: may be a different touch metric (e.g., msMaxTouchPoints) */
    webpackModule: 41,
    collectorFunc: 'func_187_invalid'
  },
  {
    index: 26,
    name: 'timezoneOffset',
    type: 'string',
    apiSource: 'new Date().getTimezoneOffset()',
    description: 'Timezone offset as string like "+08" or "-05". Derived from Date.getTimezoneOffset() / -60.',
    sampleValue: '+08',
    required: true,
    category: 'timing',
    webpackModule: 42,
    collectorFunc: 'func_80 → func_82'
  },
  {
    index: 27,
    name: 'adBlockDetected',
    type: 'number',
    apiSource: 'DOM ad element injection test',
    description: 'Ad blocker detection flag. 0 = no blocker detected, 1 = blocker detected.',
    sampleValue: 0,
    required: true,
    category: 'browser',
    webpackModule: 43,
    collectorFunc: 'func_253'
  },
  {
    index: 28,
    name: 'colorGamut',
    type: 'string',
    apiSource: 'window.matchMedia("(color-gamut: srgb)")',
    description: 'CSS color gamut support. Values: "srgb", "p3", "rec2020", or "" if unsupported.',
    sampleValue: 'srgb',
    required: true,
    category: 'screen',
    webpackModule: 44,
    collectorFunc: 'func_233 → func_165'
  },
  {
    index: 29,
    name: 'audioCodecs',
    type: 'array',
    apiSource: 'HTMLAudioElement.canPlayType()',
    description: 'Array of audio codec support objects. Each has {codec, support}.',
    sampleValue: [
      { codec: 'AAC', support: 'probably' },
      { codec: 'MP3', support: 'probably' }
    ],
    required: true,
    category: 'fingerprint',
    webpackModule: 45,
    collectorFunc: 'func_143 → func_71'
  },
  {
    index: 30,
    name: 'webdriverFlag',
    type: 'number',
    apiSource: 'navigator.webdriver, Object.getOwnPropertyDescriptor(navigator, "webdriver")',
    description: 'Webdriver/automation detection. 0 = webdriver property has getter (normal), 1 = missing or tampered.',
    sampleValue: 0,
    required: true,
    category: 'browser',
    webpackModule: 30,
    collectorFunc: 'func_83 → func_236'
  },
  {
    index: 31,
    name: 'userAgent',
    type: 'string',
    apiSource: 'navigator.userAgent',
    description: 'Full user agent string from navigator.userAgent.',
    sampleValue: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/146.0.0.0 Safari/537.36',
    required: true,
    category: 'browser',
    webpackModule: 46,
    collectorFunc: 'func_108'
  },
  {
    index: 32,
    name: 'characterSet',
    type: 'string',
    apiSource: 'document.characterSet',
    description: 'Document character encoding. Typically "UTF-8".',
    sampleValue: 'UTF-8',
    required: true,
    category: 'browser',
    webpackModule: 47,
    collectorFunc: 'func_257'
  },
  {
    index: 33,
    name: 'screenPosition',
    type: 'string',
    apiSource: 'window.screenX + ";" + window.screenY',
    description: 'Browser window screen position as "X;Y" string. "0;0" indicates default or fullscreen.',
    sampleValue: '0;0',
    required: true,
    category: 'screen',
    webpackModule: 48,
    collectorFunc: 'func_147'
  },
  {
    index: 34,
    name: 'intlOptions',
    type: 'object',
    apiSource: 'Intl.DateTimeFormat().resolvedOptions()',
    description: 'Internationalization options: timeZone, calendar, numberingSystem, locale.',
    sampleValue: { timeZone: 'Asia/Shanghai', calendar: 'gregory', numberingSystem: 'latn', locale: 'en-US' },
    required: true,
    category: 'timing',
    webpackModule: 49,
    collectorFunc: 'func_175'
  },
  {
    index: 35,
    name: 'connectionInfo',
    type: 'null',
    apiSource: 'navigator.connection',
    description: 'Network connection information. null when navigator.connection is unavailable (headless, incognito).',
    sampleValue: null,
    required: true,
    category: 'network',
    /* UNCERTAIN: may also encode NetworkInformation.downlink/rtt */
    webpackModule: 50,
    collectorFunc: 'func_64'
  },
  {
    index: 36,
    name: 'vendor',
    type: 'string',
    apiSource: 'navigator.vendor',
    description: 'Browser vendor string. "Google Inc." for Chrome, "" for Firefox.',
    sampleValue: 'Google Inc. (Google)',
    required: true,
    category: 'browser',
    webpackModule: 51,
    collectorFunc: 'func_23'
  },
  {
    index: 37,
    name: 'highEntropyValues',
    type: 'object',
    apiSource: 'navigator.userAgentData.getHighEntropyValues()',
    description: 'High-entropy UA client hints (async). Contains _state, architecture, bitness, brands, fullVersionList, platform, etc.',
    sampleValue: {
      _state: 0,
      architecture: 'x86',
      bitness: '64',
      brands: [{ brand: 'Chromium', version: '146' }],
      platform: 'Linux'
    },
    required: true,
    category: 'browser',
    webpackModule: 54,
    collectorFunc: 'func_117'
  },
  {
    index: 38,
    name: 'internalToken',
    type: 'string',
    apiSource: 'internal',
    description: 'Internal identifier string. May be a hardcoded check value or derived constant. Observed value "98k".',
    sampleValue: '98k',
    required: true,
    category: 'internal',
    /* UNCERTAIN: purpose unclear, possibly anti-tamper marker */
    webpackModule: 55,
    collectorFunc: 'func_168'
  },
  {
    index: 39,
    name: 'connectionType',
    type: 'string',
    apiSource: 'navigator.connection.effectiveType',
    description: 'Network connection effective type. "4g", "3g", "2g", "slow-2g", or "unknown" when unavailable.',
    sampleValue: 'unknown',
    required: true,
    category: 'network',
    webpackModule: 56,
    collectorFunc: 'func_287'
  },
  {
    index: 40,
    name: 'webglRenderer',
    type: 'string',
    apiSource: 'WebGLRenderingContext.getParameter(UNMASKED_RENDERER_WEBGL)',
    description: 'WebGL renderer string from WEBGL_debug_renderer_info extension. Identifies the GPU.',
    sampleValue: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
    required: true,
    category: 'fingerprint',
    webpackModule: 57,
    collectorFunc: 'func_240 → func_258'
  },
  {
    index: 41,
    name: 'frameStatus',
    type: 'string',
    apiSource: 'window.top === window',
    description: 'Frame detection. "top" if window is the top-level frame, "frame" or "cross-origin" otherwise.',
    sampleValue: 'top',
    required: true,
    category: 'browser',
    webpackModule: 58,
    collectorFunc: 'func_148'
  },
  {
    index: 42,
    name: 'permissionStatus',
    type: 'object',
    apiSource: 'navigator.permissions.query() or Notification.permission',
    description: 'Permission/notification status (async). _state: 0=resolved, -1=pending, -2=rejected/timeout.',
    sampleValue: { _state: -2 },
    required: true,
    category: 'browser',
    /* UNCERTAIN: exact permission queried is unclear; -2 indicates timeout/rejection in headless */
    webpackModule: 59,
    collectorFunc: 'func_258'
  },
  {
    index: 43,
    name: 'webrtcIp',
    type: 'string',
    apiSource: 'RTCPeerConnection → onicecandidate',
    description: 'WebRTC local IP address. Empty string when WebRTC is unavailable or blocked (headless).',
    sampleValue: '',
    required: true,
    category: 'network',
    webpackModule: 60,
    collectorFunc: 'func_2 → func_47'
  },
  {
    index: 44,
    name: 'availHeight',
    type: 'number',
    apiSource: 'screen.availHeight || window.outerHeight',
    description: 'Available screen height (excludes taskbar) or outer window height.',
    sampleValue: 600,
    required: true,
    category: 'screen',
    webpackModule: 61,
    collectorFunc: 'func_178'
  },
  {
    index: 45,
    name: 'headlessFlag',
    type: 'number',
    apiSource: 'internal detection heuristics',
    description: 'Headless browser detection flag. 0 = normal, non-zero = headless indicators found.',
    sampleValue: 0,
    required: true,
    category: 'browser',
    /* UNCERTAIN: exact heuristics unknown; may check chrome.runtime, window.chrome, etc. */
    webpackModule: 62,
    collectorFunc: 'func_239'
  },
  {
    index: 46,
    name: 'userAgentData',
    type: 'object',
    apiSource: 'navigator.userAgentData',
    description: 'Low-entropy UA client hints. Contains brands, mobile flag, and platform.',
    sampleValue: {
      brands: [
        { brand: 'Not-A.Brand', version: '24' },
        { brand: 'Chromium', version: '146' }
      ],
      mobile: false,
      platform: 'Linux'
    },
    required: true,
    category: 'browser',
    webpackModule: 63,
    collectorFunc: 'func_153'
  },
  {
    index: 47,
    name: 'screenComposite',
    type: 'string',
    apiSource: 'screen.width, screen.height, screen.availHeight, screen.colorDepth, etc.',
    description: 'Composite screen dimensions string: "width-height-availHeight-colorDepth-*-*-|-*". Stars may be additional screen properties.',
    sampleValue: '800-600-600-24-*-*-|-*',
    required: true,
    category: 'screen',
    webpackModule: 64,
    collectorFunc: 'func_50 → func_84'
  },
  {
    index: 48,
    name: 'platform',
    type: 'string',
    apiSource: 'navigator.platform',
    description: 'Platform string from navigator.platform. E.g., "Linux x86_64", "Win32", "MacIntel".',
    sampleValue: 'Linux x86_64',
    required: true,
    category: 'browser',
    webpackModule: 65,
    collectorFunc: 'func_86'
  },
  {
    index: 49,
    name: 'colorDepth',
    type: 'number',
    apiSource: 'screen.colorDepth',
    description: 'Screen color depth in bits. Typically 24 or 32.',
    sampleValue: 24,
    required: true,
    category: 'screen',
    webpackModule: 66,
    collectorFunc: 'func_7 → func_173'
  },
  {
    index: 50,
    name: 'doNotTrack',
    type: 'string',
    apiSource: 'navigator.doNotTrack || window.doNotTrack',
    description: 'Do Not Track preference. "" = unset, "1" = enabled, "0" = disabled.',
    sampleValue: '',
    required: true,
    category: 'browser',
    webpackModule: 67,
    collectorFunc: 'func_156'
  },
  {
    index: 51,
    name: 'cookiesEnabled',
    type: 'number',
    apiSource: 'navigator.cookieEnabled',
    description: 'Cookie support flag. 0 = cookies enabled (normal), 1 = cookies disabled.',
    sampleValue: 0,
    required: true,
    category: 'browser',
    /* UNCERTAIN: polarity may be inverted; 0 could mean "no issues detected" */
    webpackModule: 68,
    collectorFunc: 'func_45'
  },
  {
    index: 52,
    name: 'timestampCollectionEnd',
    type: 'number',
    apiSource: 'Math.round(Date.now() / 1000)',
    description: 'Unix timestamp (seconds) at end of collection. Slightly later than timestampInit.',
    sampleValue: 1775062186,
    required: true,
    category: 'timing',
    webpackModule: 70,
    collectorFunc: 'func_76'
  },
  {
    index: 53,
    name: 'timestampCollectionStart',
    type: 'number',
    apiSource: 'Math.round(Date.now() / 1000)',
    description: 'Unix timestamp (seconds) at start of collection. Often equals timestampInit.',
    sampleValue: 1775062183,
    required: true,
    category: 'timing',
    webpackModule: 71,
    collectorFunc: 'func_183'
  },
  {
    index: 54,
    name: 'performanceHash',
    type: 'number',
    apiSource: 'performance.now() or performance.timing derived',
    description: 'Performance timing hash — a computed 32-bit value derived from performance timing APIs. Used for timing fingerprinting.',
    sampleValue: 679647370,
    required: true,
    category: 'timing',
    webpackModule: 72,
    collectorFunc: 'func_77'
  },
  {
    index: 55,
    name: 'cssOverflowResult',
    type: 'string',
    apiSource: 'CSS.supports() or similar',
    description: 'CSS feature detection result. Empty when unsupported or in headless mode.',
    sampleValue: '',
    required: true,
    category: 'browser',
    /* UNCERTAIN: exact CSS feature tested is unclear */
    webpackModule: 73,
    collectorFunc: 'func_286'
  },
  {
    index: 56,
    name: 'canvasBlocked',
    type: 'number',
    apiSource: 'HTMLCanvasElement.toDataURL() comparison',
    description: 'Canvas blocking detection. 0 = canvas fingerprinting works normally.',
    sampleValue: 0,
    required: true,
    category: 'fingerprint',
    webpackModule: 74,
    collectorFunc: 'func_5'
  },
  {
    index: 57,
    name: 'featureBitmask',
    type: 'number',
    apiSource: 'multiple feature detection tests combined',
    description: 'Bitmask of browser feature support. 1023 = 0x3FF (10 bits set). Each bit represents a specific feature capability.',
    sampleValue: 1023,
    required: true,
    category: 'fingerprint',
    /* UNCERTAIN: exact bit mapping unknown; likely combines multiple boolean checks */
    webpackModule: 75,
    collectorFunc: 'func_280'
  },
  {
    index: 58,
    name: 'errorLog',
    type: 'string',
    apiSource: 'internal',
    description: 'Collection error log. Empty string when no errors occurred during fingerprinting.',
    sampleValue: '',
    required: true,
    category: 'internal',
    webpackModule: 76,
    collectorFunc: 'func_98 → func_78'
  }
];

// ═══════════════════════════════════════════════════════════════════════
// Type validation map
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate a JavaScript value against an expected type string.
 *
 * Type checking rules:
 *   - 'number'  → typeof === 'number'
 *   - 'string'  → typeof === 'string'
 *   - 'array'   → Array.isArray()
 *   - 'object'  → typeof === 'object' && !Array.isArray() && value !== null
 *   - 'null'    → value === null
 *
 * @param {*} value - The value to check
 * @param {string} expectedType - One of: 'number', 'string', 'array', 'object', 'null'
 * @returns {boolean}
 */
function checkType(value, expectedType) {
  switch (expectedType) {
    case 'number':
      return typeof value === 'number';
    case 'string':
      return typeof value === 'string';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && !Array.isArray(value) && value !== null;
    case 'null':
      return value === null;
    default:
      return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// validateCollectorData
// ═══════════════════════════════════════════════════════════════════════

/**
 * Validate a cdArray against the collector schema.
 *
 * Checks:
 *   1. Array length === 59
 *   2. Each element's type matches the schema
 *
 * @param {Array} cdArray - The collector data array to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCollectorData(cdArray) {
  const errors = [];

  if (!Array.isArray(cdArray)) {
    return { valid: false, errors: ['cdArray is not an array'] };
  }

  if (cdArray.length !== 59) {
    errors.push(`Expected 59 entries, got ${cdArray.length}`);
  }

  for (let i = 0; i < COLLECTOR_SCHEMA.length; i++) {
    const entry = COLLECTOR_SCHEMA[i];
    if (i >= cdArray.length) {
      errors.push(`[${i}] ${entry.name}: missing`);
      continue;
    }

    const value = cdArray[i];
    if (!checkType(value, entry.type)) {
      const actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      errors.push(`[${i}] ${entry.name}: expected type '${entry.type}', got '${actualType}'`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════
// buildDefaultCdArray
// ═══════════════════════════════════════════════════════════════════════

/**
 * Build a default cdArray from a browser profile configuration.
 *
 * The browser profile provides key values that vary between devices.
 * All other fields receive sensible defaults matching a standard
 * Chrome on Linux desktop profile.
 *
 * @param {Object} profile - Browser profile configuration
 * @param {string} [profile.platform='Linux x86_64'] - navigator.platform
 * @param {string} [profile.osPlatform='linux'] - OS name (linux/windows/macos/android/ios)
 * @param {string} [profile.userAgent] - navigator.userAgent
 * @param {number} [profile.screenWidth=1920] - screen.width
 * @param {number} [profile.screenHeight=1080] - screen.height
 * @param {number} [profile.viewportWidth=800] - window.innerWidth
 * @param {number} [profile.availHeight=600] - screen.availHeight
 * @param {number} [profile.colorDepth=24] - screen.colorDepth
 * @param {number} [profile.devicePixelRatio=1] - window.devicePixelRatio
 * @param {number} [profile.hardwareConcurrency=8] - navigator.hardwareConcurrency
 * @param {string[]} [profile.languages=['en-US']] - navigator.languages
 * @param {string} [profile.timezone='Asia/Shanghai'] - Intl timeZone
 * @param {string} [profile.timezoneOffset='+08'] - Timezone offset string
 * @param {string} [profile.vendor='Google Inc. (Google)'] - navigator.vendor
 * @param {string} [profile.webglRenderer='...'] - WebGL renderer string
 * @param {string} [profile.pageUrl=''] - location.href
 * @param {number} [profile.timestamp] - Unix timestamp in seconds (defaults to now)
 * @param {string} [profile.fonts] - Comma-separated font list
 * @returns {Array} cdArray with 59 entries
 */
function buildDefaultCdArray(profile) {
  const p = profile || {};

  const timestamp = p.timestamp || Math.round(Date.now() / 1000);
  const screenWidth = p.screenWidth || 1920;
  const screenHeight = p.screenHeight || 1080;
  const viewportWidth = p.viewportWidth || 800;
  const availHeight = p.availHeight || 600;
  const colorDepth = p.colorDepth || 24;
  const osPlatform = p.osPlatform || 'linux';
  const platform = p.platform || 'Linux x86_64';
  const userAgent = p.userAgent || 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
  const languages = p.languages || ['en-US'];
  const vendor = p.vendor || 'Google Inc. (Google)';
  const timezone = p.timezone || 'Asia/Shanghai';
  const timezoneOffset = p.timezoneOffset || '+08';
  const webglRenderer = p.webglRenderer || 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
  const pageUrl = p.pageUrl || '';
  const hardwareConcurrency = p.hardwareConcurrency || 8;
  const devicePixelRatio = p.devicePixelRatio || 1;
  const fonts = p.fonts || 'Arial,Courier New,Times New Roman,Helvetica';
  const maxTouchPoints = p.maxTouchPoints !== undefined ? p.maxTouchPoints : 0;
  const touchSupport = p.touchSupport !== undefined ? p.touchSupport : 2;

  // Default video codecs (standard Chrome support)
  const videoCodecs = p.videoCodecs || [
    { codec: 'H.264', support: 'probably' },
    { codec: 'H.264 High', support: 'probably' },
    { codec: 'H.265/HEVC', support: '' },
    { codec: 'VP8', support: 'probably' },
    { codec: 'VP9', support: 'probably' },
    { codec: 'AV1', support: 'probably' },
    { codec: 'Theora', support: '' },
    { codec: 'MPEG-4', support: '' }
  ];

  // Default audio codecs (standard Chrome support)
  const audioCodecs = p.audioCodecs || [
    { codec: 'AAC', support: 'probably' },
    { codec: 'MP3', support: 'probably' },
    { codec: 'Ogg Vorbis', support: 'probably' },
    { codec: 'Ogg Opus', support: 'probably' },
    { codec: 'WAV', support: 'probably' },
    { codec: 'FLAC', support: 'probably' },
    { codec: 'WebM Vorbis', support: 'probably' },
    { codec: 'WebM Opus', support: 'probably' },
    { codec: 'M4A', support: 'maybe' }
  ];

  // Default plugins (Chrome built-in)
  const plugins = p.plugins || [
    { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
    { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
    { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
    { name: 'Microsoft Edge PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
    { name: 'WebKit built-in PDF', description: 'Portable Document Format', filename: 'internal-pdf-viewer' }
  ];

  // Default mime types
  const mimeTypes = p.mimeTypes || [
    { type: 'application/pdf', suffixes: 'pdf' },
    { type: 'text/pdf', suffixes: 'pdf' }
  ];

  // Default audio fingerprint
  const audioFingerprint = p.audioFingerprint || {
    nt_vc_output: {
      'ac-baseLatency': 0.011609977324263039,
      'ac-outputLatency': 0,
      'ac-sampleRate': 44100,
      'ac-maxChannelCount': 2,
      'ac-numberOfInputs': 1,
      'ac-numberOfOutputs': 0,
      'ac-channelCount': 2,
      'ac-channelCountMode': 'explicit',
      'ac-channelInterpretation': 'speakers',
      'an-fftSize': 2048,
      'an-frequencyBinCount': 1024,
      'an-minDecibels': -100,
      'an-maxDecibels': -30,
      'an-smoothingTimeConstant': 0.8,
      'an-numberOfInputs': 1,
      'an-numberOfOutputs': 1,
      'an-channelCount': 2,
      'an-channelCountMode': 'max',
      'an-channelInterpretation': 'speakers'
    },
    pxi_output: 11888.616780045351
  };

  // Default userAgentData (low entropy)
  const userAgentData = p.userAgentData || {
    brands: [
      { brand: 'Not-A.Brand', version: '24' },
      { brand: 'Chromium', version: '146' }
    ],
    mobile: false,
    platform: 'Linux'
  };

  // Default high entropy values
  const highEntropyValues = p.highEntropyValues || {
    _state: 0,
    architecture: 'x86',
    bitness: '64',
    brands: [
      { brand: 'Not-A.Brand', version: '24' },
      { brand: 'Chromium', version: '146' }
    ],
    fullVersionList: [
      { brand: 'Not-A.Brand', version: '24.0.0.0' },
      { brand: 'Chromium', version: '146.0.7680.153' }
    ],
    mobile: false,
    model: '',
    platform: 'Linux',
    platformVersion: '',
    uaFullVersion: '146.0.7680.153',
    wow64: false
  };

  // Screen composite: "width-height-availHeight-colorDepth-*-*-|-*"
  const screenComposite = p.screenComposite ||
    `${viewportWidth}-${availHeight}-${availHeight}-${colorDepth}-*-*-|-*`;

  // Intl options
  const intlOptions = p.intlOptions || {
    timeZone: timezone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    locale: languages[0] || 'en-US'
  };

  // Build the 59-element array
  const cdArray = [
    /* 0  callCounter */            p.callCounter || 1,
    /* 1  osPlatform */             osPlatform,
    /* 2  touchSupport */           touchSupport,
    /* 3  viewportWidth */          viewportWidth,
    /* 4  detectedFonts */          fonts,
    /* 5  flashFonts */             p.flashFonts || '',
    /* 6  languages */              languages,
    /* 7  colorGamutLegacy */       p.colorGamutLegacy || '',
    /* 8  hardwareConcurrency */    hardwareConcurrency,
    /* 9  screenResolution */       [screenWidth, screenHeight],
    /* 10 devicePixelRatio */       devicePixelRatio,
    /* 11 sessionStorageAvail */    p.sessionStorageAvail !== undefined ? p.sessionStorageAvail : 0,
    /* 12 videoCodecs */            videoCodecs,
    /* 13 localStorageAvail */      p.localStorageAvail !== undefined ? p.localStorageAvail : 1,
    /* 14 maxTouchPoints */         maxTouchPoints,
    /* 15 canvasHash */             p.canvasHash || 991783254,
    /* 16 timestampInit */          timestamp,
    /* 17 mathFingerprint */        p.mathFingerprint || Math.random(),
    /* 18 audioFingerprint */       audioFingerprint,
    /* 19 mimeTypes */              mimeTypes,
    /* 20 webglImage */             p.webglImage || '',
    /* 21 storageEstimate */        p.storageEstimate || { _state: 0, quota: 10737418240, usage: null, usageDetails: {} },
    /* 22 pageUrl */                pageUrl,
    /* 23 plugins */                plugins,
    /* 24 indexedDbAvail */         p.indexedDbAvail !== undefined ? p.indexedDbAvail : 0,
    /* 25 maxTouchPointsDup */      maxTouchPoints,
    /* 26 timezoneOffset */         timezoneOffset,
    /* 27 adBlockDetected */        p.adBlockDetected || 0,
    /* 28 colorGamut */             p.colorGamut || 'srgb',
    /* 29 audioCodecs */            audioCodecs,
    /* 30 webdriverFlag */          p.webdriverFlag !== undefined ? p.webdriverFlag : 0,
    /* 31 userAgent */              userAgent,
    /* 32 characterSet */           p.characterSet || 'UTF-8',
    /* 33 screenPosition */         p.screenPosition || '0;0',
    /* 34 intlOptions */            intlOptions,
    /* 35 connectionInfo */         p.connectionInfo !== undefined ? p.connectionInfo : null,
    /* 36 vendor */                 vendor,
    /* 37 highEntropyValues */      highEntropyValues,
    /* 38 internalToken */          p.internalToken || '98k',
    /* 39 connectionType */         p.connectionType || 'unknown',
    /* 40 webglRenderer */          webglRenderer,
    /* 41 frameStatus */            p.frameStatus || 'top',
    /* 42 permissionStatus */       p.permissionStatus || { _state: -2 },
    /* 43 webrtcIp */               p.webrtcIp || '',
    /* 44 availHeight */            availHeight,
    /* 45 headlessFlag */           p.headlessFlag || 0,
    /* 46 userAgentData */          userAgentData,
    /* 47 screenComposite */        screenComposite,
    /* 48 platform */               platform,
    /* 49 colorDepth */             colorDepth,
    /* 50 doNotTrack */             p.doNotTrack || '',
    /* 51 cookiesEnabled */         p.cookiesEnabled !== undefined ? p.cookiesEnabled : 0,
    /* 52 timestampCollectionEnd */ p.timestampCollectionEnd || (timestamp + 3),
    /* 53 timestampCollectionStart */ p.timestampCollectionStart || timestamp,
    /* 54 performanceHash */        p.performanceHash || 679647370,
    /* 55 cssOverflowResult */      p.cssOverflowResult || '',
    /* 56 canvasBlocked */          p.canvasBlocked || 0,
    /* 57 featureBitmask */         p.featureBitmask !== undefined ? p.featureBitmask : 1023,
    /* 58 errorLog */               p.errorLog || ''
  ];

  return cdArray;
}

// ═══════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
  COLLECTOR_SCHEMA,
  validateCollectorData,
  buildDefaultCdArray
};
