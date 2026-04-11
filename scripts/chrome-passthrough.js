'use strict';

/**
 * chrome-passthrough.js — Minimal Chrome token passthrough test.
 *
 * Purpose: Determine whether errorCode 9 is caused by token generation
 * or by the slider solve (wrong offset/timing).
 *
 * Flow:
 *   1. Launch Puppeteer + stealth
 *   2. Prehandle → get session
 *   3. Navigate to show page in Chrome, intercept tdc.js + images + config
 *   4. Wait for TDC ready
 *   5. Solve slider via OpenCV
 *   6. Call TDC.getData(true) in Chrome → use AS-IS (no decryption)
 *   7. Call TDC.getInfo().info in Chrome → chromeEks
 *   8. Build verify POST with Chrome's exact collect + eks
 *   9. Generate vData via Chrome (jQuery $.ajax hook)
 *  10. Submit via Chrome fetch()
 *  11. Report errorCode + ticket
 *
 * Usage:
 *   node scripts/chrome-passthrough.js
 *   node scripts/chrome-passthrough.js --headful
 *   node scripts/chrome-passthrough.js --retries 5
 */

const fs = require('fs');
const path = require('path');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const { CaptchaClient } = require('../puppeteer/captcha-client');
const { solveSlider } = require('../puppeteer/slide-solver');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

const BASE_URL = 'https://t.captcha.qq.com';
const DEFAULT_AID = '2046626881';
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const NATURAL_CALIBRATION = -13;
const SLIDE_Y = 158;
const NAV_TIMEOUT = 30000;

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function log(msg) {
  process.stderr.write(`[chrome-passthrough] ${msg}\n`);
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

  // Load jQuery source (needed for vData generation)
  const jqueryPath = path.join(PROJECT_ROOT, 'sample', 'slide-jy.js');
  if (!fs.existsSync(jqueryPath)) {
    throw new Error('sample/slide-jy.js not found -- vData generation will fail');
  }
  const jquerySource = fs.readFileSync(jqueryPath, 'utf8');
  log(`jQuery source loaded (${jquerySource.length} chars)`);

  // Load vm-slide source (needed for vData generation)
  const vmSlidePath = path.join(PROJECT_ROOT, 'sample', 'vm_slide.js');
  if (!fs.existsSync(vmSlidePath)) {
    throw new Error('sample/vm_slide.js not found -- vData generation will fail');
  }
  const vmSlideSource = fs.readFileSync(vmSlidePath, 'utf8');
  log(`vm-slide loaded (${vmSlideSource.length} chars)`);

  // ── Launch Puppeteer ──
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

  const results = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await browser.newPage();
    await page.setUserAgent(userAgent);

    try {
      log(`\n========== Attempt ${attempt}/${maxRetries} ==========`);

      // ── Step 1: Prehandle via Node.js HTTP ──
      log('Step 1: Prehandle...');
      const client = new CaptchaClient({
        aid: DEFAULT_AID,
        referer: 'https://urlsec.qq.com/',
      });
      const session = await client.prehandle();
      log(`  sess=${session.sess.slice(0, 20)}... sid=${session.sid}`);

      // ── Step 2: Navigate to show page + intercept images and config ──
      log('Step 2: Navigate to show page + intercept...');

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

      // Set up response interceptors
      const interceptedImages = {};
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

      // Wait for images
      const waitStart = Date.now();
      while ((!interceptedImages.bg || !interceptedImages.slice) &&
             Date.now() - waitStart < 10000) {
        await sleep(200);
      }

      if (!interceptedImages.bg || !interceptedImages.slice) {
        throw new Error('Failed to intercept CAPTCHA images');
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

      // ── Step 3: Wait for TDC ready ──
      log('Step 3: Wait for TDC...');

      let tdcAvailable = false;
      const tdcWaitStart = Date.now();
      while (!tdcAvailable && Date.now() - tdcWaitStart < 15000) {
        tdcAvailable = await page.evaluate(() => typeof window.TDC !== 'undefined');
        if (!tdcAvailable) await sleep(200);
      }

      if (!tdcAvailable) {
        throw new Error('TDC object not available after 15s');
      }
      log('  TDC object available');

      // ── Step 4: Solve slider via OpenCV ──
      log('Step 4: Solve slider via OpenCV...');
      const rawOffset = await solveSlider(interceptedImages.bg, interceptedImages.slice);
      log(`  rawOffset: ${rawOffset}`);

      const xAnswer = Math.round(rawOffset + NATURAL_CALIBRATION);
      const ans = `${xAnswer},${SLIDE_Y};`;
      log(`  xAnswer: ${xAnswer} (rawOffset=${rawOffset}, calibration=${NATURAL_CALIBRATION})`);
      log(`  ans: ${ans}`);

      // ── Step 5: Capture Chrome's collect token (AS-IS) ──
      log('Step 5: Capture Chrome TDC.getData(true) + TDC.getInfo().info...');

      const chromeTokens = await page.evaluate(() => {
        try {
          const result = {};

          if (window.TDC && typeof window.TDC.getData === 'function') {
            result.collect = window.TDC.getData(true);
          }

          if (window.TDC && typeof window.TDC.getInfo === 'function') {
            const info = window.TDC.getInfo();
            if (info && info.info) {
              result.eks = info.info;
            }
          }

          return result;
        } catch (err) {
          return { error: err.message };
        }
      });

      if (chromeTokens.error) {
        throw new Error(`Chrome token capture failed: ${chromeTokens.error}`);
      }

      const chromeCollect = chromeTokens.collect;
      const chromeEks = chromeTokens.eks || '';

      if (!chromeCollect) {
        throw new Error('Chrome TDC.getData(true) returned empty');
      }

      log(`  Chrome collect: ${chromeCollect.length} chars`);
      log(`  Chrome eks: ${chromeEks ? chromeEks.length + ' chars' : 'empty'}`);

      // ── Step 6: Build verify POST fields ──
      log('Step 6: Build verify POST fields...');

      // Decode URI-encoded collect for the POST field
      let collectVal = chromeCollect;
      if (collectVal.includes('%')) {
        try { collectVal = decodeURIComponent(collectVal); } catch (_) { /* leave as-is */ }
      }

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
        eks: chromeEks,
        nonce: nonce,
        vlg: '0_0_1',
      };

      // ── Step 7: Generate vData via Chrome ──
      log('Step 7: Generate vData via Chrome...');

      let vData;
      let serializedBody;
      const vdataPage = await browser.newPage();
      await vdataPage.setUserAgent(userAgent);
      try {
        await vdataPage.goto('https://t.captcha.qq.com/favicon.ico', {
          waitUntil: 'domcontentloaded',
          timeout: 10000,
        }).catch(() => {
          // favicon may 404 -- that's fine, we just need the origin set
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
                  // Don't actually send -- just capture
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

                // Fire jQuery.ajax -- vm-slide intercepts, computes vData, appends it
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
                  reject(new Error('XHR.send was never called -- debug: ' + debugLog.join(' | ')));
                  return;
                }

                // Extract vData from captured body
                const vdataIdx = capturedBody.indexOf('&vData=');
                const vDataVal = vdataIdx >= 0
                  ? capturedBody.substring(vdataIdx + 7)
                  : '';
                const serializedBodyVal = vdataIdx >= 0
                  ? capturedBody.substring(0, vdataIdx)
                  : capturedBody;

                resolve({
                  vData: vDataVal,
                  serializedBody: serializedBodyVal,
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
        log(`  vData generated: ${vData.length} chars`);
        log(`  Full body length from Chrome: ${chromeResult.fullBodyLength}`);
      } finally {
        await vdataPage.close().catch(() => {});
      }

      const finalBody = serializedBody + '&vData=' + vData;
      log(`  Final body length: ${finalBody.length}`);

      // ── Step 8: Submit verify via Chrome fetch() ──
      log('Step 8: Submit verify via Chrome fetch()...');
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

      // ── Step 9: Parse result ──
      log('Step 9: Parse result...');
      if (verifyResult.error) {
        throw new Error(`Chrome fetch() failed: ${verifyResult.error}`);
      }

      log(`  HTTP ${verifyResult.status}`);
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

      const attemptResult = {
        attempt,
        errorCode,
        ticket: ticket || null,
        collectLength: collectVal.length,
        eksLength: chromeEks.length,
        vDataLength: vData.length,
        sliderRawOffset: rawOffset,
        sliderAnswer: xAnswer,
        httpStatus: verifyResult.status,
      };

      results.push(attemptResult);

      if (errorCode === 0) {
        log('\n=== SUCCESS === Chrome passthrough accepted!');
        break;
      }

      log(`  Failed with errorCode ${errorCode}, ${attempt < maxRetries ? 'retrying...' : 'no more retries'}`);

    } catch (err) {
      log(`  ERROR: ${err.message}`);
      results.push({
        attempt,
        errorCode: -1,
        ticket: null,
        error: err.message,
      });
    } finally {
      await page.close().catch(() => {});
    }

    // Wait between attempts
    if (attempt < maxRetries) {
      log('Waiting 3s before next attempt...');
      await sleep(3000);
    }
  }

  await browser.close().catch(() => {});

  // ── Summary ──
  log('\n========== SUMMARY ==========');
  log('Method: Chrome passthrough (Chrome\'s own collect + eks, no standalone generation)');
  for (const r of results) {
    if (r.error) {
      log(`  Attempt ${r.attempt}: ERROR - ${r.error}`);
    } else {
      log(`  Attempt ${r.attempt}: errorCode=${r.errorCode}, ticket=${r.ticket ? 'YES' : 'null'}, collect=${r.collectLength} chars, eks=${r.eksLength} chars, slider=${r.sliderAnswer}px`);
    }
  }

  const anySuccess = results.some(r => r.errorCode === 0);
  const allError9 = results.filter(r => r.errorCode !== -1).every(r => r.errorCode === 9);

  if (anySuccess) {
    log('\nCONCLUSION: Chrome\'s token passes -- the issue is in standalone token generation.');
  } else if (allError9) {
    log('\nCONCLUSION: Chrome\'s own token ALSO gets errorCode 9 -- the issue is the slider solve, NOT token generation.');
  } else {
    log('\nCONCLUSION: Mixed results -- see per-attempt details above.');
  }

  // Write results
  const outputPath = path.join(PROJECT_ROOT, 'output', 'chrome-passthrough.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    method: 'chrome-passthrough',
    results,
    conclusion: anySuccess ? 'token_issue' : allError9 ? 'slider_issue' : 'mixed',
  }, null, 2) + '\n', 'utf8');
  log(`Results written to ${outputPath}`);

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// Entry point
// ═══════════════════════════════════════════════════════════════════════

const opts = parseArgs();
solve(opts).catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
