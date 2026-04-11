'use strict';

/**
 * ref-inject-solver.js — End-to-End CAPTCHA Solver with Reference tdc.js Injection
 *
 * Definitive test: injects our known reference tdc.js (Template A) into Chrome's
 * CAPTCHA page, generates a standalone collect token using hardcoded XTEA params,
 * solves the slider via OpenCV, generates vData via Chrome, and submits the verify
 * POST through Chrome's TLS stack.
 *
 * This proves whether our byte-identical token generation actually passes server
 * validation end-to-end.
 *
 * Interpretation:
 *   - errorCode 0  → standalone token generation works end-to-end!
 *   - errorCode 9  → something wrong with how we generate the collect
 *   - other codes  → likely stale eks or session mismatch (reference eks is baked)
 *
 * Usage:
 *   node scripts/ref-inject-solver.js
 *   node scripts/ref-inject-solver.js --headful
 *   node scripts/ref-inject-solver.js --retries 5
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');
const {
  generateCollect,
  generateBehavioralEvents,
  buildSlideSd,
  buildDefaultCdArray,
} = require('../scraper/collect-generator');
const { extractTdcName, extractEks } = require('../scraper/tdc-utils');

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

const REF_TDC_PATH = path.join(PROJECT_ROOT, 'targets', 'tdc.js');

// Template A XTEA params — verified byte-identical
const TEMPLATE_A_XTEA = {
  key: [0x6257584F, 0x462A4564, 0x636A5062, 0x6D644140],
  delta: 0x9E3779B9,
  rounds: 32,
  keyMods: [0, 2368517, 0, 592130],
};

// Template A cd field order (discovered via dynamic tracing)
const TEMPLATE_A_CD_FIELD_ORDER = [
  0, 4, 23, 44, 21, 11, 39, 26, 1, 28, 5, 47, 24, 27, 8, 46, 12, 30,
  -1, 31, 6, 15, 16, 3, 18, 7, 19, 38, 17, 48, 49, 40, 45, 2, 35, 53,
  42, 54, 52, 9, 29, 20, 51, 43, 41, 34, 36, 33, 57, 56, 10, 14, 32,
  13, 37, -1, -1, 22, 50,
];

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[ref-solver] ${msg}\n`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { headless: true, maxRetries: 3 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headful') opts.headless = false;
    if (args[i] === '--retries' && args[i + 1]) opts.maxRetries = parseInt(args[i + 1], 10);
  }
  return opts;
}

// ═══════════════════════════════════════════════════════════════════════
// Main Solver
// ═══════════════════════════════════════════════════════════════════════

async function solve(opts) {
  const { headless, maxRetries } = opts;
  const userAgent = DEFAULT_USER_AGENT;

  // ── Load reference tdc.js ──
  log('Loading reference tdc.js...');
  if (!fs.existsSync(REF_TDC_PATH)) {
    throw new Error(`Reference tdc.js not found at ${REF_TDC_PATH}`);
  }
  const refTdcSource = fs.readFileSync(REF_TDC_PATH, 'utf8');
  log(`  Reference tdc.js: ${refTdcSource.length} chars`);

  // Extract eks from reference tdc.js (server-baked)
  const refEks = extractEks(refTdcSource);
  log(`  Reference eks: ${refEks ? refEks.slice(0, 30) + '...' : 'null'}`);
  if (!refEks) {
    log('  WARNING: No eks found in reference tdc.js — verify will likely fail');
  }

  const refTdcName = extractTdcName(refTdcSource);
  log(`  Reference TDC_NAME: ${refTdcName}`);

  // Load default profile
  const profilePath = path.join(PROJECT_ROOT, 'profiles', 'default.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  log('Default profile loaded');

  // Load jQuery source for vData generation
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found -- vData generation will fail');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery source loaded (${jquerySource.length} chars)`);

  // Load vm-slide source for vData generation
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  if (!fs.existsSync(vmSlidePath)) {
    throw new Error('sample/vm_slide.js not found -- vData generation will fail');
  }
  const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
  log(`vm-slide source loaded (${vmSlideSource.length} chars)`);

  // ── Launch Chrome ──
  log('Launching Chrome with stealth plugin...');
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

      // ── Step 1: Prehandle via Node.js HTTP ──
      log('Step 1: Prehandle...');
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });
      const session = await client.prehandle();
      log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // ── Step 2: Navigate to show page + inject reference tdc.js ──
      log('Step 2: Navigate to show page + inject reference tdc.js...');

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

      // Set up CDP interception for tdc.js at Response stage:
      // 1. Capture the live response body (to extract fresh eks)
      // 2. Replace with our reference tdc.js (for token generation)
      let injected = false;
      let liveEks = null;
      const cdp = await page.target().createCDPSession();
      await cdp.send('Fetch.enable', {
        patterns: [{ urlPattern: '*tdc.js*', requestStage: 'Response' }],
      });

      cdp.on('Fetch.requestPaused', async (event) => {
        const { requestId } = event;
        try {
          // First, get the live response body to extract eks
          const liveResponse = await cdp.send('Fetch.getResponseBody', { requestId });
          const liveBody = liveResponse.base64Encoded
            ? Buffer.from(liveResponse.body, 'base64').toString('utf8')
            : liveResponse.body;

          if (liveBody.length > 1000) {
            // Extract fresh eks from live tdc.js
            liveEks = extractEks(liveBody);
            log(`  Live eks captured: ${liveEks ? liveEks.slice(0, 30) + '...' : 'null'}`);
          }

          // Now serve the reference tdc.js instead
          const body = Buffer.from(refTdcSource).toString('base64');
          await cdp.send('Fetch.fulfillRequest', {
            requestId,
            responseCode: 200,
            responseHeaders: [
              { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
              { name: 'Access-Control-Allow-Origin', value: '*' },
            ],
            body,
          });
          injected = true;
          log('  Injected reference tdc.js via CDP (with live eks captured)');
        } catch (err) {
          log(`  CDP interception error: ${err.message}`);
          try {
            await cdp.send('Fetch.continueRequest', { requestId });
          } catch (_) { /* ignore */ }
        }
      });

      // Intercept images and show config via response listener
      const interceptedImages = {};
      let capturedShowConfig = null;

      page.on('response', async (response) => {
        const url = response.url();
        try {
          // Intercept CAPTCHA images
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

          // Capture show page config
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

      // Wait for images + injection
      const waitStart = Date.now();
      while ((!interceptedImages.bg || !interceptedImages.slice || !injected) &&
             Date.now() - waitStart < 10000) {
        await sleep(200);
      }

      if (!injected) {
        throw new Error('tdc.js request was never intercepted — injection failed');
      }
      if (!interceptedImages.bg || !interceptedImages.slice) {
        throw new Error('Failed to intercept CAPTCHA images');
      }

      // Extract session config from show page
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

      // ── Step 3: Solve slider via OpenCV ──
      log('Step 3: Solve slider via OpenCV...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
      log(`  rawOffset: ${rawOffset}`);

      const calibration = CALIBRATION_OFFSET + Math.floor(Math.random() * 11) - 5;
      const xAnswer = Math.round(rawOffset * DEFAULT_RATIO + calibration);
      const ans = `${xAnswer},${DEFAULT_SLIDE_Y};`;
      log(`  ans: ${ans}`);

      // ── Step 4: Generate standalone collect token ──
      log('Step 4: Generate standalone collect token (Template A XTEA)...');
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

      const collectOpts = {
        appid: DEFAULT_AID,
        nonce: nonce,
        sdOverride: slideSd,
        timestamp: now,
        // Template A reference build uses DEFAULT cd field ordering
        // (no reordering needed — our schema matches Template A's native order)
      };

      const collectEncoded = generateCollect(profileOverrides, TEMPLATE_A_XTEA, collectOpts);

      // Decode URI-encoded collect for POST fields
      let collectVal = collectEncoded;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }
      log(`  collect length: ${collectVal.length}`);

      // ── Step 5: Build verify POST fields ──
      log('Step 5: Build verify POST fields...');
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
        eks: liveEks || refEks || '',
        nonce: nonce,
        vlg: '0_0_1',
      };

      // ── Step 6: Generate vData via Chrome ──
      log('Step 6: Generate vData via Chrome...');
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

                // Extract vData from captured body
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
        if (chromeResult.debug) log(`  Debug: ${chromeResult.debug}`);
      } finally {
        await vdataPage.close().catch(() => {});
      }

      const finalBody = serializedBody + '&vData=' + vData;
      log(`  Final body length: ${finalBody.length}`);

      // ── Step 7: Submit verify via Chrome fetch() ──
      log('Step 7: Submit verify via Chrome fetch()...');
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

      // ── Step 8: Parse result ──
      log('Step 8: Parse result...');
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
        method: 'ref-tdc-inject + standalone-collect + chrome-tls',
        tdcName: refTdcName,
        eksSource: 'reference tdc.js (stale)',
        eksPresent: !!refEks,
        collectLength: collectVal.length,
        verifyErrorCode: errorCode,
        ticket: ticket,
        randstr: verifyData.randstr || null,
        httpStatus: verifyResult.status,
        rawResponse: verifyResult.text.slice(0, 500),
        interpretation: errorCode === 0
          ? 'SUCCESS: standalone token generation works end-to-end!'
          : errorCode === 9
            ? 'errorCode 9: something wrong with collect token generation'
            : `errorCode ${errorCode}: likely stale eks or session issue (not a collect problem)`,
      };

      // Write results
      const outputPath = path.join(PROJECT_ROOT, 'output', 'ref-inject-solver.json');
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
      log(`  Results written to ${outputPath}`);

      if (errorCode === 0) {
        log('\n=== SUCCESS: Server accepted our standalone token! ===');
        break;
      }

      log(`  Failed with errorCode ${errorCode}, ${attempt < maxRetries ? 'retrying...' : 'no more retries'}`);
      lastError = new Error(`CAPTCHA verify returned errorCode ${errorCode}`);

    } catch (err) {
      log(`  Error: ${err.message}`);
      lastError = err;

      lastResult = {
        timestamp: new Date().toISOString(),
        attempt: attempt,
        method: 'ref-tdc-inject + standalone-collect + chrome-tls',
        verifyErrorCode: -1,
        ticket: null,
        error: err.message,
        interpretation: `Exception on attempt ${attempt}`,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  // Write final results
  if (lastResult) {
    const outputPath = path.join(PROJECT_ROOT, 'output', 'ref-inject-solver.json');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(lastResult, null, 2) + '\n', 'utf8');
    log(`Final results written to ${outputPath}`);
  }

  await browser.close().catch(() => {});

  // ── Conclusion ──
  if (lastResult) {
    const code = lastResult.verifyErrorCode;
    log('');
    if (code === 0) {
      log('CONCLUSION: Standalone token generation WORKS end-to-end.');
      log(`Ticket: ${lastResult.ticket}`);
    } else if (code === 9) {
      log('CONCLUSION: errorCode 9 — collect token generation has an issue.');
      log('The XTEA encryption or cd/sd serialization is not matching server expectations.');
    } else {
      log(`CONCLUSION: errorCode ${code} — NOT a collect token issue.`);
      log('Most likely the reference eks is stale (it was baked into targets/tdc.js at capture time).');
      log('To test with fresh eks: use live tdc.js injection instead of reference.');
    }
  }

  return lastResult;
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

const opts = parseArgs();

log('Reference tdc.js Injection Solver');
log(`  headless: ${opts.headless}`);
log(`  maxRetries: ${opts.maxRetries}`);
log(`  reference: ${REF_TDC_PATH}`);
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
