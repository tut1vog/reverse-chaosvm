'use strict';

/**
 * fingerprint-harvester.js — Capture Real Chrome Fingerprints for jsdom Replay
 *
 * Task 10.9: Launches a real Chrome (via Puppeteer + stealth) and captures
 * the exact raw API return values that TDC's 59 collector modules probe.
 * These values are saved to output/chrome-fingerprint.json and can be
 * loaded by browser-mock.js as the 'chrome-real-harvested' profile.
 *
 * Usage:
 *   node src/bot/fingerprint-harvester.js [--output path]
 *
 * The harvested fingerprint is machine-specific — re-run when moving
 * to a different machine/GPU.
 *
 * Exports: harvestFingerprint (for programmatic use)
 */

// Task 10.11: Use plain puppeteer (NOT puppeteer-extra with stealth) so we
// capture the REAL headless Chrome values for this machine. The stealth plugin
// overrides UA, platform, webglVendor/Renderer, hardwareConcurrency, languages,
// etc. — all values we need to capture truthfully.
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════
// Default output path
// ═══════════════════════════════════════════════════════════════════════

const DEFAULT_OUTPUT = path.resolve(__dirname, '../profiles/chrome-fingerprint.json');

// ═══════════════════════════════════════════════════════════════════════
// In-page harvesting script
// ═══════════════════════════════════════════════════════════════════════

/**
 * This function runs inside the browser page context.
 * It captures all API values TDC probes.
 */
async function harvestInPage() {
  const fp = {};

  // ── Navigator properties ──────────────────────────────────────────
  fp.userAgent = navigator.userAgent;
  fp.appVersion = navigator.appVersion;
  fp.platform = navigator.platform;
  fp.vendor = navigator.vendor;
  fp.language = navigator.language;
  fp.languages = Array.from(navigator.languages || []);
  fp.cookieEnabled = navigator.cookieEnabled;
  fp.hardwareConcurrency = navigator.hardwareConcurrency;
  fp.maxTouchPoints = navigator.maxTouchPoints;
  fp.webdriver = navigator.webdriver;
  fp.doNotTrack = navigator.doNotTrack;
  fp.deviceMemory = navigator.deviceMemory;

  // ── Plugins ───────────────────────────────────────────────────────
  fp.plugins = [];
  if (navigator.plugins) {
    for (let i = 0; i < navigator.plugins.length; i++) {
      const p = navigator.plugins[i];
      fp.plugins.push({
        name: p.name,
        description: p.description,
        filename: p.filename
      });
    }
  }

  // ── MimeTypes ─────────────────────────────────────────────────────
  fp.mimeTypes = [];
  if (navigator.mimeTypes) {
    for (let i = 0; i < navigator.mimeTypes.length; i++) {
      const m = navigator.mimeTypes[i];
      fp.mimeTypes.push({
        type: m.type,
        suffixes: m.suffixes,
        description: m.description
      });
    }
  }

  // ── userAgentData ─────────────────────────────────────────────────
  if (navigator.userAgentData) {
    fp.userAgentData = {
      brands: navigator.userAgentData.brands.map(b => ({
        brand: b.brand,
        version: b.version
      })),
      mobile: navigator.userAgentData.mobile,
      platform: navigator.userAgentData.platform
    };

    // High entropy values (async)
    try {
      const hev = await navigator.userAgentData.getHighEntropyValues([
        'architecture', 'bitness', 'brands', 'fullVersionList',
        'mobile', 'model', 'platform', 'platformVersion',
        'uaFullVersion', 'wow64'
      ]);
      fp.highEntropyValues = {
        architecture: hev.architecture,
        bitness: hev.bitness,
        brands: (hev.brands || []).map(b => ({ brand: b.brand, version: b.version })),
        fullVersionList: (hev.fullVersionList || []).map(b => ({ brand: b.brand, version: b.version })),
        mobile: hev.mobile,
        model: hev.model,
        platform: hev.platform,
        platformVersion: hev.platformVersion,
        uaFullVersion: hev.uaFullVersion,
        wow64: hev.wow64
      };
    } catch (e) {
      fp.highEntropyValues = null;
      fp._highEntropyError = e.message;
    }
  } else {
    fp.userAgentData = undefined;
    fp.highEntropyValues = undefined;
  }

  // ── Screen properties ─────────────────────────────────────────────
  fp.screenWidth = screen.width;
  fp.screenHeight = screen.height;
  fp.availWidth = screen.availWidth;
  fp.availHeight = screen.availHeight;
  fp.colorDepth = screen.colorDepth;
  fp.pixelDepth = screen.pixelDepth;
  fp.devicePixelRatio = window.devicePixelRatio;
  fp.innerWidth = window.innerWidth;
  fp.innerHeight = window.innerHeight;
  fp.outerWidth = window.outerWidth;
  fp.outerHeight = window.outerHeight;
  fp.screenX = window.screenX;
  fp.screenY = window.screenY;

  // ── Connection ────────────────────────────────────────────────────
  if (navigator.connection) {
    fp.connection = {
      effectiveType: navigator.connection.effectiveType,
      rtt: navigator.connection.rtt,
      downlink: navigator.connection.downlink,
      saveData: navigator.connection.saveData
    };
  } else {
    fp.connection = undefined;
  }

  // ── Canvas 2D fingerprint ─────────────────────────────────────────
  // Replicate TDC's exact canvas drawing operations (from func_4):
  //   1. Create canvas, get 2d context
  //   2. Set textBaseline="alphabetic", font="14px 'Arial'"
  //   3. fillStyle="#f60", fillRect(125, 1, 62, 20)
  //   4. fillStyle="#069", fillText("ClientJS,org <canvas> 1.0", 2, 15)
  //   5. fillStyle="rgba(102, 204, 0, 0.7)", fillText(same text, 4, 17)
  //   6. toDataURL()
  try {
    const canvas = document.createElement('canvas');
    // TDC doesn't set explicit size — defaults to 300x150
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('ClientJS,org <canvas> 1.0', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('ClientJS,org <canvas> 1.0', 4, 17);
    fp.canvasDataURL = canvas.toDataURL();
  } catch (e) {
    fp.canvasDataURL = '';
    fp._canvasError = e.message;
  }

  // ── WebGL fingerprint ─────────────────────────────────────────────
  // TDC creates a WebGL canvas and calls toDataURL() for the image.
  // It also queries getParameter/getExtension for renderer info.
  try {
    const glCanvas = document.createElement('canvas');
    glCanvas.width = 300;
    glCanvas.height = 150;
    const gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true })
             || glCanvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });

    if (gl) {
      // Perform basic WebGL draw operations similar to what TDC does
      // (clear + simple triangle to produce non-empty pixels)
      gl.clearColor(0.0, 0.0, 0.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Simple vertex shader
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, `
        attribute vec2 a_position;
        void main() { gl_Position = vec4(a_position, 0, 1); }
      `);
      gl.compileShader(vs);

      // Simple fragment shader
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, `
        precision mediump float;
        void main() { gl_FragColor = vec4(0.2, 0.7, 0.3, 1.0); }
      `);
      gl.compileShader(fs);

      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -0.5, -0.5,  0.5, -0.5,  0.0, 0.5
      ]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      fp.webglDataURL = glCanvas.toDataURL();

      // WebGL parameters
      const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
      fp.webglVendor = debugExt ? gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) : 'unknown';
      fp.webglRenderer = debugExt ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) : 'unknown';
      fp.webglVersion = gl.getParameter(gl.VERSION);
      fp.webglShadingLanguageVersion = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
      fp.webglMaxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      fp.webglMaxCubeMapTextureSize = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE);
      fp.webglMaxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
      fp.webglMaxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
      fp.webglMaxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
      fp.webglMaxTextureImageUnits = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
      fp.webglMaxVertexTextureImageUnits = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS);
      fp.webglMaxCombinedTextureImageUnits = gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS);
      fp.webglMaxRenderbufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
      fp.webglMaxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS);
      fp.webglAliasedLineWidthRange = Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE));
      fp.webglAliasedPointSizeRange = Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE));
      fp.webglMaxViewportDims = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS));
      fp.webglStencilBits = gl.getParameter(gl.STENCIL_BITS);
      fp.webglSupportedExtensions = gl.getSupportedExtensions();

      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } else {
      fp.webglDataURL = '';
      fp.webglVendor = '';
      fp.webglRenderer = '';
    }
  } catch (e) {
    fp.webglDataURL = '';
    fp._webglError = e.message;
  }

  // ── Audio fingerprint ─────────────────────────────────────────────
  // TDC's audio fingerprint uses OfflineAudioContext with:
  //   OscillatorNode (triangle, 10000Hz) → DynamicsCompressorNode → destination
  // Then reads rendered buffer to compute pxi_output (sum of abs values).
  try {
    const audioCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);

    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(10000, audioCtx.currentTime);

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-50, audioCtx.currentTime);
    compressor.knee.setValueAtTime(40, audioCtx.currentTime);
    compressor.ratio.setValueAtTime(12, audioCtx.currentTime);
    compressor.attack.setValueAtTime(0, audioCtx.currentTime);
    compressor.release.setValueAtTime(0.25, audioCtx.currentTime);

    oscillator.connect(compressor);
    compressor.connect(audioCtx.destination);
    oscillator.start(0);

    const renderedBuffer = await audioCtx.startRendering();
    const data = renderedBuffer.getChannelData(0);

    // Compute pxi_output: sum of abs(data[i]) for i in [4500, 5000)
    // This is the standard TDC audio fingerprint range
    let pxiOutput = 0;
    for (let i = 4500; i < 5000 && i < data.length; i++) {
      pxiOutput += Math.abs(data[i]);
    }
    fp.audioPxiOutput = pxiOutput;

    // Also capture the nt_vc_output metadata
    // (These are AudioContext properties that TDC reads)
    const onlineCtx = new (window.AudioContext || window.webkitAudioContext)();
    fp.audioNtVcOutput = {
      'ac-baseLatency': onlineCtx.baseLatency,
      'ac-outputLatency': onlineCtx.outputLatency || 0,
      'ac-sampleRate': onlineCtx.sampleRate,
      'ac-maxChannelCount': onlineCtx.destination.maxChannelCount,
      'ac-numberOfInputs': onlineCtx.destination.numberOfInputs,
      'ac-numberOfOutputs': onlineCtx.destination.numberOfOutputs,
      'ac-channelCount': onlineCtx.destination.channelCount,
      'ac-channelCountMode': onlineCtx.destination.channelCountMode,
      'ac-channelInterpretation': onlineCtx.destination.channelInterpretation
    };

    // Analyser node properties
    const analyser = onlineCtx.createAnalyser();
    fp.audioNtVcOutput['an-fftSize'] = analyser.fftSize;
    fp.audioNtVcOutput['an-frequencyBinCount'] = analyser.frequencyBinCount;
    fp.audioNtVcOutput['an-minDecibels'] = analyser.minDecibels;
    fp.audioNtVcOutput['an-maxDecibels'] = analyser.maxDecibels;
    fp.audioNtVcOutput['an-smoothingTimeConstant'] = analyser.smoothingTimeConstant;
    fp.audioNtVcOutput['an-numberOfInputs'] = analyser.numberOfInputs;
    fp.audioNtVcOutput['an-numberOfOutputs'] = analyser.numberOfOutputs;
    fp.audioNtVcOutput['an-channelCount'] = analyser.channelCount;
    fp.audioNtVcOutput['an-channelCountMode'] = analyser.channelCountMode;
    fp.audioNtVcOutput['an-channelInterpretation'] = analyser.channelInterpretation;

    fp.audioSampleRate = onlineCtx.sampleRate;
    fp.audioBaseLatency = onlineCtx.baseLatency;
    fp.audioMaxChannelCount = onlineCtx.destination.maxChannelCount;

    onlineCtx.close();
  } catch (e) {
    fp.audioPxiOutput = 0;
    fp._audioError = e.message;
  }

  // ── Video codecs ──────────────────────────────────────────────────
  const videoCodecs = [
    { codec: 'H.264', mime: 'video/mp4; codecs="avc1.42E01E"' },
    { codec: 'H.264 High', mime: 'video/mp4; codecs="avc1.64001F"' },
    { codec: 'H.265/HEVC', mime: 'video/mp4; codecs="hev1.1.6.L93.B0"' },
    { codec: 'VP8', mime: 'video/webm; codecs="vp8"' },
    { codec: 'VP9', mime: 'video/webm; codecs="vp9"' },
    { codec: 'AV1', mime: 'video/mp4; codecs="av01.0.01M.08"' },
    { codec: 'Theora', mime: 'video/ogg; codecs="theora"' },
    { codec: 'MPEG-4', mime: 'video/mp4; codecs="mp4v.20.8"' }
  ];
  const videoEl = document.createElement('video');
  fp.videoCodecs = videoCodecs.map(c => ({
    codec: c.codec,
    support: videoEl.canPlayType(c.mime) || ''
  }));

  // ── Audio codecs ──────────────────────────────────────────────────
  const audioCodecs = [
    { codec: 'AAC', mime: 'audio/mp4; codecs="mp4a.40.2"' },
    { codec: 'MP3', mime: 'audio/mpeg' },
    { codec: 'Ogg Vorbis', mime: 'audio/ogg; codecs="vorbis"' },
    { codec: 'Ogg Opus', mime: 'audio/ogg; codecs="opus"' },
    { codec: 'WAV', mime: 'audio/wav; codecs="1"' },
    { codec: 'FLAC', mime: 'audio/flac' },
    { codec: 'WebM Vorbis', mime: 'audio/webm; codecs="vorbis"' },
    { codec: 'WebM Opus', mime: 'audio/webm; codecs="opus"' },
    { codec: 'M4A', mime: 'audio/x-m4a' }
  ];
  const audioEl = document.createElement('audio');
  fp.audioCodecs = audioCodecs.map(c => ({
    codec: c.codec,
    support: audioEl.canPlayType(c.mime) || ''
  }));

  // ── Font detection ────────────────────────────────────────────────
  // TDC's technique: measure text width with test font vs fallback.
  // If width differs from fallback, the font is detected.
  const testFonts = [
    'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Comic Sans MS',
    'Consolas', 'Courier New', 'Georgia', 'Helvetica', 'Helvetica Neue',
    'Impact', 'Lucida Console', 'Lucida Grande', 'Menlo', 'Monaco',
    'Palatino', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS',
    'Ubuntu', 'Verdana', 'WenQuanYi Zen Hei', 'Microsoft YaHei',
    'Microsoft JhengHei', 'SimHei', 'SimSun', 'NSimSun', 'FangSong',
    'KaiTi', 'Noto Sans', 'Noto Serif', 'Droid Sans', 'Roboto'
  ];
  const detectedFonts = [];
  try {
    const testStr = 'mmmmmmmmmmlli';
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.fontSize = '72px';
    span.textContent = testStr;
    document.body.appendChild(span);

    // Get baseline widths
    const baseWidths = {};
    for (const base of baseFonts) {
      span.style.fontFamily = base;
      baseWidths[base] = span.offsetWidth;
    }

    // Test each font
    for (const font of testFonts) {
      let detected = false;
      for (const base of baseFonts) {
        span.style.fontFamily = `'${font}', ${base}`;
        if (span.offsetWidth !== baseWidths[base]) {
          detected = true;
          break;
        }
      }
      if (detected) detectedFonts.push(font);
    }
    document.body.removeChild(span);
  } catch (e) {
    // Font detection failed — leave empty
  }
  fp.fonts = detectedFonts.join(',');

  // ── Intl.DateTimeFormat ───────────────────────────────────────────
  try {
    const opts = Intl.DateTimeFormat().resolvedOptions();
    fp.intlOptions = {
      locale: opts.locale,
      calendar: opts.calendar,
      numberingSystem: opts.numberingSystem,
      timeZone: opts.timeZone
    };
    fp.timezone = opts.timeZone;
  } catch (e) {
    fp.intlOptions = null;
  }
  fp.timezoneOffset = new Date().getTimezoneOffset();

  // ── Storage estimate (async) ──────────────────────────────────────
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      fp.storageEstimate = {
        quota: est.quota,
        usage: est.usage || null,
        usageDetails: est.usageDetails || {}
      };
    } else {
      fp.storageEstimate = null;
    }
  } catch (e) {
    fp.storageEstimate = null;
  }

  // ── Permission status (async) ─────────────────────────────────────
  try {
    if (navigator.permissions) {
      const perm = await navigator.permissions.query({ name: 'notifications' });
      fp.permissionStatus = { state: perm.state };
    } else {
      fp.permissionStatus = null;
    }
  } catch (e) {
    fp.permissionStatus = null;
  }

  // ── Color gamut ───────────────────────────────────────────────────
  fp.colorGamut = '';
  if (window.matchMedia) {
    if (window.matchMedia('(color-gamut: rec2020)').matches) fp.colorGamut = 'rec2020';
    else if (window.matchMedia('(color-gamut: p3)').matches) fp.colorGamut = 'p3';
    else if (window.matchMedia('(color-gamut: srgb)').matches) fp.colorGamut = 'srgb';
  }

  // ── OS platform detection ─────────────────────────────────────────
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) fp.osPlatform = 'windows';
  else if (ua.includes('mac os')) fp.osPlatform = 'macos';
  else if (ua.includes('android')) fp.osPlatform = 'android';
  else if (ua.includes('iphone') || ua.includes('ipad')) fp.osPlatform = 'ios';
  else if (ua.includes('linux')) fp.osPlatform = 'linux';
  else fp.osPlatform = 'unknown';

  // ── Browser detection flags ───────────────────────────────────────
  fp.isChrome = !!(window.chrome && (window.chrome.runtime || window.chrome.csi));
  fp.isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  // ── performance.now() characteristics ─────────────────────────────
  try {
    const t1 = performance.now();
    const t2 = performance.now();
    fp.performanceNowResolution = t2 - t1;
  } catch (e) {
    fp.performanceNowResolution = 0;
  }

  // ── Misc browser properties ───────────────────────────────────────
  fp.characterSet = document.characterSet;

  // Count harvested fields
  fp._fieldCount = Object.keys(fp).filter(k => !k.startsWith('_')).length;
  fp._harvestTime = new Date().toISOString();

  return fp;
}

// ═══════════════════════════════════════════════════════════════════════
// Main harvester function
// ═══════════════════════════════════════════════════════════════════════

/**
 * Launch Chrome and harvest fingerprints.
 *
 * @param {Object} [options]
 * @param {string} [options.output] - Output file path
 * @param {boolean} [options.headless] - Run headless (default: true)
 * @returns {Promise<Object>} The harvested fingerprint data
 */
async function harvestFingerprint(options = {}) {
  const outputPath = options.output || DEFAULT_OUTPUT;
  const headless = options.headless !== false;

  console.error('[harvester] Launching headless Chrome (no stealth — capturing raw values)...');

  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1920,1080'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to a real page — about:blank doesn't expose navigator.userAgentData
    // or navigator.storage.estimate() properly. Task 10.11: use example.com.
    await page.goto('https://example.com', { waitUntil: 'domcontentloaded' });

    console.error('[harvester] Executing fingerprint capture in browser...');

    // Execute the harvesting function in the browser context
    const fingerprint = await page.evaluate(harvestInPage);

    console.error(`[harvester] Captured ${fingerprint._fieldCount} fields`);

    // Write to output file
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(fingerprint, null, 2));
    console.error(`[harvester] Saved to: ${outputPath}`);

    return fingerprint;
  } finally {
    await browser.close();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CLI entry point
// ═══════════════════════════════════════════════════════════════════════

if (require.main === module) {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf('--output');
  const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  harvestFingerprint({ output })
    .then(fp => {
      console.error('[harvester] Done. Key values:');
      console.error(`  userAgent: ${fp.userAgent}`);
      console.error(`  platform: ${fp.platform}`);
      console.error(`  osPlatform: ${fp.osPlatform}`);
      console.error(`  deviceMemory: ${fp.deviceMemory}`);
      console.error(`  hardwareConcurrency: ${fp.hardwareConcurrency}`);
      console.error(`  webglVendor: ${fp.webglVendor}`);
      console.error(`  webglRenderer: ${fp.webglRenderer}`);
      console.error(`  userAgentData: ${JSON.stringify(fp.userAgentData)}`);
      console.error(`  highEntropyValues: ${fp.highEntropyValues ? 'present' : 'null'}`);
      console.error(`  languages: ${JSON.stringify(fp.languages)}`);
      console.error(`  audioPxiOutput: ${fp.audioPxiOutput}`);
      console.error(`  canvasDataURL length: ${(fp.canvasDataURL || '').length}`);
      console.error(`  webglDataURL length: ${(fp.webglDataURL || '').length}`);
      console.error(`  fonts: ${fp.fonts}`);
      console.error(`  fields: ${fp._fieldCount}`);
    })
    .catch(err => {
      console.error('[harvester] Error:', err.message);
      process.exit(1);
    });
}

module.exports = { harvestFingerprint };
