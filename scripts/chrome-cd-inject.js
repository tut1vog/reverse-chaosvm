'use strict';

/**
 * chrome-cd-inject.js — Chrome cd Array Injection Test
 *
 * Uses Puppeteer (real Chrome) to execute tdc.js and intercepts the raw cd array
 * BEFORE encryption via JSON.stringify interception. Then feeds those exact cd
 * values into the standalone generateCollect() via cdArrayOverride, and submits
 * via Chrome TLS.
 *
 * This isolates whether the cd (collector data) array is causing errorCode 9:
 *   - If Chrome cd + standalone encrypt = success → standalone cd values are wrong
 *   - If Chrome cd + standalone encrypt = still errorCode 9 → issue is elsewhere
 *
 * Flow:
 *   1. Launch Puppeteer with stealth plugin
 *   2. Prehandle via Node.js HTTP
 *   3. Navigate to show page in Chrome + inject JSON.stringify interceptor
 *   4. Intercept tdc.js + images + config (Chrome executes tdc.js natively)
 *   5. Capture the raw cd array via the JSON.stringify hook
 *   6. Solve slider via OpenCV
 *   7. Extract TDC_NAME + eks from captured tdc.js
 *   8. Look up template cache for XTEA params
 *   9. Generate collect token standalone with Chrome's cd array (cdArrayOverride)
 *  10. Generate vData via Chrome page.evaluate
 *  11. Submit verify POST via Chrome fetch() (Chrome TLS)
 *  12. Log result + comparison
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
      log('Step 3: Navigate to show page + inject JSON.stringify interceptor...');

      // Inject JSON.stringify interceptor BEFORE any page loads
      // This captures the cd array when tdc.js calls JSON.stringify on it
      await page.evaluateOnNewDocument(() => {
        const origStringify = JSON.stringify;
        window.__capturedCdArray = null;
        window.__cdCaptureLog = [];
        JSON.stringify = function(obj) {
          if (Array.isArray(obj) && obj.length >= 55 && obj.length <= 65) {
            window.__capturedCdArray = origStringify(obj); // store as JSON string to avoid ref issues
            window.__cdCaptureLog.push('Captured cd array, length=' + obj.length);
          }
          return origStringify.apply(this, arguments);
        };
      });

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

      // ── Step 4: Wait for Chrome to execute tdc.js and capture cd array ──
      log('Step 4: Wait for TDC.getData() and cd array capture...');

      // Wait for TDC object to be available (tdc.js creates it)
      let tdcAvailable = false;
      const tdcWaitStart = Date.now();
      while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
        tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
        if (!tdcAvailable) await sleep(200);
      }

      if (tdcAvailable) {
        log('  TDC object available in Chrome');

        // Trigger TDC.getData() in Chrome to cause the cd array to be JSON.stringified
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

        if (chromeGetData.ok) {
          log(`  Chrome TDC.getData() returned collect of length ${chromeGetData.collect ? chromeGetData.collect.length : 0}`);
        } else {
          log(`  Chrome TDC.getData() failed: ${chromeGetData.reason}`);
        }
      } else {
        log('  WARNING: TDC object not available in Chrome after 15s');
      }

      // Extract captured cd array
      const cdCaptureResult = await page.evaluate(() => {
        return {
          cdArrayJson: window.__capturedCdArray || null,
          captureLog: window.__cdCaptureLog || [],
        };
      });

      log(`  cd capture log: ${JSON.stringify(cdCaptureResult.captureLog)}`);

      let capturedCd = null;
      if (cdCaptureResult.cdArrayJson) {
        capturedCd = JSON.parse(cdCaptureResult.cdArrayJson);
        log(`  Captured cd array: length=${capturedCd.length}`);
        log(`  First 5 values: ${JSON.stringify(capturedCd.slice(0, 5))}`);
        log(`  Last 5 values: ${JSON.stringify(capturedCd.slice(-5))}`);
      } else {
        log('  WARNING: No cd array captured via JSON.stringify hook');
        log('  Will proceed with standalone cd generation only');
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
        log('  TDC_NAME not in cache, running structural lookup...');
        try {
          const { parseVmFunction } = require('../pipeline/vm-parser');
          const vmInfo = parseVmFunction(capturedTdcSource);
          log(`  Parsed VM: ${vmInfo.caseCount} opcodes`);
          cached = cache.lookupByStructure(vmInfo.caseCount);
          if (cached) {
            cache.store(tdcName, cached);
            log(`  Matched template ${cached.template} by structure (${vmInfo.caseCount} opcodes)`);
          }
        } catch (parseErr) {
          log(`  VM parse failed: ${parseErr.message}`);
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
        collectOpts.cdArrayOverride = capturedCd;
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
