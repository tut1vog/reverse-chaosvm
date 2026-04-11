'use strict';

/**
 * chrome-cd-inject.js — Chrome cd Array Injection Test
 *
 * Uses Puppeteer (real Chrome) to execute tdc.js, captures Chrome's encrypted
 * collect token from TDC.getData(true), then decrypts it using XTEA params from
 * the template cache to extract the raw cd array. Feeds those exact cd values
 * into the standalone generateCollect() via cdArrayOverride, and submits via
 * Chrome TLS.
 *
 * This isolates whether the cd (collector data) array is causing errorCode 9:
 *   - If Chrome cd + standalone encrypt = success → standalone cd values are wrong
 *   - If Chrome cd + standalone encrypt = still errorCode 9 → issue is elsewhere
 *
 * Flow:
 *   1. Launch Puppeteer with stealth plugin
 *   2. Prehandle via Node.js HTTP
 *   3. Navigate to show page in Chrome + intercept tdc.js/images/config
 *   4. Call TDC.getData(true) in Chrome — capture encrypted collect token
 *   5. Solve slider via OpenCV
 *   6. Extract TDC_NAME + eks from captured tdc.js
 *   7. Look up template cache for XTEA params
 *  7b. Decrypt Chrome's collect token → extract raw cd array
 *   8. Generate collect token standalone with Chrome's cd array (cdArrayOverride)
 *   9. Generate vData via Chrome page.evaluate
 *  10. Submit verify POST via Chrome fetch() (Chrome TLS)
 *  11. Log result + comparison
 *
 * Usage:
 *   node scripts/chrome-cd-inject.js
 *   node scripts/chrome-cd-inject.js --headful
 *   node scripts/chrome-cd-inject.js --retries 3
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');
const { generateCollect, generateBehavioralEvents, buildSlideSd, buildDefaultCdArray } = require('../scraper/collect-generator');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');
const TemplateCache = require('../scraper/template-cache');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const DEFAULT_RATIO = 0.5;
const CALIBRATION_OFFSET = -25;
const DEFAULT_SLIDE_Y = 45;
const NAV_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[cd-inject] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse CLI arguments.
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, maxRetries: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--retries' && args[i + 1]) opts.maxRetries = parseInt(args[i + 1], 10);
  }
  return opts;
}

/**
 * Compare two arrays element-by-element and return diff details.
 */
function compareCdArrays(chromeCd, standaloneCd) {
  const maxLen = Math.max(chromeCd.length, standaloneCd.length);
  const diffs = [];
  for (let i = 0; i < maxLen; i++) {
    const a = i < chromeCd.length ? chromeCd[i] : undefined;
    const b = i < standaloneCd.length ? standaloneCd[i] : undefined;
    const aStr = JSON.stringify(a);
    const bStr = JSON.stringify(b);
    if (aStr !== bStr) {
      diffs.push({
        index: i,
        chrome: a,
        standalone: b,
      });
    }
  }
  return diffs;
}

// ═══════════════════════════════════════════════════════════════════════
// XTEA Decryption (for decrypting Chrome's collect token)
// ═══════════════════════════════════════════════════════════════════════

function convertBytesToWord(fourByteString) {
  const b0 = fourByteString.charCodeAt(0) || 0;
  const b1 = fourByteString.charCodeAt(1) || 0;
  const b2 = fourByteString.charCodeAt(2) || 0;
  const b3 = fourByteString.charCodeAt(3) || 0;
  return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
}

function convertWordToBytes(word) {
  return String.fromCharCode(
    word & 0xFF,
    (word >> 8) & 0xFF,
    (word >> 16) & 0xFF,
    (word >> 24) & 0xFF
  );
}

function decryptXtea(inputBytes, params) {
  const { key, delta, rounds, keyMods } = params;
  let output = '';
  const targetSum = rounds * delta;

  for (let pos = 0; pos < inputBytes.length; pos += 8) {
    const slice1 = inputBytes.slice(pos, pos + 4);
    const slice2 = inputBytes.slice(pos + 4, pos + 8);

    let v0 = convertBytesToWord(slice1);
    let v1 = convertBytesToWord(slice2);
    let sum = targetSum;

    while (sum !== 0) {
      const idx1 = (sum >>> 11) & 3;
      v1 -= (((v0 << 4) ^ (v0 >>> 5)) + v0) ^ (sum + key[idx1] + keyMods[idx1]);
      sum -= delta;
      const idx0 = sum & 3;
      v0 -= (((v1 << 4) ^ (v1 >>> 5)) + v1) ^ (sum + key[idx0] + keyMods[idx0]);
    }

    output += convertWordToBytes(v0) + convertWordToBytes(v1);
  }

  return output;
}

function decryptCollect(collectStr, params) {
  const b64 = collectStr
    .replace(/%2B/g, '+')
    .replace(/%2F/g, '/')
    .replace(/%3D/g, '=');

  const encrypted = Buffer.from(b64, 'base64').toString('binary');
  const decrypted = decryptXtea(encrypted, params);
  const plaintext = decrypted.replace(/[\0\s]+$/, '');

  let parsed = null;
  try {
    parsed = JSON.parse(plaintext);
  } catch (e) {
    // Fall through
  }

  return { plaintext, parsed };
}

// ═══════════════════════════════════════════════════════════════════════
// Main Solver
// ═══════════════════════════════════════════════════════════════════════

async function solve(opts) {
  const { headless, maxRetries } = opts;
  const userAgent = DEFAULT_USER_AGENT;

  // Load template cache
  const cache = new TemplateCache();
  cache.load();
  cache.seed();
  log('Template cache loaded and seeded');

  // Load default profile
  const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  log('Default profile loaded');

  // Load jQuery source
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found -- vData generation will fail');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery source loaded (${jquerySource.length} chars)`);

  // Load vm-slide fallback source
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  let vmSlideSource = null;
  if (fs.existsSync(vmSlidePath)) {
    vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
    log(`vm-slide fallback loaded (${vmSlideSource.length} chars)`);
  }

  // ── Step 1: Launch Puppeteer ──
  log('Step 1: Launching Chrome with stealth plugin...');
  const browser = await puppeteer.launch({
    headless: headless ? 'new' : false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    defaultViewport: { width: 1280, height: 1400, deviceScaleFactor: 1 },
  });

  let lastResult = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);

    try {
      log(`\n=== Attempt ${attempt}/${maxRetries} ===`);

      // ── Step 2: Prehandle via Node.js HTTP ──
      log('Step 2: prehandle (Node.js HTTP)...');
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });
      const session = await client.prehandle();
      log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // ── Step 3: Navigate to show page + intercept ──
      log('Step 3: Navigate to show page + intercept tdc.js...');

      // Build show URL
      const showParams = new URLSearchParams({
        aid: DEFAULT_AID,
        protocol: 'https',
        accver: '1',
        showtype: 'popup',
        ua: Buffer.from(userAgent).toString('base64'),
        noheader: '1',
        fb: '1',
        aged: '0',
        enableAged: '0',
        enableDarkMode: '0',
        grayscale: '1',
        dyeid: '0',
        clientype: '2',
        sess: session.sess,
        fwidth: '0',
        sid: session.sid,
        wxLang: '',
        tcScale: '1',
        uid: '',
        cap_cd: '',
        rnd: String(Math.floor(Math.random() * 1000000)),
        prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
        createIframeStart: String(Date.now()),
        global: '0',
        subsid: '1',
      });
      const showUrl = `${BASE_URL}/cap_union_new_show?${showParams.toString()}`;

      // Set up response interceptors BEFORE navigation
      const interceptedImages = {};
      let capturedTdcSource = null;
      let capturedShowConfig = null;

      page.on('response', async (response) => {
        const url = response.url();
        try {
          // Intercept hycdn images
          if (url.includes('/hycdn') || url.includes('hycdn.cn')) {
            const buffer = await response.buffer();
            if (buffer.length > 1000) {
              if (url.includes('img_index=1') || url.includes('index=1')) {
                interceptedImages.bg = buffer;
                log(`  Intercepted bg image: ${buffer.length} bytes`);
              } else if (url.includes('img_index=2') || url.includes('index=2')) {
                interceptedImages.slice = buffer;
                log(`  Intercepted slice image: ${buffer.length} bytes`);
              } else if (!interceptedImages.bg) {
                interceptedImages.bg = buffer;
                log(`  Intercepted image (assumed bg): ${buffer.length} bytes`);
              } else if (!interceptedImages.slice) {
                interceptedImages.slice = buffer;
                log(`  Intercepted image (assumed slice): ${buffer.length} bytes`);
              }
            }
          }

          // Intercept tdc.js source
          if (url.includes('/tdc.js') || url.includes('tdc.js?')) {
            const text = await response.text();
            if (text.length > 1000) {
              capturedTdcSource = text;
              log(`  Intercepted tdc.js source: ${text.length} chars`);
            }
          }

          // Capture show page config (nonce, vsig, websig, etc.)
          if (url.includes('cap_union_new_show') && response.status() === 200) {
            try {
              const html = await response.text();
              capturedShowConfig = html;
              log(`  Captured show page HTML: ${html.length} chars`);
            } catch (_) { /* ignore */ }
          }
        } catch (_) {
          // response.buffer() can fail for redirects etc. -- ignore
        }
      });

      // Navigate
      await page.goto(showUrl, { waitUntil: 'networkidle2', timeout: NAV_TIMEOUT });
      log('  Show page loaded');

      // Wait for images + tdc.js
      const waitStart = Date.now();
      while ((!interceptedImages.bg || !interceptedImages.slice || !capturedTdcSource) &&
             Date.now() - waitStart < 10000) {
        await sleep(200);
      }

      if (!interceptedImages.bg || !interceptedImages.slice) {
        throw new Error('Failed to intercept CAPTCHA images');
      }
      if (!capturedTdcSource) {
        throw new Error('Failed to intercept tdc.js source');
      }

      // Extract nonce, vsig, websig, subcapclass from show page config
      let nonce = '';
      let vsig = '';
      let websig = '';
      let subcapclass = '';
      let showSess = session.sess;
      if (capturedShowConfig) {
        const nonceMatch = capturedShowConfig.match(/["']?nonce["']?\s*:\s*["']([^"']+)["']/);
        if (nonceMatch) nonce = nonceMatch[1];
        const vsigMatch = capturedShowConfig.match(/["']?vsig["']?\s*:\s*["']([^"']+)["']/);
        if (vsigMatch) vsig = vsigMatch[1];
        const websigMatch = capturedShowConfig.match(/["']?websig["']?\s*:\s*["']([^"']+)["']/);
        if (websigMatch) websig = websigMatch[1];
        const subcapMatch = capturedShowConfig.match(/["']?subcapclass["']?\s*:\s*["']([^"']+)["']/);
        if (subcapMatch) subcapclass = subcapMatch[1];
        const sessMatch = capturedShowConfig.match(/["']?sess["']?\s*:\s*["']([^"']+)["']/);
        if (sessMatch) showSess = sessMatch[1];
        log(`  Config: nonce=${nonce}, vsig=${vsig.slice(0, 10)}..., subcapclass=${subcapclass}`);
      }

      // ── Step 4: Wait for Chrome to execute tdc.js and capture collect token ──
      log('Step 4: Wait for TDC.getData() to get Chrome collect token...');

      // Wait for TDC object to be available (tdc.js creates it)
      let tdcAvailable = false;
      let chromeCollect = null;
      const tdcWaitStart = Date.now();
      while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
        tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
        if (!tdcAvailable) await sleep(200);
      }

      if (tdcAvailable) {
        log('  TDC object available in Chrome');

        // Call TDC.getData(true) to get Chrome's encrypted collect token
        const chromeGetData = await page.evaluate(() => {
          try {
            if (window.TDC && typeof window.TDC.getData === 'function') {
              const result = window.TDC.getData(true);
              return { collect: result, ok: true };
            }
            return { ok: false, reason: 'TDC.getData not available' };
          } catch (err) {
            return { ok: false, reason: err.message };
          }
        });

        if (chromeGetData.ok && chromeGetData.collect) {
          chromeCollect = chromeGetData.collect;
          log(`  Chrome collect token captured: ${chromeCollect.length} chars`);
        } else {
          log(`  Chrome TDC.getData() failed: ${chromeGetData.reason || 'empty result'}`);
        }
      } else {
        log('  WARNING: TDC object not available in Chrome after 15s');
      }

      // ── Step 5: Solve slider via OpenCV ──
      log('Step 5: Solve slider via OpenCV...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
      log(`  rawOffset: ${rawOffset}`);

      const calibration = CALIBRATION_OFFSET + Math.floor(Math.random() * 11) - 5;
      const xAnswer = Math.round(rawOffset * DEFAULT_RATIO + calibration);
      const ans = `${xAnswer},${DEFAULT_SLIDE_Y};`;
      log(`  ans: ${ans}`);

      // ── Step 6: Extract TDC_NAME + eks ──
      log('Step 6: Extract TDC_NAME + eks...');
      const tdcName = extractTdcName(capturedTdcSource);
      if (!tdcName) throw new Error('Could not extract TDC_NAME from tdc.js source');
      log(`  TDC_NAME: ${tdcName}`);

      const eks = extractEks(capturedTdcSource);
      log(`  eks: ${eks ? eks.slice(0, 20) + '...' : 'null'}`);

      // ── Step 7: Look up template cache ──
      log('Step 7: Template cache lookup...');
      let cached = cache.lookup(tdcName);
      if (!cached) {
        log('  TDC_NAME not in cache, running pipeline key extraction...');
        const { parseVmFunction } = require('../pipeline/vm-parser');
        const { mapOpcodes } = require('../pipeline/opcode-mapper');
        const { extractKey } = require('../pipeline/key-extractor');
        const os = require('os');

        let vmInfo = null;
        let pipelineExtracted = false;
        try {
          vmInfo = parseVmFunction(capturedTdcSource);
          log(`  Parsed VM: ${vmInfo.caseCount} opcodes`);

          const mapResult = mapOpcodes(vmInfo, capturedTdcSource);
          log(`  Mapped opcodes: ${Object.keys(mapResult.opcodeTable).length} mapped, ${mapResult.unmapped.length} unmapped`);

          // extractKey needs a file path — write captured source to temp file
          const tmpFile = path.join(os.tmpdir(), `tdc-${tdcName}-${Date.now()}.js`);
          try {
            fs.writeFileSync(tmpFile, capturedTdcSource, 'utf8');
            log(`  Wrote temp tdc source: ${tmpFile}`);

            const keyResult = await extractKey(tmpFile, mapResult.opcodeTable, vmInfo.variables);
            log(`  Pipeline extracted key: [${keyResult.key.map(k => '0x' + (k >>> 0).toString(16)).join(', ')}]`);
            log(`  keyMods: [${(keyResult.keyMods || [0, 0, 0, 0]).join(', ')}]`);
            log(`  delta: 0x${(keyResult.delta >>> 0).toString(16)}, rounds: ${keyResult.rounds}`);

            cached = {
              template: 'live-extracted',
              key: keyResult.key,
              delta: keyResult.delta,
              rounds: keyResult.rounds,
              keyMods: keyResult.keyMods || [0, 0, 0, 0],
              keyModConstants: keyResult.keyModConstants || [0, 0],
              caseCount: vmInfo.caseCount,
            };

            // Propagate cdFieldOrder for known template structures
            if (vmInfo.caseCount === 95) {
              cached.cdFieldOrder = [0,4,23,44,21,11,39,26,1,28,5,47,24,27,8,46,12,30,-1,31,6,15,16,3,18,7,19,38,17,48,49,40,45,2,35,53,42,54,52,9,29,20,51,43,41,34,36,33,57,56,10,14,32,13,37,-1,-1,22,50];
              log('  Added cdFieldOrder for 95-opcode template');
            }

            // Store in cache for future lookups
            cache.store(tdcName, cached);
            log(`  Stored extracted params in cache for ${tdcName}`);
            pipelineExtracted = true;
          } finally {
            // Clean up temp file
            try { fs.unlinkSync(tmpFile); } catch (_) { /* ignore */ }
          }
        } catch (pipelineErr) {
          log(`  Pipeline extraction failed: ${pipelineErr.message}`);
          // Fall back to structural lookup as last resort
          if (vmInfo) {
            cached = cache.lookupByStructure(vmInfo.caseCount);
            if (cached) {
              cache.store(tdcName, cached);
              log(`  WARNING: Fell back to structural match (${vmInfo.caseCount} opcodes) — key may be wrong!`);
            }
          }
        }
      }
      if (!cached) throw new Error(`Unknown template ${tdcName}, run pipeline to port it`);
      log(`  Template: ${cached.template}, opcodes: ${cached.caseCount}`);

      const xteaParams = {
        key: cached.key,
        delta: cached.delta,
        rounds: cached.rounds,
        keyModConstants: cached.keyModConstants,
        keyMods: cached.keyMods || null,
      };

      // ── Step 7b: Decrypt Chrome's collect token to extract cd array ──
      log('Step 7b: Decrypt Chrome collect token...');
      let capturedCd = null;
      if (chromeCollect) {
        try {
          const decryptResult = decryptCollect(chromeCollect, xteaParams);
          if (decryptResult.parsed && decryptResult.parsed.cd) {
            capturedCd = decryptResult.parsed.cd;
            log(`  Decrypted Chrome cd: ${capturedCd.length} fields`);
            log(`  First 5: ${JSON.stringify(capturedCd.slice(0, 5))}`);
            log(`  Last 5: ${JSON.stringify(capturedCd.slice(-5))}`);
          } else {
            log('  WARNING: Decryption succeeded but no cd field in parsed result');
            if (decryptResult.plaintext) {
              log(`  Plaintext (first 200): ${decryptResult.plaintext.slice(0, 200)}`);
            }
          }
        } catch (decryptErr) {
          log(`  WARNING: Chrome collect decryption failed: ${decryptErr.message}`);
          log('  Will proceed with standalone cd generation');
        }
      } else {
        log('  No Chrome collect token available to decrypt');
      }

      // ── Step 8: Generate collect token with Chrome's cd array ──
      log('Step 8: Generate collect token (standalone encrypt, Chrome cd)...');
      const now = Date.now();
      const nowSec = Math.round(now / 1000);
      const behavioralEvents = generateBehavioralEvents(xAnswer, DEFAULT_SLIDE_Y, now);

      // Build slideValue for sd from behavioral events
      const slideValueArray = [];
      const cursorViewportY = 800 + Math.floor(Math.random() * 30);
      let firstMove = true;
      let prevTime = null;
      for (const ev of behavioralEvents) {
        if (ev[0] === 1) { // mousemove
          if (firstMove) {
            const firstDt = Math.floor(Math.random() * 60 + 60);
            slideValueArray.push([ev[1], cursorViewportY, firstDt]);
            firstMove = false;
            prevTime = ev[3];
          } else {
            const dt = ev[3] - prevTime;
            slideValueArray.push([ev[1], ev[2], dt]);
            prevTime = ev[3];
          }
        }
      }
      slideValueArray.push([0, 0, 0]); // terminator

      const slideSd = buildSlideSd(
        { x: xAnswer, y: DEFAULT_SLIDE_Y },
        slideValueArray,
        { trycnt: attempt, refreshcnt: 0 }
      );

      const profileOverrides = Object.assign({}, profile, {
        pageUrl: showUrl,
        timestamp: nowSec,
        timestampCollectionStart: nowSec,
        timestampCollectionEnd: nowSec + 3,
        canvasHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
        mathFingerprint: Math.random(),
        performanceHash: Math.floor(Math.random() * 0xFFFFFFFF) >>> 0,
      });

      // Build standalone cd for comparison
      const standaloneCd = buildDefaultCdArray(profileOverrides);

      // Compare Chrome cd vs standalone cd
      let cdDiffs = [];
      if (capturedCd) {
        cdDiffs = compareCdArrays(capturedCd, standaloneCd);
        log(`  cd array comparison: ${cdDiffs.length} differences out of ${Math.max(capturedCd.length, standaloneCd.length)} fields`);
        if (cdDiffs.length > 0) {
          log(`  Diff details (first 10):`);
          for (const d of cdDiffs.slice(0, 10)) {
            log(`    [${d.index}] chrome=${JSON.stringify(d.chrome)} standalone=${JSON.stringify(d.standalone)}`);
          }
        }
      }

      // Generate collect with Chrome's cd array if available, otherwise standalone
      const collectOpts = {
        appid: DEFAULT_AID,
        nonce: nonce,
        sdOverride: slideSd,
        timestamp: now,
      };

      if (capturedCd) {
        // Strip hash chunk artifacts from Chrome's parsed cd array.
        // When decrypted segments are concatenated, hash chunks appear as
        // cd fields matching pattern [[4,-1,-1,<timestamp>,0,0,0,0]].
        // These are inter-segment artifacts, not real cd fields.
        const cleanCd = capturedCd.filter(field => {
          if (!Array.isArray(field) || field.length !== 1) return true;
          const inner = field[0];
          if (!Array.isArray(inner) || inner.length !== 8) return true;
          return !(inner[0] === 4 && inner[1] === -1 && inner[2] === -1 &&
                   inner[4] === 0 && inner[5] === 0 && inner[6] === 0 && inner[7] === 0);
        });
        if (cleanCd.length !== capturedCd.length) {
          log(`  Stripped ${capturedCd.length - cleanCd.length} hash artifact(s): ${capturedCd.length} → ${cleanCd.length} fields`);
        }
        collectOpts.cdArrayOverride = cleanCd;
        log('  Using Chrome cd array for collect generation');
      } else {
        collectOpts.cdFieldOrder = cached.cdFieldOrder || null;
        collectOpts.behavioralEvents = behavioralEvents;
        log('  Using standalone cd array (Chrome capture failed)');
      }

      const collectEncoded = generateCollect(profileOverrides, xteaParams, collectOpts);

      // Decode URI-encoded collect for POST fields
      let collectVal = collectEncoded;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }
      log(`  collect length: ${collectVal.length}`);

      // ── Step 9: Generate vData via Chrome ──
      log('Step 9: Generate vData via Chrome...');

      // Build the 38 verify POST fields
      const postFields = {
        aid: DEFAULT_AID,
        protocol: 'https',
        accver: '1',
        showtype: 'popup',
        ua: Buffer.from(userAgent).toString('base64'),
        noheader: '1',
        fb: '1',
        aged: '0',
        enableAged: '0',
        enableDarkMode: '0',
        grayscale: '1',
        dyeid: '0',
        clientype: '2',
        sess: showSess,
        fwidth: '0',
        sid: session.sid,
        wxLang: '',
        tcScale: '1',
        uid: '',
        cap_cd: '',
        rnd: String(Math.floor(Math.random() * 1000000)),
        prehandleLoadTime: String(Math.floor(Math.random() * 200 + 100)),
        createIframeStart: String(Date.now() - Math.floor(Math.random() * 5000 + 2000)),
        global: '0',
        subsid: '1',
        cdata: '0',
        ans: ans,
        vsig: vsig,
        websig: websig,
        subcapclass: subcapclass,
        pow_answer: '',
        pow_calc_time: '0',
        collect: collectVal,
        tlg: String(collectVal.length),
        fpinfo: '',
        eks: eks || '',
        nonce: nonce,
        vlg: '0_0_1',
      };

      if (!vmSlideSource) {
        throw new Error('No vm-slide source available (sample/vm_slide.js not found)');
      }

      // Generate vData inside a fresh Chrome page
      let vData;
      let serializedBody;
      const vdataPage = await browser.newPage();
      await vdataPage.setUserAgent(userAgent);
      try {
        await vdataPage.goto('https://t.captcha.qq.com/favicon.ico', {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        }).catch(() => {
          // favicon may 404 — that's fine, we just need the origin set
        });

        const chromeResult = await vdataPage.evaluate(
          (postFieldsJson, jqSrc, vmSlideSrc) => {
            return new Promise((resolve, reject) => {
              try {
                const debugLog = [];

                // Hook XHR.send BEFORE loading vm-slide
                let capturedBody = null;
                const origOpen = XMLHttpRequest.prototype.open;
                const origSend = XMLHttpRequest.prototype.send;

                XMLHttpRequest.prototype.open = function() {
                  debugLog.push('XHR.open called: ' + Array.from(arguments).join(', '));
                  return origOpen.apply(this, arguments);
                };

                XMLHttpRequest.prototype.send = function(body) {
                  debugLog.push('XHR.send called, body length: ' + (body ? body.length : 'null'));
                  capturedBody = body;
                  // Don't actually send — just capture
                };

                // Load jQuery if not already present
                if (!window.jQuery) {
                  try {
                    (new Function(jqSrc))();
                    debugLog.push('jQuery loaded: ' + (typeof window.jQuery));
                  } catch (jqErr) {
                    debugLog.push('jQuery load error: ' + jqErr.message);
                  }
                } else {
                  debugLog.push('jQuery already present');
                }

                // Load vm-slide
                try {
                  (new Function(vmSlideSrc))();
                  debugLog.push('vm-slide loaded OK');
                } catch (vmErr) {
                  debugLog.push('vm-slide load error: ' + vmErr.message);
                }

                // Parse the post fields
                const postFields = JSON.parse(postFieldsJson);
                debugLog.push('postFields parsed, keys: ' + Object.keys(postFields).length);

                // Fire jQuery.ajax — vm-slide intercepts, computes vData, appends it
                try {
                  jQuery.ajax({
                    type: 'POST',
                    url: '/cap_union_new_verify',
                    data: postFields,
                    timeout: 15000,
                    error: function(xhr, status, err) {
                      debugLog.push('jQuery.ajax error callback: ' + status + ' ' + (err || ''));
                    },
                  });
                  debugLog.push('jQuery.ajax called');
                } catch (ajaxErr) {
                  debugLog.push('jQuery.ajax exception: ' + ajaxErr.message);
                }

                // Restore original XHR methods
                XMLHttpRequest.prototype.open = origOpen;
                XMLHttpRequest.prototype.send = origSend;

                if (!capturedBody) {
                  reject(new Error('XHR.send was never called — debug: ' + debugLog.join(' | ')));
                  return;
                }

                // Manually extract vData
                const vdataIdx = capturedBody.indexOf('&vData=');
                const vData = vdataIdx >= 0
                  ? capturedBody.substring(vdataIdx + 7)
                  : '';
                const serializedBody = vdataIdx >= 0
                  ? capturedBody.substring(0, vdataIdx)
                  : capturedBody;

                resolve({
                  vData: vData,
                  serializedBody: serializedBody,
                  fullBodyLength: capturedBody.length,
                  debug: debugLog.join(' | '),
                });
              } catch (err) {
                reject(new Error(err.message || String(err)));
              }
            });
          },
          JSON.stringify(postFields),
          jquerySource,
          vmSlideSource
        );

        if (!chromeResult.vData) {
          throw new Error('Chrome vData generation returned empty vData');
        }

        vData = chromeResult.vData;
        serializedBody = chromeResult.serializedBody;
        log(`  vData (first 60): ${vData.slice(0, 60)}...`);
        log(`  vData length: ${vData.length}`);
        log(`  Full body length from Chrome: ${chromeResult.fullBodyLength}`);
        if (chromeResult.debug) log(`  Debug: ${chromeResult.debug}`);
      } finally {
        await vdataPage.close().catch(() => {});
      }

      const finalBody = serializedBody + '&vData=' + vData;
      log(`  Final body length: ${finalBody.length}`);

      // ── Step 10: Submit verify via Chrome fetch() ──
      log('Step 10: Submit verify via Chrome fetch()...');
      const verifyResult = await page.evaluate(async (body) => {
        try {
          const resp = await fetch('https://t.captcha.qq.com/cap_union_new_verify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'X-Requested-With': 'XMLHttpRequest',
            },
            body: body,
          });
          return { status: resp.status, text: await resp.text() };
        } catch (err) {
          return { error: err.message };
        }
      }, finalBody);

      // ── Step 11: Parse result ──
      log('Step 11: Parse result...');
      if (verifyResult.error) {
        throw new Error(`Chrome fetch() failed: ${verifyResult.error}`);
      }

      log(`  HTTP status: ${verifyResult.status}`);
      log(`  Response: ${verifyResult.text.slice(0, 300)}`);

      let verifyData;
      try {
        verifyData = JSON.parse(verifyResult.text);
      } catch (_) {
        // Try JSONP parse
        const jsonStr = verifyResult.text
          .replace(/^[^(]+\(/, '')
          .replace(/\)\s*;?\s*$/, '');
        verifyData = JSON.parse(jsonStr);
      }

      const errorCode = parseInt(verifyData.errorCode, 10);
      const ticket = verifyData.ticket || null;

      log(`  errorCode: ${errorCode}`);
      log(`  ticket: ${ticket ? ticket.slice(0, 40) + '...' : 'null'}`);

      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        templateMatch: `${cached.caseCount} opcodes, template ${cached.template}`,
        tdcName: tdcName,
        collectLength: collectVal.length,
        chromeCdCaptured: !!capturedCd,
        chromeCdLength: capturedCd ? capturedCd.length : null,
        chromeCdFirst5: capturedCd ? capturedCd.slice(0, 5) : null,
        chromeCdLast5: capturedCd ? capturedCd.slice(-5) : null,
        standaloneCdLength: standaloneCd.length,
        cdDiffCount: cdDiffs.length,
        cdDiffs: cdDiffs.slice(0, 20), // first 20 diffs
        verifyErrorCode: errorCode,
        ticket: ticket,
        randstr: verifyData.randstr || null,
        verifyMethod: 'Chrome cd + standalone encrypt + Chrome TLS',
        httpStatus: verifyResult.status,
        notes: errorCode === 0
          ? 'SUCCESS: Chrome cd + standalone encrypt works — cd values were the issue'
          : errorCode === 9
            ? 'errorCode 9 persists — cd values alone are NOT the cause'
            : `errorCode ${errorCode} — further investigation needed`,
      };

      // Write results
      const outputPath = path.join(PROJECT_ROOT, 'output', 'chrome-cd-inject.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
      log(`  Results written to ${outputPath}`);

      if (errorCode === 0) {
        log('\n=== SUCCESS ===');
        break;
      }

      log(`  Failed with errorCode ${errorCode}, ${attempt < maxRetries ? 'retrying...' : 'no more retries'}`);
      lastError = new Error(`CAPTCHA verify returned errorCode ${errorCode}`);

    } catch (err) {
      log(`  Error: ${err.message}`);
      lastError = err;

      // Save error result
      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        verifyErrorCode: -1,
        ticket: null,
        chromeCdCaptured: false,
        verifyMethod: 'Chrome cd + standalone encrypt + Chrome TLS',
        error: err.message,
        notes: `Exception on attempt ${attempt}`,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Write final results
  if (lastResult) {
    const outputPath = path.join(PROJECT_ROOT, 'output', 'chrome-cd-inject.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
    log(`Final results written to ${outputPath}`);
  }

  await browser.close().catch(() => {});

  if (lastResult && lastResult.verifyErrorCode === 0) {
    log('\nConclusion: Chrome cd + standalone XTEA encryption = SUCCESS');
    log('This confirms standalone cd array values were causing errorCode 9.');
    log(`cd differences found: ${lastResult.cdDiffCount}`);
  } else if (lastResult && lastResult.verifyErrorCode === 9) {
    log('\nConclusion: Chrome cd + standalone XTEA encryption = STILL errorCode 9');
    log('cd values alone are NOT the sole cause. Issue is in XTEA encryption, sd, or other fields.');
    if (lastResult.cdDiffCount > 0) {
      log(`Note: ${lastResult.cdDiffCount} cd field differences were found between Chrome and standalone.`);
    }
  } else if (lastResult) {
    log(`\nConclusion: errorCode ${lastResult.verifyErrorCode} — further investigation needed.`);
  }

  return lastResult;
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

const opts = parseArgs();

log('Chrome cd Injection Test');
log(`  headless: ${opts.headless}`);
log(`  maxRetries: ${opts.maxRetries}`);
log('');

solve(opts)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result && result.verifyErrorCode === 0 ? 0 : 1);
  })
  .catch((err) => {
    log(`Fatal error: ${err.message}`);
    console.error(err);
    process.exit(2);
  });
